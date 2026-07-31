import { describe, expect, it, vi } from 'vitest'

import {
  createRoomStartPatch,
  getRoomPhase,
  newRoomLifecycle,
} from './roomLifecycle'

describe('room lifecycle', () => {
  it('creates new rooms in the lobby phase', () => {
    expect(newRoomLifecycle()).toEqual({ phase: 'lobby' })
  })

  it('provides migration-safe phases for existing rooms', () => {
    expect(getRoomPhase({})).toBe('lobby')
    expect(getRoomPhase({ startedAt: 123 })).toBe('playing')
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
})
