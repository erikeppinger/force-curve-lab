// 2D planar statics for single-joint exercises.
// Coordinate system: origin at the shoulder, y points up, metres. x points forward in
// side-view exercises (sagittal plane) and out to the side in front-view exercises
// (frontal plane, exercise.view === "front").
// Joint angles in degrees; positive torque about z (counter-clockwise) = flexion / abduction.
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

/**
 * Segment end points at a given joint angle.
 * movingJoint "elbow" (default): the upper arm is fixed at variant.upperArmAngle and
 *   the angle is elbow flexion (0 = arm straight).
 * movingJoint "shoulder": the arm is held straight and the angle is how far it has
 *   swung up from hanging by the side (0 = arm down).
 * `joint` is the point the exercise rotates about.
 */
export function pose(exercise, variant, angleDeg) {
  const { upperArm, forearm } = exercise.segments;
  const shoulderMoves = exercise.movingJoint === "shoulder";
  const a = rad(shoulderMoves ? angleDeg : variant.upperArmAngle ?? 0);
  const phi = shoulderMoves ? a : a + rad(angleDeg);
  const shoulder = { x: 0, y: 0 };
  const elbow = { x: upperArm * Math.sin(a), y: -upperArm * Math.cos(a) };
  const hand = {
    x: elbow.x + forearm * Math.sin(phi),
    y: elbow.y - forearm * Math.cos(phi),
  };
  return { shoulder, elbow, hand, joint: shoulderMoves ? shoulder : elbow, upperArmAngle: a, forearmAngle: phi };
}

/**
 * Force the load applies to the body (N) and the point it acts at (`at`).
 * gravity: straight down at the hand. cable: towards the pulley, at the hand.
 * machine: a pad on the moving segment, `load.padDistance` from the joint, pushing
 *   perpendicular to the segment against the movement. The cam profile gives the
 *   effective radius r(angle) in metres, so joint torque = m·g·r. Assumes the machine's
 *   axis is aligned with the joint.
 */
export function loadForce(variant, p, loadKg, pulley, angleDeg) {
  const mag = loadKg * G;
  const { load } = variant;
  if (load.type === "machine") {
    const d = sub(p.hand, p.joint);
    const len = Math.hypot(d.x, d.y);
    const u = { x: d.x / len, y: d.y / len };
    const at = { x: p.joint.x + u.x * load.padDistance, y: p.joint.y + u.y * load.padDistance };
    const F = (mag * interp(load.camProfile.points, angleDeg)) / load.padDistance;
    return { x: F * u.y, y: -F * u.x, mag: F, at };
  }
  if (load.type === "cable") {
    const d = sub(pulley ?? load.pulley, p.hand);
    const len = Math.hypot(d.x, d.y);
    if (len < 1e-6) return { x: 0, y: 0, mag: 0, at: p.hand };
    return { x: (mag * d.x) / len, y: (mag * d.y) / len, mag, at: p.hand };
  }
  return { x: 0, y: -mag, mag, at: p.hand };
}

/**
 * Full analysis at one angle.
 * jointTorque > 0 : load resists flexion / abduction (the prime movers work).
 * shoulderFlexorDemand: for elbow exercises, the torque the shoulder flexors must
 *   supply to keep the upper arm still (0 when a pad supports the arm, and 0 when the
 *   shoulder is itself the moving joint).
 */
export function analyze(exercise, variant, angleDeg, { loadKg, pulley, peakTorqueNm }) {
  const p = pose(exercise, variant, angleDeg);
  const f = loadForce(variant, p, loadKg, pulley, angleDeg);
  const jointTorque = -cross(sub(f.at, p.joint), f);
  const shoulderTorque = cross(sub(f.at, p.shoulder), f);
  const stabilised = variant.upperArmSupported || exercise.movingJoint === "shoulder";
  const shoulderFlexorDemand = stabilised ? 0 : Math.max(0, -shoulderTorque);

  // Perpendicular from the joint onto the line of action = the moment arm.
  let momentArm = 0;
  let momentArmFoot = p.joint;
  if (f.mag > 0) {
    const u = { x: f.x / f.mag, y: f.y / f.mag };
    const ja = sub(p.joint, f.at);
    const t = ja.x * u.x + ja.y * u.y;
    momentArmFoot = { x: f.at.x + u.x * t, y: f.at.y + u.y * t };
    momentArm = jointTorque / f.mag;
  }

  const capacity = interp(exercise.strengthCurve.points, angleDeg) * peakTorqueNm;
  const effort = Math.max(0, jointTorque) / capacity;

  return { pose: p, force: f, jointTorque, shoulderFlexorDemand, momentArm, momentArmFoot, capacity, effort };
}

/** Sample analyze() across the exercise's range of motion. */
export function sampleCurve(exercise, variant, opts, step = 2.5) {
  const [lo, hi] = exercise.angleRange;
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += step) out.push({ angle: a, ...analyze(exercise, variant, a, opts) });
  return out;
}
