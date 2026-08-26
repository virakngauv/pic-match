import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { io, type Socket } from 'socket.io-client'

import {
  GAME_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type MatchClaimCommand,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '../lib/game-protocol'

type GameClient = Socket<ServerToClientEvents, ClientToServerEvents>
type EventName = keyof ClientToServerEvents | 'connect' | 'room:snapshot'
type Scenario = 'gameplay' | 'capacity' | 'reconnect-storm'

export type LoadOptions = {
  url: string
  origin: string
  concurrency: number
  durationMs: number
  ramp: number[]
  scenario: Scenario
  claimIntervalMs: number
  reconnectIntervalMs: number
  ackTimeoutMs: number
  capacityRooms: number
  forwardedAddresses: boolean
}

type EventMetric = {
  attempted: number
  successful: number
  failed: number
  latencyMs: number[]
  statuses: Map<string, number>
}

const DEFAULTS: LoadOptions = {
  url: 'http://127.0.0.1:3200',
  origin: 'http://127.0.0.1:3000',
  concurrency: 50,
  durationMs: 30_000,
  ramp: [],
  scenario: 'gameplay',
  claimIntervalMs: 1_000,
  reconnectIntervalMs: 15_000,
  ackTimeoutMs: 5_000,
  capacityRooms: 25_001,
  forwardedAddresses: true,
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options === null) {
    console.info(helpText())
    return
  }
  validateLocalTarget(options.url)
  const response = await fetch(new URL('/healthz', options.url), {
    signal: AbortSignal.timeout(options.ackTimeoutMs),
  })
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`)

  const metrics = new Metrics()
  const startedAt = performance.now()
  if (options.scenario === 'capacity') {
    await runCapacity(options, metrics)
  } else {
    await runSocketScenario(options, metrics)
  }
  console.info(
    JSON.stringify(
      metrics.report(options, Math.max(1, performance.now() - startedAt)),
      null,
      2,
    ),
  )
}

async function runSocketScenario(options: LoadOptions, metrics: Metrics) {
  const controller = new AbortController()
  const rooms: VirtualRoom[] = []
  const targets = options.ramp.length ? options.ramp : [options.concurrency]
  const stageMs = options.durationMs / targets.length
  const deadline = performance.now() + options.durationMs

  try {
    for (const target of targets) {
      if (controller.signal.aborted) break
      await resizeRooms(target / 2, rooms, options, metrics, controller.signal)
      await delay(Math.min(stageMs, Math.max(0, deadline - performance.now())))
    }
  } finally {
    controller.abort()
    await Promise.allSettled(rooms.map((room) => room.stop()))
  }
}

async function resizeRooms(
  target: number,
  rooms: VirtualRoom[],
  options: LoadOptions,
  metrics: Metrics,
  signal: AbortSignal,
) {
  while (rooms.length > target) await rooms.pop()?.stop()
  const additions: Promise<void>[] = []
  while (rooms.length < target) {
    const room = new VirtualRoom(rooms.length, options, metrics, signal)
    rooms.push(room)
    additions.push(room.run())
  }
  await Promise.all(additions.map((task) => task.catch(() => undefined)))
}

async function runCapacity(options: LoadOptions, metrics: Metrics) {
  let nextRoom = 0
  let attemptedRooms = 0
  let createdRooms = 0
  let capacityReached = false
  const deadline = performance.now() + options.durationMs
  const workers = Array.from(
    { length: options.concurrency },
    async (_, worker) => {
      while (!capacityReached && performance.now() < deadline) {
        const roomNumber = nextRoom++
        if (roomNumber >= options.capacityRooms) return
        while (!capacityReached && performance.now() < deadline) {
          const client = await connectClient(
            randomBytes(16).toString('hex'),
            worker,
            options,
            metrics,
          ).catch(() => null)
          if (!client) continue
          attemptedRooms += 1
          const result = await acknowledge(
            client,
            'room:create',
            { name: `Load host ${roomNumber}` },
            options,
            metrics,
          ).catch(() => null)
          client.disconnect()
          if (result?.status === 'success') {
            createdRooms += 1
            break
          }
          if (result?.status === 'server_unavailable') {
            capacityReached = true
            break
          }
          if (result?.status === 'rate_limited') await delay(1_000)
          else break
        }
      }
    },
  )
  await Promise.all(workers)
  metrics.capacity = { attemptedRooms, createdRooms, capacityReached }
}

class VirtualRoom {
  private host: GameClient | null = null
  private guest: GameClient | null = null
  private readonly hostToken = randomBytes(16).toString('hex')
  private readonly guestToken = randomBytes(16).toString('hex')
  private roomCode = ''
  private guestState: RoomSnapshot | null = null
  private running: Promise<void> | null = null
  private stopped = false

  constructor(
    private readonly id: number,
    private readonly options: LoadOptions,
    private readonly metrics: Metrics,
    private readonly signal: AbortSignal,
  ) {}

  async run() {
    this.running = this.lifecycle()
    await this.waitUntilReady()
  }

  async stop() {
    this.stopped = true
    this.host?.disconnect()
    this.guest?.disconnect()
    await this.running?.catch(() => undefined)
  }

  private async lifecycle() {
    try {
      this.host = await connectClient(
        this.hostToken,
        this.id * 2,
        this.options,
        this.metrics,
      )
      this.guest = await connectClient(
        this.guestToken,
        this.id * 2 + 1,
        this.options,
        this.metrics,
      )
      this.trackGuestSnapshots(this.guest)
      const created = await acknowledge(
        this.host,
        'room:create',
        { name: `Load host ${this.id}` },
        this.options,
        this.metrics,
      )
      if (created.status !== 'success') return
      this.roomCode = created.roomCode
      const joined = await acknowledge(
        this.guest,
        'room:join',
        { roomCode: this.roomCode, name: `Load guest ${this.id}` },
        this.options,
        this.metrics,
      )
      if (joined.status !== 'success') return
      if (!(await this.startGame())) return

      let nextReconnectAt = performance.now() + this.nextReconnectDelay()
      while (!this.done) {
        if (
          this.options.scenario === 'reconnect-storm' ||
          performance.now() >= nextReconnectAt
        ) {
          await this.reconnectGuest()
          nextReconnectAt = performance.now() + this.nextReconnectDelay()
        }
        await this.claimOnce()
        await delay(this.options.claimIntervalMs)
      }
    } catch (error) {
      if (!this.done) this.metrics.runtimeError(error)
    }
  }

  private async waitUntilReady() {
    const readyDeadline = performance.now() + this.options.ackTimeoutMs * 4
    while (
      !this.done &&
      !this.roomCode &&
      this.running &&
      performance.now() < readyDeadline
    ) {
      await delay(10)
    }
  }

  private async startGame() {
    if (!this.host) return false
    const result = await acknowledge(
      this.host,
      'game:start',
      { roomCode: this.roomCode },
      this.options,
      this.metrics,
    )
    if (result.status !== 'success') return false
    return waitUntil(
      () => this.guestState?.status === 'playing',
      this.options.ackTimeoutMs,
    )
  }

  private async claimOnce() {
    if (!this.host || !this.guest) return
    const snapshot = this.guestState
    if (snapshot?.status === 'finished') {
      await this.prepareRematch()
      return
    }
    if (snapshot?.status !== 'playing') return
    const startedAt = performance.now()
    this.metrics.attempt('room:snapshot')
    this.metrics.attempt('room:snapshot')
    const hostSnapshot = nextChangedSnapshot(
      this.host,
      snapshot.revision,
      this.options.ackTimeoutMs,
    )
    const guestSnapshot = nextChangedSnapshot(
      this.guest,
      snapshot.revision,
      this.options.ackTimeoutMs,
    )
    const result = await acknowledge(
      this.guest,
      'game:claim',
      correctClaim(snapshot, this.roomCode),
      this.options,
      this.metrics,
    ).catch(() => null)
    if (!result) {
      void Promise.allSettled([hostSnapshot, guestSnapshot])
      return
    }
    if (result.status !== 'success') {
      void Promise.allSettled([hostSnapshot, guestSnapshot])
      return
    }
    const snapshots = await Promise.allSettled([hostSnapshot, guestSnapshot])
    for (const delivered of snapshots) {
      if (delivered.status === 'fulfilled') {
        this.metrics.success(
          'room:snapshot',
          delivered.value.receivedAt - startedAt,
        )
      } else {
        this.metrics.failure('room:snapshot', 'timeout')
      }
    }
    if (
      snapshots.some(
        (entry) =>
          entry.status === 'fulfilled' &&
          entry.value.snapshot.status === 'finished',
      )
    ) {
      await this.prepareRematch()
    }
  }

  private async prepareRematch() {
    if (!this.host) return
    const prepared = await acknowledge(
      this.host,
      'game:prepare-rematch',
      { roomCode: this.roomCode },
      this.options,
      this.metrics,
    )
    if (prepared.status === 'success') await this.startGame()
  }

  private async reconnectGuest() {
    this.guest?.disconnect()
    this.guest = await connectClient(
      this.guestToken,
      this.id * 2 + 1,
      this.options,
      this.metrics,
    )
    this.trackGuestSnapshots(this.guest)
    const resumed = await acknowledge(
      this.guest,
      'session:resume',
      { roomCode: this.roomCode },
      this.options,
      this.metrics,
    )
    if (resumed.status === 'success' && resumed.snapshot) {
      this.guestState = resumed.snapshot
    }
    if (this.options.scenario === 'reconnect-storm') {
      await delay(this.options.reconnectIntervalMs)
    }
  }

  private get done() {
    return this.stopped || this.signal.aborted
  }

  private trackGuestSnapshots(client: GameClient) {
    client.on('room:snapshot', (snapshot) => {
      this.guestState = snapshot
    })
  }

  private nextReconnectDelay() {
    if (this.options.scenario === 'reconnect-storm') {
      return this.options.reconnectIntervalMs
    }
    return this.options.reconnectIntervalMs * (0.5 + (this.id % 100) / 100)
  }
}

async function connectClient(
  token: string,
  clientNumber: number,
  options: LoadOptions,
  metrics: Metrics,
) {
  const startedAt = performance.now()
  metrics.attempt('connect')
  const headers: Record<string, string> = { Origin: options.origin }
  if (options.forwardedAddresses) {
    headers['X-Forwarded-For'] = benchmarkAddress(clientNumber)
  }
  const client: GameClient = io(options.url, {
    auth: { token, protocolVersion: GAME_PROTOCOL_VERSION },
    extraHeaders: headers,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  })
  try {
    await new Promise<void>((resolveConnect, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('connect timeout')),
        options.ackTimeoutMs,
      )
      client.once('connect', () => {
        clearTimeout(timeout)
        resolveConnect()
      })
      client.once('connect_error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
    metrics.success('connect', performance.now() - startedAt)
    return client
  } catch (error) {
    client.disconnect()
    metrics.failure(
      'connect',
      error instanceof Error ? error.message : 'unknown',
    )
    throw error
  }
}

async function acknowledge<TEvent extends keyof ClientToServerEvents>(
  client: GameClient,
  event: TEvent,
  payload: Parameters<ClientToServerEvents[TEvent]>[0],
  options: LoadOptions,
  metrics: Metrics,
) {
  const startedAt = performance.now()
  metrics.attempt(event)
  try {
    const timedClient = client.timeout(options.ackTimeoutMs) as unknown as {
      emitWithAck(
        emittedEvent: TEvent,
        emittedPayload: Parameters<ClientToServerEvents[TEvent]>[0],
      ): Promise<AwaitedAck<TEvent>>
    }
    const result = await timedClient.emitWithAck(event, payload)
    const latency = performance.now() - startedAt
    if (result.status === 'success') metrics.success(event, latency)
    else metrics.failure(event, result.status, latency)
    return result
  } catch (error) {
    metrics.failure(event, 'timeout')
    throw error
  }
}

type AwaitedAck<TEvent extends keyof ClientToServerEvents> = Parameters<
  Parameters<ClientToServerEvents[TEvent]>[1]
>[0]

function nextChangedSnapshot(
  client: GameClient,
  revision: number,
  timeoutMs: number,
) {
  return new Promise<{ snapshot: RoomSnapshot; receivedAt: number }>(
    (resolveSnapshot, reject) => {
      const timeout = setTimeout(() => {
        client.off('room:snapshot', handler)
        reject(new Error('snapshot timeout'))
      }, timeoutMs)
      const handler = (snapshot: RoomSnapshot) => {
        if (!('revision' in snapshot) || snapshot.revision <= revision) return
        clearTimeout(timeout)
        client.off('room:snapshot', handler)
        resolveSnapshot({ snapshot, receivedAt: performance.now() })
      }
      client.on('room:snapshot', handler)
    },
  )
}

export function correctClaim(
  snapshot: Extract<RoomSnapshot, { status: 'playing' }>,
  roomCode: string,
): MatchClaimCommand {
  const symbol = snapshot.cards[0]?.symbolIds.find((candidate) =>
    snapshot.cards[1]?.symbolIds.includes(candidate),
  )
  if (!symbol) throw new Error('Load-test cards do not share a symbol.')
  return {
    roomCode,
    commandId: randomUUID(),
    pairRevision: snapshot.pairRevision,
    firstSymbolId: symbol,
    secondSymbolId: symbol,
  }
}

export class Metrics {
  private readonly events = new Map<EventName, EventMetric>()
  private readonly runtimeErrors = new Map<string, number>()
  capacity?: {
    attemptedRooms: number
    createdRooms: number
    capacityReached: boolean
  }

  attempt(event: EventName) {
    this.event(event).attempted += 1
  }

  success(event: EventName, latencyMs: number) {
    const metric = this.event(event)
    metric.successful += 1
    metric.latencyMs.push(latencyMs)
  }

  failure(event: EventName, status: string, latencyMs?: number) {
    const metric = this.event(event)
    metric.failed += 1
    metric.statuses.set(status, (metric.statuses.get(status) ?? 0) + 1)
    if (latencyMs !== undefined) metric.latencyMs.push(latencyMs)
  }

  runtimeError(error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown'
    this.runtimeErrors.set(message, (this.runtimeErrors.get(message) ?? 0) + 1)
  }

  report(options: LoadOptions, elapsedMs: number) {
    const events = Object.fromEntries(
      [...this.events].map(([name, metric]) => [
        name,
        {
          attempted: metric.attempted,
          successful: metric.successful,
          failed: metric.failed,
          errorRate: ratio(metric.failed, metric.attempted),
          latencyMs: percentiles(metric.latencyMs),
          statuses: Object.fromEntries(metric.statuses),
        },
      ]),
    )
    const commandAttempts = [...this.events]
      .filter(([name]) => name !== 'connect' && name !== 'room:snapshot')
      .reduce((sum, [, metric]) => sum + metric.attempted, 0)
    return {
      scenario: options.scenario,
      target: { url: options.url, origin: options.origin },
      configured: {
        concurrency: options.concurrency,
        durationMs: options.durationMs,
        ramp: options.ramp,
        claimIntervalMs: options.claimIntervalMs,
        reconnectIntervalMs: options.reconnectIntervalMs,
        ackTimeoutMs: options.ackTimeoutMs,
        capacityRooms: options.capacityRooms,
        forwardedAddresses: options.forwardedAddresses,
      },
      elapsedMs: Math.round(elapsedMs),
      throughputPerSecond: round(commandAttempts / (elapsedMs / 1_000)),
      events,
      runtimeErrors: Object.fromEntries(this.runtimeErrors),
      ...(this.capacity ? { capacity: this.capacity } : {}),
    }
  }

  private event(name: EventName) {
    let metric = this.events.get(name)
    if (!metric) {
      metric = {
        attempted: 0,
        successful: 0,
        failed: 0,
        latencyMs: [],
        statuses: new Map(),
      }
      this.events.set(name, metric)
    }
    return metric
  }
}

export function percentiles(values: number[]) {
  if (values.length === 0) return { p50: null, p95: null, p99: null }
  const sorted = values.toSorted((left, right) => left - right)
  const valueAt = (percentile: number) =>
    round(sorted[Math.ceil((percentile / 100) * sorted.length) - 1] ?? 0)
  return { p50: valueAt(50), p95: valueAt(95), p99: valueAt(99) }
}

export function parseArgs(args: string[]): LoadOptions | null {
  if (args.includes('--help') || args.includes('-h')) return null
  const options = { ...DEFAULTS }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!
    const value = args[index + 1]
    if (flag === '--no-forwarded-addresses') {
      options.forwardedAddresses = false
      continue
    }
    if (!value || value.startsWith('--'))
      throw new Error(`${flag} needs a value.`)
    index += 1
    switch (flag) {
      case '--url':
        options.url = httpUrl(value, flag)
        break
      case '--origin':
        options.origin = httpUrl(value, flag)
        break
      case '--concurrency':
        options.concurrency = integer(value, flag)
        break
      case '--duration':
        options.durationMs = duration(value, flag)
        break
      case '--ramp':
        options.ramp = value.split(',').map((entry) => integer(entry, flag))
        break
      case '--scenario':
        if (!['gameplay', 'capacity', 'reconnect-storm'].includes(value)) {
          throw new Error(`Unsupported scenario: ${value}`)
        }
        options.scenario = value as Scenario
        break
      case '--claim-interval':
        options.claimIntervalMs = duration(value, flag)
        break
      case '--reconnect-interval':
        options.reconnectIntervalMs = duration(value, flag)
        break
      case '--ack-timeout':
        options.ackTimeoutMs = duration(value, flag)
        break
      case '--capacity-rooms':
        options.capacityRooms = integer(value, flag)
        break
      default:
        throw new Error(`Unknown flag: ${flag}`)
    }
  }
  const socketTargets = options.ramp.length
    ? options.ramp
    : [options.concurrency]
  if (
    options.scenario !== 'capacity' &&
    socketTargets.some((target) => target < 2 || target % 2 !== 0)
  ) {
    throw new Error(
      'Socket concurrency and ramp targets must be even and at least 2.',
    )
  }
  return options
}

function helpText() {
  return `Usage: pnpm load:server [options]

Options:
  --url <http-url>              Target server (default http://127.0.0.1:3200)
  --origin <http-url>           Origin allowed by the server
  --concurrency <sockets>       Concurrent sockets; even for gameplay (default 50)
  --duration <duration>         Total run time, for example 30s or 5m
  --ramp <targets>              Even socket targets, for example 50,200,1000
  --scenario <name>             gameplay, reconnect-storm, or capacity
  --claim-interval <duration>   Delay between claims in each room (default 1s)
  --reconnect-interval <time>   Per-room reconnect interval (default 15s)
  --ack-timeout <duration>      Connect and acknowledgement timeout (default 5s)
  --capacity-rooms <count>      Capacity attempts (default 25001)
  --no-forwarded-addresses      Do not model distinct clients via X-Forwarded-For

Only local, private-network, and reserved benchmark targets are accepted.`
}

export function validateLocalTarget(value: string) {
  const url = new URL(value)
  const host = url.hostname
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^198\.(1[89])\./.test(host) ||
    /^203\.0\.113\./.test(host)
  if (!local) {
    throw new Error(
      'Refusing to load test a public target. Use a local or disposable private target.',
    )
  }
}

function benchmarkAddress(clientNumber: number) {
  const normalized = clientNumber % (2 * 65_534)
  const second = normalized < 65_534 ? 18 : 19
  const offset = normalized % 65_534
  return `198.${second}.${Math.floor(offset / 254)}.${(offset % 254) + 1}`
}

function httpUrl(value: string, flag: string) {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${flag} must use HTTP or HTTPS.`)
  }
  return url.toString().replace(/\/$/, '')
}

function integer(value: string, flag: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`)
  }
  return parsed
}

function duration(value: string, flag: string) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(value)
  if (!match)
    throw new Error(`${flag} must be a duration such as 500ms, 30s, or 5m.`)
  const amount = Number(match[1])
  if (amount <= 0) throw new Error(`${flag} must be greater than zero.`)
  const multiplier = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2]!]
  return amount * multiplier!
}

function delay(ms: number) {
  return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function waitUntil(predicate: () => boolean, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs
  while (!predicate() && performance.now() < deadline) await delay(5)
  return predicate()
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : round(numerator / denominator)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
