# Hidden Shootout — Browser Prototype Specification

## 1. Goal
Build a playable browser-based, top-down elimination game with one human and two bots. Players move and aim while opponents are invisible. At the deadline, everyone is revealed and fires one instantaneous shot simultaneously. The arena shrinks between rounds until one player survives or everyone dies.

This version is a local single-player prototype. Design the game logic so a later version can support online multiplayer with 10+ players, but do not implement networking now.

## 2. Requirement status
The core rules below are confirmed. Items labeled “prototype default” resolve details that have not yet been explicitly approved; isolate them in configuration so they are easy to change. Do not block implementation on these defaults.

## 3. Confirmed core rules
- Circular arena with a top-down view.
- One human versus bots in the initial version.
- During the hidden phase, the human sees their own character and aiming direction, but no opponents.
- No opponent silhouettes, last-known-position markers, trails, aim indicators, or other hidden-position clues.
- Players move and aim during a timed hidden phase.
- At zero, positions and aim lock. No movement, aiming adjustment, or reaction window is allowed after the deadline.
- All living players are revealed and automatically fire exactly one shot.
- Shots are instantaneous straight-line hits, not traveling projectiles.
- A shot hits only the nearest eligible opponent along its path. It does not pierce.
- All shots resolve simultaneously. A player killed this round still fires their locked shot.
- Two players aiming directly at each other can both die.
- The safe circle becomes smaller over the match. Players outside the required circle at the deadline die.
- Last surviving player wins.
- Gun upgrades and piercing weapons are future features, not part of this build.

## 4. Prototype defaults
- Start each match with one human and two bots.
- Survivors keep their positions and aim between rounds; do not respawn or shuffle them. The human may remember a previously revealed location, but the game must not display it during the next hidden phase.
- Zero survivors means a draw, including a mutual kill between the final two players.
- A player outside the safe circle at the deadline still fires; apply boundary deaths and shot deaths simultaneously.
- All players have identical movement speed, circular hitboxes, and weapons.
- No health bars: one hit eliminates a player.
- Players do not physically collide with each other. Hidden players must not reveal themselves by blocking movement.
- No obstacles, cover, ammunition management, manual firing, upgrades, or pickups.
- Desktop keyboard and mouse only for this version.

## 5. Controls and presentation
- WASD and arrow keys: movement.
- Mouse position: aim direction relative to the human player.
- Normalize diagonal movement so it is not faster.
- No fire button: shots trigger automatically at the deadline.
- Provide Start, Restart, and a short on-screen controls explanation.
- Show the timer, round number, and remaining player count.
- Use simple readable shapes: circular players, a short gun barrel, clear arena boundaries, and brief shot lines during reveal.
- Give each player a stable color/name so revealed outcomes are understandable.
- Show winner, loss, or draw clearly at match end.
- Decorative shot lines must not affect hit detection or create a reaction window.
- Do not display live opponent movement or aiming data through UI effects, debug overlays, sounds, or minimaps.

## 6. Arena and shrinking-circle behavior
Clarification: “must come inside before timeout” is implemented as a smaller safe area within the original arena, not a solid wall that automatically pushes players inward.

- The original circular arena is the physical movement boundary. Keep each player's entire hitbox inside it.
- The current safe circle shares the original arena's center.
- Round one uses the full arena as its safe circle.
- After each resolved round, reduce the safe radius for the upcoming round and show the new boundary before movement resumes.
- Players may remain or move in the unsafe outer ring while the timer is running.
- At the deadline, eliminate any player whose full hitbox is not inside the current safe circle: distance from arena center + player radius > safe radius, with a small numeric tolerance.
- Do not push, teleport, or automatically relocate players when the safe circle shrinks.
- Keep shrinking toward a configurable minimum radius. Use a configurable maximum-round limit; if multiple players remain at that limit, end in a draw rather than looping forever.

## 7. State machine and round flow
Use explicit states:

1. READY — instructions and Start button.
2. HIDDEN — living players move and aim; opponents are invisible.
3. RESOLVE — freeze and snapshot state; calculate every shot and boundary death once.
4. REVEAL — show the frozen snapshot, shot lines, and eliminations for a brief interval.
5. GAME_OVER — show the result and Restart.

Transitions:
- READY -> HIDDEN when Start is selected.
- HIDDEN -> RESOLVE exactly once when the simulation deadline is reached.
- RESOLVE -> REVEAL after computing the outcome.
- REVEAL -> GAME_OVER if zero or one players survive, or the maximum-round limit is reached.
- Otherwise shrink the safe circle, increment the round, hide all opponents and prior reveal effects, then enter HIDDEN.

If the human dies but multiple bots survive, continue the match automatically. Keep the normal hidden/reveal presentation; show that the human is eliminated and allow Restart.

## 8. Simultaneous shot resolution
This is the most important correctness requirement.

At the deadline:
1. Freeze the simulation and capture an immutable snapshot of every living player's ID, position, aim direction, and hitbox radius.
2. For each living shooter, cast a ray from their center along their normalized locked aim direction, excluding their own hitbox.
3. Intersect that ray with all other players alive in the snapshot. Clip the ray to the original arena boundary.
4. Select the closest nonnegative ray-circle entry intersection, not the closest target center. Add that target to the shot-death set.
5. Independently compute the boundary-death set using the same snapshot.
6. Union both sets and apply all eliminations together, only after all shooters have been processed.
7. Store resolution events for reveal rendering; do not recalculate hits from animation frames.

