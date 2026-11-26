// Loads SAMPLE reservations, enquiries and newsletter subscribers so the dashboard can be explored.
// Every sample record is tagged (reservations: source = 'sample'; enquiries/subscribers: @example.com addresses).
//
//   npm run sample-data             add sample records (skips if they already exist)
//   npm run sample-data -- --remove delete all sample records
import './env.js';
import { db, parseRoom } from './db.js';
import { todayAbuja, addDays, nightsBetween, newReference, roomAvailability } from './booking.js';

if (process.argv.includes('--remove')) {
  const r = db.prepare("DELETE FROM reservations WHERE source = 'sample'").run().changes;
  const e = db.prepare("DELETE FROM enquiries WHERE email LIKE '%@example.com'").run().changes;
  const s = db.prepare("DELETE FROM subscribers WHERE email LIKE '%@example.com'").run().changes;
  console.log(`Removed ${r} sample reservations, ${e} enquiries, ${s} subscribers.`);
  process.exit(0);
}
if (db.prepare("SELECT COUNT(*) n FROM reservations WHERE source = 'sample'").get().n) {
  console.log('Sample data is already loaded. Run "npm run sample-data -- --remove" first to reload it.');
  process.exit(0);
}

const rooms = Object.fromEntries(db.prepare('SELECT * FROM rooms').all().map(parseRoom).map((r) => [r.slug, r]));
const pick = (slug) => rooms[slug] || Object.values(rooms)[0];
const T = todayAbuja();

// [first, last, country, roomSlug, checkInOffsetDays, nights, adults, children, status, purpose, requests, createdDaysAgo]
const GUESTS = [
  ['Adaeze', 'Okafor', 'Nigeria', 'executive-room', 2, 3, 1, 0, 'pending', 'Business', 'Airport pickup at 18:30, please.', 1],
  ['James', 'Whitmore', 'United Kingdom', 'deluxe-room', 4, 5, 2, 0, 'pending', 'Leisure', '', 0],
  ['Fatima', 'Bello', 'Nigeria', 'junior-suite', 1, 2, 2, 1, 'confirmed', 'Event or celebration', 'Celebrating our 10th anniversary.', 9],
  ['Kwame', 'Mensah', 'Ghana', 'executive-room', 0, 4, 1, 0, 'confirmed', 'Business', 'Late arrival around 23:00.', 12],
  ['Chiamaka', 'Eze', 'Nigeria', 'deluxe-room', -2, 4, 2, 0, 'checked_in', 'Leisure', '', 20],
  ['Henrik', 'Larsen', 'Norway', 'de-don-suite', -1, 3, 2, 0, 'checked_in', 'Official / diplomatic', 'Security briefing on arrival; quiet floor.', 25],
  ['Ibrahim', 'Musa', 'Nigeria', 'deluxe-room', -6, 3, 1, 0, 'checked_out', 'Business', '', 30],
  ['Sophie', 'Laurent', 'France', 'junior-suite', -10, 4, 2, 0, 'checked_out', 'Leisure', 'Vegetarian breakfast.', 40],
  ['Tunde', 'Adeyemi', 'Nigeria', 'executive-room', -15, 2, 1, 0, 'checked_out', 'Business', '', 33],
  ['Grace', 'Nwosu', 'Nigeria', 'deluxe-room', 9, 2, 2, 2, 'confirmed', 'Leisure', 'Cot for the youngest, please.', 6],
  ['Daniel', 'Okoro', 'Nigeria', 'de-don-suite', 14, 3, 2, 0, 'pending', 'Event or celebration', 'Proposal dinner — can you arrange flowers?', 2],
  ['Amina', 'Yusuf', 'Nigeria', 'executive-room', 6, 1, 1, 0, 'rejected', 'Business', '', 15],
  ['Peter', 'Schmidt', 'Germany', 'deluxe-room', 20, 4, 2, 0, 'cancelled', 'Leisure', '', 18],
  ['Ngozi', 'Obi', 'Nigeria', 'junior-suite', 25, 3, 2, 0, 'confirmed', 'Official / diplomatic', '', 4],
  ['Lucas', 'Silva', 'Brazil', 'deluxe-room', -20, 2, 2, 0, 'no_show', 'Leisure', '', 50],
  ['Halima', 'Garba', 'Nigeria', 'executive-room', 30, 5, 1, 0, 'pending', 'Business', 'Need a desk printer if possible.', 0],
];

