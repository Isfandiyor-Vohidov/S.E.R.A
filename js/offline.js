// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// offline.js: registers the service worker (sw.js) and, in the planner, the "Save offline" button:
// it downloads the map tiles of Gale Crater and of the EVA zone once, so the planner works in the
// field without internet. Live space weather then shows the last saved answer, marked cached.

(function () {
  'use strict';

  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch(function () { /* offline mode is optional */ });

  var S = window.SERA;
  var btn = document.getElementById('btn-offline');
  if (!S || !btn || !S.tileLayers) return;
  var tr = function (s) { return window.SeraI18n ? SeraI18n.t(s) : s; };
  var noteEl = document.getElementById('share-note');

  // Tile x/y for the Leaflet EPSG:4326 grid (2 x 1 tiles at zoom 0).
  function tilesFor(layer, bounds, z0, z1) {
    var out = [];
    for (var z = z0; z <= z1; z++) {
      var deg = 180 / Math.pow(2, z);
      var x0 = Math.floor((bounds.getWest() + 180) / deg), x1 = Math.floor((bounds.getEast() + 180) / deg);
      var y0 = Math.floor((90 - bounds.getNorth()) / deg), y1 = Math.floor((90 - bounds.getSouth()) / deg);
      for (var x = x0; x <= x1; x++) {
        for (var y = y0; y <= y1; y++) out.push(layer.getTileUrl({ x: x, y: y, z: z }));
      }
    }
    return out;
  }

  // While saving, the same button cancels (files already saved stay saved).
  var saving = null;
  btn.addEventListener('click', function () {
    if (saving) { saving.cancelled = true; return; }
    var zone = S.evaBounds().pad(0.15);
    var gale = L.latLngBounds([[-6.6, 135.2], [-2.8, 139.3]]);
    var world = L.latLngBounds([[-90, -180], [90, 180]]);
    var urls = []
      .concat(tilesFor(S.tileLayers.viking, world, 0, 3))
      .concat(tilesFor(S.tileLayers.viking, gale, 4, 7))
      .concat(tilesFor(S.tileLayers.ctx, gale, 5, 8))
      .concat(tilesFor(S.tileLayers.ctx, zone, 9, 12))
      .concat(tilesFor(S.tileLayers.hirise, zone, 9, 16));
    // Curiosity photos in the zone.
    if (window.SERA_MSL) SERA_MSL.stops.forEach(function (s) { if (s.photo) urls.push(s.photo.full); });
    var done = 0, failed = 0, total = urls.length, next = 0;
    var run = saving = { cancelled: false };
    btn.classList.add('saving');
    btn.title = tr('Click to cancel');
    function finish(text, note) {
      saving = null;
      btn.classList.remove('saving');
      btn.title = '';
      btn.textContent = text;
      noteEl.textContent = note;
      noteEl.hidden = false;
    }
    function step() {
      if (run.cancelled) {
        if (next !== -1) { next = -1; finish(tr('Save offline'), done + ' / ' + total + ' ' + tr('map files saved. Saving cancelled.')); }
        return;
      }
      if (next >= total) return;
      var u = urls[next++];
      // Same request mode as the map's <img> tiles, so the saved copy is the one the map asks for.
      fetch(u, { mode: 'no-cors' })
        .catch(function () { failed++; })
        .then(function () {
          done++;
          if (run.cancelled) return step();
          btn.textContent = tr('Saving') + ' ' + Math.round(done / total * 100) + ' % · ' + tr('Cancel');
          if (done === total) {
            finish(tr('Saved offline ✓'), (total - failed) + ' / ' + total + ' ' + tr('map files saved. The planner now works without internet.'));
          } else step();
        });
    }
    for (var i = 0; i < 6; i++) step();
  });
})();
