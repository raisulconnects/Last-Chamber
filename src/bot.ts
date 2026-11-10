import { CONFIG } from './config';
import { dist, len } from './geometry';
import { DIFFICULTY } from './settings';
import type { BotProfile } from './settings';
import type { Rng, RevealInfo } from './match';
import type { Command, Vec2 } from './types';

/** What a bot is allowed to know about the world while deciding: its own body and public round info. */
export interface BotSelfView {
  pos: Vec2;
  radius: number;
}
export interface BotRoundView {
  safeRadius: number;
  /** 0 at start of the hidden phase, 1 at the deadline. */
  progress: number;
}

function gaussian(rng: Rng): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Bot decision logic, separate from game rules. It outputs normal Commands and never reads live
 * opponent state: it only remembers positions revealed at the end of earlier rounds.
 */
export class BotBrain {
  private memory = new Map<number, Vec2>(); // revealed positions of other players
  private timer = Infinity; // forces a decision on the first tick
  private target: Vec2 | null = null;
  private aim: Vec2 | null = null;

  constructor(
    readonly id: number,
    private rng: Rng = Math.random,
    private profile: BotProfile = DIFFICULTY.normal,
  ) {}

  /** Call when a reveal happens. Only revealed (public) information enters memory. */
  observe(info: RevealInfo): void {
    const dead = new Set(info.result.deaths);
    this.memory.clear();
    for (const p of info.snapshot) {
      if (p.id === this.id || dead.has(p.id)) continue;
      this.memory.set(p.id, { x: p.pos.x, y: p.pos.y });
    }
    this.timer = Infinity; // re-decide at the start of the next round
  }

  reset(): void {
    this.memory.clear();
    this.timer = Infinity;
    this.target = null;
    this.aim = null;
  }

  think(self: BotSelfView, round: BotRoundView, dt: number): Command {
    this.timer += dt;
    if (this.timer >= this.profile.decisionInterval) {
      this.timer = 0;
      this.decide(self, round);
    }

    let move: Vec2 = { x: 0, y: 0 };
    if (this.target) {
      const dx = this.target.x - self.pos.x;
      const dy = this.target.y - self.pos.y;
      const l = Math.hypot(dx, dy);
      // Stop when close enough to avoid jitter; slow down on the last step.
      if (l > 2) move = { x: dx / l, y: dy / l };
    }
    return { move, aim: this.aim };
  }

  private randomPointIn(radius: number): Vec2 {
    const r = radius * Math.sqrt(this.rng());
    const a = this.rng() * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  private decide(self: BotSelfView, round: BotRoundView): void {
    const reach = Math.max(0, round.safeRadius - self.radius - CONFIG.bot.safeMargin);
    const outside = len(self.pos) > reach;
    const late = round.progress >= CONFIG.bot.returnToSafeAfter;

    if (outside || late) {
      // Prioritize ending inside the safe circle; keep the current spot if it is already safe.
      this.target = outside ? this.randomPointIn(reach * 0.8) : this.target ?? this.randomPointIn(reach);
      if (!outside && this.target && len(this.target) > reach) this.target = this.randomPointIn(reach);
    } else {
      this.target = this.randomPointIn(CONFIG.arenaRadius - self.radius);
    }

    // Aim: remembered location + uncertainty, otherwise exploratory random aim.
    const remembered = [...this.memory.values()];
    let angle: number;
    if (remembered.length > 0 && this.rng() < this.profile.memoryAimChance) {
      const t = remembered[Math.floor(this.rng() * remembered.length)];
      angle = Math.atan2(t.y - self.pos.y, t.x - self.pos.x);
      if (dist(t, self.pos) < 1e-6) angle = this.rng() * Math.PI * 2;
      angle += gaussian(this.rng) * this.profile.aimNoise;
    } else {
      angle = this.rng() * Math.PI * 2;
    }
    this.aim = { x: Math.cos(angle), y: Math.sin(angle) };
  }
}
