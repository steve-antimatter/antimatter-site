// Antimatter site worker.
// Everything is served as static assets except the client areas below,
// which are password protected. The password lives in a Cloudflare secret
// (LEAPWORK_PASSWORD); the files live under /private/leapwork/ and are only
// reachable through this script.

import { ensureSchema, saveDoc, loadDoc, listIslands, createDraft, setStatus, getChat } from './src/usecase/store.js';
import { chatTurn } from './src/usecase/author.js';
import { renderHtml } from './src/usecase/render-html.js';
import governanceSeed from './db/seed/governance-in-testing.json';

const COOKIE = 'lw_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';

    if (p === '/leapwork' || p.startsWith('/leapwork/')) return leapwork(req, env, url, p);
    if (p.startsWith('/private')) return protectedAsset(req, env, url, p);

    return env.ASSETS.fetch(req);
  }
};

async function leapwork(req, env, url, p) {
  const secret = env.LEAPWORK_PASSWORD;
  if (!secret) return page(notConfigured(), 503);

  if (p === '/leapwork/logout') {
    return redirect(url.origin + '/leapwork', clearCookie());
  }

  if (req.method === 'POST' && p === '/leapwork') {
    const form = await req.formData().catch(() => null);
    const given = form ? String(form.get('password') || '') : '';
    if (given && safeEqual(given, secret)) {
      return redirect(url.origin + '/leapwork', setCookie(await token(secret)));
    }
    return page(login(true), 401);
  }

  if (!(await authed(req, secret))) return page(login(false), 401);

  if (p.startsWith('/leapwork/api/') || p.startsWith('/leapwork/use-cases/')) return mazinator(req, env, p);

  // /leapwork        -> /private/leapwork/  (index.html)
  // /leapwork/x.pdf  -> /private/leapwork/x.pdf
  const rest = p === '/leapwork' ? '/' : p.slice('/leapwork'.length);
  const target = new URL(url.origin + '/private/leapwork' + rest + url.search);
  const res = await env.ASSETS.fetch(new Request(target, { method: 'GET', headers: req.headers }));
  return noStore(res);
}

// ---- Mazinator data (behind the Leapwork login) ---------------------------

let schemaReady = false;

