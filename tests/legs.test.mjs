// Hand-computable cases for the leg exercises.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, interp, G } from "../js/physics.js";
import { muscleActivation } from "../js/muscles.js";

const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const sin = (d) => Math.sin((d * Math.PI) / 180);
const cos = (d) => Math.cos((d * Math.PI) / 180);
const BODY = 75;
const opts = { loadKg: 10, peakTorqueNm: 150, bodyMassKg: BODY };
const variantOf = (ex) => (id) => ex.variants.find((x) => x.id === id);

// ---------- leg extension ----------
{
  const ex = load("leg-extension");
  const v = variantOf(ex);
  const { distal: L, massFractions: mf, comFractions: cf } = ex.segments;
  const shinMoment = mf[1] * BODY * cf[1] * L;

  test("ankle-weight leg extension: torque = (m·L + lower-leg weight)·g·cos(knee angle), largest at lockout", () => {
    for (const a of [0, 30, 60, 90]) {
      const r = analyze(ex, v("ankle-weight"), a, opts);
      close(r.loadTorque, 10 * G * L * cos(a));
      close(r.jointTorque, (10 * L + shinMoment) * G * cos(a));
    }
  });

  test("leg extension machine: m·g·r(angle) plus the lower leg's weight", () => {
    const { camProfile } = v("machine").load;
    for (const a of [0, 45, 90]) {
      const r = analyze(ex, v("machine"), a, opts);
      close(r.loadTorque, 10 * G * interp(camProfile.points, a));
      close(r.limbTorque, shinMoment * G * cos(a));
    }
  });
}

// ---------- leg curl ----------
{
  const ex = load("leg-curl");
  const v = variantOf(ex);
  const { distal: L, massFractions: mf, comFractions: cf } = ex.segments;
  const shinMoment = mf[1] * BODY * cf[1] * L;

  test("standing leg curl: load torque = m·g·L·sin(knee angle)", () => {
    for (const a of [0, 45, 90, 120]) close(analyze(ex, v("standing"), a, opts).loadTorque, 10 * G * L * sin(a));
  });

  test("lying leg curl: lifting the lower leg's own weight, = weight·COM·cos(knee angle)", () => {
    for (const a of [0, 45, 90, 120]) close(analyze(ex, v("lying"), a, opts).limbTorque, shinMoment * G * cos(a));
  });

  test("seated leg curl: the lower leg's weight helps", () => {
    close(analyze(ex, v("seated"), 0, opts).limbTorque, -shinMoment * G);
  });
}

// ---------- calf raise ----------
{
  const ex = load("calf-raise");
  const v = variantOf(ex);
  const Lf = ex.segments.distal;

  test("single-leg calf raise: (body + m)·g·foot lever·cos(angle)", () => {
    for (const a of [-20, 0, 20, 40]) close(analyze(ex, v("single-leg"), a, opts).jointTorque, (BODY + 10) * G * Lf * cos(a));
    close(analyze(ex, v("single-leg"), 0, opts).momentArm, Lf);
  });

  test("two-leg calf raise carries half the body weight per leg; seated carries none", () => {
    close(analyze(ex, v("two-leg"), 0, opts).jointTorque, (BODY / 2 + 10) * G * Lf);
    close(analyze(ex, v("seated"), 0, opts).jointTorque, 10 * G * Lf);
  });

  test("seated calf raise halves the gastrocnemius estimate", () => {
    const r = analyze(ex, v("seated"), 10, opts);
    const act = Object.fromEntries(muscleActivation(ex, v("seated"), r, 10).map((m) => [m.id, m.value]));
    const w = (id) => interp(ex.muscles.find((m) => m.id === id).weight, 10);
    close(act.gastrocnemius / act.soleus, (0.5 * w("gastrocnemius")) / w("soleus"));
  });
}

// ---------- hip abduction ----------
{
  const ex = load("hip-abduction");
  const v = variantOf(ex);
  const { proximal: L1, distal: L2, massFractions: mf, comFractions: cf } = ex.segments;
  const legMoment = BODY * (mf[0] * cf[0] * L1 + mf[1] * (L1 + cf[1] * L2));

  test("side-lying abduction with no added load: the leg's own weight, = weight·COM·cos(angle)", () => {
    const o = { ...opts, loadKg: 0 };
    for (const a of [0, 20, 45]) close(analyze(ex, v("side-lying"), a, o).jointTorque, legMoment * G * cos(a));
    assert.equal(analyze(ex, v("side-lying"), 0, o).force.mag, 0);
  });

  test("standing cable abduction: hand-computed torque at the start", () => {
    const { pulley } = v("cable").load;
    const tip = { x: 0, y: -(L1 + L2) };
    const d = { x: pulley.x - tip.x, y: pulley.y - tip.y };
    const fx = (10 * G * d.x) / Math.hypot(d.x, d.y);
    close(analyze(ex, v("cable"), 0, opts).loadTorque, tip.y * fx); // w = +1, r × F = −y·Fx at x = 0
    assert.ok(analyze(ex, v("cable"), 0, opts).loadTorque > 0);
  });
}

// ---------- glute kickback ----------
{
  const ex = load("glute-kickback");
  const v = variantOf(ex);
  const { proximal: L1, distal: L2 } = ex.segments;

  test("kneeling kickback with the knee at 90°: load torque = m·g·(L1·cos + L2·sin)(hip angle)", () => {
    for (const a of [0, 45, 90]) close(analyze(ex, v("kneeling"), a, opts).loadTorque, 10 * G * (L1 * cos(a) + L2 * sin(a)));
  });

  test("standing cable kickback: the cable resists hip extension at the start", () => {
    const { pulley } = v("cable").load;
    const tip = { x: 0, y: -(L1 + L2) };
    const d = { x: pulley.x - tip.x, y: pulley.y - tip.y };
    const fx = (10 * G * d.x) / Math.hypot(d.x, d.y);
    close(analyze(ex, v("cable"), 0, opts).loadTorque, -tip.y * fx); // w = −1, r × F = −y·Fx at x = 0
  });
}
