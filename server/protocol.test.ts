import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GAME_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '../lib/game-protocol'
import { GameServer } from './game-server'
import { createGameSocketServer } from './protocol'

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>

const hostToken = 'a'.repeat(32)
const guestToken = 'b'.repeat(32)
const allowedOrigin = 'http://localhost:3100'

describe('Socket.IO game protocol', () => {
  let httpServer: HttpServer
  let socketServer: ReturnType<typeof createGameSocketServer>
  let url: string
  const clients: TestClient[] = []

  async function startServer(
    options: {
      expirationSweepMs?: number
      gameServer?: GameServer
      logger?: Pick<Console, 'info' | 'warn' | 'error'>
    } = {},
  ) {
    httpServer = createServer()
    socketServer = createGameSocketServer(httpServer, {
      allowedOrigins: [allowedOrigin],
      expirationSweepMs: options.expirationSweepMs ?? 60_000,
      gameServer: options.gameServer,
      logger: options.logger ?? { info() {}, warn() {}, error() {} },
    })
    await new Promise<void>((resolve) =>
      httpServer.listen(0, '127.0.0.1', resolve),
    )
    const address = httpServer.address() as AddressInfo
    url = `http://127.0.0.1:${address.port}`
  }

  beforeEach(async () => {
    await startServer()
  })

  afterEach(async () => {
    for (const client of clients) client.disconnect()
    clients.length = 0
    if (httpServer.listening) await socketServer.shutdown()
  })

  async function connect(token: string, forwardedFor?: string) {
    const client: TestClient = createClient(url, {
      auth: { token, protocolVersion: GAME_PROTOCOL_VERSION },
      extraHeaders: {
        Origin: allowedOrigin,
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      },
      forceNew: true,
      transports: ['websocket'],
    })
    clients.push(client)
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
    })
    return client
  }

  it('runs create, join, scoring, cooldown, and reconnect across isolated clients', async () => {
    const host = await connect(hostToken)
    const guest = await connect(guestToken)

    const created = await host.emitWithAck('room:create', { name: 'Ada' })
    expect(created.status).toBe('success')
    if (created.status !== 'success') return
    const roomCode = created.roomCode

    const hostLobbyPromise = nextSnapshot(host, 'lobby')
    const guestLobbyPromise = nextSnapshot(guest, 'lobby')
    expect(
      await guest.emitWithAck('room:join', { roomCode, name: 'Grace' }),
    ).toEqual({ status: 'success', roomCode })
    const [hostLobby, guestLobby] = await Promise.all([
      hostLobbyPromise,
      guestLobbyPromise,
    ])
    expect(hostLobby.members.map((member) => member.name)).toEqual([
      'Ada',
      'Grace',
    ])
    expect(guestLobby.player.playerId).not.toBe(hostLobby.player.playerId)

    const hostPlayingPromise = nextSnapshot(host, 'playing')
    const guestPlayingPromise = nextSnapshot(guest, 'playing')
    expect(await host.emitWithAck('game:start', { roomCode })).toEqual({
      status: 'success',
    })
    const [hostPlaying, guestPlaying] = await Promise.all([
      hostPlayingPromise,
      guestPlayingPromise,
    ])
    expect(guestPlaying.scoreboard).toEqual(hostPlaying.scoreboard)

    const incorrectSymbol = hostPlaying.cards[1]?.symbolIds.find(
      (symbol) => symbol !== sharedSymbol(hostPlaying),
    )
    expect(incorrectSymbol).toBeTruthy()
    const incorrectHostSnapshot = nextSnapshot(host, 'playing')
    const incorrectGuestSnapshot = nextSnapshot(guest, 'playing')
    const incorrect = await host.emitWithAck('game:claim', {
      roomCode,
      commandId: 'incorrect-command-1',
      pairRevision: hostPlaying.pairRevision,
      firstSymbolId: sharedSymbol(hostPlaying),
      secondSymbolId: incorrectSymbol ?? 'moon',
    })
    expect(incorrect).toMatchObject({ status: 'incorrect' })
    const [afterIncorrectHost] = await Promise.all([
      incorrectHostSnapshot,
      incorrectGuestSnapshot,
    ])
    expect(afterIncorrectHost.cooldownUntil).toEqual(expect.any(Number))

    const hostScoredPromise = nextSnapshot(host, 'playing')
    const guestScoredPromise = nextSnapshot(guest, 'playing')
    expect(
      await guest.emitWithAck(
        'game:claim',
        correctClaim(guestPlaying, roomCode, 'guest-command-1'),
      ),
    ).toEqual({ status: 'success' })
    const [, guestScored] = await Promise.all([
      hostScoredPromise,
      guestScoredPromise,
    ])
    expect(
      guestScored.scoreboard.find((entry) => entry.name === 'Grace')?.score,
    ).toBe(1)

    const guestPlayerId = guestScored.player.playerId
    guest.disconnect()
    const reconnected = await connect(guestToken)
    const resumed = await reconnected.emitWithAck('session:resume', {
      roomCode,
    })
    expect(resumed).toMatchObject({
      status: 'success',
      snapshot: {
        status: 'playing',
        player: { playerId: guestPlayerId },
      },
    })
  })

  it('serializes competing claims so only one client scores', async () => {
    const host = await connect(hostToken)
    const guest = await connect(guestToken)
    const created = await host.emitWithAck('room:create', { name: 'Ada' })
    if (created.status !== 'success') throw new Error('Unable to create room.')
    const roomCode = created.roomCode
    await guest.emitWithAck('room:join', { roomCode, name: 'Grace' })

    const playingPromise = nextSnapshot(host, 'playing')
    await host.emitWithAck('game:start', { roomCode })
    const snapshot = await playingPromise
    const [hostResult, guestResult] = await Promise.all([
      host.emitWithAck(
        'game:claim',
        correctClaim(snapshot, roomCode, 'host-race-command'),
      ),
      guest.emitWithAck(
        'game:claim',
        correctClaim(snapshot, roomCode, 'guest-race-command'),
      ),
    ])

    expect([hostResult.status, guestResult.status].sort()).toEqual([
      'stale',
      'success',
    ])
    const state = socketServer.gameServer.snapshot(hostToken, roomCode)
    expect(state.status).toBe('playing')
    if (state.status === 'playing') {
      expect(
        state.scoreboard.reduce((total, player) => total + player.score, 0),
      ).toBe(1)
    }
  })

  it('rejects malformed auth and disallowed browser origins', async () => {
    const invalidAuth = createClient(url, {
      auth: { token: 'bad', protocolVersion: GAME_PROTOCOL_VERSION },
      forceNew: true,
      transports: ['websocket'],
    })
    const disallowedOrigin = createClient(url, {
      auth: { token: hostToken, protocolVersion: GAME_PROTOCOL_VERSION },
      extraHeaders: { Origin: 'https://malicious.example' },
      forceNew: true,
      transports: ['websocket'],
    })
    clients.push(invalidAuth as TestClient, disallowedOrigin as TestClient)

    await expect(connectError(invalidAuth as TestClient)).resolves.toMatch(
      /invalid game session/i,
    )
    await expect(
      connectError(disallowedOrigin as TestClient),
    ).resolves.toBeTruthy()
  })

  it('returns typed failures for malformed and rate-limited commands', async () => {
    const client = await connect(hostToken)

    expect(await client.emitWithAck('room:create', { name: '' })).toEqual({
      status: 'invalid',
      message: 'Invalid command payload.',
    })

    const results = await Promise.all(
      Array.from({ length: 45 }, () =>
        client.emitWithAck('session:resume', {}),
      ),
    )
    expect(results.some((result) => result.status === 'rate_limited')).toBe(
      true,
    )
  })

  it('rate limits entry commands by Caddy-forwarded client address', async () => {
    const first = await connect(hostToken, '203.0.113.10')
    const second = await connect(guestToken, '203.0.113.11')

    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect(
        await first.emitWithAck('room:create', { name: `Ada ${attempt}` }),
      ).toMatchObject({ status: 'success' })
      expect(
        await second.emitWithAck('room:create', { name: `Grace ${attempt}` }),
      ).toMatchObject({ status: 'success' })
    }

    expect(
      await first.emitWithAck('room:create', { name: 'Ada limited' }),
    ).toMatchObject({ status: 'rate_limited' })
    expect(
      await second.emitWithAck('room:create', { name: 'Grace limited' }),
    ).toMatchObject({ status: 'rate_limited' })
  })

  it('rate limits room-code resume probes as entry commands', async () => {
    const client = await connect(hostToken, '203.0.113.12')

    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect(
        await client.emitWithAck('session:resume', { roomCode: 'bcdf2' }),
      ).toMatchObject({ status: 'success' })
    }
    expect(
      await client.emitWithAck('session:resume', { roomCode: 'bcdf2' }),
    ).toMatchObject({ status: 'rate_limited' })
  })

  it('contains command failures without terminating the socket server', async () => {
    const client = await connect(hostToken)
    vi.spyOn(socketServer.gameServer, 'snapshot').mockImplementationOnce(() => {
      throw new Error('Injected snapshot failure')
    })

    expect(
      await client.emitWithAck('session:resume', { roomCode: 'bcdf2' }),
    ).toEqual({
      status: 'server_unavailable',
      message: 'The command could not be processed. Please try again.',
    })
    expect(await client.emitWithAck('session:resume', {})).toEqual({
      status: 'success',
    })
    expect(client.connected).toBe(true)
  })

  it('contains expiration sweep failures without terminating the socket server', async () => {
    await socketServer.shutdown()
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const gameServer = new GameServer()
    vi.spyOn(gameServer, 'expireRooms').mockImplementationOnce(() => {
      throw new Error('Injected expiration failure')
    })
    await startServer({ expirationSweepMs: 5, gameServer, logger })
    const client = await connect(hostToken)

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('expiration_sweep_failed'),
      )
    })
    expect(await client.emitWithAck('session:resume', {})).toEqual({
      status: 'success',
    })
    expect(client.connected).toBe(true)
  })

  it('continues expiration cleanup after a room notification fails', async () => {
    await socketServer.shutdown()
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const gameServer = new GameServer()
    vi.spyOn(gameServer, 'expireRooms').mockReturnValueOnce(['bcdf2', 'cdfg3'])
    await startServer({ expirationSweepMs: 100, gameServer, logger })
    const originalTo = socketServer.io.to.bind(socketServer.io)
    const to = vi.spyOn(socketServer.io, 'to')
    to.mockImplementationOnce(
      () =>
        ({
          emit() {
            throw new Error('Injected room notification failure')
          },
        }) as unknown as ReturnType<typeof socketServer.io.to>,
    )
    to.mockImplementation((room) => originalTo(room))

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('expiration_room_failed'),
      )
      expect(to).toHaveBeenCalledWith('cdfg3')
    })
  })

  it('notifies sockets when an idle room expires and when the server shuts down', async () => {
    await socketServer.shutdown()
    await startServer({
      expirationSweepMs: 5,
      gameServer: new GameServer({
        lobbyMs: 50,
        playingMs: 1_000,
        finishedMs: 1_000,
      }),
    })
    const client = await connect(hostToken)
    const created = await client.emitWithAck('room:create', { name: 'Ada' })
    if (created.status !== 'success') throw new Error(created.message)
    const roomCode = created.roomCode
    const expired = new Promise<{ roomCode: string; reason: 'idle' }>(
      (resolve) => client.once('room:expired', resolve),
    )

    await expect(expired).resolves.toEqual({ roomCode, reason: 'idle' })
    await vi.waitFor(async () => {
      expect(await socketServer.io.in(roomCode).fetchSockets()).toHaveLength(0)
    })

    const shuttingDown = new Promise<void>((resolve) =>
      client.once('server:shutdown', resolve),
    )
    const shutdown = socketServer.shutdown()
    await expect(shuttingDown).resolves.toBeUndefined()
    await shutdown
  })

  it('emits no application heartbeat while an idle socket stays connected', async () => {
    const client = await connect(hostToken)
    const received: string[] = []
    const outgoing: string[] = []
    client.onAny((event) => received.push(event))
    client.onAnyOutgoing((event) => outgoing.push(event))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(received).toEqual([])
    expect(outgoing).toEqual([])
  })
})

