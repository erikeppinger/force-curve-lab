// Multi-joint statics: hand formulas, equilibrium checks and the lifts' teaching points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeMulti, sampleMulti, jointTorque, ik2, jointScaleAt } from "../js/multijoint.js";
import { G, interp } from "../js/physics.js";
import { muscleActivation } from "../js/muscles.js";

const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const opts = { loadKg: 60, bodyMassKg: 75, body };
// These lifts run in 3D in the app; the side-view tests below check their 2D solvers.
const TWO_D = { "romanian-deadlift": "standing", "split-squat": "split", "hip-thrust": "hipThrust", "bent-over-row": "standing", "seated-row": "seatedRow" };
const ONLY_3D = ["hip-frontal", "hip-rotation", "knee-frontal", "shoulder-h", "shoulder-rotation", "elbow-side"];
const load2d = (id) => { const ex = load(id); return TWO_D[id] ? { ...ex, solver: TWO_D[id], joints: ex.joints.filter((j) => !ONLY_3D.includes(j.id)) } : ex; };
const run = (id, vid, x, o = opts) => {
  const ex = load2d(id);
  return analyzeMulti(ex, ex.variants.find((v) => v.id === vid), x, o);
};
const J = (r, id) => r.joints.find((j) => j.id === id);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t });

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
for (const [id, vids, xs] of [["romanian-deadlift", ["barbell", "stiff-leg"], [20, 50, 90]], ["deadlift", ["conventional", "trap-bar"], [0, 60, 90, 135]], ["bent-over-row", ["barbell", "pendlay", "upright"], [0, 50, 100]]]) {
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
  const ex = load2d("romanian-deadlift");
  const curve = sampleMulti(ex, ex.variants[0], opts, 10).map((s) => J(s, "hip").torque);
  curve.forEach((t, i) => i && assert.ok(t > curve[i - 1]));
  assert.ok(J(run("romanian-deadlift", "barbell", 80), "knee").torque < 0);
});

// Shin front at height y: the line A→K (or K→H) plus the drawn half-width and the bar radius.
const legFrontAt = (r, y) => {
  const [A, K, H] = ["ankle", "knee", "hip"].map((id) => J(r, id).at);
  const [p, q, half] = y <= K.y ? [A, K, 0.05] : [K, H, 0.07];
  return p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y) + half + 0.015;
};

test("deadlift: the conventional bar never passes through the legs, and the arms stay straight", () => {
  const arm = body.lengths.upperArm + body.lengths.forearm;
  for (let x = 0; x <= 135; x += 5) {
    const r = run("deadlift", "conventional", x);
    const bar = r.loads[0].at, S = r.arms[0].from;
    close(Math.hypot(bar.x - S.x, bar.y - S.y), arm, 1e-9);
    assert.ok(bar.x >= legFrontAt(r, bar.y) - 1e-4, `@${x}: bar ${bar.x} inside the legs`);
    assert.ok(bar.x >= S.x - 1e-9, `@${x}: arms only swing forward`);
  }
  // Somewhere around the knees the rule is active: the bar sits in front of the shoulders.
  assert.ok([60, 90, 110].some((x) => { const r = run("deadlift", "conventional", x); return r.loads[0].at.x > r.arms[0].from.x + 0.02; }));
});

test("deadlift: the trap bar hangs straight down and moves work from the hip to the knee", () => {
  for (const x of [0, 60, 120]) {
    const r = run("deadlift", "trap-bar", x);
    close(r.loads[0].at.x, r.arms[0].from.x, 1e-12);
  }
  for (const x of [90, 120, 135]) {
    const c = run("deadlift", "conventional", x), t = run("deadlift", "trap-bar", x);
    assert.ok(J(t, "hip").torque < J(c, "hip").torque, `@${x}: hip`);
    assert.ok(J(t, "knee").torque > J(c, "knee").torque, `@${x}: knee`);
  }
});

test("deadlift: the bottom of the range is about where the bar sits on the floor", () => {
  for (const vid of ["conventional", "trap-bar"]) {
    const y = run("deadlift", vid, 135).loads[0].at.y;
    assert.ok(y > 0.17 && y < 0.27, `${vid}: bar at ${y} m (plates hold it about 0.225 m up)`);
  }
});

