import { describe, expect, it } from 'vitest'

import { classifyRoomView } from './roomView'

describe('classifyRoomView', () => {
  it('returns not_found when the room does not exist', () => {
    expect(
      classifyRoomView({
        phase: null,
        memberStatus: null,
        isGameParticipant: false,
        isConnected: false,
      }),
    ).toBe('not_found')
  })

  it('returns joinable for a lobby visitor without an active membership', () => {
    expect(
      classifyRoomView({
        phase: 'lobby',
        memberStatus: null,
        isGameParticipant: false,
        isConnected: false,
      }),
    ).toBe('joinable')
  })

  it.each(['playing', 'finished'] as const)(
    'returns game_in_progress for a non-participant while the room is %s',
    (phase) => {
      expect(
        classifyRoomView({
          phase,
          memberStatus: null,
          isGameParticipant: false,
          isConnected: false,
        }),
      ).toBe('game_in_progress')
    },
  )

  it.each(['lobby', 'playing', 'finished'] as const)(
    'returns reconnecting for an eligible disconnected player in the %s phase',
    (phase) => {
      expect(
        classifyRoomView({
          phase,
          memberStatus: 'active',
          isGameParticipant: phase !== 'lobby',
          isConnected: false,
        }),
      ).toBe('reconnecting')
    },
  )

  it.each(['lobby', 'playing', 'finished'] as const)(
    'returns the %s view for an eligible connected player',
    (phase) => {
      expect(
        classifyRoomView({
          phase,
          memberStatus: 'active',
          isGameParticipant: phase !== 'lobby',
          isConnected: true,
        }),
      ).toBe(phase)
    },
  )

  it('does not admit an active member missing from the frozen roster', () => {
    expect(
      classifyRoomView({
        phase: 'playing',
        memberStatus: 'active',
        isGameParticipant: false,
        isConnected: true,
      }),
    ).toBe('game_in_progress')
  })

  it('does not restore a participant who explicitly left', () => {
    expect(
      classifyRoomView({
        phase: 'playing',
        memberStatus: 'left',
        isGameParticipant: true,
        isConnected: true,
      }),
    ).toBe('game_in_progress')
  })
})
