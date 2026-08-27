import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function checkEnvironment(overrides: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    [join(import.meta.dirname, 'check-deployment-env.mjs')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_GAME_SERVER_URL: 'https://game.example.com',
        FIRST_PUBLIC_PLAYTEST_CONFIRMED: 'true',
        ...overrides,
      },
    },
  )
}

describe('deployment environment checks', () => {
  it('accepts the game deployment configuration without exposing its values', () => {
    const result = checkEnvironment()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(
      result.stdout.split('\n').filter((line) => line.startsWith('- ')),
    ).toEqual([
      '- required NEXT_PUBLIC_GAME_SERVER_URL: configured',
      '- required FIRST_PUBLIC_PLAYTEST_CONFIRMED: configured',
    ])
    expect(result.stdout).not.toContain('https://game.example.com')
  })

  it.each([
    ['NEXT_PUBLIC_GAME_SERVER_URL', ''],
    ['NEXT_PUBLIC_GAME_SERVER_URL', 'http://game.example.com'],
    ['NEXT_PUBLIC_GAME_SERVER_URL', 'not-a-url'],
    ['FIRST_PUBLIC_PLAYTEST_CONFIRMED', ''],
    ['FIRST_PUBLIC_PLAYTEST_CONFIRMED', 'false'],
  ])(
    'still rejects invalid required configuration: %s=%s',
    (variable, value) => {
      const result = checkEnvironment({ [variable]: value })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Missing required deployment variables:')
    },
  )
})
