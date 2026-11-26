// Search-engine files: sitemap.xml, robots.txt and hotel structured data (schema.org).
import { db, getContent } from './db.js';
import { config } from './env.js';

const PAGES = ['/', '/accommodation', '/dining', '/experiences', '/meetings-events', '/gallery', '/about', '/contact', '/reservations', '/privacy', '/terms'];

export function sitemap() {
  const rooms = db.prepare('SELECT slug, updated_at FROM rooms WHERE active = 1').all();
  const urls = [
    ...PAGES.map((p) => ({ loc: config.siteUrl + p, priority: p === '/' ? '1.0' : ['/privacy', '/terms'].includes(p) ? '0.3' : '0.8' })),
    ...rooms.map((r) => ({ loc: `${config.siteUrl}/rooms/${r.slug}`, priority: '0.7', lastmod: (r.updated_at || '').slice(0, 10) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`;
}

export function robots() {
  return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
}

/** schema.org Hotel data for the home page, built from Admin → Website settings → Hotel information. */
export function hotelJsonLd() {
  const c = getContent() || {};
  const h = c.hotel || {};
  const real = (v) => (v && !/\[[^\]]+\]/.test(v) ? v : undefined);
  const img = c.seo?.ogImage;
  const data = {
    '@context': 'https://schema.org', '@type': 'Hotel',
    name: h.name, description: c.seo?.description, url: config.siteUrl + '/',
    image: img ? (img.includes('unsplash') ? img.split('?')[0] + '?auto=format&fit=crop&w=1200&q=75' : config.siteUrl + img) : undefined,
    telephone: real(h.phone), email: real(h.email),
    address: { '@type': 'PostalAddress', streetAddress: real(h.addressLine), addressLocality: h.city, addressRegion: h.region, postalCode: real(h.postcode), addressCountry: 'NG' },
    checkinTime: real(h.checkIn), checkoutTime: real(h.checkOut),
    priceRange: '₦₦₦',
  };
  if (h.latitude && h.longitude) data.geo = { '@type': 'GeoCoordinates', latitude: h.latitude, longitude: h.longitude };
  // "</" must not appear inside a <script> block.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
