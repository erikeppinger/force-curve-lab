// Leg model drawing (js/legmodel.js): Rajagopal et al. 2016 muscle paths carried onto the 3D lifts' segments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legMusclePaths, LEG_MAP, LEG_MUSCLE_NAMES } from "../js/legmodel.js";
import { analyzeMulti } from "../js/multijoint.js";

const data = JSON.parse(readFileSync(new URL("../data/opensim/leg-paths.json", import.meta.url)));
const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("leg paths: every mapped and named model muscle exists; kneecap tracks cover 0–140°", () => {
  const names = Object.keys(data.muscles).map((n) => n.replace(/_r$/, ""));
  assert.equal(names.length, 40);
  for (const list of Object.values(LEG_MAP)) for (const n of list) assert.ok(names.includes(n), n);
  for (const n of names) assert.ok(LEG_MUSCLE_NAMES[n], n);
  for (const m of Object.values(data.muscles)) for (const p of m.points) {
    if (p.seg === "patella") assert.deepEqual(p.track.map((r) => r[0]), data.patellaAngles);
    else assert.equal(p.p.length, 3);
  }
});

test("leg paths: on an upright straight leg in the model's own axes, points land at hip/knee/ankle + their offsets (thigh and shank scaled)", () => {
  const H = { x: 0, y: 0.9, z: 0.09 }, Lt = 0.43, Ls = 0.43;
  const K = { x: 0, y: H.y - Lt, z: H.z }, A = { x: 0, y: K.y - Ls, z: H.z };
  const frames = { trunk: { from: { x: 0, y: H.y, z: 0 }, to: { x: 0, y: H.y + 0.5, z: 0 } }, thigh: { from: H, to: K }, shank: { from: K, to: A }, foot: { from: A, to: { x: 0.1, y: A.y, z: A.z } } };
  const paths = Object.fromEntries(legMusclePaths(data, frames).map((m) => [m.name, m.pts]));
  const sT = Lt / data.lengths.femur, sS = Ls / data.lengths.tibia;
  const pts = data.muscles.vaslat_r.points;
  // A femur point: the hip plus the offset × the thigh's scale, axes unchanged.
  const f = pts.find((p) => p.seg === "femur").p, got = paths.vaslat_r[pts.findIndex((p) => p.seg === "femur")];
  close(got.x, H.x + f[0] * sT, 1e-9); close(got.y, H.y + f[1] * sT, 1e-9); close(got.z, H.z + f[2] * sT, 1e-9);
  // A tibia point: the knee plus the offset × the shank's scale.
  const t = pts.find((p) => p.seg === "tibia").p, gotT = paths.vaslat_r[pts.findIndex((p) => p.seg === "tibia")];
  close(gotT.y, K.y + t[1] * sS, 1e-9);
  // The calf's foot point: the ankle plus the offset, unscaled.
  const c = data.muscles.soleus_r.points.at(-1).p, gotC = paths.soleus_r.at(-1);
  close(gotC.x, A.x + c[0], 1e-9); close(gotC.y, A.y + c[1], 1e-9);
});

test("leg paths in a squat: the quadriceps lie in front of the thigh, the hamstrings behind it, the calf behind the shin, the shin muscle in front", () => {
  const ex = load("squat"), r = analyzeMulti(ex, ex.variants[0], 45, { loadKg: 40, bodyMassKg: 75, body });
  const P = Object.fromEntries(legMusclePaths(data, r.frames).map((m) => [m.name, m.pts]));
  const side = (p, fr) => {
    const d = { x: fr.to.x - fr.from.x, y: fr.to.y - fr.from.y, z: fr.to.z - fr.from.z }, n = Math.hypot(d.x, d.y, d.z);
    const w = { x: p.x - fr.from.x, y: p.y - fr.from.y, z: p.z - fr.from.z }, t = (w.x * d.x + w.y * d.y + w.z * d.z) / n / n;
    const q = { x: w.x - d.x * t, y: w.y - d.y * t, z: w.z - d.z * t };
    return q.x * fr.anterior.x + q.y * fr.anterior.y + q.z * fr.anterior.z;
  };
  const femurPts = (n) => data.muscles[n].points.map((p, i) => [p, P[n][i]]).filter(([p]) => p.seg === "femur").map(([, q]) => q);
  for (const q of femurPts("vaslat_r")) assert.ok(side(q, r.frames.thigh) > 0, "vastus lateralis in front");
  assert.ok(side(P.semimem_r.at(-1), r.frames.thigh) < 0, "semimembranosus behind");
  assert.ok(side(P.gasmed_r.at(-1), r.frames.shank) < 0, "gastrocnemius behind the shin");
  assert.ok(side(P.tibant_r[0], r.frames.shank) > 0, "tibialis anterior in front");
  assert.ok(Object.values(P).every((pts) => pts.every((p) => Number.isFinite(p.x + p.y + p.z))));
});

