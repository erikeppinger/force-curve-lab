import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, interp, sampleCurve, G } from "../js/physics.js";

const ex = JSON.parse(readFileSync(new URL("../data/exercises/biceps-curl.json", import.meta.url)));
const v = (id) => ex.variants.find((x) => x.id === id);
const opts = { loadKg: 10, peakTorqueNm: 60, bodyMassKg: 75 };
const L = ex.segments.distal;
// Forearm + hand weight acts at its centre of mass.
const forearmMoment = ex.segments.massFractions[1] * 75 * ex.segments.comFractions[1] * L;
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("interp clamps and interpolates", () => {
  const pts = [[0, 0], [10, 1]];
  close(interp(pts, -5), 0);
  close(interp(pts, 5), 0.5);
  close(interp(pts, 50), 1);
});

test("dumbbell curl torque = (m·L + forearm mass·COM)·g·sin(angle)", () => {
  for (const a of [0, 30, 90, 120]) {
    const r = analyze(ex, v("dumbbell"), a, opts);
    const s = Math.sin((a * Math.PI) / 180);
    close(r.loadTorque, 10 * G * L * s);
    close(r.jointTorque, (10 * L + forearmMoment) * G * s);
  }
  close(analyze(ex, v("dumbbell"), 90, opts).momentArm, L);
});

test("barbell and dumbbell give identical elbow torque curves", () => {
  const a = sampleCurve(ex, v("dumbbell"), opts).map((s) => s.jointTorque);
  const b = sampleCurve(ex, v("barbell"), opts).map((s) => s.jointTorque);
  assert.deepEqual(a, b);
});

test("preacher curl peaks at 90° minus the upper-arm tilt", () => {
  const curve = sampleCurve(ex, v("preacher"), opts, 0.5);
  const peak = curve.reduce((m, s) => (s.jointTorque > m.jointTorque ? s : m));
  close(peak.angle, 90 - v("preacher").proximalAngle, 0.6);
  assert.equal(curve[0].stabiliserDemand, 0, "pad supports the upper arm");
});

test("a cable from a far-away pulley straight below behaves like gravity", () => {
  const cable = { ...v("cable-low"), proximalAngle: 0 };
  const r = analyze(ex, cable, 60, { ...opts, pulley: { x: 0, y: -1e6 } });
  const d = analyze(ex, v("dumbbell"), 60, opts);
  close(r.jointTorque, d.jointTorque, 1e-3);
});

test("Bayesian cable curl keeps tension in the stretched position", () => {
  const bottomCable = analyze(ex, v("cable-bayesian"), 5, opts).loadTorque;
  const bottomDb = analyze(ex, v("dumbbell"), 5, opts).loadTorque;
  assert.ok(bottomCable > 3 * bottomDb, `${bottomCable} vs ${bottomDb}`);
});

test("effort is torque divided by angle-specific capacity", () => {
  const r = analyze(ex, v("dumbbell"), 90, opts);
  close(r.effort, r.jointTorque / 60);
});
