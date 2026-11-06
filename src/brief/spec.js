// Campaign brief template. One definition drives the form in the Mazinator,
// the checks on every edit, and the tool Claude uses to fill the brief in.
//
// Built from Leapwork's Lead Flow deck: slide 6 (output groups and owners),
// slide 7 (campaign motions; comms and reporting), slides 2–3 (customer marketing),
// slides 11, 26 and 36 (channels, scoring, Salesforce campaign structure).
//
// Field types:
//   text, textarea      free text
//   list                one item per line (stored as an array of strings)
//   pairs               rows of two values (stored as [{a, b}]); `labels` names them
//   choice              one of `options`
//   multi               any of `options`
//   pick                any of the approved use case's items (`from`: industries,
//                       personas, pain_points, partners, competitors, products)
//   number, money       numbers (money is USD)
//   date                YYYY-MM-DD
// `ai: true` marks fields Claude drafts from the use case (headlines, keywords, copy).

const f = (key, type, label, extra = {}) => ({ key, type, label, ...extra });

export const CORE = [
  { id: 'basics', title: 'The campaign', fields: [
    f('name', 'text', 'Campaign name'),
    f('theme', 'textarea', 'Theme', { hint: 'One sentence: the story we want the market to hear.', ai: true }),
    f('audience', 'choice', 'Who it is for', { options: ['New logos', 'Existing customers', 'Both'] }),
    f('customer_segment', 'textarea', 'Which customers', { hint: 'Product they own, industry or renewal window.', when: { audience: ['Existing customers', 'Both'] } }),
    f('lead', 'text', 'Campaign lead'),
  ] },
  { id: 'focus', title: 'Focus (from the use case)', fields: [
    f('industries', 'pick', 'Industries', { from: 'industries' }),
    f('personas', 'pick', 'Personas', { from: 'personas' }),
    f('pain_points', 'pick', 'Pain points', { from: 'pain_points' }),
    f('partners', 'pick', 'Partners involved', { from: 'partners' }),
    f('regions', 'multi', 'Regions', { options: ['US', 'UK and Ireland', 'EMEA', 'APAC', 'Global'] }),
  ] },
  { id: 'goals', title: 'Goals, dates and budget', fields: [
    f('start', 'date', 'Start'),
    f('end', 'date', 'End'),
    f('budget', 'money', 'Total budget (USD)'),
    f('goal_pipeline', 'money', 'Pipeline target (USD)'),
    f('goal_mql', 'number', 'MQL target'),
    f('goal_s1', 'number', 'S1 target'),
    f('goal_s2', 'number', 'S2 target'),
  ] },
  { id: 'messaging', title: 'Messaging', fields: [
    f('value_statement', 'textarea', 'Value statement', { hint: 'One or two sentences in the buyer\'s terms.', ai: true }),
    f('pillars', 'pairs', 'Message pillars', { labels: ['Pillar', 'Proof (from the use case)'], max: 3, ai: true }),
    f('offer', 'multi', 'Offer / call to action', { options: ['Demo', 'Request a quote', 'Gated asset', 'Webinar registration', 'Meeting at an event', 'Free trial', 'Assessment'] }),
  ] },
  { id: 'targeting', title: 'Targeting', fields: [
    f('triggers', 'list', 'Triggers', { hint: 'Events that start the need: an audit, a deadline, an upgrade.', ai: true }),
    f('demand_signals', 'list', 'Demand signals', { hint: 'What shows an account is in-market: searches, job posts, tech stack, intent data.', ai: true }),
    f('titles', 'list', 'Job titles', { ai: true }),
    f('abm_tier', 'choice', 'ABM tier', { options: ['Tier 1', 'Tier 2', 'Not ABM'] }),
    f('account_source', 'text', 'Account list source'),
    f('tech_stack', 'list', 'Tech stack signals'),
  ] },
  { id: 'guardrails', title: 'Claims guardrails', fields: [
    f('guardrails', 'list', 'What we can and can\'t say', { hint: 'E.g. "helps prove compliance", never "makes you compliant".', ai: true }),
  ] },
];

const o = (id, title, owner, fields) => ({ id, title, owner, fields });

