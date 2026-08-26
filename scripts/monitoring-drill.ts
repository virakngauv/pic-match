import { randomBytes, randomUUID } from 'node:crypto'

import { io, type Socket } from 'socket.io-client'

import {
  GAME_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '../lib/game-protocol'

type GameClient = Socket<ServerToClientEvents, ClientToServerEvents>

const serverUrl = requiredUrlEnvironment('GAME_SERVER_URL')
const browserOrigin = requiredUrlEnvironment('GAME_SERVER_ORIGIN')
const disallowedOrigin = 'https://monitoring-drill.invalid'
const ACK_TIMEOUT_MS = 5_000

const clients: GameClient[] = []
const checks: Array<{ name: string; expectedLog: string }> = []

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})

async function main() {
  try {
    await runDrill()
  } finally {
    for (const client of clients) client.disconnect()
  }
}

async function runDrill() {
  const healthResponse = await fetch(new URL('/healthz', serverUrl), {
    signal: AbortSignal.timeout(ACK_TIMEOUT_MS),
  })
  if (!healthResponse.ok)
    throw new Error(`Health check failed: ${healthResponse.status}`)

  await expectConnectFailure({
    auth: {
      token: randomBytes(16).toString('hex'),
      protocolVersion: GAME_PROTOCOL_VERSION,
    },
    extraHeaders: { Origin: disallowedOrigin },
  })
  checks.push({
    name: 'disallowed origin rejected',
    expectedLog: '{"event":"handshake_rejected","reason":"origin_not_allowed"}',
  })

  await expectConnectFailure({
    auth: { token: 'not-a-token', protocolVersion: GAME_PROTOCOL_VERSION },
    extraHeaders: { Origin: browserOrigin },
  })
  checks.push({
    name: 'invalid auth rejected',
    expectedLog: '{"event":"handshake_rejected","reason":"invalid_auth"}',
  })

  const prober = await connect()
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await prober
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('session:resume', { roomCode: 'zzzz9' })
    if (result.status === 'rate_limited')
      throw new Error('Entry budget tripped earlier than expected.')
  }
  const limited = await prober
    .timeout(ACK_TIMEOUT_MS)
    .emitWithAck('session:resume', { roomCode: 'zzzz9' })
  if (limited.status !== 'rate_limited')
    throw new Error('Entry rate limit did not reject the probe.')
  checks.push({
    name: 'entry rate limit tripped',
    expectedLog: '{"event":"rate_limited","budget":"entry"',
  })

  const host = await connect()
  const created = await host
    .timeout(ACK_TIMEOUT_MS)
    .emitWithAck('room:create', { name: 'Drill host' })
  if (created.status !== 'success') throw new Error(created.message)
  const roomCode = created.roomCode

  const playingPromise = nextSnapshot(host, 'playing')
  const started = await host
    .timeout(ACK_TIMEOUT_MS)
    .emitWithAck('game:start', { roomCode })
  if (started.status !== 'success') throw new Error(started.message)
  const snapshot = await playingPromise
  const symbol = snapshot.cards[0]?.symbolIds.find((candidate) =>
    snapshot.cards[1]?.symbolIds.includes(candidate),
  )
  const wrongSymbol =
    snapshot.cards[1]?.symbolIds.find((candidate) => candidate !== symbol) ??
    'moon'
  if (!symbol) throw new Error('Drill cards do not share a symbol.')

  for (let index = 0; index < 9; index += 1) {
    const guest = await connect()
    const guestPlaying = nextSnapshot(guest, 'playing')
    const joined = await guest
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('room:join', { roomCode, name: `Drill guest ${index}` })
    if (joined.status !== 'success') throw new Error(joined.message)
    const guestSnapshot = await guestPlaying
    const claim = await guest
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('game:claim', {
        roomCode,
        commandId: randomUUID(),
        pairRevision: guestSnapshot.pairRevision,
        firstSymbolId: symbol,
        secondSymbolId: wrongSymbol,
      })
    if (claim.status !== 'incorrect')
      throw new Error(`Guest claim was ${claim.status}, expected incorrect.`)
  }
  const hostClaim = await host
    .timeout(ACK_TIMEOUT_MS)
    .emitWithAck('game:claim', {
      roomCode,
      commandId: randomUUID(),
      pairRevision: snapshot.pairRevision,
      firstSymbolId: symbol,
      secondSymbolId: wrongSymbol,
    })
  if (hostClaim.status !== 'incorrect')
    throw new Error(`Host claim was ${hostClaim.status}, expected incorrect.`)
  checks.push({
    name: 'claim streak reached',
    expectedLog: `"event":"claim_streak","roomCode":"${roomCode}","pairRevision":${snapshot.pairRevision},"incorrectInARow":10`,
  })

  console.info(
    JSON.stringify(
      {
        status: 'ok',
        health: true,
        roomCode,
        checks: checks.map((check) => check.name),
        note: 'Counted events flush within 30 seconds; claim_streak and handshake_rejected appear immediately.',
      },
      null,
      2,
    ),
  )
  console.info('\nVerify these server log lines:')
  for (const check of checks) {
    console.info(`- ${check.name}: grep for ${check.expectedLog}`)
  }
}

async function connect(token = randomBytes(16).toString('hex')) {
  const client: GameClient = io(serverUrl, {
    auth: { token, protocolVersion: GAME_PROTOCOL_VERSION },
    extraHeaders: { Origin: browserOrigin },
    forceNew: true,
    transports: ['websocket'],
  })
  clients.push(client)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out connecting to the game server.'))
    }, ACK_TIMEOUT_MS)
    const connected = () => {
      cleanup()
      resolve()
    }
    const failed = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      clearTimeout(timeout)
      client.off('connect', connected)
      client.off('connect_error', failed)
    }
    client.once('connect', connected)
    client.once('connect_error', failed)
  })
  return client
}

async function expectConnectFailure(options: {
  auth: { token: string; protocolVersion: typeof GAME_PROTOCOL_VERSION }
  extraHeaders: { Origin: string }
}) {
  const client: GameClient = io(serverUrl, {
    ...options,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  })
  clients.push(client)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Expected the handshake to fail, but it timed out.'))
    }, ACK_TIMEOUT_MS)
    const failed = () => {
      cleanup()
      resolve()
    }
    const connected = () => {
      cleanup()
      reject(new Error('Expected the handshake to fail, but it connected.'))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      client.off('connect', connected)
      client.off('connect_error', failed)
    }
    client.once('connect_error', failed)
    client.once('connect', connected)
  })
}

function nextSnapshot<TStatus extends RoomSnapshot['status']>(
  client: GameClient,
  status: TStatus,
) {
  return new Promise<Extract<RoomSnapshot, { status: TStatus }>>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${status} snapshot.`)),
        ACK_TIMEOUT_MS,
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

function requiredUrlEnvironment(
  name: 'GAME_SERVER_URL' | 'GAME_SERVER_ORIGIN',
) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} before running the drill.`)
  try {
    new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }
  return value
}
