// S.E.R.A — Safe Exploration & Returning Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// app.js: map, layers and view switching (Mars -> Gale Crater -> EVA zone).

(function () {
  'use strict';

  var MARS_RADIUS_M = 3396190; // IAU mean equatorial radius of Mars

  // Real terrain of the 2 x 2 km EVA zone (boxwork area on Mount Sharp, Gale Crater),
  // cut from the USGS 1 m DEM by tools/prep_dem.mjs.
  var T = SeraTerrain;
  var terrain = T.createTerrain(window.SERA_TERRAIN);

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

  // EVA zone rectangle = exact frame of the terrain grid.
  function evaBounds() {
    return L.latLngBounds([terrain.south, terrain.west], [terrain.north, terrain.east]);
  }

  // Slope layer: one canvas pixel per terrain cell, yellow = caution, red = no-go.
  function buildSlopeLayer() {
    var canvas = document.createElement('canvas');
    canvas.width = terrain.cols;
    canvas.height = terrain.rows;
    var g = canvas.getContext('2d');
    var img = g.createImageData(terrain.cols, terrain.rows);
    var s = terrain.slopeDeg;
    for (var i = 0; i < s.length; i++) {
      var p = i * 4;
      if (s[i] > T.SLOPE_BLOCK_DEG) {
        img.data[p] = 229; img.data[p + 1] = 72; img.data[p + 2] = 77; img.data[p + 3] = 190;
      } else if (s[i] >= T.SLOPE_CAUTION_DEG) {
        img.data[p] = 230; img.data[p + 1] = 185; img.data[p + 2] = 60; img.data[p + 3] = 140;
      }
    }
    g.putImageData(img, 0, 0);
    return L.imageOverlay(canvas.toDataURL(), evaBounds(), { interactive: false, className: 'slope-layer' });
  }
  var slopes = buildSlopeLayer().addTo(map);

  L.control.layers(null, {
    'CTX · Gale Crater (6 m)': ctx,
    'HiRISE · Curiosity site (25 cm)': hirise,
    'Slopes · 1 m DEM (15° / 25°)': slopes
  }, { collapsed: true }).addTo(map);

  L.control.scale({ imperial: false, maxWidth: 160 }).addTo(map);

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
    var text = 'lat ' + e.latlng.lat.toFixed(4) + '°  lon ' + e.latlng.lng.toFixed(4) + '°E';
    var elev = T.elevationAt(terrain, e.latlng.lat, e.latlng.lng);
    if (elev !== null) {
      text += '  elev ' + elev.toFixed(0) + ' m  slope ' +
        T.slopeAt(terrain, e.latlng.lat, e.latlng.lng).toFixed(0) + '°';
    }
    coords._div.textContent = text;
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

  // ---- EVA plan: base + science points by click, route and way home ----

  var P = SeraPath;
  var PL = SeraPlanner;
  var plan = { base: null, stops: [], field: null, baseOut: null, legs: [], home: null, budget: null };
  var routeLayer = L.layerGroup().addTo(map);
  var hintEl = document.getElementById('hint');
  var stopsEl = document.getElementById('stops');
  var summaryEl = document.getElementById('summary');

  function fmtMin(seconds) {
    var m = Math.round(seconds / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + ' min';
  }
  function fmtDist(m) {
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km';
  }
  function cellLatLng(cell) {
    var p = T.cellToLatLon(terrain, cell.r, cell.c);
    return [p.lat, p.lon];
  }
  function setHint(text, warn) {
    hintEl.textContent = text;
    hintEl.classList.toggle('warn', !!warn);
  }

  function cellIndex(cell) { return cell.r * terrain.cols + cell.c; }

  // Recomputes the plan: fastest visiting order, legs, way home and suit budget.
  // Each stop keeps its own "from here" field, so adding a point costs one field.
  function recompute() {
    plan.legs = [];
    plan.home = null;
    plan.budget = null;
    if (!plan.base) return;
    var nodes = [plan.base].concat(plan.stops);
    var fields = [plan.baseOut].concat(plan.stops.map(function (s) { return s.field; }));
    var matrix = nodes.map(function (a, i) {
      return nodes.map(function (b) { return fields[i].timeS[cellIndex(b)]; });
    });
    var homeS = nodes.map(function (n) { return plan.field.timeS[cellIndex(n)]; });
    var order = PL.bestOrder(matrix);
    plan.budget = PL.evaluate(matrix, order, homeS);
    plan.stops = order.map(function (k) { return nodes[k]; });

    var fromField = plan.baseOut;
    for (var i = 0; i < plan.stops.length; i++) {
      var s = plan.stops[i];
      plan.legs.push(P.pathTo(terrain, fromField, s));
      s.homeS = plan.field.timeS[cellIndex(s)];
      s.marginS = plan.budget.stops[i].marginS;
      fromField = s.field;
    }
    if (plan.stops.length) {
      plan.home = P.pathHome(terrain, plan.field, plan.stops[plan.stops.length - 1]);
    }
  }

  function icon(label, isBase) {
    return L.divIcon({
      className: '',
      html: '<div class="stop-icon' + (isBase ? ' base' : '') + '">' + label + '</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  function render() {
    routeLayer.clearLayers();
    stopsEl.innerHTML = '';

    if (!plan.base) {
      setHint('Click inside the EVA zone to place the base (habitat).');
      summaryEl.hidden = true;
      return;
    }

    var i, totalS = 0, totalM = 0, broken = false;
    for (i = 0; i < plan.legs.length; i++) {
      var leg = plan.legs[i];
      if (!leg) { broken = true; continue; }
      totalS += leg.timeS; totalM += leg.distM;
      L.polyline(leg.cells.map(cellLatLng), { color: '#e2703a', weight: 4, opacity: 0.95 }).addTo(routeLayer);
    }
    if (plan.home) {
      totalS += plan.home.timeS; totalM += plan.home.distM;
      L.polyline(plan.home.cells.map(cellLatLng), { color: '#5ab0ff', weight: 3, dashArray: '8 6' }).addTo(routeLayer);
    }

    L.marker(cellLatLng(plan.base), { icon: icon('H', true), interactive: false }).addTo(routeLayer);
    var li = document.createElement('li');
    li.innerHTML = '<span class="badge base">H</span><span class="name">Base</span><span></span>' +
      '<span class="meta">start and finish · elev ' + terrain.elev[plan.base.r * terrain.cols + plan.base.c].toFixed(0) + ' m</span>';
    stopsEl.appendChild(li);

    plan.stops.forEach(function (s, idx) {
      L.marker(cellLatLng(s), { icon: icon(idx + 1, false), interactive: false }).addTo(routeLayer);
      var leg = plan.legs[idx];
      var item = document.createElement('li');
      item.innerHTML = '<span class="badge">' + (idx + 1) + '</span><span class="name">Science point ' + (idx + 1) + '</span>' +
        '<button type="button" class="del" title="Remove" data-i="' + idx + '">×</button>' +
        '<span class="meta">' + (leg ? 'leg ' + fmtDist(leg.distM) + ' · ' + fmtMin(leg.timeS) : 'no safe path') +
        ' · home from here ' + (isFinite(s.homeS) ? fmtMin(s.homeS) : '—') + '</span>';
      stopsEl.appendChild(item);
    });

    if (!plan.stops.length) {
      setHint('Base is set. Click to add science points.');
      summaryEl.hidden = true;
    } else {
      var b = plan.budget;
      setHint(broken ? 'Some points cannot be reached on safe slopes.'
        : 'Points are visited in the fastest order. Orange: route out. Blue dashed: way home.', broken);
      summaryEl.hidden = false;
      summaryEl.innerHTML =
        '<span>EVA time <span class="tag">MODEL</span></span><span class="big">' + fmtMin(b.totalS) + '</span>' +
        '<span>Walking · ' + fmtDist(totalM) + '</span><span>' + fmtMin(b.walkS) + '</span>' +
        '<span>Science work · ' + plan.stops.length + ' × ' + PL.WORK_MIN_PER_STOP + ' min</span><span>' + fmtMin(b.workS) + '</span>' +
        '<span>Suit limit · ' + PL.SUIT_HOURS + ' h − ' + Math.round(PL.RESERVE_SHARE * 100) + ' % reserve</span><span>' + fmtMin(b.usableS) + '</span>' +
        '<span>Margin <span class="tag">MODEL</span></span><span class="' + (b.fits ? 'ok' : 'bad') + '">' +
        (b.fits ? fmtMin(b.marginS) : 'over by ' + fmtMin(-b.marginS)) + '</span>';
    }
  }

  map.on('click', function (e) {
    var cell = T.latLonToCell(terrain, e.latlng.lat, e.latlng.lng);
    if (!cell) {
      setHint('Click inside the dashed EVA zone.', true);
      return;
    }
    var i = cell.r * terrain.cols + cell.c;
    if (terrain.slopeDeg[i] > T.SLOPE_BLOCK_DEG) {
      setHint('Too steep here (' + terrain.slopeDeg[i].toFixed(0) + '°, limit ' + T.SLOPE_BLOCK_DEG + '°). Pick another spot.', true);
      return;
    }
    if (!plan.base) {
      plan.base = cell;
      plan.field = P.homeField(terrain, cell);
      plan.baseOut = P.travelField(terrain, cell);
    } else {
      if (!isFinite(plan.field.timeS[i])) {
        setHint('No safe way home from this spot. Pick another one.', true);
        return;
      }
      plan.stops.push({ r: cell.r, c: cell.c, field: P.travelField(terrain, cell) });
    }
    recompute();
    render();
  });

  stopsEl.addEventListener('click', function (e) {
    var idx = e.target.getAttribute && e.target.getAttribute('data-i');
    if (idx === null || idx === undefined) return;
    plan.stops.splice(+idx, 1);
    recompute();
    render();
  });

  document.getElementById('btn-clear').addEventListener('click', function () {
    plan.base = null; plan.stops = []; plan.field = null; plan.baseOut = null;
    recompute();
    render();
  });

  render();

  // Exposed for the next modules and for testing in the console.
  window.SERA = { map: map, terrain: terrain, evaBounds: evaBounds, plan: plan };
})();
