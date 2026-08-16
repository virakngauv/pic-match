import presenceTest from '@convex-dev/presence/test'
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { evaluateMatchClaim } from './gameClaims'
import {
  createInitialGameState,
  presentFinishedGameState,
  presentPlayingGameState,
} from './gameState'
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
const CLAIM_TIME = 10_000
const COOLDOWN_UNTIL = 11_000

const cards = [
  { symbolIds: ['sun', 'cat', 'moon'] },
  { symbolIds: ['cat', 'star', 'heart'] },
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('match claim evaluation', () => {
  it('accepts the shared symbol from the viewed pair', () => {
    expect(
      evaluateMatchClaim({
        currentRevision: 4,
        viewedRevision: 4,
        cards,
        firstSymbolId: 'cat',
        secondSymbolId: 'cat',
      }),
    ).toEqual({ status: 'accepted' })
  })

  it.each([
    ['different symbols', 'sun', 'star'],
    ['a symbol missing from the first card', 'heart', 'heart'],
    ['a symbol missing from the second card', 'moon', 'moon'],
  ])('rejects %s as incorrect', (_case, firstSymbolId, secondSymbolId) => {
    expect(
      evaluateMatchClaim({
        currentRevision: 4,
        viewedRevision: 4,
        cards,
        firstSymbolId,
        secondSymbolId,
      }),
    ).toEqual({ status: 'incorrect' })
  })

  it('reports a claim for an older pair revision as stale first', () => {
    expect(
      evaluateMatchClaim({
        currentRevision: 5,
        viewedRevision: 4,
        cards,
        firstSymbolId: 'sun',
        secondSymbolId: 'star',
      }),
    ).toEqual({ status: 'stale' })
  })

  it('rejects invalid revision values before classifying a claim', () => {
    expect(() =>
      evaluateMatchClaim({
        currentRevision: 0,
        viewedRevision: -1,
        cards,
        firstSymbolId: 'cat',
        secondSymbolId: 'cat',
      }),
    ).toThrow('The viewed pair revision must be a non-negative integer.')
  })

  it('rejects a fractional revision before classifying a claim', () => {
    expect(() =>
      evaluateMatchClaim({
        currentRevision: 1,
        viewedRevision: 1.5,
        cards,
        firstSymbolId: 'cat',
        secondSymbolId: 'cat',
      }),
    ).toThrow('The viewed pair revision must be a non-negative integer.')
  })

  it('rejects a game without a valid two-card pair', () => {
    expect(() =>
      evaluateMatchClaim({
        currentRevision: 4,
        viewedRevision: 4,
        cards: [{ symbolIds: ['cat'] }],
        firstSymbolId: 'cat',
        secondSymbolId: 'cat',
      }),
    ).toThrow('The current game does not have a valid card pair.')
  })
})

describe('match claim mutation', () => {
  it('awards one point and advances the shared pair for a valid claim', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)

    await expect(
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ).resolves.toEqual({ status: 'accepted' })

    const view = await readPlayingGameState(t, game)
    const host = await readParticipant(t, game.participantIds[0])

    expect(view.pairRevision).toBe(1)
    expect(view.cards).not.toEqual(game.cards)
    expect(view.scoreboard).toEqual([
      expect.objectContaining({ name: 'Host', score: 1 }),
      expect.objectContaining({ name: 'Player', score: 0 }),
    ])
    expect(view.lastAcceptedClaim).toEqual({
      scorerId: game.memberIds[0],
      scorerName: 'Host',
      symbolId: game.sharedSymbolId,
      pairRevision: 0,
    })
    expect(host?.incorrectClaimCooldownUntil).toBeUndefined()
  })

  it('does not mutate scores or the pair for an incorrect claim', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)
    vi.spyOn(Date, 'now').mockReturnValue(CLAIM_TIME)

    await expect(
      t.mutation(api.gameClaims.submit, {
        roomCode: ROOM_CODE,
        clientToken: HOST_TOKEN,
        pairRevision: 0,
        firstSymbolId: game.firstIncorrectSymbolId,
        secondSymbolId: game.secondIncorrectSymbolId,
      }),
    ).resolves.toEqual({
      status: 'incorrect',
      cooldownUntil: COOLDOWN_UNTIL,
    })

    const view = await readPlayingGameState(t, game)
    const host = await readParticipant(t, game.participantIds[0])

    expect(view.pairRevision).toBe(0)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([0, 0])
    expect(host?.incorrectClaimCooldownUntil).toBe(COOLDOWN_UNTIL)
  })

  it('rejects symbols that are not on their submitted cards', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)
    vi.spyOn(Date, 'now').mockReturnValue(CLAIM_TIME)

    await expect(
      submitClaim(t, HOST_TOKEN, 'not-on-either-card'),
    ).resolves.toEqual({
      status: 'incorrect',
      cooldownUntil: COOLDOWN_UNTIL,
    })

    const view = await readPlayingGameState(t, game)

    expect(view.pairRevision).toBe(0)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([0, 0])
  })

  it('rejects bypassed claims during cooldown without extending it', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)
    const now = vi.spyOn(Date, 'now').mockReturnValue(CLAIM_TIME)

    await t.mutation(api.gameClaims.submit, {
      roomCode: ROOM_CODE,
      clientToken: HOST_TOKEN,
      pairRevision: 0,
      firstSymbolId: game.firstIncorrectSymbolId,
      secondSymbolId: game.secondIncorrectSymbolId,
    })
    now.mockReturnValue(CLAIM_TIME + 500)

    await expect(
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ).resolves.toEqual({
      status: 'cooldown',
      cooldownUntil: COOLDOWN_UNTIL,
    })

    const view = await readPlayingGameState(t, game)
    const host = await readParticipant(t, game.participantIds[0])

    expect(view.pairRevision).toBe(0)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([0, 0])
    expect(host?.incorrectClaimCooldownUntil).toBe(COOLDOWN_UNTIL)
  })

  it('keeps another participant active during a local cooldown', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)
    vi.spyOn(Date, 'now').mockReturnValue(CLAIM_TIME)

    await t.mutation(api.gameClaims.submit, {
      roomCode: ROOM_CODE,
      clientToken: HOST_TOKEN,
      pairRevision: 0,
      firstSymbolId: game.firstIncorrectSymbolId,
      secondSymbolId: game.secondIncorrectSymbolId,
    })
    await expect(
      submitClaim(t, PLAYER_TOKEN, game.sharedSymbolId),
    ).resolves.toEqual({ status: 'accepted' })

    const view = await readPlayingGameState(t, game)

    expect(view.pairRevision).toBe(1)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([0, 1])
  })

  it('accepts a claim when the persisted cooldown reaches its deadline', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)
    const now = vi.spyOn(Date, 'now').mockReturnValue(CLAIM_TIME)

    await t.mutation(api.gameClaims.submit, {
      roomCode: ROOM_CODE,
      clientToken: HOST_TOKEN,
      pairRevision: 0,
      firstSymbolId: game.firstIncorrectSymbolId,
      secondSymbolId: game.secondIncorrectSymbolId,
    })
    now.mockReturnValue(COOLDOWN_UNTIL)

    await expect(
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ).resolves.toEqual({ status: 'accepted' })

    const view = await readPlayingGameState(t, game)
    const host = await readParticipant(t, game.participantIds[0])

    expect(view.pairRevision).toBe(1)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([1, 0])
    expect(host?.incorrectClaimCooldownUntil).toBeUndefined()
  })

  it('requires the requester to belong to the frozen participant roster', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)

    await expect(
      submitClaim(t, OUTSIDER_TOKEN, game.sharedSymbolId),
    ).rejects.toThrow('Only active game participants can submit match claims.')

    const view = await readPlayingGameState(t, game)

    expect(view.pairRevision).toBe(0)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([0, 0])
  })

  it('returns stale without another award after the pair advances', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)

    await expect(
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ).resolves.toEqual({ status: 'accepted' })
    await expect(
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ).resolves.toEqual({ status: 'stale' })

    const view = await readPlayingGameState(t, game)
    const host = await readParticipant(t, game.participantIds[0])

    expect(view.pairRevision).toBe(1)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([1, 0])
    expect(host?.incorrectClaimCooldownUntil).toBeUndefined()
  })

  it('awards exactly one concurrent valid claim for a pair revision', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)

    const results = await Promise.all([
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
      submitClaim(t, PLAYER_TOKEN, game.sharedSymbolId),
    ])
    const view = await readPlayingGameState(t, game)

    expect(results.map(({ status }) => status).sort()).toEqual([
      'accepted',
      'stale',
    ])
    expect(view.pairRevision).toBe(1)
    expect(view.scoreboard.map(({ score }) => score).sort()).toEqual([0, 1])
    expect(view.lastAcceptedClaim).not.toBeNull()
    expect([game.memberIds[0], game.memberIds[1]]).toContain(
      view.lastAcceptedClaim?.scorerId,
    )
    expect(view.lastAcceptedClaim?.pairRevision).toBe(0)
  })

  it('records the winner and finishes instead of advancing on point 12', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t, { hostScore: 11 })

    await expect(
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ).resolves.toEqual({ status: 'accepted' })

    const state = await readFinishedGameState(t, game)

    expect(state.phase).toBe('finished')
    expect(state.pairRevision).toBe(0)
    expect(state.winner).toEqual(
      expect.objectContaining({ name: 'Host', score: 12 }),
    )
    expect(state.scoreboard.map(({ score }) => score)).toEqual([12, 0])
  })

  it('rejects claims after the game finishes without changing results', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t, { hostScore: 11 })

    await submitClaim(t, HOST_TOKEN, game.sharedSymbolId)
    await expect(
      submitClaim(t, PLAYER_TOKEN, game.sharedSymbolId),
    ).rejects.toThrow('The game is not accepting match claims.')

    const state = await readFinishedGameState(t, game)

    expect(state.winner.name).toBe('Host')
    expect(state.scoreboard.map(({ score }) => score)).toEqual([12, 0])
  })

  it('creates one winner from concurrent terminal claims', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t, { hostScore: 11, playerScore: 11 })

    const results = await Promise.allSettled([
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
      submitClaim(t, PLAYER_TOKEN, game.sharedSymbolId),
    ])
    const state = await readFinishedGameState(t, game)
    const acceptedResults = results.filter(
      (result) => result.status === 'fulfilled',
    )
    const rejectedResults = results.filter(
      (result) => result.status === 'rejected',
    )

    expect(acceptedResults).toEqual([
      expect.objectContaining({ value: { status: 'accepted' } }),
    ])
    expect(rejectedResults).toHaveLength(1)
    expect(String(rejectedResults[0]?.reason)).toContain(
      'The game is not accepting match claims.',
    )
    expect(state.pairRevision).toBe(0)
    expect(state.scoreboard.map(({ score }) => score).sort()).toEqual([11, 12])
    expect(state.winner.score).toBe(12)
  })
})

