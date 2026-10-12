// 2D planar statics for single-joint exercises.
//
// Each exercise is a two-segment chain base → mid → tip in its own plane:
//   arms: shoulder → elbow → hand; legs: hip → knee → ankle, or knee → ankle → ball of foot.
// Coordinates: origin at the base joint, metres. The exercise's frame is given by
// exercise.view: "side" (x forward, y towards the head), "front" (x out to the side,
// y towards the head) or "top" (x out to the side, y forward). Gravity is a per-variant
// vector in that frame (default {x: 0, y: -1}: standing upright). Lying down tilts it;
// a horizontal plane of motion makes it {x: 0, y: 0}.
// Segment angles are measured from the -y axis (hanging down), positive turning towards +x.
// Pure functions only — imported by the browser UI and by node tests.

import { hipPosture } from "./hipmodel.js";

export const G = 9.81;

const rad = (deg) => (deg * Math.PI) / 180;
const cross = (r, f) => r.x * f.y - r.y * f.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const along = (from, angle, len) => ({ x: from.x + len * Math.sin(angle), y: from.y - len * Math.cos(angle) });

/** Linear interpolation in a sorted [[x, y], ...] table, clamped at the ends. */
export function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

export const gravityOf = (variant) => variant.gravity ?? { x: 0, y: -1 };

/**
 * Rotation sense of the concentric (lifting) phase: +1 counter-clockwise, -1 clockwise.
 * angleSense: +1 if a growing joint angle turns the moving segment counter-clockwise.
 * concentric: "increase" (default) if the joint angle grows while lifting, "decrease" if it shrinks.
 */
export const workSense = (exercise) => (exercise.angleSense ?? 1) * (exercise.concentric === "decrease" ? -1 : 1);

/**
 * Segment end points at a given joint angle.
 * movingJoint "distal" (default): the proximal segment is fixed at variant.proximalAngle
 *   and the angle is the mid joint's (e.g. elbow flexion, 0 = straight).
 * movingJoint "proximal": the chain is held at a fixed bend (variant.distalBend, default
 *   straight) and swings about the base joint.
 * The pose angle of the moving segment is exercise.angleOffset + angleSense × angle.
 */
export function pose(exercise, variant, angleDeg) {
  const { proximal, distal } = exercise.segments;
  const turn = rad((exercise.angleOffset ?? 0) + (exercise.angleSense ?? 1) * angleDeg);
  const base0 = rad(variant.proximalAngle ?? 0);
  const proximalMoves = exercise.movingJoint === "proximal";
  const a = proximalMoves ? base0 + turn : base0;
  const phi = proximalMoves ? a + rad(variant.distalBend ?? 0) : a + turn;
  const base = { x: 0, y: 0 };
  const mid = along(base, a, proximal);
  const tip = along(mid, phi, distal);
  return { base, mid, tip, joint: proximalMoves ? base : mid, proximalAngle: a, distalAngle: phi };
}

/**
 * Force the external load applies to the body (N) and the point it acts at (`at`).
 * gravity:  m·g along the variant's gravity vector, at the tip.
 * cable:    m·g towards the pulley, at the tip.
 * band:     an elastic band from its anchor (load.pulley) to the tip. Tension grows linearly
 *           with stretch: zero at load.restLength, m·g at load.refLength (the slider's kg is
 *           the band's tension at that reference length). Slack bands pull nothing.
 * machine:  a pad on the moving segment, load.padDistance from the joint, pushing
 *           perpendicular to the segment against the lift. The cam profile gives the
 *           effective radius r(angle) in metres, so joint torque = m·g·r. Assumes the
 *           machine's axis is aligned with the joint.
 * reaction: closed chain (e.g. calf raise): the floor pushes up on the tip with the load
 *           plus the share of body mass this limb carries (load.bodyWeight: 1 on one leg,
 *           0.5 on two, 0 seated): (m + share·body)·g against gravity.
 * A gravity load acts at the tip, or with load.on ("proximal" / "distal") and load.along
 * (fraction from that segment's start) at a point on a segment (e.g. a plate held at the chest).
 */
