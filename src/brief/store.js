// Campaign briefs in D1. A brief is one JSON document (see spec.js) tied to an
// approved use case, with its own chat, status and approved versions.
import { loadDoc } from '../usecase/store.js';
import { emptyBrief, pickOptions, applyPatch, progress } from './spec.js';

const parse = (s) => { try { return JSON.parse(s); } catch { return emptyBrief(); } };

export async function listBriefs(db, useCaseId) {
  const rows = (await db.prepare('SELECT id, title, author, status, doc, created_at, updated_at FROM campaign_briefs WHERE use_case_id = ? ORDER BY created_at DESC, id')
    .bind(useCaseId).all()).results;
  return rows.map((r) => {
    const doc = parse(r.doc), p = progress(doc);
    return { id: r.id, title: doc.core.name || r.title, author: r.author, status: r.status, created_at: r.created_at, updated_at: r.updated_at,
      start: doc.core.start || '', done: p.filter((x) => x.done).length, parts: p.length };
  });
}

export async function createBrief(db, useCaseId, author) {
  const uc = await db.prepare('SELECT id, title, status FROM use_cases WHERE id = ?').bind(useCaseId).first();
  if (!uc) throw new Error('Use case not found');
  if (uc.status !== 'locked') throw new Error('Campaign briefs start from an approved use case.');
  const v = await db.prepare('SELECT MAX(version) AS v FROM use_case_versions WHERE use_case_id = ?').bind(useCaseId).first();
  const base = `${uc.id}-brief`; let id = base, n = 1;
  while (await db.prepare('SELECT 1 FROM campaign_briefs WHERE id = ?').bind(id).first()) id = `${base}-${++n}`;
  const doc = emptyBrief();
  await db.prepare('INSERT INTO campaign_briefs (id, use_case_id, use_case_version, title, author, status, doc) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, uc.id, v?.v ?? null, 'New campaign', String(author || 'Unknown').slice(0, 80), 'draft', JSON.stringify(doc)).run();
  return id;
}

// The brief plus everything the form needs from its use case.
export async function loadBrief(db, id) {
  const r = await db.prepare('SELECT * FROM campaign_briefs WHERE id = ?').bind(id).first();
  if (!r) return null;
  const ucDoc = await loadDoc(db, r.use_case_id);
  const doc = parse(r.doc);
  return {
    id: r.id, use_case_id: r.use_case_id, use_case_version: r.use_case_version, title: doc.core.name || r.title,
    author: r.author, status: r.status, created_at: r.created_at, updated_at: r.updated_at,
    doc, progress: progress(doc), use_case: summary(ucDoc), options: pickOptions(ucDoc), _ucDoc: ucDoc,
  };
}

function summary(d) {
  const u = d.use_case, L = d.libraries;
  const name = (t, id) => (L[t] || []).find((x) => x.id === id)?.name || id;
  const prods = [...new Set(u.pain_points.map((p) => p.product_id))];
  return { id: u.id, title: u.title, status: u.status, problem: u.problem, position: u.position,
    products: prods.map((p) => name('products', p)), personas: u.personas.map((p) => name('personas', p.persona_id)),
    industries: u.industries.map((i) => i.label || name('industries', i.industry_id)) };
}

export async function saveBriefDoc(db, id, doc) {
  await db.prepare("UPDATE campaign_briefs SET doc = ?, title = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(doc), doc.core.name || 'New campaign', id).run();
}

// Form edits from the page.
export async function patchBrief(db, id, patch) {
  const b = await loadBrief(db, id);
  if (!b) throw new Error('Not found');
  if (b.status !== 'draft') throw new Error(b.status === 'review' ? 'This brief is pending approval. Request changes to edit it.' : 'This brief is approved. Reopen it for edits to make changes.');
  const changed = applyPatch(b.doc, patch || {}, b.options);
  await saveBriefDoc(db, id, b.doc);
  return { changed, doc: b.doc, progress: progress(b.doc) };
}

export async function setBriefStatus(db, id, status, who) {
  if (!['draft', 'review', 'locked'].includes(status)) throw new Error('Unknown status');
  const cur = await db.prepare('SELECT status, doc FROM campaign_briefs WHERE id = ?').bind(id).first();
  if (!cur) throw new Error('Not found');
  if (status === 'locked') {
    const v = await db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM campaign_brief_versions WHERE brief_id = ?').bind(id).first();
    await db.batch([
      db.prepare('INSERT INTO campaign_brief_versions (brief_id, version, snapshot, locked_by) VALUES (?, ?, ?, ?)').bind(id, v.v, cur.doc, who || 'Unknown'),
      db.prepare("UPDATE campaign_briefs SET status = 'locked', updated_at = datetime('now') WHERE id = ?").bind(id),
    ]);
    await appendBriefChat(db, id, [{ role: 'event', content: `Approved (version ${v.v})`, author: who }]);
    return v.v;
  }
  const event = status === 'review' ? 'Submitted for approval' : cur.status === 'review' ? 'Changes requested; back to draft' : 'Reopened for edits';
  await db.prepare("UPDATE campaign_briefs SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
  await appendBriefChat(db, id, [{ role: 'event', content: event, author: who }]);
  return null;
}

export async function getBriefChat(db, id) {
  return (await db.prepare('SELECT seq, role, content, author, created_at FROM brief_chat WHERE brief_id = ? ORDER BY seq').bind(id).all()).results;
}

export async function appendBriefChat(db, id, entries) {
  const last = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM brief_chat WHERE brief_id = ?').bind(id).first();
  let seq = last.s;
  await db.batch(entries.map((e) => db.prepare('INSERT INTO brief_chat (brief_id, seq, role, content, author) VALUES (?, ?, ?, ?, ?)')
    .bind(id, ++seq, e.role, e.content, e.author || null)));
}
