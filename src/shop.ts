/** Shop catalog and pure buy/equip logic. Data only: no canvas, DOM or match dependencies. */
import type { Progress } from './progress';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Category = 'skin' | 'shot' | 'kill' | 'arena' | 'title';

export interface RarityStyle {
  label: string;
  color: string; // border / label color
  glow: number; // base shadow blur in px (scaled by the UI)
  pulse: number; // 0..1 how strongly the glow breathes
  rank: number;
}

/** Visual language for rarity. Higher rarities glow harder and animate. */
export const RARITY: Record<Rarity, RarityStyle> = {
  common: { label: 'COMMON', color: '#a9b4c4', glow: 0, pulse: 0, rank: 0 },
  rare: { label: 'RARE', color: '#4cc9f0', glow: 12, pulse: 0.25, rank: 1 },
  epic: { label: 'EPIC', color: '#b57bff', glow: 18, pulse: 0.4, rank: 2 },
  legendary: { label: 'LEGENDARY', color: '#ffc247', glow: 26, pulse: 0.55, rank: 3 },
};

export interface SkinParams {
  color?: string; // body color (default: the player's own color)
  trim?: string; // outline / cap trim
  stripes?: string; // second color for stripes
  glow?: string; // aura color
  chrome?: boolean; // metallic gradient
  ghost?: boolean; // translucent, shimmering
}

export interface ShotParams {
  core: string;
  glow: string;
  flash: string;
  mode: 'solid' | 'rainbow' | 'pulse' | 'comet';
}

export type KillKind = 'spark' | 'ring' | 'confetti' | 'lightning';

export interface ArenaParams {
  tint: string; // overlay on the floor
  edge: string; // arena rim
  safe: string; // safe-circle glow
  danger: string; // unsafe-zone tint
  hatch: string;
  overlay: 'none' | 'grid' | 'stars' | 'frost' | 'embers';
  accent?: string; // grid / sparkle color
}

export interface ShopItem {
  id: string;
  category: Category;
  name: string;
  blurb: string;
  rarity: Rarity;
  price: number;
  free?: boolean;
  skin?: SkinParams;
  shot?: ShotParams;
  kill?: KillKind;
  arena?: ArenaParams;
  title?: string;
}

export const CATEGORIES: { id: Category; label: string; singular: string }[] = [
  { id: 'skin', label: 'SKINS', singular: 'Skin' },
  { id: 'shot', label: 'SHOTS', singular: 'Shot style' },
  { id: 'kill', label: 'KILLS', singular: 'Kill effect' },
  { id: 'arena', label: 'ARENAS', singular: 'Arena theme' },
  { id: 'title', label: 'TITLES', singular: 'Title' },
];

const it = (i: ShopItem): ShopItem => i;

