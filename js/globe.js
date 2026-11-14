// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// globe.js: a small 3D Mars globe in plain WebGL (no libraries, loads fast).
// Texture: NASA Mars Trek Viking colour mosaic with MOLA + HRSC relief (tools/prep_globe.py).
// Drag to turn, wheel or pinch to zoom, click a place to see it and go there.
//
//   SeraGlobe.create(container, { places, onGo(place), texture, textureHi })

(function (root) {
  'use strict';

  var D2R = Math.PI / 180;

  // Famous places of Mars (centre coordinates, planetocentric, east longitude).
  var PLACES = [
    { id: 'gale', name: 'Gale Crater', lat: -5.4, lon: 137.8, eva: true,
      text: 'Curiosity has worked here since 2012. Our EVA zone is on the slopes of Mount Sharp.' },
    { id: 'olympus', name: 'Olympus Mons', lat: 18.65, lon: -133.8,
      text: 'The tallest volcano in the Solar System, about 22 km high and 600 km wide.' },
    { id: 'valles', name: 'Valles Marineris', lat: -13.9, lon: -59.2,
      text: 'A canyon system about 4,000 km long and up to 7 km deep.' },
    { id: 'jezero', name: 'Jezero Crater', lat: 18.4, lon: 77.5,
      text: 'An old lake with a river delta. Perseverance has explored it since 2021.' },
    { id: 'hellas', name: 'Hellas Planitia', lat: -42.4, lon: 70.5,
      text: 'A giant impact basin, about 2,300 km across: the lowest plain on Mars.' },
    { id: 'pole', name: 'North polar cap', lat: 87, lon: 0,
      text: 'Layers of water ice and dust, about 1,000 km across.' }
  ];

  var VS = [
    'attribute vec3 p;',
    'uniform mat3 rot;',
    'uniform vec2 scale;',
    'varying vec3 n;',
    'void main() {',
    '  n = p;',
    '  vec3 q = rot * p;',
    '  gl_Position = vec4(q.x * scale.x, q.y * scale.y, -q.z * 0.5, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    // highp: the same precision as in the vertex shader (shared uniform), and enough for a 4k texture
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D tex;',
    'uniform mat3 rot;',
    'varying vec3 n;',
    'void main() {',
    '  vec3 m = normalize(n);',
    '  float lat = asin(clamp(m.y, -1.0, 1.0));',
    '  float lon = atan(m.x, m.z);',                       // 0 at +z, east positive
    '  vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927);',
    '  vec3 c = texture2D(tex, uv).rgb;',
    '  vec3 v = rot * m;',                                  // normal in view space
    '  float sun = clamp(dot(v, normalize(vec3(-0.45, 0.35, 0.82))), 0.0, 1.0);',
    '  float rim = pow(1.0 - clamp(v.z, 0.0, 1.0), 3.0);',
    '  gl_FragColor = vec4(c * (0.28 + 0.9 * sun) + vec3(0.9, 0.55, 0.4) * rim * 0.35, 1.0);',
    '}'
  ].join('\n');

  function sphere(segLat, segLon) {
    var pos = [], idx = [];
    for (var i = 0; i <= segLat; i++) {
      var la = Math.PI / 2 - i * Math.PI / segLat;
      for (var j = 0; j <= segLon; j++) {
        var lo = -Math.PI + j * 2 * Math.PI / segLon;
        pos.push(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
      }
    }
    for (i = 0; i < segLat; i++) {
      for (j = 0; j < segLon; j++) {
        var a = i * (segLon + 1) + j, b = a + segLon + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
  }

  // Rotation: first turn by -lon around y, then tilt by lat around x.
  // R = Rx(lat) * Ry(-lon): brings the point (lat, lon) to the centre of the view.
  function rotation(lat, lon) {
    var c = Math.cos(-lon), s = Math.sin(-lon), ca = Math.cos(lat), sa = Math.sin(lat);
    var ry = [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    var rx = [[1, 0, 0], [0, ca, -sa], [0, sa, ca]];
    var r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) r[i][j] += rx[i][k] * ry[k][j];
    // column-major for WebGL
    return new Float32Array([r[0][0], r[1][0], r[2][0], r[0][1], r[1][1], r[2][1], r[0][2], r[1][2], r[2][2]]);
  }
  function apply(m, v) {   // m column-major
    return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
            m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
            m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
  }
  function vec(lat, lon) {
    return [Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)];
  }

  function create(container, opts) {
    opts = opts || {};
    var places = opts.places || PLACES;
    var canvas = document.createElement('canvas');
    canvas.className = 'globe-canvas';
    canvas.setAttribute('aria-label', '3D globe of Mars. Drag to turn, use the place buttons to visit.');
    container.appendChild(canvas);
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) { container.classList.add('globe-nogl'); return null; }

    function shader(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      container.classList.add('globe-nogl');
      if (window.console) console.warn('globe: ' + gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);
    var mesh = sphere(64, 128);
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    var aP = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    var uRot = gl.getUniformLocation(prog, 'rot'), uScale = gl.getUniformLocation(prog, 'scale');
    gl.enable(gl.DEPTH_TEST);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([150, 80, 50, 255]));
    function loadTexture(url, done) {
      var img = new Image();
      img.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        dirty = true;
        if (done) done();
      };
      img.src = url;
    }
    loadTexture(opts.texture || 'img/mars-2k.jpg', function () {
      container.classList.add('globe-ready');
      // The sharper texture only on big screens, after the first one is shown.
      if (opts.textureHi !== false && Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) > 1400) {
        setTimeout(function () { loadTexture(opts.textureHi || 'img/mars-4k.jpg'); }, 300);
      }
    });

    // View state
    var view = { lat: 10, lon: 120, zoom: 0.82 };
    var target = null, dirty = true, spinning = !opts.noSpin, lastT = 0, selected = null;

    // Place markers (HTML, positioned each frame)
    var layer = document.createElement('div');
    layer.className = 'globe-marks';
    container.appendChild(layer);
    places.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'globe-mark' + (p.eva ? ' eva' : '');
      b.innerHTML = '<i></i><span></span>';
      b.querySelector('span').textContent = p.name;
      b.addEventListener('click', function (e) { e.stopPropagation(); select(p); });
      p.el = b;
      layer.appendChild(b);
    });

    // Info card
    var card = document.createElement('div');
    card.className = 'globe-card';
    card.hidden = true;
    card.innerHTML = '<b></b><p></p><span class="globe-coord"></span><div class="globe-actions"></div>';
    container.appendChild(card);

    function select(p) {
      selected = p;
      spinning = false;
      flyTo(p.lat, p.lon, p.eva ? 1.6 : 1.3);
      card.hidden = false;
      card.querySelector('b').textContent = p.name;
      card.querySelector('p').textContent = p.text;
      card.querySelector('.globe-coord').textContent =
        Math.abs(p.lat).toFixed(1) + '° ' + (p.lat >= 0 ? 'N' : 'S') + ' · ' +
        Math.abs(p.lon).toFixed(1) + '° ' + (p.lon >= 0 ? 'E' : 'W');
      var act = card.querySelector('.globe-actions');
      act.innerHTML = '';
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'globe-go' + (p.eva ? ' eva' : '');
      go.textContent = p.eva ? 'Open EVA zone in S.E.R.A →' : 'Open on the map →';
      go.addEventListener('click', function () { if (opts.onGo) opts.onGo(p); });
      act.appendChild(go);
      places.forEach(function (q) { q.el.classList.toggle('active', q === p); });
    }
    function flyTo(lat, lon, zoom) {
      var dl = ((lon - view.lon + 540) % 360) - 180;
      target = { lat: lat, lon: view.lon + dl, zoom: zoom };
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = container.clientWidth, h = container.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      dirty = true;
    }

    function frame(t) {
      var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      if (spinning && !drag) { view.lon += dt * 6; dirty = true; }
      if (target) {
        var k = 1 - Math.pow(0.0025, dt);
        view.lat += (target.lat - view.lat) * k;
        view.lon += (target.lon - view.lon) * k;
        view.zoom += (target.zoom - view.zoom) * k;
        if (Math.abs(target.lat - view.lat) + Math.abs(target.lon - view.lon) + Math.abs(target.zoom - view.zoom) < 0.01) target = null;
        dirty = true;
      }
      if (dirty && visible) draw();
      requestAnimationFrame(frame);
    }

    function draw() {
      dirty = false;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      // The globe fits the smaller side of the frame (phones are tall, desktops are wide).
      var side = Math.min(w, h), sx = view.zoom * side / w, sy = view.zoom * side / h;
      var m = rotation(view.lat * D2R, view.lon * D2R);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix3fv(uRot, false, m);
      gl.uniform2f(uScale, sx, sy);
      gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
      // markers
      places.forEach(function (p) {
        var q = apply(m, vec(p.lat, p.lon));
        var x = (q[0] * sx * 0.5 + 0.5) * w;
        var y = (0.5 - q[1] * sy * 0.5) * h;
        var front = q[2] > 0.15;
        p.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        p.el.classList.toggle('hidden', !front);
        p.el.tabIndex = front ? 0 : -1;
      });
    }

    // Drag / zoom
    var drag = null, moved = false, pinch = null;
    canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, lat: view.lat, lon: view.lon };
      moved = false; spinning = false; target = null;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag || pinch) return;
      var h = Math.min(canvas.clientWidth, canvas.clientHeight), s = 180 / (h * view.zoom);
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      view.lon = drag.lon - dx * s;
      view.lat = Math.max(-85, Math.min(85, drag.lat + dy * s));
      dirty = true;
    });
    function endDrag() { drag = null; }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      target = null;
      view.zoom = Math.max(0.6, Math.min(3, view.zoom * Math.exp(-e.deltaY * 0.0015)));
      dirty = true;
    }, { passive: false });
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), z: view.zoom };
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (pinch && e.touches.length === 2) {
        view.zoom = Math.max(0.6, Math.min(3, pinch.z * dist(e.touches) / pinch.d));
        dirty = true;
      }
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });
    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }

    // Draw only while on screen.
    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) dirty = true; }).observe(container);
    }
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);

    return {
      select: function (id) { places.forEach(function (p) { if (p.id === id) select(p); }); },
      resize: resize,
      places: places
    };
  }

  root.SeraGlobe = { create: create, PLACES: PLACES };
})(window);
