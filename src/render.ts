import { ArenaRenderer } from './arena';
import { drawCharacter, drawHumanMarker, drawNameTag, drawShadow } from './characters';
import { CONFIG } from './config';
import { MenuView } from './menu/menuView';
import type { MenuModel } from './menu/menuModel';
import { DEFAULT_LOADOUT } from './cosmetics';
import type { Loadout } from './cosmetics';
import { KILL_FX_SECONDS, buildRevealEffects, drawEliminations, drawKillEffect, drawRevealEffects, recoilAt, revealElapsed } from './effects';
import type { RevealEffects } from './effects';
import type { LevelUp } from './levels';
import type { Match } from './match';
import { THEME } from './theme';
import type { StickState } from './touch';
import type { Player, Vec2 } from './types';
import { getDpr, isNarrow, ui } from './ui';
import type { View } from './view';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const C = THEME.colors;

/** Shells earned by the match that just ended, shown on the game-over panel. */
export interface RewardInfo {
  earned: number;
  parts: { play: number; result: number; kills: number; rounds: number };
  balance: number;
  next: string | null;
  xp: number; // XP gained this match
  level: number; // level after this match
  levelUps: LevelUp[]; // levels reached by this match
  at: number; // seconds (performance.now()/1000) when the game-over screen appeared
}

export class Renderer {
  /** Clickable buttons (screen px) for the current overlay. */
  buttons: { id: 'restart' | 'menu'; rect: Rect }[] = [];
  readonly arena = new ArenaRenderer();
  readonly menu = new MenuView();
  /** Accessibility: skip the full-screen flash at the start of a reveal. */
  reduceFlashing = false;
  /** Live touch sticks (from Input) and quit-confirmation state, set by main. */
  touchSticks: { move: StickState | null; aim: StickState | null } = { move: null, aim: null };
  quitArmed = false;
  /** Optional highlight line on the game-over panel (e.g. win streak); presentation only. */
  gameOverNote: string | null = null;
  /** Equipped cosmetics and the latest match reward; presentation only. */
  loadout: Loadout = DEFAULT_LOADOUT;
  reward: RewardInfo | null = null;
  /** True for guests when accounts exist: the game-over panel nudges them to sign in. */
  signInHint = false;
  private cardBottom = 0;
  /** Tappable MENU pill (touch only) in screen px. */
  menuPill: Rect | null = null;
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
    const dpr = getDpr();
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.view.resize(w, h);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** UI scale factor so text/panels stay readable across desktop window sizes. */
  get u(): number {
    return Math.max(ui.touch ? 0.85 : 0.75, Math.min(1.5, Math.min(this.view.cssWidth, this.view.cssHeight) / 720));
  }

  draw(match: Match): void {
    const { ctx, view } = this;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;

    this.updateEffects(match);
    this.arena.setTheme(this.loadout.arena);
    this.arena.update(match.phase === 'READY' ? CONFIG.arenaRadius : match.safeRadius, now);

    // Background
    ctx.fillStyle = C.background;
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
    this.buttons = [];
    this.menuPill = null;

    this.arena.draw(ctx, view, now, match.phase === 'HIDDEN' && match.timeLeft > match.settings.hiddenDuration - 1.2);

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
    this.drawTouchUi(match);
    if (match.phase === 'GAME_OVER') this.drawGameOver(match);
  }

