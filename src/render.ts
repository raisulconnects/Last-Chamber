import { ArenaRenderer } from './arena';
import { drawCharacter, drawHumanMarker, drawNameTag, drawShadow } from './characters';
import { CONFIG } from './config';
import { buildRevealEffects, drawEliminations, drawRevealEffects, recoilAt, revealElapsed } from './effects';
import type { RevealEffects } from './effects';
import type { Match } from './match';
import { THEME } from './theme';
import type { Player, Vec2 } from './types';
import type { View } from './view';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const C = THEME.colors;

export class Renderer {
  /** Clickable button rectangle (screen px) for the current overlay, if any. */
  button: Rect | null = null;
  readonly arena = new ArenaRenderer();
  private ctx: CanvasRenderingContext2D;

  // Cosmetic state only; never read by the simulation.
  private fx: RevealEffects | null = null;
  private fxResolution = -1;
  private lastHumanPos: Vec2 | null = null;
  private walkPhase = 0;
  private moving = 0;
  private lastNow = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private view: View,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Match canvas backing store to the CSS size and device pixel ratio. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.view.resize(w, h);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** UI scale factor so text/panels stay readable across desktop window sizes. */
  private get u(): number {
    return Math.max(0.75, Math.min(1.5, Math.min(this.view.cssWidth, this.view.cssHeight) / 720));
  }

  draw(match: Match): void {
    const { ctx, view } = this;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;

    this.updateEffects(match);
    this.arena.update(match.phase === 'READY' ? CONFIG.arenaRadius : match.safeRadius, now);

    // Background
    ctx.fillStyle = C.background;
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
    this.button = null;

    this.arena.draw(ctx, view, now, match.phase === 'HIDDEN' && match.timeLeft > CONFIG.hiddenDuration - 1.2);

    if (match.phase === 'HIDDEN') {
      // Privacy rule: only the human is drawn (with their own shadow); nothing else.
      const human = match.players.find((p) => p.isHuman);
      if (human && human.alive) this.drawHuman(human, now, dt);
      else this.lastHumanPos = null;
    } else if (match.phase === 'REVEAL' || match.phase === 'GAME_OVER') {
      this.lastHumanPos = null;
      this.drawReveal(match, now);
    } else {
      this.lastHumanPos = null;
    }

    this.drawPhaseFrame(match, now);
    this.drawHud(match, now);
    if (match.phase === 'READY') this.drawReady();
    if (match.phase === 'GAME_OVER') this.drawGameOver(match);
  }

  /** Build reveal effects once per resolution; discard them whenever a reveal is not on screen. */
  private updateEffects(match: Match): void {
    const showing = (match.phase === 'REVEAL' || match.phase === 'GAME_OVER') && match.result !== null;
    if (!showing) {
      this.fx = null;
      this.fxResolution = -1;
      return;
    }
    if (this.fxResolution !== match.resolutionCount) {
      this.fx = buildRevealEffects(match.result!, match.snapshot);
      this.fxResolution = match.resolutionCount;
    }
  }

  private drawHuman(human: Player, now: number, dt: number): void {
    const { ctx, view } = this;
    // Derive the walk animation from actual displacement (render-side only).
    if (this.lastHumanPos && dt > 0) {
      const d = Math.hypot(human.pos.x - this.lastHumanPos.x, human.pos.y - this.lastHumanPos.y);
      this.walkPhase += d * THEME.anim.walkCycleSpeed * 6;
      const target = d / dt > 5 ? 1 : 0;
      this.moving += (target - this.moving) * Math.min(1, dt * 12);
    }
    this.lastHumanPos = { x: human.pos.x, y: human.pos.y };

    drawShadow(ctx, view, human.pos);
    drawCharacter(ctx, view, human.pos, human.aim, {
      color: human.color,
      name: human.name,
      isHuman: true,
      walkPhase: this.walkPhase,
      moving: this.moving,
      time: now,
    });
    drawHumanMarker(ctx, view, human.pos, now);
    drawNameTag(ctx, view, human.pos, 'YOU', '#ffffff');
  }

  private drawReveal(match: Match, now: number): void {
    const { ctx, view } = this;
    const fx = this.fx;
    if (!fx) return;
    const t = revealElapsed(match.revealLeft);
    const byId = new Map<number, Player>(match.players.map((p) => [p.id, p]));
    const dead = new Set(fx.eliminations.map((e) => e.id));

    for (const sp of match.snapshot) drawShadow(ctx, view, sp.pos, dead.has(sp.id) ? 0.6 : 1);
    for (const sp of match.snapshot) {
      const p = byId.get(sp.id)!;
      drawCharacter(ctx, view, sp.pos, sp.aim, {
        color: p.color,
        name: p.name,
        isHuman: p.isHuman,
        dead: dead.has(sp.id) && t > 0.12, // goes grey just after the flash
        time: now,
        recoil: recoilAt(t),
      });
      if (p.isHuman) drawHumanMarker(ctx, view, sp.pos, now);
      drawNameTag(ctx, view, sp.pos, p.isHuman ? 'YOU' : p.name, p.isHuman ? '#ffffff' : p.color);
    }
    drawRevealEffects(ctx, view, fx, t, (id) => byId.get(id)?.color ?? '#fff');
    drawEliminations(ctx, view, fx, t);
  }

