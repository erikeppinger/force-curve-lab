// Multi-joint statics for lifts where several joints move at once (squat, RDL, split squat,
// leg press, hip thrust, bench press).
//
// World frame, sagittal plane: x forward (the way the lifter faces), y up, metres; the floor
// is y = 0. Every posture is the standing body turned and bent, never mirrored, so the
// anatomical rotation senses below hold in every lift.
//
// Two steps per position in the lift:
// 1. A solver turns the driver value (e.g. knee angle) into a posture, using the lift's
//    constraint: centre of mass over the mid-foot, a sled rail, a bar path, fixed contacts.
// 2. Statics: each joint's torque is the moment of every force on one side of the joint.
//    The side is chosen so that all its forces are known.
// Torques are per leg (or per arm), positive when the joint's working muscles must resist.
// Pure functions only — imported by the browser UI and by node tests.

import { G, interp } from "./physics.js";
import { legPress3d, squat3d, bench3d, press3d, hinge3d, split3d, hipThrust3d, row3d } from "./multijoint3d.js";

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const cross = (r, f) => r.x * f.y - r.y * f.x;
const len = (v) => Math.hypot(v.x, v.y);
const unit = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
const ccw = (v) => ({ x: -v.y, y: v.x });
/** Unsigned angle between two vectors, degrees. */
const angleBetween = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (len(a) * len(b))))));
/** Point `l` along a segment tilted `a` (radians) forward from straight up. */
const up = (from, a, l) => ({ x: from.x + l * Math.sin(a), y: from.y + l * Math.cos(a) });
const weight = (at, kg) => ({ at, f: { x: 0, y: -kg * G } });

/**
 * Counter-clockwise sense of each concentric (working) action, for the segment on the
 * free side of the joint. "distal" = the free side is further from the trunk (e.g. the
 * leg in a leg press); "proximal" = the free side is the trunk side (e.g. everything
 * above the knee in a squat). The proximal sense is the distal one reversed.
 */
const SENSE = { "hip-extension": -1, "knee-extension": 1, "plantarflexion": -1, "shoulder-flexion": 1, "shoulder-extension": -1, "elbow-flexion": 1 };
const senseOf = (action, side) => SENSE[action] * (side === "proximal" ? -1 : 1);

/**
 * Torque the working muscles supply, from the forces on the free side:
 * τ = −sense · Σ (p − joint) × F. Also returns the resultant's moment arm and the foot of
 * the perpendicular from the joint onto its line of action (for drawing).
 */
export function jointTorque(at, forces, action, side) {
  let M = 0;
  const R = { x: 0, y: 0 };
  for (const { at: p, f } of forces) {
    M += cross(sub(p, at), f);
    R.x += f.x;
    R.y += f.y;
  }
  const torque = -senseOf(action, side) * M;
  const F2 = R.x * R.x + R.y * R.y;
  const foot = F2 > 1e-12 ? { x: at.x + (M / F2) * R.y, y: at.y - (M / F2) * R.x } : at;
  return { torque, momentArm: F2 > 1e-12 ? Math.abs(M) / Math.sqrt(F2) : 0, foot, resultant: R };
}

/** Knee (or elbow) of a two-link chain from a to b; side +1 puts it counter-clockwise of a→b. */
export function ik2(a, b, l1, l2, side) {
  const d = Math.min(len(sub(b, a)), l1 + l2 - 1e-9);
  const e = unit(sub(b, a));
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return add(add(a, e, along), ccw(e), side * h);
}

/** Bisection for f(x) = 0 on [lo, hi]; returns { x, ok } (ok = false if no sign change). */
function solve(f, lo, hi) {
  let flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return { x: Math.abs(flo) < Math.abs(fhi) ? lo : hi, ok: false };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return { x: (lo + hi) / 2, ok: true };
}

const comX = (items) => items.reduce((s, i) => s + i.kg * i.at.x, 0) / items.reduce((s, i) => s + i.kg, 0);

