export type MatchClaimEvaluation =
  { status: 'accepted' } | { status: 'incorrect' } | { status: 'stale' }

export type MatchClaimPayload = {
  pairRevision: number
  firstSymbolId: string
  secondSymbolId: string
}

export type MatchClaimResult =
  | { status: 'accepted' | 'stale' }
  | { status: 'incorrect' | 'cooldown'; cooldownUntil: number }
