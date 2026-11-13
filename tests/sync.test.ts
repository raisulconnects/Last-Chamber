import { describe, expect, it } from 'vitest';
import type { MatchSummary, SubmitData } from '../src/merge';
import { QUEUE_MAX, emptyQueue, enqueue, flushItems, sanitizeQueue } from '../src/sync';
import type { SubmitOutcome } from '../src/sync';
import { MenuModel } from '../src/menu/menuModel';
import { emptyProgress } from '../src/progress';

const match = (id: string, o: Partial<MatchSummary> = {}): MatchSummary => ({
  id,
  mode: 'Classic',
  bots: 2,
  difficulty: 'normal',
  result: 'win',
  rounds: 6,
  survived: 6,
  kills: 2,
  at: 1_700_000_000_000,
  v: '0.8.0',
  ...o,
});
const ok = (tag: string): SubmitOutcome => ({ kind: 'ok', data: { shells: 1, bonus: 0, xp: 1, levelUps: [], duplicate: false, throttled: false, profile: { displayName: tag } as unknown as SubmitData['profile'] } });

describe('match queue', () => {
  it('adds matches oldest first and ignores a repeated id', () => {
    let q = emptyQueue('u1');
    q = enqueue(q, match('aaaaaaaa-1'));
    q = enqueue(q, match('aaaaaaaa-2'));
    q = enqueue(q, match('aaaaaaaa-1'));
    expect(q.items.map((i) => i.id)).toEqual(['aaaaaaaa-1', 'aaaaaaaa-2']);
  });

  it('keeps only the newest QUEUE_MAX matches', () => {
    let q = emptyQueue('u1');
    for (let i = 0; i < QUEUE_MAX + 5; i++) q = enqueue(q, match(`match-id-${String(i).padStart(3, '0')}`));
    expect(q.items).toHaveLength(QUEUE_MAX);
    expect(q.items[0].id).toBe('match-id-005');
  });

  it('sanitizes stored junk', () => {
    const q = sanitizeQueue({
      uid: 'u1',
      items: [match('good-id-1'), { id: 'short' }, { id: 'bad-result-1', result: 'maybe' }, match('good-id-1'), null, 7, match('good-id-2', { mode: 'x'.repeat(100) })],
    });
    expect(q.uid).toBe('u1');
    expect(q.items.map((i) => i.id)).toEqual(['good-id-1', 'good-id-2']);
    expect(q.items[1].mode.length).toBe(40);
    expect(sanitizeQueue('nope')).toEqual(emptyQueue());
    expect(sanitizeQueue({ uid: 1, items: 'x' })).toEqual(emptyQueue());
  });
});

describe('flushItems', () => {
  it('delivers everything in order and returns the newest response', async () => {
    const seen: string[] = [];
    const res = await flushItems([match('m-aaaaaaaa'), match('m-bbbbbbbb')], async (m) => {
      seen.push(m.id);
      return ok(m.id);
    });
    expect(seen).toEqual(['m-aaaaaaaa', 'm-bbbbbbbb']);
    expect(res.remaining).toEqual([]);
    expect(res.network).toBe(false);
    expect(res.last?.profile.displayName).toBe('m-bbbbbbbb');
  });

  it('stops on a network failure and keeps the rest queued, in order', async () => {
    let n = 0;
    const res = await flushItems([match('m-aaaaaaaa'), match('m-bbbbbbbb'), match('m-cccccccc')], async () => (++n === 2 ? { kind: 'network' } : ok('x')));
    expect(res.remaining.map((m) => m.id)).toEqual(['m-bbbbbbbb', 'm-cccccccc']);
    expect(res.network).toBe(true);
    expect(n).toBe(2); // no retry storm
  });

  it('drops a match the server calls invalid and carries on', async () => {
    const res = await flushItems([match('m-aaaaaaaa'), match('m-bbbbbbbb')], async (m) => (m.id === 'm-aaaaaaaa' ? { kind: 'invalid' } : ok('b')));
    expect(res.remaining).toEqual([]);
    expect(res.last?.profile.displayName).toBe('b');
  });
});

describe('shop while signed in', () => {
  const env = { volume: 0.6, muted: false, reduceFlashing: false };
  const shop = (): MenuModel => {
    const m = new MenuModel(env);
    m.accountAvailable = true;
    m.accountInfo = { status: 'signedIn', email: 'a@b.co', level: 1 };
    m.progress = { ...emptyProgress(), shells: 150 };
    m.focus = m.items().findIndex((i) => i.id === 'shop');
    m.activate();
    return m;
  };

  it('asks the server to buy instead of changing the wallet locally', () => {
    const m = shop();
    m.focus = m.items().findIndex((i) => i.id === 'shop:skin-mint'); // 100 Shells
    expect(m.activate()).toEqual({ type: 'buy', id: 'skin-mint' });
    expect(m.progress.shells).toBe(150);
    expect(m.progress.owned).not.toContain('skin-mint');
  });

  it('asks the server to equip owned items and refuses unaffordable ones locally', () => {
    const m = shop();
    m.progress = { ...m.progress, owned: [...m.progress.owned, 'skin-mint'] };
    m.focus = m.items().findIndex((i) => i.id === 'shop:skin-mint');
    expect(m.activate()).toEqual({ type: 'equip', id: 'skin-mint' });
    m.focus = m.items().findIndex((i) => i.id === 'shop:skin-chrome'); // 3000 Shells
    expect(m.activate()).toBeNull();
    expect(m.toast.text).toMatch(/Need 2850 more/);
  });
});
