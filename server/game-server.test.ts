import { describe, expect, it } from 'vitest'

import { GameServer } from './game-server'

describe('GameServer', () => {
  it('creates collision-free rooms and restores a token snapshot', () => {
    const server = new GameServer(undefined, () => 0)
    const first = server.createRoom('a'.repeat(32), 'Ada', 1_000)
    const second = server.createRoom('b'.repeat(32), 'Grace', 1_001)

    expect(first.roomCode).toBe('bbbb2')
    expect(second.roomCode).not.toBe(first.roomCode)
    expect(server.snapshot('a'.repeat(32), first.roomCode)).toMatchObject({
      status: 'lobby',
      player: { name: 'Ada' },
    })
  })

  it('expires rooms from meaningful activity without connectivity traffic', () => {
    const server = new GameServer({
      lobbyMs: 100,
      playingMs: 200,
      finishedMs: 50,
    })
    const { roomCode } = server.createRoom('a'.repeat(32), 'Ada', 1_000)

    expect(server.snapshot('a'.repeat(32), roomCode).status).toBe('lobby')
    expect(server.expireRooms(1_099)).toEqual([])
    expect(server.expireRooms(1_100)).toEqual([roomCode])
    expect(server.expireRooms(1_101)).toEqual([])
    expect(server.snapshot('a'.repeat(32), roomCode)).toEqual({
      status: 'not_found',
      roomCode,
    })
  })

  it('uses the active-game idle window and starts a new process empty', () => {
    const expiration = { lobbyMs: 100, playingMs: 200, finishedMs: 50 }
    const server = new GameServer(expiration)
    const host = 'a'.repeat(32)
    const guest = 'b'.repeat(32)
    const { roomCode } = server.createRoom(host, 'Ada', 1_000)
    server.joinRoom(guest, roomCode, 'Grace', 1_001)
    server.startGame(host, roomCode, 1_002)

    expect(server.expireRooms(1_201)).toEqual([])
    expect(server.expireRooms(1_202)).toEqual([roomCode])
    expect(new GameServer(expiration).rooms.size).toBe(0)
  })

  it('deletes a lobby after its final member explicitly leaves', () => {
    const server = new GameServer()
    const token = 'a'.repeat(32)
    const { roomCode } = server.createRoom(token, 'Ada', 1_000)
    server.leaveRoom(token, roomCode, 1_001)
    expect(server.rooms.has(roomCode)).toBe(false)
  })
})
