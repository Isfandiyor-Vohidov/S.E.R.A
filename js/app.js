// S.E.R.A — Safe Exploration & Returning Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// app.js: map, layers and view switching (Mars -> Gale Crater -> EVA zone).

(function () {
  'use strict';

  var MARS_RADIUS_M = 3396190; // IAU mean equatorial radius of Mars
  var M_PER_DEG_LAT = Math.PI * MARS_RADIUS_M / 180;

  // PROVISIONAL centre of the 2 x 2 km EVA zone (lower Mount Sharp, Gale Crater).
  // To be confirmed by the team against the Curiosity traverse.
  var EVA_CENTER = { lat: -4.74, lon: 137.39 };
  var EVA_SIZE_M = 2000;

  var GALE_CENTER = [-5.1, 137.8];

  // NASA Mars Trek WMTS, equirectangular grid (2 x 1 tiles at zoom 0).
  var TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/';
  function trekUrl(layer, ext) {
    return TREK + layer + '/1.0.0/default/default028mm/{z}/{y}/{x}.' + ext;
  }

  // Same projection as the Trek tiles, but distances use the Mars radius.
  var marsCRS = L.extend({}, L.CRS.EPSG4326, { R: MARS_RADIUS_M });

  var map = L.map('map', {
    crs: marsCRS,
    center: [0, 0],
    zoom: 1,
    minZoom: 0,
    maxZoom: 17,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1,
    worldCopyJump: false
  });

  var viking = L.tileLayer(trekUrl('Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg'), {
    maxNativeZoom: 7,
    maxZoom: 17,
    noWrap: true,
    attribution: 'NASA Mars Trek · Viking MDIM 2.1 (USGS)'
  }).addTo(map);

  var galeBounds = [[-6.58, 135.18], [-2.80, 139.25]];
  var ctx = L.tileLayer(trekUrl('Gale_CTX_BlockAdj_dd', 'png'), {
    minZoom: 5,
    maxNativeZoom: 12,
    maxZoom: 17,
    bounds: galeBounds,
    noWrap: true,
    attribution: 'MRO CTX Gale mosaic (NASA/JPL/MSSS)'
  }).addTo(map);

  var hiriseBounds = [[-4.926, 137.122], [-4.248, 137.730]];
  var hirise = L.tileLayer(trekUrl('curiosity_hirise_mosaic', 'png'), {
    minZoom: 9,
    maxNativeZoom: 16,
    maxZoom: 17,
    bounds: hiriseBounds,
    noWrap: true,
    attribution: 'MRO HiRISE mosaic (NASA/JPL/University of Arizona)'
  }).addTo(map);

  L.control.layers(null, {
    'CTX · Gale Crater (6 m)': ctx,
    'HiRISE · Curiosity site (25 cm)': hirise
  }, { collapsed: true }).addTo(map);

  L.control.scale({ imperial: false, maxWidth: 160 }).addTo(map);

  // EVA zone rectangle, EVA_SIZE_M on each side.
  function evaBounds() {
    var dLat = (EVA_SIZE_M / 2) / M_PER_DEG_LAT;
    var dLon = dLat / Math.cos(EVA_CENTER.lat * Math.PI / 180);
    return L.latLngBounds(
      [EVA_CENTER.lat - dLat, EVA_CENTER.lon - dLon],
      [EVA_CENTER.lat + dLat, EVA_CENTER.lon + dLon]
    );
  }

  var evaRect = L.rectangle(evaBounds(), {
    color: '#e2703a',
    weight: 2,
    fill: false,
    dashArray: '6 4',
    interactive: false
  }).addTo(map);

  // Cursor coordinates (planetocentric latitude, east longitude).
  var coords = L.control({ position: 'bottomright' });
  coords.onAdd = function () {
    this._div = L.DomUtil.create('div', 'coords');
    this._div.textContent = 'lat —  lon —';
    return this._div;
  };
  coords.addTo(map);
  map.on('mousemove', function (e) {
    coords._div.textContent = 'lat ' + e.latlng.lat.toFixed(4) + '°  lon ' + e.latlng.lng.toFixed(4) + '°E';
  });

  // View switching: Mars -> Gale Crater -> EVA zone.
  var views = {
    mars: function () { map.flyTo([0, 0], 1, { duration: 1.2 }); },
    gale: function () { map.flyTo(GALE_CENTER, 7, { duration: 1.5 }); },
    eva: function () { map.flyToBounds(evaRect.getBounds(), { padding: [30, 30], duration: 1.8 }); }
  };

  var buttons = document.querySelectorAll('.zoom-steps button');
  function setActive(name) {
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].getAttribute('data-view') === name);
    }
  }
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      var name = this.getAttribute('data-view');
      setActive(name);
      views[name]();
    });
  }
  setActive('mars');

  // Exposed for the next modules and for testing in the console.
  window.SERA = { map: map, evaBounds: evaBounds, EVA_CENTER: EVA_CENTER, EVA_SIZE_M: EVA_SIZE_M };
})();
