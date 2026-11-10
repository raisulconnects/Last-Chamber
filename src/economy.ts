/** Shell payouts for finished matches. Pure and deterministic. */

export const PAYOUT = {
  play: 10,
  win: 20,
  draw: 8,
  kill: 8,
  round: 2,
  earlyEnd: 5, // a match that ends in round 1 pays a flat amount
  cap: 150,
} as const;

const MODE_MULT: Record<string, number> = {
  Classic: 1,
  'Quick Draw': 0.8,
  'Crowded Arena': 1.2,
  'Tight Circle': 1.1,
  Marathon: 1.5,
  Custom: 0.5,
};
const DIFFICULTY_MULT: Record<string, number> = { easy: 0.8, normal: 1, hard: 1.3 };

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

export const modeMultiplier = (mode: string): number => MODE_MULT[mode] ?? MODE_MULT.Custom;
export const botMultiplier = (bots: number): number => Math.min(1.5, Math.max(0.8, 1 + 0.1 * (bots - 2)));

export function calcPayout(m: PayoutInput): Payout {
  if (m.rounds <= 1) {
    return { total: PAYOUT.earlyEnd, parts: { play: PAYOUT.earlyEnd, result: 0, kills: 0, rounds: 0 }, multiplier: 1 };
  }
  const multiplier = modeMultiplier(m.mode) * (DIFFICULTY_MULT[m.difficulty] ?? 1) * botMultiplier(m.bots);
  const raw = {
    play: PAYOUT.play,
    result: m.result === 'win' ? PAYOUT.win : m.result === 'draw' ? PAYOUT.draw : 0,
    kills: Math.max(0, m.kills) * PAYOUT.kill,
    rounds: Math.max(0, m.survived) * PAYOUT.round,
  };
  const sum = raw.play + raw.result + raw.kills + raw.rounds;
  const total = Math.min(PAYOUT.cap, Math.max(1, Math.round(sum * multiplier)));
  const scale = sum > 0 ? total / sum : 0;
  const parts = {
    play: Math.round(raw.play * scale),
    result: Math.round(raw.result * scale),
    kills: Math.round(raw.kills * scale),
    rounds: Math.round(raw.rounds * scale),
  };
  return { total, parts, multiplier };
}
