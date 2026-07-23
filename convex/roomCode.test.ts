import { describe, expect, it, vi } from 'vitest'

import {
  findAvailableRoomCode,
  generateRoomCode,
  normalizeRoomCode,
} from './roomCode'

describe('room codes', () => {
  it('generates four consonants followed by a digit or y', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateRoomCode()).toMatch(/^[bcdfghkpqrstvz]{4}[2-9y]$/)
    }
  })

  it('generates a new code after a collision', async () => {
    const generate = vi
      .fn<() => string>()
      .mockReturnValueOnce('bbbb2')
      .mockReturnValueOnce('cccc3')
    const isTaken = vi.fn(async (code: string) => code === 'bbbb2')

    await expect(findAvailableRoomCode(isTaken, generate)).resolves.toBe(
      'cccc3',
    )
    expect(generate).toHaveBeenCalledTimes(2)
    expect(isTaken).toHaveBeenCalledTimes(2)
  })

  it('normalizes room codes from user input', () => {
    expect(normalizeRoomCode('  BCDF2  ')).toBe('bcdf2')
  })
})
