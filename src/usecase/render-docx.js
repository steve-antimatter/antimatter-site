// Word export of a use case, designed to convert cleanly into a Google Doc.
// Same sections and order as the page; a simpler, Docs-safe layout:
// header strip inside the margins, real text for title/date/author (editable),
// section titles as dark teal shaded paragraphs, borderless tables with rules.
//
// Usage:  const doc = buildDocx(docxLib, record);  const buf = await docxLib.Packer.toBuffer(doc);
// `docxLib` is the `docx` npm package (passed in so this file runs in Node and in a Worker).
import { resolve } from './resolve.js';
import { DOCX_IMAGES, DOCX_IMAGE_SIZES } from './docx-assets.js';

const C = { teal: '002423', ink: '090F12', steel: '2F4754', fog: '4F6F82', line: 'DCE5EA', rule: 'B9CBD3',
  mint: 'EAF3EE', green: '3F7A78', copper: 'C97A5A' };
const FONT = 'Inter';
const W = 10080; // content width in DXA (Letter, 0.75in margins)

function b64(s) {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64');
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function buildDocx(D, record) {
  const { Document, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
    BorderStyle, AlignmentType, VerticalAlign, ExternalHyperlink, TableLayoutType } = D;
  const v = resolve(record);

  const t = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 19, color: o.color || C.steel,
    bold: o.bold, italics: o.italics, characterSpacing: o.spacing });
  const link = (text, url, o = {}) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT,
    size: o.size || 19, bold: o.bold, color: o.color || C.green, underline: {} })] });
  const p = (children, o = {}) => new Paragraph({ children, alignment: o.align, keepNext: o.keepNext, indent: o.indent,
    border: o.border, shading: o.shading, spacing: { before: o.before || 0, after: o.after || 0, line: o.line || 276, lineRule: D.LineRuleType.AUTO } });
  const img = (key, w) => {
    const [iw, ih] = DOCX_IMAGE_SIZES[key];
    const type = key === 'band' ? 'jpg' : 'png';
    return new ImageRun({ type, data: b64(DOCX_IMAGES[key]), transformation: { width: w, height: Math.round(ih * w / iw) } });
  };

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const rowBorders = (top) => ({ top: top || none, left: none, right: none,
    bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line } });
  const cell = (children, width, o = {}) => new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: { size: width, type: WidthType.DXA },
    borders: o.borders || rowBorders(),
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: { top: 120, bottom: 120, left: o.ml ?? 0, right: o.mr ?? 180 },
    verticalAlign: o.valign || VerticalAlign.TOP, rowSpan: o.rowSpan,
  });
  const headRow = (labels, widths, center = []) => new TableRow({ tableHeader: true, children: labels.map((l, i) => cell(
    p([t(l.toUpperCase(), { size: 15, bold: true, color: C.fog, spacing: 30 })], { align: center.includes(i) ? AlignmentType.CENTER : undefined }),
    widths[i], { borders: { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 8, color: C.teal } } })) });
  const table = (widths, rows) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    layout: TableLayoutType.FIXED, rows, borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none } });
  const simple = (head, widths, rows) => table(widths, [headRow(head, widths),
    ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i])) }))]);

  // Section title: dark teal bar, copper dot, white caps.
  const heading = (text) => p([t('●  ', { size: 16, color: C.copper }), t(text.toUpperCase(), { size: 17, bold: true, color: 'FFFFFF', spacing: 40 })],
    { before: 400, after: 160, keepNext: true, indent: { left: 140, right: 140 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.teal },
      border: { top: { style: BorderStyle.SINGLE, size: 24, color: C.teal, space: 4 }, bottom: { style: BorderStyle.SINGLE, size: 24, color: C.teal, space: 4 },
        left: { style: BorderStyle.SINGLE, size: 24, color: C.teal, space: 6 }, right: { style: BorderStyle.SINGLE, size: 24, color: C.teal, space: 6 } } });
  const nameWithNote = (name, note) => p([t(name, { bold: true, color: C.ink }), ...(note ? [t('  ' + note, { size: 16, color: C.fog })] : [])]);

  const out = [];

  // Header
  out.push(new Paragraph({ children: [img('band', 672)], spacing: { after: 280 } }));
  out.push(p([t('●  ', { size: 16, color: C.copper }), t('USE CASE', { size: 17, bold: true, color: C.fog, spacing: 50 })], { after: 80 }));
  out.push(p([t(v.title, { size: 52, bold: true, color: C.teal })], { before: 120, after: 100, line: 240 }));
  out.push(p([t(`Created ${v.created_label}`, { size: 19 }), t('   ·   ', { size: 19, color: C.fog }), t(v.author, { size: 19 })], { after: 120 }));

  // Problem, Position
  out.push(heading('Problem'));
  out.push(p([t(v.problem, { size: 22 })], { line: 300 }));
  out.push(heading('Position'));
  out.push(p([t(v.position, { size: 26, color: C.teal })], { line: 320, indent: { left: 280 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: C.copper, space: 12 } } }));

  // Industries
  out.push(heading('Industries'));
  out.push(simple(['Industry', 'What drives the need'], [2800, 7280],
    v.industries.map((r) => [p([t(r.name, { bold: true, color: C.ink })]), p([t(r.drives_need)])])));

  // Personas
  out.push(heading('Personas'));
  out.push(simple(['Persona', 'Role in the deal', 'Cares about'], [2900, 3400, 3780],
    v.personas.map((r) => [nameWithNote(r.name, r.descriptor), p([t(r.role_in_deal)]), p([t(r.cares_about)])])));

  // Pain points, grouped by product with one logo per product
  out.push(heading('Pain points and how we fix them'));
  const pw = [4300, 1480, 4300];
  const painRows = [headRow(['Pain point', 'Product', 'How we fix it'], pw, [1])];
  v.pain_groups.forEach((g, gi) => g.items.forEach((it, i) => {
    const top = i === 0 && gi > 0 ? { style: BorderStyle.SINGLE, size: 6, color: C.rule } : undefined;
    const cells = [cell(p([t(it.title + ' ', { bold: true, color: C.ink }), t(it.detail)]), pw[0], { borders: rowBorders(top) })];
    if (i === 0) {
      const white = { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' };
      cells.push(cell(new Paragraph({ children: [img(g.product.id, 64)], alignment: AlignmentType.CENTER }), pw[1],
        { rowSpan: g.items.length, fill: C.mint, valign: VerticalAlign.CENTER, ml: 100, mr: 100,
          borders: { top: white, bottom: white, left: { ...white, size: 48 }, right: { ...white, size: 48 } } }));
    }
    cells.push(cell(p([t(it.fix)]), pw[2], { borders: rowBorders(top), ml: 180 }));
    painRows.push(new TableRow({ cantSplit: true, children: cells }));
  }));
  out.push(table(pw, painRows));
  if (v.pain_points_note) out.push(p([t(v.pain_points_note, { size: 17, color: C.fog })], { before: 120 }));

  // Customers, case studies and quotes
  out.push(heading('Customers, case studies and quotes'));
  out.push(simple(['Quote and attribution', 'What they did', 'Source'], [4500, 3880, 1700],
    v.customers.map((c) => [
      [...(c.quote ? [p([t('“' + c.quote + '”', { size: 21, color: C.teal })], { line: 280, after: 60 })] : []),
        p([t(c.who + '  ', { size: 16, bold: true }), t(c.line, { size: 16, color: C.fog })])],
      p([t(c.what_they_did)]),
      p([link(c.source_label, c.source_url)]),
    ])));

  // Partners
  out.push(heading('Partners and alliances'));
  out.push(simple(['Partner', 'Program', 'Why it matters here'], [2000, 3800, 4280],
    v.partners.map((r) => [p([r.url ? link(r.name, r.url, { bold: true, color: C.ink }) : t(r.name, { bold: true, color: C.ink })]),
      p([t(r.program)]), p([t(r.why_it_matters)])])));

  // Competitors
  out.push(heading('Competitors'));
  out.push(simple(['Competitor', 'Their pitch', 'How Leapwork wins'], [2200, 3800, 4080],
    v.competitors.map((r) => [[p([link(r.name, r.url, { bold: true, color: C.ink })]), ...(r.products ? [p([t(r.products, { size: 16, color: C.fog })], { before: 20 })] : [])],
      p([t(r.their_pitch)]), p([t(r.how_we_win)])])));

  // Objections
  out.push(heading('Common objections'));
  out.push(simple(['Objection', 'Suggested response'], [3600, 6480],
    v.objections.map((o) => [p([t('“' + o.objection + '”', { color: C.teal, bold: true })]), p([t(o.response)])])));

  // Sources
  out.push(heading('Sources'));
  for (const g of v.sources) {
    const runs = [t(g.group + '   ', { size: 17, bold: true, color: C.fog })];
    g.links.forEach((l, i) => { if (i) runs.push(t('  ·  ', { size: 17, color: C.fog })); runs.push(link(l.title, l.url, { size: 17 })); });
    out.push(p(runs, { after: 80 }));
  }

  return new Document({
    creator: v.author, title: v.title, description: 'Leapwork use case',
    styles: { default: { document: { run: { font: FONT, size: 19, color: C.steel } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children: out }],
  });
}
