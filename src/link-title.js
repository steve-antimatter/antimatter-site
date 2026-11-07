// Best-effort name for a link: the page's <title>, cleaned up. Google Drive files only
// give their name when shared publicly; private ones come back as a sign-in page.
export const isDrive = (url) => /^https?:\/\/(docs|drive)\.google\.com\//.test(url);

export async function linkTitle(url, { timeout = 4000 } = {}) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 (compatible; Mazinator link preview)' } });
    if (!r.ok || !/html/.test(r.headers.get('content-type') || '')) return null;
    const html = (await r.text()).slice(0, 300000);
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
    if (!m) return null;
    let t = m[1].replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s+[-–|]\s+Google (Docs|Sheets|Slides|Drive|Forms)$/i, '').trim();
    if (!t || /sign[ -]?in|log ?in|access denied|request access/i.test(t) || /^Google (Docs|Sheets|Slides|Drive)$/i.test(t)) return null;
    return t.slice(0, 200);
  } catch { return null; }
}
