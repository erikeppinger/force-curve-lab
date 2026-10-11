// 3D figure of the single-joint exercises (chain3d.js): the 2D chain placed in its plane on a body.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "../js/physics.js";
import { chainScene3d } from "../js/chain3d.js";
import { sub3, unit3, len3, dot3, v3 } from "../js/multijoint3d.js";

const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
const near = (a, b, tol = 1e-6) => assert.ok(len3(sub3(a, b)) < tol, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
const scene = (ex, vId, angle, placement) => {
  const v = ex.variants.find((x) => x.id === vId);
  const r = analyze(ex, v, angle, { loadKg: 5, peakTorqueNm: ex.defaults.peakTorqueNm, bodyMassKg: 75, placement: placement ?? v.params });
  return chainScene3d(ex, v, r, { body });
};
// The working limb: the scene's lines flagged as bones, the right one first.
const arm = (s) => { const b = s.scene.filter((p) => p.bone); return { from: b[0].a, mid: b[0].b, tip: b[1].b }; };

test("the arm leaves the shoulder sideways in a lateral raise and forwards in a front raise (90°: horizontal)", () => {
  for (const [id, dir] of [["lateral-raise", v3(0, 0, 1)], ["front-raise", v3(1, 0, 0)]]) {
    const ex = load(id);
    const a = arm(scene(ex, "dumbbell", 90));
    near(unit3(sub3(a.tip, a.from)), dir, 1e-3);
    // Lengths kept from the 2D chain.
    assert.ok(Math.abs(len3(sub3(a.mid, a.from)) - ex.segments.proximal) < 1e-9);
  }
});

test("every gravity load points straight down, also lying (fly, skull crusher) or inclined", () => {
  for (const [id, vId] of [["lateral-raise", "dumbbell"], ["chest-fly", "dumbbell"], ["triceps-extension", "skullcrusher"], ["front-raise", "incline"], ["biceps-curl", "preacher"]]) {
    const ex = load(id);
    for (const angle of [ex.angleRange[0], (ex.angleRange[0] + ex.angleRange[1]) / 2]) {
      const s = scene(ex, vId, angle);
      for (const f of s.forces) near(f.dir, v3(0, -1, 0), 1e-6);
    }
  }
  // Lying: a bench under the trunk, and the floor below everything.
  const fly = scene(load("chest-fly"), "dumbbell", 0);
  assert.ok(fly.scene.some((p) => p.cls?.includes("bench3d")));
  const floor = fly.scene.find((p) => p.cls === "floor3d").pts[0].y;
  assert.ok(fly.scene.filter((p) => p.kind === "line").every((p) => Math.min(p.a.y, p.b.y) - p.w / 2 >= floor - 1e-9));
});

test("calf raise: toes out turns the working foot outwards about the vertical; the ball of the foot stays on the step", () => {
  const ex = load("calf-raise");
  for (const deg of [-30, 0, 30]) {
    const s = scene(ex, "two-leg", 10, { footAngle: deg });
    const a = arm(s);
    const foot = sub3(a.tip, a.mid);
    const heading = (Math.atan2(foot.z, foot.x) * 180) / Math.PI;
    assert.ok(Math.abs(heading - deg) < 1e-6, `${deg}: ${heading}`);
    const floor = s.scene.find((p) => p.cls === "floor3d").pts[0].y;
    const step = s.scene.find((p) => p.cls?.includes("bench3d")).pts[0].y;
    assert.ok(Math.abs(a.tip.y - 0.03 - step) < 1e-9 && step - floor >= 0.15 - 1e-9);
  }
  // One leg: no mirrored working leg.
  assert.equal(scene(ex, "single-leg", 10).scene.filter((p) => p.bone).length, 2);
  assert.equal(scene(ex, "two-leg", 10).scene.filter((p) => p.bone).length, 4);
});

test("curl grips: the dumbbell runs across the body (supinated) or in the plane of the curl (hammer); palms face forward or back", () => {
  const ex = load("biceps-curl");
  const handleDir = (s) => { const h = s.scene.find((p) => p.cls === "equipment"); return unit3(sub3(h.b, h.a)); };
  // The palm plate's centre relative to the hand.
  const palmSide = (s) => { const t = arm(s).tip; const p = s.scene.find((q) => q.kind === "line" && q.cls === "body" && q.w === 0.03); return v3((p.a.x + p.b.x) / 2 - t.x, (p.a.y + p.b.y) / 2 - t.y, (p.a.z + p.b.z) / 2 - t.z); };
  // Elbow at 90°: the forearm points forward, its front (palm side when supinated) faces up.
  const sup = scene(ex, "dumbbell", 90), ham = scene(ex, "hammer", 90), rev = scene(ex, "reverse", 90);
  assert.ok(Math.abs(handleDir(sup).z) > 0.999);
  assert.ok(Math.abs(handleDir(ham).y) > 0.999, JSON.stringify(handleDir(ham)));
  assert.ok(palmSide(sup).y > 0 && palmSide(rev).y < 0, `${palmSide(sup).y} / ${palmSide(rev).y}`);
});

test("3D parts: the trunk, hip and shoulder bars and head form one torso; a leg's pieces one limb; arms stay out of the torso", async () => {
  const { autoParts } = await import("../js/view3d.js");
  const L = (a, b, w, cls) => ({ kind: "line", a: v3(...a), b: v3(...b), w, cls });
  const prims = autoParts([
    L([0, 1, 0], [0, 1.5, 0], 0.3, "body"), L([0, 1, -0.1], [0, 1, 0.1], 0.16, "body"), L([0, 1.5, -0.2], [0, 1.5, 0.2], 0.1, "body"),
    { kind: "dot", c: v3(0, 1.7, 0), r: 0.11, cls: "body" },
    L([0, 1, 0.1], [0, 0.5, 0.1], 0.14, "body"), L([0, 0.5, 0.1], [0, 0.08, 0.1], 0.1, "body"),
    L([0, 1.5, 0.2], [0, 1.5, 0.8], 0.07, "body arm"),
    L([0, 1, -0.1], [0, 0.5, -0.1], 0.14, "body back"),
  ]);
  assert.deepEqual(prims.slice(0, 4).map((p) => p.part), ["torso", "torso", "torso", "torso"]);
  assert.equal(prims[4].part, prims[5].part);
  assert.ok(prims[4].part !== "torso" && prims[6].part !== "torso" && prims[7].part !== prims[4].part);
});

test("calf raise display: the ball of the foot, the step and the floor stay put while the body rises (2D and 3D)", async () => {
  const { anchorShift } = await import("../js/figure.js");
  const ex = load("calf-raise");
  const v = ex.variants.find((x) => x.id === "two-leg");
  const balls = [], floors = [], hips = [];
  for (const angle of [-20, 0, 20, 40]) {
    const r = analyze(ex, v, angle, { loadKg: 0, peakTorqueNm: 119, bodyMassKg: 75, placement: v.params });
    // 2D: the tip lands on the screen origin, the knee moves.
    const sh = anchorShift(v, r.pose);
    assert.ok(Math.abs(r.pose.tip.x + sh.x) < 1e-9 && Math.abs(r.pose.tip.y + sh.y) < 1e-9);
    hips.push(r.pose.base.y + sh.y);
    // 3D
    const s = chainScene3d(ex, v, r, { body });
    balls.push(arm(s).tip);
    floors.push(s.scene.find((p) => p.cls === "floor3d").pts[0].y);
  }
  for (const b of balls) near(b, balls[0], 1e-9);
  assert.ok(floors.every((y) => Math.abs(y - floors[0]) < 1e-9));
  assert.ok(hips[3] > hips[1] + 0.05, `the knee rises: ${hips}`);
});
