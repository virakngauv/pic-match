import { Presence } from '@convex-dev/presence'
import { v } from 'convex/values'

import { components } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, type MutationCtx, type QueryCtx } from './_generated/server'
import { getGameParticipant } from './gameParticipants'
import { validateClientInstanceId, validateClientToken } from './playerKeys'
import { canClaimRoomSeat, MAX_ROOM_MEMBERS } from './roomCapacity'
import { canRoomMemberConnect } from './roomAccess'
import { getRoomPhase } from './roomLifecycle'
import { isActiveRoomMember } from './roomMembers'
import { normalizeRoomCode, ROOM_CODE_PATTERN } from './roomCode'

const ROOM_HEARTBEAT_INTERVAL_MS = 4_000
const roomPresenceResult = v.union(
  v.object({ status: v.literal('accepted') }),
  v.object({ status: v.literal('room_full') }),
  v.object({ status: v.literal('not_eligible') }),
)

export type RoomPresenceResult =
  { status: 'accepted' } | { status: 'room_full' } | { status: 'not_eligible' }

export const roomPresence = new Presence<Id<'rooms'>, Id<'roomMembers'>>(
  components.presence,
)

export function createRoomPresenceSessionId(
  clientInstanceId: string,
  roomCode: string,
) {
  return JSON.stringify([
    validateClientInstanceId(clientInstanceId),
    normalizeRoomCode(roomCode),
  ])
}

export async function listOnlineActiveRoomMembers(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<'rooms'>,
) {
  const onlinePresence = await roomPresence.listRoom(
    ctx,
    roomId,
    true,
    MAX_ROOM_MEMBERS + 1,
  )
  const members = await Promise.all(
    onlinePresence.map(({ userId }) => ctx.db.get(userId)),
  )

  return members.filter(
    (member): member is Doc<'roomMembers'> =>
      member !== null &&
      member.roomId === roomId &&
      isActiveRoomMember(member.status),
  )
}

export async function claimRoomSeat(
  ctx: MutationCtx,
  roomId: Id<'rooms'>,
  memberId: Id<'roomMembers'>,
  sessionId: string,
): Promise<RoomPresenceResult> {
  if (!(await hasAvailableRoomSeat(ctx, roomId, memberId))) {
    return { status: 'room_full' }
  }

  await roomPresence.heartbeat(
    ctx,
    roomId,
    memberId,
    sessionId,
    ROOM_HEARTBEAT_INTERVAL_MS,
  )
  return { status: 'accepted' }
}

export async function hasAvailableRoomSeat(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<'rooms'>,
  memberId?: Id<'roomMembers'>,
) {
  const onlineMembers = await listOnlineActiveRoomMembers(ctx, roomId)
  const onlineMemberIds = new Set(onlineMembers.map((member) => member._id))

  return canClaimRoomSeat(onlineMemberIds, memberId)
}

export const heartbeat = mutation({
  args: {
    roomCode: v.string(),
    clientToken: v.string(),
    clientInstanceId: v.string(),
  },
  returns: roomPresenceResult,
  handler: async (
    ctx,
    { roomCode, clientToken, clientInstanceId },
  ): Promise<RoomPresenceResult> => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const validatedClientToken = validateClientToken(clientToken)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      return { status: 'not_eligible' }
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room) {
      return { status: 'not_eligible' }
    }

    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()

    if (!member) {
      return { status: 'not_eligible' }
    }

    const phase = getRoomPhase(room)
    const gameParticipant =
      phase !== 'lobby' && room.gameId
        ? await getGameParticipant(ctx, room.gameId, member._id)
        : null

    if (
      !canRoomMemberConnect({
        phase,
        memberStatus: member.status,
        isGameParticipant: gameParticipant !== null,
      })
    ) {
      return { status: 'not_eligible' }
    }

    return await claimRoomSeat(
      ctx,
      room._id,
      member._id,
      createRoomPresenceSessionId(clientInstanceId, normalizedRoomCode),
    )
  },
})
