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
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
        CLERK_SECRET_KEY: '',
        ...overrides,
      },
    },
  )
}

describe('deployment environment checks', () => {
  it('requires no optional integration and reports only Clerk as optional', () => {
    const result = checkEnvironment()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(
      result.stdout.split('\n').filter((line) => line.startsWith('- optional')),
    ).toEqual([
      '- optional NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: disabled',
      '- optional CLERK_SECRET_KEY: disabled',
    ])
  })

  it('accepts fully configured Clerk without exposing its values', () => {
    const result = checkEnvironment({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-public-value',
      CLERK_SECRET_KEY: 'test-secret-value',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('- optional CLERK_SECRET_KEY: configured')
    expect(result.stdout).not.toContain('test-public-value')
    expect(result.stdout).not.toContain('test-secret-value')
  })

  it.each(['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'])(
    'rejects Clerk configured with only %s',
    (variable) => {
      const result = checkEnvironment({ [variable]: 'test-value' })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Clerk is only partially configured.')
    },
  )

  it.each([
    ['NEXT_PUBLIC_GAME_SERVER_URL', ''],
    ['NEXT_PUBLIC_GAME_SERVER_URL', 'http://game.example.com'],
    ['FIRST_PUBLIC_PLAYTEST_CONFIRMED', ''],
  ])(
    'still rejects invalid required configuration: %s=%s',
    (variable, value) => {
      const result = checkEnvironment({ [variable]: value })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Missing required deployment variables:')
    },
  )
})
