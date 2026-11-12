import { describe, expect, it } from 'vitest';
import { IMPORT_ITEM_VALUE_CAP, IMPORT_SHELLS_CAP } from '../src/merge';
import { CATALOG } from '../src/shop';

import sql from '../supabase/migrations/0001_foundation.sql?raw';

describe('SQL migration parity', () => {
  it('shop_items seed matches src/shop.ts (run npm run gen:sql if this fails)', () => {
    const rows = [...sql.matchAll(/\('([a-z0-9-]+)', '([a-z]+)', '([a-z]+)', (\d+)\)/g)].map((m) => ({ id: m[1], category: m[2], rarity: m[3], price: Number(m[4]) }));
    const want = CATALOG.map((i) => ({ id: i.id, category: i.category, rarity: i.rarity, price: i.price }));
    expect(rows).toEqual(want);
  });

  it('import caps in SQL equal the client constants', () => {
    expect(sql).toContain(`least(greatest((payload ->> 'shells')::numeric, 0), ${IMPORT_SHELLS_CAP})`);
    expect(sql).toContain(`spent + item.price <= ${IMPORT_ITEM_VALUE_CAP}`);
  });

  it('every table has row level security and no client write grants', () => {
    for (const t of ['shop_items', 'profiles', 'inventory']) expect(sql).toContain(`alter table public.${t}`);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i);
  });
});
