import { describe, expect, it } from 'vitest';
import { volleyLayerGain, volleyLayers } from '../src/audio';
import { CONFIG } from '../src/config';
import { buildRevealEffects, revealElapsed } from '../src/effects';
import { GameEventDetector } from '../src/events';
import type { GameEvent } from '../src/events';
import { Match } from '../src/match';
import { resolveRound } from '../src/resolve';
import type { Command, SnapshotPlayer } from '../src/types';

const STEP = 1 / CONFIG.tickRate;
const none = new Map<number, Command>();

function place(m: Match, spec: { pos: [number, number]; aim: [number, number] }[]): void {
  m.start();
  m.players = m.players.slice(0, spec.length);
  spec.forEach((s, i) => {
    m.players[i].pos = { x: s.pos[0], y: s.pos[1] };
    m.players[i].aim = { x: s.aim[0], y: s.aim[1] };
  });
}

/** Run frames (ticks), collecting events from the detector after each tick. */
function run(m: Match, d: GameEventDetector, ticks: number, events: GameEvent[]): void {
  for (let i = 0; i < ticks; i++) {
    m.update(STEP, none);
    events.push(...d.update(m));
  }
}
const count = (ev: GameEvent[], type: GameEvent['type']): number => ev.filter((e) => e.type === type).length;

describe('GameEventDetector', () => {
  it('emits each event exactly once across many frames', () => {
    const m = new Match();
    const d = new GameEventDetector();
    place(m, [
      { pos: [-50, 0], aim: [1, 0] },
      { pos: [50, 0], aim: [-1, 0] }, // mutual kill -> draw
    ]);
    const ev: GameEvent[] = [...d.matchStarted()];
    run(m, d, 60 * 6 + 60 * 3, ev); // hidden + reveal + extra frames
    expect(count(ev, 'start')).toBe(1);
    expect(ev.filter((e) => e.type === 'countdown').map((e) => (e as { n: number }).n)).toEqual([3, 2, 1]);
    expect(count(ev, 'volley')).toBe(1);
    expect(count(ev, 'elimination')).toBe(1);
    expect(count(ev, 'gameOver')).toBe(1);
    expect(ev.find((e) => e.type === 'gameOver')).toEqual({ type: 'gameOver', result: 'draw' });
  });

  it('fires shrink once per new round, only after a resolved round', () => {
    const m = new Match();
    const d = new GameEventDetector();
    place(m, [
      { pos: [-10, 0], aim: [-1, 0] },
      { pos: [10, 0], aim: [1, 0] },
    ]);
    const ev: GameEvent[] = [...d.matchStarted()];
    run(m, d, 5, ev);
    expect(count(ev, 'shrink')).toBe(0);
    run(m, d, 60 * 8, ev); // finishes round 1 (6s) + reveal (1.5s) and starts round 2
    expect(m.round).toBe(2);
    expect(count(ev, 'shrink')).toBe(1);
    expect(count(ev, 'volley')).toBe(1);
  });

  it('reports a win/loss relative to the human', () => {
    const m = new Match();
    const d = new GameEventDetector();
    place(m, [
      { pos: [-50, 0], aim: [0, 1] },
      { pos: [50, 0], aim: [-1, 0] }, // bot kills human, then wins alone
    ]);
    const ev: GameEvent[] = [...d.matchStarted()];
    run(m, d, 60 * 8, ev);
    expect(ev.find((e) => e.type === 'gameOver')).toEqual({ type: 'gameOver', result: 'loss' });
  });

  it('restart re-arms countdown and start events', () => {
    const m = new Match();
    const d = new GameEventDetector();
    place(m, [
      { pos: [-10, 0], aim: [-1, 0] },
      { pos: [10, 0], aim: [1, 0] },
    ]);
    d.matchStarted();
    const first: GameEvent[] = [];
    run(m, d, 60 * 4, first); // into the countdown
    expect(count(first, 'countdown')).toBeGreaterThan(0);
    m.start();
    const second: GameEvent[] = [...d.matchStarted()];
    run(m, d, 60 * 5.5, second); // past the 3-2-1 window of the new match
    expect(count(second, 'start')).toBe(1);
    expect(count(second, 'countdown')).toBe(3);
  });
});

describe('buildRevealEffects', () => {
  const snap: SnapshotPlayer[] = [
    { id: 0, pos: { x: -50, y: 0 }, aim: { x: 1, y: 0 }, radius: 12 },
    { id: 1, pos: { x: 50, y: 0 }, aim: { x: -1, y: 0 }, radius: 12 },
    { id: 2, pos: { x: 300, y: 0 }, aim: { x: 0, y: 1 }, radius: 12 },
  ];

  it('is derived only from the computed result', () => {
    const result = resolveRound(snap, 200);
    const fx = buildRevealEffects(result, snap);
    expect(fx.shots).toHaveLength(3);
    expect(fx.eliminations.map((e) => e.id)).toEqual(result.deaths);
    expect(fx.eliminations.find((e) => e.id === 2)!.reason).toBe('boundary');
    expect(fx.eliminations.find((e) => e.id === 0)!.reason).toBe('shot');
    // Shot endpoints are exactly the stored resolution events.
    fx.shots.forEach((s, i) => expect(s.end).toEqual(result.shots[i].end));
  });

  it('timing helper is cosmetic and clamped', () => {
    expect(revealElapsed(CONFIG.revealDuration)).toBe(0);
    expect(revealElapsed(CONFIG.revealDuration + 5)).toBe(0); // never negative
  });
});

describe('effects are not available outside a reveal', () => {
  it('match has no result during HIDDEN, so nothing can be built', () => {
    const m = new Match();
    m.start();
    expect(m.result).toBeNull();
    expect(m.snapshot).toHaveLength(0);
  });
});

describe('volley loudness', () => {
  it('stays bounded for 1..12 simultaneous shots', () => {
    let prev = Infinity;
    for (let n = 1; n <= 12; n++) {
      const per = volleyLayerGain(n);
      expect(per).toBeLessThanOrEqual(prev); // never louder per layer as shots grow
      prev = per;
      expect(per * volleyLayers(n)).toBeLessThanOrEqual(1.0); // bounded total
    }
    expect(volleyLayers(0)).toBe(0);
    expect(volleyLayers(50)).toBe(3);
  });
});
