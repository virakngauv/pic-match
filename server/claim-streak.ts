export const CLAIM_STREAK_THRESHOLD = 10

export type ClaimStreakEvent = {
  roomCode: string
  pairRevision: number
  incorrectInARow: number
}

export type ClaimStreakOutcome = {
  roomCode: string
  status: string
  pairRevision: number | null
}

export function createClaimStreakTracker(threshold = CLAIM_STREAK_THRESHOLD) {
  const streaks = new Map<
    string,
    { pairRevision: number | null; incorrectInARow: number }
  >()

  return {
    record(outcome: ClaimStreakOutcome): ClaimStreakEvent | undefined {
      const { roomCode, status, pairRevision } = outcome
      if (status === 'success') {
        streaks.delete(roomCode)
        return undefined
      }
      if (status !== 'incorrect') return undefined

      const streak = streaks.get(roomCode)
      const incorrectInARow =
        streak && streak.pairRevision === pairRevision
          ? streak.incorrectInARow + 1
          : 1
      streaks.set(roomCode, { pairRevision, incorrectInARow })
      if (pairRevision === null || incorrectInARow % threshold !== 0) {
        return undefined
      }
      return { roomCode, pairRevision, incorrectInARow }
    },
    forget(roomCode: string) {
      streaks.delete(roomCode)
    },
    size() {
      return streaks.size
    },
  }
}

export type ClaimStreakTracker = ReturnType<typeof createClaimStreakTracker>
