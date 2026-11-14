// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// radio.js: radio shadow of the base. A suit talks to the base only with a direct line of sight
// from the base mast to the suit antenna (MODEL: local UHF radio, line of sight only).
// Finds where the terrain hides the astronaut from the base, and how long the plan stays hidden.
// Pure functions, no DOM: can be tested in node.

(function (root) {
  'use strict';

  var MAST_M = 10;          // MODEL: antenna mast on the habitat
  var SUIT_M = 2;           // MODEL: suit antenna height above the ground
  var GAP_CAUTION_S = 15 * 60;  // MODEL: longer than 15 min in a row without contact -> CAUTION
  var MARS_R = 3396190;     // the ground curves away: drop = d^2 / 2R (0.6 m at 2 km)

  // visible[i] = 1 if cell i sees the base mast.
  function viewshed(t, base) {
    var rows = t.rows, cols = t.cols, e = t.elev, d = t.cellM;
    var vis = new Uint8Array(rows * cols);
    var z0 = e[base.r * cols + base.c] + MAST_M;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dr = r - base.r, dc = c - base.c;
        var steps = Math.max(Math.abs(dr), Math.abs(dc));
        if (steps <= 1) { vis[r * cols + c] = 1; continue; }
        var dist = Math.sqrt(dr * dr + dc * dc) * d;
        var z1 = e[r * cols + c] + SUIT_M - dist * dist / (2 * MARS_R);
        var ok = 1;
        for (var k = 1; k < steps; k++) {
          var f = k / steps;
          var rr = Math.round(base.r + dr * f), cc = Math.round(base.c + dc * f);
          var x = f * dist;
          var ground = e[rr * cols + cc] - x * x / (2 * MARS_R);
          if (ground > z0 + (z1 - z0) * f) { ok = 0; break; }
        }
        vis[r * cols + c] = ok;
      }
    }
    return vis;
  }

  // Walks the route (list of paths, each {cells}) with the planner's walking time and work stops,
  // and measures the time spent out of contact. stepTime(a, b) gives seconds between neighbours.
  function contactGaps(t, vis, legs, workS, stepTime) {
    var longest = 0, total = 0, cur = 0;
    function add(cellIdx, dt) {
      if (vis[cellIdx]) { cur = 0; return; }
      cur += dt; total += dt;
      if (cur > longest) longest = cur;
    }
    legs.forEach(function (leg, li) {
      if (!leg) return;
      for (var i = 1; i < leg.cells.length; i++) {
        var a = leg.cells[i - 1], b = leg.cells[i];
        add(b.r * t.cols + b.c, stepTime(a, b));
      }
      // Science work at the end of every leg except the way home.
      if (li < legs.length - 1 && workS) {
        var end = leg.cells[leg.cells.length - 1];
        add(end.r * t.cols + end.c, workS);
      }
    });
    return { longestS: longest, totalS: total };
  }

  // Share of the zone in contact with the base.
  function coverage(vis) {
    var n = 0;
    for (var i = 0; i < vis.length; i++) n += vis[i];
    return n / vis.length;
  }

  var api = {
    MAST_M: MAST_M, SUIT_M: SUIT_M, GAP_CAUTION_S: GAP_CAUTION_S,
    viewshed: viewshed, contactGaps: contactGaps, coverage: coverage
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SeraRadio = api;
})(typeof window !== 'undefined' ? window : globalThis);