describe('playing room departure', () => {
  it.each([
    ['host', HOST_TOKEN, PLAYER_TOKEN, 0],
    ['non-host', PLAYER_TOKEN, HOST_TOKEN, 1],
  ] as const)(
    'marks a %s left without changing the frozen roster or blocking the remaining player',
    async (_role, leavingToken, remainingToken, leavingPosition) => {
      const t = convexTest(schema, modules)
      presenceTest.register(t)
      const game = await seedPlayingGame(t)

      await expect(
        t.mutation(api.rooms.leave, {
          roomCode: ROOM_CODE,
          clientToken: leavingToken,
        }),
      ).resolves.toBeNull()
      await expect(
        t.mutation(api.rooms.leave, {
          roomCode: ROOM_CODE,
          clientToken: leavingToken,
        }),
      ).resolves.toBeNull()

      const afterLeave = await readDepartureState(t, game)
      expect(afterLeave.room).toMatchObject({
        phase: 'playing',
        gameId: game.gameId,
      })
      expect(afterLeave.members[leavingPosition]).toMatchObject({
        status: 'left',
      })
      expect(afterLeave.participants).toEqual([
        expect.objectContaining({ name: 'Host', role: 'host', score: 0 }),
        expect.objectContaining({ name: 'Player', role: 'player', score: 0 }),
      ])

      await expect(
        submitClaim(t, remainingToken, game.sharedSymbolId),
      ).resolves.toEqual({ status: 'accepted' })

      const afterClaim = await readDepartureState(t, game)
      expect(afterClaim.game).toMatchObject({ pairRevision: 1 })
      expect(
        afterClaim.participants.reduce(
          (total, participant) => total + (participant?.score ?? 0),
          0,
        ),
      ).toBe(1)
    },
  )

  it('serializes a leave racing with the departing participant claim', async () => {
    const t = convexTest(schema, modules)
    presenceTest.register(t)
    const game = await seedPlayingGame(t)

    const [leaveResult, claimResult] = await Promise.allSettled([
      t.mutation(api.rooms.leave, {
        roomCode: ROOM_CODE,
        clientToken: HOST_TOKEN,
      }),
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ])

    expect(leaveResult).toEqual(
      expect.objectContaining({ status: 'fulfilled', value: null }),
    )
    const state = await readDepartureState(t, game)
    expect(state.members[0]).toMatchObject({ status: 'left', role: 'host' })
    expect(state.room).toMatchObject({ phase: 'playing' })
    expect(state.participants).toHaveLength(2)

    if (claimResult.status === 'fulfilled') {
      expect(claimResult.value).toEqual({ status: 'accepted' })
      expect(state.game).toMatchObject({ pairRevision: 1 })
      expect(state.participants[0]).toMatchObject({ score: 1 })
    } else {
      expect(String(claimResult.reason)).toContain(
        'Only active game participants can submit match claims.',
      )
      expect(state.game).toMatchObject({ pairRevision: 0 })
      expect(state.participants[0]).toMatchObject({ score: 0 })
    }

    await expect(
      submitClaim(t, HOST_TOKEN, game.sharedSymbolId),
    ).rejects.toThrow('Only active game participants can submit match claims.')
  })
})

