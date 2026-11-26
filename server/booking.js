// Reservation rules: date validation, availability from real inventory, price calculation, references.
// Availability is calculated only from the inventory (units) the hotel enters in the admin dashboard,
// minus closures and active reservations. Nothing is simulated.
import crypto from 'node:crypto';
import { db, parseRoom } from './db.js';

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'checked_in'];
export const ALL_STATUSES = ['pending', 'confirmed', 'rejected', 'cancelled', 'checked_in', 'checked_out', 'no_show'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Abuja (West Africa Time, UTC+1), as YYYY-MM-DD. */
export function todayAbuja() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function nightsBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
function isRealDate(s) {
  if (!DATE_RE.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

export function validateStay({ checkIn, checkOut, adults, children }, maxNights = 30) {
  const errors = {};
  const a = Number(adults), c = Number(children || 0);
  if (!isRealDate(checkIn)) errors.checkIn = 'Choose a valid arrival date.';
  else if (checkIn < todayAbuja()) errors.checkIn = 'Arrival date cannot be in the past.';
  else if (checkIn > addDays(todayAbuja(), 540)) errors.checkIn = 'Reservations open up to 18 months in advance.';
  if (!isRealDate(checkOut)) errors.checkOut = 'Choose a valid departure date.';
  else if (!errors.checkIn && checkOut <= checkIn) errors.checkOut = 'Departure must be after arrival.';
  else if (!errors.checkIn && nightsBetween(checkIn, checkOut) > maxNights)
    errors.checkOut = `For stays longer than ${maxNights} nights, please contact reservations.`;
  if (!Number.isInteger(a) || a < 1 || a > 10) errors.adults = 'Choose between 1 and 10 adults.';
  if (!Number.isInteger(c) || c < 0 || c > 8) errors.children = 'Choose between 0 and 8 children.';
  return { ok: !Object.keys(errors).length, errors, nights: errors.checkIn || errors.checkOut ? 0 : nightsBetween(checkIn, checkOut), adults: a, children: c };
}

/**
 * Returns { available, unitsLeft, reason } for one room over [checkIn, checkOut).
 * Checks every night individually against inventory, closures and active reservations.
 */
export function roomAvailability(room, checkIn, checkOut, excludeReservationId = null) {
  if (!room.active) return { available: false, unitsLeft: 0, reason: 'Not currently offered' };
  if (!room.units || room.units < 1) return { available: false, unitsLeft: 0, reason: 'Inventory not configured' };

  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const res = db.prepare(`SELECT id, check_in, check_out FROM reservations
      WHERE room_id = ? AND status IN (${placeholders}) AND check_in < ? AND check_out > ? AND id IS NOT ?`)
    .all(room.id, ...ACTIVE_STATUSES, checkOut, checkIn, excludeReservationId);
  const closures = db.prepare(`SELECT start_date, end_date, units FROM room_closures
      WHERE room_id = ? AND start_date < ? AND end_date > ?`).all(room.id, checkOut, checkIn);

  let minLeft = room.units;
  for (let night = checkIn; night < checkOut; night = addDays(night, 1)) {
    let closed = 0;
    for (const c of closures) if (c.start_date <= night && c.end_date > night) closed += c.units == null ? room.units : c.units;
    let booked = 0;
    for (const r of res) if (r.check_in <= night && r.check_out > night) booked++;
    minLeft = Math.min(minLeft, room.units - closed - booked);
  }
  minLeft = Math.max(0, minLeft);
  return { available: minLeft > 0, unitsLeft: minLeft, reason: minLeft > 0 ? '' : 'Fully reserved for these dates' };
}

export function fitsOccupancy(room, adults, children) {
  return adults <= room.max_adults && children <= room.max_children;
}

export function quote(room, nights) {
  if (room.base_price == null || room.base_price === '' || Number(room.base_price) <= 0) return { nightly: null, total: null };
  const nightly = Number(room.base_price);
  return { nightly, total: nightly * nights };
}

export function searchAvailability({ checkIn, checkOut, adults, children }) {
  const rooms = db.prepare('SELECT * FROM rooms WHERE active = 1 ORDER BY sort, id').all().map(parseRoom);
  const nights = nightsBetween(checkIn, checkOut);
  return rooms.map((room) => {
    const av = roomAvailability(room, checkIn, checkOut);
    const fits = fitsOccupancy(room, adults, children);
    const q = quote(room, nights);
    return {
      id: room.id, slug: room.slug, name: room.name, tagline: room.tagline, image: room.images[0] || '',
      size_sqm: room.size_sqm, bed: room.bed, max_adults: room.max_adults, max_children: room.max_children,
      placeholder: room.placeholder, price_note: room.price_note,
      available: av.available && fits,
      unitsLeft: av.unitsLeft,
      reason: !fits ? `Accommodates up to ${room.max_adults} adult${room.max_adults > 1 ? 's' : ''}${room.max_children ? ` and ${room.max_children} child${room.max_children > 1 ? 'ren' : ''}` : ''}` : av.reason,
      nights, nightly: q.nightly, total: q.total,
    };
  });
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReference() {
  for (;;) {
    const bytes = crypto.randomBytes(6);
    let s = '';
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    const ref = `DD-${s.slice(0, 3)}${s.slice(3)}`;
    if (!db.prepare('SELECT 1 FROM reservations WHERE reference = ?').get(ref)) return ref;
  }
}