test("bent-over row: shoulder and elbow torques match the hand formulas (half the load per arm)", () => {
  const F = 20 * G;
  for (const vid of ["barbell", "pendlay", "upright"]) {
    for (const x of [0, 40, 80, 100]) {
      const r = run("bent-over-row", vid, x, { ...opts, loadKg: 40, bodyMassKg: 1e-9 });
      const hand = r.loads[0].at, S = J(r, "shoulder").at, E = J(r, "elbow").at;
      close(J(r, "elbow").torque, F * (hand.x - E.x), 1e-6); // hand in front of the elbow → flexors
      close(J(r, "shoulder").torque, F * (S.x - hand.x), 1e-6); // hand behind the shoulder → extensors (lats)
      close(Math.hypot(E.x - S.x, E.y - S.y), body.lengths.upperArm, 1e-9);
      close(Math.hypot(hand.x - E.x, hand.y - E.y), body.lengths.forearm, 1e-9);
    }
  }
});

test("bent-over row: the flatter the trunk, the more hip torque; the pull brings the bar closer to the hips", () => {
  for (const x of [0, 50, 100]) {
    const [p, b, u] = ["pendlay", "barbell", "upright"].map((vid) => J(run("bent-over-row", vid, x), "hip").torque);
    assert.ok(p > b && b > u, `@${x}: ${p} > ${b} > ${u}`);
  }
  const ex = load("bent-over-row");
  const hip = sampleMulti(ex, ex.variants.find((v) => v.id === "pendlay"), opts, 10).map((s) => J(s, "hip").torque);
  hip.forEach((t, i) => i && assert.ok(t < hip[i - 1]));
  // Upright: the load travels along the trunk, so the shoulder does little and the elbow flexors more.
  const [top, flat] = [run("bent-over-row", "upright", 100), run("bent-over-row", "pendlay", 100)];
  assert.ok(J(top, "shoulder").torque < 0.3 * J(flat, "shoulder").torque);
  assert.ok(J(top, "elbow").torque > J(flat, "elbow").torque);
});

test("seated cable row: torques match the hand formulas for the cable's pull", () => {
  const F = 20 * G; // per hand
  for (const vid of ["upright", "lean-back", "lean-forward"]) {
    for (const x of [0, 50, 100]) {
      const r = run("seated-row", vid, x, { ...opts, loadKg: 40, bodyMassKg: 1e-9 });
      const ex = load("seated-row"), P = ex.variants.find((v) => v.id === vid).params;
      const hand = r.loads[0].at, S = J(r, "shoulder").at, E = J(r, "elbow").at, H = J(r, "hip").at;
      const d = { x: P.pulley.x - hand.x, y: P.pulley.y - hand.y }, l = Math.hypot(d.x, d.y);
      const f = { x: (F * d.x) / l, y: (F * d.y) / l };
      const M = (o) => (hand.x - o.x) * f.y - (hand.y - o.y) * f.x; // moment of the cable about a point
      close(J(r, "shoulder").torque, M(S), 1e-6); // shoulder extension: counter-clockwise from the right
      close(J(r, "elbow").torque, -M(E), 1e-6); // elbow flexion: clockwise moment of the load
      close(J(r, "hip").torque, -M(H), 1e-6); // hip extension holds the trunk against the cable
    }
  }
});

