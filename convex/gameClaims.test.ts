import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { evaluateMatchClaim } from './gameClaims'
import { createInitialGameState, presentPlayingGameState } from './gameState'
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

const cards = [
  { symbolIds: ['sun', 'cat', 'moon'] },
  { symbolIds: ['cat', 'star', 'heart'] },
]

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

    expect(view.pairRevision).toBe(1)
    expect(view.cards).not.toEqual(game.cards)
    expect(view.scoreboard).toEqual([
      expect.objectContaining({ name: 'Host', score: 1 }),
      expect.objectContaining({ name: 'Player', score: 0 }),
    ])
  })

  it('does not mutate scores or the pair for an incorrect claim', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)

    await expect(
      t.mutation(api.gameClaims.submit, {
        roomCode: ROOM_CODE,
        clientToken: HOST_TOKEN,
        pairRevision: 0,
        firstSymbolId: game.firstIncorrectSymbolId,
        secondSymbolId: game.secondIncorrectSymbolId,
      }),
    ).resolves.toEqual({ status: 'incorrect' })

    const view = await readPlayingGameState(t, game)

    expect(view.pairRevision).toBe(0)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([0, 0])
  })

  it('rejects symbols that are not on their submitted cards', async () => {
    const t = convexTest(schema, modules)
    const game = await seedPlayingGame(t)

    await expect(
      submitClaim(t, HOST_TOKEN, 'not-on-either-card'),
    ).resolves.toEqual({ status: 'incorrect' })

    const view = await readPlayingGameState(t, game)

    expect(view.pairRevision).toBe(0)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([0, 0])
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

    expect(view.pairRevision).toBe(1)
    expect(view.scoreboard.map(({ score }) => score)).toEqual([1, 0])
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
  })
})

type ConvexTest = ReturnType<typeof convexTest>

/** Creates a playing room with two frozen participants and one outsider. */
async function seedPlayingGame(t: ConvexTest) {
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
      score: 0,
    })
    const playerParticipantId = await ctx.db.insert('gameParticipants', {
      gameId,
      roomMemberId: playerMemberId,
      name: 'Player',
      role: 'player',
      position: 1,
      score: 0,
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
      gameId,
      participantIds: [hostParticipantId, playerParticipantId] as const,
      cards: view.cards,
      sharedSymbolId,
      firstIncorrectSymbolId,
      secondIncorrectSymbolId,
    }
  })
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
