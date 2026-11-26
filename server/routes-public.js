// Public API used by the website: content, rooms, availability, reservation requests, enquiries, newsletter.
import { db, getContent, parseRoom } from './db.js';
import { HttpError, str, requireFields, EMAIL_RE } from './util.js';
import { validateStay, searchAvailability, roomAvailability, fitsOccupancy, quote, newReference, todayAbuja } from './booking.js';
import { sendEmail, guestRequestEmail, hotelNotifyEmail, hotelChangeEmail, guestStatusEmail, enquiryEmails, statusLabel } from './mail.js';

// Basic abuse protection for public forms: max 15 submissions per IP per 10 minutes.
const hits = new Map();
function throttle(ip, bucket, max = 15) {
  const key = bucket + ip, now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= max) throw new HttpError(429, 'Too many requests. Please wait a few minutes and try again.');
  list.push(now); hits.set(key, list);
}
// Honeypot field: real visitors never fill "website".
const isBot = (body) => !!str(body.website);

function publicRoom(r) {
  const { units, created_at, ...rest } = r;
  return rest;
}

function publicReservation(r) {
  return {
    reference: r.reference, room_name: r.room_name, check_in: r.check_in, check_out: r.check_out, nights: r.nights,
    adults: r.adults, children: r.children, first_name: r.first_name, last_name: r.last_name, total: r.total, nightly_rate: r.nightly_rate,
    currency: r.currency, status: r.status, status_label: statusLabel(r.status), change_request: r.change_request, created_at: r.created_at,
    can_cancel: ['pending', 'confirmed'].includes(r.status) && r.check_in > todayAbuja(),
  };
}

function findGuestReservation(body) {
  const ref = str(body.reference, 20).toUpperCase();
  const email = str(body.email, 160).toLowerCase();
  const r = db.prepare('SELECT * FROM reservations WHERE reference = ? AND lower(email) = ?').get(ref, email);
  if (!r) throw new HttpError(404, 'We could not find a reservation with that reference and email address.');
  return r;
}

