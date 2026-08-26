import { describe, expect, it } from 'vitest'

import {
  Metrics,
  parseArgs,
  percentiles,
  validateLocalTarget,
} from './load-game-server'

describe('load-game-server', () => {
  it('parses documented options', () => {
    expect(
      parseArgs([
        '--url',
        'http://127.0.0.1:4200',
        '--origin',
        'http://127.0.0.1:3100',
        '--duration',
        '2m',
        '--concurrency',
        '20',
        '--ramp',
        '10,20,40',
        '--scenario',
        'reconnect-storm',
      ]),
    ).toMatchObject({
      url: 'http://127.0.0.1:4200',
      origin: 'http://127.0.0.1:3100',
      durationMs: 120_000,
      concurrency: 20,
      ramp: [10, 20, 40],
      scenario: 'reconnect-storm',
    })
  })

  it('rejects odd gameplay socket targets', () => {
    expect(() => parseArgs(['--ramp', '10,21'])).toThrow(
      'Socket concurrency and ramp targets must be even',
    )
  })

  it('uses nearest-rank latency percentiles', () => {
    expect(percentiles([1, 2, 3, 4, 100])).toEqual({
      p50: 3,
      p95: 100,
      p99: 100,
    })
  })

  it('refuses public targets while allowing private targets', () => {
    expect(() => validateLocalTarget('https://example.com')).toThrow(
      'Refusing to load test a public target',
    )
    expect(() => validateLocalTarget('http://192.168.1.20:3200')).not.toThrow()
  })

  it('reports latency and errors per event plus throughput', () => {
    const metrics = new Metrics()
    metrics.attempt('game:claim')
    metrics.success('game:claim', 10)
    metrics.attempt('game:claim')
    metrics.failure('game:claim', 'stale', 20)

    expect(metrics.report(parseArgs([])!, 1_000)).toMatchObject({
      throughputPerSecond: 2,
      events: {
        'game:claim': {
          attempted: 2,
          successful: 1,
          failed: 1,
          errorRate: 0.5,
          latencyMs: { p50: 10, p95: 20, p99: 20 },
          statuses: { stale: 1 },
        },
      },
    })
  })
})
