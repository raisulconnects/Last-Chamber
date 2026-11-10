import { CONFIG } from './config';
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
export function revealElapsed(revealLeft: number): number {
  return Math.max(0, CONFIG.revealDuration - revealLeft);
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
      ctx.fillStyle = THEME.colors.flash;
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
