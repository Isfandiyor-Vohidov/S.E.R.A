// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// crism.js: science near the route. Mineral signals in the EVA zone from MRO CRISM
// (data/crism.js and img/crism-zone.png, built by tools/prep_crism.py): a colour layer and the
// strongest spots, which can be added to the plan as named science points.

(function () {
  'use strict';

  var C = window.SERA_CRISM;
  var S = window.SERA;
  if (!C || !S) return;
  var map = S.map;
  var tr = function (s) { return window.SeraI18n ? SeraI18n.t(s) : s; };
  var byId = {};
  C.classes.forEach(function (c) { byId[c.id] = c; });

  var layer = L.layerGroup();
  L.imageOverlay('img/crism-zone.png', C.bounds, { opacity: 0.85, interactive: false, className: 'crism-layer' }).addTo(layer);

  // A mineral spot is often on a steep outcrop. Move each spot to the nearest safe ground
  // (slope under 15°) within 100 m, so it can be walked to; drop it if there is none.
  var T = SeraTerrain, terrain = S.terrain;
  C.spots = C.spots.filter(function (s) {
    var cell = T.latLonToCell(terrain, s.lat, s.lon);
    if (!cell) return false;
    var R = Math.round(100 / terrain.cellM), best = null, bestD = Infinity;
    for (var dr = -R; dr <= R; dr++) {
      for (var dc = -R; dc <= R; dc++) {
        var r = cell.r + dr, c = cell.c + dc;
        if (r < 1 || c < 1 || r >= terrain.rows - 1 || c >= terrain.cols - 1) continue;
        var d = Math.hypot(dr, dc) * terrain.cellM;
        if (d <= 100 && d < bestD && terrain.slopeDeg[r * terrain.cols + c] < 15) { bestD = d; best = { r: r, c: c }; }
      }
    }
    if (!best) return false;
    var p = T.cellToLatLon(terrain, best.r, best.c);
    s.peak = [s.lat, s.lon];
    s.lat = p.lat; s.lon = p.lon; s.offsetM = Math.round(bestD);
    return true;
  });

  function strength(v) { return v >= 0.4 ? 'strong' : (v >= 0.25 ? 'moderate' : 'weak'); }

  C.spots.forEach(function (s) {
    var c = byId[s.cls];
    var m = L.marker([s.lat, s.lon], {
      icon: L.divIcon({ className: '', html: '<div class="crism-spot" style="background:' + c.color + '"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
      title: c.name
    }).addTo(layer);
    m.bindPopup(function () {
      return '<div class="msl-pop"><b>' + tr(c.name) + '</b>' +
        '<span>CRISM ' + c.band + ' · ' + tr('signal') + ' ' + s.signal.toFixed(2) + ' (' + tr(strength(s.signal)) + '), ' +
        tr('zone typical') + ' ' + s.typical.toFixed(2) + '</span>' +
        '<span>' + (s.offsetM > 0 ? tr('Safe ground') + ' ' + s.offsetM + ' m ' + tr('from the strongest signal (slope under 15°).') + ' '
          : '') + tr('Relative signal from CRISM browse images, not abundance. Check it on the ground.') + '</span>' +
        '<span>MRO CRISM ' + C.observations.join(', ') + ' · NASA/JHU-APL</span>' +
        '<button type="button" class="msl-add" data-lat="' + s.lat + '" data-lon="' + s.lon + '">' + tr('Add as science point') + '</button></div>';
    }, { maxWidth: 280, minWidth: 240 });
  });

  // A science point within 40 m of a spot takes the spot's name.
  S.addNamer(function (lat, lon) {
    var best = null, bestD = 40;
    C.spots.forEach(function (s) {
      var d = Math.hypot((lat - s.lat) * 59274, (lon - s.lon) * 59274 * Math.cos(lat * Math.PI / 180));
      if (d < bestD) { bestD = d; best = s; }
    });
    return best ? tr(byId[best.cls].short) : null;
  });

  var legend = document.getElementById('crism-legend');
  if (legend) {
    legend.innerHTML = C.classes.filter(function (c) { return c.share > 0 || C.spots.some(function (s) { return s.cls === c.id; }); })
      .map(function (c) { return '<li><span class="sw" style="background:' + c.color + '"></span>' + tr(c.short) + '</li>'; }).join('');
  }

  var toggle = document.getElementById('btn-crism');
  function setOn(on) {
    if (on) layer.addTo(map); else map.removeLayer(layer);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (legend) legend.hidden = !on;
  }
  toggle.addEventListener('click', function () { setOn(!map.hasLayer(layer)); });
  setOn(false);
  S.crism = { setOn: setOn };
})();
