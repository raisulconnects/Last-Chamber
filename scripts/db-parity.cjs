/* Manual integration check against a real Supabase project (not part of `npm test`).
 *   node scripts/db-parity.cjs <SUPABASE_URL> <ANON_KEY> [--light]
 * It creates throwaway accounts (delete them later under Authentication > Users) and verifies that the SQL in
 * supabase/migrations/0002_cloud_economy.sql agrees with src/economy.ts and enforces the server-side rules. */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const light = process.argv.includes('--light'); // ~70 grid inputs and no rate-limit run: a few hundred calls
const [url, key] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!url || !key) {
  console.error('usage: node scripts/db-parity.cjs <SUPABASE_URL> <ANON_KEY>');
  process.exit(1);
}

// ---- mirror of src/economy.ts (integer math) ----
const MODE = { Classic: 1000, 'Quick Draw': 800, 'Crowded Arena': 1200, 'Tight Circle': 1100, Marathon: 1500, Custom: 500 };
const DIFF = { easy: 800, normal: 1000, hard: 1300 };
const xp = (m) => (m.rounds <= 1 ? 5 : 10 + (m.result === 'win' ? 20 : m.result === 'draw' ? 8 : 0) + m.kills * 8 + m.survived * 2);
const pay = (m) => {
  if (m.rounds <= 1) return 5;
  const bot = Math.min(1500, Math.max(800, 1000 + 100 * (m.bots - 2)));
  const mm = (MODE[m.mode] ?? 500) * (DIFF[m.difficulty] ?? 1000) * bot;
  return Math.min(150, Math.max(1, Math.floor((xp(m) * mm + 500000000) / 1000000000)));
};

let failures = 0;
const check = (name, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};
const newUser = async (tag) => {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signUp({ email: `lc.${tag}.${Date.now()}@example.com`, password: 'testpass123' });
  if (error || !data.session) throw new Error('sign up failed: ' + (error && error.message));
  return { sb, id: data.user.id };
};
const base = (o = {}) => ({ id: crypto.randomUUID(), mode: 'Classic', bots: 2, difficulty: 'normal', result: 'win', rounds: 6, survived: 6, kills: 2, at: Date.now(), v: 'test', ...o });

