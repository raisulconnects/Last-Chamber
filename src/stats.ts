/** Local player statistics. Pure logic plus try/catch localStorage; no DOM or match dependencies. */

export type MatchResult = 'win' | 'loss' | 'draw';

/** One finished match, from the human player's point of view. */
export interface MatchRecord {
  mode: string; // display name, e.g. "Classic", "Quick Draw", "Custom"
  bots: number;
  difficulty: string;
  result: MatchResult;
  rounds: number; // rounds played in the match
  survived: number; // rounds the human survived (all of them when still alive at the end)
  kills: number;
  at: number; // epoch ms
}

export interface ModeStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  bestSurvived: number;
}

export interface StatsData {
  v: 1;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  streak: number; // current win streak (a loss resets it, a draw leaves it unchanged)
  bestStreak: number;
  bestSurvived: number;
  modes: Record<string, ModeStats>;
  recent: MatchRecord[]; // newest first
}

export const STATS_KEY = 'last-chamber-stats';
export const RECENT_LIMIT = 10;

export function emptyStats(): StatsData {
  return { v: 1, played: 0, wins: 0, losses: 0, draws: 0, kills: 0, streak: 0, bestStreak: 0, bestSurvived: 0, modes: {}, recent: [] };
}

export interface RecordResult {
  stats: StatsData;
  newBestStreak: boolean;
  newBestSurvived: boolean;
}

/** Returns updated stats (the input is not mutated). */
export function recordMatch(prev: StatsData, m: MatchRecord): RecordResult {
  const s: StatsData = { ...prev, modes: { ...prev.modes }, recent: [m, ...prev.recent].slice(0, RECENT_LIMIT) };
  const mode: ModeStats = { ...(s.modes[m.mode] ?? { played: 0, wins: 0, losses: 0, draws: 0, bestSurvived: 0 }) };

  s.played++;
  mode.played++;
  s.kills += m.kills;
  if (m.result === 'win') {
    s.wins++;
    mode.wins++;
    s.streak++;
  } else if (m.result === 'loss') {
    s.losses++;
    mode.losses++;
    s.streak = 0;
  } else {
    s.draws++;
    mode.draws++;
  }

  const newBestStreak = s.streak > prev.bestStreak;
  if (newBestStreak) s.bestStreak = s.streak;
  const newBestSurvived = m.survived > prev.bestSurvived;
  if (newBestSurvived) s.bestSurvived = m.survived;
  mode.bestSurvived = Math.max(mode.bestSurvived, m.survived);
  s.modes[m.mode] = mode;
  return { stats: s, newBestStreak, newBestSurvived };
}

export function winRate(s: Pick<StatsData, 'played' | 'wins'>): number {
  return s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
}

// ---- persistence ----------------------------------------------------------------------------

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

/** Validates untrusted data (corrupt, hand-edited or from another version). Never throws. */
export function sanitizeStats(raw: unknown): StatsData {
  const out = emptyStats();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return out;
  out.played = num(r.played);
  out.wins = num(r.wins);
  out.losses = num(r.losses);
  out.draws = num(r.draws);
  out.kills = num(r.kills);
  out.streak = num(r.streak);
  out.bestStreak = Math.max(num(r.bestStreak), out.streak);
  out.bestSurvived = num(r.bestSurvived);
  if (r.modes && typeof r.modes === 'object') {
    for (const [k, v] of Object.entries(r.modes as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const m = v as Record<string, unknown>;
      out.modes[k.slice(0, 40)] = {
        played: num(m.played),
        wins: num(m.wins),
        losses: num(m.losses),
        draws: num(m.draws),
        bestSurvived: num(m.bestSurvived),
      };
    }
  }
  if (Array.isArray(r.recent)) {
    for (const item of r.recent.slice(0, RECENT_LIMIT)) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      if (m.result !== 'win' && m.result !== 'loss' && m.result !== 'draw') continue;
      out.recent.push({
        mode: typeof m.mode === 'string' ? m.mode.slice(0, 40) : 'Custom',
        bots: num(m.bots),
        difficulty: typeof m.difficulty === 'string' ? m.difficulty.slice(0, 12) : 'normal',
        result: m.result,
        rounds: num(m.rounds),
        survived: num(m.survived),
        kills: num(m.kills),
        at: num(m.at),
      });
    }
  }
  return out;
}

export function loadStats(): StatsData {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? sanitizeStats(JSON.parse(raw)) : emptyStats();
  } catch {
    return emptyStats();
  }
}

export function saveStats(s: StatsData): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: stats just last for this session */
  }
}