/** Segment weights in kg and the body-part points for a standing-type posture. */
function standingBody(body, bodyKg, A, ts, tt, tk) {
  const L = body.lengths, m = body.mass, c = body.com;
  const K = up(A, ts, L.shank), H = up(K, tt, L.thigh), S = up(H, tk, L.trunk);
  return {
    A, K, H, S,
    shank: { at: lerp(A, K, c.shank), kg: m.shank * bodyKg },
    thigh: { at: lerp(K, H, c.thigh), kg: m.thigh * bodyKg },
    trunk: { at: lerp(H, S, c.headTrunk), kg: m.headTrunk * bodyKg },
    arm: { kg: (m.upperArm + m.forearmHand) * bodyKg }, // one arm; placed by the solver
    foot: { at: { x: A.x + L.midfoot, y: L.ankleHeight / 2 }, kg: m.foot * bodyKg },
  };
}

/** Where the load sits on the trunk: `along` × trunk length from the hip, `out` forward of the trunk line. */
const onTrunk = (H, S, along, out) => {
  const u = unit(sub(S, H));
  return add(add(H, u, along * len(sub(S, H))), { x: u.y, y: -u.x }, out);
};

const BAR_R = 0.015; // bar radius

/** Front edge of the legs at height y (shin below the knee, thigh above), bar radius included. */
function legFront(b, y) {
  const at = (p, q, half) => p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y || 1e-9) + half;
  if (y <= b.A.y) return -Infinity;
  if (y <= b.K.y) return at(b.A, b.K, 0.05 + BAR_R);
  if (y <= b.H.y) return at(b.K, b.H, 0.07 + BAR_R);
  return -Infinity;
}

/**
 * Where hands holding a load sit: straight down from the shoulders, unless `clearShins` and that
 * would put the bar inside the legs. Then the straight arms swing forward (a circle around the
 * shoulder) just far enough for the bar to touch the front of the shins or thighs.
 */
function hang(b, arm, clearShins) {
  let bar = { x: b.S.x, y: b.S.y - arm };
  if (!clearShins) return bar;
  for (let i = 0; i < 30; i++) {
    const fx = legFront(b, bar.y);
    if (bar.x >= fx - 1e-6) break;
    const dx = Math.min(arm, fx - b.S.x);
    bar = { x: b.S.x + dx, y: b.S.y - Math.sqrt(arm * arm - dx * dx) };
  }
  return bar;
}

/**
 * Row (driver: pull, 0 = arms hanging straight, 100 = load at the trunk): the hands move in a
 * straight line from under the shoulders to `touchAlong` × trunk length up from the hip and
 * `touchOut` in front of the trunk line (belly side). The elbow bends away from the belly.
 * Returns the hand, elbow, both arm segments (one arm) and the combined centre of mass of both arms.
 */
function rowArm(b, body, P, x, reachTo) {
  const L = body.lengths, m = body.mass, c = body.com, kg = b.arm.kg / (m.upperArm + m.forearmHand);
  // Start: arms straight, hanging (or reaching towards `reachTo`, e.g. a cable's pulley).
  const toward = reachTo ? unit(sub(reachTo, b.S)) : { x: 0, y: -1 };
  const start = add(b.S, toward, (L.upperArm + L.forearm) * 0.995);
  const end = onTrunk(b.H, b.S, P.touchAlong, P.touchOut);
  const hand = lerp(start, end, x / 100);
  const u = unit(sub(b.S, b.H));
  const belly = { x: u.y, y: -u.x }, down = { x: -u.x, y: -u.y }; // trunk axes: front, and towards the hips
  const dot2 = (p, q) => p.x * q.x + p.y * q.y;
  const E = [1, -1].map((side) => ik2(b.S, hand, L.upperArm, L.forearm, side))
    .sort((p, q) => dot2(sub(p, b.S), belly) - dot2(sub(q, b.S), belly))[0]; // elbow away from the belly
  const upper = { at: lerp(b.S, E, c.upperArm), kg: m.upperArm * kg };
  const fore = { at: lerp(E, hand, c.forearmHand), kg: m.forearmHand * kg };
  const com = { x: (upper.at.x * upper.kg + fore.at.x * fore.kg) / (upper.kg + fore.kg), y: (upper.at.y * upper.kg + fore.at.y * fore.kg) / (upper.kg + fore.kg) };
  // Shoulder flexion: the upper arm's angle from the trunk line (pointing to the hips), + towards the belly.
  const ua = sub(E, b.S);
  const shoulderFlex = deg(Math.atan2(dot2(ua, belly), dot2(ua, down)));
  return { hand, E, upper, fore, com, start, end, shoulderFlex, elbowFlex: angleBetween(sub(E, b.S), sub(hand, E)) };
}

