import { describe, expect, it } from 'vitest';
import { PAYOUT, calcPayout } from '../src/economy';
import type { PayoutInput } from '../src/economy';
import { addShells, emptyProgress, sanitizeName, sanitizeProgress } from '../src/progress';
import { CATALOG, CATEGORIES, CONFIRM_FROM, RARITY, buyOrEquip, isEquipped, isOwned, itemsIn, nextUnlock } from '../src/shop';
import { loadoutOf } from '../src/cosmetics';

const match = (o: Partial<PayoutInput> = {}): PayoutInput => ({
  mode: 'Classic',
  bots: 2,
  difficulty: 'normal',
  result: 'win',
  rounds: 6,
  survived: 6,
  kills: 2,
  ...o,
});

describe('calcPayout', () => {
  it('pays play + win + kills + rounds in Classic/Normal', () => {
    const p = calcPayout(match());
    expect(p.total).toBe(PAYOUT.play + PAYOUT.win + 2 * PAYOUT.kill + 6 * PAYOUT.round); // 58
    expect(p.parts).toEqual({ play: 10, result: 20, kills: 16, rounds: 12 });
  });

  it('a loss pays less than a win; a draw sits between', () => {
    const win = calcPayout(match({ result: 'win' })).total;
    const draw = calcPayout(match({ result: 'draw' })).total;
    const loss = calcPayout(match({ result: 'loss' })).total;
    expect(win).toBeGreaterThan(draw);
    expect(draw).toBeGreaterThan(loss);
  });

  it('scales with mode, difficulty and bot count', () => {
    const base = calcPayout(match()).total;
    expect(calcPayout(match({ mode: 'Marathon' })).total).toBeGreaterThan(base);
    expect(calcPayout(match({ mode: 'Quick Draw' })).total).toBeLessThan(base);
    expect(calcPayout(match({ difficulty: 'hard' })).total).toBeGreaterThan(base);
    expect(calcPayout(match({ difficulty: 'easy' })).total).toBeLessThan(base);
    expect(calcPayout(match({ bots: 5 })).total).toBeGreaterThan(base);
    expect(calcPayout(match({ mode: 'Custom' })).total).toBeLessThan(base);
  });

  it('pays a flat amount when the match ends in round 1, and never exceeds the cap', () => {
    expect(calcPayout(match({ rounds: 1, survived: 1 })).total).toBe(PAYOUT.earlyEnd);
    expect(calcPayout(match({ mode: 'Marathon', difficulty: 'hard', bots: 5, kills: 50, survived: 40, rounds: 40 })).total).toBe(PAYOUT.cap);
  });

  it('breakdown parts add up to the total (within rounding)', () => {
    const p = calcPayout(match({ mode: 'Crowded Arena', bots: 4, kills: 3 }));
    const sum = p.parts.play + p.parts.result + p.parts.kills + p.parts.rounds;
    expect(Math.abs(sum - p.total)).toBeLessThanOrEqual(2);
  });
});

describe('catalog', () => {
  it('has unique ids, one free item per category and valid payloads', () => {
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
    for (const c of CATEGORIES) {
      expect(itemsIn(c.id).filter((i) => i.free)).toHaveLength(1);
    }
    for (const i of CATALOG) {
      expect(RARITY[i.rarity]).toBeDefined();
      expect(i.free ? i.price === 0 : i.price > 0).toBe(true);
      if (i.category === 'title') expect(i.title).toBeTruthy();
    }
  });

  it('prices rise with rarity', () => {
    const minPrice = (r: string) => Math.min(...CATALOG.filter((i) => i.rarity === r && !i.free).map((i) => i.price));
    expect(minPrice('rare')).toBeGreaterThan(minPrice('common'));
    expect(minPrice('epic')).toBeGreaterThan(minPrice('rare'));
    expect(minPrice('legendary')).toBeGreaterThan(minPrice('epic'));
    expect(CONFIRM_FROM).toBeGreaterThan(0);
  });
});

describe('buyOrEquip', () => {
  it('starts with the free items owned and equipped', () => {
    const p = emptyProgress();
    for (const c of CATEGORIES) {
      const free = itemsIn(c.id).find((i) => i.free)!;
      expect(isOwned(p, free.id)).toBe(true);
      expect(isEquipped(p, free.id)).toBe(true);
    }
  });

  it('buys, spends Shells, auto-equips, and does not mutate the input', () => {
    const p = addShells(emptyProgress(), 150);
    const r = buyOrEquip(p, 'skin-mint');
    expect(r.kind).toBe('bought');
    if (r.kind !== 'bought') return;
    expect(r.progress.shells).toBe(50);
    expect(isEquipped(r.progress, 'skin-mint')).toBe(true);
    expect(p.shells).toBe(150);
    expect(p.owned).not.toContain('skin-mint');
  });

  it('refuses when unaffordable and reports how many Shells are missing', () => {
    const r = buyOrEquip(addShells(emptyProgress(), 30), 'skin-mint');
    expect(r).toEqual({ kind: 'needMore', missing: 70 });
  });

  it('re-selecting an owned item equips it for free; unknown ids are rejected', () => {
    let p = addShells(emptyProgress(), 500);
    const a = buyOrEquip(p, 'skin-mint');
    if (a.kind === 'bought') p = a.progress;
    const b = buyOrEquip(p, 'skin-cyan');
    expect(b.kind).toBe('equipped');
    if (b.kind === 'equipped') {
      expect(b.progress.shells).toBe(p.shells);
      expect(isEquipped(b.progress, 'skin-cyan')).toBe(true);
    }
    expect(buyOrEquip(p, 'nope').kind).toBe('unknown');
  });

  it('suggests the cheapest unowned item as the next unlock', () => {
    const n = nextUnlock(addShells(emptyProgress(), 20));
    expect(n?.item.price).toBe(80);
    expect(n?.missing).toBe(60);
  });
});

