import { Presence } from '@convex-dev/presence'
import { v } from 'convex/values'

import { components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { mutation } from './_generated/server'
import { normalizeRoomCode, ROOM_CODE_PATTERN } from './roomCode'

const ROOM_HEARTBEAT_INTERVAL_MS = 4_000

export const roomPresence = new Presence<Id<'rooms'>, Id<'roomMembers'>>(
  components.presence,
)

const heartbeatResult = v.object({
  roomToken: v.string(),
  sessionToken: v.string(),
})

export const heartbeat = mutation({
  args: {
    roomCode: v.string(),
    privatePlayerKey: v.string(),
    sessionId: v.string(),
  },
  returns: heartbeatResult,
  handler: async (ctx, { roomCode, privatePlayerKey, sessionId }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      throw new Error('This room is not available.')
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room) {
      throw new Error('This room is not available.')
    }

    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index.eq('roomId', room._id).eq('privatePlayerKey', privatePlayerKey),
      )
      .unique()

    if (!member) {
      throw new Error('Your player session is no longer valid.')
    }

    return await roomPresence.heartbeat(
      ctx,
      room._id,
      member._id,
      sessionId,
      ROOM_HEARTBEAT_INTERVAL_MS,
    )
  },
})

export const disconnect = mutation({
  args: {
    sessionToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    return await roomPresence.disconnect(ctx, sessionToken)
  },
})
