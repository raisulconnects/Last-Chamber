import { beforeEach, describe, expect, it } from 'vitest';
import { Input } from '../src/input';
import { TouchControls, stickVector } from '../src/touch';
import { ui } from '../src/ui';
import { View } from '../src/view';

type Handler = (e: unknown) => void;

/** Minimal fake canvas that records listeners so tests can dispatch pointer events. */
function fakeCanvas(width = 400, height = 800) {
  const handlers: Record<string, Handler[]> = {};
  return {
    addEventListener: (t: string, f: Handler) => {
      (handlers[t] ??= []).push(f);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    setPointerCapture: () => undefined,
    fire: (t: string, e: Record<string, unknown>) => (handlers[t] ?? []).forEach((f) => f({ preventDefault: () => undefined, pointerType: 'touch', ...e })),
  };
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = { addEventListener: () => undefined, devicePixelRatio: 1 };
  ui.touch = true;
});

describe('stickVector', () => {
  it('is zero inside the dead zone', () => {
    expect(stickVector(3, 0, 56)).toEqual({ x: 0, y: 0 });
    expect(stickVector(0, 0, 56)).toEqual({ x: 0, y: 0 });
  });

  it('points in the drag direction and never exceeds length 1', () => {
    const v = stickVector(300, 400, 56);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    expect(v.x / v.y).toBeCloseTo(0.75, 6);
  });

  it('snaps to full speed near the edge and scales smoothly in between', () => {
    expect(Math.hypot(...Object.values(stickVector(56 * 0.95, 0, 56)))).toBe(1);
    const mid = stickVector(56 * 0.5, 0, 56);
    expect(mid.x).toBeGreaterThan(0.3);
    expect(mid.x).toBeLessThan(0.85);
  });
});

describe('TouchControls', () => {
  it('does nothing while disabled', () => {
    const c = fakeCanvas();
    const t = new TouchControls(c as unknown as HTMLCanvasElement);
    c.fire('pointerdown', { pointerId: 1, clientX: 50, clientY: 600 });
    expect(t.states().move).toBeNull();
  });

  it('left half moves, right half aims; each stick takes one finger only', () => {
    const c = fakeCanvas();
    const t = new TouchControls(c as unknown as HTMLCanvasElement);
    t.setEnabled(true);
    c.fire('pointerdown', { pointerId: 1, clientX: 80, clientY: 600 });
    c.fire('pointerdown', { pointerId: 2, clientX: 320, clientY: 600 });
    c.fire('pointerdown', { pointerId: 3, clientX: 100, clientY: 650 }); // second finger on the left: ignored
    const st = t.states();
    expect(st.move?.base).toEqual({ x: 80, y: 600 });
    expect(st.aim?.base).toEqual({ x: 320, y: 600 });

    c.fire('pointermove', { pointerId: 1, clientX: 140, clientY: 600 });
    c.fire('pointermove', { pointerId: 3, clientX: 0, clientY: 0 }); // ignored finger does not move anything
    const mv = t.moveVector();
    expect(mv.x).toBeGreaterThan(0.9);
    expect(mv.y).toBe(0);
  });

  it('aim vector is null once released so the gun keeps its direction', () => {
    const c = fakeCanvas();
    const t = new TouchControls(c as unknown as HTMLCanvasElement);
    t.setEnabled(true);
    c.fire('pointerdown', { pointerId: 2, clientX: 320, clientY: 600 });
    c.fire('pointermove', { pointerId: 2, clientX: 320, clientY: 540 });
    expect(t.aimVector()).toMatchObject({ x: 0 });
    expect(t.aimVector()!.y).toBeLessThan(-0.9);
    c.fire('pointerup', { pointerId: 2 });
    expect(t.aimVector()).toBeNull();
  });

  it('knob is clamped to the stick radius', () => {
    const c = fakeCanvas();
    const t = new TouchControls(c as unknown as HTMLCanvasElement);
    t.radius = 50;
    t.setEnabled(true);
    c.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 500 });
    c.fire('pointermove', { pointerId: 1, clientX: 400, clientY: 500 });
    const k = t.states().move!;
    expect(k.pos.x - k.base.x).toBeCloseTo(50, 6);
  });

  it('disabling (phase change) resets both sticks; excluded points never start a stick', () => {
    const c = fakeCanvas();
    const t = new TouchControls(c as unknown as HTMLCanvasElement);
    t.exclude = (x, y) => x < 60 && y < 60;
    t.setEnabled(true);
    c.fire('pointerdown', { pointerId: 1, clientX: 20, clientY: 20 });
    expect(t.states().move).toBeNull();
    c.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 400 });
    c.fire('pointerdown', { pointerId: 3, clientX: 300, clientY: 400 });
    expect(t.states().move).not.toBeNull();
    t.setEnabled(false);
    expect(t.states()).toEqual({ move: null, aim: null });
  });

  it('ignores mouse pointers', () => {
    const c = fakeCanvas();
    const t = new TouchControls(c as unknown as HTMLCanvasElement);
    t.setEnabled(true);
    c.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 400, pointerType: 'mouse' });
    expect(t.states().move).toBeNull();
  });
});

describe('Input merges touch with keyboard/mouse', () => {
  it('touch stick overrides move; no aim stick means aim is null on touch devices', () => {
    const c = fakeCanvas();
    const input = new Input(c as unknown as HTMLCanvasElement, new View());
    input.touch.setEnabled(true);
    c.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 500 });
    c.fire('pointermove', { pointerId: 1, clientX: 100, clientY: 440 });
    c.fire('mousemove', { clientX: 10, clientY: 10, pointerType: 'mouse' }); // a stray synthesized mouse position
    const cmd = input.command({ x: 0, y: 0 });
    expect(cmd.move.y).toBeLessThan(-0.9);
    expect(cmd.aim).toBeNull(); // mouse must not override the stick on touch
  });

  it('with the aim stick pushed, aim follows it', () => {
    const c = fakeCanvas();
    const input = new Input(c as unknown as HTMLCanvasElement, new View());
    input.touch.setEnabled(true);
    c.fire('pointerdown', { pointerId: 2, clientX: 300, clientY: 500 });
    c.fire('pointermove', { pointerId: 2, clientX: 360, clientY: 500 });
    expect(input.command({ x: 0, y: 0 }).aim!.x).toBeGreaterThan(0.9);
  });

  it('on desktop (not touch) the mouse still aims', () => {
    ui.touch = false;
    const c = fakeCanvas();
    const view = new View();
    view.resize(400, 800);
    const input = new Input(c as unknown as HTMLCanvasElement, view);
    c.fire('mousemove', { clientX: 300, clientY: 400, pointerType: 'mouse' });
    const aim = input.command({ x: 0, y: 0 }).aim!;
    expect(aim.x).toBeGreaterThan(0);
  });
});