test("single-joint leg exercises (3D chain figure): the hip-based and knee-based chains give the leg model its frames, every path finite", async () => {
  const { analyze } = await import("../js/physics.js");
  const { chainScene3d } = await import("../js/chain3d.js");
  for (const [id, vid] of [["leg-extension", "machine"], ["leg-curl", "lying"], ["glute-kickback", "kneeling"], ["calf-raise", "two-leg"]]) {
    const ex = load(id), v = ex.variants.find((q) => q.id === vid);
    const r = analyze(ex, v, (ex.angleRange[0] + ex.angleRange[1]) / 2, { loadKg: 10, peakTorqueNm: ex.defaults.peakTorqueNm, bodyMassKg: 75, placement: v.params });
    const s = chainScene3d(ex, v, r, { body });
    for (const k of ["trunk", "thigh", "shank", "foot"]) assert.ok(s.frames[k], `${id}: ${k}`);
    const paths = legMusclePaths(data, s.frames);
    assert.ok(paths.every((m) => m.pts.every((p) => Number.isFinite(p.x + p.y + p.z))), id);
    // The map names only this exercise's muscles.
    for (const k of Object.keys(ex.legModel.map)) assert.ok(ex.muscles.some((m) => m.id === k), `${id}: ${k}`);
  }
});

test("leg paths against OpenSim: every muscle's drawn length within 1 cm of the model's, standing, hip 90°, knee 90°, ankle 20° (wrapping included)", () => {
  const v = (x, y, z) => ({ x, y, z }), rad = (d) => (d * Math.PI) / 180;
  const Lf = data.lengths.femur, Lt = data.lengths.tibia;
  const frames = (hip, knee, ankle) => {
    const H = v(0, 0, 0.08), th = rad(hip), sh = rad(hip - knee), ft = rad(hip - knee + ankle);
    const K = v(H.x + Math.sin(th) * Lf, H.y - Math.cos(th) * Lf, H.z), A = v(K.x + Math.sin(sh) * Lt, K.y - Math.cos(sh) * Lt, K.z);
    return { trunk: { from: v(0, 0, 0), to: v(0, 0.5, 0) }, thigh: { from: H, to: K }, shank: { from: K, to: A }, foot: { from: A, to: v(A.x + Math.cos(ft) * 0.1, A.y + Math.sin(ft) * 0.1, A.z) } };
  };
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) : 0), 0);
  for (const [pose, [h, k, a]] of Object.entries({ neutral: [0, 0, 0], hip90: [90, 0, 0], knee90: [0, 90, 0], ankle20: [0, 0, 20] })) {
    for (const m of legMusclePaths(data, frames(h, k, a))) {
      const want = data.checkLengths.lengths[pose][m.name];
      // Known gaps: the toe muscles run to the app's shorter foot (FOOT_FWD); with the knee bent the
      // model's tibia also slides, which the drawing's plain hinge leaves out (quadriceps ≤ 2.5 cm).
      const tol = /^(fhl|fdl|ehl|edl)_r$/.test(m.name) ? 0.03 : pose === "knee90" && /^(vas|recfem)/.test(m.name) ? 0.03 : 0.01;
      assert.ok(Math.abs(len(m.pts) - want) <= tol, `${pose} ${m.name}: ${len(m.pts).toFixed(3)} vs ${want}`);
    }
  }
});
