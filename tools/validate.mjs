// SARA — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// validate.mjs: recomputes every check number of the README from the code and the data files,
// so anyone can repeat them. No network needed.
//
// Usage:  cd tools && node validate.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Data files are browser scripts (window.X = ...): run them with a small window object.
globalThis.window = globalThis;
for (const f of ['data/terrain.js', 'data/rems.js', 'data/msl.js', 'js/demo-plan.js']) {
  (0, eval)(readFileSync(join(root, f), 'utf8'));
}
const T = require('../js/terrain.js');
const P = require('../js/pathfinding.js');
const PL = require('../js/planner.js');
const MT = require('../js/marstime.js');
const R = require('../js/risk.js');

const terrain = T.createTerrain(window.SERA_TERRAIN);
const idx = (c) => c.r * terrain.cols + c.c;
const rows = [];
const report = (name, result, note) => { rows.push({ check: name, result, note: note || '' }); };

// Seeded random numbers, so the checks give the same result every run.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(2026);
function randomSafeCell(field) {
  for (;;) {
    const c = { r: 10 + Math.floor(rand() * (terrain.rows - 20)), c: 10 + Math.floor(rand() * (terrain.cols - 20)) };
    if (terrain.slopeDeg[idx(c)] < T.SLOPE_CAUTION_DEG && (!field || isFinite(field.timeS[idx(c)]))) return c;
  }
}

// 1. Terrain heights vs Curiosity's own record at every stop in the zone
{
  const stops = window.SARA_MSL.stops;
  let sum = 0, max = 0, n = 0, bias = 0;
  for (const s of stops) {
    const z = T.elevationAt(terrain, s.lat, s.lon);
    if (z === null) continue;
    const d = z - s.elev;
    sum += Math.abs(d); bias += d; n++;
    if (Math.abs(d) > max) max = Math.abs(d);
  }
  report('DEM height vs Curiosity at its stops', `mean |diff| ${(sum / n).toFixed(2)} m, max ${max.toFixed(2)} m, mean ${(bias / n >= 0 ? '+' : '') + (bias / n).toFixed(2)} m`,
    `${n} rover stops, sols ${stops[0].sol}-${stops[stops.length - 1].sol}; DEM cell 5 m; rover positions are fitted to orbital maps, so this checks our cut and grid`);
}

// 2. Mars clock vs REMS (computed by prep_rems.mjs from the live feed)
{
  const c = window.SERA_REMS.lsCheck;
  report('Mars clock Ls vs REMS reports', `mean |diff| ${c.meanAbsDiffDeg.toFixed(2)}°, max ${c.maxAbsDiffDeg.toFixed(2)}°`,
    `${c.sols} sols; REMS gives whole degrees (from prep_rems.mjs)`);
}

// 3. Mars clock at Curiosity's landing
{
  const landing = Date.parse('2012-08-06T05:17:57Z');
  const c = MT.localTime(landing, 137.4417, -4.5895);
  const h = Math.floor(c.lmst), m = Math.floor((c.lmst - h) * 60);
  report('Mars clock at Curiosity landing', `sol ${c.mslSol}, ${h}:${String(m).padStart(2, '0')} LMST`,
    'landing 2012-08-06 05:17:57 UTC');
}

// 4. Best order of points vs trying every order
{
  const base = randomSafeCell(null);
  const home = P.homeField(terrain, base);
  const nodes = [base];
  while (nodes.length < 7) nodes.push(randomSafeCell(home));
  const fields = nodes.map((n) => P.travelField(terrain, n));
  const matrix = nodes.map((a, i) => nodes.map((b) => fields[i].timeS[idx(b)]));
  const best = PL.tourTime(matrix, PL.bestOrder(matrix));
  let brute = Infinity, count = 0;
  (function perm(arr, k) {
    if (k === arr.length) { count++; brute = Math.min(brute, PL.tourTime(matrix, arr)); return; }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  })([1, 2, 3, 4, 5, 6], 0);
  const click = PL.tourTime(matrix, [1, 2, 3, 4, 5, 6]);
  report('Best order of 6 points vs all orders', `${(best / 60).toFixed(2)} min vs ${(brute / 60).toFixed(2)} min (${count} orders)`,
    `clicking order: ${(click / 60).toFixed(2)} min`);

  // Heuristic (used above 8 points) vs exact, on 8 points
  const nodes8 = nodes.concat([randomSafeCell(home), randomSafeCell(home)]);
  const f8 = nodes8.map((n) => P.travelField(terrain, n));
  const m8 = nodes8.map((a, i) => nodes8.map((b) => f8[i].timeS[idx(b)]));
  const ex = PL.tourTime(m8, PL.exactOrder(m8)), he = PL.tourTime(m8, PL.heuristicOrder(m8));
  report('Heuristic order vs exact, 8 points', `${(he / 60).toFixed(2)} min vs ${(ex / 60).toFixed(2)} min`,
    `heuristic is ${((he / ex - 1) * 100).toFixed(2)} % longer`);
}

