/* =====================================================================
   DE DON — page behaviours

   The text of every page is written directly in its .html file.
   This file only:
     • adds interaction to that HTML (gallery filters, review slider,
       experiences hover list, quick-booking dates)
     • fills in ROOM listings, because room names, prices, photos and
       availability are managed in the dashboard (Admin → Rooms) so that
       the booking system always uses the same data.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, text, img, money } = window.DD;

  /* ---------------- shared room fragments ---------------- */
  const two = (n) => String(n).padStart(2, '0');
  const facts = (r) => [r.size_sqm ? `${r.size_sqm} m²` : '', `Up to ${r.max_adults + (r.max_children || 0)} guests`, r.bed || '']
    .filter(Boolean).map((f) => `<span>${esc(f)}</span>`).join('');
  const price = (r) => (r.from_price ? `${money(r.from_price)}<small>per night, from</small>` : 'Rate on request<small>contact reservations</small>');

  function roomCard(r, i, total) {
    return `<article class="room-card" data-reveal style="--d:${(i % 3) * 0.1}s">
      <a href="/rooms/${esc(r.slug)}" aria-label="${esc(r.name)}"><div class="frame">${img(r.images[0], r.name, { w: 1200 })}</div></a>
      <div class="room-card__meta"><span class="index-num">${two(i + 1)} / ${two(total)}</span><span class="room-card__price">${price(r)}</span></div>
      <h3 style="margin-top:6px">${esc(r.name)}</h3>
      <div class="room-card__facts">${facts(r)}</div>
      <p class="muted" style="margin-bottom:20px">${esc(r.tagline)}</p>
      <div class="room-card__actions"><a class="link-line" href="/rooms/${esc(r.slug)}">View room</a><a class="link-line" href="/reservations?room=${r.id}">Book this room</a></div>
    </article>`;
  }

  /* ---------------- behaviours for static HTML ---------------- */

  /** Experiences list: hovering a title shows its photo (images in .xp__media, same order as the list). */
  function experienceList(root) {
    if (!root) return;
    const items = $$('.xp__item', root), imgs = $$('.xp__media img', root);
    const activate = (n) => {
      items.forEach((x, i) => x.classList.toggle('is-active', i === n));
      imgs.forEach((x, i) => x.classList.toggle('is-active', i === n));
    };
    items.forEach((li, n) => { li.addEventListener('mouseenter', () => activate(n)); li.addEventListener('focusin', () => activate(n)); });
    activate(0);
  }

  /** Guest reviews: several .quote__slide blocks rotate every 8 seconds. */
  function reviews(root) {
    if (!root) return;
    const slides = $$('.quote__slide', root);
    if (slides.length < 2) { slides[0]?.classList.add('is-active'); return; }
    root.insertAdjacentHTML('beforeend', `<div class="quote__dots">${slides.map((_, i) => `<button aria-label="Review ${i + 1}"></button>`).join('')}</div>`);
    const dots = $$('.quote__dots button', root);
    let cur = 0;
    const go = (n) => { cur = n; slides.forEach((s, i) => s.classList.toggle('is-active', i === n)); dots.forEach((d, i) => d.setAttribute('aria-current', i === n)); };
    dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
    go(0);
    setInterval(() => !document.hidden && go((cur + 1) % slides.length), 8000);
  }

  /** Gallery: filter buttons are built from each photo's data-cat, and clicking a photo opens the lightbox. */
  function gallery(grid, filterBar) {
    if (!grid) return;
    const buttons = $$('button', grid);
    const visible = () => buttons.filter((b) => !b.classList.contains('is-hidden'));
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const vis = visible();
      window.DD.lightbox(vis.map((x) => ({ src: $('img', x).getAttribute('src'), alt: $('img', x).alt })), vis.indexOf(b));
    });
    if (!filterBar) return;
    const cats = [...new Set(buttons.map((b) => b.dataset.cat).filter(Boolean))];
    filterBar.innerHTML = ['All', ...cats].map((c, i) => `<button aria-pressed="${i === 0}" data-f="${esc(c)}">${esc(c)}</button>`).join('');
    filterBar.addEventListener('click', (e) => {
      const f = e.target.closest('button'); if (!f) return;
      $$('button', filterBar).forEach((x) => x.setAttribute('aria-pressed', x === f));
      buttons.forEach((b) => b.classList.toggle('is-hidden', f.dataset.f !== 'All' && b.dataset.cat !== f.dataset.f));
    });
  }

  /** Quick booking bar on the home page: sensible default dates. */
  function quickbook() {
    const f = $('[data-quickbook]');
    if (!f) return;
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    f.checkIn.min = d(0); f.checkIn.value = d(1); f.checkOut.min = d(1); f.checkOut.value = d(3);
    f.checkIn.addEventListener('change', () => {
      const next = new Date(f.checkIn.value); next.setDate(next.getDate() + 1);
      const n = next.toISOString().slice(0, 10);
      f.checkOut.min = n; if (f.checkOut.value <= f.checkIn.value) f.checkOut.value = n;
    });
  }

  const empty = '<p class="empty-note">Rooms will appear here once they are added in the dashboard (Admin → Rooms).</p>';

  /* ---------------- pages (chosen by <body data-page="...">) ---------------- */
  const pages = {
    home(c, rooms) {
      quickbook();
      $('#home-rooms').innerHTML = rooms.length ? rooms.map((r, i) => roomCard(r, i, rooms.length)).join('') : empty;
      experienceList($('.xp'));
      reviews($('.quote'));
    },

    accommodation(c, rooms) {
      $('#room-list').innerHTML = rooms.length ? rooms.map((r, i) => `<article class="room-row" id="${esc(r.slug)}">
          <a class="frame frame--parallax" href="/rooms/${esc(r.slug)}" data-reveal="mask">${img(r.images[0], r.name).replace('<img', '<img data-parallax="0.08"')}</a>
          <div class="room-row__body" data-reveal>
            <span class="index-num">${two(i + 1)}</span>
            <h2>${esc(r.name)}</h2>
            <p class="room-row__tag">${esc(r.tagline)}</p>
            <dl class="facts">
              <div><dt>Size</dt><dd>${r.size_sqm ? `${r.size_sqm} m²` : '—'}</dd></div>
              <div><dt>Guests</dt><dd>Up to ${r.max_adults} adults${r.max_children ? ` + ${r.max_children}` : ''}</dd></div>
              <div><dt>Bed</dt><dd>${esc(r.bed || '—')}</dd></div>
              <div><dt>From</dt><dd>${r.from_price ? money(r.from_price) : 'On request'}</dd></div>
            </dl>
            <p class="muted">${esc(r.amenities.slice(0, 5).join(' · '))}</p>
            <div class="btn-row mt-s"><a class="btn" href="/reservations?room=${r.id}">Book this room</a><a class="link-line" href="/rooms/${esc(r.slug)}">View room</a></div>
          </div></article>`).join('') : empty;
    },

    async room() {
      const slug = location.pathname.split('/').filter(Boolean).pop();
      let r;
      try { r = await window.DD.api('/api/rooms/' + encodeURIComponent(slug)); }
      catch { $('main').innerHTML = '<section class="page-hero page-hero--short"><div class="container page-hero__content"><h1>Room not found</h1><p class="mt-s"><a class="link-line" href="/accommodation">View all rooms</a></p></div></section>'; return; }
      document.title = `${r.name} · DE DON · Luxury Hotel in Abuja`;
      $('meta[name="description"]')?.setAttribute('content', `${r.name} at DE DON, Abuja. ${r.tagline}`);
      $('#room-hero-img').innerHTML = img(r.images[0], r.name, { eager: true, w: 2200 }).replace('<img', '<img data-parallax="0.1"');
      $('#room-name').textContent = r.name;
      $('#room-tagline').textContent = r.tagline;
      $('#room-desc').innerHTML = text(r.description);
      $('#room-facts').innerHTML = `
        <div><dt>Size</dt><dd>${r.size_sqm ? `${r.size_sqm} m²` : '—'}</dd></div>
        <div><dt>Bed</dt><dd>${esc(r.bed || '—')}</dd></div>
        <div><dt>Occupancy</dt><dd>${r.max_adults} adult${r.max_adults > 1 ? 's' : ''}${r.max_children ? `, ${r.max_children} child${r.max_children > 1 ? 'ren' : ''}` : ''}</dd></div>
        <div><dt>View</dt><dd>${esc(r.view || '—')}</dd></div>`;
      $('#room-amenities').innerHTML = r.amenities.map((a) => `<li>${esc(a)}</li>`).join('');
      $('#room-policies').innerHTML = r.policies.map((a) => `<li>${esc(a)}</li>`).join('');
      const gal = $('#room-gallery');
      gal.innerHTML = r.images.map((s, i) => `<button aria-label="View photo ${i + 1}" data-reveal style="--d:${i * 0.06}s">${img(s, `${r.name} — photo ${i + 1}`, { w: i === 0 ? 1400 : 800 })}</button>`).join('');
      gal.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        window.DD.lightbox(r.images.map((s, i) => ({ src: s, alt: `${r.name} — photo ${i + 1}` })), [...gal.children].indexOf(b));
      });
      $('#room-price').innerHTML = r.from_price ? `${money(r.from_price)} <small>/ night</small>` : 'Rate on request';
      $('#room-price-note').textContent = r.price_note || '';
      const others = window.DD.rooms.filter((x) => x.slug !== r.slug);
      $('#other-rooms').innerHTML = others.map((x, i) => roomCard(x, i, others.length)).join('');
      if (!others.length) $('#other-rooms-section').hidden = true;
      window.DD.roomBookingPanel?.(r);
    },

    gallery() { gallery($('#gallery'), $('#gallery-filters')); },
    about() { gallery($('#about-gallery')); },
  };

  window.DD.pages = Object.assign(window.DD.pages || {}, pages);
})();
