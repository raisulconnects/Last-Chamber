import { CONFIG } from './config';
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

  private shownRadius: number = CONFIG.arenaRadius;
  private fromRadius: number = CONFIG.arenaRadius;
  private toRadius: number = CONFIG.arenaRadius;
  private animStart = 0;

  setTiles(tiles: HTMLImageElement[]): void {
    this.tiles = tiles;
    this.floorKey = ''; // force rebuild
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
    const key = `${R}|${this.tiles.length}`;
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
      ctx.fillStyle = THEME.colors.dangerTint;
      ctx.fillRect(c.x - R, c.y - R, R * 2, R * 2);
      ctx.strokeStyle = THEME.colors.dangerHatch;
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

    // Arena rim
    ctx.lineWidth = Math.max(3, 5 * view.scale);
    ctx.strokeStyle = THEME.colors.arenaEdge;
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.stroke();

    // Safe boundary: glowing line; brighter while shrinking or when asked.
    const pulse = this.shrinking ? 1 : 0.65 + 0.15 * Math.sin(time * 3);
    ctx.save();
    ctx.strokeStyle = THEME.colors.safeGlow;
    ctx.shadowColor = THEME.colors.safeGlow;
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
