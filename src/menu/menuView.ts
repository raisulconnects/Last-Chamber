import { drawArenaSwatch } from '../arena';
import type { ArenaRenderer } from '../arena';
import { drawCharacter, drawShadow } from '../characters';
import { CHANGELOG } from '../changelog';
import { CONFIG, PLAYER_STYLES } from '../config';
import { CREDITS } from '../credits';
import { KILL_FX_SECONDS, drawKillEffect, drawShotLine } from '../effects';
import { CATEGORIES, RARITY, isEquipped, isOwned, itemById, ownedCount } from '../shop';
import type { ShopItem } from '../shop';
import { winRate } from '../stats';
import { THEME } from '../theme';
import { isNarrow, ui } from '../ui';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../version';
import { View } from '../view';
import { HOWTO_PAGES } from './menuModel';
import { MAX_LEVEL, xpNeeded } from '../levels';
import type { Progress } from '../progress';
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
  /** When the item is inside a scrolling list, taps outside this vertical band do not count. */
  clip?: { y0: number; y1: number };
}

const TITLES: Record<string, string> = {
  play: 'PLAY',
  single: 'SINGLE PLAYER',
  custom: 'CUSTOM MATCH',
  multiplayer: 'MULTIPLAYER',
  howto: 'HOW TO PLAY',
  stats: 'STATS',
  shop: 'SHOP',
  profile: 'PROFILE',
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
  private clip: { y0: number; y1: number } | undefined;
  private lastFocusKey = '';
  private toastSeen = 0;
  private toastAt = -10;
  private profileContentH = 0;
  private statsContentH = 0; // measured last frame so the Stats panel can shrink to its content

  hit(x: number, y: number): Region | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (r.clip && (y < r.clip.y0 || y > r.clip.y1)) continue;
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
    const short = H < 520;
    const split = short && W > H * 1.3 && (screen === 'main' || screen === 'play');
    let top: number;
    let listCx = W / 2;
    if (split) {
      // Short landscape (phones): title on the left, menu on the right.
      this.drawTitle(ctx, W, H, now, u, 0.8, W * 0.27, H * 0.36);
      listCx = W * 0.73;
      const n = model.items().length;
      top = Math.max(72, (H - n * (50 + 10)) / 2); // below the top-right audio buttons
    } else if (screen === 'main' || screen === 'play') {
      top = this.drawTitle(ctx, W, H, now, u, screen === 'main' ? (short ? 0.6 : 1) : 0.8);
    } else {
      const narrow = isNarrow(W);
      const ty = narrow ? Math.max(92 * u, 100) : short ? 38 * u : 62 * u;
      this.text(ctx, TITLES[screen], W / 2, ty, 900, (short ? 22 : 30) * u, C.text, 'center', 3 * u);
      this.line(ctx, W / 2 - 40 * u, ty + 14 * u, 80 * u, C.hiddenAccent);
      top = narrow ? Math.max(128 * u, 138) : short ? 66 * u : 104 * u;
    }

    switch (screen) {
      case 'main':
      case 'play':
        this.drawItems(ctx, model, W, top, 56 * u, 12 * u, u, H, listCx);
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
      case 'stats':
        this.drawStats(ctx, model, W, H, top, u);
        break;
      case 'shop':
        this.drawShop(ctx, model, W, H, top, u, now);
        break;
      case 'profile':
        this.drawProfile(ctx, model, W, H, top, u, now);
        break;
      case 'credits':
        this.drawCredits(ctx, model, W, H, top, u);
        break;
      case 'changelog':
        this.drawChangelog(ctx, model, W, H, top, u);
        break;
    }

    this.drawPlayerCard(ctx, model, W, H, u, now);

    // Footer: version and key hints.
    ctx.textBaseline = 'alphabetic';
    this.text(ctx, `v${APP_VERSION}`, 16 * u, H - 16 * u, 700, 12 * u, C.textDim, 'left');
    if (!ui.touch) this.text(ctx, model.screen === 'shop' ? 'Up/Down select   Left/Right category   Enter buy / equip   Esc back' : 'Up/Down select   Left/Right adjust   Enter confirm   Esc back', W / 2, H - 16 * u, 600, 12 * u, C.textDim, 'center');
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
  private drawTitle(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    now: number,
    u: number,
    scale: number,
    cxOverride?: number,
    cyOverride?: number,
  ): number {
    const s = scale * u;
    const cx = cxOverride ?? W / 2;
    const cy = cyOverride ?? Math.max(70 * s + 12, H * 0.15);
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
    let fs = 46 * s;
    ctx.save();
    ctx.font = `900 ${Math.round(fs)}px ${FONT}`;
    ctx.textAlign = 'center';
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    c.letterSpacing = `${6 * s}px`;
    const fitW = ctx.measureText(APP_NAME.toUpperCase()).width;
    if (fitW > W - 32) {
      const k = (W - 32) / fitW;
      fs *= k;
      ctx.font = `900 ${Math.round(fs)}px ${FONT}`;
      c.letterSpacing = `${6 * s * k}px`;
    }
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
    cx: number = W / 2,
  ): void {
    const items = model.items();
    const w = Math.min(460 * u, W - 32);
    const x = cx - w / 2;
    const bottom = H - (ui.touch ? 12 : 40 * u);
    const avail = Math.max(60, bottom - top);

    // Desktop: squeeze a little so lists fit. Touch: keep targets large and scroll instead.
    let ih = itemH;
    let ig = gap;
    const need = items.length * (ih + ig) - ig;
    if (!ui.touch && need > avail) {
      const k = Math.max(0.7, avail / need);
      ih *= k;
      ig *= k;
    }
    if (ui.touch) {
      ih = Math.max(ih, 48);
      ig = Math.max(ig, 8);
    }
    const total = items.length * (ih + ig) - ig;
    const scrollable = total > avail;
    model.maxScroll = scrollable ? total - avail : 0;
    model.scroll = Math.max(0, Math.min(model.maxScroll, model.scroll));

    // Keep the keyboard-focused item visible when focus moves.
    const key = model.screen + ':' + model.focus;
    if (scrollable && key !== this.lastFocusKey) {
      const itemTop = model.focus * (ih + ig);
      if (itemTop < model.scroll) model.scroll = itemTop;
      else if (itemTop + ih > model.scroll + avail) model.scroll = itemTop + ih - avail;
      model.scroll = Math.max(0, Math.min(model.maxScroll, model.scroll));
    }
    this.lastFocusKey = key;

    ctx.save();
    if (scrollable) {
      ctx.beginPath();
      ctx.rect(x - 12, top - 6, w + 24, avail + 12);
      ctx.clip();
      this.clip = { y0: top - 6, y1: top + avail + 6 };
    } else this.clip = undefined;
    let y = top - (scrollable ? model.scroll : 0);
    items.forEach((it, i) => {
      this.drawItem(ctx, it, i, x, y, w, ih, u, i === model.focus);
      y += ih + ig;
    });
    ctx.restore();
    this.clip = undefined;

    if (scrollable) {
      // Slim scroll indicator.
      const th = Math.max(28, (avail * avail) / total);
      const tyy = top + (model.scroll / model.maxScroll) * (avail - th);
      this.rr(ctx, x + w + 6, tyy, 4, th, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }
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
    this.regions.push({ x, y, w, h, index, part: 'main', clip: this.clip });

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
      // Bigger tap zones for fingers: full row height and a little extra width.
      const pad = ui.touch ? 10 : 0;
      const fat = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } =>
        ui.touch ? { x: r.x - pad, y, w: r.w + pad * 2, h } : r;
      this.regions.push({ ...fat(dec), index, part: 'dec', clip: this.clip }, { ...fat(inc), index, part: 'inc', clip: this.clip });
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
    this.drawItem(ctx, items[idx], idx, (W - w) / 2, y, w, Math.max(46 * u, ui.touch ? 48 : 0), u, model.focus === idx);
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

  // ---- wallet, rarity and shop ---------------------------------------------------------------

  private fmt(n: number): string {
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Gold Shell coin icon. */
  private shellIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number): void {
    ctx.save();
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = r * (0.9 + 0.3 * Math.sin(now * 2.6));
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.55, '#ffc247');
    g.addColorStop(1, '#c98a1e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120,70,0,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    // six chamber-like dots
    ctx.fillStyle = 'rgba(120,70,0,0.55)';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.38, y + Math.sin(a) * r * 0.38, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private xpFraction(p: Progress): number {
    return p.level >= MAX_LEVEL ? 1 : Math.min(1, p.xp / xpNeeded(p.level));
  }

  /** Thin rounded progress bar (track + glowing fill). */
  private drawXpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number): void {
    this.rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    if (frac > 0) {
      const fw = Math.max(h, w * frac);
      ctx.save();
      this.rr(ctx, x, y, fw, h, h / 2);
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#4cc9f0');
      g.addColorStop(1, '#8be9ff');
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(76, 201, 240, 0.7)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }
  }

  /** Rarity-glowing round avatar of the equipped skin. Used by the Profile and the player card. */
  private drawAvatar(ctx: CanvasRenderingContext2D, ax: number, ay: number, av: number, p: Progress, now: number, u: number): void {
    const skinItem = itemById(p.equipped.skin);
    const skinR = RARITY[skinItem?.rarity ?? 'common'];
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 8, 14, 0.85)';
    ctx.shadowColor = skinR.rank > 0 ? skinR.color : 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = Math.max(6, skinR.glow) * u * (1 + skinR.pulse * Math.sin(now * 2.2));
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, av * 0.04);
    ctx.strokeStyle = skinR.rank > 0 ? skinR.color : 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + av / 2, ay + av / 2, av / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    const mv = this.mini;
    mv.scale = (av * 0.25) / (CONFIG.playerRadius * THEME.art.characterScale);
    mv.offsetX = ax + av / 2;
    mv.offsetY = ay + av / 2;
    mv.cssWidth = mv.cssHeight = av;
    drawShadow(ctx, mv, { x: 0, y: 0 });
    drawCharacter(ctx, mv, { x: 0, y: 0 }, { x: Math.cos(now * 0.6), y: Math.sin(now * 0.6) }, {
      color: skinItem?.skin?.color ?? PLAYER_STYLES[0].color,
      skin: skinItem?.skin,
      name: p.name,
      isHuman: false,
      time: now,
    });
    ctx.restore();
  }

  /**
   * Player card in the top-left corner. Full card (avatar, name, title or sign-in prompt, Shells) on the
   * main menu when there is room; a compact chip (avatar + Shells) everywhere else. Tapping it is handled
   * by MenuModel.clickItem(..., 'card'). A level badge and XP bar will go under the name once XP exists.
   */
  private drawPlayerCard(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, u: number, now: number): void {
    const p = model.progress;
    const info = model.accountInfo;
    const full = model.screen === 'main' && W >= 720 && H >= 520;
    const x = 16 * u;
    const y = 16 * u;
    const shellsTxt = this.fmt(p.shells);
    ctx.font = `900 ${Math.round(15 * u)}px ${FONT}`;
    const shellsW = ctx.measureText(shellsTxt).width;

    let w: number;
    let h: number;
    let av: number;
    let avX: number;
    if (full) {
      av = 52 * u;
      h = 76 * u;
      const titleItem = itemById(p.equipped.title);
      const guestPrompt = model.accountAvailable && info.status === 'guest';
      const sub = guestPrompt ? 'GUEST - TAP TO SIGN IN' : (titleItem?.title ?? 'Rookie').toUpperCase();
      ctx.font = `900 ${Math.round(17 * u)}px ${FONT}`;
      const nameW = ctx.measureText(p.name).width;
      ctx.font = `900 ${Math.round(11 * u)}px ${FONT}`;
      const lvTxt = `LV ${p.level}`;
      const lvW = ctx.measureText(lvTxt).width + 12 * u;
      ctx.font = `800 ${Math.round(11 * u)}px ${FONT}`;
      const subW = ctx.measureText(sub).width + sub.length * 1.5 * u;
      avX = x + 8 * u;
      w = 8 * u + av + 12 * u + Math.max(nameW + 8 * u + lvW, subW, 130 * u) + 22 * u + 24 * u + shellsW + 14 * u;
      this.rr(ctx, x, y, w, h, 16 * u);
      ctx.fillStyle = 'rgba(14, 18, 28, 0.9)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.stroke();
      const tx = avX + av + 12 * u;
      this.text(ctx, p.name, tx, y + 27 * u, 900, 17 * u, C.text, 'left');
      // level pill
      ctx.font = `900 ${Math.round(17 * u)}px ${FONT}`;
      const px = tx + ctx.measureText(p.name).width + 8 * u;
      this.rr(ctx, px, y + 13 * u, lvW, 18 * u, 9 * u);
      ctx.fillStyle = 'rgba(76, 201, 240, 0.16)';
      ctx.fill();
      this.text(ctx, lvTxt, px + lvW / 2, y + 26 * u, 900, 11 * u, '#8be9ff', 'center');
      const titleR = RARITY[titleItem?.rarity ?? 'common'];
      ctx.save();
      if (!guestPrompt && titleR.rank > 0) {
        ctx.shadowColor = titleR.color;
        ctx.shadowBlur = titleR.glow * 0.5 * u;
      }
      this.text(ctx, sub, tx, y + 46 * u, 800, 11 * u, guestPrompt ? C.hiddenAccent : titleR.rank > 0 ? titleR.color : C.textDim, 'left', 1.5 * u);
      ctx.restore();
      const barW = w - (tx - x) - 22 * u - 24 * u - shellsW - 14 * u;
      this.drawXpBar(ctx, tx, y + 56 * u, Math.max(60 * u, barW), 6 * u, this.xpFraction(p));
      this.shellIcon(ctx, x + w - 14 * u - shellsW - 12 * u, y + h / 2, 10 * u, now);
      this.text(ctx, shellsTxt, x + w - 14 * u, y + h / 2 + 5.5 * u, 900, 15 * u, '#ffd479', 'right');
    } else {
      h = 36 * u;
      av = 28 * u;
      avX = x + 5 * u;
      const iconCx = avX + av + 8 * u + 10 * u;
      w = iconCx - x + 12 * u + shellsW + 14 * u;
      this.rr(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = 'rgba(14, 18, 28, 0.88)';
      ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(255,194,71,0.55)';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,194,71,0.65)';
      ctx.stroke();
      ctx.restore();
      this.shellIcon(ctx, iconCx, y + h / 2, 10 * u, now);
      this.text(ctx, shellsTxt, iconCx + 14 * u, y + h / 2 + 5.5 * u, 900, 15 * u, '#ffd479', 'left');
    }
    this.drawAvatar(ctx, avX, y + (h - av) / 2, av, p, now, u);
    if (!full) {
      const bx = avX + av * 0.16;
      const by = y + (h - av) / 2 + av * 0.9;
      ctx.font = `900 ${Math.round(9 * u)}px ${FONT}`;
      const bw = Math.max(13 * u, ctx.measureText(String(p.level)).width + 8 * u);
      this.rr(ctx, bx - bw / 2, by - 6.5 * u, bw, 13 * u, 6.5 * u);
      ctx.fillStyle = '#0e1220';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#4cc9f0';
      ctx.stroke();
      this.text(ctx, String(p.level), bx, by + 3.3 * u, 900, 9 * u, '#8be9ff', 'center');
    }
    if (info.status === 'signedIn') {
      const r = Math.max(3.5 * u, av * 0.1);
      ctx.beginPath();
      ctx.arc(avX + av * 0.86, y + (h - av) / 2 + av * 0.86, r, 0, Math.PI * 2);
      ctx.fillStyle = (info.pending ?? 0) > 0 ? C.revealAccent : C.win; // amber while matches wait to sync
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(6, 8, 14, 0.95)';
      ctx.stroke();
    }
    this.regions.push({ x, y, w, h, index: -1, part: 'card' });
  }

  /** Border + glow + shimmer for a rarity. Draws the path in the current rr() shape. */
  private rarityFrame(
    ctx: CanvasRenderingContext2D,
    rarity: ShopItem['rarity'],
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    u: number,
    now: number,
    seed: number,
    focused: boolean,
  ): void {
    const R = RARITY[rarity];
    const breathe = 1 + R.pulse * Math.sin(now * 2.2 + seed * 1.3);
    // faint rarity wash behind the card
    if (R.rank > 0) {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, R.color + (R.rank >= 3 ? '38' : R.rank === 2 ? '2c' : '22'));
      g.addColorStop(1, 'rgba(14,18,28,0)');
      this.rr(ctx, x, y, w, h, r);
      ctx.fillStyle = g;
      ctx.fill();
    }
    // glowing border
    ctx.save();
    this.rr(ctx, x, y, w, h, r);
    ctx.lineWidth = focused ? 2.5 : R.rank >= 2 ? 2 : 1.5;
    ctx.strokeStyle = focused ? C.hiddenAccent : R.rank > 0 ? R.color : 'rgba(255,255,255,0.14)';
    if (R.glow > 0) {
      ctx.shadowColor = R.color;
      ctx.shadowBlur = R.glow * u * breathe;
      ctx.stroke();
    }
    ctx.stroke();
    ctx.restore();
    // legendary shimmer sweep + twinkles
    if (R.rank >= 3) {
      ctx.save();
      this.rr(ctx, x, y, w, h, r);
      ctx.clip();
      const sweep = ((now * 0.42 + seed * 0.17) % 1.6) - 0.3;
      const sx = x + w * sweep;
      const g = ctx.createLinearGradient(sx - 40 * u, y, sx + 40 * u, y + h);
      g.addColorStop(0, 'rgba(255,230,160,0)');
      g.addColorStop(0.5, 'rgba(255,230,160,0.28)');
      g.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    if (R.rank >= 2) {
      const n = R.rank >= 3 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const tw = Math.max(0, Math.sin(now * 2.6 + seed * 2.1 + i * 2.4));
        if (tw <= 0.05) continue;
        const tx = x + w * (0.3 + 0.28 * i + 0.1 * Math.sin(seed + i));
        const ty = y + (i % 2 ? h - 5 * u : 5 * u);
        this.sparkle(ctx, tx, ty, (3 + 3.5 * tw) * u, R.color, tw);
      }
    }
  }

  private sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 2;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }

  /** Live preview of an item inside a square box. */
  private drawPreview(ctx: CanvasRenderingContext2D, item: ShopItem, bx: number, by: number, bs: number, u: number, now: number): void {
    const R = RARITY[item.rarity];
    const cx = bx + bs / 2;
    const cy = by + bs / 2;
    ctx.save();
    this.rr(ctx, bx, by, bs, bs, 12 * u);
    ctx.fillStyle = 'rgba(6, 8, 14, 0.8)';
    ctx.fill();
    ctx.clip();
    if (R.rank > 0) {
      const g = ctx.createRadialGradient(cx, cy, bs * 0.05, cx, cy, bs * 0.7);
      g.addColorStop(0, R.color + (R.rank >= 3 ? '66' : R.rank === 2 ? '4d' : '38'));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bs, bs);
    }
    if (item.category === 'skin') {
      const mv = this.mini;
      mv.scale = (bs * 0.3) / (CONFIG.playerRadius * THEME.art.characterScale);
      mv.offsetX = cx;
      mv.offsetY = cy;
      mv.cssWidth = mv.cssHeight = bs;
      drawShadow(ctx, mv, { x: 0, y: 0 });
      drawCharacter(ctx, mv, { x: 0, y: 0 }, { x: 1, y: 0 }, {
        color: item.skin?.color ?? PLAYER_STYLES[0].color,
        skin: item.skin,
        name: item.name,
        isHuman: false,
        time: now,
      });
    } else if (item.category === 'shot') {
      const st = item.shot ?? { core: PLAYER_STYLES[0].color, glow: PLAYER_STYLES[0].color, flash: THEME.colors.flash, mode: 'solid' as const };
      const loop = (now % 1.5) / 1.5;
      const a = { x: bx + bs * 0.16, y: cy };
      const b = { x: bx + bs * 0.9, y: cy };
      // muzzle flash star
      ctx.fillStyle = st.mode === 'rainbow' ? `hsl(${(now * 540) % 360}, 100%, 80%)` : st.flash;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? bs * 0.13 : bs * 0.05;
        const px = a.x + Math.cos(ang) * rr;
        const py = a.y + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      drawShotLine(ctx, a, b, st, 0.65 + 0.35 * Math.sin(loop * Math.PI), now, 0.7);
    } else if (item.category === 'kill') {
      if (item.kill) {
        const t = ((now % 2.0) / 2.0) * (KILL_FX_SECONDS + 0.35);
        const Rk = item.kill === 'lightning' ? bs * 0.075 : bs * 0.1;
        ctx.fillStyle = 'rgba(90,96,107,0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, Rk * (t < 0.1 ? 1 : 0.8), 0, Math.PI * 2);
        ctx.fill();
        drawKillEffect(ctx, item.kill, cx, cy, Rk, t);
      } else {
        this.text(ctx, 'NO EFFECT', cx, cy + 4 * u, 800, 8.5 * u, C.textDim, 'center', 0.5 * u);
      }
    } else if (item.category === 'arena') {
      drawArenaSwatch(ctx, cx, cy, bs * 0.4, item.arena ?? null, now);
    } else {
      // titles: a glowing star badge
      ctx.save();
      ctx.shadowColor = R.rank > 0 ? R.color : '#8b97a8';
      ctx.shadowBlur = 12 * u;
      ctx.fillStyle = R.rank > 0 ? R.color : '#8b97a8';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? bs * 0.3 : bs * 0.13;
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawShopCard(
    ctx: CanvasRenderingContext2D,
    model: MenuModel,
    item: ShopItem,
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    u: number,
    focused: boolean,
    now: number,
    compact = false,
  ): void {
    const p = model.progress;
    const owned = isOwned(p, item.id);
    const equipped = isEquipped(p, item.id);
    const R = RARITY[item.rarity];
    this.rr(ctx, x, y, w, h, 14 * u);
    ctx.fillStyle = focused ? 'rgba(34, 44, 62, 0.96)' : 'rgba(14, 18, 28, 0.9)';
    ctx.fill();
    this.rarityFrame(ctx, item.rarity, x, y, w, h, 14 * u, u, now, index, focused);
    this.regions.push({ x, y, w, h, index, part: 'main', clip: this.clip });

    const bs = h - 16 * u;
    this.drawPreview(ctx, item, x + 8 * u, y + 8 * u, bs, u, now);

    const tx = x + 8 * u + bs + 14 * u;
    if (compact) {
      this.text(ctx, R.label, tx, y + 19 * u, 800, 9 * u, R.rank > 0 ? R.color : C.textDim, 'left', 1.3 * u);
      this.text(ctx, item.name, tx, y + 38 * u, 800, 16 * u, C.text, 'left');
      this.text(ctx, item.blurb, tx, y + 55 * u, 600, 11 * u, C.textDim, 'left');
    } else {
      this.text(ctx, R.label, tx, y + 24 * u, 800, 10 * u, R.rank > 0 ? R.color : C.textDim, 'left', 1.5 * u);
      this.text(ctx, item.name, tx, y + 45 * u, 800, 17 * u, C.text, 'left');
      this.text(ctx, item.blurb, tx, y + 64 * u, 600, 12 * u, C.textDim, 'left');
    }

    // Status pill on the right
    const pw = 92 * u;
    const ph = 30 * u;
    const px = x + w - pw - 12 * u;
    const py = y + h / 2 - ph / 2;
    const armed = model.armedId === item.id;
    const afford = p.shells >= item.price;
    this.rr(ctx, px, py, pw, ph, ph / 2);
    if (equipped) {
      ctx.fillStyle = 'rgba(93,211,158,0.22)';
      ctx.fill();
      ctx.strokeStyle = C.win;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.text(ctx, 'EQUIPPED', px + pw / 2, py + ph / 2 + 4 * u, 800, 11 * u, C.win, 'center', 0.5 * u);
    } else if (owned) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.text(ctx, 'EQUIP', px + pw / 2, py + ph / 2 + 4 * u, 800, 12 * u, C.text, 'center', 1 * u);
    } else if (armed) {
      const k = 0.7 + 0.3 * Math.sin(now * 9);
      ctx.save();
      ctx.shadowColor = '#ffb347';
      ctx.shadowBlur = 16 * u * k;
      ctx.fillStyle = '#ffc247';
      ctx.fill();
      ctx.restore();
      this.text(ctx, 'TAP TO BUY', px + pw / 2, py + ph / 2 + 4 * u, 900, 11 * u, '#2a1a00', 'center', 0.5 * u);
    } else {
      ctx.fillStyle = afford ? 'rgba(255,194,71,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = afford ? 'rgba(255,194,71,0.8)' : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.shellIcon(ctx, px + 17 * u, py + ph / 2, 7.5 * u, afford ? now : 0);
      this.text(ctx, this.fmt(item.price), px + 30 * u, py + ph / 2 + 5 * u, 900, 14 * u, afford ? '#ffd479' : C.textDim, 'left');
    }
  }

  private drawShop(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, top: number, u: number, now: number): void {
    const w = Math.min(640 * u, W - 32);
    const x = (W - w) / 2;
    const narrow = isNarrow(W);

    // Category tabs
    const compact = H < 520;
    const th = (compact ? (ui.touch ? 40 : 34) : ui.touch ? 44 : 38) * u;
    const gap = 6 * u;
    const tabW = (w - gap * (CATEGORIES.length - 1)) / CATEGORIES.length;
    CATEGORIES.forEach((c, i) => {
      const tx = x + i * (tabW + gap);
      const active = i === model.shopTab;
      this.rr(ctx, tx, top, tabW, th, 10 * u);
      if (active) {
        ctx.save();
        ctx.shadowColor = C.hiddenAccent;
        ctx.shadowBlur = 14 * u;
        ctx.fillStyle = C.hiddenAccent;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(14, 18, 28, 0.88)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      this.text(ctx, c.label, tx + tabW / 2, top + th / 2 + 4 * u, 800, (narrow ? 10 : 12) * u, active ? '#0b1117' : C.textDim, 'center', (narrow ? 0.4 : 1) * u);
      this.regions.push({ x: tx, y: top, w: tabW, h: th, index: i, part: 'tab' });
    });

    // Layout: card list between the tabs and the bottom Back button
    const items = model.items();
    const n = items.length - 1; // last item is Back
    const btnH = Math.max(46 * u, ui.touch ? 48 : 0);
    const backY = compact ? H - btnH - 8 : H - btnH - (ui.touch ? 14 : 44 * u);
    const toastH = 26 * u;
    const listTop = top + th + (compact ? 8 : 12) * u;
    const avail = Math.max(80 * u, compact ? backY - 8 * u - listTop : backY - toastH - 10 * u - listTop);
    const ch = (compact ? 66 : 84) * u;
    const cg = (compact ? 8 : 10) * u;
    const total = n * (ch + cg) - cg;
    const scrollable = total > avail;
    model.maxScroll = scrollable ? total - avail : 0;
    model.scroll = Math.max(0, Math.min(model.maxScroll, model.scroll));

    const key = 'shop:' + model.shopTab + ':' + model.focus;
    if (scrollable && key !== this.lastFocusKey && model.focus < n) {
      const itemTop = model.focus * (ch + cg);
      if (itemTop < model.scroll) model.scroll = itemTop;
      else if (itemTop + ch > model.scroll + avail) model.scroll = itemTop + ch - avail;
      model.scroll = Math.max(0, Math.min(model.maxScroll, model.scroll));
    }
    this.lastFocusKey = key;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 14 * u, listTop - 6 * u, w + 28 * u, avail + 12 * u);
    ctx.clip();
    this.clip = { y0: listTop - 6 * u, y1: listTop + avail + 6 * u };
    let y = listTop - (scrollable ? model.scroll : 0);
    for (let i = 0; i < n; i++) {
      const id = items[i].id.slice(5);
      const item = itemById(id);
      if (item && y + ch > listTop - 20 && y < listTop + avail + 20) this.drawShopCard(ctx, model, item, i, x, y, w, ch, u, i === model.focus, now, compact);
      else if (item) this.regions.push({ x, y, w, h: ch, index: i, part: 'main', clip: this.clip });
      y += ch + cg;
    }
    ctx.restore();
    this.clip = undefined;
    if (scrollable) {
      const sh = Math.max(28, (avail * avail) / total);
      const sy = listTop + (model.scroll / model.maxScroll) * (avail - sh);
      this.rr(ctx, x + w + 6 * u, sy, 4, sh, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    // Toast (latest shop message, fades after ~2.4s)
    if (model.toast.seq !== this.toastSeen) {
      this.toastSeen = model.toast.seq;
      this.toastAt = now;
    }
    const age = now - this.toastAt;
    if (model.toast.text && age < 2.4) {
      const a = Math.min(1, (2.4 - age) / 0.5);
      const col = model.toast.kind === 'good' ? C.win : model.toast.kind === 'bad' ? C.danger : C.revealAccent;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(13 * u)}px ${FONT}`;
      const tw = ctx.measureText(model.toast.text).width + 32 * u;
      const toastY = compact ? backY + btnH / 2 - toastH / 2 : backY - toastH - 4 * u;
      this.rr(ctx, W / 2 - tw / 2, toastY, tw, toastH, toastH / 2);
      ctx.fillStyle = 'rgba(8,10,16,0.92)';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = a;
      this.text(ctx, model.toast.text, W / 2, (compact ? backY + btnH / 2 - toastH / 2 : backY - toastH - 4 * u) + toastH / 2 + 4.5 * u, 800, 13 * u, col, 'center');
      ctx.restore();
    }

    const bw = Math.min(compact ? 130 * u : 220 * u, w);
    this.drawItem(ctx, items[n], n, compact ? x : (W - bw) / 2, backY, bw, btnH, u, model.focus === n);
  }

  private maskEmail(e: string): string {
    const at = e.indexOf('@');
    if (at < 1) return e;
    return e[0] + '***' + e.slice(at);
  }

  private drawProfile(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, top: number, u: number, now: number): void {
    const p = model.progress;
    const st = model.stats;
    const w = Math.min(560 * u, W - 32);
    const x = (W - w) / 2;
    const btnH = Math.max(46 * u, ui.touch ? 48 : 0);
    const gap = 10 * u;
    const rows = Math.ceil(model.items().length / 2);
    const bottomH = btnH * rows + gap * (rows - 1);
    const avail = Math.max(140 * u, H - top - bottomH - (ui.touch ? 28 : 64 * u));
    const viewH = this.profileContentH > 0 ? Math.min(avail, Math.max(140 * u, this.profileContentH)) : avail;
    this.rr(ctx, x, top, w, viewH, 16 * u);
    ctx.fillStyle = 'rgba(14, 18, 28, 0.88)';
    ctx.fill();

    ctx.save();
    this.rr(ctx, x, top, w, viewH, 16 * u);
    ctx.clip();
    const pad = 20 * u;
    const left = x + pad;
    const right = x + w - pad;
    const innerW = w - pad * 2;
    let y = top + pad - model.scroll;

    // Header: avatar with rarity glow, name, title, member since
    const titleItem = itemById(p.equipped.title);
    const titleR = RARITY[titleItem?.rarity ?? 'common'];
    const av = 74 * u;
    const ax = left;
    const ay = y;
    this.drawAvatar(ctx, ax, ay, av, p, now, u);

    const nx = ax + av + 16 * u;
    this.text(ctx, p.name, nx, ay + 28 * u, 900, 24 * u, C.text, 'left');
    ctx.save();
    if (titleR.rank > 0) {
      ctx.shadowColor = titleR.color;
      ctx.shadowBlur = titleR.glow * 0.6 * u;
    }
    this.text(ctx, (titleItem?.title ?? 'Rookie').toUpperCase(), nx, ay + 50 * u, 800, 13 * u, titleR.rank > 0 ? titleR.color : C.textDim, 'left', 2 * u);
    ctx.restore();
    const since = new Date(p.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    this.text(ctx, `Playing since ${since}`, nx, ay + 68 * u, 600, 12 * u, C.textDim, 'left');
    y += av + 16 * u;

    // Account status (only when accounts exist in this build)
    if (model.accountAvailable && (model.accountInfo.status === 'guest' || model.accountInfo.status === 'signedIn')) {
      const signed = model.accountInfo.status === 'signedIn';
      const label = signed ? `SIGNED IN  -  ${this.maskEmail(model.accountInfo.email)}` : 'GUEST  -  saved on this device only';
      this.rr(ctx, left, y, innerW, 28 * u, 9 * u);
      ctx.fillStyle = signed ? 'rgba(93, 211, 158, 0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      this.text(ctx, label, x + w / 2, y + 18.5 * u, 700, 11 * u, signed ? C.win : C.textDim, 'center', 1 * u);
      y += 28 * u + 12 * u;
    } else y += 6 * u;

    // Level and XP
    const need = xpNeeded(p.level);
    this.rr(ctx, left, y, innerW, 58 * u, 12 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    this.text(ctx, `LEVEL ${p.level}`, left + 14 * u, y + 27 * u, 900, 20 * u, C.text, 'left');
    this.text(ctx, p.level >= MAX_LEVEL ? 'MAX LEVEL' : `${p.xp} / ${need} XP`, left + innerW - 14 * u, y + 25 * u, 700, 12 * u, '#6fd6ff', 'right');
    this.drawXpBar(ctx, left + 14 * u, y + 38 * u, innerW - 28 * u, 8 * u, this.xpFraction(p));
    y += 58 * u + 10 * u;
    this.text(ctx, 'ACHIEVEMENTS: coming soon', x + w / 2, y + 8 * u, 700, 11 * u, C.textDim, 'center', 1 * u);
    y += 16 * u + 14 * u;

    // Stat tiles
    const oc = ownedCount(p);
    const wr = st.played > 0 ? Math.round((st.wins / st.played) * 100) : 0;
    const tiles: [string, string, string?][] = [
      ['SHELLS', this.fmt(p.shells), '#ffd479'],
      ['MATCHES', String(st.played)],
      ['WINS', String(st.wins)],
      ['WIN RATE', `${wr}%`],
      ['BEST STREAK', String(st.bestStreak)],
      ['ITEMS', `${oc.owned}/${oc.total}`],
    ];
    const cols = innerW < 400 * u ? 2 : 3;
    const tg = 10 * u;
    const tw = (innerW - tg * (cols - 1)) / cols;
    const tH = 56 * u;
    tiles.forEach(([label, value, color], i) => {
      const tx = left + (i % cols) * (tw + tg);
      const ty = y + Math.floor(i / cols) * (tH + tg);
      this.rr(ctx, tx, ty, tw, tH, 10 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
      this.text(ctx, value, tx + tw / 2, ty + 27 * u, 900, 21 * u, color ?? C.text, 'center');
      this.text(ctx, label, tx + tw / 2, ty + 45 * u, 700, 10 * u, C.textDim, 'center', 1.5 * u);
    });
    y += Math.ceil(tiles.length / cols) * (tH + tg) + 12 * u;

    // Loadout: what is equipped, colored by rarity
    this.text(ctx, 'LOADOUT', left, y, 800, 12 * u, C.text, 'left', 2 * u);
    y += 8 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(left, y, innerW, 1);
    for (const c of CATEGORIES) {
      y += 28 * u;
      const it = itemById(p.equipped[c.id]);
      const R = RARITY[it?.rarity ?? 'common'];
      this.text(ctx, c.singular.toUpperCase(), left, y, 700, 10 * u, C.textDim, 'left', 1.2 * u);
      ctx.save();
      if (R.rank > 0) {
        ctx.shadowColor = R.color;
        ctx.shadowBlur = R.glow * 0.5 * u;
      }
      this.text(ctx, it?.name ?? '-', right, y, 800, 14 * u, R.rank > 0 ? R.color : C.text, 'right');
      ctx.restore();
    }
    y += 22 * u;
    ctx.restore();

    const total = y + model.scroll - top + pad * 0.5;
    this.profileContentH = total;
    model.maxScroll = Math.max(0, total - viewH);
    model.scroll = Math.max(0, Math.min(model.maxScroll, model.scroll));
    if (model.maxScroll > 0) {
      const sh = Math.max(30 * u, (viewH * viewH) / total);
      const sy = top + (model.scroll / model.maxScroll) * (viewH - sh);
      this.rr(ctx, x + w - 8 * u, sy, 4 * u, sh, 2 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    // Buttons in a 2x2 grid under the panel
    const items = model.items();
    const bw = (w - gap) / 2;
    const by = top + viewH + 14 * u;
    items.forEach((it, i) => {
      const bx = x + (i % 2) * (bw + gap);
      const byy = by + Math.floor(i / 2) * (btnH + gap);
      this.drawItem(ctx, it, i, bx, byy, bw, btnH, u, model.focus === i);
    });
  }

  private drawStats(ctx: CanvasRenderingContext2D, model: MenuModel, W: number, H: number, top: number, u: number): void {
    const st = model.stats;
    const w = Math.min(640 * u, W - 32);
    const x = (W - w) / 2;
    const btnH = Math.max(46 * u, ui.touch ? 48 : 0);
    const avail = Math.max(120 * u, H - top - btnH - 56 * u);
    const viewH = this.statsContentH > 0 ? Math.min(avail, Math.max(120 * u, this.statsContentH)) : avail;
    this.rr(ctx, x, top, w, viewH, 16 * u);
    ctx.fillStyle = 'rgba(14, 18, 28, 0.86)';
    ctx.fill();

    ctx.save();
    this.rr(ctx, x, top, w, viewH, 16 * u);
    ctx.clip();
    const pad = 20 * u;
    const innerW = w - pad * 2;
    let y = top + pad - model.scroll;

    if (st.played === 0) {
      this.text(ctx, 'NO MATCHES YET', W / 2, y + 44 * u, 900, 20 * u, C.text, 'center', 2 * u);
      this.text(ctx, 'Finish a match and your record shows up here.', W / 2, y + 74 * u, 600, 14 * u, C.textDim, 'center');
      y += 100 * u;
    } else {
      // Summary tiles
      const tiles: [string, string][] = [
        ['MATCHES', String(st.played)],
        ['WINS', String(st.wins)],
        ['WIN RATE', `${winRate(st)}%`],
        ['BEST STREAK', String(st.bestStreak)],
        ['KILLS', String(st.kills)],
        ['BEST SURVIVAL', `${st.bestSurvived} rds`],
      ];
      const cols = innerW < 420 * u ? 2 : 3;
      const gap = 10 * u;
      const tw = (innerW - gap * (cols - 1)) / cols;
      const th = 58 * u;
      tiles.forEach(([label, value], i) => {
        const tx = x + pad + (i % cols) * (tw + gap);
        const ty = y + Math.floor(i / cols) * (th + gap);
        this.rr(ctx, tx, ty, tw, th, 10 * u);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fill();
        this.text(ctx, value, tx + tw / 2, ty + 28 * u, 900, 22 * u, C.text, 'center');
        this.text(ctx, label, tx + tw / 2, ty + 46 * u, 700, 10 * u, C.textDim, 'center', 1.5 * u);
      });
      y += Math.ceil(tiles.length / cols) * (th + gap) + 6 * u;
      this.text(ctx, `Current streak: ${st.streak}   Losses: ${st.losses}   Draws: ${st.draws}`, x + pad, y + 14 * u, 600, 13 * u, '#b7c0cc', 'left');
      y += 40 * u;

      const right = x + w - pad;
      const left = x + pad;
      const divider = (yy: number): void => {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(left, yy, innerW, 1);
      };

      // Results by mode: a small table with column headers.
      this.text(ctx, 'RESULTS BY MODE', left, y, 800, 12 * u, C.text, 'left', 2 * u);
      y += 18 * u;
      const cW = 46 * u; // won / lost / draw columns
      const cBest = right; // best-round column, right aligned
      const cD = cBest - 56 * u;
      const cL = cD - cW;
      const cWin = cL - cW;
      this.text(ctx, 'MODE', left, y, 700, 10 * u, C.textDim, 'left', 1.2 * u);
      this.text(ctx, 'WON', cWin, y, 700, 10 * u, C.win, 'right', 0.5 * u);
      this.text(ctx, 'LOST', cL, y, 700, 10 * u, C.danger, 'right', 0.5 * u);
      this.text(ctx, 'DRAW', cD, y, 700, 10 * u, C.revealAccent, 'right', 0.5 * u);
      this.text(ctx, 'BEST', cBest, y, 700, 10 * u, C.textDim, 'right', 1 * u);
      y += 8 * u;
      divider(y);
      const modes = Object.entries(st.modes).sort((a2, b2) => b2[1].played - a2[1].played);
      for (const [name, m] of modes) {
        y += 26 * u;
        this.text(ctx, name, left, y, 700, 14 * u, C.text, 'left');
        this.text(ctx, String(m.wins), cWin, y, 800, 14 * u, m.wins ? C.win : C.textDim, 'right');
        this.text(ctx, String(m.losses), cL, y, 800, 14 * u, m.losses ? C.danger : C.textDim, 'right');
        this.text(ctx, String(m.draws), cD, y, 800, 14 * u, m.draws ? C.revealAccent : C.textDim, 'right');
        this.text(ctx, String(m.bestSurvived), cBest, y, 800, 14 * u, C.text, 'right');
      }
      y += 36 * u;

      // Last matches: newest first.
      this.text(ctx, `LAST ${st.recent.length} MATCHES (NEWEST FIRST)`, left, y, 800, 12 * u, C.text, 'left', 2 * u);
      y += 18 * u;
      const rKills = right - 76 * u;
      this.text(ctx, 'RESULT', left, y, 700, 10 * u, C.textDim, 'left', 1.2 * u);
      this.text(ctx, 'MODE', left + 62 * u, y, 700, 10 * u, C.textDim, 'left', 1.2 * u);
      this.text(ctx, 'KILLS', rKills, y, 700, 10 * u, C.textDim, 'right', 1.2 * u);
      this.text(ctx, 'SURVIVED', right, y, 700, 10 * u, C.textDim, 'right', 1.2 * u);
      y += 8 * u;
      divider(y);
      for (const r of st.recent) {
        y += 28 * u;
        const col = r.result === 'win' ? C.win : r.result === 'loss' ? C.danger : C.revealAccent;
        this.rr(ctx, left, y - 15 * u, 52 * u, 22 * u, 11 * u);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
        this.text(ctx, r.result === 'win' ? 'WIN' : r.result === 'loss' ? 'LOSS' : 'DRAW', left + 26 * u, y, 800, 11 * u, col, 'center', 1 * u);
        this.text(ctx, r.mode, left + 62 * u, y, 700, 14 * u, C.text, 'left');
        this.text(ctx, String(r.kills), rKills, y, 800, 14 * u, r.kills ? C.text : C.textDim, 'right');
        this.text(ctx, `${r.survived} of ${r.rounds} rds`, right, y, 600, 13 * u, '#b7c0cc', 'right');
      }
      y += 4 * u;
      this.text(ctx, 'BEST = most rounds you survived in that mode.', left, y + 22 * u, 600, 11 * u, C.textDim, 'left');
      y += 24 * u;
      y += 22 * u;
    }
    ctx.restore();

    const total = y + model.scroll - top + pad;
    this.statsContentH = total;
    model.maxScroll = Math.max(0, total - viewH);
    model.scroll = Math.max(0, Math.min(model.maxScroll, model.scroll));
    if (model.maxScroll > 0) {
      const th2 = Math.max(30 * u, (viewH * viewH) / total);
      const ty2 = top + (model.scroll / model.maxScroll) * (viewH - th2);
      this.rr(ctx, x + w - 8 * u, ty2, 4 * u, th2, 2 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    // Reset + Back side by side below the panel
    const items = model.items();
    const bw = Math.min(210 * u, (w - 12 * u) / 2);
    const by = top + viewH + 16 * u;
    this.drawItem(ctx, items[0], 0, W / 2 - bw - 6 * u, by, bw, btnH, u, model.focus === 0);
    this.drawItem(ctx, items[1], 1, W / 2 + 6 * u, by, bw, btnH, u, model.focus === 1);
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
    const stack = isNarrow(W);
    const w = Math.min(780 * u, W - 32);
    const x = (W - w) / 2;
    const dSize = stack ? Math.min(w - 48, 190 * u) : Math.min(Math.min(300 * u, H - top - 130 * u) - 32 * u, 250 * u);
    const h = stack ? dSize + 200 * u : Math.min(300 * u, H - top - 130 * u);
    this.rr(ctx, x, top, w, h, 16 * u);
    ctx.fillStyle = 'rgba(14, 18, 28, 0.86)';
    ctx.fill();

    // Diagram and text: side by side normally, stacked on narrow screens.
    const dx = stack ? x + (w - dSize) / 2 : x + 20 * u;
    const dy = stack ? top + 16 * u : top + (h - dSize) / 2;
    this.drawDiagram(ctx, page, dx, dy, dSize, now);

    const tx = stack ? x + 20 * u : dx + dSize + 28 * u;
    const tw = stack ? w - 40 * u : x + w - tx - 20 * u;
    let ty = stack ? dy + dSize + 34 * u : top + 52 * u;
    this.text(ctx, HOWTO_TEXT[page].title, stack ? x + w / 2 : tx, ty, 900, (stack ? 18 : 21) * u, C.text, stack ? 'center' : 'left');
    ctx.font = `600 ${Math.round(15 * u)}px ${FONT}`;
    for (const l of HOWTO_TEXT[page].lines) {
      ty += 10 * u;
      for (const ln of this.wrap(ctx, l, tw)) {
        ty += 20 * u;
        this.text(ctx, ln, tx, ty, 600, 15 * u, '#c9d1dc', 'left');
      }
    }

    // Page arrows + dots
    const ay = top + h + 28 * u;
    const bs = (ui.touch ? 48 : 36) * u;
    const prev = { x: W / 2 - 110 * u, y: ay - bs / 2, w: bs, h: bs };
    const next = { x: W / 2 + 110 * u - bs, y: ay - bs / 2, w: bs, h: bs };
    this.arrow(ctx, prev, -1, page > 0);
    this.arrow(ctx, next, 1, page < HOWTO_PAGES - 1);
    this.regions.push({ ...prev, index: 0, part: 'dec' }, { ...next, index: 0, part: 'inc' });
    for (let i = 0; i < HOWTO_PAGES; i++) {
      ctx.beginPath();
      ctx.arc(W / 2 + (i - 1) * 26 * u, ay, 5.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = i === page ? C.hiddenAccent : 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
    this.backButton(ctx, model, W, ay + bs / 2 + 12 * u, u);
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
