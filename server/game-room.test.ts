import { describe, expect, it } from 'vitest'

import type { MatchClaimCommand, RoomSnapshot } from '../lib/game-protocol'
import { FIRST_PLAYABLE_CONFIGURATION } from '../lib/pic-match'
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

  it('prunes departed lobby member records', () => {
    const room = createRoom()

    for (let index = 1; index <= 20; index += 1) {
      const token = index.toString(16).padStart(32, '0')
      expect(room.join(token, `Player ${index}`, 1_000 + index * 2)).toEqual({
        status: 'success',
      })
      expect(room.leave(token, 1_001 + index * 2)).toEqual({
        status: 'success',
      })
    }

    expect(
      (room as unknown as { members: Array<{ token: string }> }).members.map(
        ({ token }) => token,
      ),
    ).toEqual([hostToken])
  })

  it('lets only the host remove another lobby member', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    const lobby = room.snapshotFor(hostToken)
    if (lobby.status !== 'lobby') throw new Error('Expected lobby.')
    const guestId = lobby.members.find(({ name }) => name === 'Grace')?.playerId
    if (!guestId) throw new Error('Expected guest player id.')

    expect(room.removePlayer(guestToken, guestId, 1_002)).toEqual({
      status: 'forbidden',
      message: 'Only the host can remove a player.',
    })
    expect(room.removePlayer(hostToken, lobby.player.playerId, 1_003)).toEqual({
      status: 'forbidden',
      message: 'The host cannot be removed from the room.',
    })
    expect(room.removePlayer(hostToken, guestId, 1_004)).toEqual({
      status: 'success',
      removedToken: guestToken,
    })
    expect(room.snapshotFor(hostToken)).toMatchObject({
      status: 'lobby',
      members: [{ name: 'Ada', role: 'host' }],
    })
    expect(room.snapshotFor(guestToken)).toEqual({
      status: 'removed_from_room',
      roomCode: 'bcdf2',
    })
    expect(room.removePlayer(hostToken, guestId, 1_005)).toEqual({
      status: 'stale',
      message: 'That player is no longer in the lobby.',
    })
  })

  it('denies a removed identity from rejoining even with a new name', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    const guestId = (
      room.snapshotFor(hostToken) as Extract<RoomSnapshot, { status: 'lobby' }>
    ).members[1]?.playerId
    if (!guestId) throw new Error('Expected guest player id.')
    expect(room.removePlayer(hostToken, guestId, 1_002).status).toBe('success')

    const denial = {
      status: 'removed_from_room',
      message: 'The host removed you from this room. You can’t rejoin it.',
    }
    expect(room.join(guestToken, 'Grace', 1_003)).toEqual(denial)
    expect(room.join(guestToken, 'Grace II', 1_004)).toEqual(denial)
    expect(room.snapshotFor(guestToken)).toEqual({
      status: 'removed_from_room',
      roomCode: 'bcdf2',
    })
    expect((room as unknown as { members: unknown[] }).members).toHaveLength(1)
  })

  it('does not mutate room state on denied rejoin attempts', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    const guestId = (
      room.snapshotFor(hostToken) as Extract<RoomSnapshot, { status: 'lobby' }>
    ).members[1]?.playerId
    if (!guestId) throw new Error('Expected guest player id.')
    expect(room.removePlayer(hostToken, guestId, 1_002).status).toBe('success')

    const revision = room.revision
    const activityAt = room.lastMeaningfulActivityAt
    const fingerprints = (
      room as unknown as { removedTokenFingerprints: Set<string> }
    ).removedTokenFingerprints

    expect(room.join(guestToken, 'Grace', 5_000)).toMatchObject({
      status: 'removed_from_room',
    })
    expect(room.snapshotFor(guestToken).status).toBe('removed_from_room')

    expect(room.revision).toBe(revision)
    expect(room.lastMeaningfulActivityAt).toBe(activityAt)
    expect((room as unknown as { members: unknown[] }).members).toHaveLength(1)
    expect(fingerprints.size).toBe(1)
  })

  it('keeps the removal denial through a rematch', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    const guestId = (
      room.snapshotFor(hostToken) as Extract<RoomSnapshot, { status: 'lobby' }>
    ).members[1]?.playerId
    if (!guestId) throw new Error('Expected guest player id.')
    expect(room.removePlayer(hostToken, guestId, 1_002).status).toBe('success')
    expect(room.start(hostToken, 1_003)).toEqual({ status: 'success' })

    for (
      let score = 0;
      score < FIRST_PLAYABLE_CONFIGURATION.winningScore;
      score += 1
    ) {
      expect(
        room.claim(
          hostToken,
          claim(playing(room), `deniedwinning${score}`),
          2_000 + score,
        ),
      ).toEqual({ status: 'success' })
    }
    expect(room.prepareRematch(hostToken, 3_000)).toEqual({ status: 'success' })

    expect(room.snapshotFor(guestToken)).toEqual({
      status: 'removed_from_room',
      roomCode: 'bcdf2',
    })
    expect(room.join(guestToken, 'Grace', 3_001)).toMatchObject({
      status: 'removed_from_room',
    })
  })

  it('bounds the deny set and expires the oldest entry at the cap', () => {
    const room = createRoom()
    let firstRemovedToken = ''
    for (let index = 0; index < 257; index += 1) {
      const token = (index + 1).toString(16).padStart(32, '0')
      expect(room.join(token, `Cycle ${index}`, 1_000 + index)).toEqual({
        status: 'success',
      })
      const guestId = (
        room.snapshotFor(hostToken) as Extract<
          RoomSnapshot,
          { status: 'lobby' }
        >
      ).members[1]?.playerId
      if (!guestId) throw new Error('Expected cycle player id.')
      expect(room.removePlayer(hostToken, guestId, 1_001 + index).status).toBe(
        'success',
      )
      if (index === 0) firstRemovedToken = token
    }

    const fingerprints = (
      room as unknown as { removedTokenFingerprints: Set<string> }
    ).removedTokenFingerprints
    expect(fingerprints.size).toBe(256)
    expect(room.join(firstRemovedToken, 'Cycle 0 again', 2_000)).toEqual({
      status: 'success',
    })
    expect(
      room.join('101'.padStart(32, '0'), 'Cycle 256 again', 2_001),
    ).toMatchObject({ status: 'removed_from_room' })
  })

  it('does not deny a member after invalid removal attempts', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    const lobby = room.snapshotFor(hostToken)
    if (lobby.status !== 'lobby') throw new Error('Expected lobby.')
    const guestId = lobby.members[1]?.playerId
    if (!guestId) throw new Error('Expected guest player id.')

    expect(room.removePlayer(guestToken, guestId, 1_002)).toMatchObject({
      status: 'forbidden',
    })
    expect(room.removePlayer(hostToken, 'missing', 1_003)).toMatchObject({
      status: 'stale',
    })
    expect(room.removePlayer(hostToken, lobby.player.playerId, 1_004)).toEqual({
      status: 'forbidden',
      message: 'The host cannot be removed from the room.',
    })
    expect(
      (room as unknown as { removedTokenFingerprints: Set<string> })
        .removedTokenFingerprints.size,
    ).toBe(0)

    expect(room.leave(guestToken, 1_005)).toEqual({ status: 'success' })
    expect(room.join(guestToken, 'Grace', 1_006)).toEqual({ status: 'success' })
  })

  it('frees a removed seat before the game starts', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    for (let index = 2; index < MAX_ROOM_MEMBERS; index += 1) {
      expect(
        room.join(`extra-token-${index}`, `Player ${index}`, 1_001 + index),
      ).toEqual({ status: 'success' })
    }
    expect(room.join('room-full-token', 'No seat', 1_100)).toMatchObject({
      status: 'room_full',
    })
    const guestId = (
      room.snapshotFor(hostToken) as Extract<RoomSnapshot, { status: 'lobby' }>
    ).members[1]?.playerId
    if (!guestId) throw new Error('Expected guest player id.')

    expect(room.removePlayer(hostToken, guestId, 1_101).status).toBe('success')
    const replacementToken = 'c'.repeat(32)
    expect(room.join(replacementToken, 'Linus', 1_102)).toEqual({
      status: 'success',
    })
    expect(room.start(hostToken, 1_103)).toEqual({ status: 'success' })
    const names = playing(room).scoreboard.map(({ name }) => name)
    expect(names).toHaveLength(MAX_ROOM_MEMBERS)
    expect(names).not.toContain('Grace')
    expect(names).toContain('Linus')
  })

  it('rejects player removal after the game starts', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    const guestId = (
      room.snapshotFor(hostToken) as Extract<RoomSnapshot, { status: 'lobby' }>
    ).members[1]?.playerId
    if (!guestId) throw new Error('Expected guest player id.')
    room.start(hostToken, 1_002)

    expect(room.removePlayer(hostToken, guestId, 1_003)).toEqual({
      status: 'invalid',
      message: 'Players can only be removed from the lobby.',
    })
    expect(playing(room).scoreboard.map(({ name }) => name)).toEqual([
      'Ada',
      'Grace',
    ])
  })

  it('starts a solo game with only the host', () => {
    const room = createRoom()
    expect(room.start(hostToken, 1_001)).toEqual({ status: 'success' })
    expect(playing(room).scoreboard).toEqual([
      expect.objectContaining({ name: 'Ada', score: 0, position: 0 }),
    ])
  })

  it('requires an active host to start', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    expect(room.start(guestToken, 1_002)).toMatchObject({ status: 'forbidden' })
    expect(room.start(hostToken, 1_003)).toEqual({ status: 'success' })
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

  it('reuses a matchup within a revision and replaces it after a score', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    const snapshot = playing(room)
    const gameState = (
      room as unknown as {
        game: { matchup: { revision: number } | null }
      }
    ).game
    const firstMatchup = gameState.matchup

    expect(firstMatchup?.revision).toBe(0)
    playing(room, guestToken)
    expect(gameState.matchup).toBe(firstMatchup)

    expect(
      room.claim(hostToken, claim(snapshot, 'cachedmatchup1'), 1_003),
    ).toEqual({ status: 'success' })
    expect(gameState.matchup).toBeNull()

    playing(room)
    expect(gameState.matchup).not.toBe(firstMatchup)
    expect(gameState.matchup?.revision).toBe(1)
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

  it('finishes a solo game at the winning score and rematches alone', () => {
    const room = createRoom()
    room.start(hostToken, 1_001)

    for (
      let score = 0;
      score < FIRST_PLAYABLE_CONFIGURATION.winningScore;
      score += 1
    ) {
      const snapshot = playing(room)
      expect(
        room.claim(
          hostToken,
          claim(snapshot, `solowinning${score}`),
          2_000 + score,
        ),
      ).toEqual({
        status: 'success',
      })
    }

    expect(room.snapshotFor(hostToken)).toMatchObject({
      status: 'finished',
      winner: { name: 'Ada', score: FIRST_PLAYABLE_CONFIGURATION.winningScore },
      scoreboard: [{ name: 'Ada' }],
    })
    expect(room.prepareRematch(hostToken, 3_000)).toEqual({ status: 'success' })
    expect(room.snapshotFor(hostToken)).toMatchObject({
      status: 'lobby',
      members: [{ name: 'Ada', role: 'host' }],
    })
  })

  it("keeps a departed player's seat and restores it on mid-game rejoin", () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    const snapshot = playing(room)
    const wrong = {
      ...claim(snapshot, 'wrongclaim3'),
      secondSymbolId:
        snapshot.cards[1]?.symbolIds.find(
          (symbol) => symbol !== sharedSymbol(snapshot),
        ) ?? 'moon',
    }
    expect(room.claim(guestToken, wrong, 2_000)).toMatchObject({
      status: 'incorrect',
    })
    expect(
      room.claim(hostToken, claim(playing(room), 'hostscore1'), 2_001),
    ).toEqual({ status: 'success' })
    room.leave(guestToken, 2_002)

    expect(
      playing(room).scoreboard.map(({ name, score }) => ({ name, score })),
    ).toEqual([
      { name: 'Ada', score: 1 },
      { name: 'Grace', score: 0 },
    ])
    expect(room.snapshotFor(guestToken)).toEqual({
      status: 'joinable',
      roomCode: 'bcdf2',
    })

    expect(room.join(guestToken, 'Grace', 2_500)).toEqual({ status: 'success' })
    const restored = playing(room, guestToken)
    expect(restored.player.position).toBe(1)
    expect(restored.cooldownUntil).toBe(2_000 + INCORRECT_CLAIM_COOLDOWN_MS)
    expect(restored.scoreboard).toEqual([
      expect.objectContaining({ name: 'Ada', score: 1, position: 0 }),
      expect.objectContaining({ name: 'Grace', score: 0, position: 1 }),
    ])
  })

  it('admits a new player mid-game at the next scoreboard position', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    const newcomerToken = 'c'.repeat(32)

    expect(room.join(newcomerToken, 'Linus', 2_000)).toEqual({
      status: 'success',
    })

    const newcomerView = playing(room, newcomerToken)
    expect(newcomerView.player.position).toBe(2)
    expect(newcomerView.cooldownUntil).toBeNull()
    expect(newcomerView.scoreboard.map(({ name }) => name)).toEqual([
      'Ada',
      'Grace',
      'Linus',
    ])
    expect(
      room.claim(
        newcomerToken,
        claim(playing(room, newcomerToken), 'newcomerclaim1'),
        2_001,
      ),
    ).toEqual({ status: 'success' })
    expect(
      playing(room).scoreboard.map(({ name, score }) => ({ name, score })),
    ).toEqual([
      { name: 'Ada', score: 0 },
      { name: 'Grace', score: 0 },
      { name: 'Linus', score: 1 },
    ])
  })

  it('never reassigns positions after mid-game departures', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.join('c'.repeat(32), 'Linus', 1_002)
    room.start(hostToken, 1_003)
    room.leave(guestToken, 1_004)

    const replacementToken = 'd'.repeat(32)
    expect(room.join(replacementToken, 'Margaret', 1_005)).toEqual({
      status: 'success',
    })
    expect(playing(room, replacementToken).player.position).toBe(3)
  })

  it('frees a departed mid-game seat for a different identity', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    room.leave(guestToken, 1_003)

    const replacementToken = 'c'.repeat(32)
    expect(room.join(replacementToken, 'Linus', 1_004)).toEqual({
      status: 'success',
    })
    expect(playing(room).scoreboard.map(({ name }) => name)).toEqual([
      'Ada',
      'Grace',
      'Linus',
    ])
  })

  it('rejects joins after the game finishes until the rematch', () => {
    const room = createRoom()
    room.start(hostToken, 1_001)
    for (
      let score = 0;
      score < FIRST_PLAYABLE_CONFIGURATION.winningScore;
      score += 1
    ) {
      expect(
        room.claim(
          hostToken,
          claim(playing(room), `closedwinning${score}`),
          2_000 + score,
        ),
      ).toEqual({ status: 'success' })
    }

    const outsiderToken = 'd'.repeat(32)
    expect(room.snapshotFor(outsiderToken)).toEqual({
      status: 'game_in_progress',
      roomCode: 'bcdf2',
    })
    expect(room.join(outsiderToken, 'Late', 3_000)).toEqual({
      status: 'game_in_progress',
      message: 'This game has already finished.',
    })

    expect(room.prepareRematch(hostToken, 3_001)).toEqual({ status: 'success' })
    expect(room.join(outsiderToken, 'Late', 3_002)).toEqual({
      status: 'success',
    })
  })

  it('returns late joiners and departed seats to a clean lobby at rematch', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    const newcomerToken = 'c'.repeat(32)
    room.join(newcomerToken, 'Linus', 2_000)
    room.leave(guestToken, 2_001)

    for (
      let score = 0;
      score < FIRST_PLAYABLE_CONFIGURATION.winningScore;
      score += 1
    ) {
      expect(
        room.claim(
          hostToken,
          claim(playing(room), `latejoinwinning${score}`),
          2_100 + score,
        ),
      ).toEqual({ status: 'success' })
    }
    expect(room.prepareRematch(hostToken, 3_000)).toEqual({ status: 'success' })

    expect(room.snapshotFor(hostToken)).toMatchObject({
      status: 'lobby',
      members: [{ name: 'Ada', role: 'host' }, { name: 'Linus' }],
    })
    expect(room.start(hostToken, 3_001)).toEqual({ status: 'success' })
    expect(playing(room).scoreboard).toEqual([
      expect.objectContaining({ name: 'Ada', score: 0, position: 0 }),
      expect.objectContaining({ name: 'Linus', score: 0, position: 1 }),
    ])
  })

  it('transfers host during play so the remaining player can rematch', () => {
    const room = createRoom()
    room.join(guestToken, 'Grace', 1_001)
    room.start(hostToken, 1_002)
    room.leave(hostToken, 1_003)

    const transferred = playing(room, guestToken)
    expect(transferred.player.role).toBe('host')
    expect(
      transferred.scoreboard.filter(({ role }) => role === 'host'),
    ).toEqual([expect.objectContaining({ name: 'Grace' })])
    for (
      let score = 0;
      score < FIRST_PLAYABLE_CONFIGURATION.winningScore;
      score += 1
    ) {
      const snapshot = playing(room, guestToken)
      expect(
        room.claim(
          guestToken,
          claim(snapshot, `guestwinning${score}`),
          2_000 + score,
        ),
      ).toEqual({ status: 'success' })
    }

    expect(room.prepareRematch(guestToken, 3_000)).toEqual({
      status: 'success',
    })
    expect(room.snapshotFor(guestToken)).toMatchObject({
      status: 'lobby',
      player: { role: 'host' },
    })
    expect((room as unknown as { members: unknown[] }).members).toHaveLength(1)
  })
})
