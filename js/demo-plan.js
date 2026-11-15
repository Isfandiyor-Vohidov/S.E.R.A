// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// demo-plan.js: the demo EVA used by the site and the planner.
// Base: where Curiosity parked on sols ~4650-4800 (MSL_waypoints.json). Points: picked on safe terrain.

window.SERA_DEMO = {
  base: [-4.8080, 137.3810],
  // the 4th point is behind a 15-25 deg slope: the demo shows CAUTION and Mission Twin finds the gentle way round
  stops: [[-4.8150, 137.3820], [-4.8000, 137.3840], [-4.8110, 137.3835], [-4.8062, 137.3892]],
  startLtst: '09:00'
};
