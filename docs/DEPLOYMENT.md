# Deployment Guide

DE DON runs as a single Node.js process with a SQLite database file. Any host that can run Node.js 22.13+ and keep files on disk will work.

## Option A: a virtual server (recommended)

For example a DigitalOcean, Hetzner, AWS Lightsail or Linode VPS running Ubuntu 24.04, from about $6/month.

### 1. Install Node.js and copy the project

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs caddy
sudo mkdir -p /srv/dedon && sudo chown $USER /srv/dedon
# copy the project folder (without data/ and node_modules/) to /srv/dedon, e.g. with scp or git
cd /srv/dedon && cp .env.example .env && nano .env
```

Production `.env`:

```
PORT=3100
NODE_ENV=production
TRUST_PROXY=true   # only behind Nginx / Render / Cloudflare; leave out if Node faces the internet directly
SITE_URL=https://www.yourdomain.com
ADMIN_EMAIL=you@yourdomain.com
ADMIN_PASSWORD=<long unique password; change it after first sign-in>
RESEND_API_KEY=<from resend.com>
EMAIL_FROM=DE DON Reservations <reservations@yourdomain.com>
RESERVATIONS_NOTIFY_EMAIL=reservations@yourdomain.com
```

### 2. Keep it running (systemd)

`/etc/systemd/system/dedon.service`:

```ini
[Unit]
Description=DE DON website
After=network.target

[Service]
WorkingDirectory=/srv/dedon
ExecStart=/usr/bin/node server/server.js
Restart=always
User=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data /srv/dedon/data /srv/dedon/public/uploads
sudo systemctl enable --now dedon
sudo journalctl -u dedon -f        # view logs
```

### 3. Domain and SSL (Caddy)

1. At your domain registrar, create **A records** for `yourdomain.com` and `www.yourdomain.com` pointing to the server's IP address.
2. `/etc/caddy/Caddyfile`:

```
yourdomain.com {
  redir https://www.yourdomain.com{uri}
}
www.yourdomain.com {
  encode gzip
  reverse_proxy localhost:3100
}
```

3. `sudo systemctl reload caddy`. Caddy obtains and renews HTTPS certificates automatically.

### 4. Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Port 3100 stays private; only Caddy is exposed.

## Option B: managed platforms

Render, Railway or Fly.io work if you attach a **persistent disk** mounted at `/srv/dedon/data` (and `public/uploads`). Without a persistent disk, reservations and uploads are lost on every deploy. Start command: `node server/server.js`.

## Email

1. Create a free account at <https://resend.com>, add and verify your domain (it gives you DNS records to add).
2. Put the API key in `RESEND_API_KEY` and a verified sender in `EMAIL_FROM`.
3. Restart. New emails will show **Sent** in Admin → Emails.

To use another provider, change `sendEmail()` in `server/mail.js`. It is about 20 lines.

## Backups

All bookings and content live in `data/dedon-hotel.sqlite`; uploaded photos are in `public/uploads/`.

Daily backup with a safe online copy (cron):

```bash
sudo apt-get install -y sqlite3
crontab -e
# 02:30 every day: snapshot DB + uploads, keep 30 days
30 2 * * * mkdir -p /srv/backups && sqlite3 /srv/dedon/data/dedon-hotel.sqlite ".backup '/srv/backups/db-$(date +\%F).sqlite'" && tar czf /srv/backups/uploads-$(date +\%F).tgz -C /srv/dedon/public uploads && find /srv/backups -mtime +30 -delete
```

Copy `/srv/backups` off the server as well (e.g. `rclone` to Google Drive or S3). **Test a restore** at least once: stop the service, replace the `.sqlite` file, start it again.

## Analytics

Set `PLAUSIBLE_DOMAIN=yourdomain.com` after creating the site at <https://plausible.io>. It is cookieless, so no consent banner is needed. For Google Analytics, add its script to the pages and update the `script-src` / `connect-src` entries of the Content-Security-Policy in `server/server.js`, plus the privacy policy.

## Search engines

- `robots.txt` blocks `/admin/` and `/api/`. After launch, change its last line to the full URL: `Sitemap: https://www.yourdomain.com/sitemap.xml`.
- The sitemap is generated automatically at `/sitemap.xml`, including every published room.
- Submit the sitemap in Google Search Console and Bing Webmaster Tools.
- Create or claim the **Google Business Profile** for the hotel, using the same name, address and phone as the website.

## Online payments (future)

The site is deliberately enquiry-based. When the hotel chooses a provider (Paystack and Flutterwave are common in Nigeria; Stripe for international cards), the recommended approach is:

1. Add a payment link or checkout step **after** staff confirm a reservation, sent in the confirmation email.
2. Record payment status on the reservation from the provider's webhook. Never trust the browser's redirect alone.
3. Update the Terms page with deposit, cancellation and refund rules.

## Connecting a property-management system later

The availability logic is isolated in `server/booking.js` (`roomAvailability`, `searchAvailability`). To use a PMS or channel manager (e.g. Opera, Cloudbeds, eZee), replace those functions with calls to the PMS API and push confirmed reservations to it. The website and dashboard can stay unchanged.

## Moving to PostgreSQL (optional)

SQLite comfortably handles a single hotel's traffic. If the hotel later needs several servers, port `server/db.js` to PostgreSQL; the SQL used is standard and all queries are parameterised.

## Pre-launch checklist

- [ ] All placeholders replaced (see the manual, section 2) and **Settings → Show placeholder markers** turned off
- [ ] Demo announcement turned off
- [ ] Real photographs uploaded; no stand-in photography left
- [ ] Privacy policy and Terms reviewed by a lawyer
- [ ] `NODE_ENV=production`, `SITE_URL` set (used for canonical links, sitemap and robots.txt), `TRUST_PROXY=true` behind a proxy, HTTPS working
- [ ] Email sending verified (send a test reservation)
- [ ] Default/admin password changed; staff accounts created with the right roles
- [ ] Backups running and a restore tested
- [ ] Sitemap submitted to Google Search Console
