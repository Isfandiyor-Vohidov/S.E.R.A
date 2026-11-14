// S.E.R.A — Safe Exploration & Returning Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// pathfinding.js: walking time model, A* route and the "way home" field.
// Pure functions, no DOM: can be tested in node.

(function (root) {
  'use strict';

  var T = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./terrain.js') : root.SeraTerrain;

  var SUIT_FACTOR = 0.5;        // MODEL: suit halves walking speed (Apollo EVA ~2.2 km/h)
  var CAUTION_COST = 2;         // MODEL: 15-25 deg cells cost twice the time
  // Fastest possible speed (Tobler maximum, at a 5 % downhill grade), m/s.
  var MAX_SPEED_MS = 6 * SUIT_FACTOR / 3.6;

  // Tobler's hiking function (Tobler 1993) with the suit factor.
  // grade = rise / run in the walking direction (uphill > 0). Returns m/s.
  function walkSpeed(grade) {
    return 6 * Math.exp(-3.5 * Math.abs(grade + 0.05)) * SUIT_FACTOR / 3.6;
  }

  // 8 neighbours: [dRow, dCol, distance in cells]
  var NEIGH = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]
  ];

  function isBlocked(t, i) {
    return t.slopeDeg[i] > T.SLOPE_BLOCK_DEG;
  }

  // Time in seconds to walk from cell a to neighbour cell b, Infinity if not allowed.
  // The direction matters: uphill and downhill take different time.
  function stepTime(t, ra, ca, rb, cb, distCells) {
    var a = ra * t.cols + ca, b = rb * t.cols + cb;
    if (isBlocked(t, b) || isBlocked(t, a)) return Infinity;
    // No cutting corners between two blocked cells.
    if (ra !== rb && ca !== cb) {
      if (isBlocked(t, ra * t.cols + cb) || isBlocked(t, rb * t.cols + ca)) return Infinity;
    }
    var dist = distCells * t.cellM;
    var grade = (t.elev[b] - t.elev[a]) / dist;
    var time = dist / walkSpeed(grade);
    if (t.slopeDeg[b] >= T.SLOPE_CAUTION_DEG) time *= CAUTION_COST;
    return time;
  }

  // Small binary min-heap of [priority, cellIndex].
  function Heap() { this.p = []; this.v = []; }
  Heap.prototype.push = function (pr, val) {
    var p = this.p, v = this.v, i = p.length;
    p.push(pr); v.push(val);
    while (i > 0) {
      var parent = (i - 1) >> 1;
      if (p[parent] <= pr) break;
      p[i] = p[parent]; v[i] = v[parent];
      i = parent;
    }
    p[i] = pr; v[i] = val;
  };
  Heap.prototype.pop = function () {
    var p = this.p, v = this.v, top = v[0];
    var lastP = p.pop(), lastV = v.pop(), n = p.length;
    if (n > 0) {
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = l;
        if (l >= n) break;
        if (r < n && p[r] < p[l]) m = r;
        if (p[m] >= lastP) break;
        p[i] = p[m]; v[i] = v[m];
        i = m;
      }
      p[i] = lastP; v[i] = lastV;
    }
    return top;
  };

  // A* from start cell to goal cell. Returns {cells:[{r,c}], timeS, distM} or null.
  function findPath(t, start, goal) {
    var rows = t.rows, cols = t.cols, n = rows * cols;
    var s = start.r * cols + start.c, g = goal.r * cols + goal.c;
    if (isBlocked(t, s) || isBlocked(t, g)) return null;
    var best = new Float64Array(n).fill(Infinity);
    var prev = new Int32Array(n).fill(-1);
    var done = new Uint8Array(n);
    var heap = new Heap();
    best[s] = 0;
    heap.push(0, s);
    var hScale = t.cellM / MAX_SPEED_MS;
    while (heap.p.length) {
      var cur = heap.pop();
      if (done[cur]) continue;
      done[cur] = 1;
      if (cur === g) break;
      var r = (cur / cols) | 0, c = cur - r * cols;
      for (var k = 0; k < 8; k++) {
        var nr = r + NEIGH[k][0], nc = c + NEIGH[k][1];
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        var ni = nr * cols + nc;
        if (done[ni]) continue;
        var w = stepTime(t, r, c, nr, nc, NEIGH[k][2]);
        if (w === Infinity) continue;
        var cand = best[cur] + w;
        if (cand < best[ni]) {
          best[ni] = cand;
          prev[ni] = cur;
          var dr = nr - goal.r, dc = nc - goal.c;
          heap.push(cand + Math.sqrt(dr * dr + dc * dc) * hScale, ni);
        }
      }
    }
    if (best[g] === Infinity) return null;
    var cells = [], distM = 0;
    for (var i = g; i !== -1; i = prev[i]) {
      var rr = (i / cols) | 0;
      cells.push({ r: rr, c: i - rr * cols });
    }
    cells.reverse();
    for (var j = 1; j < cells.length; j++) {
      distM += t.cellM * ((cells[j].r !== cells[j - 1].r && cells[j].c !== cells[j - 1].c) ? Math.SQRT2 : 1);
    }
    return { cells: cells, timeS: best[g], distM: distM };
  }

  // "Way home" field: for every cell, the fastest time to walk TO the base.
  // Reverse Dijkstra from the base: the step cost is taken in the direction
  // neighbour -> current (towards home), not away from it.
  function homeField(t, base) {
    var rows = t.rows, cols = t.cols, n = rows * cols;
    var timeS = new Float64Array(n).fill(Infinity);
    var next = new Int32Array(n).fill(-1); // next cell on the way home
    var done = new Uint8Array(n);
    var b = base.r * cols + base.c;
    var heap = new Heap();
    if (!isBlocked(t, b)) {
      timeS[b] = 0;
      heap.push(0, b);
    }
    while (heap.p.length) {
      var cur = heap.pop();
      if (done[cur]) continue;
      done[cur] = 1;
      var r = (cur / cols) | 0, c = cur - r * cols;
      for (var k = 0; k < 8; k++) {
        var nr = r + NEIGH[k][0], nc = c + NEIGH[k][1];
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        var ni = nr * cols + nc;
        if (done[ni]) continue;
        var w = stepTime(t, nr, nc, r, c, NEIGH[k][2]); // neighbour walks to current
        if (w === Infinity) continue;
        var cand = timeS[cur] + w;
        if (cand < timeS[ni]) {
          timeS[ni] = cand;
          next[ni] = cur;
          heap.push(cand, ni);
        }
      }
    }
    return { timeS: timeS, next: next, base: base };
  }

  // "From here" field: fastest time to walk FROM the source cell to every cell.
  // Forward Dijkstra; prev[] points back towards the source.
  function travelField(t, src) {
    var rows = t.rows, cols = t.cols, n = rows * cols;
    var timeS = new Float64Array(n).fill(Infinity);
    var prev = new Int32Array(n).fill(-1);
    var done = new Uint8Array(n);
    var s = src.r * cols + src.c;
    var heap = new Heap();
    if (!isBlocked(t, s)) {
      timeS[s] = 0;
      heap.push(0, s);
    }
    while (heap.p.length) {
      var cur = heap.pop();
      if (done[cur]) continue;
      done[cur] = 1;
      var r = (cur / cols) | 0, c = cur - r * cols;
      for (var k = 0; k < 8; k++) {
        var nr = r + NEIGH[k][0], nc = c + NEIGH[k][1];
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        var ni = nr * cols + nc;
        if (done[ni]) continue;
        var w = stepTime(t, r, c, nr, nc, NEIGH[k][2]);
        if (w === Infinity) continue;
        var cand = timeS[cur] + w;
        if (cand < timeS[ni]) {
          timeS[ni] = cand;
          prev[ni] = cur;
          heap.push(cand, ni);
        }
      }
    }
    return { timeS: timeS, prev: prev, src: src };
  }

  // Path from the field's source to a cell. Returns {cells, timeS, distM} or null.
  function pathTo(t, field, to) {
    var cols = t.cols, i = to.r * cols + to.c;
    if (field.timeS[i] === Infinity) return null;
    var cells = [], distM = 0, total = field.timeS[i];
    while (i !== -1) {
      var r = (i / cols) | 0;
      cells.push({ r: r, c: i - r * cols });
      i = field.prev[i];
    }
    cells.reverse();
    for (var j = 1; j < cells.length; j++) {
      distM += t.cellM * ((cells[j].r !== cells[j - 1].r && cells[j].c !== cells[j - 1].c) ? Math.SQRT2 : 1);
    }
    return { cells: cells, timeS: total, distM: distM };
  }

  // Way home from a cell using the field. Returns {cells, timeS, distM} or null.
  function pathHome(t, field, from) {
    var cols = t.cols, i = from.r * cols + from.c;
    if (field.timeS[i] === Infinity) return null;
    var cells = [], distM = 0, total = field.timeS[i];
    while (i !== -1) {
      var r = (i / cols) | 0;
      cells.push({ r: r, c: i - r * cols });
      i = field.next[i];
    }
    for (var j = 1; j < cells.length; j++) {
      distM += t.cellM * ((cells[j].r !== cells[j - 1].r && cells[j].c !== cells[j - 1].c) ? Math.SQRT2 : 1);
    }
    return { cells: cells, timeS: total, distM: distM };
  }

  var api = {
    SUIT_FACTOR: SUIT_FACTOR,
    CAUTION_COST: CAUTION_COST,
    walkSpeed: walkSpeed,
    stepTime: stepTime,
    findPath: findPath,
    homeField: homeField,
    travelField: travelField,
    pathTo: pathTo,
    pathHome: pathHome
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SeraPath = api;
})(typeof window !== 'undefined' ? window : globalThis);
