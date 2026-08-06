# Spot It Web

A real-time multiplayer browser implementation of Spot It, built with Next.js
and Convex.

The project is currently pre-production. The multiplayer room lifecycle is
implemented; the next milestone is the first playable round with cards, symbol
matching, scoring, and game completion.

## Current functionality

- Create and join rooms using short room codes
- Persistent anonymous player identities
- Real-time lobby presence
- Host-authorized game start
- Immutable participant roster when a game starts
- Participant reconnection during an active game
- Late-join blocking after the game starts
- Lobby host reassignment when the host leaves
- Server-derived lobby, playing, reconnecting, finished, and unavailable views
- Unit, integration, and multi-browser end-to-end coverage for the room-to-game
  transition

The current game screen establishes the room and participant boundary but does
not yet implement cards or matching gameplay.

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

See [Room-to-game boundary](docs/architecture/room-game-boundary.md) for the
detailed lifecycle and authorization rules, and
[First playable round](docs/architecture/first-playable-round.md) for the
shared two-card race rules and ordered gameplay work.

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

## Development data

This project is pre-production, and existing Convex development data is
disposable. Breaking schema changes may require clearing or recreating the
development deployment.

A production migration and retention policy must be established before the
first public deployment.

## Next milestone

The next major milestone is a shared two-card race. Every participant sees the
same pair, the first valid match claim earns a point, and the first participant
to 12 points wins:

- Generate valid, deterministic Spot It card pairs
- Store server-authoritative round state
- Render two shared cards with clickable symbols
- Validate first-claim-wins symbol matches atomically
- Track scores, advance pairs, and determine a winner
- Transition completed games to `finished`
- Cover the complete round with a multi-player end-to-end test

See [First playable round](docs/architecture/first-playable-round.md) for the
gameplay contract and ordered ticket breakdown.
