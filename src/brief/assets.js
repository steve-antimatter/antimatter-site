// Shop assets: one per output ticked in an approved brief, moved along by the team.
// ordered -> in_progress (being made, usually by Antimatter in Claude Design) -> review (link delivered) -> approved
import { loadBrief } from './store.js';
import { OUTPUTS, GROUPS } from './spec.js';
import { resolve } from '../usecase/resolve.js';
import { listCabinItems } from '../cabins.js';
import { linkTitle } from '../link-title.js';

export const STAGES = ['ordered', 'in_progress', 'review', 'approved'];
export const STAGE_STATUS = { ordered: 'Not started', in_progress: 'In progress', review: 'In progress', approved: 'Done' };

function activeOutputs(b) {
  return GROUPS.flatMap((g) => b.doc.groups[g.id] ? g.outputs.filter((o) => b.doc.outputs[o.id]?.on).map((o) => o.id) : []);
}

export async function listAssets(db, briefId) {
  const b = await loadBrief(db, briefId);
  if (!b) throw new Error('Brief not found');
  const rows = (await db.prepare('SELECT * FROM brief_assets WHERE brief_id = ?').bind(briefId).all()).results;
  const ev = (await db.prepare('SELECT output_id, seq, kind, content, author, created_at FROM asset_events WHERE brief_id = ? ORDER BY seq').bind(briefId).all()).results;
  return activeOutputs(b).map((id) => {
    const r = rows.find((x) => x.output_id === id) || { stage: 'ordered' };
    return { output_id: id, stage: r.stage, status: STAGE_STATUS[r.stage], link: r.link || null, link_title: r.link_title || null,
      delivered_by: r.delivered_by || null, delivered_at: r.delivered_at || null, approved_by: r.approved_by || null, approved_at: r.approved_at || null,
      events: ev.filter((e) => e.output_id === id) };
  });
}

