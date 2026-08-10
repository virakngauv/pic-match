# First public playtest deployment

This runbook defines the one supported deployment path for the first public
playtest. Vercel runs the Next.js application, including `/api/health`, while a
Convex production deployment owns the real-time backend and data. Vercel's
versioned build command runs `convex deploy`, which injects
`NEXT_PUBLIC_CONVEX_URL` into `next build` and deploys the matching Convex
functions.

Do not create or publish the first externally accessible Vercel deployment
without explicit confirmation from the repository owner.

## Environment inventory

Configure values in the service that owns them. Never commit their values.

| Variable                            | Owner             | Requirement                                                                                                             | Safe validation                                                                                               |
| ----------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOY_KEY`                 | Vercel Production | Required; use a production key limited to `deployment:deploy`                                                           | `pnpm deploy:check-env` reports only whether it exists; `vercel env ls production` lists names without values |
| `FIRST_PUBLIC_PLAYTEST_CONFIRMED`   | Vercel Production | Required to publish; set it to `true` only after written repository-owner approval                                      | `pnpm deploy:check-env` reports only whether the exact confirmation value is present                          |
| `NEXT_PUBLIC_CONVEX_URL`            | Build process     | Required at runtime, but do not set it manually in Vercel; `convex deploy` injects the production URL into `pnpm build` | `/api/health` plus the two-browser smoke test prove the built frontend can use its backend                    |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel Production | Optional; leave it and `CLERK_SECRET_KEY` unset for anonymous play                                                      | `pnpm deploy:check-env` reports configured or disabled                                                        |
| `CLERK_SECRET_KEY`                  | Vercel Production | Optional; required together with the Clerk publishable key                                                              | `pnpm deploy:check-env` rejects partial Clerk configuration                                                   |
| `CLERK_FRONTEND_API_URL`            | Convex production | Optional; only needed after Clerk is deliberately added to `convex/auth.config.ts`                                      | `pnpm exec convex env list --prod --names-only` lists names without revealing values                          |
| `NEXT_PUBLIC_POSTHOG_KEY`           | Vercel Production | Optional; analytics remains disabled when absent                                                                        | `pnpm deploy:check-env` reports configured or disabled                                                        |
| `NEXT_PUBLIC_POSTHOG_HOST`          | Vercel Production | Optional; defaults to the US host and has no effect without the PostHog key                                             | `pnpm deploy:check-env` reports configured or disabled                                                        |
| `ARCJET_KEY`                        | Vercel Production | Optional; the demo endpoint remains transparent when absent                                                             | `pnpm deploy:check-env` reports configured or disabled                                                        |

`NEXT_PUBLIC_` values are browser-visible. Never put a secret in one. During
setup, configure only `CONVEX_DEPLOY_KEY`; add the non-secret confirmation
variable after written approval. Clerk, PostHog, and Arcjet should remain unset
unless they are intentionally enabled and tested.

## Prepare from a fresh clone

Requirements are Node.js 22+, pnpm 11, access to the existing Convex project,
and access to the Vercel project.

```bash
git clone https://github.com/virakngauv/spot-it-web.git
cd spot-it-web
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm exec convex dev --once
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The local Convex command selects a development deployment only. It must not be
used as the playtest production deployment.

## One-time service setup

These steps prepare service configuration but stop before publishing.

1. In the Convex dashboard, select this project and its default production
   deployment. Generate a production deploy key whose permissions include only
   `deployment:deploy`.
2. From the fresh clone, create or link a Vercel project without deploying it:

   ```bash
   pnpm dlx vercel link
   ```

   Keep the repository root as the project root. Do not enable the Vercel Git
   integration yet; connecting it to `main` can trigger a production build
   before the explicit first-publish confirmation.

3. Add `CONVEX_DEPLOY_KEY` to the Vercel **Production** environment only. Do not
   paste it into a repository file, issue, command argument, or chat.

   ```bash
   pnpm dlx vercel env add CONVEX_DEPLOY_KEY production
   ```

