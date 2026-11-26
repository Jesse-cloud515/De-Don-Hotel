/* =====================================================================
   DE DON — shared site script (loaded on every page)

   You normally do NOT need to edit this file to change the website's
   text: all writing lives in the .html files in /public, and the header
   and footer live in /public/partials/.

   What this file does:
     1. Inserts partials/header.html and partials/footer.html
     2. Menu, sticky header, announcement bar
     3. Animations: loader, page transitions, scroll reveals, parallax
     4. Image lightbox, horizontal sliders, newsletter & enquiry forms
   Room listings and booking are handled in pages.js and booking.js.
   ===================================================================== */
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- small helpers (shared with pages.js / booking.js) ----------------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (s) => esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  /** Resize Unsplash photos on their CDN; uploaded photos are used as they are. */
  function imgUrl(src, w = 1600) {
    if (!src) return '';
    if (src.includes('images.unsplash.com')) return `${src.split('?')[0]}?auto=format&fit=crop&w=${w}&q=78`;
    return src;
  }
  function img(src, alt = '', { w = 1600, eager = false, cls = '' } = {}) {
    return `<img src="${esc(imgUrl(src, w))}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${cls ? ` class="${cls}"` : ''}>`;
  }

  let CONTENT = null;
  const money = (n, cur) => {
    if (n == null || n === '') return '';
    try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: cur || CONTENT?.settings?.currency || 'NGN', maximumFractionDigits: 0 }).format(n); }
    catch { return Number(n).toLocaleString(); }
  };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty response */ }
    if (!res.ok) { const e = new Error(data?.error || 'Something went wrong. Please try again.'); e.details = data?.details; e.status = res.status; throw e; }
    return data;
  }

  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.classList.add('is-show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-show'), 3800);
  }

  // ---------------- 1. header & footer partials ----------------
  async function loadPartials() {
    // The server normally inserts the header and footer already; fetch them only if it did not.
    if (!$('.site-header')) {
      const [header, footer] = await Promise.all(['/partials/header.html', '/partials/footer.html'].map((u) => fetch(u).then((r) => (r.ok ? r.text() : '')).catch(() => '')));
      document.body.insertAdjacentHTML('afterbegin', header);
      document.body.insertAdjacentHTML('beforeend', footer);
    }
    document.body.insertAdjacentHTML('beforeend', '<div class="curtain" aria-hidden="true"></div>');
    if (document.body.dataset.page === 'reservations') $('.mobile-book')?.remove();
    $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
    // Highlight the current page in the menu
    const here = location.pathname.replace(/\/$/, '') || '/';
    $$('.nav__link, .menu-panel nav a').forEach((a) => { if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page'); });
  }

  // ---------------- 2. menu, sticky header ----------------
  function headerBehaviour() {
    const header = $('.site-header');
    if (!header) return;
    if (document.body.dataset.header === 'light') header.classList.add('is-light');
    const toggle = $('.menu-toggle');
    const panel = $('#menu-panel');
    const setMenu = (open) => {
      if (open === document.body.classList.contains('menu-open')) return;
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
      // Move keyboard focus into the menu when it opens, and back to the button when it closes.
      if (open) setTimeout(() => $('nav a', panel)?.focus(), 350); else toggle.focus();
    };
    toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('menu-open')) return;
      if (e.key === 'Escape') setMenu(false);
      // Keep Tab inside the open menu (and its close button).
      if (e.key === 'Tab') {
        const items = [toggle, ...$$('a', panel)];
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    // Close the menu when one of its links is chosen, or when the window grows to desktop size.
    panel?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    window.addEventListener('resize', () => { if (window.innerWidth > 1180) setMenu(false); });

    // Transparent over the hero → solid after scrolling; hides on scroll down, returns on scroll up.
    let last = 0;
    const onScroll = () => {
      const y = window.scrollY;
      header.classList.toggle('is-solid', y > 60);
      document.body.classList.toggle('is-scrolled', y > 60);
      header.classList.toggle('is-hidden', y > 400 && y > last && !document.body.classList.contains('menu-open'));
      last = y;
      $('.mobile-book')?.classList.toggle('is-show', y > window.innerHeight * 0.7);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /** Announcement bar (Admin → Website content → Announcements) and search-engine data. */
  function siteExtras(c) {
    document.body.classList.toggle('placeholder-mode', !!c.settings?.placeholderMode);
    const ann = (c.announcements || []).find((a) => a.active && a.text);
    if (ann && !sessionStorage.getItem('dd-ann-closed')) {
      const bar = document.createElement('div');
      bar.className = 'announce';
      bar.innerHTML = `${ann.link ? `<a href="${esc(ann.link)}">${esc(ann.text)}</a>` : esc(ann.text)}<button class="announce__close" aria-label="Dismiss">×</button>`;
      document.body.prepend(bar);
      const header = $('.site-header');
      const setH = () => document.documentElement.style.setProperty('--announce-h', bar.offsetHeight + 'px');
      header?.classList.add('has-announce'); setH();
      window.addEventListener('resize', setH);
      $('.announce__close', bar).onclick = () => { bar.remove(); header?.classList.remove('has-announce'); sessionStorage.setItem('dd-ann-closed', '1'); };
    }
    const h = c.hotel || {};
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Hotel', name: h.name, description: c.seo?.description, url: location.origin,
      image: c.seo?.ogImage ? imgUrl(c.seo.ogImage, 1200) : undefined, telephone: h.phone, email: h.email,
      address: { '@type': 'PostalAddress', streetAddress: h.addressLine, addressLocality: h.city, addressRegion: h.region, postalCode: h.postcode, addressCountry: 'NG' },
      checkinTime: h.checkIn, checkoutTime: h.checkOut,
    });
    document.head.append(ld);
  }

  // ---------------- 3. animation ----------------
  /** Headings with data-split: each line (split at <br>) slides up in turn. */
  function splitLines(el) {
    if (el.dataset.splitDone) return;
    el.innerHTML = el.innerHTML.split(/<br\s*\/?>/i).map((p, i) => `<span class="line"><span style="--i:${i}">${p.trim()}</span></span>`).join('');
    el.dataset.splitDone = '1';
  }

  let io, maskIo;
  function observeReveals(root = document) {
    $$('[data-split]', root).forEach(splitLines);
    const items = $$('[data-reveal], [data-split]', root).filter((el) => !el.classList.contains('is-in'));
    if (reduceMotion || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-in')); return; }
    io = io || new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    // Masked images are fully clipped (invisible to IntersectionObserver), so watch their parent.
    maskIo = maskIo || new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      (e.target._masks || []).forEach((m) => m.classList.add('is-in'));
      maskIo.unobserve(e.target);
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0 });
    items.forEach((el) => {
      if (el.dataset.reveal !== 'mask') return io.observe(el);
      const p = el.parentElement;
      (p._masks = p._masks || []).push(el);
      maskIo.observe(p);
    });
  }

  function parallax() {
    if (reduceMotion) return;
    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      $$('[data-parallax]').forEach((el) => {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const progress = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = `translate3d(0, ${(-progress * (Number(el.dataset.parallax) || 0.12) * 100).toFixed(2)}%, 0)`;
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /** Logo loader on the home page — plays once per visit. */
  function loader() {
    const el = $('.loader');
    if (!el) return Promise.resolve();
    if (sessionStorage.getItem('dd-seen') || reduceMotion) { el.remove(); return Promise.resolve(); }
    sessionStorage.setItem('dd-seen', '1');
    return new Promise((resolve) => setTimeout(() => { el.classList.add('is-done'); setTimeout(() => el.remove(), 1200); resolve(); }, 1200));
  }

  /** Dark curtain that wipes between pages. */
  function pageTransitions() {
    const curtain = $('.curtain');
    if (!curtain || reduceMotion) return;
    if (sessionStorage.getItem('dd-transition')) {
      sessionStorage.removeItem('dd-transition');
      curtain.classList.add('is-entering');
      requestAnimationFrame(() => requestAnimationFrame(() => curtain.classList.add('go')));
      setTimeout(() => curtain.classList.remove('is-entering', 'go'), 900);
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || a.target === '_blank' || a.hasAttribute('download') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/api')) return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      sessionStorage.setItem('dd-transition', '1');
      curtain.classList.add('is-leaving');
      setTimeout(() => { location.href = url.href; }, 560);
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) curtain.classList.remove('is-leaving'); });
  }

  // ---------------- 4a. horizontal slider (class="rail-wrap") ----------------
  function rail(wrap) {
    const r = $('.rail', wrap);
    if (!r || r.dataset.ready) return;
    r.dataset.ready = '1';
    const bar = $('.rail__progress span', wrap);
    const step = () => (r.firstElementChild?.getBoundingClientRect().width || 400) + 32;
    const upd = () => {
      const max = r.scrollWidth - r.clientWidth, vis = r.clientWidth / r.scrollWidth;
      if (bar) bar.style.transform = `translateX(${max > 0 ? (r.scrollLeft / max) * (1 / vis - 1) * 100 : 0}%) scaleX(${Math.min(1, vis)})`;
    };
    $('[data-rail-prev]', wrap)?.addEventListener('click', () => r.scrollBy({ left: -step(), behavior: 'smooth' }));
    $('[data-rail-next]', wrap)?.addEventListener('click', () => r.scrollBy({ left: step(), behavior: 'smooth' }));
    r.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    // drag with the mouse
    let down = false, startX = 0, startL = 0, moved = false;
    r.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; moved = false; startX = e.clientX; startL = r.scrollLeft; });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) { moved = true; r.classList.add('is-dragging'); }
      r.scrollLeft = startL - dx;
    });
    window.addEventListener('pointerup', () => { if (down) { down = false; setTimeout(() => r.classList.remove('is-dragging'), 0); } });
    r.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
    upd();
  }

  // ---------------- 4b. lightbox: DD.lightbox([{src, alt}], startIndex) ----------------
  function lightbox(items, start = 0) {
    let i = start;
    let box = $('.lightbox');
    if (!box) {
      const chev = (d) => `<svg viewBox="0 0 22 8" aria-hidden="true"><path d="${d === 'l' ? 'M22 4H1M4.5.5 1 4l3.5 3.5' : 'M0 4h21M17.5.5 21 4l-3.5 3.5'}" fill="none" stroke="currentColor"/></svg>`;
      box = document.createElement('div');
      box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Image viewer');
      box.innerHTML = `<div class="lightbox__top"><span class="lightbox__count"></span><button class="lightbox__close">Close <span aria-hidden="true">×</span></button></div>
        <div class="lightbox__stage"><button class="lightbox__nav lightbox__nav--prev" aria-label="Previous image">${chev('l')}</button><img alt=""><button class="lightbox__nav lightbox__nav--next" aria-label="Next image">${chev('r')}</button></div>
        <div class="lightbox__caption"></div>`;
      document.body.append(box);
    }
    const imgEl = $('.lightbox__stage img', box);
    const show = () => {
      const it = items[i];
      imgEl.style.animation = 'none'; void imgEl.offsetWidth; imgEl.style.animation = '';
      imgEl.src = imgUrl(it.src, 2200); imgEl.alt = it.alt || '';
      $('.lightbox__caption', box).textContent = it.alt || '';
      $('.lightbox__count', box).textContent = `${String(i + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
      $$('.lightbox__nav', box).forEach((b) => (b.hidden = items.length < 2));
    };
    const lastFocus = document.activeElement;
    const go = (d) => { i = (i + d + items.length) % items.length; show(); };
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    const close = () => { box.classList.remove('is-open'); document.body.style.overflow = ''; document.removeEventListener('keydown', key); lastFocus?.focus(); };
    $('.lightbox__close', box).onclick = close;
    $('.lightbox__nav--prev', box).onclick = () => go(-1);
    $('.lightbox__nav--next', box).onclick = () => go(1);
    box.onclick = (e) => { if (e.target === box || e.target.classList.contains('lightbox__stage')) close(); };
    let tx = 0;
    $('.lightbox__stage', box).ontouchstart = (e) => { tx = e.touches[0].clientX; };
    $('.lightbox__stage', box).ontouchend = (e) => { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); };
    document.addEventListener('keydown', key);
    show();
    box.classList.add('is-open'); document.body.style.overflow = 'hidden';
    $('.lightbox__close', box).focus();
  }

  // ---------------- 4c. forms ----------------
  function showErrors(form, details) {
    $$('.field, .check', form).forEach((f) => { f.classList.remove('has-error'); $('.error', f)?.remove(); });
    if (!details) return;
    for (const [name, msg] of Object.entries(details)) {
      const input = form.elements[name];
      const field = input?.closest?.('.field, .check') || input?.[0]?.closest?.('.field, .check');
      if (!field) continue;
      field.classList.add('has-error');
      const p = document.createElement('span'); p.className = 'error'; p.textContent = msg;
      field.append(p);
    }
  }
  function formData(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value;
    }
    return o;
  }
  function forms() {
    $$('form[data-newsletter]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = f.parentElement.querySelector('.form-note');
      try { await api('/api/newsletter', { body: formData(f) }); f.reset(); note.textContent = 'Thank you — you are on the list.'; }
      catch (err) { note.textContent = err.message; }
    }));
    // Enquiry forms: <form data-enquiry="contact"> / "event" / "dining" — saved in Admin → Enquiries
    $$('form[data-enquiry]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('.form-status', f), btn = $('button[type=submit]', f);
      btn.disabled = true; status.className = 'form-status'; status.innerHTML = '<span class="spinner"></span> Sending…';
      try {
        await api('/api/enquiries', { body: { ...formData(f), type: f.dataset.enquiry } });
        showErrors(f); f.reset();
        status.className = 'form-status is-ok'; status.textContent = 'Thank you. Your message has been received and our team will be in touch shortly.';
      } catch (err) { showErrors(f, err.details); status.className = 'form-status is-error'; status.textContent = err.message; }
      btn.disabled = false;
    }));
  }

  // ---------------- start ----------------
  window.DD = { $, $$, esc, text, img, imgUrl, money, api, toast, lightbox, rail, observeReveals, showErrors, formData, get content() { return CONTENT; } };
  window.DD.ready = Promise.all([api('/api/content').catch(() => null), api('/api/rooms').catch(() => [])])
    .then(([c, rooms]) => { CONTENT = c; window.DD.rooms = rooms; return { content: c, rooms }; });

  const domReady = new Promise((r) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r()));
  domReady.then(async () => {
    const loaded = loader();
    await loadPartials();
    headerBehaviour();
    pageTransitions();
    forms();
    const { content, rooms } = await window.DD.ready;
    if (content) siteExtras(content);
    const render = window.DD.pages?.[document.body.dataset.page];
    if (render) { try { await render(content || {}, rooms || []); } catch (e) { console.error(e); } }
    $$('.rail-wrap').forEach(rail);
    await loaded;
    observeReveals();
    parallax();
    document.body.classList.add('is-ready');
  });
})();
