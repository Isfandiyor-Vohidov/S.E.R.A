// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// sw.js: offline mode. After one visit online the site and the planner open without internet.
//  - pages (HTML): network first, cached copy when offline;
//  - our files (JS, CSS, data, images): cache first, refreshed in the background;
//  - NASA Mars Trek map tiles and Curiosity photos: cache first, up to 3000 files;
//  - live space weather (api.nasa.gov, NOAA) is not cached here: the app keeps its own copy.

var VERSION = 'sera-v1';
var CORE = VERSION + '-core';
var TILES = VERSION + '-tiles';
var MAX_TILES = 3000;
var PRECACHE = ['./', 'index.html', 'planner.html', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css',
  'img/logo.svg', 'img/sera-logo.jpg', 'img/mark.png', 'img/sera-word.png', 'img/mars-2k.jpg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CORE).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trim(cacheName, max) {
  caches.open(cacheName).then(function (c) {
    c.keys().then(function (keys) {
      for (var i = 0; i < keys.length - max; i++) c.delete(keys[i]);
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var same = url.origin === self.location.origin;

  if (same && (req.mode === 'navigate' || /\.html$|\/$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CORE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('planner.html'); });
    }));
    return;
  }

  if (same || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res.ok || res.type === 'opaque') {
          var copy = res.clone();
          caches.open(CORE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    }));
    return;
  }

  if (/(^|\.)trek\.nasa\.gov$/.test(url.hostname) || /(^|\.)mars\.nasa\.gov$/.test(url.hostname) && /\.(jpe?g|png)$/i.test(url.pathname)) {
    e.respondWith(caches.open(TILES).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(TILES, MAX_TILES); }
          return res;
        });
      });
    }));
  }
});
