import { describe, expect, it, vi } from 'vitest'

import {
  createRoomRematchPatch,
  createRoomStartPatch,
  getRoomPhase,
  newRoomLifecycle,
} from './roomLifecycle'

describe('room lifecycle', () => {
  it('creates new rooms in the lobby phase', () => {
    expect(newRoomLifecycle()).toEqual({ phase: 'lobby' })
  })

  it('reads the explicit room phase', () => {
    expect(getRoomPhase({ phase: 'lobby' })).toBe('lobby')
    expect(getRoomPhase({ phase: 'playing', startedAt: 123 })).toBe('playing')
    expect(getRoomPhase({ phase: 'finished', startedAt: 123 })).toBe('finished')
  })

  it('allows an active host to transition a populated lobby to playing', async () => {
    await expect(
      createRoomStartPatch({
        room: { phase: 'lobby' },
        actor: { role: 'host', isActive: true },
        getOnlinePlayerCount: async () => 2,
        startedAt: 123,
      }),
    ).resolves.toEqual({
      phase: 'playing',
      startedAt: 123,
    })
  })

  it('rejects a repeated start attempt before loading the roster', async () => {
    for (const phase of ['playing', 'finished'] as const) {
      const getOnlinePlayerCount = vi.fn(async () => 2)

      await expect(
        createRoomStartPatch({
          room: { phase, startedAt: 123 },
          actor: { role: 'host', isActive: true },
          getOnlinePlayerCount,
          startedAt: 456,
        }),
      ).rejects.toThrow('The game can only be started from the lobby.')
      expect(getOnlinePlayerCount).not.toHaveBeenCalled()
    }
  })

  it('rejects an unauthorized transition before loading the roster', async () => {
    const getOnlinePlayerCount = vi.fn(async () => 2)

    await expect(
      createRoomStartPatch({
        room: { phase: 'lobby' },
        actor: { role: 'player', isActive: true },
        getOnlinePlayerCount,
        startedAt: 123,
      }),
    ).rejects.toThrow('Only the host can start the game.')

    await expect(
      createRoomStartPatch({
        room: { phase: 'lobby' },
        actor: { role: 'host', isActive: false },
        getOnlinePlayerCount,
        startedAt: 123,
      }),
    ).rejects.toThrow('Only the host can start the game.')
    expect(getOnlinePlayerCount).not.toHaveBeenCalled()
  })

  it('rejects starting without enough online players', async () => {
    await expect(
      createRoomStartPatch({
        room: { phase: 'lobby' },
        actor: { role: 'host', isActive: true },
        getOnlinePlayerCount: async () => 1,
        startedAt: 123,
      }),
    ).rejects.toThrow('At least 2 players are required to start the game.')
  })

  it('allows an active host to reopen a finished room lobby', () => {
    expect(
      createRoomRematchPatch({
        room: {
          phase: 'finished',
          startedAt: 123,
          gameId: 'completed-game',
        },
        actor: { role: 'host', isActive: true },
      }),
    ).toEqual({
      phase: 'lobby',
      startedAt: undefined,
      gameId: undefined,
    })
  })

  it.each(['lobby', 'playing'] as const)(
    'rejects preparing a rematch from the %s phase',
    (phase) => {
      expect(() =>
        createRoomRematchPatch({
          room: {
            phase,
            ...(phase === 'playing'
              ? { startedAt: 123, gameId: 'current-game' }
              : {}),
          },
          actor: { role: 'host', isActive: true },
        }),
      ).toThrow('A rematch can only be prepared after the game finishes.')
    },
  )

  it.each([
    ['missing member', null],
    ['active player', { role: 'player' as const, isActive: true }],
    ['inactive host', { role: 'host' as const, isActive: false }],
  ])('rejects preparing a rematch for a %s', (_case, actor) => {
    expect(() =>
      createRoomRematchPatch({
        room: {
          phase: 'finished',
          startedAt: 123,
          gameId: 'completed-game',
        },
        actor,
      }),
    ).toThrow('Only the host can prepare a rematch.')
  })
})
