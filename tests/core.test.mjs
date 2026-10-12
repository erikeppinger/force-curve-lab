// Core exercises: crunch, leg raise, back extension (single-joint statics about the lower back or the hips).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, G } from "../js/physics.js";

const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const rad = (d) => (d * Math.PI) / 180;
const at = (ex, vId, angle, o = {}) => {
  const v = ex.variants.find((x) => x.id === vId);
  return analyze(ex, v, angle, { loadKg: 0, peakTorqueNm: ex.defaults.peakTorqueNm, bodyMassKg: 75, placement: v.params, ...o });
};

test("hand-computed: floor crunch, the upper body's weight × its lever × cos(curl); a plate at the chest acts 85% of the way to the shoulders", () => {
  const ex = load("crunch");
  const { proximal: L, distal: Lh, massFractions: [m1, m2], comFractions: [c1, c2] } = ex.segments;
  for (const a of [0, 20, 40]) {
    const body = 75 * G * (m1 * c1 * L + m2 * (L + c2 * Lh)) * Math.cos(rad(a));
    close(at(ex, "floor", a).limbTorque, body);
    close(at(ex, "floor", a, { loadKg: 10 }).loadTorque, 10 * G * 0.85 * L * Math.cos(rad(a)));
    close(at(ex, "floor-head", a, { loadKg: 10 }).loadTorque, 10 * G * (L + Lh) * Math.cos(rad(a)));
  }
  // Decline 30°: the lever is longest where the trunk is horizontal, at 30° of curl.
  const dec = [0, 15, 30, 40].map((a) => at(ex, "decline", a).jointTorque);
  assert.ok(dec[2] > dec[1] && dec[2] > dec[3] && dec[0] < dec[2]);
});

test("hand-computed: leg raises, the legs' weight × lever × sin (hanging) or cos (lying); bent knees shorten the lever", () => {
  const ex = load("leg-raise");
  const { proximal: L1, distal: L2, massFractions: [m1, m2], comFractions: [c1, c2] } = ex.segments;
  const straight = 75 * G * (m1 * c1 * L1 + m2 * (L1 + c2 * L2));
  for (const a of [0, 45, 90]) {
    close(at(ex, "hanging", a).limbTorque, straight * Math.sin(rad(a)), 1e-9);
    close(at(ex, "lying", a).limbTorque, straight * Math.cos(rad(a)), 1e-9);
  }
  // Knees bent 90° at 90° of hip flexion: thighs horizontal, lower legs hanging below the knees.
  close(at(ex, "hanging-knee", 90).limbTorque, 75 * G * (m1 * c1 * L1 + m2 * L1));
  assert.ok(at(ex, "hanging-knee", 90).effort < 0.8 * at(ex, "hanging", 90).effort); // about a quarter less
  // Hanging, straight legs at 90°: about 95 Nm against 0.44 × 283 Nm of the hip flexors — hard but possible.
  const r = at(ex, "hanging", 90);
  assert.ok(r.effort > 0.4 && r.effort < 0.8, `${r.effort}`);
});

test("back extension: the lower back carries the upper body's moment about L5/S1, the hips everything above them; rounding shifts the bend between them", async () => {
  const { analyzeMulti } = await import("../js/multijoint.js");
  const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
  const ex = load("back-extension");
  const run = (vId, x, rounding, loadKg = 0) => analyzeMulti(ex, ex.variants.find((v) => v.id === vId), x, { loadKg, bodyMassKg: 75, body, placement: { rounding } });
  const J = (r, id) => r.joints.find((j) => j.id === id);
  for (const x of [20, 45, 70]) {
    const a = run("bench45", x, 0), b = run("bench45", x, 30);
    // Rounding takes 30° of the bend into the lower back; the moment there changes little (within 15%).
    assert.equal(J(b, "hip").angle, x - 30);
    assert.equal(J(b, "lumbar").angle, 30);
    assert.ok(Math.abs(J(b, "lumbar").torque / J(a, "lumbar").torque - 1) < 0.15, `${x}`);
  }
  // Horizontal bench, trunk hanging straight down: no moment anywhere.
  close(J(run("flat", 90, 0), "lumbar").torque, 0, 1e-9);
  // The 45° bench is hardest with the trunk horizontal (45°).
  const t = [0, 30, 45, 60, 90].map((x) => J(run("bench45", x, 0), "lumbar").torque);
  assert.ok(t[2] >= Math.max(...t) - 1e-9);
  // A plate behind the head vs at the chest, horizontal trunk: the lever about L5/S1 grows by (trunk − L5 + 0.18) ÷ (0.85 trunk − L5).
  const L = body.lengths.trunk, l5 = body.trunkParts.l5s1;
  const plate = (vId) => J(run(vId, 45, 0, 10), "lumbar").torque - J(run(vId, 45, 0, 0), "lumbar").torque;
  close(plate("bench45-head") / plate("bench45"), (L - l5 + 0.18) / (0.85 * L - l5), 1e-9);
  // Rounding: the back muscles work flexed (stronger, per Graves et al.), the hips less bent (weaker).
  const s0 = run("bench45", 45, 0), s30 = run("bench45", 45, 30);
  assert.ok(J(s30, "lumbar").effort < J(s0, "lumbar").effort && J(s30, "hip").effort > J(s0, "hip").effort);
  // Arched (negative rounding): the hips bend more for the same trunk position, the back muscles work short (weaker).
  const sA = run("bench45", 45, -20);
  assert.equal(J(sA, "hip").angle, 65);
  assert.equal(J(sA, "lumbar").angle, -20);
  assert.ok(J(sA, "lumbar").effort > J(s0, "lumbar").effort);
});
test("hand-computed: leaning the trunk turns gravity and the pulley in the body's frame; bent elbows shorten the raises' lever", () => {
  const pd = load("straight-arm-pulldown");
  const v = pd.variants.find((x) => x.id === "cable");
  // Leaning 30°: gravity in the body frame (sin 30°, −cos 30°); the pulley turned about the hips.
  const r = at(pd, "cable", 60, { placement: { lean: 30 } });
  close(r.gravity.x, 0.5); close(r.gravity.y, -Math.cos(rad(30)));
  const q = { x: v.load.pulley.x, y: v.load.pulley.y + 0.55 }; // from the hips
  close(r.pulley.x, q.x * Math.cos(rad(30)) - q.y * Math.sin(rad(30)));
  close(r.pulley.y + 0.55, q.x * Math.sin(rad(30)) + q.y * Math.cos(rad(30)));
  // Leaning forward unloads the finish (arm by the side).
  assert.ok(at(pd, "cable", 0, { loadKg: 10, placement: { lean: 40 } }).loadTorque < at(pd, "cable", 0, { loadKg: 10, placement: { lean: 0 } }).loadTorque - 20);
  // Lateral raise, elbow bent 90° (forearm forward, out of the plane): the dumbbell's lever is the upper arm only.
  const lr = load("lateral-raise");
  close(at(lr, "dumbbell", 90, { loadKg: 5, placement: { elbow: 90 } }).loadTorque, 5 * 9.81 * lr.segments.proximal, 1e-9);
  // Front raise, elbow bent 90° in the plane at 90° of raise: forearm vertical, same lever.
  const fr = load("front-raise");
  close(at(fr, "dumbbell", 90, { loadKg: 5, placement: { elbow: 90 } }).loadTorque, 5 * 9.81 * fr.segments.proximal, 1e-9);
});

