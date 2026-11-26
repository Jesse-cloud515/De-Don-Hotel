/* =====================================================================
   VS Code preview helper — you do not need to edit this file.

   This website only works when it is served by its Node server
   (http://localhost:3100), because the menu, footer, rooms and booking
   are loaded from it. If a page is opened any other way — double-clicked,
   "Show Preview" (Live Preview) or "Go Live" (Live Server) — this script
   opens the same page on the server instead. If the server is not
   running, it shows how to start it.

   On the real website it does nothing.
   If you change PORT in .env, change it here too.
   ===================================================================== */
(function (l) {
  var PORT = 3100;
  var SERVER = 'http://localhost:' + PORT;

  var isFile = l.protocol === 'file:';
  var isOtherLocalServer = /^(localhost|127\.0\.0\.1)$/.test(l.hostname) && l.port !== String(PORT);
  if (!isFile && !isOtherLocalServer) return; // already on the real server

  // ".../public/dining.html" -> "/dining"
  var p = decodeURIComponent(l.pathname).replace(/\\/g, '/');
  var i = p.lastIndexOf('/public/');
  p = i >= 0 ? p.slice(i + 7) : p.slice(p.lastIndexOf('/'));
  p = p.replace(/(index)?\.html$/, '').replace(/^\/room$/, '/accommodation') || '/';
  var target = SERVER + p + l.search + l.hash;

  fetch(SERVER + '/assets/img/favicon.svg', { mode: 'no-cors', cache: 'no-store' }).then(
    function () { l.replace(target); },
    function () {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.innerHTML =
          '<div style="font:16px/1.6 system-ui;max-width:620px;margin:12vh auto;padding:32px;border:1px solid #ccc;background:#fff;color:#202322">' +
          '<h1 style="font:600 22px system-ui;margin:0 0 12px">The DE DON server is not running</h1>' +
          '<p>This website needs its server to show pages, rooms and bookings.</p>' +
          '<p><b>In VS Code:</b> press <b>Ctrl+Shift+B</b> (or <i>Terminal &rarr; Run Task &rarr; DE DON: start</i>). This page opens automatically once it is running.</p>' +
          '<p>Then use <a href="' + target + '">' + target + '</a></p></div>';
        setTimeout(function () { l.reload(); }, 4000);
      });
    }
  );
})(location);
