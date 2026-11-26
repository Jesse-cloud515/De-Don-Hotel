# DE DON — Luxury Hotel Website, Abuja

**An Exceptional Stay. An Extraordinary Experience.**

DE DON is the website for a luxury hotel in Maitama, Abuja, Nigeria. It combines an editorial, magazine-style public website with a working reservation system and a private dashboard for hotel staff.

Guests can explore the rooms, dining, wellness and event spaces, check live availability, and send a reservation request. Staff manage those requests, rooms, prices and availability from the dashboard.

> **Demo content.** Everything on the site is sample content: the address, phone numbers, venue names, capacities, prices and reviews. The photographs are stand-in images from [Unsplash](https://unsplash.com). Replace them with the hotel's real information before launch. See [docs/EDITING-GUIDE.md](docs/EDITING-GUIDE.md).

---

## What the website does

### For guests

| Page | What's on it |
|---|---|
| **Home** | Full-screen hero with a quick availability search, the hotel's story, a slider of rooms and suites, dining, experiences, events, guest reviews, location and map |
| **Accommodation** | Every room category with size, occupancy, bed type and starting price |
| **Room pages** (`/rooms/<name>`) | Photo gallery with a full-screen viewer, amenities, policies, and a booking panel that shows live availability and the estimated price |
| **Dining** | Restaurants and bar, signature dishes, private dining, and a table-request form |
| **Experiences** | Pool, spa, fitness, concierge, airport transfers and more |
| **Meetings & Events** | Venues with capacities, and an event enquiry form |
| **Gallery** | Filterable photo gallery with a full-screen viewer |
| **About** | The hotel's story and values |
| **Contact** | Contact details, map, directions and a contact form |
| **Reservations** | A four-step booking request, plus **Manage a reservation**, where guests can look up, change or cancel a request |
| **Privacy, Terms, 404** | Legal pages and a branded "page not found" |

### How booking works

1. The guest chooses dates and the number of guests.
2. The site shows only rooms that are free on **every night** of the stay and fit the party, with an estimated total.
3. The guest enters their details and sends a **reservation request**. They get a reference such as `DD-7KQ4MX` and a confirmation email.
4. Staff confirm or decline it in the dashboard, and the guest is emailed automatically.

Availability comes from the room inventory the hotel enters, so rooms can't be double-booked. No payment is taken online; the hotel arranges payment when confirming.

### For hotel staff: the dashboard (`/admin/`)

- **Overview:** arrivals, departures, guests in house, occupancy for the next 30 nights, booking trends.
- **Reservations:** search, filter, confirm or reject, add phone or walk-in bookings, export to CSV.
- **Rooms & availability:** room details, photos, nightly rates, number of rooms, and blocked dates for maintenance.
- **Enquiries and newsletter:** messages from the website forms and the subscriber list.
- **Emails:** a record of every email the system has sent.
- **Media library:** upload the hotel's own photos.
- **Website settings:** hotel details used in emails, and the announcement bar.
- **Users & roles:** Administrator, Manager and Front desk, each with its own permissions. An activity log records every change.

---

## Design

- **Look and feel:** editorial and understated, with large photography, generous white space and asymmetric layouts.
- **Colours:** Deep Midnight `#101B1B`, Warm Ivory `#F4F0E8`, Champagne Gold `#B99A64`, Stone Grey and Rich Charcoal. Gold is used sparingly, and text colours meet accessibility contrast standards.
- **Type:** Cormorant Garamond for headings, Manrope for body text.
- **Motion:** an opening logo animation, page-to-page transitions, headings that reveal line by line, image reveals and gentle parallax. All motion switches off for visitors who choose reduced motion in their device settings.
- **Mobile:** a full-screen menu, a sticky "Reserve your stay" bar, and touch-friendly galleries.

## Built with

- **Front end:** plain HTML, CSS and JavaScript, with no framework and no build step. All page text lives in the HTML files, with comments explaining how to edit it.
- **Back end:** Node.js (22.13 or newer) with its built-in HTTP server and SQLite database. There are **no dependencies**, so nothing needs installing with `npm install`.
- **Security:** hashed passwords, secure sessions, role-based access, rate limiting, input validation, a content security policy and protection against cross-site requests.
- **SEO:** clean addresses, canonical links, a sitemap, `robots.txt`, Open Graph tags and hotel structured data (schema.org).
- **Email (optional):** [Resend](https://resend.com). Without it, emails are stored in the dashboard instead of being sent.

---

## Run it locally

You need **Node.js 22.13 or newer** (<https://nodejs.org>).

```bash
git clone <your-repository-url> de-don-hotel
cd de-don-hotel
cp .env.example .env      # Windows: copy .env.example .env
npm start
```

Open <http://localhost:3100> for the website and <http://localhost:3100/admin/> for the dashboard.

On first start the server creates the database in `data/`, loads the demo rooms and content, and creates the first administrator. It uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`; if those are empty, it prints a one-time password in the terminal.

| Command | What it does |
|---|---|
| `npm start` | Run the site |
| `npm run dev` | Run the site, restarting when server files change |
| `npm run sample-data` | Add sample reservations and enquiries for exploring the dashboard (`-- --remove` deletes them) |
| `npm run reset-demo` | Restore the demo settings (`-- --rooms` also restores the demo rooms) |

**In VS Code:** open the folder, and the server starts by itself. Any preview (Live Preview, Live Server, Simple Browser) shows the working site.

## Project structure

```
public/          The website: one HTML file per page
  partials/      Header and footer shared by every page
  assets/        Stylesheet, scripts, logo
admin/           The staff dashboard
server/          Web server, booking rules, database, emails, security
  seed/          Demo rooms and settings loaded on first start
docs/            Guides (see below)
.env.example     Settings template: copy to .env
```

## Documentation

| Guide | For |
|---|---|
| [docs/EDITING-GUIDE.md](docs/EDITING-GUIDE.md) | Changing text and photos in the HTML |
| [docs/WEBSITE-MANUAL.md](docs/WEBSITE-MANUAL.md) | Hotel staff using the dashboard |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Putting the site online: server, domain, HTTPS, backups, email |
| [docs/BRAND-AND-DISCOVERY.md](docs/BRAND-AND-DISCOVERY.md) | Brand positioning, visual identity, sitemap, and the information the hotel must supply |

## Before going live

- Replace all demo text, prices and photos with verified hotel information.
- Set `NODE_ENV=production` and `SITE_URL`, and serve the site over HTTPS.
- Add a `RESEND_API_KEY` so emails are actually sent.
- Have the privacy policy and terms reviewed by a lawyer.
- Turn off the "Demo website" announcement in the dashboard.

Full checklist: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

*Photography in the demo is from [Unsplash](https://unsplash.com) and is used as stand-in imagery only.*
