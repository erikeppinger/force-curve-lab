// Muscle weights from the Rajagopal et al. 2016 leg model (MIT licence) for muscle `weight`
// tables without a measured source: the plank's hip flexors (used), the leg curl's gastrocnemius
// and the calf raise's triceps surae (checks only: they disagree with measured EMG, see
// docs/model-limits.md, OpenSim cross-check: the other leg exercises).
//
//   node tools/rajagopal-shares.mjs raj2016-leg.json raj2016-ankle.json
//
// The inputs are tools/opensim_export.py's grids (hip x knee at ankle 0; knee x ankle at hip 0,
// the second one in 5° ankle steps). Each muscle's capacity about a joint = its moment arm x its
// active force at full activation (no passive force). Shared for the least summed squared
// activation, a muscle's activation divided by the joint's effort (load ÷ summed capacity) is
// C_i · ΣC ÷ ΣC², the app's `weight`. A group (the two gastrocnemius heads, the hamstrings) is the
// capacity-weighted mean of its members. Muscles that don't cross the hip (the gastrocnemius) are
// read at hip 0; those that don't cross the ankle (the hamstrings) at ankle 0: the grids hold
// everything else fixed, so the two combine exactly.
import { readFileSync } from "node:fs";

const [legFile, ankleFile] = process.argv.slice(2);
const leg = JSON.parse(readFileSync(legFile)), ank = JSON.parse(readFileSync(ankleFile));
const grid = (d, name) => Object.values(d.grids).find((g) => g.name === name);
const HK = grid(leg, "hip-knee"), KA = grid(ank, "knee-ankle");

/** Bilinear interpolation of table[row][col] at (r, c) on the grid's degrees (held at the edges). */
function at(g, table, r, c) {
  const idx = (deg, x) => { const k = Math.max(0, Math.min(deg.length - 2, deg.findIndex((d, i) => x <= deg[i + 1]) === -1 ? deg.length - 2 : deg.findIndex((d, i) => x <= deg[i + 1]))); const u = Math.max(0, Math.min(1, (x - deg[k]) / (deg[k + 1] - deg[k]))); return [k, u]; };
  const [i, u] = idx(g.rows.degrees, r), [j, v] = idx(g.columns.degrees, c);
  return (1 - u) * (1 - v) * table[i][j] + u * (1 - v) * table[i + 1][j] + (1 - u) * v * table[i][j + 1] + u * v * table[i + 1][j + 1];
}
/** Capacity (N·m) of muscle n about `coord` on grid g at (r, c), signed by `sign` (+1: the positive direction). */
function cap(g, n, coord, r, c, sign) {
  const m = g.muscles[n];
  if (!m?.momentArm?.[coord]) return 0;
  const arm = at(g, m.momentArm[coord], r, c) * sign;
  return arm > 0 ? arm * at(g, m.activeForce, r, c) : 0;
}
/** Weights (activation ÷ joint effort) of the groups, from a { muscle: capacity } map. */
function weights(caps, groups) {
  const C = Object.values(caps), S = C.reduce((a, b) => a + b, 0), S2 = C.reduce((a, b) => a + b * b, 0);
  return Object.fromEntries(Object.entries(groups).map(([g, ms]) => {
    const c = ms.map((m) => caps[m] ?? 0), sc = c.reduce((a, b) => a + b, 0);
    return [g, sc > 0 ? (S / S2) * c.reduce((a, b) => a + b * b, 0) / sc : 0];
  }));
}
const r2 = (x) => Math.round(x * 100) / 100;

// Leg curl: knee flexors (OpenSim's knee angle is positive in flexion; flexors pull it positive).
const KNEE_FLEXORS = ["bflh_r", "bfsh_r", "semimem_r", "semiten_r", "grac_r", "sart_r", "gasmed_r", "gaslat_r", "tfl_r"];
const legCurl = (hip, ankle) => [0, 20, 40, 60, 80, 100, 120].map((k) => {
  const caps = Object.fromEntries(KNEE_FLEXORS.map((n) => [n, n.startsWith("gas") ? cap(KA, n, "knee", k, ankle, 1) : cap(HK, n, "knee", hip, k, 1)]));
  const w = weights(caps, { gastrocnemius: ["gasmed_r", "gaslat_r"], hamstrings: ["bflh_r", "bfsh_r", "semimem_r", "semiten_r"] });
  return { knee: k, gastrocnemius: r2(w.gastrocnemius), hamstrings: r2(w.hamstrings) };
});
// Foot: toes up = ankle +20 (dorsiflexed), relaxed = -5, pointed = -30 (OpenSim: positive = dorsiflexion).
for (const [variant, hip] of [["lying / standing", 0], ["seated", 90]])
  for (const [foot, ankle] of [["up", 20], ["relaxed", -5], ["pointed", -30]])
    console.log(`leg curl, ${variant}, toes ${foot}:`, JSON.stringify(legCurl(hip, ankle)));

// Calf raise: plantarflexors at the app's ankle angle θ (plantarflexion positive) = OpenSim -θ.
const PF = ["gasmed_r", "gaslat_r", "soleus_r", "tibpost_r", "perlong_r", "perbrev_r", "fdl_r", "fhl_r"];
const calf = (knee) => [-20, -10, 0, 10, 20, 30, 40].map((th) => {
  const caps = Object.fromEntries(PF.map((n) => [n, cap(KA, n, "ankle", knee, -th, -1)]));
  const w = weights(caps, { "gastroc-medial": ["gasmed_r"], "gastroc-lateral": ["gaslat_r"], soleus: ["soleus_r"] });
  return { ankle: th, ...Object.fromEntries(Object.entries(w).map(([k, v]) => [k, r2(v)])) };
});
console.log("calf raise, knee straight:", JSON.stringify(calf(0)));
console.log("calf raise, knee 90° (seated):", JSON.stringify(calf(90)));

// Plank: hip flexors with the hip and knee straight (the body held in line).
const HF = ["iliacus_r", "psoas_r", "recfem_r", "sart_r", "tfl_r", "addlong_r", "addbrev_r", "grac_r", "glmin1_r", "glmed1_r"];
const capsHF = Object.fromEntries(HF.map((n) => [n, cap(HK, n, "hip_flexion", 0, 0, 1)]));
const wHF = weights(capsHF, { iliopsoas: ["iliacus_r", "psoas_r"], "rectus-femoris": ["recfem_r"] });
console.log("plank, hip and knee straight:", JSON.stringify(Object.fromEntries(Object.entries(wHF).map(([k, v]) => [k, r2(v)]))),
  "capacities (N·m):", JSON.stringify(Object.fromEntries(Object.entries(capsHF).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v)]))));
