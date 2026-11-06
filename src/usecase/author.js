// Authoring chat: Claude interviews the author and edits the use case through tools.
// Each tool replaces one section of the record; the record is validated and saved
// in one transaction at the end of the turn. Library entries (industries, personas,
// customers, quotes, competitors, sources) are matched by name/URL and created when new.
import { loadDoc, saveDoc, slugify, getChat, appendChat } from './store.js';
import { resolve } from './resolve.js';

export const MODEL = 'claude-sonnet-5-5';
const MAX_STEPS = 10;

// ---------- tools ----------

const str = { type: 'string' };
const opt = (o) => ({ ...o }); // readability marker for optional fields
const list = (props, required, maxItems) => ({
  type: 'object',
  properties: { items: { type: 'array', ...(maxItems ? { maxItems } : {}), items: { type: 'object', properties: props, required } } },
  required: ['items'],
});
const source = { type: 'object', properties: { title: str, url: str }, required: ['title', 'url'] };

export const TOOLS = [
  { name: 'set_basics',
    description: 'Set the title, Problem paragraph, Position sentence, or the note under the pain points table. Send only the fields you are changing.',
    input_schema: { type: 'object', properties: { title: str, problem: str, position: str, pain_points_note: str } } },
  { name: 'set_industries',
    description: 'Replace the Industries section: each industry and what drives its need (the rule or pressure). Reuse library names where they fit.',
    input_schema: list({ name: str, drives_need: str }, ['name', 'drives_need']) },
  { name: 'set_personas',
    description: 'Replace the Personas section. descriptor is a short lowercase note under the name (e.g. "head of QA or test automation").',
    input_schema: list({ name: str, descriptor: opt(str), role_in_deal: str, cares_about: str }, ['name', 'role_in_deal', 'cares_about']) },
  { name: 'set_pain_points',
    description: 'Replace the Pain points table. product is flow, play or go. At most three per product. title is a short bold lead-in ending with a period; detail one sentence; fix says how that product solves it.',
    input_schema: list({ product: { type: 'string', enum: ['flow', 'play', 'go'] }, title: str, detail: str, fix: str }, ['product', 'title', 'detail', 'fix'], 9) },
  { name: 'set_customers',
    description: 'Replace the Customers, case studies and quotes section. A quote must be copied exactly from its source page; omit quote when there is none. anonymous=true hides the company name.',
    input_schema: list({
      customer: str, anonymous: { type: 'boolean' }, industry: opt(str), descriptor: opt(str),
      quote: { type: 'object', properties: { text: str, speaker_name: opt(str), speaker_title: opt(str) }, required: ['text'] },
      what_they_did: str, source, source_label: opt(str),
    }, ['customer', 'what_they_did', 'source']) },
  { name: 'set_partners',
    description: 'Replace the Partners and alliances section. Only strategic program partners already in the library (by id) can be used; say why each matters for this use case.',
    input_schema: list({ partner_id: str, why_it_matters: str }, ['partner_id', 'why_it_matters']) },
  { name: 'set_competitors',
    description: 'Replace the Competitors section: two or three competitors focused on this space, each with a link to their relevant page.',
    input_schema: list({ name: str, products: opt(str), url: str, their_pitch: str, how_we_win: str }, ['name', 'url', 'their_pitch', 'how_we_win'], 4) },
  { name: 'set_objections',
    description: 'Replace the Common objections section: what buyers say and a short suggested response.',
    input_schema: list({ objection: str, response: str }, ['objection', 'response'], 8) },
  { name: 'set_sources',
    description: 'Replace the Sources section: groups of links (e.g. Leapwork, Customers, Partners, the regulation, Competitors) for every page a claim came from.',
    input_schema: { type: 'object', properties: { groups: { type: 'array', items: { type: 'object',
      properties: { group: str, links: { type: 'array', items: source } }, required: ['group', 'links'] } } }, required: ['groups'] } },
];

const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 6 };

// ---------- applying tool calls to the document ----------

const norm = (s) => String(s || '').trim().toLowerCase();
function lib(doc, table) { return (doc.libraries[table] ||= []); }
function uniqueId(rows, base) { let id = base, n = 1; while (rows.some((r) => r.id === id)) id = `${base}-${++n}`; return id; }

