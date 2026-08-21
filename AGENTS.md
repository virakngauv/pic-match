# Project Instructions

- Use pnpm for dependency management.
- Keep the Next.js App Router and TypeScript strict mode enabled.
- Add reusable UI primitives under `components/ui` and application components under `components`.
- Treat Clerk, Convex, PostHog, and Arcjet as optional in local development until their environment variables are set.
- Run lint, typecheck, unit tests, and a production build before handing off meaningful changes.
- Create or identify a tracking issue before opening a pull request, and include `Closes #<issue-number>` in the pull request description so GitHub links and closes the issue on merge.
- Open pull requests as ready for review by default. Create a draft only when explicitly requested or when required work remains incomplete.
- For CodeRabbit review loops, run CodeRabbit with host credential access so it can read its authenticated account state. If authentication is required, start `coderabbit auth login`, open the printed fallback URL in the Codex in-app Browser, complete GitHub authorization there, and verify with `coderabbit auth status --agent` using the same host access before reviewing.

## Pull Request Review Replies

- After implementing feedback from a pull request review comment, reply in the original thread as Codex, explain why the feedback was addressed, and summarize the resulting change.
- When feedback does not warrant a code or documentation change, reply in the original thread as Codex with the concrete reasoning for leaving the implementation unchanged.
- Do not resolve review threads unless the user explicitly asks for resolution.

## Multiplayer Browser Testing

- For exploratory two-player browser testing, use the Codex in-app Browser as player one and connected Chrome Computer Use as player two.
- Create and join the room through both real user interfaces. Do not use two tabs in the same browser because they share player storage.
- Verify that each browser identifies a different local player before describing the test as two-player.
- Test shared board state, scoring from both players, player-specific cooldowns, and reconnect behavior from both browsers.
- If Chrome Computer Use is unavailable, report the exploratory two-player test as blocked. Use two isolated Playwright browser contexts as the automated fallback.
- Never describe a backend-injected participant as a complete two-player UI test. Label it as a single-player UI test with a simulated participant.

## Convex Schema Migration Policy

- This project is pre-production; existing Convex development data is disposable.
- Breaking schema changes may intentionally omit data migrations or backfills.
- Do not flag missing migrations unless a change explicitly targets a persistent or production deployment.
- Replace this policy with migration requirements before the first production deployment.
