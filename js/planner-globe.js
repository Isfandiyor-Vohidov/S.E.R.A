// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// planner-globe.js: the whole-planet view of the planner is the 3D globe, not the flat map.
// The "Mars" button and zooming the map far out open it. Gale Crater starts a mission at once:
// the demo EVA or your own plan in the EVA zone. Other places open on the flat map.

(function () {
  'use strict';

  var S = window.SERA;
  var pane = document.getElementById('planner-globe');
  var globe = null;

  function show(on) {
    pane.hidden = !on;
    if (on) {
      S.setActive('mars');
      if (!globe) globe = SeraGlobe.create(pane, { actionsFor: actionsFor });
      else globe.resize();
    } else S.map.invalidateSize();
  }

  function actionsFor(place) {
    if (place.eva) {
      return [
        { label: 'Start demo mission →', eva: true, run: function () { show(false); S.runDemo(); } },
        { label: 'Plan my own EVA →', run: function () {
          show(false); S.setActive('eva'); S.views.eva();
        } }
      ];
    }
    return [{ label: 'Open on the map →', run: function () {
      show(false); S.setActive('');
      S.map.flyTo([place.lat, place.lon], 5, { duration: 1.5 });
    } }];
  }

  // "Flat map" button in the corner of the globe.
  var flat = document.createElement('button');
  flat.type = 'button';
  flat.className = 'globe-flat';
  flat.textContent = '2D map';
  flat.addEventListener('click', function () {
    show(false); S.setActive('');
    S.map.setView([0, 0], 2);
  });
  pane.appendChild(flat);

  // The "Mars" scale button opens the globe; the other scale buttons and Demo close it.
  S.views.mars = function () { show(true); };
  document.querySelectorAll('.zoom-steps button[data-view]').forEach(function (b) {
    if (b.getAttribute('data-view') !== 'mars') {
      b.addEventListener('click', function () { if (!pane.hidden) show(false); });
    }
  });
  document.getElementById('btn-demo-top').addEventListener('click', function () { if (!pane.hidden) show(false); });
  ['btn-demo', 'btn-own'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () { if (!pane.hidden) show(false); });
  });

  // Zooming the flat map out to the whole planet switches to the globe.
  var lastZoom = S.map.getZoom();
  S.map.on('zoomend', function () {
    var z = S.map.getZoom();
    if (z <= 1 && lastZoom > 1 && pane.hidden) show(true);
    lastZoom = z;
  });

  // Start on the globe unless a link asked for the demo or a place.
  if (!/[?&](demo|at)=/.test(location.search)) show(true);
})();
