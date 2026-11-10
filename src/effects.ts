import { CONFIG } from './config';
import type { KillKind, ShotParams } from './shop';
import { THEME } from './theme';
import type { ResolutionResult, SnapshotPlayer, Vec2 } from './types';
import type { View } from './view';

/** Everything the reveal needs to draw. It is derived only from the already-computed outcome. */
export interface RevealEffects {
  shots: { shooterId: number; origin: Vec2; end: Vec2; dir: Vec2; targetId: number | null }[];
  eliminations: { id: number; pos: Vec2; reason: 'shot' | 'boundary' | 'both' }[];
}

export function buildRevealEffects(result: ResolutionResult, snapshot: readonly SnapshotPlayer[]): RevealEffects {
  const byId = new Map(snapshot.map((p) => [p.id, p]));
  const shots = result.shots.map((s) => ({
    shooterId: s.shooterId,
    origin: s.origin,
    end: s.end,
    dir: { x: byId.get(s.shooterId)!.aim.x, y: byId.get(s.shooterId)!.aim.y },
    targetId: s.targetId,
  }));
  const shotSet = new Set(result.shotDeaths);
  const boundarySet = new Set(result.boundaryDeaths);
  const eliminations = result.deaths.map((id) => {
    const p = byId.get(id)!;
    const reason: 'shot' | 'boundary' | 'both' =
      shotSet.has(id) && boundarySet.has(id) ? 'both' : shotSet.has(id) ? 'shot' : 'boundary';
    return { id, pos: { x: p.pos.x, y: p.pos.y }, reason };
  });
  return { shots, eliminations };
}

