# Monitoring failure drill

Recorded evidence that the game server's monitoring events fire for real
failures and can be read back from its logs. Repeat the drill with:

```bash
GAME_SERVER_URL=http://127.0.0.1:3299 \
GAME_SERVER_ORIGIN=http://localhost:3000 \
pnpm monitoring:drill
```

## Local drill — 2026-08-26

- Commit under test: `codex-issue-55-server-monitoring` branch working tree
  including the handshake-rejection aggregation change (previous recorded run:
  `ed65fc7`, 2026-08-25), run from a clean checkout on macOS (Node 22.23.1).
- Server: local single process (`pnpm exec tsx server/index.ts`, `PORT=3299`,
  `HOST=127.0.0.1`, `ALLOWED_ORIGINS=http://localhost:3000`, default
  `LOG_LEVEL=info`), stdout captured to a file.
- Client: `pnpm monitoring:drill` from the same working tree.
- The deployed App Platform drill remains to be run by an operator with
  control-panel access, using the same script against the production URL.
  Everything verified below is process behavior and applies unchanged.

### Steps and observed results

| Step                                                                  | Client result                                         | Server log line observed                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /healthz`                                                        | `200 {"status":"ok"}`                                 | `{"event":"game_server_started","host":"127.0.0.1","port":3299}` (startup)                                    |
| Connect with disallowed origin                                        | connect error                                         | `{"event":"handshake_rejected","reason":"origin_not_allowed","occurrences":1}` (after the 30 s counter flush) |
| Connect with invalid auth token                                       | connect error                                         | `{"event":"handshake_rejected","reason":"invalid_auth","occurrences":1}` (after the 30 s counter flush)       |
| Repeated unknown-room `session:resume` probes until `rate_limited`    | `rate_limited` ack                                    | `{"event":"rate_limited","budget":"entry","occurrences":1}` (after the 30 s counter flush)                    |
| 10 consecutive incorrect `game:claim`s (host plus 9 mid-game joiners) | `incorrect` acks                                      | `{"event":"claim_streak","roomCode":"rrtz4","pairRevision":0,"incorrectInARow":10}` (immediate)               |
| Same claims, counted                                                  | —                                                     | `{"event":"command_rejected","command":"game:claim","status":"incorrect","occurrences":10}` (after flush)     |
| `SIGTERM` to the server process                                       | `server:shutdown` event received by connected clients | `{"event":"server_shutdown_started"}` then `{"event":"server_shutdown_completed"}`                            |

### Interpretation

- `claim_streak` appears immediately; `handshake_rejected`,
  `command_rejected`, and `rate_limited` are counted and appear within the
  30-second flush window, matching the design goal of one line per reason,
  (command, status), or budget rather than one line per occurrence.
- The `claim_streak` line carries the room code and the dealt-pair revision,
  which is stable across mid-game joins (the drill's 9 joiners did not reset
  the streak), so a bad pair can be reproduced from that identifier.
- No routine successful gameplay commands were logged; a healthy server emits
  only lifecycle and connection lines plus this drill's synthetic failures.
