# Spot It Web

A multiplayer Spot It game built with Next.js and a deliberately simple,
single-process Socket.IO game server.

## Architecture

- The Next.js App Router frontend can run on Vercel.
- One Node.js process owns every active room in a `Map` and communicates with
  browsers through Socket.IO.
- Rooms are ephemeral. A game-server restart, crash, deploy, or VPS restart
  clears every room.
- A private 128-bit browser token restores the same player while that server
  process still owns the room. Socket IDs never identify players.
- Membership is independent of connectivity. Disconnecting does not remove a
  member, transfer host, change the roster, or alter a score.
- There is no application heartbeat, presence model, database, or multi-process
  adapter.

Clerk, PostHog, and Arcjet remain optional frontend integrations.

## Local development

Requirements: Node.js 22+ and pnpm 11.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`pnpm dev` starts:

- Next.js at `http://localhost:3000`
- the game server at `http://127.0.0.1:3200`

The frontend defaults to `http://localhost:3200` when
`NEXT_PUBLIC_GAME_SERVER_URL` is unset. Set that variable to the public `https`
game-server origin for Vercel builds; Socket.IO will use WSS automatically.

Useful single-service commands:

```bash
pnpm dev:web
pnpm dev:server
pnpm start:web
pnpm start:server
```

## Protocol and runtime

Shared event and snapshot types live in `lib/game-protocol.ts`. Runtime payload
validation happens at the socket boundary in `server/validation.ts`.
`server/game-room.ts` is a synchronous authoritative room actor with no
Socket.IO imports. `server/game-server.ts` owns room lookup and expiration, and
`server/protocol.ts` binds those commands to sockets.

After every state change, all sockets in the room receive a complete,
personalized snapshot. Reconnect asks for a fresh snapshot instead of relying
on replayed events. Correct claims are revision-gated and command IDs make
retries idempotent.

Default idle expiration:

- lobby: 2 hours
- playing game: 4 hours
- finished game: 30 minutes

Only meaningful room/game commands update activity. Socket.IO transport ping,
disconnect, and reconnect do not.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test` includes pure room/server tests and isolated multi-client Socket.IO
integration tests. Playwright uses separate browser contexts for multiplayer
identity isolation.

For a deployed game server:

```bash
GAME_SERVER_URL=https://games.example.com \
GAME_SERVER_ORIGIN=https://your-app.vercel.app \
pnpm deploy:smoke
```

## Deployment

The supported production topology is one Ubuntu DigitalOcean Droplet, one
systemd service, and one Caddy reverse proxy. Do not use cluster mode, multiple
containers, overlapping app processes, a load balancer, or horizontal scaling.

See [DigitalOcean game server operations](docs/deployment/first-public-playtest.md)
and [the room/game boundary](docs/architecture/room-game-boundary.md).

## Repository map

```text
app/                 Next.js routes
components/          Application and UI components
lib/                 Shared protocol and deterministic game logic
server/              In-memory game server and tests
e2e/                 Playwright multiplayer browser coverage
deploy/              systemd and Caddy examples
docs/                Architecture and operations notes
scripts/             Deployment checks and smoke tests
```