  /** Distinct hidden (cool) vs reveal (warm) framing, plus a quick flash when the reveal fires. */
  private drawPhaseFrame(match: Match, _now: number): void {
    const { ctx, view } = this;
    const w = view.cssWidth;
    const h = view.cssHeight;
    let color: string | null = null;
    let strength = 0;
    if (match.phase === 'HIDDEN') {
      color = '76, 201, 240';
      strength = match.timeLeft <= 3 ? 0.28 : 0.16;
      if (match.timeLeft <= 3) color = '242, 95, 92';
    } else if (match.phase === 'REVEAL' || match.phase === 'GAME_OVER') {
      color = '255, 179, 71';
      strength = 0.22;
    }
    if (color) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(${color}, 0)`);
      g.addColorStop(1, `rgba(${color}, ${strength})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (match.phase === 'REVEAL') {
      const t = revealElapsed(match.revealLeft);
      const a = Math.max(0, 1 - t / 0.16) * 0.35;
      if (a > 0) {
        ctx.fillStyle = `rgba(255, 243, 176, ${a})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  private font(weight: number, px: number): string {
    return `${weight} ${Math.round(px * this.u)}px system-ui, "Segoe UI", sans-serif`;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawHud(match: Match, now: number): void {
    if (match.phase === 'READY') return;
    const { ctx, view } = this;
    const u = this.u;
    const pad = 16 * u;

    // Left info card: round + player status.
    const cardW = 190 * u;
    const cardH = 92 * u;
    ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
    this.roundRect(pad, pad, cardW, cardH, 12 * u);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = C.textDim;
    ctx.font = this.font(700, 11);
    ctx.fillText('ROUND', pad + 14 * u, pad + 22 * u);
    ctx.fillStyle = C.text;
    ctx.font = this.font(800, 26);
    ctx.fillText(`${match.round}`, pad + 14 * u, pad + 50 * u);
    const rw = ctx.measureText(`${match.round}`).width;
    ctx.fillStyle = C.textDim;
    ctx.font = this.font(600, 13);
    ctx.fillText(`/ ${CONFIG.maxRounds}`, pad + 20 * u + rw, pad + 50 * u);

    // Player status dots with alive count.
    const alive = match.alivePlayers.length;
    ctx.fillStyle = C.textDim;
    ctx.font = this.font(700, 11);
    ctx.fillText(`${alive} OF ${match.players.length} ALIVE`, pad + 14 * u, pad + 72 * u);
    let dx = pad + cardW - 18 * u;
    for (let i = match.players.length - 1; i >= 0; i--) {
      const p = match.players[i];
      ctx.beginPath();
      ctx.arc(dx, pad + 40 * u, 8 * u, 0, Math.PI * 2);
      ctx.fillStyle = p.alive ? p.color : '#3a3f47';
      ctx.fill();
      ctx.lineWidth = p.isHuman ? 2.5 * u : 1.5 * u;
      ctx.strokeStyle = p.isHuman ? '#fff' : 'rgba(0,0,0,0.5)';
      ctx.stroke();
      dx -= 22 * u;
    }

    // Timer ring (top center)
    const cx = view.cssWidth / 2;
    const r = 34 * u;
    const cy = pad + r + 4 * u;
    const hidden = match.phase === 'HIDDEN';
    const frac = hidden ? match.timeLeft / CONFIG.hiddenDuration : match.phase === 'REVEAL' ? match.revealLeft / CONFIG.revealDuration : 0;
    const urgent = hidden && match.timeLeft <= 3;
    const accent = hidden ? (urgent ? C.danger : C.hiddenAccent) : C.revealAccent;

    ctx.fillStyle = 'rgba(8, 10, 16, 0.78)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, frac));
    ctx.stroke();
    ctx.textAlign = 'center';
    if (hidden) {
      const pulse = urgent ? 1 + 0.08 * Math.sin(now * 14) : 1;
      ctx.fillStyle = urgent ? C.danger : C.text;
      ctx.font = this.font(800, 26 * pulse);
      ctx.fillText(match.timeLeft.toFixed(1), cx, cy + 9 * u);
    } else {
      const over = match.phase === 'GAME_OVER';
      ctx.fillStyle = over ? C.text : C.revealAccent;
      ctx.font = this.font(900, over ? 15 : 17);
      ctx.fillText(over ? 'OVER' : 'FIRE!', cx, cy + 6 * u);
    }

    // Phase label under the ring
    const label = hidden ? 'HIDDEN  -  MOVE & AIM' : match.phase === 'REVEAL' ? 'REVEAL' : 'FINAL POSITIONS';
    ctx.font = this.font(800, 12);
    const lw = ctx.measureText(label).width + 26 * u;
    const ly = cy + r + 18 * u;
    ctx.fillStyle = hidden ? 'rgba(76,201,240,0.18)' : 'rgba(255,179,71,0.2)';
    this.roundRect(cx - lw / 2, ly - 12 * u, lw, 24 * u, 12 * u);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillText(label, cx, ly + 4.5 * u);

    // Bottom message
    const human = match.players.find((p) => p.isHuman);
    ctx.textAlign = 'center';
    if (human && !human.alive && match.phase !== 'GAME_OVER') {
      ctx.fillStyle = C.danger;
      ctx.font = this.font(800, 17);
      ctx.fillText('You are eliminated - the bots play on   (R to restart)', cx, view.cssHeight - 22 * u);
    } else if (hidden) {
      ctx.fillStyle = C.textDim;
      ctx.font = this.font(600, 14);
      ctx.fillText('Finish inside the green circle. Your shot fires automatically at 0.', cx, view.cssHeight - 22 * u);
    }
  }

  private panel(
    lines: { text: string; font: string; color: string; gap: number }[],
    buttonLabel: string,
    accent: string,
    beside = false,
  ): void {
    const { ctx, view } = this;
    const u = this.u;
    let cx = view.cssWidth / 2;
    const cy = view.cssHeight / 2;
    const totalH = lines.reduce((a, l) => a + l.gap * u, 0) + 80 * u;
    let w = Math.min(600 * u, view.cssWidth - 32);
    if (beside) {
      // Keep the final positions visible: use the free space to the right of the arena.
      const free = view.cssWidth / 2 - CONFIG.arenaRadius * view.scale;
      w = free - 28;
      cx = view.cssWidth - free / 2;
    }
    const top = cy - totalH / 2;

    ctx.fillStyle = C.panel;
    this.roundRect(cx - w / 2, top - 24 * u, w, totalH + 48 * u, 18 * u);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    let y = top;
    ctx.textAlign = 'center';
    for (const l of lines) {
      y += l.gap * u;
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, cx, y);
    }

    const bw = 190 * u;
    const bh = 48 * u;
    const by = y + 26 * u;
    this.button = { x: cx - bw / 2, y: by, w: bw, h: bh };
    ctx.fillStyle = accent;
    this.roundRect(this.button.x, this.button.y, bw, bh, 12 * u);
    ctx.fill();
    ctx.fillStyle = '#0b1117';
    ctx.font = this.font(800, 18);
    ctx.fillText(buttonLabel, cx, by + 31 * u);
  }

  private drawReady(): void {
    const t = this.font(600, 15);
    this.panel(
      [
        { text: 'HIDDEN SHOOTOUT', font: this.font(900, 38), color: C.text, gap: 44 },
        { text: 'Move and aim in secret - opponents are invisible.', font: t, color: '#b7c0cc', gap: 36 },
        { text: 'At 0, everyone is revealed and fires one instant shot.', font: t, color: '#b7c0cc', gap: 24 },
        { text: 'WASD / Arrows: move      Mouse: aim      M: mute', font: this.font(700, 15), color: C.text, gap: 36 },
        { text: 'Finish every round inside the green circle. It shrinks.', font: t, color: C.win, gap: 26 },
      ],
      'START (Enter)',
      C.hiddenAccent,
    );
  }

  private drawGameOver(match: Match): void {
    const o = match.outcome;
    let title = 'DRAW';
    let color: string = C.draw;
    let sub = 'Nobody is left standing.';
    if (o?.kind === 'win') {
      const w = match.players.find((p) => p.id === o.winnerId)!;
      if (w.isHuman) {
        title = 'YOU WIN!';
        color = C.win;
        sub = 'Last one standing.';
      } else {
        title = 'YOU LOSE';
        color = C.danger;
        sub = `${w.name} wins the shootout.`;
      }
    } else if (match.alivePlayers.length > 1) {
      sub = 'Round limit reached.';
    }
    // Enough room beside the arena? Then keep the final positions visible.
    const beside = this.view.cssWidth / 2 - CONFIG.arenaRadius * this.view.scale >= 230 * this.u;
    this.panel(
      [
        { text: title, font: this.font(900, 44), color, gap: 48 },
        { text: sub, font: this.font(600, 16), color: '#b7c0cc', gap: 32 },
      ],
      'RESTART (R)',
      color,
      beside,
    );
  }
}