export function publicRoutes(route) {
  route('GET', '/api/content', () => getContent());

  route('GET', '/api/rooms', () =>
    db.prepare('SELECT * FROM rooms WHERE active = 1 ORDER BY sort, id').all().map(parseRoom).map((r) => {
      const { nightly } = quote(r, 1);
      return { ...publicRoom(r), from_price: nightly };
    }));

  route('GET', '/api/rooms/:slug', ({ params }) => {
    const r = parseRoom(db.prepare('SELECT * FROM rooms WHERE slug = ? AND active = 1').get(params.slug));
    if (!r) throw new HttpError(404, 'Room not found.');
    return { ...publicRoom(r), from_price: quote(r, 1).nightly };
  });

  route('POST', '/api/availability', ({ body }) => {
    const c = getContent();
    const v = validateStay(body, c.settings.maxNights || 30);
    if (!v.ok) throw new HttpError(422, 'Please check your dates and guests.', v.errors);
    return { nights: v.nights, currency: c.settings.currency, rooms: searchAvailability({ ...body, adults: v.adults, children: v.children }) };
  });

  route('POST', '/api/reservations', async ({ body, ip }) => {
    throttle(ip, 'res', 10);
    if (isBot(body)) return { ok: true, reference: 'DD-000000' };
    const c = getContent();
    const v = validateStay(body, c.settings.maxNights || 30);
    if (!v.ok) throw new HttpError(422, 'Please check your dates and guests.', v.errors);
    requireFields(body, {
      firstName: { required: true, max: 80 }, lastName: { required: true, max: 80 },
      email: { required: true, email: true, max: 160 }, phone: { required: true, phone: true, max: 30 },
    });
    if (!body.consent) throw new HttpError(422, 'Please accept the privacy notice.', { consent: 'Required to process your request.' });

    // Re-check availability inside a write transaction so two guests cannot take the last room at once.
    db.exec('BEGIN IMMEDIATE');
    let reservation;
    try {
      const room = parseRoom(db.prepare('SELECT * FROM rooms WHERE id = ? AND active = 1').get(Number(body.roomId)));
      if (!room) throw new HttpError(422, 'Please choose a room.', { roomId: 'Please choose a room.' });
      if (!fitsOccupancy(room, v.adults, v.children)) throw new HttpError(422, `${room.name} cannot accommodate this number of guests.`);
      const av = roomAvailability(room, body.checkIn, body.checkOut);
      if (!av.available) throw new HttpError(409, `${room.name} is no longer available for these dates. Please choose another room or dates.`);
      const q = quote(room, v.nights);
      const ref = newReference();
      db.prepare(`INSERT INTO reservations (reference, room_id, room_name, check_in, check_out, nights, adults, children,
        first_name, last_name, email, phone, country, arrival_time, purpose, requests, nightly_rate, total, currency, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`).run(
        ref, room.id, room.name, body.checkIn, body.checkOut, v.nights, v.adults, v.children,
        str(body.firstName, 80), str(body.lastName, 80), str(body.email, 160).toLowerCase(), str(body.phone, 30),
        str(body.country, 80), str(body.arrivalTime, 20), str(body.purpose, 40), str(body.requests, 1500),
        q.nightly, q.total, c.settings.currency || 'NGN');
      db.exec('COMMIT');
      reservation = db.prepare('SELECT * FROM reservations WHERE reference = ?').get(ref);
    } catch (e) { db.exec('ROLLBACK'); throw e; }

    await sendEmail(guestRequestEmail(reservation));
    await sendEmail(hotelNotifyEmail(reservation));
    return { ok: true, reservation: publicReservation(reservation) };
  });

  route('POST', '/api/reservations/lookup', ({ body, ip }) => {
    throttle(ip, 'lookup', 20);
    return publicReservation(findGuestReservation(body));
  });

  route('POST', '/api/reservations/cancel', async ({ body, ip }) => {
    throttle(ip, 'lookup', 20);
    const r = findGuestReservation(body);
    if (!publicReservation(r).can_cancel) throw new HttpError(409, 'This reservation can no longer be cancelled online. Please contact reservations.');
    db.prepare("UPDATE reservations SET status = 'cancelled', updated_at = datetime('now'), internal_notes = internal_notes || ? WHERE id = ?")
      .run(`\n[${new Date().toISOString()}] Cancelled by guest online. ${str(body.reason, 500)}`, r.id);
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(r.id);
    await sendEmail(guestStatusEmail(updated));
    await sendEmail(hotelChangeEmail(updated, 'cancellation', str(body.reason, 500)));
    return publicReservation(updated);
  });

  route('POST', '/api/reservations/modify', async ({ body, ip }) => {
    throttle(ip, 'lookup', 20);
    const r = findGuestReservation(body);
    const message = str(body.message, 1500);
    if (!message) throw new HttpError(422, 'Tell us what you would like to change.', { message: 'Required.' });
    if (!['pending', 'confirmed'].includes(r.status)) throw new HttpError(409, 'This reservation can no longer be modified online.');
    db.prepare("UPDATE reservations SET change_request = ?, updated_at = datetime('now') WHERE id = ?").run(message, r.id);
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(r.id);
    await sendEmail(hotelChangeEmail(updated, 'modification request', message));
    return publicReservation(updated);
  });

  route('POST', '/api/enquiries', async ({ body, ip }) => {
    throttle(ip, 'enq');
    if (isBot(body)) return { ok: true };
    requireFields(body, {
      name: { required: true, max: 120 }, email: { required: true, email: true, max: 160 },
      phone: { phone: true, max: 30 }, message: { required: true, max: 4000 },
    });
    const type = ['contact', 'event', 'dining'].includes(body.type) ? body.type : 'contact';
    const meta = {};
    for (const k of ['eventType', 'eventDate', 'guests', 'date', 'time', 'partySize', 'company']) if (body[k]) meta[k] = str(body[k], 120);
    const id = db.prepare('INSERT INTO enquiries (type, name, email, phone, subject, message, meta) VALUES (?,?,?,?,?,?,?)')
      .run(type, str(body.name, 120), str(body.email, 160), str(body.phone, 30), str(body.subject, 200), str(body.message, 4000), JSON.stringify(meta)).lastInsertRowid;
    for (const m of enquiryEmails({ id, type, name: str(body.name, 120), email: str(body.email, 160), phone: str(body.phone, 30), subject: str(body.subject, 200) || type, message: str(body.message, 4000) + (Object.keys(meta).length ? '\n\n' + Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n') : '') }))
      await sendEmail(m);
    return { ok: true };
  });

  route('POST', '/api/newsletter', ({ body, ip }) => {
    throttle(ip, 'news');
    const email = str(body.email, 160).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(422, 'Enter a valid email address.', { email: 'Enter a valid email address.' });
    db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email);
    return { ok: true };
  });
}