function feet(body, A) {
  const L = body.lengths;
  return [{ a: { x: A.x - L.heel, y: 0.01 }, b: { x: A.x + L.footFront, y: 0.01 }, w: 0.05, cls: "body" }];
}

// ---------- solvers: driver value → posture, forces and joint torques ----------

/**
 * Squat (driver: knee flexion) and hip hinge (driver: hip flexion). Both feet flat, bilateral.
 * Balance: the centre of mass of body + load stays over the mid-foot. The squat solves the
 * trunk lean; the hinge solves the shin angle.
 */
function standing(ex, v, x, { loadKg, bodyMassKg: kg, body }) {
  const P = v.params;
  const L = body.lengths;
  const A = { x: 0, y: L.ankleHeight };
  const target = A.x + L.midfoot;
  const hinge = P.mode === "hinge";
  const row = P.load === "row";
  const pose = (free) => {
    let ts, tt, tk;
    if (hinge) { // x = hip flexion (rows: held at hipFlex); the knees bend a little as you hinge
      const hip = row ? P.hipFlex : x;
      const knee = rad(P.kneeBase + P.kneePerHip * hip);
      ts = free; tt = ts - knee; tk = tt + rad(hip);
    } else { // x = knee flexion; shin angle follows the knee
      ts = rad(P.shinPerKnee * x); tt = ts - rad(x); tk = free;
    }
    const b = standingBody(body, kg, A, ts, tt, tk);
    const arm = row ? rowArm(b, body, P, x) : null;
    const bar = row ? arm.hand
      : P.load === "hang" ? hang(b, L.upperArm + L.forearm, P.clearShins)
      : onTrunk(b.H, b.S, P.barAlong, P.barOut);
    const armCom = row ? arm.com : lerp(b.S, bar, 0.45);
    const items = [b.shank, b.shank, b.thigh, b.thigh, b.trunk, b.foot, b.foot,
      { at: armCom, kg: 2 * b.arm.kg }, { at: bar, kg: loadKg }];
    return { b, bar, arm, armCom, ts, tt, tk, items };
  };
  const sol = hinge
    ? solve((s) => comX(pose(s).items) - target, rad(-30), rad(45))
    : solve((t) => comX(pose(t).items) - target, rad(-20), rad(89));
  const { b, bar, arm, armCom, ts, tt, tk, items } = pose(sol.x);

  // Per leg: half of everything above the hips.
  const aboveHip = [weight(b.trunk.at, b.trunk.kg / 2), weight(armCom, b.arm.kg), weight(bar, loadKg / 2)];
  const aboveKnee = [...aboveHip, weight(b.thigh.at, b.thigh.kg)];
  const aboveAnkle = [...aboveKnee, weight(b.shank.at, b.shank.kg)];
  // Rows: per arm, half the load at the hand.
  const armJoints = row ? {
    shoulder: { at: b.S, angle: arm.shoulderFlex, ...jointTorque(b.S, [weight(arm.upper.at, arm.upper.kg), weight(arm.fore.at, arm.fore.kg), weight(bar, loadKg / 2)], "shoulder-extension", "distal") },
    elbow: { at: arm.E, angle: arm.elbowFlex, ...jointTorque(arm.E, [weight(arm.fore.at, arm.fore.kg), weight(bar, loadKg / 2)], "elbow-flexion", "distal") },
  } : {};
  return {
    joints: {
      hip: { at: b.H, angle: deg(tk - tt), ...jointTorque(b.H, aboveHip, "hip-extension", "proximal") },
      knee: { at: b.K, angle: deg(ts - tt), ...jointTorque(b.K, aboveKnee, "knee-extension", "proximal") },
      ankle: { at: b.A, angle: -deg(ts), ...jointTorque(b.A, aboveAnkle, "plantarflexion", "proximal") },
      ...armJoints,
    },
    segs: { shank: [b.A, b.K], thigh: [b.K, b.H], trunk: [b.H, b.S], arm: [b.S, bar], ...(row ? { upperArm: [b.S, arm.E], forearm: [arm.E, bar] } : {}) },
    draw: [...feet(body, A),
      { a: b.A, b: b.K, w: 0.1, cls: "body" }, { a: b.K, b: b.H, w: 0.14, cls: "body" }, { a: b.H, b: b.S, w: 0.2, cls: "body" },
      { circle: up(b.S, tk, 0.22), r: 0.11, cls: "body" }],
    arms: [{ from: b.S, to: bar, ...(row ? { elbow: arm.E } : {}) }],
    loads: [{ at: bar, kind: v.loadShape ?? "bar" }],
    props: row ? [{ a: arm.start, b: arm.end, cls: "line-of-action", w: 0.006 }] : [],
    balance: { x: target, com: comX(items), ok: sol.ok },
    parts: { trunk: b.trunk, arms: { at: armCom, kg: 2 * b.arm.kg }, load: { at: bar, kg: loadKg }, thigh: b.thigh, shank: b.shank, foot: b.foot },
    info: sol.ok ? [] : [{ warn: true, text: "Can't balance: no trunk or shin angle keeps the centre of mass over the mid-foot here." }],
  };
}

