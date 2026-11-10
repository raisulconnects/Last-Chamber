/** Central visual + audio settings. Nothing here affects gameplay. */
import slabA from './assets/tiny-city/tile_0088.png';
import slabB from './assets/tiny-city/tile_0100.png';

export const THEME = {
  colors: {
    background: '#0c1018',
    floorShade: 'rgba(10, 14, 24, 0.74)', // dims the pixel-art floor so characters pop
    floorFallback: '#1d2430',
    safeGlow: '#5dd39e',
    dangerTint: 'rgba(214, 60, 70, 0.30)',
    dangerHatch: 'rgba(255, 110, 110, 0.18)',
    arenaEdge: '#8896ab',
    text: '#e8ecf1',
    textDim: '#8b97a8',
    hiddenAccent: '#4cc9f0',
    revealAccent: '#ffb347',
    flash: '#fff3b0',
    danger: '#f25f5c',
    win: '#5dd39e',
    draw: '#ffe066',
    panel: 'rgba(8, 10, 16, 0.90)',
  },
  art: {
    /** Character art scale relative to the logical radius. Hitboxes are unaffected. */
    characterScale: 1.6,
    showHitbox: false, // debug: draw the logical hitbox circle
    floorTileScale: 2, // world units per source pixel
    floorTiles: [slabA, slabB],
  },
  anim: {
    shrinkSeconds: 0.8, // render-only shrink interpolation
    walkCycleSpeed: 0.09, // radians per world unit travelled
    idleSwaySpeed: 2.2,
    flashSeconds: 0.12,
    tracerSeconds: 0.35,
    impactSeconds: 0.45,
    eliminationSeconds: 0.9,
  },
  audio: {
    defaultVolume: 0.6,
    /** Peak gain for a single shot; simultaneous shots are scaled by 1/sqrt(n). */
    shotGain: 0.5,
    maxEliminationSounds: 2,
    storageKey: 'hidden-shootout-audio',
  },
} as const;
