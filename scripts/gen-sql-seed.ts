/** Regenerates the shop_items block in supabase/migrations/0001_foundation.sql from src/shop.ts.
 *  Run with: npm run gen:sql */
import { readFileSync, writeFileSync } from 'node:fs';
import { CATALOG } from '../src/shop';

const FILE = 'supabase/migrations/0001_foundation.sql';
const BEGIN = '-- BEGIN GENERATED SHOP ITEMS';
const END = '-- END GENERATED SHOP ITEMS';

export function shopSeedSql(): string {
  const rows = CATALOG.map((i) => `  ('${i.id}', '${i.category}', '${i.rarity}', ${i.price})`).join(',\n');
  return `insert into public.shop_items (id, category, rarity, price) values\n${rows}\non conflict (id) do update set category = excluded.category, rarity = excluded.rarity, price = excluded.price;`;
}

const sql = readFileSync(FILE, 'utf8');
const a = sql.indexOf(BEGIN);
const b = sql.indexOf(END);
if (a < 0 || b < 0) throw new Error('markers not found in ' + FILE);
const eol = sql.includes('\r\n') ? '\r\n' : '\n';
const block = `${BEGIN}${eol}${shopSeedSql().replace(/\n/g, eol)}${eol}`;
writeFileSync(FILE, sql.slice(0, a) + block + sql.slice(b));
console.log(`wrote ${CATALOG.length} items to ${FILE}`);
