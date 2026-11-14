// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// relief.js: grey shaded relief of the terrain grid (sun from the north-west, 45 degrees up)
// with the slope classes on top. Used by the project site and the helmet HUD.

(function (root) {
  'use strict';

  function build(terrain, T) {
    var rows = terrain.rows, cols = terrain.cols, e = terrain.elev, d = terrain.cellM;
    var off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    var g = off.getContext('2d');
    var img = g.createImageData(cols, rows);
    var az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180;
    var lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
    var exag = 2;
    function z(r, c) {
      r = r < 0 ? 0 : (r >= rows ? rows - 1 : r);
      c = c < 0 ? 0 : (c >= cols ? cols - 1 : c);
      return e[r * cols + c];
    }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dzdx = (z(r, c + 1) - z(r, c - 1)) / (2 * d) * exag;     // east
        var dzdy = (z(r - 1, c) - z(r + 1, c)) / (2 * d) * exag;     // north
        var nlen = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        var shade = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / nlen);
        var v = 38 + 190 * shade;
        var i = r * cols + c, p = i * 4, s = terrain.slopeDeg[i];
        var R0 = v, G0 = v * 0.97, B0 = v * 0.93;   // close to the grey of HiRISE images
        if (s > T.SLOPE_BLOCK_DEG) { R0 = R0 * 0.55 + 239 * 0.45; G0 = G0 * 0.55 + 100 * 0.45; B0 = B0 * 0.55 + 100 * 0.45; }
        else if (s >= T.SLOPE_CAUTION_DEG) { R0 = R0 * 0.7 + 240 * 0.3; G0 = G0 * 0.7 + 188 * 0.3; B0 = B0 * 0.7 + 84 * 0.3; }
        img.data[p] = R0; img.data[p + 1] = G0; img.data[p + 2] = B0; img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return off;
  }

  root.SeraRelief = { build: build };
})(window);
