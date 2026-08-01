import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { MAX_ROOM_MEMBERS } from './roomCapacity'
import { createRoomStartPatch, type RoomPhase } from './roomLifecycle'

type ParticipantCandidate = Pick<
  Doc<'roomMembers'>,
  '_id' | '_creationTime' | 'name' | 'role' | 'joinedAt'
>

export function buildGameParticipantSnapshot(
  candidates: readonly ParticipantCandidate[],
) {
  return [...candidates]
    .sort(
      (left, right) =>
        left.joinedAt - right.joinedAt ||
        left._creationTime - right._creationTime ||
        left._id.localeCompare(right._id),
    )
    .map((member, position) => ({
      roomMemberId: member._id,
      name: member.name,
      role: member.role,
      position,
    }))
}

export async function createGameParticipantSnapshot(
  ctx: MutationCtx,
  roomId: Id<'rooms'>,
  candidates: readonly ParticipantCandidate[],
  createdAt: number,
) {
  const participants = buildGameParticipantSnapshot(candidates)
  const gameId = await ctx.db.insert('games', { roomId, createdAt })

  for (const participant of participants) {
    await ctx.db.insert('gameParticipants', { gameId, ...participant })
  }

  return gameId
}

export async function startRoomGame(
  ctx: MutationCtx,
  room: Doc<'rooms'>,
  actor: { role: 'host' | 'player'; isActive: boolean } | null,
  getOnlineParticipants: () => Promise<Doc<'roomMembers'>[]>,
  startedAt: number,
) {
  let participants: Doc<'roomMembers'>[] | null = null
  const roomStartPatch = await createRoomStartPatch({
    room,
    actor,
    getOnlinePlayerCount: async () => {
      participants = await getOnlineParticipants()
      return participants.length
    },
    startedAt,
  })

  if (!participants) {
    throw new Error('Unable to create the game participant snapshot.')
  }

  const gameId = await createGameParticipantSnapshot(
    ctx,
    room._id,
    participants,
    startedAt,
  )

  await ctx.db.patch(room._id, { ...roomStartPatch, gameId })

  return gameId
}

export async function listGameParticipantSnapshot(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<'games'>,
) {
  return await ctx.db
    .query('gameParticipants')
    .withIndex('by_game_id_and_position', (index) => index.eq('gameId', gameId))
    .order('asc')
    .take(MAX_ROOM_MEMBERS)
}

export async function listRoomParticipantsForPhase<T>({
  phase,
  gameId,
  listLobbyParticipants,
  listGameParticipants,
}: {
  phase: RoomPhase
  gameId?: Id<'games'>
  listLobbyParticipants: () => Promise<T[]>
  listGameParticipants: (gameId: Id<'games'>) => Promise<T[]>
}) {
  if (phase === 'lobby') {
    return await listLobbyParticipants()
  }

  if (!gameId) {
    return []
  }

  return await listGameParticipants(gameId)
}
