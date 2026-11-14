// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// hud.js: helmet HUD. Plays the planned EVA as a simulation (the astronaut walks the route at
// the modelled speed, works at each point) and shows what the visor would show: suit time left,
// time to get home from where you stand, the next target, the slope under your feet.
// "Emergency · home" drops the plan and leads home by the fastest safe way from the current spot.
// The HUD is always dark.

(function () {
  'use strict';

  var T = SeraTerrain, P = SeraPath, PL = SeraPlanner, MT = SeraMarsTime;
  var S = window.SERA;
  var terrain = S.terrain;
  var plan = S.plan;

  var VIEW_M = 800;                 // width of the visor map in metres
  var SPEEDS = [60, 240, 600];      // simulation speed: sim seconds per real second
  var CAUTION_MARGIN_S = 30 * 60;   // same 30 min rule as risk.js

  var el = document.getElementById('hud');
  var canvas = document.getElementById('hud-map');
  var openBtn = document.getElementById('btn-hud');
  var q = function (id) { return document.getElementById(id); };

  var relief = null;
  var tl = null;          // timeline: {segs, totalS, usableS, limitS, startH}
  var simS = 0;           // elapsed EVA time, seconds
  var playing = false, speedIdx = 0, lastFrame = 0, raf = 0;
  var emergency = null;   // {fromS, segs} once the emergency return started
  var homeNow = null;     // fastest way home from the current cell

  function cellIndex(c) { return c.r * terrain.cols + c.c; }
  function fmtClock(s) {
    var mins = Math.max(0, Math.round(s / 60));
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fmtMin(s) {
    var m = Math.round(s / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + 'm';
  }
  function hhmm(h) {
    h = ((h % 24) + 24) % 24;
    var H = Math.floor(h), M = Math.floor((h - H) * 60);
    return (H < 10 ? '0' : '') + H + ':' + (M < 10 ? '0' : '') + M;
  }

  // A walk segment with the time of every step, by the same walking model as the planner.
  function walkSeg(cells, t0, label, target) {
    var times = [t0];
    for (var i = 1; i < cells.length; i++) {
      var a = cells[i - 1], b = cells[i];
      var diag = a.r !== b.r && a.c !== b.c;
      times.push(times[i - 1] + P.stepTime(terrain, a.r, a.c, b.r, b.c, diag ? Math.SQRT2 : 1));
    }
    return { type: 'walk', cells: cells, times: times, t0: t0, t1: times[times.length - 1], label: label, target: target };
  }

  function buildTimeline() {
    var segs = [], t = 0, workS = PL.WORK_MIN_PER_STOP * 60;
    plan.stops.forEach(function (s, i) {
      var w = walkSeg(plan.legs[i].cells, t, 'To science point ' + (i + 1), { cell: s, name: 'Point ' + (i + 1) });
      segs.push(w); t = w.t1;
      segs.push({ type: 'work', cell: s, t0: t, t1: t + workS, label: 'Science work at point ' + (i + 1), stop: i });
      t += workS;
    });
    var h = walkSeg(plan.home.cells, t, 'Back to base', { cell: plan.base, name: 'Base' });
    segs.push(h);
    var start = q('start-time').value.split(':');
    return {
      segs: segs, totalS: h.t1,
      limitS: PL.SUIT_HOURS * 3600, usableS: PL.SUIT_HOURS * 3600 * (1 - PL.RESERVE_SHARE),
      startH: (+start[0]) + (+start[1]) / 60
    };
  }

  // Where the astronaut is at time s: {r, c} in fractional cells, plus the segment.
  function stateAt(s) {
    var segs = emergency ? emergency.segs : tl.segs;
    var seg = segs[segs.length - 1];
    for (var i = 0; i < segs.length; i++) { if (s <= segs[i].t1) { seg = segs[i]; break; } }
    if (seg.type === 'work') return { r: seg.cell.r, c: seg.cell.c, seg: seg, heading: null };
    var k = 1;
    while (k < seg.times.length - 1 && seg.times[k] < s) k++;
    var a = seg.cells[k - 1], b = seg.cells[k] || a;
    var span = seg.times[k] - seg.times[k - 1];
    var f = span > 0 ? Math.min(1, Math.max(0, (s - seg.times[k - 1]) / span)) : 1;
    return { r: a.r + (b.r - a.r) * f, c: a.c + (b.c - a.c) * f, seg: seg, k: k,
      heading: Math.atan2(b.c - a.c, a.r - b.r) };
  }
  function endS() { return emergency ? emergency.segs[0].t1 : tl.totalS; }

  function nearestCell(st) { return { r: Math.round(st.r), c: Math.round(st.c) }; }

  function bearingText(from, to) {
    var dx = (to.c - from.c) * terrain.cellM, dy = (from.r - to.r) * terrain.cellM;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var deg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    var names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return { dist: dist, deg: deg, name: names[Math.round(deg / 45) % 8] };
  }

  function draw(st) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0C171A'; g.fillRect(0, 0, w, h);
    var scale = w / (VIEW_M / terrain.cellM);              // px per cell
    var ox = w / 2 - (st.c + 0.5) * scale, oy = h / 2 - (st.r + 0.5) * scale;
    g.imageSmoothingEnabled = true;
    g.drawImage(relief, ox, oy, terrain.cols * scale, terrain.rows * scale);
    g.fillStyle = 'rgba(12,23,26,0.25)'; g.fillRect(0, 0, w, h);   // visor tint

    function X(c) { return ox + (c.c + 0.5) * scale; }
    function Y(c) { return oy + (c.r + 0.5) * scale; }
    function line(cells, color, width, dash) {
      if (!cells || cells.length < 2) return;
      g.beginPath();
      cells.forEach(function (c, i) { if (i) g.lineTo(X(c), Y(c)); else g.moveTo(X(c), Y(c)); });
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.setLineDash([]); g.strokeStyle = 'rgba(12,23,26,0.7)'; g.lineWidth = width + 3; g.stroke();
      g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = width; g.stroke();
      g.setLineDash([]);
    }
    tl.segs.forEach(function (sg) {
      if (sg.type === 'walk') line(sg.cells, (emergency || sg.t1 <= simS) ? 'rgba(231,143,103,0.35)' : '#E78F67', emergency ? 2.5 : 4);
    });
    if (homeNow) line(homeNow.cells, '#A7F1C2', emergency ? 5 : 3, emergency ? null : [8, 7]);

    function marker(c, label, isBase) {
      var x = X(c), y = Y(c);
      g.fillStyle = isBase ? '#EDF2EA' : '#E78F67'; g.strokeStyle = '#0C171A'; g.lineWidth = 2;
      g.beginPath();
      if (isBase && g.roundRect) g.roundRect(x - 12, y - 12, 24, 24, 5); else g.arc(x, y, 12, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.fillStyle = '#0C171A'; g.font = '700 12px Inter, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + 0.5);
    }
    plan.stops.forEach(function (c, i) { marker(c, String(i + 1), false); });
    marker(plan.base, 'H', true);

    // Astronaut: a ring with the walking direction.
    var cx = w / 2, cy = h / 2;
    g.strokeStyle = '#EDF2EA'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#EDF2EA'; g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2); g.fill();
    if (st.heading !== null && st.heading !== undefined) {
      g.save(); g.translate(cx, cy); g.rotate(st.heading);
      g.beginPath(); g.moveTo(0, -22); g.lineTo(6, -13); g.lineTo(-6, -13); g.closePath(); g.fill();
      g.restore();
    }
    // Scale bar 100 m
    var px100 = 100 / terrain.cellM * scale;
    g.strokeStyle = '#EDF2EA'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(16, h - 18); g.lineTo(16 + px100, h - 18); g.stroke();
    g.fillStyle = '#EDF2EA'; g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText('100 m', 16, h - 28);
  }

  var lastCellKey = '';
  function update() {
    var st = stateAt(simS);
    var cell = nearestCell(st);
    var key = cell.r + ',' + cell.c;
    if (key !== lastCellKey) {                       // the field gives the way home at once
      homeNow = P.pathHome(terrain, plan.field, cell);
      lastCellKey = key;
    }
    var i = cellIndex(cell);
    var homeS = plan.field.timeS[i];
    var suitLeftS = tl.limitS - simS;
    var marginS = tl.usableS - (simS + homeS);
    var done = simS >= endS() - 0.5;

    // Status: the same rule as the planner, applied to where you are now.
    var level = 0, msg = 'On plan';
    if (marginS < 0) { level = 2; msg = 'Turn back now: the way home needs the suit reserve'; }
    else if (marginS < CAUTION_MARGIN_S) { level = 1; msg = 'Less than 30 min of spare suit time'; }
    if (emergency) { level = Math.max(level, 1); msg = 'Emergency return: fastest safe way home'; }
    if (done) { level = 0; msg = emergency ? 'Back at base after emergency return' : 'EVA complete, back at base'; }
    var labels = ['GO', 'CAUTION', 'NO-GO'];
    var stEl = q('hud-status');
    stEl.className = 'hud-status lv' + level;
    stEl.textContent = labels[level];
    q('hud-msg').textContent = msg;

    q('hud-clock').textContent = hhmm(tl.startH + simS / MT.MARS_HOUR_S);
    q('hud-elapsed').textContent = fmtClock(simS);
    q('hud-suit').textContent = fmtClock(suitLeftS);
    q('hud-suit-bar').style.width = Math.max(0, Math.min(100, suitLeftS / tl.limitS * 100)) + '%';
    q('hud-home').textContent = done ? '0 min' : fmtMin(homeS);
    q('hud-margin').textContent = (marginS < 0 ? '−' : '') + fmtMin(Math.abs(marginS));
    q('hud-margin').className = marginS < 0 ? 'neg' : (marginS < CAUTION_MARGIN_S ? 'warn' : '');

    var seg = st.seg;
    q('hud-task').textContent = done ? 'At base' : (emergency ? 'Emergency return to base' : seg.label);
    var target = seg.type === 'work' ? null : seg.target;
    if (target && !done) {
      var b = bearingText(st, target.cell);
      q('hud-target').textContent = target.name;
      q('hud-target-dist').textContent = Math.round(b.dist) + ' m ' + b.name;
      q('hud-target-eta').textContent = fmtMin(seg.t1 - simS);
      q('hud-arrow').style.transform = 'rotate(' + b.deg + 'deg)';
      q('hud-arrow').style.visibility = 'visible';
    } else {
      q('hud-target').textContent = seg.type === 'work' ? 'Science work' : 'Base';
      q('hud-target-dist').textContent = seg.type === 'work' ? fmtMin(seg.t1 - simS) + ' left' : '—';
      q('hud-target-eta').textContent = '—';
      q('hud-arrow').style.visibility = 'hidden';
    }
    var slope = terrain.slopeDeg[i];
    var slopeEl = q('hud-slope');
    slopeEl.textContent = slope.toFixed(0) + '°';
    slopeEl.className = slope > T.SLOPE_BLOCK_DEG ? 'neg' : (slope >= T.SLOPE_CAUTION_DEG ? 'warn' : '');
    q('hud-elev').textContent = terrain.elev[i].toFixed(0) + ' m';
    var radioEl = q('hud-radio');
    if (plan.radioVis) {
      var link = !!plan.radioVis[i];
      radioEl.textContent = link ? 'Base link' : 'No link · buddy relay';
      radioEl.className = link ? '' : 'warn';
    } else radioEl.textContent = '—';
    q('hud-progress').value = Math.round(simS / Math.max(tl.totalS, endS()) * 1000);
    q('hud-emergency').disabled = !!emergency || done;
    q('hud-play').textContent = playing ? 'Pause' : (done ? 'Replay' : 'Play');
    draw(st);
  }

  function frame(now) {
    if (!playing) return;
    var dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    simS = Math.min(endS(), simS + dt * SPEEDS[speedIdx]);
    if (simS >= endS()) playing = false;
    update();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (simS >= endS() - 0.5) { emergency = null; simS = 0; }
    playing = true; lastFrame = 0;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    update();
  }
  function pause() { playing = false; cancelAnimationFrame(raf); update(); }

  function open() {
    if (!plan.base || !plan.stops.length || !plan.home) return;
    if (!relief) relief = SeraRelief.build(terrain, T);
    tl = buildTimeline();
    emergency = null; simS = 0; speedIdx = 0; lastCellKey = '';
    q('hud-speed').textContent = '×' + SPEEDS[speedIdx];
    q('hud-plan-total').textContent = fmtMin(tl.totalS);
    var verdict = plan.risk ? ['GO', 'CAUTION', 'NO-GO'][plan.risk.level] : '—';
    q('hud-preeva').textContent = verdict;
    el.hidden = false;
    document.body.classList.add('hud-open');
    update();
    q('hud-play').focus();
  }
  function close() {
    pause();
    el.hidden = true;
    document.body.classList.remove('hud-open');
    openBtn.focus();
  }

  function startEmergency() {
    var st = stateAt(simS);
    var cell = nearestCell(st);
    var path = P.pathHome(terrain, plan.field, cell);
    if (!path) return;
    emergency = { fromS: simS, segs: [walkSeg(path.cells, simS, 'Emergency return', { cell: plan.base, name: 'Base' })] };
    lastCellKey = '';
    if (!playing) play(); else update();
  }

  openBtn.addEventListener('click', open);
  q('hud-exit').addEventListener('click', close);
  q('hud-play').addEventListener('click', function () { if (playing) pause(); else play(); });
  q('hud-speed').addEventListener('click', function () {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    this.textContent = '×' + SPEEDS[speedIdx];
  });
  q('hud-emergency').addEventListener('click', startEmergency);
  q('hud-progress').addEventListener('input', function () {
    if (emergency) { emergency = null; lastCellKey = ''; }
    simS = this.value / 1000 * tl.totalS;
    update();
  });
  document.addEventListener('keydown', function (e) {
    if (el.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === ' ' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
      e.preventDefault(); if (playing) pause(); else play();
    }
  });
  window.addEventListener('resize', function () { if (!el.hidden) update(); });

  // The HUD needs a finished plan.
  function syncButton() { openBtn.disabled = !(plan.base && plan.stops.length && plan.home); }
  setInterval(syncButton, 500);
  syncButton();

  window.SeraHud = { open: open, close: close, emergency: startEmergency,
    _state: function () { return { simS: simS, totalS: tl && tl.totalS, emergency: !!emergency }; } };
})();
