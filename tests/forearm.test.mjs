// Wrist curls and the forearm close-up (data/regions/forearm.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { analyze, sampleCurve, G } from "../js/physics.js";
import { muscleActivation } from "../js/muscles.js";
import { bellyPath, regionsOf, viewsFor, pathsOf, regionValues } from "../js/regions.js";

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}.json`, import.meta.url)));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const rad = (d) => (d * Math.PI) / 180;

const curl = load("exercises/wrist-curl");
const reverse = load("exercises/reverse-wrist-curl");
const v = (ex, id) => ex.variants.find((x) => x.id === id);
const opts = { loadKg: 8, peakTorqueNm: 12, bodyMassKg: 75 };
const L = curl.segments.distal;
const handMoment = curl.segments.massFractions[1] * 75 * curl.segments.comFractions[1] * L; // kg·m

test("seated wrist curl: torque = (m·L + hand mass·COM)·g·cos(wrist angle), forearm flat", () => {
  for (const a of [-60, -30, 0, 30, 60]) {
    const r = analyze(curl, v(curl, "seated-dumbbell"), a, opts);
    close(r.loadTorque, 8 * G * L * Math.cos(rad(a)));
    close(r.jointTorque, (8 * L + handMoment) * G * Math.cos(rad(a)));
  }
});

test("behind-the-back wrist curl: forearm vertical, torque = m·g·L·sin(wrist angle), peak at the top", () => {
  for (const a of [0, 30, 60]) close(analyze(curl, v(curl, "behind-back"), a, opts).loadTorque, 8 * G * L * Math.sin(rad(a)));
  const s = sampleCurve(curl, v(curl, "behind-back"), opts, 5);
  assert.equal(s.reduce((m, x) => (x.loadTorque > m.loadTorque ? x : m)).angle, 60);
});

test("reverse wrist curl: same cos curve, but the weaker extensors mean more effort for the same load", () => {
  const o = { ...opts, loadKg: 4 };
  close(analyze(reverse, v(reverse, "seated-dumbbell"), 0, { ...o, peakTorqueNm: 7 }).loadTorque, 4 * G * L);
  const flex = analyze(curl, v(curl, "seated-dumbbell"), 0, { ...o, peakTorqueNm: 12 }).effort;
  const ext = analyze(reverse, v(reverse, "seated-dumbbell"), 0, { ...o, peakTorqueNm: 7 }).effort;
  assert.ok(ext > flex);
});

test("finger roll raises only the finger flexors' share", () => {
  const r = analyze(curl, v(curl, "seated-dumbbell"), 0, opts);
  const plain = Object.fromEntries(muscleActivation(curl, v(curl, "seated-dumbbell"), r, 0).map((m) => [m.id, m.value]));
  const roll = Object.fromEntries(muscleActivation(curl, v(curl, "finger-roll"), r, 0).map((m) => [m.id, m.value]));
  assert.ok(roll.fds > plain.fds && roll.fdp > plain.fdp);
  close(roll.fcu, plain.fcu);
});

// ---------- region drawings ----------
const regionIds = readdirSync(new URL("../data/regions/", import.meta.url)).map((f) => f.replace(/\.json$/, ""));
const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
const exerciseIds = [...main.match(/const EXERCISES = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

for (const id of regionIds) {
  const region = load(`regions/${id}`);
  test(`region ${id}: well formed`, () => {
    assert.equal(region.id, id);
    assert.equal(region.viewBox.length, 4);
    for (const [mid, m] of Object.entries(region.muscles)) assert.ok(m.name && m.abbr && m.action, mid);
    for (const view of region.views) {
      assert.ok(view.title && view.caption && view.outline.length, view.id);
      for (const m of view.muscles) {
        assert.ok(region.muscles[m.id], `${view.id}: ${m.id} not in the region's muscle list`);
        if (m.d) {
          assert.match(m.d, /^M[\d.,\s LQCZz-]+$/, `${view.id}: ${m.id} outline`);
          assert.ok(m.label?.length === 2, `${view.id}: ${m.id} label position`);
          continue;
        }
        assert.ok(m.belly[0] >= 0 && m.belly[0] < m.belly[1] && m.belly[1] <= 1, `${view.id}: ${m.id} belly`);
        assert.ok(m.w > 0);
        assert.doesNotMatch(bellyPath(m), /NaN/);
      }
    }
  });
}

