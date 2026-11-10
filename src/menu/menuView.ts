import type { ArenaRenderer } from '../arena';
import { drawCharacter, drawShadow } from '../characters';
import { CHANGELOG } from '../changelog';
import { CONFIG, PLAYER_STYLES } from '../config';
import { CREDITS } from '../credits';
import { THEME } from '../theme';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../version';
import { View } from '../view';
import { HOWTO_PAGES } from './menuModel';
import type { ClickPart, MenuItem, MenuModel } from './menuModel';

const C = THEME.colors;
const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  index: number;
  part: ClickPart;
}

const TITLES: Record<string, string> = {
  play: 'PLAY',
  single: 'SINGLE PLAYER',
  custom: 'CUSTOM MATCH',
  multiplayer: 'MULTIPLAYER',
  howto: 'HOW TO PLAY',
  settings: 'SETTINGS',
  credits: 'CREDITS',
  changelog: 'CHANGELOG',
};

const HOWTO_TEXT: { title: string; lines: string[] }[] = [
  {
    title: '1. Move and aim in secret',
    lines: [
      'You can see yourself, but nobody else.',
      'WASD / arrows move you. The mouse aims your gun.',
      'Opponents are invisible until the timer ends.',
    ],
  },
  {
    title: '2. Everyone fires at once',
    lines: [
      'At zero, positions lock and everyone is revealed.',
      'Each player fires one instant shot that hits the first player in line.',
      'Mutual kills are possible. There is no fire button.',
    ],
  },
  {
    title: '3. Stay inside the circle',
    lines: [
      'End every round inside the green circle or you are out.',
      'The circle shrinks each round and never pushes you.',
      'Last one standing wins.',
    ],
  },
];

/** Canvas menu renderer. Rebuilds a list of clickable regions every frame. */
export class MenuView {
  regions: Region[] = [];
  private mini = new View();

