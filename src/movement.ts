import { CONFIG } from './config';
import { clampToArena, len, normalize } from './geometry';
import type { Command, Player } from './types';

/** Advance one living player by dt seconds using a command. Identical rules for humans and bots. */
export function applyCommand(p: Player, cmd: Command, dt: number): void {
  // Normalize diagonals; never exceed unit length.
  const l = len(cmd.move);
  if (l > 1e-9) {
    const scale = Math.min(1, 1 / l);
    const step = CONFIG.moveSpeed * dt * scale;
    p.pos = clampToArena(
      { x: p.pos.x + cmd.move.x * step, y: p.pos.y + cmd.move.y * step },
      p.radius,
      CONFIG.arenaRadius,
    );
  }
  if (cmd.aim) {
    const n = normalize(cmd.aim);
    if (n) p.aim = n; // zero-length aim keeps the last valid direction
  }
}
