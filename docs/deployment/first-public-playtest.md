# First public playtest: DigitalOcean App Platform and Vercel

This runbook is for someone who can copy commands into a terminal and follow a
web control panel but does not need to already know Linux administration. It
deploys:

- the Next.js website to Vercel; and
- one Socket.IO game-server container to a DigitalOcean App Platform service.

This is deliberately a single-container, in-memory setup. It has no database,
no replicas, no autoscaling, and no heartbeat. Every deploy or restart replaces
the one running container and ends all active rooms. That tradeoff keeps the
first public playtest inexpensive and easy to understand.

## What you are building

```text
Player's browser
  |-- loads the website --------------------------> Vercel
  |
  `-- opens a secure Socket.IO connection (WSS) --> <app-name>.ondigitalocean.app
                                                        |
                                          App Platform ingress (TLS)
                                                        |
                                             one game-server container
                                             (rooms in memory)
```

DigitalOcean App Platform builds the game server from this repository's `main`
branch using its Node.js buildpack, runs exactly one instance, terminates TLS
for you, and routes public HTTPS/WSS traffic to it. The service runs
`pnpm start:server`, which starts `tsx server/index.ts` on the injected port
8080 with `HOST=0.0.0.0`. The container is never reachable except through App
Platform's ingress. App Platform supports WebSockets, so Socket.IO upgrades
work without extra configuration.

You do not manage a server, SSH keys, a firewall, systemd, or a TLS proxy.

### Terms used in this guide

- **App:** one App Platform application. It has a name, a region, and one or
  more components.
- **Service:** a component that serves public HTTP traffic. This app has a
  single service named `game`.
- **Instance:** one running copy of the service's container. This app must
  always run exactly one.
- **Build:** App Platform builds the service on its own build machines using
  its Node.js buildpack. It detects `pnpm-lock.yaml`, installs dependencies
  with pnpm, and runs the repository's default `pnpm build` (the Next.js
  build; unused by the game server but harmless).
- **App spec:** a YAML file that describes the whole app (source, instance
  size, environment variables, health check). The example lives at
  `deploy/app-spec.example.yaml`.
- **Deploy on push:** automatically rebuilds and redeploys when new commits
  land on the tracked branch.
- **Ingress / default domain:** App Platform's public front door. It provides
  the `https://<app-name>.ondigitalocean.app` URL and its TLS certificate.
- **Health check:** a periodic request to `/healthz` that tells App Platform
  the container is alive.

## Before you begin

You need:

- a DigitalOcean account with billing configured;
- a Vercel account connected to GitHub and able to access this repository;
- a terminal on your computer; and
- permission to deploy this public GitHub repository.

Choose and write down these values before continuing:

| Name                         | Example                        | Your value |
| ---------------------------- | ------------------------------ | ---------- |
| App name                     | `pic-match-game`               |            |
| Region                       | `nyc`                          |            |
| Vercel production origin     | `https://pic-match.vercel.app` |            |
| Approved full Git commit SHA | `0123456789abcdef...`          |            |

App names must be 2–32 characters, start with a letter, and use only lowercase
letters, numbers, and dashes. The app name becomes part of the default
`ondigitalocean.app` URL.

Commands below use names such as `YOUR_APPROVED_COMMIT_SHA`. Replace the entire
name with your value. Do not type angle brackets around a replacement value.

## 0. Verify the release candidate locally

Before deploying anything, check out the exact commit you plan to deploy on
your **local computer**. From this repository's directory, run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git status --short
git rev-parse HEAD
```

The first five checks cover linting, TypeScript, unit/server tests, the
production build, and browser end-to-end tests. If Playwright says its test
browsers are missing, run `pnpm exec playwright install` once and retry
`pnpm test:e2e`.

Do not deploy if a check fails or `git status --short` lists changes you did not
intend to ship. Copy the full value from `git rev-parse HEAD` into the worksheet
as the approved commit SHA. For a normal release, this should be a reviewed
commit already merged to `main`.

## 1. Create the app

The example spec at `deploy/app-spec.example.yaml` is ready to use: it points
at this repository's `main` branch, builds with the Node.js buildpack, runs
`pnpm start:server`, pins one instance, and allows the production frontend
origin `https://pic-match.vercel.app`. Review it before continuing.

In the DigitalOcean control panel:

1. Open **Apps** and select **Create App**.
2. Choose **GitHub** as the source, connect your GitHub account if asked, and
   select this repository with the `main` branch.
3. Open the spec editor (the **Edit Spec** / **App Spec** option in the create
   flow) and replace the generated YAML with the contents of
   `deploy/app-spec.example.yaml`.
4. Confirm the service settings match the table below, then create the app.

