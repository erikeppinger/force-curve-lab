// Edge lift: finger statics (js/finger.js) and its data file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { G, interp } from "../js/physics.js";
import { analyzeFinger, sampleFinger, fingerSet } from "../js/finger.js";
import { muscleActivation } from "../js/muscles.js";

const ex = JSON.parse(readFileSync(new URL("../data/exercises/edge-lift.json", import.meta.url)));
const v = (id) => ex.variants.find((x) => x.id === id);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const cross = (r, f) => r.x * f.y - r.y * f.x;
const L = ex.finger.lengths;
// A wrist far away along the metacarpal: the edge pulls straight along it (-y), as in the
// paper's set-up, which makes the lever arms easy to compute by hand.
const along = structuredClone(ex);
along.finger.lengths.metacarpal = 1e7;

test("straight finger: the pull runs along the bones, so no joint moments, tendons or pulley loads", () => {
  const straight = { ...v("half-crimp"), params: { ...v("half-crimp").params, mcp: 0, dip: 0 } };
  const r = analyzeFinger(ex, straight, 0, { loadKg: 20 });
  for (const m of Object.values(r.moments)) close(m, 0, 1e-12);
  close(r.tendons.fdp, 0, 1e-9); close(r.tendons.fds, 0, 1e-9);
  close(r.pulleys.a2, 0, 1e-9); close(r.pulleys.a4, 0, 1e-9);
});

test("load: fingertip force = block × g × finger share, on a line through the wrist", () => {
  const r = analyzeFinger(ex, v("full-crimp"), 100, { loadKg: 30, placement: { fingerShare: 0.3 } });
  close(r.fingertipN, 30 * G * 0.3);
  close(Math.hypot(r.force.x, r.force.y), r.fingertipN);
  close(cross({ x: r.pose.contact.x - r.pose.wrist.x, y: r.pose.contact.y - r.pose.wrist.y }, r.force), 0, 1e-9);
});

test("hand-computed: PIP 90°, fingertip in line, pull along the metacarpal", () => {
  const d = 0.008;
  const p = { ...v("half-crimp").params, mcp: 0, dip: 0, contactFromDip: d, fingerShare: 0.25 };
  const r = analyzeFinger(along, { ...v("half-crimp"), params: p }, 90, { loadKg: 10 });
  const F = 10 * G * p.fingerShare;
  close(r.moments.dip, F * d, 1e-6);
  close(r.moments.pip, F * (L.middle + d), 1e-6);
  close(r.moments.mcp, F * (L.middle + d), 1e-6);
  // FDP alone balances the DIP; FDS supplies the rest at the PIP (with the bowstring-lengthened arms).
  const rm = ex.finger.momentArms;
  const fdpPip = rm.fdpPip + interp(ex.finger.bowstring.fdp, 90);
  const fdsPip = rm.fdsPip + interp(ex.finger.bowstring.fds, 90);
  close(r.tendons.fdp, (F * d) / rm.fdpDip, 1e-3);
  close(r.tendons.fds, (F * (L.middle + d) - r.tendons.fdp * fdpPip) / fdsPip, 1e-3);
});

test("equilibrium at the DIP and PIP in every grip and angle", () => {
  for (const variant of ex.variants) {
    for (const r of sampleFinger(ex, variant, { loadKg: 25 }, 10)) {
      const rm = r.momentArms;
      if (r.moments.dip > 0) close(r.tendons.fdp * rm.fdpDip + r.passive, r.moments.dip, 1e-9);
      if (r.tendons.fds > 0) close(r.tendons.fdp * rm.fdpPip + r.tendons.fds * rm.fdsPip, r.moments.pip, 1e-9);
      else close(r.tendons.fdp * rm.fdpPip - r.pipExtensor, r.moments.pip, 1e-9);
    }
  }
});

test("crimping loads the A2 pulley far more than an open hand, per newton at the fingertip", () => {
  const per = (id) => { const r = analyzeFinger(ex, v(id), v(id).params.pip, { loadKg: 20 }); return r.pulleys.a2 / r.fingertipN; };
  assert.ok(per("full-crimp") > 5 * per("open-hand"), `${per("full-crimp")} vs ${per("open-hand")}`);
  assert.ok(per("half-crimp") > 5 * per("open-hand"));
});

