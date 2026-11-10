import { describe, expect, it } from 'vitest';
import { BotBrain } from '../src/bot';
import { parseChangelog, CHANGELOG } from '../src/changelog';
import { CONFIG } from '../src/config';
import { Match } from '../src/match';
import { MenuModel } from '../src/menu/menuModel';
import type { MenuAction, MenuEnv } from '../src/menu/menuModel';
import { CLASSIC, DIFFICULTY, LIMITS, PRESETS, clampCustom, stepSetting } from '../src/settings';
import type { Command } from '../src/types';

const STEP = 1 / CONFIG.tickRate;
const none = new Map<number, Command>();
const env = (): MenuEnv => ({ volume: 0.6, muted: false, reduceFlashing: false });
const newMenu = (): MenuModel => new MenuModel(env(), { ...CLASSIC });

/** Focus an item by id and activate it. */
function open(m: MenuModel, id: string): MenuAction | null {
  const i = m.items().findIndex((x) => x.id === id);
  expect(i).toBeGreaterThanOrEqual(0);
  m.hover(i);
  return m.activate();
}

describe('settings', () => {
  it('Classic equals the original CONFIG values', () => {
    expect(CLASSIC).toEqual({
      botCount: CONFIG.botCount,
      hiddenDuration: CONFIG.hiddenDuration,
      revealDuration: CONFIG.revealDuration,
      safeRadiusMultiplier: CONFIG.safeRadiusMultiplier,
      minSafeRadius: CONFIG.minSafeRadius,
      maxRounds: CONFIG.maxRounds,
      botDifficulty: 'normal',
    });
    expect(DIFFICULTY.normal).toEqual({
      decisionInterval: CONFIG.bot.decisionInterval,
      aimNoise: CONFIG.bot.aimNoise,
      memoryAimChance: CONFIG.bot.memoryAimChance,
    });
  });

  it('every preset is already within the custom limits', () => {
    for (const p of PRESETS) expect(clampCustom(p.settings)).toEqual(p.settings);
  });

  it('clampCustom enforces limits and rejects junk', () => {
    const c = clampCustom({ botCount: 99, hiddenDuration: -5, revealDuration: NaN, safeRadiusMultiplier: 2, minSafeRadius: 1, maxRounds: 1000, botDifficulty: 'nope' as never });
    expect(c.botCount).toBe(LIMITS.botCount.max);
    expect(c.hiddenDuration).toBe(LIMITS.hiddenDuration.min);
    expect(c.revealDuration).toBe(CLASSIC.revealDuration); // NaN falls back to the default
    expect(c.safeRadiusMultiplier).toBe(LIMITS.safeRadiusMultiplier.max);
    expect(c.minSafeRadius).toBe(LIMITS.minSafeRadius.min);
    expect(c.maxRounds).toBe(LIMITS.maxRounds.max);
    expect(c.botDifficulty).toBe('normal');
    expect(clampCustom(null)).toEqual(CLASSIC);
  });

  it('stepping stays on the grid and inside the limits', () => {
    let s = { ...CLASSIC };
    for (let i = 0; i < 30; i++) s = stepSetting(s, 'safeRadiusMultiplier', 1);
    expect(s.safeRadiusMultiplier).toBe(0.95);
    for (let i = 0; i < 30; i++) s = stepSetting(s, 'safeRadiusMultiplier', -1);
    expect(s.safeRadiusMultiplier).toBe(0.7);
    s = stepSetting(CLASSIC, 'safeRadiusMultiplier', 1);
    expect(s.safeRadiusMultiplier).toBe(0.9); // 0.85 + 0.05, no float drift
  });
});

