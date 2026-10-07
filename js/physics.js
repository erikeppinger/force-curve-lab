// 2D sagittal-plane statics for single-joint exercises.
// Coordinate system: origin at the shoulder, x points forward, y points up, metres.
// Joint angles in degrees; positive torque about z (counter-clockwise) = flexion.
// Pure functions only — imported by the browser UI and by node tests.

export const G = 9.81;

const rad = (deg) => (deg * Math.PI) / 180;
const cross = (r, f) => r.x * f.y - r.y * f.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

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

/** Segment end points for a given elbow flexion angle (0 = arm straight). */
export function pose(exercise, variant, angleDeg) {
  const { upperArm, forearm } = exercise.segments;
  const a = rad(variant.upperArmAngle ?? 0);
  const phi = a + rad(angleDeg);
  const shoulder = { x: 0, y: 0 };
  const elbow = { x: upperArm * Math.sin(a), y: -upperArm * Math.cos(a) };
  const hand = {
    x: elbow.x + forearm * Math.sin(phi),
    y: elbow.y - forearm * Math.cos(phi),
  };
  return { shoulder, elbow, hand, upperArmAngle: a, forearmAngle: phi };
}

/** Force the load applies to the hand (N). Cables pull towards the pulley. */
export function loadForce(variant, hand, loadKg, pulley) {
  const mag = loadKg * G;
  if (variant.load.type === "cable") {
    const p = pulley ?? variant.load.pulley;
    const d = sub(p, hand);
    const len = Math.hypot(d.x, d.y);
    if (len < 1e-6) return { x: 0, y: 0, mag: 0 };
    return { x: (mag * d.x) / len, y: (mag * d.y) / len, mag };
  }
  return { x: 0, y: -mag, mag };
}

/**
 * Full analysis at one angle.
 * elbowTorque > 0  : load resists flexion (elbow flexors work).
 * shoulderFlexorDemand: torque the shoulder flexors must supply to keep the
 *   upper arm still (0 when a pad supports the arm).
 */
export function analyze(exercise, variant, angleDeg, { loadKg, pulley, peakTorqueNm }) {
  const p = pose(exercise, variant, angleDeg);
  const f = loadForce(variant, p.hand, loadKg, pulley);
  const elbowTorque = -cross(sub(p.hand, p.elbow), f);
  const shoulderTorque = cross(sub(p.hand, p.shoulder), f);
  const shoulderFlexorDemand = variant.upperArmSupported ? 0 : Math.max(0, -shoulderTorque);

  // Perpendicular from the elbow onto the line of action = the moment arm.
  let momentArm = 0;
  let momentArmFoot = p.elbow;
  if (f.mag > 0) {
    const u = { x: f.x / f.mag, y: f.y / f.mag };
    const eh = sub(p.elbow, p.hand);
    const t = eh.x * u.x + eh.y * u.y;
    momentArmFoot = { x: p.hand.x + u.x * t, y: p.hand.y + u.y * t };
    momentArm = elbowTorque / f.mag;
  }

  const capacity = interp(exercise.strengthCurve.points, angleDeg) * peakTorqueNm;
  const effort = Math.max(0, elbowTorque) / capacity;

  return { pose: p, force: f, elbowTorque, shoulderFlexorDemand, momentArm, momentArmFoot, capacity, effort };
}

/** Sample analyze() across the exercise's range of motion. */
export function sampleCurve(exercise, variant, opts, step = 2.5) {
  const [lo, hi] = exercise.angleRange;
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += step) out.push({ angle: a, ...analyze(exercise, variant, a, opts) });
  return out;
}
