import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  getGameParticipant,
  listGameParticipantSnapshot,
  startRoomGame,
} from './gameParticipants'
import { presentFinishedGameState, presentPlayingGameState } from './gameState'
import { parseClientToken, validateClientToken } from './playerKeys'
import {
  claimRoomSeat,
  createRoomPresenceSessionId,
  hasAvailableRoomSeat,
  listOnlineActiveRoomMembers,
  roomPresence,
} from './presence'
import { canRoomMemberConnect, decideRoomJoin } from './roomAccess'
import { explicitlyLeaveRoom } from './roomDeparture'
import { getRoomPhase, newRoomLifecycle } from './roomLifecycle'
import { isActiveRoomMember } from './roomMembers'
import {
  findAvailableRoomCode,
  normalizeRoomCode,
  ROOM_CODE_PATTERN,
} from './roomCode'
import { classifyRoomView, roomView } from './roomView'

const MAX_NAME_LENGTH = 50

const roomEntryResult = v.object({
  roomCode: v.string(),
})

const joinRoomResult = v.union(
  v.object({
    status: v.literal('joined'),
    roomCode: v.string(),
  }),
  v.object({ status: v.literal('room_full') }),
  v.object({ status: v.literal('game_in_progress') }),
)

type JoinRoomResult =
  | { status: 'joined'; roomCode: string }
  | { status: 'room_full' }
  | { status: 'game_in_progress' }
  | null

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
    clientInstanceId: v.string(),
  },
  returns: roomEntryResult,
  handler: async (ctx, { name, clientToken, clientInstanceId }) => {
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
      ...newRoomLifecycle(),
    })

    const memberId = await ctx.db.insert('roomMembers', {
      roomId,
      name: creatorName,
      privatePlayerKey: validatedClientToken,
      role: 'host',
      status: 'active',
      joinedAt: Date.now(),
    })

    const presenceResult = await claimRoomSeat(
      ctx,
      roomId,
      memberId,
      createRoomPresenceSessionId(clientInstanceId, roomCode),
    )

    if (presenceResult.status !== 'accepted') {
      throw new Error('Unable to reserve the host’s room seat.')
    }

    return { roomCode }
  },
})

export const join = mutation({
  args: {
    roomCode: v.string(),
    name: v.string(),
    clientToken: v.string(),
    clientInstanceId: v.string(),
  },
  returns: v.union(v.null(), joinRoomResult),
  handler: async (
    ctx,
    { roomCode, name, clientToken, clientInstanceId },
  ): Promise<JoinRoomResult> => {
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

    const normalizedName = normalizeName(name)

    const existingMember = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()

    const phase = getRoomPhase(room)
    const gameParticipant =
      existingMember && phase !== 'lobby' && room.gameId
        ? await getGameParticipant(ctx, room.gameId, existingMember._id)
        : null
    const joinDecision = decideRoomJoin({
      phase,
      memberStatus: existingMember?.status ?? null,
      isGameParticipant: gameParticipant !== null,
    })

    if (joinDecision === 'game_in_progress') {
      return { status: 'game_in_progress' }
    }

    const sessionId = createRoomPresenceSessionId(
      clientInstanceId,
      normalizedRoomCode,
    )

    if (existingMember) {
      const presenceResult = await claimRoomSeat(
        ctx,
        room._id,
        existingMember._id,
        sessionId,
      )

      if (presenceResult.status === 'room_full') {
        return { status: 'room_full' }
      }

      if (!isActiveRoomMember(existingMember.status)) {
        await ctx.db.patch(existingMember._id, {
          name: normalizedName,
          status: 'active',
        })
      }

      return { status: 'joined', roomCode: room.code }
    }

    if (!(await hasAvailableRoomSeat(ctx, room._id))) {
      return { status: 'room_full' }
    }

    const memberId = await ctx.db.insert('roomMembers', {
      roomId: room._id,
      name: normalizedName,
      privatePlayerKey: validatedClientToken,
      role: 'player',
      status: 'active',
      joinedAt: Date.now(),
    })

    const presenceResult = await claimRoomSeat(
      ctx,
      room._id,
      memberId,
      sessionId,
    )

    if (presenceResult.status !== 'accepted') {
      throw new Error('Unable to reserve the room seat.')
    }

    return { status: 'joined', roomCode: room.code }
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

    if (member) {
      await explicitlyLeaveRoom(
        ctx,
        room,
        member,
        async (roomId, memberId) =>
          await roomPresence.removeRoomUser(ctx, roomId, memberId),
      )
    }

    return null
  },
})