4. Leave the optional integration variables unset for the anonymous playtest.
5. In Vercel project settings, enable **Automatically expose System Environment
   Variables** so `/api/health` can report `VERCEL_GIT_COMMIT_SHA`. Confirm
   Vercel detected pnpm. The tracked `vercel.json` supplies the only build
   override: `pnpm deploy:build`.
6. Validate variable names without exposing values:

   ```bash
   pnpm dlx vercel env ls production
   ```

Do not add `FIRST_PUBLIC_PLAYTEST_CONFIRMED`, click Deploy, run `vercel --prod`,
or enable an automatic production deployment until the repository owner gives
written confirmation for the first publish.
After the verified first publish, Git integration may be enabled with `main` as
the production branch for subsequent deployments.

## Publish after explicit confirmation

Start from a clean checkout of the commit approved for the playtest:

```bash
git status --short
git rev-parse HEAD
pnpm dlx vercel env add FIRST_PUBLIC_PLAYTEST_CONFIRMED production
pnpm dlx vercel env ls production
pnpm dlx vercel --prod
```

Enter the exact value `true` when adding the confirmation variable. The build
fails before `convex deploy` unless both the deploy key and this exact approval
value are present.

The deployment is successful only if the Vercel build completes
`pnpm deploy:build`. That command checks the environment, builds the Next.js
application with the injected production Convex URL, and deploys the matching
Convex functions. Save the immutable Vercel deployment URL printed by the CLI.

## Health and multiplayer verification

Use the immutable candidate URL, not a local server. The first command validates
HTTPS, `/api/health`, `/home`, and the deployed commit. The Playwright test then
creates a room and joins it from a second isolated browser context.

```bash
PLAYTEST_CANDIDATE_URL=https://candidate.vercel.app
PLAYTEST_COMMIT_SHA=$(git rev-parse HEAD)
pnpm deploy:smoke -- "$PLAYTEST_CANDIDATE_URL" "$PLAYTEST_COMMIT_SHA"
PLAYWRIGHT_BASE_URL="$PLAYTEST_CANDIDATE_URL" \
  pnpm exec playwright test e2e/home.spec.ts
```

Manually open the candidate in two real browser windows as a final sanity check:

1. Create a room in the first window and copy its room code.
2. Join that room from the second window with another name.
3. Confirm both players appear in both lobbies and the host can start the game.

## Record the release

After all checks pass, add a comment to issue #53 containing only:

```text
First public playtest deployment
- Commit: <full git SHA>
- URL: <immutable Vercel deployment URL>
- Health check: passed at <UTC timestamp>
- Two-browser join: passed at <UTC timestamp>
```

The commit SHA and URL are public operational metadata, not credentials. Never
include deploy keys or copied environment values. Preserve the previous known-
good Vercel deployment URL for rollback.

## Rollback

Vercel rollback changes the frontend routing immediately but does not roll back
Convex functions. Prefer backward-compatible Convex changes. If a release is
bad:

1. Restore the previous frontend and verify the rollback status:

   ```bash
   pnpm dlx vercel rollback <known-good-deployment-url>
   pnpm dlx vercel rollback status
   ```

2. If the Convex change is incompatible with the restored frontend, check out
   the same known-good commit, securely pull the Vercel Production environment,
   and redeploy its Convex functions:

   ```bash
   git switch --detach <known-good-commit-sha>
   pnpm install --frozen-lockfile
   pnpm dlx vercel env pull .env.production.local --environment=production
   set -a
   source .env.production.local
   set +a
   pnpm exec convex deploy
   unset CONVEX_DEPLOY_KEY
   ```

   `.env.production.local` is ignored by Git. Delete the local copy after the
   incident according to the operator's credential-handling policy.

3. Re-run `pnpm deploy:smoke` and the remote `e2e/home.spec.ts` check against
   the restored URL.
4. Record the rollback commit, URL, reason, and verification timestamp on the
   deployment issue without including environment values.