/**
 * Split squat / lunge (driver: front-knee flexion). Front foot flat, rear foot on a bench or
 * the floor. The floor and bench push straight up; how the weight splits between the two
 * contacts follows from where the centre of mass is. Torques are for the front leg.
 */
function split(ex, v, x, { loadKg, bodyMassKg: kg, body }) {
  const P = v.params;
  const L = body.lengths, m = body.mass, c = body.com;
  const A = { x: 0, y: L.ankleHeight };
  const ts = rad(P.shinPerKnee * x), tt = ts - rad(x), tk = rad(P.trunkLean);
  const b = standingBody(body, kg, A, ts, tt, tk);
  const R = P.rearFoot;
  const rearKnee = ik2(b.H, R, L.thigh, L.shank, 1); // rear knee bends towards the floor
  const reach = len(sub(R, b.H)) <= L.thigh + L.shank;
  const bar = P.load === "hang" ? { x: b.S.x, y: b.S.y - (L.upperArm + L.forearm) } : onTrunk(b.H, b.S, P.barAlong, P.barOut);
  const armCom = lerp(b.S, bar, 0.45);
  const rearThigh = { at: lerp(b.H, rearKnee, 1 - c.thigh), kg: m.thigh * kg };
  const rearShank = { at: lerp(rearKnee, R, 1 - c.shank), kg: m.shank * kg };
  const items = [b.shank, b.thigh, b.trunk, b.foot, rearThigh, rearShank, { at: R, kg: m.foot * kg },
    { at: armCom, kg: 2 * b.arm.kg }, { at: bar, kg: loadKg }];
  const W = items.reduce((s, i) => s + i.kg, 0) * G;
  const cop = { x: A.x + L.midfoot, y: 0 };
  const front = (W * (comX(items) - R.x)) / (cop.x - R.x);
  const ok = front >= 0 && front <= W && reach;
  const grf = { at: cop, f: { x: 0, y: front } };
  const below = (extra) => [grf, weight(b.foot.at, b.foot.kg), ...extra];
  return {
    joints: {
      hip: { at: b.H, angle: deg(tk - tt), ...jointTorque(b.H, below([weight(b.shank.at, b.shank.kg), weight(b.thigh.at, b.thigh.kg)]), "hip-extension", "distal") },
      knee: { at: b.K, angle: deg(ts - tt), ...jointTorque(b.K, below([weight(b.shank.at, b.shank.kg)]), "knee-extension", "distal") },
      ankle: { at: b.A, angle: -deg(ts), ...jointTorque(b.A, below([]), "plantarflexion", "distal") },
    },
    segs: { shank: [b.A, b.K], thigh: [b.K, b.H], trunk: [b.H, b.S], arm: [b.S, bar] },
    draw: [
      { a: b.H, b: rearKnee, w: 0.13, cls: "body back" }, { a: rearKnee, b: R, w: 0.1, cls: "body back" },
      ...feet(body, A),
      { a: b.A, b: b.K, w: 0.1, cls: "body" }, { a: b.K, b: b.H, w: 0.14, cls: "body" }, { a: b.H, b: b.S, w: 0.2, cls: "body" },
      { circle: up(b.S, tk, 0.22), r: 0.11, cls: "body" }],
    arms: [{ from: b.S, to: bar }],
    loads: [{ at: bar, kind: v.loadShape ?? "dumbbell" }],
    props: R.y > 0.2 ? [{ a: { x: R.x - 0.25, y: R.y - 0.04 }, b: { x: R.x + 0.08, y: R.y - 0.04 }, w: 0.08, cls: "equipment" },
      { a: { x: R.x - 0.1, y: R.y - 0.08 }, b: { x: R.x - 0.1, y: 0 }, w: 0.04, cls: "equipment" }] : [],
    balance: { x: cop.x, com: comX(items), ok },
    shares: { front: front / W },
    parts: { thigh: b.thigh, shank: b.shank, foot: b.foot },
    grf: { at: cop, front },
    info: [{ text: `Front leg carries ${Math.round((100 * front) / W)}% of the weight, the rear foot the rest.` },
      ...(ok ? [] : [{ warn: true, text: reach ? "Centre of mass is outside the two contacts: this position can't be held." : "The rear foot is out of reach at this depth." }])],
  };
}

