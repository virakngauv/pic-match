import { v } from 'convex/values'

export const roomMemberRole = v.union(v.literal('host'), v.literal('player'))

export const roomMemberStatus = v.union(v.literal('active'), v.literal('left'))

export type RoomMemberRole = 'host' | 'player'
export type RoomMemberStatus = 'active' | 'left'

export function isActiveRoomMember(status: RoomMemberStatus) {
  return status === 'active'
}
