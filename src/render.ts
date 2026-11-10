import { CONFIG } from './config';
import type { Match } from './match';
import type { Player, SnapshotPlayer, Vec2 } from './types';
import type { View } from './view';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BG = '#111418';
const ARENA_FILL = '#1b2028';
const ARENA_EDGE = '#6c7a8f';
const SAFE_EDGE = '#5dd39e';
const DANGER_FILL = 'rgba(242, 95, 92, 0.10)';

export class Renderer {
  /** Clickable button rectangle (screen px) for the current overlay, if any. */
  button: Rect | null = null;
  private ctx: CanvasRenderingContext2D;

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

  draw(match: Match): void {
    const { ctx, view } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
    this.button = null;

    this.drawArena(match);

    // Information rule: players are only drawn here, and opponents only during REVEAL/GAME_OVER.
    if (match.phase === 'HIDDEN') {
      const human = match.players.find((p) => p.isHuman);
      if (human && human.alive) this.drawPlayer(human, human.pos, human.aim, false);
    } else if (match.phase === 'REVEAL' || match.phase === 'GAME_OVER') {
      this.drawReveal(match);
    }

    this.drawHud(match);
    if (match.phase === 'READY') this.drawReady();
    if (match.phase === 'GAME_OVER') this.drawGameOver(match);
  }