export function loadForce(exercise, variant, p, angleDeg, { loadKg, pulley, bodyMassKg = 75 }) {
  const { load } = variant;
  const mag = loadKg * G;
  if (load.type === "machine") {
    const d = sub(p.tip, p.joint);
    const len = Math.hypot(d.x, d.y);
    const u = { x: d.x / len, y: d.y / len };
    const at = { x: p.joint.x + u.x * load.padDistance, y: p.joint.y + u.y * load.padDistance };
    const F = (mag * interp(load.camProfile.points, angleDeg)) / load.padDistance;
    const w = workSense(exercise);
    return { x: w * F * u.y, y: -w * F * u.x, mag: F, at };
  }
  if (load.type === "band") {
    const d = sub(pulley ?? load.pulley, p.tip);
    const len = Math.hypot(d.x, d.y);
    const F = (mag * Math.max(0, len - load.restLength)) / (load.refLength - load.restLength);
    if (len < 1e-6 || F <= 0) return { x: 0, y: 0, mag: 0, at: p.tip };
    return { x: (F * d.x) / len, y: (F * d.y) / len, mag: F, at: p.tip };
  }
  if (load.type === "cable") {
    const d = sub(pulley ?? load.pulley, p.tip);
    const len = Math.hypot(d.x, d.y);
    if (len < 1e-6) return { x: 0, y: 0, mag: 0, at: p.tip };
    return { x: (mag * d.x) / len, y: (mag * d.y) / len, mag, at: p.tip };
  }
  const g = gravityOf(variant);
  if (load.type === "reaction") {
    const F = (loadKg + (load.bodyWeight ?? 0) * bodyMassKg) * G;
    return { x: -F * g.x, y: -F * g.y, mag: F * Math.hypot(g.x, g.y), at: p.tip };
  }
  const [a, b] = load.on === "proximal" ? [p.base, p.mid] : [p.mid, p.tip];
  const at = load.on ? { x: a.x + (b.x - a.x) * load.along, y: a.y + (b.y - a.y) * load.along } : p.tip;
  return { x: mag * g.x, y: mag * g.y, mag: mag * Math.hypot(g.x, g.y), at };
}

/** Weight of the moving limb segments: [{ at, f }] at their centres of mass. */
export function limbWeights(exercise, variant, p, bodyMassKg = 75) {
  const { massFractions, comFractions } = exercise.segments;
  if (!massFractions) return [];
  const g = gravityOf(variant);
  const seg = (from, to, i) => {
    const m = massFractions[i] * bodyMassKg * G;
    const c = comFractions[i];
    return { at: { x: from.x + (to.x - from.x) * c, y: from.y + (to.y - from.y) * c }, f: { x: m * g.x, y: m * g.y } };
  };
  const out = [seg(p.mid, p.tip, 1)];
  if (exercise.movingJoint === "proximal") out.unshift(seg(p.base, p.mid, 0));
  return out;
}

/**
 * Full analysis at one angle.
 * jointTorque > 0 : the load (plus the limb's own weight) resists the lift, so the prime
 *   movers work. loadTorque and limbTorque are the two parts.
 * stabiliserDemand: when the mid joint moves, the torque the base joint must supply to hold
 *   the proximal segment still against clockwise rotation (the shoulder flexors in a standing
 *   curl). 0 when a pad supports the segment or the base joint itself moves.
 */
/** A placement slider's value: the slider, else the variant's preset, else `fallback`. */
const slider = (spec, variant, placement, fallback) => Number(placement?.[spec.key] ?? variant.params?.[spec.key] ?? fallback);
const applies = (spec, variant) => !spec.variants || spec.variants.includes(variant.id);
const turnCcw = (p, deg) => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };

/**
 * The body leaning (a placement slider with `lean: { pivot: [x, y] }`, degrees, + = the trunk tipped
 * forward, towards +x, about the pivot, e.g. the hips): the variant's gravity and pulley, given
 * for the upright stance, expressed in the leaning body's frame.
 */
export function leanFrame(spec, deg) {
  const piv = { x: spec.lean.pivot[0], y: spec.lean.pivot[1] };
  return {
    dir: (g) => turnCcw(g, deg),
    point: (q) => { const r = turnCcw({ x: q.x - piv.x, y: q.y - piv.y }, deg); return { x: piv.x + r.x, y: piv.y + r.y }; },
  };
}

