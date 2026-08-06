# First playable round

## Purpose

This note defines the first complete Spot It gameplay loop. It is the contract
for the ordered implementation issues in the `First playable round` milestone.
Each issue should deliver one reviewable slice without changing the room and
participant boundary defined in `room-game-boundary.md`.

## Player experience

All participants race against the same two cards.

- Each card contains several clickable symbols.
- Symbol size and rotation vary within each card, but those visual differences
  do not change a symbol's identity.
- The two cards share exactly one symbol.
- A player claims a match by selecting that symbol once on each card.
- The first valid claim accepted by the server earns one point.
- After an accepted claim, every participant advances to the same next pair.
- The first participant to reach 12 points wins and the game finishes.

An incorrect selection earns no point and does not advance the pair. There is
no wrong-answer penalty in the first playable version.

After the MVP, an incorrect claim should start a three-second, per-player
cooldown. All symbol controls are disabled for the player who guessed
incorrectly during that cooldown, preventing click spam without pausing or
disabling the board for other participants.

## Authoritative game rules

The server owns the current card-pair revision, scores, accepted claims, and
winner. Clients may show selection state optimistically, but they cannot award
points or advance the pair.

A match claim identifies:

- the participant making the claim;
- the card-pair revision the participant viewed;
- one selected symbol from each card.

The server accepts a claim only when the requester is a frozen game
participant, the game is still playing, the revision is current, both symbols
exist on their respective cards, and both selections identify the pair's one
shared symbol.

Claim acceptance, score increment, winner detection, and either pair
advancement or game completion happen atomically. Concurrent valid claims for
the same revision result in exactly one point being awarded. Later claims for
that revision are stale and earn nothing.

## Card and symbol contract

Cards and symbols use stable identifiers so gameplay validation does not
depend on labels, artwork, size, rotation, or screen position. The generator is
deterministic from an explicit supported configuration and seed. It must
guarantee that any presented pair has exactly one shared symbol.

The first implementation uses eight symbols per card and a stable set of 57
semantic symbol identifiers. It supports the room's existing capacity of 2–64
participants without adding a separate gameplay limit. The generator orders
all distinct two-card combinations deterministically and can start another
deterministic cycle if a future ruleset ever needs more combinations.

A 64-player first-to-12 game can require at most 705 accepted claims, so the
1,596 distinct pairs in one 57-card cycle cover the complete MVP without
repeating a pair.

## Presentation and accessibility

Both cards are visible at the same time and are identical for every active
participant. Symbols vary in size and rotation to create the visual search
challenge. Each clickable symbol still needs an accessible name and a visible
keyboard focus state. Rotation, scale, and placement must not be used as the
symbol's identity.

The playing screen also shows every participant's score, clearly marks the
local participant, and gives feedback for selected, incorrect, accepted, and
stale claims. Reconnecting participants receive the current pair revision and
scores rather than restarting the game.

## Ordered implementation

1. Define deterministic two-card match generation.
2. Persist the shared card pair and zeroed scores when the game starts.
3. Render the shared two-card board and scoreboard.
4. Add accessible two-symbol selection and match submission.
5. Validate claims atomically, award the first claimant, and advance the pair.
6. Finish the game when a participant reaches 12 points and show results.
7. Cover the complete multiplayer race with end-to-end tests.

Each item should be implemented in its own branch and pull request.

## Standard issue checklist

Every implementation issue should include:

### Goal

One sentence describing the observable outcome.

### Acceptance criteria

- Observable user behavior
- Authorization, concurrency, and lifecycle edge cases
- Unit or integration coverage
- Relevant end-to-end coverage

### Out of scope

Related behavior intentionally deferred to a later issue.

### Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Convex changes must also compile and deploy successfully to the configured
development deployment.

## Deferred work

The following should not block the first playable game:

- a three-second, per-player cooldown after an incorrect claim;
- round timers;
- alternate Spot It game modes;
- configurable winning scores;
- spectators;
- rematches and polished replay flows;
- animation and audio polish.
