import { TouchControls } from './touch';
import type { Command, Vec2 } from './types';
import { ui } from './ui';
import type { View } from './view';

/** Keyboard + mouse state for the human. Mouse is stored in screen space and converted per query. */
export class Input {
  private keys = new Set<string>();
  private mouse: { x: number; y: number } | null = null;
  /** Virtual dual sticks for touch devices. */
  readonly touch: TouchControls;

  constructor(
    canvas: HTMLCanvasElement,
    private view: View,
  ) {
    this.touch = new TouchControls(canvas);
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
  }

  clearKeys(): void {
    this.keys.clear();
    this.touch.reset();
  }

  /** Builds the human's command; aim is relative to the player's current world position. */
  command(playerPos: Vec2): Command {
    const k = this.keys;
    let move: Vec2 = {
      x: (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0),
      y: (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0),
    };
    const tm = this.touch.moveVector();
    if (tm.x !== 0 || tm.y !== 0) move = tm; // touch stick wins while it is held

    let aim: Vec2 | null = this.touch.aimVector(); // null when released: the gun keeps its last direction
    // A synthesized mouse position must never override the aim stick on touch devices.
    if (!aim && !ui.touch && this.mouse) {
      const w = this.view.toWorld(this.mouse.x, this.mouse.y);
      aim = { x: w.x - playerPos.x, y: w.y - playerPos.y }; // zero-length is ignored by movement
    }
    return { move, aim };
  }
}
