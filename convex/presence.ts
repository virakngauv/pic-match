import { Presence } from '@convex-dev/presence'
import { v } from 'convex/values'

import { components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { mutation } from './_generated/server'
import { validateClientToken } from './playerKeys'
import { isActiveRoomMember } from './roomMembers'
import { normalizeRoomCode, ROOM_CODE_PATTERN } from './roomCode'

const ROOM_HEARTBEAT_INTERVAL_MS = 4_000

export const roomPresence = new Presence<Id<'rooms'>, Id<'roomMembers'>>(
  components.presence,
)

export const heartbeat = mutation({
  args: {
    roomCode: v.string(),
    clientToken: v.string(),
    sessionId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { roomCode, clientToken, sessionId }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const validatedClientToken = validateClientToken(clientToken)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      return false
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room) {
      return false
    }

    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()

    if (!member || !isActiveRoomMember(member.status)) {
      return false
    }

    await roomPresence.heartbeat(
      ctx,
      room._id,
      member._id,
      sessionId,
      ROOM_HEARTBEAT_INTERVAL_MS,
    )

    return true
  },
})
