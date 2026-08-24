# Room and game-server boundary

## Intent

Spot It uses a single in-memory authority because a multiplayer match benefits
from low-latency coherent snapshots more than this pre-production project
benefits from durable state. The tradeoff is explicit: rooms disappear whenever
the process exits.

```text
Vercel / browser
└── GameSocketProvider
    └── one Socket.IO connection per browser tab

DigitalOcean Droplet
└── Caddy (TLS)
    └── one Node.js process
        ├── GET /healthz
        ├── Socket.IO protocol boundary
        └── GameServer
            └── Map<roomCode, GameRoom>
```

## Responsibilities

`GameServer` generates room codes, finds rooms, routes commands, and evicts idle
rooms. It does not contain gameplay rules.

Each `GameRoom` is a synchronous actor for one room. It owns membership, host
role, phase, one live member roster that carries per-game seats (position,
score, cooldown), deterministic game seed, pair revision, winner, command
deduplication, room revision, and meaningful-activity time. Its methods
contain no `await` and do not import Socket.IO, so one Node event loop
serializes competing claims.

The protocol layer validates every untrusted handshake and command, applies
rate limits, joins sockets to transport rooms, and emits a complete personalized
snapshot after each state revision.

## Identity and membership

The browser stores a random 32-character hexadecimal client token in
`localStorage` and sends it in Socket.IO handshake auth. The token is a private
capability and is never broadcast or logged. A socket ID is transport-only.

Creating or joining establishes membership. Disconnect only detaches a
transport. Membership ends through explicit leave, idle room expiration, or
process exit. In the lobby, an explicitly departing host transfers ownership to
the longest-tenured remaining member.

Joining stays open while a game is playing: a new identity takes the next
scoreboard position at zero, and a returning member restores their seat, score,
and cooldown. Departed mid-game players keep their seat as a score-bearing
tombstone so the final scoreboard stays truthful; seats and scores reset when
the host prepares a rematch. Joining closes once the game finishes.

Multiple sockets with one token resolve to one member. A reconnect requests a
fresh snapshot, so correctness does not depend on event replay or Socket.IO
connection-state recovery.

## Host removal

The lobby host may remove another member. A successful removal records the
member's private token fingerprint (SHA-256) in a room-scoped deny set before
releasing the seat, so the room never retains a reusable bearer credential.
Denied identities receive a typed `removed_from_room` result from join and a
`removed_from_room` snapshot on resume, before any phase, reactivation, or
capacity logic runs; repeated attempts allocate no player ID, seat, revision,
or activity update. The denial is private server state — never included in
snapshots, events, or logs — and lasts until the room is deleted or expires,
surviving game start, finish, and rematch. Only successful authorized removals
mutate the deny set, and the set is bounded (256 entries, oldest first) so a
long-lived room cannot grow it without limit; beyond that bound the earliest
removals are forgotten.

Identity limitation: without authenticated accounts, a denial is only as
durable as the client token in `localStorage`. Clearing browser storage or
joining from another browser or device mints a different token that the server
cannot reliably recognize as the same person. IP addresses, device
fingerprints, and network-level blocking are intentionally not introduced.

## Claims and snapshots

A claim includes a unique command ID, the viewed pair revision, and one selected
symbol ID from each card. The room rejects stale revisions before scoring.
Accepted command IDs are remembered in a bounded per-player map, preventing a
retry from scoring twice. Because claim transitions are synchronous, two valid
claims for one pair revision can award at most one point.

Incorrect claims update only that participant's cooldown. The transport then
emits personalized snapshots so other players remain interactive.

## Cleanup and failure semantics

Meaningful create, join, leave, start, claim, and rematch commands update room
activity. Transport ping/pong, disconnects, and reconnect requests do not. A
coarse timer expires idle lobbies, games, and finished rooms with bounded
defaults documented in the README.

The server emits `room:expired` before eviction when connected sockets exist.
On graceful termination it stops accepting commands and emits
`server:shutdown`. The frontend explains the intentional room loss and offers
create/join recovery actions.

The topology must stay at exactly one game-server process. A second worker,
cluster mode, overlapping deployment, load balancer, or horizontal autoscaling
would split room ownership without an adapter and is unsupported.
