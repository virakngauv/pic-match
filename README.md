# Spot It Web

A real-time multiplayer browser implementation of Spot It, built with Next.js
and Convex.

The project is currently pre-production. Its complete anonymous multiplayer
loop is implemented: players can create a room, race on a shared board, finish
a game, return to the lobby, and play again with the same room.

## Current functionality

- Create and join rooms using short room codes
- Persistent anonymous player identities
- Real-time lobby presence
- Host-authorized game start
- Immutable participant roster when a game starts
- Participant reconnection during lobby, active-game, and rematch transitions
- Late-join blocking after the game starts
- Lobby host reassignment when the host leaves
- Server-derived lobby, playing, reconnecting, finished, and unavailable views
- Deterministic Spot It card generation with one shared symbol per pair
- A real-time two-card board shared by every participant
- Server-authoritative, first-claim-wins match validation
- Incorrect-match feedback with a one-second cooldown and red error markers
- Live scoring, pair advancement, and a first-to-12 winner
- Persisted final results and participant-specific winner messaging
- Host-controlled rematches that reopen the existing lobby
- Player departure, replacement joining, and fresh state between games
- Unit, integration, and multi-browser end-to-end coverage through two complete
  games, reconnection, rematching, and a mobile results layout

## Technology

- Next.js App Router, React, and TypeScript
- Tailwind CSS and shadcn/ui
- Convex for real-time rooms, presence, and game state
- Vitest and React Testing Library
- Playwright for end-to-end tests

Clerk, PostHog, and Arcjet are available as optional integrations. They remain
disabled in local development until their environment variables are configured.

## Local development

Requirements:

- Node.js 22 or later
- pnpm 11

Install dependencies:

```bash
pnpm install
```

Create the local environment file from the tracked template:

```bash
cp .env.example .env.local
```

Keep local keys in `.env.local` at the repository root. Next.js loads this file
automatically, and it is intentionally excluded from Git. Restart the Next.js
development server after changing environment variables.

Configure and start Convex:

```bash
pnpm convex:dev
```

The Convex CLI creates or selects a development deployment and writes
`NEXT_PUBLIC_CONVEX_URL` to `.env.local`. Leave that terminal running during
development.

In another terminal, start Next.js:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The application shell and wiring lab work without third-party credentials.
Multiplayer room functionality requires a configured Convex development
deployment.

## Optional integrations

Start by editing the repository-root `.env.local` created above. The complete
file can look like this:

```dotenv
# Written automatically by `pnpm convex:dev`.
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Clerk authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# PostHog analytics
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Arcjet security
ARCJET_KEY=ajkey_...
ARCJET_ENV=development
```

Only variables prefixed with `NEXT_PUBLIC_` are exposed to browser code. Never
put secret values in a `NEXT_PUBLIC_` variable or commit `.env.local`.

### Clerk

Create or select an application in the Clerk dashboard, then copy its
publishable key and secret key into these entries in `.env.local`:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

The root provider and Clerk middleware activate automatically when both values
are present. Clerk is not required for the current anonymous player flow.

Convex currently serves the anonymous player flow without an authentication
provider. If Clerk authentication is later used inside Convex functions, add
the Clerk provider to `convex/auth.config.ts` and configure its frontend API URL
on each target Convex deployment:

```bash
pnpm convex env set CLERK_FRONTEND_API_URL https://your-clerk-domain
```

This value belongs to the Convex deployment environment, not `.env.local`.

### PostHog

Copy the project API key and host from the PostHog project settings into
`.env.local`:

```dotenv
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Use the host shown by PostHog for the selected project region. The application
defaults to the US host when `NEXT_PUBLIC_POSTHOG_HOST` is omitted.

### Arcjet

Copy the site key from the Arcjet dashboard into `.env.local`:

```dotenv
ARCJET_KEY=ajkey_...
ARCJET_ENV=development
```

`ARCJET_KEY` is server-only. The included demo API route runs Arcjet Shield
when it is configured and returns a transparent demo response otherwise.

## Architecture

Rooms progress through a server-authoritative lifecycle:

```text
lobby → playing → finished
```

Room membership, connectivity, and game participation are modeled separately.
When the host starts a game, Convex creates an immutable participant snapshot.
Disconnecting does not remove or reorder a participant.

The implemented lifecycle and authorization rules are documented in
[Room-to-game boundary](docs/architecture/room-game-boundary.md). The card
model, shared-pair contract, atomic claim rules, scoring, and completion behavior
are documented in
[First playable round](docs/architecture/first-playable-round.md).

## Project structure

```text
app/                 Next.js routes and layouts
components/          Application components
components/ui/       Reusable UI primitives
convex/              Schema, queries, mutations, and backend tests
e2e/                 Playwright end-to-end tests
docs/architecture/   Architecture decisions and boundaries
lib/                 Shared client utilities and session handling
```

## Quality checks

Run the complete local verification suite:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Pull-request CI runs formatting, lint, typechecking, unit tests, and the
production build. After a push to `main`, CI also deploys the Convex functions
to a clean preview deployment and runs the Playwright suite against it.

## Development data

This project is pre-production, and existing Convex development data is
disposable. Breaking schema changes may require clearing or recreating the
development deployment.

A production migration and retention policy must be established before the
first public deployment.

## First public playtest

The next milestone is
[First public playtest](https://github.com/virakngauv/spot-it-web/milestone/4).
It prepares the completed multiplayer game for a small, observable playtest in
five focused steps:

1. [Refresh this README for the completed game](https://github.com/virakngauv/spot-it-web/issues/52)
2. [Make the app reproducibly deployable](https://github.com/virakngauv/spot-it-web/issues/53)
3. [Add bounded cleanup for stale room data](https://github.com/virakngauv/spot-it-web/issues/54)
4. [Add privacy-safe playtest monitoring](https://github.com/virakngauv/spot-it-web/issues/55)
5. [Run and document a real-device multiplayer smoke test](https://github.com/virakngauv/spot-it-web/issues/56)

Non-blocking interface improvements discovered during testing belong in the
separate
[Playtest UX polish](https://github.com/virakngauv/spot-it-web/milestone/5)
milestone. Findings that prevent a safe or usable public playtest remain in the
public-playtest milestone.
