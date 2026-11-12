# Changelog

All notable changes to Last Chamber. This file is shown in-game on the Changelog screen.
Format per release: `## [version] - YYYY-MM-DD - short title`, then `### Added` / `### Changed` / `### Fixed` lists.
To release: bump `version` in `package.json` and add an entry at the top.

## [0.7.1] - 2026-11-13 - Player card
### Added
- Player card in the top-left corner of the main menu: your avatar with its rarity glow, name, title and Shells. Guests see "Guest - tap to sign in"; signed-in players get a green online dot
- Other screens show a compact version (avatar and Shells)
### Changed
- Account moved out of the main menu list: tap the player card, or use Sign in / Sign out on your Profile
- Profile shows whether you are a guest or signed in

## [0.7.0] - 2026-11-13 - Player accounts
### Added
- Optional accounts: create an account or sign in with email and password (Menu > Account), with password reset
- Your Shells, items, loadout and name from this device are saved to your account the first time you sign in
- Choose a unique display name for your account
- Sign-in hint on the game-over screen for guests
### Changed
- Playing as a guest works exactly as before. Ongoing sync of new matches and purchases to your account arrives in the next update; until then this device keeps your newest progress
- Signing out starts a fresh guest save on that device (your account data stays online)

## [0.6.0] - 2026-11-10 - Shells, Shop and Profile
### Added
- Shells: a currency earned by finishing matches (more for wins, kills, surviving rounds, harder modes and more bots)
- Shop with five categories: skins, shot styles, kill effects, arena themes and titles, in four rarities with glowing frames and live previews
- Profile screen with your name, title, loadout, Shells and headline stats
- Game-over panel shows the Shells you earned, a breakdown, and how far you are from your next unlock
- Wallet chip on every menu screen
### Changed
- Equipped cosmetics only change how your own character, shots, kills and arena look; rules, timings and bot behavior are unchanged

## [0.5.0] - 2026-11-10 - Stats and progress
### Added
- Stats screen in the main menu: matches, wins, win rate, streaks, kills, best survival, per-mode record and the last 10 matches
- Game-over panel highlights win streaks and new personal bests
- Stats are saved on this device only; "Reset stats" asks for a second tap to confirm
### Changed
- Game rules, timings and bot behavior are unchanged

## [0.4.0] - 2026-11-10 - Mobile support
### Added
- Touch controls: left virtual stick moves, right stick aims (the gun keeps its direction when released)
- Works in portrait and landscape; compact HUD, stick overlays and a MENU button (tap twice to quit)
- Fullscreen button where the browser supports it
- Touch-friendly menus: larger targets, drag-to-scroll lists, no keyboard hints
### Changed
- Game rules, timings and bot behavior are unchanged

## [0.3.0] - 2026-11-10 - Menu and modes
### Added
- Game renamed to Last Chamber, with a new starting menu over an animated arena
- Play menu: Single Player modes (Classic, Quick Draw, Crowded Arena, Tight Circle, Marathon, Custom) and a Multiplayer "coming soon" screen
- Custom mode: 1-5 bots, hidden and reveal time, shrink speed, minimum circle, max rounds and bot difficulty (saved between sessions)
- How to Play, Settings (volume, sound, reduce flashing), Credits and Changelog screens
- Up to 6 players on screen (extra player colors and HUD support)
### Changed
- Match options are now passed to the game as settings; Classic behaves exactly as before
- Game-over screen has Restart and Menu buttons; Esc returns to the menu

## [0.2.0] - 2026-11-10 - Visuals and audio
### Added
- Procedural top-down characters, textured arena (Kenney Tiny City tiles, CC0), hatched unsafe ring and animated circle shrink
- Reveal effects: muzzle flashes, tracers, impacts and elimination markers
- Synthesized Web Audio sounds, mute and volume controls
- Redesigned HUD, timer ring and result screens

## [0.1.0] - 2026-11-10 - Prototype
### Added
- Playable local prototype: hidden phase, simultaneous instant shots, shrinking safe circle, bots, unit tests
