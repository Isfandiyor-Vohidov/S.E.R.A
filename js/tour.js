// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// tour.js: a one-minute guided tour for the jury. It drives the real app (globe, demo plan,
// verdict, way home, minerals, solar storm, helmet view) and explains each step in one line.
// Start: the "Tour" button, the welcome card, or planner.html?tour=1.

(function () {
  'use strict';

  var S = window.SERA;
  if (!S) return;
  var tr = function (s) { return window.SeraI18n ? SeraI18n.t(s) : s; };
  var $ = function (id) { return document.getElementById(id); };
  function click(id) { var b = $(id); if (b) b.click(); }
  function hudOpen() { return !$('hud').hidden; }

  var STEPS = [
    { ms: 6000, title: 'Mars, real NASA maps', text: 'A 3D Mars from Viking colour and MOLA relief. Gale Crater is where Curiosity works today.',
      run: function () { if (hudOpen()) click('hud-exit'); S.globe.show(true); setTimeout(function () { S.globe.select('gale'); }, 600); } },
    { ms: 6500, title: 'One EVA zone, 2 × 2 km', text: 'Real terrain from a 1 m elevation model (HiRISE, CTX, HRSC). Yellow: steep, slower. Red: over 25°, closed.',
      run: function () { S.globe.show(false); S.setActive('eva'); S.views.eva(); } },
    { ms: 7000, title: 'Plan in one click', text: 'Base and four science points. S.E.R.A finds a safe path over the slopes and the fastest order of the points.',
      run: function () { S.runDemo(); } },
    { ms: 7000, title: 'GO / CAUTION / NO-GO', text: 'One clear answer with the reason: suit time, daylight, slopes, radio, dose and live space weather.',
      run: function () { var v = $('verdict'); if (v) v.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(v); } },
    { ms: 6500, title: 'Always the way home', text: 'Mint dashed line: the fastest safe way back from every point. Downhill is faster than uphill.',
      run: function () { flash($('stops')); } },
    { ms: 6500, title: 'Science on the way', text: 'MRO CRISM mineral signals: sulfates and clays. Any spot can be added as a named science point.',
      run: function () { if (S.crism) S.crism.setOn(true); } },
    { ms: 6500, title: 'Solar storm', text: 'A proton event turns the plan to NO-GO at once. Live data from NASA DONKI and NOAA.',
      run: function () { if (S.crism) S.crism.setOn(false); if ($('btn-storm').getAttribute('aria-pressed') !== 'true') click('btn-storm'); flash($('verdict')); } },
    { ms: 9000, title: 'Helmet view', text: 'The walk as the visor shows it: suit time left, way home from here, next target. One button: Emergency · home.',
      run: function () {
        if ($('btn-storm').getAttribute('aria-pressed') === 'true') click('btn-storm');
        click('btn-hud');
        setTimeout(function () { var sp = $('hud-speed'); while (sp && sp.textContent !== '×600') sp.click(); click('hud-play'); }, 400);
      } },
    { ms: 6000, title: 'Checked with real data', text: 'Our terrain matches Curiosity\'s own records within 0.26 m on average over 144 stops. Your turn: plan your own EVA.',
      run: function () { if (hudOpen()) click('hud-exit'); } }
  ];

  var card = document.createElement('div');
  card.className = 'tour';
  card.setAttribute('role', 'status');
  card.hidden = true;
  card.innerHTML = '<div class="tour-top"><span class="tour-step"></span><div class="tour-dots"></div></div>' +
    '<b class="tour-title"></b><p class="tour-text"></p>' +
    '<div class="tour-actions"><button type="button" class="tour-pause">Pause</button>' +
    '<button type="button" class="tour-next">Next →</button><button type="button" class="tour-exit">End tour</button></div>';
  document.body.appendChild(card);
  var dots = card.querySelector('.tour-dots');
  STEPS.forEach(function () { dots.appendChild(document.createElement('i')); });

  var idx = -1, timer = 0, paused = false;

  function flash(el) {
    if (!el) return;
    el.classList.remove('tour-flash'); void el.offsetWidth; el.classList.add('tour-flash');
  }

  function show(i) {
    clearTimeout(timer);
    if (i >= STEPS.length) { stop(); return; }
    idx = i;
    var s = STEPS[i];
    card.querySelector('.tour-step').textContent = tr('Tour') + ' · ' + (i + 1) + ' / ' + STEPS.length;
    card.querySelector('.tour-title').textContent = tr(s.title);
    card.querySelector('.tour-text').textContent = tr(s.text);
    card.querySelector('.tour-next').textContent = i === STEPS.length - 1 ? tr('Finish') : tr('Next →');
    [].forEach.call(dots.children, function (d, k) { d.classList.toggle('on', k <= i); });
    try { s.run(); } catch (e) { /* a step must never stop the tour */ }
    if (!paused) timer = setTimeout(function () { show(idx + 1); }, s.ms);
  }

  function start() {
    var w = $('welcome'); if (w) w.hidden = true;
    paused = false;
    card.querySelector('.tour-pause').textContent = tr('Pause');
    card.hidden = false;
    document.body.classList.add('touring');
    show(0);
  }
  function stop() {
    clearTimeout(timer);
    idx = -1;
    card.hidden = true;
    document.body.classList.remove('touring');
  }

  card.querySelector('.tour-next').addEventListener('click', function () { show(idx + 1); });
  card.querySelector('.tour-exit').addEventListener('click', stop);
  card.querySelector('.tour-pause').addEventListener('click', function () {
    paused = !paused;
    this.textContent = paused ? tr('Continue') : tr('Pause');
    clearTimeout(timer);
    if (!paused) timer = setTimeout(function () { show(idx + 1); }, 3000);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !card.hidden) stop(); });

  ['btn-tour', 'btn-tour-welcome'].forEach(function (id) {
    var b = $(id); if (b) b.addEventListener('click', start);
  });
  S.tour = { start: start, stop: stop };
  window.SeraTour = { start: start, stop: stop, isOn: function () { return !card.hidden; } };
  if (/[?&]tour=1\b/.test(location.search)) setTimeout(start, 600);
})();