Additional rules:
- A player already marked for death still fires and still blocks shots this round.
- A target killed by another shooter does not allow a shot to pass through them.
- Use a deterministic player-ID tie-breaker for exactly equal intersections.
- For overlapping hitboxes, treat a ray originating inside another player's hitbox as an immediate hit at distance zero.
- Preserve the last valid aim direction if the mouse is exactly at the player's center.
- Render the gun at an offset if desired, but use the player center as the logical shot origin consistently.

Examples:
- A shoots B and B shoots A: both die.
- A shoots B and B shoots C: B and C die; B's shot is not canceled.
- B stands between A and C on A's ray: A hits B only, even if another shooter also kills B.
- A and B are the final survivors and both die: draw.

## 9. Bot behavior
Bots must use the same movement limits, aim rules, timer, and shot resolution as the human.

- They must not track hidden opponents' current positions or receive an unfair live-targeting advantage.
- At the end of a reveal, bots may remember revealed positions, just as a human can.
- During hidden phases, choose movement destinations, favor getting inside the safe circle, and aim using remembered locations plus uncertainty, or random exploration.
- At initial spawn, use random movement and aim without knowing opponent positions.
- Avoid perfect aim and perfect deadline reactions. Make difficulty tunable through uncertainty and decision intervals.
- Separate bot decision logic from game rules.

## 10. Suggested starting configuration
These are tuning defaults, not fixed design requirements:

| Setting | Initial value |
| --- | --- |
| Human players | 1 |
| Bots | 2 |
| Hidden phase | 6 seconds |
| Reveal phase | 1.5 seconds |
| Original arena radius | 320 world units |
| Player radius | 12 world units |
| Movement speed | 130 world units/second |
| Safe-radius multiplier per new round | 0.85 |
| Minimum safe radius | 50 world units |
| Maximum rounds | 20 |

Place all gameplay tuning values in one configuration module. Use world coordinates independent of canvas resolution. Scale rendering and mouse-coordinate conversion correctly when the viewport changes.

## 11. Implementation direction
- If an existing repository is provided, inspect it first and respect its conventions.
- Otherwise use TypeScript, Vite, and Canvas 2D for a lightweight browser prototype.
- No backend, accounts, database, external assets, or multiplayer infrastructure is needed.
- Keep simulation logic independent of the DOM and rendering.
- Prefer a fixed simulation timestep and a single authoritative local state. Process deadlines from simulation time, not by counting rendered frames.
- Freeze the entire local simulation when the tab is hidden and resume without advancing the round timer. Reset timing accumulators on resume to avoid a large catch-up step.
- Clamp movement at deadlines so no movement or aim input after the cutoff can affect the snapshot.
- Keep opponent state internally for simulation; invisibility is a presentation rule in this prototype, not a claim of client-side anti-cheat security.

Suggested module responsibilities:
- Configuration and shared types.
- Match state and phase transitions.
- Player movement and input.
- Geometry and hitscan resolution.
- Bot decisions.
- Canvas rendering and UI.
- Automated tests for pure game rules.

Future multiplayer should be able to replace local input/bot commands with server-authoritative commands. Do not implement sockets, lobbies, synchronization, matchmaking, or multiplayer anti-cheat now.

## 12. Acceptance criteria
The prototype is complete when:
- A fresh install can launch the game using documented commands.
- Start creates one human and two bots at valid, non-overlapping starting positions inside the arena.
- The human moves and aims smoothly.
- Opponents and all prior reveal artifacts are completely absent during HIDDEN.
- Timer expiry freezes everyone before reveal, with no aiming or movement window.
- Every living player fires exactly once per round.
- Mutual kills and chain kills resolve correctly and independently of player iteration order.
- Shots stop at the nearest intersected player.
- The safe circle shrinks between rounds, and outside players die only at resolution.
- Survivors remain at their existing positions between rounds.
- A single survivor wins, zero survivors draws, and the round limit prevents endless matches.
- Restart resets players, timers, circle radius, bot memory, and all visual effects.
- Canvas resizing preserves correct world-space aim and movement.

## 13. Required automated tests
Cover at least:
- Ray misses all targets.
- Ray hits a target whose circle intersects the ray even if its center does not.
- Nearest intersection wins when multiple targets are aligned.
- Mutual kill.
- A -> B -> C chain kill.
- A target killed by another shooter still blocks the original shot.
- Reordering the player array does not change the outcome.
- Inside, touching, and outside safe-circle cases.
- An outside player still fires before simultaneous elimination.
- Zero survivors -> draw; one survivor -> winner.
- No duplicated resolution when several frames occur after the deadline.
- Restart clears previous-match state.

## 14. Deliverables and scope
Deliver working code, focused tests, and a README containing setup/run/test commands, controls, architecture notes, and the prototype defaults used.

Prioritize a correct and enjoyable core loop over polish. Do not add features outside this specification. Explain any necessary deviations and summarize what was implemented and tested.
