import { CONFIG } from './config';
import { insideSafeCircle, rayCircleEntry, rayExitCircle } from './geometry';
import type { ResolutionResult, ShotEvent, SnapshotPlayer } from './types';

/**
 * Pure, order-independent simultaneous resolution.
 * Every shooter fires exactly once; nothing is removed until all shots are computed.
 */
export function resolveRound(
  snapshot: readonly SnapshotPlayer[],
  safeRadius: number,
  arenaRadius: number = CONFIG.arenaRadius,
  eps: number = CONFIG.epsilon,
): ResolutionResult {
  // Canonical order (by id) so results never depend on array order.
  const players = [...snapshot].sort((a, b) => a.id - b.id);

  const shots: ShotEvent[] = [];
  const shotDeathSet = new Set<number>();

  for (const shooter of players) {
    const origin = { x: shooter.pos.x, y: shooter.pos.y };
    const dir = { x: shooter.aim.x, y: shooter.aim.y };
    const maxT = rayExitCircle(origin, dir, arenaRadius);

    let bestT = Infinity;
    let bestId: number | null = null;
    for (const target of players) {
      if (target.id === shooter.id) continue;
      const t = rayCircleEntry(origin, dir, target.pos, target.radius);
      if (t === null || t > maxT) continue;
      // Strict < keeps the lowest id on exact ties (players are id-sorted).
      if (t < bestT) {
        bestT = t;
        bestId = target.id;
      }
    }

    const endT = bestId === null ? maxT : bestT;
    if (bestId !== null) shotDeathSet.add(bestId);
    shots.push({
      shooterId: shooter.id,
      origin,
      end: { x: origin.x + dir.x * endT, y: origin.y + dir.y * endT },
      targetId: bestId,
    });
  }

  const boundaryDeathSet = new Set<number>();
  for (const p of players) {
    if (!insideSafeCircle(p.pos, p.radius, safeRadius, eps)) boundaryDeathSet.add(p.id);
  }

  const deaths = [...new Set([...shotDeathSet, ...boundaryDeathSet])].sort((a, b) => a - b);
  return {
    shots,
    shotDeaths: [...shotDeathSet].sort((a, b) => a - b),
    boundaryDeaths: [...boundaryDeathSet].sort((a, b) => a - b),
    deaths,
  };
}
