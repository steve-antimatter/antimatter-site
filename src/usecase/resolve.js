// Turn a stored use case ({ libraries, use_case }) into a flat view model:
// every library reference replaced by the values the page and the Word export show.
// Both renderers draw from this, so they always say the same thing.

export function resolve(doc) {
  const L = doc.libraries || {};
  const by = (name) => Object.fromEntries((L[name] || []).map((r) => [r.id, r]));
  const products = by('products'), industries = by('industries'), personas = by('personas'),
    sources = by('sources'), partners = by('partners'), competitors = by('competitors'),
    customers = by('customers'), quotes = by('quotes');
  const need = (map, id, what) => {
    if (!map[id]) throw new Error(`unknown ${what}: ${id}`);
    return map[id];
  };
  const u = doc.use_case;

  // Pain points grouped by product, in the order products first appear.
  const groups = [];
  for (const p of u.pain_points || []) {
    let g = groups.find((x) => x.product.id === p.product_id);
    if (!g) groups.push((g = { product: need(products, p.product_id, 'product'), items: [] }));
    g.items.push({ title: p.title, detail: p.detail, fix: p.fix });
  }

  return {
    id: u.id,
    title: u.title,
    author: u.author,
    created_on: u.created_on,
    created_label: formatDate(u.created_on),
    problem: u.problem,
    position: u.position,
    industries: (u.industries || []).map((r) => ({
      name: r.label || need(industries, r.industry_id, 'industry').name,
      drives_need: r.drives_need,
    })),
    personas: (u.personas || []).map((r) => {
      const p = need(personas, r.persona_id, 'persona');
      return { name: p.name, descriptor: r.descriptor ?? p.descriptor, role_in_deal: r.role_in_deal, cares_about: r.cares_about };
    }),
    pain_groups: groups,
    pain_points_note: u.pain_points_note,
    customers: (u.customers || []).map((r) => {
      const c = need(customers, r.customer_id, 'customer');
      const q = r.quote_id ? need(quotes, r.quote_id, 'quote') : null;
      let who, line;
      if (q) {
        let org = c.display_name + (c.anonymous ? ' (company anonymous)' : '');
        if (!q.speaker_title && c.descriptor) org += ', ' + c.descriptor;
        who = q.speaker_name || q.speaker_title || c.display_name;
        line = (q.speaker_name && q.speaker_title ? q.speaker_title + ', ' : '') + org;
      } else {
        who = c.display_name;
        line = c.anonymous ? 'Anonymous' : c.descriptor || '';
      }
      return { quote: q ? q.text : null, who, line, what_they_did: r.what_they_did,
        source_label: r.source_label || 'Case study', source_url: need(sources, r.source_id, 'source').url };
    }),
    partners: (u.partners || []).map((r) => {
      const p = need(partners, r.partner_id, 'partner');
      return { name: p.name, url: p.source_id ? need(sources, p.source_id, 'source').url : null,
        program: p.program, why_it_matters: r.why_it_matters };
    }),
    competitors: (u.competitors || []).map((r) => {
      const c = need(competitors, r.competitor_id, 'competitor');
      return { name: c.name, products: c.products, url: r.url || c.url, their_pitch: r.their_pitch, how_we_win: r.how_we_win };
    }),
    objections: u.objections || [],
    sources: (u.sources || []).map((g) => ({
      group: g.grp,
      links: g.ids.map((id) => { const s = need(sources, id, 'source'); return { title: s.title, url: s.url }; }),
    })),
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
