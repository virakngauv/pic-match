export const FIRST_PLAYABLE_SYMBOL_IDS = [
  'sun',
  'moon',
  'star',
  'heart',
  'lightning',
  'snowflake',
  'fire',
  'water-drop',
  'tree',
  'flower',
  'leaf',
  'apple',
  'cherry',
  'lemon',
  'watermelon',
  'carrot',
  'mushroom',
  'ladybug',
  'butterfly',
  'bee',
  'fish',
  'turtle',
  'bird',
  'cat',
  'dog',
  'rabbit',
  'frog',
  'octopus',
  'whale',
  'crab',
  'anchor',
  'sailboat',
  'airplane',
  'car',
  'bicycle',
  'rocket',
  'house',
  'key',
  'crown',
  'diamond',
  'bell',
  'clock',
  'camera',
  'music-note',
  'umbrella',
  'glasses',
  'scissors',
  'pencil',
  'book',
  'lightbulb',
  'magnet',
  'balloon',
  'gift',
  'soccer-ball',
  'dice',
  'ghost',
  'smile',
] as const

const SUPPORTED_ORDER = 7
const SUPPORTED_SYMBOLS_PER_CARD = SUPPORTED_ORDER + 1
const SUPPORTED_CARD_COUNT =
  SUPPORTED_ORDER * SUPPORTED_ORDER + SUPPORTED_ORDER + 1
const SUPPORTED_PARTICIPANT_CAPACITY = 64
const SUPPORTED_WINNING_SCORE = 12
const MIN_PARTICIPANTS = 2

export type SpotItConfiguration = Readonly<{
  order: number
  symbolsPerCard: number
  participantCapacity: number
  winningScore: number
  symbolIds: readonly string[]
}>

export const FIRST_PLAYABLE_CONFIGURATION = {
  order: SUPPORTED_ORDER,
  symbolsPerCard: SUPPORTED_SYMBOLS_PER_CARD,
  participantCapacity: SUPPORTED_PARTICIPANT_CAPACITY,
  winningScore: SUPPORTED_WINNING_SCORE,
  symbolIds: FIRST_PLAYABLE_SYMBOL_IDS,
} as const satisfies SpotItConfiguration

export type SpotItCard = Readonly<{
  id: string
  symbolIds: readonly string[]
}>

export type SpotItDeck = Readonly<{
  seed: string
  cards: readonly SpotItCard[]
}>

export type TwoCardMatchup = Readonly<{
  id: string
  revision: number
  cards: readonly [SpotItCard, SpotItCard]
}>

export function generateSpotItDeck(
  configuration: SpotItConfiguration,
  seed: string,
): SpotItDeck {
  validateConfiguration(configuration)
  validateSeed(seed)

  const cards = buildCanonicalCards(configuration).map((symbolIds, index) =>
    Object.freeze({
      id: `card-${index.toString().padStart(2, '0')}`,
      symbolIds: Object.freeze(symbolIds),
    }),
  )

  return Object.freeze({
    seed,
    cards: Object.freeze(shuffle(cards, `${seed}:deck`)),
  })
}

export function generateTwoCardMatchup(
  configuration: SpotItConfiguration,
  seed: string,
  revision: number,
): TwoCardMatchup {
  assertNonNegativeInteger(revision, 'Matchup revision')

  const deck = generateSpotItDeck(configuration, seed)
  const pairsPerCycle = (deck.cards.length * (deck.cards.length - 1)) / 2
  const cycle = Math.floor(revision / pairsPerCycle)
  const indexWithinCycle = revision % pairsPerCycle
  const pairIndexes = shuffle(
    buildPairIndexes(deck.cards.length),
    `${seed}:pair-cycle:${cycle}`,
  )[indexWithinCycle]

  if (!pairIndexes) {
    throw new Error('Unable to resolve the requested two-card matchup.')
  }

  const leftCard = deck.cards[pairIndexes[0]]
  const rightCard = deck.cards[pairIndexes[1]]

  if (!leftCard || !rightCard) {
    throw new Error('The generated matchup references a missing card.')
  }

  return Object.freeze({
    id: `matchup-${revision}`,
    revision,
    cards: Object.freeze([leftCard, rightCard]) as readonly [
      SpotItCard,
      SpotItCard,
    ],
  })
}

export function assertSupportedParticipantCount(
  participantCount: number,
  configuration: SpotItConfiguration = FIRST_PLAYABLE_CONFIGURATION,
): void {
  validateConfiguration(configuration)
  assertInteger(participantCount, 'Participant count')

  if (
    participantCount < MIN_PARTICIPANTS ||
    participantCount > configuration.participantCapacity
  ) {
    throw new Error(
      `Participant count must be between ${MIN_PARTICIPANTS} and ${configuration.participantCapacity}.`,
    )
  }
}

