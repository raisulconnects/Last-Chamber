import { AudioManager } from './audio';
import { loadFloorTiles } from './assets';
import { BotBrain } from './bot';
import { CONFIG } from './config';
import { GameEventDetector } from './events';
import { Input } from './input';
import { Match } from './match';
import { MenuModel } from './menu/menuModel';
import type { MenuAction, MenuEnv } from './menu/menuModel';
import { Renderer } from './render';
import { DIFFICULTY, loadPrefs, savePrefs } from './settings';
import { THEME } from './theme';
import { ui } from './ui';
import type { MatchSettings } from './settings';
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

// Track whether the player is using touch or mouse so the UI can adapt (hybrids switch live).
window.addEventListener(
  'pointerdown',
  (e) => {
    ui.touch = e.pointerType === 'touch';
    if (e.pointerType === 'touch') suppressClick = false;
  },
  true,
);
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') ui.touch = false;
});
let suppressClick = false; // set when a finger drag scrolled a menu, so the trailing click is ignored
input.touch.exclude = (x, y) => {
  const r = renderer.menuPill;
  return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
};

const prefs = loadPrefs();
renderer.reduceFlashing = prefs.reduceFlashing;
const env: MenuEnv = { volume: audio.volume, muted: audio.muted, reduceFlashing: prefs.reduceFlashing };
const menu = new MenuModel(env);

// Floor art is optional: if loading fails the arena keeps a plain fill.
void loadFloorTiles()
  .then((tiles) => renderer.arena.setTiles(tiles))
  .catch(() => undefined);

match.onStart = () => {
  brains.clear();
  const profile = DIFFICULTY[match.settings.botDifficulty];
  for (const p of match.players) if (!p.isHuman) brains.set(p.id, new BotBrain(p.id, Math.random, profile));
  input.clearKeys();
};
match.onReveal = (info) => {
  for (const b of brains.values()) b.observe(info);
};

const inMenu = (): boolean => match.phase === 'READY';

/** Start (or restart) a match. Without settings it reuses the last mode. */
function startMatch(settings?: MatchSettings): void {
  audio.unlock(); // user gesture: safe place to create/resume the AudioContext
  audio.stopAll();
  match.start(settings);
  audio.click();
  audio.handle(detector.matchStarted());
}

function leaveToMenu(): void {
  audio.stopAll();
  match.reset();
  detector.reset();
  menu.toMain();
  input.clearKeys();
}

function collectCommands(dt: number): Map<number, Command> {
  const cmds = new Map<number, Command>();
  if (match.phase !== 'HIDDEN') return cmds;
  const progress = 1 - match.timeLeft / match.settings.hiddenDuration;
  for (const p of match.players) {
    if (!p.alive) continue;
    if (p.isHuman) cmds.set(p.id, input.command(p.pos));
    else cmds.set(p.id, brains.get(p.id)!.think({ pos: p.pos, radius: p.radius }, { safeRadius: match.safeRadius, progress }, dt));
  }
  return cmds;
}

// ---- audio controls (DOM) + menu settings sync -----------------------------------------------
const muteBtn = document.getElementById('mute') as HTMLButtonElement | null;
const volSlider = document.getElementById('volume') as HTMLInputElement | null;

function syncAudioUi(): void {
  env.volume = audio.volume;
  env.muted = audio.muted;
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
  syncAudioUi();
});
volSlider?.addEventListener('change', () => {
  audio.click();
  volSlider.blur();
});
syncAudioUi();

function applyMenuAction(a: MenuAction | null): void {
  if (!a) return;
  switch (a.type) {
    case 'start':
      startMatch(a.settings);
      break;
    case 'setVolume':
      audio.unlock();
      audio.setVolume(a.value);
      syncAudioUi();
      break;
    case 'toggleMute':
      toggleMute();
      break;
    case 'setReduceFlashing':
      prefs.reduceFlashing = a.value;
      env.reduceFlashing = a.value;
      renderer.reduceFlashing = a.value;
      savePrefs(prefs);
      break;
  }
}

