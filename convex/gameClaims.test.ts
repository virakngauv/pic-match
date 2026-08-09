import { describe, expect, it } from 'vitest'

import { evaluateMatchClaim } from './gameClaims'

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
