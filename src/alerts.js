// Email alerts. Sent through Resend when RESEND_API_KEY is set; otherwise nothing is sent.
// ALERT_TO: comma-separated recipients. ALERT_FROM: a sender on a domain verified in Resend.
import { loadBrief } from './brief/store.js';
import { OUTPUTS } from './brief/spec.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function sendEmail(env, { to, subject, text, html }, fetcher = fetch) {
  if (!env.RESEND_API_KEY || !to?.length) return { sent: false, reason: 'not configured' };
  const r = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.ALERT_FROM || 'Mazinator <mazinator@antimatterconsulting.com>', to, subject, text, html }),
  });
  return { sent: r.ok, status: r.status };
}

export async function sentBackAlert(env, db, briefId, out, { note, author }, origin, fetcher = fetch) {
  const to = String(env.ALERT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.RESEND_API_KEY || !to.length) return { sent: false, reason: 'not configured' };
  const b = await loadBrief(db, briefId);
  const row = await db.prepare('SELECT link, link_title, delivered_by FROM brief_assets WHERE brief_id = ? AND output_id = ?').bind(briefId, out).first();
  const what = OUTPUTS[out]?.title || out;
  const campaign = b?.title || briefId;
  const who = String(author || 'Someone');
  const open = `${origin}/leapwork/mazinator.html`;
  const subject = `Sent back: ${what} · ${campaign}`;
  const text = [`${who} sent back "${what}" for the ${campaign} campaign.`, '', 'What needs to change:', String(note || ''), '',
    row?.link ? `Delivered file: ${row.link_title || row.link}\n${row.link}` : '', '', `Open the Mazinator: ${open}`].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#090F12;max-width:560px">
  <p style="font-size:12px;letter-spacing:2px;font-weight:700;color:#C97A5A;margin:0 0 8px">SENT BACK</p>
  <h2 style="margin:0 0 12px;font-size:20px">${esc(what)} · ${esc(campaign)}</h2>
  <p style="margin:0 0 6px"><b>${esc(who)}</b> says what needs to change:</p>
  <blockquote style="margin:0 0 16px;padding:12px 16px;background:#F4F7F8;border-left:4px solid #C97A5A">${esc(note).replace(/\n/g, '<br>')}</blockquote>
  ${row?.link ? `<p style="margin:0 0 16px">Delivered file: <a href="${esc(row.link)}">${esc(row.link_title || row.link)}</a></p>` : ''}
  <p><a href="${esc(open)}" style="display:inline-block;background:#002423;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Open the Mazinator</a></p></div>`;
  return sendEmail(env, { to, subject, text, html }, fetcher);
}