export const start = mutation({
  args: {
    roomCode: v.string(),
    clientToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { roomCode, clientToken }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const validatedClientToken = validateClientToken(clientToken)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      throw new Error('Room not found.')
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room) {
      throw new Error('Room not found.')
    }

    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()

    await startRoomGame(
      ctx,
      room,
      member
        ? {
            role: member.role,
            isActive: isActiveRoomMember(member.status),
          }
        : null,
      async () => await listOnlineActiveRoomMembers(ctx, room._id),
      Date.now(),
    )

    return null
  },
})

export const getRoomView = query({
  args: {
    roomCode: v.string(),
    clientToken: v.union(v.null(), v.string()),
  },
  returns: roomView,
  handler: async (ctx, { roomCode, clientToken }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      return { status: 'not_found' as const, roomCode: normalizedRoomCode }
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room) {
      return { status: 'not_found' as const, roomCode: normalizedRoomCode }
    }

    const phase = getRoomPhase(room)
    const validatedClientToken = parseClientToken(clientToken)
    const member = validatedClientToken
      ? await ctx.db
          .query('roomMembers')
          .withIndex('by_room_id_and_private_player_key', (index) =>
            index
              .eq('roomId', room._id)
              .eq('privatePlayerKey', validatedClientToken),
          )
          .unique()
      : null
    const participant =
      member && phase !== 'lobby' && room.gameId
        ? await getGameParticipant(ctx, room.gameId, member._id)
        : null
    const isEligible =
      member !== null &&
      canRoomMemberConnect({
        phase,
        memberStatus: member.status,
        isGameParticipant: participant !== null,
      })
    const onlineMembers = isEligible
      ? await listOnlineActiveRoomMembers(ctx, room._id)
      : []
    const status = classifyRoomView({
      phase,
      memberStatus: member?.status ?? null,
      isGameParticipant: participant !== null,
      isConnected: member
        ? onlineMembers.some((onlineMember) => onlineMember._id === member._id)
        : false,
    })

    if (status === 'joinable' || status === 'game_in_progress') {
      return { status, roomCode: room.code }
    }

    if (status === 'reconnecting') {
      return { status, roomCode: room.code, phase }
    }

    if (status === 'lobby' && member) {
      return {
        status,
        roomCode: room.code,
        members: onlineMembers
          .sort(
            (left, right) =>
              left.joinedAt - right.joinedAt ||
              left._creationTime - right._creationTime ||
              left._id.localeCompare(right._id),
          )
          .map((onlineMember) => ({
            playerId: onlineMember._id,
            name: onlineMember.name,
            role: onlineMember.role,
          })),
        player: {
          playerId: member._id,
          name: member.name,
          role: member.role,
          position: null,
        },
      }
    }

    if (status === 'playing' && participant && room.gameId) {
      const game = await ctx.db.get(room.gameId)

      if (!game) {
        throw new Error('Unable to resolve the current game.')
      }

      const scoreboard = await listGameParticipantSnapshot(ctx, room.gameId)

      return {
        status,
        roomCode: room.code,
        player: {
          playerId: participant.roomMemberId,
          name: participant.name,
          role: participant.role,
          position: participant.position,
        },
        ...presentPlayingGameState(game, scoreboard),
      }
    }

    if (status === 'finished' && participant && room.gameId) {
      const game = await ctx.db.get(room.gameId)

      if (!game) {
        throw new Error('Unable to resolve the finished game.')
      }

      const scoreboard = await listGameParticipantSnapshot(ctx, room.gameId)

      return {
        status,
        roomCode: room.code,
        player: {
          playerId: participant.roomMemberId,
          name: participant.name,
          role: participant.role,
          position: participant.position,
        },
        ...presentFinishedGameState(game, scoreboard),
      }
    }

    throw new Error('Unable to resolve the room view.')
  },
})
