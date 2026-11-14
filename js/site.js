// SARA — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// site.js: the project site. Draws the demo plan on a shaded relief of the real 1 m terrain,
// using the same terrain, pathfinding, planner and risk modules as the Mission Planner.

(function () {
  'use strict';

  var T = SeraTerrain, P = SeraPath, PL = SeraPlanner, MT = SeraMarsTime, R = SeraRisk;
  var DEMO = window.SARA_DEMO;
  var terrain = T.createTerrain(window.SERA_TERRAIN);
  var zoneLat = (terrain.north + terrain.south) / 2;
  var zoneLon = (terrain.west + terrain.east) / 2;

  var canvas = document.getElementById('preview-canvas');
  var reliefImg = null;  // 400 x 400 shaded relief, built once
  var plan = null;

  function fmtMin(seconds) {
    var m = Math.round(seconds / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + 'm';
  }
  function cellIndex(c) { return c.r * terrain.cols + c.c; }

  // Grey shaded relief (sun from the north-west, 45 degrees up) with the slope classes on top.
  function buildRelief() {
    var rows = terrain.rows, cols = terrain.cols, e = terrain.elev, d = terrain.cellM;
    var off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    var g = off.getContext('2d');
    var img = g.createImageData(cols, rows);
    var az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180;
    var lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
    var exag = 2;
    function z(r, c) {
      r = r < 0 ? 0 : (r >= rows ? rows - 1 : r);
      c = c < 0 ? 0 : (c >= cols ? cols - 1 : c);
      return e[r * cols + c];
    }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dzdx = (z(r, c + 1) - z(r, c - 1)) / (2 * d) * exag;     // east
        var dzdy = (z(r - 1, c) - z(r + 1, c)) / (2 * d) * exag;     // north
        var nlen = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        var shade = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / nlen);
        var v = 38 + 190 * shade;
        var i = r * cols + c, p = i * 4, s = terrain.slopeDeg[i];
        var R0 = v, G0 = v * 0.97, B0 = v * 0.93;   // close to the grey of HiRISE images
        if (s > T.SLOPE_BLOCK_DEG) { R0 = R0 * 0.55 + 239 * 0.45; G0 = G0 * 0.55 + 100 * 0.45; B0 = B0 * 0.55 + 100 * 0.45; }
        else if (s >= T.SLOPE_CAUTION_DEG) { R0 = R0 * 0.7 + 240 * 0.3; G0 = G0 * 0.7 + 188 * 0.3; B0 = B0 * 0.7 + 84 * 0.3; }
        img.data[p] = R0; img.data[p + 1] = G0; img.data[p + 2] = B0; img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return off;
  }

  // The demo plan, computed exactly as in the planner.
  function buildPlan() {
    var base = T.latLonToCell(terrain, DEMO.base[0], DEMO.base[1]);
    var stops = DEMO.stops.map(function (p) { return T.latLonToCell(terrain, p[0], p[1]); });
    var homeField = P.homeField(terrain, base);
    var nodes = [base].concat(stops);
    var fields = nodes.map(function (n) { return P.travelField(terrain, n); });
    var matrix = nodes.map(function (a, i) {
      return nodes.map(function (b) { return fields[i].timeS[cellIndex(b)]; });
    });
    var homeS = nodes.map(function (n) { return homeField.timeS[cellIndex(n)]; });
    var order = PL.bestOrder(matrix);
    var budget = PL.evaluate(matrix, order, homeS);
    var legs = [], from = 0, distM = 0, cautionM = 0;
    order.forEach(function (k) {
      var leg = P.pathTo(terrain, fields[from], nodes[k]);
      legs.push(leg);
      from = k;
    });
    var home = P.pathHome(terrain, homeField, nodes[from]);
    legs.concat([home]).forEach(function (leg) {
      distM += leg.distM;
      for (var i = 1; i < leg.cells.length; i++) {
        if (terrain.slopeDeg[cellIndex(leg.cells[i])] >= T.SLOPE_CAUTION_DEG) cautionM += terrain.cellM;
      }
    });
    var farthestHome = Math.max.apply(null, order.map(function (k) { return homeS[k]; }));
    return {
      base: base, stops: order.map(function (k) { return nodes[k]; }), legs: legs, home: home,
      budget: budget, distM: distM, cautionM: cautionM, farthestHomeS: farthestHome
    };
  }

  function draw() {
    if (!reliefImg || !plan) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the square zone to cover the frame, centred on the route.
    var size = Math.max(w, h) * (w < 520 ? 1.2 : 1);   // zoom in a little on phones
    var scale = size / terrain.cols;
    var r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    plan.legs.concat([plan.home]).forEach(function (leg) {
      leg.cells.forEach(function (c) {
        if (c.r < r0) r0 = c.r; if (c.r > r1) r1 = c.r;
        if (c.c < c0) c0 = c.c; if (c.c > c1) c1 = c.c;
      });
    });
    var cr = (r0 + r1) / 2 - 8, cc = (c0 + c1) / 2;   // -8 cells: room for the label on top
    var ox = Math.min(0, Math.max(w - size, w / 2 - (cc + 0.5) * scale));
    var oy = Math.min(0, Math.max(h - size, h / 2 - (cr + 0.5) * scale));

    g.imageSmoothingEnabled = true;
    g.drawImage(reliefImg, ox, oy, size, size);

    function X(c) { return ox + (c.c + 0.5) * scale; }
    function Y(c) { return oy + (c.r + 0.5) * scale; }
    function line(leg, color, width, dash) {
      g.beginPath();
      leg.cells.forEach(function (c, i) { if (i) g.lineTo(X(c), Y(c)); else g.moveTo(X(c), Y(c)); });
      g.setLineDash([]);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = 'rgba(12,23,26,0.6)'; g.lineWidth = width + 3; g.stroke();
      g.setLineDash(dash || []);
      g.strokeStyle = color; g.lineWidth = width; g.stroke();
    }
    plan.legs.forEach(function (leg) { line(leg, '#E78F67', 3.5); });
    line(plan.home, '#A7F1C2', 3, [8, 6]);
    g.setLineDash([]);

    function marker(c, label, isBase) {
      var x = X(c), y = Y(c);
      g.fillStyle = isBase ? '#EDF2EA' : '#E78F67';
      g.strokeStyle = '#0C171A'; g.lineWidth = 2;
      g.beginPath();
      if (isBase) { g.roundRect ? g.roundRect(x - 11, y - 11, 22, 22, 5) : g.rect(x - 11, y - 11, 22, 22); }
      else g.arc(x, y, 11, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.fillStyle = '#0C171A';
      g.font = '700 12px Inter, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + 0.5);
    }
    plan.stops.forEach(function (c, i) { marker(c, String(i + 1), false); });
    marker(plan.base, 'H', true);

    var metres = Math.round(w / scale * terrain.cellM);
    document.getElementById('pv-scale').textContent = 'View ' + (metres / 1000).toFixed(1) + ' km wide · 1 m DEM';
  }

  function fillCard() {
    var c = MT.localTime(Date.now(), zoneLon, zoneLat);
    var parts = DEMO.startLtst.split(':');
    var result = R.assess({
      budget: plan.budget, reachable: true, cautionM: plan.cautionM,
      startLtst: (+parts[0]) + (+parts[1]) / 60,
      sunriseLtst: c.sunriseLtst, sunsetLtst: c.sunsetLtst,
      ls: c.ls, dustSeason: MT.isDustSeason(c.ls), space: {}
    });
    // Space weather is checked live in the planner; here we show terrain, suit and daylight only.
    var level = 0, labels = ['GO', 'CAUTION', 'NO-GO'], marks = ['✓', '!', '✕'];
    result.factors.forEach(function (f) {
      if ((f.id === 'slopes' || f.id === 'suit' || f.id === 'daylight') && f.level > level) level = f.level;
    });
    document.getElementById('pv-dist').textContent = (plan.distM / 1000).toFixed(2) + ' km';
    document.getElementById('pv-time').textContent = fmtMin(plan.budget.totalS);
    document.getElementById('pv-home').textContent = fmtMin(plan.farthestHomeS);
    var st = document.getElementById('pv-status');
    st.className = 'status lv' + level;
    st.textContent = marks[level] + ' ' + labels[level];
    st.title = 'Terrain, suit time and daylight for a ' + DEMO.startLtst + ' start. Space weather is checked live in the planner.';
    document.getElementById('mars-chip').textContent = 'Gale Crater · Sol ' + c.mslSol;
  }

  function init() {
    reliefImg = buildRelief();
    plan = buildPlan();
    document.getElementById('pv-loading').hidden = true;
    draw();
    fillCard();
    var lat = Math.abs(zoneLat).toFixed(2) + '° S', lon = zoneLon.toFixed(2) + '° E';
    document.getElementById('pv-coords').textContent = lat + ' / ' + lon;
    if (window.SERA_REMS) document.getElementById('rems-sols').textContent = window.SERA_REMS.sols.toLocaleString('en-US');
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 120);
  });

  // Let the page paint first, then compute (about half a second).
  setTimeout(init, 30);
})();
