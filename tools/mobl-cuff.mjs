// Rotator-cuff shares from the MoBL-ARMS shoulder model (Saul et al. 2015, as updated by McFarland
// et al. 2019; Creative Commons NON-COMMERCIAL licence) for the presses, pulls and rows.
//
//   node tools/mobl-cuff.mjs mobl-shoulder.json [exercise ...]
//
// The input is tools/opensim_shoulder_export.py's grid. Through each variant's movement (the app's
// 3D solver, its default load) the right arm's posture is matched on the grid: the upper arm's and
// forearm's directions in the trunk's frame, so the arm's turn (pronated pull-up vs chin-up) comes
// from where the forearm points; the closest grid postures are blended. The app's shoulder moment
// and the net force on the arm become generalised moments about the model's three shoulder
// coordinates (the model moves the shoulder blade, and so the joint centre, with the arm), and the
// shoulder muscles share them for the least summed squared activation (0 ≤ a ≤ 1), as js/hipmodel.js
// does for the hip. Printed per variant: each group's activation and its ratio to the exercise's
// main mover in the model (the `follows` ratio: the app then gives the cuff that ratio of the main
// mover's own, EMG-based, activation).
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const { analyzeMulti } = await import(new URL("js/multijoint.js", ROOT));
const body = JSON.parse(readFileSync(new URL("data/body.json", ROOT)));
const [file, ...only] = process.argv.slice(2);
const D = JSON.parse(readFileSync(file));

// Every model muscle ×STRONG: a lifter is stronger than the model (it can't hold a body-weight pull-up),
// and a uniform scale leaves the shares unchanged as long as no muscle reaches its limit.
const STRONG = 3;
const GROUPS = { lats: ["LAT1", "LAT2", "LAT3"], pecs: ["PECM1", "PECM2", "PECM3"], antDelt: ["DELT1"], "cuff-ext": ["INFSP", "TMIN"], subscap: ["SUBSC"], supsp: ["SUPSP"] };
const EXERCISES = { "bench-press": "pecs", "overhead-press": "antDelt", "pull-up": "lats", "lat-pulldown": "lats", "seated-row": "lats", "bent-over-row": "lats" };

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const unit = (a) => { const n = Math.hypot(...a) || 1; return a.map((x) => x / n); };
const V = (p) => [p.x, p.y, p.z];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** The grid postures closest to the arm (upper arm and forearm directions in the trunk frame), blended. */
function match(hum, fore) {
  const straight = dot(hum, fore) > 0.97; // elbow nearly straight: the forearm can't tell the arm's turn
  const scored = D.rows.map((r) => ({ r, c: ang(hum, r.hum) + (straight ? 0.002 * Math.abs(r.q[2]) / 15 : 0.5 * ang(fore, r.fore)) }));
  scored.sort((a, b) => a.c - b.c);
  const best = scored.slice(0, 4), w = best.map((s) => 1 / (s.c + 0.02)), W = w.reduce((a, b) => a + b, 0);
  const mix = (get) => { const vals = best.map((s) => get(s.r)); return vals[0].map((_, i) => vals.reduce((t, v, k) => t + v[i] * w[k], 0) / W); };
  return {
    q: mix((r) => r.q), err: best[0].c * 180 / Math.PI,
    axes: [0, 1, 2].map((i) => mix((r) => r.axes[i])), vels: [0, 1, 2].map((i) => mix((r) => r.vels[i])),
    m: Object.fromEntries(D.muscles.map((n) => [n, mix((r) => r.m[n])])),
  };
}

