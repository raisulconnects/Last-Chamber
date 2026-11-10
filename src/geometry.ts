import type { Vec2 } from './types';

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Returns a normalized copy, or null when the vector has (near) zero length. */
export function normalize(v: Vec2): Vec2 | null {
  const l = len(v);
  if (l < 1e-9) return null;
  return { x: v.x / l, y: v.y / l };
}

/**
 * Distance along the ray (origin + t*dir, dir normalized) to the first entry into the circle.
 * Returns 0 if the origin is already inside the circle, or null if the ray misses.
 */
export function rayCircleEntry(origin: Vec2, dir: Vec2, center: Vec2, radius: number): number | null {
  const oc = { x: center.x - origin.x, y: center.y - origin.y };
  const d2 = dot(oc, oc);
  if (d2 <= radius * radius) return 0;
  const tc = dot(oc, dir); // projection of center on ray
  if (tc < 0) return null; // circle is behind
  const perp2 = d2 - tc * tc;
  const disc = radius * radius - perp2;
  if (disc < 0) return null;
  return tc - Math.sqrt(disc);
}

/** Distance from an origin inside a circle centered at (0,0) to the circle edge along dir. */
export function rayExitCircle(origin: Vec2, dir: Vec2, radius: number): number {
  const b = dot(origin, dir);
  const c = dot(origin, origin) - radius * radius;
  const disc = b * b - c;
  return Math.max(0, -b + Math.sqrt(Math.max(0, disc)));
}

/** True if a hitbox lies fully within a safe circle centered at (0,0) (touching counts as inside). */
export function insideSafeCircle(pos: Vec2, playerRadius: number, safeRadius: number, eps: number): boolean {
  return len(pos) + playerRadius <= safeRadius + eps;
}

/** Clamp a position so a hitbox stays within the arena circle centered at (0,0). */
export function clampToArena(pos: Vec2, playerRadius: number, arenaRadius: number): Vec2 {
  const max = arenaRadius - playerRadius;
  const l = len(pos);
  if (l <= max) return pos;
  const s = max / l;
  return { x: pos.x * s, y: pos.y * s };
}
