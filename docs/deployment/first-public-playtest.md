# First public playtest: DigitalOcean and Vercel

This runbook is for someone who can copy commands into a terminal but does not
need to already know Linux administration or networking. It deploys:

- the Next.js website to Vercel; and
- one Socket.IO game-server process to an Ubuntu DigitalOcean Droplet.

This is deliberately a single-server, in-memory setup. It has no database,
replicas, process cluster, or heartbeat. A server deploy, restart, or crash ends
all active rooms. That tradeoff keeps the first public playtest inexpensive and
easy to understand.

## What you are building

```text
Player's browser
  |-- loads the website --------------------------> Vercel
  |
  `-- opens a secure Socket.IO connection (WSS) --> games.example.com:443
                                                       |
                                                    Caddy
                                                       |
                                             127.0.0.1:3200
                                                       |
                                                Node game server
                                                (rooms in memory)
```

Caddy is a small web server that acts as the public front door for the game
server. It obtains and renews the HTTPS certificate, accepts public HTTPS/WSS
traffic, and forwards that traffic to Node on the Droplet. Node listens only on
`127.0.0.1:3200`, so players cannot bypass Caddy and connect to it directly.

### Terms used in this guide

- **VPS / Droplet:** a small Linux computer rented from a cloud provider.
  DigitalOcean calls its VPS product a Droplet.
- **SSH:** an encrypted terminal connection from your computer to the Droplet.
- **Domain:** a name you own, such as `example.com`.
- **Hostname:** the complete name for one service, such as
  `games.example.com`.
- **DNS A record:** the setting that points a hostname to the Droplet's public
  IPv4 address.
- **Port:** a numbered network entrance. SSH uses 22, HTTP uses 80, HTTPS uses
  443, and the private Node service in this guide uses 3200.
- **Firewall:** rules deciding which public ports can receive traffic.
- **systemd:** Ubuntu's built-in service manager. It starts Node after a reboot
  and restarts it after a crash.
- **Reverse proxy:** a public service (Caddy here) that receives a request and
  passes it to a private service (Node here).
- **TLS / HTTPS / WSS:** encryption for web pages and WebSockets. Caddy manages
  this automatically after DNS and the firewall are correct.
- **Origin:** the protocol and hostname where a webpage runs, for example
  `https://spot-it-web.vercel.app`. A trailing slash is not part of the origin.

## Before you begin

You need:

- a DigitalOcean account with billing configured;
- a Vercel account connected to GitHub and able to access this repository;
- a domain and access to its DNS settings;
- a terminal on your computer; and
- permission to deploy this public GitHub repository.

Choose and write down these values before running commands:

| Name                                      | Example                          | Your value |
| ----------------------------------------- | -------------------------------- | ---------- |
| Droplet IP                                | `203.0.113.10`                   |            |
| Game hostname                             | `games.example.com`              |            |
| Planned/existing Vercel production origin | `https://spot-it-web.vercel.app` |            |
| Approved full Git commit SHA              | `0123456789abcdef...`            |            |

Commands below use names such as `YOUR_DROPLET_IP` and
`YOUR_APPROVED_COMMIT_SHA`. Replace the entire name with your value. Do not type
angle brackets around a replacement value.

Each command block says where to run it:

- **Local computer** means your Mac, Windows, or Linux terminal.
- **Droplet** means the terminal after you have connected with SSH.

## 0. Verify the release candidate locally

Before renting or changing infrastructure, check out the exact commit you plan
to deploy on your **local computer**. From this repository's directory, run:

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

## 1. Create or find an SSH key

An SSH key has a private half on your computer and a public half that can safely
be added to DigitalOcean. Never paste or upload the private key.

On your **local computer**, check for an existing Ed25519 public key:

```bash
ls ~/.ssh/id_ed25519.pub
```

If that file exists, show the public key so you can copy it:

```bash
cat ~/.ssh/id_ed25519.pub
```

If it does not exist, create one and accept the default file location. A
passphrase is recommended.

```bash
ssh-keygen -t ed25519 -C "spot-it-digitalocean"
cat ~/.ssh/id_ed25519.pub
```

The public key is one line beginning with `ssh-ed25519`. Copy the entire line.

## 2. Create the DigitalOcean Droplet

In the DigitalOcean control panel:

1. Select **Create > Droplets**.
2. Choose the region closest to most playtesters.
3. Choose **Ubuntu 24.04 LTS**, which is the version targeted by this guide.
4. Choose a Basic/shared-CPU Droplet. One CPU and 2 GiB of memory is a
   comfortable starting point for a small playtest.
