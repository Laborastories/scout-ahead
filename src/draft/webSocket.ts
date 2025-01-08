import type { WebSocketDefinition, WaspSocketData } from 'wasp/server/webSocket'
import { prisma } from 'wasp/server'
import { type DraftAction } from 'wasp/entities'

export interface ServerToClientEvents {
  readyStateUpdate: (data: { gameId: string, readyStates: { blue?: boolean, red?: boolean } }) => void
  draftStart: (data: { gameId: string, startTime: number }) => void
  draftActionUpdate: (data: { gameId: string, action: DraftAction }) => void
  timerUpdate: (data: { gameId: string, timeRemaining: number }) => void
  gameUpdated: (data: { gameId: string, status: string, winner?: 'BLUE' | 'RED' }) => void
  gameCreated: (data: { gameId: string, seriesId: string, gameNumber: number }) => void
  seriesUpdated: (data: { seriesId: string, status: string, winner?: 'BLUE' | 'RED' }) => void
}

type WebSocketFn = WebSocketDefinition<
  {
    joinGame: (gameId: string) => void
    readyState: (data: { gameId: string, side: 'blue' | 'red', isReady: boolean }) => void
    draftAction: (data: { gameId: string, type: 'PICK' | 'BAN', phase: number, team: 'BLUE' | 'RED', champion: string, position: number }) => void
    setWinner: (data: { gameId: string, winner: 'BLUE' | 'RED' }) => void
  },
  ServerToClientEvents,
  Record<string, never>,
  WaspSocketData
>

// Store ready states and timers in memory
const gameReadyStates: Record<string, { blue?: boolean; red?: boolean }> = {}
const gameTimers: Record<string, {
  timeRemaining: number;
  intervalId?: NodeJS.Timeout;
}> = {}

const PHASE_TIME_LIMIT = 30 // 30 seconds per pick/ban

