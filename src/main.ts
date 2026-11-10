import { AudioManager } from './audio';
import { loadFloorTiles } from './assets';
import { BotBrain } from './bot';
import { CONFIG } from './config';
import { GameEventDetector } from './events';
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
const audio = new AudioManager();
const detector = new GameEventDetector();

// Floor art is optional: if loading fails the arena keeps a plain fill.
void loadFloorTiles()
  .then((tiles) => renderer.arena.setTiles(tiles))
  .catch(() => undefined);

match.onStart = () => {
  brains.clear();
  for (const p of match.players) if (!p.isHuman) brains.set(p.id, new BotBrain(p.id));
  input.clearKeys();
};
match.onReveal = (info) => {
  for (const b of brains.values()) b.observe(info);
};

function startOrRestart(): void {
  audio.unlock(); // user gesture: safe place to create/resume the AudioContext
  audio.stopAll();
  match.start();
  audio.click();
  audio.handle(detector.matchStarted());
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

// ---- audio controls (DOM) ---------------------------------------------------------------
const muteBtn = document.getElementById('mute') as HTMLButtonElement | null;
const volSlider = document.getElementById('volume') as HTMLInputElement | null;

function syncAudioUi(): void {
  if (muteBtn) {
    muteBtn.textContent = audio.muted ? 'Sound: OFF' : 'Sound: ON';
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
  }
  if (volSlider) volSlider.value = String(Math.round(audio.volume * 100));
}
function toggleMute(): void {
  audio.unlock();
  audio.toggleMute();
  if (!audio.muted) audio.click();
  syncAudioUi();
}
muteBtn?.addEventListener('click', () => {
  toggleMute();
  muteBtn.blur(); // keep keyboard focus on the game
});
volSlider?.addEventListener('input', () => {
  audio.unlock();
  audio.setVolume(Number(volSlider.value) / 100);
});
volSlider?.addEventListener('change', () => {
  audio.click();
  volSlider.blur();
});
syncAudioUi();

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Enter' && match.phase === 'READY') startOrRestart();
  else if (k === 'r' && match.phase !== 'READY') startOrRestart();
  else if (k === 'm') toggleMute();
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
    audio.handle(detector.update(match)); // events are emitted once per state change
    acc -= STEP;
  }
  renderer.draw(match);
}
requestAnimationFrame(frame);