/**
 * Hip thrust / glute bridge (driver: hip flexion). Upper back on the bench (or floor), feet
 * flat, bar on the hips. Both contacts push straight up (no friction) and the foot's push is
 * taken at the mid-foot, which makes the reactions solvable from moment balance.
 */
function hipThrust(ex, v, x, { loadKg, bodyMassKg: kg, body }) {
  const P = v.params;
  const L = body.lengths, m = body.mass, c = body.com;
  const S = P.shoulder, A = { x: P.feetAt, y: L.ankleHeight };
  const pose = (beta) => {
    const e = { x: Math.cos(beta), y: -Math.sin(beta) }; // shoulder → hip
    const H = add(S, e, L.trunk);
    const K = ik2(H, A, L.thigh, L.shank, 1);
    const d = unit(sub(K, H));
    return { e, H, K, flex: deg(Math.atan2(cross(e, d), e.x * d.x + e.y * d.y)) };
  };
  const sol = solve((b) => pose(b).flex - x, rad(-60), rad(70));
  const { e, H, K } = pose(sol.x);
  const reach = len(sub(A, H)) <= L.thigh + L.shank;
  const n = { x: -e.y, y: e.x }; // front of the pelvis (up)
  const bar = add(H, n, 0.12);
  const armCom = lerp(S, bar, 0.5);
  const trunk = { at: lerp(H, S, c.headTrunk), kg: m.headTrunk * kg };
  const items = [trunk, { at: lerp(K, H, c.thigh), kg: 2 * m.thigh * kg }, { at: lerp(A, K, c.shank), kg: 2 * m.shank * kg },
    { at: { x: A.x + L.midfoot, y: 0.04 }, kg: 2 * m.foot * kg }, { at: armCom, kg: 2 * (m.upperArm + m.forearmHand) * kg },
    { at: bar, kg: loadKg }];
  const W = items.reduce((s, i) => s + i.kg, 0) * G;
  const cop = { x: A.x + L.midfoot, y: 0 };
  const shoulderR = (W * (comX(items) - cop.x)) / (S.x - cop.x);
  const feetR = W - shoulderR;
  const aboveFloor = H.y - 0.1 >= 0; // the pelvis is ~10 cm deep below the hip joint
  const ok = shoulderR >= 0 && feetR >= 0 && sol.ok && reach && aboveFloor;
  // Per leg: half of everything on the trunk side, including half the bench's push.
  const trunkSide = [{ at: S, f: { x: 0, y: shoulderR / 2 } }, weight(trunk.at, trunk.kg / 2),
    weight(armCom, m.upperArm * kg + m.forearmHand * kg), weight(bar, loadKg / 2)];
  const grf = { at: cop, f: { x: 0, y: feetR / 2 } };
  const footW = weight({ x: A.x + L.midfoot, y: 0.04 }, m.foot * kg);
  const shankW = weight(lerp(A, K, c.shank), m.shank * kg);
  const thighW = weight(lerp(K, H, c.thigh), m.thigh * kg);
  return {
    joints: {
      hip: { at: H, angle: x, ...jointTorque(H, trunkSide, "hip-extension", "proximal") },
      knee: { at: K, angle: angleBetween(sub(K, H), sub(A, K)), ...jointTorque(K, [grf, footW, shankW], "knee-extension", "distal") },
      ankle: { at: A, angle: deg(Math.atan2(A.x - K.x, K.y - A.y)), ...jointTorque(A, [grf, footW], "plantarflexion", "distal") },
    },
    // For tests: the hip torque worked out from the leg side instead must agree.
    check: { hipFromLegs: jointTorque(H, [grf, footW, shankW, thighW], "hip-extension", "distal").torque },
    segs: { shank: [A, K], thigh: [K, H], trunk: [H, S] },
    draw: [...feet(body, A),
      { a: A, b: K, w: 0.1, cls: "body" }, { a: K, b: H, w: 0.14, cls: "body" }, { a: H, b: S, w: 0.2, cls: "body" },
      { circle: add(S, e, -0.22), r: 0.11, cls: "body" }],
    arms: [{ from: S, to: bar }],
    loads: [{ at: bar, kind: v.loadShape ?? "bar" }],
    props: S.y > 0.2 ? [{ a: { x: S.x - 0.45, y: S.y - 0.1 }, b: { x: S.x + 0.02, y: S.y - 0.1 }, w: 0.08, cls: "equipment" },
      { a: { x: S.x - 0.2, y: S.y - 0.14 }, b: { x: S.x - 0.2, y: 0 }, w: 0.04, cls: "equipment" }] : [],
    balance: null,
    reactions: { shoulder: shoulderR, feet: feetR, weight: W },
    info: [{ text: `The ${S.y > 0.2 ? "bench" : "floor"} carries ${Math.round((100 * shoulderR) / W)}% of the weight at the shoulders, the feet the rest.` },
      ...(ok ? [] : [{ warn: true, text: aboveFloor ? "This hip angle can't be reached with this foot position." : "The hips would have to go below the floor: this hip angle is out of range here." }])],
  };
}

