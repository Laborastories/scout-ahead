import { type Series, type Game } from 'wasp/entities'
import { useState } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../../client/components/ui/button'
import { Copy, Info, Flag } from '@phosphor-icons/react'
import { useToast } from '../../hooks/use-toast'
import { useSocket } from 'wasp/client/webSocket'
import { Link } from 'wasp/client/router'
import { motion, AnimatePresence } from 'motion/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../client/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../client/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../client/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../client/components/ui/form'
import { Textarea } from '../../client/components/ui/textarea'
import { createReport } from 'wasp/client/operations'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

export interface SeriesInfoProps {
  series: Series & {
    games: Game[]
  }
  currentGameNumber: number
  side?: 'team1' | 'team2'
  gameStatus: string
  blueSide: string
  redSide: string
  gameId: string
  timeRemaining?: number | null
  nextAction?: { team: 'BLUE' | 'RED' }
  isTimerReady?: boolean
}

const reportReasons = {
  INAPPROPRIATE_CONTENT: 'Inappropriate Content',
  HARASSMENT: 'Harassment or Bullying',
  HATE_SPEECH: 'Hate Speech',
  SPAM: 'Spam or Advertising',
  CHEATING: 'Cheating or Exploits',
  OTHER: 'Other',
} as const

const reportSchema = z.object({
  reason: z.enum(
    [
      'INAPPROPRIATE_CONTENT',
      'HARASSMENT',
      'HATE_SPEECH',
      'SPAM',
      'CHEATING',
      'OTHER',
    ] as const,
    {
      required_error: 'Please select a reason for the report',
    },
  ),
  details: z.string().optional(),
})

type ReportFormData = z.infer<typeof reportSchema>