describe('MenuModel', () => {
  it('Play -> Single Player -> Classic starts a match with Classic settings', () => {
    const m = newMenu();
    expect(open(m, 'play')).toBeNull();
    expect(m.screen).toBe('play');
    open(m, 'single');
    expect(m.screen).toBe('single');
    const a = open(m, 'preset:classic');
    expect(a).toEqual({ type: 'start', settings: CLASSIC, modeName: 'Classic' });
  });

  it('every preset starts with its own settings', () => {
    for (const p of PRESETS) {
      const m = newMenu();
      open(m, 'play');
      open(m, 'single');
      expect(open(m, `preset:${p.id}`)).toEqual({ type: 'start', settings: p.settings, modeName: p.name });
    }
  });

  it('Multiplayer only shows the coming-soon screen and never starts a match', () => {
    const m = newMenu();
    open(m, 'play');
    const a = open(m, 'multi');
    expect(a).toBeNull();
    expect(m.screen).toBe('multiplayer');
    expect(m.activate()).toBeNull(); // Back is the only item
    expect(m.screen).toBe('play');
  });

  it('back stack returns to the previous screen and focus; root back does nothing', () => {
    const m = newMenu();
    expect(m.back()).toBe(false);
    m.hover(m.items().findIndex((i) => i.id === 'settings'));
    open(m, 'settings');
    expect(m.screen).toBe('settings');
    expect(m.back()).toBe(true);
    expect(m.screen).toBe('main');
    expect(m.items()[m.focus].id).toBe('settings'); // restored
    expect(m.back()).toBe(false);
  });

  it('move wraps around', () => {
    const m = newMenu();
    m.move(-1);
    expect(m.focus).toBe(m.items().length - 1);
    m.move(1);
    expect(m.focus).toBe(0);
  });

  it('Custom edits are clamped, reset restores Classic, Play carries the draft', () => {
    const m = newMenu();
    open(m, 'play');
    open(m, 'single');
    open(m, 'custom');
    expect(m.screen).toBe('custom');
    m.hover(m.items().findIndex((x) => x.id === 'c:botCount'));
    for (let i = 0; i < 10; i++) m.adjust(1);
    expect(m.custom.botCount).toBe(5);
    for (let i = 0; i < 10; i++) m.adjust(-1);
    expect(m.custom.botCount).toBe(1);
    m.hover(m.items().findIndex((x) => x.id === 'c:difficulty'));
    m.adjust(1);
    expect(m.custom.botDifficulty).toBe('hard');
    m.hover(m.items().findIndex((x) => x.id === 'c:hiddenDuration'));
    m.adjust(1);
    const a = open(m, 'c:play') as Extract<MenuAction, { type: 'start' }>;
    expect(a.type).toBe('start');
    expect(a.settings).toMatchObject({ botCount: 1, botDifficulty: 'hard', hiddenDuration: 7 });
    open(m, 'c:reset');
    expect(m.custom).toEqual(CLASSIC);
  });

  it('clicking a stepper body does not change it, arrows do', () => {
    const m = newMenu();
    open(m, 'play');
    open(m, 'single');
    open(m, 'custom');
    const i = m.items().findIndex((x) => x.id === 'c:maxRounds');
    expect(m.clickItem(i, 'main')).toBeNull();
    expect(m.custom.maxRounds).toBe(20);
    m.clickItem(i, 'inc');
    expect(m.custom.maxRounds).toBe(25);
    m.clickItem(i, 'dec');
    expect(m.custom.maxRounds).toBe(20);
  });

  it('settings emit volume/mute/flash requests', () => {
    const m = newMenu();
    open(m, 'settings');
    m.hover(0);
    expect(m.adjust(1)).toEqual({ type: 'setVolume', value: 0.7 });
    expect(m.adjust(-1)).toEqual({ type: 'setVolume', value: 0.5 });
    m.hover(1);
    expect(m.activate()).toEqual({ type: 'toggleMute' });
    m.hover(2);
    expect(m.activate()).toEqual({ type: 'setReduceFlashing', value: true });
  });

  it('how to play pages are clamped; toMain resets everything', () => {
    const m = newMenu();
    open(m, 'howto');
    m.adjust(-1);
    expect(m.howtoPage).toBe(0);
    for (let i = 0; i < 10; i++) m.adjust(1);
    expect(m.howtoPage).toBe(2);
    m.toMain();
    expect(m.screen).toBe('main');
    expect(m.back()).toBe(false);
  });
});

describe('changelog parser', () => {
  it('parses versions, titles, dates, tags and items', () => {
    const e = parseChangelog('# Changelog\n\n## [1.2.0] - 2026-01-02 - Big one\n### Added\n- Thing A\n### Fixed\n- Thing B\n\n## [1.1.0] - 2026-01-01\n- Loose item\n');
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ version: '1.2.0', date: '2026-01-02', title: 'Big one' });
    expect(e[0].items).toEqual([
      { tag: 'Added', text: 'Thing A' },
      { tag: 'Fixed', text: 'Thing B' },
    ]);
    expect(e[1]).toMatchObject({ version: '1.1.0', title: '' });
    expect(e[1].items[0].text).toBe('Loose item');
  });

  it('handles empty input', () => {
    expect(parseChangelog('')).toEqual([]);
  });

  it('the real CHANGELOG.md has entries, newest first', () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(3);
    expect(CHANGELOG[0].version).toBe('0.6.0');
  });
});