| Setting           | Required value                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| Source            | GitHub, this repository, `main` branch                                 |
| Source directory  | `/`                                                                    |
| Environment       | Node.js (buildpack; detects `pnpm-lock.yaml`)                          |
| Build command     | None (buildpack installs deps and builds)                              |
| Run command       | `pnpm start:server`                                                    |
| HTTP port         | `8080`                                                                 |
| Health check      | Readiness, HTTP path `/healthz`                                        |
| Instance count    | `1`                                                                    |
| Autoscaling       | Off                                                                    |
| Instance size     | 512 MiB (`apps-s-1vcpu-0.5gb`, $5/mo, 1 shared vCPU, 50 GiB bandwidth) |
| Deploy on push    | Enabled                                                                |
| `HOST`            | `0.0.0.0`                                                              |
| `ALLOWED_ORIGINS` | `https://pic-match.vercel.app`, no trailing slash                      |
| `LOG_LEVEL`       | `info`                                                                 |

No `PORT` variable is needed: App Platform injects `PORT=8080` to match the
HTTP port, and the server honors it. Do not set `NODE_ENV` or any other
variable; the three above are all the service needs.

The first build takes a few minutes. Watch the build logs in the control panel:
the Node.js buildpack detects the pnpm lockfile, installs dependencies, and
runs the repository's default `pnpm build` (the Next.js build; its output is
unused by the game server). When the deployment goes live, open:

```text
https://<app-name>.ondigitalocean.app/healthz
```

It should return `{"status":"ok"}`. This proves the container built, started,
passed its health check, and is reachable through the ingress over HTTPS.

If you prefer the terminal, `doctl` can create the same app after
`doctl auth init`:

```bash
doctl apps create --spec deploy/app-spec.example.yaml
```

### Configure alert notifications

After the app is live, open **Settings > Alert Policies** (or the App-level
**Alerts** section) and enable email notifications at minimum for
**Deployment failed** and **Domain failed**. The example app spec already
declares both. They are free email alerts and are the fastest way to learn
that an autodeploy broke the playtest server.

### Never scale this app

Rooms live only inside the one container's memory, and App Platform's ingress
does not provide sticky WebSocket sessions. Two or more instances would
silently split room state: players could land on different copies of the same
room and see each other's rooms as missing. Keep **instance count at 1** and
**autoscaling off**. If you need more capacity, use a larger instance size,
never more instances.

### Rate limiting shares one bucket on App Platform

The game server rate-limits commands by client address and only trusts
loopback proxies. Behind App Platform's ingress, every player appears to come
from the same internal address, so the shared entry-command budget is 12 room
creates/joins per minute across the whole playtest, and the shared socket
command budget is 400 commands per 10 seconds. Per-player and per-room limits
are unaffected. This is fine for a first playtest; tell players to avoid
rapid-fire joining if you see entry commands rejected.

## 2. Connect the Vercel frontend

If this repository does not have a Vercel project yet:

1. From the Vercel dashboard, select **Add New > Project**.
2. Find this repository and select **Import**.
3. Choose a unique project name. The expected default production origin is
   `https://YOUR_PROJECT_NAME.vercel.app`; record it in the worksheet.
4. Keep the repository root as the root directory and the detected Next.js
   framework/build settings.
5. Before selecting **Deploy**, add the two Production variables described
   below.

For either a new or existing project, configure these Production variables:

1. Open the project and **Settings > Environment Variables**. During a new
   project import, use the **Environment Variables** section on the setup page.
2. Add `NEXT_PUBLIC_GAME_SERVER_URL` with the value
   `https://<app-name>.ondigitalocean.app`.
3. Apply it to **Production**.
4. Add `FIRST_PUBLIC_PLAYTEST_CONFIRMED=true` to Production only after the
   release owner explicitly approves making the playtest public. Before
   setting it, open the app's **Deployments** tab in the DigitalOcean control
   panel and confirm the active deployment's commit matches
   `YOUR_APPROVED_COMMIT_SHA` from step 0. If they differ, stop: deploy-on-push
   has shipped newer commits than the ones you verified, so review and approve
   the newer commit first.
5. Deploy the new project, or open **Deployments** and redeploy the existing
   production deployment. Vercel environment-variable changes do not affect an
   already-built deployment.

The game server's `ALLOWED_ORIGINS` value must exactly match the frontend's
production origin, with no path or trailing slash. These are different values:

- frontend origin: `https://pic-match.vercel.app`
- game server URL: `https://<app-name>.ondigitalocean.app`

If you created the app with a guessed Vercel origin and the real one differs,
update `ALLOWED_ORIGINS` in **Settings > Components > game > Environment
Variables**, then redeploy the app so the value reaches the container.

Clerk, PostHog, and Arcjet remain optional. Locally,
`pnpm deploy:check-env` reports configured and missing variable names without
printing their values. Vercel uses `pnpm deploy:build` for its production build.

## 3. Verify the deployment

### Automated WSS smoke test

