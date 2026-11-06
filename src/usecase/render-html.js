// Use case page: the locked template, drawn from a resolved use case.
// Used for the live preview beside the authoring chat and for the review PDF.
import { CSS, HEADER_BG, WORDMARK, PRODUCT_LOGOS } from './chrome.js';
import { resolve } from './resolve.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const link = (text, url) => `<a href="${esc(url)}">${text}</a>`;
const table = (cls, head, rows) =>
  `<div class="tw"><table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const section = (title, body, cls) => `<section${cls ? ` class="${cls}"` : ''}><h2>${esc(title)}</h2>${body}</section>`;

// Logos: a map of product id -> image URL. Defaults to the embedded ones.
// draft: show 'Not written yet' for empty sections (preview beside the authoring chat).
// banner: 'draft' | 'review' adds a status strip across the top of the page.
export function renderHtml(doc, { logos = PRODUCT_LOGOS, draft = false, banner = null } = {}) {
  const v = resolve(doc);
  const TODO = '<p class="note todo">Not written yet.</p>';
  const or = (empty, html) => (empty ? (draft ? TODO : '') : html);

  const pains = v.pain_groups.flatMap((g) => g.items.map((it, i) =>
    `<tr${i === 0 ? ' class="grp"' : ''}><td><strong>${esc(it.title)}</strong> ${esc(it.detail)}</td>` +
    (i === 0 ? `<td class="prod" rowspan="${g.items.length}"><img src="${esc(logos[g.product.id] || '')}" alt="${esc(g.product.name)}"></td>` : '') +
    `<td>${esc(it.fix)}</td></tr>`)).join('');

  const customers = v.customers.map((c) =>
    `<tr><td class="qcell">${c.quote ? `<p class="q">“${esc(c.quote)}”</p>` : ''}` +
    `<p class="who"><strong>${esc(c.who)}</strong><span>${esc(c.line)}</span></p></td>` +
    `<td>${esc(c.what_they_did)}</td><td class="src">${link(esc(c.source_label), c.source_url)}</td></tr>`).join('');

  const body = [
    section('Problem', or(!v.problem, `\n<p class="lead">${esc(v.problem)}</p>`)),
    section('Position', or(!v.position, `\n<p class="position">${esc(v.position)}</p>`)),
    section('Industries', or(!v.industries.length, table('k', ['Industry', 'What drives the need'],
      v.industries.map((r) => [`<strong>${esc(r.name)}</strong>`, esc(r.drives_need)])))),
    section('Personas', or(!v.personas.length, table('k', ['Persona', 'Role in the deal', 'Cares about'],
      v.personas.map((p) => [`<strong>${esc(p.name)}</strong>${p.descriptor ? ` <span class="muted">${esc(p.descriptor)}</span>` : ''}`,
        esc(p.role_in_deal), esc(p.cares_about)]))), 'tight pb2'),
    section('Pain points and how we fix them', or(!v.pain_groups.length,
      `\n<div class="tw"><table class="pain"><thead><tr><th>Pain point</th><th class="p">Product</th><th>How we fix it</th></tr></thead><tbody>${pains}</tbody></table></div>` +
      (v.pain_points_note ? `\n<p class="note">${esc(v.pain_points_note)}</p>` : '')), 'tight'),
    section('Customers, case studies and quotes', or(!v.customers.length,
      `\n<div class="tw"><table><thead><tr><th>Quote and attribution</th><th>What they did</th><th>Source</th></tr></thead><tbody>${customers}</tbody></table></div>\n`)),
    section('Partners and alliances', or(!v.partners.length, table('k', ['Partner', 'Program', 'Why it matters here'],
      v.partners.map((p) => [p.url ? link(`<strong>${esc(p.name)}</strong>`, p.url) : `<strong>${esc(p.name)}</strong>`,
        esc(p.program), esc(p.why_it_matters)])))),
    section('Competitors', or(!v.competitors.length, table('k', ['Competitor', 'Their pitch', 'How Leapwork wins'],
      v.competitors.map((c) => [link(`<strong>${esc(c.name)}</strong>`, c.url) + (c.products ? ` <span class="muted">${esc(c.products)}</span>` : ''),
        esc(c.their_pitch), esc(c.how_we_win)])))),
    section('Common objections', or(!v.objections.length, table('k obj', ['Objection', 'Suggested response'],
      v.objections.map((o) => [`“${esc(o.objection)}”`, esc(o.response)])))),
    section('Sources', or(!v.sources.length, `<ul class="src-list">${v.sources.map((g) =>
      `<li><span>${esc(g.group)}</span>${g.links.map((l) => link(esc(l.title), l.url)).join(' · ')}</li>`).join('')}</ul>`)),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}.todo{font-style:italic;color:#9AA6AC}
.status-strip{position:sticky;top:0;z-index:5;padding:10px 24px;text-align:center;font:600 12.5px/1.3 var(--body);letter-spacing:.14em;text-transform:uppercase}
.status-strip.draft{background:#E8EEF4;color:#4F6F82;border-bottom:1px solid #D2E1EA}
.status-strip.review{background:#FBF1E2;color:#8A5A1E;border-bottom:1px solid #EBD3A8}
body.pending main{opacity:.92}
@media print{.status-strip{display:none}}</style></head><body${banner === 'review' ? ' class="pending"' : ''}>
${banner === 'review' ? '<div class="status-strip review">Pending approval · not final</div>' : banner === 'draft' ? '<div class="status-strip draft">Draft · not submitted</div>' : ''}
<header>
${HEADER_BG}
<div class="wrap hd">
${WORDMARK}
<div class="eyebrow"><i></i>Use case</div>
<h1>${esc(v.title)}</h1>
<div class="meta"><span>Created ${esc(v.created_label)}</span><span>${esc(v.author)}</span></div>
</div>
</header>
<main class="wrap">
${body}
</main></body></html>`;
}
