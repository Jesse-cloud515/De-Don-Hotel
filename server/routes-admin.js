// Admin API. Every route (except login) requires a signed-in user with the right role permission.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, getContent, saveContent, parseRoom, insertRoom, ROOM_COLUMNS, audit } from './db.js';
import { ROOT } from './env.js';
import { HttpError, str, csv, EMAIL_RE } from './util.js';
import { ROLES, can, currentUser, createSession, destroySession, verifyPassword, hashPassword, passwordProblem, loginBlocked, loginFailed, loginSucceeded } from './auth.js';
import { ALL_STATUSES, ACTIVE_STATUSES, todayAbuja, addDays, roomAvailability, nightsBetween, quote, newReference } from './booking.js';
import { sendEmail, guestStatusEmail } from './mail.js';

const UPLOADS = path.join(ROOT, 'public', 'uploads');

function guard(perm, handler) {
  return (ctx) => {
    const user = currentUser(ctx.req);
    if (!user) throw new HttpError(401, 'Please sign in.');
    if (perm && !can(user, perm)) throw new HttpError(403, 'Your role does not have access to this section.');
    return handler({ ...ctx, user });
  };
}

const RES_COLUMNS = [
  { key: 'reference', label: 'Reference' }, { key: 'status', label: 'Status' }, { key: 'room_name', label: 'Room' },
  { key: 'check_in', label: 'Check-in' }, { key: 'check_out', label: 'Check-out' }, { key: 'nights', label: 'Nights' },
  { key: 'adults', label: 'Adults' }, { key: 'children', label: 'Children' }, { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' }, { key: 'nightly_rate', label: 'Nightly rate' }, { key: 'total', label: 'Estimated total' },
  { key: 'currency', label: 'Currency' }, { key: 'requests', label: 'Requests' }, { key: 'change_request', label: 'Change request' },
  { key: 'created_at', label: 'Created' },
];

function reservationQuery(q) {
  const where = [], args = [];
  const term = str(q.get('q'), 100);
  if (term) {
    where.push("(reference LIKE ? OR first_name || ' ' || last_name LIKE ? OR email LIKE ? OR phone LIKE ?)");
    args.push(...Array(4).fill(`%${term}%`));
  }
  const status = q.get('status');
  if (status && ALL_STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
  if (q.get('from')) { where.push('check_out > ?'); args.push(q.get('from')); }
  if (q.get('to')) { where.push('check_in <= ?'); args.push(q.get('to')); }
  const view = q.get('view');
  const today = todayAbuja();
  if (view === 'arrivals') { where.push("check_in >= ? AND check_in <= ? AND status IN ('pending','confirmed')"); args.push(today, addDays(today, 7)); }
  if (view === 'departures') { where.push("check_out >= ? AND check_out <= ? AND status IN ('confirmed','checked_in')"); args.push(today, addDays(today, 7)); }
  if (view === 'inhouse') { where.push("status = 'checked_in'"); }
  const order = view === 'arrivals' ? 'check_in ASC' : view === 'departures' ? 'check_out ASC' : 'created_at DESC';
  return { sql: `SELECT * FROM reservations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`, args };
}

function sanitizeRoom(b) {
  const r = {};
  r.name = str(b.name, 120);
  if (!r.name) throw new HttpError(422, 'Room name is required.', { name: 'Required.' });
  r.slug = (str(b.slug, 80) || r.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  r.tagline = str(b.tagline, 200);
  r.description = str(b.description, 6000);
  r.size_sqm = b.size_sqm === '' || b.size_sqm == null ? null : Number(b.size_sqm);
  r.bed = str(b.bed, 120); r.view = str(b.view, 120);
  r.max_adults = Math.max(1, Math.min(10, parseInt(b.max_adults) || 1));
  r.max_children = Math.max(0, Math.min(8, parseInt(b.max_children) || 0));
  r.base_price = b.base_price === '' || b.base_price == null ? null : Math.max(0, Number(b.base_price));
  r.price_note = str(b.price_note, 300);
  r.units = Math.max(0, Math.min(999, parseInt(b.units) || 0));
  const list = (v, max) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => str(x, max)).filter(Boolean).slice(0, 40);
  r.amenities = list(b.amenities, 120); r.policies = list(b.policies, 300); r.images = list(b.images, 600);
  r.sort = parseInt(b.sort) || 0;
  r.active = b.active ? 1 : 0;
  r.placeholder = b.placeholder ? 1 : 0;
  return r;
}

export function adminRoutes(route) {
  // ---------- session ----------
  route('POST', '/api/admin/login', ({ body, res, ip }) => {
    const email = str(body.email, 160).toLowerCase();
    const key = ip + '|' + email;
    if (loginBlocked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
    if (!user || !verifyPassword(String(body.password || ''), user)) {
      loginFailed(key); audit({ email }, 'login.failed', '', ip);
      throw new HttpError(401, 'Incorrect email or password.');
    }
    loginSucceeded(key);
    createSession(res, user);
    audit(user, 'login', '', ip);
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
  route('POST', '/api/admin/logout', ({ req, res }) => { destroySession(req, res); return { ok: true }; });
  route('GET', '/api/admin/me', guard(null, ({ user }) => ({ ...user, roleLabel: ROLES[user.role].label, perms: ROLES[user.role].perms })));
  route('POST', '/api/admin/me/password', guard(null, ({ user, body, ip }) => {
    const full = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(String(body.current || ''), full)) throw new HttpError(422, 'Current password is incorrect.');
    const problem = passwordProblem(body.next);
    if (problem) throw new HttpError(422, problem);
    const { hash, salt } = hashPassword(body.next);
    db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
    audit(user, 'user.password', '', ip);
    return { ok: true };
  }));

  // ---------- analytics ----------
  route('GET', '/api/admin/stats', guard('stats', () => {
    const today = todayAbuja(), in7 = addDays(today, 7), in30 = addDays(today, 30);
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM reservations GROUP BY status').all().map((r) => [r.status, r.n]));
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const monthStart = today.slice(0, 7) + '-01';

    // Occupancy for the next 30 nights, from confirmed/in-house reservations vs. configured inventory.
    const inventory = one('SELECT COALESCE(SUM(units),0) u FROM rooms WHERE active = 1').u;
    let bookedNights = 0;
    const res30 = db.prepare("SELECT check_in, check_out FROM reservations WHERE status IN ('confirmed','checked_in') AND check_in < ? AND check_out > ?").all(in30, today);
    for (const r of res30) {
      const s = r.check_in > today ? r.check_in : today, e = r.check_out < in30 ? r.check_out : in30;
      bookedNights += Math.max(0, nightsBetween(s, e));
    }
    const occupancy = inventory ? Math.round((bookedNights / (inventory * 30)) * 1000) / 10 : null;

    // Weekly trend (last 12 weeks), by request date.
    const trend = [];
    for (let i = 11; i >= 0; i--) {
      const start = addDays(today, -7 * i - 6), end = addDays(today, -7 * i);
      trend.push({ start, end, count: one('SELECT COUNT(*) n FROM reservations WHERE date(created_at) BETWEEN ? AND ?', start, end).n });
    }
    const byRoom = db.prepare(`SELECT room_name name, COUNT(*) n FROM reservations WHERE status NOT IN ('rejected','cancelled') GROUP BY room_name ORDER BY n DESC`).all();

    return {
      today, total, byStatus, byRoom, trend,
      thisMonth: one('SELECT COUNT(*) n FROM reservations WHERE date(created_at) >= ?', monthStart).n,
      pending: byStatus.pending || 0,
      arrivals: one("SELECT COUNT(*) n FROM reservations WHERE check_in BETWEEN ? AND ? AND status IN ('pending','confirmed')", today, in7).n,
      arrivalsToday: one("SELECT COUNT(*) n FROM reservations WHERE check_in = ? AND status IN ('pending','confirmed')", today).n,
      departures: one("SELECT COUNT(*) n FROM reservations WHERE check_out BETWEEN ? AND ? AND status IN ('confirmed','checked_in')", today, in7).n,
      inHouse: byStatus.checked_in || 0,
      inventory, occupancy, bookedNights,
      confirmedValue: one("SELECT COALESCE(SUM(total),0) v FROM reservations WHERE status IN ('confirmed','checked_in')").v,
      completedValue: one("SELECT COALESCE(SUM(total),0) v FROM reservations WHERE status = 'checked_out'").v,
      newEnquiries: one("SELECT COUNT(*) n FROM enquiries WHERE status = 'new'").n,
      subscribers: one('SELECT COUNT(*) n FROM subscribers').n,
      upcoming: db.prepare("SELECT reference, first_name, last_name, room_name, check_in, check_out, status FROM reservations WHERE check_in >= ? AND status IN ('pending','confirmed') ORDER BY check_in LIMIT 8").all(today),
    };
  }));

  // ---------- reservations ----------
  route('GET', '/api/admin/reservations', guard('reservations', ({ query }) => {
    const { sql, args } = reservationQuery(query);
    return db.prepare(sql + ' LIMIT 500').all(...args);
  }));
  route('GET', '/api/admin/reservations/export', guard('reservations', ({ query, user, ip }) => {
    const { sql, args } = reservationQuery(query);
    audit(user, 'reservations.export', query.toString(), ip);
    return { __raw: true, body: '﻿' + csv(db.prepare(sql).all(...args), RES_COLUMNS), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="dedon-reservations-${todayAbuja()}.csv"` } };
  }));
  route('GET', '/api/admin/reservations/:id', guard('reservations', ({ params }) => {
    const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(Number(params.id));
    if (!r) throw new HttpError(404, 'Reservation not found.');
    r.emails = db.prepare('SELECT id, to_addr, subject, status, created_at FROM outbox WHERE related = ? ORDER BY id DESC').all(r.reference);
    return r;
  }));
  route('PATCH', '/api/admin/reservations/:id', guard('reservations', async ({ params, body, user, ip }) => {
    const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(Number(params.id));
    if (!r) throw new HttpError(404, 'Reservation not found.');
    const sets = [], args = [];
    if (body.status !== undefined && body.status !== r.status) {
      if (!ALL_STATUSES.includes(body.status)) throw new HttpError(422, 'Unknown status.');
      if (ACTIVE_STATUSES.includes(body.status) && !ACTIVE_STATUSES.includes(r.status) && r.room_id) {
        const room = parseRoom(db.prepare('SELECT * FROM rooms WHERE id = ?').get(r.room_id));
        if (room && !roomAvailability(room, r.check_in, r.check_out, r.id).available)
          throw new HttpError(409, 'No inventory left for these dates — this would overbook the room.');
      }
      sets.push('status = ?'); args.push(body.status);
    }
    if (body.internal_notes !== undefined) { sets.push('internal_notes = ?'); args.push(str(body.internal_notes, 5000)); }
    if (body.clearChangeRequest) sets.push("change_request = ''");
    if (!sets.length) return r;
    db.prepare(`UPDATE reservations SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...args, r.id);
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(r.id);
    audit(user, 'reservation.update', `${r.reference}: ${r.status} → ${updated.status}`, ip);
    if (updated.status !== r.status && body.notifyGuest && ['confirmed', 'rejected', 'cancelled'].includes(updated.status))
      await sendEmail(guestStatusEmail(updated, str(body.message, 1500)));
    return updated;
  }));
  // Manual reservation (phone / walk-in), entered by staff.
  route('POST', '/api/admin/reservations', guard('reservations', ({ body, user, ip }) => {
    const room = parseRoom(db.prepare('SELECT * FROM rooms WHERE id = ?').get(Number(body.roomId)));
    if (!room) throw new HttpError(422, 'Choose a room.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.checkIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.checkOut || '') || body.checkOut <= body.checkIn)
      throw new HttpError(422, 'Check the dates.');
    if (!str(body.firstName) || !str(body.lastName) || !EMAIL_RE.test(str(body.email))) throw new HttpError(422, 'Name and a valid email are required.');
    const status = ALL_STATUSES.includes(body.status) ? body.status : 'confirmed';
    if (ACTIVE_STATUSES.includes(status) && !roomAvailability(room, body.checkIn, body.checkOut).available) throw new HttpError(409, 'No inventory left for these dates.');
    const nights = nightsBetween(body.checkIn, body.checkOut);
    const q = quote(room, nights);
    const total = body.total !== '' && body.total != null ? Number(body.total) : q.total;
    const ref = newReference();
    db.prepare(`INSERT INTO reservations (reference, room_id, room_name, check_in, check_out, nights, adults, children, first_name, last_name, email, phone, requests, nightly_rate, total, currency, status, source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref, room.id, room.name, body.checkIn, body.checkOut, nights, parseInt(body.adults) || 1, parseInt(body.children) || 0,
      str(body.firstName, 80), str(body.lastName, 80), str(body.email, 160).toLowerCase(), str(body.phone, 30) || '-', str(body.requests, 1500), q.nightly, total, getContent().settings.currency || 'NGN', status, str(body.source, 30) || 'phone');
    audit(user, 'reservation.create', ref, ip);
    return db.prepare('SELECT * FROM reservations WHERE reference = ?').get(ref);
  }));

  // ---------- rooms ----------
  route('GET', '/api/admin/rooms', guard('rooms', () =>
    db.prepare('SELECT * FROM rooms ORDER BY sort, id').all().map(parseRoom).map((r) => ({
      ...r, closures: db.prepare('SELECT * FROM room_closures WHERE room_id = ? AND end_date >= ? ORDER BY start_date').all(r.id, todayAbuja()),
    }))));
  route('POST', '/api/admin/rooms', guard('rooms', ({ body, user, ip }) => {
    const r = sanitizeRoom(body);
    if (db.prepare('SELECT 1 FROM rooms WHERE slug = ?').get(r.slug)) throw new HttpError(409, 'Another room already uses this URL name (slug).');
    const id = insertRoom(r);
    audit(user, 'room.create', r.name, ip);
    return parseRoom(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
  }));
  route('PUT', '/api/admin/rooms/:id', guard('rooms', ({ params, body, user, ip }) => {
    const id = Number(params.id);
    if (!db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(id)) throw new HttpError(404, 'Room not found.');
    const r = sanitizeRoom(body);
    if (db.prepare('SELECT 1 FROM rooms WHERE slug = ? AND id != ?').get(r.slug, id)) throw new HttpError(409, 'Another room already uses this URL name (slug).');
    const vals = ROOM_COLUMNS.map((c) => (['amenities', 'policies', 'images'].includes(c) ? JSON.stringify(r[c]) : r[c]));
    db.prepare(`UPDATE rooms SET ${ROOM_COLUMNS.map((c) => c + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
    audit(user, 'room.update', r.name, ip);
    return parseRoom(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
  }));
  route('DELETE', '/api/admin/rooms/:id', guard('rooms', ({ params, user, ip }) => {
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(Number(params.id));
    if (!room) throw new HttpError(404, 'Room not found.');
    const active = db.prepare(`SELECT COUNT(*) n FROM reservations WHERE room_id = ? AND status IN ('pending','confirmed','checked_in')`).get(room.id).n;
    if (active) throw new HttpError(409, `This room has ${active} active reservation(s). Deactivate it instead of deleting.`);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
    audit(user, 'room.delete', room.name, ip);
    return { ok: true };
  }));
  route('POST', '/api/admin/rooms/:id/closures', guard('rooms', ({ params, body, user, ip }) => {
    const id = Number(params.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date || '') || body.end_date <= body.start_date)
      throw new HttpError(422, 'Choose a valid date range (end date is the first night the room is available again).');
    const units = body.units === '' || body.units == null ? null : Math.max(1, parseInt(body.units));
    db.prepare('INSERT INTO room_closures (room_id, start_date, end_date, units, reason) VALUES (?,?,?,?,?)').run(id, body.start_date, body.end_date, units, str(body.reason, 200));
    audit(user, 'room.closure', `${id} ${body.start_date}→${body.end_date}`, ip);
    return { ok: true };
  }));
  route('DELETE', '/api/admin/closures/:id', guard('rooms', ({ params, user, ip }) => {
    db.prepare('DELETE FROM room_closures WHERE id = ?').run(Number(params.id));
    audit(user, 'room.closure.delete', params.id, ip);
    return { ok: true };
  }));

  // ---------- website content ----------
  route('GET', '/api/admin/content', guard('content', () => getContent()));
  route('PUT', '/api/admin/content', guard('content', ({ body, user, ip }) => {
    if (!body || typeof body !== 'object' || !body.hotel || !body.home || !body.settings) throw new HttpError(422, 'Content is incomplete.');
    saveContent(body);
    audit(user, 'content.update', '', ip);
    return { ok: true };
  }));

  // ---------- media library ----------
  route('GET', '/api/admin/media', guard('media', () => {
    fs.mkdirSync(UPLOADS, { recursive: true });
    return fs.readdirSync(UPLOADS).filter((f) => /\.(jpe?g|png|webp|avif|gif|mp4|webm)$/i.test(f))
      .map((f) => ({ name: f, url: '/uploads/' + f, size: fs.statSync(path.join(UPLOADS, f)).size, time: fs.statSync(path.join(UPLOADS, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
  }));
  route('POST', '/api/admin/media', guard('media', ({ body, user, ip }) => {
    const m = String(body.data || '').match(/^data:(image\/(jpeg|png|webp|avif|gif)|video\/(mp4|webm));base64,(.+)$/);
    if (!m) throw new HttpError(422, 'Upload a JPG, PNG, WebP, AVIF, GIF, MP4 or WebM file.');
    const buf = Buffer.from(m[4], 'base64');
    if (buf.length > 9e6) throw new HttpError(413, 'Files must be under 9 MB. Compress large photos before uploading.');
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }[m[1]];
    const base = str(body.name, 60).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
    const name = `${base}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.mkdirSync(UPLOADS, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    audit(user, 'media.upload', name, ip);
    return { name, url: '/uploads/' + name };
  }));
  route('DELETE', '/api/admin/media/:name', guard('media', ({ params, user, ip }) => {
    const name = path.basename(params.name);
    const file = path.join(UPLOADS, name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    audit(user, 'media.delete', name, ip);
    return { ok: true };
  }));

  // ---------- enquiries, subscribers, outbox ----------
  route('GET', '/api/admin/enquiries', guard('enquiries', () => db.prepare('SELECT * FROM enquiries ORDER BY id DESC LIMIT 500').all()));
  route('PATCH', '/api/admin/enquiries/:id', guard('enquiries', ({ params, body, user, ip }) => {
    if (!['new', 'in_progress', 'closed'].includes(body.status)) throw new HttpError(422, 'Unknown status.');
    db.prepare('UPDATE enquiries SET status = ? WHERE id = ?').run(body.status, Number(params.id));
    audit(user, 'enquiry.update', `${params.id} → ${body.status}`, ip);
    return { ok: true };
  }));
  route('GET', '/api/admin/subscribers', guard('subscribers', () => db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all()));
  route('GET', '/api/admin/subscribers/export', guard('subscribers', () => ({
    __raw: true, body: csv(db.prepare('SELECT email, created_at FROM subscribers ORDER BY id').all(), [{ key: 'email', label: 'Email' }, { key: 'created_at', label: 'Subscribed' }]),
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="dedon-subscribers.csv"' },
  })));
  route('DELETE', '/api/admin/subscribers/:id', guard('subscribers', ({ params, user, ip }) => {
    db.prepare('DELETE FROM subscribers WHERE id = ?').run(Number(params.id));
    audit(user, 'subscriber.delete', params.id, ip);
    return { ok: true };
  }));
  route('GET', '/api/admin/outbox', guard('outbox', () => db.prepare('SELECT id, to_addr, subject, status, error, related, created_at FROM outbox ORDER BY id DESC LIMIT 300').all()));
  route('GET', '/api/admin/outbox/:id', guard('outbox', ({ params }) => db.prepare('SELECT * FROM outbox WHERE id = ?').get(Number(params.id)) || {}));

  // ---------- users (administrators only) ----------
  route('GET', '/api/admin/users', guard('users', () => ({
    roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])),
    users: db.prepare('SELECT id, name, email, role, active, last_login, created_at FROM users ORDER BY id').all(),
  })));
  route('POST', '/api/admin/users', guard('users', ({ body, user, ip }) => {
    const email = str(body.email, 160).toLowerCase();
    if (!str(body.name) || !EMAIL_RE.test(email)) throw new HttpError(422, 'Name and a valid email are required.');
    if (!ROLES[body.role]) throw new HttpError(422, 'Choose a role.');
    const problem = passwordProblem(body.password);
    if (problem) throw new HttpError(422, problem);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'A user with this email already exists.');
    const { hash, salt } = hashPassword(body.password);
    db.prepare('INSERT INTO users (name, email, role, pass_hash, salt) VALUES (?,?,?,?,?)').run(str(body.name, 120), email, body.role, hash, salt);
    audit(user, 'user.create', `${email} (${body.role})`, ip);
    return { ok: true };
  }));
  route('PATCH', '/api/admin/users/:id', guard('users', ({ params, body, user, ip }) => {
    const id = Number(params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) throw new HttpError(404, 'User not found.');
    if (id === user.id && (body.active === false || (body.role && body.role !== 'admin'))) throw new HttpError(409, 'You cannot deactivate or demote your own account.');
    if (body.role !== undefined) { if (!ROLES[body.role]) throw new HttpError(422, 'Unknown role.'); db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id); }
    if (body.active !== undefined) {
      db.prepare('UPDATE users SET active = ? WHERE id = ?').run(body.active ? 1 : 0, id);
      if (!body.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (body.password) {
      const problem = passwordProblem(body.password);
      if (problem) throw new HttpError(422, problem);
      const { hash, salt } = hashPassword(body.password);
      db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    audit(user, 'user.update', target.email, ip);
    return { ok: true };
  }));
  route('GET', '/api/admin/audit', guard('users', () => db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all()));
}