test("seated cable row: leaning back lets body weight counter the cable; a chest pad takes the hip out", () => {
  for (const x of [0, 50, 100]) {
    const [b, u, f] = ["lean-back", "upright", "lean-forward"].map((vid) => J(run("seated-row", vid, x), "hip").torque);
    assert.ok(b < u && u < f, `@${x}: ${b} < ${u} < ${f}`);
    assert.equal(J(run("seated-row", "chest-supported", x), "hip").torque, 0);
  }
  // Chest-supported: dumbbells hang, so the shoulder torque is m·g × horizontal hand–shoulder distance.
  const r = run("seated-row", "chest-supported", 100, { ...opts, loadKg: 40, bodyMassKg: 1e-9 });
  close(J(r, "shoulder").torque, 20 * G * (J(r, "shoulder").at.x - r.loads[0].at.x), 1e-6);
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
        const r = at(vid, x, { barSpread: 0 }, noBody);
        const S = J(r, "shoulder-h").at, hand = r.forces[0].at;
        close(J(r, "shoulder-flex").torque, F * (hand.x - S.x), 1e-6); // bar in front of (towards the feet from) the shoulder
        close(J(r, "shoulder-h").torque, F * (hand.z - S.z), 1e-6); // hands outside the shoulders → pecs
      }
    }
  });

  test("3D bench: the elbow's moment is F × the horizontal elbow–hand distance; elbows stacked under the hands", () => {
    const F = 40 * G;
    for (const vid of ["flat", "close"]) {
      const r = at(vid, 0, { barSpread: 0, elbowOut: 0 }, noBody);
      const E = J(r, "elbow").at, hand = r.forces[0].at;
      const horiz = Math.hypot(hand.x - E.x, hand.z - E.z);
      const M = r.moments.elbow;
      close(Math.hypot(M.x, M.y, M.z), F * horiz, 1e-6);
      close(J(r, "elbow").momentArm, horiz, 1e-6);
      close(E.z, hand.z, 1e-3);
    }
  });

  test("3D bench: the least-effort bar spread really is the least effort", () => {
    const cost = (r) => r.joints.filter((j) => !j.passive).reduce((sum, j) => sum + (j.effort ?? 0) ** 2, 0);
    for (const vid of ["flat", "wide", "close"]) {
      for (const x of [0, 50]) {
        const best = cost(at(vid, x, { barSpread: "auto" }, { ...opts, loadKg: 80 }));
        for (const fixed of [-0.4, -0.1, 0, 0.1, 0.4]) assert.ok(best <= cost(at(vid, x, { barSpread: fixed }, { ...opts, loadKg: 80 })) + 1e-9, `${vid}@${x} vs ${fixed}`);
      }
    }
  });

  test("3D bench: close grip loads the triceps, wide grip the pecs", () => {
    const [w, c] = [at("wide", 30, undefined, { ...opts, loadKg: 80 }), at("close", 30, undefined, { ...opts, loadKg: 80 })];
    assert.ok(J(c, "elbow").torque > 1.5 * J(w, "elbow").torque);
    assert.ok(J(w, "shoulder-h").torque > 4 * J(c, "shoulder-h").torque);
  });

  test("3D bench: elbows under the bar (auto) give the smallest elbow moment arm the arm allows for a vertical push", () => {
    const ma = (r) => { const M = r.moments.elbow; return Math.hypot(M.x, M.y, M.z) / (40 * G); };
    for (const vid of ["flat", "wide", "close"]) {
      for (const x of [0, 40, 80]) {
        const best = ma(at(vid, x, { barSpread: 0, elbowOut: "auto" }, noBody));
        for (const off of [-0.06, -0.02, 0, 0.03, 0.06, 0.1]) {
          assert.ok(best <= ma(at(vid, x, { barSpread: 0, elbowOut: off }, noBody)) + 1e-6, `${vid}@${x} vs ${off}`);
        }
        // At that point the push line lies in the arm's plane: no sideways moment at the elbow.
        close(J(at(vid, x, { barSpread: 0, elbowOut: "auto" }, noBody), "elbow-side").torque, 0, 1e-3);
      }
    }
  });

  test("3D bench: elbow moment arms near the measured ones (Mausehund et al.: 7.2 cm mean, 9.2 cm peak, medium grip)", () => {
    const mas = [];
    for (let x = 0; x <= 95; x += 5) { const M = at("flat", x, undefined, noBody).moments.elbow; mas.push(Math.hypot(M.x, M.y, M.z) / (40 * G)); }
    const mean = mas.reduce((a, b) => a + b) / mas.length, peak = Math.max(...mas);
    assert.ok(mean > 0.05 && mean < 0.1, `mean ${mean}`);
    assert.ok(peak > 0.07 && peak < 0.13, `peak ${peak}`);
    // Elbow torque: narrow > medium > wide, as measured.
    const T = (vid) => J(at(vid, 40, undefined, { ...opts, loadKg: 80 }), "elbow").torque;
    assert.ok(T("close") > T("flat") && T("flat") > T("wide"));
  });
}