export function SeriesInfo({
  series,
  currentGameNumber,
  side,
  gameStatus,
  blueSide,
  redSide,
  gameId,
  timeRemaining,
  nextAction,
  isTimerReady,
}: SeriesInfoProps) {
  const { toast } = useToast()
  const { socket } = useSocket()
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)

  const form = useForm<ReportFormData>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      reason: 'INAPPROPRIATE_CONTENT',
      details: '',
    },
  })

  const onReportSubmit = async (data: ReportFormData) => {
    try {
      await createReport({
        seriesId: series.id,
        reason: data.reason,
        details: data.details,
      })

      toast({
        title: 'Report Submitted',
        description: 'Thank you for helping keep scoutahead.pro safe.',
      })

      setIsReportDialogOpen(false)
      form.reset()
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const team1Wins = series.games.filter(game => {
    if (game.status !== 'COMPLETED') return false
    return (
      (game.winner === 'BLUE' && game.blueSide === series.team1Name) ||
      (game.winner === 'RED' && game.redSide === series.team1Name)
    )
  }).length

  const team2Wins = series.games.filter(game => {
    if (game.status !== 'COMPLETED') return false
    return (
      (game.winner === 'BLUE' && game.blueSide === series.team2Name) ||
      (game.winner === 'RED' && game.redSide === series.team2Name)
    )
  }).length

  const gamesNeeded =
    series.format === 'BO5' ? 3 : series.format === 'BO3' ? 2 : 1
  const maxGames = series.format === 'BO5' ? 5 : series.format === 'BO3' ? 3 : 1
  const completedGames = series.games.filter(
    g => g.status === 'COMPLETED',
  ).length
  const isSeriesOver = series.scrimBlock
    ? completedGames === maxGames
    : team1Wins >= gamesNeeded || team2Wins >= gamesNeeded

  const handleCopyUrl = () => {
    const baseUrl = window.location.origin
    const formatText =
      series.format === 'BO5'
        ? 'best of 5'
        : series.format === 'BO3'
          ? 'best of 3'
          : 'best of 1'
    const modeText = [
      series.fearlessDraft ? 'fearless' : '',
      series.scrimBlock ? 'scrim block' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const description = `You've been invited to play a ${formatText}${modeText ? ` ${modeText}` : ''} draft via scoutahead.pro`

    const urls = `${description}

${series.team1Name}:
${baseUrl}/draft/${series.id}/${currentGameNumber}/team1/${series.team1AuthToken}

${series.team2Name}:
${baseUrl}/draft/${series.id}/${currentGameNumber}/team2/${series.team2AuthToken}

Spectator URL:
${baseUrl}/draft/${series.id}/${currentGameNumber}`

    navigator.clipboard.writeText(urls).then(() => {
      toast({
        title: 'URLs Copied',
        description: 'All draft URLs have been copied to your clipboard.',
      })
    })
  }

  const handleSetWinner = async (winner: 'BLUE' | 'RED') => {
    if (!socket || !gameId) return
    socket.emit('setWinner', {
      gameId,
      winner,
    })
  }

  return (
    <div className='flex flex-col gap-2 p-2'>
      <div className='flex flex-col gap-2'>
        {/* Copy URL Button */}
        <div className='flex justify-between gap-2 p-2'>
          <div className='flex gap-2'>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    title='Series Info'
                  >
                    <Info size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side='right'
                  className='flex flex-col gap-2 whitespace-nowrap'
                >
                  <div className='flex items-center gap-2'>
                    <div className='flex items-center gap-1.5'>
                      <div
                        className={cn(
                          'rounded px-2 py-0.5 font-medium transition-colors',
                          series.fearlessDraft
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted/50 text-muted-foreground/50',
                        )}
                      >
                        Fearless
                      </div>
                      {!series.fearlessDraft && (
                        <div className='rounded bg-muted/30 px-1.5 py-0.5 text-xs text-muted-foreground/50'>
                          disabled
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        'transition-colors',
                        series.fearlessDraft
                          ? 'text-foreground'
                          : 'text-muted-foreground/50',
                      )}
                    >
                      Champions can only be picked once
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <div className='flex items-center gap-1.5'>
                      <div
                        className={cn(
                          'rounded px-2 py-0.5 font-medium transition-colors',
                          series.scrimBlock
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted/50 text-muted-foreground/50',
                        )}
                      >
                        Scrim
                      </div>
                      {!series.scrimBlock && (
                        <div className='rounded bg-muted/30 px-1.5 py-0.5 text-xs text-muted-foreground/50'>
                          disabled
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        'transition-colors',
                        series.scrimBlock
                          ? 'text-foreground'
                          : 'text-muted-foreground/50',
                      )}
                    >
                      All games must be played
                    </span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Dialog
              open={isReportDialogOpen}
              onOpenChange={setIsReportDialogOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-8 w-8'
                  title='Report Draft'
                >
                  <Flag size={16} />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Report Draft</DialogTitle>
                  <DialogDescription>
                    Help us keep scoutahead.pro safe by reporting inappropriate
                    behavior.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onReportSubmit)}
                    className='space-y-4'
                  >
                    <FormField
                      control={form.control}
                      name='reason'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reason</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select a reason' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(reportReasons).map(
                                ([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='details'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Details (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='Any additional context that might help us understand the situation better'
                              className='resize-none'
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className='flex justify-end gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        onClick={() => setIsReportDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type='submit'
                        variant='destructive'
                        disabled={form.formState.isSubmitting}
                      >
                        Submit Report
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className='flex gap-2'>
            {isSeriesOver && (
              <Button asChild>
                <Link to='/' className='font-sans'>
                  New Draft
                </Link>
              </Button>
            )}
            <Button
              variant='ghost'
              size='icon'
              onClick={handleCopyUrl}
              className='h-8 w-8'
              title='Copy all draft URLs'
            >
              <Copy className='h-4 w-4' />
            </Button>
          </div>
        </div>

        <div className='relative flex h-16 items-center justify-between rounded-lg bg-card px-6'>
          {/* Left Timer Space - Now absolutely positioned */}
          <div className='absolute left-6 flex w-[80px] items-center justify-center sm:w-[100px] lg:w-[120px]'>
            <AnimatePresence mode='wait'>
              {gameStatus === 'IN_PROGRESS' &&
                timeRemaining !== null &&
                nextAction &&
                nextAction.team === 'BLUE' && (
                  <motion.div
                    key='blue-timer'
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'flex h-full items-center justify-center rounded-md px-2',
                      'bg-blue-500/10',
                    )}
                  >
                    {isTimerReady && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          'p-2 text-center text-4xl font-medium tabular-nums 2xl:text-6xl',
                          typeof timeRemaining === 'number' &&
                            (timeRemaining <= 4
                              ? 'animate-[pulse_0.5s_ease-in-out_infinite] text-destructive'
                              : timeRemaining <= 9
                                ? 'text-destructive'
                                : 'text-blue-500'),
                        )}
                      >
                        {timeRemaining}
                      </motion.div>
                    )}
                  </motion.div>
                )}
            </AnimatePresence>
          </div>

          {/* Center Content - Now with auto margins to ensure centering */}
          <div className='mx-auto flex flex-col items-center gap-4'>
            {/* Game Navigation */}
            <div className='flex gap-2'>
              {Array.from({
                length:
                  series.format === 'BO5' ? 5 : series.format === 'BO3' ? 3 : 1,
              }).map((_, i) => {
                const gameNum = i + 1
                const isCurrentGame = gameNum === currentGameNumber
                const game = series.games.find(g => g.gameNumber === gameNum)
                const completedGames = series.games.filter(
                  g => g.status === 'COMPLETED',
                )
                const currentGameComplete =
                  series.games.find(g => g.gameNumber === currentGameNumber)
                    ?.status === 'COMPLETED'
                const nextGameNumber =
                  Math.max(
                    ...(completedGames.length
                      ? completedGames.map(g => g.gameNumber)
                      : [0]),
                  ) + 1
                const isDisabled =
                  (!isCurrentGame && !game?.status) ||
                  (gameNum > currentGameNumber && !currentGameComplete) ||
                  gameNum > nextGameNumber

                const shouldAnimate =
                  isCurrentGame ||
                  game?.status === 'COMPLETED' ||
                  (gameNum === nextGameNumber &&
                    currentGameComplete &&
                    !isSeriesOver)

                return shouldAnimate ? (
                  <motion.div
                    key={`${gameNum}-${gameId}`}
                    animate={
                      gameNum === nextGameNumber &&
                      currentGameComplete &&
                      !isSeriesOver
                        ? {
                            y: [0, -4, 0],
                            scale: [1, 1.05, 1],
                          }
                        : {}
                    }
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className='font-inter'
                  >
                    <Link
                      to='/draft/:seriesId/:gameNumber/:team?/:auth?'
                      params={{
                        seriesId: series.id,
                        gameNumber: gameNum.toString(),
                        team: side || '',
                        auth: side
                          ? side === 'team1'
                            ? series.team1AuthToken
                            : series.team2AuthToken
                          : '',
                      }}
                      className={cn(
                        'relative block rounded px-3 py-1 text-sm transition-colors',
                        isCurrentGame && 'bg-accent text-accent-foreground',
                        gameNum === nextGameNumber &&
                          currentGameComplete &&
                          'bg-primary text-primary-foreground',
                        game?.status === 'COMPLETED' &&
                          'bg-muted text-muted-foreground',
                        game?.status === 'COMPLETED' &&
                          isCurrentGame &&
                          'bg-primary text-primary-foreground',
                      )}
                    >
                      <span>Game {gameNum}</span>
                      {gameNum === nextGameNumber && currentGameComplete && (
                        <motion.div
                          className='absolute inset-0 rounded bg-primary'
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0.3, 0.15, 0.3] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        />
                      )}
                    </Link>
                  </motion.div>
                ) : (
                  <Link
                    key={gameNum}
                    to='/draft/:seriesId/:gameNumber/:team?/:auth?'
                    params={{
                      seriesId: series.id,
                      gameNumber: gameNum.toString(),
                      team: side || '',
                      auth: side
                        ? side === 'team1'
                          ? series.team1AuthToken
                          : series.team2AuthToken
                        : '',
                    }}
                    className={cn(
                      'relative rounded px-3 py-1 text-sm transition-colors',
                      isCurrentGame
                        ? 'bg-accent text-accent-foreground'
                        : isDisabled
                          ? 'cursor-not-allowed text-muted-foreground opacity-50'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      game?.status === 'COMPLETED' &&
                        !isCurrentGame &&
                        'ring-2 ring-accent',
                    )}
                    onClick={e => {
                      if (isDisabled) {
                        e.preventDefault()
                      }
                    }}
                  >
                    <span>Game {gameNum}</span>
                  </Link>
                )
              })}
            </div>
            <div className='flex items-center gap-4 sm:gap-8'>
              {/* Left Team */}
              <div className='flex w-24 items-center justify-end gap-2 sm:w-32 lg:w-40'>
                <div
                  className='truncate text-right text-xl font-semibold uppercase tracking-wider sm:text-2xl lg:text-4xl'
                  title={blueSide}
                >
                  {blueSide}
                </div>
              </div>

              {/* Score */}
              <div className='flex items-center gap-2 rounded-sm bg-muted p-2 text-xl font-bold uppercase tracking-wider sm:text-2xl'>
                <span
                  className={cn(
                    'min-w-[1.5ch] text-center text-foreground',
                    (blueSide === series.team1Name
                      ? team1Wins > team2Wins
                      : team2Wins > team1Wins) && 'text-primary',
                  )}
                >
                  {blueSide === series.team1Name ? team1Wins : team2Wins}
                </span>
                <span className='text-muted-foreground'>-</span>
                <span
                  className={cn(
                    'min-w-[1.5ch] text-center text-foreground',
                    (blueSide === series.team1Name
                      ? team2Wins > team1Wins
                      : team1Wins > team2Wins) && 'text-primary',
                  )}
                >
                  {blueSide === series.team1Name ? team2Wins : team1Wins}
                </span>
              </div>

              {/* Right Team */}
              <div className='flex w-24 items-center gap-2 sm:w-32 lg:w-40'>
                <div
                  className='truncate text-left text-xl font-semibold uppercase tracking-wider sm:text-2xl lg:text-4xl'
                  title={redSide}
                >
                  {redSide}
                </div>
              </div>
            </div>
          </div>

          {/* Right Timer Space - Now absolutely positioned */}
          <div className='absolute right-6 flex w-[80px] items-center justify-center sm:w-[100px] lg:w-[120px]'>
            <AnimatePresence mode='wait'>
              {gameStatus === 'IN_PROGRESS' &&
                timeRemaining !== null &&
                nextAction &&
                nextAction.team === 'RED' && (
                  <motion.div
                    key='red-timer'
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'flex h-full items-center justify-center rounded-md px-2',
                      'bg-red-500/10',
                    )}
                  >
                    {isTimerReady && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          'p-2 text-center text-4xl font-medium tabular-nums 2xl:text-6xl',
                          typeof timeRemaining === 'number' &&
                            (timeRemaining <= 4
                              ? 'animate-[pulse_0.5s_ease-in-out_infinite] text-destructive'
                              : timeRemaining <= 9
                                ? 'text-destructive'
                                : 'text-red-500'),
                        )}
                      >
                        {timeRemaining}
                      </motion.div>
                    )}
                  </motion.div>
                )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Winner Selection */}
      {gameStatus === 'DRAFT_COMPLETE' && side && (
        <div className='flex flex-col items-center gap-2 rounded-lg bg-card px-6 py-4 shadow'>
          <div className='text-sm font-medium text-muted-foreground'>
            Select the winner:
          </div>
          <div className='flex gap-4'>
            <button
              onClick={() => handleSetWinner('BLUE')}
              className='rounded-lg bg-[hsl(var(--team-blue))] px-6 py-2 text-sm transition-transform hover:scale-[1.02]'
            >
              <div className='font-medium text-[hsl(var(--team-blue-foreground))]'>
                Blue Wins
              </div>
            </button>
            <button
              onClick={() => handleSetWinner('RED')}
              className='rounded-lg bg-[hsl(var(--team-red))] px-6 py-2 text-sm transition-transform hover:scale-[1.02]'
            >
              <div className='max-w-[120px] truncate font-medium text-[hsl(var(--team-red-foreground))]'>
                Red Wins
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
