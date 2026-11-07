// Cabins below deck: what the team keeps for Claude to read when it writes use cases and briefs.
export const CABINS = [
  { id: 'radio', title: 'Radio room', use: 'Customer and prospect call data: pains in the buyer\'s words, objections, competitor mentions. Quotes from calls are internal only unless cleared.' },
  { id: 'brand', title: 'Brand room', use: 'Brand guide, logos, templates, voice and tone.' },
  { id: 'product', title: 'Product library', use: 'Product docs, release notes and feature specs for Flow, Play and Go.' },
  { id: 'proof', title: 'Proof locker', use: 'Customers, quotes, case studies and win wires.' },
  { id: 'partners', title: 'Partner hold', use: 'Partner programs and partner materials.' },
  { id: 'competitors', title: 'Competitor intel', use: 'Competitor pages, their pitches, how we win, battlecards.' },
  { id: 'content', title: 'Content archive', use: 'Existing blogs, decks, enablement materials and past use cases.' },
];
const IDS = new Set(CABINS.map((c) => c.id));

export async function listCabinItems(db) {
  return (await db.prepare('SELECT id, cabin, kind, name, url, note, added_by, created_at FROM cabin_items ORDER BY cabin, created_at DESC, id DESC').all()).results;
}

export async function addCabinItem(db, cabin, { url, name, note, author, kind = 'link' }) {
  if (!IDS.has(cabin)) throw new Error('Unknown cabin');
  url = String(url || '').trim();
  if (!/^https?:\/\/\S+$/.test(url)) throw new Error('Add a full link starting with https://');
  let label = String(name || '').trim();
  if (!label) { try { const u = new URL(url); label = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, ''); } catch { label = url; } }
  const r = await db.prepare('INSERT INTO cabin_items (cabin, kind, name, url, note, added_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(cabin, kind === 'file' ? 'file' : 'link', label.slice(0, 200), url.slice(0, 2000), String(note || '').trim().slice(0, 1000) || null, String(author || '').slice(0, 80) || null).run();
  const rid = r?.meta?.last_row_id ?? r?.lastInsertRowid;
  return rid == null ? null : Number(rid);
}

export async function removeCabinItem(db, id) {
  await db.prepare('DELETE FROM cabin_items WHERE id = ?').bind(Number(id)).run();
}

// The cabins as Claude sees them in a system prompt. `only` limits which cabins are listed.
export function cabinsForPrompt(items, only) {
  const list = CABINS.filter((c) => !only || only.includes(c.id));
  const lines = [];
  for (const c of list) {
    const its = items.filter((i) => i.cabin === c.id);
    if (!its.length) continue;
    lines.push(`- ${c.title} (${c.use})`);
    for (const i of its) lines.push(i.kind === 'file' ? `  - ${i.name} (uploaded file, file_id ${i.id}; read it with read_cabin_file)${i.note ? ` (note: ${i.note})` : ''}`
      : `  - ${i.name}: ${i.url}${i.note ? ` (note: ${i.note})` : ''}`);
  }
  return lines.length ? lines.join('\n') : '(nothing in the cabins yet)';
}
