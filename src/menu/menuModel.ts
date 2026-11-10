import { CLASSIC, PRESETS, cycleDifficulty, loadCustom, saveCustom, stepSetting } from '../settings';
import type { MatchSettings } from '../settings';
import { emptyProgress } from '../progress';
import type { Progress } from '../progress';
import { CATEGORIES, CONFIRM_FROM, buyOrEquip, isEquipped, isOwned, itemById, itemsIn } from '../shop';
import { emptyStats } from '../stats';
import type { StatsData } from '../stats';

export type Screen =
  | 'main'
  | 'play'
  | 'single'
  | 'custom'
  | 'multiplayer'
  | 'howto'
  | 'stats'
  | 'shop'
  | 'profile'
  | 'settings'
  | 'credits'
  | 'changelog';

export const HOWTO_PAGES = 3;

/** Settings state owned by the app (audio + prefs); the menu only reads and requests changes. */
export interface MenuEnv {
  volume: number; // 0..1
  muted: boolean;
  reduceFlashing: boolean;
}

export type MenuAction =
  | { type: 'start'; settings: MatchSettings; modeName: string }
  | { type: 'setVolume'; value: number }
  | { type: 'toggleMute' }
  | { type: 'setReduceFlashing'; value: boolean }
  | { type: 'resetStats' }
  | { type: 'saveProgress' }
  | { type: 'rename' };

export interface MenuItem {
  id: string;
  label: string;
  kind: 'button' | 'stepper' | 'toggle';
  value?: string;
  hint?: string;
  badge?: string;
  primary?: boolean;
}

export type ClickPart = 'main' | 'dec' | 'inc' | 'tab';

const NUM_KEYS = ['botCount', 'hiddenDuration', 'revealDuration', 'safeRadiusMultiplier', 'minSafeRadius', 'maxRounds'] as const;
type NumKey = (typeof NUM_KEYS)[number];

