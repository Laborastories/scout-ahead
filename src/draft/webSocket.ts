import type { WaspSocketData, WebSocketDefinition } from 'wasp/server/webSocket'
import { prisma } from 'wasp/server'
import { type DraftAction } from 'wasp/entities'

import {
  getGameReadyState,
  setGameReadyState,
  clearGameReadyState,
  getGameTimer,
  setGameTimer,
  clearGameTimer,
  getGamePreviews,
  setChampionPreview,
  subscriber,
  CHANNELS,
  broadcastPreviewUpdate,
  broadcastDraftAction,
  broadcastGameUpdate,
  broadcastSeriesUpdate,
  broadcastSideSelect,
  broadcastReadyState,
  broadcastTimerUpdate,
  getCachedChampions,
  setCachedChampions,
} from '../lib/redis'

export interface ServerToClientEvents {
  readyStateUpdate: (data: {
    gameId: string
    readyStates: { blue?: boolean; red?: boolean }
  }) => void
  draftStart: (data: { gameId: string; startTime: number }) => void
  draftActionUpdate: (data: { gameId: string; action: DraftAction }) => void
  timerUpdate: (data: {
    gameId: string
    turnStartedAt: number
    phaseTimeLimit: number
    remainingTime: number
    lastUpdateTime: number
  }) => void
  gameUpdated: (data: {
    gameId: string
    status: string
    winner?: 'BLUE' | 'RED'
    blueSide?: string
    redSide?: string
  }) => void
  gameCreated: (data: {
    gameId: string
    seriesId: string
    gameNumber: number
  }) => void
  seriesUpdated: (data: {
    seriesId: string
    status: string
    winner?: 'team1' | 'team2'
  }) => void
  championPreview: (data: {
    gameId: string
    position: number
    champion: string | null
  }) => void
  error: (data: { message: string }) => void
}

interface ClientToServerEvents {
  joinGame: (gameId: string) => void
  readyState: (data: {
    gameId: string
    side: 'blue' | 'red'
    isReady: boolean
  }) => void
  draftAction: (data: {
    gameId: string
    type: 'PICK' | 'BAN'
    phase: number
    team: 'BLUE' | 'RED'
    champion: string
    position: number
  }) => void
  setWinner: (data: { gameId: string; winner: 'BLUE' | 'RED' }) => void
  selectSide: (data: {
    seriesId: string
    gameNumber: number
    side: 'blue' | 'red'
    auth: string
  }) => void
  previewChampion: (data: {
    gameId: string
    position: number
    champion: string | null
  }) => void
}

interface InterServerEvents {}

interface SocketData extends WaspSocketData {
  token?: string
}

type WebSocketFn = WebSocketDefinition<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

const PHASE_TIME_LIMIT = 30 // 30 seconds per pick/ban

// Keep track of active timers
const activeTimers: Record<string, NodeJS.Timeout> = {}

// Helper function to broadcast timer update
async function broadcastTimerUpdateToClients(io: any, gameId: string) {
  const timer = await getGameTimer(gameId)
  if (!timer) return

  // Broadcast to Redis for cross-server sync
  await broadcastTimerUpdate(gameId, timer)

  // Also emit directly to clients on this server
  io.to(gameId).emit('timerUpdate', { 
    gameId,
    ...timer,
  })
}

// Helper function to manage timers with Redis
async function startTimer(io: any, gameId: string) {
  // Clear existing interval if any
  if (activeTimers[gameId]) {
    clearInterval(activeTimers[gameId])
    delete activeTimers[gameId]
  }

  // Start exactly at current second
  const startTime = Math.floor(Date.now() / 1000) * 1000
  const remainingTime = PHASE_TIME_LIMIT
  
  // Store the turn start time and remaining time in Redis
  await setGameTimer(gameId, {
    turnStartedAt: startTime,
    phaseTimeLimit: PHASE_TIME_LIMIT,
    remainingTime,
    lastUpdateTime: Date.now(),
  })

  // Initial broadcast
  await broadcastTimerUpdateToClients(io, gameId)

  // Create interval to broadcast time updates
  const intervalId = setInterval(async () => {
    const timer = await getGameTimer(gameId)
    if (!timer) {
      clearInterval(activeTimers[gameId])
      delete activeTimers[gameId]
      return
    }

    const newRemainingTime = timer.remainingTime - 1
    
    // Send final 0 update before clearing
    if (newRemainingTime <= 0) {
      await setGameTimer(gameId, {
        ...timer,
        remainingTime: 0,
        lastUpdateTime: Date.now(),
      })
      await broadcastTimerUpdateToClients(io, gameId)
      
      clearInterval(activeTimers[gameId])
      delete activeTimers[gameId]
      await clearGameTimer(gameId)
      return
    }

    // Update Redis with new remaining time and timestamp
    await setGameTimer(gameId, {
      ...timer,
      remainingTime: newRemainingTime,
      lastUpdateTime: Date.now(),
    })

    await broadcastTimerUpdateToClients(io, gameId)
  }, 1000)

  // Store the new interval
  activeTimers[gameId] = intervalId
}