5. Under authentication, choose **SSH Key**, add the public key from step 1,
   and select it.
6. Enable monitoring. Backups are optional for this ephemeral server because
   rooms are not stored on disk, but a backup can still make server recovery
   easier.
7. Give the Droplet a recognizable name, such as `spot-it-game-1`, and create
   it.
8. Copy its public IPv4 address into the worksheet above.

Do not create a load balancer or a second Droplet. Two game-server processes
would have separate room memory and players could reach different copies of a
room.

## 3. Create the firewall

This guide uses a DigitalOcean Cloud Firewall. Do not also enable Ubuntu's UFW
firewall unless you know how to maintain two matching sets of rules.

In DigitalOcean, open **Networking > Firewalls**, create a firewall, and add
these inbound rules:

| Type  | Port  | Sources                               | Why                                        |
| ----- | ----- | ------------------------------------- | ------------------------------------------ |
| SSH   | `22`  | Your current public IP when practical | Terminal administration                    |
| HTTP  | `80`  | `0.0.0.0/0` and `::/0`                | HTTPS redirect and certificate setup       |
| HTTPS | `443` | `0.0.0.0/0` and `::/0`                | Website and secure WebSocket traffic (WSS) |

Keep the default rule that allows all outbound traffic, then attach the
firewall to this Droplet.

Do **not** add a public rule for port 3200. Node will accept connections from
Caddy on the same machine only.

If your home public IP changes, SSH may stop working. Update the firewall's SSH
source to the new IP. The DigitalOcean Recovery Console is the fallback if you
lock yourself out.

## 4. Point the game hostname to the Droplet

At the service that manages your domain's DNS, create an A record:

| Field           | Value                              |
| --------------- | ---------------------------------- |
| Type            | `A`                                |
| Host/name       | `games` (for `games.example.com`)  |
| Value/points to | Your Droplet's public IPv4 address |
| TTL             | The provider's default             |

If your desired hostname is different, use its subdomain portion instead of
`games`. DNS changes can take time to appear.

On your **local computer**, check the result:

```bash
nslookup games.example.com
```

Continue when the answer contains your Droplet IP. If it does not, recheck the
record and wait a few minutes before trying again.

## 5. Connect and create the deployment user

On your **local computer**, connect as the initial root user:

```bash
ssh root@YOUR_DROPLET_IP
```

The first connection asks whether you trust the host. Check that the IP is the
one DigitalOcean assigned, type `yes`, and press Enter.

On the **Droplet**, create a normal user named `spotit`. `adduser` asks you to
choose a password; use a strong unique one. The profile questions can be left
blank by pressing Enter.

```bash
adduser spotit
usermod -aG sudo spotit
install -d -m 700 -o spotit -g spotit /home/spotit/.ssh
cp /root/.ssh/authorized_keys /home/spotit/.ssh/authorized_keys
chown spotit:spotit /home/spotit/.ssh/authorized_keys
chmod 600 /home/spotit/.ssh/authorized_keys
```

Keep this root terminal open temporarily. In a **second local terminal**, test
the safer account:

```bash
ssh spotit@YOUR_DROPLET_IP
sudo -v
```

Enter the `spotit` password when `sudo` asks. Continue only when both commands
succeed. Use the `spotit` SSH account for the rest of this guide; you can close
the root terminal.

## 6. Update Ubuntu and install the tools

Run this section on the **Droplet** as `spotit`.

First install Ubuntu updates and reboot:

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

Your SSH connection will close. Wait about a minute, then reconnect from your
**local computer**:

```bash
ssh spotit@YOUR_DROPLET_IP
```

Install basic tools:

```bash
sudo apt install -y ca-certificates curl git gnupg
```

Install the latest Node.js 22 release from NodeSource. Node 22 matches this
repository's CI configuration.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
command -v node
```

The version should start with `v22` and the path should be `/usr/bin/node`. Stop
and fix this before continuing if either result is different, because the
included systemd service uses that exact path.

Install the repository's pinned pnpm version:

```bash
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=11.9.0 sh -
. ~/.bashrc
pnpm --version
```

The pnpm version should be `11.9.0`.

Finally, install Caddy from its official Ubuntu/Debian package repository:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
sudo systemctl status caddy --no-pager
```

The final status should say `active (running)`. Caddy may show its default page
until you configure it later.

## 7. Download and test the game server

This repository is public, so the Droplet does not need a GitHub password,
token, or deploy key.

On the **Droplet**:

```bash
sudo install -d -o spotit -g spotit /srv/spot-it-web
git clone https://github.com/virakngauv/spot-it-web.git /srv/spot-it-web
cd /srv/spot-it-web
git checkout --detach YOUR_APPROVED_COMMIT_SHA
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:server
```

