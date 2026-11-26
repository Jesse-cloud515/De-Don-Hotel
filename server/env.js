// Loads settings from .env (and .env.local, if present) into process.env.
// Values already set in the real environment always win.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const name of ['.env', '.env.local']) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export const config = {
  port: Number(process.env.PORT) || 3100,
  siteUrl: (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${Number(process.env.PORT) || 3100}`).replace(/\/$/, ''),
  production: process.env.NODE_ENV === 'production',
  resendKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'DE DON Reservations <reservations@example.com>',
  notifyEmail: process.env.RESERVATIONS_NOTIFY_EMAIL || '',
  plausible: process.env.PLAUSIBLE_DOMAIN || process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || '',
};
