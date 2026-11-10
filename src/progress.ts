/** Player progress (wallet, inventory, loadout, profile). Pure logic plus try/catch localStorage. */
import { CATEGORIES, CATALOG, freeItemOf, itemById } from './shop';
import type { Category } from './shop';

export type Equipped = Record<Category, string>;

export interface Progress {
  v: 1;
  name: string;
  shells: number;
  totalEarned: number;
  owned: string[];
  equipped: Equipped;
  createdAt: number; // epoch ms
}

export const PROGRESS_KEY = 'last-chamber-progress';
export const NAME_MAX = 14;
export const DEFAULT_NAME = 'Player';

export function defaultEquipped(): Equipped {
  const e = {} as Equipped;
  for (const c of CATEGORIES) e[c.id] = freeItemOf(c.id).id;
  return e;
}

export function emptyProgress(now = Date.now()): Progress {
  return {
    v: 1,
    name: DEFAULT_NAME,
    shells: 0,
    totalEarned: 0,
    owned: CATALOG.filter((i) => i.free).map((i) => i.id),
    equipped: defaultEquipped(),
    createdAt: now,
  };
}

/** Trims, strips control characters and limits length. Falls back to the default name. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s || DEFAULT_NAME;
}

export function addShells(p: Progress, amount: number): Progress {
  const a = Math.max(0, Math.floor(amount));
  return { ...p, shells: p.shells + a, totalEarned: p.totalEarned + a };
}

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

/** Validates untrusted data (corrupt, hand-edited, older version). Never throws. */
export function sanitizeProgress(raw: unknown): Progress {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return out;
  out.name = sanitizeName(r.name);
  out.shells = num(r.shells);
  out.totalEarned = Math.max(num(r.totalEarned), 0);
  out.createdAt = num(r.createdAt) || out.createdAt;
  const owned = new Set(out.owned);
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && itemById(id)) owned.add(id);
  out.owned = [...owned];
  const eq = r.equipped && typeof r.equipped === 'object' ? (r.equipped as Record<string, unknown>) : {};
  for (const c of CATEGORIES) {
    const id = eq[c.id];
    const item = typeof id === 'string' ? itemById(id) : undefined;
    if (item && item.category === c.id && owned.has(item.id)) out.equipped[c.id] = item.id;
  }
  return out;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? sanitizeProgress(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress just lasts for this session */
  }
}
