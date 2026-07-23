import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { findAvailablePrivatePlayerKey } from './playerKeys'
import {
  findAvailableRoomCode,
  normalizeRoomCode,
  ROOM_CODE_PATTERN,
} from './roomCode'
import { roomPresence } from './presence'

const MAX_NAME_LENGTH = 50
const MAX_ROOM_MEMBERS = 64

const roomEntryResult = v.object({
  roomCode: v.string(),
  privatePlayerKey: v.string(),
})

const lobbyMember = v.object({
  playerId: v.id('roomMembers'),
  name: v.string(),
  role: v.union(v.literal('host'), v.literal('player')),
  isSelf: v.boolean(),
})

function normalizeName(name: string) {
  const normalizedName = name.trim()

  if (!normalizedName) {
    throw new Error('Enter your name to continue.')
  }

  if (normalizedName.length > MAX_NAME_LENGTH) {
    throw new Error(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`)
  }

  return normalizedName
}

async function generateMemberKey(
  ctx: Pick<QueryCtx, 'db'>,
  roomId: Id<'rooms'>,
) {
  return await findAvailablePrivatePlayerKey(async (privatePlayerKey) => {
    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index.eq('roomId', roomId).eq('privatePlayerKey', privatePlayerKey),
      )
      .unique()

    return member !== null
  })
}

export const create = mutation({
  args: {
    name: v.string(),
  },
  returns: roomEntryResult,
  handler: async (ctx, { name }) => {
    const creatorName = normalizeName(name)
    const roomCode = await findAvailableRoomCode(async (code) => {
      const room = await ctx.db
        .query('rooms')
        .withIndex('by_code', (index) => index.eq('code', code))
        .unique()

      return room !== null
    })

    const roomId = await ctx.db.insert('rooms', {
      code: roomCode,
      creatorName,
      createdAt: Date.now(),
    })
    const privatePlayerKey = await generateMemberKey(ctx, roomId)

    await ctx.db.insert('roomMembers', {
      roomId,
      name: creatorName,
      privatePlayerKey,
      role: 'host',
      joinedAt: Date.now(),
    })

    return { roomCode, privatePlayerKey }
  },
})

export const join = mutation({
  args: {
    roomCode: v.string(),
    name: v.string(),
  },
  returns: v.union(v.null(), roomEntryResult),
  handler: async (ctx, { roomCode, name }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const playerName = normalizeName(name)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      return null
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room) {
      return null
    }

    const existingMembers = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_joined_at', (index) =>
        index.eq('roomId', room._id),
      )
      .take(MAX_ROOM_MEMBERS)

    if (existingMembers.length >= MAX_ROOM_MEMBERS) {
      throw new Error('This room is full.')
    }

    const privatePlayerKey = await generateMemberKey(ctx, room._id)

    await ctx.db.insert('roomMembers', {
      roomId: room._id,
      name: playerName,
      privatePlayerKey,
      role: 'player',
      joinedAt: Date.now(),
    })

    return { roomCode: room.code, privatePlayerKey }
  },
})

export const getLobby = query({
  args: {
    roomCode: v.string(),
    privatePlayerKey: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      roomCode: v.string(),
      members: v.array(lobbyMember),
    }),
  ),
  handler: async (ctx, { roomCode, privatePlayerKey }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      return null
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room) {
      return null
    }

    const currentMember = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index.eq('roomId', room._id).eq('privatePlayerKey', privatePlayerKey),
      )
      .unique()

    if (!currentMember) {
      return null
    }

    const members = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_joined_at', (index) =>
        index.eq('roomId', room._id),
      )
      .take(MAX_ROOM_MEMBERS)
    const presence = await roomPresence.listRoom(
      ctx,
      room._id,
      true,
      MAX_ROOM_MEMBERS,
    )
    const onlineMemberIds = new Set(
      presence.map((memberPresence) => memberPresence.userId),
    )

    return {
      roomCode: room.code,
      members: members
        .filter((member) => onlineMemberIds.has(member._id))
        .map((member) => ({
          playerId: member._id,
          name: member.name,
          role: member.role,
          isSelf: member._id === currentMember._id,
        })),
    }
  },
})
