// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// twin.js: Mission Twin, the team's idea. For one science point SERA shows two futures side by side:
//   Route A — the fastest way (the planner's own route model);
//   Route B — the gentle way: 15-25 deg slopes cost 8 times more, so it keeps to flatter ground.
// Both are walked there and back; the table compares distance, steep ground, the slowest step,
// time out, time back and the spare suit time, and SERA recommends one. Both routes are drawn on the map.

(function () {
  'use strict';

  var S = window.SERA, P = SeraPath, PL = SeraPlanner, T = SeraTerrain;
  if (!S) return;
  var terrain = S.terrain, plan = S.plan, map = S.map;
  var GENTLE = 8;                      // MODEL: cost factor on 15-25 deg slopes for route B

  var btn = document.getElementById('btn-twin');
  var dlg = document.getElementById('twin');
  var layer = L.layerGroup();

  function idx(c) { return c.r * terrain.cols + c.c; }
  function fmtMin(s) {
    var m = Math.round(s / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  // Numbers of one walk (list of cells).
  function stats(path) {
    var steep = 0, maxSlope = 0;
    for (var i = 1; i < path.cells.length; i++) {
      var s = terrain.slopeDeg[idx(path.cells[i])];
      if (s >= T.SLOPE_CAUTION_DEG) steep += terrain.cellM * ((path.cells[i].r !== path.cells[i - 1].r && path.cells[i].c !== path.cells[i - 1].c) ? Math.SQRT2 : 1);
      if (s > maxSlope) maxSlope = s;
    }
    return { steepM: steep, maxSlope: maxSlope };
  }

  function route(target, caution) {
    var out = P.findPath(terrain, plan.base, target, caution);
    var back = P.findPath(terrain, target, plan.base, caution);
    if (!out || !back) return null;
    var a = stats(out), b = stats(back);
    var workS = PL.WORK_MIN_PER_STOP * 60;
    var usableS = PL.SUIT_HOURS * 3600 * (1 - PL.RESERVE_SHARE);
    var distM = out.distM + back.distM, steepM = a.steepM + b.steepM;
    return {
      out: out, back: back, distM: distM, steepM: steepM, steepPct: steepM / distM * 100,
      maxSlope: Math.max(a.maxSlope, b.maxSlope), outS: out.timeS, backS: back.timeS,
      spareS: usableS - (out.timeS + workS + back.timeS)
    };
  }

  function draw(r, color, dash) {
    [r.out, r.back].forEach(function (p, k) {
      var pts = p.cells.map(S.cellLatLng);
      L.polyline(pts, { color: '#0C171A', weight: 7, opacity: 0.5, interactive: false }).addTo(layer);
      L.polyline(pts, { color: color, weight: 4, opacity: 1, dashArray: k ? '8 6' : dash, interactive: false }).addTo(layer);
    });
  }

  function open(stopIdx) {
    if (!plan.base || !plan.stops.length) return;
    if (stopIdx === undefined) stopIdx = 0;
    var target = plan.stops[stopIdx];
    var A = route(target, 0), B = route(target, GENTLE);
    layer.clearLayers();
    if (!A || !B) return;
    var same = Math.abs(A.distM - B.distM) < 1 && Math.abs(A.steepM - B.steepM) < 1;
    // SERA's choice: the gentle way if it saves at least a third of the steep ground and still fits.
    var pickB = !same && B.spareS >= 0 && B.steepM <= A.steepM * 0.67;
    var name = S.stopName(target, stopIdx);

    var sel = dlg.querySelector('#twin-stop');
    sel.innerHTML = plan.stops.map(function (s, i) {
      return '<option value="' + i + '"' + (i === stopIdx ? ' selected' : '') + '>' + S.stopName(s, i) + '</option>';
    }).join('');

    function row(label, a, b) { return '<tr><th>' + label + '</th><td>' + a + '</td><td>' + b + '</td></tr>'; }
    var mark = function (isPick) { return same ? '<span class="twin-ok">= same route</span>' : isPick ?'<span class="twin-ok">✓ SERA picks this</span>' : '<span class="twin-warn">⚠</span>'; };
    dlg.querySelector('.twin-table').innerHTML =
      '<thead><tr><th></th><th><i class="sw sw-a"></i>Route A · fastest</th><th><i class="sw sw-b"></i>Route B · gentle</th></tr></thead><tbody>' +
      row('Distance (there and back)', (A.distM / 1000).toFixed(2) + ' km', (B.distM / 1000).toFixed(2) + ' km') +
      row('Steep ground 15–25°', Math.round(A.steepM) + ' m · ' + A.steepPct.toFixed(0) + ' %', Math.round(B.steepM) + ' m · ' + B.steepPct.toFixed(0) + ' %') +
      row('Steepest step', A.maxSlope.toFixed(0) + '°', B.maxSlope.toFixed(0) + '°') +
      row('Time there', fmtMin(A.outS), fmtMin(B.outS)) +
      row('Time back', fmtMin(A.backS), fmtMin(B.backS)) +
      row('Spare suit time', fmtMin(A.spareS), fmtMin(B.spareS)) +
      row('Recommendation', mark(!pickB), mark(pickB)) + '</tbody>';
    var why;
    if (same) why = 'For ' + name + ' the fastest way is already the gentlest: both routes are the same.';
    else if (pickB) why = 'Route B takes ' + fmtMin(B.outS + B.backS - A.outS - A.backS) + ' longer but walks ' +
      Math.round(A.steepM - B.steepM) + ' m less on steep ground. With a heavy suit and samples, I would take B.';
    else why = 'Route B does not avoid enough steep ground to be worth the extra time. Route A is the better choice.';
    dlg.querySelector('.twin-why').textContent = why;

    draw(A, '#E78F67', null);
    if (!same) draw(B, '#7CC4FF', '2 0');
    layer.addTo(map);
    dlg.hidden = false;
    // Fit both routes into the part of the map the card does not cover.
    var b = L.latLngBounds([]);
    layer.eachLayer(function (l) { if (l.getBounds) b.extend(l.getBounds()); });
    var phone = map.getContainer().clientWidth < 760;
    map.fitBounds(b, phone ? { paddingTopLeft: [16, 16], paddingBottomRight: [16, dlg.offsetHeight + 16] }
                           : { paddingTopLeft: [dlg.offsetWidth + 24, 16], paddingBottomRight: [16, 16] });
  }
  function close() { dlg.hidden = true; layer.clearLayers(); map.removeLayer(layer); }

  btn.addEventListener('click', function () { open(0); });
  dlg.querySelector('#twin-stop').addEventListener('change', function () { open(+this.value); });
  dlg.querySelector('.twin-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dlg.hidden) close(); });
  setInterval(function () { btn.disabled = !(plan.base && plan.stops.length); }, 500);

  window.SeraTwin = { open: open, close: close };
})();
