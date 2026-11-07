// Global numbers for B-MODE: everything across every island.
import { listAssets } from './brief/assets.js';

export async function globalStats(db) {
  const all = async (sql) => (await db.prepare(sql).all()).results;
  const ucs = await all('SELECT id, title, status FROM use_cases ORDER BY title COLLATE NOCASE');
  const briefs = await all('SELECT id, use_case_id, title, status, doc FROM campaign_briefs');
  const cabins = await all('SELECT cabin, kind, COUNT(*) AS n FROM cabin_items GROUP BY cabin, kind');
  const chat = (await all('SELECT (SELECT COUNT(*) FROM chat_messages WHERE role IN (\'user\',\'assistant\')) + (SELECT COUNT(*) FROM brief_chat WHERE role IN (\'user\',\'assistant\')) AS n'))[0]?.n || 0;
  const stage = { ordered: 0, in_progress: 0, review: 0, approved: 0 };
  const per = Object.fromEntries(ucs.map((u) => [u.id, { id: u.id, title: u.title, status: u.status, briefs: 0, briefs_approved: 0, assets: 0, assets_approved: 0 }]));
  for (const b of briefs) {
    const p = per[b.use_case_id]; if (!p) continue;
    p.briefs++; if (b.status === 'locked') p.briefs_approved++;
    if (b.status !== 'locked') continue;
    for (const a of await listAssets(db, b.id)) { stage[a.stage]++; p.assets++; if (a.stage === 'approved') p.assets_approved++; }
  }
  const cab = { files: 0, links: 0, by: {} };
  for (const r of cabins) { cab[r.kind === 'file' ? 'files' : 'links'] += r.n; cab.by[r.cabin] = (cab.by[r.cabin] || 0) + r.n; }
  return {
    islands: { total: ucs.length, approved: ucs.filter((u) => u.status === 'locked').length, draft: ucs.filter((u) => u.status !== 'locked').length },
    briefs: { total: briefs.length, approved: briefs.filter((b) => b.status === 'locked').length, draft: briefs.filter((b) => b.status !== 'locked').length },
    assets: { total: Object.values(stage).reduce((a, b) => a + b, 0), ...stage },
    cabins: cab, claude_messages: chat, per_island: Object.values(per),
  };
}
