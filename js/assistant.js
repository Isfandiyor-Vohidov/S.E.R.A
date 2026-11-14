// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// assistant.js: S.E.R.A, the (fictional, AI-generated) assistant character of the app.
//  - First visit: a step-by-step guide. One part of the screen is shown at a time,
//    everything else is blurred; S.E.R.A explains it.
//  - The S.E.R.A button: she explains the current plan (verdict, reason, numbers).
//  - She reacts: thinking while a plan is checked, thumbs-up for GO, a stop hand for NO-GO,
//    a welcome back after the walk.
// The site (index.html) gets the first-visit greeting and the button only.

(function () {
  'use strict';

  var POSES = ['welcome', 'explain', 'alert', 'thinking', 'success', 'listening'];
  var IMG = function (p) { return 'img/sera/' + p + '.webp'; };
  var KEY_GUIDE = 'sera-guide-done', KEY_HELLO = 'sera-hello-done';
  var S = window.SERA;                 // set on the planner only
  var onPlanner = !!S;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // Preload the poses after the page is up, so a change of pose never flickers.
  window.addEventListener('load', function () {
    setTimeout(function () { POSES.forEach(function (p) { new Image().src = IMG(p); }); }, 800);
  });

  // ---- The card: S.E.R.A + a speech bubble ------------------------------------------------
  var card = document.createElement('div');
  card.className = 'sera-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML =
    '<img class="sera-pose" alt="S.E.R.A, the assistant">' +
    '<div class="sera-bubble">' +
    '  <span class="sera-name">S.E.R.A · AI assistant</span>' +
    '  <b class="sera-title"></b><p class="sera-text"></p><p class="sera-do"></p>' +
    '  <div class="sera-actions"></div>' +
    '  <div class="sera-timer" aria-hidden="true"><i></i></div>' +
    '  <small class="sera-credit">S.E.R.A is an AI-generated character</small>' +
    '  <button type="button" class="sera-x" aria-label="Close">×</button>' +
    '</div>';
  document.body.appendChild(card);
  var poseEl = card.querySelector('.sera-pose');
  var doEl = card.querySelector('.sera-do');
  var timerBar = card.querySelector('.sera-timer');
  var hideTimer = 0, hideAt = 0, hideLeft = 0;

  // ---- Spotlight: S.E.R.A stays in her corner, but lights up what she is talking about ----
  // A ring around the thing and a dashed line from her bubble to it.
  var spot = document.createElement('div');
  spot.className = 'sera-spot';
  spot.hidden = true;
  document.body.appendChild(spot);
  var NS = 'http://www.w3.org/2000/svg';
  var linkSvg = document.createElementNS(NS, 'svg');
  linkSvg.setAttribute('class', 'sera-link');
  linkSvg.setAttribute('aria-hidden', 'true');
  var linkLine = document.createElementNS(NS, 'line');
  linkSvg.appendChild(linkLine);
  document.body.appendChild(linkSvg);
  var spotGet = null;                  // function () -> element, or null

  function visible(el) {
    if (!el || !el.getClientRects().length) return false;
    var b = el.getBoundingClientRect();
    var cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return false;
    // Not scrolled out of its panel and not under another layer (the 3D globe, a dialog).
    var hit = document.elementFromPoint(cx, cy);
    return !hit || el === hit || el.contains(hit) || hit.contains(el) || !!hit.closest('.sera-card');
  }
  function closest(r, x, y) {          // the point of rectangle r nearest to (x, y)
    return [Math.max(r.left, Math.min(x, r.right)), Math.max(r.top, Math.min(y, r.bottom))];
  }
  function placeSpot() {
    var el = spotGet && !card.hidden && !guide ? spotGet() : null;
    if (!visible(el)) { spot.hidden = true; linkSvg.style.display = 'none'; return; }
    var b = el.getBoundingClientRect(), pad = 6;
    var r = { left: b.left - pad, top: b.top - pad, right: b.right + pad, bottom: b.bottom + pad };
    spot.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + (r.right - r.left) + 'px;height:' + (r.bottom - r.top) + 'px';
    spot.hidden = false;
    var bub = card.querySelector('.sera-bubble').getBoundingClientRect();
    var a = closest(bub, (r.left + r.right) / 2, (r.top + r.bottom) / 2);
    var z = closest(r, (bub.left + bub.right) / 2, (bub.top + bub.bottom) / 2);
    var far = Math.hypot(z[0] - a[0], z[1] - a[1]) > 24;
    linkSvg.style.display = far ? '' : 'none';
    linkLine.setAttribute('x1', a[0]); linkLine.setAttribute('y1', a[1]);
    linkLine.setAttribute('x2', z[0]); linkLine.setAttribute('y2', z[1]);
  }
  setInterval(placeSpot, 250);
  window.addEventListener('scroll', placeSpot, true);
  window.addEventListener('resize', placeSpot);
  if (S && S.map) S.map.on('move zoom', placeSpot);

  // "Show": bring the thing into view and flash the ring.
  function showSpot(getEl, onMap) {
    var el = getEl();
    if (!el) return;
    if (onMap && S.map) {
      var wrap = document.querySelector('.map-wrap');
      if (wrap) wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (S.globe && S.globe.show) S.globe.show(false);
    } else if (window.innerWidth < 761) {
      // Phone: the card covers the bottom of the screen, so put the thing in the middle of what is left.
      if (!card.hidden) document.body.style.paddingBottom = Math.round(card.getBoundingClientRect().height + 16) + 'px';
      el.scrollIntoView({ block: 'center' });
      if (!card.hidden) window.scrollBy(0, card.getBoundingClientRect().height / 2 + 8);
    } else {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    spot.classList.remove('flash');
    void spot.offsetWidth;             // restart the animation
    spot.classList.add('flash');
    setTimeout(placeSpot, 350);
    setTimeout(placeSpot, 700);
  }

  // say({pose, title, text, do, level, spot, spotOnMap, actions:[{label, primary, run}], autoHide: ms, place, toast})
  function say(o) {
    verdictToast = false;
    clearTimeout(hideTimer);
    hideTimer = 0;
    poseEl.src = IMG(o.pose || 'explain');
    card.querySelector('.sera-title').textContent = o.title || '';
    card.querySelector('.sera-text').textContent = o.text || '';
    doEl.textContent = o.do || '';
    doEl.hidden = !o.do;
    var act = card.querySelector('.sera-actions');
    act.innerHTML = '';
    var list = (o.actions || []).slice();
    if (o.spot) list.push({ label: 'Show', run: function () { showSpot(o.spot, o.spotOnMap); } });
    list.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'btn-primary' : 'btn-secondary';
      b.textContent = a.label;
      b.addEventListener('click', a.run);
      act.appendChild(b);
    });
    var lv = o.level === undefined ? '' : ' lv' + o.level;
    card.className = 'sera-card' + (o.place ? ' at-' + o.place : '') + (o.toast ? ' toast' : '') + lv;
    spot.className = 'sera-spot' + lv;
    linkSvg.setAttribute('class', 'sera-link' + lv);
    spotGet = o.spot || null;
    card.hidden = false;
    // Short messages go away by themselves (the bar shows how long); hovering keeps them.
    timerBar.hidden = !o.autoHide;
    if (o.autoHide) {
      var bar = timerBar.firstChild;
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = 'sera-timer ' + o.autoHide + 'ms linear forwards';
      hideAt = Date.now() + o.autoHide;
      hideTimer = setTimeout(hide, o.autoHide);
    }
    placeSpot();
  }
  function hide() {
    card.hidden = true;
    document.body.style.paddingBottom = '';     // room made on a phone by "Show"
    clearTimeout(hideTimer);
    hideTimer = 0;
    spotGet = null;
    placeSpot();
  }
  card.addEventListener('mouseenter', function () {
    if (!hideTimer) return;
    clearTimeout(hideTimer);
    hideTimer = 0;
    hideLeft = Math.max(1500, hideAt - Date.now());
  });
  card.addEventListener('mouseleave', function () {
    if (!hideLeft || card.hidden) return;
    hideAt = Date.now() + hideLeft;
    hideTimer = setTimeout(hide, hideLeft);
    hideLeft = 0;
  });
  card.querySelector('.sera-x').addEventListener('click', function () { if (guide) endGuide(); else hide(); });

  // ---- The S.E.R.A button -----------------------------------------------------------------
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'sera-ai';
  btn.className = 'sera-ai';
  btn.title = 'Ask S.E.R.A';
  btn.innerHTML = '<img src="' + IMG('listening') + '" alt=""><span>S.E.R.A</span>';
  (onPlanner ? document.querySelector('.map-wrap') : document.body).appendChild(btn);
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!card.hidden && !guide && !card.classList.contains('toast')) { hide(); return; }
    explainNow();
  });
  if (window.L && onPlanner) L.DomEvent.disableClickPropagation(btn);

  function fmtMin(s) {
    var m = Math.round(s / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  // ---- Advice: what happened, what to do, and where to look ------------------------------
  function factorRow(id) { return function () { return document.querySelector('#factors li[data-f="' + id + '"]'); }; }
  function byId(id) { return function () { return document.getElementById(id); }; }
  function marker(i) {                 // the numbered marker of a science point on the map
    return function () { return document.querySelectorAll('#map .stop-icon:not(.base)')[i] || null; };
  }
  function click(id) { var b = document.getElementById(id); if (b && !b.disabled) b.click(); }
  function removeStop(i) { var d = document.querySelector('#stops .del[data-i="' + i + '"]'); if (d) d.click(); }
  function farthestStop() {
    var best = -1, far = -1;
    S.plan.stops.forEach(function (s, i) { if (isFinite(s.homeS) && s.homeS > far) { far = s.homeS; best = i; } });
    return best;
  }
  function setStart(v) {
    var el = document.getElementById('start-time');
    el.value = v;
    el.dispatchEvent(new Event('input'));
  }
  var num = function (txt, re) { var m = re.exec(txt); return m ? m[1] : ''; };

  // The first worst factor of the verdict decides what S.E.R.A says.
  function advise() {
    var p = S.plan, r = p.risk, b = p.budget;
    if (!r || !b) return null;
    var f = null;
    r.factors.forEach(function (x) { if (!f && r.level > 0 && x.level === r.level) f = x; });
    var pose = ['success', 'explain', 'alert'][r.level];
    var a = { level: r.level, pose: pose, key: r.level + (f ? f.id : '') };
    var fi = farthestStop(), fname = fi >= 0 ? S.stopName(p.stops[fi], fi) : '';
    var removeFar = { label: 'Remove the farthest point', primary: true, run: function () { removeStop(fi); } };
    var times = f ? (f.text.match(/\d\d:\d\d/g) || []) : [];
    var start = document.getElementById('start-time').value;

    if (!f) {
      a.title = 'GO · all checks passed';
      a.text = p.stops.length + ' science points, EVA ' + fmtMin(b.totalS) + ', ' + fmtMin(b.marginS) + ' of spare suit time.';
      a.do = 'Ready? Walk it in the helmet view.';
      a.spot = byId('btn-hud');
      a.actions = [{ label: 'Start EVA · helmet view', primary: true, run: function () { hide(); click('btn-hud'); } }];
    } else if (f.id === 'slopes' && f.level === 2) {
      var bad = 0;
      p.stops.forEach(function (s, i) { if (!p.legs[i] || !isFinite(s.homeS)) bad = bad || i + 1; });
      var bi = Math.max(0, bad - 1);
      a.title = 'NO-GO · no safe way to ' + S.stopName(p.stops[bi], bi);
      a.text = 'Every way there crosses slopes over 25° (red on the map).';
      a.do = 'Move the point to grey or yellow ground, or remove it.';
      a.spot = marker(bi); a.spotOnMap = true;
      a.actions = [{ label: 'Remove this point', primary: true, run: function () { removeStop(bi); } }];
    } else if (f.id === 'slopes') {
      a.title = 'CAUTION · steep ground';
      a.text = num(f.text, /^(\d+)/) + ' m of the route is on 15–25° slopes (yellow on the map). Walking there takes twice as long.';
      a.do = 'You can go, slowly. Mission Twin looks for a gentler way.';
      a.spot = factorRow('slopes');
      a.actions = [{ label: 'Compare routes', primary: true, run: function () { if (window.SeraTwin) SeraTwin.open(fi >= 0 ? fi : 0); } }];
    } else if (f.id === 'suit' && f.level === 2) {
      a.title = 'NO-GO · too long for one suit';
      a.text = 'The plan needs ' + fmtMin(-b.marginS) + ' more than the suit allows with the 15 % reserve.';
      a.do = 'Remove the farthest point (' + fname + ')' + (p.sorties ? ' or walk it as ' + p.sorties.length + ' EVAs.' : '.');
      a.spot = byId('stops');
      a.actions = [removeFar];
    } else if (f.id === 'suit') {
      a.title = 'CAUTION · little spare air';
      a.text = 'Only ' + fmtMin(b.marginS) + ' of spare suit time before the reserve.';
      a.do = 'Remove the farthest point (' + fname + ') to keep more air for surprises.';
      a.spot = byId('stops');
      a.actions = [removeFar];
    } else if (f.id === 'daylight') {
      var dark = /before sunrise/.test(f.text);
      a.title = dark ? 'NO-GO · start before sunrise' : f.level === 2 ? 'NO-GO · back after dark' : 'CAUTION · close to sunset';
      a.text = dark ? 'Start ' + times[0] + ' is before sunrise (' + times[1] + ').'
        : f.level === 2 ? 'You would be back at ' + times[0] + ', after sunset (' + times[1] + ').'
        : 'Back at ' + times[0] + ', less than 1 h before sunset (' + times[1] + ').';
      a.do = dark ? 'Start at 09:00 or later.' : 'Start earlier, or remove a point.';
      a.spot = byId('start-time');
      a.actions = start !== '09:00' ? [{ label: 'Start at 09:00', primary: true, run: function () { setStart('09:00'); } }] : [removeFar];
    } else if (f.id === 'space' && f.level === 2) {
      var sim = document.getElementById('btn-storm').getAttribute('aria-pressed') === 'true';
      a.title = 'NO-GO · solar storm';
      a.text = sim ? 'Solar particle event (simulated). Outside, the radiation dose is too high.'
        : 'Solar particle event ' + num(f.text, /(\d+) h ago/) + ' h ago (NASA DONKI). Outside, the radiation dose is too high.';
      a.do = sim ? 'Stay in the base. Stop the simulation to see the normal verdict.' : 'Stay in the base until 48 h after the event.';
      a.spot = sim ? byId('btn-storm') : factorRow('space');
      a.actions = sim ? [{ label: 'Stop storm simulation', primary: true, run: function () { click('btn-storm'); } }] : [];
    } else if (f.id === 'space') {
      var flare = /flare/.test(f.text);
      a.title = flare ? 'CAUTION · solar flare' : 'CAUTION · no space weather data';
      a.text = flare ? 'X-class solar flare ' + num(f.text, /(\d+) h ago/) + ' h ago.' : 'I could not load live NASA and NOAA data.';
      a.do = flare ? 'Go only with the shelter close, and watch for new alerts.' : 'Check space weather before going out.';
      a.spot = factorRow('space');
      a.actions = [];
    } else if (f.id === 'radio') {
      a.title = 'CAUTION · radio gaps';
      a.text = 'For ' + num(f.text, /^(\d+ (?:h \d+ )?min)/) + ' in a row the base mast is out of sight.';
      a.do = 'Walk in pairs and keep your buddy in sight: the buddy relays.';
      a.spot = factorRow('radio');
      var on = document.getElementById('btn-radio').getAttribute('aria-pressed') === 'true';
      a.actions = on ? [] : [{ label: 'Show radio map', primary: true, run: function () { click('btn-radio'); } }];
    } else {
      a.title = r.verdict; a.text = r.reason + '.'; a.spot = factorRow(f.id); a.actions = [];
    }
    return a;
  }

  // What S.E.R.A says about the current state.
  function explainNow() {
    if (!onPlanner) {
      say({ pose: 'explain', title: 'I plan safe walks on Mars',
        text: 'S.E.R.A plans an EVA on the real terrain of Gale Crater, checks slopes, suit time, daylight and space weather, and always keeps the way home. Start the mission, or watch the 1-minute tour.',
        actions: [
          { label: 'Launch Mission', primary: true, run: function () { location.href = 'planner.html?demo=1'; } },
          { label: '1-minute tour', run: function () { location.href = 'planner.html?tour=1'; } }
        ] });
      return;
    }
    var p = S.plan;
    var guideBtn = { label: 'Show me how', run: startGuide };
    if (!p.base) {
      say({ pose: 'listening', title: 'Let’s plan an EVA',
        text: 'Click inside the dashed 2 × 2 km zone to place the base (H). Or press Demo to see a ready plan.',
        actions: [{ label: 'Show demo plan', primary: true, run: function () { hide(); S.runDemo(); } }, guideBtn] });
      return;
    }
    if (!p.stops.length) {
      say({ pose: 'listening', title: 'Base is set',
        text: 'Now click to add science points. I will find the safe path, the fastest order and the way home.',
        actions: [guideBtn] });
      return;
    }
    var a = advise();
    if (!a) { say({ pose: 'thinking', title: 'Checking the plan…', text: 'Slopes, suit time, daylight, space weather.' }); return; }
    say({ pose: a.pose, level: a.level, title: a.title, text: a.text, do: a.do, spot: a.spot, spotOnMap: a.spotOnMap,
      actions: a.actions.concat(a.level === 0 ? [guideBtn] : []) });
  }

  // ---- Reactions -----------------------------------------------------------------------
  var lastKey = '', lastLevel = -1, thinkTimer = 0, hudDone = false, verdictToast = false;
  // She keeps quiet while the guide, the tour or Mission Twin is on screen (the twin card already
  // has her advice in it, and her card would cover the table).
  function twinOpen() { var t = document.getElementById('twin'); return !!(t && !t.hidden); }
  function quiet() { return guide || twinOpen() || (window.SeraTour && SeraTour.isOn && SeraTour.isOn()); }
  function watch() {
    if (!onPlanner || quiet()) return;
    var p = S.plan;
    // She speaks only when the verdict or its reason changes, not on every click.
    var adv = p.base && p.stops.length && p.risk ? advise() : null;
    if (adv && adv.key !== lastKey) {
      lastKey = adv.key;
      lastLevel = adv.level;
      // Think for a moment, then the answer.
      clearTimeout(thinkTimer);
      say({ pose: 'thinking', title: 'Checking the plan…', text: 'Slopes, suit time, daylight, space weather.', toast: true, place: 'corner' });
      thinkTimer = setTimeout(function () {
        var a = advise();
        if (!a || quiet()) return;
        // GO and CAUTION go away by themselves; a NO-GO stays until it is handled or closed.
        say({ pose: a.pose, level: a.level, title: a.title, text: a.text, do: a.do, spot: a.spot, spotOnMap: a.spotOnMap,
          actions: a.actions, toast: true, place: 'corner', autoHide: [7000, 11000, 0][a.level] });
        verdictToast = true;
      }, 900);
    }
    if (!p.base || !p.stops.length) {
      lastKey = ''; lastLevel = -1;
      clearTimeout(thinkTimer);
      if (verdictToast && !card.hidden) hide();      // the plan she talked about is gone
      verdictToast = false;
    }
    // Back from the walk in the helmet view.
    if (window.SeraHud && SeraHud._state) {
      var h = SeraHud._state();
      var open = !document.getElementById('hud').hidden;
      if (open && h.totalS && h.simS >= (h.emergency ? h.simS : h.totalS) - 0.5 && h.simS > 0 && !hudDone && !h.emergency) {
        hudDone = true;
        say({ pose: 'success', title: 'Welcome back!', text: 'EVA complete, you are back at the base.', toast: true, place: 'corner', autoHide: 6000 });
      }
      if (!open || h.simS < 1) hudDone = false;
    }
  }
  if (onPlanner) setInterval(watch, 400);

  // Storm in the helmet view: she raises her hand.
  document.addEventListener('click', function (e) {
    var id = e.target && e.target.id;
    if (id === 'hud-storm') {
      say({ pose: 'alert', title: 'NO-GO: turn back now', level: 2, text: 'Solar particle alert. I rebuilt the fastest safe way home from where you stand.', do: 'Follow the mint line home, now.', toast: true, place: 'corner', autoHide: 9000 });
    } else if (id === 'hud-drift') {
      say({ pose: 'explain', title: 'You left the route', level: 1, text: 'No problem: here is a new safe path to the next point. The rest of the plan stays.', do: 'Follow the new line on the map.', toast: true, place: 'corner', autoHide: 7000 });
    }
  }, true);

  // A marker dropped where it cannot stand went back: she says why.
  document.addEventListener('sera:refused', function (e) {
    if (quiet()) return;
    var d = e.detail || {};
    var text = d.why === 'steep' ? 'Too steep there: ' + Math.round(d.deg) + '° (the limit is 25°).'
      : d.why === 'outside' ? 'That is outside the dashed 2 × 2 km EVA zone.'
      : 'There is no safe way home from that spot.';
    say({ pose: 'explain', level: 1, title: d.stop < 0 ? 'The base stays where it was' : 'The point stays where it was',
      text: text, do: 'Drop it on grey or yellow ground inside the zone.',
      spot: d.stop < 0 ? function () { return document.querySelector('#map .stop-icon.base'); } : marker(d.stop),
      spotOnMap: true, toast: true, place: 'corner', autoHide: 7000 });
  });

  // ---- The guide: one part at a time, the rest blurred -----------------------------------
  var guide = null;
  var shade = document.createElement('div');
  shade.className = 'guide';
  shade.hidden = true;
  shade.innerHTML = '<i class="g-t"></i><i class="g-b"></i><i class="g-l"></i><i class="g-r"></i><i class="g-ring"></i>';
  document.body.appendChild(shade);

  function steps() {
    return [
      { pose: 'welcome', title: 'Hi, I’m S.E.R.A', text: 'Your assistant for walks on Mars. In 7 short steps I’ll show how to plan an EVA that always brings you home.' },
      { target: '#planner-globe', pose: 'explain', title: '1 · Start on Mars',
        text: 'The real planet from NASA data. Turn it and pick Gale Crater: our EVA zone is there. Zoom in close and the flat map opens.',
        enter: function () { if (S.globe) S.globe.show(true); } },
      { target: '.map-wrap', pose: 'explain', title: '2 · Base and science points',
        text: 'Inside the dashed 2 × 2 km zone the first click places the base (H), every next click a science point. Missed a bit? Drag the marker. Red slopes are too steep. Here is a demo plan.',
        enter: function () { if (S.globe) S.globe.show(false); S.runDemo(); } },
      { target: '.place-search', pose: 'listening', title: '3 · Find a place',
        text: 'Type a crater name, “Curiosity” or “base”: the map flies there.' },
      { target: '#verdict', pose: 'thinking', title: '4 · The verdict',
        text: 'I check slopes, suit time, daylight, radio and space weather. GO, CAUTION or NO-GO, always with the reason.' },
      { target: '#stops', pose: 'explain', title: '5 · Your route',
        text: 'Stop by stop: how long the walk is, and the time home from every point. The dashed mint line is the fastest way back.' },
      { target: '#btn-hud', pose: 'success', title: '6 · Walk it in the helmet',
        text: 'Play the EVA from inside the helmet. I watch the walk: off the route I find a new path, in a storm I lead you home.' },
      { target: '#sera-ai', pose: 'listening', title: '7 · Ask me any time',
        text: 'Press my button and I explain the current plan. Ready?', last: true }
    ];
  }

  function startGuide() {
    if (!onPlanner) return;
    var w = document.getElementById('welcome');
    if (w) w.hidden = true;
    if (window.SeraTour && SeraTour.stop) SeraTour.stop();
    guide = { list: steps(), i: 0 };
    shade.hidden = false;
    document.body.classList.add('guide-on');
    showStep();
  }
  function endGuide() {
    guide = null;
    shade.hidden = true;
    document.body.classList.remove('guide-on');
    store(KEY_GUIDE, '1');
    hide();
  }
  function showStep() {
    var st = guide.list[guide.i];
    if (st.enter) st.enter();
    guide.scrolled = false;
    guide.fixed = false;
    var n = guide.list.length;
    var actions = [];
    if (guide.i > 0) actions.push({ label: '← Back', run: function () { guide.i--; showStep(); } });
    if (st.last) {
      actions.push({ label: 'Plan my own EVA', primary: true, run: function () { endGuide(); S.views.eva(); S.setActive('eva'); } });
      actions.push({ label: 'Keep the demo', run: endGuide });
    } else {
      actions.push({ label: guide.i ? 'Next →' : 'Start →', primary: true, run: function () { guide.i++; showStep(); } });
      actions.push({ label: 'Skip', run: endGuide });
    }
    say({ pose: st.pose, title: st.title, text: st.text + (guide.i ? '' : ''), actions: actions, place: 'guide' });
    card.querySelector('.sera-name').textContent = 'S.E.R.A · ' + (guide.i + 1) + ' / ' + n;
    // Let the page settle (globe, demo plan), then light the target.
    setTimeout(place, 60);
    setTimeout(place, 450);
  }
  function place() {
    if (!guide) return;
    var st = guide.list[guide.i];
    var el = st.target && document.querySelector(st.target);
    if (el && el.offsetParent === null && el !== document.getElementById('planner-globe')) el = null;
    var W = window.innerWidth, H = window.innerHeight;
    var r;
    if (el) {
      // Bring the target into view (the panel scrolls on its own; on phones the page does).
      if (!guide.scrolled) {
        guide.scrolled = true;
        el.scrollIntoView({ block: W < 761 ? 'center' : 'nearest' });
      }
      // In the side panel the action buttons stick to the bottom: keep the target above them,
      // and never light a part of the panel that is scrolled away or under them.
      var panel = el.closest('.panel'), foot = panel && panel.querySelector('.panel-actions');
      var top = 0, bottom = H;
      if (panel && foot && !foot.contains(el) && W > 760) {
        var pr = panel.getBoundingClientRect(), fr = foot.getBoundingClientRect();
        top = pr.top; bottom = Math.min(pr.bottom, fr.top);
        var eb = el.getBoundingClientRect();
        if (!guide.fixed && (eb.bottom + 14 > bottom || eb.top - 14 < top)) {
          guide.fixed = true;
          panel.scrollTop += eb.bottom + 14 > bottom ? eb.bottom + 14 - bottom : eb.top - 14 - top;
        }
      }
      var b = el.getBoundingClientRect(), pad = 6;
      var y0 = Math.max(top, b.top - pad), y1 = Math.min(bottom, b.bottom + pad);
      r = { x: Math.max(0, b.left - pad), y: Math.max(0, y0), w: Math.min(W, b.width + pad * 2), h: Math.max(0, Math.min(H, y1 - y0)) };
    } else {
      r = { x: W / 2, y: H / 2, w: 0, h: 0 };
    }
    var q = function (c) { return shade.querySelector(c); };
    q('.g-t').style.cssText = 'left:0;top:0;width:100%;height:' + r.y + 'px';
    q('.g-b').style.cssText = 'left:0;top:' + (r.y + r.h) + 'px;width:100%;bottom:0';
    q('.g-l').style.cssText = 'left:0;top:' + r.y + 'px;width:' + r.x + 'px;height:' + r.h + 'px';
    q('.g-r').style.cssText = 'left:' + (r.x + r.w) + 'px;top:' + r.y + 'px;right:0;height:' + r.h + 'px';
    var ring = q('.g-ring');
    ring.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
    ring.hidden = !el;
    // The card goes where the target is not.
    var cls = 'sera-card at-guide';
    if (!el) cls += ' at-center';
    else if (W < 761) cls += (r.y + r.h / 2 > H / 2 ? ' at-top' : ' at-bottom');
    else cls += (r.x + r.w / 2 > W / 2 ? ' at-left' : ' at-right');
    card.className = cls;
  }
  window.addEventListener('resize', function () { if (guide) place(); });
  window.addEventListener('scroll', function () { if (guide) place(); }, true);
  document.addEventListener('keydown', function (e) { if (guide && e.key === 'Escape') endGuide(); });

  // ---- First visit -----------------------------------------------------------------------
  var fromLink = /[?&](demo|at|tour|p)=/.test(location.search);
  if (onPlanner) {
    if (!store(KEY_GUIDE) && !fromLink) setTimeout(startGuide, 700);
  } else if (!store(KEY_HELLO)) {
    setTimeout(function () {
      store(KEY_HELLO, '1');
      say({ pose: 'welcome', title: 'Hi, I’m S.E.R.A', place: 'corner',
        text: 'Your assistant for safe walks on Mars. I plan the route on real terrain and always keep the way home.',
        actions: [
          { label: 'Launch Mission', primary: true, run: function () { location.href = 'planner.html?demo=1'; } },
          { label: 'Later', run: hide }
        ] });
    }, 1200);
  }

  window.SeraAssistant = { say: say, hide: hide, guide: startGuide, explain: explainNow, advise: onPlanner ? advise : null };
})();