  hit(x: number, y: number): Region | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    view: View,
    arena: ArenaRenderer,
    model: MenuModel,
    now: number,
    u: number,
  ): void {
    this.regions = [];
    const W = view.cssWidth;
    const H = view.cssHeight;

    // Animated background: the real arena with purely decorative idle characters.
    ctx.fillStyle = C.background;
    ctx.fillRect(0, 0, W, H);
    arena.update(CONFIG.arenaRadius, now);
    arena.draw(ctx, view, now, false);
    this.drawDecor(ctx, view, now);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(6, 8, 14, 0.62)');
    g.addColorStop(1, 'rgba(6, 8, 14, 0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const screen = model.screen;
    let top: number;
    if (screen === 'main' || screen === 'play') {
      top = this.drawTitle(ctx, W, H, now, u, screen === 'main' ? 1 : 0.8);
    } else {
      this.text(ctx, TITLES[screen], W / 2, 62 * u, 900, 30 * u, C.text, 'center', 3 * u);
      this.line(ctx, W / 2 - 40 * u, 76 * u, 80 * u, C.hiddenAccent);
      top = 104 * u;
    }

    switch (screen) {
      case 'main':
      case 'play':
        this.drawItems(ctx, model, W, top, 56 * u, 12 * u, u, H);
        break;
      case 'single':
        this.drawItems(ctx, model, W, top, 56 * u, 8 * u, u, H);
        break;
      case 'custom':
        this.drawItems(ctx, model, W, top, 40 * u, 6 * u, u, H);
        break;
      case 'settings':
        this.drawItems(ctx, model, W, top, 52 * u, 10 * u, u, H);
        break;
      case 'multiplayer':
        this.drawMultiplayer(ctx, model, W, H, top, u);
        break;
      case 'howto':
        this.drawHowTo(ctx, model, W, H, top, u, now);
        break;
      case 'credits':
        this.drawCredits(ctx, model, W, H, top, u);
        break;
      case 'changelog':
        this.drawChangelog(ctx, model, W, H, top, u);
        break;
    }

    // Footer: version and key hints.
    ctx.textBaseline = 'alphabetic';
    this.text(ctx, `v${APP_VERSION}`, 16 * u, H - 16 * u, 700, 12 * u, C.textDim, 'left');
    this.text(ctx, 'Up/Down select   Left/Right adjust   Enter confirm   Esc back', W / 2, H - 16 * u, 600, 12 * u, C.textDim, 'center');
  }

  // ---- background decoration ------------------------------------------------------------

  private drawDecor(ctx: CanvasRenderingContext2D, view: View, now: number): void {
    const r = CONFIG.arenaRadius * 0.55;
    for (let i = 0; i < 3; i++) {
      const a = now * 0.12 + (i * Math.PI * 2) / 3;
      const pos = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      const aimA = a + Math.PI + Math.sin(now * 0.5 + i) * 0.5; // loosely facing the middle
      const aim = { x: Math.cos(aimA), y: Math.sin(aimA) };
      const st = PLAYER_STYLES[i];
      drawShadow(ctx, view, pos, 0.8);
      drawCharacter(ctx, view, pos, aim, { color: st.color, name: st.name, isHuman: false, time: now + i, alpha: 0.85 });
    }
  }

  // ---- text / shape helpers --------------------------------------------------------------

  private text(
    ctx: CanvasRenderingContext2D,
    s: string,
    x: number,
    y: number,
    weight: number,
    px: number,
    color: string,
    align: CanvasTextAlign = 'left',
    spacing = 0,
  ): void {
    ctx.font = `${weight} ${Math.round(px)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    c.letterSpacing = spacing ? `${spacing}px` : '0px';
    ctx.fillText(s, x, y);
    c.letterSpacing = '0px';
  }

  private line(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 3);
  }

  private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
    const words = s.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- title ------------------------------------------------------------------------------

  /** Revolver cylinder emblem + wordmark. Returns the y where menu items should start. */
  private drawTitle(ctx: CanvasRenderingContext2D, W: number, H: number, now: number, u: number, scale: number): number {
    const s = scale * u;
    const cx = W / 2;
    const cy = Math.max(70 * s + 12, H * 0.15) + (scale < 1 ? 0 : 0);
    const R = 38 * s;

    ctx.save();
    ctx.translate(cx, cy);
    // chamber advance: steps 60 degrees every ~2.4s with an ease
    const step = Math.floor(now / 2.4);
    const ph = (now / 2.4) % 1;
    const ease = ph < 0.18 ? 1 - Math.pow(1 - ph / 0.18, 3) : 1;
    const rot = (step + ease) * (Math.PI / 3);
    ctx.rotate(rot);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#2b3038';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = '#8896ab';
    ctx.stroke();
    // chambers
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * R * 0.62;
      const py = Math.sin(a) * R * 0.62;
      const loaded = i === 0;
      ctx.beginPath();
      ctx.arc(px, py, R * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = loaded ? C.revealAccent : '#0c1018';
      if (loaded) {
        ctx.shadowColor = C.revealAccent;
        ctx.shadowBlur = 14;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#8896ab';
    ctx.fill();
    ctx.restore();

    // wordmark
    const ty = cy + R + 44 * s;
    const fs = 46 * s;
    ctx.save();
    ctx.font = `900 ${Math.round(fs)}px ${FONT}`;
    ctx.textAlign = 'center';
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    c.letterSpacing = `${6 * s}px`;
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineJoin = 'round';
    const name = APP_NAME.toUpperCase();
    ctx.strokeText(name, cx, ty);
    const g = ctx.createLinearGradient(0, ty - fs, 0, ty);
    g.addColorStop(0, '#f4f7fb');
    g.addColorStop(1, '#9fb0c6');
    ctx.fillStyle = g;
    ctx.fillText(name, cx, ty);
    c.letterSpacing = '0px';
    ctx.restore();
    this.text(ctx, APP_TAGLINE.toUpperCase(), cx, ty + 24 * s, 700, 13 * s, C.revealAccent, 'center', 4 * s);
    return ty + 52 * s;
  }

  // ---- generic item list ------------------------------------------------------------------

  private drawItems(
    ctx: CanvasRenderingContext2D,
    model: MenuModel,
    W: number,
    top: number,
    itemH: number,
    gap: number,
    u: number,
    H: number,
  ): void {
    const items = model.items();
    const w = Math.min(460 * u, W - 32);
    const x = (W - w) / 2;
    // Compress if the window is short so everything stays on screen.
    const need = items.length * (itemH + gap);
    const avail = H - top - 40 * u;
    const k = need > avail ? Math.max(0.7, avail / need) : 1;
    const ih = itemH * k;
    const ig = gap * k;
    let y = top;
    items.forEach((it, i) => {
      this.drawItem(ctx, it, i, x, y, w, ih, u, i === model.focus);
      y += ih + ig;
    });
  }

  private drawItem(
    ctx: CanvasRenderingContext2D,
    it: MenuItem,
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    u: number,
    focused: boolean,
  ): void {
    const accent = it.primary ? C.hiddenAccent : '#ffffff';
    this.rr(ctx, x, y, w, h, 12 * u);
    ctx.fillStyle = it.primary ? (focused ? '#7fdcf7' : C.hiddenAccent) : focused ? 'rgba(40, 52, 72, 0.95)' : 'rgba(14, 18, 28, 0.86)';
    ctx.fill();
    if (focused) {
      ctx.save();
      ctx.shadowColor = C.hiddenAccent;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = C.hiddenAccent;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.stroke();
    }
    this.regions.push({ x, y, w, h, index, part: 'main' });

    const dark = it.primary;
    const labelColor = dark ? '#0b1117' : it.badge ? C.textDim : C.text;
    const mid = y + h / 2;

    if (it.kind === 'button') {
      const hasSub = !!it.hint;
      this.text(ctx, it.label, x + (hasSub ? 18 * u : w / 2), mid + (hasSub ? -2 * u : 6 * u), 800, 18 * u, labelColor, hasSub ? 'left' : 'center', 1 * u);
      if (hasSub) this.text(ctx, it.hint!, x + 18 * u, mid + 17 * u, 600, 12 * u, dark ? '#16303a' : C.textDim, 'left');
      if (it.badge) {
        const bw = 112 * u;
        this.rr(ctx, x + w - bw - 14 * u, mid - 12 * u, bw, 24 * u, 12 * u);
        ctx.fillStyle = 'rgba(255,179,71,0.18)';
        ctx.fill();
        this.text(ctx, it.badge, x + w - bw / 2 - 14 * u, mid + 4.5 * u, 800, 11 * u, C.revealAccent, 'center', 1 * u);
      }
      void accent;
    } else if (it.kind === 'stepper') {
      this.text(ctx, it.label, x + 18 * u, mid + 5.5 * u, 700, 16 * u, labelColor, 'left');
      const aw = 30 * u;
      const vw = Math.min(150 * u, w * 0.4);
      const inc = { x: x + w - 12 * u - aw, y: y + 4 * u, w: aw, h: h - 8 * u };
      const val = { x: inc.x - vw, y: inc.y, w: vw, h: inc.h };
      const dec = { x: val.x - aw, y: inc.y, w: aw, h: inc.h };
      this.arrow(ctx, dec, -1, focused);
      this.arrow(ctx, inc, 1, focused);
      this.text(ctx, it.value ?? '', val.x + vw / 2, mid + 5.5 * u, 800, 15 * u, focused ? C.hiddenAccent : C.text, 'center');
      this.regions.push({ ...dec, index, part: 'dec' }, { ...inc, index, part: 'inc' });
    } else {
      this.text(ctx, it.label, x + 18 * u, mid + 5.5 * u, 700, 16 * u, labelColor, 'left');
      const on = it.value === 'ON';
      const pw = 64 * u;
      this.rr(ctx, x + w - 14 * u - pw, mid - 13 * u, pw, 26 * u, 13 * u);
      ctx.fillStyle = on ? 'rgba(93,211,158,0.25)' : 'rgba(139,151,168,0.2)';
      ctx.fill();
      this.text(ctx, it.value ?? '', x + w - 14 * u - pw / 2, mid + 5 * u, 800, 13 * u, on ? C.win : C.textDim, 'center');
    }
  }

  private arrow(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, dir: 1 | -1, focused: boolean): void {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const s = Math.min(r.w, r.h) * 0.28;
    ctx.fillStyle = focused ? C.hiddenAccent : C.textDim;
    ctx.beginPath();
    ctx.moveTo(cx + dir * s, cy);
    ctx.lineTo(cx - dir * s * 0.8, cy - s);
    ctx.lineTo(cx - dir * s * 0.8, cy + s);
    ctx.closePath();
    ctx.fill();
  }

  // ---- individual screens -------------------------------------------------------------------

  private backButton(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, y: number, u: number): void {
    const items = model.items();
    const idx = items.findIndex((i) => i.id === 'back');
    if (idx < 0) return;
    const w = 200 * u;
    this.drawItem(ctx, items[idx], idx, (W - w) / 2, y, w, 46 * u, u, model.focus === idx);
  }

  private drawMultiplayer(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, top: number, u: number): void {
    const cy = Math.max(top + 40 * u, H * 0.38);
    this.text(ctx, 'COMING SOON', W / 2, cy, 900, 40 * u, C.revealAccent, 'center', 4 * u);
    ctx.font = `600 ${Math.round(16 * u)}px ${FONT}`;
    const lines = this.wrap(ctx, 'Online matches are on the roadmap. For now, take on the bots in Single Player.', Math.min(520 * u, W - 48));
    lines.forEach((l, i) => this.text(ctx, l, W / 2, cy + 40 * u + i * 24 * u, 600, 16 * u, '#b7c0cc', 'center'));
    this.backButton(ctx, model, W, cy + 60 * u + lines.length * 24 * u, u);
  }

  private drawCredits(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, top: number, u: number): void {
    const w = Math.min(560 * u, W - 32);
    const x = (W - w) / 2;
    const h = Math.min(H - top - 90 * u, 330 * u);
    this.rr(ctx, x, top, w, h, 16 * u);
    ctx.fillStyle = 'rgba(14, 18, 28, 0.86)';
    ctx.fill();
    let y = top + 38 * u;
    this.text(ctx, 'CREATED BY', W / 2, y, 800, 12 * u, C.textDim, 'center', 3 * u);
    y += 34 * u;
    this.text(ctx, CREDITS.creator.name, W / 2, y, 900, 28 * u, C.text, 'center');
    if (CREDITS.creator.role) {
      y += 26 * u;
      this.text(ctx, CREDITS.creator.role, W / 2, y, 600, 15 * u, C.hiddenAccent, 'center');
    }
    for (const l of CREDITS.creator.links) {
      y += 22 * u;
      this.text(ctx, l, W / 2, y, 600, 14 * u, '#b7c0cc', 'center');
    }
    y += 40 * u;
    this.text(ctx, 'THANKS & ASSETS', W / 2, y, 800, 12 * u, C.textDim, 'center', 3 * u);
    for (const l of CREDITS.thirdParty) {
      y += 24 * u;
      this.text(ctx, l, W / 2, y, 600, 14 * u, '#b7c0cc', 'center');
    }
    this.backButton(ctx, model, W, top + h + 18 * u, u);
  }

  private drawChangelog(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, top: number, u: number): void {
    const w = Math.min(640 * u, W - 32);
    const x = (W - w) / 2;
    const viewH = Math.max(120 * u, H - top - 100 * u);
    this.rr(ctx, x, top, w, viewH, 16 * u);
    ctx.fillStyle = 'rgba(14, 18, 28, 0.86)';
    ctx.fill();

    ctx.save();
    this.rr(ctx, x, top, w, viewH, 16 * u);
    ctx.clip();
    let y = top + 28 * u - model.scroll;
    const innerW = w - 48 * u;
    CHANGELOG.forEach((e, ei) => {
      this.text(ctx, `v${e.version}`, x + 24 * u, y, 900, 20 * u, ei === 0 ? C.hiddenAccent : C.text, 'left');
      const vw = ctx.measureText(`v${e.version}`).width;
      this.text(ctx, `${e.title}${e.date ? `   ${e.date}` : ''}`, x + 24 * u + vw + 12 * u, y, 600, 13 * u, C.textDim, 'left');
      y += 12 * u;
      for (const it of e.items) {
        ctx.font = `600 ${Math.round(14 * u)}px ${FONT}`;
        const lines = this.wrap(ctx, it.text, innerW - 22 * u);
        y += 22 * u;
        const tagColor = it.tag === 'Fixed' ? C.danger : it.tag === 'Changed' ? C.revealAccent : C.win;
        this.text(ctx, '•', x + 28 * u, y, 800, 14 * u, tagColor, 'left');
        lines.forEach((l, li) => this.text(ctx, l, x + 46 * u, y + li * 18 * u, 600, 14 * u, '#c9d1dc', 'left'));
        y += (lines.length - 1) * 18 * u;
      }
      y += 34 * u;
    });
    ctx.restore();
    const total = y + model.scroll - top;
    model.maxScroll = Math.max(0, total - viewH);
    if (model.maxScroll > 0) {
      const th = Math.max(30 * u, (viewH * viewH) / total);
      const ty = top + (model.scroll / model.maxScroll) * (viewH - th);
      this.rr(ctx, x + w - 8 * u, ty, 4 * u, th, 2 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
    this.backButton(ctx, model, W, top + viewH + 16 * u, u);
  }

  private drawHowTo(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, top: number, u: number, now: number): void {
    const page = model.howtoPage;
    const w = Math.min(780 * u, W - 32);
    const x = (W - w) / 2;
    const h = Math.min(300 * u, H - top - 130 * u);
    this.rr(ctx, x, top, w, h, 16 * u);
    ctx.fillStyle = 'rgba(14, 18, 28, 0.86)';
    ctx.fill();

    // Diagram (left) and text (right)
    const dSize = Math.min(h - 32 * u, 250 * u);
    const dx = x + 20 * u;
    const dy = top + (h - dSize) / 2;
    this.drawDiagram(ctx, page, dx, dy, dSize, now);

    const tx = dx + dSize + 28 * u;
    const tw = x + w - tx - 20 * u;
    let ty = top + 52 * u;
    this.text(ctx, HOWTO_TEXT[page].title, tx, ty, 900, 21 * u, C.text, 'left');
    ctx.font = `600 ${Math.round(15 * u)}px ${FONT}`;
    for (const l of HOWTO_TEXT[page].lines) {
      ty += 14 * u;
      for (const ln of this.wrap(ctx, l, tw)) {
        ty += 21 * u;
        this.text(ctx, ln, tx, ty, 600, 15 * u, '#c9d1dc', 'left');
      }
    }

    // Page arrows + dots
    const ay = top + h + 24 * u;
    const prev = { x: W / 2 - 110 * u, y: ay - 18 * u, w: 36 * u, h: 36 * u };
    const next = { x: W / 2 + 74 * u, y: ay - 18 * u, w: 36 * u, h: 36 * u };
    this.arrow(ctx, prev, -1, page > 0);
    this.arrow(ctx, next, 1, page < HOWTO_PAGES - 1);
    this.regions.push({ ...prev, index: 0, part: 'dec' }, { ...next, index: 0, part: 'inc' });
    for (let i = 0; i < HOWTO_PAGES; i++) {
      ctx.beginPath();
      ctx.arc(W / 2 + (i - 1) * 26 * u, ay, 5.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = i === page ? C.hiddenAccent : 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
    this.backButton(ctx, model, W, ay + 36 * u, u);
  }

  /** Small schematic diagrams reusing the character art. Not tied to any match. */
  private drawDiagram(ctx: CanvasRenderingContext2D, page: number, x: number, y: number, size: number, now: number): void {
    const r = size / 2;
    const cx = x + r;
    const cy = y + r;
    const mv = this.mini;
    mv.scale = (r * 0.92) / 170; // schematic world radius 170 fills the diagram
    mv.offsetX = cx;
    mv.offsetY = cy;
    mv.cssWidth = mv.cssHeight = size;

    // arena disc
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = '#1d2430';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.arenaEdge;
    ctx.stroke();

    const me = PLAYER_STYLES[0];
    const red = PLAYER_STYLES[1];
    const gold = PLAYER_STYLES[2];
    const ch = (pos: { x: number; y: number }, aim: { x: number; y: number }, st: { color: string; name: string }, dead = false, human = false) => {
      drawShadow(ctx, mv, pos);
      drawCharacter(ctx, mv, pos, aim, { color: st.color, name: st.name, isHuman: human, dead, time: now });
    };
    const sw = (p: { x: number; y: number }) => mv.toScreen(p);

    if (page === 0) {
      ch({ x: -50, y: 40 }, { x: 0.8, y: -0.6 }, me, false, true);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      const a = sw({ x: -50, y: 40 });
      const b = sw({ x: 140, y: -95 });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      for (const p of [{ x: 70, y: 70 }, { x: -70, y: -85 }, { x: 95, y: -20 }]) {
        const s = sw(p);
        this.text(ctx, '?', s.x, s.y + 8, 900, 26, 'rgba(255,255,255,0.35)', 'center');
      }
    } else if (page === 1) {
      const A = { x: -70, y: 55 };
      const B = { x: 80, y: 40 };
      const Cc = { x: 5, y: -85 };
      const lines: [typeof A, typeof B, string][] = [
        [A, B, me.color],
        [B, A, red.color],
        [Cc, A, gold.color],
      ];
      for (const [p, q, col] of lines) {
        const a = sw(p);
        const b = sw(q);
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const dir = (p: typeof A, q: typeof A) => {
        const l = Math.hypot(q.x - p.x, q.y - p.y);
        return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
      };
      ch(A, dir(A, B), me, true, true);
      ch(B, dir(B, A), red, true);
      ch(Cc, dir(Cc, A), gold);
    } else {
      // schematic safe circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      ctx.fillStyle = THEME.colors.dangerTint;
      ctx.fillRect(x, y, size, size);
      ctx.restore();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.safeGlow;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ch({ x: -15, y: 10 }, { x: 1, y: 0 }, me, false, true);
      ch({ x: 105, y: -55 }, { x: -1, y: 0.2 }, red, true);
    }
  }
}
