import type { Server as HttpServer } from 'node:http'

import { Server, type Socket } from 'socket.io'

import {
  isMemberSnapshot,
  type ClientToServerEvents,
  type CommandFailure,
  type CommandResult,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '../lib/game-protocol'
import { GameServer } from './game-server'
import { createClaimStreakTracker } from './claim-streak'
import {
  createTelemetry,
  type RateLimitBudget,
  type Telemetry,
} from './telemetry'
import { isPrivateNetworkOrigin } from './origins'
import { isTrustedProxy } from './proxy-trust'
import {
  parseCreateRoom,
  parseHandshakeAuth,
  parseJoinRoom,
  parseMatchClaim,
  parseRemovePlayer,
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

export type EntryCommandLimits = {
  perPlayerPerMinute: number
  perAddressPerMinute: number
  globalPerMinute: number
}

export const DEFAULT_ENTRY_COMMAND_LIMITS: EntryCommandLimits = {
  perPlayerPerMinute: 30,
  perAddressPerMinute: 120,
  globalPerMinute: 2_000,
}

const LOOPBACK_PROXY_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1']

export type GameSocketServerOptions = {
  allowedOrigins: string[]
  allowPrivateNetworkOrigins?: boolean
  trustedProxyAddresses?: string[]
  gameServer?: GameServer
  expirationSweepMs?: number
  telemetryFlushIntervalMs?: number
  entryCommandLimits?: EntryCommandLimits
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

const invalid = (): CommandFailure => ({
  status: 'invalid',
  message: 'Invalid command payload.',
})

const GLOBAL_ENTRY_KEY = 'global'

export function createGameSocketServer(
  httpServer: HttpServer,
  options: GameSocketServerOptions,
) {
  const gameServer = options.gameServer ?? new GameServer()
  const logger = options.logger ?? console
  const allowedOrigins = new Set(options.allowedOrigins)
  const isOriginAllowed = (origin: string | undefined) =>
    origin === undefined ||
    allowedOrigins.has(origin) ||
    (options.allowPrivateNetworkOrigins === true &&
      isPrivateNetworkOrigin(origin))
  const trustedProxyAddresses = options.trustedProxyAddresses?.length
    ? options.trustedProxyAddresses
    : LOOPBACK_PROXY_ADDRESSES
  const entryLimits: EntryCommandLimits = {
    ...DEFAULT_ENTRY_COMMAND_LIMITS,
    ...options.entryCommandLimits,
  }
  const telemetry: Telemetry = createTelemetry(logger, {
    flushIntervalMs: options.telemetryFlushIntervalMs,
  })
  const claimStreaks = createClaimStreakTracker()
  const socketCommands = new SlidingWindowRateLimiter(40, 10_000)
  const playerCommands = new SlidingWindowRateLimiter(80, 10_000)
  const addressCommands = new SlidingWindowRateLimiter(400, 10_000)
  const playerEntryCommands = new SlidingWindowRateLimiter(
    entryLimits.perPlayerPerMinute,
    60_000,
  )
  const entryCommands = new SlidingWindowRateLimiter(
    entryLimits.perAddressPerMinute,
    60_000,
  )
  const globalEntryCommands = new SlidingWindowRateLimiter(
    entryLimits.globalPerMinute,
    60_000,
  )
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
        callback(null, isOriginAllowed(origin))
      },
    },
    allowRequest(request, callback) {
      const allowed = isOriginAllowed(request.headers.origin)
      if (!allowed) telemetry.handshakeRejected('origin_not_allowed')
      callback(null, allowed)
    },
  })

  io.use((socket, next) => {
    const auth = parseHandshakeAuth(socket.handshake.auth)
    if (!auth) {
      telemetry.handshakeRejected('invalid_auth')
      return next(new Error('Unsupported or invalid game session.'))
    }
    socket.data.token = auth.token
    socket.data.address = clientAddress(socket, trustedProxyAddresses)
    next()
  })

  io.on('connection', (socket) => {
    logger.info(
      JSON.stringify({ event: 'socket_connected', socketId: socket.id }),
    )

    socket.on('session:resume', (payload, acknowledge) => {
      const ack = trackOutcome('session:resume', acknowledge)
      const parsed = parseSessionResume(payload)
      if (!canRun(socket, ack)) return
      safely('session:resume', ack, async () => {
        if (!parsed) return ack(invalid())
        if (!parsed.roomCode) return ack({ status: 'success' })

        const snapshot = gameServer.snapshot(socket.data.token, parsed.roomCode)
        if (isMemberSnapshot(snapshot)) {
          await socket.join(parsed.roomCode)
        } else if (!takeEntryBudget(socket)) {
          telemetry.countRateLimited('entry')
          return ack({
            status: 'rate_limited',
            message: 'Too many commands.',
          })
        }
        socket.emit('room:snapshot', snapshot)
        ack({ status: 'success', snapshot })
      })
    })

    socket.on('room:create', (payload, acknowledge) => {
      const ack = trackOutcome('room:create', acknowledge)
      if (!canRun(socket, ack, true)) return
      safely('room:create', ack, async () => {
        const parsed = parseCreateRoom(payload)
        if (!parsed) return ack(invalid())

        const result = gameServer.createRoom(socket.data.token, parsed.name)
        if (result.status !== 'success') return ack(result)
        await socket.join(result.roomCode)
        ack(result)
        broadcastSnapshots(result.roomCode)
      })
    })

    socket.on('room:join', (payload, acknowledge) => {
      const ack = trackOutcome('room:join', acknowledge)
      if (!canRun(socket, ack, true)) return
      safely('room:join', ack, async () => {
        const parsed = parseJoinRoom(payload)
        if (!parsed) return ack(invalid())

        const result = gameServer.joinRoom(
          socket.data.token,
          parsed.roomCode,
          parsed.name,
        )
        if (result.status !== 'success') return ack(result)
        await socket.join(parsed.roomCode)
        ack(result)
        broadcastSnapshots(parsed.roomCode)
      })
    })

    socket.on('room:leave', (payload, acknowledge) => {
      const ack = trackOutcome('room:leave', acknowledge)
      if (!canRun(socket, ack)) return
      safely('room:leave', ack, async () => {
        const parsed = parseRoomCommand(payload)
        if (!parsed) return ack(invalid())

        const result = gameServer.leaveRoom(socket.data.token, parsed.roomCode)
        await socket.leave(parsed.roomCode)
        ack(result)
        broadcastSnapshots(parsed.roomCode)
      })
    })

    socket.on('room:remove-player', (payload, acknowledge) => {
      const ack = trackOutcome('room:remove-player', acknowledge)
      if (!canRun(socket, ack)) return
      safely('room:remove-player', ack, async () => {
        const parsed = parseRemovePlayer(payload)
        if (!parsed) return ack(invalid())

        const result = gameServer.removePlayer(
          socket.data.token,
          parsed.roomCode,
          parsed.playerId,
        )
        if (result.status !== 'success') return ack(result)

        try {
          await notifyRemovedPlayer(parsed.roomCode, result.removedToken)
        } catch (error) {
          logFailure('removed_player_notification_failed', error)
        }
        ack({ status: 'success' })
        broadcastSnapshots(parsed.roomCode)
      })
    })

    socket.on('game:start', (payload, acknowledge) => {
      const ack = trackOutcome('game:start', acknowledge)
      if (!canRun(socket, ack)) return
      safely('game:start', ack, () => {
        const parsed = parseRoomCommand(payload)
        if (!parsed) return ack(invalid())
        const result = gameServer.startGame(socket.data.token, parsed.roomCode)
        ack(result)
        if (result.status === 'success') {
          claimStreaks.forget(parsed.roomCode)
          broadcastSnapshots(parsed.roomCode)
        }
      })
    })

    socket.on('game:claim', (payload, acknowledge) => {
      const ack = trackOutcome('game:claim', acknowledge)
      if (!canRun(socket, ack)) return
      safely('game:claim', ack, () => {
        const parsed = parseMatchClaim(payload)
        if (!parsed) return ack(invalid())
        const before = gameServer.snapshot(socket.data.token, parsed.roomCode)
        const result = gameServer.claim(socket.data.token, parsed)
        const after = gameServer.snapshot(socket.data.token, parsed.roomCode)
        const stateChanged =
          snapshotRevision(after) !== snapshotRevision(before)
        ack(result)
        if (stateChanged) {
          reportClaimStreak(
            claimStreaks.record({
              roomCode: parsed.roomCode,
              status: result.status,
              pairRevision: parsed.pairRevision,
            }),
          )
          broadcastSnapshots(parsed.roomCode)
        }
      })
    })

    socket.on('game:prepare-rematch', (payload, acknowledge) => {
      const ack = trackOutcome('game:prepare-rematch', acknowledge)
      if (!canRun(socket, ack)) return
      safely('game:prepare-rematch', ack, () => {
        const parsed = parseRoomCommand(payload)
        if (!parsed) return ack(invalid())
        const result = gameServer.prepareRematch(
          socket.data.token,
          parsed.roomCode,
        )
        ack(result)
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
    const startedAt = Date.now()
    try {
      const expired = gameServer.expireRooms()
      for (const roomCode of expired) {
        claimStreaks.forget(roomCode)
        try {
          io.to(roomCode).emit('room:expired', { roomCode, reason: 'idle' })
          io.in(roomCode).socketsLeave(roomCode)
        } catch (error) {
          logFailure('expiration_room_failed', error)
        }
      }
      telemetry.expirationSweep(expired.length, Date.now() - startedAt)
    } catch (error) {
      logFailure('expiration_sweep_failed', error)
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

  async function notifyRemovedPlayer(roomCode: string, token: string) {
    const sockets = await io.fetchSockets()
    for (const roomSocket of sockets) {
      if (roomSocket.data.token !== token) continue
      try {
        roomSocket.emit('room:removed', { roomCode })
        await roomSocket.leave(roomCode)
      } catch (error) {
        logFailure('removed_player_socket_failed', error)
      }
    }
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

  function trackOutcome<TResult extends object>(
    command: string,
    acknowledge: (result: CommandResult<TResult>) => void,
  ) {
    return (result: CommandResult<TResult>) => {
      if (result.status !== 'success' && result.status !== 'rate_limited') {
        telemetry.countRejected(command, result.status)
      }
      acknowledge(result)
    }
  }

  function reportClaimStreak(event: ReturnType<typeof claimStreaks.record>) {
    if (event) {
      telemetry.claimStreak(
        event.roomCode,
        event.pairRevision,
        event.incorrectInARow,
      )
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
    const socketPermitted = socketCommands.take(socket.id, now)
    const playerPermitted =
      socketPermitted && playerCommands.take(socket.data.token, now)
    const addressPermitted =
      playerPermitted && addressCommands.take(socket.data.address, now)
    const permitted = addressPermitted
    const entryPermitted =
      !permitted || !isEntryCommand || takeEntryBudget(socket, now)
    if (!permitted || !entryPermitted) {
      const budget: RateLimitBudget = !socketPermitted
        ? 'socket'
        : !playerPermitted
          ? 'player'
          : !addressPermitted
            ? 'address'
            : 'entry'
      telemetry.countRateLimited(budget)
      acknowledge({ status: 'rate_limited', message: 'Too many commands.' })
      return false
    }
    return true
  }

  function entryKey(socket: GameSocket) {
    return isLoopbackAddress(socket.data.address)
      ? `${socket.data.address}:${socket.data.token}`
      : socket.data.address
  }

  function takeEntryBudget(socket: GameSocket, now = Date.now()) {
    return (
      playerEntryCommands.take(socket.data.token, now) &&
      entryCommands.take(entryKey(socket), now) &&
      globalEntryCommands.take(GLOBAL_ENTRY_KEY, now)
    )
  }

  return {
    io,
    gameServer,
    telemetry,
    async shutdown() {
      acceptingCommands = false
      telemetry.shutdownStarted()
      clearInterval(sweepTimer)
      io.emit('server:shutdown')
      await new Promise<void>((resolve) => io.close(() => resolve()))
      telemetry.dispose()
      telemetry.shutdownCompleted()
    },
  }
}

function snapshotRevision(snapshot: RoomSnapshot) {
  return 'revision' in snapshot ? snapshot.revision : null
}

function clientAddress(socket: GameSocket, trustedProxies: string[]) {
  const directAddress = socket.handshake.address
  if (!isTrustedProxy(directAddress, trustedProxies)) return directAddress

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
    this.attempts.delete(key)
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
