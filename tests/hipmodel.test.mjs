// Hip muscle model (js/hipmodel.js): straight-line moment arms from the OpenSim geometry, the
// static-optimisation split, and the 3D scene.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abductionArm, momentArm, hipPosture, hipActivations, hipScene3d, activeFactor } from "../js/hipmodel.js";
import { analyze } from "../js/physics.js";
import { muscleActivation } from "../js/muscles.js";
import { scene3d } from "../js/view3d.js";

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const geo = json("../data/opensim/hip-muscles.json");
const load = (id) => { const ex = json(`../data/exercises/${id}.json`); ex.hipModel.geometry = geo; return ex; };
const byId = (id) => geo.muscles.find((m) => m.id === id);

test("moment arm of a straight muscle matches the cross product", () => {
  // Pelvis point 10 cm above the hip, femur point 10 cm down and 5 cm out: the force along the
  // line, about the hip's front-to-back axis: |r × u| = |r_y u_z − r_z u_y| = 0.005 / 0.2062 m.
  const m = { fmax: 100, points: [{ frame: "pelvis", at: [0, 0.1, 0] }, { frame: "femur", at: [0, -0.1, 0.05] }] };
  assert.ok(Math.abs(abductionArm(m, {}) - 0.005 / Math.hypot(0.2, 0.05)) < 1e-5);
  // Straight in line with the flexion axis: no flexion moment.
  assert.ok(Math.abs(momentArm(m, {}, "flexion")) < 1e-6);
});

test("gluteus medius loses its abduction leverage as the hip bends (Dostal et al.'s direction)", () => {
  for (const id of ["glmed1", "glmed2", "glmed3"]) {
    const straight = abductionArm(byId(id), { flexion: 0 }, geo.wraps);
    const bent = abductionArm(byId(id), { flexion: 90 }, geo.wraps);
    assert.ok(straight > 0.035 && bent < 0.02 && bent < straight / 2, `${id}: ${straight} → ${bent}`);
  }
  // TFL and piriformis keep abducting with the hip bent 90°.
  for (const id of ["tfl", "piri"]) assert.ok(abductionArm(byId(id), { flexion: 90 }, geo.wraps) > 0.015, id);
  // Adductors adduct at both.
  for (const id of ["addlong", "addbrev", "addmagMid"]) for (const flexion of [0, 90]) assert.ok(abductionArm(byId(id), { flexion }, geo.wraps) < -0.02, `${id} @${flexion}`);
});

test("seated lean: the hip bend is 90° minus the lean", () => {
  const ex = load("hip-abduction");
  const seat = ex.variants.find((v) => v.id === "seated");
  assert.equal(hipPosture(seat, 20, { lean: 30 }).flexion, 60);
  assert.equal(hipPosture(seat, 20, { lean: -20 }).flexion, 110);
  assert.equal(hipPosture(ex.variants.find((v) => v.id === "cable"), 20, { lean: 30 }).flexion, 0);
});

test("static optimisation: the muscles produce the joint torque and balance the other hip moments", () => {
  for (const id of ["hip-abduction", "hip-adduction"]) {
    const ex = load(id);
    const sign = id === "hip-adduction" ? -1 : 1;
    for (const v of ex.variants) {
      const x = id === "hip-adduction" ? 10 : 20;
      const r = analyze(ex, v, x, { loadKg: v.defaultLoadKg, peakTorqueNm: ex.defaults.peakTorqueNm, bodyMassKg: 75, placement: v.params });
      assert.ok(r.effort < 0.9, `${id}/${v.id}: effort ${r.effort}`);
      const a = hipActivations(ex, v, r, geo);
      assert.ok(Object.values(a).every((y) => y >= 0 && y <= 1), v.id);
      // Moments the muscles make (scaled like the solver: all working-way capacity = the measured strength).
      const arm = (m, q) => m.fmax * activeFactor(m, r.hip, geo, Boolean(v.hip.kneeBent)) * momentArm(m, r.hip, q, geo.wraps);
      const total = geo.muscles.reduce((s, m) => s + Math.max(0, -sign * arm(m, "adduction")), 0);
      const made = (q) => geo.muscles.reduce((s, m) => s + a[m.id] * arm(m, q), 0) * (r.capacity / total);
      assert.ok(Math.abs(-sign * made("adduction") - r.jointTorque) < 0.01 * r.capacity, `${id}/${v.id}: ${made("adduction")} vs ${r.jointTorque}`);
      for (const q of v.hip.balance ? [] : ["flexion", "rotation"]) assert.ok(Math.abs(made(q)) < 0.01 * r.capacity, `${id}/${v.id}: ${q} ${made(q)}`);
    }
  }
});

test("seated abduction: leaning forward shifts work from the gluteus medius to the gluteus maximus", () => {
  const ex = load("hip-abduction");
  const v = ex.variants.find((x) => x.id === "seated");
  const at = (lean) => {
    const r = analyze(ex, v, 20, { loadKg: 10, peakTorqueNm: 110, bodyMassKg: 75, placement: { lean } });
    return Object.fromEntries(muscleActivation(ex, v, r, 20).map((m) => [m.id, m.value]));
  };
  const back = at(40), forward = at(-30);
  assert.ok(back["gluteus-medius"] > forward["gluteus-medius"] * 2, `${back["gluteus-medius"]} vs ${forward["gluteus-medius"]}`);
  assert.ok(forward["gluteus-maximus"] > forward["gluteus-medius"] && back["gluteus-medius"] > forward["gluteus-medius"]);
});

test("3D scene: finite points for every variant, lean and angle", () => {
  for (const id of ["hip-abduction", "hip-adduction"]) {
    const ex = load(id);
    for (const v of ex.variants) {
      for (const lean of [-30, 0, 45]) {
        for (const x of [ex.angleRange[0], 20, ex.angleRange[1]]) {
          const r = analyze(ex, v, x, { loadKg: 5, peakTorqueNm: 110, bodyMassKg: 75, placement: { lean } });
          const act = muscleActivation(ex, v, r, x);
          const prims = scene3d(ex, hipScene3d(ex, v, r, { geometry: geo, acts: act[0].parts, muscles: ex.muscles }), act);
          const pts = prims.flatMap((p) => (p.kind === "line" ? [p.a, p.b] : p.kind === "dot" ? [p.c] : p.pts));
          assert.ok(pts.every((p) => [p.x, p.y, p.z].every(Number.isFinite)), `${id}/${v.id} @${x} lean ${lean}`);
        }
      }
    }
  }
});

test("force–length factors: grid values at grid points, held at the edges, knee bend matters for the hamstrings", async () => {
  const { activeFactor } = await import("../js/hipmodel.js");
  const g = geo.forceGrid, m = byId("glmed2");
  assert.equal(activeFactor(m, { flexion: g.flexion[2], adduction: g.adduction[3] }, geo), m.active.knee0[2][3]);
  assert.equal(activeFactor(m, { flexion: 500, adduction: -500 }, geo), m.active.knee0.at(-1)[0]);
  const ham = byId("semimem");
  assert.ok(activeFactor(ham, { flexion: 90, adduction: 0 }, geo, true) > 3 * activeFactor(ham, { flexion: 90, adduction: 0 }, geo, false));
  for (const x of geo.muscles) for (const t of [x.active.knee0, x.active.knee90]) assert.ok(t.flat().every((v) => v >= 0 && v <= 1.5), x.id);
});
