# Project Instructions

- Use pnpm for dependency management.
- Keep the Next.js App Router and TypeScript strict mode enabled.
- Add reusable UI primitives under `components/ui` and application components under `components`.
- Treat Clerk, Convex, PostHog, and Arcjet as optional in local development until their environment variables are set.
- Run lint, typecheck, unit tests, and a production build before handing off meaningful changes.
- For CodeRabbit review loops, run CodeRabbit with host credential access so it can read its authenticated account state. If authentication is required, start `coderabbit auth login`, open the printed fallback URL in the Codex in-app Browser, complete GitHub authorization there, and verify with `coderabbit auth status --agent` using the same host access before reviewing.
