import { describe, expect, it } from 'vitest'

import {
  SOLO_CHALLENGE,
  answerSolo,
  createSoloSeed,
  formatSoloShareText,
  getSoloPair,
  getSoloStage,
  parseSoloScore,
  parseSoloScoreParam,
  startSoloState,
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

  it('starts playing immediately with the full clock', () => {
    const state = startSoloState(seed, 1_000)
    expect(state.status).toBe('playing')
    expect(state.remainingMs).toBe(SOLO_CHALLENGE.initialTimeMs)
    expect(state.lastUpdatedAt).toBe(1_000)
    expect(tickSolo(state, 1_500).remainingMs).toBe(
      SOLO_CHALLENGE.initialTimeMs - 500,
    )
  })

  it('scores either card, rewards time, and advances after feedback', () => {
    const first = answerSolo(startSoloState(seed, 1_000), shared(), 1_000)
    expect(first.status).toBe('playing')
    expect(first.announcement).toBe('')
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
    const first = answerSolo(startSoloState(seed, 0), wrong, 100)
    expect(first.remainingMs).toBe(27_900)
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
    const answered = answerSolo(startSoloState(seed, 0), shared(), 0)
    expect(answered.remainingMs).toBe(31_000)
    expect(tickSolo(answered, 31_000).status).toBe('finished')
  })

  it('uses the entering score for a difficulty step after success feedback', () => {
    const ready = {
      ...startSoloState(seed, 0),
      score: 3,
      pairIndex: 3,
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

  it('parses versioned scores', () => {
    expect(
      parseSoloScore('{"version":1,"bestScore":23,"lastScore":7}'),
    ).toEqual({ bestScore: 23, lastScore: 7 })
    expect(parseSoloScore('{"version":2,"bestScore":99}').bestScore).toBe(0)
    expect(parseSoloScore('{"version":1,"bestScore":-1}').bestScore).toBe(0)
    expect(parseSoloScore('broken').bestScore).toBe(0)
  })

  it('parses result scores strictly', () => {
    expect(parseSoloScoreParam('0')).toBe(0)
    expect(parseSoloScoreParam('23')).toBe(23)
    expect(parseSoloScoreParam('-1')).toBeNull()
    expect(parseSoloScoreParam('007')).toBeNull()
    expect(parseSoloScoreParam('abc')).toBeNull()
    expect(parseSoloScoreParam(undefined)).toBeNull()
    expect(parseSoloScoreParam('12345678901234567')).toBeNull()
  })

  it('creates hex seeds and formats the share text', () => {
    expect(createSoloSeed()).toMatch(/^[0-9a-f]{24}$/)
    expect(formatSoloShareText(23, 'https://pic.match/solo')).toBe(
      'I matched 23 pairs in Pic Match Solo. Can you beat me? https://pic.match/solo',
    )
    expect(formatSoloShareText(1, 'https://pic.match/solo')).toBe(
      'I matched 1 pair in Pic Match Solo. Can you beat me? https://pic.match/solo',
    )
  })
})
