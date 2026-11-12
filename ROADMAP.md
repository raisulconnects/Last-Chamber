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
2. **Level / XP, achievements and dailies:** now built on top of player accounts (see "Player accounts and cloud profile": levels and XP arrive with the cloud economy, achievements and badges with the public layer; daily login streak and daily / weekly challenges follow)
3. **Later:** daily shop rotation, cylinder crates with visible odds (cosmetics only), casual-only power-ups, prestige levels, named bot rivals, share card, server-side validation with online multiplayer

**Guardrails:** no real-money purchases for now, no timers that punish absence, odds always shown, modes never locked.

### Player accounts and cloud profile (phase 1 built in 0.7.0)
Goal: real player accounts so Shells, items, level and stats follow the player across devices, plus public leaderboards. Guests can still play instantly with a local save; signing in uploads and merges it.

**Backend: Supabase (free plan).** Hosted Postgres + Auth + Row Level Security + Realtime + Edge Functions.
- Sign-in methods: **guest play and email + password first**. **Google and Discord login are deferred to a later phase** (both are supported by Supabase; Discord OAuth is free since a Discord developer application costs nothing)
- Free-plan caveats (verify current limits on supabase.com/pricing): about 500 MB database, about 50k monthly active users, rate-limited built-in email (use custom SMTP later if needed), and free projects **pause after about a week of inactivity**
- Considered and not chosen: Firebase (NoSQL makes leaderboards and server-side checks clumsy), Cloudflare D1 + Workers (we would hand-roll auth), PocketBase (needs self-hosting). Realtime can later help online multiplayer; Cloudflare Durable Objects stays an option for match rooms

**Data we keep (needs an account)**
- `profiles`: id (auth user id), unique display name, equipped loadout (skin, shot, kill, arena, title), Shells, total earned, XP, level, created_at, last_seen, optional settings (volume, reduce flashing, custom-mode settings)
- `inventory`: owned item ids with acquired_at
- `player_stats`: matches, wins, losses, draws, kills, current / best win streak, best survival, per-mode counters
- `matches` (history, one row per finished match): mode, bots, difficulty, result, rounds, survived, kills, Shells and XP earned, played_at, client version
- `achievements`: achievement id + unlocked_at
- Later: `daily_state`, `challenges`, `ratings` (**ranks**: rating, tier and season per player), friends

**Data we never keep:** passwords (Supabase Auth owns them), positions or per-frame data, raw input, anything about hidden opponent positions. Email stays in the auth schema, never in public tables.

**Public (read-only through views):** display name, title, level, win / round stats, leaderboards, match history. Private: email, settings.

**Security design**
- The browser ships only the public anon key; **Row Level Security** on every table (read own rows, public data only through explicit views)
- Money and progression are **never written directly by the client**. Security-definer Postgres functions (RPC) do the writes:
  - `submit_match(summary)`: validates ranges, **recomputes the payout and XP** with the same formula as `src/economy.ts`, applies the per-match cap (150) and rate limits, and updates wallet, XP / level, stats, streak, history and achievements in one transaction
  - `buy_item` / `equip_item`: price and ownership checked against a `shop_items` table seeded from `src/shop.ts`
  - `set_display_name`: length / charset, uniqueness, simple profanity filter
  - `import_local_progress`: one-time guest merge, capped and validated so forged localStorage gains little
- Honest limit: matches are simulated in the browser, so a determined cheater can still submit fake wins. Caps and rate limits make that low-value; real authority arrives with server-run online matches
- Generate the SQL catalog / formula constants from `src/shop.ts` and `src/economy.ts` with a script plus a parity test so client and server cannot drift

**Client shape:** `src/cloud.ts` (Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, set in Netlify and a local `.env`, never committed), `src/account.ts` (session, sign in / out), `src/sync.ts` (load profile, queue and flush match summaries, merge). Offline-first: the local save stays the source while signed out or offline; finished matches queue in localStorage and flush when online, and the server response replaces local Shells / XP / level. New menu screens: Account, Leaderboards, Match history; a "Sign in to save your progress" prompt on the game-over panel for guests.

**Phases (each gets its own plan before coding)**
1. **Foundation (done in 0.7.0):** Supabase project, schema + RLS, auth (**email + password only**; guests stay local), profile row, display name, Account screen (sign up / sign in / sign out / password reset), guest-to-account merge
2. **Cloud economy:** `submit_match`, buy / equip RPCs, cloud stats and match history, offline queue, XP and levels
3. **Public layer:** leaderboards, public player profile, match history screen, achievements and badges
4. **Later:** Google and Discord login (deferred), ranks (rating + seasons), daily rewards and challenges, friends, then online multiplayer on the same accounts

**One-time manual steps when we build phase 1:** create a free Supabase project; enable the email provider (and decide whether email confirmation is required); add the Netlify site URL and `http://localhost:5199` to Supabase redirect URLs; set the two `VITE_` env vars in Netlify. When Google and Discord login are added later, create a Google OAuth client and a Discord application and enter their IDs / secrets in Supabase Auth providers. Secrets are never shared in chat or committed.

### Power-ups and new mechanics (changes gameplay)
- Pickups, obstacles, alternative weapons or arena shapes
- Must stay optional (new modes), keeping Classic unchanged

## Smaller items
- Logo and final art pass
- Real-device mobile testing (iOS Safari fullscreen, notches, haptics)
- Choose a license
- Custom domain for the deployed game

## Done
- 0.1.0 core prototype, 0.2.0 visuals and audio, 0.3.0 menu and modes, 0.4.0 mobile support, 0.5.0 stats and progress, 0.6.0 Shells, shop and profile, 0.7.0 player accounts (email + password), 0.7.1 player card