  /** Draw the starting menu (no match is active). */
  drawMenu(model: MenuModel): void {
    this.lastNow = performance.now() / 1000;
    this.arena.setTheme(this.loadout.arena);
    this.menu.draw(this.ctx, this.view, this.arena, model, this.lastNow, this.u);
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
      color: this.loadout.skin.color ?? human.color,
      skin: this.loadout.skin,
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
    const t = revealElapsed(match.revealLeft, match.settings.revealDuration);
    const byId = new Map<number, Player>(match.players.map((p) => [p.id, p]));
    const dead = new Set(fx.eliminations.map((e) => e.id));

    for (const sp of match.snapshot) drawShadow(ctx, view, sp.pos, dead.has(sp.id) ? 0.6 : 1);
    for (const sp of match.snapshot) {
      const p = byId.get(sp.id)!;
      drawCharacter(ctx, view, sp.pos, sp.aim, {
        color: p.isHuman ? (this.loadout.skin.color ?? p.color) : p.color,
        skin: p.isHuman ? this.loadout.skin : undefined,
        name: p.name,
        isHuman: p.isHuman,
        dead: dead.has(sp.id) && t > 0.12, // goes grey just after the flash
        time: now,
        recoil: recoilAt(t),
      });
      if (p.isHuman) drawHumanMarker(ctx, view, sp.pos, now);
      drawNameTag(ctx, view, sp.pos, p.isHuman ? 'YOU' : p.name, p.isHuman ? '#ffffff' : p.color);
    }
    const humanId = match.humanId;
    drawRevealEffects(ctx, view, fx, t, (id) => byId.get(id)?.color ?? '#fff', { id: humanId, shot: this.loadout.shot });
    drawEliminations(ctx, view, fx, t);
    // Equipped kill effect, only where the human's own shot eliminated someone.
    const kind = this.loadout.kill;
    if (kind && t < KILL_FX_SECONDS) {
      const R = CONFIG.playerRadius * view.scale * THEME.art.characterScale;
      const done = new Set<number>();
      for (const sh of fx.shots) {
        if (sh.shooterId !== humanId || sh.targetId === null || done.has(sh.targetId)) continue;
        const e = fx.eliminations.find((x) => x.id === sh.targetId && x.reason !== 'boundary');
        if (!e) continue;
        done.add(sh.targetId);
        const sp = view.toScreen(e.pos);
        drawKillEffect(ctx, kind, sp.x, sp.y, R, t);
      }
    }
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
    if (match.phase === 'REVEAL' && !this.reduceFlashing) {
      const t = revealElapsed(match.revealLeft, match.settings.revealDuration);
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

    const narrow = isNarrow(view.cssWidth);
    let cardBottom = pad;
    if (narrow) {
      // Compact card so it never collides with the centered timer ring on phones.
      const cw = 112 * u;
      const ch = 54 * u;
      ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
      this.roundRect(pad, pad, cw, ch, 10 * u);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = C.textDim;
      ctx.font = this.font(700, 10);
      ctx.fillText('ROUND', pad + 10 * u, pad + 17 * u);
      ctx.fillText('ALIVE', pad + 10 * u, pad + 42 * u);
      ctx.fillStyle = C.text;
      ctx.font = this.font(800, 15);
      ctx.fillText(`${match.round}/${match.settings.maxRounds}`, pad + 52 * u, pad + 18 * u);
      ctx.fillText(`${match.alivePlayers.length}/${match.players.length}`, pad + 52 * u, pad + 43 * u);
      cardBottom = pad + ch;
    } else {
    // Left info card: round + player status.
    const cardW = Math.max(190, 124 + match.players.length * 22) * u; // grows to fit up to 6 player dots
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
    ctx.fillText(`/ ${match.settings.maxRounds}`, pad + 20 * u + rw, pad + 50 * u);

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
    cardBottom = pad + cardH;
    }
    this.cardBottom = cardBottom;

    // Timer ring (top center)
    const cx = view.cssWidth / 2;
    const r = 34 * u;
    const cy = pad + r + 4 * u;
    const hidden = match.phase === 'HIDDEN';
    const frac = hidden ? match.timeLeft / match.settings.hiddenDuration : match.phase === 'REVEAL' ? match.revealLeft / match.settings.revealDuration : 0;
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
      ctx.fillText(ui.touch ? 'You are eliminated - the bots play on' : 'You are eliminated - the bots play on   (R to restart)', cx, view.cssHeight - 22 * u);
    } else if (hidden) {
      ctx.fillStyle = C.textDim;
      ctx.font = this.font(600, 14);
      const hint = ui.touch
        ? 'Left thumb: move   Right thumb: aim'
        : narrow
          ? 'Stay in the green circle. Shot fires at 0.'
          : 'Finish inside the green circle. Your shot fires automatically at 0.';
      ctx.fillText(hint, cx, view.cssHeight - 22 * u);
    }
  }

