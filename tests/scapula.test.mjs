// Shoulder-blade sliders: bench (pulled back, up/down) and rows (reach forward → squeeze back).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeMulti } from "../js/multijoint.js";

const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const run = (id, vid, x, pl = {}) => {
  const ex = load(id);
  const v = ex.variants.find((y) => y.id === vid);
  return analyzeMulti(ex, v, x, { loadKg: 60, bodyMassKg: 75, body, placement: { ...v.params, ...pl } });
};
const shoulder = (r) => r.frames.upperArm.from;
const torques = (r) => r.joints.map((j) => j.torque);

test("sliders at 0 change nothing (the shoulder joints stay where they were)", () => {
  for (const [id, vid, key] of [["bench-press", "flat", "scapRetract"], ["bent-over-row", "barbell", "scapTravel"], ["seated-row", load("seated-row").variants[0].id, "scapTravel"]]) {
    const ex = load(id);
    const v = ex.variants.find((y) => y.id === vid);
    const params = Object.fromEntries(Object.entries(v.params).filter(([k]) => !k.startsWith("scap")));
    for (const x of [0, 50, 100]) {
      const a = analyzeMulti(ex, { ...v, params }, x, { loadKg: 60, bodyMassKg: 75, body });
      const b = run(id, vid, x, { [key]: 0 });
      assert.deepEqual(torques(b), torques(a), `${id} @${x}`);
    }
  }
});

test("bench: the shoulder joint moves into the bench and along the body by the slider values", () => {
  const a = shoulder(run("bench-press", "flat", 30));
  const b = shoulder(run("bench-press", "flat", 30, { scapRetract: 0.03, scapElevate: -0.02 }));
  close(b.y - a.y, -0.03, 1e-12); // flat bench: into the bench = down
  close(b.x - a.x, 0.02, 1e-12); // down along the body = towards the feet (+x)
  close(b.z, a.z, 1e-12);
  // Lockout stays over the moved shoulders, still reachable.
  const r = run("bench-press", "flat", 100, { scapRetract: 0.05 });
  close(r.frames.forearm.to.x, shoulder(r).x, 1e-9);
  assert.ok(!r.info.some((i) => i.warn), "arm reaches");
});

test("bench, close grip: pulling the shoulder blades back and down eases the shoulder at the bottom, loads the elbow more", () => {
  const J = (r, id) => r.joints.find((j) => j.id === id).torque;
  const plain = run("bench-press", "close", 0), set = run("bench-press", "close", 0, { scapRetract: 0.03, scapElevate: -0.02 });
  assert.ok(J(set, "shoulder-flex") < J(plain, "shoulder-flex"));
  assert.ok(J(set, "elbow") > J(plain, "elbow"));
});

test("rows: the shoulder starts reached forward and ends squeezed back, `travel` apart", () => {
  // Seated row: the trunk is fixed on the seat, so only the shoulder blade moves the joint.
  const vid = load("seated-row").variants[0].id;
  const off = (x) => {
    const s = shoulder(run("seated-row", vid, x, { scapTravel: 0.06 })), b = shoulder(run("seated-row", vid, x));
    return { x: s.x - b.x, y: s.y - b.y, z: s.z - b.z };
  };
  const o0 = off(0), o1 = off(100), o50 = off(50);
  close(Math.hypot(o0.x, o0.y, o0.z), 0.03, 1e-9); // half the travel forward at the start
  close(Math.hypot(o1.x, o1.y, o1.z), 0.03, 1e-9); // half back at the end
  close(o0.x, -o1.x, 1e-9); close(o0.y, -o1.y, 1e-9);
  close(Math.hypot(o50.x, o50.y), 0, 1e-9); // neutral mid-pull
  // Squeezing back at the top takes torque off the shoulder and puts more on the elbow.
  const J = (r, id) => r.joints.find((j) => j.id === id).torque;
  const plain = run("bent-over-row", "barbell", 100), squeeze = run("bent-over-row", "barbell", 100, { scapTravel: 0.06 });
  assert.ok(J(squeeze, "shoulder") < J(plain, "shoulder"));
  assert.ok(J(squeeze, "elbow") > J(plain, "elbow"));
});
