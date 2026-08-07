import { describe, expect, it } from 'vitest'

import type { Doc, Id } from './_generated/dataModel'
import { createInitialGameState, presentPlayingGameState } from './gameState'

function participant({
  id,
  name,
  position,
}: {
  id: string
  name: string
  position: number
}): Doc<'gameParticipants'> {
  return {
    _id: `game-${id}` as Id<'gameParticipants'>,
    _creationTime: position,
    gameId: 'game-1' as Id<'games'>,
    roomMemberId: id as Id<'roomMembers'>,
    name,
    role: position === 0 ? 'host' : 'player',
    position,
    score: 0,
  }
}

describe('persisted game state', () => {
  it('creates an explicit deterministic first-pair state', () => {
    expect(createInitialGameState('room-1' as Id<'rooms'>, 123)).toEqual({
      configurationId: 'first-playable-v1',
      seed: 'first-playable-v1:room-1:123',
      pairRevision: 0,
    })
  })

  it('returns the same public pair and zeroed scoreboard to every participant', () => {
    const game = createInitialGameState('room-1' as Id<'rooms'>, 123)
    const participants = [
      participant({ id: 'member-2', name: 'Second', position: 1 }),
      participant({ id: 'member-1', name: 'First', position: 0 }),
    ]

    const firstView = presentPlayingGameState(game, participants)
    const secondView = presentPlayingGameState(game, participants)

    expect(secondView).toEqual(firstView)
    expect(firstView.pairRevision).toBe(0)
    expect(firstView.cards).toHaveLength(2)
    expect(
      firstView.cards[0]?.symbolIds.filter((symbolId) =>
        firstView.cards[1]?.symbolIds.includes(symbolId),
      ),
    ).toHaveLength(1)
    expect(firstView.scoreboard).toEqual([
      {
        playerId: 'member-1',
        name: 'First',
        role: 'host',
        position: 0,
        score: 0,
      },
      {
        playerId: 'member-2',
        name: 'Second',
        role: 'player',
        position: 1,
        score: 0,
      },
    ])
  })

  it('reconstructs the current pair and scores after reconnecting', () => {
    const persistedGame = {
      ...createInitialGameState('room-1' as Id<'rooms'>, 123),
      pairRevision: 42,
    }
    const persistedParticipants = [
      {
        ...participant({ id: 'member-1', name: 'First', position: 0 }),
        score: 3,
      },
      {
        ...participant({ id: 'member-2', name: 'Second', position: 1 }),
        score: 7,
      },
    ]

    const beforeReconnect = presentPlayingGameState(
      persistedGame,
      persistedParticipants,
    )
    const afterReconnect = presentPlayingGameState(
      { ...persistedGame },
      persistedParticipants.map((entry) => ({ ...entry })),
    )

    expect(afterReconnect).toEqual(beforeReconnect)
    expect(afterReconnect.pairRevision).toBe(42)
    expect(afterReconnect.scoreboard.map(({ score }) => score)).toEqual([3, 7])
  })
})