export function analyze(exercise0, variant0, angleDeg, opts0) {
  const { peakTorqueNm, bodyMassKg = 75 } = opts0;
  // A placement slider with `distalBend` (e.g. the kickback's knee bend, degrees of flexion) sets
  // the fixed bend between the two segments: distalBend = bendSign × value (default −1: the knee
  // folds the other way to the hip's flexion; +1: the elbow folds on in a front raise). With
  // `distalBend: "outOfPlane"` the bend leaves the plane (a lateral raise's forearm swings
  // forward): in the plane the distal segment is foreshortened to length × cos(bend), which is
  // exact for loads and weights in the plane.
  const bendSpec = exercise0.placement?.find((s) => s.distalBend && applies(s, variant0));
  const bendVal = bendSpec ? slider(bendSpec, variant0, opts0.placement, -(variant0.distalBend ?? 0)) : undefined;
  const outOfPlane = bendSpec?.distalBend === "outOfPlane";
  const exercise = outOfPlane ? { ...exercise0, segments: { ...exercise0.segments, distal: exercise0.segments.distal * Math.cos(rad(bendVal)) } } : exercise0;
  let variant = bendSpec && !outOfPlane ? { ...variant0, distalBend: (bendSpec.bendSign ?? -1) * bendVal } : variant0;
  let opts = opts0;
  const leanSpec = exercise0.placement?.find((s) => s.lean && applies(s, variant0));
  const leanDeg = leanSpec ? slider(leanSpec, variant0, opts0.placement, 0) : 0;
  if (leanDeg) {
    const L = leanFrame(leanSpec, leanDeg);
    variant = { ...variant, gravity: L.dir(gravityOf(variant)), ...(variant.load.pulley ? { load: { ...variant.load, pulley: L.point(variant.load.pulley) } } : {}) };
    if (opts0.pulley) opts = { ...opts0, pulley: L.point(opts0.pulley) };
  }
  // Hip ab/adduction with the leg swung forward or back (hip.flexSlider): the side raise's plane
  // tilts with it, so only cos(bend) of the leg's weight acts in that plane.
  const hipFlex = variant.hip?.flexSlider ? Number(opts0.placement?.hipFlex ?? variant.params?.hipFlex ?? 0) : 0;
  if (hipFlex) { const g = gravityOf(variant), c = Math.cos(rad(hipFlex)); variant = { ...variant, gravity: { x: g.x * c, y: g.y * c } }; }
  const p = pose(exercise, variant, angleDeg);
  if (leanSpec) p.leanDeg = leanDeg;
  if (leanDeg) p.gravity = variant.gravity;
  const f = loadForce(exercise, variant, p, angleDeg, opts);
  const w = workSense(exercise);
  const loadTorque = -w * cross(sub(f.at, p.joint), f);
  const limbs = limbWeights(exercise, variant, p, bodyMassKg);
  const limbTorque = limbs.reduce((s, l) => s - w * cross(sub(l.at, p.joint), l.f), 0);
  const jointTorque = loadTorque + limbTorque;
  const stabilised = variant.proximalSupported || exercise.movingJoint === "proximal";
  const stabiliserDemand = stabilised ? 0 : Math.max(0, -cross(sub(f.at, p.base), f));

  // Perpendicular from the joint onto the load's line of action = the moment arm.
  let momentArm = 0;
  let momentArmFoot = p.joint;
  if (f.mag > 0) {
    const u = { x: f.x / Math.hypot(f.x, f.y), y: f.y / Math.hypot(f.x, f.y) };
    const ja = sub(p.joint, f.at);
    const t = ja.x * u.x + ja.y * u.y;
    momentArmFoot = { x: f.at.x + u.x * t, y: f.at.y + u.y * t };
    momentArm = loadTorque / f.mag;
  }

  // Posture correction for this variant (e.g. a two-joint muscle at a different length, or the
  // grip): a factor on the strength curve, constant or varying with the joint angle (or, with
  // `by: "hipFlexion"`, with the hip bend of the hip-model exercises).
  const hip = exercise.hipModel ? hipPosture(variant, angleDeg, opts.placement) : undefined;
  // An exercise-level strength factor chosen with a placement slider (`placementStrength`: values
  // by option, e.g. the leg curl's foot position), on top of the variant's posture correction.
  const ps = exercise.placementStrength;
  const psVal = ps ? opts.placement?.[ps.key] ?? variant.params?.[ps.key] ?? ps.default : undefined;
  const strengthScale = strengthScaleAt(variant, angleDeg, { hipFlexion: hip?.flexion, knee: bendVal }) * (ps ? ps.values[String(psVal)] ?? 1 : 1);
  const capacity = interp(exercise.strengthCurve.points, angleDeg) * peakTorqueNm * strengthScale;
  const effort = Math.max(0, jointTorque) / capacity;

  const pulley = variant.load.type === "cable" || variant.load.type === "band" ? (opts.pulley ?? variant.load.pulley) : undefined;
  if (leanDeg && pulley) p.pulley = pulley;
  return { angle: angleDeg, pose: p, force: f, limbs, jointTorque, loadTorque, limbTorque, stabiliserDemand, momentArm, momentArmFoot, capacity, effort, strengthScale, placement: opts.placement, ...(hip ? { hip } : {}), ...(bendSpec ? { knee: bendVal, bend: bendVal, ...(outOfPlane ? { bendOutOfPlane: true } : {}) } : {}), ...(leanDeg ? { pulley, gravity: variant.gravity } : {}) };
}

/** The variant's strength factor: `strengthScale.points` (by joint angle, or by `at[sc.by]`) or `.factor`; 1 if none. */
export function strengthScaleAt(variant, angleDeg, at = {}) {
  const sc = variant.strengthScale;
  if (!sc) return 1;
  return sc.points ? interp(sc.points, sc.by ? at[sc.by] ?? 0 : angleDeg) : sc.factor;
}

/** The range of motion of a variant: its own `angleRange` if it has one, else the exercise's. */
export const rangeOf = (exercise, variant) => variant?.angleRange ?? exercise.angleRange;

/** Sample analyze() across the variant's range of motion. */
export function sampleCurve(exercise, variant, opts, step = 2.5) {
  const [lo, hi] = rangeOf(exercise, variant);
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += step) out.push({ angle: a, ...analyze(exercise, variant, a, opts) });
  return out;
}
