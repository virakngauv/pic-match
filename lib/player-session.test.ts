import { beforeEach, describe, expect, it } from 'vitest'

import {
  getPrivatePlayerKey,
  removePrivatePlayerKey,
  savePrivatePlayerKey,
} from './player-session'

describe('player session storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('keeps private player keys scoped to their normalized room code', () => {
    savePrivatePlayerKey(' ABCD2 ', 'private-key')

    expect(getPrivatePlayerKey('abcd2')).toBe('private-key')
    expect(getPrivatePlayerKey('other2')).toBeNull()

    removePrivatePlayerKey('ABCD2')
    expect(getPrivatePlayerKey('abcd2')).toBeNull()
  })
})
