import { describe, expect, it } from 'vitest'

import { validateClientToken } from './playerKeys'
import { canRoomMemberConnect, decideRoomJoin } from './roomAccess'

describe('room access after game start', () => {
  it.each(['playing', 'finished'] as const)(
    'rejects a brand-new identity while the room is %s',
    (phase) => {
      expect(
        decideRoomJoin({
          phase,
          memberStatus: null,
          isGameParticipant: false,
        }),
      ).toBe('game_in_progress')
    },
  )

  it('allows an active frozen participant to reconnect', () => {
    expect(
      decideRoomJoin({
        phase: 'playing',
        memberStatus: 'active',
        isGameParticipant: true,
      }),
    ).toBe('reconnect')
    expect(
      canRoomMemberConnect({
        phase: 'playing',
        memberStatus: 'active',
        isGameParticipant: true,
      }),
    ).toBe(true)
  })

  it('does not restore a frozen participant who explicitly left', () => {
    expect(
      decideRoomJoin({
        phase: 'playing',
        memberStatus: 'left',
        isGameParticipant: true,
      }),
    ).toBe('game_in_progress')
    expect(
      canRoomMemberConnect({
        phase: 'playing',
        memberStatus: 'left',
        isGameParticipant: true,
      }),
    ).toBe(false)
  })

  it('rejects an active member who was not frozen into the game roster', () => {
    expect(
      decideRoomJoin({
        phase: 'playing',
        memberStatus: 'active',
        isGameParticipant: false,
      }),
    ).toBe('game_in_progress')
    expect(
      canRoomMemberConnect({
        phase: 'playing',
        memberStatus: 'active',
        isGameParticipant: false,
      }),
    ).toBe(false)
  })

  it.each([
    [null, 'join_lobby'],
    ['active', 'reconnect'],
    ['left', 'reconnect'],
  ] as const)(
    'classifies a lobby member with status %s as %s',
    (memberStatus, expected) => {
      expect(
        decideRoomJoin({
          phase: 'lobby',
          memberStatus,
          isGameParticipant: false,
        }),
      ).toBe(expected)
    },
  )

  it('rejects malformed player identity tokens', () => {
    expect(() => validateClientToken('not-a-player-token')).toThrow(
      'Invalid client token.',
    )
  })
})
