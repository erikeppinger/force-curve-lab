// Pinch lift: squeeze from friction, capacity, and the pincer model's scaling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { squeezeFor, holdsWeight, faceFriction, wristFactor, analyzePinch } from "../js/pinchlift.js";
import { muscleActivation } from "../js/muscles.js";

const ex = JSON.parse(readFileSync(new URL("../data/exercises/pinch-lift.json", import.meta.url)));
ex.pincer.arms = JSON.parse(readFileSync(new URL(`../${ex.pincer.data}`, import.meta.url)));
ex.pincer.fingerModel = JSON.parse(readFileSync(new URL(`../${ex.pincer.fingerData}`, import.meta.url)));
ex.pincer.whole = JSON.parse(readFileSync(new URL(`../${ex.pincer.wholeData}`, import.meta.url)));
const v = (id) => ex.variants.find((x) => x.id === id);
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("hand-computed: with Amontons friction (n = 1) the squeeze is weight ÷ 2μ, whatever the finger count", () => {
  for (const fingers of [1, 2, 4]) close(squeezeFor(200, { mu: 0.5, n: 1, fingers }), 200);
  close(squeezeFor(196.2, { mu: 0.6, n: 1, fingers: 4 }), 196.2 / 1.2);
});

test("friction growing less than the load (n < 1): more fingers need less squeeze; squeeze and weight round-trip", () => {
  const f = (fingers) => squeezeFor(300, { mu: 0.8, n: 0.8, fingers });
  assert.ok(f(4) < f(2) && f(2) < f(1));
  for (const fingers of [1, 4]) close(holdsWeight(squeezeFor(300, { mu: 0.8, n: 0.8, fingers }), { mu: 0.8, n: 0.8, fingers }), 300, 1e-9);
  // One patch at N0 = 10 N holds exactly μ·10 N.
  close(faceFriction(10, 1, 0.7, 0.75), 7);
});

test("wrist: flexion costs up to a quarter at 38°, extension nothing", () => {
  close(wristFactor(0), 1);
  close(wristFactor(-30), 1);
  close(wristFactor(19), 0.875);
  close(wristFactor(38), 0.75);
  close(wristFactor(60), 0.75);
});

test("effort = squeeze ÷ capacity (strength × wrist); max block = 2μ × capacity at n = 1", () => {
  const r = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), 60, { loadKg: 15, strengthPct: 80, placement: { ...v("four-fingers").params, wrist: 38, level: "jointed" } });
  const cap = ex.pinch.capacity * 0.8 * 0.75;
  close(r.capacityN, cap);
  close(r.effort, r.squeezeN / cap);
  close(r.maxBlockKg, (2 * 0.6 * cap) / 9.81);
  // Sideways balance: the thumb's face and the fingers' face hold the same friction at n = 1.
  close(r.friction.thumb, r.friction.fingers);
  close(r.friction.thumb + r.friction.fingers, 15 * 9.81, 1e-9);
});

test("pliers model: the thumb's long flexor sits exactly at the effort (it limits the four-finger pinch)", () => {
  for (const mm of [40, 60, 80]) {
    const r = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), mm, { loadKg: 12, placement: { ...v("four-fingers").params, level: "pliers" } });
    close(r.act.FPL, r.effort, 1e-6);
    assert.ok(r.act.FDPI < r.act.FPL, `${mm}: FDP ${r.act.FDPI} vs FPL ${r.act.FPL}`);
  }
});

test("jointed model: holds below the maximum, every muscle bar within 0–1; past the maximum the grip fails", () => {
  for (const mm of [50, 60, 70, 80]) {
    const r = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), mm, { loadKg: 12, placement: v("four-fingers").params });
    assert.ok(r.effort < 1 && r.act, `${mm} mm`);
    for (const m of muscleActivation(ex, v("four-fingers"), r, mm)) if (m.value != null) assert.ok(m.value >= 0 && m.value <= 1, m.id);
  }
  const over = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), 60, { loadKg: 40, placement: v("four-fingers").params });
  assert.ok(over.effort > 1 && over.act === null);
});

test("Vigouroux et al. 2011 check: the index FDP force per newton of squeeze at 35–75 mm is near their 2.5–3", async () => {
  const { jointed } = await import("../js/pincer.js");
  for (const mm of [40, 55, 75]) { // inside their 35–75 mm, between exported widths
    const r = jointed(ex, ex.pincer.arms, mm / 1000, 2); // a light grip, like theirs (about 6 N)
    const per = (r.act.FDPI * ex.pincer.arms.postures.w50.muscles.FDPI.active) / 2;
    assert.ok(per > 2 && per < 3.5, `${mm} mm: ${per}`);
  }
});

test("whole hand: friction carries the weight, thumb presses as hard as all fingers, never less than the friction minimum", async () => {
  const { pinchHand } = await import("../js/pincer.js");
  const fingers = ["index", "middle", "ring", "little"];
  const r = pinchHand(ex, ex.pincer.arms, ex.pincer.fingerModel, 0.06, 150, { fingers, mu: { thumb: 0.6, finger: 0.6 }, strength: 15 });
  assert.ok(r.holds);
  const T = r.digits.thumb.T + fingers.reduce((s, id) => s + r.digits[id].T, 0);
  const N = fingers.reduce((s, id) => s + r.digits[id].N, 0);
  close(T, 150, 2e-3);
  close(r.digits.thumb.N, N, 2e-3);
  for (const id of [...fingers, "thumb"]) assert.ok(Math.abs(r.digits[id].T) <= 0.6 * r.digits[id].N + 1e-6, id);
  assert.ok(r.squeezeN >= 150 / 1.2 - 1e-6);
});

