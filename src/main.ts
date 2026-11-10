import { BotBrain } from './bot';
import { CONFIG } from './config';
import { Input } from './input';
import { Match } from './match';
import { Renderer } from './render';
import type { Command } from './types';
import { View } from './view';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const view = new View();
const renderer = new Renderer(canvas, view);
const input = new Input(canvas, view);
const match = new Match();
const brains = new Map<number, BotBrain>();

match.onStart = () => {
  brains.clear();
  for (const p of match.players) if (!p.isHuman) brains.set(p.id, new BotBrain(p.id));
  input.clearKeys();
};
match.onReveal = (info) => {
  for (const b of brains.values()) b.observe(info);
};

function startOrRestart(): void {
  match.start();
}

function collectCommands(dt: number): Map<number, Command> {
  const cmds = new Map<number, Command>();
  if (match.phase !== 'HIDDEN') return cmds;
  const progress = 1 - match.timeLeft / CONFIG.hiddenDuration;
  for (const p of match.players) {
    if (!p.alive) continue;
    if (p.isHuman) cmds.set(p.id, input.command(p.pos));
    else cmds.set(p.id, brains.get(p.id)!.think({ pos: p.pos, radius: p.radius }, { safeRadius: match.safeRadius, progress }, dt));
  }
  return cmds;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && match.phase === 'READY') startOrRestart();
  else if (e.key.toLowerCase() === 'r' && match.phase !== 'READY') startOrRestart();
});

canvas.addEventListener('click', (e) => {
  const b = renderer.button;
  if (!b) return;
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) startOrRestart();
});

window.addEventListener('resize', () => renderer.resize());
renderer.resize();

// Fixed-step loop driven by simulation time. Frozen while the tab is hidden.
const STEP = 1 / CONFIG.tickRate;
const MAX_FRAME = 0.25;
let last: number | null = null;
let acc = 0;

document.addEventListener('visibilitychange', () => {
  last = null; // drop timing so resuming never produces a catch-up step
  acc = 0;
  input.clearKeys();
});

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (document.hidden) {
    last = null;
    return;
  }
  if (last === null) last = now;
  acc += Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;

  while (acc >= STEP) {
    match.update(STEP, collectCommands(STEP));
    acc -= STEP;
  }
  renderer.draw(match);
}
requestAnimationFrame(frame);
