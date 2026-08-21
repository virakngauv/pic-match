import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { startGameServer } from './index'

describe('game server HTTP process', () => {
  let server: ReturnType<typeof startGameServer> | null = null

  afterEach(async () => {
    await server?.stop()
    server = null
  })

  it('reports process health without exposing room or player state', async () => {
    server = startGameServer({
      port: 0,
      host: '127.0.0.1',
      allowedOrigins: ['http://localhost:3100'],
    })
    await new Promise<void>((resolve) =>
      server?.httpServer.once('listening', resolve),
    )
    const address = server.httpServer.address() as AddressInfo
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('rejects an invalid listen port before starting', () => {
    expect(() => startGameServer({ port: Number.NaN })).toThrow(
      'Invalid game-server port: NaN',
    )
  })

  it('shares in-progress shutdown work across concurrent callers', async () => {
    server = startGameServer({
      port: 0,
      host: '127.0.0.1',
      allowedOrigins: ['http://localhost:3100'],
    })
    await new Promise<void>((resolve) =>
      server?.httpServer.once('listening', resolve),
    )

    const firstStop = server.stop()
    const secondStop = server.stop()

    expect(secondStop).toBe(firstStop)
    await Promise.all([firstStop, secondStop])
    expect(server.httpServer.listening).toBe(false)
    server = null
  })
})
