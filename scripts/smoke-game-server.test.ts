import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('smoke-game-server script', () => {
  it(
    'loads under the repository CommonJS configuration and reports missing environment variables',
    { timeout: 60_000 },
    () => {
      const scriptPath = join(import.meta.dirname, 'smoke-game-server.ts')
      const tsxBinary = join(
        import.meta.dirname,
        '..',
        'node_modules',
        '.bin',
        'tsx',
      )
      const env = { ...process.env }
      delete env.GAME_SERVER_URL
      delete env.GAME_SERVER_ORIGIN

      const result = (() => {
        try {
          const stdout = execFileSync(tsxBinary, [scriptPath], {
            env,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          return { status: 0, output: stdout }
        } catch (error) {
          const failure = error as {
            status?: number
            stdout?: string
            stderr?: string
          }
          return {
            status: failure.status ?? 1,
            output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
          }
        }
      })()

      expect(result.status).not.toBe(0)
      expect(result.output).toContain(
        'Set GAME_SERVER_URL before running the smoke test.',
      )
      expect(result.output).not.toContain('Top-level await')
    },
  )
})
