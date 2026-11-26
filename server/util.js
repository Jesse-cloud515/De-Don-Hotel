// Shared helpers: HTTP errors and input validation.
export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trim and length-limit a string field. */
export function str(v, max = 200) {
  return String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

/** Validate required fields; throws 422 with per-field messages. */
export function requireFields(obj, rules) {
  const errors = {};
  for (const [key, rule] of Object.entries(rules)) {
    const v = str(obj[key], rule.max || 200);
    if (rule.required && !v) errors[key] = rule.message || 'This field is required.';
    else if (v && rule.email && !EMAIL_RE.test(v)) errors[key] = 'Enter a valid email address.';
    else if (v && rule.phone && !/^[+()\d\s-]{7,20}$/.test(v)) errors[key] = 'Enter a valid phone number.';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields.', errors);
}

export function csv(rows, columns) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula-injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => c.label).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))].join('\r\n');
}

/**
 * The visitor's IP address, used for rate limiting and the activity log.
 * X-Forwarded-For can be faked by anyone, so it is only trusted when TRUST_PROXY=true
 * (set this when the site runs behind a reverse proxy such as Nginx, Render or Cloudflare).
 */
export function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
