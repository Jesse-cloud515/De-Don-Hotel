// DE DON web server. Zero dependencies: Node's http module + built-in SQLite.
// Serves the public website (public/), the admin dashboard (admin/) and the JSON API (/api/...).
import './env.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, config } from './env.js';
import { db, seedIfEmpty, parseRoom } from './db.js';
import { ensureAdmin } from './auth.js';
import { publicRoutes } from './routes-public.js';
import { adminRoutes } from './routes-admin.js';
import { sitemap, robots, hotelJsonLd } from './seo.js';
import { HttpError, clientIp } from './util.js';

seedIfEmpty();
ensureAdmin();

// ---------------- tiny router ----------------
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler });
}
publicRoutes(route);
adminRoutes(route);

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req, limit) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Request too large.');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}

// ---------------- static files ----------------
const PUBLIC = path.join(ROOT, 'public');
const ADMIN = path.join(ROOT, 'admin');
const PARTIALS = path.join(PUBLIC, 'partials');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://images.unsplash.com https://upload.wikimedia.org",
  "media-src 'self' https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self' https://plausible.io",
  "connect-src 'self' https://plausible.io",
  "frame-src 'self' https://www.google.com https://maps.google.com",
  // In development, VS Code's preview panels (Live Preview, Simple Browser) may embed the site.
  config.production ? "frame-ancestors 'self'" : 'frame-ancestors *',
  "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  ...(config.production ? { 'X-Frame-Options': 'SAMEORIGIN', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};

