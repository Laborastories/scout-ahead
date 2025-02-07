import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { type FetchChampionsJob } from 'wasp/server/jobs'
import { createHash } from 'crypto'
import { pgBossStarted } from 'wasp/server/jobs/core/pgBoss/pgBoss'

let DDRAGON_VERSION: string | null = null

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || ''
const COMMUNITY_DRAGON_URL =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default'

interface CommunityDragonChampion {
  id: number
  name: string
  alias: string
  skins: {
    id: number
    isBase: boolean
    splashPath: string
    uncenteredSplashPath: string
    loadScreenPath: string
  }[]
}

async function initDDragon() {
  if (DDRAGON_VERSION) return

  try {
    const response = await fetch(
      'https://ddragon.leagueoflegends.com/api/versions.json',
    )
    const versions = await response.json()
    DDRAGON_VERSION = versions[0] // Get latest version
  } catch (error) {
    console.error('Failed to fetch DDragon version:', error)
    // Fallback to a known version if fetch fails
    DDRAGON_VERSION = '15.1.2'
  }
}

async function fetchWithRetry<T>(
  url: string,
  options: {
    maxRetries?: number
    initialDelay?: number
    parseJson?: boolean
  } = {},
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, parseJson = true } = options

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      if (parseJson) {
        return (await response.json()) as T
      }
      return (await response.arrayBuffer()) as T
    } catch (error) {
      if (attempt === maxRetries) throw error
      const delay = initialDelay * Math.pow(2, attempt - 1) // exponential backoff
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('All retry attempts failed')
}

async function downloadImage(url: string): Promise<Buffer> {
  const arrayBuffer = await fetchWithRetry<ArrayBuffer>(url, {
    parseJson: false,
    maxRetries: 3,
    initialDelay: 1000,
  })
  return Buffer.from(arrayBuffer)
}

// Helper to get image hash
async function getImageHash(buffer: Buffer): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex')
}

// Helper to check if image exists and get its metadata
async function getExistingImageMetadata(key: string) {
  if (!BUCKET_NAME) return null
  try {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    )
    return {
      hash: response.Metadata?.hash,
      processingVersion: response.Metadata?.processingVersion,
    }
  } catch {
    // Return null if object doesn't exist or there's an error
    return null
  }
}

// Track processing version to force updates when we change processing settings
const PROCESSING_VERSION = {
  splash: 'v4', // Increment this when splash processing changes
  icon: 'v2', // Increment this when icon processing changes
}

async function processAndUploadImage(
  championId: string,
  imageType: 'icon' | 'splash',
  imageBuffer: Buffer,
): Promise<string | null> {
  if (!BUCKET_NAME) return null

  try {
    // Generate hash of original image
    const imageHash = await getImageHash(imageBuffer)

    // Check if we already have this image processed
    const key = `champs/${imageType}/${championId}.webp`
    const existingMetadata = await getExistingImageMetadata(key)

    // Skip if image hasn't changed and processing version is the same
    if (
      existingMetadata?.hash === imageHash &&
      existingMetadata?.processingVersion === PROCESSING_VERSION[imageType]
    ) {
      console.log(`Skipping ${championId} ${imageType} - already processed`)
      return key
    }

    // Process image based on type
    let processedImage = sharp(imageBuffer)

    if (imageType === 'splash') {
      // For splash art: resize to 1080px width for better quality on larger screens
      processedImage = processedImage
        .resize(1080, null, {
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({
          quality: 80, // Higher quality for splash art
          effort: 6,
        })
    } else {
      // For icons: resize to 96px (accounting for high DPI displays) and optimize
      processedImage = processedImage
        .resize(96, 96, {
          fit: 'cover',
          position: 'centre',
        })
        .webp({
          quality: 80,
          effort: 6,
        })
    }

    const webpBuffer = await processedImage.toBuffer()

    // Upload to S3 with metadata
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: webpBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000', // Cache for 1 year
        Metadata: {
          hash: imageHash,
          processingVersion: PROCESSING_VERSION[imageType],
        },
      }),
    )

    console.log(`Stored S3 key for ${championId} ${imageType}:`, key)
    return key
  } catch (error) {
    console.error(
      `Failed to process and upload image for ${championId}:`,
      error,
    )
    return null
  }
}

