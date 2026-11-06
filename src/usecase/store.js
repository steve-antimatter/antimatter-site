// Mazinator data layer on Cloudflare D1.
// A use case moves in and out of the database as one JSON document
// ({ libraries, use_case }), the same shape the renderers draw and the
// authoring chat will edit.
import { SCHEMA } from './schema.js';

const LIB_TABLES = [ // insert order respects foreign keys
  ['products', ['id', 'name', 'summary', 'logo_asset', 'sort']],
  ['industries', ['id', 'name']],
  ['personas', ['id', 'name', 'descriptor']],
  ['sources', ['id', 'title', 'url', 'publisher']],
  ['partners', ['id', 'name', 'program', 'source_id']],
  ['competitors', ['id', 'name', 'products', 'url']],
  ['customers', ['id', 'name', 'display_name', 'anonymous', 'industry_id', 'descriptor']],
  ['quotes', ['id', 'customer_id', 'text', 'speaker_name', 'speaker_title', 'source_id']],
];

const val = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

// Create tables if missing. Safe to run any number of times.
export async function ensureSchema(db) {
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
}

// Write a whole use case: upsert the library rows it carries, then replace the use case.
export async function saveDoc(db, doc) {
  const st = [];
  const add = (sql, params) => st.push(db.prepare(sql).bind(...params.map(val)));
  const libs = doc.libraries || {};
  for (const [table, cols] of LIB_TABLES) {
    for (const row of libs[table] || []) {
      add(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ` +
        `ON CONFLICT(id) DO UPDATE SET ${cols.slice(1).map((c) => `${c}=excluded.${c}`).join(', ')}`, cols.map((c) => row[c]));
    }
  }
  const u = doc.use_case, id = u.id, m = u.map || {};
  // Children are deleted explicitly: D1 does not guarantee foreign-key cascades.
  for (const t of ['pain_point_personas', 'pain_point_industries']) {
    add(`DELETE FROM ${t} WHERE pain_point_id IN (SELECT id FROM pain_points WHERE use_case_id = ?)`, [id]);
  }
  for (const t of ['use_case_industries', 'use_case_personas', 'pain_points', 'use_case_customers',
    'use_case_partners', 'use_case_competitors', 'objections', 'use_case_sources']) {
    add(`DELETE FROM ${t} WHERE use_case_id = ?`, [id]);
  }
  add(`INSERT INTO use_cases (id, title, author, created_on, status, problem, position, pain_points_note, map_x, map_y, map_seed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author, created_on=excluded.created_on,
         status=excluded.status, problem=excluded.problem, position=excluded.position, pain_points_note=excluded.pain_points_note,
         map_x=excluded.map_x, map_y=excluded.map_y, map_seed=excluded.map_seed, updated_at=excluded.updated_at`,
    [id, u.title, u.author, u.created_on, u.status || 'draft', u.problem || '', u.position || '', u.pain_points_note, m.x, m.y, m.seed]);
  (u.industries || []).forEach((r, i) => add('INSERT INTO use_case_industries (use_case_id, industry_id, sort, label, drives_need) VALUES (?, ?, ?, ?, ?)',
    [id, r.industry_id, i + 1, r.label, r.drives_need]));
  (u.personas || []).forEach((r, i) => add('INSERT INTO use_case_personas (use_case_id, persona_id, sort, descriptor, role_in_deal, cares_about) VALUES (?, ?, ?, ?, ?, ?)',
    [id, r.persona_id, i + 1, r.descriptor, r.role_in_deal, r.cares_about]));
  (u.pain_points || []).forEach((r, i) => {
    add('INSERT INTO pain_points (id, use_case_id, product_id, sort, title, detail, fix) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.id, id, r.product_id, i + 1, r.title, r.detail, r.fix]);
    for (const p of r.personas || []) add('INSERT INTO pain_point_personas VALUES (?, ?)', [r.id, p]);
    for (const x of r.industries || []) add('INSERT INTO pain_point_industries VALUES (?, ?)', [r.id, x]);
  });
  (u.customers || []).forEach((r, i) => add('INSERT INTO use_case_customers (use_case_id, customer_id, sort, quote_id, what_they_did, source_id, source_label) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, r.customer_id, i + 1, r.quote_id, r.what_they_did, r.source_id, r.source_label || 'Case study']));
  (u.partners || []).forEach((r, i) => add('INSERT INTO use_case_partners (use_case_id, partner_id, sort, why_it_matters) VALUES (?, ?, ?, ?)',
    [id, r.partner_id, i + 1, r.why_it_matters]));
  (u.competitors || []).forEach((r, i) => add('INSERT INTO use_case_competitors (use_case_id, competitor_id, sort, their_pitch, how_we_win, url) VALUES (?, ?, ?, ?, ?, ?)',
    [id, r.competitor_id, i + 1, r.their_pitch, r.how_we_win, r.url]));
  (u.objections || []).forEach((r, i) => add('INSERT INTO objections (id, use_case_id, sort, objection, response) VALUES (?, ?, ?, ?, ?)',
    [`${id}-obj-${i + 1}`, id, i + 1, r.objection, r.response]));
  let n = 0;
  for (const g of u.sources || []) for (const sid of g.ids) {
    add('INSERT INTO use_case_sources (use_case_id, source_id, grp, sort) VALUES (?, ?, ?, ?)', [id, sid, g.grp, ++n]);
  }
  await db.batch(st); // one transaction: all or nothing
}

// Read a use case back as a document, with the full libraries attached.
export async function loadDoc(db, id) {
  const all = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results;
  const u = await db.prepare('SELECT * FROM use_cases WHERE id = ?').bind(id).first();
  if (!u) return null;
  const libraries = {};
  for (const [table, cols] of LIB_TABLES) {
    libraries[table] = (await all(`SELECT ${cols.join(', ')} FROM ${table}`)).map((r) =>
      table === 'customers' ? { ...r, anonymous: !!r.anonymous } : r);
  }
  const pps = await all('SELECT id, product_id, title, detail, fix FROM pain_points WHERE use_case_id = ? ORDER BY sort', id);
  for (const p of pps) {
    p.personas = (await all('SELECT persona_id FROM pain_point_personas WHERE pain_point_id = ?', p.id)).map((r) => r.persona_id);
    p.industries = (await all('SELECT industry_id FROM pain_point_industries WHERE pain_point_id = ?', p.id)).map((r) => r.industry_id);
  }
  const groups = [];
  for (const r of await all('SELECT grp, source_id FROM use_case_sources WHERE use_case_id = ? ORDER BY sort', id)) {
    if (!groups.length || groups[groups.length - 1].grp !== r.grp) groups.push({ grp: r.grp, ids: [] });
    groups[groups.length - 1].ids.push(r.source_id);
  }
  return {
    libraries,
    use_case: {
      id: u.id, title: u.title, author: u.author, created_on: u.created_on, status: u.status,
      problem: u.problem, position: u.position, map: { x: u.map_x, y: u.map_y, seed: u.map_seed },
      industries: await all('SELECT industry_id, label, drives_need FROM use_case_industries WHERE use_case_id = ? ORDER BY sort', id),
      personas: await all('SELECT persona_id, descriptor, role_in_deal, cares_about FROM use_case_personas WHERE use_case_id = ? ORDER BY sort', id),
      pain_points: pps,
      pain_points_note: u.pain_points_note,
      customers: await all('SELECT customer_id, quote_id, what_they_did, source_id, source_label FROM use_case_customers WHERE use_case_id = ? ORDER BY sort', id),
      partners: await all('SELECT partner_id, why_it_matters FROM use_case_partners WHERE use_case_id = ? ORDER BY sort', id),
      competitors: await all('SELECT competitor_id, url, their_pitch, how_we_win FROM use_case_competitors WHERE use_case_id = ? ORDER BY sort', id),
      objections: await all('SELECT objection, response FROM objections WHERE use_case_id = ? ORDER BY sort', id),
      sources: groups,
    },
  };
}

// Islands for the chart: one per use case, with its tags for filters.
export async function listIslands(db) {
  const rows = (await db.prepare('SELECT id, title, status, map_x, map_y, map_seed, updated_at FROM use_cases ORDER BY created_on').all()).results;
  const tags = (await db.prepare('SELECT use_case_id, kind, tag FROM use_case_tags').all()).results;
  const products = Object.fromEntries((await db.prepare('SELECT id, name FROM products').all()).results.map((r) => [r.id, r.name]));
  return rows.map((r) => {
    const t = tags.filter((x) => x.use_case_id === r.id);
    const pick = (k) => t.filter((x) => x.kind === k).map((x) => x.tag).sort();
    return { id: r.id, title: r.title, status: r.status, x: r.map_x, y: r.map_y, seed: r.map_seed, updated_at: r.updated_at,
      products: pick('product').map((p) => ({ id: p, name: products[p] || p })), industries: pick('industry'), partners: pick('partner') };
  });
}

// ---------- drafts, status, chat ----------

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

// Open spots on the chart, clear of the boat's home port, compass and the example islands.
const SLOTS = [[560, 640], [1060, 540], [330, 520], [1320, 430], [700, 200], [1010, 170], [1180, 760], [420, 690], [560, 230], [1450, 560]];

export async function createDraft(db, { title, author }) {
  title = String(title || '').trim(); author = String(author || '').trim();
  if (!title) throw new Error('A use case needs a name.');
  const base = slugify(title); let id = base, n = 1;
  while (await db.prepare('SELECT 1 FROM use_cases WHERE id = ?').bind(id).first()) id = `${base}-${++n}`;
  const taken = (await db.prepare('SELECT map_x, map_y FROM use_cases').all()).results;
  const free = SLOTS.find(([x, y]) => taken.every((t) => Math.hypot(t.map_x - x, t.map_y - y) > 200)) || SLOTS[taken.length % SLOTS.length];
  const today = new Date().toISOString().slice(0, 10);
  await db.prepare(`INSERT INTO use_cases (id, title, author, created_on, status, problem, position, map_x, map_y, map_seed)
    VALUES (?, ?, ?, ?, 'draft', '', '', ?, ?, ?)`).bind(id, title, author || 'Unknown', today, free[0], free[1], 2 + (taken.length * 3) % 11).run();
  return id;
}

// draft -> review -> locked. Locking keeps a snapshot of exactly what was approved.
export async function setStatus(db, id, status, who) {
  if (!['draft', 'review', 'locked'].includes(status)) throw new Error('Unknown status');
  if (status === 'locked') {
    const doc = await loadDoc(db, id);
    if (!doc) throw new Error('Not found');
    const v = await db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM use_case_versions WHERE use_case_id = ?').bind(id).first();
    await db.batch([
      db.prepare('INSERT INTO use_case_versions (use_case_id, version, snapshot, locked_by) VALUES (?, ?, ?, ?)')
        .bind(id, v.v, JSON.stringify(doc.use_case), who || 'Unknown'),
      db.prepare("UPDATE use_cases SET status = 'locked', updated_at = datetime('now') WHERE id = ?").bind(id),
    ]);
    return v.v;
  }
  await db.prepare("UPDATE use_cases SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
  return null;
}

export async function getChat(db, id) {
  return (await db.prepare('SELECT seq, role, content, author, created_at FROM chat_messages WHERE use_case_id = ? ORDER BY seq').bind(id).all()).results;
}

export async function appendChat(db, id, entries) {
  const last = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM chat_messages WHERE use_case_id = ?').bind(id).first();
  let seq = last.s;
  await db.batch(entries.map((e) => db.prepare('INSERT INTO chat_messages (use_case_id, seq, role, content, author) VALUES (?, ?, ?, ?, ?)')
    .bind(id, ++seq, e.role, e.content, e.author || null)));
}
