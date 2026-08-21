# DigitalOcean and Vercel playtest deployment

This runbook deploys the Next.js frontend to Vercel and exactly one ephemeral
Socket.IO game-server process to an Ubuntu LTS DigitalOcean Droplet.

## 1. Provision the Droplet

1. Create a modest Ubuntu LTS Droplet close to expected playtest users.
2. Add an SSH key and create a non-root deployment user named `spotit`.
3. Create a DigitalOcean Cloud Firewall:
   - TCP 80 and 443 from all public sources;
   - TCP 22 only from trusted administration IPs where practical;
   - no public rule for the Node port.
4. Point a dedicated DNS hostname such as `games.example.com` to the Droplet.
5. Install Node.js 22, pnpm 11, Git, and Caddy.

Node listens on `127.0.0.1`; only Caddy is public.

## 2. Install the application

Clone the repository to `/srv/spot-it-web`, owned by `spotit`, then:

```bash
cd /srv/spot-it-web
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:server
```

Create `/etc/spot-it-game.env` readable only by root and the service:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3200
ALLOWED_ORIGINS=https://your-app.vercel.app
LOG_LEVEL=info
```

Use an exact comma-separated origin allowlist. Add explicit localhost origins
only outside production.

Copy `deploy/spot-it-game.service` to `/etc/systemd/system/`, adjust paths if
needed, then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spot-it-game
sudo systemctl status spot-it-game
curl --fail http://127.0.0.1:3200/healthz
```

The unit uses `Restart=on-failure` and starts one process. Never add systemd
templates, PM2/Node cluster mode, multiple containers, or another replica.

## 3. Terminate TLS with Caddy

Copy the site block from `deploy/Caddyfile.example`, replace the hostname, and
reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl --fail https://games.example.com/healthz
```

Caddy obtains and renews certificates. Do not place certificates in the Node
application or repository.

## 4. Configure Vercel

Set these Vercel Production variables:

| Variable                          | Value                                              |
| --------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_GAME_SERVER_URL`     | `https://games.example.com`                        |
| `FIRST_PUBLIC_PLAYTEST_CONFIRMED` | `true` after the release owner approves publishing |

Clerk, PostHog, and Arcjet variables remain optional. `pnpm deploy:check-env`
prints configured/missing names without values. Vercel uses `pnpm deploy:build`.

## 5. Deploy without overlapping processes

Deploys intentionally terminate active rooms. Update files while the existing
process runs, then perform one ordinary systemd restart:

```bash
cd /srv/spot-it-web
git fetch --prune origin
git checkout --detach <approved-commit-sha>
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:server
sudo systemctl restart spot-it-game
sudo systemctl status spot-it-game
```

Do not start the new process before stopping the old one. `systemctl restart`
preserves the exactly-one-process invariant. Connected clients receive
`server:shutdown` on a graceful stop and then see the room-ended recovery UI.

## 6. Verify WSS and gameplay

Run the automated two-client smoke test from a trusted workstation:

```bash
GAME_SERVER_URL=https://games.example.com \
GAME_SERVER_ORIGIN=https://your-app.vercel.app \
pnpm deploy:smoke
```

Then perform the issue #101 manual browser verification using the Codex in-app
Browser for player one and connected Chrome Computer Use for player two. Record
the deployment URL, distinct local identities, shared lobby/game state, scoring
from both players, player-specific cooldowns, each browser's reconnect, finish,
rematch, explicit leave/host transfer, and restart/expiration recovery.

If connected Chrome is unavailable, report manual two-player verification as
blocked. Two isolated Playwright contexts are the automated fallback, not a
completed manual two-player UI test.

## Logs and incident checks

The service writes structured JSON to stdout/journald and never logs client
tokens or room contents:

```bash
sudo journalctl -u spot-it-game --since '30 minutes ago'
sudo systemctl status spot-it-game
curl --fail https://games.example.com/healthz
```

`/healthz` reports process health only. It exposes no rooms or player data.
There are no application backups because there is no durable application data.

## Rollback

Rollback is also intentionally disruptive:

```bash
cd /srv/spot-it-web
git checkout --detach <previous-good-commit-sha>
pnpm install --frozen-lockfile
pnpm typecheck
sudo systemctl restart spot-it-game
```

Redeploy the matching previous Vercel commit if the frontend protocol changed.
Verify `/healthz`, the WSS smoke test, and two isolated browser sessions again.