function ensureSource(doc, s) {
  const rows = lib(doc, 'sources'), url = String(s.url || '').trim();
  if (!/^https?:\/\//.test(url)) throw new Error(`Source needs a full URL: ${s.title || url}`);
  let r = rows.find((x) => x.url === url);
  if (!r) { r = { id: uniqueId(rows, 'src-' + slugify(s.title || url).slice(0, 40)), title: s.title || url, url, publisher: null }; rows.push(r); }
  return r.id;
}
function ensureNamed(doc, table, name, extra = {}) {
  const rows = lib(doc, table);
  let r = rows.find((x) => x.id === name || norm(x.name) === norm(name));
  if (!r) { r = { id: uniqueId(rows, slugify(name)), name, ...extra }; rows.push(r); }
  return r;
}

export function applyTool(doc, name, input) {
  const u = doc.use_case, items = input.items || [];
  switch (name) {
    case 'set_basics':
      for (const k of ['title', 'problem', 'position', 'pain_points_note']) if (typeof input[k] === 'string') u[k] = input[k].trim();
      return 'basics';
    case 'set_industries':
      u.industries = items.map((i) => ({ industry_id: ensureNamed(doc, 'industries', i.name).id, drives_need: i.drives_need }));
      return 'industries';
    case 'set_personas':
      u.personas = items.map((p) => {
        const r = ensureNamed(doc, 'personas', p.name, { descriptor: p.descriptor || null });
        return { persona_id: r.id, descriptor: p.descriptor ?? null, role_in_deal: p.role_in_deal, cares_about: p.cares_about };
      });
      return 'personas';
    case 'set_pain_points': {
      const products = new Set(lib(doc, 'products').map((p) => p.id)), count = {};
      for (const p of items) {
        if (!products.has(p.product)) throw new Error(`Unknown product: ${p.product}`);
        if ((count[p.product] = (count[p.product] || 0) + 1) > 3) throw new Error(`At most three pain points per product (${p.product}).`);
      }
      const order = ['flow', 'play', 'go'];
      const sorted = [...items].sort((a, b) => order.indexOf(a.product) - order.indexOf(b.product));
      u.pain_points = sorted.map((p, i) => ({ id: `${u.id}-pp-${i + 1}`, product_id: p.product, title: p.title, detail: p.detail, fix: p.fix }));
      return 'pain points';
    }
    case 'set_customers':
      u.customers = items.map((c) => {
        const ind = c.industry ? ensureNamed(doc, 'industries', c.industry).id : null;
        const rows = lib(doc, 'customers');
        let cust = rows.find((x) => norm(x.name) === norm(c.customer));
        if (!cust) { cust = { id: uniqueId(rows, slugify(c.customer)), name: c.customer, display_name: c.customer, anonymous: !!c.anonymous, industry_id: ind, descriptor: c.descriptor || null }; rows.push(cust); }
        else Object.assign(cust, { anonymous: !!c.anonymous, ...(ind ? { industry_id: ind } : {}), ...(c.descriptor !== undefined ? { descriptor: c.descriptor || null } : {}) });
        const source_id = ensureSource(doc, c.source);
        let quote_id = null;
        if (c.quote && c.quote.text) {
          const qs = lib(doc, 'quotes');
          let q = qs.find((x) => x.customer_id === cust.id && norm(x.text) === norm(c.quote.text));
          if (!q) { q = { id: uniqueId(qs, `q-${cust.id}`), customer_id: cust.id, text: c.quote.text, speaker_name: c.quote.speaker_name || null, speaker_title: c.quote.speaker_title || null, source_id }; qs.push(q); }
          quote_id = q.id;
        }
        return { customer_id: cust.id, quote_id, what_they_did: c.what_they_did, source_id, source_label: c.source_label || 'Case study' };
      });
      return 'customers';
    case 'set_partners': {
      const known = lib(doc, 'partners');
      u.partners = items.map((p) => {
        if (!known.some((k) => k.id === p.partner_id)) throw new Error(`Not a strategic partner in the library: ${p.partner_id}. Use one of: ${known.map((k) => k.id).join(', ')}.`);
        return { partner_id: p.partner_id, why_it_matters: p.why_it_matters };
      });
      return 'partners';
    }
    case 'set_competitors':
      u.competitors = items.map((c) => {
        const r = ensureNamed(doc, 'competitors', c.name, { products: c.products || null, url: c.url });
        if (c.products !== undefined) r.products = c.products || null;
        return { competitor_id: r.id, url: c.url, their_pitch: c.their_pitch, how_we_win: c.how_we_win };
      });
      return 'competitors';
    case 'set_objections':
      u.objections = items.map((o) => ({ objection: o.objection.replace(/^[“"]|[”"]$/g, ''), response: o.response }));
      return 'objections';
    case 'set_sources':
      u.sources = (input.groups || []).map((g) => ({ grp: g.group, ids: g.links.map((l) => ensureSource(doc, l)) }));
      return 'sources';
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// ---------- prompt ----------

function systemPrompt(doc) {
  const L = doc.libraries;
  const names = (t, f = (r) => r.name) => (L[t] || []).map(f).join('; ');
  const v = resolve(doc);
  return `You are the Mazinator's use case author for Leapwork, working with a member of Leapwork's marketing team (or Antimatter Consulting, who runs the Mazinator).
You and the author build one use case together. The finished use case drives campaign briefs, ads, landing pages, emails and sales material, so it has to be accurate and specific.

TEMPLATE (fixed order; every section required unless noted):
1. Problem: one paragraph, the business problem in the buyer's terms.
2. Position: one sentence, how Leapwork solves it.
3. Industries: each industry and the rule or pressure that drives the need.
4. Personas: name, short lowercase descriptor, role in the deal, what they care about.
5. Pain points and how we fix them: grouped by product (flow, play, go), at most three per product; a bold lead-in, one sentence of detail, and how that product fixes it. Optional one-line note under the table (e.g. edition limits).
6. Customers, case studies and quotes: real customers only. Quotes must be copied word for word from a published page you have opened, with that page as the source. Anonymous customers are shown as e.g. "Major US healthcare provider". Never invent or paraphrase a quote.
7. Partners and alliances: only the strategic program partners in the library, with why each matters here.
8. Competitors: two or three competitors focused on this space, with links.
9. Common objections: what buyers say, and a short suggested response.
10. Sources: grouped links to every page a claim came from.

HOW TO WORK:
- Interview the author one section at a time, in template order, starting with the first section that is empty. Ask one or two focused questions, propose a draft, and write it with the tool once the author agrees or asks you to go ahead. The author can jump to any section.
- Use web search to find and check facts: regulations, customer stories, partner programs, competitor positioning. Prefer leapwork.com and primary sources. Every factual claim you add must be backed by a page in Sources. If you cannot verify something, say so and ask rather than guess.
- Plain language. Short sentences. No jargon the buyer would not use, no hype, no internal notes (nothing like "to confirm" or "TBD" in the use case itself). Avoid repeating the same point across sections.
- Keep chat replies short: what you changed (one line) and the next question. Do not paste whole sections back into the chat; the author sees the page update beside the chat.
- Tools replace a whole section, so always send the complete list for that section, including items you are keeping.
- When every section is filled in, stop asking questions. Tell the author the use case is complete, offer one or two specific improvements if you see any, and explain the next step: read the page on the right from top to bottom, then click "Submit for approval" at the bottom of the page. While it is pending approval it cannot be edited; the approver either approves it (it becomes the version campaign briefs are built from) or requests changes.

LEAPWORK PRODUCTS: ${names('products', (p) => `${p.id} = ${p.name}: ${p.summary || ''}`)}
STRATEGIC PARTNERS (ids you may use): ${names('partners', (p) => `${p.id} (${p.name}: ${p.program})`)}
LIBRARY (reuse these names where they fit; new ones are created automatically):
- Industries: ${names('industries')}
- Personas: ${names('personas')}
- Customers: ${names('customers', (c) => c.name)}
- Competitors: ${names('competitors')}

CURRENT USE CASE (status: ${doc.use_case.status}):
${JSON.stringify({
    title: v.title, problem: v.problem, position: v.position, industries: v.industries, personas: v.personas,
    pain_points: v.pain_groups.map((g) => ({ product: g.product.id, items: g.items })), pain_points_note: v.pain_points_note,
    customers: v.customers, partners: v.partners.map((p) => ({ name: p.name, why_it_matters: p.why_it_matters })),
    competitors: v.competitors, objections: v.objections, sources: v.sources,
  })}`;
}

// ---------- one chat turn ----------

async function callClaude(env, body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${data?.error?.message || 'request failed'}`);
  return data;
}

export async function chatTurn(env, db, id, text, author, { fetchClaude } = {}) {
  if (!env.ANTHROPIC_API_KEY && !fetchClaude) throw new Error('ANTHROPIC_API_KEY is not set on the Worker.');
  const call = fetchClaude || ((body) => callClaude(env, body));
  const doc = await loadDoc(db, id);
  if (!doc) throw new Error('Use case not found');
  if (doc.use_case.status === 'locked') throw new Error('This use case is approved. Reopen it for edits to make changes.');
  if (doc.use_case.status === 'review') throw new Error('This use case is pending approval. Request changes to edit it.');

  const history = (await getChat(db, id)).filter((m) => m.role === 'user' || m.role === 'assistant').slice(-30);
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: text });

  const changed = new Set();
  let reply = '';
  // The system prompt (which carries the use case as it stood at the start of the turn) must stay
  // identical for the whole turn: Claude's thinking blocks are signed against it and are sent back
  // with every tool result. Edits made during the turn are reported in the tool results instead.
  const system = systemPrompt(doc);
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await call({ model: MODEL, max_tokens: 8000, system, tools: [...TOOLS, WEB_SEARCH], messages });
    messages.push({ role: 'assistant', content: res.content });
    reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || reply;
    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use') break;
    const results = [];
    for (const b of res.content.filter((x) => x.type === 'tool_use')) {
      try { const what = applyTool(doc, b.name, b.input || {}); changed.add(what); results.push({ type: 'tool_result', tool_use_id: b.id, content: `Saved ${what}. The page now shows it.` }); }
      catch (e) { results.push({ type: 'tool_result', tool_use_id: b.id, content: String(e.message || e), is_error: true }); }
    }
    messages.push({ role: 'user', content: results });
  }

  if (changed.size) await saveDoc(db, doc);
  if (!reply) reply = changed.size ? `Updated: ${[...changed].join(', ')}.` : 'Done.';
  await appendChat(db, id, [{ role: 'user', content: text, author }, { role: 'assistant', content: reply }]);
  return { reply, changed: [...changed] };
}
