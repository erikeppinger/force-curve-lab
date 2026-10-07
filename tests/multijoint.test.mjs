// Multi-joint statics: hand formulas, equilibrium checks and the lifts' teaching points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeMulti, sampleMulti, jointTorque, ik2 } from "../js/multijoint.js";
import { G } from "../js/physics.js";
import { muscleActivation } from "../js/muscles.js";

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
for (const [id, vids, xs] of [["romanian-deadlift", ["barbell", "stiff-leg"], [20, 50, 90]]]) {
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

test("RDL: bottom-up from the floor gives the same ankle torque as top-down", () => {
  for (const x of [30, 80]) {
    const r = run("romanian-deadlift", "barbell", x);
    const p = r.parts;
    const W = (p.trunk.kg + p.arms.kg + p.load.kg + 2 * (p.thigh.kg + p.shank.kg + p.foot.kg)) * G;
    const A = J(r, "ankle").at;
    // Each foot: floor pushes W/2 up under the centre of mass; the foot's own weight acts at the mid-foot.
    const fromBelow = jointTorque(A, [{ at: { x: r.balance.com, y: 0 }, f: { x: 0, y: W / 2 } }, { at: p.foot.at, f: { x: 0, y: -p.foot.kg * G } }], "plantarflexion", "distal");
    close(fromBelow.torque, J(r, "ankle").torque, 1e-6);
  }
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
  // Feet straight under the hips, toes forward: the 3D model reduces to the side view.
  const v = { ...ex.variants[0], params: { ...ex.variants[0].params, footHeight: -body.lengths.midfoot, halfWidth: body.lengths.hipHalfWidth, toeOut: 0, kneeTrack: 0 } };
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

// ---------- leg press in 3D: stance width, toe angle, knee tracking ----------
{
  const ex = load("leg-press");
  const preset = (vid) => ex.variants.find((v) => v.id === vid);
  const at = (vid, x = 90, placement) => analyzeMulti(ex, preset(vid), x, { ...opts, loadKg: 150, placement });
  const sagittal = { halfWidth: body.lengths.hipHalfWidth, toeOut: 0, kneeTrack: 0 };

  test("leg press 3D: with the feet under the hips and toes forward, nothing leaves the side-view plane", () => {
    for (const x of [20, 60, 100]) {
      const r = at("middle", x, sagittal);
      for (const id of ["hip-frontal", "hip-rotation", "knee-frontal"]) close(J(r, id).torque, 0, 1e-9);
    }
  });

  test("leg press 3D: hip moment vector = F·(a·z − dz·v) for a straight foot set out to the side", () => {
    // Plate push F along −u at the mid-foot; a = how far up the plate, dz = how far out from the hip.
    const placement = { footHeight: 0.1, halfWidth: 0.3, toeOut: 0, kneeTrack: 0 };
    const r = analyzeMulti(ex, preset("middle"), 70, { ...opts, loadKg: 150, bodyMassKg: 1e-9, placement });
    const F = (150 * G * Math.sin(Math.PI / 4)) / 2;
    const a = placement.footHeight + body.lengths.midfoot;
    const dz = placement.halfWidth - body.lengths.hipHalfWidth;
    const vp = { x: -Math.SQRT1_2, y: Math.SQRT1_2 }; // up the plate
    close(r.moments.hip.x, -F * dz * vp.x, 1e-6);
    close(r.moments.hip.y, -F * dz * vp.y, 1e-6);
    close(r.moments.hip.z, F * a, 1e-6);
  });

  test("leg press 3D: at 90° knee bend, hip rotation and knee valgus are the same moment; not at 60°", () => {
    const r90 = at("wide", 90), r60 = at("wide", 60);
    close(J(r90, "hip-rotation").torque, J(r90, "knee-frontal").torque, 1e-6);
    assert.ok(Math.abs(J(r60, "hip-rotation").torque - J(r60, "knee-frontal").torque) > 1);
  });

  test("leg press 3D: a wide, toes-out stance loads the adductors and hip external rotators", () => {
    const [wide, mid, narrow] = ["wide", "middle", "narrow"].map((vid) => at(vid));
    assert.ok(J(wide, "hip-frontal").torque > J(mid, "hip-frontal").torque && J(mid, "hip-frontal").torque > Math.abs(J(narrow, "hip-frontal").torque));
    assert.ok(J(wide, "hip-rotation").torque > J(mid, "hip-rotation").torque);
    const act = (r, v) => Object.fromEntries(muscleActivation(ex, preset(v), r, 90).map((m) => [m.id, m.value]));
    assert.ok(act(wide, "wide").adductors > act(mid, "middle").adductors);
    assert.equal(act(wide, "wide")["gluteus-medius"], 0, "abductors idle while the adductors work");
  });

  test("leg press 3D: knees caving in raises the knee's valgus moment; knees out lowers it", () => {
    const valgus = (k) => J(at("middle", 90, { kneeTrack: k }), "knee-frontal").torque;
    assert.ok(valgus(-10) > valgus(0) && valgus(0) > valgus(10));
  });
}

// ---------- squat in 3D ----------
{
  const ex = load("squat");
  const preset = (vid) => ex.variants.find((v) => v.id === vid);
  const at = (vid, x, placement, o = opts) => analyzeMulti(ex, preset(vid), x, { ...o, placement });
  const under = { halfWidth: body.lengths.hipHalfWidth, toeOut: 0, kneeTrack: 0, sidePush: 0 };

  test("3D squat with the feet under the hips and toes forward = the side-view squat", () => {
    const flat = { ...ex, solver: "standing", joints: ex.joints.slice(0, 3) };
    for (const vid of ["high-bar", "low-bar", "front"]) {
      const v2 = { ...preset(vid), params: { ...preset(vid).params, mode: "squat" } };
      for (const x of [30, 90, 120]) {
        const r3 = at(vid, x, under), r2 = analyzeMulti(flat, v2, x, opts);
        for (const id of ["hip", "knee", "ankle"]) close(J(r3, id).torque, J(r2, id).torque, 1e-6);
        for (const id of ["hip-frontal", "hip-rotation", "knee-frontal"]) close(J(r3, id).torque, 0, 1e-9);
        close(r3.balance.com, r3.balance.x, 1e-6);
      }
    }
  });

  test("3D squat: the least-effort sideways push really is the least effort", () => {
    const cost = (r) => r.joints.filter((j) => !j.passive).reduce((s, j) => s + (j.effort ?? 0) ** 2, 0);
    for (const vid of ["high-bar", "wide"]) {
      for (const x of [40, 100]) {
        const best = cost(at(vid, x, { sidePush: "auto" }));
        for (const fixed of [-0.2, 0, 0.1, 0.3, 0.6]) assert.ok(best <= cost(at(vid, x, { sidePush: fixed })) + 1e-9, `${vid}@${x} vs ${fixed}`);
      }
    }
  });

  test("3D squat: low-bar moves torque to the hips, front squat to the knees; balance holds", () => {
    const ratio = (vid) => { const r = at(vid, 100); assert.ok(r.balance.ok); close(r.balance.com, r.balance.x, 1e-6); return J(r, "hip").torque / J(r, "knee").torque; };
    assert.ok(ratio("low-bar") > ratio("high-bar") && ratio("front") < ratio("high-bar"));
  });

  test("3D squat: knees caving in raises the knee's valgus moment at the same sideways push", () => {
    const valgus = (k) => J(at("high-bar", 100, { kneeTrack: k, sidePush: 0.1 }), "knee-frontal").torque;
    assert.ok(valgus(-12) > valgus(0) + 10);
  });

  test("3D squat: wide stance with vertical shins is hip-dominant", () => {
    const r = at("wide", 100);
    assert.ok(J(r, "hip").torque > J(r, "knee").torque);
  });
}

// ---------- bench press in 3D ----------
{
  const ex = load("bench-press");
  const preset = (vid) => ex.variants.find((v) => v.id === vid);
  const at = (vid, x, placement, o = opts) => analyzeMulti(ex, preset(vid), x, { ...o, placement });
  const noBody = { ...opts, loadKg: 80, bodyMassKg: 1e-9 };

  test("3D bench: shoulder components match the hand formulas (bar force F = half the bar per hand)", () => {
    const F = 40 * G;
    for (const vid of ["flat", "wide", "close"]) {
      for (const x of [0, 50]) {
        const r = at(vid, x, undefined, noBody);
        const S = J(r, "shoulder-h").at, hand = r.forces[0].at;
        close(J(r, "shoulder-flex").torque, F * (hand.x - S.x), 1e-6); // bar in front of (towards the feet from) the shoulder
        close(J(r, "shoulder-h").torque, F * (hand.z - S.z), 1e-6); // hands outside the shoulders → pecs
      }
    }
  });

  test("3D bench: the elbow's moment is F × the horizontal elbow–hand distance; elbows stacked under the hands", () => {
    const F = 40 * G;
    for (const vid of ["flat", "close"]) {
      const r = at(vid, 0, undefined, noBody);
      const E = J(r, "elbow").at, hand = r.forces[0].at;
      const horiz = Math.hypot(hand.x - E.x, hand.z - E.z);
      const M = r.moments.elbow;
      close(Math.hypot(M.x, M.y, M.z), F * horiz, 1e-6);
      close(J(r, "elbow").momentArm, horiz, 1e-6);
      close(E.z, hand.z, 1e-3);
    }
  });

  test("3D bench: close grip loads the triceps, wide grip the pecs", () => {
    const [w, c] = [at("wide", 30, undefined, { ...opts, loadKg: 80 }), at("close", 30, undefined, { ...opts, loadKg: 80 })];
    assert.ok(J(c, "elbow").torque > 1.5 * J(w, "elbow").torque);
    assert.ok(J(w, "shoulder-h").torque > 5 * J(c, "shoulder-h").torque);
  });
}