/** Least Σa² with Σ_j A_j a_j = b, 0 ≤ a ≤ 1 (dual Newton, as js/hipmodel.js). */
function solve(A, b) {
  const clamp = (s) => Math.min(1, Math.max(0, s)), H = (s) => (s <= 0 ? 0 : s >= 1 ? s - 0.5 : (s * s) / 2);
  const phi = (y) => A.reduce((s, r) => s + H(dot(r, y)), 0) - dot(b, y);
  let y = [0, 0, 0];
  const scale = Math.max(...A.map((r) => dot(r, r)), 1e-12), T = Math.hypot(...b) || 1;
  for (let it = 0; it < 200; it++) {
    const s = A.map((r) => dot(r, y));
    const g = b.map((_, q) => A.reduce((acc, r, j) => acc + r[q] * clamp(s[j]), 0) - b[q]);
    if (Math.hypot(...g) < 1e-6 * T) break;
    const M = [0, 1, 2].map((p) => [0, 1, 2].map((q) => A.reduce((acc, r, j) => acc + (s[j] > 0 && s[j] < 1 ? r[p] * r[q] : 0), 0) + (p === q ? 1e-6 * scale : 0)));
    const d = solve3(M, g).map((x) => -x);
    let t = 1;
    const f0 = phi(y), slope = dot(g, d);
    while (t > 1e-8 && phi(y.map((v, q) => v + t * d[q])) > f0 + 1e-4 * t * slope) t /= 2;
    y = y.map((v, q) => v + t * d[q]);
  }
  const a = A.map((r) => clamp(dot(r, y)));
  const res = b.map((bq, q) => A.reduce((acc, r, j) => acc + r[q] * a[j], 0) - bq);
  return { a, ok: Math.hypot(...res) < 0.02 * T + 0.5 };
}
function solve3(M, g) {
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D0 = det(M) || 1e-12;
  return [0, 1, 2].map((k) => det(M.map((row, i) => row.map((v, j) => (j === k ? g[i] : v)))) / D0);
}

for (const [id, prime] of Object.entries(EXERCISES)) {
  if (only.length && !only.includes(id)) continue;
  const ex = JSON.parse(readFileSync(new URL(`data/exercises/${id}.json`, ROOT)));
  for (const v of ex.variants) {
    const lines = [];
    for (let x = 0; x <= 100; x += 10) {
      const r = analyzeMulti(ex, v, x, { loadKg: v.defaultLoadKg ?? ex.defaultLoadKg ?? 40, bodyMassKg: 75, body });
      const t = r.frames.trunk, up = unit(sub(t.to, t.from));
      const ant = unit(V(t.anterior).map((c, i) => c - up[i] * dot(V(t.anterior), up))), right = cross(ant, up);
      const T = (p) => [dot(p, ant), dot(p, up), dot(p, right)];
      const hum = unit(T(sub(r.frames.upperArm.to, r.frames.upperArm.from))), fore = unit(T(sub(r.frames.forearm.to, r.frames.forearm.from)));
      const M = T(V(r.moments.shoulder)), F = T(V(r.moments.armForce));
      const P = match(hum, fore);
      const b = [0, 1, 2].map((q) => -(dot(M, P.axes[q]) + dot(F, P.vels[q])));
      const A = D.muscles.map((n) => [0, 1, 2].map((q) => P.m[n][q] * P.m[n][3] * STRONG));
      const { a, ok } = solve(A, b);
      const act = Object.fromEntries(D.muscles.map((n, j) => [n, a[j]]));
      const grp = (ns) => { const f = ns.reduce((s, n) => s + P.m[n][3], 0); return f ? ns.reduce((s, n) => s + P.m[n][3] * act[n], 0) / f : 0; };
      const g = Object.fromEntries(Object.entries(GROUPS).map(([k, ns]) => [k, grp(ns)]));
      const ratio = (k) => (g[prime] > 0.005 ? (g[k] / g[prime]).toFixed(2) : "-");
      lines.push(`  x${String(x).padStart(3)} q=[${P.q.map((n) => Math.round(n)).join(",")}] fit ${P.err.toFixed(0)}° ${ok ? "  " : "!!"} ${prime} ${g[prime].toFixed(2)} | ext ${g["cuff-ext"].toFixed(2)} (${ratio("cuff-ext")}) subsc ${g.subscap.toFixed(2)} (${ratio("subscap")}) supsp ${g.supsp.toFixed(2)} (${ratio("supsp")})`);
    }
    console.log(`${id} / ${v.id}:\n${lines.join("\n")}`);
  }
}
