#!/usr/bin/env node
// Cross-check the app's leg data against an OpenSim export (tools/opensim_export.py, grids
// hip-knee and knee-ankle):
//   node tools/opensim-check.mjs export.json
// Prints, for the single-joint leg exercises and the multi-joint lifts' two-joint corrections:
// - strength-curve shapes: the app's curve vs the model's Σ (force at full activation × moment
//   arm) in the curve's test posture, both relative to their peak;
// - two-joint corrections: the app's factor vs the model's ratio to the base curve's posture;
// - muscle weights: the model's activation ÷ effort per muscle group in static optimisation
//   (min Σ a², one coordinate): F_j r_j Σ(F r) / Σ(F r)², group = max-force-weighted mean.
// Angles: the app's knee and hip angles = OpenSim's (flexion +); app plantarflexion = −OpenSim ankle.
// Nothing here changes the app; the results are written up in docs/model-limits.md.

import fs from "node:fs";

const file = process.argv[2];
if (!file) { console.error("usage: node tools/opensim-check.mjs export.json"); process.exit(1); }
const o = JSON.parse(fs.readFileSync(file, "utf8"));
const ex = (id) => JSON.parse(fs.readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url), "utf8"));
const G = Object.fromEntries(o.grids.map((g) => [g.name, g]));
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]); }
  return pts.at(-1)[1];
};
const cell = (xs, x) => { let i = 0; while (i < xs.length - 2 && x > xs[i + 1]) i++; return [i, Math.min(1, Math.max(0, (x - xs[i]) / (xs[i + 1] - xs[i])))]; };

/** Per muscle at a grid posture (bilinear): force at full activation × moment arm in direction `sign`. */
function fr(grid, r, c, coord, sign) {
  const g = G[grid];
  const [i, u] = cell(g.rows.degrees, r), [j, w] = cell(g.columns.degrees, c);
  const bil = (t) => (1 - u) * ((1 - w) * t[i][j] + w * t[i][j + 1]) + u * ((1 - w) * t[i + 1][j] + w * t[i + 1][j + 1]);
  return Object.entries(g.muscles).map(([name, m]) => {
    const arm = m.momentArm[coord] ? bil(m.momentArm[coord]) : 0;
    return [name, Math.max(0, sign * arm) * bil(m.activeForce)];
  });
}
const cap = (...a) => fr(...a).reduce((s, [, x]) => s + x, 0);

function weights(grid, r, c, coord, sign, groups) {
  const list = fr(grid, r, c, coord, sign);
  const s1 = list.reduce((s, [, x]) => s + x, 0), s2 = list.reduce((s, [, x]) => s + x * x, 0);
  const fmax = (n) => o.muscles[n].maxIsometricForce;
  return Object.entries(groups).map(([k, re]) => {
    const ms = list.filter(([n]) => re.test(n));
    const v = ms.reduce((s, [n, x]) => s + fmax(n) * ((x * s1) / s2), 0) / ms.reduce((s, [n]) => s + fmax(n), 0);
    return `${k} ${v.toFixed(2)}`;
  }).join(", ");
}

const f2 = (x) => x.toFixed(2).padStart(6);
function curve(title, xs, app, modelAt) {
  const m = xs.map(modelAt), a = xs.map((x) => interp(app, x));
  const mp = Math.max(...m), ap = Math.max(...a);
  console.log(`\n${title}`);
  console.log("angle " + xs.map((x) => String(x).padStart(6)).join(""));
  console.log("app   " + a.map((v) => f2(v / ap)).join(""));
  console.log("model " + m.map((v) => f2(v / mp)).join(""));
}

console.log(`OpenSim check: ${o.modelFile} (OpenSim ${o.opensimVersion ?? "?"}), exported ${o.generated}`);
console.log("\n== Strength-curve shapes (relative to each peak) ==");
curve("Knee extension vs knee flexion, hip 80° (leg extension; Anderson et al., seated)", [0, 15, 30, 45, 60, 75, 90, 103], ex("leg-extension").strengthCurve.points, (k) => cap("hip-knee", 80, k, "knee", -1));
curve("Knee flexion vs knee flexion, hip 70° (leg curl; Anderson et al., seated)", [0, 15, 30, 45, 60, 75, 90, 103, 120], ex("leg-curl").strengthCurve.points, (k) => cap("hip-knee", 70, k, "knee", 1));
curve("Hip extension vs hip flexion, knee 15° (kickback, lifts; Anderson et al., standing)", [-20, 0, 25, 50, 74, 90, 120], ex("glute-kickback").strengthCurve.points, (h) => cap("hip-knee", h, 15, "hip_flexion", -1));
curve("Plantarflexion vs plantarflexion, knee 50° (calf raise, lifts; Anderson et al.)", [-28, -20, -10, 0, 10, 20, 30], ex("calf-raise").strengthCurve.points, (p) => cap("knee-ankle", 50, -p, "ankle", -1));

