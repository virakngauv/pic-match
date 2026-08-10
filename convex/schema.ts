import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { FIRST_PLAYABLE_CONFIGURATION_ID } from '../lib/spot-it'
import { roomPhase } from './roomLifecycle'
import { roomMemberRole, roomMemberStatus } from './roomMembers'

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    creatorName: v.string(),
    createdAt: v.number(),
    phase: roomPhase,
    startedAt: v.optional(v.number()),
    gameId: v.optional(v.id('games')),
  }).index('by_code', ['code']),
  roomMembers: defineTable({
    roomId: v.id('rooms'),
    name: v.string(),
    privatePlayerKey: v.string(),
    role: roomMemberRole,
    status: roomMemberStatus,
    joinedAt: v.number(),
  })
    .index('by_room_id_and_joined_at', ['roomId', 'joinedAt'])
    .index('by_room_id_and_status_and_joined_at', [
      'roomId',
      'status',
      'joinedAt',
    ])
    .index('by_room_id_and_private_player_key', ['roomId', 'privatePlayerKey']),
  games: defineTable({
    roomId: v.id('rooms'),
    createdAt: v.number(),
    configurationId: v.literal(FIRST_PLAYABLE_CONFIGURATION_ID),
    seed: v.string(),
    pairRevision: v.number(),
    winnerRoomMemberId: v.optional(v.id('roomMembers')),
  }).index('by_room_id', ['roomId']),
  gameParticipants: defineTable({
    gameId: v.id('games'),
    roomMemberId: v.id('roomMembers'),
    name: v.string(),
    role: roomMemberRole,
    position: v.number(),
    score: v.number(),
    incorrectClaimCooldownUntil: v.optional(v.number()),
  })
    .index('by_game_id_and_position', ['gameId', 'position'])
    .index('by_game_id_and_room_member_id', ['gameId', 'roomMemberId']),
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
  }).index('by_clerk_id', ['clerkId']),
})
