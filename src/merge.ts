/** Pure helpers that move progress between the local save and the cloud profile. No DOM, no network. */
import type { LevelUp } from './levels';
import { sanitizeProgress } from './progress';
import type { Progress } from './progress';
import { sanitizeStats } from './stats';
import type { StatsData } from './stats';

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
  reconciled: boolean;
  createdAt: number; // epoch ms
  stats: StatsData; // server totals plus the last 10 matches
}

/** One finished match as the server wants it. `id` makes retries harmless. */
export interface MatchSummary {
  id: string;
  mode: string;
  bots: number;
  difficulty: string;
  result: 'win' | 'loss' | 'draw';
  rounds: number;
  survived: number;
  kills: number;
  at: number; // epoch ms
  v: string; // client version
}

export interface SubmitData {
  profile: CloudProfile;
  shells: number;
  bonus: number;
  xp: number;
  levelUps: LevelUp[];
  duplicate: boolean;
  throttled: boolean;
}

/** What we send to import_local_progress. The server validates and clamps it again. */
export function buildImportPayload(p: Progress, stats: StatsData): Record<string, unknown> {
  return {
    name: p.name,
    shells: p.shells,
    total_earned: p.totalEarned,
    owned: [...p.owned],
    equipped: { ...p.equipped },
    level: p.level,
    xp: p.xp,
    stats,
  };
}

const int = (x: unknown, d = 0): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : d);

/** Reads the jsonb the server returns (snake_case). Returns null for anything unusable. */
export function parseCloudProfile(raw: unknown): CloudProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.display_name !== 'string') return null;
  const created = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
  const s = r.stats && typeof r.stats === 'object' ? (r.stats as Record<string, unknown>) : {};
  const stats = sanitizeStats({
    v: 1,
    played: s.played,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    kills: s.kills,
    streak: s.streak,
    bestStreak: s.best_streak,
    bestSurvived: s.best_survived,
    modes: s.modes,
    recent: r.recent,
  });
  return {
    displayName: r.display_name,
    shells: int(r.shells),
    totalEarned: int(r.total_earned),
    owned: Array.isArray(r.owned) ? r.owned.filter((x): x is string => typeof x === 'string') : [],
    equipped: r.equipped && typeof r.equipped === 'object' ? (r.equipped as Record<string, string>) : {},
    level: Math.max(1, int(r.level, 1)),
    xp: int(r.xp),
    imported: r.imported === true,
    reconciled: r.reconciled === true,
    createdAt: Number.isFinite(created) ? created : Date.now(),
    stats,
  };
}

/** Reads the document returned by submit_match. */
export function parseSubmit(raw: unknown): SubmitData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const profile = parseCloudProfile(r.profile);
  const res = r.result && typeof r.result === 'object' ? (r.result as Record<string, unknown>) : null;
  if (!profile || !res) return null;
  const ups: LevelUp[] = [];
  if (Array.isArray(res.level_ups)) {
    for (const u of res.level_ups) {
      if (u && typeof u === 'object') ups.push({ level: int((u as Record<string, unknown>).level, 1), bonus: int((u as Record<string, unknown>).bonus) });
    }
  }
  return { profile, shells: int(res.shells), bonus: int(res.bonus), xp: int(res.xp), levelUps: ups, duplicate: res.duplicate === true, throttled: res.throttled === true };
}

/** The server is the source of truth for a signed-in account: its profile replaces local progress. */
export function applyCloudProfile(cloud: CloudProfile): Progress {
  return sanitizeProgress({
    v: 1,
    name: cloud.displayName,
    shells: cloud.shells,
    totalEarned: Math.max(cloud.totalEarned, cloud.shells),
    owned: cloud.owned,
    equipped: cloud.equipped,
    createdAt: cloud.createdAt,
    level: cloud.level,
    xp: cloud.xp,
  });
}

/** Cloud stats (totals plus last 10 matches) replace the local stats. */
export const applyCloudStats = (cloud: CloudProfile): StatsData => cloud.stats;
