# DE DON Website Manual

A guide for hotel staff to managing the website and reservations through the dashboard. No coding is needed.

**Dashboard address:** `https://<your-domain>/admin/` (locally: <http://localhost:3100/admin/>)

---

## 1. Signing in and roles

Sign in with your email and password. Sessions last 12 hours. After five wrong passwords, sign-in is blocked for 15 minutes.

| Role | Can use |
|---|---|
| **Administrator** | Everything, including users and the activity log |
| **Manager** | Overview, reservations, enquiries, rooms, website content, media, newsletter, emails |
| **Front desk** | Overview, reservations, enquiries |

Change your own password under **My account** (bottom of the sidebar). Administrators add staff under **Users & roles**. Give each person their own account; never share one.

---

## 2. Before launch: replacing the demo content

The site is filled with **sample content**: address, phone numbers, venue and chef names, capacities, distances, reviews, prices and stand-in photographs. Replace each item with the hotel's real information:

1. **Page text and photos**: edit the HTML files in `public/`, following **docs/EDITING-GUIDE.md**.
2. **Rooms & availability**: for each real room category, enter the name, description, size, bed, occupancy, rate, **inventory** (number of rooms), policies and photographs. Delete or hide (untick **Published**) the categories you do not use.
3. **Website settings → Hotel information**: the details used in confirmation emails and search-engine data.
4. **Website settings → Announcements**: turn off the "Demo website" announcement.
5. **Guest reviews** (in `index.html`): replace the sample reviews with genuine ones, published with the guest's permission.
6. Have the **Privacy policy** and **Terms** pages (`public/privacy.html`, `public/terms.html`) reviewed by the hotel's legal adviser.

---

## 3. Reservations

### How a reservation request works

1. The guest picks dates and guests. The website shows only room categories that have free inventory on **every night** of the stay and fit the party size.
2. The guest selects a room, enters their details and submits a **request**.
3. The guest sees a reference (e.g. `DD-7KQ4MX`) and receives a "request received — not yet confirmed" email.
4. The request appears in **Reservations** with status **Pending**. Pending requests count against inventory, so the room cannot be double-requested.
5. Staff review it and change the status to **Confirmed** or **Rejected**. With *Email the guest* ticked, the guest is notified. Add a message for payment instructions or arrival details.

**No payment is taken online.** Prices shown are estimates (rate × nights) until the hotel confirms. Payments are arranged by the reservations team until a payment provider is connected (see DEPLOYMENT.md).

### Statuses

| Status | Meaning | Holds a room? |
|---|---|---|
| Pending | Request received, awaiting the hotel | Yes |
| Confirmed | Accepted by the hotel | Yes |
| Checked in | Guest is in house | Yes |
| Checked out | Stay completed | No |
| Rejected | Hotel could not accommodate | No |
| Cancelled | Cancelled by guest or hotel | No |
| No-show | Guest did not arrive | No |

The system refuses a change that would overbook a room, for example re-confirming a cancelled reservation when the room is now full.

### Day-to-day tasks

- **Find a reservation:** search by reference, name, email or phone. Use the **Arrivals**, **Departures** and **In house** buttons for the next 7 days.
- **Open a reservation:** click its row to see guest details, special requests, emails sent and internal notes.
- **Guest change requests:** guests can request changes under *Manage a reservation* on the website. These appear highlighted. Handle them, then click **Mark as handled**.
- **Guest cancellations:** guests can cancel online before the arrival date; the status changes to Cancelled automatically and you receive an alert.
- **Phone, email or walk-in bookings:** **New reservation** records them, with an optional agreed total.
- **Export:** **Export CSV** downloads the current filtered list for Excel or Google Sheets.

---

## 4. Rooms & availability

- **Inventory** is the number of physical rooms in a category. Availability = inventory − closures − Pending/Confirmed/Checked-in reservations, checked night by night.
- **Rate per night**: leave empty to show "Rate on request".
- **Published**: untick to hide a room from the website and from booking without deleting it.
- **Closures & blocked dates**: block rooms for maintenance or group holds. The *Until* date is the first night the room is available again. Leave *Rooms* empty to close the whole category.
- **Photographs**: the first photo is the main image. Use ↑ to reorder.
- **URL name (slug)**: the room page address, `/rooms/<slug>`. Avoid changing it after launch, because existing links would break.

---

## 5. Website settings and photos

Page text and photos are edited in the HTML files (see **docs/EDITING-GUIDE.md**). The **Website settings** screen holds only:

- **Settings**: currency, maximum nights per online request.
- **Hotel information**: name, address, phone and emails used in reservation emails and search-engine data.
- **Announcements**: the bar at the top of every page (the first active one is shown).
- **SEO & sharing**: default description and social-sharing image.

Click **Publish changes** to save; changes are live immediately.

To use your own photos, upload them in **Media library** and click **Copy URL**, then paste that address into an HTML file or a room's photo list.

### Photography guidelines

- Landscape, at least **2000 px** wide (hero images 2400 px+), JPG or WebP, under 9 MB.
- Show the actual property. Natural light, straight verticals, uncluttered rooms.
- Fill in the gallery **Description** for every image. It is read by screen readers and search engines.

---

## 6. Enquiries, newsletter and emails

- **Enquiries**: contact, table-reservation and event enquiries from the website. Set them to *In progress* or *Closed* as you work through them. Click the guest's email to reply.
- **Newsletter**: subscribers from the footer form. **Export CSV** to import into your email marketing tool.
- **Emails**: every email the system generated, with its status:
  - **Sent**: delivered to the email provider.
  - **Stored**: not sent, because email delivery is not configured. Click it to read the content.
  - **Failed**: the provider rejected it. The error is shown.

---

## 7. Analytics (Overview)

| Figure | How it is calculated |
|---|---|
| Awaiting confirmation | Pending requests |
| Arrivals / departures | Next 7 days |
| Occupancy | Confirmed and in-house room-nights for the next 30 nights ÷ (total inventory × 30) |
| Confirmed booking value | Estimated totals of confirmed and in-house reservations. **Not payments received** |
| Completed stays value | Estimated totals of checked-out reservations |
| Weekly trend | Reservation requests received per week |

All figures come only from data recorded in this system.

---

## 8. Security and privacy good practice

- Use a long, unique password, and never share accounts.
- Disable accounts for staff who leave (**Users & roles → Disable**).
- Guest data is personal data. Do not export it unless needed, and delete exports when you are done.
- The **Activity log** records sign-ins and every change made in the dashboard.
