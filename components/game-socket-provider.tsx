'use client'

import { io, type Socket } from 'socket.io-client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { usePlayerSession } from '@/components/player-session-provider'
import {
  GAME_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type CommandResult,
  type MatchClaimCommand,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '@/lib/game-protocol'

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'
type RoomEndedReason = 'expired' | 'server_restart'

type GameSocketContextValue = {
  connectionStatus: ConnectionStatus
  snapshots: Readonly<Record<string, RoomSnapshot>>
  endedRooms: Readonly<Record<string, RoomEndedReason>>
  watchRoom: (roomCode: string) => () => void
  createRoom: (name: string) => Promise<CommandResult<{ roomCode: string }>>
  joinRoom: (
    roomCode: string,
    name: string,
  ) => Promise<CommandResult<{ roomCode: string }>>
  leaveRoom: (roomCode: string) => Promise<CommandResult>
  startGame: (roomCode: string) => Promise<CommandResult>
  claimMatch: (claim: MatchClaimCommand) => Promise<CommandResult>
  prepareRematch: (roomCode: string) => Promise<CommandResult>
}

const GameSocketContext = createContext<GameSocketContextValue | null>(null)
const COMMAND_TIMEOUT_MS = 6_000

export function GameSocketProvider({ children }: { children: ReactNode }) {
  const { clientToken, ensureClientToken } = usePlayerSession()
  const socketRef = useRef<GameSocket | null>(null)
  const watchedRoomsRef = useRef(new Map<string, number>())
  const memberRoomsRef = useRef(new Set<string>())
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting')
  const [snapshots, setSnapshots] = useState<Record<string, RoomSnapshot>>({})
  const [endedRooms, setEndedRooms] = useState<Record<string, RoomEndedReason>>(
    {},
  )

  useEffect(() => {
    if (clientToken === null) ensureClientToken()
  }, [clientToken, ensureClientToken])

  useEffect(() => {
    if (!clientToken) return

    const gameServerUrl =
      process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3200'
    const socket: GameSocket = io(gameServerUrl, {
      auth: { token: clientToken, protocolVersion: GAME_PROTOCOL_VERSION },
      autoConnect: true,
      reconnection: true,
    })
    socketRef.current = socket

    const resumeWatchedRooms = () => {
      setConnectionStatus('connected')
      for (const roomCode of watchedRoomsRef.current.keys()) {
        socket.emit('session:resume', { roomCode }, (result) => {
          if (result.status === 'success' && result.snapshot) {
            receiveSnapshot(result.snapshot)
          }
        })
      }
    }
    const receiveSnapshot = (snapshot: RoomSnapshot) => {
      if (isMemberSnapshot(snapshot)) {
        memberRoomsRef.current.add(snapshot.roomCode)
        setEndedRooms((rooms) => {
          if (!(snapshot.roomCode in rooms)) return rooms
          const next = { ...rooms }
          delete next[snapshot.roomCode]
          return next
        })
      } else if (
        snapshot.status === 'not_found' &&
        memberRoomsRef.current.has(snapshot.roomCode)
      ) {
        setEndedRooms((rooms) => ({
          ...rooms,
          [snapshot.roomCode]: 'server_restart',
        }))
      }
      setSnapshots((current) => {
        return { ...current, [snapshot.roomCode]: snapshot }
      })
    }
    const handleDisconnect = () => setConnectionStatus('disconnected')
    const handleConnectError = () => setConnectionStatus('disconnected')
    const handleExpired = ({ roomCode }: { roomCode: string }) => {
      memberRoomsRef.current.delete(roomCode)
      setEndedRooms((current) => ({ ...current, [roomCode]: 'expired' }))
      setSnapshots((current) => ({
        ...current,
        [roomCode]: { status: 'not_found', roomCode },
      }))
    }
    const handleShutdown = () => {
      const ended: Record<string, RoomEndedReason> = {}
      for (const roomCode of watchedRoomsRef.current.keys()) {
        ended[roomCode] = 'server_restart'
      }
      setEndedRooms((current) => ({ ...current, ...ended }))
      setConnectionStatus('disconnected')
    }

    socket.on('connect', resumeWatchedRooms)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('room:snapshot', receiveSnapshot)
    socket.on('room:expired', handleExpired)
    socket.on('server:shutdown', handleShutdown)

    return () => {
      socketRef.current = null
      socket.disconnect()
    }
  }, [clientToken])

  const watchRoom = useCallback((roomCode: string) => {
    const watchers = watchedRoomsRef.current
    watchers.set(roomCode, (watchers.get(roomCode) ?? 0) + 1)
    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit('session:resume', { roomCode }, (result) => {
        if (result.status === 'success' && result.snapshot) {
          setSnapshots((current) => ({
            ...current,
            [roomCode]: result.snapshot as RoomSnapshot,
          }))
        }
      })
    }

    return () => {
      const count = watchers.get(roomCode) ?? 0
      if (count <= 1) watchers.delete(roomCode)
      else watchers.set(roomCode, count - 1)
    }
  }, [])

  const createRoom = useCallback(
    async (name: string): Promise<CommandResult<{ roomCode: string }>> =>
      await runCommand(socketRef.current, (socket) =>
        socket.emitWithAck('room:create', { name }),
      ),
    [],
  )
  const joinRoom = useCallback(
    async (
      roomCode: string,
      name: string,
    ): Promise<CommandResult<{ roomCode: string }>> =>
      await runCommand(socketRef.current, (socket) =>
        socket.emitWithAck('room:join', { roomCode, name }),
      ),
    [],
  )
  const leaveRoom = useCallback(
    async (roomCode: string): Promise<CommandResult> =>
      await runCommand(socketRef.current, (socket) =>
        socket.emitWithAck('room:leave', { roomCode }),
      ),
    [],
  )
  const startGame = useCallback(
    async (roomCode: string): Promise<CommandResult> =>
      await runCommand(socketRef.current, (socket) =>
        socket.emitWithAck('game:start', { roomCode }),
      ),
    [],
  )
  const claimMatch = useCallback(
    async (claim: MatchClaimCommand): Promise<CommandResult> =>
      await runCommand(socketRef.current, (socket) =>
        socket.emitWithAck('game:claim', claim),
      ),
    [],
  )
  const prepareRematch = useCallback(
    async (roomCode: string): Promise<CommandResult> =>
      await runCommand(socketRef.current, (socket) =>
        socket.emitWithAck('game:prepare-rematch', { roomCode }),
      ),
    [],
  )

  const value = useMemo<GameSocketContextValue>(
    () => ({
      connectionStatus,
      snapshots,
      endedRooms,
      watchRoom,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      claimMatch,
      prepareRematch,
    }),
    [
      claimMatch,
      connectionStatus,
      createRoom,
      endedRooms,
      joinRoom,
      leaveRoom,
      prepareRematch,
      snapshots,
      startGame,
      watchRoom,
    ],
  )

  return (
    <GameSocketContext.Provider value={value}>
      {children}
    </GameSocketContext.Provider>
  )
}

