// Cabin files: upload to a stand-in R2, read back for Claude (docx, pptx, text, pdf), delete.
import fs from 'fs';
import assert from 'assert/strict';
import { d1 } from '../../usecase/test/d1-shim.mjs';
import { ensureSchema } from '../../usecase/store.js';
import { addCabinItem, listCabinItems, removeCabinItem, cabinsForPrompt } from '../../cabins.js';
import { uploadCabinFile, fileForClaude, deleteCabinFile, readFileTool } from '../../cabin-files.js';
const db = d1(); await ensureSchema(db);
const store = new Map();
const env = { CABIN_FILES: {
  put: async (k, v) => { store.set(k, new Uint8Array(v)); },
  get: async (k) => store.has(k) ? { arrayBuffer: async () => store.get(k).buffer.slice(0), body: store.get(k) } : null,
  delete: async (k) => { store.delete(k); } } };
const file = (path, name, type) => new File([fs.readFileSync(path)], name, { type });
await assert.rejects(uploadCabinFile({}, db, 'competitors', file('/tmp/bf/fx/test.docx', 'x.docx'), {}, addCabinItem), /not connected/);
const d = await uploadCabinFile(env, db, 'competitors', file('/tmp/bf/fx/test.docx', 'Tosca battlecard.docx'), { note: 'old battlecard', author: 'Steve' }, addCabinItem);
const p = await uploadCabinFile(env, db, 'product', file('/tmp/bf/fx/test.pptx', 'Deck.pptx'), {}, addCabinItem);
const t = await uploadCabinFile(env, db, 'radio', new File(['Buyer: our audits take weeks.'], 'call-notes.txt', { type: 'text/plain' }), {}, addCabinItem);
const pdf = await uploadCabinFile(env, db, 'proof', new File([new Uint8Array([37, 80, 68, 70])], 'case.pdf', { type: 'application/pdf' }), {}, addCabinItem);
let b = await fileForClaude(env, db, d); assert.match(b[0].text, /model-based testing\.\nWe win on governance & speed\./);
b = await fileForClaude(env, db, p); assert.match(b[0].text, /Slide 1 ---\nSlide text 1[\s\S]*Slide 2 ---\nSlide text 2[\s\S]*Slide 3 ---\nSlide text 10/);
b = await fileForClaude(env, db, t); assert.match(b[0].text, /audits take weeks/);
b = await fileForClaude(env, db, pdf); assert.equal(b[1].type, 'document'); assert.equal(b[1].source.media_type, 'application/pdf');
const r = await readFileTool(env, db, { id: 'x', input: { file_id: pdf } }); assert.equal(r.extra.length, 1); assert.match(r.result.content, /attached/);
const items = await listCabinItems(db);
assert.equal(items.find((i) => i.id === d).url, `/leapwork/api/cabins/files/${d}`);
assert.match(cabinsForPrompt(items), new RegExp(`Tosca battlecard.docx \\(uploaded file, file_id ${d}`));
await deleteCabinFile(env, db, d); await removeCabinItem(db, d); assert.equal(store.size, 3);
console.log('cabin file tests ok');
