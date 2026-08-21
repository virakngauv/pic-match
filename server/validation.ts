import {
  GAME_PROTOCOL_VERSION,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type MatchClaimCommand,
  type RoomCommandPayload,
  type SessionResumePayload,
  type SocketHandshakeAuth,
} from '../lib/game-protocol'

export const CLIENT_TOKEN_PATTERN = /^[0-9a-f]{32}$/
export const ROOM_CODE_PATTERN = /^[bcdfghkpqrstvz]{4}[2-9y]$/
export const COMMAND_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
export const SYMBOL_ID_PATTERN = /^[a-z0-9-]{1,32}$/
export const MAX_PLAYER_NAME_LENGTH = 50
const UNSAFE_PLAYER_NAME_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g

type UnknownRecord = Record<string, unknown>

export function parseHandshakeAuth(value: unknown): SocketHandshakeAuth | null {
  if (!isRecord(value)) return null

  return value.protocolVersion === GAME_PROTOCOL_VERSION &&
    typeof value.token === 'string' &&
    CLIENT_TOKEN_PATTERN.test(value.token)
    ? { token: value.token, protocolVersion: GAME_PROTOCOL_VERSION }
    : null
}

export function parseSessionResume(
  value: unknown,
): SessionResumePayload | null {
  if (!isRecord(value)) return null
  if (value.roomCode === undefined) return {}
  const roomCode = parseRoomCode(value.roomCode)
  return roomCode ? { roomCode } : null
}

export function parseCreateRoom(value: unknown): CreateRoomPayload | null {
  if (!isRecord(value)) return null
  const name = parsePlayerName(value.name)
  return name ? { name } : null
}

export function parseJoinRoom(value: unknown): JoinRoomPayload | null {
  if (!isRecord(value)) return null
  const roomCode = parseRoomCode(value.roomCode)
  const name = parsePlayerName(value.name)
  return roomCode && name ? { roomCode, name } : null
}

export function parseRoomCommand(value: unknown): RoomCommandPayload | null {
  if (!isRecord(value)) return null
  const roomCode = parseRoomCode(value.roomCode)
  return roomCode ? { roomCode } : null
}

export function parseMatchClaim(value: unknown): MatchClaimCommand | null {
  if (!isRecord(value)) return null
  const roomCode = parseRoomCode(value.roomCode)

  if (
    !roomCode ||
    typeof value.commandId !== 'string' ||
    !COMMAND_ID_PATTERN.test(value.commandId) ||
    !Number.isInteger(value.pairRevision) ||
    (value.pairRevision as number) < 0 ||
    typeof value.firstSymbolId !== 'string' ||
    !SYMBOL_ID_PATTERN.test(value.firstSymbolId) ||
    typeof value.secondSymbolId !== 'string' ||
    !SYMBOL_ID_PATTERN.test(value.secondSymbolId)
  ) {
    return null
  }

  return {
    roomCode,
    commandId: value.commandId,
    pairRevision: value.pairRevision as number,
    firstSymbolId: value.firstSymbolId,
    secondSymbolId: value.secondSymbolId,
  }
}

export function parseRoomCode(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null
}

export function parsePlayerName(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(UNSAFE_PLAYER_NAME_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.length > 0 && normalized.length <= MAX_PLAYER_NAME_LENGTH
    ? normalized
    : null
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
