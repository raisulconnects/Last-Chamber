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

### Stats and progress
- Local win / loss / draw record, best streak, per-mode stats (localStorage)
- Stats screen in the menu; optional achievements

### Power-ups and new mechanics (changes gameplay)
- Pickups, obstacles, alternative weapons or arena shapes
- Must stay optional (new modes), keeping Classic unchanged

## Smaller items
- Logo and final art pass
- Real-device mobile testing (iOS Safari fullscreen, notches, haptics)
- Choose a license
- Custom domain for the deployed game

## Done
- 0.1.0 core prototype, 0.2.0 visuals and audio, 0.3.0 menu and modes, 0.4.0 mobile support, GitHub Pages deployment