// ---------- overhead press in 3D ----------
{
  const ex = load("overhead-press");
  const preset = (vid) => ex.variants.find((v) => v.id === vid);
  const at = (vid, x, placement, o = opts) => analyzeMulti(ex, preset(vid), x, { ...o, placement });
  const noBody = { ...opts, loadKg: 40, bodyMassKg: 1e-9 };
  const F = 20 * G; // half the bar per hand

  test("3D overhead press: shoulder components match the hand formulas", () => {
    for (const vid of ["standing", "wide", "behind-neck", "seated-dumbbell"]) {
      for (const x of [0, 40, 80]) {
        const r = at(vid, x, { barSpread: 0 }, noBody);
        const S = J(r, "shoulder-flex").at, hand = r.forces[0].at;
        close(J(r, "shoulder-flex").torque, F * (hand.x - S.x), 1e-6); // bar in front of the shoulder → flexors
        close(J(r, "shoulder-abd").torque, F * (hand.z - S.z), 1e-6); // hands outside the shoulders → abductors
        close(r.moments.shoulder.y, 0, 1e-9); // a vertical force has no moment about the vertical
      }
    }
  });

  test("3D overhead press: the arms' own weight adds m·g·horizontal distance at the shoulder", () => {
    const o = { ...opts, loadKg: 0 };
    const r = at("standing", 30, { barSpread: 0 }, o);
    const { upperArm: u, forearm: f } = r.frames;
    const S = u.from, ua = lerp(u.from, u.to, body.com.upperArm), fa = lerp(f.from, f.to, body.com.forearmHand);
    const mu = body.mass.upperArm * 75 * G, mf = body.mass.forearmHand * 75 * G;
    close(J(r, "shoulder-flex").torque, mu * (ua.x - S.x) + mf * (fa.x - S.x), 1e-6);
    close(J(r, "shoulder-abd").torque, mu * (ua.z - S.z) + mf * (fa.z - S.z), 1e-6);
  });

  test("3D overhead press: arm lengths hold, elbows under the hands, lockout over the shoulders", () => {
    for (const x of [0, 50, 100]) {
      const r = at("standing", x, undefined, noBody);
      const { upperArm: u, forearm: f } = r.frames;
      close(Math.hypot(u.to.x - u.from.x, u.to.y - u.from.y, u.to.z - u.from.z), body.lengths.upperArm, 1e-9);
      close(Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y, f.to.z - f.from.z), body.lengths.forearm, 1e-9);
      if (x < 100) close(f.from.z, f.to.z, 1e-3);
    }
    const top = at("standing", 100, undefined, noBody);
    close(top.forces[0].at.x, J(top, "shoulder-flex").at.x, 1e-9);
    close(J(top, "shoulder-flex").torque, 0, 1e-6);
  });

  test("3D overhead press: elbow moment = F × horizontal elbow–hand distance", () => {
    for (const x of [20, 60]) {
      const r = at("standing", x, { barSpread: 0 }, noBody);
      const E = J(r, "elbow").at, hand = r.forces[0].at, M = r.moments.elbow;
      close(Math.hypot(M.x, M.y, M.z), F * Math.hypot(hand.x - E.x, hand.z - E.z), 1e-6);
    }
  });

  test("3D overhead press: wide grip loads the side deltoid; behind the neck loads the external rotators and starts in extension", () => {
    const o = { ...opts, loadKg: 30 };
    for (const x of [10, 50]) {
      const s = at("standing", x, undefined, o), w = at("wide", x, undefined, o), b = at("behind-neck", x, undefined, o);
      assert.ok(J(w, "shoulder-abd").torque > 2 * J(s, "shoulder-abd").torque, `@${x}: abduction`);
      assert.ok(J(b, "shoulder-rotation").torque > Math.abs(J(s, "shoulder-rotation").torque) + 5, `@${x}: rotation`);
      assert.ok(J(b, "shoulder-flex").torque < 0 && J(s, "shoulder-flex").torque > 0, `@${x}: flexion sign`);
    }
  });

  test("3D overhead press: dumbbells can't push sideways; with a bar the least-effort spread is the minimum", () => {
    const r = at("seated-dumbbell", 40, { barSpread: "auto" });
    close(r.forces[0].dir.z, 0, 1e-12);
    const cost = (q) => q.joints.filter((j) => !j.passive).reduce((sum, j) => sum + (j.effort ?? 0) ** 2, 0);
    for (const x of [10, 60]) {
      const best = cost(at("wide", x, { barSpread: "auto" }));
      for (const fixed of [-0.3, 0, 0.3]) assert.ok(best <= cost(at("wide", x, { barSpread: fixed })) + 1e-9, `@${x} vs ${fixed}`);
    }
  });
}

