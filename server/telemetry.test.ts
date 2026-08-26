import { describe, expect, it, vi } from 'vitest'

import { createTelemetry } from './telemetry'

function parseCall(call: unknown[]) {
  return JSON.parse(call[0] as string) as Record<string, unknown>
}

describe('server telemetry', () => {
  it('aggregates rejected commands by command and status until flushed', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const telemetry = createTelemetry(logger, { flushIntervalMs: 0 })

    telemetry.countRejected('game:claim', 'incorrect')
    telemetry.countRejected('room:join', 'not_found')
    telemetry.countRejected('game:claim', 'incorrect')
    telemetry.countRejected('game:claim', 'incorrect')
    expect(logger.info).not.toHaveBeenCalled()

    telemetry.flush()

    expect(logger.info).toHaveBeenCalledTimes(2)
    const events = logger.info.mock.calls.map(parseCall)
    expect(events).toContainEqual({
      event: 'command_rejected',
      command: 'game:claim',
      status: 'incorrect',
      occurrences: 3,
    })
    expect(events).toContainEqual({
      event: 'command_rejected',
      command: 'room:join',
      status: 'not_found',
      occurrences: 1,
    })

    telemetry.flush()
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('aggregates rate-limit rejections by budget', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const telemetry = createTelemetry(logger, { flushIntervalMs: 0 })

    telemetry.countRateLimited('entry')
    telemetry.countRateLimited('address')
    telemetry.countRateLimited('entry')
    telemetry.flush()

    const events = logger.warn.mock.calls.map(parseCall)
    expect(events).toContainEqual({
      event: 'rate_limited',
      budget: 'entry',
      occurrences: 2,
    })
    expect(events).toContainEqual({
      event: 'rate_limited',
      budget: 'address',
      occurrences: 1,
    })
  })

  it('aggregates handshake rejections by reason', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const telemetry = createTelemetry(logger, { flushIntervalMs: 0 })

    telemetry.countHandshakeRejected('origin_not_allowed')
    telemetry.countHandshakeRejected('invalid_auth')
    telemetry.countHandshakeRejected('origin_not_allowed')
    expect(logger.warn).not.toHaveBeenCalled()

    telemetry.flush()

    const events = logger.warn.mock.calls.map(parseCall)
    expect(events).toContainEqual({
      event: 'handshake_rejected',
      reason: 'origin_not_allowed',
      occurrences: 2,
    })
    expect(events).toContainEqual({
      event: 'handshake_rejected',
      reason: 'invalid_auth',
      occurrences: 1,
    })

    telemetry.flush()
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  it('emits direct events with stable shapes', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const telemetry = createTelemetry(logger, { flushIntervalMs: 0 })

    telemetry.expirationSweep(3, 42)
    telemetry.expirationSweep(0, 1)
    telemetry.claimStreak('bcdf2', 7, 20)
    telemetry.shutdownStarted()
    telemetry.shutdownCompleted()

    expect(logger.warn.mock.calls.map(parseCall)).toEqual([
      {
        event: 'claim_streak',
        roomCode: 'bcdf2',
        pairRevision: 7,
        incorrectInARow: 20,
      },
    ])
    expect(logger.info.mock.calls.map(parseCall)).toEqual([
      { event: 'expiration_sweep', roomsExpired: 3, durationMs: 42 },
      { event: 'server_shutdown_started' },
      { event: 'server_shutdown_completed' },
    ])
  })

  it('flushes counted events on an interval and stops after dispose', () => {
    vi.useFakeTimers()
    try {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      const telemetry = createTelemetry(logger, { flushIntervalMs: 5_000 })

      telemetry.countRejected('room:join', 'not_found')
      vi.advanceTimersByTime(5_000)
      expect(logger.info).toHaveBeenCalledTimes(1)

      telemetry.countRejected('room:join', 'not_found')
      telemetry.dispose()
      expect(logger.info).toHaveBeenCalledTimes(2)

      telemetry.countRejected('room:join', 'not_found')
      vi.advanceTimersByTime(15_000)
      expect(logger.info).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