console.log("\n== Two-joint corrections (factor vs the base curve's test posture) ==");
const js = ex("squat").jointScale;
const row = (label, xs, app, model) => console.log(`${label}\n  ${xs.map((x) => `${x}: app ${app(x).toFixed(2)} model ${model(x).toFixed(2)}`).join(" | ")}`);
row("Knee flexion by hip flexion, knee 45° (Guex et al.; lifts and leg curl variants)", [0, 30, 60, 90], (h) => interp(js.knee.points, h), (h) => cap("hip-knee", h, 45, "knee", 1) / cap("hip-knee", 70, 45, "knee", 1));
row("Hip extension by knee flexion, hip 50° (Yamamoto et al.)", [0, 15, 30, 60, 90, 120], (k) => interp(js.hip.points, k), (k) => cap("hip-knee", 50, k, "hip_flexion", -1) / cap("hip-knee", 50, 15, "hip_flexion", -1));
row("Plantarflexion by knee flexion, foot flat (Cresswell et al.)", [0, 30, 60, 90, 120], (k) => interp(js.ankle.points, k), (k) => cap("knee-ankle", k, 0, "ankle", -1) / cap("knee-ankle", 50, 0, "ankle", -1));
const crs = ex("calf-raise").variants.find((v) => v.id === "single-leg").strengthScale.points;
row("Calf raise, knee straight vs the base curve's knee 50°, by plantarflexion (Chen & Franklin)", [-28, 0, 20, 30], (p) => interp(crs, p), (p) => cap("knee-ankle", 0, -p, "ankle", -1) / cap("knee-ankle", 50, -p, "ankle", -1));
row("Knee extension by hip flexion, knee 60° (no correction in the app: rectus femoris)", [0, 30, 60, 90], () => 1, (h) => cap("hip-knee", h, 60, "knee", -1) / cap("hip-knee", 80, 60, "knee", -1));

console.log("\n== Muscle weights: model activation ÷ effort (app weights for comparison) ==");
const W = (id) => Object.fromEntries(ex(id).muscles.map((m) => [m.id, m.weight]));
const le = W("leg-extension");
for (const k of [90, 60, 30, 0]) console.log(`Leg extension (hip 80°) knee ${k}: ${weights("hip-knee", 80, k, "knee", -1, { vasti: /^vas/, rectus: /^recfem/ })}   app vasti ${interp(le.vasti, k).toFixed(2)}, rectus ${interp(le["rectus-femoris"], k).toFixed(2)}`);
const lc = W("leg-curl");
for (const k of [0, 45, 90, 120]) console.log(`Leg curl knee ${k}: seated (hip 90°) ${weights("hip-knee", 90, k, "knee", 1, { hamstrings: /^(semi|bf)/, gastroc: /^gas/ })} | lying (hip 0°) ${weights("hip-knee", 0, k, "knee", 1, { hamstrings: /^(semi|bf)/, gastroc: /^gas/ })}   app hamstrings ${interp(lc.hamstrings, k).toFixed(2)}, gastroc ${interp(lc.gastrocnemius, k).toFixed(2)}`);
const cr = W("calf-raise");
for (const p of [-20, 0, 20, 30]) console.log(`Calf raise ${p}°: knee straight ${weights("knee-ankle", 0, -p, "ankle", -1, { gastroc: /^gas/, soleus: /^soleus/ })} | knee 90° ${weights("knee-ankle", 90, -p, "ankle", -1, { gastroc: /^gas/, soleus: /^soleus/ })}   app gastroc ${interp(cr.gastrocnemius, p).toFixed(2)} (seated × 0.65), soleus ${interp(cr.soleus, p).toFixed(2)}`);
const gk = W("glute-kickback");
const hipG = { glmax: /^glmax/, hamstrings: /^(semi|bflh)/, addmag: /^addmag/ };
for (const h of [-20, 0, 45, 90]) console.log(`Kickback hip ${h}°: knee 10° ${weights("hip-knee", h, 10, "hip_flexion", -1, hipG)} | knee 90° ${weights("hip-knee", h, 90, "hip_flexion", -1, hipG)}   app glmax ${interp(gk["gluteus-maximus"], h).toFixed(2)}, hamstrings ${interp(gk.hamstrings, h).toFixed(2)}, addmag ${interp(gk["adductor-magnus"], h).toFixed(2)}`);
