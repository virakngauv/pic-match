import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  generateClientToken,
  getClientToken,
  getOrCreateClientToken,
  saveClientToken,
} from './player-session'

describe('player session storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps one client token in persistent browser storage', () => {
    const token = 'a'.repeat(32)
    saveClientToken(token)

    expect(getClientToken()).toBe(token)
    expect(window.localStorage.getItem('pic-match:client-token')).toBe(token)
    expect(window.sessionStorage).toHaveLength(0)
  })

  it('reuses one token across tabs and rooms in the same browser', () => {
    const firstToken = getOrCreateClientToken()
    const secondToken = getOrCreateClientToken()

    expect(firstToken).toMatch(/^[0-9a-f]{32}$/)
    expect(secondToken).toBe(firstToken)
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

  it('treats a blocked storage read as an empty session without throwing', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(getClientToken()).toBeNull()
  })

  it('keeps one stable session token when storage persistence is blocked', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const firstToken = getOrCreateClientToken()
    const secondToken = getOrCreateClientToken()

    expect(firstToken).toMatch(/^[0-9a-f]{32}$/)
    expect(secondToken).toBe(firstToken)
    expect(getClientToken()).toBe(firstToken)
  })
})