/**
 * Seated cable row and chest-supported row (driver: pull, 0 = arms straight, 100 = hands at the
 * trunk). The trunk is held at `trunkLean` (degrees from vertical, + = forward). Load either on a
 * cable to `pulley` (stack weight, the cable pulls the hands towards the pulley) or hanging
 * (`load: "hang"`, dumbbells). Seated: the hips are fixed on a seat and the hip extensors hold the
 * trunk against the cable. `chestPad`: a pad under the chest carries the trunk, so the hip
 * torque isn't needed (shown as zero). Torques per arm; hip per side.
 */
function seatedRow(ex, v, x, { loadKg, bodyMassKg: kg, body }) {
  const P = v.params;
  const L = body.lengths, m = body.mass, c = body.com;
  const H = { x: 0, y: P.hipHeight };
  const lean = rad(P.trunkLean);
  const S = up(H, lean, L.trunk);
  const b = { H, S, arm: { kg: (m.upperArm + m.forearmHand) * kg } };
  const cable = P.load === "cable";
  const arm = rowArm(b, body, P, x, cable ? P.pulley : null);
  const hand = arm.hand;
  const pull = cable ? unit(sub(P.pulley, hand)) : { x: 0, y: -1 };
  const F = (loadKg * G) / 2; // per hand
  const onHand = { at: hand, f: { x: pull.x * F, y: pull.y * F } };
  const upperW = weight(arm.upper.at, arm.upper.kg), foreW = weight(arm.fore.at, arm.fore.kg);
  const trunk = { at: lerp(H, S, c.headTrunk), kg: m.headTrunk * kg };
  // Per side: half the trunk, one arm, one hand's load.
  const aboveHip = [weight(trunk.at, trunk.kg / 2), upperW, foreW, onHand];
  const hip = P.chestPad
    ? { torque: 0, momentArm: 0, foot: H, resultant: { x: 0, y: 0 } }
    : jointTorque(H, aboveHip, "hip-extension", "proximal");
  const K = add(H, { x: Math.cos(rad(-8)), y: Math.sin(rad(-8)) }, L.thigh);
  const seated = !P.chestPad;
  const knee = seated ? K : { x: H.x + 0.02, y: H.y - L.thigh };
  const A = seated ? add(K, unit({ x: 0.55, y: -0.83 }), L.shank) : { x: H.x + 0.06, y: L.ankleHeight };
  const n = { x: Math.cos(lean), y: -Math.sin(lean) }; // the trunk's front (belly side)
  const props = [];
  if (cable) {
    props.push({ a: hand, b: P.pulley, w: 0.008, cls: "cable" });
    props.push({ a: { x: A.x + 0.08, y: 0 }, b: { x: A.x + 0.08, y: 0.4 }, w: 0.04, cls: "equipment" }); // foot plate
    props.push({ a: { x: -0.25, y: H.y - 0.07 }, b: { x: 0.25, y: H.y - 0.07 }, w: 0.06, cls: "equipment" }, { a: { x: 0, y: H.y - 0.07 }, b: { x: 0, y: 0 }, w: 0.04, cls: "equipment" });
  }
  if (P.chestPad) {
    const padC = add(lerp(H, S, 0.55), n, 0.16);
    const u = unit(sub(S, H));
    props.push({ a: add(padC, u, -0.3), b: add(padC, u, 0.25), w: 0.06, cls: "equipment" }, { a: add(padC, u, -0.25), b: { x: add(padC, u, -0.25).x, y: 0 }, w: 0.04, cls: "equipment" });
  }
  props.push({ a: arm.start, b: arm.end, cls: "line-of-action", w: 0.006 });
  return {
    joints: {
      shoulder: { at: S, angle: arm.shoulderFlex, ...jointTorque(S, [upperW, foreW, onHand], "shoulder-extension", "distal") },
      elbow: { at: arm.E, angle: arm.elbowFlex, ...jointTorque(arm.E, [foreW, onHand], "elbow-flexion", "distal") },
      hip: { at: H, angle: 180 - angleBetween(sub(S, H), sub(knee, H)), ...hip },
    },
    segs: { trunk: [H, S], upperArm: [S, arm.E], forearm: [arm.E, hand], thigh: [knee, H] },
    draw: [...feet(body, A), { a: A, b: knee, w: 0.1, cls: "body" }, { a: knee, b: H, w: 0.14, cls: "body" }, { a: H, b: S, w: 0.2, cls: "body" },
      { circle: up(S, lean, 0.22), r: 0.11, cls: "body" }],
    arms: [{ from: S, to: hand, elbow: arm.E }],
    loads: [{ at: hand, kind: cable ? "handle" : v.loadShape ?? "dumbbell" }],
    props: cable ? [...props, { a: { x: P.pulley.x, y: 0 }, b: { x: P.pulley.x, y: P.pulley.y + 0.05 }, w: 0.06, cls: "equipment" }] : props,
    balance: null,
    parts: { trunk, onHand, upperW, foreW },
    info: [...(cable ? [{ text: `The cable pulls ${Math.round(Math.abs(deg(Math.atan2(pull.y, pull.x))))}° ${pull.y < 0 ? "below" : "above"} horizontal here.` }] : []),
      ...(P.chestPad ? [{ text: "The pad carries the trunk, so the hips and lower back don't have to hold it (hip torque shown as zero)." }] : [])],
  };
}