function resolveStatic(urlPath) {
  // VS Code "Open with Live Server" uses addresses like /public/dining.html — send them to /dining.
  if (/^\/public(\/|$)/.test(urlPath)) {
    const clean = urlPath.slice(7).replace(/(index)?\.html$/, '').replace(/^\/room$/, '/accommodation') || '/';
    return { redirect: (clean.startsWith('/') ? '' : '/') + clean };
  }
  // Old-style addresses (/dining.html) redirect to the clean address (/dining) so each page has one URL.
  const htmlMatch = urlPath.match(/^\/([a-z0-9-]+)\.html$/);
  if (htmlMatch && !['404', 'room'].includes(htmlMatch[1])) return { redirect: htmlMatch[1] === 'index' ? '/' : '/' + htmlMatch[1] };
  if (urlPath === '/admin') return { redirect: '/admin/' };
  if (urlPath.startsWith('/admin/')) return { file: path.join(ADMIN, urlPath.slice(7) || 'index.html') };
  // The VS Code preview helper is linked with a relative path, so /rooms/<slug> asks for /rooms/assets/...
  if (urlPath.endsWith('/assets/js/vscode-preview.js')) return { file: path.join(PUBLIC, 'assets', 'js', 'vscode-preview.js') };
  const room = urlPath.match(/^\/rooms\/([a-z0-9-]+)\/?$/);
  if (room) return { file: path.join(PUBLIC, 'room.html'), roomSlug: room[1] };
  if (urlPath === '/') return { file: path.join(PUBLIC, 'index.html') };
  let file = path.join(PUBLIC, urlPath);
  if (!path.extname(file)) file = file.replace(/[\\/]$/, '') + '.html';
  return { file };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const readPartial = (name) => { try { return fs.readFileSync(path.join(PARTIALS, name), 'utf8'); } catch { return ''; } };

/**
 * Prepares a public page before sending it:
 *  • inserts partials/header.html and partials/footer.html (so the menu needs no extra request and search engines see it)
 *  • adds the canonical address and og:url
 *  • fills in the room name/description on /rooms/<slug>
 *  • adds hotel structured data (schema.org) on the home page
 */
function renderPage(html, { urlPath, roomSlug, notFound }) {
  const canonical = config.siteUrl + (urlPath === '/' ? '/' : urlPath.replace(/\/$/, ''));
  let head = notFound ? '<meta name="robots" content="noindex">\n' : `<link rel="canonical" href="${esc(canonical)}">\n  <meta property="og:url" content="${esc(canonical)}">\n`;
  if (!/name="twitter:card"/.test(html)) head += '  <meta name="twitter:card" content="summary_large_image">\n';
  if (urlPath === '/') head += `  <script type="application/ld+json">${hotelJsonLd()}</script>\n`;
  if (roomSlug) {
    const room = parseRoom(db.prepare('SELECT * FROM rooms WHERE slug = ? AND active = 1').get(roomSlug));
    if (room) {
      const title = `${room.name} · DE DON · Luxury Hotel in Abuja`;
      const desc = `${room.name} at DE DON, Abuja. ${room.tagline}`.trim();
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(desc)}"`)
        .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(room.name)} · DE DON, Abuja"`)
        .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(desc)}"`);
      if (room.images[0]) html = html.replace(/(<meta property="og:image" content=")[^"]*"/, `$1${esc(room.images[0].split('?')[0] + (room.images[0].includes('unsplash') ? '?auto=format&fit=crop&w=1200&q=75' : ''))}"`);
    }
  }
  if (config.plausible) head += `  <script defer data-domain="${esc(config.plausible)}" src="https://plausible.io/js/script.js"></script>\n`;
  html = html.replace('</head>', () => head + '</head>');
  // Insert the shared header just before <main> and the footer before </body>.
  if (!html.includes('class="site-header"')) {
    // Functions as replacements, so "$" signs inside the partials are never treated as patterns.
    html = html.replace(/<main\b/, () => `${readPartial('header.html')}\n  <main`);
    html = html.replace(/<\/body>/, () => `${readPartial('footer.html')}\n</body>`);
  }
  return html;
}

function serveFile(req, res, file, { status = 200, urlPath = '/', roomSlug = null } = {}) {
  const base = file.startsWith(ADMIN) ? ADMIN : PUBLIC;
  const resolved = path.resolve(file);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(resolved); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(resolved).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  const isPage = isHtml && base === PUBLIC && !resolved.startsWith(PARTIALS + path.sep);
  const headers = {
    'Content-Type': type,
    // Pages always revalidate; assets cache for a day in production and revalidate in development.
    'Cache-Control': isHtml || !config.production ? 'no-cache' : resolved.includes(`${path.sep}uploads${path.sep}`) ? 'public, max-age=604800' : 'public, max-age=86400',
    ...SECURITY_HEADERS,
  };
  if (base === ADMIN) headers['X-Robots-Tag'] = 'noindex, nofollow';
  const compressible = /text|javascript|json|svg|xml/.test(type);

  if (isPage || compressible) {
    let data = fs.readFileSync(resolved);
    if (isPage) data = Buffer.from(renderPage(data.toString('utf8'), { urlPath, roomSlug, notFound: status === 404 }));
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding'; data = zlib.gzipSync(data); }
    res.writeHead(status, { ...headers, 'Content-Length': data.length });
    return res.end(req.method === 'HEAD' ? undefined : data), true;
  }
  res.writeHead(status, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(resolved).pipe(res);
  return true;
}

// ---------------- request handling ----------------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Bad request.'); }
    if (pathname.includes('\0')) throw new HttpError(400, 'Bad request.');

    if (pathname.startsWith('/api/')) {
      const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
      if (!r) throw new HttpError(404, 'Not found.');
      // Same-origin check for state-changing requests (CSRF defence in addition to SameSite cookies).
      if (req.method !== 'GET' && req.headers.origin) {
        let originHost = '';
        try { originHost = new URL(req.headers.origin).host; } catch { /* "null" or malformed */ }
        if (originHost !== req.headers.host) throw new HttpError(403, 'Cross-origin request refused.');
      }
      const m = pathname.match(r.re);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      const body = req.method === 'GET' ? {} : await readBody(req, pathname.includes('/media') ? 12e6 : 1e6);
      const out = await r.handler({ req, res, params, query: url.searchParams, body, ip: clientIp(req) });
      if (res.headersSent) return;
      if (out && out.__raw) return send(res, 200, out.body, out.headers);
      return send(res, 200, out ?? { ok: true });
    }
    if (pathname === '/sitemap.xml') return send(res, 200, sitemap(), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    if (pathname === '/robots.txt') return send(res, 200, robots(), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    const s = resolveStatic(pathname);
    if (s.redirect) { res.writeHead(301, { Location: s.redirect + url.search }); return res.end(); }
    const roomMissing = s.roomSlug && !db.prepare('SELECT 1 FROM rooms WHERE slug = ? AND active = 1').get(s.roomSlug);
    if (!roomMissing && serveFile(req, res, s.file, { urlPath: pathname, roomSlug: s.roomSlug })) return;
    serveFile(req, res, path.join(PUBLIC, '404.html'), { status: 404, urlPath: pathname }) || send(res, 404, 'Not found');
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : e.message, details: e.details });
  }
});

// If the site is already running (e.g. opened in a second VS Code window), say so instead of crashing.
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`DE DON is already running → http://localhost:${config.port}   (another copy is using port ${config.port})`);
  process.exit(0);
});

server.listen(config.port, () => {
  console.log(`DE DON is running → http://localhost:${config.port}   (admin: http://localhost:${config.port}/admin/)`);
  if (!config.resendKey) console.log('[mail] RESEND_API_KEY not set — emails are stored in Admin → Emails instead of being sent.');
});