describe('progress persistence', () => {
  it('sanitizes names', () => {
    expect(sanitizeName('  Ali   Baba  ')).toBe('Ali Baba');
    expect(sanitizeName('<b>x</b>')).toBe('bx/b');
    expect(sanitizeName('a'.repeat(40))).toHaveLength(14);
    expect(sanitizeName('   ')).toBe('Player');
    expect(sanitizeName(42)).toBe('Player');
  });

  it('falls back to defaults for garbage, and drops unknown or unowned equipped items', () => {
    const ref = { ...emptyProgress(), createdAt: 0 };
    for (const bad of [null, 7, 'x', {}, { v: 9 }]) expect({ ...sanitizeProgress(bad), createdAt: 0 }).toEqual(ref);
    const p = sanitizeProgress({ v: 1, shells: -5, owned: ['skin-mint', 'ghost-item'], equipped: { skin: 'skin-chrome', shot: 'skin-mint', kill: 'kill-none' } });
    expect(p.shells).toBe(0);
    expect(p.owned).toContain('skin-mint');
    expect(p.owned).not.toContain('ghost-item');
    expect(p.equipped.skin).toBe('skin-cyan'); // chrome is not owned
    expect(p.equipped.shot).toBe('shot-default'); // wrong category
  });

  it('round-trips valid data and exposes the loadout', () => {
    let p = addShells(emptyProgress(), 400);
    const r = buyOrEquip(p, 'shot-rainbow');
    if (r.kind === 'bought') p = r.progress;
    const back = sanitizeProgress(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
    expect(loadoutOf(back).shot?.mode).toBe('rainbow');
    expect(loadoutOf(emptyProgress()).shot).toBeNull();
  });
});

describe('Shop menu flow', () => {
  const env = { volume: 1, muted: false, reduceFlashing: false };
  const open = async () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: () => null, setItem: () => undefined };
    const { MenuModel } = await import('../src/menu/menuModel');
    const { CLASSIC } = await import('../src/settings');
    const m = new MenuModel(env, { ...CLASSIC });
    m.focus = m.items().findIndex((i) => i.id === 'shop');
    m.activate();
    return m;
  };

  it('opens from the main menu; Left/Right switch category tabs and wrap', async () => {
    const m = await open();
    expect(m.screen).toBe('shop');
    expect(m.shopTab).toBe(0);
    m.adjust(1);
    expect(m.shopTab).toBe(1);
    m.adjust(-1);
    m.adjust(-1);
    expect(m.shopTab).toBe(CATEGORIES.length - 1);
    expect(m.items().every((i) => i.id === 'back' || i.id.startsWith('shop:'))).toBe(true);
    m.clickItem(2, 'tab');
    expect(m.shopTab).toBe(2);
    expect(m.focus).toBe(0);
  });

  it('buys a cheap item with one activation and reports the save action', async () => {
    const m = await open();
    m.progress = addShells(m.progress, 300);
    m.focus = m.items().findIndex((i) => i.id === 'shop:skin-mint');
    expect(m.activate()).toEqual({ type: 'saveProgress' });
    expect(m.progress.shells).toBe(200);
    expect(isEquipped(m.progress, 'skin-mint')).toBe(true);
    expect(m.toast.kind).toBe('good');
  });

  it('expensive items need a second tap and the arm clears when focus moves', async () => {
    const m = await open();
    m.progress = addShells(m.progress, 2000);
    m.focus = m.items().findIndex((i) => i.id === 'shop:skin-gold');
    expect(m.activate()).toBeNull();
    expect(m.armedId).toBe('skin-gold');
    expect(m.progress.shells).toBe(2000);
    m.move(1);
    expect(m.armedId).toBeNull();
    m.move(-1);
    m.activate();
    expect(m.activate()).toEqual({ type: 'saveProgress' });
    expect(m.progress.shells).toBe(1100);
  });

  it('says how many Shells are missing and changes nothing when unaffordable', async () => {
    const m = await open();
    m.focus = m.items().findIndex((i) => i.id === 'shop:skin-mint');
    expect(m.activate()).toBeNull();
    expect(m.toast.text).toMatch(/100 more/);
    expect(m.progress.shells).toBe(0);
  });

  it('Profile screen offers rename, shop, stats and back', async () => {
    const m = await open();
    m.back();
    m.focus = m.items().findIndex((i) => i.id === 'profile');
    m.activate();
    expect(m.screen).toBe('profile');
    expect(m.items().map((i) => i.id)).toEqual(['rename', 'goShop', 'goStats', 'back']);
    m.focus = 0;
    expect(m.activate()).toEqual({ type: 'rename' });
  });
});
