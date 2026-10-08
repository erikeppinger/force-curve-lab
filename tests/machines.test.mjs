// Leg-extension machine cams read off Folland & Morris 2008 (Fig. 2B), checked against Table I.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interp, sampleCurve } from "../js/physics.js";

const ex = JSON.parse(readFileSync(new URL("../data/exercises/leg-extension.json", import.meta.url)));
const cam = (id) => ex.variants.find((v) => v.id === id).load.camProfile.points;
const change = (pts, from, to) => (100 * (interp(pts, to) - interp(pts, from))) / interp(pts, from);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(1)} vs ${b}`);

test("machine cams reproduce Table I's torque changes (100→80° and 60→20° of knee bend)", () => {
  near(change(cam("machine-falling"), 100, 80), 19.4, 3, "Strive ascending");
  near(change(cam("machine-falling"), 60, 20), 37.6, 3, "Strive descending");
  near(change(cam("machine-rising"), 100, 80), 2.5, 3, "Technogym Rehabilitation ascending");
  near(change(cam("machine-rising"), 60, 20), -13.5, 3, "Technogym Rehabilitation descending");
});

test("no machine follows the quadriceps: each keeps far more than the muscles' ~40% at 20° of knee bend", () => {
  for (const id of ["machine", "machine-falling", "machine-rising"]) {
    const pts = cam(id);
    const peak = Math.max(...pts.map((p) => p[1]));
    assert.ok(interp(pts, 20) / peak > 0.75, id);
  }
  // So the effort climbs towards lockout with the typical machine.
  const s = sampleCurve(ex, ex.variants.find((v) => v.id === "machine"), { loadKg: 20, peakTorqueNm: 200, bodyMassKg: 75 }, 5);
  const at = (a) => s.find((x) => x.angle === a).effort;
  assert.ok(at(10) > 1.5 * at(60));
});
