import { randomBytes, randomUUID } from 'node:crypto'

import { io, type Socket } from 'socket.io-client'

import {
  GAME_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '../lib/game-protocol'
import { ROOM_CODE_PATTERN } from '../server/validation'

type GameClient = Socket<ServerToClientEvents, ClientToServerEvents>

const gameServerUrl = requiredHttpsEnvironment('GAME_SERVER_URL')
const browserOrigin = requiredHttpsEnvironment('GAME_SERVER_ORIGIN')
const ACK_TIMEOUT_MS = 5_000

const clients: GameClient[] = []

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})

async function main() {
  try {
    const healthResponse = await fetch(new URL('/healthz', gameServerUrl), {
      signal: AbortSignal.timeout(ACK_TIMEOUT_MS),
    })
    if (!healthResponse.ok)
      throw new Error(`Health check failed: ${healthResponse.status}`)

    const hostToken = randomBytes(16).toString('hex')
    const host = await connect(hostToken)
    const guest = await connect()
    const created = await host
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('room:create', { name: 'Smoke host' })
    if (created.status !== 'success') throw new Error(created.message)

    const roomCode = created.roomCode
    const hostLobby = nextSnapshot(host, 'lobby')
    const guestLobby = nextSnapshot(guest, 'lobby')
    const joined = await guest
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('room:join', {
        roomCode,
        name: 'Smoke guest',
      })
    if (joined.status !== 'success') throw new Error(joined.message)
    await Promise.all([hostLobby, guestLobby])

    const hostPlaying = nextSnapshot(host, 'playing')
    const guestPlaying = nextSnapshot(guest, 'playing')
    const started = await host
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('game:start', { roomCode })
    if (started.status !== 'success') throw new Error(started.message)
    const [hostState, guestState] = await Promise.all([
      hostPlaying,
      guestPlaying,
    ])

    const hostScored = nextSnapshot(host, 'playing')
    const guestScored = nextSnapshot(guest, 'playing')
    const guestClaim = await guest
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('game:claim', correctClaim(guestState, roomCode))
    if (guestClaim.status !== 'success') throw new Error(guestClaim.message)
    const [, afterGuestScore] = await Promise.all([hostScored, guestScored])
    const guestScore = afterGuestScore.scoreboard.find(
      (entry) => entry.name === 'Smoke guest',
    )?.score
    if (guestScore !== 1) throw new Error('Guest score did not synchronize.')

    host.disconnect()
    const reconnectedHost = await connect(hostToken)
    const resumed = await reconnectedHost
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('session:resume', { roomCode })
    if (
      resumed.status !== 'success' ||
      resumed.snapshot?.status !== 'playing'
    ) {
      throw new Error('Host could not restore the current snapshot.')
    }

    const roomCodePatternValid = ROOM_CODE_PATTERN.test(roomCode)
    if (!roomCodePatternValid) {
      throw new Error('Game server returned an invalid room code.')
    }

    console.info(
      JSON.stringify({
        status: 'ok',
        health: true,
        wssClients: 2,
        roomCodePatternValid,
        initialRevision: hostState.pairRevision,
        finalRevision: resumed.snapshot.pairRevision,
      }),
    )
  } finally {
    for (const client of clients) client.disconnect()
  }
}

async function connect(token = randomBytes(16).toString('hex')) {
  const client: GameClient = io(gameServerUrl, {
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

function nextSnapshot<TStatus extends RoomSnapshot['status']>(
  client: GameClient,
  status: TStatus,
) {
  return new Promise<Extract<RoomSnapshot, { status: TStatus }>>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${status} snapshot.`)),
        5_000,
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
) {
  const symbol = snapshot.cards[0]?.symbolIds.find((candidate) =>
    snapshot.cards[1]?.symbolIds.includes(candidate),
  )
  if (!symbol) throw new Error('Smoke-test cards do not share a symbol.')
  return {
    roomCode,
    commandId: randomUUID(),
    pairRevision: snapshot.pairRevision,
    firstSymbolId: symbol,
    secondSymbolId: symbol,
  }
}

function requiredHttpsEnvironment(
  name: 'GAME_SERVER_URL' | 'GAME_SERVER_ORIGIN',
) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} before running the smoke test.`)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`)
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS.`)
  }
  return value
}
