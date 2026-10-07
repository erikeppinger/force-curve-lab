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
  close(r.effort, r.jointTorque / (interp(ex.strengthCurve.points, 90) * 60));
});

test("band: tension = load·g·stretch/(refLength − restLength) towards the anchor; nothing when slack", () => {
  const band = v("band");
  const { pulley, restLength, refLength } = band.load;
  for (const a of [0, 60, 120, 145]) {
    const r = analyze(ex, band, a, opts);
    const hand = r.pose.tip;
    const len = Math.hypot(pulley.x - hand.x, pulley.y - hand.y);
    close(r.force.mag, Math.max(0, (10 * G * (len - restLength)) / (refLength - restLength)));
  }
  const slack = { ...band, load: { ...band.load, restLength: 5, refLength: 6 } };
  assert.equal(analyze(ex, slack, 90, opts).force.mag, 0);
});

test("band curl keeps rising towards the top, where the dumbbell fades", () => {
  const at = (id, a) => analyze(ex, v(id), a, opts).loadTorque;
  assert.ok(at("band", 130) > at("band", 60));
  assert.ok(at("dumbbell", 130) < at("dumbbell", 60));
});

test("strength scale: a variant's posture factor multiplies the capacity (constant or by angle)", () => {
  const ex = JSON.parse(readFileSync(new URL("../data/exercises/leg-curl.json", import.meta.url)));
  const o = { loadKg: ex.defaults.loadKg, peakTorqueNm: 100, bodyMassKg: 75 };
  const lying = ex.variants.find((v) => v.id === "lying"), seated = ex.variants.find((v) => v.id === "seated");
  const base = (a) => interp(ex.strengthCurve.points, a) * 100;
  for (const a of [10, 45, 90]) {
    assert.ok(Math.abs(analyze(ex, lying, a, o).capacity - base(a) * lying.strengthScale.factor) < 1e-9);
    assert.ok(Math.abs(analyze(ex, seated, a, o).capacity - base(a) * seated.strengthScale.factor) < 1e-9);
  }
  // Guex et al.: hip straight 62.0 Nm, hip at 90° 110.1 Nm (knee 45°) → the ratio survives the rounding.
  assert.ok(Math.abs(lying.strengthScale.factor / seated.strengthScale.factor - 62.0 / 110.1) < 0.01);
  // By angle: the reverse curl's factor is interpolated between the measured elbow angles.
  const bc = JSON.parse(readFileSync(new URL("../data/exercises/biceps-curl.json", import.meta.url)));
  const rev = bc.variants.find((v) => v.id === "reverse");
  const ob = { loadKg: 10, peakTorqueNm: 65, bodyMassKg: 75 };
  const r = analyze(bc, rev, 67.5, ob);
  assert.ok(Math.abs(r.strengthScale - (0.83 + 0.89) / 2) < 1e-9);
  assert.ok(Math.abs(r.capacity - interp(bc.strengthCurve.points, 67.5) * 65 * r.strengthScale) < 1e-9);
  assert.equal(analyze(bc, bc.variants.find((v) => v.id === "dumbbell"), 67.5, ob).strengthScale, 1);
});
