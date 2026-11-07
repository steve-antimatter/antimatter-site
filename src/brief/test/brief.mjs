// Campaign briefs: create from an approved use case, form patches, Claude first pass, approval.
import fs from 'fs';
import assert from 'assert/strict';
import { d1 } from '../../usecase/test/d1-shim.mjs';
import { ensureSchema, saveDoc, createDraft, setStatus } from '../../usecase/store.js';
import { createBrief, loadBrief, patchBrief, listBriefs, setBriefStatus, getBriefChat } from '../store.js';
import { briefChatTurn, briefSystemPrompt } from '../author.js';
import { progress } from '../spec.js';
const seed = JSON.parse(fs.readFileSync(new URL('../../../db/seed/governance-in-testing.json', import.meta.url), 'utf8'));
const db = d1(); await ensureSchema(db); await saveDoc(db, seed);
const uc = 'governance-in-testing';

// Only approved use cases get briefs.
const draftUc = await createDraft(db, { title: 'Draft thing', author: 'Steve' });
await assert.rejects(createBrief(db, draftUc, 'Steve'), /approved use case/);
if (seed.use_case.status !== 'locked') await setStatus(db, uc, 'locked', 'Maz');
const id = await createBrief(db, uc, 'Steve');
assert.equal(id, 'governance-in-testing-brief');
assert.equal(await createBrief(db, uc, 'Steve'), 'governance-in-testing-brief-2');

let b = await loadBrief(db, id);
assert.ok(b.options.personas.length && b.options.pain_points.length && b.options.partners.length);
assert.equal(b.use_case.title, seed.use_case.title);

// Form patches: checked, all-or-nothing.
const persona = b.options.personas[0].id, partner = b.options.partners[0].id;
let r = await patchBrief(db, id, { core: { name: 'DORA push', budget: '$40,000', personas: [persona], audience: 'New logos' } });
assert.deepEqual(r.changed.sort(), ['Focus (from the use case)', 'Goals, dates and budget', 'The campaign']);
assert.equal(r.doc.core.budget, 40000);
await assert.rejects(patchBrief(db, id, { core: { name: 'Changed', personas: ['nobody'] } }), /not in the use case/);
b = await loadBrief(db, id);
assert.equal(b.doc.core.name, 'DORA push'); // the failed patch saved nothing
await assert.rejects(patchBrief(db, id, { core: { audience: 'Everyone' } }), /must be one of/);
await assert.rejects(patchBrief(db, id, { outputs: { nope: { on: true } } }), /Unknown output/);
r = await patchBrief(db, id, { outputs: { paid: { values: { keywords: 'test governance\naudit trail testing', platforms: ['LinkedIn'] } } } });
assert.equal(r.doc.groups.inbound, true); // values turn the output and group on
assert.deepEqual(r.doc.outputs.paid.values.keywords, ['test governance', 'audit trail testing']);
assert.equal(r.doc.outputs.paid.owner, 'Agency');
assert.ok(progress(r.doc).some((x) => x.name === 'Keywords, ad copy and channel distribution' && x.done));

// Claude's first pass, with one bad call it has to fix.
let calls = 0;
const res = await briefChatTurn({}, db, id, 'Q1 DORA push to EU banks. Webinar with Microsoft, LinkedIn ads.', 'Steve', { today: '2026-11-06', fetchClaude: async (body) => {
  assert.ok(body.system.includes('update_brief') || body.tools[0].name === 'update_brief');
  assert.ok(body.system.includes('Today is 2026-11-06'));
  calls++;
  if (calls === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'update_brief', input: { core: { regions: ['Mars'] } } }] };
  if (calls === 2) { assert.equal(body.messages.at(-1).content[0].is_error, true);
    return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'b', name: 'update_brief', input: {
      core: { regions: ['EMEA'], start: '2027-01-05', partners: [partner], pillars: [{ a: 'Prove every release', b: 'Quote from the use case' }] },
      outputs: { event: { on: true, values: { format: 'Webinar', cohost: [partner] } } }, comms: { cadence: 'Weekly' } } }] }; }
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Filled in the core and a Microsoft webinar. Not set: budget, targets. What budget?' }] };
} });
assert.equal(calls, 3);
assert.ok(res.changed.includes('Webinar / event'));
b = await loadBrief(db, id);
assert.deepEqual(b.doc.core.regions, ['EMEA']);
assert.equal(b.doc.groups.outbound, true);
assert.equal((await getBriefChat(db, id)).length, 2);
// system prompt carries the use case and the brief, and stays fixed within a turn
const sp = briefSystemPrompt(b, '2026-11-06');
assert.ok(sp.includes(seed.use_case.title) && sp.includes('DORA push'));

// Approval flow
await setBriefStatus(db, id, 'review', 'Steve');
await assert.rejects(patchBrief(db, id, { core: { name: 'x' } }), /pending approval/);
await assert.rejects(briefChatTurn({}, db, id, 'x', 'Steve', { fetchClaude: async () => ({}) }), /pending approval/);
assert.equal(await setBriefStatus(db, id, 'locked', 'Maz'), 1);
await assert.rejects(patchBrief(db, id, { core: { name: 'x' } }), /approved/);
const list = await listBriefs(db, uc);
assert.equal(list.length, 2);
assert.equal(list.find((x) => x.id === id).title, 'DORA push');
assert.deepEqual((await getBriefChat(db, id)).filter((m) => m.role === 'event').map((m) => m.content), ['Submitted for approval', 'Approved (version 1)']);
console.log('brief tests ok');

// Cabins: links are stored, checked, and reach Claude's prompts.
{
  const { addCabinItem, listCabinItems, removeCabinItem } = await import('../../cabins.js');
  await assert.rejects(addCabinItem(db, 'attic', { url: 'https://x.com' }), /Unknown cabin/);
  await assert.rejects(addCabinItem(db, 'competitors', { url: 'tricentis.com' }), /https/);
  const cid = await addCabinItem(db, 'competitors', { url: 'https://www.tricentis.com/products/automate-continuous-testing-tosca', name: 'tricentis.com/products/automate-continuous-testing-tosca', author: 'Steve' });
  await assert.rejects(addCabinItem(db, 'brand', { url: 'https://docs.google.com/document/d/private' }), /Add a name/);
  const items = await listCabinItems(db);
  assert.equal(items[0].name, 'tricentis.com/products/automate-continuous-testing-tosca');
  let seen = '';
  await setBriefStatus(db, id, 'draft', 'Steve');
  await briefChatTurn({}, db, id, 'battlecard?', 'Steve', { fetchClaude: async (body) => { seen = body.system; assert.ok(body.tools.some((t) => t.name === 'web_fetch')); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }; } });
  assert.ok(seen.includes('Competitor intel') && seen.includes('tricentis.com/products'));
  await removeCabinItem(db, cid);
  assert.equal((await listCabinItems(db)).length, 0);
  console.log('cabin tests ok');
}