// ---------- Romanian deadlift, split squat and hip thrust in 3D ----------
{
  const run3d = (id, vid, x, placement, o = opts) => { const ex = load(id); return analyzeMulti(ex, ex.variants.find((v) => v.id === vid), x, { ...o, placement }); };
  const flat = { halfWidth: body.lengths.hipHalfWidth, toeOut: 0, kneeTrack: 0, sidePush: 0 };

  test("3D hinge and hip thrust reduce exactly to the side view with feet under the hips", () => {
    for (const [id, vids, xs] of [["romanian-deadlift", ["barbell", "stiff-leg"], [10, 45, 80]], ["hip-thrust", ["barbell", "feet-far"], [10, 40]]]) {
      for (const vid of vids) {
        for (const x of xs) {
          const a = run(id, vid, x), b = run3d(id, vid, x, flat);
          for (const j of ["hip", "knee", "ankle"]) close(J(b, j).torque, J(a, j).torque, 1e-6);
          for (const j of ["hip-frontal", "hip-rotation", "knee-frontal"]) close(J(b, j).torque, 0, 1e-6);
        }
      }
    }
  });

  test("3D split squat: contacts carry the weight; with no sideways push the centre of mass sits on the line between them", () => {
    for (const vid of ["bulgarian", "split", "tightrope"]) {
      for (const x of [50, 80]) {
        const r = run3d("split-squat", vid, x, { sidePush: 0 });
        const [c1, c2] = r.contacts, u = { x: c2.x - c1.x, z: c2.z - c1.z }, w = { x: r.com.x - c1.x, z: r.com.z - c1.z };
        close(u.x * w.z - u.z * w.x, 0, 1e-6);
        close(r.frontal.F1 + r.frontal.F2, r.frontal.W, 1e-9);
        assert.ok(r.shares.front > 0.5 && r.shares.front < 1, `${vid}@${x}: front share ${r.shares.front}`);
        // Side view barely changes: within a few percent of the 2D split squat.
        if (vid !== "tightrope") for (const j of ["hip", "knee"]) assert.ok(Math.abs(J(r, j).torque / J(run("split-squat", vid, x), j).torque - 1) < 0.03, `${vid}@${x} ${j}`);
      }
    }
  });

  test("3D split squat with a sideways foot push: moments balance about the front-back axis (hand formula)", () => {
    for (const vid of ["bulgarian", "split", "tightrope"]) {
      for (const x of [50, 80]) {
        for (const push of ["auto", 0.2, -0.2]) {
          const r = run3d("split-squat", vid, x, { sidePush: push });
          const [c1, c2] = r.contacts, { F1, F2, W, rearY } = r.frontal, rho = r.sidePush;
          // Σ (y·Fz − z·Fy): front contact (0, F1, −ρF1) at the floor, rear (0, F2, +ρF1) at rearY, weight at the centre of mass.
          const M = -c1.z * F1 + (rearY * rho * F1 - c2.z * F2) + r.com.z * W;
          close(M, 0, 1e-4 * W);
          close(F1 + F2, W, 1e-9);
          assert.ok(Math.abs(rho) <= 0.6);
        }
      }
    }
  });

  test("3D split squat: feet in line ('tightrope') load the front hip's side and rotators more, or need more sideways push", () => {
    for (const x of [60, 90]) {
      const t = run3d("split-squat", "tightrope", x, { sidePush: 0 }), b = run3d("split-squat", "bulgarian", x, { sidePush: 0 });
      assert.ok(Math.abs(J(t, "hip-frontal").torque) > 1.2 * Math.abs(J(b, "hip-frontal").torque), `@${x}: frontal`);
      assert.ok(Math.abs(J(t, "hip-rotation").torque) > 1.2 * Math.abs(J(b, "hip-rotation").torque), `@${x}: rotation`);
      assert.ok(Math.abs(t.pelvisShift) < Math.abs(b.pelvisShift));
      // With the floor allowed to push sideways (least effort), the rotation load nearly vanishes,
      // and the narrow stance shows up as a larger push instead.
      const ta = run3d("split-squat", "tightrope", x), ba = run3d("split-squat", "bulgarian", x);
      assert.ok(J(ta, "hip-rotation").effort < 0.2 && J(ba, "hip-rotation").effort < 0.2);
      assert.ok(Math.abs(ta.sidePush) > Math.abs(ba.sidePush));
    }
  });

  test("3D hip thrust: knees caving in costs frontal-plane torque unless the feet push outwards", () => {
    const fixed = run3d("hip-thrust", "knees-in", 10, { sidePush: 0 }), auto = run3d("hip-thrust", "knees-in", 10);
    assert.ok(Math.abs(J(fixed, "hip-rotation").torque) > 5 && Math.abs(J(fixed, "knee-frontal").torque) > 5);
    assert.ok(auto.sidePush > 0.03, "least effort pushes the feet outwards");
    // Reactions add up to the weight.
    close(auto.reactions.shoulder + auto.reactions.feet, auto.reactions.weight, 1e-6);
    // The whole range is reachable, as in the side view (knees stay above the hip–ankle line).
    for (const vid of ["barbell", "knees-in", "wide"]) for (let x = 0; x <= 80; x += 10) assert.ok(!run3d("hip-thrust", vid, x).info.some((i) => i.warn), `${vid}@${x}`);
  });

  test("3D Romanian deadlift: wide toes-out stance, the floor's sideways push replaces adductor work", () => {
    const z = run3d("romanian-deadlift", "wide", 70, { sidePush: 0 }), a = run3d("romanian-deadlift", "wide", 70);
    assert.ok(J(z, "hip-frontal").torque > 3 * Math.abs(J(a, "hip-frontal").torque));
    assert.ok(a.balance.ok);
    close(a.balance.com, a.balance.x, 1e-6);
  });
}

