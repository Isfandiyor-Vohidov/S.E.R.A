// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// hud.js: helmet HUD. Plays the planned EVA as a simulation (the astronaut walks the route at
// the modelled speed, works at each point) and shows what the visor would show: suit time left,
// time to get home from where you stand, the next target, the slope under your feet.
// "Emergency · home" drops the plan and leads home by the fastest safe way from the current spot.
// It also watches the walk: off the route -> a warning and a new path to the next point;
// conditions change (storm alert) -> NO-GO and the way home is rebuilt at once.
// Seen from inside the helmet (visor frame image). The HUD is always dark.
// 3D view (fpv.js): first person on the real terrain, look around by dragging; the top-down map
// becomes a small radar. Without WebGL, or with "Map view", the old top-down map fills the visor.

(function () {
  'use strict';

  var T = SeraTerrain, P = SeraPath, PL = SeraPlanner, MT = SeraMarsTime;
  var S = window.SERA;
  var terrain = S.terrain;
  var plan = S.plan;

  var VIEW_M = 800;                 // width of the visor map in metres
  var SPEEDS = [10, 60, 240, 600];  // simulation speed: sim seconds per real second (10 = walk pace in 3D)
  var SPEED_TEXT = ['1 s = 10 s', '1 s = 1 min', '1 s = 4 min', '1 s = 10 min'];
  var OFF_ROUTE_M = 20;             // further than this from the planned path = off route
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
  var notice = null;      // {atS, forS, level, text}: off route, shown for a while
  var fpvOK = false, fpvOn = false;        // 3D view available / shown
  var yaw = 0, lookYaw = 0, lookPitch = 0, lastLookAt = 0, sceneKey = '';
  var RADAR_M = 450;                        // the radar shows 450 m around you
  // Free walk: you move yourself (keys or joystick), the clock runs in real time, Mars gravity.
  var MARS_G = 3.71;                        // m/s2, 0.38 of Earth's
  var WALK_MS = 1.4, RUN_MS = 3.0;          // walk / run speed on flat ground (sped up for a demo)
  var JUMP_MS = 2.2;                        // take-off speed: ~0.65 m high, ~1.2 s in the air on Mars
  var free = { on: false, r: 0, c: 0, footY: 0, vy: 0, last: 0, raf: 0, fwd: 0, side: 0, turn: 0, run: false, jump: false, stickF: 0, stickS: 0, stickRun: false,
    vx: 0, vz: 0, phase: 0, stride: 0, dip: 0, dipV: 0, bodyYaw: 0, third: 0, thirdWant: 0 };
  // Camera distance steps for the mouse wheel: 0 = through the helmet, then behind the astronaut.
  var THIRD = [0, 3.5, 6, 10];

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
      var named = window.SERA.stopName(s, i, true);
      var name = named ? (i + 1) + ' · ' + named : 'Point ' + (i + 1);
      var w = walkSeg(plan.legs[i].cells, t, 'To ' + name, { cell: s, name: name });
      segs.push(w); t = w.t1;
      segs.push({ type: 'work', cell: s, t0: t, t1: t + workS, label: 'Science work · ' + name, stop: i });
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
    var radar = fpvOn;
    if (radar) {                                           // round radar in the corner of the visor
      g.clearRect(0, 0, w, h);
      g.save(); g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.clip();
    }
    var scale = w / ((radar ? RADAR_M : VIEW_M) / terrain.cellM);   // px per cell
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
      var x = X(c), y = Y(c), m = radar ? 8 : 12;
      g.fillStyle = isBase ? '#EDF2EA' : '#E78F67'; g.strokeStyle = '#0C171A'; g.lineWidth = 2;
      g.beginPath();
      if (isBase && g.roundRect) g.roundRect(x - m, y - m, 2 * m, 2 * m, 4); else g.arc(x, y, m, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.fillStyle = '#0C171A'; g.font = '700 ' + (radar ? 9 : 12) + 'px Inter, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + 0.5);
    }
    plan.stops.forEach(function (c, i) { marker(c, String(i + 1), false); });
    marker(plan.base, 'H', true);

    // Astronaut: a ring with the walking direction.
    var cx = w / 2, cy = h / 2;
    g.strokeStyle = '#EDF2EA'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#EDF2EA'; g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2); g.fill();
    if (radar) {                                           // where you look: a view cone
      g.save(); g.translate(cx, cy); g.rotate(yaw + lookYaw);
      g.fillStyle = 'rgba(167,241,194,0.22)';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w / 2, -Math.PI / 2 - 0.61, -Math.PI / 2 + 0.61); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = '#EDF2EA';
    }
    if (st.heading !== null && st.heading !== undefined) {
      g.save(); g.translate(cx, cy); g.rotate(st.heading);
      g.beginPath(); g.moveTo(0, -22); g.lineTo(6, -13); g.lineTo(-6, -13); g.closePath(); g.fill();
      g.restore();
    }
    if (radar) {
      g.restore();
      g.fillStyle = '#EDF2EA'; g.font = '700 11px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('N', w / 2, 13);
      return;
    }
    // Scale bar 100 m
    var px100 = 100 / terrain.cellM * scale;
    g.strokeStyle = '#EDF2EA'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(16, h - 18); g.lineTo(16 + px100, h - 18); g.stroke();
    g.fillStyle = '#EDF2EA'; g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText('100 m', 16, h - 28);
  }

  var lastCellKey = '';
  // Where you are in free walk: the nearest science point (or the base) is the target.
  function freeState() {
    var best = null;
    plan.stops.forEach(function (c, i) {
      var d = Math.hypot(c.r - free.r, c.c - free.c);
      var named = S.stopName(c, i, true);
      if (!best || d < best.d) best = { d: d, cell: c, name: named || ('Point ' + (i + 1)) };
    });
    var db = Math.hypot(plan.base.r - free.r, plan.base.c - free.c);
    if (!best || db < best.d) best = { d: db, cell: plan.base, name: 'Base' };
    var seg = { type: 'free', label: 'Free walk', target: { cell: best.cell, name: best.name },
      t1: simS + best.d * terrain.cellM / WALK_MS };
    return { r: free.r, c: free.c, seg: seg, heading: null };
  }
  function update() {
    var st = free.on ? freeState() : stateAt(simS);
    var cell = nearestCell(st);
    var key = cell.r + ',' + cell.c;
    if (key !== lastCellKey) {                       // the field gives the way home at once
      homeNow = P.pathHome(terrain, plan.field, cell);
      lastCellKey = key;
      if (fpvOK && homeNow) SeraFpv.setHome(homeNow.cells, !!emergency);
    }
    var i = cellIndex(cell);
    var homeS = plan.field.timeS[i];
    var suitLeftS = tl.limitS - simS;
    var marginS = tl.usableS - (simS + homeS);
    var done = !free.on && simS >= endS() - 0.5;

    // Status: the same rule as the planner, applied to where you are now.
    var level = 0, msg = free.on ? 'Exploring on your own' : 'On plan';
    if (marginS < 0) { level = 2; msg = 'Turn back now: the way home needs the suit reserve'; }
    else if (marginS < CAUTION_MARGIN_S) { level = 1; msg = 'Less than 30 min of spare suit time'; }
    if (notice && simS - notice.atS < notice.forS) { level = Math.max(level, notice.level); msg = notice.text; }
    if (emergency) { level = Math.max(level, emergency.level || 1); msg = emergency.text || 'Emergency return: fastest safe way home'; }
    if (done) { level = 0; msg = emergency ? 'Back at base after emergency return' : 'EVA complete, back at base'; }
    var labels = ['GO', 'CAUTION', 'NO-GO'];
    var stEl = q('hud-status');
    stEl.className = 'hud-status lv' + level;
    stEl.textContent = labels[level];
    q('hud-msg').textContent = msg;
    q('hud-msg').classList.toggle('alert', level === 2 && !done);

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
    q('hud-drift').disabled = !!emergency || done;
    q('hud-storm').disabled = !!emergency || done;
    q('hud-play').textContent = playing ? 'Pause' : (done ? 'Replay' : 'Play');
    draw(st);
    var ctrl = q('hud-play').parentNode.offsetHeight;
    if (ctrl) el.style.setProperty('--ctrl-h', ctrl + 'px');
    if (fpvOn) render3d(st);
  }

  // ---- 3D view --------------------------------------------------------------------------
  // What is on the ground: the route (passed parts fade), science points and the base as beacons.
  function syncScene() {
    var passed = tl.segs.filter(function (sg) { return sg.t1 <= simS; }).length;
    var key = tl.segs.length + '|' + Math.round(tl.totalS) + '|' + passed + '|' + (emergency ? emergency.fromS : '');
    if (key === sceneKey) return;
    sceneKey = key;
    var routeList = tl.segs.filter(function (sg) { return sg.type === 'walk'; }).map(function (sg) {
      var old = emergency || sg.t1 <= simS;
      return { cells: sg.cells, color: old ? [0.91, 0.56, 0.4, 0.3] : [0.91, 0.56, 0.4, 0.9], width: old ? 0.4 : 0.55 };
    });
    var pts = plan.stops.map(function (c, i) {
      var named = S.stopName(c, i, true);
      return { cell: c, color: [0.91, 0.56, 0.4], label: (i + 1) + (named ? ' · ' + named : '') };
    });
    pts.push({ cell: plan.base, color: [0.65, 0.95, 0.76], label: 'H · Base', base: true });
    SeraFpv.setScene(routeList, pts);
    if (homeNow) SeraFpv.setHome(homeNow.cells, !!emergency);
  }
  function angleTo(a, b, k) {                       // turn from a towards b by share k, the short way
    var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * k;
  }
  // The head turns smoothly: it looks at a spot ~15 m ahead on the path (not at the next 5 m cell,
  // whose zigzag made the view jerk), and every turn eases in over about a second.
  var lastRender = 0, settleRaf = 0, wantYaw = 0, wantPitch = 0;
  function render3d(st) {
    syncScene();
    var now = performance.now(), dt = Math.min(0.1, Math.max(0.001, (now - lastRender) / 1000));
    lastRender = now;
    var target = st.heading;
    if (st.seg && st.seg.cells && st.k !== undefined) {
      var ahead = st.seg.cells[Math.min(st.seg.cells.length - 1, st.k + 3)];
      if (ahead && Math.hypot(ahead.r - st.r, ahead.c - st.c) > 0.5) target = Math.atan2(ahead.c - st.c, st.r - ahead.r);
    }
    if (target !== null && target !== undefined) yaw = angleTo(yaw, target, playing ? 1 - Math.exp(-dt / 0.9) : 1);
    if (playing && !looking && now - lastLookAt > 2500) {          // after a look-around, slowly face ahead again
      var back = Math.exp(-dt / 1.6); wantYaw *= back; wantPitch *= back;
    }
    var ease = 1 - Math.exp(-dt / (locked() ? 0.035 : 0.14));       // the look follows your drag softly
    lookYaw += (wantYaw - lookYaw) * ease; lookPitch += (wantPitch - lookPitch) * ease;
    var cam = { r: st.r, c: st.c, yaw: yaw + lookYaw, pitch: -0.1 + lookPitch,
      hour: tl.startH + simS / MT.MARS_HOUR_S, footY: free.on ? free.footY : undefined };
    if (free.on) {
      free.third += (free.thirdWant - free.third) * (1 - Math.exp(-dt / 0.18));
      if (Math.abs(free.thirdWant - free.third) < 0.01) free.third = free.thirdWant;
      el.classList.toggle('third', free.third > 0.3);
      // the step: the head goes up and down twice and sways once per stride; a landing bends the knees
      cam.bob = Math.abs(Math.sin(free.phase)) * 0.045 * free.stride - 0.02 * free.stride - free.dip;
      cam.sway = Math.sin(free.phase) * 0.025 * free.stride;
      cam.third = free.third;
      cam.body = { yaw: free.bodyYaw, phase: free.phase, stride: free.stride, air: free.footY > groundAt(free.r, free.c) + 0.05 };
    }
    SeraFpv.render(cam);
    compass(yaw + lookYaw);
    placeRadar();
    // While paused, keep drawing until the look has settled.
    if (!playing && !settleRaf && (Math.abs(wantYaw - lookYaw) > 0.0005 || Math.abs(wantPitch - lookPitch) > 0.0005)) {
      settleRaf = requestAnimationFrame(function () { settleRaf = 0; if (!playing && fpvOn && !el.hidden) update(); });
    }
  }
  // The radar sits under the right-hand readouts; if there is no room there, to their left.
  function placeRadar() {
    var right = el.querySelector('.hud-right');
    if (!right || window.innerWidth <= 760 || window.innerHeight <= 500) { canvas.style.top = canvas.style.right = canvas.style.width = canvas.style.height = ''; return; }
    var box = el.getBoundingClientRect(), rr = right.getBoundingClientRect();
    var status = el.querySelector('.hud-statusline'), floor = status ? status.getBoundingClientRect().top : box.bottom - 120;
    var size = 150, top = rr.bottom + 14 - box.top;
    if (floor - box.top - top - 10 >= 110) {
      size = Math.min(150, floor - box.top - top - 10);
      canvas.style.right = (box.right - rr.right + (rr.width - size) / 2) + 'px';
    } else {                                                        // beside the column, at its bottom
      top = Math.max(rr.top - box.top, rr.bottom - box.top - size);
      canvas.style.right = (box.right - rr.left + 14) + 'px';
    }
    canvas.style.top = top + 'px'; canvas.style.bottom = 'auto';
    canvas.style.width = canvas.style.height = size + 'px';
  }
  // Compass strip at the top of the visor.
  var compassStrip = q('hud-compass-strip'), PX_DEG = 2.4;
  (function buildCompass() {
    var names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }, html = '';
    for (var d = -180; d <= 540; d += 15) {
      var n = ((d % 360) + 360) % 360;
      html += '<span style="left:' + ((d + 180) * PX_DEG) + 'px" class="' + (names[n] ? 'cardinal' : '') + '">' + (names[n] || (n % 45 === 0 ? '' : '·')) + '</span>';
    }
    compassStrip.innerHTML = html;
  })();
  function compass(rad) {
    var deg = ((rad * 180 / Math.PI) % 360 + 360) % 360;
    var box = compassStrip.parentNode.clientWidth;
    compassStrip.style.transform = 'translateX(' + (box / 2 - (deg + 180) * PX_DEG) + 'px)';
    q('hud-heading').textContent = Math.round(deg) + '°';
  }
  // Look around: drag on the view.
  var looking = false, lx = 0, ly = 0;
  var view3d = q('hud-3d');
  var lastTap = 0;
  view3d.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') {                     // double-tap = straight ahead (like double-click)
      var t = performance.now();
      if (t - lastTap < 320) { wantYaw = 0; wantPitch = 0; lastTap = 0; if (!playing) update(); return; }
      lastTap = t;
    }
    if (free.on && e.pointerType === 'mouse' && !phone) { lockMouse(); return; }
    looking = true; lx = e.clientX; ly = e.clientY;
    view3d.setPointerCapture(e.pointerId);
    el.classList.add('looked');
  });
  view3d.addEventListener('pointermove', function (e) {
    if (!looking) return;
    wantYaw += (e.clientX - lx) * -0.0022;                          // gentle: ~800 px drag = a half turn
    wantPitch = Math.max(-0.6, Math.min(0.5, wantPitch + (e.clientY - ly) * 0.0018));
    lx = e.clientX; ly = e.clientY;
    lastLookAt = performance.now();
    if (!playing) update();
  });
  function stopLook() { looking = false; lastLookAt = performance.now(); }
  // ---- Game mode (free walk on a computer): the mouse is captured, moving it looks around.
  // Ctrl lets the mouse go (to press buttons) and Ctrl again captures it. Esc also lets it go.
  function locked() { return document.pointerLockElement === view3d; }
  var unlockedAt = 0;
  function lockMouse() {
    if (!free.on || phone || locked() || !view3d.requestPointerLock) return;
    try { var p = view3d.requestPointerLock(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* needs a click */ }
  }
  function unlockMouse() { if (locked()) document.exitPointerLock(); }
  document.addEventListener('pointerlockchange', function () {
    el.classList.toggle('game', locked());
    if (!locked()) unlockedAt = performance.now();
    if (!el.hidden) update();
  });
  document.addEventListener('mousemove', function (e) {
    if (!locked()) return;
    wantYaw += e.movementX * 0.0022;                               // mouse right = turn right
    wantPitch = Math.max(-1.2, Math.min(1.0, wantPitch - e.movementY * 0.0018));
    el.classList.add('looked');
  });
  // Mouse wheel in free walk: back = step out behind the astronaut (third person), forward = into the helmet.
  view3d.addEventListener('wheel', function (e) {
    if (!free.on) return;
    e.preventDefault();
    var i = THIRD.indexOf(free.thirdWant); if (i < 0) i = 0;
    i = Math.max(0, Math.min(THIRD.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
    free.thirdWant = THIRD[i];
  }, { passive: false });
  view3d.addEventListener('pointerup', stopLook);
  view3d.addEventListener('pointercancel', stopLook);
  view3d.addEventListener('dblclick', function () { wantYaw = 0; wantPitch = 0; if (!playing) update(); });
  function setView(on) {
    fpvOn = on && fpvOK;
    if (!fpvOn && free.on) { free.on = false; el.classList.remove('free'); cancelAnimationFrame(free.raf); q('hud-walk').textContent = 'Walk yourself'; }
    el.classList.toggle('fpv', fpvOn);
    if (!fpvOn) { el.style.background = ''; canvas.style.top = canvas.style.right = canvas.style.bottom = canvas.style.width = canvas.style.height = ''; }
    q('hud-view').textContent = fpvOn ? 'Map view' : '3D view';
    sceneKey = '';
  }
  var mapPreferred = false;
  q('hud-view').addEventListener('click', function () { mapPreferred = fpvOn; setView(!fpvOn); update(); });

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
    if (free.on) setFree(false);
    if (simS >= endS() - 0.5) { emergency = null; notice = null; simS = 0; tl = buildTimeline(); }
    playing = true; lastFrame = 0;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    update();
  }
  function pause() { playing = false; cancelAnimationFrame(raf); update(); }

  function open() {
    if (!plan.base || !plan.stops.length || !plan.home) return;
    if (!relief) relief = SeraRelief.build(terrain, T);
    if (!fpvOK && window.SeraFpv) fpvOK = SeraFpv.init(q('hud-3d'), terrain, T, q('hud-labels'));
    q('hud-view').hidden = !fpvOK;
    q('hud-walk').hidden = !fpvOK;
    tl = buildTimeline();
    emergency = null; notice = null; simS = 0; speedIdx = 0; lastCellKey = '';
    q('hud-speed').textContent = SPEED_TEXT[speedIdx];
    q('hud-plan-total').textContent = fmtMin(tl.totalS);
    var verdict = plan.risk ? ['GO', 'CAUTION', 'NO-GO'][plan.risk.level] : '—';
    q('hud-preeva').textContent = verdict;
    el.hidden = false;
    document.body.classList.add('hud-open');
    el.classList.remove('upright');
    goLandscape();
    lookYaw = 0; lookPitch = 0; wantYaw = 0; wantPitch = 0; sceneKey = '';
    var first = plan.legs[0] && plan.legs[0].cells;
    if (first && first.length > 1) yaw = Math.atan2(first[1].c - first[0].c, first[0].r - first[1].r);
    setView(fpvOK && !mapPreferred);
    speedIdx = fpvOn ? 0 : 1;                       // 3D starts at walk pace, the map at 1 s = 1 min
    q('hud-speed').textContent = SPEED_TEXT[speedIdx];
    update();
    q('hud-play').focus();
  }
  function close() {
    if (free.on) setFree(false);
    unlockMouse();
    pause();
    el.hidden = true;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    document.body.classList.remove('hud-open');
    openBtn.focus();
  }

  // Phones: the helmet view is a landscape view, like a visor. Where the browser allows it
  // (Android Chrome) it goes full screen and turns by itself; elsewhere (iPhone) a card asks to
  // turn the phone (CSS shows it while the phone is upright). "Stay upright" keeps the upright layout.
  var phone = window.matchMedia && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  function goLandscape() {
    if (!phone) return;
    var d = document.documentElement;
    try {
      if (d.requestFullscreen && !document.fullscreenElement) {
        d.requestFullscreen({ navigationUI: 'hide' }).then(function () {
          if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape');
        }).catch(function () {});
      }
    } catch (e) { /* not allowed here: the card asks instead */ }
  }
  q('hud-upright').addEventListener('click', function () { el.classList.add('upright'); update(); });
  q('hud-rot-back').addEventListener('click', function () { close(); });
  window.addEventListener('resize', function () { if (!el.hidden && !playing) update(); });

  // ---- Free walk ------------------------------------------------------------------------
  function groundAt(r, c) { return SeraFpv.elevAt((c + 0.5) * terrain.cellM, (r + 0.5) * terrain.cellM); }
  function setFree(on) {
    if (on && !fpvOn) setView(true);
    if (on) {
      if (playing) { playing = false; cancelAnimationFrame(raf); }
      var st = stateAt(simS);
      emergency = null; notice = null; sceneKey = '';
      free.r = st.r; free.c = st.c; free.footY = groundAt(st.r, st.c); free.vy = 0; free.last = 0;
      free.vx = free.vz = 0; free.stride = 0; free.dip = free.dipV = 0;
      yaw = yaw + lookYaw; lookYaw = wantYaw = 0;                // walk the way you look
      free.bodyYaw = yaw;
      lockMouse();
    } else {
      unlockMouse(); free.third = free.thirdWant = 0; el.classList.remove('third');
    }
    free.on = on;
    el.classList.toggle('free', on);
    q('hud-walk').textContent = on ? 'Follow the route' : 'Walk yourself';
    lastCellKey = '';
    cancelAnimationFrame(free.raf);
    if (on) free.raf = requestAnimationFrame(freeFrame);
    update();
  }
  function freeFrame(now) {
    if (!free.on || el.hidden) return;
    var dt = free.last ? Math.min(0.05, (now - free.last) / 1000) : 0;
    free.last = now;
    simS = Math.min(tl.limitS, simS + dt);                        // the clock runs in real time
    yaw += (free.turn * 1.6) * dt;                                // arrow keys turn
    var f = free.fwd + free.stickF, s = free.side + free.stickS, len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; len = 1; }
    var ground = groundAt(free.r, free.c), air = free.footY > ground + 0.02;
    // Where you want to go, and how fast. The suit is heavy and Mars gives little grip (0.38 g):
    // you speed up and stop over about a second; in the air you cannot steer at all.
    var a = yaw + lookYaw, sp = (free.run || free.stickRun ? RUN_MS : WALK_MS) * len;
    var tx = (Math.sin(a) * f + Math.cos(a) * s) / (len || 1) * sp, tz = (-Math.cos(a) * f + Math.sin(a) * s) / (len || 1) * sp;
    if (len <= 0.05) tx = tz = 0;
    if (!air) {
      var acc = (tx || tz ? 2.2 : 2.8) * dt, dvx = tx - free.vx, dvz = tz - free.vz, dv = Math.hypot(dvx, dvz);
      if (dv > acc) { dvx *= acc / dv; dvz *= acc / dv; }
      free.vx += dvx; free.vz += dvz;
    }
    var speed = Math.hypot(free.vx, free.vz);
    if (speed > 0.3) free.bodyYaw = angleTo(free.bodyYaw, Math.atan2(free.vx, -free.vz), 1 - Math.exp(-dt / 0.25));
    // the step: one stride ~ 1.5 m walking, longer when loping
    if (!air) {
      free.phase += speed / (speed > 2 ? 2.4 : 1.5) * Math.PI * dt;
      free.stride += (Math.min(1, speed / 1.4) - free.stride) * (1 - Math.exp(-dt / 0.2));
    }
    if (speed > 0.01) {
      var east = free.vx * dt, south = free.vz * dt;
      var nr = free.r + south / terrain.cellM, nc = free.c + east / terrain.cellM;
      var rise = groundAt(nr, nc) - ground, run = Math.hypot(east, south);
      if (!air && rise > 0 && run > 0) {                          // uphill is slower, more so the steeper
        var k = Math.max(0.35, 1 - (rise / run) * 1.6);
        nr = free.r + (nr - free.r) * k; nc = free.c + (nc - free.c) * k;
      }
      if (nr < 0 || nc < 0 || nr > terrain.rows - 1 || nc > terrain.cols - 1) {
        free.vx = free.vz = 0;
        flash(1, 'Edge of the EVA zone');
      } else {
        // The same slope as the red and yellow on the map (1 m terrain), for the cell you step into.
        var up = groundAt(nr, nc) > ground;
        var slope = terrain.slopeDeg[Math.round(nr) * terrain.cols + Math.round(nc)];
        if (!air && up && slope > T.SLOPE_BLOCK_DEG) {
          free.vx *= 0.3; free.vz *= 0.3;
          flash(2, 'Too steep to climb here (over 25°)');      // the suit and the loose ground stop you
        } else {
          if (!air && slope >= T.SLOPE_CAUTION_DEG) {           // steep: half speed
            nr = free.r + (nr - free.r) * 0.5; nc = free.c + (nc - free.c) * 0.5;
          }
          free.r = nr; free.c = nc;
        }
      }
    }
    // Mars gravity: jump, and fall when the ground drops away under you.
    ground = groundAt(free.r, free.c);
    if (free.jump && free.footY <= ground + 0.02) { free.vy = JUMP_MS; free.jump = false; free.dipV -= 0.25; }
    free.jump = false;
    free.vy -= MARS_G * dt;
    free.footY += free.vy * dt;
    if (free.footY <= ground) {
      if (free.vy < -1) free.dipV += Math.min(0.9, -free.vy * 0.25);   // landing: the knees give a little
      free.footY = ground; free.vy = 0;
    }
    // the knee bend springs back
    free.dipV += (-free.dip * 60 - free.dipV * 11) * dt;
    free.dip = Math.max(-0.05, Math.min(0.18, free.dip + free.dipV * dt));
    update();
    free.raf = requestAnimationFrame(freeFrame);
  }
  var flashAt = 0;
  function flash(level, text) {
    if (performance.now() - flashAt < 1500) return;
    flashAt = performance.now();
    notice = { atS: simS, forS: 2.5, level: level, text: text };
  }
  q('hud-walk').addEventListener('click', function () { setFree(!free.on); });
  var KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr' };
  var held = {};
  function applyKeys() {
    free.fwd = (held.f ? 1 : 0) - (held.b ? 1 : 0);
    free.side = (held.r ? 1 : 0) - (held.l ? 1 : 0);
    free.turn = (held.tr ? 1 : 0) - (held.tl ? 1 : 0);
  }
  document.addEventListener('keydown', function (e) {
    if (el.hidden || !free.on) return;
    if (KEYS[e.code]) { held[KEYS[e.code]] = true; applyKeys(); e.preventDefault(); }
    if (e.key === 'Shift') free.run = true;
    if (e.key === 'Control' && !e.repeat) { if (locked()) unlockMouse(); else lockMouse(); e.preventDefault(); }
    if (e.code === 'Space') { free.jump = true; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keyup', function (e) {
    if (KEYS[e.code]) { held[KEYS[e.code]] = false; applyKeys(); }
    if (e.key === 'Shift') free.run = false;
  });
  window.addEventListener('blur', function () { held = {}; applyKeys(); free.run = false; });
  // Phone: a joystick (walk; pushed to the edge = run) and a jump button.
  var stick = q('hud-stick'), knob = stick.querySelector('i'), stickId = null;
  function stickMove(e) {
    var b = stick.getBoundingClientRect(), R = b.width / 2;
    var dx = e.clientX - (b.left + R), dy = e.clientY - (b.top + R), d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    free.stickF = -dy / R; free.stickS = dx / R; free.stickRun = d > R * 0.92;
  }
  stick.addEventListener('pointerdown', function (e) { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); e.preventDefault(); });
  stick.addEventListener('pointermove', function (e) { if (e.pointerId === stickId) stickMove(e); });
  function stickEnd(e) {
    if (e.pointerId !== stickId) return;
    stickId = null; knob.style.transform = ''; free.stickF = free.stickS = 0; free.stickRun = false;
  }
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);
  q('hud-jump').addEventListener('pointerdown', function (e) { free.jump = true; e.preventDefault(); });

  function startEmergency(level, text) {
    var st = free.on ? { r: free.r, c: free.c } : stateAt(simS);
    if (free.on) setFree(false);
    var cell = nearestCell(st);
    var path = P.pathHome(terrain, plan.field, cell);
    if (!path) return;
    emergency = { fromS: simS, level: typeof level === 'number' ? level : 1, text: typeof text === 'string' ? text : null,
      segs: [walkSeg(path.cells, simS, 'Emergency return', { cell: plan.base, name: 'Base' })] };
    lastCellKey = '';
    sceneKey = '';
    if (!playing) play(); else update();
  }

  // --- Watching the walk -------------------------------------------------------------
  // Conditions change: a (simulated) solar particle alert -> NO-GO, the way home from here.
  function stormAlert() {
    startEmergency(2, 'Solar particle alert (test): NO-GO, new fastest way home from here');
  }

  // Off the route: the astronaut steps 40-60 m aside (around a rock, say). S.E.R.A notices it,
  // warns, and rebuilds the path from where they are to the next point; the rest of the plan stays.
  function lineCells(a, b) {
    var n = Math.max(1, Math.abs(b.r - a.r), Math.abs(b.c - a.c)), out = [];
    for (var i = 0; i <= n; i++) out.push({ r: Math.round(a.r + (b.r - a.r) * i / n), c: Math.round(a.c + (b.c - a.c) * i / n) });
    return out;
  }
  function distToPlanM(cell) {
    var best = Infinity;
    tl.segs.forEach(function (sg) {
      if (sg.type !== 'walk') return;
      sg.cells.forEach(function (c) { var d = Math.hypot(c.r - cell.r, c.c - cell.c); if (d < best) best = d; });
    });
    return best * terrain.cellM;
  }
  function stepOffRoute() {
    if (emergency || simS >= endS() - 0.5) return;
    var st = stateAt(simS), here = nearestCell(st);
    var h = (st.heading !== null && st.heading !== undefined) ? st.heading : 0;
    var off = null;
    for (var d = 8; d <= 12 && !off; d++) {
      for (var side = 1; side >= -1 && !off; side -= 2) {
        var a = h + side * Math.PI / 2;
        var c = { r: Math.round(here.r - Math.cos(a) * d), c: Math.round(here.c + Math.sin(a) * d) };
        if (c.r < 1 || c.c < 1 || c.r >= terrain.rows - 1 || c.c >= terrain.cols - 1) continue;
        var k = cellIndex(c);
        if (terrain.slopeDeg[k] < T.SLOPE_CAUTION_DEG && isFinite(plan.field.timeS[k])) off = c;
      }
    }
    if (!off) return;
    var offM = Math.round(distToPlanM(off));
    // Which point is next from here?
    var seg = st.seg, next = plan.stops.length;
    if (seg.type === 'work') next = seg.stop + 1;
    else if (seg.target && seg.target.cell !== plan.base) next = plan.stops.indexOf(seg.target.cell);
    if (next < 0) next = plan.stops.length;
    // Keep the past, walk aside, then a new path to the next point and the rest of the plan.
    var workS = PL.WORK_MIN_PER_STOP * 60, name;
    var past = tl.segs.filter(function (sg) { return sg.t1 <= simS; });
    var segs = past, t0 = simS;
    if (seg.type === 'work') {        // the science work in progress is finished first
      segs = segs.concat([{ type: 'work', cell: seg.cell, t0: seg.t0, t1: seg.t1, label: seg.label, stop: seg.stop }]);
      t0 = seg.t1;
    }
    var aside = walkSeg(lineCells(here, off), t0, 'Off route', null);
    segs = segs.concat([aside]);
    var t = aside.t1;
    if (next < plan.stops.length) {
      var target = plan.stops[next];
      var back = P.pathHome(terrain, P.homeField(terrain, target), off);
      if (!back) return;
      name = 'Point ' + (next + 1);
      var w = walkSeg(back.cells, t, 'New path to ' + name, { cell: target, name: name });
      segs.push(w); t = w.t1;
      segs.push({ type: 'work', cell: target, t0: t, t1: t + workS, label: 'Science work · ' + name, stop: next });
      t += workS;
      for (var j = next + 1; j < plan.stops.length; j++) {
        var nm = 'Point ' + (j + 1);
        var lw = walkSeg(plan.legs[j].cells, t, 'To ' + nm, { cell: plan.stops[j], name: nm });
        segs.push(lw); t = lw.t1;
        segs.push({ type: 'work', cell: plan.stops[j], t0: t, t1: t + workS, label: 'Science work · ' + nm, stop: j });
        t += workS;
      }
      var hw = walkSeg(plan.home.cells, t, 'Back to base', { cell: plan.base, name: 'Base' });
      segs.push(hw); t = hw.t1;
    } else {
      name = 'Base';
      var hb = P.pathHome(terrain, plan.field, off);
      var hw2 = walkSeg(hb.cells, t, 'Back to base', { cell: plan.base, name: 'Base' });
      segs.push(hw2); t = hw2.t1;
    }
    var added = t - tl.totalS;
    tl.segs = segs; tl.totalS = t;
    q('hud-plan-total').textContent = fmtMin(t);
    sceneKey = '';
    notice = { atS: simS, forS: 20 * 60, level: offM > OFF_ROUTE_M ? 1 : 0,
      text: 'Off route by ' + offM + ' m: new safe path to ' + name + (added > 30 ? ' (+' + fmtMin(added) + ')' : '') };
    lastCellKey = '';
    update();
  }

  openBtn.addEventListener('click', open);
  q('hud-drift').addEventListener('click', stepOffRoute);
  q('hud-storm').addEventListener('click', stormAlert);
  q('hud-exit').addEventListener('click', close);
  q('hud-play').addEventListener('click', function () { if (playing) pause(); else play(); });
  q('hud-speed').addEventListener('click', function () {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    this.textContent = SPEED_TEXT[speedIdx];
  });
  q('hud-emergency').addEventListener('click', function () { startEmergency(); });
  q('hud-progress').addEventListener('input', function () {
    if (free.on) setFree(false);
    if (emergency) { emergency = null; lastCellKey = ''; }
    simS = this.value / 1000 * tl.totalS;
    update();
  });
  document.addEventListener('keydown', function (e) {
    if (el.hidden) return;
    if (e.key === 'Escape') { if (locked() || performance.now() - unlockedAt < 400) return; close(); }
    else if (e.key === ' ' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
      e.preventDefault(); if (playing) pause(); else play();
    }
  });
  window.addEventListener('resize', function () { if (!el.hidden) update(); });

  // The HUD needs a finished plan.
  function syncButton() { openBtn.disabled = !(plan.base && plan.stops.length && plan.home); }
  setInterval(syncButton, 500);
  syncButton();

  window.SeraHud = { open: open, close: close, emergency: startEmergency, offRoute: stepOffRoute, storm: stormAlert,
    _state: function () { return { simS: simS, totalS: tl && tl.totalS, emergency: !!emergency,
      free: free.on ? { r: free.r, c: free.c, air: free.footY - groundAt(free.r, free.c) } : null }; } };
})();
