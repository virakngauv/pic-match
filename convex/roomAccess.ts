import type { RoomPhase } from './roomLifecycle'
import type { RoomMemberStatus } from './roomMembers'

export type RoomJoinDecision = 'join_lobby' | 'reconnect' | 'game_in_progress'

export function decideRoomJoin({
  phase,
  memberStatus,
  isGameParticipant,
}: {
  phase: RoomPhase
  memberStatus: RoomMemberStatus | null
  isGameParticipant: boolean
}): RoomJoinDecision {
  if (phase === 'lobby') {
    return memberStatus === null ? 'join_lobby' : 'reconnect'
  }

  return memberStatus === 'active' && isGameParticipant
    ? 'reconnect'
    : 'game_in_progress'
}

export function canRoomMemberConnect({
  phase,
  memberStatus,
  isGameParticipant,
}: {
  phase: RoomPhase
  memberStatus: RoomMemberStatus
  isGameParticipant: boolean
}) {
  return memberStatus === 'active' && (phase === 'lobby' || isGameParticipant)
}