test("whole hand: calibrated to the measured squeeze; the middle finger carries the largest share", () => {
  const r = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), 60, { loadKg: 15, placement: v("four-fingers").params });
  assert.ok(r.effort < 1 && r.act, `effort ${r.effort}`);
  close(Object.values(r.shares).reduce((s, x) => s + x, 0), 1, 1e-9);
  assert.ok(r.shares.middle === Math.max(...Object.values(r.shares)), JSON.stringify(r.shares));
  assert.ok(r.squeezeN >= r.minSqueezeN - 1e-6);
  assert.ok(r.maxBlockKg > 15);
});

test("whole hand: the precomputed table matches the live model (rerun tools/pinch-table.mjs if not); strength scales the max block in proportion", async () => {
  const { wholeMax, WHOLE } = await import("../js/pinchlift.js");
  const { pinchHand } = await import("../js/pincer.js");
  const live = { ...ex, pincer: { ...ex.pincer, whole: null } };
  for (const [mm, mu, fingers] of [[60, 0.6, 4], [45, 0.6, 4], [85, 1.05, 2]]) {
    const r = analyzePinch(ex, ex.pincer.arms, v(fingers === 4 ? "four-fingers" : "two-fingers"), mm, { loadKg: 10, placement: { mu } });
    const { Wmax } = wholeMax(live, ex.pincer.arms, mm / 1000, fingers, { thumb: mu, finger: mu }, 18);
    close(r.maxBlockKg, Wmax / 9.81, 0.04); // interpolation between table points
  }
  // The balance is linear in the forces: half the strength holds about half the weight.
  const o = (s) => ({ fingers: WHOLE[4], mu: { thumb: 0.6, finger: 0.6 }, strength: { extrinsic: ex.pincer.whole.thumbScale.extrinsic * s, intrinsic: ex.pincer.whole.thumbScale.intrinsic * s }, fingerStrength: s });
  const full = ex.pincer.whole[4].max[8][3][0][0]; // 60 mm, μ 0.6, equal friction
  assert.ok(pinchHand(ex, ex.pincer.arms, ex.pincer.fingerModel, 0.06, 0.49 * full, o(0.5)).holds);
  assert.ok(!pinchHand(ex, ex.pincer.arms, ex.pincer.fingerModel, 0.06, 0.51 * full, o(0.5)).holds);
});

test("charts: an infinite effort (no block holds at 110 mm) gives a finite axis with a few gridlines, not an endless loop", async () => {
  const { yScale } = await import("../js/chart.js");
  const { samplePinch } = await import("../js/pinchlift.js");
  const s = samplePinch(ex, ex.pincer.arms, v("four-fingers"), { loadKg: 10, placement: v("four-fingers").params });
  const pts = s.map((x) => [x.widthMm, x.effort * 100]);
  assert.ok(pts.some((p) => p[1] === Infinity), "110 mm holds nothing");
  for (const yMax of [undefined, Infinity, Math.max(100, ...pts.map((p) => p[1]))]) {
    const { top, bottom, step } = yScale([{ points: pts }], yMax);
    assert.ok(Number.isFinite(top) && step > 0 && (top - bottom) / step <= 20, `${yMax}: ${top} / ${step}`);
  }
  assert.deepEqual(yScale([{ points: [[0, NaN]] }]), { top: 1, bottom: 0, step: 0.25 });
});

test("3D hand: the block is as wide as the exported width; the whole-hand model's activations land on the ARMS muscles", async () => {
  const { pinchBlock, pinchValueOf, handScene3d } = await import("../js/handfig3d.js");
  const hand = JSON.parse(readFileSync(new URL(`../${ex.handModel.data}`, import.meta.url)));
  assert.match(hand.licence, /NON-COMMERCIAL/);
  for (const key of ["w40", "w80"]) {
    const faces = pinchBlock(hand.postures[key], +key.slice(1));
    const mid = (f) => f.pts.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4, z: s.z + p.z / 4 }), { x: 0, y: 0, z: 0 });
    const [a, b] = [mid(faces[0]), mid(faces[1])];
    close(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), +key.slice(1) / 1000, 1e-9);
  }
  const r = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), 60, { loadKg: 15, placement: v("four-fingers").params });
  const val = pinchValueOf(r.act);
  close(val("FPL"), r.act.FPL);
  close(val("FDPM"), r.act.FDP_middle);
  close(val("EDCI"), r.act.EXT_index);
  assert.equal(val("ECRL"), null); // wrist muscles: not in the model, drawn grey
  const prims = handScene3d(hand.postures.w60, null, val);
  assert.ok(prims.some((p) => p.cls === "muscle-on" && /FPL|thumb flexor/.test(p.title)));
});
