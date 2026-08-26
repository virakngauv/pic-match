# Game-server load testing

The custom load generator exercises Socket.IO authentication, acknowledgements,
and personalized snapshot fan-out against a standalone game server. Never point
it at the production playtest deployment: the script rejects public targets and
is intended for loopback, a private LAN, or a disposable private host.

## Quick start

Start the server in one terminal:

```bash
LOG_LEVEL=warn ALLOWED_ORIGINS=http://127.0.0.1:3000 pnpm start:server
```

Run a 30-second, 50-socket baseline in another terminal (or preferably on a
separate machine on the same private network):

```bash
pnpm load:server --url http://127.0.0.1:3200 \
  --origin http://127.0.0.1:3000 \
  --concurrency 50 --duration 30s
```

The gameplay scenario assigns two sockets to each room. Each pair creates and
joins a room, starts a game, submits valid claims, completes rematches, and
periodically disconnects and resumes the guest session. Output is JSON with
connect counts, per-event successes and failures, error statuses, p50/p95/p99
ack latency, snapshot fan-out latency, and aggregate command throughput.

Loopback runs model distinct client addresses with `X-Forwarded-For`, which the
server accepts only because loopback is a trusted proxy by default. Use
`--no-forwarded-addresses` to deliberately measure the per-address limiter.
Do not add a remote generator as a trusted proxy merely to bypass rate limits.

## Scenarios

Ramp sockets through three stages of equal duration:

```bash
pnpm load:server --duration 6m --ramp 50,200,1000
```

Create rooms until the current 25,000-room cap returns a clean
`server_unavailable` result. Capacity mode disconnects each creator after the
ack, leaving its room resident while keeping generator socket use bounded:

```bash
pnpm load:server --scenario capacity --concurrency 100 \
  --capacity-rooms 25001 --duration 20m
```

The issue that introduced this harness referenced a 5,000-room cap, but the cap
was raised to 25,000 before the harness landed. Set `--capacity-rooms` to one
more than `MAX_ACTIVE_ROOMS` if that constant changes.

Trigger repeated guest reconnects and `session:resume` calls:

```bash
pnpm load:server --scenario reconnect-storm --concurrency 200 \
  --duration 2m --reconnect-interval 250ms
```

To inspect expiration-sweep cost, use capacity mode to create the desired idle
room population, leave the server running through the two-hour idle TTL, and
observe `expiration_sweep` structured log entries. The sweep runs every 60
seconds; its log includes `roomsExpired` and `durationMs`. Keep the profiler
running across the expected expiration window. The default TTL is deliberately
not shortened by the harness because doing so would no longer exercise the
production configuration.

## Profiling

CPU profile (written when the server exits cleanly):

```bash
mkdir -p profiles
NODE_OPTIONS='--cpu-prof --cpu-prof-dir=./profiles' pnpm start:server
```

Heap profile:

```bash
mkdir -p profiles
NODE_OPTIONS='--heap-prof --heap-prof-dir=./profiles' pnpm start:server
```

For an interactive inspector, bind it to loopback and open the printed DevTools
endpoint locally:

```bash
NODE_OPTIONS='--inspect=127.0.0.1:9229' pnpm start:server
```

Capture the server commit, machine CPU/RAM, Node version, generator command,
generator location, profile filenames, and before/after RSS with every result.
Do not compare runs where the generator competed with the server for CPU as if
they were equivalent to separate-machine runs.

## Recorded local baseline

The initial baseline was collected on 2026-08-26 from commit `69a9315` plus the
harness changes, on an arm64 Apple Silicon Mac with Node 22.23.1. The generator
and server shared the machine and communicated over loopback; the server ran
without a CPU or heap profiler. These numbers validate the harness and protocol
path and are not a production capacity claim.

The 50-socket, 30-second quick-start command completed 750/750 claims and
1,500/1,500 snapshot deliveries with no connect, ack, fan-out, or runtime
errors. Throughput was 31.42 commands/second. Claim ack p50/p95/p99 was
2.85/6.52/7.09 ms and snapshot fan-out p50/p95/p99 was 2.95/6.59/7.18 ms.
Server RSS grew from 77,408 KiB to 94,400 KiB while retaining 25 active rooms.

The 60-second `--ramp 50,200,1000` probe reached 1,000 concurrent sockets and
500 rooms without an error: 1,625/1,625 connection attempts, 12,500/12,500
claims, and 25,000/25,000 snapshot deliveries succeeded. Throughput was 266.18
commands/second. At the aggregate level, connect p95/p99 was 107.04/133.23 ms,
claim p95/p99 was 15.36/26.64 ms, and snapshot fan-out p95/p99 was 16.24/26.68
ms. Server RSS grew from 76,656 KiB to 176,912 KiB while retaining 500 active
rooms. Therefore the observed local ceiling is at least 1,000 sockets; this run
did not establish the failure point.

A bounded capacity-mode check created 20/20 rooms successfully, and a
20-socket, five-second reconnect-storm check completed 60/60 connections and
40/40 `session:resume` calls without errors. The full 25,001-attempt room-cap
run and two-hour expiration/profile run remain operational tests to execute on
a disposable test host before the playtest; record those results in issue #120.
