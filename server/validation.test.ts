import { describe, expect, it } from 'vitest'

import {
  negotiateHandshakeAuth,
  parsePlayerName,
  parseRemovePlayer,
} from './validation'

describe('negotiateHandshakeAuth', () => {
  const token = 'a'.repeat(32)

  it('accepts current and compatible adjacent client ranges', () => {
    expect(
      negotiateHandshakeAuth({
        token,
        protocolVersion: 1,
        minProtocolVersion: 1,
      }),
    ).toMatchObject({
      status: 'success',
      auth: { negotiatedProtocolVersion: 1, legacyExactVersion: false },
    })
    expect(
      negotiateHandshakeAuth({
        token,
        protocolVersion: 2,
        minProtocolVersion: 1,
      }),
    ).toMatchObject({
      status: 'success',
      auth: { negotiatedProtocolVersion: 1 },
    })
  })

  it('supports older-client/newer-server and newer-client/older-server rollouts', () => {
    expect(
      negotiateHandshakeAuth(
        { token, protocolVersion: 1, minProtocolVersion: 1 },
        { currentVersion: 2, minSupportedVersion: 1 },
      ),
    ).toMatchObject({
      status: 'success',
      auth: { negotiatedProtocolVersion: 1 },
    })
    expect(
      negotiateHandshakeAuth(
        { token, protocolVersion: 3, minProtocolVersion: 2 },
        { currentVersion: 2, minSupportedVersion: 1 },
      ),
    ).toMatchObject({
      status: 'success',
      auth: { negotiatedProtocolVersion: 2 },
    })
  })

  it('keeps legacy clients on exact-version semantics', () => {
    expect(
      negotiateHandshakeAuth(
        { token, protocolVersion: 1 },
        { currentVersion: 2, minSupportedVersion: 1 },
      ),
    ).toMatchObject({ status: 'unsupported_protocol' })
  })

  it('distinguishes malformed auth from non-overlapping ranges', () => {
    expect(
      negotiateHandshakeAuth({
        token: 'bad',
        protocolVersion: 1,
        minProtocolVersion: 1,
      }),
    ).toEqual({ status: 'invalid_auth' })
    expect(
      negotiateHandshakeAuth({
        token,
        protocolVersion: 3,
        minProtocolVersion: 2,
      }),
    ).toEqual({
      status: 'unsupported_protocol',
      receivedVersion: 3,
      receivedMinVersion: 2,
      currentVersion: 1,
      minSupportedVersion: 1,
    })
    expect(
      negotiateHandshakeAuth({
        token,
        protocolVersion: 1,
        minProtocolVersion: 2,
      }),
    ).toEqual({ status: 'invalid_auth' })
  })
})

describe('parsePlayerName', () => {
  it('normalizes whitespace and removes unsafe formatting characters', () => {
    expect(parsePlayerName('  Ada\n\u202e  Lovelace\u200b  ')).toBe(
      'Ada Lovelace',
    )
  })

  it('rejects a name made entirely from unsafe characters', () => {
    expect(parsePlayerName('\u0000\u202e\u2066')).toBeNull()
  })
})

describe('parseRemovePlayer', () => {
  it('normalizes the room code and accepts a bounded server player id', () => {
    expect(
      parseRemovePlayer({ roomCode: ' BCDF2 ', playerId: 'player-2' }),
    ).toEqual({ roomCode: 'bcdf2', playerId: 'player-2' })
  })

  it('rejects missing, malformed, and oversized player ids', () => {
    expect(parseRemovePlayer({ roomCode: 'bcdf2' })).toBeNull()
    expect(
      parseRemovePlayer({ roomCode: 'bcdf2', playerId: 'player 2' }),
    ).toBeNull()
    expect(
      parseRemovePlayer({ roomCode: 'bcdf2', playerId: 'a'.repeat(65) }),
    ).toBeNull()
  })
})