async function mazinator(req, env, p) {
  if (!env.DB) return json({ error: 'Database not connected' }, 503);
  try {
    if (!schemaReady) { await ensureSchema(env.DB); schemaReady = true; }
    // One-time (and repeatable) setup: create tables, load Governance in Testing.
    if (p === '/leapwork/api/setup') {
      await ensureSchema(env.DB);
      await saveDoc(env.DB, governanceSeed);
      return json({ ok: true, islands: await listIslands(env.DB) });
    }
    if (p === '/leapwork/api/islands') return json(await listIslands(env.DB));

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : null;

    // New draft use case (a new island).
    if (p === '/leapwork/api/use-cases' && req.method === 'POST') {
      const id = await createDraft(env.DB, { title: body.title, author: body.author });
      return json({ id, islands: await listIslands(env.DB) });
    }

    let m = p.match(/^\/leapwork\/api\/use-cases\/([a-z0-9-]+)\/(chat|status)$/);
    if (m) {
      const [, id, what] = m;
      if (what === 'chat' && req.method === 'GET') {
        const uc = await env.DB.prepare('SELECT status FROM use_cases WHERE id = ?').bind(id).first();
        if (!uc) return json({ error: 'Not found' }, 404);
        return json({ status: uc.status, messages: await getChat(env.DB, id) });
      }
      if (what === 'chat' && req.method === 'POST') {
        const text = String(body.text || '').trim();
        if (!text) return json({ error: 'Empty message' }, 400);
        return json(await chatTurn(env, env.DB, id, text, String(body.author || '').slice(0, 80)));
      }
      if (what === 'status' && req.method === 'POST') {
        const version = await setStatus(env.DB, id, String(body.status || ''), String(body.author || ''));
        return json({ ok: true, status: body.status, version });
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    m = p.match(/^\/leapwork\/api\/use-cases\/([a-z0-9-]+)$/);
    if (m) {
      const doc = await loadDoc(env.DB, m[1]);
      return doc ? json(doc) : json({ error: 'Not found' }, 404);
    }
    m = p.match(/^\/leapwork\/use-cases\/([a-z0-9-]+)$/);
    if (m) {
      const doc = await loadDoc(env.DB, m[1]);
      if (!doc) return new Response('Not found', { status: 404 });
      return noStore(new Response(renderHtml(doc, { draft: doc.use_case.status !== 'locked' }), { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function protectedAsset(req, env, url, p) {
  // Direct hits on /private/* only work with a valid session, otherwise 404.
  const secret = env.LEAPWORK_PASSWORD;
  if (secret && p.startsWith('/private/leapwork') && (await authed(req, secret))) {
    return noStore(await env.ASSETS.fetch(req));
  }
  return new Response('Not found', { status: 404 });
}

// ---- session ------------------------------------------------------------

async function token(secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('leapwork-session-v1'));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function authed(req, secret) {
  const cookie = req.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]+)'));
  if (!m) return false;
  return safeEqual(m[1], await token(secret));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function setCookie(v) {
  return `${COOKIE}=${v}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}
function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ---- responses ----------------------------------------------------------

function redirect(to, cookie) {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  if (cookie) h.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers: h });
}

function noStore(res) {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

function page(html, status) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  });
}

// ---- pages --------------------------------------------------------------

const MIST = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 300' preserveAspectRatio='none'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='%23f7f5f0'/><stop offset='1' stop-color='%23d7e4ec'/></linearGradient></defs><rect width='1200' height='300' fill='url(%23s)'/><path d='M0 175 L120 120 L260 160 L400 95 L540 150 L680 105 L820 145 L960 90 L1100 135 L1200 110 L1200 300 L0 300Z' fill='%23b7cdda' opacity='.75'/><path d='M0 215 L160 170 L320 205 L480 150 L640 210 L800 160 L960 200 L1120 165 L1200 190 L1200 300 L0 300Z' fill='%2391b1c4' opacity='.8'/><path d='M0 250 L180 225 L380 245 L560 205 L760 240 L960 215 L1200 240 L1200 300 L0 300Z' fill='%236e94ab' opacity='.9'/></svg>")`;

function shell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} — Antimatter Consulting</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600&family=Open+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--navy:#0a1628;--ink:#e9eef4;--ink-dim:#a9b8c9;--mist:#9dbccd;--mist-2:#c9dbe5;--paper:#f4f1ea;--orange:#f27a2c;--line:rgba(157,188,205,.18);--head:'Oswald',sans-serif;--body:'Open Sans',system-ui,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--navy);color:var(--ink);font-family:var(--body);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 28px;
    background-image:radial-gradient(ellipse 70% 50% at 50% 0%,#13284d 0%,var(--navy) 70%)}
  a{color:inherit;text-decoration:none}
  .card{width:min(440px,100%);text-align:center}
  .logo{width:min(320px,80%);margin:0 auto 40px;display:block}
  .eyebrow{font-family:var(--head);font-weight:300;letter-spacing:.3em;text-transform:uppercase;font-size:12px;color:var(--mist);margin-bottom:14px}
  h1{font-family:var(--head);font-weight:600;text-transform:uppercase;letter-spacing:.03em;font-size:clamp(44px,8vw,64px);line-height:1;color:transparent;-webkit-background-clip:text;background-clip:text;background-size:cover;background-position:center;background-image:${MIST}}
  p{color:var(--ink-dim);font-size:16px;margin-top:14px}
  form{display:grid;gap:12px;margin-top:30px;padding:30px;border:1px solid rgba(157,188,205,.3);border-radius:12px;background:linear-gradient(180deg,rgba(22,48,90,.45),rgba(15,33,64,.25));text-align:left}
  label{font-family:var(--head);font-weight:300;letter-spacing:.2em;text-transform:uppercase;font-size:11px;color:var(--mist)}
  input{width:100%;background:rgba(10,22,40,.7);border:1px solid var(--line);border-radius:4px;color:var(--ink);font:inherit;font-size:16px;padding:12px 14px;outline:none}
  input:focus{border-color:var(--mist)}
  .btn{font-family:var(--head);font-weight:500;letter-spacing:.08em;text-transform:uppercase;font-size:14px;padding:13px 24px;border:1px solid var(--paper);background:var(--paper);color:var(--navy);border-radius:2px;cursor:pointer;justify-self:start;margin-top:6px}
  .btn:hover{background:var(--mist-2);border-color:var(--mist-2)}
  .err{color:#ffb088;font-size:14px}
  .fine{font-size:13px;margin-top:26px}
</style>
</head>
<body>
<div class="card">
  <a href="/"><img class="logo" src="/logo.png" alt="Antimatter Consulting"></a>
  ${body}
</div>
</body>
</html>`;
}

function login(failed) {
  return shell('Leapwork', `
  <div class="eyebrow">Client workspace</div>
  <h1>Leapwork</h1>
  <p>Deliverables and working documents for the Leapwork team.</p>
  <form method="POST" action="/leapwork">
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
    ${failed ? '<div class="err">That password didn’t match. Try again, or ask Steve for the current one.</div>' : ''}
    <button class="btn" type="submit">Open</button>
  </form>
  <p class="fine">Steve sends the password directly. If you need it, email <a href="mailto:steve@antimatterconsulting.com" style="color:var(--mist-2);border-bottom:1px solid var(--line)">steve@antimatterconsulting.com</a>.</p>`);
}

function notConfigured() {
  return shell('Leapwork', `
  <div class="eyebrow">Client workspace</div>
  <h1>Leapwork</h1>
  <p>This page isn’t open yet. Check back shortly.</p>`);
}
