import { createClient } from 'redis'

// Key prefixes for better organization and to avoid collisions
const KEYS = {
  PREFIX: 'scout',
  READY_STATE: 'ready',
  TIMER: 'timer',
  DRAFT: 'draft',
  PREVIEW: 'preview',
} as const

// Helper to generate consistent, namespaced keys
function generateKey(type: keyof typeof KEYS, gameId: string): string {
  return `${KEYS.PREFIX}:${type}:${gameId}`
}

// If Wasp is running on your host machine, connect to 127.0.0.1:6379,
// otherwise if Wasp is in Docker too, use `redis-stack` for the host.
const client = createClient({
  url: process.env.REDIS_URL || 'redis://:local@127.0.0.1:6379',
})

client.on('error', err => {
  console.error('Redis Client Error:', err)
})

client.on('connect', () => {
  console.log('Redis Client Connected')
})

client.on('ready', () => {
  console.log('Redis Client Ready')
})

// Ensure connection is established
async function ensureConnection() {
  if (!client.isOpen) {
    await client.connect()
  }
}

// Connect immediately when this module is imported
ensureConnection().catch(err => {
  console.error('Failed to connect to Redis:', err)
})

// === Game Ready States ===
export interface GameReadyState {
  blue?: boolean
  red?: boolean
}

export async function getGameReadyState(
  gameId: string,
): Promise<GameReadyState> {
  await ensureConnection()
  const data = await client.get(generateKey('READY_STATE', gameId))
  return data ? JSON.parse(data) : {}
}

export async function setGameReadyState(gameId: string, state: GameReadyState) {
  await ensureConnection()
  await client.set(generateKey('READY_STATE', gameId), JSON.stringify(state))
}

export async function clearGameReadyState(gameId: string) {
  await ensureConnection()
  await client.del(generateKey('READY_STATE', gameId))
}

// === Game Timers ===
export interface GameTimer {
  remainingTime: number // remaining time in seconds
  phaseTimeLimit: number // time limit for this phase in seconds
}

export async function getGameTimer(gameId: string): Promise<GameTimer | null> {
  await ensureConnection()
  const data = await client.get(generateKey('TIMER', gameId))
  return data ? JSON.parse(data) : null
}

export async function setGameTimer(gameId: string, timer: GameTimer) {
  await ensureConnection()
  await client.set(generateKey('TIMER', gameId), JSON.stringify(timer))
}

export async function clearGameTimer(gameId: string) {
  await ensureConnection()
  await client.del(generateKey('TIMER', gameId))
}

// === Draft State ===
export async function setDraftState(gameId: string, state: any) {
  await ensureConnection()
  await client.set(generateKey('DRAFT', gameId), JSON.stringify(state))
}

export async function getDraftState(gameId: string) {
  await ensureConnection()
  const data = await client.get(generateKey('DRAFT', gameId))
  return data ? JSON.parse(data) : null
}

// === Champion Previews ===
export interface ChampionPreview {
  position: number
  champion: string | null
}

export async function getGamePreviews(
  gameId: string,
): Promise<Record<number, string | null>> {
  await ensureConnection()
  const data = await client.get(generateKey('PREVIEW', gameId))
  return data ? JSON.parse(data) : {}
}

export async function setChampionPreview(
  gameId: string,
  position: number,
  champion: string | null,
) {
  await ensureConnection()
  const previews = await getGamePreviews(gameId)
  if (champion === null) {
    delete previews[position]
  } else {
    previews[position] = champion
  }
  await client.set(generateKey('PREVIEW', gameId), JSON.stringify(previews))
}

export async function clearGamePreviews(gameId: string) {
  await ensureConnection()
  await client.del(generateKey('PREVIEW', gameId))
}

// Update clearGameData to include previews
export async function clearGameData(gameId: string) {
  await ensureConnection()
  await Promise.all([
    clearGameReadyState(gameId),
    clearGameTimer(gameId),
    clearGamePreviews(gameId),
    client.del(generateKey('DRAFT', gameId)),
  ])
}