const insert = db.prepare(`INSERT INTO reservations (reference, room_id, room_name, check_in, check_out, nights, adults, children,
  first_name, last_name, email, phone, country, arrival_time, purpose, requests, nightly_rate, total, currency, status, internal_notes, source, created_at, updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NGN',?,?, 'sample', datetime('now', ?), datetime('now', ?))`);

let added = 0, skipped = 0;
for (const [first, last, country, slug, off, nights, adults, children, status, purpose, requests, ago] of GUESTS) {
  const room = pick(slug);
  const ci = addDays(T, off), co = addDays(ci, nights);
  // Respect inventory for reservations that hold a room, so the sample data never overbooks.
  if (['pending', 'confirmed', 'checked_in'].includes(status) && !roomAvailability(room, ci, co).available) { skipped++; continue; }
  const rate = room.base_price ?? null;
  insert.run(newReference(), room.id, room.name, ci, co, nightsBetween(ci, co), adults, children, first, last,
    `${first}.${last}@example.com`.toLowerCase(), `+234 800 000 ${String(1000 + added).slice(-4)}`, country,
    ['14:00', '16:30', '19:00', '22:00'][added % 4], purpose, requests, rate, rate == null ? null : rate * nights, status,
    status === 'confirmed' ? 'Confirmed by phone. (sample record)' : 'Sample record', `-${ago} days`, `-${Math.max(0, ago - 1)} days`);
  added++;
}

const enq = db.prepare("INSERT INTO enquiries (type, name, email, phone, subject, message, meta, status, created_at) VALUES (?,?,?,?,?,?,?,?, datetime('now', ?))");
enq.run('event', 'Oluwaseun Ajayi', 'o.ajayi@example.com', '+234 800 000 2001', 'Event enquiry', 'We are planning an annual conference for about 250 delegates in March and would like a proposal including AV and lunch.', JSON.stringify({ company: 'Sample Energy Ltd', eventType: 'Conferences', guests: '250' }), 'new', '-1 days');
enq.run('dining', 'Rachel Adams', 'rachel.adams@example.com', '+234 800 000 2002', 'Table reservation', 'Table for four on Friday evening, ideally by the window.', JSON.stringify({ company: 'The Aso Room', date: addDays(T, 3), time: '19:30', partySize: '4' }), 'in_progress', '-2 days');
enq.run('event', 'Blessing Chukwu', 'blessing.chukwu@example.com', '+234 800 000 2003', 'Event enquiry', 'Wedding reception for 400 guests. Could we view the Grand Ballroom next week?', JSON.stringify({ eventType: 'Wedding receptions', guests: '400', eventDate: addDays(T, 120) }), 'new', '-0 days');
enq.run('contact', 'Michael Brown', 'm.brown@example.com', '', 'Reservations', 'Do you offer corporate rates for monthly stays?', '{}', 'closed', '-8 days');

const sub = db.prepare("INSERT OR IGNORE INTO subscribers (email, created_at) VALUES (?, datetime('now', ?))");
['amaka.n@example.com', 'traveller.one@example.com', 'events.planner@example.com', 'j.doe@example.com', 'abuja.foodie@example.com', 'k.osei@example.com']
  .forEach((e, i) => sub.run(e, `-${i * 3} days`));

console.log(`Sample data loaded: ${added} reservations${skipped ? ` (${skipped} skipped — no inventory)` : ''}, 4 enquiries, 6 subscribers.`);
