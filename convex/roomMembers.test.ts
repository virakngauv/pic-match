import { describe, expect, it } from 'vitest'

import { isActiveRoomMember, shouldIncludeLobbyMember } from './roomMembers'

describe('room member status', () => {
  it('distinguishes active members from members who explicitly left', () => {
    expect(isActiveRoomMember('active')).toBe(true)
    expect(isActiveRoomMember('left')).toBe(false)
  })

  it('keeps the current member visible before their presence is registered', () => {
    const onlineMemberIds = new Set(['online-member'])

    expect(
      shouldIncludeLobbyMember(
        'current-member',
        'current-member',
        onlineMemberIds,
      ),
    ).toBe(true)
    expect(
      shouldIncludeLobbyMember(
        'offline-member',
        'current-member',
        onlineMemberIds,
      ),
    ).toBe(false)
    expect(
      shouldIncludeLobbyMember(
        'online-member',
        'current-member',
        onlineMemberIds,
      ),
    ).toBe(true)
  })
})
