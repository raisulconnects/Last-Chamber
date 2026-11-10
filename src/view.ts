import { CONFIG } from './config';
import type { Vec2 } from './types';

/** Maps between canvas pixels (CSS px) and world units. World origin = arena center. */
export class View {
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  cssWidth = 1;
  cssHeight = 1;

  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    const worldSpan = CONFIG.arenaRadius * 2 + 80; // arena plus margin
    const usable = Math.min(cssWidth, cssHeight);
    this.scale = usable / worldSpan;
    this.offsetX = cssWidth / 2;
    this.offsetY = cssHeight / 2;
  }

  toWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.offsetX) / this.scale, y: (sy - this.offsetY) / this.scale };
  }

  toScreen(p: Vec2): Vec2 {
    return { x: p.x * this.scale + this.offsetX, y: p.y * this.scale + this.offsetY };
  }
}
