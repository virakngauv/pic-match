import { v } from 'convex/values'

export const roomPhase = v.union(
  v.literal('lobby'),
  v.literal('playing'),
  v.literal('finished'),
)

export type RoomPhase = 'lobby' | 'playing' | 'finished'

type StoredRoomLifecycle = {
  phase: RoomPhase
  startedAt?: number
  gameId?: string
}

type RoomLifecycleActor = {
  role: 'host' | 'player'
  isActive: boolean
}

export function newRoomLifecycle() {
  return { phase: 'lobby' as const }
}

export function getRoomPhase(room: StoredRoomLifecycle): RoomPhase {
  return room.phase
}

export function assertRoomCanStart({
  room,
  actor,
}: {
  room: StoredRoomLifecycle
  actor: RoomLifecycleActor | null
}) {
  if (!actor || !actor.isActive || actor.role !== 'host') {
    throw new Error('Only the host can start the game.')
  }

  if (getRoomPhase(room) !== 'lobby') {
    throw new Error('The game can only be started from the lobby.')
  }
}

export async function createRoomStartPatch({
  room,
  actor,
  getOnlinePlayerCount,
  startedAt,
}: {
  room: StoredRoomLifecycle
  actor: RoomLifecycleActor | null
  getOnlinePlayerCount: () => Promise<number>
  startedAt: number
}) {
  assertRoomCanStart({ room, actor })

  const onlinePlayerCount = await getOnlinePlayerCount()

  if (onlinePlayerCount < 2) {
    throw new Error('At least 2 players are required to start the game.')
  }

  return {
    phase: 'playing' as const,
    startedAt,
  }
}

export function assertRoomCanPrepareRematch({
  room,
  actor,
}: {
  room: StoredRoomLifecycle
  actor: RoomLifecycleActor | null
}) {
  if (!actor || !actor.isActive || actor.role !== 'host') {
    throw new Error('Only the host can prepare a rematch.')
  }

  if (getRoomPhase(room) !== 'finished') {
    throw new Error('A rematch can only be prepared after the game finishes.')
  }
}

/** Returns the room-only patch for reopening a completed room's lobby. */
export function createRoomRematchPatch({
  room,
  actor,
}: {
  room: StoredRoomLifecycle
  actor: RoomLifecycleActor | null
}) {
  assertRoomCanPrepareRematch({ room, actor })

  return {
    phase: 'lobby' as const,
    startedAt: undefined,
    gameId: undefined,
  }
}
