import { v } from 'convex/values'

import type { RoomPhase } from './roomLifecycle'
import type { RoomMemberStatus } from './roomMembers'

const roomViewPlayerIdentity = {
  playerId: v.id('roomMembers'),
  name: v.string(),
  role: v.union(v.literal('host'), v.literal('player')),
}

export const lobbyRoomViewPlayer = v.object({
  ...roomViewPlayerIdentity,
  position: v.null(),
})

export const gameRoomViewPlayer = v.object({
  ...roomViewPlayerIdentity,
  position: v.number(),
})

export const roomViewMember = v.object({
  playerId: v.id('roomMembers'),
  name: v.string(),
  role: v.union(v.literal('host'), v.literal('player')),
})

export const roomView = v.union(
  v.object({
    status: v.literal('not_found'),
    roomCode: v.string(),
  }),
  v.object({
    status: v.literal('joinable'),
    roomCode: v.string(),
  }),
  v.object({
    status: v.literal('game_in_progress'),
    roomCode: v.string(),
  }),
  v.object({
    status: v.literal('reconnecting'),
    roomCode: v.string(),
    phase: v.union(
      v.literal('lobby'),
      v.literal('playing'),
      v.literal('finished'),
    ),
  }),
  v.object({
    status: v.literal('lobby'),
    roomCode: v.string(),
    members: v.array(roomViewMember),
    player: lobbyRoomViewPlayer,
  }),
  v.object({
    status: v.literal('playing'),
    roomCode: v.string(),
    player: gameRoomViewPlayer,
  }),
  v.object({
    status: v.literal('finished'),
    roomCode: v.string(),
    player: gameRoomViewPlayer,
  }),
)

export type RoomViewStatus =
  'not_found' | 'joinable' | 'game_in_progress' | 'reconnecting' | RoomPhase

export function classifyRoomView({
  phase,
  memberStatus,
  isGameParticipant,
  isConnected,
}: {
  phase: RoomPhase | null
  memberStatus: RoomMemberStatus | null
  isGameParticipant: boolean
  isConnected: boolean
}): RoomViewStatus {
  if (phase === null) {
    return 'not_found'
  }

  const isActiveMember = memberStatus === 'active'
  const canEnterRoom =
    isActiveMember && (phase === 'lobby' || isGameParticipant)

  if (!canEnterRoom) {
    return phase === 'lobby' ? 'joinable' : 'game_in_progress'
  }

  return isConnected ? phase : 'reconnecting'
}