function nextSnapshot<TStatus extends RoomSnapshot['status']>(
  client: TestClient,
  status: TStatus,
) {
  return new Promise<Extract<RoomSnapshot, { status: TStatus }>>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${status} snapshot.`)),
        2_000,
      )
      const handler = (snapshot: RoomSnapshot) => {
        if (snapshot.status !== status) return
        clearTimeout(timeout)
        client.off('room:snapshot', handler)
        resolve(snapshot as Extract<RoomSnapshot, { status: TStatus }>)
      }
      client.on('room:snapshot', handler)
    },
  )
}

function correctClaim(
  snapshot: Extract<RoomSnapshot, { status: 'playing' }>,
  roomCode: string,
  commandId: string,
) {
  const symbol = sharedSymbol(snapshot)
  return {
    roomCode,
    commandId,
    pairRevision: snapshot.pairRevision,
    firstSymbolId: symbol,
    secondSymbolId: symbol,
  }
}

function sharedSymbol(snapshot: Extract<RoomSnapshot, { status: 'playing' }>) {
  const symbol = snapshot.cards[0]?.symbolIds.find((candidate) =>
    snapshot.cards[1]?.symbolIds.includes(candidate),
  )
  if (!symbol) throw new Error('Cards do not share a symbol.')
  return symbol
}

function connectError(client: TestClient) {
  return new Promise<string>((resolve) => {
    client.once('connect_error', (error) => resolve(error.message))
  })
}
