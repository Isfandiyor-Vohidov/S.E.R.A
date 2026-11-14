// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// assistant.js: SERA, the (fictional, AI-generated) assistant character of the app.
//  - First visit: a step-by-step guide. One part of the screen is shown at a time,
//    everything else is blurred; SERA explains it.
//  - The SERA button: she explains the current plan (verdict, reason, numbers).
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

  // ---- The card: SERA + a speech bubble ------------------------------------------------
  var card = document.createElement('div');
  card.className = 'sera-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML =
    '<img class="sera-pose" alt="SERA, the assistant">' +
    '<div class="sera-bubble">' +
    '  <span class="sera-name">SERA · AI assistant</span>' +
    '  <b class="sera-title"></b><p class="sera-text"></p>' +
    '  <div class="sera-actions"></div>' +
    '  <small class="sera-credit">SERA is an AI-generated character</small>' +
    '  <button type="button" class="sera-x" aria-label="Close">×</button>' +
    '</div>';
  document.body.appendChild(card);
  var poseEl = card.querySelector('.sera-pose');
  var hideTimer = 0;

  // say({pose, title, text, actions:[{label, primary, run}], autoHide: ms, place: 'left'|'right'|'bottom'})
  function say(o) {
    clearTimeout(hideTimer);
    poseEl.src = IMG(o.pose || 'explain');
    card.querySelector('.sera-title').textContent = o.title || '';
    card.querySelector('.sera-text').textContent = o.text || '';
    var act = card.querySelector('.sera-actions');
    act.innerHTML = '';
    (o.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'btn-primary' : 'btn-secondary';
      b.textContent = a.label;
      b.addEventListener('click', a.run);
      act.appendChild(b);
    });
    card.className = 'sera-card' + (o.place ? ' at-' + o.place : '') + (o.toast ? ' toast' : '');
    card.hidden = false;
    if (o.autoHide) hideTimer = setTimeout(hide, o.autoHide);
  }
  function hide() { card.hidden = true; clearTimeout(hideTimer); }
  card.querySelector('.sera-x').addEventListener('click', function () { if (guide) endGuide(); else hide(); });

  // ---- The SERA button -----------------------------------------------------------------
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'sera-ai';
  btn.className = 'sera-ai';
  btn.title = 'Ask SERA';
  btn.innerHTML = '<img src="' + IMG('listening') + '" alt=""><span>SERA</span>';
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

  // What SERA says about the current state.
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
    var r = p.risk, b = p.budget;
    var pose = !r ? 'thinking' : ['success', 'explain', 'alert'][r.level];
    var farthest = 0;
    p.stops.forEach(function (s) { if (isFinite(s.homeS) && s.homeS > farthest) farthest = s.homeS; });
    var text = (r ? r.reason + '. ' : '') +
      'EVA ' + fmtMin(b.totalS) + ', ' + p.stops.length + ' science points, farthest point ' + fmtMin(farthest) + ' from home.' +
      (b.fits ? ' Spare suit time ' + fmtMin(b.marginS) + '.' : ' Too long for one suit: split into several EVAs.');
    say({ pose: pose, title: r ? r.verdict : 'Checking…', text: text,
      actions: [
        { label: 'Start EVA · helmet view', primary: true, run: function () { hide(); document.getElementById('btn-hud').click(); } },
        guideBtn
      ] });
  }

  // ---- Reactions -----------------------------------------------------------------------
  var lastKey = '', lastLevel = -1, thinkTimer = 0, hudDone = false;
  function quiet() { return guide || (window.SeraTour && SeraTour.isOn && SeraTour.isOn()); }
  function watch() {
    if (!onPlanner || quiet()) return;
    var p = S.plan;
    var key = p.base ? p.stops.map(function (s) { return s.r + ',' + s.c; }).join(';') + '|' + (p.risk ? p.risk.level : '') : '';
    if (p.base && p.stops.length && p.risk && key !== lastKey) {
      var level = p.risk.level, changed = level !== lastLevel;
      lastKey = key;
      if (changed) {
        lastLevel = level;
        // Think for a moment, then the answer.
        clearTimeout(thinkTimer);
        say({ pose: 'thinking', title: 'Checking the plan…', text: 'Slopes, suit time, daylight, space weather.', toast: true, place: 'corner' });
        thinkTimer = setTimeout(function () {
          var r = S.plan.risk;
          if (!r) return;
          say({ pose: ['success', 'explain', 'alert'][r.level], title: r.verdict, text: r.reason + '.',
            toast: true, place: 'corner', autoHide: r.level === 2 ? 9000 : 5000 });
        }, 900);
      }
    }
    if (!p.base || !p.stops.length) { lastKey = ''; lastLevel = -1; }
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
      say({ pose: 'alert', title: 'NO-GO: turn back now', text: 'Solar particle alert. I rebuilt the fastest safe way home from where you stand.', toast: true, place: 'corner', autoHide: 8000 });
    } else if (id === 'hud-drift') {
      say({ pose: 'explain', title: 'You left the route', text: 'No problem: here is a new safe path to the next point. The rest of the plan stays.', toast: true, place: 'corner', autoHide: 6000 });
    }
  }, true);

  // ---- The guide: one part at a time, the rest blurred -----------------------------------
  var guide = null;
  var shade = document.createElement('div');
  shade.className = 'guide';
  shade.hidden = true;
  shade.innerHTML = '<i class="g-t"></i><i class="g-b"></i><i class="g-l"></i><i class="g-r"></i><i class="g-ring"></i>';
  document.body.appendChild(shade);

  function steps() {
    return [
      { pose: 'welcome', title: 'Hi, I’m SERA', text: 'Your assistant for walks on Mars. In 7 short steps I’ll show how to plan an EVA that always brings you home.' },
      { target: '#planner-globe', pose: 'explain', title: '1 · Start on Mars',
        text: 'The real planet from NASA data. Turn it and pick Gale Crater: our EVA zone is there. Zoom in close and the flat map opens.',
        enter: function () { if (S.globe) S.globe.show(true); } },
      { target: '.map-wrap', pose: 'explain', title: '2 · Base and science points',
        text: 'Inside the dashed 2 × 2 km zone the first click places the base (H), every next click a science point. Red slopes are too steep. Here is a demo plan.',
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
    card.querySelector('.sera-name').textContent = 'SERA · ' + (guide.i + 1) + ' / ' + n;
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
      var b = el.getBoundingClientRect(), pad = 6;
      r = { x: Math.max(0, b.left - pad), y: Math.max(0, b.top - pad), w: Math.min(W, b.width + pad * 2), h: Math.min(H, b.height + pad * 2) };
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
      say({ pose: 'welcome', title: 'Hi, I’m SERA', place: 'corner',
        text: 'Your assistant for safe walks on Mars. I plan the route on real terrain and always keep the way home.',
        actions: [
          { label: 'Launch Mission', primary: true, run: function () { location.href = 'planner.html?demo=1'; } },
          { label: 'Later', run: hide }
        ] });
    }, 1200);
  }

  window.SeraAssistant = { say: say, hide: hide, guide: startGuide, explain: explainNow };
})();