// 5. A* route vs the Dijkstra field (two different algorithms, same answer expected)
{
  let maxDiff = 0, pairs = 0;
  for (let k = 0; k < 15; k++) {
    const a = randomSafeCell(null), b = randomSafeCell(null);
    const path = P.findPath(terrain, a, b);
    const field = P.travelField(terrain, a);
    if (!path) { if (isFinite(field.timeS[idx(b)])) maxDiff = Infinity; continue; }
    maxDiff = Math.max(maxDiff, Math.abs(path.timeS - field.timeS[idx(b)]));
    pairs++;
  }
  report('A* time vs Dijkstra field time', `max difference ${maxDiff.toFixed(4)} s`, `${pairs} random pairs`);
}

// 6. Uphill and downhill take different time
{
  let best = null;
  for (let k = 0; k < 40; k++) {
    const a = randomSafeCell(null), b = randomSafeCell(null);
    const dz = terrain.elev[idx(b)] - terrain.elev[idx(a)];
    if (!best || dz > best.dz) best = { a, b, dz };
  }
  const up = P.travelField(terrain, best.a).timeS[idx(best.b)];
  const down = P.travelField(terrain, best.b).timeS[idx(best.a)];
  report('Same trip up and down a hill', `${(down / 60).toFixed(1)} min down vs ${(up / 60).toFixed(1)} min up`,
    `${best.dz.toFixed(0)} m height difference`);
}

// 7. Walking speed on flat ground
report('Suit walking speed, flat ground', `${(P.walkSpeed(0) * 3.6).toFixed(2)} km/h`, 'Apollo EVAs: about 2.2 km/h (MODEL)');

// 8. The demo plan
{
  const D = window.SARA_DEMO;
  const base = T.latLonToCell(terrain, D.base[0], D.base[1]);
  const nodes = [base].concat(D.stops.map((p) => T.latLonToCell(terrain, p[0], p[1])));
  const home = P.homeField(terrain, base);
  const fields = nodes.map((n) => P.travelField(terrain, n));
  const matrix = nodes.map((a, i) => nodes.map((b) => fields[i].timeS[idx(b)]));
  const order = PL.bestOrder(matrix);
  const budget = PL.evaluate(matrix, order, nodes.map((n) => home.timeS[idx(n)]));
  let dist = 0, from = 0;
  for (const k of order) { dist += P.pathTo(terrain, fields[from], nodes[k]).distM; from = k; }
  dist += P.pathHome(terrain, home, nodes[from]).distM;
  report('Demo plan', `${(dist / 1000).toFixed(2)} km, ${Math.floor(budget.totalS / 3600)} h ${Math.round(budget.totalS / 60) % 60} min, spare ${Math.round(budget.marginS / 60)} min`,
    `order ${order.join('-')}, ${D.stops.length} points, ${PL.WORK_MIN_PER_STOP} min work each`);
}

// 9. Slope classes of the zone
{
  const s = T.slopeStats(terrain, T.SLOPE_CAUTION_DEG, T.SLOPE_BLOCK_DEG);
  report('Slopes in the 2 x 2 km zone', `${(s.safe * 100).toFixed(1)} % safe, ${(s.caution * 100).toFixed(1)} % caution, ${(s.blocked * 100).toFixed(1)} % blocked`,
    `steepest ${s.maxDeg.toFixed(1)}° on the 5 m grid`);
}

console.log('SARA validation — ' + new Date().toISOString().slice(0, 10) + '\n');
for (const r of rows) console.log(`- ${r.check}: ${r.result}${r.note ? '  (' + r.note + ')' : ''}`);
void R;