test("full crimp on the paper's 1 cm hold lands near Vigouroux et al.'s estimates", () => {
  // Measured: FDP:FDS 1.75, A2 2.7× and A4 2.4× the fingertip force (6 climbers, middle finger).
  const r = analyzeFinger(along, v("full-crimp"), v("full-crimp").params.pip, { loadKg: 95.6 / G / 0.25 });
  assert.ok(r.ratio > 1 && r.ratio < 2.5, `FDP:FDS ${r.ratio}`);
  const a2 = r.pulleys.a2 / r.fingertipN, a4 = r.pulleys.a4 / r.fingertipN;
  assert.ok(a2 > 2 && a2 < 3.5, `A2 ${a2}`);
  assert.ok(a4 > 1 && a4 < 3.5, `A4 ${a4}`);
});

test("pressing closer to the fingertip joint shifts work from the FDP to the FDS", () => {
  const at = (d) => analyzeFinger(ex, v("half-crimp"), 90, { loadKg: 20, placement: { contactFromDip: d } }).tendons;
  assert.ok(at(0.004).fdp < at(0.015).fdp);
  assert.ok(at(0.004).fds > at(0.015).fds);
});

test("effort = fingertip force ÷ (the grip's maximum × strength %)", () => {
  const r = analyzeFinger(ex, v("open-hand"), 26, { loadKg: 20, strengthPct: 80 });
  close(r.effort, r.fingertipN / (v("open-hand").params.maxFingertipN * 0.8));
});

test("muscle bars: tendon tension ÷ reference tension, kept within 0–1", () => {
  for (const variant of ex.variants) {
    const r = analyzeFinger(ex, variant, variant.params.pip, { loadKg: 60 });
    for (const m of muscleActivation(ex, variant, r, variant.params.pip)) {
      assert.ok(m.value >= 0 && m.value <= 1, m.id);
      close(m.value, Math.min(1, r.tendons[m.tendon] / ex.finger.referenceTension[m.tendon]));
    }
  }
});

test("edge-lift data: grips, sources and phases", () => {
  assert.equal(ex.model, "finger");
  for (const variant of ex.variants) {
    const p = variant.params;
    for (const k of ["mcp", "dip", "pip", "maxFingertipN", "contactFromDip"]) assert.ok(Number.isFinite(p[k]), `${variant.id}: ${k}`);
    assert.ok(p.fingerShare === "auto" || Number.isFinite(p.fingerShare), `${variant.id}: fingerShare`);
    assert.ok(variant.notes && variant.source, variant.id);
  }
  for (const k of ["lengths", "momentArms", "bowstring", "contact", "referenceTension"]) {
    if (k !== "contact") assert.ok(ex.finger[k], k);
    assert.ok(ex.finger[`${k}Note`], `${k}Note`);
  }
  assert.ok(ex.finger.lengthsSource && ex.finger.momentArmsSource && ex.finger.bowstringSource && ex.finger.referenceTensionSource);
  const [lo, hi] = ex.angleRange;
  assert.equal(ex.phases[0].range[0], lo);
  assert.equal(ex.phases.at(-1).range[1], hi);
  for (const s of ex.placement) assert.ok(ex.variants.every((x) => Number.isFinite(x.params[s.key]) || (s.auto && x.params[s.key] === "auto")), s.key);
});

test("maximum block: the grip's maximum fingertip force × strength ÷ (g × finger share)", () => {
  const r = analyzeFinger(ex, v("full-crimp"), 100, { loadKg: 20, strengthPct: 90, placement: { fingerShare: 0.3 } });
  close(r.maxBlockKg, (82 * 0.9) / (G * 0.3), 1e-9);
  // At that block the effort is exactly 100%.
  close(analyzeFinger(ex, v("full-crimp"), 100, { loadKg: r.maxBlockKg, strengthPct: 90, placement: { fingerShare: 0.3 } }).effort, 1, 1e-9);
});

