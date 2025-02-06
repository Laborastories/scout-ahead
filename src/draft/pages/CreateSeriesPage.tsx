import { type FormEvent, useState } from 'react'
import { createSeries } from 'wasp/client/operations'
import { motion } from 'motion/react'
import { Input } from '../../client/components/ui/input'
import { Button } from '../../client/components/ui/button'
import {
  Copy,
  Check,
  Info,
  CaretDown,
  CaretRight,
  User,
} from '@phosphor-icons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../client/components/ui/tooltip'
import { cn } from '../../lib/utils'
import { Link } from 'wasp/client/router'

type SeriesArgs = {
  team1Name: string
  team2Name: string
  matchName: string
  format: 'BO1' | 'BO3' | 'BO5'
  fearlessDraft: boolean
  scrimBlock: boolean
}

const ScrollIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: -5 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 5 }}
    className='flex flex-col items-center gap-4 text-muted-foreground/80'
  >
    <span className='font-sans'>More info below</span>
    <motion.div
      animate={{ y: [0, 2, 0] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
    >
      <CaretDown size={20} />
    </motion.div>
  </motion.div>
)

const validateTeamNames = (team1: string, team2: string): { isValid: boolean; error: string } => {
  // Trim whitespace from both names
  const cleanTeam1 = team1.trim()
  const cleanTeam2 = team2.trim()

  // Check for empty or whitespace-only names
  if (!cleanTeam1 || !cleanTeam2) {
    return { isValid: false, error: 'Team names cannot be empty' }
  }

  // Check if names are the same (case-insensitive)
  if (cleanTeam1.toLowerCase() === cleanTeam2.toLowerCase()) {
    return { isValid: false, error: 'Team names must be different' }
  }

  return { isValid: true, error: '' }
}

export function CreateSeriesPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [seriesFormat, setSeriesFormat] = useState<'BO1' | 'BO3' | 'BO5'>('BO3')
  const [fearlessDraft, setFearlessDraft] = useState(false)
  const [scrimBlock, setScrimBlock] = useState(false)
  const [copied, setCopied] = useState(false)
  const [createdDraft, setCreatedDraft] = useState<{
    urls: {
      blueUrl: string
      redUrl: string
      spectatorUrl: string
      team1Name: string
      team2Name: string
    }
    format: 'BO1' | 'BO3' | 'BO5'
    fearlessDraft: boolean
    scrimBlock: boolean
  } | null>(null)

  const handleCopyAll = () => {
    if (!createdDraft) return

    const formatText =
      createdDraft.format === 'BO5'
        ? 'best of 5'
        : createdDraft.format === 'BO3'
          ? 'best of 3'
          : 'best of 1'
    const modeText = [
      createdDraft.fearlessDraft ? 'fearless' : '',
      createdDraft.scrimBlock ? 'scrim block' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const description = `You've been invited to play a ${formatText}${modeText ? ` ${modeText}` : ''} draft via scoutahead.pro`

    const formattedLinks = `${description}

${createdDraft.urls.team1Name}:
${createdDraft.urls.blueUrl}

${createdDraft.urls.team2Name}:
${createdDraft.urls.redUrl}

Spectator:
${createdDraft.urls.spectatorUrl}`

    navigator.clipboard.writeText(formattedLinks)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setCreatedDraft(null)

    const formData = new FormData(e.currentTarget)
    const team1Name = (formData.get('team1Name') as string).trim()
    const team2Name = (formData.get('team2Name') as string).trim()
    const matchName = (formData.get('matchName') as string).trim()

    // Validate team names
    const { isValid, error: teamNameError } = validateTeamNames(team1Name, team2Name)
    if (!isValid) {
      setError(teamNameError)
      setIsLoading(false)
      return
    }

    // Validate match name
    if (!matchName) {
      setError('Match name cannot be empty')
      setIsLoading(false)
      return
    }

    const data: SeriesArgs = {
      team1Name,
      team2Name,
      matchName,
      format: seriesFormat,
      fearlessDraft,
      scrimBlock,
    }

    try {
      const series = await createSeries(data)
      const baseUrl = window.location.origin
      setCreatedDraft({
        urls: {
          blueUrl: `${baseUrl}/draft/${series.id}/1/team1/${series.team1AuthToken}`,
          redUrl: `${baseUrl}/draft/${series.id}/1/team2/${series.team2AuthToken}`,
          spectatorUrl: `${baseUrl}/draft/${series.id}/1`,
          team1Name,
          team2Name,
        },
        format: seriesFormat,
        fearlessDraft,
        scrimBlock,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to create series')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-background p-8'>
      <div className='mb-12 text-center'>
        <h1 className='mb-4 text-6xl font-bold tracking-tight'>
          scout<span className='text-primary'>ahead</span>.pro
        </h1>
        <p className='max-w-3xl text-pretty font-sans text-lg text-muted-foreground'>
          League of Legends draft tool for teams, coaches, and players.
          <br />
          Create custom draft lobbies with advanced features like fearless draft
          and scrim blocks. Use a single link for the entire series.
        </p>
        <Link
          to='/login'
          className='mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted'
        >
          <User size={16} className='text-primary' />
          <span>Create an account to save drafts & access them anytime</span>
          <CaretRight size={16} className='text-muted-foreground/50' />
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='w-full max-w-[480px] font-sans'
      >
        <form onSubmit={handleSubmit} className='relative space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label htmlFor='team1Name' className='text-sm font-medium'>
                Team 1
              </label>
              <Input
                type='text'
                name='team1Name'
                id='team1Name'
                required
                className='mt-1'
                placeholder='e.g. Cloud9'
                onChange={e => {
                  // Remove leading/trailing whitespace as they type
                  e.target.value = e.target.value.trim()
                }}
              />
            </div>

            <div>
              <label htmlFor='team2Name' className='text-sm font-medium'>
                Team 2
              </label>
              <Input
                type='text'
                name='team2Name'
                id='team2Name'
                required
                className='mt-1'
                placeholder='e.g. Team Liquid'
                onChange={e => {
                  // Remove leading/trailing whitespace as they type
                  e.target.value = e.target.value.trim()
                }}
              />
            </div>
          </div>

          <div>
            <label htmlFor='matchName' className='text-sm font-medium'>
              Match Name
            </label>
            <Input
              type='text'
              name='matchName'
              id='matchName'
              required
              className='mt-1'
              placeholder='e.g. LCS Summer 2024 - Week 1'
            />
          </div>

          <div>
            <label className='text-sm font-medium'>Series Format</label>
            <div className='mt-2 grid grid-cols-3 gap-2'>
              <button
                type='button'
                onClick={() => setSeriesFormat('BO1')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                  seriesFormat === 'BO1'
                    ? 'border-primary bg-primary/5'
                    : 'border-border',
                )}
              >
                <div className='flex items-center gap-1'>
                  <div className='h-2 w-2 rounded-full bg-primary' />
                </div>
                <span className='text-sm font-medium'>BO1</span>
              </button>

              <button
                type='button'
                onClick={() => setSeriesFormat('BO3')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                  seriesFormat === 'BO3'
                    ? 'border-primary bg-primary/5'
                    : 'border-border',
                )}
              >
                <div className='flex items-center gap-1'>
                  <div className='h-2 w-2 rounded-full bg-primary' />
                  <div className='h-2 w-2 rounded-full bg-primary' />
                  <div className='h-2 w-2 rounded-full bg-primary' />
                </div>
                <span className='text-sm font-medium'>BO3</span>
              </button>

              <button
                type='button'
                onClick={() => setSeriesFormat('BO5')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                  seriesFormat === 'BO5'
                    ? 'border-primary bg-primary/5'
                    : 'border-border',
                )}
              >
                <div className='flex items-center gap-1'>
                  <div className='h-2 w-2 rounded-full bg-primary' />
                  <div className='h-2 w-2 rounded-full bg-primary' />
                  <div className='h-2 w-2 rounded-full bg-primary' />
                  <div className='h-2 w-2 rounded-full bg-primary' />
                  <div className='h-2 w-2 rounded-full bg-primary' />
                </div>
                <span className='text-sm font-medium'>BO5</span>
              </button>
            </div>
          </div>

          <div className='space-y-2 pt-2'>
            <label className='text-sm font-medium'>Features</label>
            <div className='grid grid-cols-2 gap-2'>
              <button
                type='button'
                onClick={() => setFearlessDraft(!fearlessDraft)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                  fearlessDraft
                    ? 'border-primary bg-primary/5'
                    : 'border-border',
                )}
              >
                <span className='rounded-sm bg-amber-950 px-1 py-0.5 font-sans text-xs font-medium text-amber-500'>
                  F
                </span>
                <span className='text-sm font-medium'>Fearless Draft</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className='ml-auto h-4 w-4 text-muted-foreground transition-colors hover:text-foreground' />
                    </TooltipTrigger>
                    <TooltipContent>
                      <span>Champions can only be picked once</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </button>

              <button
                type='button'
                onClick={() => setScrimBlock(!scrimBlock)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                  scrimBlock ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <span className='rounded-sm bg-indigo-950 px-1 py-0.5 font-sans text-xs font-medium text-indigo-400'>
                  S
                </span>
                <span className='text-sm font-medium'>Scrim Block</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className='ml-auto h-4 w-4 text-muted-foreground transition-colors hover:text-foreground' />
                    </TooltipTrigger>
                    <TooltipContent>
                      <span>
                        Automatically start next game after each draft
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </button>
            </div>
          </div>

          <Button
            type='submit'
            className='mt-6 w-full'
            disabled={isLoading}
            size='lg'
          >
            Create Draft
          </Button>

          {error && (
            <p className='text-center text-sm font-medium text-destructive'>
              {error}
            </p>
          )}
        </form>

        {createdDraft && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className='mt-8 space-y-6 rounded-lg border bg-card p-6'
          >
            <div className='flex items-center justify-between border-b pb-4'>
              <div>
                <h2 className='text-xl font-semibold tracking-tight'>
                  {createdDraft.urls.team1Name} vs {createdDraft.urls.team2Name}
                </h2>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {createdDraft.format} Series{' '}
                  {createdDraft.fearlessDraft && '• Fearless'}{' '}
                  {createdDraft.scrimBlock && '• Scrim Block'}
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleCopyAll}
              >
                {copied ? (
                  <>
                    <Check className='mr-2 h-4 w-4' />
                    Copied All
                  </>
                ) : (
                  <>
                    <Copy className='mr-2 h-4 w-4' />
                    Copy All
                  </>
                )}
              </Button>
            </div>

            <div className='grid gap-4'>
              <div>
                <Button
                  variant='outline'
                  className='w-full justify-between font-mono text-sm'
                  asChild
                >
                  <a
                    href={createdDraft.urls.blueUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <div className='flex items-center gap-2'>
                      <span className='font-sans font-medium'>
                        {createdDraft.urls.team1Name}&apos;s Link
                      </span>
                      <span className='text-xs'>• Team 1</span>
                    </div>
                    <CaretRight className='h-4 w-4' />
                  </a>
                </Button>
              </div>

              <div>
                <Button
                  variant='outline'
                  className='w-full justify-between font-mono text-sm'
                  asChild
                >
                  <a
                    href={createdDraft.urls.redUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <div className='flex items-center gap-2'>
                      <span className='font-sans font-medium'>
                        {createdDraft.urls.team2Name}&apos;s Link
                      </span>
                      <span className='text-xs'>• Team 2</span>
                    </div>
                    <CaretRight className='h-4 w-4' />
                  </a>
                </Button>
              </div>

              <div>
                <Button
                  variant='outline'
                  className='w-full justify-between font-mono text-sm'
                  asChild
                >
                  <a
                    href={createdDraft.urls.spectatorUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <div className='flex items-center gap-2'>
                      <span className='font-sans font-medium'>
                        Spectator Link
                      </span>
                      <span className='text-xs'>• View Only</span>
                    </div>
                    <CaretRight className='h-4 w-4' />
                  </a>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      <div className='mt-12'>
        <ScrollIndicator />
      </div>
    </div>
  )
}