// Helper function to reset timer
async function resetTimer(io: any, gameId: string) {
  await startTimer(io, gameId)
}

// Clean up function to clear all timers
function clearAllTimers() {
  Object.entries(activeTimers).forEach(([gameId, intervalId]) => {
    clearInterval(intervalId)
    delete activeTimers[gameId]
  })
}

interface GameWithRelations {
  id: string
  status: string
  gameNumber: number
  seriesId: string
  series?: {
    id: string
    fearlessDraft: boolean
    games: {
      gameNumber: number
      actions: {
        type: string
        champion: string
      }[]
    }[]
  }
  actions: {
    type: string
    champion: string
    position: number
  }[]
}

// Helper function to determine whose turn it is based on position
function getTeamForPosition(position: number): 'BLUE' | 'RED' {
  // Draft order: BLUE BAN, RED BAN, BLUE BAN, RED BAN, BLUE BAN, RED BAN
  //              BLUE PICK, RED PICK x2, BLUE PICK x2, RED PICK x2, BLUE PICK x2, RED PICK
  const draftOrder: ('BLUE' | 'RED')[] = [
    // First Ban Phase (0-5)
    'BLUE',
    'RED',
    'BLUE',
    'RED',
    'BLUE',
    'RED',
    // First Pick Phase (6-11)
    'BLUE',
    'RED',
    'RED',
    'BLUE',
    'BLUE',
    'RED',
    // Second Ban Phase (12-15)
    'RED',
    'BLUE',
    'RED',
    'BLUE',
    // Second Pick Phase (16-19)
    'RED',
    'BLUE',
    'BLUE',
    'RED',
  ]
  return draftOrder[position]
}

// Helper function to validate game state
async function validateGameState(gameId: string): Promise<GameWithRelations> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      series: {
        include: {
          games: {
            include: { actions: true },
          },
        },
      },
      actions: {
        orderBy: {
          position: 'asc',
        },
      },
    },
  })

  if (!game) {
    throw new Error('Game not found')
  }

  if (game.status !== 'IN_PROGRESS') {
    throw new Error('Game is not in progress')
  }

  return game as GameWithRelations
}

// Helper function to check if champion is valid for fearless draft
async function validateChampionForFearlessDraft(
  champion: string,
  game: GameWithRelations,
  type: 'PICK' | 'BAN',
) {
  if (game.series?.fearlessDraft && type === 'PICK') {
    const isChampionUsedInSeries = game.series.games
      .filter(g => g.gameNumber < game.gameNumber)
      .some(g =>
        g.actions.some(a => a.type === 'PICK' && a.champion === champion),
      )

    if (isChampionUsedInSeries) {
      throw new Error('Champion already used in series (fearless draft)')
    }
  }
}

// Helper function to validate draft action
async function validateDraftAction(
  game: GameWithRelations,
  team: 'BLUE' | 'RED',
  position: number,
) {
  // Validate position is next in sequence
  if (game.actions.length !== position) {
    throw new Error('Invalid draft position')
  }

  // Validate it's this team's turn
  const expectedTeam = getTeamForPosition(position)
  if (team !== expectedTeam) {
    throw new Error(`Not ${team}'s turn to draft. It's ${expectedTeam}'s turn.`)
  }
}

