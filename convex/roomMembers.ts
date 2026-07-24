import { v } from 'convex/values'

export const roomMemberStatus = v.union(v.literal('active'), v.literal('left'))

export type RoomMemberStatus = 'active' | 'left'

export function isActiveRoomMember(status: RoomMemberStatus) {
  return status === 'active'
}

export function shouldIncludeLobbyMember(
  memberId: string,
  currentMemberId: string,
  onlineMemberIds: ReadonlySet<string>,
) {
  return memberId === currentMemberId || onlineMemberIds.has(memberId)
}