// ---------- rows in 3D ----------
{
  const run3d = (id, vid, x, placement, o = opts, edit = (v) => v) => { const ex = load(id); return analyzeMulti(ex, edit(ex.variants.find((v) => v.id === vid)), x, { ...o, placement }); };
  const shw = body.lengths.shoulderHalfWidth;
  const sideView = { gripHalf: shw, flare: 0 };
  const pulleyAtShoulder = (v) => (v.params.pulley ? { ...v, params: { ...v.params, pulley: { ...v.params.pulley, z: shw } } } : v);

  test("3D rows reduce exactly to the side view with the elbows tucked and the hands at shoulder width", () => {
    for (const [id, vids] of [["bent-over-row", ["barbell", "pendlay", "upright"]], ["seated-row", ["upright", "lean-back", "lean-forward", "chest-supported"]]]) {
      for (const vid of vids) {
        for (const x of [20, 50, 100]) {
          const a = run(id, vid, x), b = run3d(id, vid, x, sideView, opts, pulleyAtShoulder);
          for (const j of a.joints) close(J(b, j.id).torque, j.torque, 1e-6);
          for (const j of ["shoulder-h", "shoulder-rotation", "elbow-side"]) close(J(b, j).torque, 0, 1e-6);
        }
      }
    }
  });

  test("3D bent-over row: rear-delt torque = F × the hand's sideways offset × the trunk's forward tilt", () => {
    const F = 20 * G;
    for (const pl of [{ flare: 0, gripHalf: 0.3 }, { flare: 60, gripHalf: 0.3 }, { flare: 80, gripHalf: 0.35 }]) {
      for (const x of [30, 80]) {
        const r = run3d("bent-over-row", "pendlay", x, pl, { ...opts, loadKg: 40, bodyMassKg: 1e-9 });
        const { hand, S } = r.parts;
        const t = r.frames.trunk, backX = (t.to.x - t.from.x) / Math.hypot(t.to.x - t.from.x, t.to.y - t.from.y);
        close(J(r, "shoulder-h").torque, F * (hand.z - S.z) * backX, 1e-6);
      }
    }
  });

  test("3D rows: flaring the elbows moves work from the lats to the rear delts", () => {
    for (const [id, vid] of [["bent-over-row", "barbell"], ["seated-row", "upright"]]) {
      for (const x of [50, 100]) {
        const tucked = run3d(id, vid, x, { flare: 0 }), out = run3d(id, vid, x, { flare: 70, gripHalf: 0.32 });
        assert.ok(J(out, "shoulder-h").torque > J(tucked, "shoulder-h").torque + 10, `${id}@${x}: rear delts`);
        assert.ok(J(out, "shoulder").torque < J(tucked, "shoulder").torque, `${id}@${x}: lats`);
      }
    }
    // The elbows-out variants do what their notes say.
    assert.ok(J(run3d("bent-over-row", "elbows-out", 70), "shoulder-h").torque > 10);
    assert.ok(J(run3d("seated-row", "wide-bar", 70), "shoulder-h").torque > 20);
  });
}

