#!/usr/bin/env node
// Add OpenSim's force–length factors to data/opensim/hip-muscles.json.
//
//   node tools/hip-force.mjs rajagopal2016-leg.json rajagopal2016-leg.json data/opensim/hip-muscles.json
//
// The inputs are tools/opensim_export.py runs (grids "hip-adduction" and
// "hip-adduction-knee90"). Published data uses the Rajagopal2016.osim run for both (the 2023 file also
// changes the abductors' fibre and tendon lengths, possibly Lai et al.'s, licence not stated). As in
// tools/osim-hip.mjs, the gluteus medius, minimus and TFL come from the second (Uhlrich et al.'s
// paths), every other muscle from the first. Per muscle and posture it stores the active fibre
// force along the tendon at full activation ÷ the max isometric force (`active`), on a hip
// flexion × hip adduction grid, knee straight and knee bent 90°. OpenSim clamps hip adduction at
// its range (−50°), so columns beyond are dropped.

import fs from "node:fs";

const [baseFile, abdFile, target] = process.argv.slice(2);
if (!target) { console.error("usage: node tools/hip-force.mjs base-export.json abductor-export.json hip-muscles.json"); process.exit(1); }
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile), abd = read(abdFile), geo = read(target);
const ABD = new Set(["glmed1", "glmed2", "glmed3", "glmin1", "glmin2", "glmin3", "tfl"]);

const grid = (exp, name) => exp.grids.find((g) => g.name === name) ?? (() => { throw new Error(`${name} missing`); })();
const g0 = grid(base, "hip-adduction");
const keep = g0.columns.degrees.map((d, j) => (d >= -50 ? j : -1)).filter((j) => j >= 0);
geo.forceGrid = {
  flexion: g0.rows.degrees,
  adduction: keep.map((j) => g0.columns.degrees[j]),
  note: "active = active fibre force along the tendon at full activation ÷ max isometric force (OpenSim Millard muscle, fibre–tendon equilibrium, zero velocity), [flexion][adduction]; knee0 / knee90 = knee straight / bent 90°.",
  opensim: base.opensimVersion,
};
for (const m of geo.muscles) {
  const exp = ABD.has(m.id) ? abd : base;
  const fmax = exp.muscles[`${m.id}_r`].maxIsometricForce;
  const table = (name) => grid(exp, name).muscles[`${m.id}_r`].activeForce.map((row) => keep.map((j) => +(row[j] / fmax).toFixed(3)));
  m.active = { knee0: table("hip-adduction"), knee90: table("hip-adduction-knee90") };
}
fs.writeFileSync(target, JSON.stringify(geo, null, 1) + "\n");
console.log(`added force–length factors for ${geo.muscles.length} muscles (${geo.forceGrid.flexion.length} × ${geo.forceGrid.adduction.length} grid)`);
