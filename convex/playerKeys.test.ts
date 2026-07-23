import { describe, expect, it, vi } from 'vitest'

import {
  findAvailablePrivatePlayerKey,
  generatePrivatePlayerKey,
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
})
