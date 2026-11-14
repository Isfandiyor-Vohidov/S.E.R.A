// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// fpv.js: first-person 3D view for the helmet HUD. The real terrain of the EVA zone (the same
// 1 m DEM on a 5 m grid that the planner uses) is drawn with WebGL, no libraries. The camera stands
// at eye height (1.7 m) where the simulated astronaut is and looks the way they walk.
// What is drawn:
//  - the ground: Mars colour, lit by the Sun at the local solar hour, fine procedural grain, bumps,
//    wind ripples and pebbles close up (MODEL: the grid is 5 m, so stones and rocks are not in the
//    data; the rocks drawn are decorative, see buildRocks); slopes over 15 deg tinted amber, over 25 deg red,
//    like an AR overlay on the visor;
//  - the route as a ribbon on the ground (copper), the way home (mint), science points and the base
//    as light beacons with labels;
//  - dust haze with distance and a butterscotch sky.
// If WebGL is not there, init() returns false and the HUD keeps its top-down map.

(function (root) {
  'use strict';

  var EYE_M = 1.7, FOV = 70, NEAR = 0.3, FAR = 60000;
  var SKY_HORIZON = [219 / 255, 184 / 255, 148 / 255];          // dust haze, also the fog colour

  var gl = null, canvas = null, terrain = null, T = null;
  var progLand = null, progFlat = null;
  var land = null, plane = null;                  // {pos, nor, slope, idx, count, type}
  var routes = [], homeRoute = null, beacons = [], labels = [];
  var labelBox = null, e0 = 0, step = 1;

  // ---- tiny matrix helpers (column-major, like WebGL) --------------------------------------
  function perspective(fovDeg, aspect, near, far) {
    var f = 1 / Math.tan(fovDeg * Math.PI / 360), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, at, up) {
    var zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
    var zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }

  // ---- shaders ----------------------------------------------------------------------------
  var VS_LAND =
    'attribute vec3 aPos; attribute vec3 aNor; attribute float aSlope;' +
    'uniform mat4 uMVP; varying vec3 vNor; varying vec3 vPos; varying float vSlope;' +
    'void main(){ vNor=aNor; vPos=aPos; vSlope=aSlope; gl_Position=uMVP*vec4(aPos,1.0); }';
  var FS_LAND =
    'precision highp float;' +
    'varying vec3 vNor; varying vec3 vPos; varying float vSlope;' +
    // uKind: 0 = far plain, 1 = terrain (with hazard tint), 2 = rocks (vSlope carries the rock's shade)
    'uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uFog; uniform float uKind;' +
    'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
    'float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);' +
    '  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }' +
    'float bump(vec2 p){ return n(p*2.3)*0.55 + n(p*6.1)*0.25 + n(p*0.7)*0.9; }' +
    'void main(){' +
    '  vec2 p = vPos.xz;' +
    '  float d = distance(vPos, uCam);' +
    '  float near = 1.0 - smoothstep(25.0, 160.0, d);' +                   // fine detail only close up
    '  float g = n(p*1.7)*0.45 + n(p*0.45)*0.35 + n(p*0.08)*0.2;' +        // grain: 0.6 m, 2 m, 12 m
    '  float patch = smoothstep(0.35, 0.75, n(p*0.012) * 0.7 + n(p*0.05) * 0.3);' +
    '  vec3 dust = vec3(0.70, 0.44, 0.28), rock = vec3(0.36, 0.27, 0.22), dark = vec3(0.24, 0.18, 0.15);' +
    '  vec3 nn = normalize(vNor);' +
    '  vec3 alb;' +
    '  if (uKind > 1.5) {' +
    '    alb = mix(rock, dark, 0.35) * vSlope * (0.8 + 0.4 * n(p*3.0 + vPos.y*2.0));' +
    '  } else {' +
    '    alb = mix(dust, rock, patch * 0.65) * (0.82 + 0.36 * g);' +
    '    alb = mix(alb, rock * (0.85 + 0.3 * g), smoothstep(0.92, 0.75, nn.y) * 0.6);' + // steep = bare rock
    '    if (near > 0.0) {' +
    '      float e = 0.06, b0 = bump(p);' +                                 // small bumps tilt the light
    '      vec2 gr = vec2(bump(p + vec2(e, 0.0)) - b0, bump(p + vec2(0.0, e)) - b0) / e;' +
    '      nn = normalize(nn + vec3(-gr.x, 0.0, -gr.y) * 0.16 * near);' +
    '      float rip = sin(dot(p, vec2(0.78, 0.62)) * 7.0 + n(p*0.35) * 7.0);' + // wind ripples in the dust
    '      alb *= 1.0 + 0.04 * rip * (1.0 - patch) * near;' +
    '      vec2 c = floor(p * 4.0), fc = fract(p * 4.0) - 0.5;' +             // pebbles, a few cm
    '      float k = h(c) * (0.75 + 0.5 * n(p * 0.2));' +                     // in loose clusters
    '      if (k > 0.93) { float r = 0.1 + 0.18 * h(c + 7.0);' +
    '        vec2 q = fc - (vec2(h(c+3.0), h(c+5.0)) - 0.5) * 0.5;' +
    '        float s = 1.0 - smoothstep(r * 0.55, r, length(q * vec2(1.0, 1.4)));' +
    '        vec3 peb = mix(rock, dust, 0.35 * h(c + 9.0)) * (0.75 + 0.35 * h(c + 11.0));' +
    '        peb *= 1.0 + 0.35 * clamp(-q.x * uSun.x - q.y * uSun.z, -0.5, 0.5) / max(r, 0.05);' + // lit side
    '        alb = mix(alb, peb, s * near * 0.8); }' +
    '    }' +
    '    if (uKind > 0.5) {' +
    '      if (vSlope > 25.0) alb = mix(alb, vec3(0.95, 0.33, 0.28), 0.42);' +
    '      else if (vSlope >= 15.0) alb = mix(alb, vec3(0.96, 0.74, 0.32), 0.22);' +
    '    }' +
    '  }' +
    '  float ndl = max(dot(nn, uSun), 0.0);' +
    '  vec3 sky = vec3(0.46, 0.36, 0.31) * (0.65 + 0.35 * nn.y);' +           // light from the dusty sky
    '  vec3 col = alb * (vec3(1.0, 0.9, 0.78) * 1.0 * ndl + sky);' +
    '  col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 0.82);' +       // a bit less saturated, dusty
    '  float f = 1.0 - exp(-d * 0.00085);' +
    '  gl_FragColor = vec4(mix(col, uFog, clamp(f, 0.0, uKind > 0.5 ? 0.92 : 1.0)), 1.0);' +
    '}';
  var VS_FLAT =
    'attribute vec3 aPos; attribute vec4 aCol; uniform mat4 uMVP; varying vec4 vCol; varying vec3 vPos;' +
    'void main(){ vCol=aCol; vPos=aPos; gl_Position=uMVP*vec4(aPos,1.0); }';
  var FS_FLAT =
    'precision highp float; varying vec4 vCol; varying vec3 vPos; uniform vec3 uCam; uniform vec3 uFog; uniform float uNear;' +
    'void main(){ float d=distance(vPos,uCam); float f=1.0-exp(-d*0.0006);' +
    '  float a = vCol.a * (uNear > 0.0 ? smoothstep(uNear * 0.25, uNear, d) : 1.0);' +   // the ribbon fades out at your feet
    '  gl_FragColor = vec4(mix(vCol.rgb, uFog, clamp(f,0.0,0.8)), a); }';

  function compile(vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var loc = {}, i, n;
    n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (i = 0; i < n; i++) { var a = gl.getActiveAttrib(p, i).name; loc[a] = gl.getAttribLocation(p, a); }
    n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (i = 0; i < n; i++) { var u = gl.getActiveUniform(p, i).name; loc[u] = gl.getUniformLocation(p, u); }
    return { p: p, loc: loc };
  }
  function buffer(data, target) {
    var b = gl.createBuffer();
    gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
    gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  // ---- terrain ------------------------------------------------------------------------------
  // World: x = east (m), z = south (m), y = up (m, relative to the zone's mean height).
  function elevAt(x, z) {                          // bilinear height in world metres
    var d = terrain.cellM, cols = terrain.cols, rows = terrain.rows, E = terrain.elev;
    var fc = x / d - 0.5, fr = z / d - 0.5;
    fc = Math.max(0, Math.min(cols - 1.001, fc)); fr = Math.max(0, Math.min(rows - 1.001, fr));
    var c = Math.floor(fc), r = Math.floor(fr), tc = fc - c, tr = fr - r;
    var a = E[r * cols + c], b = E[r * cols + c + 1], cc = E[(r + 1) * cols + c], dd = E[(r + 1) * cols + c + 1];
    return (a * (1 - tc) + b * tc) * (1 - tr) + (cc * (1 - tc) + dd * tc) * tr - e0;
  }

  function buildLand() {
    var d = terrain.cellM, E = terrain.elev, S = terrain.slopeDeg;
    var big = !!(gl.getExtension('OES_element_index_uint'));
    step = big ? 1 : 2;
    var cols = Math.floor((terrain.cols - 1) / step) + 1, rows = Math.floor((terrain.rows - 1) / step) + 1;
    var pos = new Float32Array(cols * rows * 3), nor = new Float32Array(cols * rows * 3), slo = new Float32Array(cols * rows);
    var sum = 0;
    for (var k = 0; k < E.length; k++) sum += E[k];
    e0 = sum / E.length;
    function z(r, c) {
      r = Math.max(0, Math.min(terrain.rows - 1, r)); c = Math.max(0, Math.min(terrain.cols - 1, c));
      return E[r * terrain.cols + c];
    }
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var R = r * step, C = c * step, i = r * cols + c;
      pos[i * 3] = (C + 0.5) * d; pos[i * 3 + 1] = z(R, C) - e0; pos[i * 3 + 2] = (R + 0.5) * d;
      var dx = (z(R, C + 1) - z(R, C - 1)) / (2 * d), dz = (z(R + 1, C) - z(R - 1, C)) / (2 * d);
      var l = Math.hypot(dx, 1, dz);
      nor[i * 3] = -dx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -dz / l;
      slo[i] = S[R * terrain.cols + C];
    }
    var idx = big ? new Uint32Array((rows - 1) * (cols - 1) * 6) : new Uint16Array((rows - 1) * (cols - 1) * 6);
    var n = 0;
    for (r = 0; r < rows - 1; r++) for (c = 0; c < cols - 1; c++) {
      var a = r * cols + c, b = a + 1, e = a + cols, f = e + 1;
      idx[n++] = a; idx[n++] = e; idx[n++] = b; idx[n++] = b; idx[n++] = e; idx[n++] = f;
    }
    if (!big && cols * rows > 65535) return false;
    land = { pos: buffer(pos), nor: buffer(nor), slope: buffer(slo), idx: buffer(idx, gl.ELEMENT_ARRAY_BUFFER),
      count: n, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };

    // A wide plain around the zone at its lowest height, lost in the haze (no data there).
    var lo = Infinity;
    for (k = 0; k < E.length; k++) if (E[k] < lo) lo = E[k];
    var W = terrain.cols * d, H = terrain.rows * d, y = lo - e0 - 2, P = 40000;
    plane = {
      pos: buffer(new Float32Array([-P, y, -P, W + P, y, -P, -P, y, H + P, W + P, y, H + P])),
      nor: buffer(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])),
      slope: buffer(new Float32Array([0, 0, 0, 0])),
      idx: buffer(new Uint16Array([0, 2, 1, 1, 2, 3]), gl.ELEMENT_ARRAY_BUFFER), count: 6, type: gl.UNSIGNED_SHORT
    };
    return true;
  }

  // ---- route ribbons and beacons ----------------------------------------------------------
  function cellXZ(c) { return [(c.c + 0.5) * terrain.cellM, (c.r + 0.5) * terrain.cellM]; }

  // A flat ribbon along the cells, lying on the ground. dash = [on, off] metres or null.
  function ribbon(cells, rgba, width, dash, lift) {
    if (!cells || cells.length < 2) return null;
    var pts = [];
    for (var i = 0; i < cells.length; i++) {
      var p = cellXZ(cells[i]);
      if (i) {
        var q = pts[pts.length - 1], len = Math.hypot(p[0] - q[0], p[1] - q[1]), n = Math.max(1, Math.ceil(len / 1.2));
        for (var k = 1; k <= n; k++) pts.push([q[0] + (p[0] - q[0]) * k / n, q[1] + (p[1] - q[1]) * k / n]);
      } else pts.push(p);
    }
    var v = [], col = [], run = 0;
    for (i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      var segOn = !dash || (run % (dash[0] + dash[1])) < dash[0];
      run += l;
      if (!segOn) continue;
      var nx = -dz / l * width / 2, nz = dx / l * width / 2;
      var ya = elevAt(a[0], a[1]) + lift, yb = elevAt(b[0], b[1]) + lift;
      v.push(a[0] + nx, ya, a[1] + nz, a[0] - nx, ya, a[1] - nz, b[0] + nx, yb, b[1] + nz,
        a[0] - nx, ya, a[1] - nz, b[0] - nx, yb, b[1] - nz, b[0] + nx, yb, b[1] + nz);
      for (var j = 0; j < 6; j++) col.push(rgba[0], rgba[1], rgba[2], rgba[3]);
    }
    if (!v.length) return null;
    return { pos: buffer(new Float32Array(v)), col: buffer(new Float32Array(col)), count: v.length / 3 };
  }

  // A beacon: two crossed light planes, bright at the foot, fading up.
  function beacon(cell, rgb, height) {
    var p = cellXZ(cell), y = elevAt(p[0], p[1]), w = 0.9, v = [], col = [];
    [[w, 0], [0, w]].forEach(function (o) {
      var x0 = p[0] - o[0], z0 = p[1] - o[1], x1 = p[0] + o[0], z1 = p[1] + o[1];
      v.push(x0, y, z0, x1, y, z1, x0, y + height, z0, x1, y, z1, x1, y + height, z1, x0, y + height, z0);
      var lo = [rgb[0], rgb[1], rgb[2], 0.85], hi = [rgb[0], rgb[1], rgb[2], 0.0];
      [lo, lo, hi, lo, hi, hi].forEach(function (c) { col.push(c[0], c[1], c[2], c[3]); });
    });
    // A ring on the ground around the point (8 m across): where to stand and work.
    var R = 4, N = 32;
    for (var i = 0; i < N; i++) {
      var a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, r0 = R - 0.35;
      var ya2 = elevAt(p[0] + Math.cos(a0) * R, p[1] + Math.sin(a0) * R) + 0.12, yb2 = elevAt(p[0] + Math.cos(a1) * R, p[1] + Math.sin(a1) * R) + 0.12;
      var o0 = [Math.cos(a0), Math.sin(a0)], o1 = [Math.cos(a1), Math.sin(a1)];
      v.push(p[0] + o0[0] * r0, ya2, p[1] + o0[1] * r0, p[0] + o0[0] * R, ya2, p[1] + o0[1] * R, p[0] + o1[0] * R, yb2, p[1] + o1[1] * R,
        p[0] + o0[0] * r0, ya2, p[1] + o0[1] * r0, p[0] + o1[0] * R, yb2, p[1] + o1[1] * R, p[0] + o1[0] * r0, yb2, p[1] + o1[1] * r0);
      for (var j = 0; j < 6; j++) col.push(rgb[0], rgb[1], rgb[2], 0.9);
    }
    return { pos: buffer(new Float32Array(v)), col: buffer(new Float32Array(col)), count: v.length / 3,
      top: [p[0], y + 6, p[1]] };
  }
  function free(o) { if (o) { gl.deleteBuffer(o.pos); gl.deleteBuffer(o.col); } }

  // ---- decorative rocks (NOT from the data) ----------------------------------------------------
  // The 5 m grid has no small rocks, so the ground looked empty. Rocks are scattered by a fixed
  // hash of the place (the same rocks every time), more on steep and rocky ground, never on the
  // route or at the points. The visor says they are for the look only.
  var rocks = null, rockAt = null, avoid = {};
  var ICO = (function () {
    var t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    v = v.map(function (a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; });
    var f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { v: v, f: f };
  })();
  function hash(a, b, s) {                          // 0..1, fixed for a place
    var x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function addRock(P, N, Sh, x, z, size, seed) {
    var y = elevAt(x, z), flat = 0.5 + 0.3 * hash(seed, 1, 2), rot = hash(seed, 2, 3) * Math.PI * 2;
    var cr = Math.cos(rot), sr = Math.sin(rot), shade = 0.75 + 0.5 * hash(seed, 3, 4);
    var pts = ICO.v.map(function (a, i) {
      var k = 0.7 + 0.5 * hash(seed, i, 5);
      var px = a[0] * k * size, pz = a[2] * k * size * (0.8 + 0.4 * hash(seed, 6, 7));
      return [x + px * cr - pz * sr, y + (a[1] * k * flat - 0.25) * size, z + px * sr + pz * cr];   // a quarter sunk
    });
    ICO.f.forEach(function (f) {
      var a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      [a, b, c].forEach(function (p) { P.push(p[0], p[1], p[2]); N.push(nx / l, ny / l, nz / l); Sh.push(shade); });
    });
  }
  function slopeAtXZ(x, z) {
    var c = Math.floor(x / terrain.cellM), r = Math.floor(z / terrain.cellM);
    if (r < 0 || c < 0 || r >= terrain.rows || c >= terrain.cols) return -1;
    return terrain.slopeDeg[r * terrain.cols + c];
  }
  function blocked(x, z, pad) {
    var c = Math.floor(x / terrain.cellM), r = Math.floor(z / terrain.cellM);
    for (var dr = -pad; dr <= pad; dr++) for (var dc = -pad; dc <= pad; dc++) if (avoid[(r + dr) + ':' + (c + dc)]) return true;
    return false;
  }
  function buildRocks(cx, cz) {
    var P = [], N = [], Sh = [];
    function scatter(grid, radius, chance, minS, maxS, pad, s0) {
      var i0 = Math.floor((cx - radius) / grid), i1 = Math.floor((cx + radius) / grid);
      var j0 = Math.floor((cz - radius) / grid), j1 = Math.floor((cz + radius) / grid);
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
        var x = (i + hash(i, j, s0)) * grid, z = (j + hash(i, j, s0 + 1)) * grid;
        if (Math.hypot(x - cx, z - cz) > radius) continue;
        var sl = slopeAtXZ(x, z);
        if (sl < 0) continue;
        var p = chance * (0.6 + Math.min(1.6, sl / 12));             // more rocks where it is steep
        if (hash(i, j, s0 + 2) > p) continue;
        if (blocked(x, z, pad)) continue;
        var u = hash(i, j, s0 + 3);
        addRock(P, N, Sh, x, z, minS + (maxS - minS) * u * u, i * 7.13 + j * 3.71 + s0);
      }
    }
    scatter(2.5, 140, 0.32, 0.08, 0.75, 0, 11);       // small stones near you
    scatter(20, 700, 0.4, 0.6, 2.6, 1, 31);          // boulders further out
    if (rocks) { gl.deleteBuffer(rocks.pos); gl.deleteBuffer(rocks.nor); gl.deleteBuffer(rocks.slope); }
    rocks = P.length ? { pos: buffer(new Float32Array(P)), nor: buffer(new Float32Array(N)), slope: buffer(new Float32Array(Sh)), count: P.length / 3 } : null;
    rockAt = [cx, cz];
  }

  // ---- public ---------------------------------------------------------------------------------
  function init(cv, terr, Tmod, labelLayer) {
    if (gl) return true;
    canvas = cv; terrain = terr; T = Tmod; labelBox = labelLayer;
    try {
      gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) ||
        cv.getContext('experimental-webgl');
      if (!gl) return false;
      progLand = compile(VS_LAND, FS_LAND);
      progFlat = compile(VS_FLAT, FS_FLAT);
      if (!buildLand()) { gl = null; return false; }
    } catch (e) {
      if (window.console) console.warn('3D view off:', e);
      gl = null;
      return false;
    }
    return true;
  }

  // routes: [{cells, color:[r,g,b,a], width, dash}]; points: [{cell, color:[r,g,b], label, base}]
  function setScene(routeList, points) {
    if (!gl) return;
    routes.forEach(free); beacons.forEach(free);
    routes = routeList.map(function (r) { return ribbon(r.cells, r.color, r.width || 1, r.dash || null, 0.22); }).filter(Boolean);
    var av = {};                                    // no decorative rocks on the route or at the points
    routeList.forEach(function (r) { (r.cells || []).forEach(function (c) { av[c.r + ':' + c.c] = 1; }); });
    points.forEach(function (p) {
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) av[(p.cell.r + dr) + ':' + (p.cell.c + dc)] = 1;
    });
    if (Object.keys(av).join() !== Object.keys(avoid).join()) { avoid = av; rockAt = null; }
    beacons = points.map(function (p) {
      var b = beacon(p.cell, p.color, p.base ? 26 : 34);
      b.label = p.label; b.base = !!p.base; b.cell = p.cell;
      return b;
    });
    labelBox.innerHTML = '';
    labels = beacons.map(function (b) {
      var el = document.createElement('div');
      el.className = 'fpv-label' + (b.base ? ' base' : '');
      el.innerHTML = '<b></b><span></span>';
      el.firstChild.textContent = b.label;
      labelBox.appendChild(el);
      return el;
    });
  }
  function setHome(cells, strong) {
    if (!gl) return;
    free(homeRoute);
    homeRoute = ribbon(cells, strong ? [0.65, 0.95, 0.76, 1] : [0.65, 0.95, 0.76, 0.9], strong ? 1.1 : 0.28, strong ? null : [3, 2.5], 0.3);
  }

  function attrib(loc, buf, size) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  // Where the Sun is at a local solar hour, for a site near 18° N (Jezero) around equinox:
  // east in the morning, high in the south at noon, west in the evening. World: x east, z south, y up.
  function sunDir(hour) {
    if (hour === undefined || hour === null || isNaN(hour)) hour = 10;
    var H = (hour - 12) * 15 * Math.PI / 180, lat = 18.4 * Math.PI / 180;
    var east = -Math.sin(H), north = -Math.cos(H) * Math.sin(lat), up = Math.cos(H) * Math.cos(lat);
    up = Math.max(up, 0.12);                        // keep the ground readable at dawn and dusk
    var l = Math.hypot(east, north, up);
    return [east / l, up / l, -north / l];
  }

  // cam: {r, c} fractional cell, yaw (rad, 0 = north, east positive), pitch (rad, + = up), hour (local solar)
  function render(cam) {
    if (!gl) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    var x = (cam.c + 0.5) * terrain.cellM, z = (cam.r + 0.5) * terrain.cellM;
    var eye = [x, elevAt(x, z) + EYE_M, z];
    var cp = Math.cos(cam.pitch);
    var at = [eye[0] + Math.sin(cam.yaw) * cp, eye[1] + Math.sin(cam.pitch), eye[2] - Math.cos(cam.yaw) * cp];
    var mvp = mul(perspective(FOV, w / Math.max(1, h), NEAR, FAR), lookAt(eye, at, [0, 1, 0]));
    var sun = sunDir(cam.hour);

    if (!rockAt || Math.hypot(rockAt[0] - x, rockAt[1] - z) > 45) buildRocks(x, z);

    gl.useProgram(progLand.p);
    var L = progLand.loc;
    gl.uniformMatrix4fv(L.uMVP, false, new Float32Array(mvp));
    gl.uniform3fv(L.uSun, sun);
    gl.uniform3fv(L.uCam, eye);
    gl.uniform3fv(L.uFog, SKY_HORIZON);
    [plane, land].forEach(function (m) {
      gl.uniform1f(L.uKind, m === land ? 1 : 0);
      attrib(L.aPos, m.pos, 3); attrib(L.aNor, m.nor, 3); attrib(L.aSlope, m.slope, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
      gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
    });
    if (rocks) {
      gl.uniform1f(L.uKind, 2);
      attrib(L.aPos, rocks.pos, 3); attrib(L.aNor, rocks.nor, 3); attrib(L.aSlope, rocks.slope, 1);
      gl.drawArrays(gl.TRIANGLES, 0, rocks.count);
    }
    gl.disableVertexAttribArray(L.aNor); gl.disableVertexAttribArray(L.aSlope);

    gl.useProgram(progFlat.p);
    var F = progFlat.loc;
    gl.uniformMatrix4fv(F.uMVP, false, new Float32Array(mvp));
    gl.uniform3fv(F.uCam, eye);
    gl.uniform3fv(F.uFog, SKY_HORIZON);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -2);
    gl.uniform1f(F.uNear, 10);
    routes.concat(homeRoute ? [homeRoute] : []).forEach(function (m) {
      attrib(F.aPos, m.pos, 3); attrib(F.aCol, m.col, 4);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.uniform1f(F.uNear, 9);                      // a beacon ring you stand in fades too
    gl.depthMask(false);
    beacons.forEach(function (m) {
      attrib(F.aPos, m.pos, 3); attrib(F.aCol, m.col, 4);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    });
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // Sky: the haze colour exactly at the horizon (no seam), darker butterscotch higher up.
    var far = [eye[0] + Math.sin(cam.yaw) * 30000, eye[1], eye[2] - Math.cos(cam.yaw) * 30000, 1], hz = [0, 0, 0, 0];
    for (var k = 0; k < 4; k++) hz[k] = mvp[k] * far[0] + mvp[4 + k] * far[1] + mvp[8 + k] * far[2] + mvp[12 + k] * far[3];
    var hy = hz[3] > 0 ? (1 - (hz[1] / hz[3] * 0.5 + 0.5)) * 100 : 50;
    // The Sun: a small pale disc with a wide glow (Mars sees it about 2/3 the size we do).
    var sp = [eye[0] + sun[0] * 30000, eye[1] + sun[1] * 30000, eye[2] + sun[2] * 30000, 1], so = [0, 0, 0, 0], glow = '';
    for (k = 0; k < 4; k++) so[k] = mvp[k] * sp[0] + mvp[4 + k] * sp[1] + mvp[8 + k] * sp[2] + mvp[12 + k] * sp[3];
    if (so[3] > 0) {
      var sx = (so[0] / so[3] * 0.5 + 0.5) * 100, sy = (1 - (so[1] / so[3] * 0.5 + 0.5)) * 100;
      if (sx > -30 && sx < 130 && sy > -30 && sy < 130) {
        glow = 'radial-gradient(circle at ' + sx.toFixed(1) + '% ' + sy.toFixed(1) + '%, rgba(255,250,236,1) 0, rgba(255,246,226,.95) 9px, ' +
          'rgba(250,226,190,.55) 14px, rgba(240,206,168,.22) 60px, rgba(230,196,160,0) 240px), ';
      }
    }
    canvas.parentNode.style.background = glow + 'linear-gradient(to bottom, #6f5040 ' + (hy - 70).toFixed(1) + '%, #b38a6b ' + (hy - 25).toFixed(1) +
      '%, rgb(219,184,148) ' + hy.toFixed(1) + '%, rgb(219,184,148) 100%)';

    // Labels over the beacons: name and distance, placed in screen space.
    beacons.forEach(function (b, i) {
      var p = b.top, v = [p[0], p[1], p[2], 1], o = [0, 0, 0, 0];
      for (var r = 0; r < 4; r++) o[r] = mvp[r] * v[0] + mvp[4 + r] * v[1] + mvp[8 + r] * v[2] + mvp[12 + r] * v[3];
      var el = labels[i];
      if (o[3] <= 0.5) { el.style.display = 'none'; return; }
      var sx = (o[0] / o[3] * 0.5 + 0.5) * w, sy = (1 - (o[1] / o[3] * 0.5 + 0.5)) * h;
      if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) { el.style.display = 'none'; return; }
      var dist = Math.hypot(p[0] - eye[0], p[2] - eye[2]);
      el.style.display = '';
      el.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px) translate(-50%, -100%)';
      el.lastChild.textContent = dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(2) + ' km';
      el.style.opacity = dist < 8 ? 0.35 : 1;
    });
  }

  root.SeraFpv = { init: init, setScene: setScene, setHome: setHome, render: render, elevAt: function (x, z) { return elevAt(x, z); },
    get ok() { return !!gl; }, get rockCount() { return rocks ? rocks.count / 60 : 0; } };
})(window);