// ---------- pulling from overhead ----------
{
  const run3d = (id, vid, x, placement, o = opts) => { const ex = load(id); return analyzeMulti(ex, ex.variants.find((v) => v.id === vid), x, { ...o, placement }); };
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

  test("pulldown: shoulder components are the cable's moment split along the trunk's axes", () => {
    for (const vid of ["wide", "close-neutral", "behind-neck"]) {
      for (const x of [20, 60, 100]) {
        const r = run3d("lat-pulldown", vid, x, undefined, { ...opts, loadKg: 40, bodyMassKg: 1e-9 });
        const { hand, S } = r.parts, f = r.forces[0].dir, F = 20 * G;
        const M = cross({ x: hand.x - S.x, y: hand.y - S.y, z: hand.z - S.z }, { x: f.x * F, y: f.y * F, z: f.z * F });
        close(J(r, "shoulder-ext").torque, M.z, 1e-6);
        close(J(r, "shoulder-add").torque, -dot(M, r.frames.trunk.anterior), 1e-6);
      }
    }
  });

  test("pull-up: each hand holds half the body; the body leans back as it rises; wide = adduction, chin-up = extension and elbows", () => {
    const r = run3d("pull-up", "pull-up", 50, undefined, { ...opts, loadKg: 10 });
    close(r.parts.F, ((75 + 10) * G) / 2, 1e-9);
    const leans = [0, 50, 100].map((x) => run3d("pull-up", "pull-up", x).parts.lean);
    assert.ok(leans[0] < leans[1] && leans[1] < leans[2], `lean ${leans}`);
    const w = run3d("pull-up", "pull-up", 50), c = run3d("pull-up", "chin-up", 50);
    assert.ok(J(w, "shoulder-add").torque > 3 * Math.abs(J(c, "shoulder-add").torque));
    assert.ok(J(c, "elbow").torque > 2 * Math.abs(J(w, "elbow").torque));
  });

  test("elbow strength grid: measured values at the grid points, bilinear in between, flat outside", () => {
    const ex = load("pull-up"), spec = ex.variants.find((v) => v.id === "chin-up").jointScale.elbow;
    close(jointScaleAt(spec, { shoulderAngle: 135, angle: 90 }), 0.7, 1e-12);
    close(jointScaleAt(spec, { shoulderAngle: 0, angle: 45 }), 1, 1e-12);
    close(jointScaleAt(spec, { shoulderAngle: 30, angle: 90 }), (1 + 0.82) / 2, 1e-12);
    close(jointScaleAt(spec, { shoulderAngle: 170, angle: 150 }), 0.75, 1e-12);
    // Chin-up grip is stronger than the pull-up grip at every grid point overhead.
    const pro = ex.variants.find((v) => v.id === "pull-up").jointScale.elbow;
    for (const e of [0, 45, 90, 120]) assert.ok(jointScaleAt(spec, { shoulderAngle: 135, angle: e }) > jointScaleAt(pro, { shoulderAngle: 135, angle: e }));
  });

  test("a muscle serving two joint components takes the larger demand (the lats)", () => {
    const ex = load("pull-up"), v = ex.variants[0], r = analyzeMulti(ex, v, 60, opts);
    const lats = muscleActivation(ex, v, r, 60).find((m) => m.id === "latissimus-dorsi");
    close(lats.value, Math.min(1, Math.max(J(r, "shoulder-ext").effort, J(r, "shoulder-add").effort)), 1e-12);
  });
}

