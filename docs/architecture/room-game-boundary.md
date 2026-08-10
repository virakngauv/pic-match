# Room-to-game boundary

## Purpose

This note defines the room lifecycle and player-management rules that should
remain stable while the Spot It game is developed. The implementation work is
tracked separately so each change can be delivered and reviewed on its own.

## Lifecycle

A room moves through three explicit phases. After a completed game, an
authorized rematch transition can reopen the same room's lobby:

```text
lobby -> playing -> finished
  ^                    |
  |______ rematch _____|
```

- `lobby`: new players may join and the host may start once the minimum player
  count is met.
- `playing`: the participant roster is fixed and game actions are accepted.
- `finished`: results are visible and no further gameplay actions are accepted.

Phase transitions are server-authoritative. Client code renders the current
phase but cannot advance it without an authorized mutation.

### Rematch transition

Only an active host may prepare a rematch, and only from `finished`. The
transition changes the room back to `lobby` and clears its current `gameId` and
`startedAt`. It does not create the next game; the existing lobby start flow
does that later from the participants who are online at that time.

Completed `games` and their `gameParticipants` snapshots remain immutable.
Room membership is also preserved, while presence continues to determine who
appears in the reopened lobby and who is included in the next frozen game
roster. A disconnected member may reconnect in the lobby, and a new player may
join until the next game starts.

The transition is single-use for each completed game. Once the first authorized
request returns the room to `lobby`, another request no longer satisfies the
`finished` precondition. Players refreshing or reconnecting before the
transition continue to receive the completed result; afterward they receive the
normal lobby view.

## Participation and presence

Participation and connectivity are separate concepts:

- Room membership records who may participate.
- The game participant roster is an immutable snapshot of eligible room members
  taken when the host starts the game.
- Presence records whether a participant is currently connected.
- Disconnecting never removes a participant from the game or changes turn
  order.

After the game starts, brand-new players receive a `game_in_progress` response.
Players already included in the game roster may reconnect using their existing
player identity.

An explicit leave is different from a temporary disconnect. A player who
explicitly leaves is not automatically restored unless the game rules define a
specific return flow.

## Host behavior

Host-only authorization is enforced by the server, not by hidden or disabled
client controls.

- A temporary host disconnect does not transfer host ownership.
- If the host explicitly leaves during the lobby, the longest-tenured eligible
  active member becomes host.
- Game progression should not depend on the host once the room is playing
  unless a future rule explicitly requires it.

## Room view contract

The room route should render from one server-derived state:

- `not_found`
- `joinable`
- `game_in_progress`
- `reconnecting`
- `lobby`
- `playing`
- `finished`

The playing view must be specific to the requesting participant. Private game
state stays on the server, and mutations validate membership, lifecycle phase,
and the requested move before changing game state.

## Ordered implementation

1. Add the explicit room lifecycle.
2. Freeze the participant roster when the host starts.
3. Block late joins while allowing participant reconnection.
4. Handle host departure during the lobby.
5. Drive the room route from the room view contract.
6. Cover the full room-to-game transition with a multi-browser end-to-end test.

Each item should be implemented in its own branch and pull request.

## Standard issue checklist

Every implementation issue should include:

### Goal

One sentence describing the observable outcome.

### Acceptance criteria

- Observable user behavior
- Authorization and lifecycle edge cases
- Unit or integration coverage
- Relevant end-to-end coverage

### Out of scope

Related behavior intentionally deferred to a later issue.

### Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Convex changes must also compile and deploy successfully to the configured
development deployment.

## Deferred work

The following work should not block the first playable game:

- Ready toggles
- Kick controls
- Spectator mode
- Additional replay and results polish
- Timers
- Room garbage collection

Room cleanup and retention must be addressed before a public production launch.
