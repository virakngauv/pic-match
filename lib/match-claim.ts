export const MATCH_CLAIM_STATUSES = ['accepted', 'incorrect', 'stale'] as const

export type MatchClaimStatus = (typeof MATCH_CLAIM_STATUSES)[number]

export type MatchClaimPayload = {
  pairRevision: number
  firstSymbolId: string
  secondSymbolId: string
}

export type MatchClaimResult = {
  status: MatchClaimStatus
}
