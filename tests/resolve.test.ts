import { describe, expect, it } from 'vitest';
import { resolveRound } from '../src/resolve';
import type { SnapshotPlayer } from '../src/types';

const R = 12;
const BIG = 320;
function pl(id: number, x: number, y: number, ax: number, ay: number): SnapshotPlayer {
  return { id, pos: { x, y }, aim: { x: ax, y: ay }, radius: R };
}
const resolve = (ps: SnapshotPlayer[], safe = BIG) => resolveRound(ps, safe);

describe('shot resolution', () => {
  it('ray misses all targets', () => {
    const r = resolve([pl(0, -100, 0, 1, 0), pl(1, 0, 100, 0, 1)]);
    expect(r.shotDeaths).toEqual([]);
    expect(r.shots[0].targetId).toBeNull();
  });

  it('hits a target whose circle intersects the ray though its center does not', () => {
    const r = resolve([pl(0, -100, 0, 1, 0), pl(1, 0, 10, 0, -1)]);
    expect(r.shotDeaths).toContain(1);
  });

  it('nearest aligned target wins', () => {
    const r = resolve([pl(0, -200, 0, 1, 0), pl(1, -50, 0, 0, 1), pl(2, 100, 0, 0, 1)]);
    expect(r.shots.find((s) => s.shooterId === 0)!.targetId).toBe(1);
    expect(r.shotDeaths).not.toContain(2);
  });

  it('mutual kill', () => {
    const r = resolve([pl(0, -50, 0, 1, 0), pl(1, 50, 0, -1, 0)]);
    expect(r.deaths).toEqual([0, 1]);
  });

  it('chain A->B->C kills B and C; B shot is not cancelled', () => {
    const r = resolve([pl(0, -100, 0, 1, 0), pl(1, 0, 0, 0, 1), pl(2, 0, 100, 0, 1)]);
    expect(r.deaths).toEqual([1, 2]);
  });

  it('a target killed by another shooter still blocks the original shot', () => {
    // A (id0) shoots right through B (id1) toward C (id2). C also shoots B.
    const r = resolve([pl(0, -200, 0, 1, 0), pl(1, 0, 0, 0, 1), pl(2, 100, 0, -1, 0)]);
    expect(r.shots.find((s) => s.shooterId === 0)!.targetId).toBe(1);
    expect(r.shotDeaths).not.toContain(2);
  });

  it('is independent of player array order', () => {
    const base = [
      pl(0, -100, 0, 1, 0),
      pl(1, 0, 0, 0.6, 0.8),
      pl(2, 60, 80, -1, 0),
      pl(3, 60, 80, 0, -1),
    ];
    const expected = resolve(base);
    const perms = [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]];
    for (const perm of perms) {
      const r = resolve(perm.map((i) => base[i]));
      expect(r.deaths).toEqual(expected.deaths);
      expect(r.shots.map((s) => [s.shooterId, s.targetId])).toEqual(expected.shots.map((s) => [s.shooterId, s.targetId]));
    }
  });

  it('ties go to the lowest id', () => {
    // Two overlapping identical targets on the ray.
    const r = resolve([pl(0, -100, 0, 1, 0), pl(5, 0, 0, 0, 1), pl(2, 0, 0, 0, 1)]);
    expect(r.shots.find((s) => s.shooterId === 0)!.targetId).toBe(2);
  });

  it('a ray starting inside another hitbox hits at distance zero', () => {
    const r = resolve([pl(0, 0, 0, 1, 0), pl(1, 5, 0, 0, 1)]);
    const s = r.shots.find((x) => x.shooterId === 0)!;
    expect(s.targetId).toBe(1);
    expect(s.end).toEqual({ x: 0, y: 0 });
  });

  it('shot line stops at the arena edge when nothing is hit', () => {
    const r = resolve([pl(0, 0, 0, 1, 0)]);
    expect(r.shots[0].end.x).toBeCloseTo(BIG, 6);
  });
});

describe('boundary deaths', () => {
  it('inside / touching / outside the safe circle', () => {
    const safe = 100;
    const r = resolve(
      [pl(0, 50, 0, 0, 1), pl(1, 88, 0, 0, 1), pl(2, 89, 0, 0, 1)].map((p, i) => ({ ...p, pos: { x: p.pos.x, y: i * 0 } })),
      safe,
    );
    expect(r.boundaryDeaths).toEqual([2]);
  });

  it('an outside player still fires before simultaneous elimination', () => {
    // Player 0 is outside the safe circle but shoots player 1, who is inside.
    const r = resolve([pl(0, 150, 0, -1, 0), pl(1, 0, 0, 0, 1)], 100);
    expect(r.boundaryDeaths).toEqual([0]);
    expect(r.shotDeaths).toEqual([1]);
    expect(r.deaths).toEqual([0, 1]);
  });
});
