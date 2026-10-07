// Multi-joint statics: hand formulas, equilibrium checks and the lifts' teaching points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeMulti, sampleMulti, jointTorque, ik2 } from "../js/multijoint.js";
import { G } from "../js/physics.js";

const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const opts = { loadKg: 60, bodyMassKg: 75, body };
const run = (id, vid, x, o = opts) => {
  const ex = load(id);
  return analyzeMulti(ex, ex.variants.find((v) => v.id === vid), x, o);
};
const J = (r, id) => r.joints.find((j) => j.id === id);

test("body segment masses add up to the whole body", () => {
  const m = body.mass;
  close(2 * (m.foot + m.shank + m.thigh + m.upperArm + m.forearmHand) + m.headTrunk, 1, 1e-9);
});

test("jointTorque: one weight in front of the hip, trunk side free = m·g·d", () => {
  const r = jointTorque({ x: 0, y: 1 }, [{ at: { x: 0.3, y: 1.4 }, f: { x: 0, y: -10 * G } }], "hip-extension", "proximal");
  close(r.torque, 10 * G * 0.3);
  close(r.momentArm, 0.3);
  close(r.foot.x, 0.3);
});

test("ik2 keeps both segment lengths", () => {
  const a = { x: 0, y: 0 }, b = { x: 0.5, y: 0.4 };
  const k = ik2(a, b, 0.43, 0.43, 1);
  close(Math.hypot(k.x - a.x, k.y - a.y), 0.43);
  close(Math.hypot(b.x - k.x, b.y - k.y), 0.43);
});

// ---------- squat and hinge ----------
for (const [id, vids, xs] of [["squat", ["high-bar", "low-bar", "front", "goblet"], [20, 60, 100, 120]], ["romanian-deadlift", ["barbell", "stiff-leg"], [20, 50, 90]]]) {
  for (const vid of vids) {
    test(`${id}/${vid}: centre of mass over the mid-foot, and torques match the hand formulas`, () => {
      for (const x of xs) {
        const r = run(id, vid, x);
        assert.ok(r.balance.ok, `balanced @${x}`);
        close(r.balance.com, r.balance.x, 1e-6);
        const { trunk, arms, load: bar, thigh, shank } = r.parts;
        const hip = J(r, "hip"), knee = J(r, "knee"), ankle = J(r, "ankle");
        // Per leg: half of trunk, arms and load; one thigh and one shank.
        const above = [[trunk, 0.5], [arms, 0.5], [bar, 0.5]];
        const sum = (list, ref, sign) => list.reduce((s, [p, k]) => s + sign * k * p.kg * G * (p.at.x - ref.x), 0);
        close(hip.torque, sum(above, hip.at, 1), 1e-6); // mass in front of the hip → hip extensors
        close(knee.torque, sum([...above, [thigh, 1]], knee.at, -1), 1e-6); // mass behind the knee → knee extensors
        close(ankle.torque, sum([...above, [thigh, 1], [shank, 1]], ankle.at, 1), 1e-6); // in front of the ankle → calves
      }
    });
  }
}

test("squat: bottom-up from the floor gives the same ankle torque as top-down", () => {
  for (const x of [30, 90]) {
    const r = run("squat", "high-bar", x);
    const p = r.parts;
    const W = (p.trunk.kg + p.arms.kg + p.load.kg + 2 * (p.thigh.kg + p.shank.kg + p.foot.kg)) * G;
    const A = J(r, "ankle").at;
    // Each foot: floor pushes W/2 up under the centre of mass; the foot's own weight acts at the mid-foot.
    const fromBelow = jointTorque(A, [{ at: { x: r.balance.com, y: 0 }, f: { x: 0, y: W / 2 } }, { at: p.foot.at, f: { x: 0, y: -p.foot.kg * G } }], "plantarflexion", "distal");
    close(fromBelow.torque, J(r, "ankle").torque, 1e-6);
  }
});

test("low-bar squat moves torque to the hips; front squat moves it to the knees", () => {
  const ratio = (vid) => { const r = run("squat", vid, 100); return J(r, "hip").torque / J(r, "knee").torque; };
  assert.ok(ratio("low-bar") > ratio("high-bar"), `${ratio("low-bar")} vs ${ratio("high-bar")}`);
  assert.ok(ratio("front") < ratio("high-bar"), `${ratio("front")} vs ${ratio("high-bar")}`);
});

