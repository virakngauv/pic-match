import { describe, expect, it } from 'vitest'

import {
  assertSupportedParticipantCount,
  FIRST_PLAYABLE_CONFIGURATION,
  FIRST_PLAYABLE_SYMBOL_IDS,
  generatePicMatchDeck,
  generateTwoCardMatchup,
  getMaximumAcceptedClaims,
  type PicMatchConfiguration,
} from './pic-match'

const SEED = 'first-playable-round'

describe('first playable Pic Match configuration', () => {
  it('defines eight symbols per card, 57 symbols, 64 players, and 12 points', () => {
    expect(FIRST_PLAYABLE_CONFIGURATION).toMatchObject({
      order: 7,
      symbolsPerCard: 8,
      participantCapacity: 64,
      winningScore: 12,
    })
    expect(FIRST_PLAYABLE_SYMBOL_IDS).toHaveLength(57)
    expect(new Set(FIRST_PLAYABLE_SYMBOL_IDS)).toHaveLength(57)
  })

  it('accepts the full supported participant range', () => {
    expect(() => assertSupportedParticipantCount(1)).not.toThrow()
    expect(() => assertSupportedParticipantCount(2)).not.toThrow()
    expect(() => assertSupportedParticipantCount(64)).not.toThrow()
  })

  it.each([0, 65, 2.5])(
    'rejects unsupported participant count %s',
    (participantCount) => {
      expect(() => assertSupportedParticipantCount(participantCount)).toThrow()
    },
  )

  it('covers the worst-case first-to-12 game within one pair cycle', () => {
    expect(getMaximumAcceptedClaims()).toBe(705)
    expect((57 * 56) / 2).toBeGreaterThan(getMaximumAcceptedClaims())
  })
})

describe('generatePicMatchDeck', () => {
  it('returns the same ordered deck for the same configuration and seed', () => {
    expect(generatePicMatchDeck(FIRST_PLAYABLE_CONFIGURATION, SEED)).toEqual(
      generatePicMatchDeck(FIRST_PLAYABLE_CONFIGURATION, SEED),
    )
  })

  it('uses the seed to change the ordered deck', () => {
    const firstDeck = generatePicMatchDeck(FIRST_PLAYABLE_CONFIGURATION, SEED)
    const secondDeck = generatePicMatchDeck(
      FIRST_PLAYABLE_CONFIGURATION,
      'another-seed',
    )

    expect(firstDeck.cards.map((card) => card.id)).not.toEqual(
      secondDeck.cards.map((card) => card.id),
    )
  })

  it('generates 57 cards with eight distinct symbols each', () => {
    const deck = generatePicMatchDeck(FIRST_PLAYABLE_CONFIGURATION, SEED)

    expect(deck.cards).toHaveLength(57)
    for (const card of deck.cards) {
      expect(card.symbolIds).toHaveLength(8)
      expect(new Set(card.symbolIds)).toHaveLength(8)
    }
  })

  it('makes every pair of distinct cards share exactly one symbol', () => {
    const deck = generatePicMatchDeck(FIRST_PLAYABLE_CONFIGURATION, SEED)

    for (let leftIndex = 0; leftIndex < deck.cards.length - 1; leftIndex += 1) {
      const leftCard = deck.cards[leftIndex]
      expect(leftCard).toBeDefined()

      for (
        let rightIndex = leftIndex + 1;
        rightIndex < deck.cards.length;
        rightIndex += 1
      ) {
        const rightCard = deck.cards[rightIndex]
        expect(rightCard).toBeDefined()

        const sharedSymbols = leftCard?.symbolIds.filter((symbolId) =>
          rightCard?.symbolIds.includes(symbolId),
        )
        expect(sharedSymbols).toHaveLength(1)
      }
    }
  })

  it.each([
    ['empty seed', FIRST_PLAYABLE_CONFIGURATION, ''],
    ['unsupported order', { ...FIRST_PLAYABLE_CONFIGURATION, order: 5 }, SEED],
    [
      'unsupported symbols per card',
      { ...FIRST_PLAYABLE_CONFIGURATION, symbolsPerCard: 7 },
      SEED,
    ],
    [
      'unsupported participant capacity',
      { ...FIRST_PLAYABLE_CONFIGURATION, participantCapacity: 63 },
      SEED,
    ],
    [
      'unsupported winning score',
      { ...FIRST_PLAYABLE_CONFIGURATION, winningScore: 10 },
      SEED,
    ],
    [
      'short symbol set',
      {
        ...FIRST_PLAYABLE_CONFIGURATION,
        symbolIds: FIRST_PLAYABLE_SYMBOL_IDS.slice(1),
      },
      SEED,
    ],
    [
      'duplicate symbol',
      {
        ...FIRST_PLAYABLE_CONFIGURATION,
        symbolIds: FIRST_PLAYABLE_SYMBOL_IDS.map((symbolId, index) =>
          index === 1 ? FIRST_PLAYABLE_SYMBOL_IDS[0] : symbolId,
        ),
      },
      SEED,
    ],
    [
      'empty symbol',
      {
        ...FIRST_PLAYABLE_CONFIGURATION,
        symbolIds: FIRST_PLAYABLE_SYMBOL_IDS.map((symbolId, index) =>
          index === 0 ? ' ' : symbolId,
        ),
      },
      SEED,
    ],
  ] satisfies Array<[string, PicMatchConfiguration, string]>)(
    'rejects an invalid configuration: %s',
    (_name, configuration, seed) => {
      expect(() => generatePicMatchDeck(configuration, seed)).toThrow()
    },
  )
})

describe('generateTwoCardMatchup', () => {
  it('returns the same pair for the same seed and revision', () => {
    expect(
      generateTwoCardMatchup(FIRST_PLAYABLE_CONFIGURATION, SEED, 42),
    ).toEqual(generateTwoCardMatchup(FIRST_PLAYABLE_CONFIGURATION, SEED, 42))
  })

  it.each([0, 1, 704, 1595, 1596, 10_000])(
    'returns a valid pair at revision %s',
    (revision) => {
      const matchup = generateTwoCardMatchup(
        FIRST_PLAYABLE_CONFIGURATION,
        SEED,
        revision,
      )
      const [leftCard, rightCard] = matchup.cards
      const sharedSymbols = leftCard.symbolIds.filter((symbolId) =>
        rightCard.symbolIds.includes(symbolId),
      )

      expect(leftCard.id).not.toBe(rightCard.id)
      expect(sharedSymbols).toHaveLength(1)
      expect(matchup.revision).toBe(revision)
    },
  )

  it('does not repeat a card pair during the longest possible MVP game', () => {
    const pairs = Array.from(
      { length: getMaximumAcceptedClaims() },
      (_, revision) => {
        const matchup = generateTwoCardMatchup(
          FIRST_PLAYABLE_CONFIGURATION,
          SEED,
          revision,
        )

        return matchup.cards
          .map((card) => card.id)
          .sort((left, right) => left.localeCompare(right))
          .join(':')
      },
    )

    expect(new Set(pairs)).toHaveLength(pairs.length)
  })

  it.each([-1, 1.5])('rejects invalid revision %s', (revision) => {
    expect(() =>
      generateTwoCardMatchup(FIRST_PLAYABLE_CONFIGURATION, SEED, revision),
    ).toThrow()
  })
})
