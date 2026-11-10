import { CONFIG } from './config';
import type { ArenaParams } from './shop';
import { THEME } from './theme';
import { getDpr } from './ui';
import type { View } from './view';

/** Cheap deterministic hash for tile variation. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Draws the circular arena: textured floor, safe vs unsafe areas, and an animated shrink.
 * The displayed safe radius is render-only; the logical radius lives in Match.
 */
export class ArenaRenderer {
  private floor: HTMLCanvasElement | null = null;
  private floorKey = '';
  private tiles: HTMLImageElement[] = [];

  /** Equipped arena theme (colors and overlay). Presentation only. */
  private theme: ArenaParams | null = null;

  private shownRadius: number = CONFIG.arenaRadius;
  private fromRadius: number = CONFIG.arenaRadius;
  private toRadius: number = CONFIG.arenaRadius;
  private animStart = 0;

  setTiles(tiles: HTMLImageElement[]): void {
    this.tiles = tiles;
    this.floorKey = ''; // force rebuild
  }

  setTheme(theme: ArenaParams | null): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.floorKey = ''; // rebuild the floor with the new tint
  }

  /** True while the circle is visibly shrinking (used for emphasis). */
  get shrinking(): boolean {
    return Math.abs(this.shownRadius - this.toRadius) > 0.5;
  }

  /** Snap to a radius with no animation (new match / ready screen). */
  snap(radius: number): void {
    this.shownRadius = this.fromRadius = this.toRadius = radius;
  }

  /** Update animation toward the logical safe radius. `now` in seconds. */
  update(target: number, now: number): void {
    if (target > this.toRadius + 0.01) {
      this.snap(target); // radius grew: a new match started
      return;
    }
    if (Math.abs(target - this.toRadius) > 0.01) {
      this.fromRadius = this.shownRadius;
      this.toRadius = target;
      this.animStart = now;
    }
    const t = Math.min(1, (now - this.animStart) / THEME.anim.shrinkSeconds);
    const e = 1 - Math.pow(1 - t, 3); // ease-out
    this.shownRadius = this.fromRadius + (this.toRadius - this.fromRadius) * e;
    if (t >= 1) this.shownRadius = this.toRadius;
  }

  private buildFloor(view: View): void {
    const dpr = getDpr();
    const R = Math.round(CONFIG.arenaRadius * view.scale * dpr);
    const key = `${R}|${this.tiles.length}|${this.theme?.tint ?? ''}|${this.theme?.overlay ?? ''}`;
    if (key === this.floorKey && this.floor) return;
    this.floorKey = key;

    const c = document.createElement('canvas');
    c.width = c.height = R * 2;
    const g = c.getContext('2d')!;
    g.save();
    g.beginPath();
    g.arc(R, R, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = THEME.colors.floorFallback;
    g.fillRect(0, 0, R * 2, R * 2);

    if (this.tiles.length > 0) {
      g.imageSmoothingEnabled = false;
      const cell = Math.max(4, Math.round(16 * THEME.art.floorTileScale * view.scale * dpr));
      const n = Math.ceil((R * 2) / cell) + 1;
      for (let ty = 0; ty < n; ty++) {
        for (let tx = 0; tx < n; tx++) {
          const h = hash(tx, ty);
          // Mostly plain slabs with occasional speckled variation (kept subtle).
          const i = h < 0.82 ? 0 : Math.min(1, this.tiles.length - 1);
          g.drawImage(this.tiles[i], tx * cell, ty * cell, cell, cell);
        }
      }
      g.fillStyle = THEME.colors.floorShade;
      g.fillRect(0, 0, R * 2, R * 2);
    }

    if (this.theme) {
      g.fillStyle = this.theme.tint;
      g.fillRect(0, 0, R * 2, R * 2);
      paintOverlay(g, R, this.theme);
    }

    // Soft inner vignette so the edge reads as a rim.
    const grad = g.createRadialGradient(R, R, R * 0.6, R, R, R);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
    g.restore();
    this.floor = c;
  }

  draw(ctx: CanvasRenderingContext2D, view: View, time: number, highlightSafe: boolean): void {
    this.buildFloor(view);
    const c = view.toScreen({ x: 0, y: 0 });
    const R = CONFIG.arenaRadius * view.scale;
    const safe = this.shownRadius * view.scale;

    // Outer glow / rim
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (this.floor) ctx.drawImage(this.floor, c.x - R, c.y - R, R * 2, R * 2);

    // Unsafe ring: red tint plus diagonal hatching.
    if (safe < R - 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
      ctx.arc(c.x, c.y, safe, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      ctx.fillStyle = this.theme?.danger ?? THEME.colors.dangerTint;
      ctx.fillRect(c.x - R, c.y - R, R * 2, R * 2);
      ctx.strokeStyle = this.theme?.hatch ?? THEME.colors.dangerHatch;
      ctx.lineWidth = Math.max(2, 5 * view.scale);
      const step = Math.max(12, 22 * view.scale);
      const off = (time * 6) % step; // slow drift so the danger zone feels alive
      ctx.beginPath();
      for (let k = -R * 2; k < R * 2; k += step) {
        ctx.moveTo(c.x + k + off - R, c.y + R);
        ctx.lineTo(c.x + k + off + R, c.y - R);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Animated theme sparkle (clipped to the arena)
    if (this.theme && (this.theme.overlay === 'stars' || this.theme.overlay === 'frost' || this.theme.overlay === 'embers')) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
      ctx.clip();
      animateOverlay(ctx, c.x, c.y, R, this.theme, time);
      ctx.restore();
    }

    // Arena rim
    ctx.lineWidth = Math.max(3, 5 * view.scale);
    ctx.strokeStyle = this.theme?.edge ?? THEME.colors.arenaEdge;
    if (this.theme) {
      ctx.save();
      ctx.shadowColor = this.theme.edge;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.stroke();

    // Safe boundary: glowing line; brighter while shrinking or when asked.
    const pulse = this.shrinking ? 1 : 0.65 + 0.15 * Math.sin(time * 3);
    ctx.save();
    ctx.strokeStyle = this.theme?.safe ?? THEME.colors.safeGlow;
    ctx.shadowColor = this.theme?.safe ?? THEME.colors.safeGlow;
    ctx.shadowBlur = (highlightSafe || this.shrinking ? 18 : 8) * Math.min(1.5, view.scale * 1.6);
    ctx.globalAlpha = pulse;
    ctx.lineWidth = Math.max(2.5, 4 * view.scale);
    ctx.setLineDash(this.shrinking ? [] : [14 * view.scale + 4, 10 * view.scale + 3]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, safe, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- theme overlays ---------------------------------------------------------------------------

/** Static part of a theme overlay, painted once into the cached floor (clipped to the arena). */
function paintOverlay(g: CanvasRenderingContext2D, R: number, th: ArenaParams): void {
  const accent = th.accent ?? '#ffffff';
  if (th.overlay === 'grid') {
    const cell = Math.max(10, R / 8);
    g.strokeStyle = accent;
    g.globalAlpha = 0.45;
    g.lineWidth = Math.max(1, R / 220);
    g.shadowColor = accent;
    g.shadowBlur = 6;
    g.beginPath();
    for (let p = 0; p <= R * 2; p += cell) {
      g.moveTo(p, 0);
      g.lineTo(p, R * 2);
      g.moveTo(0, p);
      g.lineTo(R * 2, p);
    }
    g.stroke();
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  } else if (th.overlay === 'stars') {
    g.fillStyle = accent;
    for (let i = 0; i < 90; i++) {
      g.globalAlpha = 0.15 + hash(i, 3) * 0.4;
      g.beginPath();
      g.arc(hash(i, 1) * R * 2, hash(i, 2) * R * 2, 0.6 + hash(i, 4) * 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  } else if (th.overlay === 'frost') {
    g.strokeStyle = accent;
    g.globalAlpha = 0.16;
    g.lineWidth = Math.max(1, R / 260);
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 11) * R * 2;
      const y = hash(i, 12) * R * 2;
      const a = hash(i, 13) * Math.PI;
      const l = R * (0.08 + hash(i, 14) * 0.22);
      g.beginPath();
      g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (th.overlay === 'embers') {
    const grad = g.createRadialGradient(R, R, R * 0.55, R, R, R);
    grad.addColorStop(0, 'rgba(255,90,20,0)');
    grad.addColorStop(1, 'rgba(255,90,20,0.28)');
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
  }
}

/** Per-frame sparkle for the animated overlays; deterministic positions, time-varying alpha. */
function animateOverlay(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, th: ArenaParams, time: number): void {
  const accent = th.accent ?? '#ffffff';
  ctx.fillStyle = accent;
  if (th.overlay === 'stars' || th.overlay === 'frost') {
    for (let i = 0; i < 26; i++) {
      const tw = 0.5 + 0.5 * Math.sin(time * (1.4 + hash(i, 5) * 2.2) + i * 1.7);
      const a = Math.atan2(hash(i, 6) - 0.5, hash(i, 7) - 0.5) + hash(i, 8) * 6.28;
      const d = Math.sqrt(hash(i, 9)) * R * 0.97;
      ctx.globalAlpha = tw * (th.overlay === 'stars' ? 0.85 : 0.7);
      const r = (th.overlay === 'stars' ? 1.2 : 1.6) + tw * 1.4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (th.overlay === 'embers') {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    for (let i = 0; i < 22; i++) {
      const life = (time * (0.12 + hash(i, 21) * 0.14) + hash(i, 22)) % 1;
      const a = hash(i, 23) * Math.PI * 2;
      const d = R * (0.55 + hash(i, 24) * 0.42) - life * R * 0.2;
      ctx.globalAlpha = Math.sin(life * Math.PI) * 0.85;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.4 + hash(i, 25) * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

/** Small themed arena disc for the shop preview. Reuses the same overlay painters. */
export function drawArenaSwatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, th: ArenaParams | null, time: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = THEME.colors.floorFallback;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (th) {
    ctx.fillStyle = th.tint;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.save();
    ctx.translate(cx - r, cy - r);
    paintOverlay(ctx, r, th);
    ctx.restore();
    animateOverlay(ctx, cx, cy, r, th, time);
  }
  // danger ring outside the safe circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2, true);
  ctx.clip('evenodd');
  ctx.fillStyle = th?.danger ?? THEME.colors.dangerTint;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = th?.safe ?? THEME.colors.safeGlow;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 8;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = th?.edge ?? THEME.colors.arenaEdge;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}
