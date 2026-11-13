/** Regenerates the generated SQL blocks (shop catalog in 0001, economy constants in 0002).
 *  Run with: npm run gen:sql */
import { readFileSync, writeFileSync } from 'node:fs';
import { economySql, shopSeedSql } from './sqlblocks';

function patch(file: string, begin: string, end: string, body: string): void {
  const sql = readFileSync(file, 'utf8');
  const a = sql.indexOf(begin);
  const b = sql.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`markers not found in ${file}`);
  const eol = sql.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(file, sql.slice(0, a) + `${begin}${eol}${body.replace(/\n/g, eol)}${eol}` + sql.slice(b));
  console.log(`updated ${file}`);
}

patch('supabase/migrations/0001_foundation.sql', '-- BEGIN GENERATED SHOP ITEMS', '-- END GENERATED SHOP ITEMS', shopSeedSql());
patch('supabase/migrations/0002_cloud_economy.sql', '-- BEGIN GENERATED ECONOMY', '-- END GENERATED ECONOMY', economySql());
