import { describe, expect, it } from 'vitest';
import { applyCloudProfile, applyCloudStats, buildImportPayload, parseCloudProfile, parseSubmit } from '../src/merge';
import type { CloudProfile } from '../src/merge';
import { emptyProgress } from '../src/progress';
import { emptyStats } from '../src/stats';

const cloud = (o: Partial<CloudProfile> = {}): CloudProfile => ({
  displayName: 'Cloudy',
  shells: 250,
  totalEarned: 400,
  owned: ['skin-cyan', 'skin-mint', 'bogus-item'],
  equipped: { skin: 'skin-mint', shot: 'shot-legendary-fake' },
  level: 4,
  xp: 10,
  imported: true,
  reconciled: true,
  createdAt: 1_700_000_000_000,
  stats: { ...emptyStats(), played: 7, wins: 3 },
  ...o,
});

describe('import payload', () => {
  it('carries the local save, level and stats', () => {
    const p = { ...emptyProgress(), name: 'Zed', shells: 120, totalEarned: 300, level: 3, xp: 40 };
    const stats = { ...emptyStats(), played: 5 };
    const payload = buildImportPayload(p, stats);
    expect(payload).toMatchObject({ name: 'Zed', shells: 120, total_earned: 300, level: 3, xp: 40 });
    expect(payload.owned).toEqual(p.owned);
    expect(payload.equipped).toEqual(p.equipped);
    expect((payload.stats as { played: number }).played).toBe(5);
  });
});

describe('parseCloudProfile', () => {
  it('reads the server json, including stats and recent matches, and rejects junk', () => {
    const c = parseCloudProfile({
      display_name: 'A1b',
      shells: 5,
      total_earned: 9,
      owned: ['skin-cyan', 7],
      equipped: {},
      level: 0,
      xp: -3,
      imported: true,
      reconciled: true,
      created_at: '2026-01-02T00:00:00Z',
      stats: { played: 4, wins: 2, losses: 1, draws: 1, kills: 6, streak: 1, best_streak: 2, best_survived: 7, modes: { Classic: { played: 4, wins: 2, losses: 1, draws: 1, bestSurvived: 7 } } },
      recent: [{ mode: 'Classic', bots: 2, difficulty: 'normal', result: 'win', rounds: 6, survived: 6, kills: 2, at: 1700000000000 }],
    });
    expect(c?.displayName).toBe('A1b');
    expect(c?.owned).toEqual(['skin-cyan']);
    expect(c?.level).toBe(1);
    expect(c?.xp).toBe(0);
    expect(c?.reconciled).toBe(true);
    expect(c?.stats).toMatchObject({ played: 4, wins: 2, bestStreak: 2, bestSurvived: 7 });
    expect(c?.stats.recent).toHaveLength(1);
    expect(c?.stats.modes.Classic.wins).toBe(2);
    expect(parseCloudProfile(null)).toBeNull();
    expect(parseCloudProfile({ shells: 5 })).toBeNull();
  });
});

describe('parseSubmit', () => {
  const profile = { display_name: 'Abc', shells: 70, total_earned: 70, equipped: {}, owned: [], level: 2, xp: 5, imported: true, reconciled: true, created_at: '2026-01-02T00:00:00Z' };

  it('reads result, level-ups and the profile', () => {
    const d = parseSubmit({ profile, result: { shells: 58, bonus: 30, xp: 58, level_ups: [{ level: 2, bonus: 30 }], duplicate: false, throttled: false } });
    expect(d).toMatchObject({ shells: 58, bonus: 30, xp: 58, duplicate: false, throttled: false });
    expect(d?.levelUps).toEqual([{ level: 2, bonus: 30 }]);
    expect(d?.profile.level).toBe(2);
  });

  it('rejects documents without a usable profile or result', () => {
    expect(parseSubmit({ error: 'invalid' })).toBeNull();
    expect(parseSubmit({ profile, result: null })).toBeNull();
    expect(parseSubmit(5)).toBeNull();
  });
});

describe('applyCloudProfile', () => {
  it('the server profile replaces local progress and drops unknown items', () => {
    const out = applyCloudProfile(cloud());
    expect(out.name).toBe('Cloudy');
    expect(out.shells).toBe(250);
    expect(out.level).toBe(4);
    expect(out.xp).toBe(10);
    expect(out.owned).toContain('skin-mint');
    expect(out.owned).not.toContain('bogus-item');
    expect(out.equipped.skin).toBe('skin-mint');
    expect(out.equipped.shot).toBe('shot-default'); // invalid id falls back to the free item
  });

  it('cloud stats come straight from the profile', () => {
    expect(applyCloudStats(cloud()).played).toBe(7);
  });
});
