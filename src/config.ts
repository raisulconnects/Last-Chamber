/** All gameplay tuning values live here. World units are independent of canvas resolution. */
export const CONFIG = {
  humanCount: 1,
  botCount: 2,
  hiddenDuration: 6, // seconds
  revealDuration: 1.5, // seconds
  arenaRadius: 320,
  playerRadius: 12,
  moveSpeed: 130, // world units / second
  safeRadiusMultiplier: 0.85,
  minSafeRadius: 50,
  maxRounds: 20,
  tickRate: 60, // fixed simulation steps per second
  epsilon: 1e-6, // numeric tolerance for boundary checks
  spawnMinSeparation: 60, // min distance between spawn centers
  spawnMargin: 30, // spawn at least this far inside the arena edge (beyond radius)

  bot: {
    decisionInterval: 0.6, // seconds between bot decisions
    aimNoise: 0.18, // radians, std-dev of aim error
    memoryAimChance: 0.7, // chance to aim at a remembered position instead of exploring
    safeMargin: 8, // bots try to end this far inside the safe circle
    returnToSafeAfter: 0.5, // fraction of hidden phase elapsed before bots prioritize the safe circle
  },
} as const;

export type Config = typeof CONFIG;

export const PLAYER_STYLES = [
  { name: 'You', color: '#4cc9f0' },
  { name: 'Red', color: '#f25f5c' },
  { name: 'Gold', color: '#ffe066' },
] as const;