async function addEvent(db, briefId, out, kind, content, author) {
  const last = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM asset_events WHERE brief_id = ? AND output_id = ?').bind(briefId, out).first();
  await db.prepare('INSERT INTO asset_events (brief_id, output_id, seq, kind, content, author) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(briefId, out, last.s + 1, kind, content || null, author || null).run();
}

export async function assetAction(db, briefId, out, { action, link, title, note, author }) {
  const b = await loadBrief(db, briefId);
  if (!b) throw new Error('Brief not found');
  if (b.status !== 'locked') throw new Error('Assets are made from an approved brief.');
  if (!activeOutputs(b).includes(out)) throw new Error('That output is not part of this brief.');
  const cur = (await db.prepare('SELECT stage FROM brief_assets WHERE brief_id = ? AND output_id = ?').bind(briefId, out).first())?.stage || 'ordered';
  const who = String(author || '').slice(0, 80);
  const set = async (fields) => {
    const cols = Object.keys(fields);
    await db.prepare(`INSERT INTO brief_assets (brief_id, output_id, ${cols.join(', ')}, updated_at) VALUES (?, ?, ${cols.map(() => '?').join(', ')}, datetime('now'))
      ON CONFLICT(brief_id, output_id) DO UPDATE SET ${cols.map((c) => `${c}=excluded.${c}`).join(', ')}, updated_at=excluded.updated_at`)
      .bind(briefId, out, ...cols.map((c) => fields[c])).run();
  };
  switch (action) {
    case 'start':
      if (cur !== 'ordered') throw new Error('This one is already under way.');
      await set({ stage: 'in_progress' }); await addEvent(db, briefId, out, 'started', null, who); break;
    case 'deliver': {
      if (cur === 'approved') throw new Error('This asset is approved. Reopen it to deliver a new version.');
      const url = String(link || '').trim();
      if (!/^https?:\/\/\S+$/.test(url)) throw new Error('Paste the full link to the finished asset (starting with https://).');
      let name = String(title || '').trim().slice(0, 200) || (await linkTitle(url));
      if (!name) throw new Error("Couldn't read the file's name from Google Drive (it isn't shared publicly). Type the file name.");
      await set({ stage: 'review', link: url.slice(0, 2000), link_title: name, delivered_by: who || null, delivered_at: new Date().toISOString() });
      await addEvent(db, briefId, out, 'delivered', url, who); break;
    }
    case 'approve':
      if (cur !== 'review') throw new Error('Only a delivered asset can be approved.');
      if (!who) throw new Error('Add your name and initials to approve.');
      await set({ stage: 'approved', approved_by: who, approved_at: new Date().toISOString() });
      await addEvent(db, briefId, out, 'approved', null, who); break;
    case 'send_back':
      if (cur !== 'review') throw new Error('Only a delivered asset can be sent back.');
      if (!String(note || '').trim()) throw new Error('Say what needs to change.');
      await set({ stage: 'in_progress' }); await addEvent(db, briefId, out, 'sent_back', String(note).trim().slice(0, 2000), who); break;
    case 'reopen':
      if (cur !== 'approved') throw new Error('Only an approved asset can be reopened.');
      await set({ stage: 'in_progress', approved_by: null, approved_at: null }); await addEvent(db, briefId, out, 'reopened', String(note || '').trim() || null, who); break;
    default: throw new Error('Unknown action');
  }
  return listAssets(db, briefId);
}

// ---------- prompt pack: everything needed to make one asset in Claude Design or a claude.ai chat ----------
const FORMAT = {
  blog: 'A blog post draft (800-1,200 words) as a document, with a title, a short intro, scannable sections and a closing call to action.',
  pr: 'A PR byline pitch: a short pitch email to an editor plus a one-paragraph outline of the byline article.',
  social: 'A set of social posts (LinkedIn first), each with the post text and a one-line image idea.',
  website: 'Web copy for the pages to change, section by section, ready to paste.',
  slides: 'A short sales slide set (PowerPoint export) built on the Leapwork sales deck template from the Sales templates cabin.',
  battlecard: 'A one-page battlecard: their pitch, how we win, landmines to set, objections and responses.',
  twopager: 'A two-page document for the named persona: the problem, how Leapwork fixes it, proof, and a call to action.',
  training: 'A short training deck and talk track for the sales team.',
  partner_enable: 'Partner enablement material: a short deck or document for the partner\'s sellers.',
  partner_box: 'A partner campaign-in-a-box: email copy, social posts, a landing page outline and a one-pager the partner can co-brand.',
  paid: 'Paid media copy: keywords, headlines and ad copy per platform, in a table.',
  landing: 'A landing page: headline, subhead, sections, proof, form and call to action, with a simple wireframe.',
  creative: 'Ad creative in the listed formats and sizes, on brand.',
  marops: 'A campaign set-up sheet: Salesforce campaign names, UTMs, scoring and reporting plan.',
  accounts: 'An account list plan: source, filters, tier and target count, ready to hand to the SDRs.',
  cadence: 'An SDR cadence: each step with day, channel and copy (emails and call opener).',
  nurture: 'A nurture track: each email with subject line, body and timing.',
  followup: 'A lead follow-up playbook: response times, hand-off rules and message templates.',
  newsletter: 'A customer newsletter section: headline, blurb and link.',
  cust_nurture: 'A customer nurture track: each email with subject, body and timing.',
  event: 'Event / webinar plan: title, abstract, agenda, speakers, promotion emails and follow-up.',
  cust_event: 'Customer event / webinar plan: title, abstract, agenda, speakers and invitations.',
  expansion: 'An expansion play: who to target, why now, talk track and email.',
};
const list = (a) => (a && a.length ? a.join('; ') : 'Not set');

export async function promptPack(db, briefId, out, origin = '') {
  const b = await loadBrief(db, briefId);
  if (!b) throw new Error('Brief not found');
  const o = OUTPUTS[out];
  if (!o || !b.doc.outputs[out]?.on) throw new Error('That output is not part of this brief.');
  const st = b.doc.outputs[out], c = b.doc.core, opt = b.options;
  const names = (from, ids) => (ids || []).map((id) => (opt[from] || []).find((x) => x.id === id)?.name || id);
  const fmt = (f, v) => v == null || v === '' || (Array.isArray(v) && !v.length) ? 'Not set'
    : f.type === 'pick' ? names(f.from, v).join(', ') : f.type === 'pairs' ? v.map((r) => `${r.a} (proof: ${r.b || 'not set'})`).join('; ')
    : f.type === 'money' ? `$${Number(v).toLocaleString('en-US')}` : Array.isArray(v) ? v.join('; ') : String(v);
  const v = resolve(b._ucDoc), items = await listCabinItems(db).catch(() => []);
  const cab = (id, title) => { const its = items.filter((i) => i.cabin === id); return its.length ? `${title}:\n${its.map((i) => `- ${i.name}: ${i.kind === 'file' ? origin + i.url : i.url}${i.note ? ` (${i.note})` : ''}`).join('\n')}` : ''; };
  return [
    `Make the "${o.title}" for Leapwork's campaign "${c.name || 'Untitled campaign'}".`,
    `Owner: ${st.owner || 'Not set'}. Due: ${st.due || 'Not set'}.`,
    '',
    'WHAT TO DELIVER',
    FORMAT[out] || o.title,
    '',
    'WHAT THE BRIEF SAYS ABOUT IT',
    ...o.fields.map((f) => `- ${f.label}: ${fmt(f, st.values[f.key])}`),
    '',
    'THE CAMPAIGN',
    `- Theme: ${c.theme || 'Not set'}`,
    `- Who it is for: ${c.audience || 'Not set'}${c.customer_segment ? ` (${c.customer_segment})` : ''}`,
    `- Industries: ${list(names('industries', c.industries))}`,
    `- Personas: ${list(names('personas', c.personas))}`,
    `- Pain points: ${list(names('pain_points', c.pain_points))}`,
    `- Partners: ${list(names('partners', c.partners))}`,
    `- Regions: ${list(c.regions)}`,
    `- Dates: ${c.start || 'Not set'} to ${c.end || 'Not set'}`,
    `- Offer / call to action: ${list(c.offer)}`,
    `- Value statement: ${c.value_statement || 'Not set'}`,
    `- Message pillars: ${(c.pillars || []).length ? c.pillars.map((p) => `${p.a} (proof: ${p.b || 'not set'})`).join('; ') : 'Not set'}`,
    `- Job titles: ${list(c.titles)}`,
    `- Claims guardrails: ${list(c.guardrails)}`,
    '',
    `THE APPROVED USE CASE: ${v.title}`,
    `Problem: ${v.problem}`,
    `Position: ${v.position}`,
    `Personas: ${v.personas.map((p) => `${p.name} (cares about: ${p.cares_about})`).join('; ')}`,
    'Pain points and how we fix them:',
    ...v.pain_groups.flatMap((g) => g.items.map((i) => `- [${g.product.name}] ${i.title} ${i.detail} Fix: ${i.fix}`)),
    'Proof (use only these; quotes are word for word from the linked source):',
    ...v.customers.map((x) => `- ${x.who}${x.line ? `, ${x.line}` : ''}${x.quote ? `: "${x.quote}"` : ''} ${x.what_they_did} (${x.source_url})`),
    'Competitors:',
    ...v.competitors.map((x) => `- ${x.name}: they say ${x.their_pitch} We win: ${x.how_we_win} (${x.url})`),
    'Common objections:',
    ...v.objections.map((x) => `- "${x.objection}" ${x.response}`),
    '',
    'CONTEXT CABINS (open what helps)',
    [cab('brand', 'Brand room'), cab('templates', 'Sales templates'), cab('product', 'Product library'), cab('proof', 'Proof locker'),
      cab('competitors', 'Competitor intel'), cab('partners', 'Partner hold'), cab('radio', 'Radio room (call data; quotes are internal only)'), cab('content', 'Content archive')]
      .filter(Boolean).join('\n') || '(nothing in the cabins yet)',
    '',
    'BRAND AND STYLE',
    '- Leapwork colors: Deep Slate #090F12, Dark Teal #002423, Atlantic #618FA4, Mist #D2E1EA, white. Font: Inter.',
    '- Plain language, short sentences, no hype. Stay inside the claims guardrails. Use only the proof listed above.',
    '',
    'WHEN IT IS DONE',
    'Save it to the campaign\'s folder in Google Drive, then paste the Drive link into the shop in the Mazinator for review.',
  ].join('\n');
}
