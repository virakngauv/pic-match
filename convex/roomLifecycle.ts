import { v } from 'convex/values'

export const roomPhase = v.union(
  v.literal('lobby'),
  v.literal('playing'),
  v.literal('finished'),
)

export type RoomPhase = 'lobby' | 'playing' | 'finished'

type StoredRoomLifecycle = {
  phase?: RoomPhase
  startedAt?: number
}

type RoomStartActor = {
  role: 'host' | 'player'
  isActive: boolean
}

export function newRoomLifecycle() {
  return { phase: 'lobby' as const }
}

export function getRoomPhase(room: StoredRoomLifecycle): RoomPhase {
  if (room.phase !== undefined) {
    return room.phase
  }

  return room.startedAt === undefined ? 'lobby' : 'playing'
}

export async function createRoomStartPatch({
  room,
  actor,
  getOnlinePlayerCount,
  startedAt,
}: {
  room: StoredRoomLifecycle
  actor: RoomStartActor | null
  getOnlinePlayerCount: () => Promise<number>
  startedAt: number
}) {
  if (!actor || !actor.isActive || actor.role !== 'host') {
    throw new Error('Only the host can start the game.')
  }

  if (getRoomPhase(room) !== 'lobby') {
    throw new Error('The game can only be started from the lobby.')
  }

  const onlinePlayerCount = await getOnlinePlayerCount()

  if (onlinePlayerCount < 2) {
    throw new Error('At least 2 players are required to start the game.')
  }

  return {
    phase: 'playing' as const,
    startedAt,
  }
}
