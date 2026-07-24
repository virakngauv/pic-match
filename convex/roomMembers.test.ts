import { describe, expect, it } from 'vitest'

import { isActiveRoomMember } from './roomMembers'

describe('room member status', () => {
  it('distinguishes active members from members who explicitly left', () => {
    expect(isActiveRoomMember('active')).toBe(true)
    expect(isActiveRoomMember('left')).toBe(false)
  })
})
