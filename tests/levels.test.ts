import { describe, expect, it } from 'vitest';
import { LIMITS, PAYOUT, botPermille, calcPayout, calcXp } from '../src/economy';
import type { PayoutInput } from '../src/economy';
import { MAX_LEVEL, applyXp, levelBonus, totalXp, xpNeeded } from '../src/levels';
import { emptyProgress, sanitizeProgress } from '../src/progress';

describe('levels', () => {
  it('uses 100 + 40n XP per level and 25 + 5n Shells per level-up', () => {
    expect(xpNeeded(1)).toBe(140);
    expect(xpNeeded(10)).toBe(500);
    expect(levelBonus(1)).toBe(30);
    expect(levelBonus(10)).toBe(75);
  });

  it('adds XP without leveling when there is not enough', () => {
    const r = applyXp(1, 0, 50);
    expect(r).toEqual({ level: 1, xp: 50, levelUps: [], bonusShells: 0 });
  });

  it('levels up and carries the remainder', () => {
    const r = applyXp(1, 100, 60); // 160 total, needs 140
    expect(r.level).toBe(2);
    expect(r.xp).toBe(20);
    expect(r.levelUps).toEqual([{ level: 2, bonus: 30 }]);
    expect(r.bonusShells).toBe(30);
  });

  it('can cross several levels at once and sums the bonuses', () => {
    const r = applyXp(1, 0, 140 + 180 + 5); // level 1 -> 2 -> 3, 5 left
    expect(r.level).toBe(3);
    expect(r.xp).toBe(5);
    expect(r.bonusShells).toBe(30 + 35);
  });

  it('stops at the level cap', () => {
    const r = applyXp(MAX_LEVEL - 1, 0, 1_000_000);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.xp).toBe(0);
    expect(applyXp(MAX_LEVEL, 0, 500)).toMatchObject({ level: MAX_LEVEL, xp: 0, levelUps: [] });
  });

  it('totalXp adds the thresholds of the levels below', () => {
    expect(totalXp(1, 7)).toBe(7);
    expect(totalXp(3, 10)).toBe(140 + 180 + 10);
  });

  it('progress saves default to level 1 and clamp bad values', () => {
    expect(emptyProgress()).toMatchObject({ level: 1, xp: 0 });
    expect(sanitizeProgress({ v: 1, level: 5, xp: 99999 })).toMatchObject({ level: 5, xp: xpNeeded(5) - 1 });
    expect(sanitizeProgress({ v: 1 })).toMatchObject({ level: 1, xp: 0 });
    expect(sanitizeProgress({ v: 1, level: 9999 }).level).toBe(MAX_LEVEL);
  });
});

describe('XP per match', () => {
  const m = (o: Partial<PayoutInput> = {}): PayoutInput => ({ mode: 'Classic', bots: 2, difficulty: 'normal', result: 'win', rounds: 6, survived: 6, kills: 2, ...o });

  it('is the base value before multipliers', () => {
    expect(calcXp(m())).toBe(PAYOUT.play + PAYOUT.win + 2 * PAYOUT.kill + 6 * PAYOUT.round); // 58
    expect(calcXp(m({ mode: 'Marathon', difficulty: 'hard' }))).toBe(58);
    expect(calcXp(m({ result: 'loss', kills: 0, survived: 3 }))).toBe(10 + 6);
  });

  it('gives the flat early amount for a round-1 match', () => {
    expect(calcXp(m({ rounds: 1 }))).toBe(PAYOUT.earlyEnd);
  });
});

/** The pre-0.8 floating point formula, kept here to prove the integer rewrite changed nothing. */
function legacyPayout(x: PayoutInput): number {
  const MODE: Record<string, number> = { Classic: 1, 'Quick Draw': 0.8, 'Crowded Arena': 1.2, 'Tight Circle': 1.1, Marathon: 1.5, Custom: 0.5 };
  const DIFF: Record<string, number> = { easy: 0.8, normal: 1, hard: 1.3 };
  if (x.rounds <= 1) return PAYOUT.earlyEnd;
  const multiplier = (MODE[x.mode] ?? 0.5) * (DIFF[x.difficulty] ?? 1) * Math.min(1.5, Math.max(0.8, 1 + 0.1 * (x.bots - 2)));
  const result = x.result === 'win' ? PAYOUT.win : x.result === 'draw' ? PAYOUT.draw : 0;
  const sum = PAYOUT.play + result + Math.max(0, x.kills) * PAYOUT.kill + Math.max(0, x.survived) * PAYOUT.round;
  return Math.min(PAYOUT.cap, Math.max(1, Math.round(sum * multiplier)));
}

describe('integer payout math', () => {
  it('matches the old floating point formula (except float rounding noise) across a big grid', () => {
    let diffs = 0;
    let n = 0;
    for (const mode of ['Classic', 'Quick Draw', 'Crowded Arena', 'Tight Circle', 'Marathon', 'Custom', 'Nope'])
      for (const difficulty of ['easy', 'normal', 'hard'])
        for (let bots = 1; bots <= 5; bots++)
          for (const result of ['win', 'loss', 'draw'] as const)
            for (const rounds of [1, 2, 5, 12, 30])
              for (let kills = 0; kills <= bots; kills++)
                for (const survived of [0, 1, rounds - 1, rounds]) {
                  if (survived < 0 || survived > rounds) continue;
                  const input: PayoutInput = { mode, bots, difficulty, result, rounds, survived, kills };
                  n++;
                  const a = calcPayout(input).total;
                  const b = legacyPayout(input);
                  if (a !== b) {
                    diffs++;
                    expect(Math.abs(a - b)).toBe(1); // only ever an exact .5 tie that float noise used to flip
                  }
                }
    expect(n).toBeGreaterThan(5000);
    expect(diffs / n).toBeLessThan(0.002);
  });

  it('keeps the documented example values', () => {
    expect(calcPayout({ mode: 'Classic', bots: 2, difficulty: 'normal', result: 'win', rounds: 6, survived: 6, kills: 2 }).total).toBe(58);
    expect(botPermille(2)).toBe(1000);
    expect(botPermille(10)).toBe(1500);
    expect(botPermille(0)).toBe(800);
  });

  it('exposes the abuse limits the server enforces', () => {
    expect(LIMITS).toEqual({ matchesPerHour: 60, shellsPerDay: 3000 });
  });
});
