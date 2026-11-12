/** Pure helpers that move progress between the local save and the cloud profile. No DOM, no network. */
import { sanitizeProgress } from './progress';
import type { Progress } from './progress';

/** Server-side limits for the one-time guest import (the SQL uses the same numbers). */
export const IMPORT_SHELLS_CAP = 3000;
export const IMPORT_ITEM_VALUE_CAP = 15000;

export interface CloudProfile {
  displayName: string;
  shells: number;
  totalEarned: number;
  owned: string[];
  equipped: Record<string, string>;
  level: number;
  xp: number;
  imported: boolean;
  createdAt: number; // epoch ms
}

/** What we send to import_local_progress. The server validates and clamps it again. */
export function buildImportPayload(p: Progress): { name: string; shells: number; total_earned: number; owned: string[]; equipped: Record<string, string> } {
  return { name: p.name, shells: p.shells, total_earned: p.totalEarned, owned: [...p.owned], equipped: { ...p.equipped } };
}

const int = (x: unknown, d = 0): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : d);

/** Reads the jsonb the server returns (snake_case). Returns null for anything unusable. */
export function parseCloudProfile(raw: unknown): CloudProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.display_name !== 'string') return null;
  const created = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
  return {
    displayName: r.display_name,
    shells: int(r.shells),
    totalEarned: int(r.total_earned),
    owned: Array.isArray(r.owned) ? r.owned.filter((x): x is string => typeof x === 'string') : [],
    equipped: r.equipped && typeof r.equipped === 'object' ? (r.equipped as Record<string, string>) : {},
    level: Math.max(1, int(r.level, 1)),
    xp: int(r.xp),
    imported: r.imported === true,
    createdAt: Number.isFinite(created) ? created : Date.now(),
  };
}

/**
 * Combine local and cloud after sign-in.
 * - `sameAccount`: this device already belongs to this account, so the local save is a newer cache of it
 *   (until the cloud economy phase syncs matches) and is kept as is.
 * - otherwise (new device or a different account) the cloud profile replaces local progress.
 */
export function applyCloudProfile(local: Progress, cloud: CloudProfile, sameAccount: boolean): Progress {
  if (sameAccount) return { ...local, name: cloud.displayName };
  return sanitizeProgress({
    v: 1,
    name: cloud.displayName,
    shells: cloud.shells,
    totalEarned: Math.max(cloud.totalEarned, cloud.shells),
    owned: cloud.owned,
    equipped: cloud.equipped,
    createdAt: cloud.createdAt,
  });
}
