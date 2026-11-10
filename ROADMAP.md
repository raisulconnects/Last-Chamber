# Roadmap

Ideas for future features of Last Chamber. Each one gets a plan before work starts. Gameplay rules stay stable unless an item says otherwise.

## Candidates

### Online multiplayer (largest)
Real-time play with other humans. The simulation is already driven by `Command`s and is DOM-free, so a server could run `Match` authoritatively.
- Server (Node/WebSocket) running the match, clients send commands and render snapshots
- Lobbies / room codes, reconnect handling, latency and cheating considerations (the hidden phase must not leak positions)
- The menu already has a "Multiplayer - coming soon" screen to build on

### Local multiplayer
2+ humans on one device.
- Hot-seat or split controls (keyboard halves, touch zones)
- Needs a privacy rule: no player may see another's screen state during the hidden phase

### Stats and progress (done in 0.5.0)
- Local win / loss / draw record, streaks, per-mode stats and recent matches (localStorage), Stats screen in the menu
- Next on this track: achievements and the currency system below

### In-game currency and progression (planned, builds on stats)
Goal: a satisfying grind loop even in single player. Local-only storage for now (migrate to server validation with online multiplayer, since local data is easy to edit).

**Currency:** "Shells" (soft currency, matches the revolver theme). Optional second, earn-only currency later for rare items.

**Earning**
- Per match: base for playing, bonus for a win, kills and rounds survived, multiplied by mode difficulty (bot difficulty, bot count, mode)
- Player level / XP from every match; level-ups pay Shells and unlock items; free reward track with a visible progress bar
- Daily login streak (gentle reset with a one-day grace), 3 rotating daily challenges, a weekly challenge
- Milestones and achievements (first win, 10 / 50 / 100 wins, streaks, flawless win, clutch win), each paying Shells and a badge

**Spending**
1. Cosmetics (no gameplay effect): character colors and skins, gun styles, muzzle flash and tracer colors, kill effects, arena floor themes, menu and cylinder themes
2. Titles and badges shown on the Stats screen (and later in multiplayer)
3. Unlockable modes: Quick Draw, Crowded Arena, Tight Circle, Marathon by level or Shells. Classic and Custom always stay free
4. Gameplay power-ups: consumables for casual single player only, one per match, never in online or ranked play. Ideas: Second Wind (survive one boundary death), Longer Reveal Window, Steady Aim (touch aim assist), Ghost Step (short speed boost)
5. Cylinder crates: Shell-priced cosmetic crates with a visible odds table (no paid loot boxes)

**Stickiness ideas**
- Collection screen with completion percentages, NEW tags, rarity tiers (common / rare / epic / legendary) with distinct frames
- "12 Shells to your next unlock" on the game-over panel and an animated reward counter after each match
- Daily shop rotation, seasonal themes, prestige levels with gold frames
- Named bot rivals with a head-to-head record, personal-best boards, a shareable result card (friend leaderboards once online exists)

**Guardrails:** no real-money purchases for now (needs backend, payments and legal work), no timers that punish absence, odds always shown.

**Technical shape:** `src/progress.ts` (wallet, XP, unlocks, inventory, daily state), data-driven `src/shop.ts` catalog, cosmetic hooks in `characters.ts` / `effects.ts` / `theme.ts`, versioned localStorage with the same sanitize/load pattern as `stats.ts`.

**Suggested order:** XP and levels -> Shells and cosmetic shop -> daily rewards and challenges -> mode unlocks and power-ups -> server-side validation with online multiplayer.

### Power-ups and new mechanics (changes gameplay)
- Pickups, obstacles, alternative weapons or arena shapes
- Must stay optional (new modes), keeping Classic unchanged

## Smaller items
- Logo and final art pass
- Real-device mobile testing (iOS Safari fullscreen, notches, haptics)
- Choose a license
- Custom domain for the deployed game

## Done
- 0.1.0 core prototype, 0.2.0 visuals and audio, 0.3.0 menu and modes, 0.4.0 mobile support, 0.5.0 stats and progress
