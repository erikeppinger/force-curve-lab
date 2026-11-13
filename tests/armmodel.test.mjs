// The Stanford-VA arm model's muscle paths (js/armmodel.js, data/opensim/arm-paths.json): data,
// placement on the solver's bones, and the 3D figures that draw them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armMusclePaths, armBones, proSupOf, ARM_MAP, ARM_MUSCLE_NAMES } from "../js/armmodel.js";
import { analyze } from "../js/physics.js";
import { analyzeMulti } from "../js/multijoint.js";
import { chainScene3d } from "../js/chain3d.js";
import { scene3d } from "../js/view3d.js";
import { muscleActivation } from "../js/muscles.js";

const data = JSON.parse(readFileSync(new URL("../data/opensim/arm-paths.json", import.meta.url)));
const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const v = (x, y, z) => ({ x, y, z });
const L = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y, p.z - pts[i].z), 0);

// A standing right arm (x forward, y up, z to the right): shoulder at the origin, upper arm down,
// forearm forward at `elbow` degrees of flexion, or the arm raised sideways by `abd` degrees.
function arm({ elbow = 90, abd = 0 } = {}) {
  const S = v(0, 0, 0.19);
  const a = (abd * Math.PI) / 180, e = (elbow * Math.PI) / 180;
  const dU = v(0, -Math.cos(a), Math.sin(a));
  const E = v(S.x, S.y + dU.y * 0.3, S.z + dU.z * 0.3);
  // Forearm: bends forward (towards +x) from the upper arm's line.
  const W = v(E.x + Math.sin(e) * 0.33, E.y + dU.y * Math.cos(e) * 0.33, E.z + dU.z * Math.cos(e) * 0.33);
  return { trunk: { from: v(0, -0.52, 0), to: v(0, 0, 0), anterior: v(1, 0, 0) }, upperArm: { from: S, to: E, anterior: v(1, 0, 0) }, forearm: { from: E, to: W } };
}
const paths = (frames, o) => Object.fromEntries(armMusclePaths(data, frames, o).map((m) => [m.name, m]));

test("arm model data: shoulder and elbow muscles with names, no finger muscles, every wrap object defined", () => {
  for (const n of ["DELT1", "DELT2", "DELT3", "PECM1", "LAT1", "TMAJ", "TRIlong", "BIClong", "BRA", "BRD"]) assert.ok(data.muscles[n], n);
  assert.ok(!Object.keys(data.muscles).some((n) => /^(FDS|FDP|EDC|EPL|FPL)/.test(n)));
  for (const [n, m] of Object.entries(data.muscles)) {
    assert.ok(ARM_MUSCLE_NAMES[n], `name for ${n}`);
    assert.ok(m.points.length >= 2 && m.fmax > 0, n);
    for (const w of m.wraps ?? []) assert.ok(data.wraps[w.name], `${n} wraps over ${w.name}`);
  }
  for (const ids of Object.values(ARM_MAP)) for (const n of ids) assert.ok(data.muscles[n], n);
  assert.ok(Math.abs(data.lengths.humerus - 0.29) < 0.01);
});

test("arm bones: elevation and elbow angle read off the solver's frames", () => {
  const b = armBones(arm({ elbow: 90 }));
  assert.ok(Math.abs(b.q.shoulder_elv) < 1e-6);
  assert.ok(Math.abs(b.q.elbow_flexion - 90) < 1e-6);
  // The elbow's axis points to the right (+z) for a right arm bending forward.
  assert.ok(b.bones.humerus.z.z > 0.99);
  assert.ok(Math.abs(armBones(arm({ abd: 90 })).q.shoulder_elv - 90) < 1e-6);
});

test("arm model placement: pecs in front of the shoulder, lats and posterior deltoid behind, deltoids over its top, biceps in front of the upper arm", () => {
  const S = v(0, 0, 0.19);
  const p = paths(arm({ elbow: 90 }), { proSup: -90 });
  const first = (n) => p[n].pts[0], last = (n) => p[n].pts.at(-1);
  // Pectoralis origins on the chest: in front of the shoulder joint and towards the midline.
  for (const n of ["PECM1", "PECM2", "PECM3"]) { assert.ok(last(n).x > S.x + 0.02, n); assert.ok(last(n).z < S.z - 0.05, n); }
  // Latissimus origins on the back: behind and below the shoulder, towards the midline.
  for (const n of ["LAT1", "LAT2", "LAT3"]) { const o = last(n); assert.ok(o.x < S.x, n); assert.ok(o.y < S.y - 0.05, n); assert.ok(o.z < S.z, n); }
  assert.ok(last("DELT3").x < S.x, "posterior deltoid from the back of the shoulder blade");
  assert.ok(last("DELT1").x > S.x, "anterior deltoid from the front of the collarbone");
  // The lateral deltoid passes over the top and outside of the humeral head.
  assert.ok(Math.max(...p.DELT2.pts.map((q) => q.z)) > S.z + 0.02);
  assert.ok(Math.max(...p.DELT2.pts.map((q) => q.y)) > S.y);
  // Biceps: down the front of the upper arm (forward of the humerus at mid-length).
  const mid = p.BIClong.pts.filter((q) => q.y < -0.1 && q.y > -0.2);
  assert.ok(mid.length && mid.every((q) => q.x > 0), "biceps in front");
  const tri = p.TRIlong.pts.filter((q) => q.y < -0.1 && q.y > -0.2);
  assert.ok(tri.length && tri.every((q) => q.x < 0), "triceps behind");
  // Elbow flexors insert on the forearm, below the elbow.
  assert.ok(first("BIClong").x > 0.02 || last("BIClong").x > 0.02);
});

