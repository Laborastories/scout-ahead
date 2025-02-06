import { useState } from 'react'
import { createSeries } from 'wasp/client/operations'
import { type CreateSeries } from 'wasp/server/operations'
import { motion } from 'motion/react'
import { Input } from '../../client/components/ui/input'
import { Button } from '../../client/components/ui/button'
import { z } from 'zod'
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
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../client/components/ui/form'

type SeriesArgs = Parameters<CreateSeries>[0]

type FormData = z.infer<typeof seriesSchema>

const seriesSchema = z
  .object({
    team1Name: z.string().trim().min(1, 'Team 1 name cannot be empty'),
    team2Name: z.string().trim().min(1, 'Team 2 name cannot be empty'),
    matchName: z.string().trim().min(1, 'Match name cannot be empty'),
    format: z.enum(['BO1', 'BO3', 'BO5']),
    fearlessDraft: z.boolean(),
    scrimBlock: z.boolean(),
  })
  .refine(
    data => {
      const team1Normalized = data.team1Name.toLowerCase().replace(/\s+/g, '')
      const team2Normalized = data.team2Name.toLowerCase().replace(/\s+/g, '')
      return team1Normalized !== team2Normalized
    },
    {
      message: 'Team names must be different (ignoring spaces and case)',
      path: ['team2Name'],
    },
  )

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

export function CreateSeriesPage() {
  const [error, setError] = useState<string>('')
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

  const form = useForm<FormData>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      team1Name: '',
      team2Name: '',
      matchName: '',
      format: 'BO3',
      fearlessDraft: false,
      scrimBlock: false,
    },
    mode: 'onSubmit',
  })

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

  const onSubmit = async (data: FormData) => {
    setError('')
    setCreatedDraft(null)

    try {
      const series = await createSeries(data as SeriesArgs)
      const baseUrl = window.location.origin
      setCreatedDraft({
        urls: {
          blueUrl: `${baseUrl}/draft/${series.id}/1/team1/${series.team1AuthToken}`,
          redUrl: `${baseUrl}/draft/${series.id}/1/team2/${series.team2AuthToken}`,
          spectatorUrl: `${baseUrl}/draft/${series.id}/1`,
          team1Name: data.team1Name,
          team2Name: data.team2Name,
        },
        format: data.format,
        fearlessDraft: data.fearlessDraft,
        scrimBlock: data.scrimBlock,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to create series')
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
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className='relative space-y-4'
          >
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='team1Name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team 1</FormLabel>
                    <FormControl>
                      <Input type='text' placeholder='e.g. Cloud9' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='team2Name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team 2</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        placeholder='e.g. Team Liquid'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='matchName'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Match Name</FormLabel>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder='e.g. LCS Summer 2025 - Week 1'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='format'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Series Format</FormLabel>
                  <div className='mt-2 grid grid-cols-3 gap-2'>
                    <button
                      type='button'
                      onClick={() => field.onChange('BO1')}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                        field.value === 'BO1'
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
                      onClick={() => field.onChange('BO3')}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                        field.value === 'BO3'
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
                      onClick={() => field.onChange('BO5')}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                        field.value === 'BO5'
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='space-y-2 pt-2'>
              <FormLabel>Features</FormLabel>
              <div className='grid grid-cols-2 gap-2'>
                <FormField
                  control={form.control}
                  name='fearlessDraft'
                  render={({ field }) => (
                    <FormItem className='w-full'>
                      <FormControl className='w-full'>
                        <button
                          type='button'
                          onClick={() => field.onChange(!field.value)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                            field.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border',
                          )}
                        >
                          <span className='rounded-sm bg-amber-950 px-1 py-0.5 font-sans text-xs font-medium text-amber-500'>
                            F
                          </span>
                          <span className='text-sm font-medium'>
                            Fearless Draft
                          </span>
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
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='scrimBlock'
                  render={({ field }) => (
                    <FormItem className='w-full'>
                      <FormControl className='w-full'>
                        <button
                          type='button'
                          onClick={() => field.onChange(!field.value)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted',
                            field.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border',
                          )}
                        >
                          <span className='rounded-sm bg-indigo-950 px-1 py-0.5 font-sans text-xs font-medium text-indigo-400'>
                            S
                          </span>
                          <span className='text-sm font-medium'>
                            Scrim Block
                          </span>
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
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Button
              type='submit'
              className='mt-6 w-full'
              disabled={form.formState.isSubmitting}
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
        </Form>

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
