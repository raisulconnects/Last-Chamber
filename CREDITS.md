# Credits and asset notes

## Used in the game
- **Kenney "Tiny City" (1.0)**: https://www.kenney.nl, license **CC0 1.0** (public domain; credit optional).
  Only two floor tiles are used, copied from `Assets/kenney_tiny-city/Tiles/` to `src/assets/tiny-city/`:
  `tile_0088.png` and `tile_0100.png` (light pavement slabs), tiled, dimmed and clipped to the circular arena.
  The pack's `License.txt` is included in `src/assets/tiny-city/`.

## Present in `Assets/` but not used
- **Kenney "Blaster Kit" (2.1)**, CC0. These are 3D models and isometric preview renders, not top-down sprites, so the game does not use them.

## Placeholders (replaceable)
- **All sound** is synthesized at runtime with the Web Audio API in `src/audio.ts`. There are no audio files.
- **Characters, guns, muzzle flashes, tracers and impact effects** are drawn procedurally on the canvas (`src/characters.ts`, `src/effects.ts`).
- Visual and audio tuning lives in `src/theme.ts`.