export const webSocketFn: WebSocketFn = (io, context) => {
  console.log('WebSocket server initialized')

  // Clean up any existing timers on server restart
  clearAllTimers()

  // Cache champions on server startup
  context.entities.Champion.findMany()
    .then(champions => {
      console.log('[WS] Caching champions on server startup')
      setCachedChampions(champions.map(c => c.id))
    })
    .catch(error => {
      console.error('[WS] Error caching champions:', error)
    })

  // Subscribe to Redis channels for cross-server communication
  subscriber.subscribe(CHANNELS.TIMER_UPDATE, message => {
    try {
      const { gameId, turnStartedAt, phaseTimeLimit, remainingTime, lastUpdateTime } = JSON.parse(message)
      io.to(gameId).emit('timerUpdate', {
        gameId,
        turnStartedAt,
        phaseTimeLimit,
        remainingTime,
        lastUpdateTime,
      })
    } catch (error) {
      console.error('Error handling timer update:', error)
    }
  })

  subscriber.subscribe(CHANNELS.PREVIEW_UPDATE, message => {
    try {
      const { gameId, position, champion } = JSON.parse(message)
      io.to(gameId).emit('championPreview', {
        gameId,
        position,
        champion,
      })
    } catch (error) {
      console.error('Error handling preview update:', error)
    }
  })

  subscriber.subscribe(CHANNELS.DRAFT_ACTION, message => {
    try {
      const { gameId, action } = JSON.parse(message)
      console.log(
        `[WS] Draft action: ${action.team} ${action.type} ${action.champion} (pos: ${action.position})`,
      )
      io.to(gameId).emit('draftActionUpdate', {
        gameId,
        action,
      })
    } catch (error) {
      console.error('Error handling draft action:', error)
    }
  })

  subscriber.subscribe(CHANNELS.READY_STATE, message => {
    try {
      const { gameId, readyStates } = JSON.parse(message)
      io.to(gameId).emit('readyStateUpdate', {
        gameId,
        readyStates,
      })
    } catch (error) {
      console.error('Error handling ready state update:', error)
    }
  })

  subscriber.subscribe(CHANNELS.GAME_UPDATE, message => {
    try {
      const { gameId, ...data } = JSON.parse(message)
      io.to(gameId).emit('gameUpdated', {
        gameId,
        ...data,
      })
    } catch (error) {
      console.error('Error handling game update:', error)
    }
  })

  subscriber.subscribe(CHANNELS.SERIES_UPDATE, message => {
    try {
      const { seriesId, ...data } = JSON.parse(message)
      // Series updates are broadcast to all clients
      io.emit('seriesUpdated', {
        seriesId,
        ...data,
      })
    } catch (error) {
      console.error('Error handling series update:', error)
    }
  })

  subscriber.subscribe(CHANNELS.SIDE_SELECT, message => {
    try {
      const { gameId, ...data } = JSON.parse(message)
      // Side selection updates are broadcast to all clients
      io.emit('gameUpdated', {
        gameId,
        ...data,
      })
    } catch (error) {
      console.error('Error handling side selection:', error)
    }
  })

  io.on('connection', async socket => {
    console.log('Client connected, socket id:', socket.id)

    socket.on('joinGame', async (gameId: string) => {
      console.log(`[WS] Client joined game ${gameId.slice(0, 8)}...`)
      socket.join(gameId)

      // Send current ready state to newly joined client
      const readyState = await getGameReadyState(gameId)
      io.to(gameId).emit('readyStateUpdate', {
        gameId,
        readyStates: readyState,
      })

      // Send current timer state if exists
      const timer = await getGameTimer(gameId)
      if (timer) {
        await broadcastTimerUpdateToClients(io, gameId)
      }

      // Send current preview state if exists
      const previews = await getGamePreviews(gameId)
      Object.entries(previews).forEach(([position, champion]) => {
        // Emit to everyone in the room to ensure state is synced
        io.to(gameId).emit('championPreview', {
          gameId,
          position: parseInt(position),
          champion: champion as string | null,
        })
      })
    })

    socket.on('readyState', async ({ gameId, side, isReady }) => {
      console.log(
        `[WS] Ready state: ${side} team ${isReady ? 'ready' : 'not ready'}`,
      )

      // Get current ready state from Redis
      const readyState = await getGameReadyState(gameId)

      // Update ready state
      readyState[side] = isReady
      await setGameReadyState(gameId, readyState)

      // Broadcast ready state for cross-server sync
      await broadcastReadyState(gameId, readyState)

      // If both teams are ready, start the draft
      const bothTeamsReady = readyState.blue === true && readyState.red === true

      if (bothTeamsReady) {
        console.log('Both teams ready, starting draft for game:', gameId)
        try {
          // Update game status to IN_PROGRESS
          await prisma.game.update({
            where: { id: gameId },
            data: { status: 'IN_PROGRESS' },
          })

          // Broadcast game update
          await broadcastGameUpdate(gameId, { status: 'IN_PROGRESS' })

          // Start the timer
          await startTimer(io, gameId)

          // Emit draft start event
          io.to(gameId).emit('draftStart', {
            gameId,
            startTime: Date.now(),
          })

          // Clear ready states
          await clearGameReadyState(gameId)
        } catch (error) {
          console.error('Error starting draft:', error)
        }
      }
    })

    socket.on('previewChampion', async ({ gameId, position, champion }) => {
      console.log(
        `[WS] Champion preview: ${
          champion || 'cleared'
        } for position ${position}`,
      )

      // Store preview in Redis
      await setChampionPreview(gameId, position, champion)

      // Broadcast to Redis for cross-server sync
      await broadcastPreviewUpdate(gameId, position, champion)
    })

    socket.on('draftAction', async data => {
      try {
        console.log(
          `[WS] Received draft action: ${data.team} ${data.type} ${data.champion} (pos: ${data.position})`,
        )
        const game = await validateGameState(data.gameId)
        await validateDraftAction(game, data.team, data.position)

        // Get champions from cache or fetch and cache them
        let champions = await getCachedChampions()
        if (champions.length === 0) {
          console.log('[WS] Champions cache miss, fetching from DB')
          const dbChampions = await context.entities.Champion.findMany()
          champions = dbChampions.map(c => c.id)
          await setCachedChampions(champions)
        }

        // Validate champion
        if (!champions.includes(data.champion)) {
          console.error(`[WS] Invalid champion: ${data.champion}`)
          throw new Error('Invalid champion')
        }

        await validateChampionForFearlessDraft(data.champion, game, data.type)

        // Create the draft action
        const draftAction = await prisma.draftAction.create({
          data: {
            gameId: data.gameId,
            type: data.type,
            phase: data.phase,
            team: data.team,
            champion: data.champion,
            position: data.position,
          },
        })
        console.log(
          `[WS] Created draft action: ${draftAction.team} ${draftAction.type} ${draftAction.champion} (pos: ${draftAction.position})`,
        )

        // Clear the preview for this position
        await setChampionPreview(data.gameId, data.position, null)

        // Broadcast to Redis for cross-server sync
        await broadcastDraftAction(data.gameId, draftAction)

        // Handle last action
        if (data.position === 19) {
          console.log('[WS] Draft completed, handling last action')
          await handleLastAction(io, data.gameId)
        } else {
          console.log('[WS] Resetting timer for next action')
          await resetTimer(io, data.gameId)
        }
      } catch (error) {
        console.error('❌ Error handling draft action:', error)
        socket.emit('error', {
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred during draft action',
        })
      }
    })

    socket.on('setWinner', async ({ gameId, winner }) => {
      try {
        console.log('[WS] Attempting to set winner:', { gameId, winner })

        // Get the game with all actions to validate draft completion
        const game = await prisma.game.findUnique({
          where: { id: gameId },
          include: {
            actions: {
              orderBy: {
                position: 'asc',
              },
            },
            series: {
              include: {
                games: true,
              },
            },
          },
        })

        if (!game) {
          console.error('❌ Game not found:', gameId)
          return
        }

        console.log('[WS] Current game state:', {
          id: game.id,
          status: game.status,
          actionsCount: game.actions.length,
        })

        // Validate draft completion
        if (game.actions.length < 20) {
          console.error('❌ Draft is incomplete:', {
            id: game.id,
            actionsCount: game.actions.length,
            lastPosition:
              game.actions.length > 0
                ? game.actions[game.actions.length - 1].position
                : -1,
          })

          // Find the last valid action
          const lastValidAction = game.actions[game.actions.length - 1]

          if (lastValidAction) {
            console.log('[WS] Resetting draft to last valid action:', {
              position: lastValidAction.position,
              type: lastValidAction.type,
              team: lastValidAction.team,
              champion: lastValidAction.champion,
            })

            // Reset game status to IN_PROGRESS
            await prisma.game.update({
              where: { id: gameId },
              data: { status: 'IN_PROGRESS' },
            })

            // Broadcast game update
            await broadcastGameUpdate(gameId, {
              status: 'IN_PROGRESS',
            })

            // Reset timer for next action
            await resetTimer(io, gameId)
          }
          return
        }

        // Validate actions are in correct order
        for (let i = 0; i < game.actions.length; i++) {
          const action = game.actions[i]
          if (action.position !== i) {
            console.error('❌ Draft actions out of order:', {
              id: game.id,
              expectedPosition: i,
              actualPosition: action.position,
            })
            return
          }

          const expectedTeam = getTeamForPosition(i)
          if (action.team !== expectedTeam) {
            console.error('❌ Invalid team for position:', {
              id: game.id,
              position: i,
              expectedTeam,
              actualTeam: action.team,
            })
            return
          }
        }

        if (game.status !== 'DRAFT_COMPLETE') {
          console.error('❌ Game is not in DRAFT_COMPLETE state:', {
            id: game.id,
            status: game.status,
            actionsCount: game.actions.length,
          })
          return
        }

        console.log('✓ Game found and validated')

        // Update game with winner
        const updatedGame = await prisma.game.update({
          where: { id: gameId },
          data: {
            status: 'COMPLETED',
            winner,
          },
          include: {
            series: true,
          },
        })

        console.log('✓ Game updated with winner:', {
          id: updatedGame.id,
          status: updatedGame.status,
          winner: updatedGame.winner,
        })

        // Broadcast game update
        await broadcastGameUpdate(gameId, {
          status: updatedGame.status,
          winner: updatedGame.winner as 'BLUE' | 'RED' | undefined,
          blueSide: updatedGame.blueSide,
          redSide: updatedGame.redSide,
        })

        // If game is completed, check if we need to create next game
        const series = game.series
        // Count wins for each team by checking if they were on the winning side in each game
        const team1Wins =
          series.games.filter(
            g =>
              (g.status === 'COMPLETED' &&
                g.winner === 'BLUE' &&
                g.blueSide === series.team1Name) ||
              (g.status === 'COMPLETED' &&
                g.winner === 'RED' &&
                g.redSide === series.team1Name),
          ).length +
          ((winner === 'BLUE' && game.blueSide === series.team1Name) ||
          (winner === 'RED' && game.redSide === series.team1Name)
            ? 1
            : 0)
        const team2Wins =
          series.games.filter(
            g =>
              (g.status === 'COMPLETED' &&
                g.winner === 'BLUE' &&
                g.blueSide === series.team2Name) ||
              (g.status === 'COMPLETED' &&
                g.winner === 'RED' &&
                g.redSide === series.team2Name),
          ).length +
          ((winner === 'BLUE' && game.blueSide === series.team2Name) ||
          (winner === 'RED' && game.redSide === series.team2Name)
            ? 1
            : 0)
        const gamesNeeded =
          series.format === 'BO5' ? 3 : series.format === 'BO3' ? 2 : 1

        console.log('Win counts:', {
          team1: series.team1Name,
          team2: series.team2Name,
          team1Wins,
          team2Wins,
          currentGame: {
            winner,
            blueSide: game.blueSide,
            redSide: game.redSide,
          },
        })

        // Check if someone has won the series (only if not in scrim block mode)
        if (
          !series.scrimBlock &&
          (team1Wins >= gamesNeeded || team2Wins >= gamesNeeded)
        ) {
          // Update series as completed
          const updatedSeries = await prisma.series.update({
            where: { id: series.id },
            data: {
              status: 'COMPLETED',
              winner: team1Wins > team2Wins ? 'team1' : 'team2',
            },
          })

          console.log('✓ Series completed:', {
            id: updatedSeries.id,
            status: updatedSeries.status,
            winner: updatedSeries.winner,
            team1Wins,
            team2Wins,
            gamesNeeded,
          })

          // Broadcast series update
          await broadcastSeriesUpdate(series.id, {
            status: updatedSeries.status,
            winner: updatedSeries.winner as 'team1' | 'team2' | undefined,
          })
        } else {
          const maxGames =
            series.format === 'BO5' ? 5 : series.format === 'BO3' ? 3 : 1
          // Only create next game if we haven't reached the maximum number of games
          // (regardless of scrim block mode)
          if (series.games.length < maxGames) {
            const nextGameNumber = series.games.length + 1
            const nextGame = await prisma.game.create({
              data: {
                seriesId: series.id,
                gameNumber: nextGameNumber,
                blueSide: '',
                redSide: '',
                status: 'PENDING',
              },
            })

            console.log('✓ Created next game:', {
              id: nextGame.id,
              gameNumber: nextGame.gameNumber,
              maxGames,
              currentGames: series.games.length + 1,
            })

            // Initialize ready states for the new game
            await setGameReadyState(nextGame.id, {})

            // Emit game created event
            io.emit('gameCreated', {
              gameId: nextGame.id,
              seriesId: series.id,
              gameNumber: nextGameNumber,
            })

            // Emit ready state update for the new game
            io.emit('readyStateUpdate', {
              gameId: nextGame.id,
              readyStates: {},
            })
          } else if (series.scrimBlock) {
            // In scrim block mode, only mark as completed if all games are finished
            const completedGames = await prisma.game.count({
              where: {
                seriesId: series.id,
                status: 'COMPLETED',
              },
            })

            if (completedGames === maxGames) {
              // If this is the last game in a scrim block and all games are completed,
              // mark the series as completed
              const updatedSeries = await prisma.series.update({
                where: { id: series.id },
                data: {
                  status: 'COMPLETED',
                  // In scrim block mode, we don't declare a winner
                  winner: null,
                },
              })

              // Emit series updated event
              io.emit('seriesUpdated', {
                seriesId: series.id,
                status: updatedSeries.status,
                winner: undefined,
              })
            }
          }
        }
      } catch (error) {
        console.error('❌ Error setting winner:', error)
      }
    })

    socket.on('selectSide', async ({ seriesId, gameNumber, side, auth }) => {
      try {
        // First get the current game and series
        const currentGame = await prisma.game.findFirst({
          where: {
            seriesId,
            gameNumber,
          },
          include: {
            series: true,
          },
        })

        if (!currentGame) {
          console.error('Game not found')
          return
        }

        // Get the team making the selection from the auth token
        const isTeam1 = auth === currentGame.series.team1AuthToken
        console.log('Side selection:', {
          auth,
          team1Token: currentGame.series.team1AuthToken,
          team2Token: currentGame.series.team2AuthToken,
          isTeam1,
        })

        // The team making the selection is choosing which side they want to play on
        const updatedGame = await prisma.game.update({
          where: {
            id: currentGame.id,
          },
          data: {
            // If team1 is selecting:
            //   - blue side -> team1 on blue, team2 on red
            //   - red side -> team2 on blue, team1 on red
            // If team2 is selecting:
            //   - blue side -> team2 on blue, team1 on red
            //   - red side -> team1 on blue, team2 on red
            blueSide: isTeam1
              ? side === 'blue'
                ? currentGame.series.team1Name
                : currentGame.series.team2Name
              : side === 'blue'
                ? currentGame.series.team2Name
                : currentGame.series.team1Name,
            redSide: isTeam1
              ? side === 'blue'
                ? currentGame.series.team2Name
                : currentGame.series.team1Name
              : side === 'blue'
                ? currentGame.series.team1Name
                : currentGame.series.team2Name,
          },
        })

        // Broadcast side selection
        await broadcastSideSelect(updatedGame.id, {
          blueSide: updatedGame.blueSide,
          redSide: updatedGame.redSide,
        })
      } catch (error) {
        console.error('Error selecting side:', error)
      }
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })
}

async function handleLastAction(io: any, gameId: string) {
  try {
    const updatedGame = await prisma.game.update({
      where: { id: gameId },
      data: { status: 'DRAFT_COMPLETE' },
      include: {
        actions: true,
        series: true,
      },
    })

    await clearGameTimer(gameId)

    io.to(gameId).emit('gameUpdated', {
      gameId,
      status: updatedGame.status,
    })
  } catch (error) {
    console.error('❌ Error updating game status to DRAFT_COMPLETE:', error)
  }
}
