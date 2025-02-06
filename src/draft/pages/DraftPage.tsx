import { useQuery } from 'wasp/client/operations'
import { getGame, getSeries } from 'wasp/client/operations'
import { getChampionsFromDb } from 'wasp/client/operations'
import { motion, AnimatePresence } from 'motion/react'
import { type Game, type Series } from 'wasp/entities'
import { useEffect, useState } from 'react'
import {
  useSocket,
  useSocketListener,
  ServerToClientPayload,
} from 'wasp/client/webSocket'
import { Button } from '../../client/components/ui/button'
import { ChampionGrid } from '../components/ChampionGrid'
import { getChampionImageUrl, type Champion } from '../services/championService'
import {
  getCurrentTurn,
  getNextAction,
  isTeamTurn,
} from '../utils/draftSequence'
import { SeriesInfo } from '../components/SeriesInfo'
import { useParams } from 'react-router-dom'
import { SideSelection } from '../components/SideSelection'
import { cn } from '../../lib/utils'
import { CaretDown } from '@phosphor-icons/react'

type GameWithRelations = Game & {
  series: Series & {
    games: (Game & {
      actions: {
        type: string
        champion: string
        team: 'BLUE' | 'RED'
        position: number
      }[]
    })[]
  }
  actions: {
    type: string
    champion: string
    team: 'BLUE' | 'RED'
    position: number
  }[]
}

// Remove these interfaces since we're not interpolating anymore
type TimerUpdatePayload = {
  gameId: string
  remainingTime: number
  phaseTimeLimit: number
}

const ReadyStateIndicator = ({
  blueReady,
  redReady,
}: {
  blueReady?: boolean
  redReady?: boolean
}) => (
  <div className='flex items-center gap-3'>
    <div
      className={cn(
        'h-4 w-4 rounded-full transition-all duration-300',
        blueReady
          ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
          : 'bg-blue-500/20',
      )}
    />
    <div
      className={cn(
        'h-4 w-4 rounded-full transition-all duration-300',
        redReady
          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
          : 'bg-red-500/20',
      )}
    />
  </div>
)

const ScrollIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: -5 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 5 }}
    className='mt-1 flex flex-col items-center text-xs text-muted-foreground/80'
  >
    <span>More info below</span>
    <motion.div
      animate={{ y: [0, 2, 0] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
    >
      <CaretDown size={12} />
    </motion.div>
  </motion.div>
)

export function DraftPage() {
  const params = useParams()
  const team = params.team as 'team1' | 'team2' | undefined
  const { seriesId = '', gameNumber = '1', auth } = params
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    type: 'PICK' | 'BAN'
    champion: string
    position: number
    phase: number
    team: 'BLUE' | 'RED'
  } | null>(null)
  const { socket, isConnected } = useSocket()
  const [previewedChampions, setPreviewedChampions] = useState<
    Record<number, string | null>
  >({})
  const [readyStates, setReadyStates] = useState<{
    blue?: boolean
    red?: boolean
  }>({})
  const [isTimerReady, setIsTimerReady] = useState(false)
  const { data: champions = [] } = useQuery(getChampionsFromDb)
  const championsMap = champions.reduce(
    (acc: Record<string, Champion>, champion: Champion) => {
      acc[champion.id] = champion
      return acc
    },
    {},
  )

  // Set auth token and connect socket only once
  useEffect(() => {
    if (socket && auth && !socket.connected) {
      socket.auth = { token: auth }
      socket.connect()
    }
  }, [socket, auth])

  const { data: series } = useQuery(getSeries, { seriesId })
  const {
    data: game,
    isLoading,
    error,
    refetch,
  } = useQuery(getGame, { seriesId, gameNumber })

  // Join game room only when necessary
  useEffect(() => {
    if (!socket || !game?.id || !isConnected) {
      return
    }

    // Join the game room
    socket.emit('joinGame', game.id)

    // No need for cleanup since socket will handle this automatically
  }, [socket, game?.id, isConnected]) // Only depend on game.id, not the whole game object

  // Socket event listeners
  useSocketListener(
    'draftStart',
    (data: ServerToClientPayload<'draftStart'>) => {
      console.log('Draft starting!', data.gameId)
      refetch()
    },
  )

  useSocketListener('draftActionUpdate', () => {
    setIsTimerReady(false)

    // Always refetch on draft actions to ensure turn order is correct
    refetch()
  })

  // Simplify the socket listener to just use the server time directly
  useSocketListener(
    'timerUpdate',
    (data: ServerToClientPayload<'timerUpdate'>) => {
      if (!nextAction) return

      const timerData = data as unknown as TimerUpdatePayload
      
      // Show 0 or the server's time
      if (typeof timerData.remainingTime === 'number' && Number.isFinite(timerData.remainingTime)) {
        setTimeRemaining(Math.max(0, timerData.remainingTime))
        setIsTimerReady(true)
      }
    },
  )

  useEffect(() => {
    if (!socket) return

    socket.on('gameUpdated', ({ gameId }) => {
      if (gameId === game?.id) {
        // Always refetch on game updates to ensure state is in sync
        refetch()
      }
    })

    socket.on('gameCreated', ({ seriesId }) => {
      if (seriesId === game?.seriesId) {
        // Always refetch when new games are created
        refetch()
      }
    })

    socket.on('seriesUpdated', ({ seriesId }) => {
      if (seriesId === game?.seriesId) {
        // Always refetch when series updates
        refetch()
      }
    })

    return () => {
      socket.off('gameUpdated')
      socket.off('gameCreated')
      socket.off('seriesUpdated')
    }
  }, [socket, game?.id, game?.seriesId, refetch])

  // Clear pending action when game data changes
  useEffect(() => {
    setPendingAction(null)
  }, [game])

  useSocketListener(
    'championPreview',
    (data: ServerToClientPayload<'championPreview'>) => {
      setPreviewedChampions(prev => ({
        ...prev,
        [data.position]: data.champion,
      }))

      // If this is a preview for the current team's turn, set pendingAction
      if (gameSide && data.champion && game) {
        const gameWithRelations = game as GameWithRelations
        const currentTurn = getCurrentTurn(gameWithRelations.actions)
        const nextAction = getNextAction(currentTurn)
        const isCurrentTeam = gameSide.toUpperCase() === nextAction?.team

        if (
          isCurrentTeam &&
          nextAction &&
          data.position === nextAction.position
        ) {
          setPendingAction({
            type: nextAction.type,
            phase: nextAction.phase,
            team: nextAction.team,
            champion: data.champion,
            position: nextAction.position,
          })
        }
      }
    },
  )

  useSocketListener(
    'readyStateUpdate',
    (data: ServerToClientPayload<'readyStateUpdate'>) => {
      setReadyStates(data.readyStates)
    },
  )

  // Convert team1/team2 to blue/red based on the selected sides in the current game
  const getTeamSide = (
    team: 'team1' | 'team2' | undefined,
    game: GameWithRelations,
  ): 'blue' | 'red' | undefined => {
    if (!team) return undefined
    if (!game.blueSide || !game.redSide) return undefined

    // If team1 is on blue side (their name matches blueSide), return blue, otherwise red
    if (team === 'team1') {
      return game.blueSide === series?.team1Name ? 'blue' : 'red'
    }
    // If team2 is on blue side (their name matches blueSide), return blue, otherwise red
    if (team === 'team2') {
      return game.blueSide === series?.team2Name ? 'blue' : 'red'
    }
    return undefined
  }

  // Validate auth token if provided
  const isValidAuth =
    auth &&
    series &&
    ((team === 'team1' && auth === series.team1AuthToken) ||
      (team === 'team2' && auth === series.team2AuthToken))

  // If auth is provided but invalid, show error
  if (auth && !isValidAuth) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background text-foreground'>
        <div className='space-y-2 text-center'>
          <h1 className='text-2xl font-bold'>Invalid Auth Token</h1>
          <p className='text-muted-foreground'>
            The provided auth token is not valid for this team.
          </p>
        </div>
      </div>
    )
  }

  const handleChampionSelect = (champion: Champion) => {
    if (!socket || !game || !team || !isConnected) return

    const currentTurn = getCurrentTurn((game as GameWithRelations).actions)
    const nextAction = getNextAction(currentTurn)

    if (!nextAction) {
      return
    }

    const gameSide = getTeamSide(team, game as GameWithRelations)
    if (!gameSide) return

    if (!isTeamTurn(gameSide.toUpperCase() as 'BLUE' | 'RED', currentTurn)) {
      return
    }

    // Set pending action and emit preview
    setPendingAction({
      type: nextAction.type,
      phase: nextAction.phase,
      team: nextAction.team,
      champion: champion.id,
      position: nextAction.position,
    })

    // Emit preview to other clients
    socket.emit('previewChampion', {
      gameId: game.id,
      position: nextAction.position,
      champion: champion.id,
    })
  }

  const handleConfirmAction = () => {
    if (!socket || !game || !pendingAction) return

    socket.emit('draftAction', {
      gameId: game.id,
      type: pendingAction.type,
      phase: pendingAction.phase,
      team: pendingAction.team,
      champion: pendingAction.champion,
      position: pendingAction.position,
    })

    // Clear preview when confirming
    socket.emit('previewChampion', {
      gameId: game.id,
      position: pendingAction.position,
      champion: null,
    })

    setPendingAction(null)
  }

  const handleReadyClick = () => {
    if (!socket || !gameSide || !gameWithRelations) return
    socket.emit('readyState', {
      gameId: gameWithRelations.id,
      side: gameSide,
      isReady: !readyStates[gameSide],
    })
  }

  const renderSlot = (
    type: 'PICK' | 'BAN',
    position: number,
    index: number,
    team: 'BLUE' | 'RED',
    action?: { champion: string },
  ) => {
    const isActive =
      !action && getCurrentTurn(gameWithRelations.actions) === position
    const isPending = !action && pendingAction?.position === position
    const isPreviewed = !action && !isPending && previewedChampions[position]

    return (
      <div
        key={`${team.toLowerCase()}-${type.toLowerCase()}-${position}`}
        className='group relative'
      >
        <div
          className={cn(
            'relative overflow-hidden border-2 border-primary transition-all duration-200',
            type === 'PICK' ? 'h-full' : 'aspect-square w-full',
            !isActive &&
              !isPending &&
              !isPreviewed &&
              'border border-border hover:border-primary/20',
            'bg-card shadow-sm hover:shadow-md',
            type === 'BAN' && 'rounded-md',
            type === 'PICK' && 'rounded-lg',
          )}
        >
          {isActive && (
            <div className='absolute inset-0 animate-glow bg-primary/20' />
          )}
          <AnimatePresence mode='wait'>
            {action ? (
              <motion.div
                key='locked'
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={cn(
                  'absolute inset-0',
                  type === 'BAN' && action && 'opacity-90 grayscale',
                )}
              >
                <motion.div
                  initial={{ filter: 'brightness(2)', opacity: 0.8 }}
                  animate={{ filter: 'brightness(1)', opacity: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className='absolute inset-0 bg-primary/20'
                />
                <motion.img
                  initial={{ filter: 'brightness(2)', scale: 1.1 }}
                  animate={{ filter: 'brightness(1)', scale: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  src={getChampionImageUrl(
                    type === 'PICK'
                      ? (championsMap[action.champion] ?? action.champion)
                      : action.champion,
                    type === 'PICK' ? 'splash' : 'icon',
                  )}
                  alt={action.champion}
                  className={cn(
                    'absolute inset-0 w-full object-cover transition-transform duration-200 group-hover:scale-105',
                    type === 'PICK' ? '-top-[12%] h-[200%]' : 'h-full',
                  )}
                  loading='lazy'
                />
                {type === 'BAN' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className='absolute inset-0 flex items-center justify-center'
                    style={{
                      background:
                        'linear-gradient(45deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 100%)',
                    }}
                  ></motion.div>
                )}
              </motion.div>
            ) : isPending ? (
              <motion.div
                key='pending'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className='absolute inset-0'
              >
                <motion.img
                  src={getChampionImageUrl(
                    type === 'PICK'
                      ? (championsMap[pendingAction.champion] ??
                          pendingAction.champion)
                      : pendingAction.champion,
                    type === 'PICK' ? 'splash' : 'icon',
                  )}
                  alt={pendingAction.champion}
                  className={cn(
                    'absolute inset-0 w-full transition-transform duration-200 group-hover:scale-105',
                    type === 'PICK'
                      ? '-top-[12%] h-[200%] object-cover saturate-50'
                      : 'h-full object-cover',
                  )}
                  loading='lazy'
                />
                {type === 'BAN' && (
                  <motion.div
                    className='absolute inset-0'
                    style={{
                      background:
                        'linear-gradient(45deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 100%)',
                    }}
                  />
                )}
              </motion.div>
            ) : isPreviewed && previewedChampions[position] ? (
              <motion.div
                key='preview'
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                exit={{ opacity: 0 }}
                className='absolute inset-0'
              >
                <motion.img
                  src={getChampionImageUrl(
                    type === 'PICK'
                      ? (championsMap[previewedChampions[position]!] ??
                          previewedChampions[position]!)
                      : previewedChampions[position]!,
                    type === 'PICK' ? 'splash' : 'icon',
                  )}
                  alt={previewedChampions[position]}
                  className={cn(
                    'absolute inset-0 w-full transition-transform duration-200 group-hover:scale-105',
                    type === 'PICK'
                      ? '-top-[12%] h-[200%] object-cover saturate-50'
                      : 'h-full object-cover',
                  )}
                  loading='lazy'
                />
                {type === 'BAN' && (
                  <motion.div
                    className='absolute inset-0'
                    style={{
                      background:
                        'linear-gradient(45deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 100%)',
                    }}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key='empty'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  'absolute inset-0 flex items-center justify-center bg-muted/50',
                  type === 'PICK'
                    ? 'text-4xl font-thin'
                    : 'text-md flex-col font-medium',
                )}
              >
                {type === 'PICK' ? (
                  `${team[0]}${index + 1}`
                ) : (
                  <>
                    <span className='opacity-50'>Ban</span>
                    <span>{index + 1}</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-foreground'>Loading draft...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-destructive'>Error: {error.message}</div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-destructive'>Game not found</div>
      </div>
    )
  }

  const gameWithRelations = game as GameWithRelations
  const currentTurn = getCurrentTurn(gameWithRelations.actions)
  const nextAction = getNextAction(currentTurn)
  const gameSide = getTeamSide(team, gameWithRelations)
  const isCurrentTeam = gameSide?.toUpperCase() === nextAction?.team

  return (
    <div className='h-screen overflow-hidden bg-background'>
      <div className='relative flex h-full flex-col rounded-lg p-2 shadow-lg backdrop-blur-sm sm:p-3'>
        {/* Main Draft UI */}
        <div className='flex h-full flex-col gap-2 sm:gap-4'>
          {/* Top Section: Picks and Series Info */}
          <div className='flex min-h-0 flex-1 gap-2 sm:gap-4'>
            {/* Blue Side - Vertical */}
            <div className='flex min-h-0 w-[18%] flex-col rounded-lg border border-border/50 bg-card/50 p-2 shadow-md backdrop-blur-sm sm:p-4'>
              <motion.h2
                className={cn(
                  'mb-2 flex-none truncate text-center text-lg font-bold uppercase tracking-wider sm:mb-4 sm:text-2xl lg:text-3xl',
                  gameWithRelations.series.winner === gameWithRelations.blueSide
                    ? 'text-blue-400'
                    : 'text-blue-500',
                )}
                animate={
                  gameWithRelations.series.winner === gameWithRelations.blueSide
                    ? {
                        textShadow: [
                          '0 0 4px rgb(59 130 246 / 0.5)',
                          '0 0 8px rgb(59 130 246 / 0.5)',
                          '0 0 4px rgb(59 130 246 / 0.5)',
                        ],
                      }
                    : {}
                }
                transition={{ repeat: Infinity, duration: 2 }}
                title={gameWithRelations.blueSide || 'Blue Side'} // Show full text on hover
              >
                {gameWithRelations.blueSide || 'Blue Side'}
              </motion.h2>

              {/* Blue Picks */}
              <div className='grid flex-1 grid-rows-5 gap-3'>
                {[6, 9, 10, 17, 18].map((i, index) => {
                  const action = gameWithRelations.actions.find(
                    a => a.type === 'PICK' && a.position === i,
                  )
                  return renderSlot('PICK', i, index, 'BLUE', action)
                })}
              </div>
            </div>

            {/* Center Content */}
            <div className='flex min-w-0 flex-1 flex-col gap-2 sm:gap-4'>
              {/* Series Info */}
              <div>
                {(game as GameWithRelations)?.series && (
                  <div className='min-w-0'>
                    <SeriesInfo
                      series={(game as GameWithRelations).series}
                      currentGameNumber={parseInt(gameNumber)}
                      side={team}
                      gameStatus={gameWithRelations.status}
                      blueSide={gameWithRelations.blueSide}
                      redSide={gameWithRelations.redSide}
                      gameId={gameWithRelations.id}
                      timeRemaining={timeRemaining}
                      nextAction={nextAction}
                      isTimerReady={isTimerReady}
                    />
                  </div>
                )}
              </div>

              {/* Side Selection or Draft Content */}
              <div className='flex min-h-0 flex-1 flex-col gap-2'>
                {gameWithRelations.status === 'PENDING' &&
                (!gameWithRelations.blueSide || !gameWithRelations.redSide) ? (
                  <div className='flex min-h-0 flex-1 items-center justify-center'>
                    <SideSelection
                      series={gameWithRelations.series}
                      gameNumber={parseInt(gameNumber)}
                      side={team}
                    />
                  </div>
                ) : (
                  <>
                    {/* Ready State */}
                    {gameWithRelations.status === 'PENDING' &&
                    gameWithRelations.blueSide &&
                    gameWithRelations.redSide ? (
                      <div className='flex h-[120px] items-center justify-center py-4'>
                        <div className='flex flex-col items-center gap-4'>
                          <ReadyStateIndicator
                            blueReady={readyStates.blue}
                            redReady={readyStates.red}
                          />
                          <div className='text-sm font-medium text-muted-foreground'>
                            {gameSide
                              ? readyStates[gameSide]
                                ? ''
                                : ''
                              : 'Waiting for teams...'}
                          </div>
                          {gameSide && (
                            <Button
                              size='sm'
                              variant={
                                readyStates[gameSide] ? 'outline' : 'default'
                              }
                              onClick={handleReadyClick}
                              className={cn(
                                'min-w-[80px] transition-all duration-200',
                                readyStates[gameSide] &&
                                  'hover:bg-destructive hover:text-destructive-foreground',
                              )}
                            >
                              {readyStates[gameSide] ? 'Unready' : 'Ready'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {/* Champion Grid */}
                    <div className='flex min-h-0 flex-1 flex-col gap-2'>
                      <div className='relative flex min-h-0 flex-1 justify-center'>
                        <div className='w-full min-w-0'>
                          <ChampionGrid
                            onSelect={handleChampionSelect}
                            disabled={
                              gameWithRelations.status !== 'IN_PROGRESS' ||
                              !gameSide ||
                              !isTeamTurn(
                                gameSide.toUpperCase() as 'BLUE' | 'RED',
                                currentTurn,
                              )
                            }
                            bannedChampions={gameWithRelations.actions
                              .filter(a => a.type === 'BAN')
                              .map(a => a.champion)}
                            usedChampions={[
                              // Current game picks
                              ...gameWithRelations.actions
                                .filter(a => a.type === 'PICK')
                                .map(a => a.champion),
                              // If fearless draft, add all picks from previous games
                              ...(gameWithRelations.series.fearlessDraft
                                ? gameWithRelations.series.games
                                    .filter(
                                      g =>
                                        g.gameNumber <
                                        gameWithRelations.gameNumber,
                                    )
                                    .flatMap(g => g.actions)
                                    .filter(a => a.type === 'PICK')
                                    .map(a => a.champion)
                                : []),
                            ]}
                            isPickPhase={nextAction?.type === 'PICK'}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Red Side - Vertical */}
            <div className='flex min-h-0 w-[18%] flex-col rounded-lg border border-border/50 bg-card/50 p-2 shadow-md backdrop-blur-sm sm:p-4'>
              <motion.h2
                className={cn(
                  'mb-2 flex-none truncate text-center text-lg font-bold uppercase tracking-wider sm:mb-4 sm:text-2xl lg:text-3xl',
                  gameWithRelations.series.winner === gameWithRelations.redSide
                    ? 'text-red-400'
                    : 'text-red-500',
                )}
                animate={
                  gameWithRelations.series.winner === gameWithRelations.redSide
                    ? {
                        textShadow: [
                          '0 0 4px rgb(239 68 68 / 0.5)',
                          '0 0 8px rgb(239 68 68 / 0.5)',
                          '0 0 4px rgb(239 68 68 / 0.5)',
                        ],
                      }
                    : {}
                }
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {gameWithRelations.redSide || 'Red Side'}
              </motion.h2>

              {/* Red Picks */}
              <div className='grid flex-1 grid-rows-5 gap-3'>
                {[7, 8, 11, 16, 19].map((i, index) => {
                  const action = gameWithRelations.actions.find(
                    a => a.type === 'PICK' && a.position === i,
                  )
                  return renderSlot('PICK', i, index, 'RED', action)
                })}
              </div>
            </div>
          </div>

          {/* Bottom Section: Bans and Actions */}
          <div className='mt-0 flex flex-none items-center justify-between gap-1 rounded-lg bg-muted p-2 shadow-md backdrop-blur-sm sm:gap-2 sm:p-4 lg:gap-4'>
            {/* Blue Bans */}
            <div className='flex justify-center gap-1 sm:gap-2'>
              {[0, 2, 4, 13, 15].map((i, index) => {
                const action = gameWithRelations.actions.find(
                  a => a.type === 'BAN' && a.position === i,
                )
                return (
                  <div key={i} className='w-16 sm:w-16 2xl:w-24'>
                    {renderSlot('BAN', i, index, 'BLUE', action)}
                  </div>
                )
              })}
            </div>

            {/* Center Actions */}
            <div className='flex h-[48px] w-[90px] flex-none flex-col items-center justify-center sm:w-[120px] lg:w-[160px]'>
              {/* Confirmation Button or Team Status */}
              {pendingAction && isCurrentTeam ? (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className='flex w-full justify-center'
                >
                  <Button
                    size='lg'
                    onClick={handleConfirmAction}
                    className='w-full font-medium shadow-md transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]'
                  >
                    Lock In
                  </Button>
                </motion.div>
              ) : (
                nextAction && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className='text-center text-sm font-medium text-muted-foreground'
                  >
                    <span className='block truncate'>
                      {team && isCurrentTeam
                        ? "It's your turn! 👋"
                        : `${nextAction.team === 'BLUE' ? gameWithRelations.blueSide : gameWithRelations.redSide} is thinking 🤔`}
                    </span>
                  </motion.div>
                )
              )}

              {/* Scroll Indicator */}
              <AnimatePresence>
                {gameWithRelations.status === 'COMPLETED' && (
                  <ScrollIndicator />
                )}
              </AnimatePresence>
            </div>

            {/* Red Bans */}
            <div className='flex justify-center gap-1 sm:gap-2'>
              {[1, 3, 5, 12, 14].map((i, index) => {
                const action = gameWithRelations.actions.find(
                  a => a.type === 'BAN' && a.position === i,
                )
                return (
                  <div key={i} className='w-16 sm:w-16 2xl:w-24'>
                    {renderSlot('BAN', i, index, 'RED', action)}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
