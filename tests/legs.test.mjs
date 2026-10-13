// Hand-computable cases for the leg exercises.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, interp, G, strengthScaleAt } from "../js/physics.js";
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

  // The ankle→ball lever slopes down from the ankle: at plantarflexion θ its horizontal reach is
  // Lf·sin(offset − θ), where offset is the lever's angle from the shin at neutral (≈ 60°).
  const reach = (a) => Lf * Math.sin(((ex.angleOffset - a) * Math.PI) / 180);

  test("single-leg calf raise: (body + m)·g × the ankle→ball lever's horizontal reach", () => {
    for (const a of [-20, 0, 20, 40]) close(analyze(ex, v("single-leg"), a, opts).jointTorque, (BODY + 10) * G * reach(a));
    close(analyze(ex, v("single-leg"), 0, opts).momentArm, 0.14, 1e-3); // 14 cm in front of the ankle at neutral
    assert.ok(reach(30) < 0.6 * reach(0), "high on the toes the lever is much shorter");
  });

  test("two-leg calf raise carries half the body weight per leg; seated carries none", () => {
    close(analyze(ex, v("two-leg"), 0, opts).jointTorque, (BODY / 2 + 10) * G * reach(0));
    close(analyze(ex, v("seated"), 0, opts).jointTorque, 10 * G * reach(0));
  });

  test("seated calf raise: gastrocnemius share cut by a third (measured EMG), strength × 0.92 vs × 1.2 standing (Cresswell et al.)", () => {
    const r = analyze(ex, v("seated"), 10, opts);
    const act = Object.fromEntries(muscleActivation(ex, v("seated"), r, 10).map((m) => [m.id, m.value]));
    const w = (id) => interp(ex.muscles.find((m) => m.id === id).weight, 10);
    close(act["gastroc-medial"] / act.soleus, (0.65 * w("gastroc-medial")) / w("soleus"));
    close(act["gastroc-lateral"] / act.soleus, (0.65 * w("gastroc-lateral")) / w("soleus"));
  });

  test("calf raise toes in / out: the ankle torque is unchanged; the gastrocnemius heads shift by Cibulka et al.'s ratios", () => {
    const at = (deg) => { const o = { ...opts, placement: { footAngle: deg } }; const r = analyze(ex, v("single-leg"), 10, o); return { r, act: Object.fromEntries(muscleActivation(ex, v("single-leg"), r, 10).map((m) => [m.id, m.value])) }; };
    const [inn, mid, out] = [at(-45), at(0), at(45)];
    close(inn.r.jointTorque, mid.r.jointTorque);
    close(out.r.jointTorque, mid.r.jointTorque);
    // Standing heel rise, % MVIC: toes in MG 75.8 / LG 70.7, toes out MG 79.2 / LG 68.9.
    close(out.act["gastroc-medial"] / inn.act["gastroc-medial"], 79.2 / 75.8, 2e-3);
    close(out.act["gastroc-lateral"] / inn.act["gastroc-lateral"], 68.9 / 70.7, 2e-3);
    close(mid.act.soleus, out.act.soleus);
    // Cresswell et al. Table 1: 134.9 Nm knee straight, 103.7 Nm at 90°, base curve at 50° (119.25 → 108.91 between 30° and 60°).
    const ref = 119.25 + (108.91 - 119.25) * (20 / 30);
    close(v("seated").strengthScale.factor, Math.round((103.7 / ref) * 100) / 100);
    // Knee straight: the same 1.2 at and below foot-flat (Cresswell et al. measured at 5° of dorsiflexion).
    close(strengthScaleAt(v("single-leg"), -5), Math.round((134.91 / ref) * 100) / 100);
    close(analyze(ex, v("single-leg"), -5, opts).capacity / analyze(ex, v("seated"), -5, opts).capacity, strengthScaleAt(v("single-leg"), -5) / v("seated").strengthScale.factor);
  });

  test("standing calf raise: with the knee straight, strength keeps about half its foot-flat value near the top (OpenSim knee-straight curve, in line with Chen & Franklin), so a body-weight raise stays possible", () => {
    const at = (x) => analyze(ex, v("single-leg"), x, opts).capacity;
    assert.ok(Math.abs(at(34) / at(0) - 0.45) < 0.03, `${at(34) / at(0)}`);
    assert.ok(Math.abs(at(20) / at(0) - 0.74) < 0.03, `${at(20) / at(0)}`);
    const noLoad = { ...opts, loadKg: 0 };
    for (let x = -20; x <= 40; x += 2) assert.ok(analyze(ex, v("single-leg"), x, noLoad).effort < 1.05, `single-leg body weight @${x}`);
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

// ---------- glute kickback: knee-bend slider ----------
{
  const ex = load("glute-kickback");
  const kneeling = ex.variants.find((x) => x.id === "kneeling");
  const o = (knee) => ({ loadKg: 4, peakTorqueNm: 200, bodyMassKg: 75, placement: { knee } });
  test("kickback knee slider: the preset 90° gives the same pose and torque as a fixed 90° bend", () => {
    const { placement, ...plain } = ex;
    const fixed = analyze(plain, { ...kneeling, distalBend: -90 }, 30, { ...o(90), placement: undefined });
    const slid = analyze(ex, kneeling, 30, o(90));
    assert.ok(Math.abs(fixed.jointTorque - slid.jointTorque) < 1e-9);
    assert.ok(Math.abs(fixed.pose.tip.x - slid.pose.tip.x) < 1e-12);
  });
  test("kickback knee slider: with the knee bent 90° the hamstrings nearly drop out near full hip extension, strength × 0.82 (Yamamoto)", () => {
    const val = (knee) => Object.fromEntries(muscleActivation(ex, kneeling, analyze(ex, kneeling, -20, o(knee)), -20).map((m) => [m.id, m.value]));
    const straight = val(0), bent = val(90);
    assert.ok(bent.hamstrings < 0.1 * straight.hamstrings, `${bent.hamstrings} vs ${straight.hamstrings}`);
    assert.ok(Math.abs(analyze(ex, kneeling, -20, o(90)).strengthScale - 0.82) < 1e-9);
  });
}

test("leg curl: toes pulled up vs pointed changes knee-flexion strength by the measured ~10% (Vuk 2023), not the load's torque", async () => {
  const { readFileSync } = await import("node:fs");
  const { analyze } = await import("../js/physics.js");
  const ex = JSON.parse(readFileSync(new URL("../data/exercises/leg-curl.json", import.meta.url)));
  assert.ok(ex.placementStrength.note && ex.placementStrength.source);
  for (const v of ex.variants) {
    const at = (foot) => analyze(ex, v, 45, { loadKg: 20, peakTorqueNm: ex.defaults.peakTorqueNm, bodyMassKg: 75, placement: { foot } });
    const up = at("up"), relaxed = at("relaxed"), pointed = at("pointed");
    assert.ok(Math.abs(up.capacity / pointed.capacity - 1.05 / 0.95) < 1e-9, v.id);
    assert.ok(Math.abs(relaxed.capacity - analyze(ex, v, 45, { loadKg: 20, peakTorqueNm: ex.defaults.peakTorqueNm, bodyMassKg: 75 }).capacity) < 1e-9);
    assert.equal(up.jointTorque, pointed.jointTorque);
  }
});

test("hand-computed: deep squat, the thigh–calf contact takes force × lever off the knee (none above 130°), and leaves the hip alone", async () => {
  const { analyzeMulti } = await import("../js/multijoint.js");
  const ex = JSON.parse(readFileSync(new URL("../data/exercises/squat.json", import.meta.url)));
  const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
  const v = ex.variants[0];
  // Side push fixed: "auto" would re-optimise it when the knee load changes.
  const run = (x, spec) => analyzeMulti({ ...ex, thighCalf: spec }, v, x, { loadKg: 40, bodyMassKg: 75, body, placement: { ...v.params, sidePush: 0 } });
  const knee = (r) => r.joints.find((j) => j.id === "knee").torque, hip = (r) => r.joints.find((j) => j.id === "hip").torque;
  // Above 130° nothing changes.
  assert.equal(knee(run(120, ex.thighCalf)), knee(run(120, undefined)));
  // At 150°: 27.9% of body weight per leg, perpendicular to the shank 15.1 cm below the knee → F × 0.151 m less knee torque.
  const F = 0.279 * 75 * 9.81;
  const withC = run(150, ex.thighCalf), without = run(150, undefined);
  assert.ok(Math.abs(knee(without) - knee(withC) - F * 0.151) < 1, `${knee(without) - knee(withC)} vs ${F * 0.151}`);
  assert.ok(Math.abs(hip(without) - hip(withC)) < 1e-6, "the hip is unchanged");
  assert.ok(withC.forces.length === 4, "the contact is drawn as a force on each calf");
});
