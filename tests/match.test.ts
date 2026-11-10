import { describe, expect, it } from 'vitest';
import { BotBrain } from '../src/bot';
import { CONFIG } from '../src/config';
import { Match } from '../src/match';
import type { Command } from '../src/types';

const STEP = 1 / CONFIG.tickRate;
const none = new Map<number, Command>();

function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function runHidden(m: Match, cmds: ReadonlyMap<number, Command> = none): void {
  const round = m.round;
  let guard = 0;
  while (m.phase === 'HIDDEN' && m.round === round && guard++ < 100000) m.update(STEP, cmds);
}
function runReveal(m: Match): void {
  let guard = 0;
  while (m.phase === 'REVEAL' && guard++ < 100000) m.update(STEP, none);
}
/** Place players explicitly (all alive). */
function setup(m: Match, spec: { pos: [number, number]; aim: [number, number] }[]): void {
  m.start();
  m.players = m.players.slice(0, spec.length);
  spec.forEach((s, i) => {
    m.players[i].pos = { x: s.pos[0], y: s.pos[1] };
    m.players[i].aim = { x: s.aim[0], y: s.aim[1] };
  });
}

describe('match flow', () => {
  it('start creates 1 human + 2 bots at non-overlapping positions inside the arena', () => {
    const m = new Match(seeded(7));
    m.start();
    expect(m.phase).toBe('HIDDEN');
    expect(m.players.filter((p) => p.isHuman)).toHaveLength(1);
    expect(m.players).toHaveLength(3);
    for (const p of m.players) expect(Math.hypot(p.pos.x, p.pos.y) + p.radius).toBeLessThanOrEqual(CONFIG.arenaRadius);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        expect(Math.hypot(m.players[i].pos.x - m.players[j].pos.x, m.players[i].pos.y - m.players[j].pos.y)).toBeGreaterThanOrEqual(2 * CONFIG.playerRadius);
  });

  it('resolves exactly once even if many frames follow the deadline', () => {
    const m = new Match(seeded(3));
    m.start();
    runHidden(m);
    expect(m.resolutionCount).toBe(1);
    // keep ticking within REVEAL: no re-resolution
    for (let i = 0; i < 30; i++) m.update(STEP, none);
    expect(m.resolutionCount).toBe(1);
  });

  it('timer expiry freezes movement: commands past the deadline change nothing', () => {
    const m = new Match(seeded(5));
    m.start();
    const cmds = new Map<number, Command>([[0, { move: { x: 1, y: 0 }, aim: { x: 0, y: 1 } }]]);
    runHidden(m, cmds);
    const snapPos = m.snapshot.find((p) => p.id === 0)!.pos;
    const snapAim = m.snapshot.find((p) => p.id === 0)!.aim;
    for (let i = 0; i < 20; i++) m.update(STEP, cmds);
    const p = m.players.find((q) => q.id === 0)!;
    expect(p.pos).toEqual({ x: snapPos.x, y: snapPos.y });
    expect(p.aim).toEqual({ x: snapAim.x, y: snapAim.y });
  });

  it('mutual kill of the final two is a draw', () => {
    const m = new Match();
    setup(m, [
      { pos: [-50, 0], aim: [1, 0] },
      { pos: [50, 0], aim: [-1, 0] },
    ]);
    runHidden(m);
    runReveal(m);
    expect(m.phase).toBe('GAME_OVER');
    expect(m.outcome).toEqual({ kind: 'draw' });
  });

  it('single survivor wins', () => {
    const m = new Match();
    setup(m, [
      { pos: [-50, 0], aim: [1, 0] },
      { pos: [50, 0], aim: [0, 1] },
    ]);
    runHidden(m);
    runReveal(m);
    expect(m.outcome).toEqual({ kind: 'win', winnerId: 0 });
  });

  it('survivors keep position and aim; safe circle shrinks; round increments', () => {
    const m = new Match();
    setup(m, [
      { pos: [-100, 0], aim: [0, 1] },
      { pos: [100, 0], aim: [0, 1] },
      { pos: [0, 100], aim: [0, 1] },
    ]);
    // Everyone aims along +y but is out of each other's line: ensure nobody dies.
    m.players[2].aim = { x: 0, y: -1 };
    m.players[2].pos = { x: 0, y: 150 };
    runHidden(m);
    // player 2 at (0,150) aims up toward (0,0): empty -> nobody dies
    expect(m.alivePlayers).toHaveLength(3);
    runReveal(m);
    expect(m.phase).toBe('HIDDEN');
    expect(m.round).toBe(2);
    expect(m.safeRadius).toBeCloseTo(CONFIG.arenaRadius * CONFIG.safeRadiusMultiplier, 6);
    expect(m.players[0].pos).toEqual({ x: -100, y: 0 });
    expect(m.snapshot).toHaveLength(0); // reveal artifacts gone during HIDDEN
    expect(m.result).toBeNull();
  });

  it('outside-circle players die only at resolution', () => {
    const m = new Match();
    setup(m, [
      { pos: [-100, 0], aim: [0, 1] },
      { pos: [100, 0], aim: [0, 1] },
      { pos: [0, 100], aim: [0, 1] },
    ]);
    m.safeRadius = 150;
    m.players[0].pos = { x: -200, y: 0 };
    for (let i = 0; i < 60; i++) m.update(STEP, none);
    expect(m.players[0].alive).toBe(true);
    runHidden(m);
    expect(m.players[0].alive).toBe(false);
  });

  it('round limit ends in a draw with multiple survivors', () => {
    const m = new Match();
    setup(m, [
      { pos: [-100, 0], aim: [0, 1] },
      { pos: [100, 0], aim: [0, 1] },
    ]);
    // aim away so nobody dies; keep within min safe radius by placing near center
    m.players[0].pos = { x: -10, y: 0 };
    m.players[1].pos = { x: 10, y: 0 };
    m.players[0].aim = { x: -1, y: 0 };
    m.players[1].aim = { x: 1, y: 0 };
    for (let r = 0; r < CONFIG.maxRounds + 2 && m.phase !== 'GAME_OVER'; r++) {
      runHidden(m);
      runReveal(m);
    }
    expect(m.phase).toBe('GAME_OVER');
    expect(m.round).toBe(CONFIG.maxRounds);
    expect(m.outcome).toEqual({ kind: 'draw' });
  });

  it('restart clears previous-match state', () => {
    const m = new Match(seeded(9));
    m.start();
    runHidden(m);
    runReveal(m);
    m.start();
    expect(m.round).toBe(1);
    expect(m.safeRadius).toBe(CONFIG.arenaRadius);
    expect(m.result).toBeNull();
    expect(m.snapshot).toHaveLength(0);
    expect(m.outcome).toBeNull();
    expect(m.resolutionCount).toBe(0);
    expect(m.alivePlayers).toHaveLength(3);
    expect(m.timeLeft).toBe(CONFIG.hiddenDuration);
    m.reset();
    expect(m.phase).toBe('READY');
    expect(m.players).toHaveLength(0);
  });

  it('human death does not stop the match', () => {
    const m = new Match();
    setup(m, [
      { pos: [-50, 0], aim: [0, 1] }, // human, aims at nothing
      { pos: [50, 0], aim: [-1, 0] }, // bot 1 kills the human
      { pos: [0, 150], aim: [0, 1] }, // bot 2 aims out
    ]);
    runHidden(m);
    expect(m.players[0].alive).toBe(false);
    runReveal(m);
    expect(m.phase).toBe('HIDDEN');
  });
});

