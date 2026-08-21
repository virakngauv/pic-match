import type { Server as HttpServer } from 'node:http'

import { Server, type Socket } from 'socket.io'

import type {
  ClientToServerEvents,
  CommandFailure,
  CommandResult,
  RoomSnapshot,
  ServerToClientEvents,
} from '../lib/game-protocol'
import { GameServer } from './game-server'
import {
  parseCreateRoom,
  parseHandshakeAuth,
  parseJoinRoom,
  parseMatchClaim,
  parseRoomCommand,
  parseSessionResume,
} from './validation'

type InterServerEvents = Record<string, never>
type SocketData = { token: string; address: string }
type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export type GameSocketServerOptions = {
  allowedOrigins: string[]
  gameServer?: GameServer
  expirationSweepMs?: number
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

const invalid = (): CommandFailure => ({
  status: 'invalid',
  message: 'Invalid command payload.',
})

export function createGameSocketServer(
  httpServer: HttpServer,
  options: GameSocketServerOptions,
) {
  const gameServer = options.gameServer ?? new GameServer()
  const logger = options.logger ?? console
  const allowedOrigins = new Set(options.allowedOrigins)
  const socketCommands = new SlidingWindowRateLimiter(40, 10_000)
  const playerCommands = new SlidingWindowRateLimiter(80, 10_000)
  const entryCommands = new SlidingWindowRateLimiter(12, 60_000)
  let acceptingCommands = true

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    maxHttpBufferSize: 16 * 1_024,
    cors: {
      credentials: false,
      origin(origin, callback) {
        callback(null, origin === undefined || allowedOrigins.has(origin))
      },
    },
    allowRequest(request, callback) {
      const origin = request.headers.origin
      callback(null, origin === undefined || allowedOrigins.has(origin))
    },
  })

  io.use((socket, next) => {
    const auth = parseHandshakeAuth(socket.handshake.auth)
    if (!auth) return next(new Error('Unsupported or invalid game session.'))
    socket.data.token = auth.token
    socket.data.address = clientAddress(socket)
    next()
  })

  io.on('connection', (socket) => {
    logger.info(
      JSON.stringify({ event: 'socket_connected', socketId: socket.id }),
    )

    socket.on('session:resume', (payload, acknowledge) => {
      const parsed = parseSessionResume(payload)
      if (!canRun(socket, acknowledge, parsed?.roomCode !== undefined)) return
      safely('session:resume', acknowledge, async () => {
        if (!parsed) return acknowledge(invalid())
        if (!parsed.roomCode) return acknowledge({ status: 'success' })

        const snapshot = gameServer.snapshot(socket.data.token, parsed.roomCode)
        if (isMemberSnapshot(snapshot)) await socket.join(parsed.roomCode)
        socket.emit('room:snapshot', snapshot)
        acknowledge({ status: 'success', snapshot })
      })
    })

    socket.on('room:create', (payload, acknowledge) => {
      if (!canRun(socket, acknowledge, true)) return
      safely('room:create', acknowledge, async () => {
        const parsed = parseCreateRoom(payload)
        if (!parsed) return acknowledge(invalid())

        const result = gameServer.createRoom(socket.data.token, parsed.name)
        if (result.status !== 'success') return acknowledge(result)
        await socket.join(result.roomCode)
        acknowledge(result)
        broadcastSnapshots(result.roomCode)
      })
    })

    socket.on('room:join', (payload, acknowledge) => {
      if (!canRun(socket, acknowledge, true)) return
      safely('room:join', acknowledge, async () => {
        const parsed = parseJoinRoom(payload)
        if (!parsed) return acknowledge(invalid())

        const result = gameServer.joinRoom(
          socket.data.token,
          parsed.roomCode,
          parsed.name,
        )
        if (result.status !== 'success') return acknowledge(result)
        await socket.join(parsed.roomCode)
        acknowledge(result)
        broadcastSnapshots(parsed.roomCode)
      })
    })

    socket.on('room:leave', (payload, acknowledge) => {
      if (!canRun(socket, acknowledge)) return
      safely('room:leave', acknowledge, async () => {
        const parsed = parseRoomCommand(payload)
        if (!parsed) return acknowledge(invalid())

        const result = gameServer.leaveRoom(socket.data.token, parsed.roomCode)
        await socket.leave(parsed.roomCode)
        acknowledge(result)
        broadcastSnapshots(parsed.roomCode)
      })
    })

    socket.on('game:start', (payload, acknowledge) => {
      if (!canRun(socket, acknowledge)) return
      safely('game:start', acknowledge, () => {
        const parsed = parseRoomCommand(payload)
        if (!parsed) return acknowledge(invalid())
        const result = gameServer.startGame(socket.data.token, parsed.roomCode)
        acknowledge(result)
        if (result.status === 'success') broadcastSnapshots(parsed.roomCode)
      })
    })

    socket.on('game:claim', (payload, acknowledge) => {
      if (!canRun(socket, acknowledge)) return
      safely('game:claim', acknowledge, () => {
        const parsed = parseMatchClaim(payload)
        if (!parsed) return acknowledge(invalid())
        const before = gameServer.snapshot(socket.data.token, parsed.roomCode)
        const result = gameServer.claim(socket.data.token, parsed)
        const after = gameServer.snapshot(socket.data.token, parsed.roomCode)
        acknowledge(result)
        if (snapshotRevision(after) !== snapshotRevision(before)) {
          broadcastSnapshots(parsed.roomCode)
        }
      })
    })

    socket.on('game:prepare-rematch', (payload, acknowledge) => {
      if (!canRun(socket, acknowledge)) return
      safely('game:prepare-rematch', acknowledge, () => {
        const parsed = parseRoomCommand(payload)
        if (!parsed) return acknowledge(invalid())
        const result = gameServer.prepareRematch(
          socket.data.token,
          parsed.roomCode,
        )
        acknowledge(result)
        if (result.status === 'success') broadcastSnapshots(parsed.roomCode)
      })
    })

    socket.on('disconnect', (reason) => {
      socketCommands.delete(socket.id)
      logger.info(
        JSON.stringify({
          event: 'socket_disconnected',
          socketId: socket.id,
          reason,
        }),
      )
    })
  })

  const sweepTimer = setInterval(() => {
    for (const roomCode of gameServer.expireRooms()) {
      io.to(roomCode).emit('room:expired', { roomCode, reason: 'idle' })
      void io.in(roomCode).socketsLeave(roomCode)
    }
  }, options.expirationSweepMs ?? 60_000)
  sweepTimer.unref()

  async function emitSnapshots(roomCode: string) {
    const sockets = await io.in(roomCode).fetchSockets()
    for (const roomSocket of sockets) {
      try {
        roomSocket.emit(
          'room:snapshot',
          gameServer.snapshot(roomSocket.data.token, roomCode),
        )
      } catch (error) {
        logFailure('snapshot_failed', error)
      }
    }
  }

  function broadcastSnapshots(roomCode: string) {
    void emitSnapshots(roomCode).catch((error: unknown) => {
      logFailure('snapshot_broadcast_failed', error)
    })
  }

  function safely<TResult extends object>(
    command: string,
    acknowledge: (result: CommandResult<TResult>) => void,
    run: () => void | Promise<void>,
  ) {
    const fail = (error: unknown) => {
      logFailure('command_failed', error, command)
      acknowledge({
        status: 'server_unavailable',
        message: 'The command could not be processed. Please try again.',
      })
    }

    try {
      const pending = run()
      if (pending) void pending.catch(fail)
    } catch (error) {
      fail(error)
    }
  }

  function logFailure(event: string, error: unknown, command?: string) {
    logger.error(
      JSON.stringify({
        event,
        command,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    )
  }

  function canRun(
    socket: GameSocket,
    acknowledge: (result: CommandFailure) => void,
    isEntryCommand = false,
  ) {
    if (!acceptingCommands) {
      acknowledge({
        status: 'server_unavailable',
        message: 'The game server is restarting.',
      })
      return false
    }

    const now = Date.now()
    const permitted =
      socketCommands.take(socket.id, now) &&
      playerCommands.take(socket.data.token, now)
    const entryPermitted =
      !isEntryCommand ||
      isLoopbackAddress(socket.data.address) ||
      entryCommands.take(socket.data.address, now)
    if (!permitted || !entryPermitted) {
      acknowledge({ status: 'rate_limited', message: 'Too many commands.' })
      return false
    }
    return true
  }

  return {
    io,
    gameServer,
    async shutdown() {
      acceptingCommands = false
      clearInterval(sweepTimer)
      io.emit('server:shutdown')
      await new Promise<void>((resolve) => io.close(() => resolve()))
    },
  }
}

function isMemberSnapshot(snapshot: RoomSnapshot) {
  return (
    snapshot.status === 'lobby' ||
    snapshot.status === 'playing' ||
    snapshot.status === 'finished'
  )
}

function snapshotRevision(snapshot: RoomSnapshot) {
  return 'revision' in snapshot ? snapshot.revision : null
}

function clientAddress(socket: GameSocket) {
  const directAddress = socket.handshake.address
  if (!isLoopbackAddress(directAddress)) return directAddress

  const forwarded = socket.handshake.headers['x-forwarded-for']
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return forwardedValue?.split(',')[0]?.trim() || directAddress
}

function isLoopbackAddress(address: string) {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address.startsWith('::ffff:127.')
  )
}

class SlidingWindowRateLimiter {
  private readonly attempts = new Map<string, number[]>()
  private readonly maxKeys = 10_000

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now: number) {
    if (!this.attempts.has(key) && this.attempts.size >= this.maxKeys) {
      const oldestKey = this.attempts.keys().next().value as string | undefined
      if (oldestKey) this.attempts.delete(oldestKey)
    }
    const cutoff = now - this.windowMs
    const attempts = (this.attempts.get(key) ?? []).filter(
      (attempt) => attempt > cutoff,
    )
    if (attempts.length >= this.limit) {
      this.attempts.set(key, attempts)
      return false
    }
    attempts.push(now)
    this.attempts.set(key, attempts)
    return true
  }

  delete(key: string) {
    this.attempts.delete(key)
  }
}