export const GROUPS = [
  { id: 'content', title: 'Thought leadership + content', outputs: [
    o('blog', 'Blog post', 'Content', [
      f('titles', 'list', 'Working titles', { ai: true }), f('angle', 'textarea', 'Angle'),
      f('byline', 'text', 'Byline'), f('keyword', 'text', 'Target keyword', { ai: true })]),
    o('pr', 'PR byline pitch', 'Content', [
      f('publications', 'list', 'Target publications'), f('spokesperson', 'text', 'Spokesperson'),
      f('angle', 'textarea', 'Pitch angle', { ai: true })]),
    o('social', 'Social promotion', 'Content', [
      f('channels', 'multi', 'Where', { options: ['LinkedIn company page', 'Named-person posts', 'X', 'YouTube', 'Reddit'] }),
      f('posts', 'number', 'Number of posts'), f('who', 'text', 'Who posts'),
      f('drafts', 'list', 'Draft posts', { ai: true })]),
    o('website', 'Website update', 'Content', [
      f('pages', 'list', 'Pages to change'), f('changes', 'textarea', 'What changes')]),
  ] },
  { id: 'enablement', title: 'Enablement', outputs: [
    o('slides', 'Sales slides', 'Enablement, Creative', [
      f('count', 'number', 'How many slides'), f('placement', 'text', 'Where they go in the deck')]),
    o('battlecard', 'Battlecard', 'Enablement', [
      f('competitors', 'pick', 'Competitors', { from: 'competitors' }),
      f('landmines', 'list', 'Landmines to set', { ai: true })]),
    o('twopager', '2-pager', 'Content', [
      f('persona', 'pick', 'Written for', { from: 'personas' }),
      f('gated', 'choice', 'Gated', { options: ['Gated', 'Ungated'] })]),
    o('training', 'Sales training', 'Enablement', [
      f('date', 'date', 'Date'), f('presenter', 'text', 'Presenter')]),
    o('partner_enable', 'Partner enablement', 'Partner Growth', [
      f('partners', 'pick', 'Partners', { from: 'partners' }), f('format', 'text', 'Format')]),
    o('partner_box', 'Partner campaign-in-a-box', 'Partner Growth', [
      f('contents', 'list', 'What goes in the box'),
      f('cobrand', 'choice', 'Branding', { options: ['Co-branded', 'Leapwork only', 'Partner-branded'] })]),
  ] },
  { id: 'inbound', title: 'Digital inbound campaign', outputs: [
    o('paid', 'Keywords, ad copy and channel distribution', 'Agency', [
      f('platforms', 'multi', 'Platforms', { options: ['Google Search', 'LinkedIn', 'Reddit', 'Retargeting', 'Intent-based', 'AI search program'] }),
      f('ad_budget', 'money', 'Ad budget (USD)'), f('split', 'textarea', 'Split by platform'),
      f('keywords', 'list', 'Keywords', { hint: 'Include competitor terms where it makes sense.', ai: true }),
      f('headlines', 'list', 'Suggested headlines and ad copy', { ai: true })]),
    o('landing', 'Landing page', 'Content, Creative', [
      f('url', 'text', 'URL'), f('headline', 'text', 'Headline', { ai: true }), f('cta', 'text', 'Call to action'),
      f('asset', 'text', 'Gated asset (if any)')]),
    o('creative', 'Ad creative', 'Creative', [
      f('formats', 'list', 'Formats and sizes')]),
    o('marops', 'Campaign set-up and reporting', 'MarOps', [
      f('sf_campaign', 'text', 'Salesforce campaign (parent / child)'), f('utm', 'text', 'UTM convention'),
      f('scoring', 'choice', 'Lead scoring', { options: ['High intent', 'Low intent'] }),
      f('reporting', 'choice', 'Reporting', { options: ['Weekly', 'Every two weeks', 'Monthly'] })]),
  ] },
  { id: 'outbound', title: 'Outbound campaign', outputs: [
    o('accounts', 'Account list', 'SDRs', [
      f('source', 'text', 'Source'), f('tier', 'choice', 'ABM tier', { options: ['Tier 1', 'Tier 2', 'Not ABM'] }),
      f('count', 'number', 'Number of accounts')]),
    o('cadence', 'SDR cadence', 'SDRs', [
      f('steps', 'number', 'Steps'), f('days', 'number', 'Length (days)'),
      f('channels', 'multi', 'Channels', { options: ['Email', 'Phone', 'LinkedIn'] }),
      f('email1', 'textarea', 'Email 1', { ai: true }), f('opener', 'textarea', 'Call opener', { ai: true })]),
    o('nurture', 'Nurture track', 'Marketing', [
      f('steps', 'list', 'Steps', { ai: true })]),
    o('followup', 'Lead follow-up', 'SDRs', [
      f('response', 'text', 'Response time'), f('handoff', 'textarea', 'Hand-off to AE')]),
    o('event', 'Webinar / event', 'Field Marketing', [
      f('name', 'text', 'Name'), f('format', 'choice', 'Format', { options: ['Webinar', 'In-person event', 'Executive roundtable', 'Trade show'] }),
      f('date', 'date', 'Date'), f('region', 'text', 'Region'), f('speakers', 'list', 'Speakers'),
      f('cohost', 'pick', 'Partner co-host', { from: 'partners' }), f('target', 'number', 'Registration or scan target')]),
  ] },
  { id: 'customer', title: 'Customer campaign', outputs: [
    o('expansion', 'Expansion play', 'Field Marketing', [
      f('own', 'pick', 'Product they own', { from: 'products' }), f('add', 'pick', 'Product to add', { from: 'products' }),
      f('pitch', 'textarea', 'Why now', { ai: true })]),
    o('newsletter', 'Newsletter', 'Field Marketing', [
      f('date', 'date', 'Issue date'), f('blurb', 'textarea', 'Blurb', { ai: true })]),
    o('cust_event', 'Customer event / webinar', 'Field Marketing', [
      f('title', 'text', 'Title', { ai: true }), f('date', 'date', 'Date'), f('speakers', 'list', 'Speakers'),
      f('customer_speaker', 'text', 'Customer speaker')]),
    o('cust_nurture', 'Customer nurture', 'Field Marketing', [
      f('steps', 'list', 'Steps', { ai: true })]),
  ] },
];