type ConvexTest = ReturnType<typeof convexTest>

/** Creates a playing room with two frozen participants and one outsider. */
async function seedPlayingGame(
  t: ConvexTest,
  {
    hostScore = 0,
    playerScore = 0,
  }: { hostScore?: number; playerScore?: number } = {},
) {
  return await t.run(async (ctx) => {
    const roomId = await ctx.db.insert('rooms', {
      code: ROOM_CODE,
      creatorName: 'Host',
      createdAt: 1,
      phase: 'lobby',
    })
    const initialGameState = createInitialGameState(roomId, 2)
    const gameId = await ctx.db.insert('games', {
      roomId,
      createdAt: 2,
      ...initialGameState,
    })
    const hostMemberId = await ctx.db.insert('roomMembers', {
      roomId,
      name: 'Host',
      privatePlayerKey: HOST_TOKEN,
      role: 'host',
      status: 'active',
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

    await ctx.db.insert('roomMembers', {
      roomId,
      name: 'Outsider',
      privatePlayerKey: OUTSIDER_TOKEN,
      role: 'player',
      status: 'active',
      joinedAt: 3,
    })
    const hostParticipantId = await ctx.db.insert('gameParticipants', {
      gameId,
      roomMemberId: hostMemberId,
      name: 'Host',
      role: 'host',
      position: 0,
      score: hostScore,
    })
    const playerParticipantId = await ctx.db.insert('gameParticipants', {
      gameId,
      roomMemberId: playerMemberId,
      name: 'Player',
      role: 'player',
      position: 1,
      score: playerScore,
    })
    await ctx.db.patch(roomId, {
      phase: 'playing',
      startedAt: 2,
      gameId,
    })

    const view = presentPlayingGameState(initialGameState, [])
    const firstCard = view.cards[0]
    const secondCard = view.cards[1]

    if (!firstCard || !secondCard) {
      throw new Error('The seeded game did not produce two cards.')
    }

    const sharedSymbolId = firstCard.symbolIds.find((symbolId) =>
      secondCard.symbolIds.includes(symbolId),
    )
    const firstIncorrectSymbolId = firstCard.symbolIds.find(
      (symbolId) => symbolId !== sharedSymbolId,
    )
    const secondIncorrectSymbolId = secondCard.symbolIds.find(
      (symbolId) => symbolId !== sharedSymbolId,
    )

    if (
      !sharedSymbolId ||
      !firstIncorrectSymbolId ||
      !secondIncorrectSymbolId
    ) {
      throw new Error('The seeded cards did not produce testable symbols.')
    }

    return {
      roomId,
      gameId,
      memberIds: [hostMemberId, playerMemberId] as const,
      participantIds: [hostParticipantId, playerParticipantId] as const,
      cards: view.cards,
      sharedSymbolId,
      firstIncorrectSymbolId,
      secondIncorrectSymbolId,
    }
  })
}

async function readDepartureState(
  t: ConvexTest,
  game: {
    roomId: Id<'rooms'>
    gameId: Id<'games'>
    memberIds: readonly [Id<'roomMembers'>, Id<'roomMembers'>]
    participantIds: readonly [Id<'gameParticipants'>, Id<'gameParticipants'>]
  },
) {
  return await t.run(async (ctx) => ({
    room: await ctx.db.get(game.roomId),
    game: await ctx.db.get(game.gameId),
    members: await Promise.all(
      game.memberIds.map(async (memberId) => await ctx.db.get(memberId)),
    ),
    participants: await Promise.all(
      game.participantIds.map(
        async (participantId) => await ctx.db.get(participantId),
      ),
    ),
  }))
}

/** Sends a same-symbol claim for the first seeded pair revision. */
async function submitClaim(
  t: ConvexTest,
  clientToken: string,
  symbolId: string,
) {
  return await t.mutation(api.gameClaims.submit, {
    roomCode: ROOM_CODE,
    clientToken,
    pairRevision: 0,
    firstSymbolId: symbolId,
    secondSymbolId: symbolId,
  })
}

/** Reads the server-derived game view produced from persisted state. */
async function readPlayingGameState(
  t: ConvexTest,
  game: {
    gameId: Id<'games'>
    participantIds: readonly [Id<'gameParticipants'>, Id<'gameParticipants'>]
  },
) {
  return await t.run(async (ctx) => {
    const storedGame = await ctx.db.get(game.gameId)
    const participants = await Promise.all(
      game.participantIds.map(
        async (participantId) => await ctx.db.get(participantId),
      ),
    )

    if (!storedGame || participants.some((participant) => !participant)) {
      throw new Error('Unable to read the seeded game state.')
    }

    return presentPlayingGameState(
      storedGame,
      participants.filter((participant) => participant !== null),
    )
  })
}

/** Reads one frozen participant to assert private persisted claim state. */
async function readParticipant(
  t: ConvexTest,
  participantId: Id<'gameParticipants'>,
) {
  return await t.run(async (ctx) => await ctx.db.get(participantId))
}

/** Reads the persisted terminal state and its server-derived result view. */
async function readFinishedGameState(
  t: ConvexTest,
  game: {
    roomId: Id<'rooms'>
    gameId: Id<'games'>
    participantIds: readonly [Id<'gameParticipants'>, Id<'gameParticipants'>]
  },
) {
  return await t.run(async (ctx) => {
    const room = await ctx.db.get(game.roomId)
    const storedGame = await ctx.db.get(game.gameId)
    const participants = await Promise.all(
      game.participantIds.map(
        async (participantId) => await ctx.db.get(participantId),
      ),
    )

    if (
      !room ||
      !storedGame ||
      participants.some((participant) => !participant)
    ) {
      throw new Error('Unable to read the seeded finished game state.')
    }

    return {
      phase: room.phase,
      pairRevision: storedGame.pairRevision,
      ...presentFinishedGameState(
        storedGame,
        participants.filter((participant) => participant !== null),
      ),
    }
  })
}
