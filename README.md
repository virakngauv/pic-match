# Pic Match

A multiplayer Pic Match game built with Next.js and a deliberately simple,
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

Clerk and PostHog remain optional frontend integrations.

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

When `NEXT_PUBLIC_GAME_SERVER_URL` is unset, the browser connects to the page
hostname on port 3200, so `http://localhost:3000`,
`http://<lan-ip>:3000`, and `http://<hostname>.local:3000` all work without
extra configuration. Outside production the game server also accepts socket
connections from any private-network origin; set `HOST=0.0.0.0` to let other
LAN devices reach it. For Vercel builds, set `NEXT_PUBLIC_GAME_SERVER_URL` to
the public `https` game-server origin and `ALLOWED_ORIGINS` on the game server
to the frontend origin; Socket.IO will use WSS automatically.

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

- all phases: 26 hours

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

By default `pnpm test:e2e` boots its own `pnpm dev:e2e` stack (web on 3100,
game server on 3200). Set `PW_REUSE_SERVER=1` to reuse an already-running
`dev:e2e` stack, or point `PLAYWRIGHT_BASE_URL` at your own dev server (keep
both web and game server processes running). When a reused or shared server
makes WebKit runs flaky, retry against a fresh stack before debugging; traces
for failing tests are kept in `test-results/`.

For a deployed game server:

```bash
GAME_SERVER_URL=https://games.example.com \
GAME_SERVER_ORIGIN=https://your-app.vercel.app \
pnpm deploy:smoke
```

## Deployment

The supported production topology is one DigitalOcean App Platform service
running exactly one instance of the game-server container, with the frontend on
Vercel. Do not scale the service beyond one instance or enable autoscaling:
rooms live in one process's memory and multiple instances silently split room
state.

See [DigitalOcean game server operations](docs/deployment/first-public-playtest.md)
and [the room/game boundary](docs/architecture/room-game-boundary.md).

## Repository map

```text
app/                 Next.js routes
components/          Application and UI components
lib/                 Shared protocol and deterministic game logic
server/              In-memory game server and tests
e2e/                 Playwright multiplayer browser coverage
deploy/              App Platform app spec example
docs/                Architecture and operations notes
scripts/             Deployment checks and smoke tests
```