/** Seconds since the reveal began. Purely cosmetic timing derived from the match timer. */
export function revealElapsed(revealLeft: number, duration: number = CONFIG.revealDuration): number {
  return Math.max(0, duration - revealLeft);
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** Distance from the player center to the gun muzzle, in world units (matches the character art). */
const MUZZLE = CONFIG.playerRadius * THEME.art.characterScale * 2.1;

/** Gun recoil kick amount (0..1) for the first moments of the reveal. */
export function recoilAt(t: number): number {
  return clamp01(1 - t / 0.18);
}

export function drawRevealEffects(
  ctx: CanvasRenderingContext2D,
  view: View,
  fx: RevealEffects,
  t: number,
  colorOf: (id: number) => string,
  human?: { id: number; shot: ShotParams | null },
): void {
  const A = THEME.anim;
  ctx.save();
  ctx.lineCap = 'round';

  // Tracers (instant, full length from t=0; only fade afterwards).
  const tr = clamp01(1 - t / A.tracerSeconds);
  if (tr > 0) {
    for (const s of fx.shots) {
      const a = view.toScreen({ x: s.origin.x + s.dir.x * MUZZLE, y: s.origin.y + s.dir.y * MUZZLE });
      const b = view.toScreen(s.end);
      const style = human && s.shooterId === human.id ? human.shot : null;
      if (style) {
        drawShotLine(ctx, a, b, style, tr, t, view.scale);
        continue;
      }
      ctx.globalAlpha = tr;
      ctx.strokeStyle = colorOf(s.shooterId);
      ctx.shadowColor = colorOf(s.shooterId);
      ctx.shadowBlur = 14;
      ctx.lineWidth = Math.max(3, 7 * view.scale) * (0.5 + tr * 0.5);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, 2.5 * view.scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Muzzle flashes
  const fl = clamp01(1 - t / A.flashSeconds);
  if (fl > 0) {
    for (const s of fx.shots) {
      const m = view.toScreen({ x: s.origin.x + s.dir.x * MUZZLE, y: s.origin.y + s.dir.y * MUZZLE });
      const r = CONFIG.playerRadius * view.scale * (1.1 + 0.9 * fl);
      const ang = Math.atan2(s.dir.y, s.dir.x);
      ctx.globalAlpha = fl;
      const flashStyle = human && s.shooterId === human.id ? human.shot : null;
      ctx.fillStyle = flashStyle ? (flashStyle.mode === 'rainbow' ? `hsl(${(t * 720) % 360}, 100%, 80%)` : flashStyle.flash) : THEME.colors.flash;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = ang + (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.4;
        const px = m.x + Math.cos(a) * rr;
        const py = m.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // Impacts: sparks on players, small puffs where shots end at the arena wall.
  const im = clamp01(t / A.impactSeconds);
  if (im < 1) {
    for (const s of fx.shots) {
      const p = view.toScreen(s.end);
      const hit = s.targetId !== null;
      ctx.globalAlpha = 1 - im;
      ctx.strokeStyle = hit ? '#ffffff' : 'rgba(200,210,225,0.9)';
      ctx.lineWidth = Math.max(1.5, 2.5 * view.scale);
      const n = hit ? 8 : 5;
      const len = CONFIG.playerRadius * view.scale * (hit ? 1.6 : 0.9) * im;
      const start = CONFIG.playerRadius * view.scale * 0.3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + s.shooterId; // fixed per shot, no randomness
        ctx.moveTo(p.x + Math.cos(a) * (start + len * 0.4), p.y + Math.sin(a) * (start + len * 0.4));
        ctx.lineTo(p.x + Math.cos(a) * (start + len), p.y + Math.sin(a) * (start + len));
      }
      ctx.stroke();
      if (hit) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, CONFIG.playerRadius * view.scale * (0.4 + im * 1.2), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Elimination markers drawn above characters: expanding ring, X, and a reason label. */
export function drawEliminations(
  ctx: CanvasRenderingContext2D,
  view: View,
  fx: RevealEffects,
  t: number,
): void {
  const grow = clamp01(t / THEME.anim.eliminationSeconds);
  const mark = clamp01((t - 0.05) / 0.2);
  for (const e of fx.eliminations) {
    const s = view.toScreen(e.pos);
    const R = CONFIG.playerRadius * view.scale * THEME.art.characterScale;
    ctx.save();
    ctx.strokeStyle = THEME.colors.danger;
    if (grow < 1) {
      ctx.globalAlpha = 1 - grow;
      ctx.lineWidth = Math.max(2, 3 * view.scale);
      ctx.beginPath();
      ctx.arc(s.x, s.y, R * (1 + grow * 2.2), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = mark;
    ctx.lineWidth = Math.max(3, 5 * view.scale);
    ctx.lineCap = 'round';
    const k = R * 0.85 * (0.6 + 0.4 * mark);
    ctx.beginPath();
    ctx.moveTo(s.x - k, s.y - k);
    ctx.lineTo(s.x + k, s.y + k);
    ctx.moveTo(s.x + k, s.y - k);
    ctx.lineTo(s.x - k, s.y + k);
    ctx.stroke();

    const label = e.reason === 'boundary' ? 'OUT OF CIRCLE' : e.reason === 'both' ? 'SHOT + OUT' : 'ELIMINATED';
    const size = Math.max(10, Math.round(12 * Math.min(1.5, view.scale * 1.6)));
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = THEME.colors.danger;
    ctx.strokeText(label, s.x, s.y + R * 2.9);
    ctx.fillText(label, s.x, s.y + R * 2.9);
    ctx.restore();
  }
}

// ---- cosmetic shot styles ---------------------------------------------------------------------

type P = { x: number; y: number };

/** Draws a styled tracer in screen space. Shared by the reveal and the shop preview. */
export function drawShotLine(ctx: CanvasRenderingContext2D, a: P, b: P, st: ShotParams, alpha: number, time: number, scale: number): void {
  const w = Math.max(3, 7 * scale) * (0.5 + alpha * 0.5);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = alpha;
  let stroke: string | CanvasGradient = st.core;
  let glow = st.glow;
  let width = w;
  if (st.mode === 'rainbow') {
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    for (let i = 0; i <= 5; i++) g.addColorStop(i / 5, `hsl(${(time * 540 + i * 60) % 360}, 100%, 62%)`);
    stroke = g;
    glow = `hsl(${(time * 540) % 360}, 100%, 62%)`;
  } else if (st.mode === 'pulse') {
    width = w * (1.05 + 0.4 * Math.sin(time * 38));
  } else if (st.mode === 'comet') {
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, 'rgba(255,138,42,0.05)');
    g.addColorStop(0.7, st.glow);
    g.addColorStop(1, st.core);
    stroke = g;
  }
  ctx.strokeStyle = stroke;
  ctx.shadowColor = glow;
  ctx.shadowBlur = st.mode === 'solid' ? 14 : 24;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 2.5 * scale);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (st.mode === 'comet') {
    ctx.fillStyle = st.flash;
    ctx.shadowColor = st.glow;
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(b.x, b.y, w * 1.1, 0, Math.PI * 2);
    ctx.fill();
    // embers trailing behind the head
    ctx.shadowBlur = 8;
    for (let i = 1; i <= 6; i++) {
      const k = 1 - i * 0.06;
      const jitter = Math.sin(i * 12.9 + time * 9) * w * 0.9;
      const nx = -(b.y - a.y);
      const ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      ctx.globalAlpha = alpha * (0.8 - i * 0.1);
      ctx.fillStyle = i % 2 ? st.core : st.glow;
      ctx.beginPath();
      ctx.arc(a.x + (b.x - a.x) * k + (nx / nl) * jitter, a.y + (b.y - a.y) * k + (ny / nl) * jitter, w * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- cosmetic kill effects --------------------------------------------------------------------

/** Deterministic pseudo-random in [0,1) so effects look identical every frame (no Math.random). */
function h01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const KILL_FX_SECONDS = 1.1;

/** Draws a kill effect centered on a screen point. `t` is seconds since the reveal started. */
export function drawKillEffect(ctx: CanvasRenderingContext2D, kind: KillKind, x: number, y: number, R: number, t: number): void {
  if (t < 0 || t > KILL_FX_SECONDS) return;
  const k = t / KILL_FX_SECONDS; // 0..1
  ctx.save();
  ctx.lineCap = 'round';
  if (kind === 'spark') {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + h01(i) * 0.35;
      const reach = R * (1.2 + h01(i + 40) * 2.6) * (1 - Math.pow(1 - Math.min(1, k * 1.6), 3));
      const len = R * (0.35 + h01(i + 80) * 0.5) * (1 - k);
      ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
      ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffd36b' : '#ff9f43';
      ctx.shadowColor = '#ffb347';
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(2, R * 0.12);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * reach, y + Math.sin(ang) * reach);
      ctx.lineTo(x + Math.cos(ang) * (reach + len), y + Math.sin(ang) * (reach + len));
      ctx.stroke();
    }
  } else if (kind === 'ring') {
    for (let i = 0; i < 3; i++) {
      const kk = Math.max(0, Math.min(1, (k - i * 0.14) / 0.72));
      if (kk <= 0 || kk >= 1) continue;
      ctx.globalAlpha = (1 - kk) * 0.95;
      ctx.strokeStyle = i === 1 ? '#fff3b0' : '#4cc9f0';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 16;
      ctx.lineWidth = Math.max(2, R * (0.28 - kk * 0.18));
      ctx.beginPath();
      ctx.arc(x, y, R * (0.8 + kk * 3.6), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === 'confetti') {
    const colors = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0', '#b57bff', '#ffffff'];
    for (let i = 0; i < 34; i++) {
      const ang = h01(i) * Math.PI * 2;
      const speed = R * (2.0 + h01(i + 20) * 3.4);
      const px = x + Math.cos(ang) * speed * Math.sqrt(k) * 1.1;
      const py = y + Math.sin(ang) * speed * Math.sqrt(k) * 1.1 + R * 2.2 * k * k; // gravity
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.55) / 0.45);
      ctx.fillStyle = colors[i % colors.length];
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(h01(i + 60) * 6 + t * (4 + h01(i + 7) * 8));
      const sz = R * (0.16 + h01(i + 90) * 0.18);
      ctx.fillRect(-sz, -sz * 0.55, sz * 2, sz * 1.1);
      ctx.restore();
    }
  } else if (kind === 'lightning') {
    const strike = Math.min(1, t / 0.4);
    if (strike < 1) {
      const top = y - R * 11;
      const segs = 9;
      const flicker = 0.65 + 0.35 * Math.sin(t * 90);
      const bolt = (): void => {
        ctx.beginPath();
        ctx.moveTo(x + (h01(1) - 0.5) * R * 1.2, top);
        for (let i = 1; i < segs; i++) {
          const yy = top + ((y - top) * i) / segs;
          ctx.lineTo(x + (h01(i * 3.7) - 0.5) * R * 2.2 * (1 - i / segs), yy);
        }
        ctx.lineTo(x, y);
      };
      ctx.globalAlpha = (1 - strike) * flicker;
      ctx.strokeStyle = '#8fb4ff';
      ctx.shadowColor = '#6f8cff';
      ctx.shadowBlur = 30;
      ctx.lineWidth = Math.max(5, R * 0.55);
      bolt();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, R * 0.2);
      bolt();
      ctx.stroke();
      ctx.fillStyle = '#e9f0ff';
      ctx.globalAlpha = (1 - strike) * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, R * (1.2 + strike * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
    const kk = Math.max(0, (t - 0.1) / (KILL_FX_SECONDS - 0.1));
    ctx.globalAlpha = Math.max(0, 1 - kk);
    ctx.strokeStyle = '#8fb4ff';
    ctx.shadowColor = '#6f8cff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = Math.max(2, R * 0.22);
    ctx.beginPath();
    ctx.arc(x, y, R * (0.6 + kk * 2.6), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
