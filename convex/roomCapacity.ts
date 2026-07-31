import type { Id } from './_generated/dataModel'

export const MAX_ROOM_MEMBERS = 64

export function canClaimRoomSeat(
  onlineMemberIds: ReadonlySet<Id<'roomMembers'>>,
  memberId?: Id<'roomMembers'>,
) {
  return (
    (memberId !== undefined && onlineMemberIds.has(memberId)) ||
    onlineMemberIds.size < MAX_ROOM_MEMBERS
  )
}
