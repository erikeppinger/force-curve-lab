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

test("hand-computed: back extension, the 45° bench peaks where the trunk is horizontal (45° of hip bend), the horizontal one at the top", () => {
  const ex = load("back-extension");
  const { proximal: L, distal: Lh, massFractions: [m1, m2], comFractions: [c1, c2] } = ex.segments;
  const lever = 75 * G * (m1 * c1 * L + m2 * (L + c2 * Lh));
  for (const a of [0, 45, 90]) {
    close(at(ex, "flat", a).limbTorque, lever * Math.cos(rad(a)), 1e-9);
    close(at(ex, "bench45", a).limbTorque, lever * Math.cos(rad(a - 45)), 1e-4); // gravity given as 0.7071
  }
  // Plate behind the head vs at the chest: (L + Lh) ÷ 0.85 L more torque.
  close(at(ex, "bench45-head", 30, { loadKg: 10 }).loadTorque / at(ex, "bench45", 30, { loadKg: 10 }).loadTorque, (L + Lh) / (0.85 * L), 1e-6);
  // Body weight on the 45° bench is well within a typical person's hips.
  assert.ok(Math.max(...[0, 15, 30, 45, 60, 75, 90].map((a) => at(ex, "bench45", a).effort)) < 0.6);
});
