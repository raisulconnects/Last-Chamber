import { describe, expect, it } from 'vitest';
import { clampToArena, insideSafeCircle, rayCircleEntry, rayExitCircle } from '../src/geometry';

describe('rayCircleEntry', () => {
  const dir = { x: 1, y: 0 };
  it('misses when the circle is off the ray', () => {
    expect(rayCircleEntry({ x: 0, y: 0 }, dir, { x: 100, y: 50 }, 12)).toBeNull();
  });
  it('misses when the circle is behind', () => {
    expect(rayCircleEntry({ x: 0, y: 0 }, dir, { x: -100, y: 0 }, 12)).toBeNull();
  });
  it('hits when the center is off-axis but the circle intersects', () => {
    const t = rayCircleEntry({ x: 0, y: 0 }, dir, { x: 100, y: 10 }, 12)!;
    expect(t).toBeCloseTo(100 - Math.sqrt(144 - 100), 6);
  });
  it('returns entry (not center) distance', () => {
    expect(rayCircleEntry({ x: 0, y: 0 }, dir, { x: 100, y: 0 }, 12)).toBeCloseTo(88, 6);
  });
  it('returns 0 when the origin is inside the circle', () => {
    expect(rayCircleEntry({ x: 0, y: 0 }, dir, { x: 5, y: 0 }, 12)).toBe(0);
  });
});

describe('rayExitCircle', () => {
  it('measures to the arena edge', () => {
    expect(rayExitCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, 320)).toBeCloseTo(320, 6);
    expect(rayExitCircle({ x: 100, y: 0 }, { x: 1, y: 0 }, 320)).toBeCloseTo(220, 6);
    expect(rayExitCircle({ x: 100, y: 0 }, { x: -1, y: 0 }, 320)).toBeCloseTo(420, 6);
  });
});

describe('insideSafeCircle', () => {
  const r = 12;
  it('inside', () => expect(insideSafeCircle({ x: 100, y: 0 }, r, 200, 1e-6)).toBe(true));
  it('touching counts as inside', () => expect(insideSafeCircle({ x: 188, y: 0 }, r, 200, 1e-6)).toBe(true));
  it('outside', () => expect(insideSafeCircle({ x: 189, y: 0 }, r, 200, 1e-6)).toBe(false));
});

describe('clampToArena', () => {
  it('keeps hitbox inside', () => {
    const p = clampToArena({ x: 1000, y: 0 }, 12, 320);
    expect(p.x).toBeCloseTo(308, 6);
  });
});
