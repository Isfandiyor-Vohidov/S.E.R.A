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
//  - the habitat at the base (with an inside you can walk into) and the science stations that are
//    built at the points (MODEL: drawn for the experience, not from the data);
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
    'uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uFog; uniform float uKind; uniform vec2 uZone;' +
    'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
    'float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);' +
    '  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }' +
    'float bump(vec2 p){ return n(p*2.3)*0.55 + n(p*6.1)*0.25 + n(p*0.7)*0.9; }' +
    'void main(){' +
    // uKind 4: inside the base. vSlope is a palette code; 20+ glow (lamps, screens, the window).
    '  if (uKind > 3.5) {' +
    '    float s = vSlope; vec3 nn4 = normalize(vNor); vec3 a;' +
    '    if (s > 19.5) {' +
    '      a = s > 24.5 ? vec3(0.45, 1.0, 0.6) : s > 23.5 ? vec3(0.95, 0.6, 0.42) : s > 22.5 ? vec3(1.0, 0.35, 0.28)' +
    '        : s > 21.5 ? vec3(0.98, 0.76, 0.36) : s > 20.5 ? vec3(0.35, 0.9, 0.85) : vec3(1.0, 0.97, 0.9);' +
    '      gl_FragColor = vec4(a, 1.0); return;' +
    '    }' +
    '    a = s > 17.5 ? vec3(0.08, 0.09, 0.1) : s > 16.5 ? vec3(0.62, 0.5, 0.4) : s > 15.5 ? vec3(0.3, 0.58, 0.26)' +
    '      : s > 14.5 ? vec3(0.86, 0.45, 0.2) : s > 13.5 ? vec3(0.25, 0.42, 0.55) : s > 12.5 ? vec3(0.55, 0.57, 0.6)' +
    '      : s > 11.5 ? vec3(0.68, 0.69, 0.71) : s > 10.5 ? vec3(0.3, 0.31, 0.33) : vec3(0.84, 0.85, 0.86);' +
    '    float li = 0.42 + 0.4 * max(dot(nn4, normalize(vec3(0.2, 1.0, 0.3))), 0.0) + 0.2 * max(dot(nn4, normalize(vec3(-0.4, 0.3, -0.6))), 0.0);' +
    '    li *= 1.0 - 0.25 * smoothstep(2.0, 9.0, distance(vPos, uCam));' +
    '    gl_FragColor = vec4(a * li, 1.0); return;' +
    '  }' +
    '  vec2 p = vPos.xz;' +
    '  float d = distance(vPos, uCam);' +
    '  float near = 1.0 - smoothstep(25.0, 160.0, d);' +                   // fine detail only close up
    '  float g = n(p*1.7)*0.45 + n(p*0.45)*0.35 + n(p*0.08)*0.2;' +        // grain: 0.6 m, 2 m, 12 m
    '  float patch = smoothstep(0.35, 0.75, n(p*0.012) * 0.7 + n(p*0.05) * 0.3);' +
    '  vec3 dust = vec3(0.70, 0.44, 0.28), rock = vec3(0.36, 0.27, 0.22), dark = vec3(0.24, 0.18, 0.15);' +
    '  vec3 nn = normalize(vNor);' +
    '  vec3 alb;' +
    '  if (uKind > 2.5) {' +                                                   // the astronaut: white suit, grey pack, gold visor
    '    alb = vSlope > 6.5 ? vec3(0.10, 0.14, 0.27) : vSlope > 5.5 ? vec3(0.86, 0.36, 0.18) : vSlope > 4.5 ? vec3(0.4, 1.4, 1.0) : vSlope > 3.5 ? vec3(0.30, 0.30, 0.31) : vSlope > 2.5 ? vec3(0.80, 0.80, 0.78)' +
    '      : vSlope > 1.5 ? vec3(0.50, 0.33, 0.10) : vec3(0.93, 0.92, 0.89) * vSlope;' +
    '  } else if (uKind > 1.5) {' +
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
    '  if (uKind > 2.5) {' +
    '    vec3 vv = normalize(uCam - vPos); float rim = pow(1.0 - max(dot(nn, vv), 0.0), 3.0);' +
    '    float sp = pow(max(dot(reflect(-uSun, nn), vv), 0.0), vSlope > 1.5 && vSlope < 2.5 ? 60.0 : 12.0);' +
    '    col += vec3(1.0, 0.92, 0.8) * sp * (vSlope > 1.5 && vSlope < 2.5 ? 1.4 : 0.12) + vec3(0.55, 0.42, 0.34) * rim * 0.35;' +
    '    col += alb * vec3(0.20, 0.19, 0.18);' +
    '    if (vSlope > 1.5 && vSlope < 2.5) col += vec3(0.75, 0.55, 0.40) * 0.35 * (0.5 + 0.5 * nn.y);' +
    '  }' +
    '  col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 0.82);' +       // a bit less saturated, dusty
    '  float f = 1.0 - exp(-d * 0.00085);' +
    '  vec2 ez = min(vPos.xz, uZone - vPos.xz);' +                            // the zone edge melts into the haze
    '  float edge = smoothstep(0.0, 250.0, min(ez.x, ez.y));' +
    '  gl_FragColor = vec4(mix(col, uFog, clamp(f, 0.0, uKind > 0.5 ? mix(1.0, 0.92, edge) : 1.0)), 1.0);' +
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
  // ---- the astronaut (third-person view) --------------------------------------------------
  // A simple suit made of boxes and a round helmet, no face (the gold visor is down).
  // Legs and arms swing with the step. Built again every frame: it is only a few hundred triangles.
  var SPHERE = (function () {                       // icosahedron split once: a rounder helmet
    var v = ICO.v.slice(), f = [], mid = {};
    function m(a, b) {
      var k = a < b ? a + '_' + b : b + '_' + a;
      if (mid[k] === undefined) { var p = [v[a][0] + v[b][0], v[a][1] + v[b][1], v[a][2] + v[b][2]], l = Math.hypot(p[0], p[1], p[2]); v.push([p[0] / l, p[1] / l, p[2] / l]); mid[k] = v.length - 1; }
      return mid[k];
    }
    ICO.f.forEach(function (t) { var a = m(t[0], t[1]), b = m(t[1], t[2]), c = m(t[2], t[0]); f.push([t[0], a, c], [t[1], b, a], [t[2], c, b], [a, b, c]); });
    return { v: v, f: f };
  })();
  var walker = null;
  // Built from rounded parts with smooth normals: a white pressure suit, a life-support pack,
  // a hard helmet with the gold sun visor down (no face), knees and elbows that bend with the step.
  // Shade codes for the shader: 0..1.2 suit white, 2 gold visor, 3 light grey, 4 dark grey, 5 teal light.
  function buildWalker(o) {
    var P = [], N = [], S = [];
    var fy = Math.sin(o.yaw), fz = -Math.cos(o.yaw), rx = Math.cos(o.yaw), rz = Math.sin(o.yaw);
    function W(p) { return [o.x + rx * p[0] + fy * p[2], o.y + p[1], o.z + rz * p[0] + fz * p[2]]; }
    function Wn(n) { return [rx * n[0] + fy * n[2], n[1], rz * n[0] + fz * n[2]]; }
    function quad(grid, shade) {                    // grid[i][j] = [pos, normal] (local) -> triangles
      for (var i = 0; i < grid.length - 1; i++) for (var j = 0; j < grid[i].length - 1; j++) {
        var q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        [0, 1, 2, 0, 2, 3].forEach(function (k) {
          var p = W(q[k][0]), n = Wn(q[k][1]);
          P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); S.push(shade);
        });
      }
    }
    function sp(v, e) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e); }
    // ellipsoid (e = 1) or rounded box (e < 1), centre c, radii r = [x, y, f]
    function blob(c, r, shade, e, nu, nv) {
      e = e || 1; nu = nu || 10; nv = nv || 14;
      var g = [];
      for (var i = 0; i <= nu; i++) {
        var u = -Math.PI / 2 + Math.PI * i / nu, row = [];
        for (var j = 0; j <= nv; j++) {
          var v = -Math.PI + 2 * Math.PI * j / nv;
          var cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
          var p = [c[0] + r[0] * sp(cu, e) * sp(cv, e), c[1] + r[1] * sp(su, e), c[2] + r[2] * sp(cu, e) * sp(sv, e)];
          var n = [sp(cu, 2 - e) * sp(cv, 2 - e) / r[0], sp(su, 2 - e) / r[1], sp(cu, 2 - e) * sp(sv, 2 - e) / r[2]];
          var l = Math.hypot(n[0], n[1], n[2]) || 1;
          row.push([p, [n[0] / l, n[1] / l, n[2] / l]]);
        }
        g.push(row);
      }
      quad(g, shade);
    }
    // capsule from p0 to p1, radius r0 at p0 and r1 at p1 (a limb)
    function limb(p0, p1, r0, r1, shade) {
      var d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
      d = [d[0] / L, d[1] / L, d[2] / L];
      var t = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var b1 = [d[1] * t[2] - d[2] * t[1], d[2] * t[0] - d[0] * t[2], d[0] * t[1] - d[1] * t[0]], bl = Math.hypot(b1[0], b1[1], b1[2]);
      b1 = [b1[0] / bl, b1[1] / bl, b1[2] / bl];
      var b2 = [d[1] * b1[2] - d[2] * b1[1], d[2] * b1[0] - d[0] * b1[2], d[0] * b1[1] - d[1] * b1[0]];
      var g = [], NV = 12;
      for (var i = 0; i <= 9; i++) {
        var top = i <= 4, th = top ? (i / 4) * Math.PI / 2 : Math.PI / 2 + ((i - 5) / 4) * Math.PI / 2;
        if (i === 5) th = Math.PI / 2;
        var c = top ? p1 : p0, r = top ? r1 : r0, row = [];
        for (var j = 0; j <= NV; j++) {
          var ph = 2 * Math.PI * j / NV, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), spp = Math.sin(ph);
          var n = [d[0] * ct + (b1[0] * cp + b2[0] * spp) * st, d[1] * ct + (b1[1] * cp + b2[1] * spp) * st, d[2] * ct + (b1[2] * cp + b2[2] * spp) * st];
          row.push([[c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r], n]);
        }
        g.push(row);
      }
      quad(g, shade);
    }
    function add(p, v, k) { return [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k]; }
    function dir(ang, out) { var v = [out || 0, -Math.cos(ang), Math.sin(ang)], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

    var st = o.stride, air = o.air ? 1 : 0;
    [-1, 1].forEach(function (k) {
      var ph = o.phase + (k > 0 ? Math.PI : 0);
      // leg: hip swing, knee bends while the foot comes forward; in the air both knees bend
      var hipA = Math.sin(ph) * 0.48 * st + air * (k > 0 ? 0.45 : 0.15);
      var knee = (0.08 + 0.75 * Math.max(0, Math.cos(ph)) * st) * (1 - air) + air * 0.7;
      var hip = [0.125 * k, 0.94, 0], kneeP = add(hip, dir(hipA), 0.44), ank = add(kneeP, dir(hipA - knee), 0.42);
      limb(hip, kneeP, 0.125, 0.13, 0.97);
      if (o.stripes) {
        var tb = [hip[0] + (kneeP[0] - hip[0]) * 0.4, hip[1] + (kneeP[1] - hip[1]) * 0.4, hip[2] + (kneeP[2] - hip[2]) * 0.4];
        blob(tb, [0.137, 0.035, 0.137], 6);
      }
      blob(kneeP, [0.115, 0.1, 0.115], 0.9);                                  // knee joint
      limb(kneeP, ank, 0.112, 0.1, 0.97);
      blob([ank[0], ank[1] - 0.005, ank[2] + 0.045], [0.1, 0.075, 0.165], 4, 0.6, 8, 12);   // boot
      blob([ank[0], ank[1] + 0.045, ank[2] + 0.005], [0.105, 0.035, 0.105], 3);   // ankle ring
      // arm: swings against the leg on the same side, elbow a little bent
      var armA = -Math.sin(ph) * 0.42 * st - air * 0.5;
      var sh = [0.31 * k, 1.49, 0], elb = add(sh, dir(armA, 0.1 * k), 0.29), wr = add(elb, dir(armA + 0.35 + 0.25 * st, 0.03 * k), 0.27);
      blob(sh, [0.125, 0.12, 0.125], 0.95);                                      // shoulder bearing
      limb(sh, elb, 0.098, 0.09, 0.97);
      if (o.stripes) blob([sh[0] + (elb[0] - sh[0]) * 0.45, sh[1] + (elb[1] - sh[1]) * 0.45, sh[2] + (elb[2] - sh[2]) * 0.45], [0.104, 0.03, 0.104], 6);
      blob(elb, [0.09, 0.085, 0.09], 0.9);
      limb(elb, wr, 0.086, 0.075, 0.97);
      blob([wr[0], wr[1] + 0.02, wr[2]], [0.085, 0.03, 0.085], 3);               // wrist ring
      blob([wr[0], wr[1] - 0.05, wr[2] + 0.01], [0.06, 0.085, 0.07], 4);         // glove
    });
    blob([0, 1.02, 0], [0.225, 0.15, 0.175], 0.95);                             // hips / brief
    blob([0, 1.17, 0], [0.215, 0.04, 0.17], 3);                                 // waist ring
    blob([0, 1.36, 0], [0.275, 0.26, 0.185], 1.0, 0.55, 12, 16);                 // hard upper torso
    blob([0, 1.27, 0.185], [0.13, 0.065, 0.055], 3, 0.45, 8, 12);               // chest control box
    blob([0.055, 1.29, 0.238], [0.016, 0.016, 0.01], 5);                        // its status light
    blob([0, 1.38, -0.29], [0.25, 0.34, 0.12], 3, 0.4, 12, 16);              // life-support pack
    blob([0, 1.62, -0.29], [0.21, 0.03, 0.1], 4, 0.5);
    blob([0, 1.2, -0.405], [0.2, 0.012, 0.012], 4);                              // pack seams
    blob([0, 1.42, -0.405], [0.2, 0.012, 0.012], 4);                           // pack top
    blob([0, 1.615, 0], [0.155, 0.035, 0.15], 3);                               // neck ring
    blob([0, 1.79, -0.005], [0.165, 0.175, 0.175], 1.0, 1, 12, 18);             // helmet shell
    blob([0, 1.775, 0.035], [0.152, 0.135, 0.155], 2, 1, 12, 18);               // gold visor
    blob([0, 1.925, 0.02], [0.05, 0.02, 0.06], 3);                              // helmet lights
    var m = o.mesh || { pos: gl.createBuffer(), nor: gl.createBuffer(), slope: gl.createBuffer() };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nor); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(N), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.slope); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(S), gl.DYNAMIC_DRAW);
    m.count = P.length / 3;
    return m;
  }
  var buddyMesh = null;
  function drawMesh(L, m) {
    gl.uniform1f(L.uKind, 3);
    attrib(L.aPos, m.pos, 3); attrib(L.aNor, m.nor, 3); attrib(L.aSlope, m.slope, 1);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
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

  // ---- things that are built: the habitat, science stations, the inside of the base -------------
  // A small mesh builder in local metres. The origin o and the mirror d (on x) put it in the world,
  // so the airlock of the habitat can face the base point from either side.
  // Shade codes outside are the astronaut's (uKind 3: 0..1.2 white, 2 gold, 3 light grey, 4 dark grey,
  // 5 teal light, 6 orange, 7 solar cells); inside the base, the palette of uKind 4 (see the shader).
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function Builder(o, d) {
    var P = [], N = [], S = [];
    function tri(a, b, c, na, nb, nc, s) {
      [[a, na], [b, nb], [c, nc]].forEach(function (v) {
        P.push(o[0] + d * v[0][0], o[1] + v[0][1], o[2] + v[0][2]); N.push(d * v[1][0], v[1][1], v[1][2]); S.push(s);
      });
    }
    function quad(a, b, c, e, n, s) { tri(a, b, c, n, n, n, s); tri(a, c, e, n, n, n, s); }
    return {
      box: function (x0, y0, z0, x1, y1, z1, s) {
        quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], s);
        quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], s);
        quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], s);
        quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], s);
        quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], s);
        quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], s);
      },
      // a round tube from p0 to p1, radius r0 -> r1 (a cone when they differ), closed ends if caps
      tube: function (p0, p1, r0, r1, s, seg, caps) {
        var ax = unit([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
        var u = unit(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(ax, u);
        function ring(a) { return [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)]; }
        function at(p, n, r) { return [p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r]; }
        var back = [-ax[0], -ax[1], -ax[2]];
        for (var i = 0; i < seg; i++) {
          var n0 = ring(i / seg * Math.PI * 2), n1 = ring((i + 1) / seg * Math.PI * 2);
          var A = at(p0, n0, r0), B = at(p0, n1, r0), C = at(p1, n1, r1), D = at(p1, n0, r1);
          tri(A, B, C, n0, n1, n1, s); tri(A, C, D, n0, n1, n0, s);
          if (caps) { tri(p0, B, A, back, back, back, s); tri(p1, D, C, ax, ax, ax, s); }
        }
      },
      // a cylinder lying along x (a hull), centre (cy, cz), radius r; inward = seen from inside;
      // parts lower than minY are left out (they are under the deck)
      hull: function (x0, x1, cy, cz, r, s, seg, inward, minY) {
        for (var i = 0; i < seg; i++) {
          var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
          var y0 = cy + r * Math.sin(a0), z0 = cz + r * Math.cos(a0), y1 = cy + r * Math.sin(a1), z1 = cz + r * Math.cos(a1);
          if (minY !== undefined && y0 < minY && y1 < minY) continue;
          var k = inward ? -1 : 1, n0 = [0, k * Math.sin(a0), k * Math.cos(a0)], n1 = [0, k * Math.sin(a1), k * Math.cos(a1)];
          tri([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], n0, n0, n1, s); tri([x0, y0, z0], [x1, y1, z1], [x0, y1, z1], n0, n1, n1, s);
        }
      },
      // a flat round end on the plane x, facing nx (+1 or -1)
      disc: function (x, cy, cz, r, nx, s, seg) {
        var n = [nx, 0, 0];
        for (var i = 0; i < seg; i++) {
          var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
          tri([x, cy, cz], [x, cy + r * Math.sin(a0), cz + r * Math.cos(a0)], [x, cy + r * Math.sin(a1), cz + r * Math.cos(a1)], n, n, n, s);
        }
      },
      upload: function () {
        if (!P.length) return null;
        return { pos: buffer(new Float32Array(P)), nor: buffer(new Float32Array(N)), slope: buffer(new Float32Array(S)), count: P.length / 3 };
      }
    };
  }
  function dropMesh(m) { if (m) { gl.deleteBuffer(m.pos); gl.deleteBuffer(m.nor); gl.deleteBuffer(m.slope); } }

  // The habitat: a pressurised module (4.6 m across, 10 m long) on legs, an airlock with steps,
  // two solar arrays and an antenna. It stands 8.4 m from the base point, on the side away from
  // the routes, the airlock towards the point. hab.out is where you stand to go in.
  var hab = null, habMesh = null, habKey = '';
  var HAB_CY = 3.0, HAB_R = 2.3;
  function buildHabitat(baseCell, side) {
    var bp = cellXZ(baseCell), cx = bp[0] + side * 8.4, cz = bp[1], g = elevAt(cx, cz);
    var B = Builder([cx, g, cz], side), CY = HAB_CY, x;
    function ground(lx, lz) { return elevAt(cx + side * lx, cz + lz) - g; }
    B.hull(-5, 5, CY, 0, HAB_R, 0.92, 32, false);
    B.disc(5, CY, 0, HAB_R, 1, 0.85, 32); B.disc(-5, CY, 0, HAB_R, -1, 0.85, 32);
    for (x = -4.6; x <= 4.7; x += 2.3) B.hull(x - 0.09, x + 0.09, CY, 0, HAB_R + 0.07, 3, 32, false);
    B.hull(0.9, 1.3, CY, 0, HAB_R + 0.03, 6, 32, false);                       // the orange band
    [-1, 1].forEach(function (k) {                                              // gold-glass windows
      B.box(-1.1, CY + 0.15, k > 0 ? 2.12 : -2.36, -0.3, CY + 0.75, k > 0 ? 2.36 : -2.12, 2);
      B.box(1.7, CY + 0.15, k > 0 ? 2.12 : -2.36, 2.5, CY + 0.75, k > 0 ? 2.36 : -2.12, 2);
    });
    [[-3.4, -1], [-3.4, 1], [3.4, -1], [3.4, 1]].forEach(function (l) {             // legs down to the ground
      var fx = l[0] + (l[0] > 0 ? 0.4 : -0.4), fz = l[1] * 1.95, gy = ground(fx, fz);
      B.tube([l[0], CY - 1.5, l[1] * 1.4], [fx, gy, fz], 0.11, 0.11, 4, 8);
      B.box(fx - 0.3, gy - 0.1, fz - 0.3, fx + 0.3, gy + 0.08, fz + 0.3, 4);
    });
    // airlock: a short, narrower tube with the door, teal lights round the door, steps down
    B.hull(-6.6, -5, CY - 0.5, 0, 1.2, 0.92, 24, false); B.disc(-6.6, CY - 0.5, 0, 1.2, -1, 0.85, 24);
    var dB = CY - 1.45, dT = CY + 0.35;
    B.box(-6.66, dB, -0.5, -6.6, dT, 0.5, 4);
    B.box(-6.7, dB, -0.62, -6.62, dT + 0.1, -0.52, 5); B.box(-6.7, dB, 0.52, -6.62, dT + 0.1, 0.62, 5); B.box(-6.7, dT, -0.62, -6.62, dT + 0.1, 0.62, 5);
    for (var k = 0; k < 4; k++) {
      var sx1 = -6.6 - 0.42 * k, sx0 = sx1 - 0.42, top = dB * (1 - k / 4);
      B.box(sx0, Math.min(ground(sx0, 0), ground(sx1, 0)) - 0.3, -0.75, sx1, top, 0.75, 3);
    }
    [-1, 1].forEach(function (k) {                                              // solar arrays on masts
      var mz = k * 5.2, gy = ground(0, mz);
      B.tube([0, gy, mz], [0, gy + 2.2, mz], 0.08, 0.08, 4, 8);
      B.box(-2.3, gy + 2.2, mz - 1.1, 2.3, gy + 2.26, mz + 1.1, 7);
      B.box(-2.35, gy + 2.18, mz - 1.15, 2.35, gy + 2.2, mz + 1.15, 3);
    });
    B.tube([2.5, CY + HAB_R - 0.1, 0], [2.5, CY + HAB_R + 1.1, 0], 0.05, 0.05, 3, 8);   // antenna and dish
    B.tube([2.5, CY + HAB_R + 1.1, 0], [2.5, CY + HAB_R + 1.45, 0.25], 0.06, 0.8, 0.92, 18, true);
    B.box(2.45, CY + HAB_R + 1.45, -0.05, 2.55, CY + HAB_R + 1.55, 0.05, 5);
    dropMesh(habMesh); habMesh = B.upload();
    var xs = [cx + side * -8.3, cx + side * 5.3];
    hab = { cx: cx, cz: cz, g: g, side: side, out: [cx - side * 9.3, cz],
      box: { x0: Math.min(xs[0], xs[1]), x1: Math.max(xs[0], xs[1]), z0: cz - 2.6, z1: cz + 2.6 } };
  }

  // Science stations: hold E at a point (or the simulation's science work) and a station is built
  // up step by step: tripod, instrument box, solar panel, mast with a teal light; a core sample
  // tube lies next to it when it is done. p = 0..1 for each point.
  var stationMesh = null, stationKey = '';
  function setStations(list) {
    if (!gl) return;
    var key = list.map(function (s) { return s.p.toFixed(2); }).join();
    if (key === stationKey) return;
    stationKey = key;
    var B = Builder([0, 0, 0], 1);
    list.forEach(function (s) {
      var p = s.p; if (p <= 0) return;
      var c = cellXZ(s.cell), x = c[0] + 1.8, z = c[1] - 0.6, g = elevAt(x, z);
      var top = g + 0.15 + Math.min(1, p / 0.35) * 1.0;
      for (var j = 0; j < 3; j++) {
        var a = j * 2.094 + 0.5, fx = x + Math.cos(a) * 0.6, fz = z + Math.sin(a) * 0.6;
        B.tube([fx, elevAt(fx, fz), fz], [x + Math.cos(a) * 0.08, top, z + Math.sin(a) * 0.08], 0.03, 0.025, 3, 6);
      }
      if (p > 0.35) {
        var k2 = Math.min(1, (p - 0.35) / 0.2), h = 0.2 * k2;
        B.box(x - h, top, z - h, x + h, top + 0.32 * k2, z + h, 0.92);
        B.box(x - h - 0.01, top + 0.1 * k2, z - h - 0.01, x + h + 0.01, top + 0.16 * k2, z + h + 0.01, 2);
      }
      if (p > 0.55) {
        var w = 0.55 * Math.min(1, (p - 0.55) / 0.25);
        B.tube([x, top + 0.32, z], [x, top + 0.6, z], 0.025, 0.025, 4, 6);
        B.box(x - w, top + 0.6, z - 0.3, x + w, top + 0.63, z + 0.3, 7);
      }
      if (p > 0.8) {
        var k4 = Math.min(1, (p - 0.8) / 0.2);
        B.tube([x + 0.12, top + 0.32, z + 0.12], [x + 0.12, top + 0.32 + 0.7 * k4, z + 0.12], 0.015, 0.015, 3, 5);
        if (p >= 1) {
          B.box(x + 0.07, top + 1.0, z + 0.07, x + 0.17, top + 1.1, z + 0.17, 5);
          B.tube([x - 0.75, g + 0.06, z + 0.5], [x - 0.3, g + 0.06, z + 0.75], 0.05, 0.05, 6, 8, true);
        }
      }
    });
    dropMesh(stationMesh); stationMesh = B.upload();
  }

  // Inside the base: the same module from inside (deck at y = 0, x from -5 at the airlock to +5).
  // A lab bench with screens and the samples you brought, bunks, a galley table, a greenhouse
  // shelf, a spare suit by the airlock, a window to Mars at the far end.
  var insideMesh = null, insideKey = -1, spareSuit = null;
  var IN_CY = 1.4;
  function buildInside(samples) {
    var B = Builder([0, 0, 0], 1), R = HAB_R, CY = IN_CY, x, i, y;
    B.hull(-5, 5, CY, 0, R, 10, 40, true, -0.05);
    for (x = -4; x <= 4; x += 2) B.hull(x - 0.07, x + 0.07, CY, 0, R - 0.07, 12, 40, true, 0);
    B.disc(-5, CY, 0, R, 1, 10, 40); B.disc(5, CY, 0, R, -1, 10, 40);
    B.box(-5, -0.1, -1.85, 5, 0, 1.85, 11);                                       // deck
    for (x = -4.5; x <= 4.51; x += 0.5) B.box(x - 0.012, 0, -0.78, x + 0.012, 0.004, 0.78, 12);
    B.box(-4.95, 0.001, -0.7, -4.55, 0.006, 0.7, 22);                             // amber line at the airlock
    B.box(-4.3, 3.47, -0.78, 4.3, 3.51, -0.62, 20); B.box(-4.3, 3.47, 0.62, 4.3, 3.51, 0.78, 20);   // light strips
    B.box(-4.5, 3.58, -0.22, 4.5, 3.64, 0.22, 18);                                // cable tray
    B.tube([-4.5, 3.0, -1.3], [4.5, 3.0, -1.3], 0.03, 0.03, 12, 8); B.tube([-4.5, 3.0, 1.3], [4.5, 3.0, 1.3], 0.03, 0.03, 12, 8);
    // the airlock door (west end), green frame, a red and a green lamp
    B.box(-4.99, 0.05, -0.55, -4.94, 2.0, 0.55, 13);
    B.box(-4.96, 0.05, -0.66, -4.9, 2.1, -0.55, 25); B.box(-4.96, 0.05, 0.55, -4.9, 2.1, 0.66, 25); B.box(-4.96, 2.0, -0.66, -4.9, 2.1, 0.66, 25);
    B.tube([-4.94, 1.1, 0], [-4.86, 1.1, 0], 0.22, 0.22, 12, 16, true);
    B.box(-4.96, 2.2, -0.3, -4.92, 2.3, -0.15, 23); B.box(-4.96, 2.2, 0.15, -4.92, 2.3, 0.3, 25);
    // the window to Mars (east end)
    B.disc(4.97, 1.75, 0, 0.5, -1, 24, 32); B.tube([4.99, 1.75, 0], [4.9, 1.75, 0], 0.58, 0.58, 12, 32);
    // lab bench (north side), cabinets, two screens: a route and a GO lamp, a bar chart
    B.box(-1.3, 0.86, -2.12, 2.5, 0.92, -1.0, 13);
    B.box(-1.25, 0, -1.8, 0.2, 0.84, -1.08, 12); B.box(1.0, 0, -1.8, 2.45, 0.84, -1.08, 12);
    B.box(-1.0, 1.25, -2.06, 0.6, 2.05, -1.99, 18); B.box(-0.95, 1.3, -1.99, 0.55, 2.0, -1.975, 21);
    B.box(0.9, 1.25, -2.06, 2.3, 2.05, -1.99, 18); B.box(0.95, 1.3, -1.99, 2.25, 2.0, -1.975, 21);
    [[-0.8, 1.5, -0.45, 1.53], [-0.48, 1.53, -0.45, 1.75], [-0.48, 1.72, 0.0, 1.75], [-0.03, 1.55, 0.0, 1.75]].forEach(function (r) {
      B.box(r[0], r[1], -1.974, r[2], r[3], -1.97, 22);
    });
    B.box(0.22, 1.78, -1.974, 0.45, 1.92, -1.97, 25);
    for (i = 0; i < 6; i++) B.box(1.05 + i * 0.2, 1.4, -1.974, 1.18 + i * 0.2, 1.5 + 0.08 * ((i * 37) % 5), -1.97, 22);
    // sample canisters: one for every sample you took (empty slots up to six)
    for (i = 0; i < 6; i++) {
      x = -1.1 + i * 0.3;
      B.box(x - 0.09, 0.92, -1.6, x + 0.09, 0.935, -1.42, 18);
      if (i < samples) {
        B.tube([x, 0.935, -1.51], [x, 1.16, -1.51], 0.07, 0.07, 15, 12, true);
        B.tube([x, 1.16, -1.51], [x, 1.2, -1.51], 0.075, 0.075, 21, 12, true);
      }
    }
    B.box(1.4, 0.92, -1.75, 1.75, 1.25, -1.4, 10); B.tube([1.57, 1.25, -1.57], [1.57, 1.48, -1.45], 0.05, 0.035, 18, 10, true);
    B.box(0.2, 0.45, -1.05, 0.66, 0.52, -0.62, 14); B.box(0.2, 0.52, -1.08, 0.66, 1.0, -1.02, 14);
    B.tube([0.43, 0, -0.84], [0.43, 0.45, -0.84], 0.03, 0.03, 13, 6);
    // bunks (south side), two levels
    [0.45, 1.45].forEach(function (yy) {
      B.box(1.2, yy - 0.08, 0.95, 3.6, yy, 1.98, 13);
      B.box(1.25, yy, 1.0, 3.55, yy + 0.14, 1.92, 14);
      B.box(3.1, yy + 0.14, 1.1, 3.5, yy + 0.24, 1.8, 10);
    });
    B.box(1.2, 0, 0.95, 1.26, 2.0, 1.01, 13); B.box(3.54, 0, 0.95, 3.6, 2.0, 1.01, 13);
    // galley table and stools (south-west), a cupboard above
    B.box(-3.0, 0.74, 0.95, -1.6, 0.8, 1.8, 17); B.tube([-2.3, 0, 1.4], [-2.3, 0.74, 1.4], 0.05, 0.05, 13, 8);
    B.tube([-3.3, 0, 0.92], [-3.3, 0.46, 0.92], 0.17, 0.17, 14, 12, true); B.tube([-1.35, 0, 0.92], [-1.35, 0.46, 0.92], 0.17, 0.17, 14, 12, true);
    B.box(-3.0, 1.65, 1.62, -1.6, 2.15, 2.05, 12);
    // greenhouse shelf (north-west): three shelves of plants under grow lights
    [0.5, 1.1, 1.7].forEach(function (yy, j) {
      B.box(-4.4, yy, -2.0, -2.4, yy + 0.04, -1.2, 13);
      for (var q = 0; q < 6; q++) B.box(-4.3 + q * 0.32, yy + 0.04, -1.75, -4.1 + q * 0.32, yy + 0.16 + 0.07 * ((q + j * 2) % 3), -1.45, 16);
      B.box(-4.4, yy + 0.44, -1.9, -2.4, yy + 0.47, -1.3, 20);
    });
    // suit station by the airlock (south-west): a rack and a spare suit
    B.box(-4.6, 0, 1.55, -3.3, 0.05, 2.0, 13); B.box(-4.6, 2.05, 1.5, -3.3, 2.12, 1.9, 13);
    dropMesh(insideMesh); insideMesh = B.upload();
    spareSuit = buildWalker({ x: -3.95, y: 0.05, z: 1.5, yaw: 0, phase: 0, stride: 0, air: false, mesh: spareSuit });
    insideKey = samples;
  }
  function renderInside(cam, w, h) {
    if (insideKey !== cam.inside.samples) buildInside(cam.inside.samples);
    var aspect = w / Math.max(1, h), fovY = FOV;
    if (aspect < 1) fovY = Math.min(100, Math.max(FOV, 2 * Math.atan(Math.tan(37.5 * Math.PI / 180) / aspect) * 180 / Math.PI));
    var eye = [cam.inside.x + (cam.sway || 0) * Math.cos(cam.yaw), 1.62 + (cam.bob || 0), cam.inside.z + (cam.sway || 0) * Math.sin(cam.yaw)];
    var cp = Math.cos(cam.pitch);
    var at = [eye[0] + Math.sin(cam.yaw) * cp, eye[1] + Math.sin(cam.pitch), eye[2] - Math.cos(cam.yaw) * cp];
    var mvp = mul(perspective(fovY, aspect, 0.05, 80), lookAt(eye, at, [0, 1, 0]));
    gl.useProgram(progLand.p);
    var L = progLand.loc;
    gl.uniformMatrix4fv(L.uMVP, false, new Float32Array(mvp));
    gl.uniform3fv(L.uSun, unit([0.3, 1, 0.2]));
    gl.uniform3fv(L.uCam, eye);
    gl.uniform3fv(L.uFog, [0.1, 0.12, 0.13]);
    gl.uniform2f(L.uZone, 1e6, 1e6);
    gl.uniform1f(L.uKind, 4);
    attrib(L.aPos, insideMesh.pos, 3); attrib(L.aNor, insideMesh.nor, 3); attrib(L.aSlope, insideMesh.slope, 1);
    gl.drawArrays(gl.TRIANGLES, 0, insideMesh.count);
    drawMesh(L, spareSuit);
    gl.disableVertexAttribArray(L.aNor); gl.disableVertexAttribArray(L.aSlope);
    canvas.parentNode.style.background = '#0d1416';
    labelBox.style.display = 'none';
  }

  // ---- public ---------------------------------------------------------------------------------
  function init(cv, terr, Tmod, labelLayer) {
    if (gl) return true;
    canvas = cv; terrain = terr; T = Tmod; labelBox = labelLayer;
    try {
      gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }) ||
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
    // The habitat stands next to the base point, on the side where fewer route cells are.
    var base = points.filter(function (p) { return p.base; })[0];
    if (base) {
      var lean = 0;
      routeList.forEach(function (r) { (r.cells || []).forEach(function (c) {
        if (Math.hypot(c.r - base.cell.r, c.c - base.cell.c) < 12) lean += c.c - base.cell.c;
      }); });
      var side = lean > 0 ? -1 : 1, hk = base.cell.r + ':' + base.cell.c + ':' + side;
      if (hk !== habKey) { habKey = hk; buildHabitat(base.cell, side); }
      for (var lx = -10; lx <= 7; lx += 2.5) for (var lz = -6.5; lz <= 6.5; lz += 2.5) {
        var wx = hab.cx + side * lx, wz = hab.cz + lz;
        av[Math.floor(wz / terrain.cellM) + ':' + Math.floor(wx / terrain.cellM)] = 1;
      }
    }
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
    // Premultiplied alpha everywhere: every browser composites it the same way, and the soft edge
    // of the far plain at the horizon blends into the sky without a dark (or white) line.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    if (cam.inside) { renderInside(cam, w, h); return; }
    labelBox.style.display = '';

    var x = (cam.c + 0.5) * terrain.cellM, z = (cam.r + 0.5) * terrain.cellM;
    var foot = cam.footY !== undefined ? cam.footY : elevAt(x, z);              // footY: in the air (free walk)
    var eye = [x + (cam.sway || 0) * Math.cos(cam.yaw), foot + EYE_M + (cam.bob || 0), z + (cam.sway || 0) * Math.sin(cam.yaw)];
    var aspect = w / Math.max(1, h), fovY = FOV, pitch = cam.pitch;
    if (aspect < 1) {                                // phone upright: keep ~58-70 deg across, look lower
      fovY = Math.min(100, Math.max(FOV, 2 * Math.atan(Math.tan(37.5 * Math.PI / 180) / aspect) * 180 / Math.PI));
      pitch -= 0.2;
    }
    var cp = Math.cos(pitch);
    var at = [eye[0] + Math.sin(cam.yaw) * cp, eye[1] + Math.sin(pitch), eye[2] - Math.cos(cam.yaw) * cp];
    var dist = cam.third || 0;
    if (dist > 0.05) {                               // third person: the camera behind and above the astronaut
      var piv = [x, foot + 1.55, z];
      eye = [piv[0] - Math.sin(cam.yaw) * cp * dist, piv[1] - Math.sin(pitch) * dist + 0.25 * Math.min(1, dist / 3), piv[2] + Math.cos(cam.yaw) * cp * dist];
      eye[1] = Math.max(eye[1], elevAt(eye[0], eye[2]) + 0.4);   // never under the ground
      at = [piv[0] + Math.sin(cam.yaw) * cp * 1.2, piv[1] + Math.sin(pitch) * 1.2, piv[2] - Math.cos(cam.yaw) * cp * 1.2];
    }
    var mvp = mul(perspective(fovY, aspect, NEAR, FAR), lookAt(eye, at, [0, 1, 0]));
    var sun = sunDir(cam.hour);

    if (!rockAt || Math.hypot(rockAt[0] - x, rockAt[1] - z) > 45) buildRocks(x, z);

    gl.useProgram(progLand.p);
    var L = progLand.loc;
    gl.uniformMatrix4fv(L.uMVP, false, new Float32Array(mvp));
    gl.uniform3fv(L.uSun, sun);
    gl.uniform3fv(L.uCam, eye);
    gl.uniform3fv(L.uFog, SKY_HORIZON);
    gl.uniform2f(L.uZone, terrain.cols * terrain.cellM, terrain.rows * terrain.cellM);
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
    if (habMesh) drawMesh(L, habMesh);
    if (stationMesh) drawMesh(L, stationMesh);
    if (dist > 0.05 && cam.body) {
      walker = buildWalker({ x: x, y: foot, z: z, yaw: cam.body.yaw, phase: cam.body.phase, stride: cam.body.stride, air: cam.body.air, mesh: walker });
      drawMesh(L, walker);
    }
    // The buddy: EVAs are walked in pairs (the buddy also relays the radio). Same suit, orange bands.
    if (cam.buddy) {
      var bx = (cam.buddy.c + 0.5) * terrain.cellM, bz = (cam.buddy.r + 0.5) * terrain.cellM;
      buddyMesh = buildWalker({ x: bx, y: elevAt(bx, bz), z: bz, yaw: cam.buddy.yaw, phase: cam.buddy.phase, stride: cam.buddy.stride,
        air: false, stripes: true, mesh: buddyMesh });
      drawMesh(L, buddyMesh);
    }
    gl.disableVertexAttribArray(L.aNor); gl.disableVertexAttribArray(L.aSlope);

    gl.useProgram(progFlat.p);
    var F = progFlat.loc;
    gl.uniformMatrix4fv(F.uMVP, false, new Float32Array(mvp));
    gl.uniform3fv(F.uCam, eye);
    gl.uniform3fv(F.uFog, SKY_HORIZON);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -2);
    gl.uniform1f(F.uNear, 10);
    routes.concat(homeRoute ? [homeRoute] : []).forEach(function (m) {
      attrib(F.aPos, m.pos, 3); attrib(F.aCol, m.col, 4);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.uniform1f(F.uNear, 26);                     // a beacon you stand next to fades away (free walk)
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

  root.SeraFpv = { init: init, setScene: setScene, setHome: setHome, render: render, setStations: setStations,
    get habitat() { return hab; }, elevAt: function (x, z) { return elevAt(x, z); },
    get ok() { return !!gl; }, get rockCount() { return rocks ? rocks.count / 60 : 0; } };
})(window);
