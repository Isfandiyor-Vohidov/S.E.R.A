// SARA — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// risk.js: GO / CAUTION / NO-GO verdict from the worst factor, always with a reason.
// Pure functions, no DOM: can be tested in node.

(function (root) {
  'use strict';

  var GO = 0, CAUTION = 1, NOGO = 2;
  var NAMES = ['GO', 'CAUTION', 'NO-GO'];

  // Thresholds. All are MODEL choices of the team, not NASA flight rules.
  var MIN_MARGIN_S = 30 * 60;        // less spare suit time than this -> CAUTION
  var SUNSET_BUFFER_H = 1;           // back home later than 1 Mars hour before sunset -> CAUTION
  var SEP_NOGO_HOURS = 48;           // solar energetic particle event in the last 48 h -> NO-GO
  var XFLARE_CAUTION_HOURS = 24;     // X-class flare in the last 24 h -> CAUTION
  var DOSE_MSV_PER_SOL = 0.67;       // surface dose rate, Curiosity RAD (Hassler et al. 2014)
  var SOL_S = 88775.244;
  var MARS_HOUR_S = SOL_S / 24;

  function hhmm(h) {
    var total = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
    var hh = Math.floor(total / 60), mm = total % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function mins(s) { return Math.round(s / 60) + ' min'; }

  // input = {
  //   budget:      result of SeraPlanner.evaluate (totalS, usableS, marginS, fits)
  //   reachable:   false if some point has no safe path
  //   cautionM:    metres of the route on 15-25 deg slopes
  //   routeM:      total route length in metres
  //   startLtst:   EVA start, local true solar time in hours
  //   sunriseLtst, sunsetLtst: hours
  //   ls:          solar longitude in degrees
  //   dustSeason:  boolean
  //   space: { sepHoursAgo, xFlareHoursAgo, flaresChecked, simulated, source, asOf }  (null hours = none)
  // }
  function assess(input) {
    var f = [];
    var b = input.budget;

    // 1. Route and slopes
    if (!input.reachable) {
      f.push({ id: 'slopes', level: NOGO, tag: 'DATA', label: 'Slopes',
        text: 'a science point has no safe path (slopes over 25°)' });
    } else if (input.cautionM > 0) {
      f.push({ id: 'slopes', level: CAUTION, tag: 'DATA', label: 'Slopes',
        text: Math.round(input.cautionM) + ' m of the route is on 15–25° slopes' });
    } else {
      f.push({ id: 'slopes', level: GO, tag: 'DATA', label: 'Slopes', text: 'whole route under 15°' });
    }

    // 2. Suit time (air)
    if (!b.fits) {
      f.push({ id: 'suit', level: NOGO, tag: 'MODEL', label: 'Suit time',
        text: 'plan is ' + mins(-b.marginS) + ' longer than the suit limit with reserve' });
    } else if (b.marginS < MIN_MARGIN_S) {
      f.push({ id: 'suit', level: CAUTION, tag: 'MODEL', label: 'Suit time',
        text: 'only ' + mins(b.marginS) + ' of spare suit time' });
    } else {
      f.push({ id: 'suit', level: GO, tag: 'MODEL', label: 'Suit time',
        text: mins(b.marginS) + ' spare before the reserve' });
    }

    // 3. Daylight
    var endLtst = input.startLtst + b.totalS / MARS_HOUR_S;
    if (input.startLtst < input.sunriseLtst) {
      f.push({ id: 'daylight', level: NOGO, tag: 'MODEL', label: 'Daylight',
        text: 'start at ' + hhmm(input.startLtst) + ' is before sunrise (' + hhmm(input.sunriseLtst) + ')' });
    } else if (endLtst > input.sunsetLtst) {
      f.push({ id: 'daylight', level: NOGO, tag: 'MODEL', label: 'Daylight',
        text: 'back home at ' + hhmm(endLtst) + ', after sunset (' + hhmm(input.sunsetLtst) + ')' });
    } else if (endLtst > input.sunsetLtst - SUNSET_BUFFER_H) {
      f.push({ id: 'daylight', level: CAUTION, tag: 'MODEL', label: 'Daylight',
        text: 'back home at ' + hhmm(endLtst) + ', less than 1 h before sunset (' + hhmm(input.sunsetLtst) + ')' });
    } else {
      f.push({ id: 'daylight', level: GO, tag: 'MODEL', label: 'Daylight',
        text: 'back home at ' + hhmm(endLtst) + ', sunset at ' + hhmm(input.sunsetLtst) });
    }

    // 4. Space weather
    var sw = input.space || {};
    var sim = sw.simulated ? ' (simulated)' : '';
    if (sw.sepHoursAgo !== null && sw.sepHoursAgo !== undefined && sw.sepHoursAgo <= SEP_NOGO_HOURS) {
      f.push({ id: 'space', level: NOGO, tag: sw.simulated ? 'MODEL' : 'DATA', label: 'Space weather',
        text: 'solar particle event ' + Math.round(sw.sepHoursAgo) + ' h ago' + sim });
    } else if (sw.xFlareHoursAgo !== null && sw.xFlareHoursAgo !== undefined && sw.xFlareHoursAgo <= XFLARE_CAUTION_HOURS) {
      f.push({ id: 'space', level: CAUTION, tag: 'DATA', label: 'Space weather',
        text: 'X-class solar flare ' + Math.round(sw.xFlareHoursAgo) + ' h ago' });
    } else if (sw.source) {
      f.push({ id: 'space', level: GO, tag: 'DATA', label: 'Space weather',
        text: 'no particle events in 48 h' + (sw.flaresChecked ? ', no X flares in 24 h' : '') + ' (' + sw.source + ')' });
    } else {
      f.push({ id: 'space', level: CAUTION, tag: 'DATA', label: 'Space weather',
        text: 'no live data: check before going out' });
    }

    // 5. Radiation dose for this EVA (information; particle events are handled above)
    var doseMsv = DOSE_MSV_PER_SOL * b.totalS / SOL_S;
    f.push({ id: 'dose', level: GO, tag: 'MODEL', label: 'Radiation',
      text: 'about ' + doseMsv.toFixed(2) + ' mSv for this EVA at ' + DOSE_MSV_PER_SOL + ' mSv per sol' });

    // 6. Dust season (information)
    if (input.dustSeason) {
      f.push({ id: 'dust', level: GO, tag: 'MODEL', label: 'Dust season',
        text: 'Ls ' + input.ls.toFixed(0) + '°: higher chance of dust storms' });
    }

    // Verdict = worst factor; the first worst factor gives the reason.
    var level = GO, reason = null;
    for (var i = 0; i < f.length; i++) {
      if (f[i].level > level) { level = f[i].level; reason = f[i]; }
    }
    return {
      level: level,
      verdict: NAMES[level],
      reason: reason ? reason.label + ': ' + reason.text : 'All checks passed',
      factors: f,
      endLtst: endLtst,
      doseMsv: doseMsv
    };
  }

  var api = {
    GO: GO, CAUTION: CAUTION, NOGO: NOGO, NAMES: NAMES,
    MIN_MARGIN_S: MIN_MARGIN_S,
    SUNSET_BUFFER_H: SUNSET_BUFFER_H,
    SEP_NOGO_HOURS: SEP_NOGO_HOURS,
    XFLARE_CAUTION_HOURS: XFLARE_CAUTION_HOURS,
    DOSE_MSV_PER_SOL: DOSE_MSV_PER_SOL,
    assess: assess
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SeraRisk = api;
})(typeof window !== 'undefined' ? window : globalThis);