export function useGameSocket() {
  const context = useContext(GameSocketContext)
  if (!context) {
    throw new Error('useGameSocket must be used within GameSocketProvider.')
  }
  return context
}

export function useRoomSnapshot(roomCode: string) {
  const { watchRoom, snapshots, endedRooms, connectionStatus } = useGameSocket()
  useEffect(() => watchRoom(roomCode), [roomCode, watchRoom])
  return {
    snapshot: snapshots[roomCode],
    endedReason: endedRooms[roomCode] ?? null,
    connectionStatus,
  }
}

async function runCommand<TResult>(
  socket: GameSocket | null,
  command: (connectedSocket: GameSocket) => Promise<TResult>,
): Promise<TResult> {
  if (!socket?.connected) return unavailable() as TResult

  try {
    return (await Promise.race([
      command(socket),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Command timed out.')),
          COMMAND_TIMEOUT_MS,
        ),
      ),
    ])) as TResult
  } catch {
    return unavailable() as TResult
  }
}

function unavailable(): CommandResult {
  return {
    status: 'server_unavailable',
    message: 'The game server is unavailable. Please try again.',
  }
}

function isMemberSnapshot(snapshot: RoomSnapshot) {
  return (
    snapshot.status === 'lobby' ||
    snapshot.status === 'playing' ||
    snapshot.status === 'finished'
  )
}