export const COMMS = { id: 'comms', title: 'Comms and reporting', fields: [
  f('launch', 'multi', 'Internal launch', { options: ['Seismic update', 'Teams channel post', 'Sales meeting'] }),
  f('meeting_date', 'date', 'Sales meeting date'),
  f('metrics', 'list', 'Metrics we report'),
  f('cadence', 'choice', 'Reporting cadence', { options: ['Weekly', 'Every two weeks', 'Monthly'] }),
] };

export const STATUSES = ['Not started', 'In progress', 'Done'];

export const OUTPUTS = Object.fromEntries(GROUPS.flatMap((g) => g.outputs.map((x) => [x.id, { ...x, group: g.id }])));

export function emptyBrief() {
  return { core: {}, groups: {}, outputs: {}, comms: {} };
}

// Choices from the approved use case for `pick` fields.
export function pickOptions(doc) {
  const L = doc.libraries || {}, u = doc.use_case || {};
  const name = (t, id) => (L[t] || []).find((r) => r.id === id)?.name || id;
  return {
    industries: (u.industries || []).map((r) => ({ id: r.industry_id, name: r.label || name('industries', r.industry_id) })),
    personas: (u.personas || []).map((r) => ({ id: r.persona_id, name: name('personas', r.persona_id) })),
    pain_points: (u.pain_points || []).map((p) => ({ id: p.id, name: p.title.replace(/\.$/, ''), product: p.product_id })),
    partners: (u.partners || []).map((r) => ({ id: r.partner_id, name: name('partners', r.partner_id) })),
    competitors: (u.competitors || []).map((r) => ({ id: r.competitor_id, name: name('competitors', r.competitor_id) })),
    products: (L.products || []).map((p) => ({ id: p.id, name: p.name })),
  };
}

// ---------- checking and applying edits ----------
// A patch has the same shape as the brief: { core, groups, outputs, comms }, all optional
// and partial. Used for both form edits and Claude's tool calls.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cap = (s, n = 4000) => String(s ?? '').trim().slice(0, n);

function clean(field, v, opts) {
  const where = `"${field.label}"`;
  if (v === null || v === undefined) return field.type === 'list' || field.type === 'multi' || field.type === 'pick' || field.type === 'pairs' ? [] : field.type === 'number' || field.type === 'money' ? null : '';
  switch (field.type) {
    case 'text': case 'textarea': return cap(v);
    case 'list': {
      const arr = Array.isArray(v) ? v : String(v).split('\n');
      return arr.map((x) => cap(x, 1000)).filter(Boolean).slice(0, 30);
    }
    case 'pairs': {
      if (!Array.isArray(v)) throw new Error(`${where} needs a list of rows.`);
      return v.map((r) => ({ a: cap(r?.a ?? r?.[0], 600), b: cap(r?.b ?? r?.[1], 600) })).filter((r) => r.a || r.b).slice(0, field.max || 10);
    }
    case 'choice': {
      const s = cap(v, 200); if (s && !field.options.includes(s)) throw new Error(`${where} must be one of: ${field.options.join(', ')}.`);
      return s;
    }
    case 'multi': {
      const arr = Array.isArray(v) ? v : [v];
      for (const x of arr) if (!field.options.includes(x)) throw new Error(`${where}: "${x}" is not an option. Use: ${field.options.join(', ')}.`);
      return [...new Set(arr)];
    }
    case 'pick': {
      const arr = Array.isArray(v) ? v : [v], ok = (opts[field.from] || []).map((x) => x.id);
      for (const x of arr) if (!ok.includes(x)) throw new Error(`${where}: "${x}" is not in the use case. Use ids: ${ok.join(', ') || '(none)'}.`);
      return [...new Set(arr)];
    }
    case 'number': case 'money': {
      if (v === '') return null;
      const n = Number(String(v).replace(/[$,\s]/g, '')); if (!Number.isFinite(n) || n < 0) throw new Error(`${where} needs a number.`);
      return field.type === 'number' ? Math.round(n) : n;
    }
    case 'date': {
      const s = cap(v, 10); if (s && !DATE.test(s)) throw new Error(`${where} needs a date as YYYY-MM-DD.`);
      return s;
    }
    default: throw new Error(`Unknown field type ${field.type}`);
  }
}