`--detach` is intentional: it makes the deployed version an exact commit rather
than a branch that can change later. Do not continue if installation, typecheck,
or tests fail.

## 8. Configure and start the Node service

Create the server's environment file on the **Droplet**:

```bash
sudo touch /etc/spot-it-game.env
sudo chown root:spotit /etc/spot-it-game.env
sudo chmod 640 /etc/spot-it-game.env
sudo nano /etc/spot-it-game.env
```

Paste the following, replacing the Vercel example with your exact production
origin. Do not add a trailing slash.

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3200
ALLOWED_ORIGINS=https://your-app.vercel.app
LOG_LEVEL=info
```

In nano, save with **Control+O**, press **Enter**, and exit with **Control+X**.
Multiple approved origins can be separated with commas. Do not add `*`, and do
not add localhost origins to the production server.

Install and start the included systemd service:

```bash
cd /srv/spot-it-web
sudo cp deploy/spot-it-game.service /etc/systemd/system/spot-it-game.service
sudo systemctl daemon-reload
sudo systemctl enable --now spot-it-game
sudo systemctl status spot-it-game --no-pager
curl --fail http://127.0.0.1:3200/healthz
```

The status should say `active (running)` and the health request should return a
small success response. This test is private: it runs on the Droplet and reaches
Node directly.

The service starts exactly one process and uses `Restart=on-failure`. Never add
systemd templates, PM2/Node cluster mode, multiple containers, or another
replica to this deployment.

## 9. Configure Caddy for public HTTPS/WSS

Caddy can request a public certificate only after the hostname resolves to this
Droplet and public ports 80 and 443 reach it. Steps 3 and 4 must therefore be
working first.

On the **Droplet**, back up Caddy's default configuration, install the included
example, and open it for editing:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-spot-it
sudo cp /srv/spot-it-web/deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Replace `games.example.com` with your game hostname. Save and exit nano, then
format, validate, and reload the configuration:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
curl --fail https://games.example.com/healthz
```

Replace the hostname in the final command too. Success proves that DNS, the
firewall, Caddy's certificate, Caddy's reverse proxy, and Node are connected.

Caddy obtains and renews certificates automatically. Do not put certificates
in the Node application or Git repository. Keep the example's
`X-Forwarded-For` setting: the game server uses the address supplied by this
single trusted proxy for abuse limits instead of trusting a browser-supplied
header.

## 10. Connect the Vercel frontend

If this repository does not have a Vercel project yet:

1. From the Vercel dashboard, select **Add New > Project**.
2. Find `virakngauv/spot-it-web` and select **Import**. If it is absent, review
   the GitHub permissions Vercel offers to update.
3. Choose a unique project name. The expected default production origin is
   `https://YOUR_PROJECT_NAME.vercel.app`; record it in the worksheet and use
   it for `ALLOWED_ORIGINS` in step 8.
4. Keep the repository root as the root directory and the detected Next.js
   framework/build settings.
5. Before selecting **Deploy**, add the two Production variables described
   below. The repository intentionally rejects a public build without them.

For either a new or existing project, configure these Production variables:

1. Open the project and **Settings > Environment Variables**. During a new
   project import, use the **Environment Variables** section on the setup page.
2. Add `NEXT_PUBLIC_GAME_SERVER_URL` with the value
   `https://games.example.com`, replacing the example hostname.
3. Apply it to **Production**.
4. Add `FIRST_PUBLIC_PLAYTEST_CONFIRMED=true` to Production only after the
   release owner explicitly approves making the playtest public.
5. Deploy the new project, or open **Deployments** and redeploy the existing
   production deployment. Vercel
   environment-variable changes do not affect an already-built deployment.

Copy the resulting production URL. If its origin differs from the one in
`/etc/spot-it-game.env`, edit `ALLOWED_ORIGINS` on the Droplet and run
`sudo systemctl restart spot-it-game` before testing. Do not include a path or
trailing slash in the origin.

The game server's `ALLOWED_ORIGINS` value from step 8 must exactly match the
frontend's production origin. These are different values:

- frontend origin: `https://your-app.vercel.app`
- game server URL: `https://games.example.com`

Clerk, PostHog, and Arcjet remain optional. Locally,
`pnpm deploy:check-env` reports configured and missing variable names without
printing their values. Vercel uses `pnpm deploy:build` for its production build.

## 11. Verify the deployment

### Automated WSS smoke test

On your **local computer**, use a checked-out copy of this repository with its
dependencies installed:

