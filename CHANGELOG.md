# Changelog

All notable changes to Last Chamber. This file is shown in-game on the Changelog screen.
Format per release: `## [version] - YYYY-MM-DD - short title`, then `### Added` / `### Changed` / `### Fixed` lists.
To release: bump `version` in `package.json` and add an entry at the top.

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
