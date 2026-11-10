# Hidden Shootout (browser prototype)

Top-down elimination game: one human vs two bots in a circular arena. During a timed hidden phase you move and aim but cannot see opponents. At zero, everyone is revealed and fires one instant shot simultaneously. The safe circle shrinks every round; last survivor wins.

## Setup / run / test
```
npm install
npm run dev      # start the dev server (open the printed URL)
npm test         # run the unit tests (Vitest)
npm run build    # typecheck + production build
```
Requires Node 18+.

> `package.json` overrides `rollup` with `@rollup/wasm-node`. This avoids the native Rollup binary, which some locked-down Windows machines (Application Control policies) refuse to load. Remove the `overrides` block if you don't need it.

## Controls
- **WASD / Arrow keys**: move (diagonals are normalized)
- **Mouse**: aim (no fire button; the shot fires automatically at the deadline)
- **Enter** or Start button: begin. **R** or Restart button: restart at any time.
- **M** or the Sound button: mute. The slider sets master volume (both are remembered in `localStorage`).

## Architecture (`src/`)
| File | Role |
| --- | --- |
| `config.ts` | All tuning values (hidden/reveal time, radii, speed, shrink factor, bot tuning) |
| `types.ts` | Shared types (`Player`, `Command`, `SnapshotPlayer`, `ResolutionResult`, ...) |
| `geometry.ts` | Ray-circle entry, safe-circle test, arena clamping |
| `resolve.ts` | Pure simultaneous resolution: snapshot in, shots/deaths out. Order-independent |
| `movement.ts` | Applies a `Command` to a player (same rules for human and bots) |
| `match.ts` | State machine READY / HIDDEN / RESOLVE / REVEAL / GAME_OVER; fixed-step `update(dt, commands)` |
| `bot.ts` | Bot decisions; only knows positions revealed in earlier rounds; outputs `Command`s |
| `input.ts`, `view.ts` | Keyboard/mouse and world <-> screen transform (resize-safe) |
| `render.ts`, `main.ts` | Canvas drawing/HUD/screens, game loop with fixed timestep |
| `theme.ts` | Central visual + audio settings and asset references (no gameplay values) |
| `characters.ts`, `arena.ts`, `effects.ts` | Procedural top-down characters, textured arena and shrink animation, reveal effects built only from the computed `ResolutionResult` |
| `events.ts`, `audio.ts` | Once-only game events from match state; synthesized Web Audio sounds, mute/volume, volley loudness limiting |

Visuals and audio are presentation only: they read match state but never change it. During HIDDEN only your own character is drawn (no opponents, shadows, particles, trails or remnants), and there are no positional or opponent-movement sounds. Reveal effects are discarded before the next hidden phase. See `CREDITS.md` for assets and placeholders.

The simulation (`match`, `resolve`, `geometry`, `movement`, `bot`) has no DOM dependency. Everything that drives a player is a `Command`, so local input and bots could later be replaced by server-authoritative commands.

Deadline logic runs on simulation time: the last HIDDEN step is clipped to the deadline, the snapshot is taken, and resolution runs exactly once (`resolutionCount`). The loop pauses while the tab is hidden and resets its timing on resume, so no catch-up step happens.

Opponents are drawn only in REVEAL/GAME_OVER; the hidden phase renders just your own player and the arena.

## Prototype defaults used (see `src/config.ts`)
- 1 human + 2 bots; hidden 6 s, reveal 1.5 s; arena radius 320; player radius 12; speed 130/s
- Safe radius x0.85 per round, minimum 50, max 20 rounds (round limit with several survivors = draw)
- Survivors keep position and aim between rounds; no collisions between players; one hit kills
- Zero survivors = draw. Players outside the safe circle still fire; boundary and shot deaths apply together
- Desktop keyboard + mouse only; no networking

## Tests
`npm test` covers ray misses, off-center hits, nearest-target, mutual kills, chain kills, blocking by a doomed target, array-order independence, safe-circle inside/touching/outside, outside-circle shooters, draw/win outcomes, single resolution after the deadline, frozen state post-deadline, round-limit draw, restart clearing, and basic bot behavior.
