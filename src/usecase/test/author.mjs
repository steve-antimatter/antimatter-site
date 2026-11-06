// Authoring chat with a scripted stand-in for Claude: drafts, tool edits, rules, locking.
import fs from 'fs';
import assert from 'assert/strict';
import { d1 } from './d1-shim.mjs';
import { ensureSchema, saveDoc, loadDoc, createDraft, setStatus, getChat } from '../store.js';
import { chatTurn } from '../author.js';
import { renderHtml } from '../render-html.js';
const seed = JSON.parse(fs.readFileSync(new URL('../../../db/seed/governance-in-testing.json', import.meta.url), 'utf8'));
const db = d1(); await ensureSchema(db); await saveDoc(db, seed);

const id = await createDraft(db, { title: 'AI Testing for Playwright Teams', author: 'Steve Zeller' });
assert.equal(id, 'ai-testing-for-playwright-teams');
const draftHtml = renderHtml(await loadDoc(db, id), { draft: true });
assert.ok(draftHtml.includes('Not written yet.'));

let calls = 0;
const script = (steps) => async (body) => {
  assert.ok(body.system.includes('TEMPLATE'));
  const s = steps[calls++]; return s(body);
};
const toolUse = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'text', text: '' }, { type: 'tool_use', id: 't' + calls, name, input }] });
const done = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

// Turn 1: problem + position + pain points (one too many for play -> error, then fixed)
calls = 0;
let r = await chatTurn({}, db, id, 'Start with the problem.', 'Steve', { fetchClaude: script([
  () => toolUse('set_basics', { problem: 'Teams adopting AI-written Playwright tests cannot trust or govern them.', position: 'Leapwork Play turns AI-written tests into governed, repeatable Playwright.' }),
  () => toolUse('set_pain_points', { items: [1, 2, 3, 4].map((n) => ({ product: 'play', title: `P${n}.`, detail: 'd', fix: 'f' })) }),
  (body) => { const last = body.messages.at(-1).content[0]; assert.equal(last.is_error, true); assert.match(last.content, /three/); return toolUse('set_pain_points', { items: [{ product: 'play', title: 'Flaky AI tests.', detail: 'd', fix: 'f' }, { product: 'flow', title: 'No approvals.', detail: 'd', fix: 'f' }] }); },
  () => done('Wrote Problem, Position and two pain points. Which industries first?'),
]) });
assert.deepEqual(r.changed.sort(), ['basics', 'pain points']);
let doc = await loadDoc(db, id);
assert.equal(doc.use_case.pain_points[0].product_id, 'flow'); // grouped in product order
assert.match(doc.use_case.problem, /govern/);

// Turn 2: customers with a new customer, quote and source; partner validation
calls = 0;
r = await chatTurn({}, db, id, 'Add Investec and a partner.', 'Steve', { fetchClaude: script([
  () => ({ stop_reason: 'tool_use', content: [
    { type: 'tool_use', id: 'a', name: 'set_customers', input: { items: [{ customer: 'Acme Bank', industry: 'Banking', quote: { text: 'It just works.', speaker_name: 'Jo', speaker_title: 'CIO' }, what_they_did: 'x', source: { title: 'Acme story', url: 'https://example.com/acme' } }] } },
    { type: 'tool_use', id: 'b', name: 'set_partners', input: { items: [{ partner_id: 'aws', why_it_matters: 'x' }] } }] }),
  (body) => { const res = body.messages.at(-1).content; assert.equal(res[0].is_error, undefined); assert.equal(res[1].is_error, true); return toolUse('set_partners', { items: [{ partner_id: 'microsoft', why_it_matters: 'Microsoft builds Playwright.' }] }); },
  () => done('Added Acme Bank and Microsoft.'),
]) });
doc = await loadDoc(db, id);
assert.equal(doc.use_case.customers[0].quote_id.startsWith('q-acme-bank'), true);
assert.ok(doc.libraries.industries.some((i) => i.name === 'Banking'));
const html = renderHtml(doc, { draft: true });
assert.ok(html.includes('It just works.') && html.includes('Not written yet.'));

// History, locking, locked refusal; Governance untouched
assert.equal((await getChat(db, id)).length, 4);
assert.equal(await setStatus(db, id, 'locked', 'Steve'), 1);
await assert.rejects(chatTurn({}, db, id, 'change it', 'Steve', { fetchClaude: async () => done('x') }), /locked/);
await setStatus(db, id, 'draft');
assert.equal(renderHtml(await loadDoc(db, 'governance-in-testing')), renderHtml(seed));
console.log('authoring tests ok');