function applyFields(target, fields, patch, opts, scope) {
  const byKey = Object.fromEntries(fields.map((x) => [x.key, x]));
  for (const [k, v] of Object.entries(patch || {})) {
    const field = byKey[k];
    if (!field) throw new Error(`Unknown field "${k}" in ${scope}. Fields: ${Object.keys(byKey).join(', ')}.`);
    target[k] = clean(field, v, opts);
  }
}

const CORE_FIELDS = CORE.flatMap((s) => s.fields);

// Applies a patch to a brief (in place, all or nothing) and returns the names of what changed.
export function applyPatch(target, patch, opts) {
  const brief = JSON.parse(JSON.stringify(target));
  for (const k of ['core', 'groups', 'outputs', 'comms']) brief[k] ||= {};
  const changed = patchInto(brief, patch, opts);
  for (const k of Object.keys(brief)) target[k] = brief[k];
  return changed;
}

function patchInto(brief, patch, opts) {
  const changed = new Set();
  if (patch.core) { applyFields(brief.core, CORE_FIELDS, patch.core, opts, 'core'); for (const k of Object.keys(patch.core)) changed.add(CORE.find((s) => s.fields.some((x) => x.key === k)).title); }
  if (patch.groups) for (const [g, on] of Object.entries(patch.groups)) {
    const grp = GROUPS.find((x) => x.id === g); if (!grp) throw new Error(`Unknown group "${g}". Groups: ${GROUPS.map((x) => x.id).join(', ')}.`);
    brief.groups[g] = !!on; changed.add(grp.title);
  }
  if (patch.outputs) for (const [id, p] of Object.entries(patch.outputs)) {
    const out = OUTPUTS[id]; if (!out) throw new Error(`Unknown output "${id}". Outputs: ${Object.keys(OUTPUTS).join(', ')}.`);
    const cur = brief.outputs[id] ||= { on: false, owner: out.owner, due: '', status: 'Not started', values: {} };
    if ('on' in p) { cur.on = !!p.on; if (cur.on) brief.groups[out.group] = true; }
    if ('owner' in p) cur.owner = cap(p.owner, 200);
    if ('due' in p) { const d = cap(p.due, 10); if (d && !DATE.test(d)) throw new Error(`Due date for ${out.title} needs YYYY-MM-DD.`); cur.due = d; }
    if ('status' in p) { if (!STATUSES.includes(p.status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}.`); cur.status = p.status; }
    if (p.values) { applyFields(cur.values, out.fields, p.values, opts, out.title); if (!('on' in p) && !cur.on) { cur.on = true; brief.groups[out.group] = true; } }
    changed.add(out.title);
  }
  if (patch.comms) { applyFields(brief.comms, COMMS.fields, patch.comms, opts, 'comms'); changed.add(COMMS.title); }
  return [...changed];
}

// Rough progress: which parts have something in them.
export function progress(brief) {
  const filled = (v) => Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== undefined;
  const parts = CORE.map((s) => ({ name: s.title, done: s.fields.some((x) => filled(brief.core[x.key])) }));
  for (const g of GROUPS) for (const out of g.outputs) {
    const st = brief.outputs[out.id];
    if (brief.groups[g.id] && st?.on) parts.push({ name: out.title, done: out.fields.some((x) => filled(st.values[x.key])) });
  }
  parts.push({ name: COMMS.title, done: COMMS.fields.some((x) => filled(brief.comms[x.key])) });
  return parts;
}
