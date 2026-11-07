// Files in the cabins: stored in R2 (binding CABIN_FILES), listed in cabin_items, readable by Claude.
const MAX = 25 * 1024 * 1024; // Claude reads PDFs up to 32 MB; keep uploads comfortably under
const TEXTY = /^(text\/|application\/(json|xml|csv))/;
const EXT_MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', json: 'application/json', html: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
export const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
export const mimeOf = (name, given) => EXT_MIME[extOf(name)] || given || 'application/octet-stream';

export async function uploadCabinFile(env, db, cabin, file, { note, author }, addRow) {
  if (!env.CABIN_FILES) { const e = new Error('File storage is not connected yet.'); e.status = 503; throw e; }
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose a file to upload.');
  if (file.size > MAX) throw new Error('Files can be up to 25 MB.');
  const name = String(file.name || 'file').slice(0, 200), mime = mimeOf(name, file.type);
  const key = `cabins/${cabin}/${Date.now()}-${name.replace(/[^\w.\- ]+/g, '_')}`;
  await env.CABIN_FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  const id = await addRow(db, cabin, { url: 'https://file.local/' + encodeURIComponent(key), name, note, author, kind: 'file' });
  await db.prepare('UPDATE cabin_items SET url = ? WHERE id = ?').bind(`/leapwork/api/cabins/files/${id}`, id).run();
  await db.prepare('INSERT INTO cabin_files (item_id, r2_key, mime, size) VALUES (?, ?, ?, ?)').bind(id, key, mime, file.size).run();
  return id;
}

export async function getCabinFile(env, db, id) {
  const f = await db.prepare('SELECT f.r2_key, f.mime, f.size, i.name FROM cabin_files f JOIN cabin_items i ON i.id = f.item_id WHERE f.item_id = ?').bind(Number(id)).first();
  if (!f || !env.CABIN_FILES) return null;
  const obj = await env.CABIN_FILES.get(f.r2_key);
  return obj ? { ...f, obj } : null;
}

export async function deleteCabinFile(env, db, id) {
  const f = await db.prepare('SELECT r2_key FROM cabin_files WHERE item_id = ?').bind(Number(id)).first();
  if (f && env.CABIN_FILES) await env.CABIN_FILES.delete(f.r2_key);
  await db.prepare('DELETE FROM cabin_files WHERE item_id = ?').bind(Number(id)).run();
}

// ---------- reading a file for Claude ----------
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const xmlText = (xml) => xml.replace(/<\/(w:p|a:p|si|row)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

// Minimal zip reader (Office files are zips of XML).
async function unzip(buf, want) {
  const u = new Uint8Array(buf), dv = new DataView(buf); let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true), out = {};
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (!want(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u.subarray(start, start + csize);
    out[name] = method === 0 ? new TextDecoder().decode(data)
      : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}

// Returns content blocks to put in front of Claude, or throws with a plain reason.
export async function fileForClaude(env, db, id) {
  const f = await getCabinFile(env, db, id);
  if (!f) throw new Error(`File ${id} is not available.`);
  const buf = await f.obj.arrayBuffer(), ext = extOf(f.name), head = `File: ${f.name}`;
  if (f.mime === 'application/pdf') return [{ type: 'text', text: head }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(buf) }, title: f.name }];
  if (/^image\/(png|jpeg|gif|webp)$/.test(f.mime)) { if (buf.byteLength > 5e6) throw new Error('Images over 5 MB cannot be read.'); return [{ type: 'text', text: head }, { type: 'image', source: { type: 'base64', media_type: f.mime, data: b64(buf) } }]; }
  if (TEXTY.test(f.mime) || ['md', 'txt', 'csv'].includes(ext)) return [{ type: 'text', text: `${head}\n\n${new TextDecoder().decode(buf).slice(0, 400000)}` }];
  if (['docx', 'pptx', 'xlsx'].includes(ext)) {
    const parts = await unzip(buf, (n) => ext === 'docx' ? n === 'word/document.xml' : ext === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/.test(n) : n === 'xl/sharedStrings.xml');
    const names = Object.keys(parts).sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0));
    const text = names.map((n, i) => (ext === 'pptx' ? `--- Slide ${i + 1} ---\n` : '') + xmlText(parts[n])).join('\n\n');
    return [{ type: 'text', text: `${head} (text only; layout and images are not included)\n\n${text.slice(0, 400000)}` }];
  }
  throw new Error(`Claude can't read .${ext || 'this kind of'} files yet. Upload a PDF instead.`);
}

export const READ_FILE_TOOL = {
  name: 'read_cabin_file',
  description: 'Read a file the team uploaded to the cabins (listed in the system prompt with its file id). PDFs, Word, PowerPoint, Excel (text), text, CSV and images.',
  input_schema: { type: 'object', properties: { file_id: { type: 'integer' } }, required: ['file_id'] },
};

// Runs read_cabin_file for a tool call: the tool_result, plus blocks (PDF, image) that go right after it.
export async function readFileTool(env, db, call) {
  try {
    const blocks = await fileForClaude(env, db, call.input?.file_id);
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const extra = blocks.filter((b) => b.type !== 'text');
    return { result: { type: 'tool_result', tool_use_id: call.id, content: extra.length ? `${text}\n(The file is attached right after this result.)` : text }, extra };
  } catch (e) {
    return { result: { type: 'tool_result', tool_use_id: call.id, content: String(e.message || e), is_error: true }, extra: [] };
  }
}