const secs = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1)}s`;

/** Pure menu navigation state. No canvas or DOM access, so it is fully unit-testable. */
export class MenuModel {
  screen: Screen = 'main';
  focus = 0;
  howtoPage = 0;
  scroll = 0;
  maxScroll = 0;
  custom: MatchSettings;
  /** Latest stats, owned and updated by the app; the Stats screen only reads it. */
  stats: StatsData = emptyStats();
  /** True after the first tap on "Reset stats"; a second tap confirms. */
  resetArmed = false;
  /** Wallet, inventory and loadout, owned and updated by the app (and by purchases here). */
  progress: Progress = emptyProgress();
  shopTab = 0;
  /** An expensive item waiting for its confirming second tap. */
  armedId: string | null = null;
  /** Latest shop message; the view shows it briefly (seq changes on every new message). */
  toast: { text: string; kind: 'good' | 'bad' | 'info'; seq: number } = { text: '', kind: 'info', seq: 0 };
  private stack: { screen: Screen; focus: number }[] = [];

  constructor(
    public env: MenuEnv,
    custom: MatchSettings = loadCustom(),
  ) {
    this.custom = custom;
  }

  /** Items for the current screen. */
  items(): MenuItem[] {
    const back: MenuItem = { id: 'back', label: 'Back', kind: 'button' };
    switch (this.screen) {
      case 'main':
        return [
          { id: 'play', label: 'Play', kind: 'button', primary: true },
          { id: 'shop', label: 'Shop', kind: 'button' },
          { id: 'profile', label: 'Profile', kind: 'button' },
          { id: 'stats', label: 'Stats', kind: 'button' },
          { id: 'howto', label: 'How to Play', kind: 'button' },
          { id: 'settings', label: 'Settings', kind: 'button' },
          { id: 'credits', label: 'Credits', kind: 'button' },
          { id: 'changelog', label: 'Changelog', kind: 'button' },
        ];
      case 'play':
        return [
          { id: 'single', label: 'Single Player', kind: 'button', primary: true, hint: 'You against bots' },
          { id: 'multi', label: 'Multiplayer', kind: 'button', badge: 'COMING SOON' },
          back,
        ];
      case 'single':
        return [
          ...PRESETS.map((p): MenuItem => ({ id: `preset:${p.id}`, label: p.name, kind: 'button', hint: p.blurb })),
          { id: 'custom', label: 'Custom', kind: 'button', hint: 'Build your own match' },
          back,
        ];
      case 'custom': {
        const c = this.custom;
        return [
          { id: 'c:botCount', label: 'Bots', kind: 'stepper', value: String(c.botCount) },
          { id: 'c:hiddenDuration', label: 'Hidden time', kind: 'stepper', value: secs(c.hiddenDuration) },
          { id: 'c:revealDuration', label: 'Reveal time', kind: 'stepper', value: secs(c.revealDuration) },
          {
            id: 'c:safeRadiusMultiplier',
            label: 'Circle shrink',
            kind: 'stepper',
            value: `${Math.round((1 - c.safeRadiusMultiplier) * 100)}% / round`,
          },
          { id: 'c:minSafeRadius', label: 'Minimum circle', kind: 'stepper', value: String(c.minSafeRadius) },
          { id: 'c:maxRounds', label: 'Max rounds', kind: 'stepper', value: String(c.maxRounds) },
          {
            id: 'c:difficulty',
            label: 'Bot difficulty',
            kind: 'stepper',
            value: c.botDifficulty[0].toUpperCase() + c.botDifficulty.slice(1),
          },
          { id: 'c:reset', label: 'Reset to Classic', kind: 'button' },
          { id: 'c:play', label: 'Play', kind: 'button', primary: true },
          back,
        ];
      }
      case 'multiplayer':
        return [back];
      case 'howto':
        return [back];
      case 'settings':
        return [
          { id: 'volume', label: 'Master volume', kind: 'stepper', value: `${Math.round(this.env.volume * 100)}%` },
          { id: 'mute', label: 'Sound', kind: 'toggle', value: this.env.muted ? 'OFF' : 'ON' },
          { id: 'flash', label: 'Reduce flashing', kind: 'toggle', value: this.env.reduceFlashing ? 'ON' : 'OFF' },
          back,
        ];
      case 'shop':
        return [
          ...itemsIn(CATEGORIES[this.shopTab].id).map((i): MenuItem => ({ id: `shop:${i.id}`, label: i.name, kind: 'button', hint: i.blurb })),
          back,
        ];
      case 'profile':
        return [
          { id: 'rename', label: 'Change name', kind: 'button' },
          { id: 'goShop', label: 'Open Shop', kind: 'button' },
          { id: 'goStats', label: 'View Stats', kind: 'button' },
          back,
        ];
      case 'stats':
        return [
          { id: 'resetStats', label: this.resetArmed ? 'Tap again to confirm' : 'Reset stats', kind: 'button' },
          back,
        ];
      case 'credits':
        return [back];
      case 'changelog':
        return [back];
    }
  }

  private current(): MenuItem | undefined {
    return this.items()[this.focus];
  }

  private go(screen: Screen): void {
    this.stack.push({ screen: this.screen, focus: this.focus });
    this.screen = screen;
    this.focus = 0;
    this.scroll = 0;
    this.maxScroll = 0;
    this.resetArmed = false;
    this.armedId = null;
    if (screen === 'howto') this.howtoPage = 0;
  }

  /** Up/down. On the changelog it scrolls instead. */
  move(dir: 1 | -1): void {
    if (this.screen === 'changelog') {
      this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + dir * 40));
      return;
    }
    const n = this.items().length;
    this.focus = (this.focus + dir + n) % n;
    this.resetArmed = false;
    this.armedId = null;
  }

  /** Scroll a scrollable screen (wheel / touch drag). */
  scrollBy(delta: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + delta));
  }

  hover(index: number): void {
    if (index >= 0 && index < this.items().length && index !== this.focus) {
      this.focus = index;
      this.resetArmed = false;
      this.armedId = null;
    }
  }

  private say(text: string, kind: 'good' | 'bad' | 'info'): void {
    this.toast = { text, kind, seq: this.toast.seq + 1 };
  }

  /** Switch the shop category tab (keyboard left/right or a tap on a tab). */
  setTab(index: number): void {
    const n = CATEGORIES.length;
    this.shopTab = ((index % n) + n) % n;
    this.focus = 0;
    this.scroll = 0;
    this.armedId = null;
  }

  /** Buy / equip the shop item with this id. Expensive items need a confirming second tap. */
  private shopActivate(id: string): MenuAction | null {
    const item = itemById(id);
    if (!item) return null;
    const p = this.progress;
    if (!isOwned(p, id) && item.price >= CONFIRM_FROM && p.shells >= item.price && this.armedId !== id) {
      this.armedId = id;
      this.say(`Tap again to buy ${item.name} for ${item.price}`, 'info');
      return null;
    }
    this.armedId = null;
    if (isEquipped(p, id)) {
      this.say(`${item.name} is already equipped`, 'info');
      return null;
    }
    const r = buyOrEquip(p, id);
    if (r.kind === 'needMore') {
      this.say(`Need ${r.missing} more Shells`, 'bad');
      return null;
    }
    if (r.kind === 'bought') {
      this.progress = r.progress;
      this.say(`Bought and equipped ${item.name}`, 'good');
      return { type: 'saveProgress' };
    }
    if (r.kind === 'equipped') {
      this.progress = r.progress;
      this.say(`Equipped ${item.name}`, 'good');
      return { type: 'saveProgress' };
    }
    return null;
  }

  /** Left/right: change a stepper/toggle value, flip How to Play pages, or switch shop tabs. */
  adjust(dir: 1 | -1): MenuAction | null {
    if (this.screen === 'shop') {
      this.setTab(this.shopTab + dir);
      return null;
    }
    if (this.screen === 'howto') {
      this.howtoPage = Math.max(0, Math.min(HOWTO_PAGES - 1, this.howtoPage + dir));
      return null;
    }
    const it = this.current();
    if (!it) return null;
    if (it.id.startsWith('c:') && it.kind === 'stepper') {
      if (it.id === 'c:difficulty') this.custom = cycleDifficulty(this.custom, dir);
      else this.custom = stepSetting(this.custom, it.id.slice(2) as NumKey, dir);
      saveCustom(this.custom);
      return null;
    }
    if (it.id === 'volume') {
      const v = Math.max(0, Math.min(1, Math.round((this.env.volume + dir * 0.1) * 10) / 10));
      return { type: 'setVolume', value: v };
    }
    if (it.id === 'mute') return { type: 'toggleMute' };
    if (it.id === 'flash') return { type: 'setReduceFlashing', value: !this.env.reduceFlashing };
    return null;
  }

  /** Enter/click on the focused item. Returns an action for the app, if any. */
  activate(): MenuAction | null {
    const it = this.current();
    if (!it) return null;
    switch (it.id) {
      case 'play':
        this.go('play');
        return null;
      case 'howto':
        this.go('howto');
        return null;
      case 'settings':
        this.go('settings');
        return null;
      case 'stats':
      case 'goStats':
        this.go('stats');
        return null;
      case 'shop':
      case 'goShop':
        this.go('shop');
        return null;
      case 'profile':
        this.go('profile');
        return null;
      case 'rename':
        return { type: 'rename' };
      case 'resetStats':
        if (this.resetArmed) {
          this.resetArmed = false;
          return { type: 'resetStats' };
        }
        this.resetArmed = true;
        return null;
      case 'credits':
        this.go('credits');
        return null;
      case 'changelog':
        this.go('changelog');
        return null;
      case 'single':
        this.go('single');
        return null;
      case 'multi':
        this.go('multiplayer'); // informational only; never starts a match
        return null;
      case 'custom':
        this.go('custom');
        return null;
      case 'back':
        this.back();
        return null;
      case 'c:reset':
        this.custom = { ...CLASSIC };
        saveCustom(this.custom);
        return null;
      case 'c:play':
        saveCustom(this.custom);
        return { type: 'start', settings: { ...this.custom }, modeName: 'Custom' };
      case 'volume':
      case 'c:botCount':
      case 'c:hiddenDuration':
      case 'c:revealDuration':
      case 'c:safeRadiusMultiplier':
      case 'c:minSafeRadius':
      case 'c:maxRounds':
      case 'c:difficulty':
        return this.adjust(1);
      case 'mute':
      case 'flash':
        return this.adjust(1);
    }
    if (it.id.startsWith('shop:')) return this.shopActivate(it.id.slice(5));
    if (it.id.startsWith('preset:')) {
      const p = PRESETS.find((x) => `preset:${x.id}` === it.id);
      if (p) return { type: 'start', settings: { ...p.settings }, modeName: p.name };
    }
    return null;
  }

  /** Mouse click on an item region (`dec`/`inc` are the arrow zones of steppers). */
  clickItem(index: number, part: ClickPart): MenuAction | null {
    if (part === 'tab') {
      this.setTab(index);
      return null;
    }
    this.hover(index);
    if (part === 'dec') return this.adjust(-1);
    if (part === 'inc') return this.adjust(1);
    const it = this.current();
    // Clicking a stepper body should not silently change it; only arrows and toggles do.
    if (it?.kind === 'stepper') return null;
    return this.activate();
  }

  /** Esc/Backspace. Does nothing on the main screen. */
  back(): boolean {
    const prev = this.stack.pop();
    if (!prev) return false;
    this.screen = prev.screen;
    this.focus = prev.focus;
    this.scroll = 0;
    this.resetArmed = false;
    this.armedId = null;
    return true;
  }

  /** Return to the root menu (used when leaving a match). */
  toMain(): void {
    this.stack = [];
    this.screen = 'main';
    this.focus = 0;
    this.scroll = 0;
    this.resetArmed = false;
  }
}
