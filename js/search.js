// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// search.js: "Find a place" on the planner map. Searches the 1,783 official IAU names of Mars
// (data/places.js, from NASA Mars Trek) plus our own places (EVA zone, Curiosity today),
// works offline, and flies the map there with a marker.

(function () {
  'use strict';

  var S = window.SERA;
  var P = window.SERA_PLACES || [];
  if (!S) return;
  var map = S.map;
  var wrap = document.querySelector('.map-wrap');

  var OWN = [];
  // The base (habitat): "home" of every EVA. If it is not placed yet, open the zone to place it.
  OWN.push({ name: 'Base (home) · habitat', kind: 'Your base', alias: 'base home habitat hab база дом',
    go: function () {
      S.setActive('eva');
      var b = S.plan && S.plan.base;
      if (b && S.cellLatLng) map.flyTo(S.cellLatLng(b), 16, { duration: 1.2 });
      else S.views.eva();
    } });
  OWN.push({ name: 'EVA zone · S.E.R.A', kind: 'Our EVA zone', alias: 'eva zone зона', go: function () { S.setActive('eva'); S.views.eva(); } });
  if (window.SERA_MSL && SERA_MSL.stops.length) {
    var last = SERA_MSL.stops[SERA_MSL.stops.length - 1];
    OWN.push({ name: 'Curiosity · sol ' + last.sol, kind: 'Rover position in our data', lat: last.lat, lon: last.lon, zoom: 15 });
  }
  var ZOOM = { Crater: 7, Mons: 6, Tholus: 7, Patera: 6, Planitia: 4, Planum: 4, Terra: 3, Vallis: 5, Valles: 4,
    Chasma: 5, Chasmata: 4, Fossa: 6, Fossae: 5, Mensa: 7, Mensae: 6, Labyrinthus: 5, Vastitas: 3 };

  var box = document.createElement('div');
  box.className = 'place-search';
  box.innerHTML = '<input type="search" placeholder="Find a place on Mars" aria-label="Find a place on Mars" autocomplete="off">' +
    '<ul role="listbox" hidden></ul>';
  wrap.appendChild(box);
  L.DomEvent.disableClickPropagation(box);
  L.DomEvent.disableScrollPropagation(box);
  var input = box.querySelector('input'), list = box.querySelector('ul');
  var found = [], active = -1, pin = null;

  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function search(q) {
    q = norm(q.trim());
    if (q.length < 2) return [];
    var starts = [], has = [];
    OWN.concat(P.map(function (p) { return { name: p[0], kind: p[1], lat: p[2], lon: p[3] }; })).forEach(function (p) {
      var n = norm(p.name);
      var al = p.alias ? ' ' + norm(p.alias) : '';
      if (n.indexOf(q) === 0 || al.indexOf(' ' + q) >= 0) starts.push(p);
      else if (n.indexOf(q) > 0 || norm(p.kind || '').indexOf(q) === 0) has.push(p);
    });
    return starts.concat(has).slice(0, 8);
  }

  function show() {
    list.innerHTML = '';
    found.forEach(function (p, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.className = i === active ? 'on' : '';
      li.innerHTML = '<b></b><span></span>';
      li.querySelector('b').textContent = p.name;
      li.querySelector('span').textContent = (p.kind || '') + (p.lat !== undefined ? ' · ' + Math.abs(p.lat).toFixed(1) + '°' + (p.lat >= 0 ? 'N' : 'S') +
        ' ' + Math.abs(p.lon).toFixed(1) + '°' + (p.lon >= 0 ? 'E' : 'W') : '');
      li.addEventListener('mousedown', function (e) { e.preventDefault(); go(p); });
      list.appendChild(li);
    });
    list.hidden = !found.length;
  }

  function go(p) {
    list.hidden = true;
    input.value = p.name;
    input.blur();
    if (S.globe && S.globe.isOpen()) S.globe.show(false);
    if (pin) { map.removeLayer(pin); pin = null; }
    if (p.go) { p.go(); return; }
    S.setActive('');
    map.flyTo([p.lat, p.lon], p.zoom || ZOOM[p.kind] || 6, { duration: 1.4 });
    pin = L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: '', html: '<div class="place-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map).bindTooltip(p.name + (p.kind ? ' · ' + p.kind : ''), { permanent: true, direction: 'top', offset: [0, -8], className: 'place-tip' });
  }

  input.addEventListener('input', function () { found = search(input.value); active = found.length ? 0 : -1; show(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { active = Math.min(found.length - 1, active + 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && found[active]) { go(found[active]); }
    else if (e.key === 'Escape') { list.hidden = true; input.blur(); }
  });
  input.addEventListener('blur', function () { setTimeout(function () { list.hidden = true; }, 150); });
  input.addEventListener('focus', function () { if (found.length) list.hidden = false; });
  S.search = { go: go, find: search };
})();
