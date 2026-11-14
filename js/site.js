// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// site.js: the project site. The 3D Mars globe, and the numbers of the demo plan computed
// by the same terrain, pathfinding, planner and risk modules as the Mission Planner.

(function () {
  'use strict';

  var T = SeraTerrain, P = SeraPath, PL = SeraPlanner, MT = SeraMarsTime, R = SeraRisk;
  var DEMO = window.SERA_DEMO;
  var terrain = T.createTerrain(window.SERA_TERRAIN);
  var zoneLat = (terrain.north + terrain.south) / 2;
  var zoneLon = (terrain.west + terrain.east) / 2;

  var plan = null;

  function fmtMin(seconds) {
    var m = Math.round(seconds / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + 'm';
  }
  function cellIndex(c) { return c.r * terrain.cols + c.c; }

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
    plan = buildPlan();
    fillCard();
    if (window.SERA_REMS) document.getElementById('rems-sols').textContent = window.SERA_REMS.sols.toLocaleString('en-US');
  }

  // 3D globe: a place opens the planner there; Gale Crater opens the demo EVA.
  var globeEl = document.getElementById('site-globe');
  if (globeEl && window.SeraGlobe) {
    SeraGlobe.create(globeEl, {
      onGo: function (p) {
        location.href = p.eva ? 'planner.html?demo=1' : 'planner.html?at=' + p.lat + ',' + p.lon;
      }
    });
  }

  // Let the page paint first, then compute (about half a second).
  setTimeout(init, 30);
})();
