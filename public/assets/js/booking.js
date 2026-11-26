/* =====================================================================
   DE DON — reservation experience
   - /reservations: 4-step request flow + "Manage a reservation"
   - /rooms/<slug>: booking panel with live availability and price
   Availability and prices come from the server (real inventory set in
   the admin dashboard). Requests are confirmed by the hotel — no online
   payment is taken until a payment provider is configured.
   ===================================================================== */
(() => {
  'use strict';
  const { $, $$, esc, img, money, api, showErrors, formData } = window.DD;

  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const today = () => { const d = new Date(); return iso(new Date(d.getTime() - d.getTimezoneOffset() * 60000)); };
  const nice = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const guests = (a, c) => `${a} adult${a > 1 ? 's' : ''}${Number(c) ? `, ${c} child${c > 1 ? 'ren' : ''}` : ''}`;

  /** Keep a departure input after its arrival input. */
  function linkDates(inEl, outEl) {
    inEl.min = today();
    const sync = () => {
      if (!inEl.value) return;
      outEl.min = addDays(inEl.value, 1);
      if (!outEl.value || outEl.value <= inEl.value) outEl.value = addDays(inEl.value, 1);
    };
    inEl.addEventListener('change', sync);
    if (!inEl.value) inEl.value = addDays(today(), 1);
    if (!outEl.value) outEl.value = addDays(inEl.value, 2);
    sync();
  }

  /* ---------------------------------------------------------------
     Room page booking panel (window.DD.roomBookingPanel is called by pages.js)
     --------------------------------------------------------------- */
  window.DD.roomBookingPanel = (room) => {
    const f = $('#room-book');
    if (!f) return;
    f.adults.innerHTML = Array.from({ length: room.max_adults }, (_, i) => `<option${i + 1 === Math.min(2, room.max_adults) ? ' selected' : ''}>${i + 1}</option>`).join('');
    f.children.innerHTML = Array.from({ length: room.max_children + 1 }, (_, i) => `<option>${i}</option>`).join('');
    linkDates(f.checkIn, f.checkOut);
    const out = $('#rb-summary');
    let seq = 0;
    const check = async () => {
      const n = ++seq;
      out.innerHTML = '<span class="spinner"></span>';
      try {
        const data = await api('/api/availability', { body: formData(f) });
        if (n !== seq) return;
        const r = data.rooms.find((x) => x.id === room.id);
        if (!r) { out.textContent = 'This room is not currently offered.'; return; }
        out.innerHTML = `<div class="row"><span>${data.nights} night${data.nights > 1 ? 's' : ''}</span><span>${r.nightly ? money(r.nightly) + ' / night' : 'Rate on request'}</span></div>
          ${r.total ? `<div class="row row--total"><span>Estimated total</span><span>${money(r.total)}</span></div>` : ''}
          <p class="mt-s" style="margin-bottom:0">${r.available ? `<span class="tag tag--ok">Available to request</span>${r.unitsLeft <= 2 ? ' <span class="tag tag--gold">Limited availability</span>' : ''}` : `<span class="tag tag--warn">${esc(r.reason || 'Unavailable')}</span>`}</p>`;
        f.querySelector('button[type=submit]').disabled = !r.available;
      } catch (e) {
        if (n !== seq) return;
        out.innerHTML = `<span class="form-status is-error">${esc(Object.values(e.details || {})[0] || e.message)}</span>`;
        f.querySelector('button[type=submit]').disabled = true;
      }
    };
    f.addEventListener('change', check);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = new URLSearchParams({ ...formData(f), room: room.id });
      location.href = '/reservations?' + p;
    });
    check();
  };

  /* ---------------------------------------------------------------
     Reservations page
     --------------------------------------------------------------- */
  window.DD.pages = window.DD.pages || {};
  window.DD.pages.reservations = (content) => {
    document.title = `Reserve Your Stay · ${content.seo?.titleSuffix || 'DE DON'}`;
    const state = { stay: null, results: [], room: null, guest: null, preferredRoom: null };
    const stayForm = $('#f-stay'), guestForm = $('#f-guest');

    // ---- tabs ----
    const tabs = { book: [$('#t-book'), $('#tab-book')], manage: [$('#t-manage'), $('#tab-manage')] };
    const showTab = (name) => Object.entries(tabs).forEach(([k, [btn, panel]]) => { btn.setAttribute('aria-selected', k === name); panel.hidden = k !== name; });
    tabs.book[0].onclick = () => { showTab('book'); history.replaceState(null, '', location.pathname + location.search); };
    tabs.manage[0].onclick = () => { showTab('manage'); history.replaceState(null, '', '#manage'); };
    if (location.hash === '#manage') showTab('manage');

    // ---- steps ----
    const go = (n) => {
      $$('.step-panel').forEach((p) => p.classList.toggle('is-active', Number(p.dataset.step) === n));
      $$('#steps li').forEach((li, i) => { li.classList.toggle('is-current', i + 1 === n); li.classList.toggle('is-done', i + 1 < n || n === 5); });
      const top = $('#steps').getBoundingClientRect().top + window.scrollY - 120;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
      summary();
    };
    $$('[data-back]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); go(Number(b.dataset.back)); }));

    function summary() {
      const s = state.stay, r = state.room;
      const el = $('#summary');
      if (!s) return;
      el.innerHTML = `<h4>Your stay</h4>
        <div class="row"><span>Arrival</span><span>${nice(s.checkIn)}</span></div>
        <div class="row"><span>Departure</span><span>${nice(s.checkOut)}</span></div>
        <div class="row"><span>Nights</span><span>${state.nights}</span></div>
        <div class="row"><span>Guests</span><span>${guests(s.adults, s.children)}</span></div>
        ${r ? `<div class="row"><span>Room</span><span>${esc(r.name)}</span></div>
          <div class="row"><span>Rate</span><span>${r.nightly ? money(r.nightly) + ' / night' : 'On request'}</span></div>
          <div class="total"><span style="font-size:1rem;font-family:var(--sans);color:var(--stone)">Estimated total</span><span>${r.total ? money(r.total) : '—'}</span></div>
          ${r.price_note ? `<p class="note">${esc(r.price_note)}</p>` : ''}` : ''}
        <p class="note">Your request is reviewed and confirmed by our reservations team. No payment is taken online.</p>`;
    }

    // ---- step 1: dates & guests ----
    const params = new URLSearchParams(location.search);
    if (params.get('checkIn')) stayForm.checkIn.value = params.get('checkIn');
    if (params.get('checkOut')) stayForm.checkOut.value = params.get('checkOut');
    if (params.get('adults')) stayForm.adults.value = params.get('adults');
    if (params.get('children')) stayForm.children.value = params.get('children');
    state.preferredRoom = Number(params.get('room')) || null;
    linkDates(stayForm.checkIn, stayForm.checkOut);

    stayForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('.form-status', stayForm);
      const btn = $('button[type=submit]', stayForm);
      btn.disabled = true; status.className = 'form-status'; status.innerHTML = '<span class="spinner"></span> Checking availability…';
      try {
        const stay = formData(stayForm);
        stay.adults = Number(stay.adults); stay.children = Number(stay.children);
        const data = await api('/api/availability', { body: stay });
        showErrors(stayForm); status.textContent = '';
        state.stay = stay; state.nights = data.nights; state.results = data.rooms; state.room = null;
        renderResults();
        go(2);
      } catch (err) { showErrors(stayForm, err.details); status.className = 'form-status is-error'; status.textContent = err.message; }
      btn.disabled = false;
    });

    // ---- step 2: room selection ----
    function renderResults() {
      const list = state.results;
      const avail = list.filter((r) => r.available).length;
      $('#results-note').textContent = `${nice(state.stay.checkIn)} – ${nice(state.stay.checkOut)} · ${state.nights} night${state.nights > 1 ? 's' : ''} · ${guests(state.stay.adults, state.stay.children)}. ${avail ? `${avail} of ${list.length} room types available to request.` : 'No rooms are available for these dates — please try different dates or contact reservations.'}`;
      const sorted = [...list].sort((a, b) => (b.available - a.available) || (b.id === state.preferredRoom) - (a.id === state.preferredRoom));
      $('#results').innerHTML = sorted.map((r) => `<article class="result${r.available ? '' : ' is-unavailable'}${r.id === state.preferredRoom ? ' is-selected' : ''}">
          <div class="frame">${img(r.image, r.name, { sizes: '260px', w: 600 })}</div>
          <div>
            ${r.id === state.preferredRoom ? '<span class="tag tag--gold">Your selection</span>' : ''}
            <h3 style="margin-top:8px">${esc(r.name)}</h3>
            <p class="result__facts">${[r.size_sqm ? `${r.size_sqm} m²` : '', r.bed, `Up to ${r.max_adults} adults${r.max_children ? ` + ${r.max_children} children` : ''}`].filter(Boolean).map(esc).join(' · ')}</p>
            <p class="muted" style="margin:0">${esc(r.tagline || '')}</p>
            ${r.available ? (r.unitsLeft <= 2 ? '<p class="mt-s mb-0"><span class="tag tag--gold">Limited availability</span></p>' : '') : `<p class="mt-s mb-0"><span class="tag tag--warn">${esc(r.reason)}</span></p>`}
          </div>
          <div class="result__price">
            <div><div class="amount">${r.total ? money(r.total) : 'On request'}</div><small>${r.nightly ? `${money(r.nightly)} × ${r.nights} night${r.nights > 1 ? 's' : ''} · estimate` : 'Rate confirmed by reservations'}</small></div>
            <button class="btn btn--sm${r.available ? '' : ' btn--outline'}" data-pick="${r.id}"${r.available ? '' : ' disabled'}>${r.available ? 'Select' : 'Unavailable'}</button>
          </div></article>`).join('');
      $$('[data-pick]').forEach((b) => b.addEventListener('click', () => {
        state.room = state.results.find((r) => r.id === Number(b.dataset.pick));
        go(3);
        setTimeout(() => guestForm.firstName.focus({ preventScroll: true }), 400);
      }));
    }

    // ---- step 3: guest details (validated in the browser, then again on the server) ----
    guestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const g = formData(guestForm);
      const errs = {};
      if (!g.firstName.trim()) errs.firstName = 'Please enter your first name.';
      if (!g.lastName.trim()) errs.lastName = 'Please enter your last name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g.email.trim())) errs.email = 'Enter a valid email address.';
      if (!/^[+()\d\s-]{7,20}$/.test(g.phone.trim())) errs.phone = 'Enter a valid phone number, including country code.';
      if (!g.consent) errs.consent = 'Please accept to continue.';
      showErrors(guestForm, errs);
      const status = $('.form-status', guestForm);
      if (Object.keys(errs).length) { status.className = 'form-status is-error'; status.textContent = 'Please check the highlighted fields.'; return; }
      status.textContent = '';
      state.guest = g;
      renderReview();
      go(4);
    });

    function renderReview() {
      const g = state.guest, r = state.room, s = state.stay;
      const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
      $('#review').innerHTML = `<dl class="facts" style="margin-top:0">
        ${row('Room', esc(r.name))}${row('Guests', guests(s.adults, s.children))}
        ${row('Arrival', nice(s.checkIn))}${row('Departure', nice(s.checkOut))}
        ${row('Guest', esc(`${g.firstName} ${g.lastName}`))}${row('Contact', `${esc(g.email)}<br>${esc(g.phone)}`)}
        ${g.arrivalTime ? row('Arrival time', esc(g.arrivalTime)) : ''}${g.purpose ? row('Purpose', esc(g.purpose)) : ''}
        ${row('Estimated total', r.total ? money(r.total) : 'Rate on request')}
      </dl>${g.requests ? `<p class="label">Special requests</p><p>${esc(g.requests)}</p>` : ''}`;
    }

    // ---- step 4: submit ----
    $('#submit-res').addEventListener('click', async () => {
      const btn = $('#submit-res'), status = $('#submit-status');
      btn.disabled = true; status.className = 'form-status'; status.innerHTML = '<span class="spinner"></span> Sending your request…';
      try {
        const data = await api('/api/reservations', { body: { ...state.stay, ...state.guest, roomId: state.room.id } });
        const r = data.reservation;
        status.textContent = '';
        $('#confirm').innerHTML = `<svg class="confirm__check" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="35"/><path d="M23 37l9 9 17-19"/></svg>
          <p class="eyebrow eyebrow--plain">Request received</p>
          <h2>Thank you, ${esc(r.first_name)}.</h2>
          <p class="label mt-m">Your reference</p><p class="confirm__ref">${esc(r.reference)}</p>
          <p class="lead">Your request for the <strong>${esc(r.room_name)}</strong>, ${nice(r.check_in)} – ${nice(r.check_out)}, is <strong>awaiting confirmation</strong>. Our reservations team will contact you at ${esc(state.guest.email)} shortly.</p>
          <p class="muted">Please keep your reference. You can view, change or cancel your request at any time under “Manage a reservation”.</p>
          <div class="btn-row mt-m" style="justify-content:center"><button class="btn btn--outline" data-print>Print</button><a class="btn" href="/">Return home</a></div>`;
        $('[data-print]').addEventListener('click', () => window.print());
        go(5);
        sessionStorage.setItem('dd-last-ref', r.reference);
      } catch (err) {
        status.className = 'form-status is-error'; status.textContent = err.message;
        if (err.status === 409) setTimeout(() => stayForm.requestSubmit(), 1800);
      }
      btn.disabled = false;
    });

    if (params.get('checkIn') && params.get('checkOut')) stayForm.requestSubmit();

    // ---- manage a reservation ----
    const lookup = $('#f-lookup');
    let current = null;
    const renderManage = (r) => {
      current = r;
      const tag = { pending: 'tag--gold', confirmed: 'tag--ok', cancelled: 'tag--warn', rejected: 'tag--warn' }[r.status] || '';
      $('#manage-result').innerHTML = `<div class="summary-card">
        <h4>Reservation ${esc(r.reference)}</h4>
        <p><span class="tag ${tag}">${esc(r.status_label)}</span></p>
        <div class="row"><span>Guest</span><span>${esc(r.first_name)} ${esc(r.last_name)}</span></div>
        <div class="row"><span>Room</span><span>${esc(r.room_name)}</span></div>
        <div class="row"><span>Arrival</span><span>${nice(r.check_in)}</span></div>
        <div class="row"><span>Departure</span><span>${nice(r.check_out)}</span></div>
        <div class="row"><span>Guests</span><span>${guests(r.adults, r.children)}</span></div>
        <div class="row"><span>Estimated total</span><span>${r.total ? money(r.total, r.currency) : 'On request'}</span></div>
        ${r.change_request ? `<p class="note"><strong>Change requested:</strong> ${esc(r.change_request)}</p>` : ''}
        ${['pending', 'confirmed'].includes(r.status) ? `
          <form id="f-modify" class="mt-m" novalidate><div class="field"><label for="m-msg">Request a change (dates, room, guests, requests)</label><textarea id="m-msg" name="message" required></textarea></div>
          <div class="btn-row mt-s"><button class="btn btn--sm" type="submit">Send change request</button>${r.can_cancel ? '<button type="button" class="btn btn--sm btn--outline" id="cancel-res">Cancel reservation</button>' : ''}</div>
          <p class="form-status" aria-live="polite"></p></form>` : ''}
      </div>`;
      const mf = $('#f-modify');
      if (!mf) return;
      const st = $('.form-status', mf);
      mf.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { renderManage(await api('/api/reservations/modify', { body: { reference: r.reference, email: lookup.email.value, message: mf.message.value } })); window.DD.toast('Your change request has been sent to reservations.'); }
        catch (err) { st.className = 'form-status is-error'; st.textContent = err.message; }
      });
      $('#cancel-res')?.addEventListener('click', async () => {
        if (!confirm(`Cancel reservation ${r.reference}? This cannot be undone online.`)) return;
        try { renderManage(await api('/api/reservations/cancel', { body: { reference: r.reference, email: lookup.email.value } })); window.DD.toast('Your reservation has been cancelled.'); }
        catch (err) { st.className = 'form-status is-error'; st.textContent = err.message; }
      });
    };
    if (sessionStorage.getItem('dd-last-ref')) lookup.reference.value = sessionStorage.getItem('dd-last-ref');
    lookup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('.form-status', lookup);
      st.className = 'form-status'; st.innerHTML = '<span class="spinner"></span>';
      try { renderManage(await api('/api/reservations/lookup', { body: formData(lookup) })); st.textContent = ''; }
      catch (err) { $('#manage-result').innerHTML = ''; st.className = 'form-status is-error'; st.textContent = err.message; }
    });
  };
})();