// ---------- two-joint muscles in the multi-joint lifts ----------
test("two-joint muscles: calf strength follows the knee angle, hamstring (knee-flexor) strength the hip angle", () => {
  const ex = load("squat"), sc = ex.jointScale;
  // Cresswell et al.: 134.9 Nm straight, 103.7 Nm at 90°, relative to ~112.4 Nm at the base curve's 50°.
  close(jointScaleAt(sc.ankle, { torque: 10, angle: 0 }, { knee: { angle: 0 } }), 1.2, 1e-12);
  close(jointScaleAt(sc.ankle, { torque: 10, angle: 0 }, { knee: { angle: 90 } }), 0.92, 1e-12);
  close(jointScaleAt(sc.ankle, { torque: -10, angle: 0 }, { knee: { angle: 90 } }), 1, 1e-12); // dorsiflexors: no correction
  // Guex et al.: hip straight 62 Nm, hip 90° 110.1 Nm, relative to ~101 Nm at 70°; knee extensors untouched.
  close(jointScaleAt(sc.knee, { torque: -10, angle: 30 }, { hip: { angle: 0 } }), 0.61, 1e-12);
  close(jointScaleAt(sc.knee, { torque: 10, angle: 30 }, { hip: { angle: 0 } }), 1, 1e-12);
  // In the lifts: the RDL's knee-flexor demand now has a capacity, scaled by its hip angle.
  const rdl = load("romanian-deadlift"), v = rdl.variants[0];
  const r = analyzeMulti(rdl, v, 80, { ...opts, placement: { sidePush: 0 } });
  const k = J(r, "knee"), hip = J(r, "hip");
  assert.ok(k.torque < 0 && k.effort > 0);
  const kneeJ = rdl.joints.find((j) => j.id === "knee");
  const expect = interp(kneeJ.negative.points, k.angle) * kneeJ.negative.peakTorqueNm * interp(rdl.jointScale.knee.points, hip.angle);
  close(k.capacity, expect, 1e-9);
  // Squat: same ankle torque is easier on the calves near standing (knee straighter) than deep.
  const sq = (x) => J(analyzeMulti(ex, ex.variants[0], x, opts), "ankle");
  assert.ok(sq(10).strengthScale > sq(110).strengthScale);
});

test("arm lifts: the elbow moves smoothly through the range (no jumps between the two positions that fit)", () => {
  for (const id of ["bench-press", "overhead-press", "lat-pulldown", "pull-up"]) {
    const ex = load(id);
    for (const v of ex.variants) {
      let prev = null;
      for (let x = 0; x <= 100; x += 0.5) {
        const E = analyzeMulti(ex, v, x, { ...opts, loadKg: ex.defaults.loadKg }).frames.upperArm.to;
        if (prev) assert.ok(Math.hypot(E.x - prev.x, E.y - prev.y, E.z - prev.z) < 0.03, `${id}/${v.id} @${x}`);
        prev = E;
      }
    }
  }
});