export const webSocketFn: WebSocketFn = (io) => {
  console.log('WebSocket server initialized')
  
  io.on('connection', (socket) => {
    console.log('Client connected, socket id:', socket.id)

    socket.on('joinGame', (gameId) => {
      console.log('Client joining game:', gameId)
      socket.join(gameId)
      console.log('Client joined game:', gameId)
      
      // If there are existing ready states for this game, send them to the new client
      if (gameReadyStates[gameId]) {
        socket.emit('readyStateUpdate', {
          gameId,
          readyStates: gameReadyStates[gameId]
        })
      }

      // If there's an active timer for this game, send it to the new client
      if (gameTimers[gameId]) {
        socket.emit('timerUpdate', {
          gameId,
          timeRemaining: gameTimers[gameId].timeRemaining
        })
      }
    })

    socket.on('readyState', async ({ gameId, side, isReady }) => {
      console.log('Ready state update:', { gameId, side, isReady })

      // Initialize game ready state if not exists
      if (!gameReadyStates[gameId]) {
        gameReadyStates[gameId] = {}
      }

      // Update ready state
      gameReadyStates[gameId][side] = isReady

      // Emit ready state to all clients in the game room
      io.to(gameId).emit('readyStateUpdate', {
        gameId,
        readyStates: gameReadyStates[gameId]
      })

      // If both teams are ready, start the draft
      const bothTeamsReady = gameReadyStates[gameId].blue === true && gameReadyStates[gameId].red === true
      console.log('Ready states:', gameReadyStates[gameId], 'Both teams ready:', bothTeamsReady)
      
      if (bothTeamsReady) {
        console.log('Both teams ready, starting draft for game:', gameId)
        try {
          // Update game status to IN_PROGRESS
          await prisma.game.update({
            where: { id: gameId },
            data: { status: 'IN_PROGRESS' }
          })

          // Start the timer
          startTimer(io, gameId)

          // Emit draft start event
          io.to(gameId).emit('draftStart', {
            gameId,
            startTime: Date.now()
          })

          // Clear ready states
          delete gameReadyStates[gameId]
        } catch (error) {
          console.error('Error starting draft:', error)
        }
      }
    })

    socket.on('draftAction', async ({ gameId, type, phase, team, champion, position }) => {
      console.log('\n=== Draft Action Received ===')
      console.log('Details:', { gameId, type, phase, team, champion, position })

      try {
        // Get the game and its actions to validate the draft action
        console.log('Fetching game data...')
        const game = await prisma.game.findUnique({
          where: { id: gameId },
          include: {
            series: true,
            actions: {
              orderBy: {
                position: 'asc'
              }
            }
          }
        })

        if (!game) {
          console.error('❌ Game not found')
          return
        }
        console.log('✓ Game found:', { 
          id: game.id, 
          status: game.status,
          currentActions: game.actions.length 
        })

        // Validate game is in progress
        if (game.status !== 'IN_PROGRESS') {
          console.error('❌ Game is not in progress, current status:', game.status)
          return
        }
        console.log('✓ Game is in progress')

        // Validate champion hasn't been picked or banned
        console.log('Validating champion...')
        const championUsed = game.actions.some(action => action.champion === champion)
        if (championUsed) {
          console.error('❌ Champion has already been picked or banned')
          return
        }
        console.log('✓ Champion is available')

        // If fearless draft is enabled, check if champion was used in previous games
        if (game.series.fearlessDraft && position <= 10) { // Only check for picks, not bans
          console.log('Checking fearless draft rules...')
          const previousGames = await prisma.game.findMany({
            where: {
              seriesId: game.series.id,
              gameNumber: { lt: game.gameNumber }
            },
            include: {
              actions: true
            }
          })

          const championUsedInSeries = previousGames.some(g => 
            g.actions.some(a => a.champion === champion && a.type === 'PICK')
          )

          if (championUsedInSeries) {
            console.error('❌ Champion has already been picked in this series')
            return
          }
          console.log('✓ Champion is valid for fearless draft')
        }

        // Create the draft action
        console.log('Creating draft action...')
        const draftAction = await prisma.draftAction.create({
          data: {
            gameId,
            type,
            phase,
            team,
            champion,
            position
          }
        })
        console.log('✓ Draft action created:', draftAction)

        // Emit the action to all clients in the game room
        console.log('Emitting draftActionUpdate event...')
        io.to(gameId).emit('draftActionUpdate', {
          gameId,
          action: draftAction
        })
        console.log('✓ draftActionUpdate emitted')

        // Check if this was the last action (position 19 is Red Pick 5 in 0-based indexing)
        if (position === 19) {
          console.log('\n=== Last Action Detected ===')
          console.log('Current game state:', {
            gameId,
            position,
            currentStatus: game.status,
            totalActions: game.actions.length + 1,
            team,
            type
          })

          try {
            console.log('Updating game status to DRAFT_COMPLETE...')
            // Update game status to DRAFT_COMPLETE
            const updatedGame = await prisma.game.update({
              where: { id: gameId },
              data: { status: 'DRAFT_COMPLETE' },
              include: {
                actions: true,
                series: true
              }
            })
            console.log('✓ Game status updated:', {
              id: updatedGame.id,
              status: updatedGame.status,
              actionsCount: updatedGame.actions.length,
              lastAction: updatedGame.actions[updatedGame.actions.length - 1]
            })

            // Clear the timer if it exists
            if (gameTimers[gameId]?.intervalId) {
              console.log('Clearing timer for game:', gameId)
              clearInterval(gameTimers[gameId].intervalId)
              delete gameTimers[gameId]
              console.log('✓ Timer cleared')
            }

            // Emit game updated event after everything else is done
            console.log('Emitting gameUpdated event...')
            io.to(gameId).emit('gameUpdated', {
              gameId,
              status: updatedGame.status
            })
            console.log('✓ gameUpdated event emitted')
          } catch (error) {
            console.error('❌ Error updating game status to DRAFT_COMPLETE:', error)
          }
        } else {
          // Reset timer for next action
          console.log('Resetting timer for next action...')
          resetTimer(io, gameId)
          console.log('✓ Timer reset')
        }
      } catch (error) {
        console.error('❌ Error handling draft action:', error)
      }
    })

    socket.on('setWinner', async ({ gameId, winner }) => {
      console.log('\n=== Set Winner Event ===')
      console.log('Details:', { gameId, winner })

      try {
        // Get the game to validate it's in DRAFT_COMPLETE state
        const game = await prisma.game.findUnique({
          where: { id: gameId },
          include: {
            series: {
              include: {
                games: true
              }
            }
          }
        })

        if (!game) {
          console.error('❌ Game not found')
          return
        }

        if (game.status !== 'DRAFT_COMPLETE') {
          console.error('❌ Game is not in DRAFT_COMPLETE state')
          return
        }

        console.log('✓ Game found and validated')

        // Update game with winner
        const updatedGame = await prisma.game.update({
          where: { id: gameId },
          data: {
            status: 'COMPLETED',
            winner
          },
          include: {
            series: true
          }
        })

        console.log('✓ Game updated with winner:', {
          id: updatedGame.id,
          status: updatedGame.status,
          winner: updatedGame.winner
        })

        // Emit game updated event
        io.to(gameId).emit('gameUpdated', {
          gameId,
          status: updatedGame.status,
          winner: updatedGame.winner as 'BLUE' | 'RED' | undefined
        })

        // If game is completed, check if we need to create next game
        const series = game.series
        const blueWins = series.games.filter(g => g.winner === 'BLUE').length
        const redWins = series.games.filter(g => g.winner === 'RED').length
        const gamesNeeded = series.format === 'BO5' ? 3 : (series.format === 'BO3' ? 2 : 1)

        if (blueWins < gamesNeeded && redWins < gamesNeeded) {
          // Create next game
          const nextGameNumber = series.games.length + 1
          const nextGame = await prisma.game.create({
            data: {
              seriesId: series.id,
              gameNumber: nextGameNumber,
              // Swap sides for next game
              blueSide: game.redSide,
              redSide: game.blueSide,
              status: 'PENDING'
            }
          })

          console.log('✓ Created next game:', {
            id: nextGame.id,
            gameNumber: nextGame.gameNumber
          })

          // Emit game created event
          io.emit('gameCreated', {
            gameId: nextGame.id,
            seriesId: series.id,
            gameNumber: nextGameNumber
          })
        } else {
          // Update series as completed
          const updatedSeries = await prisma.series.update({
            where: { id: series.id },
            data: {
              status: 'COMPLETED',
              winner: blueWins > redWins ? 'BLUE' : 'RED'
            }
          })

          console.log('✓ Series completed:', {
            id: updatedSeries.id,
            status: updatedSeries.status,
            winner: updatedSeries.winner
          })

          // Emit series updated event
          io.emit('seriesUpdated', {
            seriesId: series.id,
            status: updatedSeries.status,
            winner: updatedSeries.winner as 'BLUE' | 'RED' | undefined
          })
        }
      } catch (error) {
        console.error('❌ Error setting winner:', error)
      }
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected')
    })
  })
}

// Timer management functions
function startTimer(io: any, gameId: string) {
  // Clear existing timer if any
  if (gameTimers[gameId]?.intervalId) {
    clearInterval(gameTimers[gameId].intervalId)
  }

  // Initialize timer state
  gameTimers[gameId] = {
    timeRemaining: PHASE_TIME_LIMIT,
    intervalId: setInterval(() => {
      // Decrement timer
      gameTimers[gameId].timeRemaining--

      // Emit timer update
      io.to(gameId).emit('timerUpdate', {
        gameId,
        timeRemaining: gameTimers[gameId].timeRemaining
      })

      // Stop at 0 but don't clear the timer
      if (gameTimers[gameId].timeRemaining <= 0) {
        clearInterval(gameTimers[gameId].intervalId)
        gameTimers[gameId].intervalId = undefined
      }
    }, 1000)
  }
}

function resetTimer(io: any, gameId: string) {
  startTimer(io, gameId)
} 
