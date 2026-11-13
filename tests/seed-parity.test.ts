import { describe, expect, it } from 'vitest';
import { economySql, shopSeedSql } from '../scripts/sqlblocks';
import { IMPORT_ITEM_VALUE_CAP, IMPORT_SHELLS_CAP } from '../src/merge';
import { CATALOG } from '../src/shop';
import sql from '../supabase/migrations/0001_foundation.sql?raw';
import sql2 from '../supabase/migrations/0002_cloud_economy.sql?raw';

const norm = (s: string): string => s.replace(/\r\n/g, '\n').trim();
const block = (text: string, name: string): string => {
  const a = text.indexOf(`-- BEGIN GENERATED ${name}`);
  const b = text.indexOf(`-- END GENERATED ${name}`);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return norm(text.slice(a + `-- BEGIN GENERATED ${name}`.length, b));
};

describe('SQL migration parity', () => {
  it('shop_items seed matches src/shop.ts (run npm run gen:sql if this fails)', () => {
    const rows = [...sql.matchAll(/\('([a-z0-9-]+)', '([a-z]+)', '([a-z]+)', (\d+)\)/g)].map((m) => ({ id: m[1], category: m[2], rarity: m[3], price: Number(m[4]) }));
    const want = CATALOG.map((i) => ({ id: i.id, category: i.category, rarity: i.rarity, price: i.price }));
    expect(rows).toEqual(want);
    expect(block(sql, 'SHOP ITEMS')).toBe(norm(shopSeedSql()));
  });

  it('economy constants block matches src/economy.ts and src/levels.ts (run npm run gen:sql if this fails)', () => {
    expect(block(sql2, 'ECONOMY')).toBe(norm(economySql()));
  });

  it('import caps in SQL equal the client constants', () => {
    expect(sql).toContain(`least(greatest((payload ->> 'shells')::numeric, 0), ${IMPORT_SHELLS_CAP})`);
    expect(sql).toContain(`spent + item.price <= ${IMPORT_ITEM_VALUE_CAP}`);
    expect(sql2).toContain(`clamp_int(public.jnum(payload, 'shells'), 0, ${IMPORT_SHELLS_CAP})`);
    expect(sql2).toContain(`select ${IMPORT_ITEM_VALUE_CAP} - coalesce(sum(s2.price), 0)`);
  });

  it('every table has row level security and no client write grants', () => {
    for (const t of ['shop_items', 'profiles', 'inventory']) expect(sql).toContain(`alter table public.${t}`);
    for (const t of ['player_stats', 'matches']) expect(sql2).toContain(`alter table public.${t} enable row level security`);
    for (const text of [sql, sql2]) expect(text).not.toMatch(/grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i);
  });
});
