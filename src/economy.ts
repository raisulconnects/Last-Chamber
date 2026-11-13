/** Shell payouts and XP for finished matches. Pure and deterministic.
 *  All multipliers are integers in per-mille (1000 = x1.0) so this and the SQL in supabase/migrations
 *  agree to the last Shell: no floating point is involved in the rounding. */

export const PAYOUT = {
  play: 10,
  win: 20,
  draw: 8,
  kill: 8,
  round: 2,
  earlyEnd: 5, // a match that ends in round 1 pays a flat amount
  cap: 150,
} as const;

/** Server-side abuse limits (the SQL uses the same numbers). */
export const LIMITS = {
  matchesPerHour: 60,
  shellsPerDay: 3000,
} as const;

/** Per-mille multipliers. Unknown mode names count as Custom. */
export const MODE_PERMILLE: Record<string, number> = {
  Classic: 1000,
  'Quick Draw': 800,
  'Crowded Arena': 1200,
  'Tight Circle': 1100,
  Marathon: 1500,
  Custom: 500,
};
export const DIFFICULTY_PERMILLE: Record<string, number> = { easy: 800, normal: 1000, hard: 1300 };

export interface PayoutInput {
  mode: string;
  bots: number;
  difficulty: string;
  result: 'win' | 'loss' | 'draw';
  rounds: number;
  survived: number;
  kills: number;
}

export interface Payout {
  total: number;
  parts: { play: number; result: number; kills: number; rounds: number };
  multiplier: number;
}

export const modePermille = (mode: string): number => MODE_PERMILLE[mode] ?? MODE_PERMILLE.Custom;
export const difficultyPermille = (d: string): number => DIFFICULTY_PERMILLE[d] ?? 1000;
export const botPermille = (bots: number): number => Math.min(1500, Math.max(800, 1000 + 100 * (bots - 2)));

/** The match's base value before multipliers. Also the XP gained (a round-1 match gives the flat early amount). */
export function calcXp(m: PayoutInput): number {
  if (m.rounds <= 1) return PAYOUT.earlyEnd;
  const result = m.result === 'win' ? PAYOUT.win : m.result === 'draw' ? PAYOUT.draw : 0;
  return PAYOUT.play + result + Math.max(0, m.kills) * PAYOUT.kill + Math.max(0, m.survived) * PAYOUT.round;
}

export function calcPayout(m: PayoutInput): Payout {
  if (m.rounds <= 1) {
    return { total: PAYOUT.earlyEnd, parts: { play: PAYOUT.earlyEnd, result: 0, kills: 0, rounds: 0 }, multiplier: 1 };
  }
  const mm = modePermille(m.mode) * difficultyPermille(m.difficulty) * botPermille(m.bots); // x1e9
  const raw = {
    play: PAYOUT.play,
    result: m.result === 'win' ? PAYOUT.win : m.result === 'draw' ? PAYOUT.draw : 0,
    kills: Math.max(0, m.kills) * PAYOUT.kill,
    rounds: Math.max(0, m.survived) * PAYOUT.round,
  };
  const sum = raw.play + raw.result + raw.kills + raw.rounds;
  const rounded = Math.floor((sum * mm + 500_000_000) / 1_000_000_000); // round half up, integers only
  const total = Math.min(PAYOUT.cap, Math.max(1, rounded));
  const scale = sum > 0 ? total / sum : 0;
  const parts = {
    play: Math.round(raw.play * scale),
    result: Math.round(raw.result * scale),
    kills: Math.round(raw.kills * scale),
    rounds: Math.round(raw.rounds * scale),
  };
  return { total, parts, multiplier: mm / 1_000_000_000 };
}
