/* =====================================================================
   DE DON — admin dashboard (single-page app, no build step)
   Views: overview, reservations, rooms, content, media, enquiries,
   subscribers, emails, users, activity, account.
   All data comes from /api/admin/* and every action is checked on the
   server against the signed-in user's role.
   ===================================================================== */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] ??= /^\d+$/.test(k) ? [] : {}), o); t[last] = v; };
  const money = (n, cur = 'NGN') => (n == null ? '—' : new Intl.NumberFormat('en-NG', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n));
  const date = (s) => (s ? new Date(s.length === 10 ? s + 'T00:00:00Z' : s.replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: s.length === 10 ? 'UTC' : undefined }) : '—');
  const dateTime = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const thumb = (src, w = 300) => (src?.includes('images.unsplash.com') ? `${src.split('?')[0]}?auto=format&fit=crop&w=${w}&q=60` : src);
  const STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', rejected: 'Rejected', cancelled: 'Cancelled', checked_in: 'Checked in', checked_out: 'Checked out', no_show: 'No-show', new: 'New', in_progress: 'In progress', closed: 'Closed', sent: 'Sent', stored: 'Stored (not sent)', failed: 'Failed' };
  const badge = (s) => `<span class="status status--${esc(s)}">${esc(STATUS_LABELS[s] || s)}</span>`;

  let ME = null;
  const can = (p) => ME && (ME.perms.includes('*') || ME.perms.includes(p));

  async function api(path, opts = {}) {
    const res = await fetch('/api/admin' + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Please sign in.'); }
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  }
  function toast(msg, error = false) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast is-show' + (error ? ' is-error' : '');
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = 'toast'), 3500);
  }
  const fail = (e) => toast(e.message, true);

  // ------------------------------------------------------------------
  // Shell: login, navigation, routing
  // ------------------------------------------------------------------
  const NAV = [
    { group: 'Operations' },
    { id: 'overview', label: 'Overview', perm: 'stats' },
    { id: 'reservations', label: 'Reservations', perm: 'reservations', count: 'pending' },
    { id: 'enquiries', label: 'Enquiries', perm: 'enquiries', count: 'newEnquiries' },
    { group: 'Property' },
    { id: 'rooms', label: 'Rooms & availability', perm: 'rooms' },
    { group: 'Website' },
    { id: 'content', label: 'Website settings', perm: 'content' },
    { id: 'media', label: 'Media library', perm: 'media' },
    { id: 'subscribers', label: 'Newsletter', perm: 'subscribers' },
    { id: 'emails', label: 'Emails', perm: 'outbox' },
    { group: 'Administration' },
    { id: 'users', label: 'Users & roles', perm: 'users' },
    { id: 'activity', label: 'Activity log', perm: 'users' },
  ];

  function showLogin() {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#login-form [name=email]').focus();
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    $('.login__error').textContent = '';
    try {
      await api('/login', { body: { email: f.email.value, password: f.password.value } });
      f.reset(); boot();
    } catch (err) { $('.login__error').textContent = err.message; }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { body: {} }).catch(() => {}); location.hash = ''; showLogin(); });
  $('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));

  async function renderNav() {
    let counts = {};
    if (can('stats')) counts = await api('/stats').catch(() => ({}));
    // Show items the role can use, and a group heading only when something under it is visible.
    const visible = NAV.filter((n, i) => {
      if (!n.group) return can(n.perm);
      for (let j = i + 1; j < NAV.length && !NAV[j].group; j++) if (can(NAV[j].perm)) return true;
      return false;
    });
    $('#nav').innerHTML = visible.map((n) => n.group ? `<div class="group">${n.group}</div>`
      : `<a href="#${n.id}" data-id="${n.id}">${n.label}${n.count && counts[n.count] ? `<span class="count">${counts[n.count]}</span>` : ''}</a>`).join('');
    $('#me').innerHTML = `${esc(ME.name)}<small>${esc(ME.roleLabel)}</small>`;
  }

  const VIEWS = {};
  async function route() {
    if (!ME) return;
    const [id, ...rest] = (location.hash.slice(1).split('?')[0] || (can('stats') ? 'overview' : 'reservations')).split('/');
    $$('#nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.id === id));
    $('#sidebar').classList.remove('is-open');
    const view = VIEWS[id];
    $('#page-actions').innerHTML = '';
    if (!view) { $('#view').innerHTML = '<div class="empty">Page not found.</div>'; return; }
    $('#view').innerHTML = '<div class="empty">Loading…</div>';
    try { await view(rest); } catch (e) { $('#view').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
    window.scrollTo(0, 0);
  }
  const title = (t) => { $('#page-title').textContent = t; document.title = `${t} · DE DON Dashboard`; };
  const actions = (html) => { $('#page-actions').innerHTML = html; };

  async function boot() {
    try { ME = await api('/me'); } catch { return showLogin(); }
    $('#login').hidden = true; $('#app').hidden = false;
    await renderNav();
    route();
  }
  window.addEventListener('hashchange', route);

  // Drawer
  function drawer(html) { $('#drawer-body').innerHTML = html; $('#drawer').hidden = false; return $('#drawer-body'); }
  function closeDrawer() { $('#drawer').hidden = true; $('#drawer-body').innerHTML = ''; }
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer' || e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });

  // ------------------------------------------------------------------
  // Overview
  // ------------------------------------------------------------------
  VIEWS.overview = async () => {
    title('Overview');
    const s = await api('/stats');
    actions(can('reservations') ? '<a class="btn btn--primary" href="#reservations/new">New reservation</a>' : '');
    const max = Math.max(1, ...s.trend.map((t) => t.count));
    const W = 600, H = 180, bw = W / s.trend.length;
    const chart = `<svg class="chart" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="Reservation requests per week">
      ${s.trend.map((t, i) => { const h = (t.count / max) * H; return `<rect x="${i * bw + 6}" y="${H - h}" width="${bw - 12}" height="${Math.max(h, 1)}"><title>${t.start} – ${t.end}: ${t.count}</title></rect>
        <text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle">${t.end.slice(5).replace('-', '/')}</text>`; }).join('')}</svg>`;
    const statusRows = Object.entries(s.byStatus);
    const smax = Math.max(1, ...statusRows.map(([, n]) => n));
    $('#view').innerHTML = `
      <div class="kpis">
        <a class="kpi" href="#reservations?status=pending"><span>Awaiting confirmation</span><strong>${s.pending}</strong><small>pending requests</small></a>
        <a class="kpi" href="#reservations?view=arrivals"><span>Arrivals · 7 days</span><strong>${s.arrivals}</strong><small>${s.arrivalsToday} today</small></a>
        <a class="kpi" href="#reservations?view=departures"><span>Departures · 7 days</span><strong>${s.departures}</strong><small>&nbsp;</small></a>
        <a class="kpi" href="#reservations?view=inhouse"><span>In house</span><strong>${s.inHouse}</strong><small>checked-in reservations</small></a>
        <div class="kpi"><span>Occupancy · next 30 nights</span><strong>${s.occupancy == null ? '—' : s.occupancy + '%'}</strong><small>${s.inventory ? `${s.bookedNights} of ${s.inventory * 30} room-nights (confirmed)` : 'set room inventory to calculate'}</small></div>
        <div class="kpi"><span>Total reservations</span><strong>${s.total}</strong><small>${s.thisMonth} received this month</small></div>
        <div class="kpi"><span>Confirmed booking value</span><strong style="font-size:26px">${money(s.confirmedValue)}</strong><small>estimated, not payments received</small></div>
        <div class="kpi"><span>Completed stays value</span><strong style="font-size:26px">${money(s.completedValue)}</strong><small>checked-out reservations</small></div>
      </div>
      <div class="grid-2">
        <div class="card"><h2>Reservation requests · last 12 weeks</h2>${chart}</div>
        <div class="card"><h2>By status</h2>${statusRows.length ? `<div class="bars">${statusRows.map(([k, n]) => `<div><span>${STATUS_LABELS[k] || k}</span><i style="width:${(n / smax) * 100}%"></i><b>${n}</b></div>`).join('')}</div>` : '<p class="muted">No reservations yet.</p>'}
          ${s.byRoom.length ? `<h3 class="mt">By room</h3><div class="bars">${s.byRoom.map((r) => `<div><span>${esc(r.name)}</span><i style="width:${(r.n / Math.max(...s.byRoom.map((x) => x.n))) * 100}%"></i><b>${r.n}</b></div>`).join('')}</div>` : ''}</div>
      </div>
      <div class="card"><h2>Upcoming arrivals</h2>
        ${s.upcoming.length ? `<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Arrival</th><th>Departure</th><th>Status</th></tr></thead><tbody>
          ${s.upcoming.map((r) => `<tr class="clickable" data-ref="${esc(r.reference)}"><td class="mono">${esc(r.reference)}</td><td>${esc(r.first_name)} ${esc(r.last_name)}</td><td>${esc(r.room_name)}</td><td>${date(r.check_in)}</td><td>${date(r.check_out)}</td><td>${badge(r.status)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No upcoming arrivals.</p>'}
      </div>
      <p class="muted mt">Figures are calculated only from reservations recorded in this system and the room inventory you have entered. Booking values are estimates until payment processing is connected.</p>`;
    $$('[data-ref]').forEach((tr) => tr.addEventListener('click', () => (location.hash = `reservations?q=${tr.dataset.ref}`)));
  };

  // ------------------------------------------------------------------
  // Reservations
  // ------------------------------------------------------------------
  VIEWS.reservations = async (rest) => {
    if (rest[0] === 'new') return newReservation();
    title('Reservations');
    const hashQuery = new URLSearchParams(location.hash.split('?')[1] || '');
    const q = { q: hashQuery.get('q') || '', status: hashQuery.get('status') || '', view: hashQuery.get('view') || '', from: '', to: '' };
    actions(`<a class="btn btn--primary" href="#reservations/new">New reservation</a><a class="btn" id="export" href="#">Export CSV</a>`);
    $('#view').innerHTML = `
      <div class="toolbar">
        <input type="search" id="r-q" placeholder="Search reference, guest, email or phone" value="${esc(q.q)}">
        <select id="r-status"><option value="">All statuses</option>${Object.entries(STATUS_LABELS).slice(0, 7).map(([k, v]) => `<option value="${k}"${q.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <div class="segmented" id="r-view">${[['', 'All'], ['arrivals', 'Arrivals (7d)'], ['departures', 'Departures (7d)'], ['inhouse', 'In house']].map(([k, v]) => `<button data-v="${k}" class="${q.view === k ? 'is-active' : ''}">${v}</button>`).join('')}</div>
        <label class="muted">Stay from <input type="date" id="r-from" style="min-width:0"></label>
        <label class="muted">to <input type="date" id="r-to" style="min-width:0"></label>
      </div>
      <div id="r-list"></div>`;
    const load = async () => {
      const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
      $('#export').href = '/api/admin/reservations/export?' + params;
      const rows = await api('/reservations?' + params);
      $('#r-list').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Stay</th><th>Guests</th><th>Estimate</th><th>Status</th><th>Received</th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="clickable" data-id="${r.id}"><td class="mono">${esc(r.reference)}${r.change_request ? '<small style="color:#8a6f3e">change requested</small>' : ''}</td>
          <td>${esc(r.first_name)} ${esc(r.last_name)}<small>${esc(r.email)}</small></td><td>${esc(r.room_name)}</td>
          <td>${date(r.check_in)} → ${date(r.check_out)}<small>${r.nights} night${r.nights > 1 ? 's' : ''}</small></td>
          <td>${r.adults}${r.children ? ` + ${r.children}` : ''}</td><td>${money(r.total, r.currency)}</td><td>${badge(r.status)}</td><td>${dateTime(r.created_at)}<small>${esc(r.source)}</small></td></tr>`).join('')}
        </tbody></table></div><p class="muted mt">${rows.length} reservation${rows.length > 1 ? 's' : ''}${rows.length === 500 ? ' (showing the first 500 — refine your search)' : ''}</p>`
        : '<div class="card empty">No reservations match these filters.</div>';
      $$('#r-list tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openReservation(tr.dataset.id, load)));
      if (q.q && rows.length === 1 && /^DD-/i.test(q.q)) openReservation(rows[0].id, load);
    };
    let t;
    $('#r-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { q.q = e.target.value; load(); }, 250); });
    $('#r-status').addEventListener('change', (e) => { q.status = e.target.value; load(); });
    $('#r-from').addEventListener('change', (e) => { q.from = e.target.value; load(); });
    $('#r-to').addEventListener('change', (e) => { q.to = e.target.value; load(); });
    $$('#r-view button').forEach((b) => b.addEventListener('click', () => { q.view = b.dataset.v; $$('#r-view button').forEach((x) => x.classList.toggle('is-active', x === b)); load(); }));
    await load();
  };

  async function openReservation(id, reload) {
    const r = await api('/reservations/' + id);
    const body = drawer(`
      <p class="muted mono">${esc(r.reference)}</p>
      <h2 style="font-size:30px">${esc(r.first_name)} ${esc(r.last_name)}</h2>
      <p>${badge(r.status)} <span class="muted">· received ${dateTime(r.created_at)} via ${esc(r.source)}</span></p>
      ${r.change_request ? `<div class="notice"><strong>Guest change request:</strong><br>${esc(r.change_request)}<div class="mt"><button class="btn btn--sm" id="clear-cr">Mark as handled</button></div></div>` : ''}
      <dl class="dl">
        <dt>Room</dt><dd>${esc(r.room_name)}</dd>
        <dt>Stay</dt><dd>${date(r.check_in)} → ${date(r.check_out)} · ${r.nights} night${r.nights > 1 ? 's' : ''}</dd>
        <dt>Guests</dt><dd>${r.adults} adult(s)${r.children ? `, ${r.children} child(ren)` : ''}</dd>
        <dt>Email</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd>
        <dt>Phone</dt><dd><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></dd>
        <dt>Country</dt><dd>${esc(r.country || '—')}</dd>
        <dt>Arrival time</dt><dd>${esc(r.arrival_time || '—')}</dd>
        <dt>Purpose</dt><dd>${esc(r.purpose || '—')}</dd>
        <dt>Rate</dt><dd>${money(r.nightly_rate, r.currency)} / night</dd>
        <dt>Estimated total</dt><dd><strong>${money(r.total, r.currency)}</strong></dd>
        <dt>Special requests</dt><dd>${esc(r.requests || '—').replace(/\n/g, '<br>')}</dd>
      </dl>
      <div class="card">
        <h3>Update status</h3>
        <div class="form">
          <label class="f"><span>Status</span><select id="st">${['pending', 'confirmed', 'rejected', 'cancelled', 'checked_in', 'checked_out', 'no_show'].map((s) => `<option value="${s}"${s === r.status ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}</select></label>
          <label class="f f--check" style="align-self:end"><input type="checkbox" id="notify" checked><span>Email the guest (confirm / reject / cancel)</span></label>
          <label class="f full"><span>Message to guest (optional)</span><textarea id="msg" placeholder="e.g. payment instructions, arrival details"></textarea></label>
          <label class="f full"><span>Internal notes (staff only)</span><textarea id="notes">${esc(r.internal_notes)}</textarea></label>
        </div>
        <div class="mt"><button class="btn btn--primary" id="save-res">Save changes</button></div>
      </div>
      ${r.emails.length ? `<div class="card"><h3>Emails</h3>${r.emails.map((m) => `<p style="margin:6px 0">${badge(m.status)} ${esc(m.subject)}<br><small class="muted">${esc(m.to_addr)} · ${dateTime(m.created_at)}</small></p>`).join('')}</div>` : ''}`);
    $('#save-res', body).addEventListener('click', async () => {
      try {
        await api('/reservations/' + id, { method: 'PATCH', body: { status: $('#st', body).value, internal_notes: $('#notes', body).value, notifyGuest: $('#notify', body).checked, message: $('#msg', body).value } });
        toast('Reservation updated.'); closeDrawer(); reload?.(); renderNav();
      } catch (e) { fail(e); }
    });
    $('#clear-cr', body)?.addEventListener('click', async () => {
      try { await api('/reservations/' + id, { method: 'PATCH', body: { clearChangeRequest: true } }); toast('Change request cleared.'); openReservation(id, reload); reload?.(); } catch (e) { fail(e); }
    });
  }

  async function newReservation() {
    title('New reservation');
    const rooms = can('rooms') ? await api('/rooms') : (await fetch('/api/rooms').then((r) => r.json()));
    $('#view').innerHTML = `<div class="card" style="max-width:860px">
      <p class="muted">Record a reservation taken by phone, email or in person. Availability is checked against inventory when saving.</p>
      <form class="form" id="nr">
        <label class="f"><span>Room</span><select name="roomId" required>${rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
        <label class="f"><span>Status</span><select name="status"><option value="confirmed">Confirmed</option><option value="pending">Pending</option></select></label>
        <label class="f"><span>Check-in</span><input type="date" name="checkIn" required></label>
        <label class="f"><span>Check-out</span><input type="date" name="checkOut" required></label>
        <label class="f"><span>Adults</span><input type="number" name="adults" min="1" value="2"></label>
        <label class="f"><span>Children</span><input type="number" name="children" min="0" value="0"></label>
        <label class="f"><span>First name</span><input name="firstName" required></label>
        <label class="f"><span>Last name</span><input name="lastName" required></label>
        <label class="f"><span>Email</span><input type="email" name="email" required></label>
        <label class="f"><span>Phone</span><input name="phone"></label>
        <label class="f"><span>Source</span><select name="source"><option value="phone">Phone</option><option value="email">Email</option><option value="walk-in">Walk-in</option><option value="agent">Travel agent</option><option value="corporate">Corporate</option></select></label>
        <label class="f"><span>Agreed total (optional)</span><input type="number" name="total" min="0" placeholder="Defaults to rate × nights"></label>
        <label class="f full"><span>Notes / requests</span><textarea name="requests"></textarea></label>
      </form>
      <div class="mt"><button class="btn btn--primary" id="nr-save">Save reservation</button> <a class="btn" href="#reservations">Cancel</a></div></div>`;
    $('#nr-save').addEventListener('click', async () => {
      const f = $('#nr');
      if (!f.reportValidity()) return;
      try {
        const r = await api('/reservations', { body: Object.fromEntries(new FormData(f)) });
        toast(`Reservation ${r.reference} saved.`); location.hash = `reservations?q=${r.reference}`; renderNav();
      } catch (e) { fail(e); }
    });
  }

  // ------------------------------------------------------------------
  // Rooms & availability
  // ------------------------------------------------------------------
  VIEWS.rooms = async (rest) => {
    const rooms = await api('/rooms');
    if (rest[0]) return roomEditor(rest[0] === 'new' ? null : rooms.find((r) => String(r.id) === rest[0]));
    title('Rooms & availability');
    actions('<a class="btn btn--primary" href="#rooms/new">Add room category</a>');
    $('#view').innerHTML = `${rooms.some((r) => r.placeholder) ? '<div class="notice">Some rooms are marked as <strong>demo placeholders</strong>. Replace their details with the hotel\'s verified room categories, then untick “Placeholder”.</div>' : ''}
      <div class="table-wrap"><table><thead><tr><th></th><th>Room category</th><th>Size</th><th>Occupancy</th><th>Rate / night</th><th>Inventory</th><th>Closures</th><th>Status</th></tr></thead><tbody>
      ${rooms.map((r) => `<tr class="clickable" data-id="${r.id}"><td style="width:90px">${r.images[0] ? `<img src="${esc(thumb(r.images[0], 200))}" alt="" style="width:80px;height:56px;object-fit:cover">` : ''}</td>
        <td><strong>${esc(r.name)}</strong><small>/rooms/${esc(r.slug)}</small>${r.placeholder ? '<small class="ph-hint">Demo placeholder</small>' : ''}</td>
        <td>${r.size_sqm ? r.size_sqm + ' m²' : '—'}</td><td>${r.max_adults} + ${r.max_children}</td><td>${money(r.base_price)}</td>
        <td>${r.units} unit${r.units === 1 ? '' : 's'}</td><td>${r.closures.length || '—'}</td><td>${r.active ? badge('confirmed').replace('Confirmed', 'Published') : badge('cancelled').replace('Cancelled', 'Hidden')}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted mt"><strong>Inventory</strong> is the number of physical rooms of each category. Online availability = inventory − closures − pending/confirmed reservations, checked night by night.</p>`;
    $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => (location.hash = 'rooms/' + tr.dataset.id)));
  };

  function roomEditor(room) {
    const isNew = !room;
    const r = room ? clone(room) : { name: '', slug: '', tagline: '', description: '', size_sqm: '', bed: '', view: '', max_adults: 2, max_children: 0, base_price: '', price_note: '', units: 1, amenities: [], policies: [], images: [], sort: 0, active: true, placeholder: false, closures: [] };
    title(isNew ? 'New room category' : r.name);
    actions('<a class="btn" href="#rooms">← All rooms</a>' + (r.slug && !isNew ? ` <a class="btn" href="/rooms/${esc(r.slug)}" target="_blank">View on site ↗</a>` : ''));
    const draft = { ...r };
    $('#view').innerHTML = `
      <div class="card"><h2>Details</h2><div class="form" id="room-form">
        ${field({ k: 'name', label: 'Room name', t: 'text' }, draft)}
        ${field({ k: 'slug', label: 'URL name (slug)', t: 'text', help: 'Leave blank to generate from the name.' }, draft)}
        ${field({ k: 'tagline', label: 'Tagline', t: 'text', full: true }, draft)}
        ${field({ k: 'description', label: 'Description', t: 'textarea', full: true, help: 'Separate paragraphs with a blank line.' }, draft)}
        ${field({ k: 'size_sqm', label: 'Size (m²)', t: 'number' }, draft)}
        ${field({ k: 'bed', label: 'Bed configuration', t: 'text' }, draft)}
        ${field({ k: 'view', label: 'View', t: 'text' }, draft)}
        ${field({ k: 'sort', label: 'Display order', t: 'number' }, draft)}
        ${field({ k: 'max_adults', label: 'Max adults', t: 'number' }, draft)}
        ${field({ k: 'max_children', label: 'Max children', t: 'number' }, draft)}
      </div></div>
      <div class="card"><h2>Pricing & inventory</h2><div class="form">
        ${field({ k: 'base_price', label: 'Rate per night (NGN)', t: 'number', help: 'Leave empty to show “Rate on request”.' }, draft)}
        ${field({ k: 'units', label: 'Inventory (number of rooms)', t: 'number', help: 'How many rooms of this category the hotel has.' }, draft)}
        ${field({ k: 'price_note', label: 'Price note shown to guests', t: 'text', full: true }, draft)}
        ${field({ k: 'active', label: 'Published on the website and bookable', t: 'bool' }, draft)}
        ${field({ k: 'placeholder', label: 'Placeholder (unverified demo data)', t: 'bool' }, draft)}
      </div></div>
      <div class="card"><h2>Amenities & policies</h2><div class="form">
        ${field({ k: 'amenities', label: 'Amenities', t: 'lines', help: 'One per line.' }, draft)}
        ${field({ k: 'policies', label: 'Room policies', t: 'lines', help: 'One per line.' }, draft)}
      </div></div>
      <div class="card"><h2>Photographs</h2><p class="muted">The first photograph is the main image. Upload high-quality landscape photos (at least 2000px wide).</p><div id="room-images"></div></div>
      ${isNew ? '' : `<div class="card"><h2>Closures & blocked dates</h2><p class="muted">Block rooms for maintenance, renovation or group holds. The end date is the first night the rooms are available again. Leave “Rooms” empty to close the whole category.</p>
        <div id="closures"></div>
        <div class="form mt" style="grid-template-columns:repeat(4,1fr) auto;align-items:end">
          <label class="f"><span>From</span><input type="date" id="c-start"></label><label class="f"><span>Until</span><input type="date" id="c-end"></label>
          <label class="f"><span>Rooms</span><input type="number" id="c-units" min="1" placeholder="All"></label><label class="f"><span>Reason</span><input id="c-reason"></label>
          <button class="btn" id="c-add">Add closure</button></div></div>`}
      <div class="savebar"><button class="btn btn--primary" id="room-save">${isNew ? 'Create room' : 'Save changes'}</button>${isNew ? '' : '<button class="btn btn--danger" id="room-del">Delete</button>'}<span class="dirty" id="room-dirty"></span></div>`;
    bindFields($('#view'), draft, () => ($('#room-dirty').textContent = 'Unsaved changes'));
    const renderImages = () => {
      $('#room-images').innerHTML = `<div class="list">${draft.images.map((src, i) => `<div class="list__item"><header><strong>Photo ${i + 1}${i === 0 ? ' · main' : ''}</strong><div>
          <button class="icon-btn" data-up="${i}" title="Move up">↑</button><button class="icon-btn" data-rm="${i}" title="Remove">✕</button></div></header>
          ${imageField(`images.${i}`, src)}</div>`).join('')}</div><button class="btn mt" id="img-add">+ Add photograph</button>`;
      bindFields($('#room-images'), draft, () => ($('#room-dirty').textContent = 'Unsaved changes'));
      $$('[data-rm]', $('#room-images')).forEach((b) => (b.onclick = () => { draft.images.splice(+b.dataset.rm, 1); renderImages(); }));
      $$('[data-up]', $('#room-images')).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; if (i > 0) [draft.images[i - 1], draft.images[i]] = [draft.images[i], draft.images[i - 1]]; renderImages(); }));
      $('#img-add').onclick = () => { draft.images.push(''); renderImages(); };
    };
    renderImages();
    const renderClosures = () => {
      if (!$('#closures')) return;
      $('#closures').innerHTML = draft.closures.length ? `<div class="table-wrap"><table><thead><tr><th>From</th><th>Until</th><th>Rooms</th><th>Reason</th><th></th></tr></thead><tbody>
        ${draft.closures.map((c) => `<tr><td>${date(c.start_date)}</td><td>${date(c.end_date)}</td><td>${c.units ?? 'All'}</td><td>${esc(c.reason)}</td><td class="right"><button class="btn btn--sm btn--danger" data-cdel="${c.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No upcoming closures.</p>';
      $$('[data-cdel]').forEach((b) => (b.onclick = async () => { try { await api('/closures/' + b.dataset.cdel, { method: 'DELETE' }); draft.closures = draft.closures.filter((c) => String(c.id) !== b.dataset.cdel); renderClosures(); toast('Closure removed.'); } catch (e) { fail(e); } }));
    };
    renderClosures();
    $('#c-add')?.addEventListener('click', async () => {
      try {
        await api(`/rooms/${r.id}/closures`, { body: { start_date: $('#c-start').value, end_date: $('#c-end').value, units: $('#c-units').value, reason: $('#c-reason').value } });
        toast('Closure added.'); const fresh = (await api('/rooms')).find((x) => x.id === r.id); draft.closures = fresh.closures; renderClosures();
      } catch (e) { fail(e); }
    });
    $('#room-save').addEventListener('click', async () => {
      try {
        const body = { ...draft, images: draft.images.filter(Boolean) };
        const saved = isNew ? await api('/rooms', { body }) : await api('/rooms/' + r.id, { method: 'PUT', body });
        toast('Room saved.'); location.hash = 'rooms/' + saved.id; if (!isNew) route();
      } catch (e) { fail(e); }
    });
    $('#room-del')?.addEventListener('click', async () => {
      if (!confirm(`Delete “${r.name}” permanently? This cannot be undone. (To hide it instead, untick “Published”.)`)) return;
      try { await api('/rooms/' + r.id, { method: 'DELETE' }); toast('Room deleted.'); location.hash = 'rooms'; } catch (e) { fail(e); }
    });
  }

  // ------------------------------------------------------------------
  // Generic field rendering (used by rooms and website content)
  // ------------------------------------------------------------------
  function field(def, data) {
    const v = getPath(data, def.k);
    const cls = `f${def.full || def.t === 'textarea' || def.t === 'list' || def.t === 'image' ? ' full' : ''}${def.t === 'bool' ? ' f--check' : ''}`;
    const help = def.help ? `<em>${esc(def.help)}</em>` : '';
    const ph = typeof v === 'string' && /\[[^\]]+\]/.test(v) ? '<em class="ph-hint">Contains [placeholder] text — replace with verified information.</em>' : '';
    switch (def.t) {
      case 'bool': return `<label class="${cls}"><input type="checkbox" data-k="${def.k}"${v ? ' checked' : ''}><span>${esc(def.label)}</span></label>`;
      case 'textarea': return `<label class="${cls}"><span>${esc(def.label)}</span><textarea data-k="${def.k}" rows="${def.rows || 5}">${esc(v)}</textarea>${help}${ph}</label>`;
      case 'number': return `<label class="${cls}"><span>${esc(def.label)}</span><input type="number" step="any" data-k="${def.k}" data-num value="${esc(v ?? '')}">${help}</label>`;
      case 'lines': return `<label class="${cls}"><span>${esc(def.label)}</span><textarea data-k="${def.k}" data-lines rows="6">${esc((v || []).join('\n'))}</textarea>${help}</label>`;
      case 'image': return `<div class="${cls}"><span>${esc(def.label)}</span>${imageField(def.k, v)}${help}</div>`;
      default: return `<label class="${cls}"><span>${esc(def.label)}</span><input data-k="${def.k}" value="${esc(v ?? '')}">${help}${ph}</label>`;
    }
  }
  function imageField(k, v) {
    return `<div class="img-field" data-img="${k}">${v ? `<img src="${esc(thumb(v))}" alt="">` : '<div class="noimg"></div>'}
      <div><input data-k="${k}" value="${esc(v || '')}" placeholder="Image URL or choose from the library">
      <div class="row"><button type="button" class="btn btn--sm" data-upload>Upload</button><button type="button" class="btn btn--sm" data-library>Library</button><input type="file" accept="image/*,video/mp4,video/webm" hidden></div></div></div>`;
  }
  /** Two-way bind inputs with data-k to the draft object. */
  function bindFields(root, data, onChange) {
    $$('[data-k]', root).forEach((el) => {
      if (el._bound) return; el._bound = true;
      const ev = el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.hasAttribute('data-num')) v = v === '' ? '' : Number(v);
        if (el.hasAttribute('data-lines')) v = v.split('\n').map((s) => s.trim()).filter(Boolean);
        setPath(data, el.dataset.k, v);
        const wrap = el.closest('[data-img]');
        if (wrap) { const im = $('img, .noimg', wrap); if (v) im.outerHTML = `<img src="${esc(thumb(v))}" alt="">`; }
        onChange?.();
      });
    });
    $$('[data-img]', root).forEach((wrap) => {
      if (wrap._bound) return; wrap._bound = true;
      const input = $('input[data-k]', wrap), file = $('input[type=file]', wrap);
      const set = (url) => { input.value = url; input.dispatchEvent(new Event('input')); };
      $('[data-upload]', wrap).onclick = () => file.click();
      file.onchange = async () => { if (file.files[0]) { try { set((await uploadFile(file.files[0])).url); toast('Uploaded.'); } catch (e) { fail(e); } } };
      $('[data-library]', wrap).onclick = () => mediaPicker(set);
    });
  }
  function uploadFile(f) {
    if (f.size > 9e6) return Promise.reject(new Error('Files must be under 9 MB. Compress large photos before uploading.'));
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onload = () => api('/media', { body: { name: f.name, data: rd.result } }).then(resolve, reject);
      rd.onerror = () => reject(new Error('Could not read the file.'));
      rd.readAsDataURL(f);
    });
  }
  async function mediaPicker(onPick) {
    const items = await api('/media');
    const body = drawer(`<h2>Choose an image</h2><p class="muted">Select an uploaded file, or upload a new one.</p>
      <p><button class="btn" id="mp-up">Upload new</button><input type="file" id="mp-file" accept="image/*,video/mp4,video/webm" multiple hidden></p>
      <div class="media-grid">${items.map((m) => `<figure><button class="pick" data-url="${esc(m.url)}">${/\.(mp4|webm)$/.test(m.name) ? `<video src="${esc(m.url)}" muted></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`}</button><figcaption>${esc(m.name)}</figcaption></figure>`).join('') || '<p class="muted">No uploads yet.</p>'}</div>`);
    $$('.pick', body).forEach((b) => (b.onclick = () => { onPick(b.dataset.url); closeDrawer(); }));
    $('#mp-up', body).onclick = () => $('#mp-file', body).click();
    $('#mp-file', body).onchange = async (e) => {
      try { let last; for (const f of e.target.files) last = await uploadFile(f); onPick(last.url); closeDrawer(); toast('Uploaded.'); } catch (err) { fail(err); }
    };
  }

  // ------------------------------------------------------------------
  // Website content editor
  // ------------------------------------------------------------------
  const L = (k, label, t = 'text', extra = {}) => ({ k, label, t, ...extra });
  const SECTIONS = {
    settings: { label: 'Settings', intro: 'Site-wide behaviour. Turn off placeholder markers only once every [bracketed] value and demo photo has been replaced with verified information.', fields: [
      L('settings.placeholderMode', 'Show placeholder markers and the “Demo content” badge', 'bool'),
      L('settings.currency', 'Currency code (e.g. NGN, USD)'), L('settings.currencySymbol', 'Currency symbol'),
      L('settings.maxNights', 'Maximum nights per online request', 'number'),
    ] },
    hotel: { label: 'Hotel information', intro: 'Contact details and address used across the website, emails and search-engine data.', fields: [
      L('hotel.name', 'Hotel name'), L('hotel.legalName', 'Registered company name'), L('hotel.tagline', 'Brand tagline', 'text', { full: true }), L('hotel.statement', 'Short brand statement (footer)', 'textarea', { rows: 2 }),
      L('hotel.addressLine', 'Street address'), L('hotel.district', 'District'), L('hotel.city', 'City'), L('hotel.region', 'State / territory'), L('hotel.country', 'Country'), L('hotel.postcode', 'Postcode'),
      L('hotel.phone', 'Reservations phone'), L('hotel.whatsapp', 'WhatsApp number'), L('hotel.email', 'Reservations email'), L('hotel.eventsEmail', 'Events email'),
      L('hotel.checkIn', 'Check-in time'), L('hotel.checkOut', 'Check-out time'),
      L('hotel.mapQuery', 'Map search text', 'text', { help: 'Used when no coordinates are set, e.g. the hotel name and street.' }), L('hotel.latitude', 'Latitude'), L('hotel.longitude', 'Longitude'),
      L('hotel.airportNote', 'Airport travel note', 'textarea', { rows: 2 }), L('hotel.directionsNote', 'Directions & parking', 'textarea', { rows: 2 }),
      L('hotel.socials.instagram', 'Instagram URL'), L('hotel.socials.facebook', 'Facebook URL'), L('hotel.socials.x', 'X (Twitter) URL'), L('hotel.socials.linkedin', 'LinkedIn URL'), L('hotel.socials.tiktok', 'TikTok URL'),
    ] },
    home: { label: 'Homepage', intro: 'Use a line break in titles to control where the heading splits.', fields: [
      L('home.heroImage', 'Hero image', 'image', { help: 'Landscape, at least 2400px wide.' }), L('home.heroVideo', 'Hero video URL (optional, MP4)', 'text', { full: true }),
      L('home.heroEyebrow', 'Hero small heading'), L('home.heroTitle', 'Hero headline', 'textarea', { rows: 2 }), L('home.heroText', 'Hero supporting text', 'textarea', { rows: 2 }),
      L('home.introEyebrow', 'Introduction label'), L('home.introTitle', 'Introduction heading', 'textarea', { rows: 2 }), L('home.introText', 'Introduction text', 'textarea', { rows: 7 }),
      L('home.introImageLarge', 'Introduction image (large)', 'image'), L('home.introImageSmall', 'Introduction image (small)', 'image'), L('home.introSignature', 'Introduction signature line', 'text', { full: true }),
      L('home.roomsEyebrow', 'Rooms label'), L('home.roomsTitle', 'Rooms heading'), L('home.roomsText', 'Rooms text', 'textarea', { rows: 2 }),
      L('home.diningEyebrow', 'Dining label'), L('home.diningTitle', 'Dining heading', 'textarea', { rows: 2 }), L('home.diningText', 'Dining text', 'textarea', { rows: 3 }), L('home.diningImage', 'Dining image', 'image'),
      L('home.experiencesEyebrow', 'Experiences label'), L('home.experiencesTitle', 'Experiences heading'),
      L('home.eventsEyebrow', 'Events label'), L('home.eventsTitle', 'Events heading', 'textarea', { rows: 2 }), L('home.eventsText', 'Events text', 'textarea', { rows: 3 }), L('home.eventsImage', 'Events image', 'image'),
      L('home.testimonialsEyebrow', 'Testimonials label'),
      L('home.locationEyebrow', 'Location label'), L('home.locationTitle', 'Location heading', 'textarea', { rows: 2 }), L('home.locationText', 'Location text', 'textarea', { rows: 3 }),
    ] },
    dining: { label: 'Dining', fields: [
      L('dining.heroImage', 'Dining page hero image', 'image'), L('dining.intro', 'Introduction', 'textarea'), L('dining.privateDining', 'Private dining text', 'textarea'),
      L('dining.venues', 'Restaurants & bars', 'list', { item: 'Venue', fields: [L('name', 'Name'), L('kind', 'Type (e.g. Restaurant)'), L('cuisine', 'Cuisine'), L('hours', 'Opening hours'), L('dressCode', 'Dress code'), L('description', 'Description', 'textarea', { rows: 3 }), L('image', 'Image', 'image'), L('placeholder', 'Placeholder (unverified)', 'bool')] }),
      L('dining.signatureDishes', 'Signature dishes', 'list', { item: 'Dish', fields: [L('name', 'Dish name'), L('description', 'Description'), L('image', 'Image', 'image'), L('placeholder', 'Placeholder (unverified)', 'bool')] }),
    ] },
    amenities: { label: 'Experiences & amenities', intro: 'Only publish facilities the hotel actually offers. Untick “Placeholder” once a facility is confirmed.', fields: [
      L('amenities', 'Experiences & amenities', 'list', { item: 'Amenity', fields: [L('title', 'Title'), L('category', 'Category'), L('description', 'Description', 'textarea', { rows: 2 }), L('image', 'Image', 'image'), L('placeholder', 'Placeholder (unverified)', 'bool')] }),
    ] },
    events: { label: 'Meetings & events', fields: [
      L('events.heroImage', 'Events page hero image', 'image'), L('events.intro', 'Introduction', 'textarea'),
      L('events.occasions', 'Occasions offered', 'lines', { help: 'One per line.' }),
      L('events.venues', 'Event venues', 'list', { item: 'Venue', fields: [L('name', 'Name'), L('capacity', 'Capacity'), L('size', 'Size'), L('description', 'Best for'), L('image', 'Image', 'image'), L('placeholder', 'Placeholder (unverified)', 'bool')] }),
    ] },
    testimonials: { label: 'Guest reviews', intro: 'Publish only genuine reviews, with the guest\'s permission. Leave rating empty unless it comes from a verifiable source.', fields: [
      L('testimonials', 'Reviews', 'list', { item: 'Review', fields: [L('quote', 'Review text', 'textarea', { rows: 3 }), L('name', 'Guest name or attribution'), L('source', 'Source (e.g. Google)'), L('rating', 'Rating (1–5)'), L('placeholder', 'Placeholder (hidden when placeholder markers are off)', 'bool')] }),
    ] },
    about: { label: 'About & location', fields: [
      L('about.heroImage', 'About page hero image', 'image'), L('about.philosophy', 'Philosophy statement', 'textarea'), L('about.story', 'Our story', 'textarea', { rows: 7 }),
      L('about.values', 'Values', 'list', { item: 'Value', fields: [L('title', 'Title'), L('text', 'Text', 'textarea', { rows: 2 })] }),
      L('nearby', 'Nearby landmarks', 'list', { item: 'Landmark', fields: [L('name', 'Name'), L('note', 'Distance / travel time')] }),
    ] },
    gallery: { label: 'Gallery', intro: 'Images on the Gallery page. Categories become the filter buttons.', fields: [
      L('gallery', 'Gallery images', 'list', { item: 'Image', fields: [L('src', 'Image', 'image'), L('alt', 'Description (for accessibility)'), L('category', 'Category')] }),
    ] },
    announcements: { label: 'Announcements', intro: 'The first active announcement appears as a bar at the top of every page.', fields: [
      L('announcements', 'Announcements', 'list', { item: 'Announcement', fields: [L('text', 'Text', 'text', { full: true }), L('link', 'Link (optional)'), L('active', 'Active', 'bool')] }),
    ] },
    seo: { label: 'SEO & sharing', fields: [
      L('seo.titleSuffix', 'Title suffix (after page names)', 'text', { full: true }), L('seo.description', 'Default meta description', 'textarea', { rows: 3 }), L('seo.ogImage', 'Social sharing image', 'image'),
    ] },
  };

  // Page text and photos are written directly in the HTML files (see docs/EDITING-GUIDE.md),
  // so the dashboard only keeps settings used by emails, search engines and the announcement bar.
  for (const k of ['home', 'dining', 'amenities', 'events', 'testimonials', 'about', 'gallery']) delete SECTIONS[k];
  SECTIONS.hotel.intro = 'Used in reservation emails, the booking system and search-engine data. The address and phone shown ON THE PAGES are written in the HTML files — update both.';

  let contentDraft = null, contentDirty = false;
  VIEWS.content = async (rest) => {
    const key = SECTIONS[rest[0]] ? rest[0] : 'hotel';
    if (!contentDraft || !contentDirty) contentDraft = await api('/content');
    const sec = SECTIONS[key];
    title('Website settings');
    actions('<a class="btn" href="/" target="_blank">Preview website ↗</a>');
    $('#view').innerHTML = `<nav class="tabs">${Object.entries(SECTIONS).map(([k, s]) => `<a href="#content/${k}" class="${k === key ? 'is-active' : ''}">${s.label}</a>`).join('')}</nav>
      <div class="notice"><strong>Page text and photos</strong> are edited directly in the HTML files in the <code>public/</code> folder (see <code>docs/EDITING-GUIDE.md</code>). Rooms, prices and availability are managed under <a href="#rooms">Rooms &amp; availability</a>.</div>
      ${sec.intro ? `<div class="notice notice--info">${esc(sec.intro)}</div>` : ''}
      <div class="card"><div class="form" id="content-form"></div></div>
      <div class="savebar"><button class="btn btn--primary" id="content-save">Publish changes</button><button class="btn" id="content-reset">Discard</button><span class="dirty" id="content-dirty">${contentDirty ? 'Unsaved changes' : ''}</span></div>`;
    const form = $('#content-form');
    const mark = () => { contentDirty = true; $('#content-dirty').textContent = 'Unsaved changes'; };
    const render = () => {
      form.innerHTML = sec.fields.map((f) => (f.t === 'list' ? listField(f) : field(f, contentDraft))).join('');
      bindFields(form, contentDraft, mark);
      $$('[data-list-op]', form).forEach((b) => b.addEventListener('click', () => {
        const [op, path, i] = b.dataset.listOp.split('|');
        if (!getPath(contentDraft, path)) setPath(contentDraft, path, []);
        const arr = getPath(contentDraft, path);
        const n = Number(i);
        if (op === 'add') arr.push({});
        if (op === 'rm' && confirm('Remove this item?')) arr.splice(n, 1);
        if (op === 'up' && n > 0) [arr[n - 1], arr[n]] = [arr[n], arr[n - 1]];
        if (op === 'down' && n < arr.length - 1) [arr[n + 1], arr[n]] = [arr[n], arr[n + 1]];
        mark(); render();
      }));
    };
    const listField = (def) => {
      const arr = getPath(contentDraft, def.k) || [];
      return `<div class="f full"><span>${esc(def.label)}</span><div class="list">${arr.map((item, i) => `<div class="list__item"><header><strong>${esc(def.item)} ${i + 1}${item.placeholder ? ' <span class="ph-hint">· placeholder</span>' : ''}</strong><div>
          <button type="button" class="icon-btn" data-list-op="up|${def.k}|${i}" title="Move up">↑</button><button type="button" class="icon-btn" data-list-op="down|${def.k}|${i}" title="Move down">↓</button><button type="button" class="icon-btn" data-list-op="rm|${def.k}|${i}" title="Remove">✕</button></div></header>
          <div class="form">${def.fields.map((f) => field({ ...f, k: `${def.k}.${i}.${f.k}` }, contentDraft)).join('')}</div></div>`).join('')}</div>
        <div><button type="button" class="btn mt" data-list-op="add|${def.k}|0">+ Add ${esc(def.item.toLowerCase())}</button></div></div>`;
    };
    render();
    $('#content-save').addEventListener('click', async () => {
      try { await api('/content', { method: 'PUT', body: contentDraft }); contentDirty = false; $('#content-dirty').textContent = ''; toast('Published. Changes are live on the website.'); } catch (e) { fail(e); }
    });
    $('#content-reset').addEventListener('click', async () => { contentDirty = false; contentDraft = null; route(); });
  };
  window.addEventListener('beforeunload', (e) => { if (contentDirty) { e.preventDefault(); e.returnValue = ''; } });

  // ------------------------------------------------------------------
  // Media library
  // ------------------------------------------------------------------
  VIEWS.media = async () => {
    title('Media library');
    actions('<button class="btn btn--primary" id="m-up">Upload files</button><input type="file" id="m-file" accept="image/*,video/mp4,video/webm" multiple hidden>');
    const items = await api('/media');
    $('#view').innerHTML = `<div class="notice notice--info">Upload the hotel's own photography here, then choose it in Rooms or Website content. JPG or WebP, at least 2000px wide, under 9 MB. Copy a file's address to use it anywhere.</div>
      <div class="media-grid">${items.map((m) => `<figure>${/\.(mp4|webm)$/.test(m.name) ? `<video src="${esc(m.url)}" muted controls></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`}
        <figcaption>${esc(m.name)} · ${(m.size / 1024 / 1024).toFixed(1)} MB<span><button class="btn btn--sm" data-copy="${esc(m.url)}">Copy URL</button> <button class="btn btn--sm btn--danger" data-del="${esc(m.name)}">Delete</button></span></figcaption></figure>`).join('') || '<div class="card empty">No uploads yet. The demo website uses stand-in photography from Unsplash until real photographs are uploaded.</div>'}</div>`;
    $('#m-up').onclick = () => $('#m-file').click();
    $('#m-file').onchange = async (e) => { try { for (const f of e.target.files) await uploadFile(f); toast('Uploaded.'); route(); } catch (err) { fail(err); } };
    $$('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('URL copied.'))));
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm(`Delete ${b.dataset.del}? Pages still using it will show a missing image.`)) return; try { await api('/media/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); toast('Deleted.'); route(); } catch (err) { fail(err); } }));
  };

  // ------------------------------------------------------------------
  // Enquiries, subscribers, emails
  // ------------------------------------------------------------------
  VIEWS.enquiries = async () => {
    title('Enquiries');
    const rows = await api('/enquiries');
    $('#view').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Received</th><th>Type</th><th>From</th><th>Subject</th><th>Status</th></tr></thead><tbody>
      ${rows.map((e) => `<tr class="clickable" data-id="${e.id}"><td>${dateTime(e.created_at)}</td><td>${esc(e.type)}</td><td>${esc(e.name)}<small>${esc(e.email)}</small></td><td>${esc(e.subject || '—')}<small>${esc(e.message.slice(0, 90))}${e.message.length > 90 ? '…' : ''}</small></td><td>${badge(e.status)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card empty">No enquiries yet.</div>';
    $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => {
      const e = rows.find((x) => String(x.id) === tr.dataset.id);
      const meta = JSON.parse(e.meta || '{}');
      const body = drawer(`<p class="muted">${esc(e.type)} enquiry · ${dateTime(e.created_at)}</p><h2>${esc(e.name)}</h2>
        <dl class="dl"><dt>Email</dt><dd><a href="mailto:${esc(e.email)}?subject=${encodeURIComponent('Re: ' + (e.subject || 'Your enquiry'))}">${esc(e.email)}</a></dd><dt>Phone</dt><dd>${esc(e.phone || '—')}</dd><dt>Subject</dt><dd>${esc(e.subject || '—')}</dd>
        ${Object.entries(meta).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="card"><p style="white-space:pre-wrap;margin:0">${esc(e.message)}</p></div>
        <div class="mt"><label class="f"><span>Status</span><select id="es">${['new', 'in_progress', 'closed'].map((s) => `<option value="${s}"${s === e.status ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}</select></label></div>`);
      $('#es', body).onchange = async (ev) => { try { await api('/enquiries/' + e.id, { method: 'PATCH', body: { status: ev.target.value } }); toast('Updated.'); closeDrawer(); route(); renderNav(); } catch (err) { fail(err); } };
    }));
  };

  VIEWS.subscribers = async () => {
    title('Newsletter subscribers');
    actions('<a class="btn" href="/api/admin/subscribers/export">Export CSV</a>');
    const rows = await api('/subscribers');
    $('#view').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Email</th><th>Subscribed</th><th></th></tr></thead><tbody>
      ${rows.map((s) => `<tr><td>${esc(s.email)}</td><td>${dateTime(s.created_at)}</td><td class="right"><button class="btn btn--sm btn--danger" data-del="${s.id}">Remove</button></td></tr>`).join('')}</tbody></table></div><p class="muted mt">${rows.length} subscriber(s). Export to your email marketing tool to send newsletters.</p>` : '<div class="card empty">No subscribers yet.</div>';
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm('Remove this subscriber?')) return; try { await api('/subscribers/' + b.dataset.del, { method: 'DELETE' }); route(); } catch (e) { fail(e); } }));
  };

  VIEWS.emails = async () => {
    title('Emails');
    const rows = await api('/outbox');
    $('#view').innerHTML = `<div class="notice notice--info">Every email the website generates is recorded here. <strong>Stored</strong> means it was not sent because no email provider is configured (set RESEND_API_KEY on the server). <strong>Failed</strong> means the provider rejected it.</div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Created</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>
      ${rows.map((m) => `<tr class="clickable" data-id="${m.id}"><td>${dateTime(m.created_at)}</td><td>${esc(m.to_addr)}</td><td>${esc(m.subject)}${m.error ? `<small>${esc(m.error)}</small>` : ''}</td><td>${badge(m.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">No emails yet.</div>'}`;
    $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', async () => {
      const m = await api('/outbox/' + tr.dataset.id);
      const body = drawer(`<p class="muted">To ${esc(m.to_addr)} · ${dateTime(m.created_at)}</p><h2 style="font-size:22px">${esc(m.subject)}</h2><iframe sandbox="" style="width:100%;height:70vh;border:1px solid var(--line);margin-top:16px;background:#fff"></iframe>`);
      $('iframe', body).srcdoc = m.html;
    }));
  };

  // ------------------------------------------------------------------
  // Users, activity, account
  // ------------------------------------------------------------------
  VIEWS.users = async () => {
    title('Users & roles');
    const { users, roles } = await api('/users');
    actions('<button class="btn btn--primary" id="u-add">Add user</button>');
    $('#view').innerHTML = `<div class="notice notice--info"><strong>Administrator</strong>: everything, including users. <strong>Manager</strong>: reservations, rooms, website content, media, enquiries, newsletter, emails. <strong>Front desk</strong>: overview, reservations and enquiries only.</div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td>${esc(u.name)}<small>${esc(u.email)}</small></td>
        <td><select data-role="${u.id}" style="width:auto"${u.id === ME.id ? ' disabled' : ''}>${Object.entries(roles).map(([k, v]) => `<option value="${k}"${k === u.role ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
        <td>${dateTime(u.last_login)}</td><td>${u.active ? badge('confirmed').replace('Confirmed', 'Active') : badge('cancelled').replace('Cancelled', 'Disabled')}</td>
        <td class="right">${u.id === ME.id ? '<span class="muted">You</span>' : `<button class="btn btn--sm" data-pw="${u.id}">Reset password</button> <button class="btn btn--sm${u.active ? ' btn--danger' : ''}" data-active="${u.id}" data-to="${u.active ? 0 : 1}">${u.active ? 'Disable' : 'Enable'}</button>`}</td></tr>`).join('')}
      </tbody></table></div>`;
    $$('[data-role]').forEach((s) => (s.onchange = async () => { try { await api('/users/' + s.dataset.role, { method: 'PATCH', body: { role: s.value } }); toast('Role updated.'); } catch (e) { fail(e); route(); } }));
    $$('[data-active]').forEach((b) => (b.onclick = async () => { try { await api('/users/' + b.dataset.active, { method: 'PATCH', body: { active: b.dataset.to === '1' } }); toast('Updated.'); route(); } catch (e) { fail(e); } }));
    $$('[data-pw]').forEach((b) => (b.onclick = async () => {
      const pw = prompt('New password for this user (at least 10 characters, letters and numbers). Share it with them securely; they will be signed out.');
      if (!pw) return;
      try { await api('/users/' + b.dataset.pw, { method: 'PATCH', body: { password: pw } }); toast('Password reset.'); } catch (e) { fail(e); }
    }));
    $('#u-add').onclick = () => {
      const body = drawer(`<h2>Add user</h2><form class="form mt" id="uf">
        <label class="f full"><span>Full name</span><input name="name" required></label>
        <label class="f full"><span>Email</span><input name="email" type="email" required></label>
        <label class="f full"><span>Role</span><select name="role">${Object.entries(roles).map(([k, v]) => `<option value="${k}"${k === 'reception' ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f full"><span>Temporary password</span><input name="password" type="text" required minlength="10"><em>At least 10 characters with letters and numbers. Ask them to change it after signing in.</em></label>
      </form><div class="mt"><button class="btn btn--primary" id="uf-save">Create user</button></div>`);
      $('#uf-save', body).onclick = async () => {
        const f = $('#uf', body); if (!f.reportValidity()) return;
        try { await api('/users', { body: Object.fromEntries(new FormData(f)) }); toast('User created.'); closeDrawer(); route(); } catch (e) { fail(e); }
      };
    };
  };

  VIEWS.activity = async () => {
    title('Activity log');
    const rows = await api('/audit');
    $('#view').innerHTML = `<div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th><th>IP</th></tr></thead><tbody>
      ${rows.map((a) => `<tr><td>${dateTime(a.created_at)}</td><td>${esc(a.user_email || '—')}</td><td class="mono">${esc(a.action)}</td><td>${esc(a.detail)}</td><td class="mono">${esc(a.ip)}</td></tr>`).join('')}</tbody></table></div>`;
  };

  VIEWS.account = async () => {
    title('My account');
    $('#view').innerHTML = `<div class="card" style="max-width:520px"><h2>${esc(ME.name)}</h2><p class="muted">${esc(ME.email)} · ${esc(ME.roleLabel)}</p>
      <h3 class="mt">Change password</h3><form class="form" id="pf" style="grid-template-columns:1fr">
        <label class="f"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
        <label class="f"><span>New password</span><input type="password" name="next" autocomplete="new-password" required minlength="10"><em>At least 10 characters, with letters and numbers.</em></label>
      </form><div class="mt"><button class="btn btn--primary" id="pf-save">Update password</button></div></div>`;
    $('#pf-save').onclick = async () => {
      const f = $('#pf'); if (!f.reportValidity()) return;
      try { await api('/me/password', { body: Object.fromEntries(new FormData(f)) }); f.reset(); toast('Password updated.'); } catch (e) { fail(e); }
    };
  };

  boot();
})();