const SOLVERS = { standing, split, hipThrust, seatedRow, legPress3d, squat3d, bench3d, press3d, hinge3d, split3d, hipThrust3d, row3d };

/** Full analysis at one driver value: posture, forces and per-joint torque, capacity and effort. */
export function analyzeMulti(exercise, variant, x, opts) {
  const r = SOLVERS[exercise.solver](exercise, variant, x, opts);
  const scale = (opts.strengthPct ?? 100) / 100;
  // Two-sided components (e.g. hip adductors / abductors) use the `negative` group's strength
  // when the torque is negative; `passive` ones (knee valgus) have no muscle capacity.
  r.joints = exercise.joints.map((j) => {
    const s = r.joints[j.id];
    if (j.passive) return { ...j, ...s, capacity: null, effort: null };
    const neg = s.torque < 0 && j.negative;
    const capacity = interp(j.strength.points, s.angle) * (neg ? j.negative.peakTorqueNm : j.peakTorqueNm) * scale;
    return { ...j, ...s, capacity, effort: (neg ? -s.torque : Math.max(0, s.torque)) / capacity };
  });
  return r;
}

/** Sample analyzeMulti() across the driver's range. */
export function sampleMulti(exercise, variant, opts, step = 2.5) {
  const [lo, hi] = exercise.angleRange;
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += step) out.push({ angle: a, ...analyzeMulti(exercise, variant, a, opts) });
  return out;
}