// ---- keyboard --------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.repeat && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const k = e.key.toLowerCase();
  if (k === 'm' && !e.ctrlKey && !e.metaKey) {
    toggleMute();
    return;
  }

  if (inMenu()) {
    audio.unlock();
    let handled = true;
    if (k === 'arrowup' || k === 'w') menu.move(-1);
    else if (k === 'arrowdown' || k === 's') menu.move(1);
    else if (k === 'arrowleft' || k === 'a') {
      audio.click();
      applyMenuAction(menu.adjust(-1));
    } else if (k === 'arrowright' || k === 'd') {
      audio.click();
      applyMenuAction(menu.adjust(1));
    } else if (k === 'enter' || k === ' ') {
      audio.click();
      applyMenuAction(menu.activate());
    } else if (k === 'escape' || k === 'backspace') {
      if (menu.back()) audio.click();
    } else handled = false;
    if (handled) e.preventDefault();
    return;
  }

  // In a match
  if (k === 'escape') leaveToMenu();
  else if (k === 'r' || (k === 'enter' && match.phase === 'GAME_OVER')) startMatch();
});

// ---- mouse -----------------------------------------------------------------------------------
function canvasPoint(e: MouseEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('mousemove', (e) => {
  if (!inMenu()) return;
  const p = canvasPoint(e);
  const hit = renderer.menu.hit(p.x, p.y);
  if (hit) menu.hover(hit.index);
  canvas.style.cursor = hit ? 'pointer' : 'default';
});

let menuDrag: { id: number; startY: number; startScroll: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && inMenu()) menuDrag = { id: e.pointerId, startY: e.clientY, startScroll: menu.scroll, moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!menuDrag || menuDrag.id !== e.pointerId) return;
  const dy = e.clientY - menuDrag.startY;
  if (Math.abs(dy) > 8) menuDrag.moved = true;
  if (menuDrag.moved) menu.scroll = Math.max(0, Math.min(menu.maxScroll, menuDrag.startScroll - dy));
});
const endDrag = (e: PointerEvent): void => {
  if (menuDrag && menuDrag.id === e.pointerId) {
    suppressClick = menuDrag.moved;
    menuDrag = null;
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

let quitArmedAt = 0;

canvas.addEventListener('click', (e) => {
  const p = canvasPoint(e);
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  // Touch MENU pill: first tap arms, second tap within 2.5s quits to the menu.
  const pill = renderer.menuPill;
  if (!inMenu() && pill && p.x >= pill.x && p.x <= pill.x + pill.w && p.y >= pill.y && p.y <= pill.y + pill.h) {
    if (performance.now() - quitArmedAt < 2500) leaveToMenu();
    else quitArmedAt = performance.now();
    return;
  }
  if (inMenu()) {
    audio.unlock();
    const hit = renderer.menu.hit(p.x, p.y);
    if (!hit) return;
    audio.click();
    applyMenuAction(menu.clickItem(hit.index, hit.part));
    return;
  }
  for (const b of renderer.buttons) {
    const r = b.rect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
      if (b.id === 'restart') startMatch();
      else leaveToMenu();
      return;
    }
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (inMenu() && menu.screen === 'changelog') {
      menu.move(e.deltaY > 0 ? 1 : -1);
      e.preventDefault();
    }
  },
  { passive: false },
);

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
window.visualViewport?.addEventListener('resize', () => renderer.resize());
renderer.resize();

// Fullscreen button: only shown where the browser supports it (not on iPhone Safari).
const fsBtn = document.getElementById('fullscreen') as HTMLButtonElement | null;
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
if (fsBtn && (document.fullscreenEnabled || (document as FsDoc).webkitExitFullscreen)) {
  fsBtn.hidden = false;
  const syncFs = (): void => {
    fsBtn.textContent = document.fullscreenElement || (document as FsDoc).webkitFullscreenElement ? 'Exit' : 'Full';
    setTimeout(() => renderer.resize(), 150);
  };
  fsBtn.addEventListener('click', () => {
    try {
      const d = document as FsDoc;
      if (document.fullscreenElement || d.webkitFullscreenElement) {
        void (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      } else {
        const el = document.documentElement as FsEl;
        void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* fullscreen is best-effort */
    }
    fsBtn.blur();
  });
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);
}

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

  if (inMenu()) {
    acc = 0;
    renderer.drawMenu(menu);
    return;
  }
  canvas.style.cursor = 'crosshair';
  const human = match.players.find((p) => p.isHuman);
  input.touch.radius = THEME.touch.stickRadius * renderer.u;
  input.touch.setEnabled(match.phase === 'HIDDEN' && !!human && human.alive);
  renderer.touchSticks = input.touch.states();
  renderer.quitArmed = performance.now() - quitArmedAt < 2500;
  while (acc >= STEP) {
    match.update(STEP, collectCommands(STEP));
    audio.handle(detector.update(match)); // events are emitted once per state change
    acc -= STEP;
  }
  renderer.draw(match);
}
requestAnimationFrame(frame);
