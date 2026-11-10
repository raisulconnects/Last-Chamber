import type { Match } from './match';

export type GameEvent =
  | { type: 'start' }
  | { type: 'countdown'; n: number }
  | { type: 'volley'; shots: number }
  | { type: 'elimination'; count: number; humanEliminated: boolean }
  | { type: 'shrink'; round: number }
  | { type: 'gameOver'; result: 'win' | 'loss' | 'draw' };

/**
 * Converts match state changes into discrete events, each emitted exactly once.
 * It only reads public match state and is keyed on phase/round/second changes, never render frames.
 */
export class GameEventDetector {
  private lastRound = 0;
  private lastResolutionCount = 0;
  private lastCountdown = Infinity;
  private lastPhase: string = 'READY';

  /** Call right after match.start(); clears bookkeeping and returns the start event. */
  matchStarted(): GameEvent[] {
    this.lastRound = 1;
    this.lastResolutionCount = 0;
    this.lastCountdown = Infinity;
    this.lastPhase = 'HIDDEN';
    return [{ type: 'start' }];
  }

  reset(): void {
    this.lastRound = 0;
    this.lastResolutionCount = 0;
    this.lastCountdown = Infinity;
    this.lastPhase = 'READY';
  }

  update(match: Match): GameEvent[] {
    const events: GameEvent[] = [];

    if (match.phase === 'HIDDEN') {
      if (match.round > this.lastRound && this.lastRound > 0) {
        events.push({ type: 'shrink', round: match.round });
        this.lastRound = match.round;
        this.lastCountdown = Infinity;
      }
      const n = Math.ceil(match.timeLeft - 1e-9);
      if (n >= 1 && n <= 3 && n < this.lastCountdown) {
        events.push({ type: 'countdown', n });
        this.lastCountdown = n;
      }
    }

    if (match.resolutionCount > this.lastResolutionCount) {
      this.lastResolutionCount = match.resolutionCount;
      const shots = match.result?.shots.length ?? 0;
      const deaths = match.result?.deaths ?? [];
      events.push({ type: 'volley', shots });
      if (deaths.length > 0) {
        events.push({ type: 'elimination', count: deaths.length, humanEliminated: deaths.includes(match.humanId) });
      }
    }

    if (match.phase === 'GAME_OVER' && this.lastPhase !== 'GAME_OVER') {
      const o = match.outcome;
      const result = o?.kind === 'win' ? (o.winnerId === match.humanId ? 'win' : 'loss') : 'draw';
      events.push({ type: 'gameOver', result });
    }

    this.lastPhase = match.phase;
    return events;
  }
}
