export const GAME_PROTOCOL_VERSION = 1 as const

export type RoomPhase = 'lobby' | 'playing' | 'finished'
export type PlayerRole = 'host' | 'player'

export type PlayerIdentity = {
  playerId: string
  name: string
  role: PlayerRole
}

export type GamePlayerIdentity = PlayerIdentity & { position: number }
export type ScoreboardEntry = GamePlayerIdentity & { score: number }
export type GameCardSnapshot = { id: string; symbolIds: string[] }
export type LastAcceptedClaim = {
  scorerId: string
  scorerName: string
  symbolId: string
  pairRevision: number
}

export type RoomSnapshot =
  | { status: 'not_found'; roomCode: string }
  | { status: 'joinable'; roomCode: string }
  | { status: 'game_in_progress'; roomCode: string }
  | {
      status: 'lobby'
      roomCode: string
      revision: number
      members: PlayerIdentity[]
      player: PlayerIdentity & { position: null }
    }
  | {
      status: 'playing'
      roomCode: string
      revision: number
      player: GamePlayerIdentity
      pairRevision: number
      cards: GameCardSnapshot[]
      scoreboard: ScoreboardEntry[]
      lastAcceptedClaim: LastAcceptedClaim | null
      cooldownUntil: number | null
    }
  | {
      status: 'finished'
      roomCode: string
      revision: number
      player: GamePlayerIdentity
      winner: ScoreboardEntry
      scoreboard: ScoreboardEntry[]
    }

export type CommandFailureStatus =
  | 'invalid'
  | 'forbidden'
  | 'room_not_found'
  | 'room_full'
  | 'game_in_progress'
  | 'stale'
  | 'incorrect'
  | 'cooldown'
  | 'rate_limited'
  | 'server_unavailable'

export type CommandSuccess<T extends object = Record<never, never>> = {
  status: 'success'
} & T

export type CommandFailure = {
  status: CommandFailureStatus
  message: string
  cooldownUntil?: number
}

export type CommandResult<T extends object = Record<never, never>> =
  CommandSuccess<T> | CommandFailure

export type SessionResumePayload = { roomCode?: string }
export type CreateRoomPayload = { name: string }
export type JoinRoomPayload = { roomCode: string; name: string }
export type RoomCommandPayload = { roomCode: string }
export type MatchClaimCommand = RoomCommandPayload & {
  commandId: string
  pairRevision: number
  firstSymbolId: string
  secondSymbolId: string
}

export type ClientToServerEvents = {
  'session:resume': (
    payload: SessionResumePayload,
    acknowledge: (result: CommandResult<{ snapshot?: RoomSnapshot }>) => void,
  ) => void
  'room:create': (
    payload: CreateRoomPayload,
    acknowledge: (result: CommandResult<{ roomCode: string }>) => void,
  ) => void
  'room:join': (
    payload: JoinRoomPayload,
    acknowledge: (result: CommandResult<{ roomCode: string }>) => void,
  ) => void
  'room:leave': (
    payload: RoomCommandPayload,
    acknowledge: (result: CommandResult) => void,
  ) => void
  'game:start': (
    payload: RoomCommandPayload,
    acknowledge: (result: CommandResult) => void,
  ) => void
  'game:claim': (
    payload: MatchClaimCommand,
    acknowledge: (result: CommandResult) => void,
  ) => void
  'game:prepare-rematch': (
    payload: RoomCommandPayload,
    acknowledge: (result: CommandResult) => void,
  ) => void
}

export type ServerToClientEvents = {
  'room:snapshot': (snapshot: RoomSnapshot) => void
  'room:expired': (payload: { roomCode: string; reason: 'idle' }) => void
  'server:shutdown': () => void
}

export type SocketHandshakeAuth = {
  token: string
  protocolVersion: typeof GAME_PROTOCOL_VERSION
}