test("Romanian deadlift: hip torque grows with the hinge; the knee needs its flexors", () => {
  const ex = load("romanian-deadlift");
  const curve = sampleMulti(ex, ex.variants[0], opts, 10).map((s) => J(s, "hip").torque);
  curve.forEach((t, i) => i && assert.ok(t > curve[i - 1]));
  assert.ok(J(run("romanian-deadlift", "barbell", 80), "knee").torque < 0);
});

// ---------- split squat ----------
test("split squat: floor and bench share the weight; leaning forward shifts work from knee to hip", () => {
  for (const x of [40, 70, 100]) {
    const r = run("split-squat", "bulgarian", x, { ...opts, loadKg: 20 });
    assert.ok(r.shares.front > 0.5 && r.shares.front < 1, `${r.shares.front}`);
    // Front knee, bottom-up: floor push at the mid-foot minus the foot and shank weights.
    const K = J(r, "knee").at, { foot, shank } = r.parts;
    const hand = r.grf.front * (K.x - r.grf.at.x) - foot.kg * G * (K.x - foot.at.x) - shank.kg * G * (K.x - shank.at.x);
    close(J(r, "knee").torque, hand, 1e-6);
  }
  const up = run("split-squat", "bulgarian", 90, { ...opts, loadKg: 20 });
  const lean = run("split-squat", "bulgarian-lean", 90, { ...opts, loadKg: 20 });
  assert.ok(J(lean, "hip").torque > J(up, "hip").torque);
  assert.ok(J(lean, "knee").torque < J(up, "knee").torque);
});

// ---------- leg press ----------
test("leg press: with the push line through the hip, the hip has no torque from the sled", () => {
  const ex = load("leg-press");
  const v = { ...ex.variants[0], params: { ...ex.variants[0].params, footOffset: -body.lengths.midfoot } };
  const r = analyzeMulti(ex, v, 70, { ...opts, loadKg: 100, bodyMassKg: 1e-9 });
  close(J(r, "hip").torque, 0, 1e-6);
  // Knee: sled force per leg × perpendicular distance from the knee to the push line.
  const F = (100 * G * Math.sin(Math.PI / 4)) / 2;
  close(J(r, "knee").torque, F * J(r, "knee").momentArm, 1e-6);
});

test("leg press: feet high = more hip, less knee; feet low = the opposite", () => {
  const at = (vid) => run("leg-press", vid, 90, { ...opts, loadKg: 100 });
  const [hi, mid, lo] = ["high", "middle", "low"].map(at);
  assert.ok(J(hi, "hip").torque > J(mid, "hip").torque && J(mid, "hip").torque > J(lo, "hip").torque);
  assert.ok(J(hi, "knee").torque < J(mid, "knee").torque && J(mid, "knee").torque < J(lo, "knee").torque);
});

// ---------- hip thrust ----------
test("hip thrust: reactions balance the weight, and the hip torque is the same from either side", () => {
  for (const vid of ["barbell", "feet-far"]) {
    for (const x of [0, 30, 60]) {
      const r = run("hip-thrust", vid, x);
      close(r.reactions.shoulder + r.reactions.feet, r.reactions.weight, 1e-6);
      assert.ok(r.reactions.shoulder > 0 && r.reactions.feet > 0);
      close(J(r, "hip").torque, r.check.hipFromLegs, 1e-6);
      close(J(r, "hip").angle, x, 1e-6);
    }
  }
});

test("glute bridge flags hip angles that would put the hips through the floor", () => {
  assert.ok(!run("hip-thrust", "bridge", 10).info.some((i) => i.warn));
  assert.ok(run("hip-thrust", "bridge", 70).info.some((i) => i.warn));
});

// ---------- bench press ----------
test("bench press: shoulder torque = half the bar × g × horizontal distance; none at lockout", () => {
  const ex = load("bench-press");
  const flat = ex.variants.find((v) => v.id === "flat");
  const o = { ...opts, bodyMassKg: 1e-9 };
  close(J(analyzeMulti(ex, flat, 0, o), "shoulder").torque, 30 * G * flat.params.touch.x, 1e-6);
  close(J(analyzeMulti(ex, flat, 100, o), "shoulder").torque, 30 * G * flat.params.lockout.x, 1e-6);
});
