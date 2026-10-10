// Pinch lift: squeeze from friction, capacity, and the pincer model's scaling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { squeezeFor, holdsWeight, faceFriction, wristFactor, analyzePinch } from "../js/pinchlift.js";
import { muscleActivation } from "../js/muscles.js";

const ex = JSON.parse(readFileSync(new URL("../data/exercises/pinch-lift.json", import.meta.url)));
ex.pincer.arms = JSON.parse(readFileSync(new URL(`../${ex.pincer.data}`, import.meta.url)));
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
  const r = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), 60, { loadKg: 15, strengthPct: 80, placement: { ...v("four-fingers").params, wrist: 38 } });
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
  for (const mm of [40, 55, 70, 80]) {
    const r = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), mm, { loadKg: 15, placement: v("four-fingers").params });
    assert.ok(r.effort < 1 && r.act, `${mm} mm`);
    for (const m of muscleActivation(ex, v("four-fingers"), r, mm)) if (m.value != null) assert.ok(m.value >= 0 && m.value <= 1, m.id);
  }
  const over = analyzePinch(ex, ex.pincer.arms, v("four-fingers"), 60, { loadKg: 40, placement: v("four-fingers").params });
  assert.ok(over.effort > 1 && over.act === null);
});

test("Vigouroux et al. 2011 check: the index FDP force per newton of squeeze at 35–75 mm is near their 2.5–3", async () => {
  const { jointed } = await import("../js/pincer.js");
  for (const mm of [35, 55, 75]) {
    const r = jointed(ex, ex.pincer.arms, mm / 1000, 2); // a light grip, like theirs (about 6 N)
    const per = (r.act.FDPI * ex.pincer.arms.postures.w55.muscles.FDPI.active) / 2;
    assert.ok(per > 2 && per < 3.5, `${mm} mm: ${per}`);
  }
});
