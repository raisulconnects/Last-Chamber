import { CONFIG } from './config';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Per-match options. Everything not listed here (speed, radii, hit rules) is fixed in CONFIG. */
export interface MatchSettings {
  botCount: number;
  hiddenDuration: number; // seconds
  revealDuration: number; // seconds
  safeRadiusMultiplier: number;
  minSafeRadius: number;
  maxRounds: number;
  botDifficulty: Difficulty;
}

export interface BotProfile {
  decisionInterval: number;
  aimNoise: number;
  memoryAimChance: number;
}

/** Normal is exactly the original tuning; easy/hard only shift uncertainty and decision rate. */
export const DIFFICULTY: Record<Difficulty, BotProfile> = {
  easy: { decisionInterval: 0.9, aimNoise: 0.38, memoryAimChance: 0.5 },
  normal: {
    decisionInterval: CONFIG.bot.decisionInterval,
    aimNoise: CONFIG.bot.aimNoise,
    memoryAimChance: CONFIG.bot.memoryAimChance,
  },
  hard: { decisionInterval: 0.4, aimNoise: 0.08, memoryAimChance: 0.85 },
};

export const CLASSIC: MatchSettings = {
  botCount: CONFIG.botCount,
  hiddenDuration: CONFIG.hiddenDuration,
  revealDuration: CONFIG.revealDuration,
  safeRadiusMultiplier: CONFIG.safeRadiusMultiplier,
  minSafeRadius: CONFIG.minSafeRadius,
  maxRounds: CONFIG.maxRounds,
  botDifficulty: 'normal',
};

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  settings: MatchSettings;
}

export const PRESETS: Preset[] = [
  { id: 'classic', name: 'Classic', blurb: '1 vs 2 bots. The original rules.', settings: CLASSIC },
  {
    id: 'quick',
    name: 'Quick Draw',
    blurb: 'Frantic 3s rounds and a faster shrink.',
    settings: { ...CLASSIC, hiddenDuration: 3, revealDuration: 1, safeRadiusMultiplier: 0.8 },
  },
  {
    id: 'crowded',
    name: 'Crowded Arena',
    blurb: '1 vs 4 bots. Expect chain kills.',
    settings: { ...CLASSIC, botCount: 4 },
  },
  {
    id: 'tight',
    name: 'Tight Circle',
    blurb: 'The safe circle shrinks hard every round.',
    settings: { ...CLASSIC, safeRadiusMultiplier: 0.75 },
  },
  {
    id: 'marathon',
    name: 'Marathon',
    blurb: 'Long 10s rounds, gentle shrink, 30 rounds.',
    settings: { ...CLASSIC, hiddenDuration: 10, revealDuration: 2, safeRadiusMultiplier: 0.9, maxRounds: 30 },
  },
];

/** Limits for Custom mode. `step` is used by the menu steppers. */
export const LIMITS = {
  botCount: { min: 1, max: 5, step: 1 },
  hiddenDuration: { min: 3, max: 15, step: 1 },
  revealDuration: { min: 1, max: 5, step: 0.5 },
  safeRadiusMultiplier: { min: 0.7, max: 0.95, step: 0.05 },
  minSafeRadius: { min: 30, max: 120, step: 10 },
  maxRounds: { min: 5, max: 40, step: 5 },
} as const;

type NumKey = keyof typeof LIMITS;
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function clampNum(v: unknown, key: NumKey, fallback: number): number {
  const { min, max, step } = LIMITS[key];
  let n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  n = Math.max(min, Math.min(max, n));
  // Snap to the step grid so float drift (0.85 + 0.05 ...) never leaks out.
  n = min + Math.round((n - min) / step) * step;
  return Math.round(n * 1000) / 1000;
}

/** Sanitize arbitrary input (UI draft or stored JSON) into valid Custom settings. */
export function clampCustom(input: Partial<MatchSettings> | null | undefined): MatchSettings {
  const s = input ?? {};
  return {
    botCount: clampNum(s.botCount, 'botCount', CLASSIC.botCount),
    hiddenDuration: clampNum(s.hiddenDuration, 'hiddenDuration', CLASSIC.hiddenDuration),
    revealDuration: clampNum(s.revealDuration, 'revealDuration', CLASSIC.revealDuration),
    safeRadiusMultiplier: clampNum(s.safeRadiusMultiplier, 'safeRadiusMultiplier', CLASSIC.safeRadiusMultiplier),
    minSafeRadius: clampNum(s.minSafeRadius, 'minSafeRadius', CLASSIC.minSafeRadius),
    maxRounds: clampNum(s.maxRounds, 'maxRounds', CLASSIC.maxRounds),
    botDifficulty: DIFFICULTIES.includes(s.botDifficulty as Difficulty) ? (s.botDifficulty as Difficulty) : 'normal',
  };
}

/** Step one numeric option up or down within its limits. */
export function stepSetting(s: MatchSettings, key: NumKey, dir: 1 | -1): MatchSettings {
  const { step } = LIMITS[key];
  return clampCustom({ ...s, [key]: s[key] + dir * step });
}

export function cycleDifficulty(s: MatchSettings, dir: 1 | -1): MatchSettings {
  const i = DIFFICULTIES.indexOf(s.botDifficulty);
  const next = DIFFICULTIES[(i + dir + DIFFICULTIES.length) % DIFFICULTIES.length];
  return { ...s, botDifficulty: next };
}

const CUSTOM_KEY = 'last-chamber-custom';
const PREFS_KEY = 'last-chamber-prefs';

export function loadCustom(): MatchSettings {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) return clampCustom(JSON.parse(raw) as Partial<MatchSettings>);
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  return { ...CLASSIC };
}

export function saveCustom(s: MatchSettings): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export interface Prefs {
  reduceFlashing: boolean;
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return { reduceFlashing: p.reduceFlashing === true };
    }
  } catch {
    /* ignore */
  }
  return { reduceFlashing: false };
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
