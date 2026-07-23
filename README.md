# Spot It Web

A production-minded Next.js starter based on the requested stack:

- React 19, Next.js App Router, Tailwind CSS, and shadcn/ui
- Convex for backend functions and data
- Clerk for authentication
- PostHog for product analytics
- Arcjet for application security
- ESLint, Prettier, Vitest, React Testing Library, and Playwright

## Local development

1. Copy `.env.example` to `.env.local`.
2. Install packages with `pnpm install`.
3. Start Next.js with `pnpm dev`.

The app works without third-party credentials. Providers activate only when their public environment variables are present.

## Wiring lab

The home page includes an interactive tab for each major layer:

- React proves client hydration and state updates.
- Next.js calls `GET /api/hello`.
- Convex shows a live websocket connection state when configured.
- Clerk exposes sign-in or the current user when configured.
- PostHog captures `hello_world_clicked` when configured.
- Arcjet calls `POST /api/arcjet-demo` and runs Shield when configured.

Unconfigured third-party services use clearly labeled demo responses, so the full lab remains usable before credentials are added.

## Configure services

### Convex

Run `pnpm convex:dev` and follow the prompts. Convex will create a deployment and write `NEXT_PUBLIC_CONVEX_URL` to `.env.local`.

### Clerk

Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The root provider activates automatically; add Clerk middleware when you introduce protected routes.

### PostHog

Add `NEXT_PUBLIC_POSTHOG_KEY` and, if needed, override `NEXT_PUBLIC_POSTHOG_HOST`. Page-view capture activates automatically.

### Arcjet

Add `ARCJET_KEY` and apply `@arcjet/next` protection to the first route or server action that accepts untrusted input. Security rules should be chosen for the route instead of applied generically.

## Quality commands

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```
