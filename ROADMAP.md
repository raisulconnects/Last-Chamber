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

### In-game currency, shop and player profile (phase 1 built in 0.6.0)
Goal: a satisfying grind loop even in single player. Local-only storage for now (server-side validation comes with online multiplayer, since local data is easy to edit). All modes stay free. Each build phase below gets its own plan before coding.

**Currency:** **Shells** (revolver theme). One soft currency, earned only by playing; no real-money purchases.

#### Earning Shells from matches
`payout = round((play + win/draw + kills + roundsSurvived) x modeMult x difficultyMult x botMult)`
- Base: play **10**, win **+20**, draw **+8**, each kill **+8**, each round survived **+2**
- Difficulty: Easy x0.8, Normal x1.0, Hard x1.3
- Bots: `clamp(1 + 0.1 x (bots - 2), 0.8, 1.5)`
- Mode: Classic x1.0, Quick Draw x0.8, Crowded Arena x1.2, Tight Circle x1.1, Marathon x1.5, Custom x0.5
- Anti-farm: a match ending in round 1 pays a flat 5, per-match cap 150, and only finished matches pay (quitting or restarting mid-match pays nothing)
- Pace in Classic / Normal: a loss pays about 24, a win about 58, so roughly 35 per 3-minute match. A cheap item takes ~2 matches, an evening (~10 matches) is about 350 Shells
- Paid once per match at the same point stats are recorded, and stored as `earned` on the match record

#### Shop catalog v1 (all cosmetic, zero gameplay effect)
Price bands: Common 80-150, Rare 350-600, Epic 900-1500, Legendary 2500-3500. Starter items are free so the Locker is never empty.

| Category | Free | Common | Rare | Epic | Legendary |
| --- | --- | --- | --- | --- | --- |
| **Character skins** (your character only; bots keep their colors) | Cyan | Mint 100, Rose 100, Slate 100 | Two-tone Stripes 350, Neon Lime 400 | Gold Trim 900 | Phantom (soft glow) 2500, Chrome 3000 |
| **Shot style** (tracer + muzzle flash) | Amber | Lime 80, Pink 80, Ice 100 | Rainbow Shift 400 | Plasma Pulse 1000 | Comet Trail 2500 |
| **Kill effects** (plays at your kill during the reveal) | Plain | Spark Burst 150 | Ring Pulse 400 | Confetti Pop 900 | Lightning Strike 2500 |
| **Arena themes** (floor tint + ring colors) | Concrete | Midnight Blue 150, Sandstone 150 | Lava Ring 500, Frost 500 | Neon Grid 1200 | Void 3000 |
| **Titles** | Rookie | Sharpshooter 120 | Dead Eye 300 | Ghost 600 | Last Chamber 2000 |

Badges are not sold; they are earned from achievements and shown beside the title.

#### Player profile
A Profile screen in the main menu is the player's identity and progress hub:
- Header card: editable name (default "Player", max 14 chars), equipped title and badges, level with XP bar, Shell balance, member-since date
- Level frames: bronze 1-9, silver 10-24, gold 25-49, diamond 50+
- Achievements tab: all achievements with progress bars, locked / unlocked state, reward and badge, "NEW" marker; up to 3 pinned badges
- Stats link (headline numbers plus a button to the Stats screen) and a loadout summary (skin, shot style, kill effect, arena theme)
- Also shown as a compact profile chip on the main menu; the game-over panel shows XP gained and level-ups; online, name / title / badge are what other players see

#### Progression systems
- **Level and XP:** XP = the match's base Shells (before multipliers). Level n needs `100 + 40n` XP; a level-up pays `25 + 5n` Shells
- **Achievements** (Shells + badge): First Win 30, 10 Wins 100, 50 Wins 300, 100 Wins 600, 3-win streak 50, 5-win streak 120, Flawless Win 80, 25 Kills 100, Survive 10 Rounds 100, Play every mode 150
- **Daily login streak:** days 1-7 pay 20, 30, 40, 50, 60, 80, 120, then loop; one missed day keeps the streak, two reset it (device date)
- **Daily challenges:** 3 a day from a pool (get 2 kills, win a Quick Draw, survive 6 rounds, play 3 matches, win on Hard...), seeded by date, 40-80 Shells each, plus a weekly challenge for 200

#### UI plan
- Main menu: **Shop** (Buy and Equip, category tabs, rarity-colored frames, live preview, Buy / Equip / Equipped states, "need N more Shells"), **Profile**, wallet chip, level bar
- Touch-friendly like Stats (48 px targets, drag to scroll, portrait and landscape)
- Game-over panel: "+47 Shells" with a one-line breakdown, an animated counter and "N Shells to your next unlock"
- Equipped cosmetics only change how the human is drawn, never match state; during the hidden phase only your own character is still drawn

#### Technical shape
`src/economy.ts` (pure `calcPayout`, mode table, anti-farm rules), `src/shop.ts` (data-driven catalog, pure `buy` / `equip`), `src/progress.ts` (versioned localStorage `last-chamber-progress`: shells, owned, equipped, name, later xp / level / achievements / daily state; same sanitize pattern as `stats.ts`), `src/cosmetics.ts` (equipped ids to render parameters, hooked into `characters.ts`, `effects.ts`, `arena.ts` / `theme.ts`), new `shop` and `profile` menu screens reusing the Stats panel and scroll patterns.

#### Build phases
1. **0.6.0 Shells, Shop and Profile (done):** wallet, payout, game-over payout panel, Shop and Locker with all five categories, Profile screen (name, title, loadout, stats link)
2. **0.7.0 Level / XP and achievements:** level bar and frames, level-up rewards, achievements tab and badges
3. **0.8.0 Dailies:** login streak and daily / weekly challenges
4. **Later:** daily shop rotation, cylinder crates with visible odds (cosmetics only), casual-only power-ups, prestige levels, named bot rivals, share card, server-side validation with online multiplayer

**Guardrails:** no real-money purchases for now, no timers that punish absence, odds always shown, modes never locked.

### Power-ups and new mechanics (changes gameplay)
- Pickups, obstacles, alternative weapons or arena shapes
- Must stay optional (new modes), keeping Classic unchanged

## Smaller items
- Logo and final art pass
- Real-device mobile testing (iOS Safari fullscreen, notches, haptics)
- Choose a license
- Custom domain for the deployed game

## Done
- 0.1.0 core prototype, 0.2.0 visuals and audio, 0.3.0 menu and modes, 0.4.0 mobile support, 0.5.0 stats and progress, 0.6.0 Shells, shop and profile