describe('bot', () => {
  it('only learns positions from revealed info and clears on reset', () => {
    const rng = seeded(11);
    const b = new BotBrain(1, rng);
    const self = { pos: { x: 0, y: 0 }, radius: 12 };
    const round = { safeRadius: 320, progress: 0 };
    const c = b.think(self, round, 1 / 60);
    expect(c.aim).not.toBeNull();
    b.observe({
      round: 1,
      snapshot: [
        { id: 0, pos: { x: 100, y: 0 }, aim: { x: 1, y: 0 }, radius: 12 },
        { id: 1, pos: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, radius: 12 },
      ],
      result: { shots: [], shotDeaths: [], boundaryDeaths: [], deaths: [] },
    });
    // With a tiny noise it should aim near +x at least sometimes.
    let near = 0;
    for (let i = 0; i < 50; i++) {
      b.observe({
        round: 1,
        snapshot: [{ id: 0, pos: { x: 100, y: 0 }, aim: { x: 1, y: 0 }, radius: 12 }],
        result: { shots: [], shotDeaths: [], boundaryDeaths: [], deaths: [] },
      });
      const a = b.think(self, round, 1 / 60).aim!;
      if (a.x > 0.9) near++;
    }
    expect(near).toBeGreaterThan(10);
    b.reset();
  });

  it('heads inside the safe circle when outside it', () => {
    const b = new BotBrain(1, seeded(2));
    const c = b.think({ pos: { x: 300, y: 0 }, radius: 12 }, { safeRadius: 100, progress: 0 }, 1 / 60);
    expect(c.move.x).toBeLessThan(0);
  });
});