test("every muscle tagged with a region is drawn in at least one of its views", () => {
  for (const exId of exerciseIds) {
    const ex = load(`exercises/${exId}`);
    for (const rid of regionsOf(ex)) {
      assert.ok(regionIds.includes(rid), `${exId}: unknown region ${rid}`);
      const region = load(`regions/${rid}`);
      const drawn = new Set(region.views.flatMap((vw) => vw.muscles.map((m) => m.id)));
      for (const m of ex.muscles.filter((x) => x.region === rid)) for (const p of pathsOf(m)) assert.ok(drawn.has(p), `${exId}: ${m.id} → ${p}`);
    }
  }
});

test("close-ups pick the views that show the exercise's muscles", () => {
  const forearm = load("regions/forearm");
  const views = (exId) => viewsFor(forearm, load(`exercises/${exId}`)).map((x) => x.id);
  assert.deepEqual(views("wrist-curl"), ["flexor-superficial", "flexor-deep"]);
  assert.deepEqual(views("reverse-wrist-curl"), ["extensor"]);
  assert.deepEqual(views("biceps-curl"), ["flexor-superficial", "extensor"]);
});

test("group muscles colour every head with the group's value and mark it as a group", () => {
  const act = [
    { id: "quadriceps", name: "Quadriceps", region: "thigh", regionPath: ["rectus-femoris", "vastus-lateralis", "vastus-medialis"], value: 0.6 },
    { id: "rectus-femoris", name: "Rectus femoris", region: "thigh", value: 0.8 },
    { id: "lower-traps", name: "Lower trapezius, rhomboids", region: "shoulder", regionPath: ["lower-trapezius", "rhomboids"], value: null },
  ];
  const v = regionValues(act);
  assert.deepEqual(v.get("vastus-lateralis"), { value: 0.6, group: "Quadriceps", share: null, muscleId: "quadriceps" });
  // A muscle of its own with a larger value wins its drawing.
  assert.deepEqual(v.get("rectus-femoris"), { value: 0.8, group: null, share: null, muscleId: "rectus-femoris" });
  assert.equal(v.get("rhomboids").value, null);
});

test("close-ups for the lifts: leg extension resolves rectus femoris vs vasti; a squat shows all three thigh views", () => {
  const thigh = load("regions/thigh");
  const views = (exId) => viewsFor(thigh, load(`exercises/${exId}`)).map((x) => x.id);
  assert.deepEqual(views("leg-extension"), ["front"]);
  assert.deepEqual(views("squat"), ["front", "back", "hip-deep"]);
  const shoulder = load("regions/shoulder");
  assert.ok(viewsFor(shoulder, load("exercises/lateral-raise")).some((x) => x.id === "back-deep"), "supraspinatus");
});

test("measured per-head shares split the hamstrings: RDL from Ono et al. (EMG), leg curl from Messer et al. (MRI)", () => {
  const heads = (exId) => {
    const ex = load(`exercises/${exId}`);
    const m = ex.muscles.find((x) => x.id === "hamstrings");
    assert.ok(m.regionSharesNote && m.regionSharesSource, exId);
    const v = regionValues([{ ...m, value: 0.5 }]);
    for (const p of pathsOf(m)) assert.equal(v.get(p).group, null, `${exId}: ${p} is no longer a hatched group`);
    return Object.fromEntries(pathsOf(m).map((p) => [p, v.get(p).value]));
  };
  const rdl = heads("romanian-deadlift");
  assert.ok(rdl["semitendinosus"] < rdl["biceps-femoris"] && rdl["semitendinosus"] < rdl["semimembranosus"]);
  close(rdl["biceps-femoris"], 0.5);
  close(rdl["semitendinosus"], 0.5 * 33 / 43.5, 0.01); // Ono Fig. 1, lifting phase
  const curl = heads("leg-curl");
  assert.ok(curl["semitendinosus"] > curl["semimembranosus"] && curl["semimembranosus"] > curl["biceps-femoris"]);
  close(curl["semimembranosus"], 0.5 * 33.27 / 57.99, 0.01); // Messer Table, Nordic
});