On your **local computer**, use a checked-out copy of this repository with its
dependencies installed:

```bash
GAME_SERVER_URL=https://<app-name>.ondigitalocean.app \
GAME_SERVER_ORIGIN=https://pic-match.vercel.app \
pnpm deploy:smoke
```

Replace both example URLs. This connects two isolated Socket.IO clients over
WSS and checks basic room behavior. A passing result is necessary, but it does
not replace using the real website in two browsers.

### Manual two-player browser verification

Use two separate devices or browser profiles. Two ordinary tabs in the same
browser share local player storage and do not prove that two independent
players work.

1. Open the production Vercel URL in browser/device A and create a room.
2. Open the same URL in browser/device B and join with the room code.
3. Confirm the two browsers show different player identities.
4. Start a game and confirm both players see the same board and game state.
5. Score once from A, then once from B. Confirm both screens update correctly.
6. Confirm a cooldown for one player does not incorrectly block the other.
7. Refresh A, then B, one at a time. Confirm each reconnects to the room.
8. Finish the game and test rematch.
9. Test an explicit leave and confirm host transfer when the host leaves.
10. Redeploy the app from the control panel's **Actions** menu. Confirm both
    browsers explain that the room ended instead of becoming stuck.

When Codex performs this check, use the Codex in-app Browser for player one and
connected Chrome Computer Use for player two. If connected Chrome is
unavailable, report manual two-player verification as blocked. Two isolated
Playwright contexts are an automated fallback, not a completed manual test.

Record the tested frontend URL, game-server URL, deployed commit, browsers,
and results so someone else can reproduce the check.

## Routine deploys

With deploy on push enabled, pushing a reviewed commit to `main` rebuilds and
replaces the single game-server container automatically. You can also open the
app's **Actions** menu in the control panel and trigger a deploy of the current
`main` HEAD.

Every deploy ends active rooms: the replacement container starts with empty
memory. During the swap, App Platform drains new connections, sends the old
container a `SIGTERM`, and the game server broadcasts `server:shutdown` so
connected browsers show the room-ended recovery UI. Ask players to create a new
room after a deploy.

If the frontend/server protocol also changed, deploy the matching frontend
commit to Vercel.

## Logs and troubleshooting

Open the app in the DigitalOcean control panel and use the **Runtime Logs**
tab, or run on your **local computer**:

```bash
doctl apps list
doctl apps logs YOUR_APP_ID --type run
```

The game server writes structured JSON and does not log client tokens or room
contents. The build log (**Build Logs** during a deployment) shows buildpack
dependency installation and `pnpm build` output. `/healthz` reports process
health only; it exposes no room or player data.

| Symptom                                        | Most likely checks                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Build fails                                    | Open the build log; confirm the source repo/branch are correct and the run command is `pnpm start:server`.                                      |
| Deploy never goes live                         | Check the runtime log for a startup crash and confirm the health check uses HTTP path `/healthz` on port 8080.                                  |
| Website loads but multiplayer does not connect | Confirm the Vercel `NEXT_PUBLIC_GAME_SERVER_URL`, the exact `ALLOWED_ORIGINS` value, and that Vercel was redeployed after its variable changed. |
| Entry commands rejected for many players       | The shared ingress rate-limit bucket is exhausted; see the rate-limiting note above and slow down joining.                                      |
| Players in the same room cannot see each other | Instance count is above 1 or autoscaling is on. Set instance count back to 1, disable autoscaling, and redeploy; affected rooms end.            |
| Rooms disappear during a deploy                | Expected: rooms live only in the one container's memory. Ask players to create a new room.                                                      |
| Panel shows the old `spot-it-web` repository   | Apps created before the repository rename keep the original clone URL; GitHub redirects it, so no action is required.                           |
| Need older logs                                | Use **Insights** or forward logs with `log_destinations` in the app spec.                                                                       |

There are no application-data backups because there is no durable application
data. Delete and recreate the app from this runbook if necessary.

## Roll back

Open the app's **Deployments** tab in the control panel, find the last
successful deployment of the commit you want, and use its **Rollback** action.
Rollback redeploys the previously built image; it also ends active rooms.

Then redeploy the matching previous Vercel commit if the frontend protocol
changed, and rerun the automated WSS smoke test and manual two-browser
verification.

## Official references

- [App Platform product documentation](https://docs.digitalocean.com/products/app-platform/)
- [App Platform how-tos](https://docs.digitalocean.com/products/app-platform/how-to/)
- [App specification reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
- [App Platform details and pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/)
- [Install and configure doctl](https://docs.digitalocean.com/reference/doctl/how-to/install/)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Install pnpm](https://pnpm.io/installation)
- [Corepack installation and commands](https://github.com/nodejs/corepack#readme)
- [Manage Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
- [Deploy a Git repository with Vercel](https://vercel.com/docs/git)