```bash
GAME_SERVER_URL=https://games.example.com \
GAME_SERVER_ORIGIN=https://your-app.vercel.app \
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
10. Restart the service with `sudo systemctl restart spot-it-game`. Confirm
    both browsers explain that the room ended instead of becoming stuck.

When Codex performs this check, use the Codex in-app Browser for player one and
connected Chrome Computer Use for player two. If connected Chrome is
unavailable, report manual two-player verification as blocked. Two isolated
Playwright contexts are an automated fallback, not a completed manual test.

Record the tested frontend URL, game-server URL, deployed commit SHA, browsers,
and results so someone else can reproduce the check.

## Routine deploys

Deploys intentionally end active rooms. Update the files while the existing
process continues to run, then perform one ordinary systemd restart:

```bash
ssh spotit@YOUR_DROPLET_IP
cd /srv/spot-it-web
git status --short
git fetch --prune origin
git checkout --detach YOUR_NEW_APPROVED_COMMIT_SHA
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:server
sudo systemctl restart spot-it-game
sudo systemctl status spot-it-game --no-pager
curl --fail https://games.example.com/healthz
```

Stop if `git status --short` shows unexpected server-side edits. Do not start a
second process before stopping the first. `systemctl restart` preserves the
exactly-one-process design. Connected clients receive `server:shutdown` during
a graceful stop and then see the room-ended recovery UI.

If the frontend/server protocol also changed, deploy the matching frontend
commit to Vercel.

## Logs and troubleshooting

Start with these read-only commands on the **Droplet**:

```bash
sudo systemctl status spot-it-game --no-pager
sudo journalctl -u spot-it-game --since '30 minutes ago' --no-pager
sudo systemctl status caddy --no-pager
sudo journalctl -u caddy --since '30 minutes ago' --no-pager
curl --fail http://127.0.0.1:3200/healthz
curl --fail https://games.example.com/healthz
```

The services write logs to Ubuntu's journal. The game server uses structured
JSON and does not log client tokens or room contents. `/healthz` reports process
health only; it exposes no room or player data.

| Symptom                                        | Most likely checks                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SSH times out                                  | Confirm the Droplet is running, the IP is correct, and firewall port 22 allows your current public IP.                               |
| `nslookup` shows the wrong IP                  | Correct the DNS A record and wait for its TTL.                                                                                       |
| Private health check fails                     | Inspect `spot-it-game` status/logs, `/etc/spot-it-game.env`, and `command -v node`.                                                  |
| Public health check returns 502                | Node is unavailable to Caddy; run the private health check and inspect both services' logs.                                          |
| Caddy cannot obtain a certificate              | Confirm DNS points to this Droplet and public ports 80 and 443 are allowed.                                                          |
| Website loads but multiplayer does not connect | Confirm the Vercel server URL, exact `ALLOWED_ORIGINS` value, Caddy logs, and that Vercel was redeployed after its variable changed. |
| Rooms disappear during a deploy or reboot      | Expected: rooms live only in one process's memory. Ask players to create a new room.                                                 |

If SSH is completely unavailable, use the Droplet's **Access > Launch Recovery
Console** in DigitalOcean to inspect the machine or repair firewall/account
configuration.

There are no application-data backups because there is no durable application
data. Recreate the server from this runbook if necessary.

## Roll back

Rollback also ends active rooms. On the **Droplet**:

```bash
cd /srv/spot-it-web
git checkout --detach YOUR_PREVIOUS_GOOD_COMMIT_SHA
pnpm install --frozen-lockfile
pnpm typecheck
sudo systemctl restart spot-it-game
sudo systemctl status spot-it-game --no-pager
curl --fail https://games.example.com/healthz
```

Redeploy the matching previous Vercel commit if the frontend protocol changed.
Then rerun the automated WSS smoke test and manual two-browser verification.

## Official references

- [Create a DigitalOcean Droplet](https://docs.digitalocean.com/products/droplets/how-to/create/)
- [DigitalOcean's recommended Droplet setup](https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/)
- [Connect to a Droplet with OpenSSH](https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/openssh/)
- [Create and configure a DigitalOcean Cloud Firewall](https://docs.digitalocean.com/products/networking/firewalls/getting-started/quickstart/)
- [Manage DNS records in DigitalOcean](https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/)
- [Install Caddy](https://caddyserver.com/docs/install)
- [Caddy reverse-proxy quick start](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [NodeSource Debian/Ubuntu support and installation](https://github.com/nodesource/distributions/blob/master/DEV_README.md)
- [Install pnpm](https://pnpm.io/installation)
- [Manage Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
- [Deploy a Git repository with Vercel](https://vercel.com/docs/git)
