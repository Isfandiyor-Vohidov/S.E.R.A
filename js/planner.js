// S.E.R.A — Safe Exploration & Returning Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// planner.js: best order of science points and suit time budget.
// Pure functions, no DOM: can be tested in node.

(function (root) {
  'use strict';

  var SUIT_HOURS = 8;          // MODEL: suit endurance (NASA xEMU / ISS EMU class)
  var RESERVE_SHARE = 0.15;    // MODEL: 15 % of the suit time is kept as a reserve
  var WORK_MIN_PER_STOP = 20;  // MODEL: science work time at each point
  var EXACT_LIMIT = 8;         // up to 8 points: exact search over all orders

  // matrix[i][j] = walking time from node i to node j in seconds; node 0 is the base.
  function tourTime(matrix, order) {
    var total = 0, from = 0;
    for (var i = 0; i < order.length; i++) {
      total += matrix[from][order[i]];
      from = order[i];
    }
    return total + matrix[from][0];
  }

  // Exact: tries every order of the stops (n! orders, fine for n <= 8).
  function exactOrder(matrix) {
    var n = matrix.length - 1;
    var best = null, bestT = Infinity;
    var cur = [], used = new Uint8Array(n + 1);
    (function rec(from, time) {
      if (time >= bestT) return;
      if (cur.length === n) {
        var total = time + matrix[from][0];
        if (total < bestT) { bestT = total; best = cur.slice(); }
        return;
      }
      for (var j = 1; j <= n; j++) {
        if (used[j]) continue;
        used[j] = 1; cur.push(j);
        rec(j, time + matrix[from][j]);
        cur.pop(); used[j] = 0;
      }
    })(0, 0);
    return best || [];
  }

  // Heuristic for many points: nearest neighbour, then improve by moving and reversing.
  function heuristicOrder(matrix) {
    var n = matrix.length - 1, order = [], used = new Uint8Array(n + 1), from = 0, i, j;
    for (i = 0; i < n; i++) {
      var pick = -1;
      for (j = 1; j <= n; j++) {
        if (!used[j] && (pick < 0 || matrix[from][j] < matrix[from][pick])) pick = j;
      }
      used[pick] = 1; order.push(pick); from = pick;
    }
    var bestT = tourTime(matrix, order), improved = true;
    while (improved) {
      improved = false;
      for (i = 0; i < n - 1; i++) {
        for (j = i + 1; j < n; j++) {
          var cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          var t = tourTime(matrix, cand);
          if (t < bestT - 1e-9) { order = cand; bestT = t; improved = true; }
        }
      }
    }
    return order;
  }

  // Returns the visiting order as node numbers (1..n), base excluded.
  function bestOrder(matrix) {
    var n = matrix.length - 1;
    if (n <= 0) return [];
    return n <= EXACT_LIMIT ? exactOrder(matrix) : heuristicOrder(matrix);
  }

  // Suit budget for a planned order.
  // homeS[k] = walking time from node k to the base (homeS[0] = 0).
  function evaluate(matrix, order, homeS) {
    var limitS = SUIT_HOURS * 3600;
    var usableS = limitS * (1 - RESERVE_SHARE);
    var workS = WORK_MIN_PER_STOP * 60;
    var elapsed = 0, from = 0, walkS = 0, stops = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      walkS += matrix[from][k];
      elapsed += matrix[from][k] + workS;
      // If we turn back right after working here: do we get home inside the usable time?
      stops.push({
        node: k,
        leaveAtS: elapsed,
        homeS: homeS[k],
        marginS: usableS - (elapsed + homeS[k])
      });
      from = k;
    }
    if (order.length) { walkS += matrix[from][0]; elapsed += matrix[from][0]; }
    return {
      walkS: walkS,
      workS: workS * order.length,
      totalS: elapsed,
      limitS: limitS,
      usableS: usableS,
      marginS: usableS - elapsed,        // spare time before touching the reserve
      fits: elapsed <= usableS,
      stops: stops
    };
  }

  var api = {
    SUIT_HOURS: SUIT_HOURS,
    RESERVE_SHARE: RESERVE_SHARE,
    WORK_MIN_PER_STOP: WORK_MIN_PER_STOP,
    EXACT_LIMIT: EXACT_LIMIT,
    tourTime: tourTime,
    exactOrder: exactOrder,
    heuristicOrder: heuristicOrder,
    bestOrder: bestOrder,
    evaluate: evaluate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SeraPlanner = api;
})(typeof window !== 'undefined' ? window : globalThis);