  private drawArena(match: Match): void {
    const { ctx, view } = this;
    const c = view.toScreen({ x: 0, y: 0 });
    const R = CONFIG.arenaRadius * view.scale;

    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.fillStyle = ARENA_FILL;
    ctx.fill();

    const safe = match.phase === 'READY' ? CONFIG.arenaRadius : match.safeRadius;
    if (safe < CONFIG.arenaRadius - 0.5) {
      // Shade the unsafe outer ring.
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
      ctx.arc(c.x, c.y, safe * view.scale, 0, Math.PI * 2, true);
      ctx.fillStyle = DANGER_FILL;
      ctx.fill('evenodd');
    }

    ctx.lineWidth = 3;
    ctx.strokeStyle = ARENA_EDGE;
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = SAFE_EDGE;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, safe * view.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawPlayer(p: Pick<Player, 'color' | 'name' | 'radius'>, pos: Vec2, aim: Vec2, dead: boolean): void {
    const { ctx, view } = this;
    const s = view.toScreen(pos);
    const r = p.radius * view.scale;

    // Gun barrel
    ctx.lineWidth = Math.max(2, 4 * view.scale);
    ctx.strokeStyle = dead ? '#555' : '#d9dde3';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x + aim.x * r * 0.6, s.y + aim.y * r * 0.6);
    ctx.lineTo(s.x + aim.x * (r + 10 * view.scale), s.y + aim.y * (r + 10 * view.scale));
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = dead ? '#3a3f47' : p.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();

    if (dead) {
      ctx.strokeStyle = '#f25f5c';
      ctx.lineWidth = 3;
      const k = r * 0.7;
      ctx.beginPath();
      ctx.moveTo(s.x - k, s.y - k);
      ctx.lineTo(s.x + k, s.y + k);
      ctx.moveTo(s.x + k, s.y - k);
      ctx.lineTo(s.x - k, s.y + k);
      ctx.stroke();
    }

    ctx.fillStyle = '#e8ecf1';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, s.x, s.y - r - 8);
  }

  private drawReveal(match: Match): void {
    const { ctx, view } = this;
    const result = match.result;
    if (!result) return;
    const byId = new Map<number, Player>(match.players.map((p) => [p.id, p]));
    const dead = new Set(result.deaths);

    // Shot lines are purely decorative; they come from the stored resolution events.
    for (const shot of result.shots) {
      const shooter = byId.get(shot.shooterId)!;
      const a = view.toScreen(shot.origin);
      const b = view.toScreen(shot.end);
      ctx.strokeStyle = shooter.color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const sp of match.snapshot as readonly SnapshotPlayer[]) {
      const p = byId.get(sp.id)!;
      this.drawPlayer(p, sp.pos, sp.aim, dead.has(sp.id));
    }

    // Reason labels for boundary deaths
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f25f5c';
    for (const id of result.boundaryDeaths) {
      const sp = match.snapshot.find((s) => s.id === id)!;
      const s = view.toScreen(sp.pos);
      ctx.fillText('outside circle', s.x, s.y + (sp.radius + 18) * view.scale);
    }
  }

  private drawHud(match: Match): void {
    const { ctx, view } = this;
    if (match.phase === 'READY') return;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8ecf1';
    ctx.font = '600 18px system-ui, sans-serif';
    const x = 16;
    ctx.fillText(`Round ${match.round} / ${CONFIG.maxRounds}`, x, 28);
    ctx.fillText(`Alive: ${match.alivePlayers.length} / ${match.players.length}`, x, 52);

    ctx.textAlign = 'center';
    ctx.font = '700 34px system-ui, sans-serif';
    if (match.phase === 'HIDDEN') {
      ctx.fillStyle = match.timeLeft <= 2 ? '#f25f5c' : '#e8ecf1';
      ctx.fillText(match.timeLeft.toFixed(1), view.cssWidth / 2, 40);
    } else if (match.phase === 'REVEAL') {
      ctx.fillStyle = '#ffe066';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillText('FIRE!', view.cssWidth / 2, 36);
    }

    const human = match.players.find((p) => p.isHuman);
    if (human && !human.alive && match.phase !== 'GAME_OVER') {
      ctx.fillStyle = '#f25f5c';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillText('You are eliminated - the bots play on (press R to restart)', view.cssWidth / 2, view.cssHeight - 24);
    } else if (match.phase === 'HIDDEN') {
      ctx.fillStyle = '#8b97a8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('Finish inside the green circle. Your shot fires automatically at 0.', view.cssWidth / 2, view.cssHeight - 24);
    }
  }

  private panel(lines: { text: string; font: string; color: string; gap: number }[], buttonLabel: string): void {
    const { ctx, view } = this;
    const cx = view.cssWidth / 2;
    const cy = view.cssHeight / 2;
    const totalH = lines.reduce((a, l) => a + l.gap, 0) + 70;
    const w = Math.min(560, view.cssWidth - 32);
    const top = cy - totalH / 2;

    ctx.fillStyle = 'rgba(10, 12, 16, 0.88)';
    ctx.fillRect(cx - w / 2, top - 20, w, totalH + 40);

    let y = top;
    ctx.textAlign = 'center';
    for (const l of lines) {
      y += l.gap;
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, cx, y);
    }

    const bw = 160;
    const bh = 44;
    const by = y + 22;
    this.button = { x: cx - bw / 2, y: by, w: bw, h: bh };
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(this.button.x, this.button.y, bw, bh);
    ctx.fillStyle = '#0b1117';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText(buttonLabel, cx, by + 28);
  }

  private drawReady(): void {
    const t = '600 15px system-ui, sans-serif';
    this.panel(
      [
        { text: 'HIDDEN SHOOTOUT', font: '800 34px system-ui, sans-serif', color: '#e8ecf1', gap: 40 },
        { text: 'Move and aim in secret. When the timer hits 0, everyone is revealed', font: t, color: '#b7c0cc', gap: 34 },
        { text: 'and fires one instant shot. Last one standing wins.', font: t, color: '#b7c0cc', gap: 22 },
        { text: 'WASD / Arrow keys: move     Mouse: aim     No fire button', font: t, color: '#e8ecf1', gap: 34 },
        { text: 'End each round inside the green circle - it shrinks every round.', font: t, color: '#5dd39e', gap: 26 },
      ],
      'Start (Enter)',
    );
  }

  private drawGameOver(match: Match): void {
    const o = match.outcome;
    let title = 'DRAW';
    let color = '#ffe066';
    let sub = 'Nobody is left standing.';
    if (o?.kind === 'win') {
      const w = match.players.find((p) => p.id === o.winnerId)!;
      if (w.isHuman) {
        title = 'YOU WIN!';
        color = '#5dd39e';
        sub = 'Last one standing.';
      } else {
        title = 'YOU LOSE';
        color = '#f25f5c';
        sub = `${w.name} wins.`;
      }
    } else if (match.alivePlayers.length > 1) {
      sub = `Round limit (${CONFIG.maxRounds}) reached with several survivors.`;
    }
    this.panel(
      [
        { text: title, font: '800 40px system-ui, sans-serif', color, gap: 44 },
        { text: sub, font: '600 16px system-ui, sans-serif', color: '#b7c0cc', gap: 30 },
      ],
      'Restart (R)',
    );
  }
}
