// Admin authentication: scrypt password hashing, HttpOnly session cookies stored as hashes,
// login rate limiting, and role-based permissions.
import crypto from 'node:crypto';
import { db, audit } from './db.js';
import { config } from './env.js';

export const ROLES = {
  admin: { label: 'Administrator', perms: ['*'] },
  manager: { label: 'Manager', perms: ['stats', 'reservations', 'rooms', 'content', 'media', 'enquiries', 'subscribers', 'outbox'] },
  reception: { label: 'Front desk', perms: ['stats', 'reservations', 'enquiries'] },
};
export const can = (user, perm) => !!user && (ROLES[user.role]?.perms.includes('*') || ROLES[user.role]?.perms.includes(perm));

const COOKIE = 'dd_admin';
const TTL_MS = 12 * 60 * 60 * 1000;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { hash, salt };
}
export function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pass_hash, 'hex'));
}
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  return '';
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), user.id, Date.now() + TTL_MS);
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${config.production ? '; Secure' : ''}`);
}
export function destroySession(req, res) {
  const t = readCookie(req, COOKIE);
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
export function currentUser(req) {
  const t = readCookie(req, COOKIE);
  if (!t) return null;
  const row = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.active, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(sha(t));
  if (!row || !row.active || row.expires_at < Date.now()) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

// Simple in-memory login throttle: 5 failures per IP+email locks for 15 minutes.
const attempts = new Map();
export function loginBlocked(key) {
  const a = attempts.get(key);
  return a && a.count >= 5 && a.until > Date.now();
}
export function loginFailed(key) {
  const a = attempts.get(key) || { count: 0, until: 0 };
  a.count++; a.until = Date.now() + 15 * 60 * 1000;
  attempts.set(key, a);
}
export const loginSucceeded = (key) => attempts.delete(key);

export function ensureAdmin() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const n = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n;
  if (n) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@dedon.local').trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD || '';
  let generated = false;
  if (passwordProblem(password)) { password = crypto.randomBytes(9).toString('base64url') + '7a'; generated = true; }
  const { hash, salt } = hashPassword(password);
  db.prepare('INSERT INTO users (name, email, role, pass_hash, salt) VALUES (?,?,?,?,?)').run('Administrator', email, 'admin', hash, salt);
  audit(null, 'user.bootstrap', email);
  console.log('\n[auth] First administrator account created:');
  console.log(`       email:    ${email}`);
  if (generated) console.log(`       password: ${password}   (generated — shown only once; change it after signing in)`);
  else console.log('       password: (from ADMIN_PASSWORD in your .env file)');
  console.log('');
}
