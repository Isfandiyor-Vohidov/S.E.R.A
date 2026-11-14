// S.E.R.A — Safe Exploration & Returning Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// terrain.js: elevation grid, slopes and lat/lon <-> cell conversion.
// Pure functions, no DOM: can be tested in node.

(function (root) {
  'use strict';

  function decodeBase64(b64) {
    if (typeof atob === 'function') {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  // Builds a terrain object from the raw data file (window.SERA_TERRAIN).
  function createTerrain(raw) {
    var rows = raw.rows, cols = raw.cols, n = rows * cols;
    var bytes = decodeBase64(raw.data);
    var elev = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      elev[i] = (bytes[2 * i] | (bytes[2 * i + 1] << 8)) * raw.scale + raw.minElevM;
    }

    var t = {
      rows: rows,
      cols: cols,
      cellM: raw.cellM,
      north: raw.north,
      west: raw.west,
      cellDeg: raw.cellDeg,
      south: raw.north - rows * raw.cellDeg,
      east: raw.west + cols * raw.cellDeg,
      minElevM: raw.minElevM,
      maxElevM: raw.maxElevM,
      source: raw.source,
      elev: elev,
      slopeDeg: null
    };
    t.slopeDeg = computeSlopes(t);
    return t;
  }

  // Steepest slope of each cell in degrees (Horn 3x3 method, edges clamped).
  function computeSlopes(t) {
    var rows = t.rows, cols = t.cols, e = t.elev, d = t.cellM;
    var out = new Float32Array(rows * cols);
    function z(r, c) {
      if (r < 0) r = 0; else if (r >= rows) r = rows - 1;
      if (c < 0) c = 0; else if (c >= cols) c = cols - 1;
      return e[r * cols + c];
    }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dzdx = ((z(r - 1, c + 1) + 2 * z(r, c + 1) + z(r + 1, c + 1)) -
                    (z(r - 1, c - 1) + 2 * z(r, c - 1) + z(r + 1, c - 1))) / (8 * d);
        var dzdy = ((z(r + 1, c - 1) + 2 * z(r + 1, c) + z(r + 1, c + 1)) -
                    (z(r - 1, c - 1) + 2 * z(r - 1, c) + z(r - 1, c + 1))) / (8 * d);
        out[r * cols + c] = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180 / Math.PI;
      }
    }
    return out;
  }

  function inBounds(t, r, c) {
    return r >= 0 && c >= 0 && r < t.rows && c < t.cols;
  }

  // lat/lon -> {r, c} cell (row 0 is the northern edge), or null outside the zone.
  function latLonToCell(t, lat, lon) {
    var r = Math.floor((t.north - lat) / t.cellDeg);
    var c = Math.floor((lon - t.west) / t.cellDeg);
    return inBounds(t, r, c) ? { r: r, c: c } : null;
  }

  // Centre of a cell -> {lat, lon}.
  function cellToLatLon(t, r, c) {
    return {
      lat: t.north - (r + 0.5) * t.cellDeg,
      lon: t.west + (c + 0.5) * t.cellDeg
    };
  }

  function elevationAt(t, lat, lon) {
    var cell = latLonToCell(t, lat, lon);
    return cell ? t.elev[cell.r * t.cols + cell.c] : null;
  }

  function slopeAt(t, lat, lon) {
    var cell = latLonToCell(t, lat, lon);
    return cell ? t.slopeDeg[cell.r * t.cols + cell.c] : null;
  }

  // Share of cells in each slope class (for the legend and for validation).
  function slopeStats(t, cautionDeg, blockDeg) {
    var s = t.slopeDeg, safe = 0, caution = 0, blocked = 0, max = 0;
    for (var i = 0; i < s.length; i++) {
      if (s[i] > blockDeg) blocked++; else if (s[i] >= cautionDeg) caution++; else safe++;
      if (s[i] > max) max = s[i];
    }
    return { safe: safe / s.length, caution: caution / s.length, blocked: blocked / s.length, maxDeg: max };
  }

  var api = {
    SLOPE_CAUTION_DEG: 15, // 15-25 deg: caution (MODEL, from rover limits and Apollo experience)
    SLOPE_BLOCK_DEG: 25,   // > 25 deg: no-go
    createTerrain: createTerrain,
    computeSlopes: computeSlopes,
    latLonToCell: latLonToCell,
    cellToLatLon: cellToLatLon,
    elevationAt: elevationAt,
    slopeAt: slopeAt,
    slopeStats: slopeStats
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SeraTerrain = api;
})(typeof window !== 'undefined' ? window : globalThis);
