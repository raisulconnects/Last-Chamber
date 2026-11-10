import type { GameEvent } from './events';
import { THEME } from './theme';

/** Per-layer gain for a simultaneous volley: total loudness grows slowly with shot count. */
export function volleyLayerGain(shots: number): number {
  if (shots <= 0) return 0;
  return THEME.audio.shotGain / Math.sqrt(shots);
}
/** Number of audible layers for a volley (capped so many shots never stack without limit). */
export function volleyLayers(shots: number): number {
  return Math.max(0, Math.min(shots, 3));
}

interface Stored {
  volume: number;
  muted: boolean;
}

type Stoppable = { stop: (when?: number) => void };

/**
 * Synthesized placeholder sounds via Web Audio. Every public method is failure-safe:
 * audio problems never throw into the game loop.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active = new Set<Stoppable>();
  private noiseBuf: AudioBuffer | null = null;
  volume: number = THEME.audio.defaultVolume;
  muted = false;

  constructor() {
    try {
      const raw = localStorage.getItem(THEME.audio.storageKey);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Stored>;
        if (typeof s.volume === 'number') this.volume = Math.max(0, Math.min(1, s.volume));
        if (typeof s.muted === 'boolean') this.muted = s.muted;
      }
    } catch {
      /* storage unavailable: use defaults */
    }
  }

  /** Create/resume the AudioContext. Must be called from a user gesture (Start click / key). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 8;
        this.master = this.ctx.createGain();
        this.master.connect(comp).connect(this.ctx.destination);
        this.applyGain();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
    this.save();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyGain();
    this.save();
    return this.muted;
  }

  /** Silence everything currently playing (used on restart). */
  stopAll(): void {
    try {
      for (const s of this.active) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      this.active.clear();
    } catch {
      /* ignore */
    }
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      try {
        this.playEvent(e);
      } catch {
        /* never break gameplay */
      }
    }
  }

  click(): void {
    this.safe(() => this.tone(1300, 0.04, 'square', 0.12));
  }

  // ---- internals -------------------------------------------------------------------------

  private save(): void {
    try {
      localStorage.setItem(THEME.audio.storageKey, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : this.volume * this.volume; // perceptual curve
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  private safe(fn: () => void): void {
    try {
      if (this.ctx && this.master && this.ctx.state !== 'closed') fn();
    } catch {
      /* ignore */
    }
  }

  private playEvent(e: GameEvent): void {
    switch (e.type) {
      case 'start':
        this.stopAll();
        this.safe(() => {
          this.tone(392, 0.12, 'triangle', 0.25);
          this.tone(587, 0.2, 'triangle', 0.25, 0.1);
        });
        break;
      case 'countdown':
        this.safe(() => this.tone(e.n === 1 ? 1175 : 880, 0.1, 'square', 0.14));
        break;
      case 'volley':
        this.safe(() => this.volley(e.shots));
        break;
      case 'elimination':
        this.safe(() => {
          const n = Math.min(e.count, THEME.audio.maxEliminationSounds);
          for (let i = 0; i < n; i++) this.tone(420, 0.32, 'sawtooth', 0.14, 0.12 + i * 0.1, 110);
        });
        break;
      case 'shrink':
        this.safe(() => this.shrink());
        break;
      case 'gameOver':
        this.safe(() => this.jingle(e.result));
        break;
    }
  }

  private track(node: Stoppable): void {
    this.active.add(node);
    (node as unknown as AudioScheduledSourceNode).onended = () => this.active.delete(node);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    this.track(osc);
  }

  private noise(dur: number, gain: number, freq: number, q: number, delay = 0, sweepTo?: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    this.track(src);
  }

  private volley(shots: number): void {
    const layers = volleyLayers(shots);
    const per = volleyLayerGain(shots);
    for (let i = 0; i < layers; i++) {
      const detune = 1 + (i - 1) * 0.06; // layers stay simultaneous; detune only thickens the sound
      this.noise(0.14, per, 1800 * detune, 0.8);
      this.tone(150 * detune, 0.16, 'sine', per * 0.9, 0, 45);
    }
  }

  private shrink(): void {
    this.noise(0.7, 0.18, 1400, 1.2, 0, 220);
    this.tone(90, 0.7, 'sine', 0.2, 0, 50);
  }

  private jingle(result: 'win' | 'loss' | 'draw'): void {
    const seq: [number, number][] =
      result === 'win'
        ? [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]]
        : result === 'loss'
          ? [[392, 0], [330, 0.16], [262, 0.32], [196, 0.5]]
          : [[440, 0], [440, 0.18], [392, 0.36]];
    for (const [f, d] of seq) this.tone(f, 0.3, result === 'loss' ? 'sawtooth' : 'triangle', 0.2, 0.3 + d);
  }
}
