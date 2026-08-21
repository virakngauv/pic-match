import { describe, expect, it } from 'vitest'

import { parsePlayerName } from './validation'

describe('parsePlayerName', () => {
  it('normalizes whitespace and removes unsafe formatting characters', () => {
    expect(parsePlayerName('  Ada\n\u202e  Lovelace\u200b  ')).toBe(
      'Ada Lovelace',
    )
  })

  it('rejects a name made entirely from unsafe characters', () => {
    expect(parsePlayerName('\u0000\u202e\u2066')).toBeNull()
  })
})