  /** Virtual sticks and the MENU pill. Own input only: nothing about opponents is shown. */
  private drawTouchUi(match: Match): void {
    if (!ui.touch) return;
    const { ctx, view } = this;
    const u = this.u;
    const human = match.players.find((p) => p.isHuman);

    // MENU pill (touch has no Esc). First tap arms it, second tap quits.
    if (match.phase !== 'READY' && match.phase !== 'GAME_OVER') {
      const w = (this.quitArmed ? 118 : 70) * u;
      const h = 30 * u;
      const x = 16 * u;
      const y = this.cardBottom + 10 * u;
      this.menuPill = { x, y, w, h };
      ctx.fillStyle = this.quitArmed ? 'rgba(242,95,92,0.85)' : 'rgba(8,10,16,0.72)';
      this.roundRect(x, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = this.quitArmed ? '#fff' : C.text;
      ctx.font = this.font(800, 11);
      ctx.textAlign = 'center';
      ctx.fillText(this.quitArmed ? 'TAP TO QUIT' : 'MENU', x + w / 2, y + h / 2 + 4 * u);
    }

    if (match.phase !== 'HIDDEN' || !human || !human.alive) return;
    const R = THEME.touch.stickRadius * u;
    const drawStick = (st: StickState | null, ghost: Vec2, label: string): void => {
      const base = st ? st.base : ghost;
      ctx.save();
      ctx.globalAlpha = st ? 0.9 : 0.32;
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(base.x, base.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const k = st ? st.pos : base;
      ctx.fillStyle = st ? C.hiddenAccent : 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(k.x, k.y, R * 0.42, 0, Math.PI * 2);
      ctx.fill();
      if (!st) {
        ctx.fillStyle = '#fff';
        ctx.font = this.font(800, 11);
        ctx.textAlign = 'center';
        ctx.fillText(label, base.x, base.y + R + 16 * u);
      }
      ctx.restore();
    };
    const y = view.cssHeight - R - 74 * u; // leaves room for the hint line under the ghost labels
    drawStick(this.touchSticks.move, { x: view.cssWidth * 0.22, y }, 'MOVE');
    drawStick(this.touchSticks.aim, { x: view.cssWidth * 0.78, y }, 'AIM');
  }

  private panel(
    lines: { text: string; font: string; color: string; gap: number; glow?: string }[],
    buttonDefs: { id: 'restart' | 'menu'; label: string; primary: boolean }[],
    accent: string,
    layout: 'center' | 'beside' | 'below' = 'center',
  ): void {
    const beside = layout === 'beside';
    const { ctx, view } = this;
    const u = this.u;
    let cx = view.cssWidth / 2;
    let cy = view.cssHeight / 2;
    const totalH = lines.reduce((a, l) => a + l.gap * u, 0) + (beside ? 130 : 80) * u;
    let w = Math.min(600 * u, view.cssWidth - 32);
    if (beside) {
      // Keep the final positions visible: use the free space to the right of the arena.
      const free = view.cssWidth / 2 - CONFIG.arenaRadius * view.scale;
      w = free - 28;
      cx = view.cssWidth - free / 2;
    }
    if (layout === 'below') {
      // Portrait: sit in the free space under the arena so the final positions stay visible.
      const arenaBottom = view.cssHeight / 2 + CONFIG.arenaRadius * view.scale;
      cy = arenaBottom + (view.cssHeight - arenaBottom) / 2;
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
      if (l.glow) {
        ctx.shadowColor = l.glow;
        ctx.shadowBlur = 14 * u;
      }
      ctx.fillText(l.text, cx, y);
      ctx.shadowBlur = 0;
    }

    // Buttons: side by side normally, stacked when the panel is narrow.
    const stacked = beside || w < 420 * u;
    const bh = 46 * u;
    const bw = stacked ? Math.min(220 * u, w - 32 * u) : (w - 48 * u - 12 * u * (buttonDefs.length - 1)) / buttonDefs.length;
    let bx = stacked ? cx - bw / 2 : cx - w / 2 + 24 * u;
    let by = y + 26 * u;
    for (const b of buttonDefs) {
      const rect = { x: bx, y: by, w: bw, h: bh };
      this.buttons.push({ id: b.id, rect });
      ctx.fillStyle = b.primary ? accent : 'rgba(255,255,255,0.12)';
      this.roundRect(rect.x, rect.y, rect.w, rect.h, 12 * u);
      ctx.fill();
      ctx.fillStyle = b.primary ? '#0b1117' : C.text;
      ctx.font = this.font(800, 16);
      ctx.textAlign = 'center';
      ctx.fillText(b.label, rect.x + rect.w / 2, rect.y + 29 * u);
      if (stacked) by += bh + 10 * u;
      else bx += bw + 12 * u;
    }
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
    const sideFree = this.view.cssWidth / 2 - CONFIG.arenaRadius * this.view.scale;
    const belowFree = this.view.cssHeight / 2 - CONFIG.arenaRadius * this.view.scale;
    const layout: 'center' | 'beside' | 'below' =
      sideFree >= 230 * this.u ? 'beside' : belowFree >= (190 + (this.gameOverNote ? 50 : 0) + (this.reward ? 84 + 22 + (this.reward.levelUps.length ? 28 : 0) + (this.signInHint ? 22 : 0) : 0)) * this.u ? 'below' : 'center';
    const lines: { text: string; font: string; color: string; gap: number; glow?: string }[] = [
      { text: title, font: this.font(900, 44), color, gap: 48 },
      { text: sub, font: this.font(600, 16), color: '#b7c0cc', gap: 32 },
    ];
    if (this.gameOverNote) lines.push({ text: this.gameOverNote, font: this.font(800, 14), color: C.revealAccent, gap: 28 });
    const rw = this.reward;
    if (rw) {
      const el = Math.max(0, performance.now() / 1000 - rw.at);
      const k = Math.min(1, el / 1.0);
      const shown = Math.round(rw.earned * (1 - Math.pow(1 - k, 3)));
      lines.push({ text: `+${shown} SHELLS`, font: this.font(900, 24), color: '#ffc247', gap: 34, glow: '#ffb347' });
      const bits: string[] = [];
      if (rw.parts.play) bits.push(`Played ${rw.parts.play}`);
      if (rw.parts.result) bits.push(`Result ${rw.parts.result}`);
      if (rw.parts.kills) bits.push(`Kills ${rw.parts.kills}`);
      if (rw.parts.rounds) bits.push(`Rounds ${rw.parts.rounds}`);
      lines.push({ text: bits.join('  -  '), font: this.font(600, 12), color: '#9aa7b8', gap: 22 });
      lines.push({ text: `+${rw.xp} XP  -  LEVEL ${rw.level}`, font: this.font(800, 13), color: '#6fd6ff', gap: 22 });
      if (rw.levelUps.length) {
        const bonus = rw.levelUps.reduce((a, u) => a + u.bonus, 0);
        lines.push({ text: `LEVEL UP!  Lv ${rw.level}  +${bonus}`, font: this.font(900, 16), color: '#ffd479', gap: 28, glow: '#ffb347' });
      }
      lines.push({ text: rw.next ?? `Balance: ${rw.balance} Shells`, font: this.font(700, 12), color: rw.next ? '#c9d1dc' : '#9aa7b8', gap: 20 });
      if (this.signInHint) lines.push({ text: 'Sign in to save online (top-left card)', font: this.font(600, 11), color: '#6fb7d4', gap: 22 });
    }
    this.panel(
      lines,
      [
        { id: 'restart', label: ui.touch ? 'RESTART' : 'RESTART (R)', primary: true },
        { id: 'menu', label: ui.touch ? 'MENU' : 'MENU (Esc)', primary: false },
      ],
      color,
      layout,
    );
  }
}
