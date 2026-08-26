export type TelemetryLogger = Pick<Console, 'info' | 'warn' | 'error'>

export type RateLimitBudget = 'socket' | 'player' | 'address' | 'entry'

const REJECTED_FLUSH_INTERVAL_MS = 30_000

export function createTelemetry(
  logger: TelemetryLogger,
  options: { flushIntervalMs?: number } = {},
) {
  const flushIntervalMs = options.flushIntervalMs ?? REJECTED_FLUSH_INTERVAL_MS
  const rejected = new Map<
    string,
    { command: string; status: string; occurrences: number }
  >()
  const rateLimited = new Map<RateLimitBudget, number>()

  let flushTimer: ReturnType<typeof setInterval> | undefined
  if (flushIntervalMs > 0) {
    flushTimer = setInterval(() => flush(), flushIntervalMs)
    flushTimer.unref()
  }

  function flush() {
    for (const entry of rejected.values()) {
      logger.info(
        JSON.stringify({
          event: 'command_rejected',
          command: entry.command,
          status: entry.status,
          occurrences: entry.occurrences,
        }),
      )
    }
    rejected.clear()
    for (const [budget, occurrences] of rateLimited) {
      logger.warn(
        JSON.stringify({ event: 'rate_limited', budget, occurrences }),
      )
    }
    rateLimited.clear()
  }

  return {
    countRejected(command: string, status: string) {
      const key = `${command}:${status}`
      const entry = rejected.get(key)
      if (entry) entry.occurrences += 1
      else rejected.set(key, { command, status, occurrences: 1 })
    },
    countRateLimited(budget: RateLimitBudget) {
      rateLimited.set(budget, (rateLimited.get(budget) ?? 0) + 1)
    },
    handshakeRejected(reason: 'invalid_auth' | 'origin_not_allowed') {
      logger.warn(JSON.stringify({ event: 'handshake_rejected', reason }))
    },
    expirationSweep(roomsExpired: number, durationMs: number) {
      if (roomsExpired === 0) return
      logger.info(
        JSON.stringify({
          event: 'expiration_sweep',
          roomsExpired,
          durationMs,
        }),
      )
    },
    claimStreak(
      roomCode: string,
      pairRevision: number,
      incorrectInARow: number,
    ) {
      logger.warn(
        JSON.stringify({
          event: 'claim_streak',
          roomCode,
          pairRevision,
          incorrectInARow,
        }),
      )
    },
    shutdownStarted() {
      logger.info(JSON.stringify({ event: 'server_shutdown_started' }))
    },
    shutdownCompleted() {
      logger.info(JSON.stringify({ event: 'server_shutdown_completed' }))
    },
    flush,
    dispose() {
      if (flushTimer) clearInterval(flushTimer)
      flushTimer = undefined
      flush()
    },
  }
}

export type Telemetry = ReturnType<typeof createTelemetry>
