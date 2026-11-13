/** XP and levels. Pure and deterministic; the SQL in supabase/migrations mirrors these rules. */

export const MAX_LEVEL = 100;

/** XP needed to go from `level` to `level + 1`. */
export const xpNeeded = (level: number): number => 100 + 40 * level;

/** Shells paid for leaving `level` (reaching the next one). */
export const levelBonus = (level: number): number => 25 + 5 * level;

export interface LevelUp {
  level: number; // the new level reached
  bonus: number; // Shells paid for it
}

export interface LevelState {
  level: number;
  xp: number; // XP inside the current level
  levelUps: LevelUp[];
  bonusShells: number; // total Shells paid by the level-ups
}

/** Adds XP, rolling over into as many levels as it covers. At the level cap XP stops accumulating. */
export function applyXp(level: number, xp: number, gain: number): LevelState {
  let lv = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  let cur = Math.max(0, Math.floor(xp)) + Math.max(0, Math.floor(gain));
  const levelUps: LevelUp[] = [];
  let bonusShells = 0;
  while (lv < MAX_LEVEL && cur >= xpNeeded(lv)) {
    cur -= xpNeeded(lv);
    const bonus = levelBonus(lv);
    lv++;
    levelUps.push({ level: lv, bonus });
    bonusShells += bonus;
  }
  if (lv >= MAX_LEVEL) cur = 0;
  return { level: lv, xp: cur, levelUps, bonusShells };
}

/** Total XP represented by a level and the XP inside it (used to clamp imported saves). */
export function totalXp(level: number, xp: number): number {
  let sum = Math.max(0, Math.floor(xp));
  for (let l = 1; l < Math.min(MAX_LEVEL, Math.max(1, Math.floor(level))); l++) sum += xpNeeded(l);
  return sum;
}
