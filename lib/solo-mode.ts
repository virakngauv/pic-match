import {
  FIRST_PLAYABLE_SYMBOL_IDS,
  generateTwoCardMatchup,
  type TwoCardMatchup,
} from './pic-match'

export const SOLO_CHALLENGE = {
  initialTimeMs: 30_000,
  correctBonusMs: 2_000,
  incorrectPenaltyMs: 3_000,
  successFeedbackMs: 220,
  incorrectFeedbackMs: 400,
  stages: [
    { score: 0, order: 2, symbolsPerCard: 3 },
    { score: 4, order: 3, symbolsPerCard: 4 },
    { score: 9, order: 5, symbolsPerCard: 6 },
    { score: 18, order: 7, symbolsPerCard: 8 },
  ],
} as const

export const SOLO_STORAGE_KEY = 'pic-match:solo:v1'

export type SoloState = Readonly<{
  seed: string
  score: number
  pairIndex: number
  remainingMs: number
  lastUpdatedAt: number | null
  status: 'playing' | 'finished'
  announcement: string
  feedback: null | Readonly<{
    kind: 'correct' | 'incorrect'
    symbolId: string
    until: number
  }>
}>

export function getSoloStage(score: number) {
  return (
    [...SOLO_CHALLENGE.stages]
      .reverse()
      .find((stage) => score >= stage.score) ?? SOLO_CHALLENGE.stages[0]
  )
}

export function getSoloPair(
  seed: string,
  pairIndex: number,
  score: number,
): TwoCardMatchup {
  const stage = getSoloStage(score)
  const symbolCount = stage.order ** 2 + stage.order + 1
  // The seed stays stable for the whole run stage so `pairIndex` walks the
  // matchup's no-repeat pair cycle instead of reshuffling every round.
  return generateTwoCardMatchup(
    {
      order: stage.order,
      symbolsPerCard: stage.symbolsPerCard,
      symbolIds: FIRST_PLAYABLE_SYMBOL_IDS.slice(0, symbolCount),
    },
    `${seed}:${stage.order}`,
    pairIndex,
  )
}

export function startSoloState(seed: string, now: number): SoloState {
  return {
    seed,
    score: 0,
    pairIndex: 0,
    remainingMs: SOLO_CHALLENGE.initialTimeMs,
    lastUpdatedAt: now,
    status: 'playing',
    announcement: '',
    feedback: null,
  }
}

export function tickSolo(state: SoloState, now: number): SoloState {
  if (state.status !== 'playing') return state
  const elapsed = Math.max(0, now - (state.lastUpdatedAt ?? now))
  const remainingMs = Math.max(0, state.remainingMs - elapsed)
  if (remainingMs === 0) {
    return {
      ...state,
      remainingMs: 0,
      lastUpdatedAt: now,
      status: 'finished',
      feedback: null,
    }
  }
  const feedbackDone = state.feedback && now >= state.feedback.until
  return {
    ...state,
    remainingMs,
    lastUpdatedAt: now,
    pairIndex:
      feedbackDone && state.feedback?.kind === 'correct'
        ? state.pairIndex + 1
        : state.pairIndex,
    feedback: feedbackDone ? null : state.feedback,
  }
}

export function answerSolo(
  state: SoloState,
  symbolId: string,
  now: number,
): SoloState {
  const current = tickSolo(state, now)
  if (current.status === 'finished' || current.feedback) return current
  const pair = getSoloPair(current.seed, current.pairIndex, current.score)
  if (!pair.cards.some((card) => card.symbolIds.includes(symbolId)))
    return current

  const sharedSymbol = pair.cards[0].symbolIds.find((id) =>
    pair.cards[1].symbolIds.includes(id),
  )
  const correct = symbolId === sharedSymbol
  const nextScore = current.score + (correct ? 1 : 0)
  const nextStage = getSoloStage(nextScore)
  const announcement =
    correct && nextStage.score === nextScore
      ? `Level up: ${nextStage.symbolsPerCard} symbols per card.`
      : current.announcement
  const remainingMs = correct
    ? current.remainingMs + SOLO_CHALLENGE.correctBonusMs
    : Math.max(0, current.remainingMs - SOLO_CHALLENGE.incorrectPenaltyMs)
  return {
    ...current,
    status: remainingMs === 0 ? 'finished' : 'playing',
    lastUpdatedAt: now,
    remainingMs,
    score: nextScore,
    announcement,
    feedback:
      remainingMs === 0
        ? null
        : {
            kind: correct ? 'correct' : 'incorrect',
            symbolId,
            until:
              now +
              (correct
                ? SOLO_CHALLENGE.successFeedbackMs
                : SOLO_CHALLENGE.incorrectFeedbackMs),
          },
  }
}

export function parseSoloScore(raw: string | null): {
  bestScore: number
  lastScore: number
} {
  if (!raw) return { bestScore: 0, lastScore: 0 }
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== 1
    ) {
      return { bestScore: 0, lastScore: 0 }
    }
    const score = (key: 'bestScore' | 'lastScore') => {
      const candidate =
        key in value ? (value as Record<string, unknown>)[key] : 0
      return typeof candidate === 'number' &&
        Number.isSafeInteger(candidate) &&
        candidate >= 0
        ? candidate
        : 0
    }
    return { bestScore: score('bestScore'), lastScore: score('lastScore') }
  } catch {
    return { bestScore: 0, lastScore: 0 }
  }
}

export function createSoloSeed(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

export function formatSoloShareText(
  score: number,
  challengeUrl: string,
): string {
  const noun = score === 1 ? 'pair' : 'pairs'
  return `I matched ${score} ${noun} in Pic Match Solo. Can you beat me? ${challengeUrl}`
}
