// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// planner-globe.js: the "3D Mars" button of the planner. Shows the 3D globe over the map;
// a place on the globe opens it on the map, Gale Crater opens the EVA zone.

(function () {
  'use strict';

  var S = window.SERA;
  var pane = document.getElementById('planner-globe');
  var btn = document.getElementById('btn-globe');
  var globe = null;

  function show(on) {
    pane.hidden = !on;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      if (!globe) {
        globe = SeraGlobe.create(pane, { onGo: go });
      } else globe.resize();
    } else S.map.invalidateSize();
  }

  function go(place) {
    show(false);
    if (place.eva) {
      S.setActive('eva');
      S.views.eva();
    } else {
      S.setActive('');
      S.map.flyTo([place.lat, place.lon], 5, { duration: 1.5 });
    }
  }

  btn.addEventListener('click', function () { show(pane.hidden); });
  // Any map scale button closes the globe.
  document.querySelectorAll('.zoom-steps button[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { if (!pane.hidden) show(false); });
  });
  document.getElementById('btn-demo-top').addEventListener('click', function () { if (!pane.hidden) show(false); });
})();
