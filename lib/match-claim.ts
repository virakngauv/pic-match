export type MatchClaimPayload = {
  pairRevision: number
  firstSymbolId: string
  secondSymbolId: string
}

export type MatchClaimResult = {
  status: 'accepted' | 'incorrect' | 'stale'
}
