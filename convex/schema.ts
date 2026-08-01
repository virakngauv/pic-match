import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { roomPhase } from './roomLifecycle'
import { roomMemberStatus } from './roomMembers'

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    creatorName: v.string(),
    createdAt: v.number(),
    phase: v.optional(roomPhase),
    startedAt: v.optional(v.number()),
  }).index('by_code', ['code']),
  roomMembers: defineTable({
    roomId: v.id('rooms'),
    name: v.string(),
    privatePlayerKey: v.string(),
    role: v.union(v.literal('host'), v.literal('player')),
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
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
  }).index('by_clerk_id', ['clerkId']),
})
