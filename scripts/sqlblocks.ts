/** Pure generators for the SQL blocks that must mirror TypeScript rules (no node imports, so tests can use it). */
import { DIFFICULTY_PERMILLE, LIMITS, MODE_PERMILLE, PAYOUT } from '../src/economy';
import { MAX_LEVEL, levelBonus, xpNeeded } from '../src/levels';
import { CATALOG } from '../src/shop';

export function shopSeedSql(): string {
  const rows = CATALOG.map((i) => `  ('${i.id}', '${i.category}', '${i.rarity}', ${i.price})`).join(',\n');
  return `insert into public.shop_items (id, category, rarity, price) values\n${rows}\non conflict (id) do update set category = excluded.category, rarity = excluded.rarity, price = excluded.price;`;
}

/** Constant-valued SQL functions generated from src/economy.ts and src/levels.ts. */
export function economySql(): string {
  const consts: [string, number][] = [
    ['play', PAYOUT.play],
    ['win', PAYOUT.win],
    ['draw', PAYOUT.draw],
    ['kill', PAYOUT.kill],
    ['round', PAYOUT.round],
    ['early_end', PAYOUT.earlyEnd],
    ['cap', PAYOUT.cap],
    ['max_level', MAX_LEVEL],
    ['matches_per_hour', LIMITS.matchesPerHour],
    ['shells_per_day', LIMITS.shellsPerDay],
  ];
  const modes = Object.entries(MODE_PERMILLE);
  const custom = MODE_PERMILLE.Custom;
  const xpBase = xpNeeded(0);
  const xpStep = xpNeeded(1) - xpNeeded(0);
  const bBase = levelBonus(0);
  const bStep = levelBonus(1) - levelBonus(0);
  return [
    `create or replace function public.econ_const(k text) returns int language sql immutable as $$`,
    `  select case k ${consts.map(([k, v]) => `when '${k}' then ${v}`).join(' ')} end;`,
    `$$;`,
    `create or replace function public.econ_mode_pm(m text) returns int language sql immutable as $$`,
    `  select case m ${modes.map(([k, v]) => `when '${k}' then ${v}`).join(' ')} else ${custom} end;`,
    `$$;`,
    `create or replace function public.econ_known_mode(m text) returns boolean language sql immutable as $$`,
    `  select m in (${modes.map(([k]) => `'${k}'`).join(', ')});`,
    `$$;`,
    `create or replace function public.econ_diff_pm(d text) returns int language sql immutable as $$`,
    `  select case d ${Object.entries(DIFFICULTY_PERMILLE).map(([k, v]) => `when '${k}' then ${v}`).join(' ')} else 1000 end;`,
    `$$;`,
    `create or replace function public.econ_xp_needed(lv int) returns int language sql immutable as $$`,
    `  select ${xpBase} + ${xpStep} * lv;`,
    `$$;`,
    `create or replace function public.econ_level_bonus(lv int) returns int language sql immutable as $$`,
    `  select ${bBase} + ${bStep} * lv;`,
    `$$;`,
  ].join('\n');
}
