import { describe, expect, it } from 'vitest'

import type { MatchClaimCommand, RoomSnapshot } from '../lib/game-protocol'
import { FIRST_PLAYABLE_CONFIGURATION } from '../lib/spot-it'
import {
  GameRoom,
  INCORRECT_CLAIM_COOLDOWN_MS,
  MAX_ROOM_MEMBERS,
} from './game-room'

const hostToken = 'a'.repeat(32)
const guestToken = 'b'.repeat(32)

function createRoom() {
  let id = 0
  return new GameRoom(
    'bcdf2',
    { token: hostToken, name: 'Ada' },
    {
      now: 1_000,
      seed: 'test-seed',
      createPlayerId: () => `player-${++id}`,
    },
  )
}

function playing(room: GameRoom, token = hostToken) {
  const snapshot = room.snapshotFor(token)
  if (snapshot.status !== 'playing') throw new Error('Expected playing room.')
  return snapshot
}

function sharedSymbol(snapshot: Extract<RoomSnapshot, { status: 'playing' }>) {
  const symbol = snapshot.cards[0]?.symbolIds.find((candidate) =>
    snapshot.cards[1]?.symbolIds.includes(candidate),
  )
  if (!symbol) throw new Error('Expected cards to share a symbol.')
  return symbol
}

function claim(
  snapshot: Extract<RoomSnapshot, { status: 'playing' }>,
  commandId: string,
): MatchClaimCommand {
  const symbol = sharedSymbol(snapshot)
  return {
    roomCode: snapshot.roomCode,
    commandId,
    pairRevision: snapshot.pairRevision,
    firstSymbolId: symbol,
    secondSymbolId: symbol,
  }
}

describe('GameRoom', () => {
  it('keeps membership across disconnect-free snapshot restores', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)

    expect(room.snapshotFor(hostToken)).toMatchObject({
      status: 'lobby',
      members: [
        { name: 'Ada', role: 'host' },
        { name: 'Grace', role: 'player' },
      ],
    })
    expect(room.snapshotFor(guestToken)).toMatchObject({
      status: 'lobby',
      player: { name: 'Grace' },
    })
  })

  it('enforces the configured room capacity', () => {
    const room = createRoom()
    for (let index = 1; index < MAX_ROOM_MEMBERS; index += 1) {
      const token = index.toString(16).padStart(32, '0')
      expect(room.join(token, `Player ${index}`, 1_000 + index)).toEqual({
        status: 'success',
      })
    }

    expect(room.join('f'.repeat(32), 'One too many', 2_000)).toMatchObject({
      status: 'room_full',
    })
  })

  it('transfers lobby host on explicit leave and deletes no other member', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)

    expect(room.leave(hostToken, 1_002)).toEqual({ status: 'success' })
    expect(room.snapshotFor(guestToken)).toMatchObject({
      status: 'lobby',
      player: { role: 'host' },
      members: [{ name: 'Grace', role: 'host' }],
    })
  })

  it('requires an active host and two members to start', () => {
    const room = createRoom()
    expect(room.start(hostToken, 1_001)).toMatchObject({ status: 'invalid' })
    room.join(guestToken, 'Grace', 1_002)
    expect(room.start(guestToken, 1_003)).toMatchObject({ status: 'forbidden' })
    expect(room.start(hostToken, 1_004)).toEqual({ status: 'success' })
    expect(playing(room).scoreboard).toEqual([
      expect.objectContaining({ name: 'Ada', score: 0, position: 0 }),
      expect.objectContaining({ name: 'Grace', score: 0, position: 1 }),
    ])
  })

  it('awards only the first valid claim for a pair revision', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    const snapshot = playing(room)

    expect(room.claim(hostToken, claim(snapshot, 'hostclaim1'), 1_003)).toEqual(
      {
        status: 'success',
      },
    )
    expect(
      room.claim(guestToken, claim(snapshot, 'guestclaim1'), 1_003),
    ).toMatchObject({
      status: 'stale',
    })
    expect(playing(room).scoreboard).toEqual([
      expect.objectContaining({ name: 'Ada', score: 1 }),
      expect.objectContaining({ name: 'Grace', score: 0 }),
    ])
  })

  it('deduplicates command IDs without awarding another point', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    const command = claim(playing(room), 'duplicate1')

    expect(room.claim(hostToken, command, 1_003)).toEqual({ status: 'success' })
    expect(room.claim(hostToken, command, 1_004)).toEqual({ status: 'success' })
    expect(playing(room).scoreboard[0]?.score).toBe(1)
  })

  it('applies incorrect cooldown only to the claiming player', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    const snapshot = playing(room)
    const wrong = {
      ...claim(snapshot, 'wrongclaim1'),
      secondSymbolId:
        snapshot.cards[1]?.symbolIds.find(
          (symbol) => symbol !== sharedSymbol(snapshot),
        ) ?? 'moon',
    }

    expect(room.claim(hostToken, wrong, 2_000)).toEqual({
      status: 'incorrect',
      message: 'Incorrect match.',
      cooldownUntil: 2_000 + INCORRECT_CLAIM_COOLDOWN_MS,
    })
    expect(playing(room, hostToken).cooldownUntil).toBe(3_000)
    expect(playing(room, guestToken).cooldownUntil).toBeNull()
    expect(
      room.claim(guestToken, claim(snapshot, 'guestclaim2'), 2_001),
    ).toEqual({
      status: 'success',
    })
  })

  it('finishes at the configured winning score and lets the host rematch', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)

    for (
      let score = 0;
      score < FIRST_PLAYABLE_CONFIGURATION.winningScore;
      score += 1
    ) {
      const snapshot = playing(room)
      expect(
        room.claim(
          hostToken,
          claim(snapshot, `winning${score}`),
          2_000 + score,
        ),
      ).toEqual({
        status: 'success',
      })
    }

    expect(room.snapshotFor(hostToken)).toMatchObject({
      status: 'finished',
      winner: { name: 'Ada', score: FIRST_PLAYABLE_CONFIGURATION.winningScore },
    })
    expect(room.prepareRematch(guestToken, 3_000)).toMatchObject({
      status: 'forbidden',
    })
    expect(room.prepareRematch(hostToken, 3_001)).toEqual({ status: 'success' })
    expect(room.snapshotFor(hostToken)).toMatchObject({
      status: 'lobby',
      members: [{ name: 'Ada' }, { name: 'Grace' }],
    })
  })

  it('keeps a frozen game roster when a participant explicitly leaves', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    room.leave(guestToken, 1_003)

    expect(playing(room).scoreboard.map((entry) => entry.name)).toEqual([
      'Ada',
      'Grace',
    ])
    expect(room.snapshotFor(guestToken)).toEqual({
      status: 'game_in_progress',
      roomCode: 'bcdf2',
    })
  })
})
