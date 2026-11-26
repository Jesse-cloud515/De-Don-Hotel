// Database layer: SQLite through Node's built-in driver (node:sqlite), so no install is needed.
// Tables are created automatically on first start and filled from server/seed/*.json.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.js';

const dbFile = path.resolve(ROOT, process.env.DB_FILE || 'data/dedon-hotel.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  description TEXT DEFAULT '',
  size_sqm REAL,
  bed TEXT DEFAULT '',
  view TEXT DEFAULT '',
  max_adults INTEGER NOT NULL DEFAULT 2,
  max_children INTEGER NOT NULL DEFAULT 0,
  base_price REAL,
  price_note TEXT DEFAULT '',
  units INTEGER NOT NULL DEFAULT 0,
  amenities TEXT DEFAULT '[]',
  policies TEXT DEFAULT '[]',
  images TEXT DEFAULT '[]',
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  placeholder INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS room_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  units INTEGER,
  reason TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  room_name TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  nights INTEGER NOT NULL,
  adults INTEGER NOT NULL,
  children INTEGER NOT NULL DEFAULT 0,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT DEFAULT '',
  arrival_time TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  requests TEXT DEFAULT '',
  nightly_rate REAL,
  total REAL,
  currency TEXT DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending',
  change_request TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  source TEXT DEFAULT 'website',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_res_dates ON reservations(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  message TEXT DEFAULT '',
  meta TEXT DEFAULT '{}',
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'reception',
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT DEFAULT '',
  related TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_email TEXT,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

const SEED_DIR = path.join(ROOT, 'server', 'seed');

// ---------- content (all editable website text and images) ----------
export function getContent() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('content');
  return row ? JSON.parse(row.value) : null;
}
export function saveContent(content) {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('content', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(JSON.stringify(content));
}

// ---------- rooms ----------
const JSON_ROOM_FIELDS = ['amenities', 'policies', 'images'];
export function parseRoom(r) {
  if (!r) return r;
  const out = { ...r };
  for (const f of JSON_ROOM_FIELDS) {
    try { out[f] = JSON.parse(r[f] || '[]'); } catch { out[f] = []; }
  }
  out.active = !!r.active;
  out.placeholder = !!r.placeholder;
  return out;
}
export const ROOM_COLUMNS = ['slug', 'name', 'tagline', 'description', 'size_sqm', 'bed', 'view', 'max_adults', 'max_children',
  'base_price', 'price_note', 'units', 'amenities', 'policies', 'images', 'sort', 'active', 'placeholder'];

export function insertRoom(room) {
  const vals = ROOM_COLUMNS.map((c) => {
    const v = room[c];
    if (JSON_ROOM_FIELDS.includes(c)) return JSON.stringify(v || []);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v === undefined ? null : v;
  });
  const sql = `INSERT INTO rooms (${ROOM_COLUMNS.join(',')}) VALUES (${ROOM_COLUMNS.map(() => '?').join(',')})`;
  return db.prepare(sql).run(...vals).lastInsertRowid;
}

export function seedIfEmpty() {
  if (!getContent()) {
    const content = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'content.json'), 'utf8'));
    delete content._note;
    saveContent(content);
    console.log('[db] Seeded default website content.');
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
  if (!count) {
    const rooms = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'rooms.json'), 'utf8'));
    rooms.forEach(insertRoom);
    console.log(`[db] Seeded ${rooms.length} demo room categories.`);
  }
}

export function audit(user, action, detail = '', ip = '') {
  db.prepare('INSERT INTO audit_log (user_id, user_email, action, detail, ip) VALUES (?,?,?,?,?)')
    .run(user?.id ?? null, user?.email ?? '', action, String(detail).slice(0, 1000), ip);
}

export { dbFile };
