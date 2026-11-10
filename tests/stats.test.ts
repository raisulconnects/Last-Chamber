import { beforeEach, describe, expect, it } from 'vitest';
import { MenuModel } from '../src/menu/menuModel';
import { CLASSIC } from '../src/settings';
import { emptyStats, recordMatch, sanitizeStats, winRate } from '../src/stats';
import type { MatchRecord, StatsData } from '../src/stats';

const rec = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  mode: 'Classic',
  bots: 2,
  difficulty: 'normal',
  result: 'win',
  rounds: 5,
  survived: 5,
  kills: 1,
  at: 1,
  ...over,
});

const play = (s: StatsData, ...rs: Partial<MatchRecord>[]): StatsData => rs.reduce((acc, r) => recordMatch(acc, rec(r)).stats, s);

describe('recordMatch', () => {
  it('counts wins, losses, draws and kills', () => {
    const s = play(emptyStats(), { result: 'win', kills: 2 }, { result: 'loss', kills: 0 }, { result: 'draw', kills: 1 });
    expect([s.played, s.wins, s.losses, s.draws, s.kills]).toEqual([3, 1, 1, 1, 3]);
    expect(winRate(s)).toBe(33);
  });

  it('tracks streaks: loss resets, draw leaves it, best is kept', () => {
    let s = play(emptyStats(), { result: 'win' }, { result: 'win' }, { result: 'draw' }, { result: 'win' });
    expect(s.streak).toBe(3);
    s = play(s, { result: 'loss' });
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(3);
  });

  it('reports new bests', () => {
    const a = recordMatch(emptyStats(), rec({ survived: 4 }));
    expect(a.newBestStreak).toBe(true);
    expect(a.newBestSurvived).toBe(true);
    const b = recordMatch(a.stats, rec({ result: 'loss', survived: 2 }));
    expect(b.newBestStreak).toBe(false);
    expect(b.newBestSurvived).toBe(false);
  });

  it('keeps per-mode counters and best survival', () => {
    const s = play(emptyStats(), { mode: 'Quick Draw', survived: 3 }, { mode: 'Quick Draw', result: 'loss', survived: 7 }, { mode: 'Custom' });
    expect(s.modes['Quick Draw']).toMatchObject({ played: 2, wins: 1, losses: 1, bestSurvived: 7 });
    expect(s.modes['Custom'].played).toBe(1);
  });

  it('keeps only the 10 most recent matches, newest first, and does not mutate the input', () => {
    const base = emptyStats();
    let s = base;
    for (let i = 1; i <= 12; i++) s = recordMatch(s, rec({ at: i })).stats;
    expect(s.recent).toHaveLength(10);
    expect(s.recent[0].at).toBe(12);
    expect(base.played).toBe(0);
  });
});

describe('sanitizeStats', () => {
  it('falls back to empty for garbage, wrong version or non-objects', () => {
    for (const bad of [null, 5, 'x', [], {}, { v: 2, played: 9 }]) expect(sanitizeStats(bad)).toEqual(emptyStats());
  });

  it('round-trips valid data', () => {
    const s = play(emptyStats(), { result: 'win' }, { result: 'loss', mode: 'Marathon' });
    expect(sanitizeStats(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('clamps bad numbers and drops invalid entries', () => {
    const s = sanitizeStats({ v: 1, played: -4, wins: 'x', kills: 1e3, streak: 3, bestStreak: 1, recent: [{ result: 'nope' }, null], modes: { A: 5 } });
    expect(s.played).toBe(0);
    expect(s.wins).toBe(0);
    expect(s.kills).toBe(1000);
    expect(s.bestStreak).toBe(3); // never below the current streak
    expect(s.recent).toEqual([]);
    expect(s.modes).toEqual({});
  });
});

describe('Stats menu screen', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: () => null, setItem: () => undefined };
  });
  const env = { volume: 1, muted: false, reduceFlashing: false };

  it('opens from the main menu and backs out', () => {
    const m = new MenuModel(env, { ...CLASSIC });
    m.focus = m.items().findIndex((i) => i.id === 'stats');
    m.activate();
    expect(m.screen).toBe('stats');
    expect(m.back()).toBe(true);
    expect(m.screen).toBe('main');
  });

  it('reset needs two activations and disarms when focus moves', () => {
    const m = new MenuModel(env, { ...CLASSIC });
    m.focus = m.items().findIndex((i) => i.id === 'stats');
    m.activate();
    m.focus = 0;
    expect(m.activate()).toBeNull();
    expect(m.resetArmed).toBe(true);
    expect(m.items()[0].label).toMatch(/confirm/i);
    m.move(1);
    expect(m.resetArmed).toBe(false);
    m.move(-1);
    m.activate();
    expect(m.activate()).toEqual({ type: 'resetStats' });
    expect(m.resetArmed).toBe(false);
  });
});
