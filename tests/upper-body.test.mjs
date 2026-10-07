// Hand-computable cases for the upper-body exercises added after the biceps curl and lateral raise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, interp, sampleCurve, G } from "../js/physics.js";

const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const sin = (d) => Math.sin((d * Math.PI) / 180);
const cos = (d) => Math.cos((d * Math.PI) / 180);
const BODY = 75;
const opts = { loadKg: 8, peakTorqueNm: 60, bodyMassKg: BODY };
const variantOf = (ex) => (id) => ex.variants.find((x) => x.id === id);

/** Cable torque about the joint for a tip at `tip`, where `w` is the lift's rotation sense. */
const cableTorque = (joint, tip, pulley, m, w) => {
  const d = { x: pulley.x - tip.x, y: pulley.y - tip.y };
  const len = Math.hypot(d.x, d.y);
  const f = { x: (m * G * d.x) / len, y: (m * G * d.y) / len };
  const r = { x: tip.x - joint.x, y: tip.y - joint.y };
  return -w * (r.x * f.y - r.y * f.x);
};

// ---------- triceps extension ----------
{
  const ex = load("triceps-extension");
  const v = variantOf(ex);
  const { distal: L, massFractions: mf, comFractions: cf } = ex.segments;
  const forearmMoment = mf[1] * BODY * cf[1] * L;

  test("overhead triceps extension: torque = (m·L + forearm mass·COM)·g·sin(elbow angle)", () => {
    for (const a of [0, 45, 90, 140]) {
      const r = analyze(ex, v("overhead"), a, opts);
      close(r.loadTorque, 8 * G * L * sin(a));
      close(r.jointTorque, (8 * L + forearmMoment) * G * sin(a));
    }
  });

  test("lying skullcrusher is the overhead extension turned 90°: identical curves", () => {
    const a = sampleCurve(ex, v("overhead"), opts).map((s) => s.jointTorque);
    const b = sampleCurve(ex, v("skullcrusher"), opts).map((s) => s.jointTorque);
    a.forEach((x, i) => close(x, b[i], 1e-9));
  });

  test("pushdown: hand-computed cable torque, and the forearm's weight helps", () => {
    const { pulley } = v("pushdown").load;
    const tip = { x: L, y: -ex.segments.proximal };
    const r = analyze(ex, v("pushdown"), 90, opts);
    close(r.loadTorque, cableTorque({ x: 0, y: -ex.segments.proximal }, tip, pulley, 8, -1));
    assert.ok(r.loadTorque > 0);
    close(r.limbTorque, -forearmMoment * G);
  });
}

// ---------- front raise ----------
{
  const ex = load("front-raise");
  const v = variantOf(ex);
  const L = ex.segments.proximal + ex.segments.distal;

  test("dumbbell front raise: load torque = m·g·L·sin(angle)", () => {
    for (const a of [0, 30, 90]) close(analyze(ex, v("dumbbell"), a, opts).loadTorque, 8 * G * L * sin(a));
  });

  test("45° incline front raise: gravity tilted, load torque = m·g·L·sin(angle − 45°)", () => {
    for (const a of [0, 45, 90]) close(analyze(ex, v("incline"), a, opts).loadTorque, 8 * G * L * sin(a - 45), 1e-3);
    assert.ok(analyze(ex, v("incline"), 20, opts).loadTorque < 0, "gravity helps below 45°");
  });

  test("cable from behind loads the bottom of a front raise", () => {
    const { pulley } = v("cable").load;
    close(analyze(ex, v("cable"), 0, opts).loadTorque, cableTorque({ x: 0, y: 0 }, { x: 0, y: -L }, pulley, 8, 1));
    assert.ok(analyze(ex, v("cable"), 0, opts).loadTorque > 0);
  });
}

// ---------- chest fly ----------
{
  const ex = load("chest-fly");
  const v = variantOf(ex);
  const L = ex.segments.proximal + ex.segments.distal;

  test("lying dumbbell fly: load torque = m·g·L·cos(angle)", () => {
    for (const a of [-20, 0, 45, 90]) close(analyze(ex, v("dumbbell"), a, opts).loadTorque, 8 * G * L * cos(a));
  });

  test("standing cable fly keeps tension with the arms together", () => {
    const { pulley } = v("cable").load;
    const r = analyze(ex, v("cable"), 90, opts);
    close(r.loadTorque, cableTorque({ x: 0, y: 0 }, { x: 0, y: L }, pulley, 8, 1));
    assert.ok(r.loadTorque > 0.3 * 8 * G * L);
    close(analyze(ex, v("dumbbell"), 90, opts).loadTorque, 0);
  });

  test("pec deck: torque = m·g·r(angle) from the cam table", () => {
    const { camProfile } = v("pec-deck").load;
    for (const a of [-20, 10, 60, 90]) close(analyze(ex, v("pec-deck"), a, opts).loadTorque, 8 * G * interp(camProfile.points, a));
  });
}

// ---------- straight-arm pulldown / pullover ----------
{
  const ex = load("straight-arm-pulldown");
  const v = variantOf(ex);
  const L = ex.segments.proximal + ex.segments.distal;

  test("lying pullover: load torque = −m·g·L·cos(angle), hardest overhead", () => {
    for (const a of [0, 90, 135, 170]) close(analyze(ex, v("pullover"), a, opts).loadTorque, -8 * G * L * cos(a));
  });

  test("cable pulldown: hand-computed torque at the finish, none above the pulley line", () => {
    const { pulley } = v("cable").load;
    close(analyze(ex, v("cable"), 0, opts).loadTorque, cableTorque({ x: 0, y: 0 }, { x: 0, y: -L }, pulley, 8, -1));
    assert.ok(analyze(ex, v("cable"), 0, opts).loadTorque > 0);
    assert.ok(analyze(ex, v("cable"), 170, opts).loadTorque < 0);
  });
}