describe('Match with settings', () => {
  it('5 bots -> 6 players, all spawned apart and inside the arena', () => {
    const m = new Match();
    m.start({ ...CLASSIC, botCount: 5 });
    expect(m.players).toHaveLength(6);
    expect(new Set(m.players.map((p) => p.name)).size).toBe(6);
    for (const p of m.players) expect(Math.hypot(p.pos.x, p.pos.y) + p.radius).toBeLessThanOrEqual(CONFIG.arenaRadius);
  });

  it('uses the chosen hidden/reveal durations, shrink and min radius', () => {
    const s = { ...CLASSIC, hiddenDuration: 3, revealDuration: 1, safeRadiusMultiplier: 0.5, minSafeRadius: 120 };
    const m = new Match();
    m.start(s);
    expect(m.timeLeft).toBe(3);
    m.players = m.players.slice(0, 2);
    m.players[0].pos = { x: -10, y: 0 };
    m.players[1].pos = { x: 10, y: 0 };
    m.players[0].aim = { x: -1, y: 0 };
    m.players[1].aim = { x: 1, y: 0 }; // nobody hits anybody
    let ticks = 0;
    while (m.phase === 'HIDDEN' && ticks++ < 100000) m.update(STEP, none);
    expect(ticks).toBeCloseTo(3 * CONFIG.tickRate, -1);
    expect(m.phase).toBe('REVEAL');
    expect(m.revealLeft).toBe(1);
    while ((m.phase as string) === 'REVEAL') m.update(STEP, none);
    expect(m.round).toBe(2);
    expect(m.safeRadius).toBe(160); // 320 * 0.5
    for (let r = 0; r < 3; r++) {
      while ((m.phase as string) === 'HIDDEN') m.update(STEP, none);
      while ((m.phase as string) === 'REVEAL') m.update(STEP, none);
    }
    expect(m.safeRadius).toBe(120); // clamped at the minimum
  });

  it('honors a custom round limit', () => {
    const m = new Match();
    m.start({ ...CLASSIC, maxRounds: 5, hiddenDuration: 3, revealDuration: 1, minSafeRadius: 120 });
    m.players = m.players.slice(0, 2);
    m.players[0].pos = { x: -10, y: 0 };
    m.players[1].pos = { x: 10, y: 0 };
    m.players[0].aim = { x: -1, y: 0 };
    m.players[1].aim = { x: 1, y: 0 };
    let guard = 0;
    while (m.phase !== 'GAME_OVER' && guard++ < 100000) m.update(STEP, none);
    expect(m.round).toBe(5);
    expect(m.outcome).toEqual({ kind: 'draw' });
  });

  it('restart without settings reuses the last mode', () => {
    const m = new Match();
    m.start({ ...CLASSIC, botCount: 4 });
    m.start();
    expect(m.players).toHaveLength(5);
  });
});

describe('bot difficulty', () => {
  it('harder bots aim closer to a remembered target than easy ones', () => {
    const err = (profile: typeof DIFFICULTY.easy): number => {
      let s = 7;
      const rng = (): number => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
      const b = new BotBrain(1, rng, { ...profile, memoryAimChance: 1 });
      let total = 0;
      for (let i = 0; i < 300; i++) {
        b.observe({
          round: 1,
          snapshot: [{ id: 0, pos: { x: 100, y: 0 }, aim: { x: 1, y: 0 }, radius: 12 }],
          result: { shots: [], shotDeaths: [], boundaryDeaths: [], deaths: [] },
        });
        const a = b.think({ pos: { x: 0, y: 0 }, radius: 12 }, { safeRadius: 320, progress: 0 }, 1 / 60).aim!;
        total += Math.abs(Math.atan2(a.y, a.x));
      }
      return total / 300;
    };
    expect(err(DIFFICULTY.hard)).toBeLessThan(err(DIFFICULTY.normal));
    expect(err(DIFFICULTY.normal)).toBeLessThan(err(DIFFICULTY.easy));
  });
});