test("arm: hanging straight carries the block as a pull only; turned out, the shoulder holds W·reach·sin(angle)", () => {
  const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
  const L = body.lengths, m = body.mass, c = body.com;
  const at = (fwd, side) => analyzeFinger(ex, v("half-crimp"), 90, { loadKg: 30, body, bodyMassKg: 75, placement: { armForward: fwd, armSide: side } }).arm;
  const straight = at(0, 0);
  close(straight.shoulderForward, 0); close(straight.shoulderSide, 0); close(straight.elbow, 0);
  close(straight.traction, (30 + 75 * (m.upperArm + m.forearmHand)) * G, 1e-9);
  const armMoment = G * 75 * (m.upperArm * c.upperArm * L.upperArm + m.forearmHand * (L.upperArm + c.forearmHand * L.forearm));
  const fwd = at(20, 0);
  close(fwd.shoulderForward, (30 * G * (L.upperArm + L.forearm) + armMoment) * Math.sin((20 * Math.PI) / 180), 1e-9);
  close(fwd.shoulderSide, 0);
  assert.ok(at(20, 0).effort.shoulderSide === 0 && at(0, 20).effort.shoulderSide > at(20, 0).effort.shoulderForward, "sideways is the weaker direction");
});

test("four fingers: shares add up to the block, forces and the wrist's sideways moment follow", () => {
  for (const v of ex.variants) {
    const W = 300;
    const set = fingerSet(ex, v.params, v.params.pip, W);
    const touching = set.fingers.filter((f) => f.touches);
    assert.ok(touching.length >= 2, v.id);
    assert.ok(Math.abs(set.fingers.reduce((s, f) => s + f.share, 0) - 1) < 1e-9, v.id);
    for (const f of set.fingers) {
      assert.ok(f.share >= 0, v.id);
      assert.ok(Math.abs(f.force - W * f.share) < 1e-9, v.id);
    }
    const m = set.fingers.reduce((s, f) => s + f.force * f.zWorld, 0);
    assert.ok(Math.abs(set.wristSide - m) < 1e-9);
    assert.ok(set.deviationDeg >= -15 && set.deviationDeg <= 25);
  }
});

test("four fingers, quadriga 100%: the touching middle/ring/little FDP slips sit at the same share of their strength", () => {
  const v = ex.variants.find((x) => x.id === "half-crimp");
  const set = fingerSet(ex, { ...v.params, quadriga: 1 }, v.params.pip, 300);
  const rel = set.fingers.filter((f) => f.touches && f.reach === 1 && f.id !== "index").map((f) => f.res.tendons.fdp / f.tmax.fdp);
  assert.ok(rel.length >= 2);
  for (const r of rel) assert.ok(Math.abs(r - rel[0]) / rel[0] < 0.01, `${r} vs ${rel[0]}`);
});

test("four fingers, independent slips: least effort leaves every touching finger at the same effort cost per share", () => {
  // Without links, minimising Σ c_i s_i² under Σ s_i = 1 gives c_i s_i equal (Lagrange).
  const v = ex.variants.find((x) => x.id === "half-crimp");
  const set = fingerSet(ex, { ...v.params, quadriga: 0 }, v.params.pip, 300);
  const k = set.fingers.filter((f) => f.touches && f.reach === 1).map((f) => ((f.per.a / f.tmax.fdp) ** 2 + (f.per.b / f.tmax.fds) ** 2) * f.share);
  for (const x of k) assert.ok(Math.abs(x - k[0]) / k[0] < 1e-6);
});

test("four fingers: tilting the edge tilts the hand with it", () => {
  const v = ex.variants.find((x) => x.id === "half-crimp");
  const flat = fingerSet(ex, v.params, v.params.pip, 300);
  const tilted = fingerSet(ex, { ...v.params, edgeTilt: 10 }, v.params.pip, 300);
  assert.ok(tilted.deviationDeg < flat.deviationDeg, `${tilted.deviationDeg} vs ${flat.deviationDeg}`);
});
