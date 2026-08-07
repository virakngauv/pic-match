import { describe, expect, it, vi } from 'vitest'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  buildGameParticipantSnapshot,
  listRoomParticipantsForPhase,
  presentGameParticipantIdentity,
  startRoomGame,
} from './gameParticipants'

function room(overrides: Partial<Doc<'rooms'>> = {}): Doc<'rooms'> {
  return {
    _id: 'room-1' as Id<'rooms'>,
    _creationTime: 1,
    code: 'bcdf2',
    creatorName: 'Host',
    createdAt: 1,
    phase: 'lobby',
    ...overrides,
  }
}

function member({
  id,
  name,
  joinedAt,
  creationTime,
  role = 'player',
}: {
  id: string
  name: string
  joinedAt: number
  creationTime: number
  role?: 'host' | 'player'
}): Doc<'roomMembers'> {
  return {
    _id: id as Id<'roomMembers'>,
    _creationTime: creationTime,
    roomId: 'room-1' as Id<'rooms'>,
    name,
    privatePlayerKey: id.padEnd(32, '0'),
    role,
    status: 'active',
    joinedAt,
  }
}

describe('game participant snapshots', () => {
  it('orders eligible members by join time with deterministic tie breakers', () => {
    const snapshot = buildGameParticipantSnapshot([
      member({ id: 'member-3', name: 'Third', joinedAt: 20, creationTime: 3 }),
      member({ id: 'member-2', name: 'Second', joinedAt: 10, creationTime: 2 }),
      member({
        id: 'member-1',
        name: 'First',
        joinedAt: 10,
        creationTime: 1,
        role: 'host',
      }),
    ])

    expect(snapshot).toEqual([
      {
        roomMemberId: 'member-1',
        name: 'First',
        role: 'host',
        position: 0,
        score: 0,
      },
      {
        roomMemberId: 'member-2',
        name: 'Second',
        role: 'player',
        position: 1,
        score: 0,
      },
      {
        roomMemberId: 'member-3',
        name: 'Third',
        role: 'player',
        position: 2,
        score: 0,
      },
    ])
  })

  it('persists the game, participant roster, and lifecycle transition together', async () => {
    const gameId = 'game-1' as Id<'games'>
    const insert = vi.fn(async (table: string) => {
      if (table === 'games') {
        return gameId
      }

      return 'game-participant' as Id<'gameParticipants'>
    })
    const patch = vi.fn(async () => undefined)
    const ctx = { db: { insert, patch } } as unknown as MutationCtx
    const onlineParticipants = [
      member({ id: 'member-2', name: 'Second', joinedAt: 2, creationTime: 2 }),
      member({
        id: 'member-1',
        name: 'First',
        joinedAt: 1,
        creationTime: 1,
        role: 'host',
      }),
    ]

    await expect(
      startRoomGame(
        ctx,
        room(),
        { role: 'host', isActive: true },
        async () => onlineParticipants,
        123,
      ),
    ).resolves.toBe(gameId)

    expect(insert.mock.calls).toEqual([
      [
        'games',
        {
          roomId: 'room-1',
          createdAt: 123,
          configurationId: 'first-playable-v1',
          seed: 'first-playable-v1:room-1:123',
          pairRevision: 0,
        },
      ],
      [
        'gameParticipants',
        {
          gameId,
          roomMemberId: 'member-1',
          name: 'First',
          role: 'host',
          position: 0,
          score: 0,
        },
      ],
      [
        'gameParticipants',
        {
          gameId,
          roomMemberId: 'member-2',
          name: 'Second',
          role: 'player',
          position: 1,
          score: 0,
        },
      ],
    ])
    expect(patch).toHaveBeenCalledWith('room-1', {
      phase: 'playing',
      startedAt: 123,
      gameId,
    })
  })

  it('does not create another game or roster when start is repeated', async () => {
    const insert = vi.fn()
    const patch = vi.fn()
    const getOnlineParticipants = vi.fn(async () => [
      member({
        id: 'member-1',
        name: 'First',
        joinedAt: 1,
        creationTime: 1,
        role: 'host',
      }),
      member({ id: 'member-2', name: 'Second', joinedAt: 2, creationTime: 2 }),
    ])
    const ctx = { db: { insert, patch } } as unknown as MutationCtx

    await expect(
      startRoomGame(
        ctx,
        room({
          phase: 'playing',
          startedAt: 123,
          gameId: 'game-1' as Id<'games'>,
        }),
        { role: 'host', isActive: true },
        getOnlineParticipants,
        456,
      ),
    ).rejects.toThrow('The game can only be started from the lobby.')

    expect(getOnlineParticipants).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })

  it.each([
    ['missing participant', null],
    ['non-host participant', { role: 'player' as const, isActive: true }],
    ['inactive host', { role: 'host' as const, isActive: false }],
  ])(
    'rejects an unauthorized start by a %s before reading or writing',
    async (_name, actor) => {
      const insert = vi.fn()
      const patch = vi.fn()
      const getOnlineParticipants = vi.fn(async () => [])
      const ctx = { db: { insert, patch } } as unknown as MutationCtx

      await expect(
        startRoomGame(ctx, room(), actor, getOnlineParticipants, 123),
      ).rejects.toThrow('Only the host can start the game.')

      expect(getOnlineParticipants).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
    },
  )

  it('rejects an unsupported participant count before writing game state', async () => {
    const insert = vi.fn()
    const patch = vi.fn()
    const ctx = { db: { insert, patch } } as unknown as MutationCtx
    const onlineParticipants = Array.from({ length: 65 }, (_, index) =>
      member({
        id: `member-${index}`,
        name: `Player ${index}`,
        joinedAt: index,
        creationTime: index,
        role: index === 0 ? 'host' : 'player',
      }),
    )

    await expect(
      startRoomGame(
        ctx,
        room(),
        { role: 'host', isActive: true },
        async () => onlineParticipants,
        123,
      ),
    ).rejects.toThrow('Participant count must be between 2 and 64.')

    expect(insert).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })

  it('does not transition the room when snapshot persistence fails', async () => {
    const gameId = 'game-1' as Id<'games'>
    const insert = vi.fn(async (table: string) => {
      if (table === 'games') {
        return gameId
      }

      throw new Error('Unable to persist participant snapshot.')
    })
    const patch = vi.fn()
    const ctx = { db: { insert, patch } } as unknown as MutationCtx
    const onlineParticipants = [
      member({
        id: 'member-1',
        name: 'First',
        joinedAt: 1,
        creationTime: 1,
        role: 'host',
      }),
      member({ id: 'member-2', name: 'Second', joinedAt: 2, creationTime: 2 }),
    ]

    await expect(
      startRoomGame(
        ctx,
        room(),
        { role: 'host', isActive: true },
        async () => onlineParticipants,
        123,
      ),
    ).rejects.toThrow('Unable to persist participant snapshot.')

    expect(patch).not.toHaveBeenCalled()
  })

  it('keeps the frozen roster unchanged when live presence changes', () => {
    const onlineParticipants = [
      member({
        id: 'member-1',
        name: 'First',
        joinedAt: 1,
        creationTime: 1,
        role: 'host',
      }),
      member({ id: 'member-2', name: 'Second', joinedAt: 2, creationTime: 2 }),
    ]
    const snapshot = buildGameParticipantSnapshot(onlineParticipants)

    onlineParticipants.reverse()
    onlineParticipants.pop()
    onlineParticipants[0].name = 'Renamed while reconnecting'
    onlineParticipants.push(
      member({ id: 'member-3', name: 'Late', joinedAt: 3, creationTime: 3 }),
    )

    expect(
      snapshot.map(({ roomMemberId, name, position }) => ({
        roomMemberId,
        name,
        position,
      })),
    ).toEqual([
      { roomMemberId: 'member-1', name: 'First', position: 0 },
      { roomMemberId: 'member-2', name: 'Second', position: 1 },
    ])
  })

  it('restores the frozen participant identity, role, and game position', () => {
    expect(
      presentGameParticipantIdentity({
        roomMemberId: 'member-2' as Id<'roomMembers'>,
        role: 'player',
        position: 1,
      }),
    ).toEqual({
      playerId: 'member-2',
      role: 'player',
      position: 1,
    })
  })

  it('reads playing participants from the snapshot instead of live presence', async () => {
    const gameId = 'game-1' as Id<'games'>
    const listLobbyParticipants = vi.fn(async () => ['late-player'])
    const listGameParticipants = vi.fn(async () => ['host', 'starting-player'])

    await expect(
      listRoomParticipantsForPhase({
        phase: 'playing',
        gameId,
        listLobbyParticipants,
        listGameParticipants,
      }),
    ).resolves.toEqual(['host', 'starting-player'])

    expect(listLobbyParticipants).not.toHaveBeenCalled()
    expect(listGameParticipants).toHaveBeenCalledWith(gameId)
  })
})