export const CATALOG: ShopItem[] = [
  // ---- skins (your character only; bots keep their colors) ----
  it({ id: 'skin-cyan', category: 'skin', name: 'Cyan', blurb: 'The classic look.', rarity: 'common', price: 0, free: true, skin: {} }),
  it({ id: 'skin-mint', category: 'skin', name: 'Mint', blurb: 'Cool and calm.', rarity: 'common', price: 100, skin: { color: '#5ee6b0' } }),
  it({ id: 'skin-rose', category: 'skin', name: 'Rose', blurb: 'Hard to miss.', rarity: 'common', price: 100, skin: { color: '#ff7eb6' } }),
  it({ id: 'skin-slate', category: 'skin', name: 'Slate', blurb: 'Low profile.', rarity: 'common', price: 100, skin: { color: '#8fa3b8' } }),
  it({ id: 'skin-stripes', category: 'skin', name: 'Two-Tone', blurb: 'Bold racing stripes.', rarity: 'rare', price: 350, skin: { color: '#2d6cdf', stripes: '#ffffff', glow: '#4c8dff' } }),
  it({ id: 'skin-lime', category: 'skin', name: 'Neon Lime', blurb: 'Radioactive glow.', rarity: 'rare', price: 400, skin: { color: '#a6f23b', glow: '#b6ff3b' } }),
  it({ id: 'skin-gold', category: 'skin', name: 'Gold Trim', blurb: 'Black suit, golden edge.', rarity: 'epic', price: 900, skin: { color: '#2a2f3d', trim: '#ffc247', glow: '#ffc247' } }),
  it({ id: 'skin-phantom', category: 'skin', name: 'Phantom', blurb: 'Half here, half gone.', rarity: 'legendary', price: 2500, skin: { color: '#cfe9ff', ghost: true, glow: '#9fd8ff' } }),
  it({ id: 'skin-chrome', category: 'skin', name: 'Chrome', blurb: 'Liquid metal.', rarity: 'legendary', price: 3000, skin: { color: '#c9d3df', chrome: true, glow: '#ffffff' } }),

  // ---- shot styles (tracer + muzzle flash) ----
  it({ id: 'shot-default', category: 'shot', name: 'Standard', blurb: 'Your own color.', rarity: 'common', price: 0, free: true }),
  it({ id: 'shot-lime', category: 'shot', name: 'Lime', blurb: 'Sharp green line.', rarity: 'common', price: 80, shot: { core: '#9dff4a', glow: '#9dff4a', flash: '#e6ffb8', mode: 'solid' } }),
  it({ id: 'shot-pink', category: 'shot', name: 'Pink', blurb: 'Candy-colored danger.', rarity: 'common', price: 80, shot: { core: '#ff6fb5', glow: '#ff6fb5', flash: '#ffd0e6', mode: 'solid' } }),
  it({ id: 'shot-ice', category: 'shot', name: 'Ice', blurb: 'Frozen bolt.', rarity: 'common', price: 100, shot: { core: '#9fe8ff', glow: '#6fd6ff', flash: '#eaffff', mode: 'solid' } }),
  it({ id: 'shot-rainbow', category: 'shot', name: 'Rainbow Shift', blurb: 'Every color at once.', rarity: 'rare', price: 400, shot: { core: '#ffffff', glow: '#ffffff', flash: '#ffffff', mode: 'rainbow' } }),
  it({ id: 'shot-plasma', category: 'shot', name: 'Plasma Pulse', blurb: 'Throbbing violet energy.', rarity: 'epic', price: 1000, shot: { core: '#c06bff', glow: '#9b3dff', flash: '#f0d6ff', mode: 'pulse' } }),
  it({ id: 'shot-comet', category: 'shot', name: 'Comet Trail', blurb: 'A burning streak.', rarity: 'legendary', price: 2500, shot: { core: '#ffd36b', glow: '#ff8a2a', flash: '#fff2c4', mode: 'comet' } }),

  // ---- kill effects (plays at your kill) ----
  it({ id: 'kill-none', category: 'kill', name: 'Plain', blurb: 'No extra flair.', rarity: 'common', price: 0, free: true }),
  it({ id: 'kill-spark', category: 'kill', name: 'Spark Burst', blurb: 'A shower of sparks.', rarity: 'common', price: 150, kill: 'spark' }),
  it({ id: 'kill-ring', category: 'kill', name: 'Ring Pulse', blurb: 'Shockwaves ripple out.', rarity: 'rare', price: 400, kill: 'ring' }),
  it({ id: 'kill-confetti', category: 'kill', name: 'Confetti Pop', blurb: 'Celebrate every kill.', rarity: 'epic', price: 900, kill: 'confetti' }),
  it({ id: 'kill-lightning', category: 'kill', name: 'Lightning Strike', blurb: 'Judgement from above.', rarity: 'legendary', price: 2500, kill: 'lightning' }),

  // ---- arena themes ----
  it({ id: 'arena-concrete', category: 'arena', name: 'Concrete', blurb: 'The original arena.', rarity: 'common', price: 0, free: true }),
  it({ id: 'arena-midnight', category: 'arena', name: 'Midnight Blue', blurb: 'Deep blue dusk.', rarity: 'common', price: 150, arena: { tint: 'rgba(30, 60, 170, 0.30)', edge: '#5b7bd6', safe: '#7fb0ff', danger: 'rgba(214, 60, 70, 0.30)', hatch: 'rgba(255, 110, 110, 0.18)', overlay: 'none' } }),
  it({ id: 'arena-sand', category: 'arena', name: 'Sandstone', blurb: 'Warm desert slabs.', rarity: 'common', price: 150, arena: { tint: 'rgba(200, 145, 70, 0.28)', edge: '#c9a46a', safe: '#ffd98a', danger: 'rgba(214, 60, 70, 0.30)', hatch: 'rgba(255, 110, 110, 0.18)', overlay: 'none' } }),
  it({ id: 'arena-lava', category: 'arena', name: 'Lava Ring', blurb: 'The edge is molten.', rarity: 'rare', price: 500, arena: { tint: 'rgba(120, 30, 10, 0.32)', edge: '#ff7a3d', safe: '#ffd27a', danger: 'rgba(255, 70, 20, 0.40)', hatch: 'rgba(255, 170, 60, 0.30)', overlay: 'embers', accent: '#ffb347' } }),
  it({ id: 'arena-frost', category: 'arena', name: 'Frost', blurb: 'Glittering ice field.', rarity: 'rare', price: 500, arena: { tint: 'rgba(120, 195, 255, 0.22)', edge: '#bfe6ff', safe: '#e8fbff', danger: 'rgba(90, 130, 255, 0.32)', hatch: 'rgba(200, 230, 255, 0.28)', overlay: 'frost', accent: '#e8fbff' } }),
  it({ id: 'arena-neon', category: 'arena', name: 'Neon Grid', blurb: 'Synthwave floor.', rarity: 'epic', price: 1200, arena: { tint: 'rgba(24, 0, 70, 0.50)', edge: '#ff3df2', safe: '#3dfcff', danger: 'rgba(255, 40, 160, 0.34)', hatch: 'rgba(255, 90, 220, 0.28)', overlay: 'grid', accent: '#b43dff' } }),
  it({ id: 'arena-void', category: 'arena', name: 'Void', blurb: 'Stars beneath your feet.', rarity: 'legendary', price: 3000, arena: { tint: 'rgba(6, 0, 22, 0.66)', edge: '#9a6bff', safe: '#d2b8ff', danger: 'rgba(130, 40, 220, 0.36)', hatch: 'rgba(190, 150, 255, 0.28)', overlay: 'stars', accent: '#ffffff' } }),

  // ---- titles ----
  it({ id: 'title-rookie', category: 'title', name: 'Rookie', blurb: 'Everyone starts here.', rarity: 'common', price: 0, free: true, title: 'Rookie' }),
  it({ id: 'title-sharp', category: 'title', name: 'Sharpshooter', blurb: 'Steady hands.', rarity: 'common', price: 120, title: 'Sharpshooter' }),
  it({ id: 'title-deadeye', category: 'title', name: 'Dead Eye', blurb: 'Never blinks.', rarity: 'rare', price: 300, title: 'Dead Eye' }),
  it({ id: 'title-ghost', category: 'title', name: 'Ghost', blurb: 'Seen by no one.', rarity: 'epic', price: 600, title: 'Ghost' }),
  it({ id: 'title-last', category: 'title', name: 'Last Chamber', blurb: 'The final word.', rarity: 'legendary', price: 2000, title: 'Last Chamber' }),
];

