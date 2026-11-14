// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// share.js: "Share" puts the whole plan into a link (planner.html?p=row.col-row.col…&t=HH:MM;
// the base first, then the science points), and "Print card" prints a one-page EVA card.

(function () {
  'use strict';

  var S = window.SERA;
  if (!S) return;
  var T = SeraTerrain;
  var tr = function (s) { return window.SeraI18n ? SeraI18n.t(s) : s; };
  var startEl = document.getElementById('start-time');
  var shareBtn = document.getElementById('btn-share');
  var printBtn = document.getElementById('btn-print');
  var noteEl = document.getElementById('share-note');

  function planLink() {
    var p = S.plan;
    if (!p.base) return null;
    var cells = [p.base].concat(p.stops).map(function (c) { return c.r + '.' + c.c; }).join('-');
    var base = location.href.split('#')[0].split('?')[0];
    return base + '?p=' + cells + '&t=' + encodeURIComponent(startEl.value);
  }

  function note(text) {
    noteEl.textContent = text;
    noteEl.hidden = false;
    clearTimeout(note.t);
    note.t = setTimeout(function () { noteEl.hidden = true; }, 6000);
  }

  shareBtn.addEventListener('click', function () {
    var url = planLink();
    if (!url) { note(tr('Place the base first.')); return; }
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: 'S.E.R.A EVA plan', url: url }).catch(function () {});
      return;
    }
    var done = function () { note(tr('Link copied. Anyone who opens it sees this plan.')); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done, function () { prompt(tr('Copy this link:'), url); });
    } else {
      prompt(tr('Copy this link:'), url);
    }
  });

  // Print card: a header with the time, sol and link, then the map and the plan.
  function fillPrintHeader() {
    var head = document.getElementById('print-head');
    var mt = SeraMarsTime.localTime(Date.now(), (S.terrain.west + S.terrain.east) / 2, (S.terrain.north + S.terrain.south) / 2);
    head.querySelector('.ph-when').textContent = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC · ' +
      tr('Curiosity sol') + ' ' + mt.mslSol +
      ' · ' + tr('EVA start') + ' ' + startEl.value + ' ' + tr('local solar time');
    head.querySelector('.ph-link').textContent = planLink() || location.href;
  }
  window.addEventListener('beforeprint', function () {
    fillPrintHeader();
    S.map.invalidateSize();
    if (S.plan.base) S.map.fitBounds(S.evaBounds(), { animate: false, padding: [10, 10] });
  });
  window.addEventListener('afterprint', function () { S.map.invalidateSize(); });
  printBtn.addEventListener('click', function () {
    if (!S.plan.base) { note(tr('Place the base first.')); return; }
    window.print();
  });

  // Open a shared plan.
  var m = /[?&]p=([\d.\-]+)/.exec(location.search);
  if (m) {
    var t = /[?&]t=(\d\d)(?::|%3A)(\d\d)/i.exec(location.search);
    if (t) startEl.value = t[1] + ':' + t[2];
    var welcome = document.getElementById('welcome');
    if (welcome) welcome.hidden = true;
    m[1].split('-').forEach(function (rc) {
      var a = rc.split('.'), r = +a[0], c = +a[1];
      if (!(r >= 0 && c >= 0 && r < S.terrain.rows && c < S.terrain.cols)) return;
      var ll = T.cellToLatLon(S.terrain, r, c);
      S.map.fire('click', { latlng: L.latLng(ll.lat, ll.lon) });
    });
    S.setActive('eva');
    S.map.fitBounds(S.evaBounds(), { padding: [20, 20], animate: false });
  }
})();
