// SARA — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// marstime.js: Mars clock and Sun position (Mars24 algorithm).
// Source: Allison & McEwen 2000, as published by NASA GISS Mars24
// (https://www.giss.nasa.gov/tools/mars24/help/algorithm.html).
// Pure functions, no DOM: can be tested in node.

(function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  var TT_MINUS_UTC_S = 69.184;          // 37 leap seconds + 32.184 s (valid since 2017)
  var SOL_IN_DAYS = 1.0274912517;       // one Mars solar day in Earth days
  var SOL_S = SOL_IN_DAYS * 86400;      // 88775.244 s
  var MARS_HOUR_S = SOL_S / 24;         // 3698.97 s
  var MSL_SOL0_MSD = 49269;             // Mars Sol Date of Curiosity's landing sol (sol 0)

  function mod(a, n) { return ((a % n) + n) % n; }

  // Core Mars24 quantities for a UTC time in milliseconds.
  function marsClock(utcMs, ttMinusUtcS) {
    var tt = (ttMinusUtcS === undefined) ? TT_MINUS_UTC_S : ttMinusUtcS;
    var jdUt = 2440587.5 + utcMs / 86400000;
    var jdTt = jdUt + tt / 86400;
    var dt = jdTt - 2451545.0;                                   // days since J2000 (TT)

    var M = 19.3871 + 0.52402073 * dt;                           // mean anomaly, deg
    var aFms = 270.3871 + 0.524038496 * dt;                      // fictitious mean Sun, deg

    var A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
    var tau = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
    var phi = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
    var pbs = 0;
    for (var i = 0; i < 7; i++) pbs += A[i] * Math.cos((0.985626 * dt / tau[i] + phi[i]) * DEG);

    var m = M * DEG;
    var nuMinusM = (10.691 + 3.0e-7 * dt) * Math.sin(m) + 0.623 * Math.sin(2 * m) +
      0.050 * Math.sin(3 * m) + 0.005 * Math.sin(4 * m) + 0.0005 * Math.sin(5 * m) + pbs;

    var ls = mod(aFms + nuMinusM, 360);                          // areocentric solar longitude
    var l = ls * DEG;
    var eotDeg = 2.861 * Math.sin(2 * l) - 0.071 * Math.sin(4 * l) + 0.002 * Math.sin(6 * l) - nuMinusM;

    var msd = (jdTt - 2405522.0028779) / SOL_IN_DAYS;            // Mars Sol Date
    var mtc = mod(24 * ((jdTt - 2451549.5) / SOL_IN_DAYS + 44796.0 - 0.0009626), 24);

    var declDeg = Math.asin(0.42565 * Math.sin(l)) / DEG + 0.25 * Math.sin(l);
    var distAu = 1.52367934 * (1.00436 - 0.09309 * Math.cos(m) - 0.004336 * Math.cos(2 * m) -
      0.00031 * Math.cos(3 * m) - 0.00003 * Math.cos(4 * m));

    return {
      dtJ2000: dt, meanAnomalyDeg: mod(M, 360), nuMinusMDeg: nuMinusM, pbsDeg: pbs,
      ls: ls, eotDeg: eotDeg, eotHours: eotDeg / 15,
      msd: msd, mtc: mtc, declDeg: declDeg, sunDistAu: distAu
    };
  }

  // Local clock at a place (east longitude, planetocentric latitude in degrees).
  function localTime(utcMs, lonE, lat, ttMinusUtcS) {
    var c = marsClock(utcMs, ttMinusUtcS);
    var lmst = mod(c.mtc + lonE / 15, 24);          // local mean solar time, hours
    var ltst = mod(lmst + c.eotHours, 24);          // local true solar time, hours

    // Sunrise and sunset (geometric, flat horizon), in local true solar time.
    var cosH = -Math.tan(lat * DEG) * Math.tan(c.declDeg * DEG);
    cosH = Math.max(-1, Math.min(1, cosH));
    var halfDayH = Math.acos(cosH) / DEG / 15;
    var sunrise = 12 - halfDayH, sunset = 12 + halfDayH;

    // Sun elevation above the horizon now.
    var hourAngle = (ltst - 12) * 15 * DEG;
    var sinEl = Math.sin(lat * DEG) * Math.sin(c.declDeg * DEG) +
      Math.cos(lat * DEG) * Math.cos(c.declDeg * DEG) * Math.cos(hourAngle);

    c.lmst = lmst;
    c.ltst = ltst;
    c.sunriseLtst = sunrise;
    c.sunsetLtst = sunset;
    c.daylightHours = 2 * halfDayH;
    c.sunElevationDeg = Math.asin(sinEl) / DEG;
    c.isDay = ltst > sunrise && ltst < sunset;
    c.hoursToSunset = c.isDay ? sunset - ltst : 0;   // Mars hours
    c.mslSol = Math.floor(c.msd + lonE / 360) - MSL_SOL0_MSD;  // Curiosity mission sol
    return c;
  }

  // Dust storm season on Mars (higher risk of regional and global storms).
  function isDustSeason(ls) { return ls >= 180 && ls <= 330; }

  // 13.5 -> "13:30"
  function formatHours(h) {
    var total = Math.round(mod(h, 24) * 60);
    if (total === 1440) total = 0;
    var hh = Math.floor(total / 60), mm = total % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  var api = {
    TT_MINUS_UTC_S: TT_MINUS_UTC_S,
    SOL_S: SOL_S,
    MARS_HOUR_S: MARS_HOUR_S,
    marsClock: marsClock,
    localTime: localTime,
    isDustSeason: isDustSeason,
    formatHours: formatHours
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SeraMarsTime = api;
})(typeof window !== 'undefined' ? window : globalThis);
