// Round trip: seed JSON -> D1 -> JSON -> page. Must match the seed exactly.
import fs from 'fs';
import assert from 'assert/strict';
import { d1 } from './d1-shim.mjs';
import { ensureSchema, saveDoc, loadDoc, listIslands } from '../store.js';
import { renderHtml } from '../render-html.js';
const seed = JSON.parse(fs.readFileSync(new URL('../../../db/seed/governance-in-testing.json', import.meta.url), 'utf8'));
const db = d1();
await ensureSchema(db); await ensureSchema(db);          // idempotent
await saveDoc(db, seed); await saveDoc(db, seed);         // re-save replaces, no duplicates
const back = await loadDoc(db, seed.use_case.id);
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === null ? undefined : v)));
for (const k of Object.keys(seed.use_case)) {
  const a = strip(seed.use_case[k]), b = strip(back.use_case[k]);
  if (Array.isArray(a)) a.forEach((x, i) => { for (const kk of Object.keys(x)) assert.deepEqual(b[i][kk], x[kk], `${k}[${i}].${kk}`); });
  else assert.deepEqual(b, a, k);
}
assert.equal(renderHtml(back), renderHtml(seed), 'page from database differs from page from seed');
const islands = await listIslands(db);
console.log('round trip ok;', islands.length, 'island:', JSON.stringify(islands[0]).slice(0, 300));
try { await db.batch([db.prepare("INSERT INTO pain_points VALUES ('x', ?, 'flow', 9, 'a', 'b', 'c')").bind(seed.use_case.id)]); console.log('max-3 rule FAILED'); }
catch (e) { console.log('max-3 rule ok:', e.message); }
