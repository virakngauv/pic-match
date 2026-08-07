# Project Instructions

- Use pnpm for dependency management.
- Keep the Next.js App Router and TypeScript strict mode enabled.
- Add reusable UI primitives under `components/ui` and application components under `components`.
- Treat Clerk, Convex, PostHog, and Arcjet as optional in local development until their environment variables are set.
- Run lint, typecheck, unit tests, and a production build before handing off meaningful changes.
- Create or identify a tracking issue before opening a pull request, and include `Closes #<issue-number>` in the pull request description so GitHub links and closes the issue on merge.
- Open pull requests as ready for review by default. Create a draft only when explicitly requested or when required work remains incomplete.
- For CodeRabbit review loops, run CodeRabbit with host credential access so it can read its authenticated account state. If authentication is required, start `coderabbit auth login`, open the printed fallback URL in the Codex in-app Browser, complete GitHub authorization there, and verify with `coderabbit auth status --agent` using the same host access before reviewing.

## Convex Schema Migration Policy

- This project is pre-production; existing Convex development data is disposable.
- Breaking schema changes may intentionally omit data migrations or backfills.
- Do not flag missing migrations unless a change explicitly targets a persistent or production deployment.
- Replace this policy with migration requirements before the first production deployment.
