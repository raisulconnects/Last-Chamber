import { THEME } from './theme';
import type { Vec2 } from './types';

export interface StickState {
  base: Vec2; // screen px
  pos: Vec2; // screen px (knob, clamped to the radius)
}

/**
 * Converts a drag (dx, dy in px) into a stick vector with |v| <= 1.
 * Inside the dead zone it is zero; beyond ~85% it snaps to full so max speed is reachable.
 */
export function stickVector(dx: number, dy: number, radius: number, deadzone: number = THEME.touch.deadzone, snap: number = THEME.touch.snap): Vec2 {
  const l = Math.hypot(dx, dy);
  if (l < 1e-9 || radius <= 0) return { x: 0, y: 0 };
  let m = Math.min(1, l / radius);
  if (m < deadzone) return { x: 0, y: 0 };
  m = (m - deadzone) / (1 - deadzone);
  if (m > snap) m = 1;
  return { x: (dx / l) * m, y: (dy / l) * m };
}

interface Stick {
  id: number;
  base: Vec2;
  pos: Vec2;
}

/**
 * Dual virtual sticks: a touch landing in the left half moves, in the right half aims.
 * Floating bases (they appear where the finger lands). Only active while `enabled`.
 */
export class TouchControls {
  enabled = false;
  radius: number = THEME.touch.stickRadius;
  /** Return true for points that belong to other UI (e.g. the MENU pill) so no stick starts there. */
  exclude: ((x: number, y: number) => boolean) | null = null;
  private moveStick: Stick | null = null;
  private aimStick: Stick | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.moveEv(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('blur', () => this.reset());
  }

  reset(): void {
    this.moveStick = null;
    this.aimStick = null;
  }

  /** Call every frame: sticks only exist while the human can act. */
  setEnabled(on: boolean): void {
    if (this.enabled && !on) this.reset();
    this.enabled = on;
  }

  private local(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || !this.enabled) return;
    const p = this.local(e);
    if (this.exclude?.(p.x, p.y)) return;
    const w = this.canvas.getBoundingClientRect().width;
    const isMove = p.x < w / 2;
    if ((isMove && this.moveStick) || (!isMove && this.aimStick)) return; // one finger per stick
    const stick: Stick = { id: e.pointerId, base: p, pos: p };
    if (isMove) this.moveStick = stick;
    else this.aimStick = stick;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    e.preventDefault();
  }

  private moveEv(e: PointerEvent): void {
    for (const s of [this.moveStick, this.aimStick]) {
      if (s && s.id === e.pointerId) {
        const p = this.local(e);
        // Clamp the knob to the base radius for drawing; the vector math clamps by itself.
        const dx = p.x - s.base.x;
        const dy = p.y - s.base.y;
        const l = Math.hypot(dx, dy);
        const k = l > this.radius ? this.radius / l : 1;
        s.pos = { x: s.base.x + dx * k, y: s.base.y + dy * k };
        e.preventDefault();
      }
    }
  }

  private up(e: PointerEvent): void {
    if (this.moveStick?.id === e.pointerId) this.moveStick = null;
    if (this.aimStick?.id === e.pointerId) this.aimStick = null;
  }

  moveVector(): Vec2 {
    const s = this.moveStick;
    return s ? stickVector(s.pos.x - s.base.x, s.pos.y - s.base.y, this.radius) : { x: 0, y: 0 };
  }

  /** Aim direction while the aim stick is pushed; null otherwise so the gun keeps its last direction. */
  aimVector(): Vec2 | null {
    const s = this.aimStick;
    if (!s) return null;
    const v = stickVector(s.pos.x - s.base.x, s.pos.y - s.base.y, this.radius);
    return v.x === 0 && v.y === 0 ? null : v;
  }

  states(): { move: StickState | null; aim: StickState | null } {
    return { move: this.moveStick, aim: this.aimStick };
  }
}
