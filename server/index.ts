import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createGameSocketServer } from './protocol'

export function startGameServer(
  options: {
    port?: number
    host?: string
    allowedOrigins?: string[]
  } = {},
) {
  const port = validatePort(options.port ?? Number(process.env.PORT ?? 3200))
  const host = options.host ?? process.env.HOST ?? '127.0.0.1'
  const allowedOrigins =
    options.allowedOrigins ?? parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
  const logger = createStructuredLogger(process.env.LOG_LEVEL)

  const httpServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: 'ok' }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ status: 'not_found' }))
  })
  const socketServer = createGameSocketServer(httpServer, {
    allowedOrigins,
    logger,
  })

  httpServer.on('error', (error) => {
    logger.error(
      JSON.stringify({
        event: 'game_server_error',
        host,
        port,
        message: error.message,
        code: 'code' in error ? error.code : undefined,
      }),
    )
    if (isMain) process.exitCode = 1
  })
  httpServer.listen(port, host, () => {
    const address = httpServer.address()
    logger.info(
      JSON.stringify({
        event: 'game_server_started',
        host,
        port:
          typeof address === 'object' && address !== null ? address.port : port,
      }),
    )
  })

  let stopping = false
  async function stop() {
    if (stopping) return
    stopping = true
    await socketServer.shutdown()
    if (httpServer.listening) {
      await new Promise<void>((resolveClose, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolveClose())),
      )
    }
  }

  return { httpServer, ...socketServer, stop }
}

function validatePort(port: number) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid game-server port: ${String(port)}`)
  }
  return port
}

function parseAllowedOrigins(value: string | undefined) {
  const origins = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return origins?.length
    ? origins
    : ['http://localhost:3000', 'http://127.0.0.1:3000']
}

function createStructuredLogger(value: string | undefined) {
  const configuredLevel =
    value === 'error' || value === 'warn' || value === 'info' ? value : 'info'
  const priority = { error: 0, warn: 1, info: 2 } as const

  return {
    info(message: string) {
      if (priority[configuredLevel] >= priority.info) console.info(message)
    },
    warn(message: string) {
      if (priority[configuredLevel] >= priority.warn) console.warn(message)
    },
    error(message: string) {
      console.error(message)
    },
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  const server = startGameServer()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void server.stop().then(() => process.exit(0))
    })
  }
}
