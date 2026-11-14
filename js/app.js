// S.E.R.A — Safe Exploration & Return Assistant
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

  // Overlays sit on natural Mars imagery, so they use fixed colours in both themes.
  var MAP_COLORS = {
    route: '#E78F67', home: '#A7F1C2', outline: '#0C171A', zone: '#E78F67',
    caution: [240, 188, 84], nogo: [239, 100, 100]
  };

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
      var col = s[i] > T.SLOPE_BLOCK_DEG ? MAP_COLORS.nogo : (s[i] >= T.SLOPE_CAUTION_DEG ? MAP_COLORS.caution : null);
      if (col) {
        img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2];
        img.data[p + 3] = s[i] > T.SLOPE_BLOCK_DEG ? 180 : 130;
      }
    }
    g.putImageData(img, 0, 0);
    return L.imageOverlay(canvas.toDataURL(), evaBounds(), { interactive: false, className: 'slope-layer' });
  }
  var slopes = buildSlopeLayer().addTo(map);

  // Extra NASA layers (off by default): USGS global geology and THEMIS night infrared.
  // Bright in THEMIS night IR = stays warm at night = rock or coarse ground; dark = fine dust/sand.
  var geology = L.tileLayer('https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm/{z}/{y}/{x}.png', {
    maxNativeZoom: 5, maxZoom: 17, noWrap: true, opacity: 0.6,
    attribution: 'USGS SIM 3292 Geologic Map of Mars (Tanaka et al. 2014)'
  });
  var themis = L.tileLayer(trekUrl('THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', 'png'), {
    maxNativeZoom: 11, maxZoom: 17, noWrap: true, opacity: 0.75,
    attribution: 'Mars Odyssey THEMIS night IR 100 m (NASA/JPL/ASU)'
  });

  var layersCtl = L.control.layers(null, {
    'CTX · Gale Crater (6 m)': ctx,
    'HiRISE · Curiosity site (25 cm)': hirise,
    'Slopes · 1 m DEM (15° / 25°)': slopes,
    'Geology · USGS SIM 3292': geology,
    'Thermal · THEMIS night IR': themis
  }, { collapsed: true }).addTo(map);

  L.control.scale({ imperial: false, maxWidth: 160 }).addTo(map);

  var evaRect = L.rectangle(evaBounds(), {
    color: MAP_COLORS.zone,
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

  var buttons = document.querySelectorAll('.zoom-steps button[data-view]');
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
  var verdictEl = document.getElementById('verdict');
  var factorsEl = document.getElementById('factors');
  var startEl = document.getElementById('start-time');
  var stormBtn = document.getElementById('btn-storm');
  var R = SeraRisk;
  var MT = SeraMarsTime;
  var zoneLat = (terrain.north + terrain.south) / 2;
  var zoneLon = (terrain.west + terrain.east) / 2;
  var space = {};          // live space weather (NASA DONKI), filled by loadSpaceWeather()
  var stormSimulated = false;
  var MARKS = ['✓', '!', '✕'];

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
    plan.sorties = plan.budget.fits ? null : PL.splitSorties(matrix, order, homeS);
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

  // Science points are named by what is there (CRISM signal, Curiosity stop), if a layer knows.
  var namers = [];
  function stopName(s, idx, namedOnly) {
    var ll = cellLatLng(s);
    for (var i = 0; i < namers.length; i++) {
      var n = namers[i](ll[0], ll[1]);
      if (n) return n;
    }
    if (namedOnly) return null;
    return (window.SeraI18n ? SeraI18n.t('Science point') : 'Science point') + ' ' + (idx + 1);
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
    verdictEl.hidden = true;
    factorsEl.innerHTML = '';

    if (!plan.base) {
      setHint('Click inside the EVA zone to place the base (habitat).');
      summaryEl.hidden = true;
      renderProfile();
      return;
    }

    var i, totalS = 0, totalM = 0, broken = false;
    for (i = 0; i < plan.legs.length; i++) {
      var leg = plan.legs[i];
      if (!leg) { broken = true; continue; }
      totalS += leg.timeS; totalM += leg.distM;
      var outPts = leg.cells.map(cellLatLng);
      L.polyline(outPts, { color: MAP_COLORS.outline, weight: 7, opacity: 0.55, interactive: false }).addTo(routeLayer);
      L.polyline(outPts, { color: MAP_COLORS.route, weight: 4, opacity: 1, interactive: false }).addTo(routeLayer);
    }
    if (plan.home) {
      totalS += plan.home.timeS; totalM += plan.home.distM;
      var homePts = plan.home.cells.map(cellLatLng);
      L.polyline(homePts, { color: MAP_COLORS.outline, weight: 6, opacity: 0.55, interactive: false }).addTo(routeLayer);
      L.polyline(homePts, { color: MAP_COLORS.home, weight: 3, dashArray: '8 6', interactive: false }).addTo(routeLayer);
    }

    dragMarker(L.marker(cellLatLng(plan.base), { icon: icon('H', true), draggable: true, title: 'Drag to move the base', keyboard: false }), -1).addTo(routeLayer);
    // The plan reads as a route (Mars-now card style): stop, the walk to the next one, ... home.
    function legRow(text, home) {
      var r = document.createElement('li');
      r.className = 'leg' + (home ? ' leg-home' : '');
      r.innerHTML = '<span class="rail"></span><span class="leg-text">' + text + '</span>';
      stopsEl.appendChild(r);
    }
    var elevBase = terrain.elev[plan.base.r * terrain.cols + plan.base.c].toFixed(0);
    var li = document.createElement('li');
    li.className = 'stop';
    li.innerHTML = '<span class="badge base">H</span><span class="name">Base · start</span>' +
      '<span class="val">' + (startEl.value || '') + '</span><span class="meta">habitat · elev ' + elevBase + ' m</span>';
    stopsEl.appendChild(li);

    plan.stops.forEach(function (s, idx) {
      dragMarker(L.marker(cellLatLng(s), { icon: icon(idx + 1, false), draggable: true, title: 'Drag to move this point', keyboard: false }), idx).addTo(routeLayer);
      var leg = plan.legs[idx];
      legRow(leg ? 'Walk ' + fmtDist(leg.distM) + ' · ' + fmtMin(leg.timeS) : 'No safe path', false);
      var item = document.createElement('li');
      item.className = 'stop';
      item.innerHTML = '<span class="badge">' + (idx + 1) + '</span><span class="name">' + stopName(s, idx) + '</span>' +
        '<span class="val" title="Time home from here">⌂ ' + (isFinite(s.homeS) ? fmtMin(s.homeS) : '—') + '</span>' +
        '<span class="meta">' + PL.WORK_MIN_PER_STOP + ' min science work · home from here</span>' +
        '<button type="button" class="del" title="Remove" data-i="' + idx + '">×</button>';
      stopsEl.appendChild(item);
    });
    if (plan.home) {
      legRow('Way home ' + fmtDist(plan.home.distM) + ' · ' + fmtMin(plan.home.timeS), true);
      var fin = document.createElement('li');
      fin.className = 'stop';
      fin.innerHTML = '<span class="badge base">H</span><span class="name">Base · back</span>' +
        '<span class="val">' + (plan.budget ? fmtMin(plan.budget.totalS) : '') + '</span><span class="meta">whole EVA</span>';
      stopsEl.appendChild(fin);
    }

    if (!plan.stops.length) {
      setHint('Base is set. Click to add science points.');
      summaryEl.hidden = true;
    } else {
      var b = plan.budget;
      setHint(broken ? 'Some points cannot be reached on safe slopes.'
        : 'Points are visited in the fastest order. Copper: route out. Mint dashed: way home.', broken);
      summaryEl.hidden = false;
      summaryEl.innerHTML =
        '<span>EVA time <span class="tag">MODEL</span></span><span class="big">' + fmtMin(b.totalS) + '</span>' +
        '<span>Walking · ' + fmtDist(totalM) + '</span><span>' + fmtMin(b.walkS) + '</span>' +
        '<span>Science work · ' + plan.stops.length + ' × ' + PL.WORK_MIN_PER_STOP + ' min</span><span>' + fmtMin(b.workS) + '</span>' +
        '<span>Suit limit · ' + PL.SUIT_HOURS + ' h − ' + Math.round(PL.RESERVE_SHARE * 100) + ' % reserve</span><span>' + fmtMin(b.usableS) + '</span>' +
        '<span>Margin <span class="tag">MODEL</span></span><span class="' + (b.fits ? 'ok' : 'bad') + '">' +
        (b.fits ? fmtMin(b.marginS) : 'over by ' + fmtMin(-b.marginS)) + '</span>';
      // §6: too long for one suit -> the same points as several EVAs from the base.
      if (plan.sorties && plan.sorties.length > 1) {
        summaryEl.innerHTML += '<span class="split-head">Split into ' + plan.sorties.length +
          ' EVAs <span class="tag">MODEL</span></span><span></span>';
        plan.sorties.forEach(function (so, n) {
          var a = so.stops[0] + 1, z = so.stops[so.stops.length - 1] + 1;
          summaryEl.innerHTML += '<span>EVA ' + (n + 1) + ' · points ' + (a === z ? a : a + '–' + z) + '</span>' +
            '<span class="' + (so.fits ? 'ok' : 'bad') + '">' + fmtMin(so.totalS) + '</span>';
        });
      }
      renderVerdict(broken);
    }
    renderProfile();
  }

  // Elevation profile of the whole route (out legs + way home) as inline SVG.
  var profileEl = document.getElementById('profile');
  function renderProfile() {
    var legs = plan.legs.filter(Boolean);
    if (!plan.base || !legs.length || !plan.home) {
      if (!profileEl.hidden) { profileEl.hidden = true; map.invalidateSize(); }
      return;
    }
    var wasHidden = profileEl.hidden;
    profileEl.hidden = false;
    if (wasHidden) map.invalidateSize();

    // Samples: distance along the route, elevation, part (0 = out, 1 = home), slope class.
    var pts = [], marks = [], d = 0;
    function addLeg(leg, part) {
      for (var i = 0; i < leg.cells.length; i++) {
        if (i > 0) {
          var a = leg.cells[i - 1], b = leg.cells[i];
          d += terrain.cellM * ((a.r !== b.r && a.c !== b.c) ? Math.SQRT2 : 1);
        } else if (pts.length) {
          continue; // same cell as the end of the previous leg
        }
        var idx = cellIndex(leg.cells[i]);
        pts.push({ d: d, z: terrain.elev[idx], part: part, steep: terrain.slopeDeg[idx] >= T.SLOPE_CAUTION_DEG });
      }
    }
    legs.forEach(function (leg, i) {
      addLeg(leg, 0);
      marks.push({ d: d, z: pts[pts.length - 1].z, label: String(i + 1) });
    });
    addLeg(plan.home, 1);

    var W = Math.max(320, profileEl.clientWidth), H = 130;
    var padL = 54, padR = 14, padT = 20, padB = 22;
    var zMin = Infinity, zMax = -Infinity;
    pts.forEach(function (p) { if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z; });
    if (zMax - zMin < 10) { zMax += 5; zMin -= 5; }
    function X(dist) { return padL + (dist / d) * (W - padL - padR); }
    function Y(z) { return padT + (1 - (z - zMin) / (zMax - zMin)) * (H - padT - padB); }

    // Consecutive samples with the same style become one polyline.
    var lines = '', run = [], runKey = null;
    function flush() {
      if (run.length > 1) {
        var k = runKey.split('|');
        lines += '<polyline class="' + (k[1] === '1' ? 'pf-steep' : (k[0] === '1' ? 'pf-home' : 'pf-out')) +
          '" points="' + run.join(' ') + '"/>';
      }
    }
    pts.forEach(function (p) {
      var key = p.part + '|' + (p.steep ? 1 : 0);
      var xy = X(p.d).toFixed(1) + ',' + Y(p.z).toFixed(1);
      if (key !== runKey) {
        flush();
        run = run.length ? [run[run.length - 1]] : [];
        runKey = key;
      }
      run.push(xy);
    });
    flush();

    var floor = H - padB;
    var area = 'M' + X(0).toFixed(1) + ',' + floor + ' ' +
      pts.map(function (p) { return 'L' + X(p.d).toFixed(1) + ',' + Y(p.z).toFixed(1); }).join(' ') +
      ' L' + X(d).toFixed(1) + ',' + floor + ' Z';

    function baseMark(x, z) {
      return '<rect x="' + (x - 7).toFixed(1) + '" y="' + (Y(z) - 7).toFixed(1) + '" width="14" height="14" rx="3" class="pf-base"/>' +
        '<text class="num" text-anchor="middle" x="' + x.toFixed(1) + '" y="' + (Y(z) + 4).toFixed(1) + '">H</text>';
    }
    var marksSvg = baseMark(X(0), pts[0].z);
    marks.forEach(function (m) {
      marksSvg += '<circle cx="' + X(m.d).toFixed(1) + '" cy="' + Y(m.z).toFixed(1) + '" r="8" class="pf-stop"/>' +
        '<text class="num" text-anchor="middle" x="' + X(m.d).toFixed(1) + '" y="' + (Y(m.z) + 4).toFixed(1) + '">' + m.label + '</text>';
    });
    marksSvg += baseMark(X(d), pts[pts.length - 1].z);

    profileEl.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
      '<path d="' + area + '" class="pf-area"/>' +
      '<line x1="' + padL + '" y1="' + floor + '" x2="' + (W - padR) + '" y2="' + floor + '" class="pf-axis"/>' +
      lines + marksSvg +
      '<text x="6" y="' + (padT + 4) + '">' + zMax.toFixed(0) + ' m</text>' +
      '<text x="6" y="' + floor + '">' + zMin.toFixed(0) + ' m</text>' +
      '<text x="' + padL + '" y="' + (H - 6) + '">0</text>' +
      '<text text-anchor="end" x="' + (W - padR) + '" y="' + (H - 6) + '">' + fmtDist(d) + '</text>' +
      '<text text-anchor="middle" x="' + ((padL + W - padR) / 2) + '" y="' + (H - 6) + '">Elevation along the route · 1 m DEM</text>' +
      '</svg>';
  }
  window.addEventListener('resize', function () { if (!profileEl.hidden) renderProfile(); });

  // Metres of the planned route on 15-25 degree slopes.
  function cautionMetres() {
    var m = 0;
    plan.legs.concat([plan.home]).forEach(function (leg) {
      if (!leg) return;
      for (var i = 1; i < leg.cells.length; i++) {
        if (terrain.slopeDeg[cellIndex(leg.cells[i])] >= T.SLOPE_CAUTION_DEG) m += terrain.cellM;
      }
    });
    return m;
  }

  function startHours() {
    var parts = (startEl.value || '09:00').split(':');
    return (+parts[0]) + (+parts[1]) / 60;
  }

  // Radio shadow of the base mast (js/radio.js), recomputed when the base moves.
  function radioCheck(broken) {
    if (!window.SeraRadio || !plan.base || broken) return null;
    var key = plan.base.r + ',' + plan.base.c;
    if (plan.radioKey !== key) {
      plan.radioVis = SeraRadio.viewshed(terrain, plan.base);
      plan.radioKey = key;
      if (radioLayer) { map.removeLayer(radioLayer); radioLayer = null; if (radioOn) showRadio(true); }
    }
    var gaps = SeraRadio.contactGaps(terrain, plan.radioVis, plan.legs.concat([plan.home]),
      PL.WORK_MIN_PER_STOP * 60, function (a, b) {
        return P.stepTime(terrain, a.r, a.c, b.r, b.c, (a.r !== b.r && a.c !== b.c) ? Math.SQRT2 : 1);
      });
    return { longestS: gaps.longestS, totalS: gaps.totalS, limitS: SeraRadio.GAP_CAUTION_S };
  }

  // Map layer: darkened cells have no line of sight to the base mast.
  var radioLayer = null, radioOn = false, radioBtn = document.getElementById('btn-radio');
  function showRadio(on) {
    radioOn = on;
    radioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on) { if (radioLayer) map.removeLayer(radioLayer); return; }
    if (!plan.radioVis) { setHint('Place the base first: the radio shadow is seen from its mast.', true); radioOn = false; radioBtn.setAttribute('aria-pressed', 'false'); return; }
    if (!radioLayer) {
      var cv = document.createElement('canvas');
      cv.width = terrain.cols; cv.height = terrain.rows;
      var g = cv.getContext('2d'), img = g.createImageData(terrain.cols, terrain.rows);
      for (var i = 0; i < plan.radioVis.length; i++) {
        if (!plan.radioVis[i]) { img.data[i * 4] = 12; img.data[i * 4 + 1] = 23; img.data[i * 4 + 2] = 26; img.data[i * 4 + 3] = 150; }
      }
      g.putImageData(img, 0, 0);
      radioLayer = L.imageOverlay(cv.toDataURL(), evaBounds(), { interactive: false, className: 'radio-overlay' });
    }
    radioLayer.addTo(map);
  }
  radioBtn.addEventListener('click', function () { showRadio(!radioOn); });

  function renderVerdict(broken) {
    var c = MT.localTime(Date.now(), zoneLon, zoneLat);
    var result = R.assess({
      budget: plan.budget,
      reachable: !broken,
      cautionM: cautionMetres(),
      startLtst: startHours(),
      sunriseLtst: c.sunriseLtst,
      sunsetLtst: c.sunsetLtst,
      ls: c.ls,
      dustSeason: MT.isDustSeason(c.ls),
      space: stormSimulated ? { sepHoursAgo: 2, simulated: true } : space,
      radio: radioCheck(broken)
    });
    plan.risk = result;
    verdictEl.hidden = false;
    verdictEl.className = 'verdict lv' + result.level;
    verdictEl.innerHTML = '<span class="mark">' + MARKS[result.level] + '</span>' +
      '<span class="word">' + result.verdict + '</span><span class="why"></span>';
    verdictEl.querySelector('.why').textContent = result.reason;
    factorsEl.innerHTML = '';
    result.factors.forEach(function (f) {
      var li = document.createElement('li');
      li.setAttribute('data-f', f.id);              // SERA points at the factor she talks about
      li.innerHTML = '<span class="lv' + f.level + '">' + MARKS[f.level] + '</span>' +
        '<span class="txt"><b></b> <span class="tag">' + f.tag + '</span><br><span class="t"></span></span>';
      li.querySelector('b').textContent = f.label;
      li.querySelector('.t').textContent = f.text;
      factorsEl.appendChild(li);
    });
  }

  startEl.addEventListener('input', render);
  document.getElementById('btn-now').addEventListener('click', function () {
    startEl.value = MT.formatHours(MT.localTime(Date.now(), zoneLon, zoneLat).ltst);
    render();
  });
  stormBtn.addEventListener('click', function () {
    stormSimulated = !stormSimulated;
    stormBtn.setAttribute('aria-pressed', stormSimulated ? 'true' : 'false');
    stormBtn.textContent = stormSimulated ? 'Stop storm simulation' : 'Simulate solar storm';
    render();
  });

  // Live space weather, cached in the browser for 3 hours:
  //  - solar energetic particle events: NASA DONKI (api.nasa.gov)
  //  - X-ray flares: NOAA SWPC GOES list (the DONKI flare endpoint answered 404 on 14 Nov 2026)
  // If the request fails, the last cached answer is used and marked as cached.
  var DONKI = 'https://api.nasa.gov/DONKI/';
  var GOES_FLARES = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json';
  var NASA_API_KEY = 'DEMO_KEY';
  var DONKI_CACHE_KEY = 'sera_spacewx_v2';
  var DONKI_TTL_MS = 3 * 3600 * 1000;

  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function hoursSince(iso) { return (Date.now() - Date.parse(iso)) / 3600000; }

  function applySpaceWeather(data, cached) {
    var sep = null, flare = null;
    (data.sep || []).forEach(function (e) {
      var h = hoursSince(e.eventTime);
      if (isFinite(h) && h >= 0 && (sep === null || h < sep)) sep = h;
    });
    (data.flr || []).forEach(function (e) {
      if (!e.max_class || e.max_class.charAt(0) !== 'X') return;
      var h = hoursSince(e.max_time || e.begin_time);
      if (isFinite(h) && h >= 0 && (flare === null || h < flare)) flare = h;
    });
    space = {
      sepHoursAgo: sep,
      xFlareHoursAgo: flare,
      flaresChecked: !!data.flaresOk,
      source: (data.flaresOk ? 'NASA DONKI + NOAA GOES' : 'NASA DONKI') + (cached ? ', cached ' + isoDay(data.t) : ''),
      asOf: data.t
    };
    render();
  }

  function loadSpaceWeather() {
    var cachedData = null;
    try { cachedData = JSON.parse(localStorage.getItem(DONKI_CACHE_KEY)); } catch (e) { cachedData = null; }
    if (cachedData && Date.now() - cachedData.t < DONKI_TTL_MS) {
      applySpaceWeather(cachedData, false);
      return;
    }
    var now = Date.now();
    var range = '?startDate=' + isoDay(now - 3 * 86400000) + '&endDate=' + isoDay(now) + '&api_key=' + NASA_API_KEY;
    function get(url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ' ' + r.status);
        return r.text();
      }).then(function (text) { return text ? JSON.parse(text) : []; });
    }
    // The particle events are required; flares are optional (CAUTION only).
    get(DONKI + 'SEP' + range).then(function (sep) {
      return get(GOES_FLARES).catch(function () { return null; }).then(function (flr) {
        var flaresOk = flr !== null;
        flr = flr || [];
        // Keep only what the verdict needs, so the cache stays small.
        flr = flr.filter(function (e) { return e.max_class && e.max_class.charAt(0) === 'X'; })
          .map(function (e) { return { max_class: e.max_class, max_time: e.max_time, begin_time: e.begin_time }; });
        sep = sep.map(function (e) { return { eventTime: e.eventTime }; });
        var data = { t: now, sep: sep, flr: flr, flaresOk: flaresOk };
        try { localStorage.setItem(DONKI_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
        applySpaceWeather(data, false);
      });
    }).catch(function () {
      if (cachedData) applySpaceWeather(cachedData, true);
    });
  }

  // Why a spot cannot take a point (null = it can). For a science point it also needs a safe way home.
  function spotProblem(cell, forBase) {
    if (!cell) return { why: 'outside' };
    var i = cell.r * terrain.cols + cell.c;
    if (terrain.slopeDeg[i] > T.SLOPE_BLOCK_DEG) return { why: 'steep', deg: terrain.slopeDeg[i] };
    if (!forBase && plan.field && !isFinite(plan.field.timeS[i])) return { why: 'nohome' };
    return null;
  }

  // Markers can be dragged: a point placed a little wrong is moved, not deleted and placed again.
  // While dragging, the marker turns red over ground where it cannot stand; dropped there, it goes back.
  function dragMarker(m, idx) {
    var isBase = idx < 0;
    var from = m.getLatLng();
    function badge() { var el = m.getElement(); return el && el.querySelector('.stop-icon'); }
    m.on('dragstart', function () {
      var b = badge();
      if (b) b.classList.add('dragging');
    });
    m.on('drag', function () {
      var ll = m.getLatLng(), b = badge();
      var bad = spotProblem(T.latLonToCell(terrain, ll.lat, ll.lng), isBase);
      if (b) b.classList.toggle('bad', !!bad);
    });
    m.on('dragend', function () {
      var ll = m.getLatLng();
      var cell = T.latLonToCell(terrain, ll.lat, ll.lng);
      var bad = spotProblem(cell, isBase);
      var b = badge();
      if (b) b.classList.remove('dragging', 'bad');
      if (bad) {
        m.setLatLng(from);
        setHint(bad.why === 'outside' ? 'Click inside the dashed EVA zone.'
          : bad.why === 'steep' ? 'Too steep here (' + bad.deg.toFixed(0) + '°, limit ' + T.SLOPE_BLOCK_DEG + '°). Pick another spot.'
          : 'No safe way home from this spot. Pick another one.', true);
        document.dispatchEvent(new CustomEvent('sera:refused', { detail: { why: bad.why, deg: bad.deg, stop: idx } }));
        return;
      }
      if (isBase) {
        plan.base = cell;
        plan.field = P.homeField(terrain, cell);
        plan.baseOut = P.travelField(terrain, cell);
      } else {
        plan.stops[idx] = { r: cell.r, c: cell.c, field: P.travelField(terrain, cell) };
      }
      recompute();
      render();
    });
    return m;
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
    clearPlan();
    recompute();
    render();
  });

  render();

  // ---- Mars clock at the EVA zone (Mars24 algorithm) ----

  var clockEl = document.getElementById('clock');

  function renderClock() {
    var c = MT.localTime(Date.now(), zoneLon, zoneLat);
    var model = ' <span class="tag">MODEL</span>';
    clockEl.innerHTML =
      '<span>Local solar time' + model + '</span><span class="big">' + MT.formatHours(c.ltst) + '</span>' +
      '<span>Curiosity mission sol</span><span>' + c.mslSol + '</span>' +
      '<span>Season (L<sub>s</sub>)' + (MT.isDustSeason(c.ls) ? ' · dust season' : '') + '</span><span>' + c.ls.toFixed(1) + '°</span>' +
      '<span>Sunrise – sunset</span><span>' + MT.formatHours(c.sunriseLtst) + ' – ' + MT.formatHours(c.sunsetLtst) + '</span>' +
      (c.isDay
        ? '<span>Daylight left</span><span>' + fmtMin(c.hoursToSunset * MT.MARS_HOUR_S) + '</span>'
        : '<span class="night">Night at the EVA zone</span><span class="night">Sun ' + c.sunElevationDeg.toFixed(0) + '°</span>') +
      weatherRows(c.ls);
  }

  // Typical weather for this season: Curiosity REMS means for the current 10 degree Ls bin.
  function weatherRows(ls) {
    var rems = window.SERA_REMS;
    if (!rems) return '';
    var bin = rems.bins[Math.floor((ls % 360) / rems.binDeg)];
    if (!bin || bin.airMinC === null) return '';
    var data = ' <span class="tag">DATA</span>';
    return '<span>Air temperature, typical' + data + '</span><span>' + Math.round(bin.airMinC) + ' … ' + (Math.round(bin.airMaxC) || 0) + ' °C</span>' +
      '<span>Ground temperature</span><span>' + Math.round(bin.groundMinC) + ' … ' + (Math.round(bin.groundMaxC) || 0) + ' °C</span>' +
      '<span>Pressure</span><span>' + bin.pressurePa.toFixed(0) + ' Pa</span>' +
      '<span class="src">Curiosity REMS, mean of ' + bin.sols + ' sols at this season</span><span></span>';
  }
  renderClock();
  setInterval(renderClock, 15000);
  loadSpaceWeather();

  // ---- Welcome screen and one-click demo plan ----

  var DEMO = window.SERA_DEMO;
  var welcomeEl = document.getElementById('welcome');

  function clearPlan() {
    plan.base = null; plan.stops = []; plan.field = null; plan.baseOut = null;
    plan.radioVis = null; plan.radioKey = null;
    if (radioOn) showRadio(false);
    if (radioLayer) { map.removeLayer(radioLayer); radioLayer = null; }
  }

  function runDemo() {
    welcomeEl.hidden = true;
    clearPlan();
    startEl.value = DEMO.startLtst;
    if (stormSimulated) stormBtn.click();
    [DEMO.base].concat(DEMO.stops).forEach(function (p) {
      map.fire('click', { latlng: L.latLng(p[0], p[1]) });
    });
    setActive('eva');
    map.invalidateSize();
    map.fitBounds(evaBounds(), { padding: [20, 20], animate: false });
  }

  document.getElementById('btn-demo').addEventListener('click', runDemo);
  document.getElementById('btn-demo-top').addEventListener('click', runDemo);
  document.getElementById('btn-own').addEventListener('click', function () {
    welcomeEl.hidden = true;
    setActive('eva');
    views.eva();
  });

  // planner.html?demo=1 (from the site) builds the demo at once; otherwise show the welcome card.
  if (/[?&]demo=1\b/.test(location.search)) runDemo();
  else welcomeEl.hidden = false;

  // Exposed for the next modules and for testing in the console.
  // planner.html?at=lat,lon (from the 3D globe on the site) opens the map at that place.
  var at = /[?&]at=(-?[\d.]+),(-?[\d.]+)/.exec(location.search);
  if (at && !/[?&]demo=1/.test(location.search)) {
    welcomeEl.hidden = true;
    setActive('');
    map.setView([+at[1], +at[2]], 5);
  }

  window.SERA = { map: map, terrain: terrain, evaBounds: evaBounds, plan: plan,
    views: views, setActive: setActive, runDemo: runDemo, render: render, stopName: stopName, cellLatLng: cellLatLng,
    tileLayers: { viking: viking, ctx: ctx, hirise: hirise },
    addNamer: function (fn) { namers.push(fn); } };
})();
