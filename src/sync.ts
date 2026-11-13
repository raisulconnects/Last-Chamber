/** Offline-first queue of finished matches for signed-in players, plus the flush logic.
 *  The queue lives in localStorage so matches survive reloads and offline sessions. */
import type { MatchSummary, SubmitData } from './merge';

export const QUEUE_KEY = 'last-chamber-queue';
export const QUEUE_MAX = 50;

export interface QueueFile {
  uid: string; // the account the queued matches belong to
  items: MatchSummary[];
}

export type SubmitOutcome = { kind: 'ok'; data: SubmitData } | { kind: 'invalid' } | { kind: 'network' };

export const emptyQueue = (uid = ''): QueueFile => ({ uid, items: [] });

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

/** Validates untrusted stored data. Never throws. */
export function sanitizeQueue(raw: unknown): QueueFile {
  if (!raw || typeof raw !== 'object') return emptyQueue();
  const r = raw as Record<string, unknown>;
  const out = emptyQueue(typeof r.uid === 'string' ? r.uid : '');
  if (!Array.isArray(r.items)) return out;
  const seen = new Set<string>();
  for (const it of r.items) {
    if (!it || typeof it !== 'object') continue;
    const m = it as Record<string, unknown>;
    if (typeof m.id !== 'string' || m.id.length < 8 || m.id.length > 64 || seen.has(m.id)) continue;
    if (m.result !== 'win' && m.result !== 'loss' && m.result !== 'draw') continue;
    seen.add(m.id);
    out.items.push({
      id: m.id,
      mode: typeof m.mode === 'string' ? m.mode.slice(0, 40) : 'Custom',
      bots: num(m.bots),
      difficulty: typeof m.difficulty === 'string' ? m.difficulty.slice(0, 12) : 'normal',
      result: m.result,
      rounds: num(m.rounds),
      survived: num(m.survived),
      kills: num(m.kills),
      at: num(m.at),
      v: typeof m.v === 'string' ? m.v.slice(0, 20) : '',
    });
  }
  out.items = out.items.slice(-QUEUE_MAX);
  return out;
}

/** Adds a match (newest last). A repeated id is ignored; beyond QUEUE_MAX the oldest are dropped. */
export function enqueue(q: QueueFile, m: MatchSummary): QueueFile {
  if (q.items.some((x) => x.id === m.id)) return q;
  return { ...q, items: [...q.items, m].slice(-QUEUE_MAX) };
}

export function loadQueue(): QueueFile {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? sanitizeQueue(JSON.parse(raw)) : emptyQueue();
  } catch {
    return emptyQueue();
  }
}

export function saveQueue(q: QueueFile): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable: matches then only live in memory for this session */
  }
}

export interface FlushResult {
  remaining: MatchSummary[];
  last: SubmitData | null; // response to the newest accepted match, for refreshing the local state
  network: boolean; // stopped early because the server could not be reached
}

/**
 * Sends queued matches one at a time, oldest first. A match the server rejects as invalid is dropped
 * (it would never succeed); a network failure stops the run and keeps everything else queued.
 */
export async function flushItems(items: MatchSummary[], submit: (m: MatchSummary) => Promise<SubmitOutcome>): Promise<FlushResult> {
  const remaining = [...items];
  let last: SubmitData | null = null;
  while (remaining.length > 0) {
    const out = await submit(remaining[0]);
    if (out.kind === 'network') return { remaining, last, network: true };
    if (out.kind === 'ok') last = out.data;
    remaining.shift();
  }
  return { remaining, last, network: false };
}

/** Owns the queue for the current account: persists it, flushes on the right triggers, reports pending count. */
export class SyncManager {
  private q: QueueFile = loadQueue();
  private busy: Promise<void> | null = null;
  private gen = 0; // bumps when the account changes or the queue is cleared, invalidating in-flight flushes
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Called with the server profile once the queue is fully flushed. */
  onSynced: (data: SubmitData) => void = () => undefined;
  onChange: () => void = () => undefined;

  constructor(private submit: (m: MatchSummary) => Promise<SubmitOutcome>) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flush());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void this.flush();
      });
    }
  }

  get pending(): number {
    return this.q.items.length;
  }

  /** Bind the queue to the signed-in account; matches queued for another account are discarded. */
  setUser(uid: string): void {
    if (this.q.uid !== uid) {
      this.gen++;
      this.q = emptyQueue(uid);
      saveQueue(this.q);
    }
    this.onChange();
  }

  clear(): void {
    this.gen++;
    this.q = emptyQueue();
    saveQueue(this.q);
    this.stopTimer();
    this.onChange();
  }

  push(m: MatchSummary): void {
    this.q = enqueue(this.q, m);
    saveQueue(this.q);
    this.onChange();
    void this.flush();
  }

  /** Flush now (joins a flush already running). Resolves when done; never throws. */
  flush(): Promise<void> {
    if (this.busy) return this.busy;
    if (this.q.items.length === 0) return Promise.resolve();
    this.busy = this.run().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }

  private async run(): Promise<void> {
    const gen = this.gen;
    try {
      const snapshot = [...this.q.items];
      const res = await flushItems(snapshot, this.submit);
      if (gen !== this.gen) return; // the account changed or signed out meanwhile: this result is stale
      // Only drop what this run actually delivered; matches pushed meanwhile stay queued.
      const left = new Set(res.remaining.map((i) => i.id));
      const delivered = new Set(snapshot.filter((i) => !left.has(i.id)).map((i) => i.id));
      this.q = { ...this.q, items: this.q.items.filter((i) => !delivered.has(i.id)) };
      saveQueue(this.q);
      this.onChange();
      if (this.q.items.length > 0) this.startTimer();
      else {
        this.stopTimer();
        if (res.last) this.onSynced(res.last);
      }
    } catch {
      this.startTimer();
    }
  }

  private startTimer(): void {
    if (this.timer || typeof window === 'undefined') return;
    this.timer = setInterval(() => void this.flush(), 60_000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
