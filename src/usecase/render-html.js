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
export function renderHtml(doc, { logos = PRODUCT_LOGOS } = {}) {
  const v = resolve(doc);

  const pains = v.pain_groups.flatMap((g) => g.items.map((it, i) =>
    `<tr${i === 0 ? ' class="grp"' : ''}><td><strong>${esc(it.title)}</strong> ${esc(it.detail)}</td>` +
    (i === 0 ? `<td class="prod" rowspan="${g.items.length}"><img src="${esc(logos[g.product.id] || '')}" alt="${esc(g.product.name)}"></td>` : '') +
    `<td>${esc(it.fix)}</td></tr>`)).join('');

  const customers = v.customers.map((c) =>
    `<tr><td class="qcell">${c.quote ? `<p class="q">“${esc(c.quote)}”</p>` : ''}` +
    `<p class="who"><strong>${esc(c.who)}</strong><span>${esc(c.line)}</span></p></td>` +
    `<td>${esc(c.what_they_did)}</td><td class="src">${link(esc(c.source_label), c.source_url)}</td></tr>`).join('');

  const body = [
    section('Problem', `\n<p class="lead">${esc(v.problem)}</p>`),
    section('Position', `\n<p class="position">${esc(v.position)}</p>`),
    section('Industries', table('k', ['Industry', 'What drives the need'],
      v.industries.map((r) => [`<strong>${esc(r.name)}</strong>`, esc(r.drives_need)]))),
    section('Personas', table('k', ['Persona', 'Role in the deal', 'Cares about'],
      v.personas.map((p) => [`<strong>${esc(p.name)}</strong>${p.descriptor ? ` <span class="muted">${esc(p.descriptor)}</span>` : ''}`,
        esc(p.role_in_deal), esc(p.cares_about)])), 'tight pb2'),
    section('Pain points and how we fix them',
      `\n<div class="tw"><table class="pain"><thead><tr><th>Pain point</th><th class="p">Product</th><th>How we fix it</th></tr></thead><tbody>${pains}</tbody></table></div>` +
      (v.pain_points_note ? `\n<p class="note">${esc(v.pain_points_note)}</p>` : ''), 'tight'),
    section('Customers, case studies and quotes',
      `\n<div class="tw"><table><thead><tr><th>Quote and attribution</th><th>What they did</th><th>Source</th></tr></thead><tbody>${customers}</tbody></table></div>\n`),
    section('Partners and alliances', table('k', ['Partner', 'Program', 'Why it matters here'],
      v.partners.map((p) => [p.url ? link(`<strong>${esc(p.name)}</strong>`, p.url) : `<strong>${esc(p.name)}</strong>`,
        esc(p.program), esc(p.why_it_matters)]))),
    section('Competitors', table('k', ['Competitor', 'Their pitch', 'How Leapwork wins'],
      v.competitors.map((c) => [link(`<strong>${esc(c.name)}</strong>`, c.url) + (c.products ? ` <span class="muted">${esc(c.products)}</span>` : ''),
        esc(c.their_pitch), esc(c.how_we_win)]))),
    section('Common objections', table('k obj', ['Objection', 'Suggested response'],
      v.objections.map((o) => [`“${esc(o.objection)}”`, esc(o.response)]))),
    section('Sources', `<ul class="src-list">${v.sources.map((g) =>
      `<li><span>${esc(g.group)}</span>${g.links.map((l) => link(esc(l.title), l.url)).join(' · ')}</li>`).join('')}</ul>`),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
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