(async () => {
  const { sb } = await newUser('parity');

  // 1. payout / XP parity over a grid
  let n = 0, bad = 0;
  const gridModes = light ? ['Classic', 'Marathon', 'Custom'] : [...Object.keys(MODE), 'Nope'];
  const gridDiffs = light ? ['easy', 'hard'] : ['easy', 'normal', 'hard'];
  const gridBots = light ? [2, 5] : [1, 2, 3, 4, 5];
  const gridRounds = light ? [1, 6] : [1, 2, 6, 20, 60];
  for (const mode of gridModes)
    for (const difficulty of gridDiffs)
      for (const bots of gridBots)
        for (const result of ['win', 'loss', 'draw'])
          for (const rounds of gridRounds)
            for (const kills of light ? [bots] : [0, bots])
              for (const survived of light ? [rounds] : [0, Math.max(0, rounds - 1), rounds]) {
                const m = { mode, bots, difficulty, result, rounds, survived, kills };
                const a = await sb.rpc('calc_payout', { p_mode: mode, p_bots: bots, p_difficulty: difficulty, p_result: result, p_rounds: rounds, p_survived: survived, p_kills: kills });
                const b = await sb.rpc('calc_xp', { p_result: result, p_rounds: rounds, p_survived: survived, p_kills: kills });
                n++;
                if (a.data !== pay(m) || b.data !== xp(m)) {
                  bad++;
                  if (bad <= 5) console.log('  mismatch', JSON.stringify(m), 'sql', a.data, b.data, 'ts', pay(m), xp(m));
                }
              }
  check(`calc_payout / calc_xp match TypeScript on ${n} inputs`, bad === 0, `(${bad} mismatches)`);

  // 2. a fresh account: honest match pays and levels
  const u = await newUser('econ');
  let r = await u.sb.rpc('submit_match', { payload: base() });
  const d = r.data;
  check('honest match accepted', !r.error && d && d.result && !d.result.duplicate, r.error ? r.error.message : '');
  check('server paid the TypeScript amount (58)', d.result.shells === 58 && d.result.xp === 58, `shells ${d.result.shells} xp ${d.result.xp}`);
  check('XP applied (58 of 140 at level 1)', d.profile.level === 1 && d.profile.xp === 58);
  check('stats recorded', d.profile.stats.played === 1 && d.profile.stats.wins === 1 && d.profile.stats.kills === 2);
  check('match appears in recent list', d.profile.recent.length === 1);

  // 3. duplicate id pays once
  const dup = base();
  await u.sb.rpc('submit_match', { payload: dup });
  const before = (await u.sb.rpc('get_profile')).data.shells;
  r = await u.sb.rpc('submit_match', { payload: dup });
  const after = r.data.profile.shells;
  check('same match id twice pays once', r.data.result.duplicate === true && before === after);

  // 4. forged matches are rejected without paying
  const forged = {
    'kills > bots': base({ kills: 5, bots: 2 }),
    'bots out of range': base({ bots: 9 }),
    'rounds out of range': base({ rounds: 99, survived: 99 }),
    'survived > rounds': base({ survived: 7, rounds: 6 }),
    'win without surviving': base({ result: 'win', survived: 3 }),
    'bad difficulty': base({ difficulty: 'insane' }),
    'bad result': base({ result: 'flawless' }),
    'not a uuid': base({ id: 'hello' }),
    'missing fields': { id: crypto.randomUUID() },
  };
  const s0 = (await u.sb.rpc('get_profile')).data.shells;
  for (const [name, p] of Object.entries(forged)) {
    const x = await u.sb.rpc('submit_match', { payload: p });
    check(`rejects: ${name}`, x.data && x.data.error === 'invalid');
  }
  check('rejected matches paid nothing', (await u.sb.rpc('get_profile')).data.shells === s0);

  // 5. level-up bonus: a 60-round marathon win is worth lots of XP
  const big = await u.sb.rpc('submit_match', { payload: base({ mode: 'Marathon', bots: 5, rounds: 60, survived: 60, kills: 5 }) });
  const ups = big.data.result.level_ups;
  check('big match levels up and pays the bonus', ups.length >= 1 && big.data.result.bonus > 0, JSON.stringify(ups));

  // 6. shop RPCs
  let sh = await u.sb.rpc('buy_item', { item_id: 'skin-chrome' });
  check('cannot buy an item you cannot afford', sh.data.ok === false && sh.data.error === 'need_more');
  sh = await u.sb.rpc('buy_item', { item_id: 'nonexistent' });
  check('unknown item rejected', sh.data.ok === false && sh.data.error === 'unknown');
  sh = await u.sb.rpc('equip_item', { item_id: 'skin-gold' });
  check('cannot equip an item you do not own', sh.data.ok === false && sh.data.error === 'not_owned');
  const wallet = (await u.sb.rpc('get_profile')).data.shells;
  sh = await u.sb.rpc('buy_item', { item_id: 'skin-mint' }); // 100 Shells
  check('buy with enough Shells works and equips', wallet >= 100 ? sh.data.ok === true && sh.data.profile.shells === wallet - 100 && sh.data.profile.equipped.skin === 'skin-mint' : true, `wallet ${wallet}`);

  // 7. direct writes stay forbidden
  let w = await u.sb.from('profiles').update({ shells: 999999 }).eq('id', u.id).select();
  check('direct profile update denied', !!w.error);
  w = await u.sb.from('matches').insert({ id: crypto.randomUUID(), user_id: u.id, mode: 'Classic', bots: 2, difficulty: 'normal', result: 'win', rounds: 6, survived: 6, kills: 2, shells: 9999, xp: 1, played_at: new Date().toISOString() });
  check('direct match insert denied', !!w.error);

  // 8. hourly rate limit: matches beyond 60/hour are recorded but pay nothing (skipped with --light)
  const rl = light ? null : await newUser('rate');
  let throttledAt = -1;
  for (let i = 0; rl && i < 64; i++) {
    const x = await rl.sb.rpc('submit_match', { payload: base({ rounds: 2, survived: 1, kills: 0, result: 'loss' }) });
    if (x.data.result && x.data.result.throttled && throttledAt < 0) throttledAt = i;
    if (i === 63) check('61st match in an hour is throttled (pays 0)', throttledAt === 60 && x.data.result.shells === 0, `first throttled index ${throttledAt}`);
  }

  // 9. import / reconcile: monotonic and once only
  const imp = await newUser('import');
  const payload = { name: 'ImpTest', shells: 999999, total_earned: 5, owned: ['skin-chrome', 'skin-phantom', 'nope'], equipped: { skin: 'skin-chrome' }, level: 50, xp: 10, stats: { played: 9999999, wins: 5, losses: 5, draws: 0, kills: 3, bestStreak: 2, streak: 1, bestSurvived: 999, modes: { Classic: { played: 10, wins: 5, losses: 5, draws: 0, bestSurvived: 5 }, Hack: { played: 1 } } } };
  r = await imp.sb.rpc('import_local_progress', { payload });
  check('import clamps Shells to 3000', r.data.shells === 3000, `shells ${r.data.shells}`);
  check('import clamps XP to 2x the clamped earned Shells (6000 XP = level 15)', r.data.level >= 1 && r.data.level <= 15, `level ${r.data.level}`);
  check('import keeps stats sane', r.data.stats.played <= 300000 && r.data.stats.best_survived <= 60 && !r.data.stats.modes.Hack);
  const again = await imp.sb.rpc('import_local_progress', { payload: { shells: 3000, owned: [] } });
  check('second import is a no-op', again.data.shells === r.data.shells && again.data.reconciled === true);
  const empty = await newUser('empty');
  await empty.sb.rpc('submit_match', { payload: base() });
  const e = await empty.sb.rpc('import_local_progress', { payload: {} });
  check('importing an empty save never lowers server values', e.data.shells >= 58 && e.data.stats.played === 1);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
