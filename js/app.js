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
        lines += '<polyline fill="none" stroke="' + (k[1] === '1' ? '#e6b93c' : (k[0] === '1' ? '#5ab0ff' : '#e2703a')) +
          '" stroke-width="' + (k[1] === '1' ? 4 : 2.5) + '"' + (k[0] === '1' && k[1] !== '1' ? ' stroke-dasharray="6 4"' : '') +
          ' points="' + run.join(' ') + '"/>';
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
      return '<rect x="' + (x - 7).toFixed(1) + '" y="' + (Y(z) - 7).toFixed(1) + '" width="14" height="14" rx="3" fill="#e6e9ef"/>' +
        '<text class="num" text-anchor="middle" x="' + x.toFixed(1) + '" y="' + (Y(z) + 4).toFixed(1) + '">H</text>';
    }
    var marksSvg = baseMark(X(0), pts[0].z);
    marks.forEach(function (m) {
      marksSvg += '<circle cx="' + X(m.d).toFixed(1) + '" cy="' + Y(m.z).toFixed(1) + '" r="8" fill="#e2703a"/>' +
        '<text class="num" text-anchor="middle" x="' + X(m.d).toFixed(1) + '" y="' + (Y(m.z) + 4).toFixed(1) + '">' + m.label + '</text>';
    });
    marksSvg += baseMark(X(d), pts[pts.length - 1].z);

    profileEl.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
      '<path d="' + area + '" fill="rgba(226,112,58,0.10)"/>' +
      '<line x1="' + padL + '" y1="' + floor + '" x2="' + (W - padR) + '" y2="' + floor + '" stroke="#2a3342"/>' +
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
      space: stormSimulated ? { sepHoursAgo: 2, simulated: true } : space
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

  // Demo: base where Curiosity parked on sols ~4650-4800, three points around it.
  var DEMO = {
    base: [-4.8080, 137.3810],
    stops: [[-4.8150, 137.3820], [-4.8000, 137.3840], [-4.8110, 137.3835]]
  };
  var welcomeEl = document.getElementById('welcome');

  function clearPlan() {
    plan.base = null; plan.stops = []; plan.field = null; plan.baseOut = null;
  }

  function runDemo() {
    welcomeEl.hidden = true;
    clearPlan();
    startEl.value = '09:00';
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

  // Exposed for the next modules and for testing in the console.
  window.SERA = { map: map, terrain: terrain, evaBounds: evaBounds, plan: plan };
})();
