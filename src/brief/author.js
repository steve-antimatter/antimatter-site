// Brief authoring chat. The author describes the campaign in plain words; Claude
// fills in the brief through one tool (update_brief) that takes the same patch
// the form sends, so every edit goes through the same checks.
import { loadBrief, saveBriefDoc, getBriefChat, appendBriefChat } from './store.js';
import { CORE, GROUPS, COMMS, applyPatch } from './spec.js';
import { resolve } from '../usecase/resolve.js';
import { MODEL } from '../usecase/author.js';

const MAX_STEPS = 8;

export const BRIEF_TOOL = {
  name: 'update_brief',
  description: 'Change the campaign brief. Send only what you are changing. Shape: { core: {field: value}, groups: {group_id: true|false}, outputs: {output_id: {on, owner, due, status, values: {field: value}}}, comms: {field: value} }. Field keys, types and options are listed in the system prompt. Setting values on an output turns it (and its group) on.',
  input_schema: {
    type: 'object',
    properties: {
      core: { type: 'object' },
      groups: { type: 'object' },
      outputs: { type: 'object' },
      comms: { type: 'object' },
    },
  },
};

function fieldLine(x, opts) {
  let t = `${x.key} (${x.type}`;
  if (x.options) t += `: ${x.options.join(' | ')}`;
  if (x.from) t += ` from use case: ${(opts[x.from] || []).map((o) => `${o.id}=${o.name}`).join('; ') || 'none'}`;
  if (x.labels) t += `; rows of {a: ${x.labels[0]}, b: ${x.labels[1]}}, max ${x.max}`;
  if (x.when) t += `; only when ${Object.entries(x.when).map(([k, v]) => `${k} is ${v.join(' or ')}`).join(', ')}`;
  t += ')';
  return `    - ${t} "${x.label}"${x.ai ? ' [draft this from the use case]' : ''}${x.hint ? ` — ${x.hint}` : ''}`;
}

export function briefSystemPrompt(b, today) {
  const opts = b.options;
  const spec = [
    'CORE (always on):',
    ...CORE.map((s) => `  ${s.title}:\n${s.fields.map((x) => fieldLine(x, opts)).join('\n')}`),
    'ACTIVITY GROUPS (group_id: title) and their outputs (output_id: title, default owner):',
    ...GROUPS.map((g) => `  ${g.id}: ${g.title}\n${g.outputs.map((o) => `    ${o.id}: ${o.title} (owner: ${o.owner})\n${o.fields.map((x) => '  ' + fieldLine(x, opts)).join('\n')}`).join('\n')}`),
    `COMMS (always on):\n${COMMS.fields.map((x) => fieldLine(x, opts)).join('\n')}`,
    'Every output also has: on (boolean), owner (text), due (YYYY-MM-DD), status (Not started | In progress | Done).',
  ].join('\n');
  const v = resolve(b._ucDoc);
  const uc = { title: v.title, problem: v.problem, position: v.position, industries: v.industries, personas: v.personas,
    pain_points: v.pain_groups.map((g) => ({ product: g.product.name, items: g.items })), customers: v.customers,
    partners: v.partners.map((p) => ({ name: p.name, program: p.program, why_it_matters: p.why_it_matters })),
    competitors: v.competitors, objections: v.objections };
  return `You are the Mazinator's campaign brief author for Leapwork, working with a member of Leapwork's marketing team.
A campaign brief turns one approved use case into a campaign: who it targets, what it says, which activities run, who owns them and when. Today is ${today}.

The brief follows Leapwork's campaign structure: the use case feeds five groups of work, run in this order: thought leadership + content, then enablement (sales and partners are ready before demand goes live), then digital inbound, outbound and customer campaigns. Comms and reporting keep the company in sync.

THE TEMPLATE:
${spec}

HOW TO WORK:
- The first message is usually a plain description of the campaign. Take a full first pass in one go: fill in the core, turn on the groups and outputs the description calls for (and only those, plus enablement and content when a campaign obviously needs them), keep the default owners, and draft every field marked [draft this from the use case]. Use update_brief once or a few times; send complete lists for list fields.
- Build everything from the approved use case below: its personas, pain points, proof and objections. Message pillars must use proof that is in the use case (a customer, a quote, a fact). Do not invent customers, numbers, quotes, partners or results.
- Never guess dates, budgets or targets. Fill them only when the author gives them (you may convert "Q1" or "$40K" into dates and numbers). When a start date is known, you may set output due dates that follow the group order above.
- Leave anything you cannot work out empty. The page shows empty fields as "Not set".
- For pick fields use the ids listed. Turning on customer outputs only makes sense when the audience includes existing customers.
- Plain language, short sentences, no hype, no internal notes.
- Keep chat replies short: one line on what you filled in, then list what is still not set that matters most (dates, budget, targets, owners), then one question. Do not paste the brief back into the chat; the author sees it beside the chat.
- When the author asks for a change, make it with update_brief and confirm in one line.
- When the brief looks complete, say so and explain the next step: read the brief on the right, then click "Submit for approval" at the bottom.

APPROVED USE CASE: ${b.use_case.title}
${JSON.stringify(uc)}

CURRENT BRIEF (status: ${b.status}):
${JSON.stringify(b.doc)}`;
}

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

export async function briefChatTurn(env, db, id, text, author, { fetchClaude, today } = {}) {
  if (!env.ANTHROPIC_API_KEY && !fetchClaude) throw new Error('ANTHROPIC_API_KEY is not set on the Worker.');
  const call = fetchClaude || ((body) => callClaude(env, body));
  const b = await loadBrief(db, id);
  if (!b) throw new Error('Brief not found');
  if (b.status === 'locked') throw new Error('This brief is approved. Reopen it for edits to make changes.');
  if (b.status === 'review') throw new Error('This brief is pending approval. Request changes to edit it.');

  const history = (await getBriefChat(db, id)).filter((m) => m.role === 'user' || m.role === 'assistant').slice(-30);
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: text });

  // Fixed for the whole turn (signed thinking blocks depend on it); edits are reported in tool results.
  const system = briefSystemPrompt(b, today || new Date().toISOString().slice(0, 10));
  const changed = new Set();
  let reply = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await call({ model: MODEL, max_tokens: 16000, system, tools: [BRIEF_TOOL], messages });
    messages.push({ role: 'assistant', content: res.content });
    reply = res.content.filter((x) => x.type === 'text').map((x) => x.text).join('').trim() || reply;
    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use') break;
    const results = [];
    for (const t of res.content.filter((x) => x.type === 'tool_use')) {
      try {
        if (t.name !== 'update_brief') throw new Error(`Unknown tool ${t.name}`);
        const what = applyPatch(b.doc, t.input || {}, b.options);
        what.forEach((w) => changed.add(w));
        results.push({ type: 'tool_result', tool_use_id: t.id, content: `Saved: ${what.join(', ') || 'nothing changed'}. The page now shows it.` });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: t.id, content: String(e.message || e) + ' Nothing from this call was saved; fix it and send the call again.', is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  if (changed.size) await saveBriefDoc(db, id, b.doc);
  if (!reply) reply = changed.size ? `Updated: ${[...changed].join(', ')}.` : 'Done.';
  await appendBriefChat(db, id, [{ role: 'user', content: text, author }, { role: 'assistant', content: reply }]);
  return { reply, changed: [...changed] };
}
