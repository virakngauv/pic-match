import { describe, expect, it, vi } from 'vitest'

import {
  findAvailablePrivatePlayerKey,
  generatePrivatePlayerKey,
  parseClientToken,
  validateClientToken,
} from './playerKeys'

describe('private player keys', () => {
  it('generates a 128-bit hexadecimal key', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generatePrivatePlayerKey()).toMatch(/^[0-9a-f]{32}$/)
    }
  })

  it('generates a new key after a collision', async () => {
    const generate = vi
      .fn<() => string>()
      .mockReturnValueOnce('a'.repeat(32))
      .mockReturnValueOnce('b'.repeat(32))
    const isTaken = vi.fn(async (key: string) => key === 'a'.repeat(32))

    await expect(
      findAvailablePrivatePlayerKey(isTaken, generate),
    ).resolves.toBe('b'.repeat(32))
    expect(generate).toHaveBeenCalledTimes(2)
    expect(isTaken).toHaveBeenCalledTimes(2)
  })

  it('accepts only a 128-bit lowercase hexadecimal client token', () => {
    const token = 'a1'.repeat(16)

    expect(validateClientToken(token)).toBe(token)
    expect(() => validateClientToken('A1'.repeat(16))).toThrow(
      'Invalid client token.',
    )
    expect(() => validateClientToken('a'.repeat(31))).toThrow(
      'Invalid client token.',
    )
    expect(() => validateClientToken('g'.repeat(32))).toThrow(
      'Invalid client token.',
    )
  })

  it('parses stored client tokens without throwing for stale values', () => {
    const token = 'a1'.repeat(16)

    expect(parseClientToken(token)).toBe(token)
    expect(parseClientToken('stale-token')).toBeNull()
    expect(parseClientToken(null)).toBeNull()
  })
})
