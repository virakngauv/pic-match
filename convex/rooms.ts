import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { validateClientToken } from './playerKeys'
import { isActiveRoomMember } from './roomMembers'
import {
  findAvailableRoomCode,
  normalizeRoomCode,
  ROOM_CODE_PATTERN,
} from './roomCode'

const MAX_NAME_LENGTH = 50
const MAX_ROOM_MEMBERS = 64

const roomEntryResult = v.object({
  roomCode: v.string(),
})

const lobbyMember = v.object({
  playerId: v.id('roomMembers'),
  name: v.string(),
  role: v.union(v.literal('host'), v.literal('player')),
})

const currentMemberResult = v.object({
  playerId: v.id('roomMembers'),
  role: v.union(v.literal('host'), v.literal('player')),
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

export const create = mutation({
  args: {
    name: v.string(),
    clientToken: v.string(),
  },
  returns: roomEntryResult,
  handler: async (ctx, { name, clientToken }) => {
    const creatorName = normalizeName(name)
    const validatedClientToken = validateClientToken(clientToken)
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

    await ctx.db.insert('roomMembers', {
      roomId,
      name: creatorName,
      privatePlayerKey: validatedClientToken,
      role: 'host',
      status: 'active',
      joinedAt: Date.now(),
    })

    return { roomCode }
  },
})

export const join = mutation({
  args: {
    roomCode: v.string(),
    name: v.string(),
    clientToken: v.string(),
  },
  returns: v.union(v.null(), roomEntryResult),
  handler: async (ctx, { roomCode, name, clientToken }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const playerName = normalizeName(name)
    const validatedClientToken = validateClientToken(clientToken)

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

    const existingMember = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()

    if (existingMember) {
      if (!isActiveRoomMember(existingMember.status)) {
        await ctx.db.patch(existingMember._id, {
          name: playerName,
          status: 'active',
        })
      }

      return { roomCode: room.code }
    }

    const existingMembers = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_status_and_joined_at', (index) =>
        index.eq('roomId', room._id).eq('status', 'active'),
      )
      .take(MAX_ROOM_MEMBERS)

    if (existingMembers.length >= MAX_ROOM_MEMBERS) {
      throw new Error('This room is full.')
    }

    await ctx.db.insert('roomMembers', {
      roomId: room._id,
      name: playerName,
      privatePlayerKey: validatedClientToken,
      role: 'player',
      status: 'active',
      joinedAt: Date.now(),
    })

    return { roomCode: room.code }
  },
})

export const leave = mutation({
  args: {
    roomCode: v.string(),
    clientToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { roomCode, clientToken }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const validatedClientToken = validateClientToken(clientToken)

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

    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()

    if (member && isActiveRoomMember(member.status)) {
      await ctx.db.patch(member._id, { status: 'left' })
    }

    return null
  },
})

export const getLobby = query({
  args: {
    roomCode: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      roomCode: v.string(),
      members: v.array(lobbyMember),
    }),
  ),
  handler: async (ctx, { roomCode }) => {
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

    const members = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_status_and_joined_at', (index) =>
        index.eq('roomId', room._id).eq('status', 'active'),
      )
      .take(MAX_ROOM_MEMBERS)

    return {
      roomCode: room.code,
      members: members.map((member) => ({
        playerId: member._id,
        name: member.name,
        role: member.role,
      })),
    }
  },
})

export const getCurrentMember = query({
  args: {
    roomCode: v.string(),
    clientToken: v.string(),
  },
  returns: v.union(v.null(), currentMemberResult),
  handler: async (ctx, { roomCode, clientToken }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const validatedClientToken = validateClientToken(clientToken)

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

    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()

    if (!member || !isActiveRoomMember(member.status)) {
      return null
    }

    return {
      playerId: member._id,
      role: member.role,
    }
  },
})