const BY_ID = new Map(CATALOG.map((i) => [i.id, i]));
export const itemById = (id: string): ShopItem | undefined => BY_ID.get(id);
export const itemsIn = (cat: Category): ShopItem[] => CATALOG.filter((i) => i.category === cat);
export const freeItemOf = (cat: Category): ShopItem => itemsIn(cat).find((i) => i.free)!;

/** Prices at or above this need a second tap to confirm. */
export const CONFIRM_FROM = 500;

export const isOwned = (p: Progress, id: string): boolean => p.owned.includes(id);
export const isEquipped = (p: Progress, id: string): boolean => {
  const item = BY_ID.get(id);
  return !!item && p.equipped[item.category] === id;
};

export type ShopResult =
  | { kind: 'equipped'; progress: Progress }
  | { kind: 'bought'; progress: Progress }
  | { kind: 'needMore'; missing: number }
  | { kind: 'unknown' };

export function equip(p: Progress, id: string): Progress | null {
  const item = BY_ID.get(id);
  if (!item || !isOwned(p, id)) return null;
  return { ...p, equipped: { ...p.equipped, [item.category]: id } };
}

/** Buys (and auto-equips) an item, or equips it when already owned. Never mutates the input. */
export function buyOrEquip(p: Progress, id: string): ShopResult {
  const item = BY_ID.get(id);
  if (!item) return { kind: 'unknown' };
  if (isOwned(p, id)) {
    const next = equip(p, id);
    return next ? { kind: 'equipped', progress: next } : { kind: 'unknown' };
  }
  if (p.shells < item.price) return { kind: 'needMore', missing: item.price - p.shells };
  const bought: Progress = { ...p, shells: p.shells - item.price, owned: [...p.owned, id] };
  return { kind: 'bought', progress: equip(bought, id)! };
}

/** The cheapest item the player does not own yet, for the "N Shells to your next unlock" hint. */
export function nextUnlock(p: Progress): { item: ShopItem; missing: number } | null {
  let best: ShopItem | null = null;
  for (const i of CATALOG) if (!isOwned(p, i.id) && (!best || i.price < best.price)) best = i;
  return best ? { item: best, missing: Math.max(0, best.price - p.shells) } : null;
}

export const ownedCount = (p: Progress): { owned: number; total: number } => ({ owned: p.owned.length, total: CATALOG.length });
