import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { createInitialGameState } from './gameState'
import schema from './schema'

const modules = (
  import.meta as ImportMeta & {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
).glob('./**/*.ts')
const ROOM_CODE = 'bcdf2'
const HOST_TOKEN = '1'.repeat(32)
const PLAYER_TOKEN = '2'.repeat(32)
const OUTSIDER_TOKEN = '3'.repeat(32)

describe('room rematch preparation', () => {
  it('returns a finished room to its lobby without rewriting history', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, HOST_TOKEN)).resolves.toBeNull()

    const after = await readSeededState(t, seeded)

    expect(after.room).toEqual({
      ...before.room,
      phase: 'lobby',
      startedAt: undefined,
      gameId: undefined,
    })
    expect(after.game).toEqual(before.game)
    expect(after.members).toEqual(before.members)
    expect(after.participants).toEqual(before.participants)
  })

  it.each([
    ['a non-host participant', PLAYER_TOKEN, 'Only the host'],
    ['an unknown member', OUTSIDER_TOKEN, 'Only the host'],
  ])('rejects %s without changing the room', async (_case, token, message) => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, token)).rejects.toThrow(message)

    await expect(readSeededState(t, seeded)).resolves.toEqual(before)
  })

  it('rejects an inactive host without changing the room', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t, { hostStatus: 'left' })
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
      'Only the host can prepare a rematch.',
    )

    await expect(readSeededState(t, seeded)).resolves.toEqual(before)
  })

  it('requires the host to belong to the current participant snapshot', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t, { includeHostParticipant: false })
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
      'Only current game participants can prepare a rematch.',
    )

    await expect(readSeededState(t, seeded)).resolves.toEqual(before)
  })

  it.each(['lobby', 'playing'] as const)(
    'rejects a rematch request while the room is %s',
    async (phase) => {
      const t = convexTest(schema, modules)
      const seeded = await seedFinishedRoom(t)
      await t.run(async (ctx) => {
        await ctx.db.patch(seeded.roomId, { phase })
      })
      const before = await readSeededState(t, seeded)

      await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
        'A rematch can only be prepared after the game finishes.',
      )

      await expect(readSeededState(t, seeded)).resolves.toEqual(before)
    },
  )

  it('requires the finished room to retain its completed game', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.roomId, { gameId: undefined })
    })
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
      'Unable to resolve the completed game.',
    )

    await expect(readSeededState(t, seeded)).resolves.toEqual(before)
  })

  it('rejects a dangling completed-game reference', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)
    await t.run(async (ctx) => {
      await ctx.db.delete(seeded.gameId)
    })
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
      'Unable to resolve the completed game.',
    )

    await expect(readSeededState(t, seeded)).resolves.toEqual(before)
  })

  it('rejects a finished room whose game has no winner', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.gameId, { winnerRoomMemberId: undefined })
    })
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
      'Unable to resolve the completed game.',
    )

    await expect(readSeededState(t, seeded)).resolves.toEqual(before)
  })

  it('rejects a winner missing from the completed participant snapshot', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)
    const winnerParticipantId = seeded.participantIds[1]

    if (!winnerParticipantId) {
      throw new Error('The seeded game is missing its winning participant.')
    }

    await t.run(async (ctx) => {
      await ctx.db.delete(winnerParticipantId)
    })
    const before = await readSeededState(t, seeded)

    await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
      'Unable to resolve the completed game.',
    )

    await expect(readSeededState(t, seeded)).resolves.toEqual(before)
  })

  it('rejects a duplicate request after the first reset', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)

    await expect(prepareRematch(t, HOST_TOKEN)).resolves.toBeNull()
    await expect(prepareRematch(t, HOST_TOKEN)).rejects.toThrow(
      'A rematch can only be prepared after the game finishes.',
    )

    const state = await readSeededState(t, seeded)
    expect(state.room).toMatchObject({ phase: 'lobby' })
    expect(state.room?.gameId).toBeUndefined()
  })

  it('allows exactly one concurrent rematch request', async () => {
    const t = convexTest(schema, modules)
    const seeded = await seedFinishedRoom(t)

    const results = await Promise.allSettled([
      prepareRematch(t, HOST_TOKEN),
      prepareRematch(t, HOST_TOKEN),
    ])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toEqual([
      expect.objectContaining({ status: 'fulfilled', value: null }),
    ])
    expect(rejected).toHaveLength(1)
    expect(String(rejected[0]?.reason)).toContain(
      'A rematch can only be prepared after the game finishes.',
    )

    const state = await readSeededState(t, seeded)
    expect(state.room).toMatchObject({ phase: 'lobby' })
    expect(state.room?.gameId).toBeUndefined()
  })
})

type ConvexTest = ReturnType<typeof convexTest>

async function prepareRematch(t: ConvexTest, clientToken: string) {
  return await t.mutation(api.rooms.prepareRematch, {
    roomCode: ROOM_CODE,
    clientToken,
  })
}

async function seedFinishedRoom(
  t: ConvexTest,
  {
    hostStatus = 'active',
    includeHostParticipant = true,
  }: {
    hostStatus?: 'active' | 'left'
    includeHostParticipant?: boolean
  } = {},
) {
  return await t.run(async (ctx) => {
    const roomId = await ctx.db.insert('rooms', {
      code: ROOM_CODE,
      creatorName: 'Host',
      createdAt: 1,
      phase: 'lobby',
    })
    const hostMemberId = await ctx.db.insert('roomMembers', {
      roomId,
      name: 'Host',
      privatePlayerKey: HOST_TOKEN,
      role: 'host',
      status: hostStatus,
      joinedAt: 1,
    })
    const playerMemberId = await ctx.db.insert('roomMembers', {
      roomId,
      name: 'Player',
      privatePlayerKey: PLAYER_TOKEN,
      role: 'player',
      status: 'active',
      joinedAt: 2,
    })
    const gameId = await ctx.db.insert('games', {
      roomId,
      createdAt: 3,
      ...createInitialGameState(roomId, 3),
      pairRevision: 11,
      winnerRoomMemberId: playerMemberId,
    })
    const participantIds: Id<'gameParticipants'>[] = []

    if (includeHostParticipant) {
      participantIds.push(
        await ctx.db.insert('gameParticipants', {
          gameId,
          roomMemberId: hostMemberId,
          name: 'Host',
          role: 'host',
          position: 0,
          score: 4,
        }),
      )
    }

    participantIds.push(
      await ctx.db.insert('gameParticipants', {
        gameId,
        roomMemberId: playerMemberId,
        name: 'Player',
        role: 'player',
        position: includeHostParticipant ? 1 : 0,
        score: 12,
      }),
    )

    await ctx.db.patch(roomId, {
      phase: 'finished',
      startedAt: 3,
      gameId,
    })

    return {
      roomId,
      gameId,
      memberIds: [hostMemberId, playerMemberId] as const,
      participantIds,
    }
  })
}

async function readSeededState(
  t: ConvexTest,
  seeded: {
    roomId: Id<'rooms'>
    gameId: Id<'games'>
    memberIds: readonly [Id<'roomMembers'>, Id<'roomMembers'>]
    participantIds: readonly Id<'gameParticipants'>[]
  },
) {
  return await t.run(async (ctx) => ({
    room: await ctx.db.get(seeded.roomId),
    game: await ctx.db.get(seeded.gameId),
    members: await Promise.all(
      seeded.memberIds.map(async (memberId) => await ctx.db.get(memberId)),
    ),
    participants: await Promise.all(
      seeded.participantIds.map(
        async (participantId) => await ctx.db.get(participantId),
      ),
    ),
  }))
}
