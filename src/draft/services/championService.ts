import { getChampionsFromDb } from 'wasp/client/operations'

const COMMUNITY_DRAGON_URL =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/'

const S3_BASE_URL = import.meta.env.REACT_APP_S3_BASE_URL || 'https://scoutahead-dev.s3.amazonaws.com'

export let DDRAGON_VERSION = '15.1.1' // Fallback version

// Initialize DDragon version
fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  .then(response => response.json())
  .then(versions => {
    DDRAGON_VERSION = versions[0]
  })
  .catch(error => {
    console.error('Failed to fetch DDragon version:', error)
  })

export type ChampionRole = 'top' | 'jungle' | 'mid' | 'bot' | 'support'
export interface Champion {
  id: string
  key: string
  name: string
  tags: string[]
  roles: string[]
  splashPath: string | null
  iconKey: string | null
  splashKey: string | null
  updatedAt: Date
}

export async function getChampions(): Promise<Champion[]> {
  try {
    const champions = await getChampionsFromDb()
    return champions.map(champion => ({
      ...champion,
      iconKey: champion.iconKey || null,
      splashKey: champion.splashKey || null,
    }))
  } catch (error) {
    console.error('Failed to fetch champions:', error)
    return []
  }
}

export function getChampionImageUrl(
  champion: Champion | string,
  type: 'icon' | 'splash' = 'icon',
): string {
  // If we have a champion object, check for S3 keys first
  if (typeof champion !== 'string') {
    // For icons, use iconKey if available
    if (type === 'icon' && champion.iconKey) {
      return `${S3_BASE_URL}/${champion.iconKey}`
    }
    // For splash art, use splashKey if available
    if (type === 'splash' && champion.splashKey) {
      return `${S3_BASE_URL}/${champion.splashKey}`
    }
  }

  // Get the champion ID for fallback URLs
  const championId = typeof champion === 'string' ? champion : champion.id

  // Fallback to DDragon for icons
  if (type === 'icon') {
    return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${championId}.png`
  }

  // For splash art, we need the champion object with splashPath
  if (typeof champion === 'string') {
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_0.jpg`
  }

  // Fallback to Community Dragon for splash art if we have splashPath
  if (champion.splashPath) {
    return `${COMMUNITY_DRAGON_URL}${champion.splashPath}`
  }

  // Final fallback for splash art if no other options work
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`
}

export function filterChampions(
  champions: Champion[],
  search: string,
): Champion[] {
  const searchLower = search.toLowerCase()
  return champions.filter(
    champion =>
      champion.name.toLowerCase().includes(searchLower) ||
      champion.tags.some(tag => tag.toLowerCase().includes(searchLower)),
  )
}