// Utility function to list all keys for a game (useful for debugging)
export async function listGameKeys(gameId: string): Promise<string[]> {
  await ensureConnection()
  const keys = await client.keys(`${KEYS.PREFIX}:*:${gameId}`)
  return keys
}

// Utility function to clear all data for a series (multiple games)
export async function clearSeriesData(seriesId: string, gameIds: string[]) {
  await ensureConnection()
  await Promise.all(gameIds.map(gameId => clearGameData(gameId)))
}

// Add pub/sub clients
export const publisher = createClient({
  url: process.env.REDIS_URL || 'redis://:local@127.0.0.1:6379',
})

export const subscriber = publisher.duplicate()

// Connect pub/sub clients
Promise.all([publisher.connect(), subscriber.connect()]).catch(err => {
  console.error('Failed to connect Redis pub/sub clients:', err)
})

// Channel names for pub/sub
export const CHANNELS = {
  TIMER_UPDATE: 'timer:update',
  PREVIEW_UPDATE: 'preview:update',
  DRAFT_ACTION: 'draft:action',
  READY_STATE: 'ready:state',
  GAME_UPDATE: 'game:update',
  SERIES_UPDATE: 'series:update',
  SIDE_SELECT: 'side:select',
} as const

// Function to broadcast timer update across all servers
export async function broadcastTimerUpdate(
  gameId: string,
  data: GameTimer,
) {
  await publisher.publish(
    CHANNELS.TIMER_UPDATE,
    JSON.stringify({ gameId, ...data }),
  )
}

// Function to broadcast preview update across all servers
export async function broadcastPreviewUpdate(
  gameId: string,
  position: number,
  champion: string | null,
) {
  await publisher.publish(
    CHANNELS.PREVIEW_UPDATE,
    JSON.stringify({ gameId, position, champion }),
  )
}

// Function to broadcast draft action across all servers
export async function broadcastDraftAction(gameId: string, action: any) {
  await publisher.publish(
    CHANNELS.DRAFT_ACTION,
    JSON.stringify({ gameId, action }),
  )
}

// Function to broadcast ready state across all servers
export async function broadcastReadyState(
  gameId: string,
  readyStates: { blue?: boolean; red?: boolean },
) {
  await publisher.publish(
    CHANNELS.READY_STATE,
    JSON.stringify({ gameId, readyStates }),
  )
}

// Function to broadcast game update across all servers
export async function broadcastGameUpdate(
  gameId: string,
  data: {
    status: string
    winner?: 'BLUE' | 'RED'
    blueSide?: string
    redSide?: string
  },
) {
  await publisher.publish(
    CHANNELS.GAME_UPDATE,
    JSON.stringify({ gameId, ...data }),
  )
}

// Function to broadcast series update across all servers
export async function broadcastSeriesUpdate(
  seriesId: string,
  data: {
    status: string
    winner?: 'team1' | 'team2'
  },
) {
  await publisher.publish(
    CHANNELS.SERIES_UPDATE,
    JSON.stringify({ seriesId, ...data }),
  )
}

// Function to broadcast side selection across all servers
export async function broadcastSideSelect(
  gameId: string,
  data: {
    blueSide: string
    redSide: string
  },
) {
  await publisher.publish(
    CHANNELS.SIDE_SELECT,
    JSON.stringify({ gameId, ...data }),
  )
}

// === Champions Cache ===
const CHAMPIONS_CACHE_KEY = 'champions:all'

export async function getCachedChampions(): Promise<string[]> {
  await ensureConnection()
  const data = await client.get(CHAMPIONS_CACHE_KEY)
  return data ? JSON.parse(data) : []
}

export async function setCachedChampions(championIds: string[]) {
  await ensureConnection()
  await client.set(CHAMPIONS_CACHE_KEY, JSON.stringify(championIds))
}

export default client