// Clear any pending champion image jobs
async function clearPendingJobs() {
  try {
    const pgBoss = await pgBossStarted
    // The job name is 'fetchChampionImages' as defined in main.wasp
    const jobs = await pgBoss.fetch('fetchChampionImages', 1000, {
      includeMetadata: true,
    })

    if (jobs?.length) {
      console.log(
        `Found ${jobs.length} pending champion image jobs, clearing...`,
      )

      // Complete or fail each job based on its state
      await Promise.all(
        jobs.map(async job => {
          try {
            if (job.state === 'created' || job.state === 'retry') {
              // Job hasn't started yet, we can safely complete it
              await pgBoss.complete(job.id)
              console.log(
                `Completed pending job ${job.id} (state: ${job.state})`,
              )
            } else if (job.state === 'active') {
              // Job is running, mark it as failed
              await pgBoss.fail(job.id, {
                message: 'Cancelled due to new job starting',
                state: job.state,
              })
              console.log(`Failed active job ${job.id} (state: ${job.state})`)
            }
          } catch (error) {
            console.error(`Failed to clear job ${job.id}:`, error)
          }
        }),
      )

      // Also check for any completed jobs and archive them
      const completedJobs = await pgBoss.fetchCompleted(
        'fetchChampionImages',
        1000,
      )
      if (completedJobs?.length) {
        console.log(`Found ${completedJobs.length} completed jobs to archive`)
        await Promise.all(completedJobs.map(job => pgBoss.complete(job.id)))
      }

      console.log('Cleared all pending jobs')
    }
  } catch (error) {
    console.error('Failed to clear pending jobs:', error)
  }
}

export const fetchChampionImages: FetchChampionsJob<{}, {}> = async (
  _args,
  context,
) => {
  // Clear any pending jobs before starting
  await clearPendingJobs()

  if (!BUCKET_NAME) {
    console.error('AWS bucket name not configured')
    return {}
  }

  console.log('🖼️ Fetching champion images...')
  await initDDragon()

  try {
    // Get list of champions from database
    const champions = await context.entities.Champion.findMany()
    const totalChampions = champions.length
    let processedCount = 0

    console.log(`Found ${totalChampions} champions to process`)

    // Process each champion
    for (const champion of champions) {
      try {
        processedCount++
        console.log(
          `\nProcessing ${champion.name} (${processedCount}/${totalChampions})...`,
        )

        // Download and process icon from DDragon
        console.log(`  ⬇️ Downloading icon...`)
        const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champion.id}.png`
        const iconBuffer = await downloadImage(iconUrl)
        console.log(`  ⚙️ Processing icon...`)
        const iconKey = await processAndUploadImage(
          champion.id,
          'icon',
          iconBuffer,
        )

        // Get splash art URL from Community Dragon
        let splashKey = null
        try {
          console.log(`  ⬇️ Fetching Community Dragon data...`)
          // First fetch champion data from Community Dragon with retry
          const data = await fetchWithRetry<CommunityDragonChampion>(
            `${COMMUNITY_DRAGON_URL}/v1/champions/${champion.key}.json`,
            { maxRetries: 3, initialDelay: 1000 },
          )

          const baseSkin = data.skins.find(skin => skin.isBase)
          if (baseSkin) {
            // Remove /lol-game-data/assets/ prefix and lowercase the path
            const path = baseSkin.splashPath
              .replace('/lol-game-data/assets/', '')
              .toLowerCase()

            // Download and process splash art from Community Dragon
            console.log(`  ⬇️ Downloading splash art...`)
            const splashUrl = `${COMMUNITY_DRAGON_URL}/${path}`
            const splashBuffer = await downloadImage(splashUrl)
            console.log(`  ⚙️ Processing splash art...`)
            splashKey = await processAndUploadImage(
              champion.id,
              'splash',
              splashBuffer,
            )
          }
        } catch (error) {
          console.error(
            `  ❌ Failed to fetch Community Dragon data for ${champion.name} after retries:`,
            error,
          )
        }

        // Update champion in database
        console.log(`  💾 Updating database...`)
        await context.entities.Champion.update({
          where: { id: champion.id },
          data: {
            iconKey,
            splashKey,
          },
        })

        const progress = ((processedCount / totalChampions) * 100).toFixed(1)
        console.log(`✅ Processed ${champion.name} (${progress}% complete)`)
      } catch (error) {
        console.error(
          `❌ Failed to process images for ${champion.name}:`,
          error,
        )
      }
    }

    console.log('\n✅ Champion images updated successfully')
    return {}
  } catch (error) {
    console.error('❌ Failed to fetch champions:', error)
    return {}
  }
}
