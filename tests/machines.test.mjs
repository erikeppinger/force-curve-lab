// Leg-extension machine cams read off Folland & Morris 2008 (Fig. 2B), checked against Table I.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interp, sampleCurve, camOf } from "../js/physics.js";

const ex = JSON.parse(readFileSync(new URL("../data/exercises/leg-extension.json", import.meta.url)));
const cam = (id) => camOf(ex.variants.find((v) => v.id === id).load).points;
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

test("a machine's cam shape is chosen in the set-up: torque = m·g·r(angle) of the chosen shape", async () => {
  const { analyze, camChoice, G } = await import("../js/physics.js");
  const curl = JSON.parse(readFileSync(new URL("../data/exercises/leg-curl.json", import.meta.url)));
  const v = curl.variants.find((x) => x.id === "lying");
  const choice = camChoice(v);
  assert.deepEqual(choice.options.map(([id]) => id), v.load.camProfiles.map((c) => c.id));
  for (const c of v.load.camProfiles) for (const a of [0, 60, 120]) {
    const r = analyze(curl, v, a, { loadKg: 20, bodyMassKg: 75, peakTorqueNm: curl.defaults.peakTorqueNm, placement: { cam: c.id } });
    near(r.loadTorque, 20 * G * interp(c.points, a), 1e-9, `${c.id} @${a}`);
  }
  // No choice: the first shape. A round pulley: the same torque at every angle.
  const first = analyze(curl, v, 30, { loadKg: 20, bodyMassKg: 75, peakTorqueNm: 60 }).loadTorque;
  near(first, 20 * G * interp(v.load.camProfiles[0].points, 30), 1e-9, "default");
  const rnd = [0, 60, 120].map((a) => analyze(curl, v, a, { loadKg: 20, bodyMassKg: 75, peakTorqueNm: 60, placement: { cam: "round" } }).loadTorque);
  near(rnd[0], rnd[2], 1e-9, "round pulley constant");
  assert.equal(camChoice(curl.variants.find((x) => !x.load.camProfiles) ?? {}), null);
});

test("the pec deck's linkage shape is the 1989 patent's FIG. 4 curve, shifted by the 20° start behind the shoulders", () => {
  const fly = JSON.parse(readFileSync(new URL("../data/exercises/chest-fly.json", import.meta.url)));
  const L = fly.variants.find((x) => x.id === "pec-deck").load, link = L.camProfiles.find((c) => c.id === "linkage");
  // 121% of the stack at 60° of pad rotation (= 40° here), 68% at the end (110° = 90° here).
  near(interp(link.points, 40) / L.padDistance * 100, 121, 0.3, "peak");
  near(interp(link.points, 90) / L.padDistance * 100, 68, 0.3, "end");
});