test("arm model lengths: elbow flexion shortens the biceps and brachialis and lengthens the triceps; raising the arm shortens the lateral deltoid", () => {
  const a = paths(arm({ elbow: 10 }), { proSup: -90 }), b = paths(arm({ elbow: 120 }), { proSup: -90 });
  for (const n of ["BIClong", "BICshort", "BRA", "BRD"]) assert.ok(L(b[n].pts) < L(a[n].pts) - 0.02, n);
  for (const n of ["TRIlong", "TRIlat", "TRImed"]) assert.ok(L(b[n].pts) > L(a[n].pts) + 0.01, n);
  const down = paths(arm({ abd: 0, elbow: 0.1 })), up = paths(arm({ abd: 90, elbow: 0.1 }));
  assert.ok(L(up.DELT2.pts) < L(down.DELT2.pts) - 0.02);
  assert.ok(L(up.LAT1.pts) > L(down.LAT1.pts) + 0.02);
});

test("arm model: no bulge at a nearly straight elbow (the elbow ellipsoid wraps in the plane of its surface normal, as OpenSim)", () => {
  // OpenSim (MoBL-ARMS, same geometry) puts the brachioradialis at most 4.7 cm off the arm's axis;
  // wrapping in the plane through the ellipsoid's centre sent it to 6.7 cm round the far end.
  const off = (fr, pts) => {
    const seg = (p, a, b) => {
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
      const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / (ab.x * ab.x + ab.y * ab.y + ab.z * ab.z)));
      return Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t, ap.z - ab.z * t);
    };
    return Math.max(...pts.map((p) => Math.min(seg(p, fr.upperArm.from, fr.upperArm.to), seg(p, fr.forearm.from, fr.forearm.to))));
  };
  for (const elbow of [5, 19, 36, 60]) {
    const fr = arm({ elbow });
    const p = paths(fr, { proSup: -90 });
    assert.ok(off(fr, p.BRD.pts) < 0.05, `brachioradialis at elbow ${elbow}°: ${(off(fr, p.BRD.pts) * 100).toFixed(1)} cm`);
    for (const n of ["BIClong", "BICshort", "BRA", "TRIlong", "TRIlat", "TRImed"]) assert.ok(off(fr, p[n].pts) < 0.045, `${n} at elbow ${elbow}°`);
  }
});

test("forearm rotation by grip: curls from grip3d, rows and pulls from the variant", () => {
  const curl = load("biceps-curl");
  const byId = (ex, id) => ex.variants.find((q) => q.id === id);
  assert.equal(proSupOf(curl, byId(curl, "dumbbell")), -90);
  assert.equal(proSupOf(curl, byId(curl, "reverse")), 90);
  const pull = load("pull-up");
  assert.equal(proSupOf(pull, byId(pull, "chin-up")), -90);
  assert.equal(proSupOf(pull, byId(pull, "neutral")), 0);
  assert.equal(proSupOf(pull, byId(pull, "pull-up")), 90);
});

test("3D figures draw the arm model: a curl's chain and a bench press, with the model muscles' bars left out", () => {
  const curl = load("biceps-curl");
  curl.armModel.geometry = data;
  const v0 = curl.variants[0];
  const r = analyze(curl, v0, 90, { loadKg: 10, peakTorqueNm: curl.defaults.peakTorqueNm, bodyMassKg: 75 });
  const act = muscleActivation(curl, v0, r, 90);
  const ch = chainScene3d(curl, v0, r, { activation: act, body });
  assert.ok(ch.frames.upperArm && ch.frames.forearm && ch.frames.trunk?.forward);
  assert.equal(ch.armRotation.proSup, -90);
  const prims = scene3d(curl, ch, act);
  assert.ok(prims.some((p) => p.model && /Biceps \(long head\) · part of/.test(p.title ?? "")));
  // The chain's own biceps bar (drawn with `top: 50`) is gone.
  assert.ok(!ch.scene.some((p) => p.cls === "muscle-on" && /^Biceps/.test(p.title ?? "")));

  const bench = load("bench-press");
  bench.armModel.geometry = data;
  const vb = bench.variants[0];
  const rb = analyzeMulti(bench, vb, 50, { loadKg: 60, bodyMassKg: 75, body });
  assert.equal(rb.armRotation.proSup, 90);
  const pb = scene3d(bench, rb, muscleActivation(bench, vb, rb, 50));
  assert.ok(pb.some((p) => p.model && /Pectoralis major \(sternal\) · part of/.test(p.title ?? "")));
  assert.ok(!pb.some((p) => !p.model && p.cls === "muscle-on" && /^Pectoralis/.test(p.title ?? "")), "no pec bar");
});
