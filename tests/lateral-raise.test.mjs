import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, interp, sampleCurve, G } from "../js/physics.js";
import { muscleActivation } from "../js/muscles.js";

const ex = JSON.parse(readFileSync(new URL("../data/exercises/lateral-raise.json", import.meta.url)));
const v = (id) => ex.variants.find((x) => x.id === id);
const opts = { loadKg: 5, peakTorqueNm: 50 };
const L = ex.segments.upperArm + ex.segments.forearm; // straight arm, shoulder → grip
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const sin = (deg) => Math.sin((deg * Math.PI) / 180);

test("dumbbell lateral raise torque = m·g·L·sin(angle) about the shoulder", () => {
  for (const a of [0, 30, 60, 90]) {
    close(analyze(ex, v("dumbbell"), a, opts).jointTorque, 5 * G * L * sin(a));
  }
  const top = analyze(ex, v("dumbbell"), 90, opts);
  close(top.momentArm, L);
  close(top.pose.hand.x, L);
  close(top.pose.hand.y, 0);
});

test("dumbbell lateral raise is hardest at the top of the range", () => {
  const curve = sampleCurve(ex, v("dumbbell"), opts, 0.5);
  const peak = curve.reduce((m, s) => (s.jointTorque > m.jointTorque ? s : m));
  assert.equal(peak.angle, 90);
  const effortPeak = curve.reduce((m, s) => (s.effort > m.effort ? s : m));
  assert.equal(effortPeak.angle, 90, "sticking point at shoulder height");
});

test("cable from the opposite side: hand-computed torque at the bottom", () => {
  // Arm hanging: hand at (0, -L). Torque = -r × F = m·g·L·(-px) / |pulley - hand|.
  const { x: px, y: py } = v("cable").load.pulley;
  const expected = (5 * G * L * -px) / Math.hypot(px, py + L);
  close(analyze(ex, v("cable"), 0, opts).jointTorque, expected);
  assert.ok(expected > 0);
  close(analyze(ex, v("dumbbell"), 0, opts).jointTorque, 0);
});

test("cable curve is flatter than the dumbbell curve", () => {
  const spread = (id) => {
    const t = sampleCurve(ex, v(id), opts).map((s) => s.jointTorque);
    return Math.min(...t) / Math.max(...t);
  };
  assert.ok(spread("cable") > 0.5, `cable min/max ${spread("cable")}`);
  close(spread("dumbbell"), 0);
});

test("machine torque = m·g·r(angle) from the cam table, applied at the pad", () => {
  const { padDistance, camProfile } = v("machine").load;
  for (const [a, r] of camProfile.points) {
    const res = analyze(ex, v("machine"), a, opts);
    close(res.jointTorque, 5 * G * r);
    close(res.momentArm, padDistance);
    close(Math.hypot(res.force.at.x, res.force.at.y), padDistance);
  }
  // Between table points the radius is interpolated linearly.
  close(analyze(ex, v("machine"), 45, opts).jointTorque, 5 * G * interp(camProfile.points, 45));
});

test("machine pad pushes perpendicular to the arm, against the raise", () => {
  for (const a of [0, 45, 90]) {
    const { force, pose } = analyze(ex, v("machine"), a, opts);
    const arm = { x: pose.hand.x - pose.shoulder.x, y: pose.hand.y - pose.shoulder.y };
    close(force.x * arm.x + force.y * arm.y, 0, 1e-9);
  }
  const top = analyze(ex, v("machine"), 90, opts).force;
  close(top.x, 0, 1e-9);
  assert.ok(top.y < 0, "pushes the horizontal arm down");
});

test("no shoulder-stabiliser demand when the shoulder is the moving joint", () => {
  for (const id of ["dumbbell", "cable", "machine"]) {
    assert.equal(analyze(ex, v(id), 60, opts).shoulderFlexorDemand, 0);
  }
});

test("muscle activation stays in [0, 1] and follows effort", () => {
  const r = analyze(ex, v("dumbbell"), 90, opts);
  const act = muscleActivation(ex, v("dumbbell"), r, 90);
  for (const m of act) assert.ok(m.value >= 0 && m.value <= 1, `${m.id} ${m.value}`);
  const delt = act.find((m) => m.id === "lateral-deltoid");
  close(delt.value, Math.min(1, r.effort * interp(delt.weight, 90)));
  const bottom = muscleActivation(ex, v("dumbbell"), analyze(ex, v("dumbbell"), 0, opts), 0);
  assert.ok(bottom.every((m) => m.value === 0), "dumbbell: nothing to do with the arm hanging");
});
