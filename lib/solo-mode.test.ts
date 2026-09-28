import { describe, expect, it } from 'vitest'

import {
  SOLO_CHALLENGE,
  answerSolo,
  createSoloState,
  getSoloPair,
  getSoloStage,
  parseSoloChallenge,
  parseSoloScore,
  tickSolo,
} from './solo-mode'

const seed = 'fixed-challenge'

function shared(index = 0, score = index) {
  const [left, right] = getSoloPair(seed, index, score).cards
  return left.symbolIds.find((symbol) => right.symbolIds.includes(symbol))!
}

describe('solo challenge', () => {
  it.each([
    [0, 3],
    [3, 3],
    [4, 4],
    [8, 4],
    [9, 6],
    [17, 6],
    [18, 8],
  ])('uses %s points for %s symbols', (score, count) => {
    expect(getSoloStage(score).symbolsPerCard).toBe(count)
  })

  it('reproduces seeded pairs across every difficulty', () => {
    for (const score of [0, 4, 9, 18, 100]) {
      expect(getSoloPair(seed, score, score)).toEqual(
        getSoloPair(seed, score, score),
      )
      expect(getSoloPair(seed, score, score).cards[0].symbolIds).toHaveLength(
        getSoloStage(score).symbolsPerCard,
      )
    }
  })

  it('starts on the first tap, scores either card, rewards time, and advances after feedback', () => {
    const first = answerSolo(createSoloState(seed), shared(), 1_000)
    expect(first.status).toBe('playing')
    expect(first.announcement).toBe('Timer started.')
    expect(first.score).toBe(1)
    expect(first.remainingMs).toBe(SOLO_CHALLENGE.initialTimeMs + 1_000)
    expect(first.pairIndex).toBe(0)
    expect(tickSolo(first, 1_220).pairIndex).toBe(1)

    const secondPair = getSoloPair(seed, 1, 1)
    const fromRight = secondPair.cards[1].symbolIds.find((symbol) =>
      secondPair.cards[0].symbolIds.includes(symbol),
    )!
    expect(answerSolo(tickSolo(first, 1_220), fromRight, 1_220).score).toBe(2)
  })

  it('penalizes a wrong answer without advancing and clamps at zero', () => {
    const pair = getSoloPair(seed, 0, 0)
    const wrong = pair.cards[0].symbolIds.find(
      (symbol) => !pair.cards[1].symbolIds.includes(symbol),
    )!
    const first = answerSolo(createSoloState(seed), wrong, 100)
    expect(first.remainingMs).toBe(28_000)
    expect(first.pairIndex).toBe(0)
    const nearEnd = {
      ...first,
      remainingMs: 500,
      lastUpdatedAt: 500,
      feedback: null,
    }
    const finished = answerSolo(nearEnd, wrong, 500)
    expect(finished.remainingMs).toBe(0)
    expect(finished.status).toBe('finished')
    expect(answerSolo(finished, shared(), 501).score).toBe(0)
  })

  it('does not cap correct rewards at 30 seconds and ends on elapsed time', () => {
    const answered = answerSolo(createSoloState(seed), shared(), 0)
    expect(answered.remainingMs).toBe(31_000)
    expect(tickSolo(answered, 31_000).status).toBe('finished')
  })

  it('uses the entering score for a difficulty step after success feedback', () => {
    const ready = {
      ...createSoloState(seed),
      status: 'playing' as const,
      score: 3,
      pairIndex: 3,
      lastUpdatedAt: 0,
    }
    const answered = answerSolo(ready, shared(3, 3), 0)
    expect(answered.score).toBe(4)
    expect(answered.announcement).toBe('Level up: 4 symbols per card.')
    expect(answered.pairIndex).toBe(3)
    expect(
      getSoloPair(seed, answered.pairIndex, answered.pairIndex).cards[0]
        .symbolIds,
    ).toHaveLength(3)
    const advanced = tickSolo(answered, SOLO_CHALLENGE.successFeedbackMs)
    expect(
      getSoloPair(seed, advanced.pairIndex, advanced.pairIndex).cards[0]
        .symbolIds,
    ).toHaveLength(4)
  })

  it('parses versioned scores and untrusted challenge parameters', () => {
    expect(
      parseSoloScore('{"version":1,"bestScore":23,"lastScore":7}'),
    ).toEqual({ bestScore: 23, lastScore: 7 })
    expect(parseSoloScore('{"version":2,"bestScore":99}').bestScore).toBe(0)
    expect(parseSoloScore('{"version":1,"bestScore":-1}').bestScore).toBe(0)
    expect(parseSoloScore('broken').bestScore).toBe(0)
    expect(parseSoloChallenge(seed, '23')).toEqual({ seed, target: 23 })
    expect(parseSoloChallenge('<script>', '23')).toEqual({
      seed: null,
      target: null,
    })
  })
})
