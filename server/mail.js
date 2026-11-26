// Email: delivered through Resend when RESEND_API_KEY is set, otherwise stored in the outbox
// (visible in Admin → Emails) with status "stored", so an email is never claimed as sent when it was not.
import { db, getContent } from './db.js';
import { config } from './env.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendEmail({ to, subject, html, related = '' }) {
  let status = 'stored', error = '';
  if (!to) { to = '(RESERVATIONS_NOTIFY_EMAIL not set)'; error = 'No recipient configured'; }
  else if (config.resendKey) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.emailFrom, to: [to], subject, html }),
      });
      if (r.ok) status = 'sent';
      else { status = 'failed'; error = `${r.status} ${(await r.text()).slice(0, 300)}`; }
    } catch (e) { status = 'failed'; error = String(e.message || e); }
  }
  db.prepare('INSERT INTO outbox (to_addr, subject, html, status, error, related) VALUES (?,?,?,?,?,?)')
    .run(to, subject, html, status, error, related);
  if (status === 'failed') console.warn('[mail] Delivery failed:', error);
}

function layout(title, bodyHtml) {
  const c = getContent();
  const h = c.hotel;
  return `<!doctype html><html><body style="margin:0;background:#F4F0E8;font-family:Helvetica,Arial,sans-serif;color:#202322">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F0E8;padding:32px 12px"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff">
    <tr><td style="background:#101B1B;padding:36px;text-align:center">
      <div style="font-family:Georgia,serif;letter-spacing:.35em;color:#F4F0E8;font-size:22px">DE DON</div>
      <div style="letter-spacing:.4em;color:#B99A64;font-size:10px;margin-top:6px">ABUJA</div>
    </td></tr>
    <tr><td style="padding:40px 40px 8px"><h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 18px;color:#101B1B">${esc(title)}</h1>${bodyHtml}</td></tr>
    <tr><td style="padding:28px 40px 40px;font-size:12px;color:#77746D;border-top:1px solid #eee">
      ${esc(h.name)} · ${esc(h.addressLine)}, ${esc(h.city)}, ${esc(h.country)}<br>${esc(h.phone)} · ${esc(h.email)}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

const money = (n, cur = 'NGN') => (n == null ? 'Rate on request' : new Intl.NumberFormat('en-NG', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n));

function summaryTable(r) {
  const row = (k, v) => `<tr><td style="padding:8px 0;color:#77746D;font-size:13px;width:44%">${esc(k)}</td><td style="padding:8px 0;font-size:14px">${esc(v)}</td></tr>`;
  return `<table width="100%" style="border-collapse:collapse;margin:18px 0 22px;border-top:1px solid #eee">
    ${row('Reference', r.reference)}${row('Room', r.room_name)}${row('Arrival', r.check_in)}${row('Departure', r.check_out)}
    ${row('Nights', r.nights)}${row('Guests', `${r.adults} adult(s)${r.children ? `, ${r.children} child(ren)` : ''}`)}
    ${row('Estimated total', money(r.total, r.currency))}${row('Status', statusLabel(r.status))}
  </table>`;
}

export const statusLabel = (s) => ({ pending: 'Request received — awaiting confirmation', confirmed: 'Confirmed', rejected: 'Unable to accommodate', cancelled: 'Cancelled', checked_in: 'Checked in', checked_out: 'Checked out', no_show: 'No-show' }[s] || s);

const p = (t) => `<p style="font-size:15px;line-height:1.7;margin:0 0 14px">${t}</p>`;

export function guestRequestEmail(r) {
  return {
    to: r.email,
    subject: `Your reservation request ${r.reference} — DE DON`,
    html: layout(`Thank you, ${r.first_name}.`,
      p('We have received your reservation request. <strong>This is not yet a confirmed booking.</strong> Our reservations team will review availability and contact you shortly to confirm your stay and arrange any payment or guarantee required.')
      + summaryTable(r)
      + p(`You can review or manage your request at <a style="color:#B99A64" href="${config.siteUrl}/reservations#manage">${config.siteUrl}/reservations</a> using your reference and email address.`)),
    related: r.reference,
  };
}

export function hotelNotifyEmail(r) {
  return {
    to: config.notifyEmail,
    subject: `New reservation request ${r.reference} — ${r.room_name}, ${r.check_in}`,
    html: layout('New reservation request',
      p(`${esc(r.first_name)} ${esc(r.last_name)} · ${esc(r.email)} · ${esc(r.phone)}`) + summaryTable(r)
      + (r.requests ? p(`<em>Special requests:</em> ${esc(r.requests)}`) : '')
      + p(`Review it in the <a style="color:#B99A64" href="${config.siteUrl}/admin/">admin dashboard</a>.`)),
    related: r.reference,
  };
}

export function guestStatusEmail(r, extraMessage = '') {
  const intro = {
    confirmed: 'We are delighted to confirm your reservation. We look forward to welcoming you.',
    rejected: 'Thank you for your interest. Unfortunately we are unable to accommodate this request. Our team would be glad to suggest alternative dates or rooms.',
    cancelled: 'Your reservation has been cancelled as requested. We hope to welcome you another time.',
  }[r.status] || `Your reservation status has been updated to: ${statusLabel(r.status)}.`;
  return {
    to: r.email,
    subject: `Reservation ${r.reference}: ${statusLabel(r.status)} — DE DON`,
    html: layout(`Dear ${r.first_name},`, p(esc(intro)) + (extraMessage ? p(esc(extraMessage)) : '') + summaryTable(r)),
    related: r.reference,
  };
}

export function hotelChangeEmail(r, kind, message) {
  return {
    to: config.notifyEmail,
    subject: `Guest ${kind} — ${r.reference}`,
    html: layout(`Guest ${kind}`, p(`${esc(r.first_name)} ${esc(r.last_name)} (${esc(r.email)})`) + (message ? p(esc(message)) : '') + summaryTable(r)),
    related: r.reference,
  };
}

export function enquiryEmails(e) {
  const c = getContent();
  const to = e.type === 'event' ? (c.hotel.eventsEmail || config.notifyEmail) : config.notifyEmail;
  const validTo = /^[^\s@\[\]]+@[^\s@\[\]]+\.[^\s@\[\]]+$/.test(to || '') ? to : config.notifyEmail;
  return [
    { to: e.email, subject: 'Thank you for contacting DE DON', html: layout(`Thank you, ${e.name}.`, p('We have received your message and a member of our team will be in touch shortly.')), related: `enquiry:${e.id}` },
    { to: validTo, subject: `New ${e.type} enquiry from ${e.name}`, html: layout(`New ${e.type} enquiry`, p(`${esc(e.name)} · ${esc(e.email)} · ${esc(e.phone)}`) + p(`<strong>${esc(e.subject)}</strong>`) + p(esc(e.message).replace(/\n/g, '<br>'))), related: `enquiry:${e.id}` },
  ];
}