test("lateral raise: turning the arm moves the work between the deltoid parts (Coratella et al.), not the torque", async () => {
  const { muscleActivation } = await import("../js/muscles.js");
  const ex = load("lateral-raise");
  const v = ex.variants.find((x) => x.id === "dumbbell");
  const run = (rotation) => {
    const r = at(ex, "dumbbell", 60, { loadKg: 2, placement: { rotation } });
    return { torque: r.jointTorque, act: Object.fromEntries(muscleActivation(ex, v, r, 60).map((m) => [m.id, m.value])) };
  };
  const up = run("up"), fw = run("forward"), down = run("down");
  close(up.torque, fw.torque); close(down.torque, fw.torque);
  close(up.act["anterior-deltoid"] / fw.act["anterior-deltoid"], 80 / 36, 0.01);
  close(down.act["posterior-deltoid"] / fw.act["posterior-deltoid"], 85 / 52, 0.01);
});

test("planks: the reactions carry the body weight, the hip torque is the same from both sides, and raising the support scales every torque with cos(tilt)", async () => {
  const { analyzeMulti } = await import("../js/multijoint.js");
  const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
  for (const id of ["plank", "side-plank"]) {
    const ex = load(id);
    for (const v of ex.variants) {
      const run = (x) => analyzeMulti(ex, v, x, { loadKg: 10, bodyMassKg: 75, body });
      const r0 = run(0);
      close(r0.check.toeR + r0.check.supR, r0.check.weight, 1e-9);
      const hip = r0.joints.find((j) => j.id === "hip");
      close(hip.torque, r0.check.hipFromTrunk, 1e-9);
      // Same beam, tilted further: every horizontal distance (so every torque) scales with cos (no
      // plate: it sits on the back, off the beam's line; the feet's small offset allows 1%).
      const b0 = analyzeMulti(ex, v, 0, { loadKg: 0, bodyMassKg: 75, body }), b1 = analyzeMulti(ex, v, 40, { loadKg: 0, bodyMassKg: 75, body });
      const cos = (r) => { const H = r.joints.find((j) => j.id === "hip").at, L5 = r.joints.find((j) => j.id === "lumbar").at; return (L5.x - H.x) / Math.hypot(L5.x - H.x, L5.y - H.y); };
      for (const id2 of ["hip", "lumbar"]) close(b1.joints.find((j) => j.id === id2).torque / b0.joints.find((j) => j.id === id2).torque, cos(b1) / cos(b0), 1e-2);
    }
  }
  // Forearm plank on the floor, no plate: about 46% of a young man's trunk-flexion strength (Ekstrom et al.'s rectus abdominis: 43%).
  const ex = load("plank");
  const lumbar = analyzeMulti(ex, ex.variants[0], 0, { loadKg: 0, bodyMassKg: 75, body }).joints.find((j) => j.id === "lumbar");
  assert.ok(lumbar.effort > 0.35 && lumbar.effort < 0.6, `${lumbar.effort}`);
});

test("hand-computed: Pallof press, the twist is the cable's sideways pull × the hands' reach; the side-bend its sideways pull × the hands' height", async () => {
  const { analyzeMulti } = await import("../js/multijoint.js");
  const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
  const ex = load("pallof-press");
  const v = ex.variants[0], P = v.params;
  for (const x of [0, 50, 100]) {
    const r = analyzeMulti(ex, v, x, { loadKg: 10, bodyMassKg: 75, body });
    const maxReach = Math.sqrt((body.lengths.upperArm + body.lengths.forearm) ** 2 - body.lengths.shoulderHalfWidth ** 2) - 0.005;
    const reach = P.chest + (maxReach - P.chest) * (x / 100);
    const d = { x: P.anchor.x, y: P.anchor.y - reach }, l = Math.hypot(d.x, d.y);
    const Fx = (10 * 9.81 * Math.abs(d.x)) / l;
    close(r.joints.find((j) => j.id === "rotation").torque, Fx * reach, 1e-9);
    close(r.joints.find((j) => j.id === "sidebend").torque, Fx * P.handHeight, 1e-9);
  }
});
