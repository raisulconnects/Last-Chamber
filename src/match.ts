import { CONFIG, PLAYER_STYLES } from './config';
import { CLASSIC } from './settings';
import type { MatchSettings } from './settings';
import { applyCommand } from './movement';
import { dist } from './geometry';
import { resolveRound } from './resolve';
import type { Command, MatchOutcome, Phase, Player, ResolutionResult, SnapshotPlayer } from './types';

export type Rng = () => number;

export interface RevealInfo {
  snapshot: readonly SnapshotPlayer[];
  result: ResolutionResult;
  round: number;
}

/**
 * Authoritative local match state. No DOM or rendering knowledge.
 * Inputs are per-player Commands (human input / bot decisions), so a server could drive it later.
 */
export class Match {
  phase: Phase = 'READY';
  round = 0;
  safeRadius: number = CONFIG.arenaRadius;
  /** Options for the current/last match; Classic unless a mode was chosen. */
  settings: MatchSettings = CLASSIC;
  players: Player[] = [];
  timeLeft = 0; // seconds left in HIDDEN
  revealLeft = 0; // seconds left in REVEAL
  snapshot: readonly SnapshotPlayer[] = [];
  result: ResolutionResult | null = null;
  outcome: MatchOutcome | null = null;
  /** Number of times a round has been resolved (guards against double resolution). */
  resolutionCount = 0;

  /** Called once when a round resolves (bots use this as "revealed positions"). */
  onReveal: ((info: RevealInfo) => void) | null = null;
  /** Called when a new match starts, so listeners can clear memory. */
  onStart: (() => void) | null = null;

  constructor(private rng: Rng = Math.random) {}

  get humanId(): number {
    return this.players.find((p) => p.isHuman)?.id ?? -1;
  }

  get alivePlayers(): Player[] {
    return this.players.filter((p) => p.alive);
  }

  /** READY/GAME_OVER -> HIDDEN with a completely fresh match state. */
  start(settings: MatchSettings = this.settings): void {
    this.settings = settings;
    this.round = 1;
    this.safeRadius = CONFIG.arenaRadius;
    this.snapshot = [];
    this.result = null;
    this.outcome = null;
    this.resolutionCount = 0;
    this.revealLeft = 0;
    this.players = this.spawnPlayers();
    this.onStart?.();
    this.beginHidden();
  }

  /** Back to the READY screen with all match state cleared. */
  reset(): void {
    this.phase = 'READY';
    this.round = 0;
    this.safeRadius = CONFIG.arenaRadius;
    this.players = [];
    this.snapshot = [];
    this.result = null;
    this.outcome = null;
    this.timeLeft = 0;
    this.revealLeft = 0;
    this.resolutionCount = 0;
  }

  /** Advance the simulation by dt seconds (fixed step). `commands` is keyed by player id. */
  update(dt: number, commands: ReadonlyMap<number, Command>): void {
    if (this.phase === 'HIDDEN') {
      // Never simulate past the deadline: clip the final step.
      const step = Math.min(dt, this.timeLeft);
      for (const p of this.players) {
        const cmd = commands.get(p.id);
        if (p.alive && cmd) applyCommand(p, cmd, step);
      }
      this.timeLeft -= step;
      if (this.timeLeft <= 1e-9) {
        this.timeLeft = 0;
        this.resolve(); // exactly once: phase leaves HIDDEN immediately
      }
    } else if (this.phase === 'REVEAL') {
      this.revealLeft -= dt;
      if (this.revealLeft <= 1e-9) this.finishReveal();
    }
    // READY, RESOLVE (transient) and GAME_OVER do nothing.
  }

  private beginHidden(): void {
    this.phase = 'HIDDEN';
    this.timeLeft = this.settings.hiddenDuration;
    this.result = null;
    this.snapshot = [];
  }

  private resolve(): void {
    if (this.phase !== 'HIDDEN') return;
    this.phase = 'RESOLVE';
    this.resolutionCount++;

    // Immutable snapshot of every living player.
    const snap: SnapshotPlayer[] = this.alivePlayers.map((p) =>
      Object.freeze({
        id: p.id,
        pos: Object.freeze({ x: p.pos.x, y: p.pos.y }),
        aim: Object.freeze({ x: p.aim.x, y: p.aim.y }),
        radius: p.radius,
      }),
    );
    this.snapshot = Object.freeze(snap);

    const result = resolveRound(this.snapshot, this.safeRadius);
    this.result = result;

    // Apply all eliminations together, after every shot is computed.
    const dead = new Set(result.deaths);
    for (const p of this.players) if (dead.has(p.id)) p.alive = false;

    this.phase = 'REVEAL';
    this.revealLeft = this.settings.revealDuration;
    this.onReveal?.({ snapshot: this.snapshot, result, round: this.round });
  }

  private finishReveal(): void {
    const alive = this.alivePlayers;
    if (alive.length === 0) {
      this.endGame({ kind: 'draw' });
    } else if (alive.length === 1) {
      this.endGame({ kind: 'win', winnerId: alive[0].id });
    } else if (this.round >= this.settings.maxRounds) {
      this.endGame({ kind: 'draw' });
    } else {
      this.safeRadius = Math.max(this.settings.minSafeRadius, this.safeRadius * this.settings.safeRadiusMultiplier);
      this.round++;
      this.beginHidden(); // survivors keep positions and aim
    }
  }

  private endGame(outcome: MatchOutcome): void {
    this.outcome = outcome;
    this.phase = 'GAME_OVER';
  }

  private spawnPlayers(): Player[] {
    const total = CONFIG.humanCount + this.settings.botCount;
    const maxR = CONFIG.arenaRadius - CONFIG.playerRadius - CONFIG.spawnMargin;
    const players: Player[] = [];
    for (let i = 0; i < total; i++) {
      let pos = { x: 0, y: 0 };
      for (let attempt = 0; attempt < 1000; attempt++) {
        const r = maxR * Math.sqrt(this.rng());
        const a = this.rng() * Math.PI * 2;
        pos = { x: Math.cos(a) * r, y: Math.sin(a) * r };
        if (players.every((q) => dist(q.pos, pos) >= CONFIG.spawnMinSeparation)) break;
      }
      const aimAngle = this.rng() * Math.PI * 2;
      const style = PLAYER_STYLES[i % PLAYER_STYLES.length];
      players.push({
        id: i,
        name: style.name,
        color: style.color,
        isHuman: i < CONFIG.humanCount,
        pos,
        aim: { x: Math.cos(aimAngle), y: Math.sin(aimAngle) },
        radius: CONFIG.playerRadius,
        alive: true,
      });
    }
    return players;
  }
}
