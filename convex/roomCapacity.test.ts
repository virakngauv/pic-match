import { describe, expect, it } from 'vitest'

import type { Id } from './_generated/dataModel'
import { canClaimRoomSeat, MAX_ROOM_MEMBERS } from './roomCapacity'

function memberId(index: number) {
  return `member-${index}` as Id<'roomMembers'>
}

describe('room capacity', () => {
  it('allows a new member to claim an available seat', () => {
    const onlineMemberIds = new Set([memberId(1)])

    expect(canClaimRoomSeat(onlineMemberIds)).toBe(true)
  })

  it('rejects a new member when every seat is occupied', () => {
    const onlineMemberIds = new Set(
      Array.from({ length: MAX_ROOM_MEMBERS }, (_, index) => memberId(index)),
    )

    expect(canClaimRoomSeat(onlineMemberIds)).toBe(false)
  })

  it('allows an online member to renew in a full room', () => {
    const onlineMemberIds = new Set(
      Array.from({ length: MAX_ROOM_MEMBERS }, (_, index) => memberId(index)),
    )

    expect(canClaimRoomSeat(onlineMemberIds, memberId(0))).toBe(true)
  })

  it('rejects a disconnected member when the room filled up', () => {
    const onlineMemberIds = new Set(
      Array.from({ length: MAX_ROOM_MEMBERS }, (_, index) => memberId(index)),
    )

    expect(canClaimRoomSeat(onlineMemberIds, memberId(MAX_ROOM_MEMBERS))).toBe(
      false,
    )
  })
})