export function getMaximumAcceptedClaims(
  configuration: SpotItConfiguration = FIRST_PLAYABLE_CONFIGURATION,
): number {
  validateConfiguration(configuration)

  return (
    configuration.participantCapacity * (configuration.winningScore - 1) + 1
  )
}

function validateConfiguration(configuration: SpotItConfiguration): void {
  if (configuration.order !== SUPPORTED_ORDER) {
    throw new Error(
      `Unsupported card order: expected ${SUPPORTED_ORDER}, received ${configuration.order}.`,
    )
  }

  if (configuration.symbolsPerCard !== SUPPORTED_SYMBOLS_PER_CARD) {
    throw new Error(
      `Unsupported symbols per card: expected ${SUPPORTED_SYMBOLS_PER_CARD}, received ${configuration.symbolsPerCard}.`,
    )
  }

  if (
    !Number.isInteger(configuration.participantCapacity) ||
    configuration.participantCapacity !== SUPPORTED_PARTICIPANT_CAPACITY
  ) {
    throw new Error(
      `Unsupported participant capacity: expected ${SUPPORTED_PARTICIPANT_CAPACITY}, received ${configuration.participantCapacity}.`,
    )
  }

  if (
    !Number.isInteger(configuration.winningScore) ||
    configuration.winningScore !== SUPPORTED_WINNING_SCORE
  ) {
    throw new Error(
      `Unsupported winning score: expected ${SUPPORTED_WINNING_SCORE}, received ${configuration.winningScore}.`,
    )
  }

  if (configuration.symbolIds.length !== SUPPORTED_CARD_COUNT) {
    throw new Error(
      `Symbol set must contain exactly ${SUPPORTED_CARD_COUNT} identifiers.`,
    )
  }

  if (
    configuration.symbolIds.some((symbolId) => symbolId.trim().length === 0)
  ) {
    throw new Error('Symbol identifiers must not be empty.')
  }

  if (
    new Set(configuration.symbolIds).size !== configuration.symbolIds.length
  ) {
    throw new Error('Symbol identifiers must be unique.')
  }
}

function validateSeed(seed: string): void {
  if (seed.trim().length === 0) {
    throw new Error('Seed must not be empty.')
  }
}

function buildCanonicalCards(configuration: SpotItConfiguration): string[][] {
  const { order, symbolIds } = configuration
  const cards: string[][] = []

  for (let slope = 0; slope < order; slope += 1) {
    for (let intercept = 0; intercept < order; intercept += 1) {
      const card: string[] = []

      for (let x = 0; x < order; x += 1) {
        const y = (slope * x + intercept) % order
        card.push(getSymbolId(symbolIds, x * order + y))
      }

      card.push(getSymbolId(symbolIds, order * order + slope))
      cards.push(card)
    }
  }

  for (let x = 0; x < order; x += 1) {
    const card: string[] = []

    for (let y = 0; y < order; y += 1) {
      card.push(getSymbolId(symbolIds, x * order + y))
    }

    card.push(getSymbolId(symbolIds, order * order + order))
    cards.push(card)
  }

  cards.push(
    Array.from({ length: order + 1 }, (_, offset) =>
      getSymbolId(symbolIds, order * order + offset),
    ),
  )

  return cards
}

function getSymbolId(symbolIds: readonly string[], index: number): string {
  const symbolId = symbolIds[index]

  if (!symbolId) {
    throw new Error(`Missing symbol identifier at index ${index}.`)
  }

  return symbolId
}

function buildPairIndexes(cardCount: number): Array<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = []

  for (let leftIndex = 0; leftIndex < cardCount - 1; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < cardCount;
      rightIndex += 1
    ) {
      pairs.push([leftIndex, rightIndex])
    }
  }

  return pairs
}

function shuffle<T>(values: readonly T[], seed: string): T[] {
  const shuffled = [...values]
  const random = createSeededRandom(seed)

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    const replacement = shuffled[swapIndex]

    if (current === undefined || replacement === undefined) {
      throw new Error('Unable to shuffle an incomplete collection.')
    }

    shuffled[index] = replacement
    shuffled[swapIndex] = current
  }

  return shuffled
}

function createSeededRandom(seed: string): () => number {
  let state = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`)
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  assertInteger(value, label)

  if (value < 0) {
    throw new Error(`${label} must be zero or greater.`)
  }
}
