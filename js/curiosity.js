// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// curiosity.js: the real path of the Curiosity rover through our EVA zone, with Navcam photos
// taken at its stops (data/msl.js, built by tools/prep_msl.mjs). A rover stop can be added
// to the plan as a science point: a place a real mission found worth studying.

(function () {
  'use strict';

  var M = window.SERA_MSL;
  var S = window.SERA;
  if (!M || !S) return;
  var map = S.map;

  var layer = L.layerGroup();
  var lineStyle = { color: '#EDF2EA', weight: 2, opacity: 0.85, dashArray: '1 5', lineCap: 'round', interactive: false };
  M.traverse.forEach(function (piece) { L.polyline(piece, lineStyle).addTo(layer); });

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  M.stops.forEach(function (s) {
    var hasPhoto = !!s.photo;
    var m = L.circleMarker([s.lat, s.lon], {
      radius: hasPhoto ? 5 : 3, weight: hasPhoto ? 2 : 1,
      color: '#0C171A', fillColor: hasPhoto ? '#A7F1C2' : '#EDF2EA', fillOpacity: 1
    }).addTo(layer);
    m.bindPopup(function () {
      var html = '<div class="msl-pop"><b>Curiosity · sol ' + s.sol + '</b>' +
        '<span>Stop ' + s.site + '/' + s.drive + ' · elevation ' + s.elev.toFixed(0) + ' m</span>';
      if (hasPhoto) {
        html += '<a href="' + esc(s.photo.full) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(s.photo.full) + '" alt="Curiosity Navcam view, sol ' + s.sol + '" loading="lazy" width="260" height="260"></a>' +
          '<span>Navcam, ' + esc(s.photo.lmst) + ' local mean time, looking ' + s.photo.az + '° · ' + esc(s.photo.credit) + '</span>';
      }
      html += '<button type="button" class="msl-add" data-lat="' + s.lat + '" data-lon="' + s.lon + '">Add as science point</button></div>';
      return html;
    }, { maxWidth: 280, minWidth: 260 });
  });

  map.on('popupopen', function (e) {
    var btn = e.popup.getElement().querySelector('.msl-add');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var latlng = L.latLng(+btn.getAttribute('data-lat'), +btn.getAttribute('data-lon'));
      map.closePopup();
      map.fire('click', { latlng: latlng });   // same as clicking the spot on the map
    });
  });

  var toggle = document.getElementById('btn-msl');
  function setOn(on) {
    if (on) layer.addTo(map); else map.removeLayer(layer);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  toggle.addEventListener('click', function () { setOn(!map.hasLayer(layer)); });
  setOn(true);
})();
