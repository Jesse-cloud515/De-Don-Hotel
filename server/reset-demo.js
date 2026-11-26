// Restores the default demo content and rooms from server/seed/ (reservations and users are kept).
// Usage: npm run reset-demo
import './env.js';
import { db, seedIfEmpty } from './db.js';

const args = process.argv.slice(2);
db.exec("DELETE FROM settings WHERE key = 'content'");
if (args.includes('--rooms')) db.exec('DELETE FROM rooms');
seedIfEmpty();
console.log('Demo content restored.' + (args.includes('--rooms') ? ' Rooms restored.' : ' (Add --rooms to also restore room categories.)'));
