import { beforeEach, describe, expect, it } from 'vitest'

import {
  generateClientToken,
  getClientToken,
  getOrCreateClientInstanceId,
  getOrCreateClientToken,
  saveClientToken,
} from './player-session'

describe('player session storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('keeps one client token in persistent browser storage', () => {
    const token = 'a'.repeat(32)
    saveClientToken(token)

    expect(getClientToken()).toBe(token)
    expect(window.localStorage.getItem('spot-it:client-token')).toBe(token)
    expect(window.sessionStorage).toHaveLength(0)
  })

  it('reuses one token across tabs and rooms in the same browser', () => {
    const firstToken = getOrCreateClientToken()
    const secondToken = getOrCreateClientToken()

    expect(firstToken).toMatch(/^[0-9a-f]{32}$/)
    expect(secondToken).toBe(firstToken)
  })

  it('keeps one presence instance ID for the lifetime of a tab', () => {
    const firstInstanceId = getOrCreateClientInstanceId()
    const secondInstanceId = getOrCreateClientInstanceId()

    expect(firstInstanceId).toMatch(/^[0-9a-f]{32}$/)
    expect(secondInstanceId).toBe(firstInstanceId)
    expect(window.sessionStorage.getItem('spot-it:client-instance-id')).toBe(
      firstInstanceId,
    )
    expect(window.sessionStorage).toHaveLength(1)
  })

  it('rejects malformed tokens before persisting them', () => {
    expect(() => saveClientToken('not-a-token')).toThrow(
      'Invalid client token.',
    )
    expect(window.localStorage).toHaveLength(0)
  })

  it('generates a 128-bit hexadecimal token', () => {
    expect(generateClientToken()).toMatch(/^[0-9a-f]{32}$/)
  })
})
