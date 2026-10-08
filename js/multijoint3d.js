// 3D statics for lifts where feet or hands leave the side-view plane: stance width, toes in
// or out, knees tracking in or out, grip width, elbow flare.
//
// World frame: x forward (the way a standing lifter faces), y up, z to the lifter's right;
// metres. Lying and seated lifters are the standing body turned, never mirrored, so z is
// always their right. The right limb is analysed; the left is its mirror image. Each joint's
// moment is split into anatomical components (joint axes in the style of Grood & Suntay,
// projected with dot products):
//   hip:      extension, adduction (+) / abduction (−), external (+) / internal (−) rotation
//   knee:     extension, valgus (+) / varus (−) — carried mostly by ligaments
//   ankle:    plantarflexion
//   shoulder: horizontal adduction, flexion, external (+) / internal (−) rotation
//   elbow:    extension, sideways (+ hand pushed in / − out) — carried mostly by ligaments
// Values are per limb and positive when that muscle group (or structure) must resist.
// Pure functions only — imported by the browser UI and by node tests.

import { G, interp } from "./physics.js";

export const v3 = (x, y, z) => ({ x, y, z });
export const add3 = (a, b, k = 1) => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
export const sub3 = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len3 = (a) => Math.sqrt(dot3(a, a));
export const unit3 = (a) => { const l = len3(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
export const mirror = (p) => v3(p.x, p.y, -p.z);
const neg3 = (a) => v3(-a.x, -a.y, -a.z);
const lerp3 = (a, b, t) => add3(a, sub3(b, a), t);
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const angleBetween3 = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, dot3(unit3(a), unit3(b))))));
const Z = v3(0, 0, 1); // the right side
const UP = v3(0, 1, 0);
const weight = (at, kg) => ({ at, f: v3(0, -kg * G, 0) });

/** Σ (p − about) × F over point forces: the external moment vector about a point. */
export function moment3(about, forces) {
  return forces.reduce((M, { at, f }) => add3(M, cross3(sub3(at, about), f)), v3(0, 0, 0));
}

/**
 * Middle joint (knee or elbow) of a two-link chain from `base` to `end`: in the plane of the
 * base–end line and `ref` (e.g. the foot, so the knee tracks over the toes), then turned about
 * that line by `turnDeg` towards the outside (+z).
 */
export function placeMid(base, end, l1, l2, ref, turnDeg = 0) {
  const e = unit3(sub3(end, base));
  let p = unit3(sub3(ref, add3(v3(0, 0, 0), e, dot3(ref, e))));
  let q = unit3(cross3(e, p));
  if (q.z < 0) q = neg3(q);
  const k = rad(turnDeg);
  p = unit3(add3(add3(v3(0, 0, 0), p, Math.cos(k)), q, Math.sin(k)));
  const d = Math.min(len3(sub3(end, base)), l1 + l2 - 1e-9);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  return add3(add3(base, e, along), p, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
}

/** Distance from a joint to a force's line of action, and the foot of the perpendicular. */
const toLine = (j, at, dir) => {
  const foot = add3(at, dir, dot3(sub3(j, at), dir));
  return { foot, momentArm: len3(sub3(j, foot)) };
};

/**
 * A posture correction for one joint's strength (e.g. elbow flexion with the arm overhead and
 * the palms down, or plantarflexion with the knee bent): `factor`, `points` by the joint's angle
 * (or by the angle of the joint named in `by`), or `grid` by the shoulder's angle
 * (s.shoulderAngle) × the joint's angle, bilinear, held flat outside the grid.
 */
export function jointScaleAt(spec, s, joints = {}) {
  if (!spec) return 1;
  // Two-joint muscles: `by` names the other joint whose angle sets the factor; `direction`
  // limits it to one torque sign (e.g. only the knee flexors, which are the hamstrings).
  if (spec.direction === "negative" && !(s.torque < 0)) return 1;
  if (spec.direction === "positive" && !(s.torque >= 0)) return 1;
  if (spec.factor != null) return spec.factor;
  if (spec.points) return interp(spec.points, spec.by ? joints[spec.by].angle : s.angle);
  const { shoulder: sa, elbow: ea, values } = spec.grid;
  const at = (axis, v) => {
    const t = Math.min(Math.max(v, axis[0]), axis.at(-1));
    let i = 0;
    while (i < axis.length - 2 && t > axis[i + 1]) i++;
    return [i, (t - axis[i]) / (axis[i + 1] - axis[i])];
  };
  const [i, u] = at(sa, s.shoulderAngle), [k, w] = at(ea, s.angle);
  const v = (a, b) => values[a][b];
  return (1 - u) * ((1 - w) * v(i, k) + w * v(i, k + 1)) + u * ((1 - w) * v(i + 1, k) + w * v(i + 1, k + 1));
}

/**
 * Static optimisation for one force statics can't decide (e.g. how hard the feet push sideways):
 * the value in [lo, hi] (a friction limit) that minimises the sum of squared efforts of the
 * exercise's muscle groups. `jointsAt(value)` returns the solver's joint components.
 */
/** Sum of squared efforts over an exercise's (active) joints, for joints as solvers return them. */
export function effortCost(exercise, js, variant = {}) {
  return exercise.joints.filter((j) => !j.passive).reduce((sum, j) => {
    const t = js[j.id].torque;
    const neg = t < 0 && j.negative;
    const curve = neg && j.negative.points ? j.negative.points : j.strength.points;
    const cap = interp(curve, js[j.id].angle) * (neg ? j.negative.peakTorqueNm : j.peakTorqueNm) * jointScaleAt(exercise.jointScale?.[j.id], js[j.id], js) * jointScaleAt(variant.jointScale?.[j.id], js[j.id], js);
    return sum + (t < 0 && !j.negative ? 0 : (t / cap) ** 2);
  }, 0);
}

export function leastEffort(exercise, jointsAt, lo = -0.6, hi = 0.6, variant = {}) {
  const cost = (value) => effortCost(exercise, jointsAt(value), variant);
  // Coarse scan first (the cost can have more than one dip, e.g. when the elbow follows the push),
  // then a ternary search around the best grid point.
  const N = 24, step = (hi - lo) / N;
  let best = 0, bestCost = cost(lo);
  for (let i = 1; i <= N; i++) { const ci = cost(lo + i * step); if (ci < bestCost) { best = i; bestCost = ci; } }
  // Golden-section search: one new cost evaluation per step.
  let a = Math.max(lo, lo + (best - 1) * step), b = Math.min(hi, lo + (best + 1) * step);
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a), d = a + r * (b - a), fc = cost(c), fd = cost(d);
  for (let i = 0; i < 30; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = cost(c); }
    else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = cost(d); }
  }
  return (a + b) / 2;
}

/**
 * Leg components from the external moments on the distal side of each joint.
 * `back` is the trunk's direction (hip → shoulder), `line` the main force's line for moment arms.
 */
function legComponents({ H, K, A, f, back, Mhip, Mknee, Mankle, knee, line }) {
  const dT = unit3(sub3(K, H)), dS = unit3(sub3(A, K));
  const eFlex = unit3(cross3(dT, dS)); // knee flexion axis
  const eAbd = unit3(cross3(dT, Z)); // turning about it moves the knee outwards
  const eValgus = unit3(cross3(eFlex, dS)); // turning about it moves the ankle outwards
  const eDorsi = unit3(cross3(f, neg3(dS))); // toes towards the shin
  const hipFlex = 180 - angleBetween3(back, dT);
  return {
    joints: {
      hip: { at: H, angle: hipFlex, torque: dot3(Mhip, Z), ...toLine(H, line.at, line.dir) },
      knee: { at: K, angle: knee, torque: dot3(Mknee, eFlex), ...toLine(K, line.at, line.dir) },
      ankle: { at: A, angle: 90 - angleBetween3(dS, f), torque: dot3(Mankle, eDorsi), ...toLine(A, line.at, line.dir) },
      "hip-frontal": { at: H, angle: hipFlex, torque: dot3(Mhip, eAbd) },
      "hip-rotation": { at: H, angle: hipFlex, torque: -dot3(Mhip, dT) },
      "knee-frontal": { at: K, angle: knee, torque: dot3(Mknee, eValgus) },
    },
    frames: {
      thigh: { from: H, to: K, anterior: unit3(cross3(dT, eFlex)), lateral: unit3(cross3(dT, cross3(Z, dT))) },
      shank: { from: K, to: A, anterior: unit3(cross3(dS, eFlex)), lateral: unit3(cross3(dS, cross3(Z, dS))) },
    },
  };
}

// ---------- drawing helpers (primitives for js/view3d.js) ----------
const L3 = (a, b, w, cls) => ({ kind: "line", a, b, w, cls });
const dot = (c, r, cls) => ({ kind: "dot", c, r, cls });
const both = (p) => [p, mirror(p)];

/** Both legs, feet included, from the right leg's points. */
function legPrims(H, K, A, heel, toes) {
  return [false, true].flatMap((left) => {
    const t = left ? mirror : (p) => p;
    const cls = left ? "body back" : "body";
    return [L3(t(H), t(K), 0.14, cls), L3(t(K), t(A), 0.1, cls), L3(t(heel), t(toes), 0.06, cls), dot(t(toes), 0.022, `toe${left ? " back" : ""}`)];
  });
}

// ---------- solvers ----------

/**
 * Leg press (driver: knee flexion). Hips fixed in the seat, both feet on the plate, which moves
 * along its rail and pushes along the rail (no sideways grip between plate and feet).
 * Placement: footHeight (m up the plate from the hips' line), halfWidth (each foot from the
 * midline, m), toeOut (degrees, + = out), kneeTrack (degrees, + = knees out of the toe line).
 */
export function legPress3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const P = { ...v.params, ...placement };
  const L = body.lengths, m = body.mass, c = body.com;
  const a = rad(P.railAngle);
  const u = v3(Math.cos(a), Math.sin(a), 0); // rail: away from the seat
  const vp = v3(-Math.sin(a), Math.cos(a), 0); // up the plate
  const mid = v3(0, 0.45, 0);
  const H = add3(mid, Z, L.hipHalfWidth);

  // Ankle: slide along the rail until hip→ankle matches the knee angle (law of cosines).
  const D = Math.sqrt(L.thigh ** 2 + L.shank ** 2 + 2 * L.thigh * L.shank * Math.cos(rad(x)));
  const dz = P.halfWidth - L.hipHalfWidth;
  const s2 = D * D - P.footHeight ** 2 - dz * dz;
  const A = add3(add3(add3(mid, vp, P.footHeight), Z, P.halfWidth), u, Math.sqrt(Math.max(0, s2)));
  const f = unit3(add3(add3(v3(0, 0, 0), vp, Math.cos(rad(P.toeOut))), Z, Math.sin(rad(P.toeOut)))); // heel → toes
  const K = placeMid(H, A, L.thigh, L.shank, f, P.kneeTrack);

  const plate = add3(A, u, L.ankleHeight);
  const cop = add3(plate, f, L.midfoot);
  const Fmag = (loadKg * G * Math.sin(a)) / 2;
  const push = { at: cop, f: add3(v3(0, 0, 0), u, -Fmag) };
  const footW = weight(add3(A, f, L.midfoot), m.foot * kg);
  const shankW = weight(lerp3(A, K, c.shank), m.shank * kg);
  const thighW = weight(lerp3(K, H, c.thigh), m.thigh * kg);
  const back = v3(-Math.sin(rad(P.backRecline)), Math.cos(rad(P.backRecline)), 0);
  const Mhip = moment3(H, [push, footW, shankW, thighW]);
  const Mknee = moment3(K, [push, footW, shankW]);
  const Mankle = moment3(A, [push, footW]);
  const { joints, frames } = legComponents({ H, K, A, f, back, Mhip, Mknee, Mankle, knee: x, line: { at: cop, dir: u } });

  const S = add3(mid, back, L.trunk);
  const seatOut = v3(-back.y, back.x, 0);
  const plateCentre = add3(add3(mid, vp, 0.05), u, dot3(sub3(plate, mid), u) + 0.015);
  const rail = [add3(add3(mid, vp, -0.3), u, 0.25), add3(add3(mid, vp, -0.3), u, 1.25)];
  const seat = [add3(add3(mid, seatOut, 0.12), back, -0.05), add3(add3(mid, seatOut, 0.12), back, 0.8)];
  return {
    joints, frames,
    moments: { hip: Mhip, knee: Mknee, ankle: Mankle },
    scene: [
      { kind: "poly", pts: [[-0.32, -0.45], [0.38, -0.45], [0.38, 0.45], [-0.32, 0.45]].map(([up, side]) => add3(add3(plateCentre, vp, up), Z, side)), cls: "plate3d" },
      ...[-0.5, 0.5].map((z) => L3(add3(rail[0], Z, z), add3(rail[1], Z, z), 0.02, "equipment")),
      ...[-0.25, 0.25].map((z) => L3(add3(seat[0], Z, z), add3(seat[1], Z, z), 0.05, "equipment")),
      L3(mid, S, 0.3, "body"), dot(add3(S, back, 0.22), 0.11, "body"), L3(mirror(H), H, 0.16, "body"),
      ...legPrims(H, K, A, add3(plate, f, -L.heel), add3(plate, f, L.footFront)),
    ],
    forces: both(cop).map((at) => ({ at, dir: neg3(u) })),
    info: s2 >= 0 ? [] : [{ warn: true, text: "The feet can't reach the plate at this knee angle with this placement." }],
  };
}

/**
 * Squat (driver: knee flexion). Feet flat at the stance width and toe angle; the knee tracks
 * over the toes (turned by kneeTrack); the shin tilts forward by shinPerKnee × knee angle, as in
 * the side-view squat; the trunk leans until the centre of mass of body + load is over the
 * mid-foot. Each foot carries half the weight. How hard the feet push sideways against the
 * floor is not fixed by statics (the two feet can push apart or together through the body).
 * sidePush = the floor's inward push as a fraction of the vertical one; "auto" picks the value
 * (within friction, |ratio| ≤ 0.6) that minimises the sum of squared efforts of the leg's muscle
 * groups — static optimisation. Joint torques follow from the foot side.
 */
export function squat3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const P = { ...v.params, ...placement };
  const L = body.lengths, m = body.mass, c = body.com;
  const toe = rad(P.toeOut);
  const f = v3(Math.cos(toe), 0, Math.sin(toe)); // heel → toes, on the floor
  const A = v3(0, L.ankleHeight, P.halfWidth);
  const D = Math.sqrt(L.thigh ** 2 + L.shank ** 2 + 2 * L.thigh * L.shank * Math.cos(rad(x)));
  const dz = L.hipHalfWidth - P.halfWidth;
  const R = Math.sqrt(Math.max(1e-9, D * D - dz * dz));
  // Hips at ±hipHalfWidth; find how far back they sit so the shin tilt matches the rule.
  const legAt = (psi) => {
    const H = v3(A.x + R * Math.sin(psi), A.y + R * Math.cos(psi), L.hipHalfWidth);
    const K = placeMid(H, A, L.thigh, L.shank, f, P.kneeTrack);
    const s = sub3(K, A);
    return { H, K, tilt: Math.atan2(s.x, Math.hypot(s.y, s.z)) }; // forward lean of the shin (side view), whatever the stance width
  };
  const target = rad(P.shinPerKnee * x);
  let lo = rad(-85), hi = rad(45);
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (legAt(mid).tilt < target) lo = mid; else hi = mid; }
  const { H, K } = legAt((lo + hi) / 2);

  // Trunk lean for balance: centre of mass over the mid-foot.
  const pelvis = v3(H.x, H.y, 0);
  const balanceX = A.x + f.x * L.midfoot;
  const legsKg = 2 * (m.thigh + m.shank + m.foot) * kg;
  const legsX = (2 * kg * (m.thigh * lerp3(K, H, c.thigh).x + m.shank * lerp3(A, K, c.shank).x + m.foot * balanceX)) / legsKg;
  const armsKg = 2 * (m.upperArm + m.forearmHand) * kg;
  const upper = (tk) => {
    const back = v3(Math.sin(tk), Math.cos(tk), 0);
    const S = add3(pelvis, back, L.trunk);
    const n = v3(back.y, -back.x, 0); // forward of the trunk line
    const bar = add3(add3(pelvis, back, P.barAlong * L.trunk), n, P.barOut);
    const trunkCom = add3(pelvis, back, c.headTrunk * L.trunk);
    const armCom = lerp3(S, bar, 0.45);
    const total = legsKg + m.headTrunk * kg + armsKg + loadKg;
    const comX = (legsKg * legsX + m.headTrunk * kg * trunkCom.x + armsKg * armCom.x + loadKg * bar.x) / total;
    return { back, S, bar, trunkCom, armCom, comX, total };
  };
  let tlo = rad(-20), thi = rad(89);
  const ok = (upper(tlo).comX - balanceX) * (upper(thi).comX - balanceX) <= 0;
  for (let i = 0; i < 60; i++) { const mid = (tlo + thi) / 2; if (upper(mid).comX < balanceX) tlo = mid; else thi = mid; }
  const U = upper((tlo + thi) / 2);

  // Per leg, from the foot up: floor push W/2 at the mid-foot, then segment weights.
  const cop = add3(v3(A.x, 0, A.z), f, L.midfoot);
  const leg = legFromFloor(ex, P, { H, K, A, f, cop, Fy: (U.total * G) / 2, back: U.back, kneeAngle: x, kg, body, variant: v });
  const { grf, dir, Mhip, Mknee, Mankle, joints, frames, ratio } = leg;

  const shoulder = add3(U.S, Z, 0.19);
  const hand = add3(U.bar, Z, 0.3);
  const loadPrims = v.loadShape === "dumbbell"
    ? [dot(U.bar, 0.07, "weight")]
    : [L3(add3(U.bar, Z, -0.7), add3(U.bar, Z, 0.7), 0.03, "equipment"), ...both(add3(U.bar, Z, 0.62)).map((p) => dot(p, 0.13, "weight"))];
  return {
    joints, frames,
    moments: { hip: Mhip, knee: Mknee, ankle: Mankle },
    balance: { x: balanceX, com: U.comX, ok },
    scene: [
      { kind: "poly", pts: [[-0.5, -0.6], [0.7, -0.6], [0.7, 0.6], [-0.5, 0.6]].map(([px, pz]) => v3(px, 0, pz)), cls: "floor3d" },
      L3(pelvis, U.S, 0.3, "body"), dot(add3(U.S, U.back, 0.22), 0.11, "body"), L3(mirror(H), H, 0.16, "body"),
      L3(mirror(shoulder), shoulder, 0.1, "body"),
      ...[false, true].map((left) => (left ? L3(mirror(shoulder), mirror(hand), 0.07, "body arm back") : L3(shoulder, hand, 0.07, "body arm"))),
      ...legPrims(H, K, A, add3(v3(A.x, 0.01, A.z), f, -L.heel), add3(v3(A.x, 0.01, A.z), f, L.footFront)),
      ...loadPrims,
    ],
    forces: [{ at: cop, dir }, { at: mirror(cop), dir: mirror(dir) }],
    grf: grf.f,
    sidePush: ratio,
    info: ok ? [sidePushInfo(leg)] : [{ warn: true, text: "Can't balance: no trunk angle keeps the centre of mass over the mid-foot here." }],
  };
}

/**
 * Elbow on the circle of positions that fit both arm segments, chosen so that in the front view
 * it sits `offsetZ` outside (+) or inside (−) the hand ("elbows stacked under the bar" = 0). Of
 * the two such points it takes the one with the smaller component along `front` (the bench
 * passes "up": elbows below the bar), or with `front` = "under" the one that puts the forearm
 * closest to vertical under the hand (press); the pulls pass "backwards" for elbows in front. Returns the closest point if the offset can't be reached.
 */
export function elbowUnderHand(S, hand, l1, l2, offsetZ, front) {
  const e = unit3(sub3(hand, S));
  const d = Math.min(len3(sub3(hand, S)), l1 + l2 - 1e-9);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const p0 = unit3(cross3(e, Z)), q0 = unit3(cross3(e, p0));
  const C = add3(S, e, along);
  const at = (th) => add3(add3(C, p0, h * Math.cos(th)), q0, h * Math.sin(th));
  const target = hand.z + offsetZ;
  const N = 720, th = (i) => (i * 2 * Math.PI) / N;
  const cands = [];
  for (let i = 0; i < N; i++) {
    const g0 = at(th(i)).z - target, g1 = at(th(i + 1)).z - target;
    if (g0 * g1 <= 0) {
      let lo = th(i), hi = th(i + 1);
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if ((at(lo).z - target) * (at(mid).z - target) <= 0) hi = mid; else lo = mid; }
      cands.push(at((lo + hi) / 2));
    }
  }
  if (!cands.length) {
    let best = 0;
    for (let i = 1; i < N; i++) if (Math.abs(at(th(i)).z - target) < Math.abs(at(th(best)).z - target)) best = i;
    return { E: at(th(best)), ok: Math.abs(at(th(best)).z - target) < 0.02 };
  }
  if (front === "under") { // forearm closest to vertical under the hand
    const off = (a) => Math.hypot(a.x - hand.x, a.z - hand.z) - 1e-3 * (hand.y - a.y);
    cands.sort((a, b) => off(a) - off(b));
  } else cands.sort((a, b) => dot3(a, front) - dot3(b, front)); // the smaller component along `front` first
  return { E: cands[0], ok: true };
}

/**
 * Elbow as close to the push line as the arm allows: on the circle of positions that fit both arm
 * segments, the point (below the hand) closest to the line through the hand along `dir` (default
 * vertical), i.e. the smallest elbow moment arm. "Elbows under the bar" as a coaching cue.
 */
export function elbowNearestUnder(S, hand, l1, l2, dir = UP) {
  const e = unit3(sub3(hand, S));
  const d = Math.min(len3(sub3(hand, S)), l1 + l2 - 1e-9);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const p0 = unit3(cross3(e, Z)), q0 = unit3(cross3(e, p0));
  const C = add3(S, e, along);
  const at = (th) => add3(add3(C, p0, h * Math.cos(th)), q0, h * Math.sin(th));
  const u = unit3(dir);
  const cost = (E) => { const r = sub3(E, hand); return (E.y > hand.y ? 1e9 : 0) + len3(sub3(r, add3(v3(0, 0, 0), u, dot3(r, u)))); };
  let best = 0;
  const N = 720;
  for (let i = 1; i < N; i++) if (cost(at((i * 2 * Math.PI) / N)) < cost(at((best * 2 * Math.PI) / N))) best = i;
  let lo = ((best - 1) * 2 * Math.PI) / N, hi = ((best + 1) * 2 * Math.PI) / N;
  for (let k = 0; k < 60; k++) { // golden-section refine
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (cost(at(m1)) < cost(at(m2))) hi = m2; else lo = m1;
  }
  return { E: at((lo + hi) / 2), ok: true };
}

/**
 * Bench press (driver: bar height, 0 = on the chest, 100 = arms locked out). Shoulders fixed on
 * the bench; both hands on a rigid bar at the grip width; the bar moves in a straight line from
 * the touch point to lockout over the shoulders. The elbow is placed relative to the hand in
 * the front view (elbowOut: + outside, − inside; see elbowUnderHand), or with elbowOut "auto" as
 * close under the hand as the arm allows (elbowNearestUnder); the flare angle follows.
 * chestDepth (optional): bar on the chest above the shoulder joints, e.g. raised by an arch.
 * Each hand pushes up with half the bar. Whether the hands also pull the bar apart or squeeze
 * it isn't fixed by statics: barSpread = the bar's sideways push on each hand as a fraction of
 * the vertical one (+ = hands pull the bar apart, so it pushes them inwards); "auto" = least
 * effort, as for the squat's floor push.
 */
export function bench3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const P = { ...v.params, ...placement };
  const L = body.lengths, m = body.mass, c = body.com;
  const t = rad(P.incline ?? 0); // head end raised
  const rot = (p) => v3(p.x * Math.cos(t) + p.y * Math.sin(t), -p.x * Math.sin(t) + p.y * Math.cos(t), p.z);
  const mid = v3(0, 0.6, 0);
  const toFeet = rot(v3(1, 0, 0)), front = rot(UP);
  // Shoulder blades (sliders, default 0): pulled back into the bench (scapRetract) and up towards
  // the head (+) or down (−) (scapElevate). They move the shoulder joints; the chest, and so the
  // bar's touch point, stays put. Lockout stays over the (moved) shoulders.
  const midS = add3(add3(mid, front, -(P.scapRetract ?? 0)), toFeet, -(P.scapElevate ?? 0));
  const S = add3(midS, Z, L.shoulderHalfWidth);
  const dz = P.gripHalf - L.shoulderHalfWidth;
  const reach = Math.sqrt(Math.max(0, (L.upperArm + L.forearm) ** 2 - dz * dz)) * 0.985;
  const touch = add3(mid, rot(v3(P.touch, P.chestDepth ?? L.chestDepth, 0)));
  const lockout = add3(midS, UP, reach);
  const k = x / 100;
  const hand = v3(touch.x + (lockout.x - touch.x) * k, touch.y + (lockout.y - touch.y) * k, P.gripHalf);
  const Fv = (loadKg * G) / 2;
  // The arm's posture. "auto" puts the elbow under the bar for a vertical push (the coaching cue);
  // it deliberately doesn't follow the sideways push, which would let the least-effort search
  // pick extreme spreads by refolding the arm.
  const armAt = () => {
    const { E, ok } = P.elbowOut === "auto"
      ? elbowNearestUnder(S, hand, L.upperArm, L.forearm)
      : elbowUnderHand(S, hand, L.upperArm, L.forearm, P.elbowOut, front);
    const dU = unit3(sub3(E, S)), dF = unit3(sub3(hand, E));
    return {
      E, ok, dU, dF,
      foreW: weight(lerp3(E, hand, c.forearmHand), m.forearmHand * kg),
      upperW: weight(lerp3(S, E, c.upperArm), m.upperArm * kg),
      eFlex: unit3(cross3(dU, dF)), // elbow flexion axis
      eSide: unit3(cross3(unit3(cross3(dU, dF)), dF)), // turning about it moves the hand inwards
      horizAdd: deg(Math.atan2(dot3(dU, front), dot3(dU, Z))), // 0 = out to the side, 90 = up
      elbowFlex: angleBetween3(dU, dF),
    };
  };
  const arm = armAt();
  const solveAt = (spread) => {
    const { E, foreW, upperW, dU, eFlex, eSide, horizAdd, elbowFlex } = arm;
    const bar = { at: hand, f: v3(0, -Fv, -spread * Fv) };
    const Mel = moment3(E, [bar, foreW]);
    const Msh = moment3(S, [bar, foreW, upperW]);
    const line = { at: hand, dir: unit3(neg3(bar.f)) };
    return {
      bar, Mel, Msh, joints: {
        "shoulder-h": { at: S, angle: horizAdd, torque: dot3(Msh, toFeet), ...toLine(S, line.at, line.dir) },
        "shoulder-flex": { at: S, angle: horizAdd, torque: -dot3(Msh, Z) },
        "shoulder-rotation": { at: S, angle: horizAdd, torque: -dot3(Msh, dU) },
        elbow: { at: E, angle: elbowFlex, torque: dot3(Mel, eFlex), ...toLine(E, line.at, line.dir) },
        "elbow-side": { at: E, angle: elbowFlex, torque: dot3(Mel, eSide) },
      },
    };
  };
  const auto = P.barSpread === "auto";
  const spread = auto ? leastEffort(ex, (r) => solveAt(r).joints, -0.6, 0.6, v) : P.barSpread ?? 0;
  const { bar, Mel, Msh, joints } = solveAt(spread);
  const { E, ok, dU, dF, eFlex } = arm;
  const abduction = angleBetween3(dU, toFeet); // upper arm from the trunk's long axis
  const forearmTilt = deg(Math.atan2(hand.z - E.z, dot3(sub3(hand, E), front))); // front view, + = hand outside the elbow
  const flare = deg(Math.atan2(dot3(dU, Z), dot3(dU, toFeet))); // top view: 0 = along the body

  const hips = add3(mid, toFeet, L.trunk);
  const head = add3(mid, toFeet, -0.22);
  const benchTop = add3(mid, front, -0.13);
  const benchEnds = [add3(benchTop, toFeet, -0.4), add3(benchTop, toFeet, 0.75)];
  const knee = (left) => v3(hips.x + 0.42, hips.y + 0.12, left ? -0.13 : 0.13);
  const foot = (left) => v3(hips.x + 0.5, 0.04, left ? -0.16 : 0.16);
  return {
    joints,
    frames: {
      upperArm: { from: S, to: E, anterior: unit3(cross3(dU, eFlex)), lateral: unit3(cross3(dU, cross3(Z, dU))) },
      forearm: { from: E, to: hand, anterior: unit3(cross3(dF, eFlex)), lateral: unit3(cross3(dF, cross3(Z, dF))) },
    },
    moments: { shoulder: Msh, elbow: Mel },
    scene: [
      { kind: "poly", pts: [[-0.4, -0.13], [0.75, -0.13], [0.75, 0.13], [-0.4, 0.13]].map(([a, b]) => add3(add3(benchTop, toFeet, a), Z, b)), cls: "plate3d bench3d" },
      ...[-0.25, 0.6].map((a) => L3(add3(benchTop, toFeet, a), v3(add3(benchTop, toFeet, a).x, 0, 0), 0.04, "equipment")),
      L3(mid, hips, 0.3, "body"), dot(head, 0.11, "body"), L3(mirror(S), S, 0.12, "body"),
      ...[false, true].flatMap((left) => [L3(add3(hips, Z, left ? -0.1 : 0.1), knee(left), 0.14, left ? "body back" : "body"), L3(knee(left), foot(left), 0.1, left ? "body back" : "body")]),
      ...[false, true].flatMap((left) => {
        const tf = left ? mirror : (p) => p, cls = left ? "body back" : "body";
        return [L3(tf(S), tf(E), 0.07, cls), L3(tf(E), tf(hand), 0.06, cls)];
      }),
      L3(v3(hand.x, hand.y, -0.75), v3(hand.x, hand.y, 0.75), 0.03, "equipment"),
      ...both(v3(hand.x, hand.y, 0.66)).map((p) => dot(p, 0.12, "weight")),
      { kind: "line", a: v3(touch.x, touch.y, P.gripHalf), b: v3(lockout.x, lockout.y, P.gripHalf), w: 0.006, cls: "line-of-action" },
    ],
    forces: [{ at: hand, dir: unit3(bar.f) }, { at: mirror(hand), dir: mirror(unit3(bar.f)) }],
    flare,
    barSpread: spread,
    abduction, forearmTilt,
    info: [{ text: `Elbow flare (upper arm from the body, seen from above): ${Math.round(flare)}°. Upper arm ${Math.round(abduction)}° from the trunk; forearm tilted ${Math.abs(Math.round(forearmTilt))}° ${forearmTilt >= 0 ? "with the hand outside" : "with the elbow outside"} (front view).` },
      ...(Math.abs(spread) > 0.005 ? [{ text: `Hands ${spread > 0 ? "pull the bar apart" : "squeeze the bar inwards"} with ${Math.round(Math.abs(spread) * 100)}% of the vertical force${auto ? " (least-effort estimate)" : ""}.` }] : []),
      ...(ok ? [] : [{ warn: true, text: "The elbows can't sit that far from the hands at this bar height; shown as close as the arm allows." }])],
  };
}

/**
 * Overhead press (driver: bar height, 0 = resting in front of the shoulders, 100 = arms locked
 * out overhead). Standing or seated, trunk upright, shoulder joints fixed. Both hands push
 * straight up with half the load; with a bar they may also pull it apart (`barSpread`, as in the
 * bench), with dumbbells there is nothing to push against, so they can't. The hands move in a
 * straight line from the start (`touchFront` in front of and `touchUp` above the shoulder line)
 * to lockout over the shoulders.
 * Shoulder components in the body frame: flexion (about the side-to-side axis), abduction
 * (about the front-to-back axis) and rotation (about the upper arm). Their angle is the arm's
 * elevation: 0° = by the side, 180° = straight up.
 */
export function press3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const P = { ...v.params, ...placement };
  const L = body.lengths, m = body.mass, c = body.com;
  const seated = P.stance === "seated";
  const hipY = seated ? 0.5 : L.ankleHeight + L.shank + L.thigh;
  const mid = v3(0, hipY + L.trunk, 0);
  const k = x / 100;
  // No shoulder-blade slider here: lifting the shoulder joints (a shrug) moves the whole hand path
  // with them and leaves every torque unchanged; its real effect, the shoulder blade's upward
  // rotation, needs a shoulder-blade model.
  const S = add3(mid, Z, L.shoulderHalfWidth);
  const FRONT = v3(1, 0, 0), DOWN = v3(0, -1, 0);
  const dz = P.gripHalf - L.shoulderHalfWidth;
  const reach = Math.sqrt(Math.max(0, (L.upperArm + L.forearm) ** 2 - dz * dz)) * 0.985;
  const start = add3(add3(mid, FRONT, P.touchFront), UP, P.touchUp);
  const lockout = add3(mid, UP, reach);
  const hand = v3(start.x + (lockout.x - start.x) * k, start.y + (lockout.y - start.y) * k, P.gripHalf);
  // Of the two elbow positions that fit, take the one that puts the forearm closest to vertical
  // under the hand. Choosing the lower one instead flips sides where both are about level.
  const { E, ok } = elbowUnderHand(S, hand, L.upperArm, L.forearm, P.elbowOut, "under");

  const Fv = (loadKg * G) / 2;
  const foreW = weight(lerp3(E, hand, c.forearmHand), m.forearmHand * kg);
  const upperW = weight(lerp3(S, E, c.upperArm), m.upperArm * kg);
  const dU = unit3(sub3(E, S)), dF = unit3(sub3(hand, E));
  const eFlex = unit3(cross3(dU, dF));
  const eSide = unit3(cross3(eFlex, dF));
  const elev = angleBetween3(dU, DOWN);
  const elbowFlex = angleBetween3(dU, dF);
  const dumbbells = v.loadShape === "dumbbell";
  const solveAt = (spread) => {
    const push = { at: hand, f: v3(0, -Fv, -spread * Fv) };
    const Mel = moment3(E, [push, foreW]);
    const Msh = moment3(S, [push, foreW, upperW]);
    const line = { at: hand, dir: unit3(neg3(push.f)) };
    return {
      push, Mel, Msh, joints: {
        "shoulder-flex": { at: S, angle: elev, torque: -dot3(Msh, Z), ...toLine(S, line.at, line.dir) },
        "shoulder-abd": { at: S, angle: elev, torque: dot3(Msh, FRONT) },
        "shoulder-rotation": { at: S, angle: elev, torque: -dot3(Msh, dU) },
        elbow: { at: E, angle: elbowFlex, torque: dot3(Mel, eFlex), ...toLine(E, line.at, line.dir) },
        "elbow-side": { at: E, angle: elbowFlex, torque: dot3(Mel, eSide) },
      },
    };
  };
  const auto = !dumbbells && P.barSpread === "auto";
  const spread = dumbbells ? 0 : auto ? leastEffort(ex, (r) => solveAt(r).joints, -0.6, 0.6, v) : P.barSpread ?? 0;
  const { push, Mel, Msh, joints } = solveAt(spread);

  const hips = v3(0, hipY, 0);
  const head = add3(mid, UP, 0.24);
  const legs = seated
    ? [false, true].flatMap((left) => {
      const t = left ? mirror : (p) => p, cls = left ? "body back" : "body";
      const H = v3(0, hipY, 0.1), K = v3(L.thigh, hipY, 0.12), A = v3(L.thigh, L.ankleHeight, 0.13);
      return [L3(t(H), t(K), 0.14, cls), L3(t(K), t(A), 0.1, cls), L3(t(v3(A.x - L.heel, 0.02, 0.13)), t(v3(A.x + L.footFront, 0.02, 0.13)), 0.06, cls)];
    })
    : legPrims(v3(0, hipY, 0.1), v3(0, L.ankleHeight + L.shank, 0.1), v3(0, L.ankleHeight, 0.1), v3(-L.heel, 0.02, 0.1), v3(L.footFront, 0.02, 0.1));
  const load = dumbbells
    ? both(hand).flatMap((h) => [L3(add3(h, Z, -0.1), add3(h, Z, 0.1), 0.025, "equipment"), dot(add3(h, Z, -0.09), 0.07, "weight"), dot(add3(h, Z, 0.09), 0.07, "weight")])
    : [L3(v3(hand.x, hand.y, -0.75), v3(hand.x, hand.y, 0.75), 0.03, "equipment"), ...both(v3(hand.x, hand.y, 0.66)).map((p) => dot(p, 0.12, "weight"))];
  return {
    joints,
    frames: {
      upperArm: { from: S, to: E, anterior: unit3(cross3(dU, eFlex)), lateral: unit3(cross3(dU, cross3(Z, dU))) },
      forearm: { from: E, to: hand, anterior: unit3(cross3(dF, eFlex)), lateral: unit3(cross3(dF, cross3(Z, dF))) },
    },
    moments: { shoulder: Msh, elbow: Mel },
    scene: [
      { kind: "poly", pts: [[-0.5, -0.5], [0.6, -0.5], [0.6, 0.5], [-0.5, 0.5]].map(([px, pz]) => v3(px, 0, pz)), cls: "floor3d" },
      ...(seated ? [
        { kind: "poly", pts: [[-0.2, -0.18], [0.25, -0.18], [0.25, 0.18], [-0.2, 0.18]].map(([px, pz]) => v3(px, hipY - 0.07, pz)), cls: "plate3d bench3d" },
        { kind: "poly", pts: [[hipY - 0.07, -0.18], [mid.y, -0.18], [mid.y, 0.18], [hipY - 0.07, 0.18]].map(([py, pz]) => v3(-0.17, py, pz)), cls: "plate3d bench3d" },
        L3(v3(0, hipY - 0.07, 0), v3(0, 0, 0), 0.04, "equipment"),
      ] : []),
      ...legs,
      L3(hips, mid, 0.3, "body"), dot(head, 0.11, "body"), L3(mirror(S), S, 0.12, "body"),
      ...[false, true].flatMap((left) => {
        const tf = left ? mirror : (p) => p, cls = left ? "body back" : "body";
        return [L3(tf(S), tf(E), 0.07, cls), L3(tf(E), tf(hand), 0.06, cls)];
      }),
      ...load,
      { kind: "line", a: v3(start.x, start.y, P.gripHalf), b: v3(lockout.x, lockout.y, P.gripHalf), w: 0.006, cls: "line-of-action" },
    ],
    forces: [{ at: hand, dir: unit3(push.f) }, { at: mirror(hand), dir: mirror(unit3(push.f)) }],
    barSpread: spread,
    info: [{ text: `Upper arm raised ${Math.round(elev)}° from the side.` },
      ...(dumbbells ? [{ text: "Dumbbells: no bar to push against, so the hands push straight up (the bar-spread setting is ignored)." }] : []),
      ...(!dumbbells && Math.abs(spread) > 0.005 ? [{ text: `Hands ${spread > 0 ? "pull the bar apart" : "squeeze the bar inwards"} with ${Math.round(Math.abs(spread) * 100)}% of the vertical force${auto ? " (least-effort estimate)" : ""}.` }] : []),
      // Near lockout a straight arm can't put the elbow under a wide hand; that's expected, not a warning.
      ...(ok || elbowFlex < 30 ? [] : [{ warn: true, text: "The elbows can't sit that far from the hands at this bar height; shown as close as the arm allows." }])],
  };
}

// ---------- lower-body lifts in 3D beyond the squat ----------

/**
 * One leg loaded from the floor up: the floor pushes at `cop` with `Fy` up and ratio·Fy sideways
 * (+ = the right foot pushed inwards, i.e. the foot pushes outwards), plus the leg's own weights.
 * The ratio is P.sidePush, or the least-effort one when that is "auto" (the default).
 */
function legFromFloor(ex, P, { H, K, A, f, cop, Fy, back, kneeAngle, kg, body, variant }) {
  const m = body.mass, c = body.com, L = body.lengths;
  const footW = weight(add3(A, f, L.midfoot), m.foot * kg);
  const shankW = weight(lerp3(A, K, c.shank), m.shank * kg);
  const thighW = weight(lerp3(K, H, c.thigh), m.thigh * kg);
  const solveAt = (ratio) => {
    const grf = { at: cop, f: v3(0, Fy, -ratio * Fy) };
    const dir = unit3(grf.f);
    const Mankle = moment3(A, [grf, footW]);
    const Mknee = moment3(K, [grf, footW, shankW]);
    const Mhip = moment3(H, [grf, footW, shankW, thighW]);
    return { grf, dir, Mhip, Mknee, Mankle, ...legComponents({ H, K, A, f, back, Mhip, Mknee, Mankle, knee: kneeAngle, line: { at: cop, dir } }) };
  };
  const auto = P.sidePush === "auto" || P.sidePush == null;
  const ratio = auto ? leastEffort(ex, (r) => solveAt(r).joints, -0.6, 0.6, variant) : P.sidePush;
  return { ...solveAt(ratio), ratio, auto };
}

const sidePushInfo = (leg) => ({ text: `Feet push ${leg.ratio >= 0 ? "outwards" : "inwards"} against the floor with ${Math.round(Math.abs(leg.ratio) * 100)}% of the vertical force${leg.auto ? " (least-effort estimate)" : ""}.` });
const footPrims = (A, f, L) => [add3(v3(A.x, 0.01, A.z), f, -L.heel), add3(v3(A.x, 0.01, A.z), f, L.footFront)];
const DOWN = v3(0, -1, 0);

/** Bisection for g(t) = 0 on [lo, hi]; ok = false if g doesn't change sign. */
function bisect(g, lo, hi, n = 60) {
  const glo = g(lo), ghi = g(hi);
  const ok = glo * ghi <= 0;
  const up = glo < ghi;
  for (let i = 0; i < n; i++) { const mid = (lo + hi) / 2; if ((g(mid) < 0) === up) lo = mid; else hi = mid; }
  return { t: (lo + hi) / 2, ok };
}

const BAR_R = 0.015; // bar radius, as in the side view
/**
 * The bar from straight arms (length `arm`) hanging from the shoulders S, kept in front of the
 * legs: the front of the shin (5 cm in front of the ankle–knee line) or thigh (7 cm in front of
 * the knee–hip line) at the bar's height, in the side view. If hanging straight down would put the
 * bar inside, the arms swing forward on their circle until it just touches. Same rule as the 2D
 * hinge (multijoint.js hang/legFront).
 */
function hangClear(S, arm, A, K, H) {
  const front = (y) => {
    const at = (p, q, half) => p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y || 1e-9) + half;
    if (y <= A.y) return -Infinity;
    if (y <= K.y) return at(A, K, 0.05 + BAR_R);
    if (y <= H.y) return at(K, H, 0.07 + BAR_R);
    return -Infinity;
  };
  let bar = v3(S.x, S.y - arm, 0);
  for (let i = 0; i < 30; i++) {
    const fx = front(bar.y);
    if (bar.x >= fx - 1e-6) break;
    const dx = Math.min(arm, fx - S.x);
    bar = v3(S.x + dx, S.y - Math.sqrt(arm * arm - dx * dx), 0);
  }
  return bar;
}

/**
 * Hip hinge in 3D: Romanian / stiff-legged deadlift (driver: hip flexion). Both feet flat at
 * `halfWidth` from the midline, toes turned `toeOut`, knees `kneeTrack` out of the toe line.
 * Knee flexion = kneeBase + kneePerHip · hip flexion; the hips move back (the shins tilt) until
 * the centre of mass of body + load is over the mid-foot. The bar hangs under the shoulders, or
 * with P.clearShins (a straight bar from the floor) the straight arms swing forward just enough
 * for the bar to pass in front of the shins and thighs (side view: the bar spans both legs).
 * With the feet under the hips, toes forward and no sideways push it matches the side-view hinge.
 */
export function hinge3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const L = body.lengths, m = body.mass, c = body.com;
  const P = { halfWidth: L.hipHalfWidth, toeOut: 0, kneeTrack: 0, ...v.params, ...placement };
  const toe = rad(P.toeOut);
  const f = v3(Math.cos(toe), 0, Math.sin(toe));
  const A = v3(0, L.ankleHeight, P.halfWidth);
  const kneeFlex = Math.max(0, P.kneeBase + P.kneePerHip * x); // a negative base: the knees only start bending past some hip flexion
  const D = Math.sqrt(L.thigh ** 2 + L.shank ** 2 + 2 * L.thigh * L.shank * Math.cos(rad(kneeFlex)));
  const dz = L.hipHalfWidth - P.halfWidth;
  const R = Math.sqrt(Math.max(1e-9, D * D - dz * dz));
  const balanceX = A.x + f.x * L.midfoot;
  const armsKg = 2 * (m.upperArm + m.forearmHand) * kg;
  const pose = (psi) => {
    const H = v3(A.x + R * Math.sin(psi), A.y + R * Math.cos(psi), L.hipHalfWidth);
    const K = placeMid(H, A, L.thigh, L.shank, f, P.kneeTrack);
    const dT = unit3(sub3(K, H));
    // Trunk lean that gives this hip flexion, measured in the side view (signed, as in 2D).
    const thighLean = Math.atan2(-dT.x, -dT.y); // knee → hip, from vertical, + = forward
    const tk = thighLean + rad(x);
    const back = v3(Math.sin(tk), Math.cos(tk), 0);
    const pelvis = v3(H.x, H.y, 0);
    // Back rounding (P.spineFlex, degrees): the lower half of the trunk follows the pelvis, the upper
    // half bends forward by spineFlex, which lowers the shoulders and brings them forward.
    const rnd = rad(P.spineFlex ?? 0);
    const upperBack = v3(Math.sin(tk + rnd), Math.cos(tk + rnd), 0);
    const midBack = add3(pelvis, back, L.trunk / 2);
    const S = add3(midBack, upperBack, L.trunk / 2);
    const bar = P.clearShins ? hangClear(S, L.upperArm + L.forearm, A, K, H) : v3(S.x, S.y - (L.upperArm + L.forearm), 0);
    const trunkCom = c.headTrunk <= 0.5 ? add3(pelvis, back, c.headTrunk * L.trunk) : add3(midBack, upperBack, (c.headTrunk - 0.5) * L.trunk);
    const armCom = lerp3(S, bar, 0.45);
    const items = [[lerp3(K, H, c.thigh), 2 * m.thigh * kg], [lerp3(A, K, c.shank), 2 * m.shank * kg], [v3(balanceX, 0, 0), 2 * m.foot * kg],
      [trunkCom, m.headTrunk * kg], [armCom, armsKg], [bar, loadKg]];
    const total = items.reduce((s, [, k]) => s + k, 0);
    const comX = items.reduce((s, [p, k]) => s + p.x * k, 0) / total;
    return { H, K, back, upperBack, midBack, pelvis, S, bar, comX, total };
  };
  const bal = bisect((psi) => pose(psi).comX - balanceX, rad(-60), rad(40));
  const Q = pose(bal.t);
  const cop = add3(v3(A.x, 0, A.z), f, L.midfoot);
  const leg = legFromFloor(ex, P, { H: Q.H, K: Q.K, A, f, cop, Fy: (Q.total * G) / 2, back: Q.back, kneeAngle: angleBetween3(sub3(Q.K, Q.H), sub3(A, Q.K)), kg, body, variant: v });
  const shoulder = add3(Q.S, Z, L.shoulderHalfWidth);
  const hand = add3(Q.bar, Z, L.shoulderHalfWidth + 0.03);
  return {
    joints: leg.joints, frames: leg.frames,
    moments: { hip: leg.Mhip, knee: leg.Mknee, ankle: leg.Mankle },
    balance: { x: balanceX, com: Q.comX, ok: bal.ok },
    scene: [
      { kind: "poly", pts: [[-0.5, -0.6], [0.7, -0.6], [0.7, 0.6], [-0.5, 0.6]].map(([px, pz]) => v3(px, 0, pz)), cls: "floor3d" },
      L3(Q.pelvis, Q.midBack, 0.3, "body"), L3(Q.midBack, Q.S, 0.3, "body"), dot(add3(Q.S, Q.upperBack, 0.22), 0.11, "body"), L3(mirror(Q.H), Q.H, 0.16, "body"),
      L3(mirror(shoulder), shoulder, 0.1, "body"), L3(mirror(shoulder), mirror(hand), 0.07, "body arm back"), L3(shoulder, hand, 0.07, "body arm"),
      ...legPrims(Q.H, Q.K, A, ...footPrims(A, f, L)),
      L3(add3(Q.bar, Z, -0.7), add3(Q.bar, Z, 0.7), 0.03, "equipment"), ...both(add3(Q.bar, Z, 0.62)).map((p) => dot(p, 0.13, "weight")),
    ],
    forces: [{ at: cop, dir: leg.dir }, { at: mirror(cop), dir: mirror(leg.dir) }],
    grf: leg.grf.f, sidePush: leg.ratio,
    parts: { bar: Q.bar, S: Q.S },
    info: bal.ok ? [sidePushInfo(leg)] : [{ warn: true, text: "Can't balance: no shin angle keeps the centre of mass over the mid-foot here." }],
  };
}

/**
 * Split squat in 3D (driver: front-knee flexion). Front (right) foot flat at `frontWidth` from
 * the midline, rear (left) foot on a bench or the floor at `rearWidth` on the other side. Both
 * contacts push straight up. Balance needs the centre of mass over the line between them, so the
 * pelvis shifts sideways (towards the front foot when that carries more); the weight then splits
 * by where the centre of mass sits along that line. Torques are for the front leg.
 */
export function split3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const L = body.lengths, m = body.mass, c = body.com;
  const P = { frontWidth: L.hipHalfWidth, rearWidth: L.hipHalfWidth, toeOut: 0, kneeTrack: 0, ...v.params, ...placement };
  const toe = rad(P.toeOut);
  const f = v3(Math.cos(toe), 0, Math.sin(toe));
  const A = v3(0, L.ankleHeight, P.frontWidth);
  const Rr = v3(P.rearFoot.x, P.rearFoot.y, -P.rearWidth);
  const D = Math.sqrt(L.thigh ** 2 + L.shank ** 2 + 2 * L.thigh * L.shank * Math.cos(rad(x)));
  const tk = rad(P.trunkLean), back = v3(Math.sin(tk), Math.cos(tk), 0);
  const cop1 = add3(v3(A.x, 0, A.z), f, L.midfoot), cop2 = v3(Rr.x, 0, Rr.z);
  const armsKg = 2 * (m.upperArm + m.forearmHand) * kg;
  let lastPsi = null;
  const pose = (s) => {
    const hz = s + L.hipHalfWidth;
    const R = Math.sqrt(Math.max(1e-9, D * D - (hz - A.z) ** 2));
    const legAt = (psi) => {
      const H = v3(A.x + R * Math.sin(psi), A.y + R * Math.cos(psi), hz);
      const K = placeMid(H, A, L.thigh, L.shank, f, P.kneeTrack);
      const sh = sub3(K, A);
      return { H, K, tilt: Math.atan2(sh.x * f.x + sh.z * f.z, sh.y) };
    };
    // Warm start: the hip's position barely moves with the pelvis shift, so search near the last answer first.
    const gPsi = (psi) => legAt(psi).tilt - rad(P.shinPerKnee * x);
    let near = lastPsi != null ? bisect(gPsi, lastPsi - 0.03, lastPsi + 0.03, 30) : { ok: false };
    if (!near.ok) near = bisect(gPsi, rad(-85), rad(45), 42);
    lastPsi = near.t;
    const { H, K } = legAt(near.t);
    const pelvis = v3(H.x, H.y, s);
    const Hr = add3(pelvis, Z, -L.hipHalfWidth);
    const Kr = placeMid(Hr, Rr, L.thigh, L.shank, DOWN);
    const S = add3(pelvis, back, L.trunk);
    const n = v3(back.y, -back.x, 0);
    const bar = P.load === "hang" ? v3(S.x, S.y - (L.upperArm + L.forearm), s) : add3(add3(pelvis, back, P.barAlong * L.trunk), n, P.barOut);
    const items = [[lerp3(K, H, c.thigh), m.thigh * kg], [lerp3(A, K, c.shank), m.shank * kg], [add3(A, f, L.midfoot), m.foot * kg],
      [lerp3(Kr, Hr, c.thigh), m.thigh * kg], [lerp3(Rr, Kr, c.shank), m.shank * kg], [Rr, m.foot * kg],
      [add3(pelvis, back, c.headTrunk * L.trunk), m.headTrunk * kg], [lerp3(S, bar, 0.45), armsKg], [bar, loadKg]];
    const total = items.reduce((t, [, k]) => t + k, 0);
    const com = v3(items.reduce((t, [p, k]) => t + p.x * k, 0) / total, 0, items.reduce((t, [p, k]) => t + p.z * k, 0) / total);
    const W = total * G, along = (com.x - cop1.x) / (cop2.x - cop1.x);
    return { H, K, Hr, Kr, pelvis, S, bar, total, com, W, F1: W * (1 - along), F2: W * along, along, reach: len3(sub3(Rr, Hr)) <= L.thigh + L.shank };
  };
  // Sideways balance (moments about the front-back axis): the vertical contact forces, the
  // weight, and a sideways push ρ·F1 on the front foot (+ = inwards) that the rear contact
  // returns (−ρ·F1 at its height, so the pair also tips the body). ρ = 0: the centre of mass
  // is over the line between the contacts.
  const rearY = Rr.y > 0.2 ? Rr.y - 0.04 : 0; // rear foot on a bench: its top; on the floor: the toes
  const tipping = (Q, rho) => -cop1.z * Q.F1 - cop2.z * Q.F2 + Q.com.z * Q.W + rearY * rho * Q.F1;
  const poses = new Map();
  const poseAt = (sv) => { let q = poses.get(sv); if (!q) poses.set(sv, (q = pose(sv))); return q; };
  // Secant search for the pelvis shift (the tipping moment is nearly linear in it); bisection
  // as the fallback when it doesn't converge inside ±0.3 m.
  // Start from the linear estimate: tipping = T0(s) + ρ·T1(s), both nearly straight lines in s.
  const P0 = poseAt(0), P1 = poseAt(0.1);
  const t0 = tipping(P0, 0), t1 = tipping(P1, 0), b0 = tipping(P0, 1) - t0, b1 = tipping(P1, 1) - t1;
  const shiftFor = (rho) => {
    const g = (sv) => tipping(poseAt(sv), rho);
    const ga0 = t0 + rho * b0, gb0 = t1 + rho * b1;
    const guess = Math.abs(gb0 - ga0) > 1e-12 ? (-ga0 * 0.1) / (gb0 - ga0) : 0.05;
    let a = Math.max(-0.3, Math.min(0.3, guess)), b = a + 0.002, ga = g(a), gb = g(b);
    for (let i = 0; i < 12 && Math.abs(gb) > 1e-7 * poseAt(b).W; i++) {
      const next = b - (gb * (b - a)) / (gb - ga);
      if (!Number.isFinite(next) || Math.abs(next) > 0.3) return bisect(g, -0.3, 0.3, 40);
      [a, ga, b] = [b, gb, next];
      gb = g(b);
    }
    return Math.abs(gb) <= 1e-6 * poseAt(b).W ? { t: b, ok: true } : bisect(g, -0.3, 0.3, 40);
  };
  const solveFor = (rho) => {
    const sol = shiftFor(rho);
    const Q = poseAt(sol.t);
    const leg = legFromFloor(ex, { sidePush: rho }, { H: Q.H, K: Q.K, A, f, cop: cop1, Fy: Q.F1, back, kneeAngle: x, kg, body, variant: v });
    return { sol, Q, leg };
  };
  const auto = P.sidePush === "auto" || P.sidePush == null;
  const rho = auto ? leastEffort(ex, (r) => solveFor(r).leg.joints, -0.6, 0.6, v) : P.sidePush;
  const { sol, Q, leg: leg0 } = solveFor(rho);
  const leg = { ...leg0, ratio: rho, auto };
  const W = Q.W, frontR = Q.F1;
  const ok = sol.ok && Q.reach && Q.along >= 0 && Q.along <= 1;
  const sh = add3(Q.S, Z, L.shoulderHalfWidth);
  const loadPrims = P.load === "hang"
    ? [dot(add3(Q.bar, Z, L.shoulderHalfWidth + 0.04), 0.07, "weight"), dot(add3(Q.bar, Z, -L.shoulderHalfWidth - 0.04), 0.07, "weight")]
    : [L3(add3(Q.bar, Z, -0.7), add3(Q.bar, Z, 0.7), 0.03, "equipment"), dot(add3(Q.bar, Z, 0.62), 0.13, "weight"), dot(add3(Q.bar, Z, -0.62), 0.13, "weight")];
  const handZ = L.shoulderHalfWidth + 0.04;
  return {
    joints: leg.joints, frames: leg.frames,
    moments: { hip: leg.Mhip, knee: leg.Mknee, ankle: leg.Mankle },
    balance: { x: cop1.x, com: Q.com.x, ok },
    shares: { front: frontR / W }, pelvisShift: sol.t, com: Q.com, contacts: [cop1, cop2],
    sidePush: rho, frontal: { F1: Q.F1, F2: Q.F2, W, rearY, tipping: tipping(Q, rho) },
    scene: [
      { kind: "poly", pts: [[-0.9, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.9, 0.5]].map(([px, pz]) => v3(px, 0, pz)), cls: "floor3d" },
      ...(Rr.y > 0.2 ? [{ kind: "poly", pts: [[-0.25, -0.18], [0.08, -0.18], [0.08, 0.18], [-0.25, 0.18]].map(([px, pz]) => v3(Rr.x + px, Rr.y - 0.04, Rr.z + pz)), cls: "plate3d bench3d" },
        L3(v3(Rr.x - 0.1, Rr.y - 0.04, Rr.z), v3(Rr.x - 0.1, 0, Rr.z), 0.04, "equipment")] : []),
      L3(Q.Hr, Q.Kr, 0.13, "body back"), L3(Q.Kr, Rr, 0.1, "body back"),
      L3(Q.pelvis, Q.S, 0.3, "body"), dot(add3(Q.S, back, 0.22), 0.11, "body"), L3(Q.Hr, Q.H, 0.16, "body"),
      L3(add3(sh, Z, -2 * L.shoulderHalfWidth), sh, 0.1, "body"),
      L3(add3(sh, Z, -2 * L.shoulderHalfWidth), add3(Q.bar, Z, P.load === "hang" ? -handZ : -0.3), 0.07, "body arm back"),
      L3(sh, add3(Q.bar, Z, P.load === "hang" ? handZ : 0.3), 0.07, "body arm"),
      L3(Q.H, Q.K, 0.14, "body"), L3(Q.K, A, 0.1, "body"), L3(...footPrims(A, f, L), 0.06, "body"),
      ...loadPrims,
      { kind: "line", a: cop1, b: cop2, w: 0.006, cls: "line-of-action" },
    ],
    forces: [{ at: cop1, dir: leg.dir }],
    grf: leg.grf.f,
    info: [{ text: `Front leg carries ${Math.round((100 * frontR) / W)}% of the weight, the rear foot the rest. Pelvis shifted ${Math.abs(Math.round(sol.t * 100))} cm ${sol.t >= 0 ? "towards the front foot's side" : "towards the rear foot's side"} to balance.` }, sidePushInfo(leg),
      ...(ok ? [] : [{ warn: true, text: Q.reach ? "The centre of mass can't be brought over the line between the feet here." : "The rear foot is out of reach at this depth." }])],
  };
}

/**
 * Hip thrust / glute bridge in 3D (driver: hip flexion). Shoulders on the bench (or floor) at
 * `shoulder`, feet flat at `feetAt` in front, `halfWidth` from the midline, toes `toeOut`,
 * knees `kneeTrack` out of the toe line. Bench and feet push up (moment balance gives the split);
 * the feet may also push sideways (sidePush, least effort by default). Torques per leg.
 * With the feet under the hips, toes forward and no sideways push it matches the side view.
 */
export function hipThrust3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const L = body.lengths, m = body.mass, c = body.com;
  const P = { halfWidth: L.hipHalfWidth, toeOut: 0, kneeTrack: 0, ...v.params, ...placement };
  const toe = rad(P.toeOut);
  const f = v3(Math.cos(toe), 0, Math.sin(toe));
  const Sm = v3(P.shoulder.x, P.shoulder.y, 0);
  const A = v3(P.feetAt, L.ankleHeight, P.halfWidth);
  const pose = (beta) => {
    const e = v3(Math.cos(beta), -Math.sin(beta), 0); // shoulder → hip
    const pelvis = add3(Sm, e, L.trunk);
    const H = add3(pelvis, Z, L.hipHalfWidth);
    const K = placeMid(H, A, L.thigh, L.shank, add3(UP, f), P.kneeTrack); // knees up, over the toes
    const d = sub3(K, H);
    return { e, pelvis, H, K, flex: deg(Math.atan2(e.x * d.y - e.y * d.x, e.x * d.x + e.y * d.y)) };
  };
  const sol = bisect((b) => pose(b).flex - x, rad(-60), rad(70));
  const { e, pelvis, H, K } = pose(sol.t);
  const reach = len3(sub3(A, H)) <= L.thigh + L.shank;
  const n = v3(-e.y, e.x, 0);
  const bar = add3(pelvis, n, 0.12);
  const armCom = lerp3(Sm, bar, 0.5);
  const midfoot = add3(v3(A.x, 0, A.z), f, L.midfoot);
  const items = [[lerp3(pelvis, Sm, c.headTrunk), m.headTrunk * kg], [lerp3(K, H, c.thigh), 2 * m.thigh * kg], [lerp3(A, K, c.shank), 2 * m.shank * kg],
    [v3(midfoot.x, 0.04, 0), 2 * m.foot * kg], [armCom, 2 * (m.upperArm + m.forearmHand) * kg], [bar, loadKg]];
  const total = items.reduce((s, [, k]) => s + k, 0), W = total * G;
  const comX = items.reduce((s, [p, k]) => s + p.x * k, 0) / total;
  const shoulderR = (W * (comX - midfoot.x)) / (Sm.x - midfoot.x);
  const feetR = W - shoulderR;
  const aboveFloor = H.y - 0.1 >= 0;
  const ok = shoulderR >= 0 && feetR >= 0 && sol.ok && reach && aboveFloor;
  const leg = legFromFloor(ex, P, { H, K, A, f, cop: midfoot, Fy: feetR / 2, back: unit3(neg3(e)), kneeAngle: angleBetween3(sub3(K, H), sub3(A, K)), kg, body, variant: v });
  const shoulder = add3(Sm, Z, L.shoulderHalfWidth);
  const hand = add3(bar, Z, 0.3);
  return {
    joints: leg.joints, frames: leg.frames,
    moments: { hip: leg.Mhip, knee: leg.Mknee, ankle: leg.Mankle },
    reactions: { shoulder: shoulderR, feet: feetR, weight: W },
    scene: [
      { kind: "poly", pts: [[-0.7, -0.5], [0.7, -0.5], [0.7, 0.5], [-0.7, 0.5]].map(([px, pz]) => v3(px, 0, pz)), cls: "floor3d" },
      ...(Sm.y > 0.2 ? [{ kind: "poly", pts: [[-0.45, -0.25], [0.02, -0.25], [0.02, 0.25], [-0.45, 0.25]].map(([px, pz]) => v3(Sm.x + px, Sm.y - 0.1, pz)), cls: "plate3d bench3d" },
        L3(v3(Sm.x - 0.2, Sm.y - 0.1, 0), v3(Sm.x - 0.2, 0, 0), 0.04, "equipment")] : []),
      L3(Sm, pelvis, 0.3, "body"), dot(add3(Sm, e, -0.22), 0.11, "body"), L3(mirror(H), H, 0.16, "body"),
      L3(mirror(shoulder), shoulder, 0.1, "body"), L3(mirror(shoulder), mirror(hand), 0.07, "body arm back"), L3(shoulder, hand, 0.07, "body arm"),
      ...legPrims(H, K, A, ...footPrims(A, f, L)),
      L3(add3(bar, Z, -0.7), add3(bar, Z, 0.7), 0.03, "equipment"), ...both(add3(bar, Z, 0.62)).map((p) => dot(p, 0.2, "weight")),
    ],
    forces: [{ at: midfoot, dir: leg.dir }, { at: mirror(midfoot), dir: mirror(leg.dir) }],
    grf: leg.grf.f, sidePush: leg.ratio,
    info: [{ text: `The ${Sm.y > 0.2 ? "bench" : "floor"} carries ${Math.round((100 * shoulderR) / W)}% of the weight at the shoulders, the feet the rest.` }, sidePushInfo(leg),
      ...(ok ? [] : [{ warn: true, text: aboveFloor ? "This hip angle can't be reached with this foot position." : "The hips would have to go below the floor: this hip angle is out of range here." }])],
  };
}

// ---------- rows in 3D ----------

/**
 * Arm of a row in 3D (right arm): the hand moves in a straight line from arms straight (hanging,
 * or reaching towards `reachTo`) to the trunk, `gripHalf` from the midline. The elbow bends away
 * from the belly and is turned `flare` degrees outwards about the shoulder–hand line (0 = tucked,
 * in the side view's plane; 90 = straight out to the side).
 */
function rowArm3d({ S, S0 = S, pelvis, back, belly, P, x, reachTo, L, m, c, kg }) {
  const reach = (L.upperArm + L.forearm) * 0.995;
  const dz = P.gripHalf - S.z;
  // The hand's path starts from the shoulder's position at the start of the pull (S0).
  const toward = reachTo ? unit3(v3(reachTo.x - S0.x, reachTo.y - S0.y, 0)) : DOWN;
  const start = add3(add3(S0, Z, dz), toward, Math.sqrt(Math.max(0, reach * reach - dz * dz)));
  const end = add3(add3(add3(v3(pelvis.x, pelvis.y, P.gripHalf), back, P.touchAlong * L.trunk), belly, P.touchOut), v3(0, 0, 0));
  const hand = lerp3(start, end, x / 100);
  const E = placeMid(S, hand, L.upperArm, L.forearm, neg3(belly), P.flare ?? 0);
  const upperW = weight(lerp3(S, E, c.upperArm), m.upperArm * kg);
  const foreW = weight(lerp3(E, hand, c.forearmHand), m.forearmHand * kg);
  return { start, end, hand, E, upperW, foreW };
}

/**
 * Rows in 3D (driver: pull, 0 = arms straight, 100 = hands at the trunk). Three bases:
 * - `mode: "hinge"`: bent-over row standing, hips held at `hipFlex`, knees `kneeBase` +
 *   kneePerHip·hipFlex, shins tilted for balance (centre of mass over the mid-foot); dumbbells or
 *   a bar hang from the hands.
 * - seated (`hipHeight`, `trunkLean`): hips fixed on a seat; `load: "cable"` pulls each hand
 *   towards `pulley` {x, y, z?} with half the stack; the hip extensors hold the trunk.
 * - `chestPad`: the pad carries the trunk (no hip torque); load hangs.
 * Shoulder components in the trunk's frame: extension (about the side-to-side axis, lats),
 * horizontal abduction (about the trunk's long axis, rear delts) and rotation. Torques per arm;
 * hip, knee and ankle per side. With flare 0 and the hands at shoulder width it matches the side view.
 */
export function row3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const L = body.lengths, m = body.mass, c = body.com;
  const P = { gripHalf: L.shoulderHalfWidth, flare: 0, ...v.params, ...placement };
  const cable = P.load === "cable";
  const F = (loadKg * G) / 2;
  const armsKg = 2 * (m.upperArm + m.forearmHand) * kg;
  const trunkAt = (pelvis, tk) => {
    const back = v3(Math.sin(tk), Math.cos(tk), 0), belly = v3(Math.cos(tk), -Math.sin(tk), 0);
    // Shoulder blades (slider scapTravel, default 0): reached forward (protracted, towards the
    // belly side) by half the travel at the start, squeezed back by half at the end.
    const base = add3(add3(pelvis, back, L.trunk), Z, L.shoulderHalfWidth);
    const travel = P.scapTravel ?? 0;
    const S0 = add3(base, belly, travel / 2);
    const S = add3(base, belly, travel * (0.5 - x / 100));
    const pulley = cable ? v3(P.pulley.x, P.pulley.y, P.pulley.z ?? 0) : null;
    const arm = rowArm3d({ S, S0, pelvis, back, belly, P, x, reachTo: pulley, L, m, c, kg });
    const pull = cable ? unit3(sub3(pulley, arm.hand)) : DOWN;
    return { back, belly, S, arm, pull, onHand: { at: arm.hand, f: v3(pull.x * F, pull.y * F, pull.z * F) } };
  };
  let legs = null, T, pelvis, info = [], balance = null;
  if (P.mode === "hinge") {
    const A = v3(0, L.ankleHeight, L.hipHalfWidth), f = v3(1, 0, 0);
    const kneeFlex = P.kneeBase + P.kneePerHip * P.hipFlex;
    const D = Math.sqrt(L.thigh ** 2 + L.shank ** 2 + 2 * L.thigh * L.shank * Math.cos(rad(kneeFlex)));
    const balanceX = A.x + L.midfoot;
    const pose = (psi) => {
      const H = v3(A.x + D * Math.sin(psi), A.y + D * Math.cos(psi), L.hipHalfWidth);
      const K = placeMid(H, A, L.thigh, L.shank, f, 0);
      const dT = unit3(sub3(K, H));
      const tk = Math.atan2(-dT.x, -dT.y) + rad(P.hipFlex);
      const pv = v3(H.x, H.y, 0);
      const t = trunkAt(pv, tk);
      const armCom = lerp3(t.arm.upperW.at, t.arm.foreW.at, m.forearmHand / (m.upperArm + m.forearmHand));
      const items = [[lerp3(K, H, c.thigh), 2 * m.thigh * kg], [lerp3(A, K, c.shank), 2 * m.shank * kg], [v3(balanceX, 0, 0), 2 * m.foot * kg],
        [add3(pv, t.back, c.headTrunk * L.trunk), m.headTrunk * kg], [armCom, armsKg], [t.arm.hand, loadKg]];
      const total = items.reduce((s, [, k]) => s + k, 0);
      return { H, K, pv, tk, t, total, comX: items.reduce((s, [p, k]) => s + p.x * k, 0) / total };
    };
    const bal = bisect((psi) => pose(psi).comX - balanceX, rad(-60), rad(40));
    const Q = pose(bal.t);
    T = Q.t; pelvis = Q.pv;
    const cop = add3(v3(A.x, 0, A.z), f, L.midfoot);
    const leg = legFromFloor(ex, { sidePush: 0 }, { H: Q.H, K: Q.K, A, f, cop, Fy: (Q.total * G) / 2, back: T.back, kneeAngle: kneeFlex, kg, body, variant: v });
    legs = { H: Q.H, K: Q.K, A, f, joints: leg.joints, cop, dir: leg.dir };
    balance = { x: balanceX, com: Q.comX, ok: bal.ok };
    if (!bal.ok) info.push({ warn: true, text: "Can't balance: no shin angle keeps the centre of mass over the mid-foot here." });
  } else {
    pelvis = v3(0, P.hipHeight, 0);
    T = trunkAt(pelvis, rad(P.trunkLean));
  }
  const { S, arm, onHand, back, belly } = T;
  const { E, hand, upperW, foreW } = arm;
  const Msh = moment3(S, [upperW, foreW, onHand]);
  const Mel = moment3(E, [foreW, onHand]);
  const dU = unit3(sub3(E, S)), dF = unit3(sub3(hand, E));
  const eFlex = unit3(cross3(dU, dF));
  const eSide = unit3(cross3(eFlex, dF));
  const line = { at: hand, dir: unit3(neg3(onHand.f)) };
  const shoulderFlex = deg(Math.atan2(dot3(dU, belly), dot3(dU, neg3(back))));
  const joints = {
    shoulder: { at: S, angle: shoulderFlex, torque: Msh.z, ...toLine(S, line.at, line.dir) },
    "shoulder-h": { at: S, angle: shoulderFlex, torque: dot3(Msh, back) },
    "shoulder-rotation": { at: S, angle: shoulderFlex, torque: -dot3(Msh, dU) },
    elbow: { at: E, angle: angleBetween3(dU, dF), torque: -dot3(Mel, eFlex), ...toLine(E, line.at, line.dir) },
    "elbow-side": { at: E, angle: angleBetween3(dU, dF), torque: dot3(Mel, eSide) },
  };
  // Hip, knee, ankle: from the legs (bent-over), or the trunk side (seated), or none (chest pad).
  const H = legs ? legs.H : add3(pelvis, Z, L.hipHalfWidth);
  if (legs) Object.assign(joints, { hip: legs.joints.hip, knee: legs.joints.knee, ankle: legs.joints.ankle });
  else {
    const trunkW = weight(add3(pelvis, back, c.headTrunk * L.trunk), (m.headTrunk * kg) / 2);
    const above = [trunkW, upperW, foreW, onHand];
    const Mh = moment3(v3(pelvis.x, pelvis.y, 0), above);
    const R = above.reduce((t, { f }) => add3(t, f), v3(0, 0, 0)), R2 = R.x * R.x + R.y * R.y;
    const K = add3(H, v3(Math.cos(rad(-8)), Math.sin(rad(-8)), 0), L.thigh);
    joints.hip = P.chestPad
      ? { at: H, angle: 180 - angleBetween3(back, sub3(K, H)), torque: 0, momentArm: 0, foot: H }
      : { at: H, angle: 180 - angleBetween3(back, sub3(K, H)), torque: -Mh.z, momentArm: Math.abs(Mh.z) / Math.sqrt(R2), foot: v3(H.x + (Mh.z / R2) * R.y, H.y - (Mh.z / R2) * R.x, H.z) };
  }

  // Scene
  const shoulderL = mirror(S);
  const scene = [{ kind: "poly", pts: [[-0.7, -0.6], [1.5, -0.6], [1.5, 0.6], [-0.7, 0.6]].map(([px, pz]) => v3(px, 0, pz)), cls: "floor3d" }];
  if (legs) scene.push(...legPrims(legs.H, legs.K, legs.A, ...footPrims(legs.A, legs.f, L)));
  else if (!P.chestPad) {
    const K = add3(H, v3(Math.cos(rad(-8)), Math.sin(rad(-8)), 0), L.thigh), A = add3(K, unit3(v3(0.55, -0.83, 0)), L.shank);
    scene.push(...legPrims(H, K, A, ...footPrims(A, v3(1, 0, 0), L)),
      { kind: "poly", pts: [[-0.25, -0.18], [0.25, -0.18], [0.25, 0.18], [-0.25, 0.18]].map(([px, pz]) => v3(px, pelvis.y - 0.07, pz)), cls: "plate3d bench3d" },
      L3(v3(A.x + 0.08, 0, 0), v3(A.x + 0.08, 0.4, 0), 0.04, "equipment"));
  } else {
    const K = v3(H.x + 0.02, H.y - L.thigh, H.z), A = v3(H.x + 0.06, L.ankleHeight, H.z);
    scene.push(...legPrims(H, K, A, ...footPrims(A, v3(1, 0, 0), L)));
    const padC = add3(lerp3(pelvis, add3(pelvis, back, L.trunk), 0.55), belly, 0.16);
    scene.push({ kind: "poly", pts: [[-0.3, -0.16], [0.25, -0.16], [0.25, 0.16], [-0.3, 0.16]].map(([a, b]) => add3(add3(padC, back, a), Z, b)), cls: "plate3d bench3d" });
  }
  scene.push(L3(pelvis, add3(pelvis, back, L.trunk), 0.3, "body"), dot(add3(add3(pelvis, back, L.trunk), back, 0.22), 0.11, "body"), L3(shoulderL, S, 0.12, "body"),
    L3(S, E, 0.07, "body"), L3(E, hand, 0.06, "body"), L3(shoulderL, mirror(E), 0.07, "body back"), L3(mirror(E), mirror(hand), 0.06, "body back"));
  if (cable) {
    const pulley = v3(P.pulley.x, P.pulley.y, P.pulley.z ?? 0);
    scene.push(L3(hand, pulley, 0.008, "cable"), L3(mirror(hand), mirror(pulley), 0.008, "cable"), L3(hand, mirror(hand), 0.025, "equipment"),
      L3(v3(pulley.x, 0, 0), v3(pulley.x, pulley.y + 0.05, 0), 0.06, "equipment"));
  } else if (v.loadShape === "dumbbell") {
    scene.push(...both(hand).flatMap((h) => [L3(add3(h, Z, -0.1), add3(h, Z, 0.1), 0.025, "equipment"), dot(add3(h, Z, -0.09), 0.07, "weight"), dot(add3(h, Z, 0.09), 0.07, "weight")]));
  } else {
    scene.push(L3(v3(hand.x, hand.y, -0.75), v3(hand.x, hand.y, 0.75), 0.03, "equipment"), ...both(v3(hand.x, hand.y, 0.66)).map((p) => dot(p, 0.2, "weight")));
  }
  scene.push({ kind: "line", a: arm.start, b: arm.end, w: 0.006, cls: "line-of-action" });
  const flareTop = deg(Math.atan2(dot3(dU, Z), Math.abs(dot3(dU, neg3(back))) + 1e-9));
  return {
    joints,
    frames: {
      upperArm: { from: S, to: E, anterior: unit3(cross3(dU, eFlex)), lateral: unit3(cross3(dU, cross3(Z, dU))) },
      forearm: { from: E, to: hand, anterior: unit3(cross3(dF, eFlex)), lateral: unit3(cross3(dF, cross3(Z, dF))) },
      trunk: { from: pelvis, to: add3(pelvis, back, L.trunk), anterior: belly, lateral: Z },
      ...(legs ? { thigh: { from: legs.H, to: legs.K, anterior: belly, lateral: Z } } : {}),
    },
    moments: { shoulder: Msh, elbow: Mel },
    balance,
    scene,
    forces: [{ at: hand, dir: unit3(onHand.f) }, { at: mirror(hand), dir: mirror(unit3(onHand.f)) }],
    parts: { hand, S, E },
    info: [{ text: `Elbows ${Math.round(Math.abs(flareTop))}° out from the trunk (front view of the upper arm).` },
      ...(P.chestPad ? [{ text: "The pad carries the trunk, so the hips and lower back don't have to hold it (hip torque shown as zero)." }] : []),
      ...info],
  };
}

// ---------- pulling from overhead ----------

/**
 * Lat pulldown and pull-up (driver: pull, 0 = arms straight overhead, 100 = bar at the chest).
 * In the trunk's frame the hands move in a straight line from overhead (along the trunk, `gripHalf`
 * from the midline) to `touchFront` in front of and `touchUp` above the shoulder line.
 * - Pulldown (`hang` not set): seated, trunk leaning back `lean` degrees; each hand is pulled
 *   towards the pulley above with half the stack. The hip holds the trunk (per side).
 * - Pull-up (`hang: true`): the bar holds the body up; each hand gets half of body + added load,
 *   straight up. The body hangs still, so it leans until its centre of mass is under the bar.
 * Elbows "under the bar" (`elbowOut: "auto"`, closest to the pull's line) or at a set sideways
 * offset from the hands. Shoulder components in the trunk's frame: extension (about the
 * side-to-side axis), adduction (about the front-to-back axis) and rotation. Per arm.
 */
export function pull3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const L = body.lengths, m = body.mass, c = body.com;
  const P = { elbowOut: "auto", lean: 0, touchUp: 0.05, ...v.params, ...placement };
  const reach = (L.upperArm + L.forearm) * 0.985;
  const hipY = 0.5; // pulldown seat height
  const armKg = (m.upperArm + m.forearmHand) * kg;
  const build = (lean, origin, swing = 0) => {
    const up = v3(-Math.sin(lean), Math.cos(lean), 0), front = v3(Math.cos(lean), Math.sin(lean), 0);
    const pelvis = origin;
    const mid = add3(pelvis, up, L.trunk);
    // Shoulder blades (slider scapTravel, default 0): raised by half the travel with the arms
    // overhead at the start, pulled down by half at the end ("packing" the shoulders).
    const travel = P.scapTravel ?? 0;
    const S = add3(add3(mid, up, travel * (0.5 - x / 100)), Z, L.shoulderHalfWidth);
    const dz = P.gripHalf - L.shoulderHalfWidth;
    const start = add3(add3(add3(mid, up, travel / 2), Z, P.gripHalf), up, Math.sqrt(Math.max(0, reach * reach - dz * dz)));
    const end = add3(add3(add3(mid, Z, P.gripHalf), front, P.touchFront), up, P.touchUp);
    // Straight from overhead to the chest in the trunk's frame, bowed forward by `swing` (m) mid-pull:
    // the body swinging behind the bar, as hanging lifters do.
    const hand = add3(lerp3(start, end, x / 100), front, swing * Math.sin((Math.PI * x) / 100));
    return { up, front, pelvis, mid, S, start, end, hand };
  };
  // Hanging: the legs may come forward of the trunk by `pike` (radians; hip flexion with straight
  // legs). The body leans (about the hands) so the centre of mass hangs under the bar; bringing the
  // legs forward lets the trunk lean back, the shoulders sit behind the bar and the forearms stand
  // more upright, at the cost of the hip flexors holding the legs. P.pike = "auto" (default)
  // picks the least-effort pike over every joint, hip included (static optimisation).
  const legDir = (bb, pike) => add3(add3(v3(0, 0, 0), bb.up, -Math.cos(pike)), bb.front, Math.sin(pike));
  const legsKg = 2 * (m.thigh + m.shank + m.foot) * kg;
  const solve = (pike, swing = 0) => {
  let B, lean = rad(P.lean), F, pullDir, ok = true;
  if (P.hang) {
    // Lean (about the hands) so that the centre of mass is under the bar.
    F = ((kg + loadKg) * G) / 2;
    pullDir = UP;
    const comX = (bb) => {
      const legsAt = add3(bb.pelvis, legDir(bb, pike), 0.45 * (L.thigh + L.shank));
      const items = [[add3(bb.pelvis, bb.up, c.headTrunk * L.trunk), m.headTrunk * kg], [legsAt, legsKg],
        [lerp3(bb.S, bb.hand, 0.45), 2 * armKg], [bb.pelvis, loadKg]];
      return items.reduce((t, [p, k]) => t + p.x * k, 0) / items.reduce((t, [, k]) => t + k, 0) - bb.hand.x;
    };
    const sol = bisect((l) => comX(build(l, v3(0, 0, 0), swing)), rad(-40), rad(60));
    lean = sol.t; ok = sol.ok;
    const b0 = build(lean, v3(0, 0, 0), swing);
    B = build(lean, v3(-b0.hand.x, 2.25 - b0.hand.y, 0), swing); // hands on the bar: 2.25 m up, over the origin
  } else {
    F = (loadKg * G) / 2;
    B = build(lean, v3(0, hipY, 0));
    const pulley = v3(B.start.x, B.start.y + 0.6, 0);
    // The cable pulls the bar's middle; the rigid bar passes that direction to each hand.
    pullDir = unit3(sub3(pulley, v3(B.hand.x, B.hand.y, 0)));
    B.pulley = pulley;
  }
  const { S, hand, up, front, pelvis } = B;
  const onHand = { at: hand, f: v3(pullDir.x * F, pullDir.y * F, pullDir.z * F) };
  const { E } = P.elbowOut === "auto"
    ? elbowNearestUnder(S, hand, L.upperArm, L.forearm, pullDir)
    : elbowUnderHand(S, hand, L.upperArm, L.forearm, P.elbowOut, neg3(front)); // elbows in front of the shoulder–hand line: no side flips
  const upperW = weight(lerp3(S, E, c.upperArm), m.upperArm * kg);
  const foreW = weight(lerp3(E, hand, c.forearmHand), m.forearmHand * kg);
  const Msh = moment3(S, [upperW, foreW, onHand]);
  const Mel = moment3(E, [foreW, onHand]);
  const dU = unit3(sub3(E, S)), dF = unit3(sub3(hand, E));
  const eFlex = unit3(cross3(dU, dF)), eSide = unit3(cross3(eFlex, dF));
  const elev = angleBetween3(dU, neg3(up));
  const line = { at: hand, dir: unit3(onHand.f) };
  const joints = {
    "shoulder-ext": { at: S, angle: elev, torque: dot3(Msh, Z), ...toLine(S, line.at, line.dir) },
    "shoulder-add": { at: S, angle: elev, torque: -dot3(Msh, front) },
    "shoulder-rotation": { at: S, angle: elev, torque: -dot3(Msh, dU) },
    elbow: { at: E, angle: angleBetween3(dU, dF), shoulderAngle: elev, torque: -dot3(Mel, eFlex), ...toLine(E, line.at, line.dir) },
    "elbow-side": { at: E, angle: angleBetween3(dU, dF), torque: dot3(Mel, eSide) },
  };
  const H = add3(pelvis, Z, L.hipHalfWidth);
  if (P.hang) {
    // One leg held forward of the trunk: its weight about the hip, held by the hip flexors (−).
    const legAt = add3(H, legDir(B, pike), 0.45 * (L.thigh + L.shank));
    const legW = (legsKg / 2) * G;
    const Mh = -legW * (legAt.x - H.x); // legs in front of the hip: − (the hip flexors hold them)
    joints.hip = { at: H, angle: deg(pike), torque: Mh };
  }
  if (!P.hang) {
    const trunkW = weight(add3(pelvis, up, c.headTrunk * L.trunk), (m.headTrunk * kg) / 2);
    const above = [trunkW, upperW, foreW, onHand];
    const Mh = moment3(v3(pelvis.x, pelvis.y, 0), above);
    const R = above.reduce((t, { f }) => add3(t, f), v3(0, 0, 0)), R2 = R.x * R.x + R.y * R.y;
    joints.hip = { at: H, angle: 90 + deg(Math.asin(-up.x)), torque: -Mh.z, momentArm: Math.abs(Mh.z) / Math.sqrt(R2), foot: v3(H.x + (Mh.z / R2) * R.y, H.y - (Mh.z / R2) * R.x, H.z) };
  }

  const scene = [];
  const head = add3(add3(pelvis, up, L.trunk), up, 0.22);
  if (P.hang) {
    const K = add3(H, legDir(B, pike), L.thigh), A = add3(K, legDir(B, pike), L.shank);
    scene.push(...legPrims(H, K, A, add3(A, front, -L.heel), add3(A, front, L.footFront)),
      L3(v3(hand.x, hand.y + 0.02, -0.7), v3(hand.x, hand.y + 0.02, 0.7), 0.035, "equipment"),
      L3(v3(hand.x, hand.y + 0.02, -0.7), v3(hand.x, 0, -0.7), 0.04, "equipment"), L3(v3(hand.x, hand.y + 0.02, 0.7), v3(hand.x, 0, 0.7), 0.04, "equipment"));
  } else {
    const K = add3(H, v3(1, 0, 0), L.thigh), A = add3(K, DOWN, L.shank - L.ankleHeight);
    scene.push({ kind: "poly", pts: [[-0.6, -0.6], [0.9, -0.6], [0.9, 0.6], [-0.6, 0.6]].map(([px, pz]) => v3(px, 0, pz)), cls: "floor3d" },
      ...legPrims(H, K, A, add3(v3(A.x, 0.01, A.z), v3(1, 0, 0), -L.heel), add3(v3(A.x, 0.01, A.z), v3(1, 0, 0), L.footFront)),
      { kind: "poly", pts: [[-0.2, -0.2], [0.25, -0.2], [0.25, 0.2], [-0.2, 0.2]].map(([px, pz]) => v3(px, hipY - 0.07, pz)), cls: "plate3d bench3d" },
      L3(v3(0, hipY - 0.07, 0), v3(0, 0, 0), 0.04, "equipment"), L3(v3(K.x - 0.05, K.y + 0.1, -0.25), v3(K.x - 0.05, K.y + 0.1, 0.25), 0.06, "equipment"),
      L3(v3(hand.x, hand.y, -P.gripHalf - 0.12), v3(hand.x, hand.y, P.gripHalf + 0.12), 0.03, "equipment"), L3(v3(hand.x, hand.y, 0), B.pulley, 0.008, "cable"),
      L3(B.pulley, v3(0.95, B.pulley.y, 0), 0.05, "equipment"), L3(v3(0.95, B.pulley.y, 0), v3(0.95, 0, 0), 0.06, "equipment"));
  }
  scene.push(L3(pelvis, add3(pelvis, up, L.trunk), 0.3, "body"), dot(head, 0.11, "body"), L3(mirror(S), S, 0.12, "body"),
    L3(S, E, 0.07, "body"), L3(E, hand, 0.06, "body"), L3(mirror(S), mirror(E), 0.07, "body back"), L3(mirror(E), mirror(hand), 0.06, "body back"),
    { kind: "line", a: B.start, b: B.end, w: 0.006, cls: "line-of-action" });
  return {
    joints,
    frames: {
      upperArm: { from: S, to: E, anterior: unit3(cross3(dU, eFlex)), lateral: unit3(cross3(dU, cross3(Z, dU))) },
      forearm: { from: E, to: hand, anterior: unit3(cross3(dF, eFlex)), lateral: unit3(cross3(dF, cross3(Z, dF))) },
      trunk: { from: pelvis, to: add3(pelvis, up, L.trunk), anterior: front, lateral: Z },
    },
    moments: { shoulder: Msh, elbow: Mel },
    scene,
    forces: [{ at: hand, dir: unit3(onHand.f) }, { at: mirror(hand), dir: mirror(unit3(onHand.f)) }],
    parts: { hand, S, E, lean: deg(lean), F },
    info: [{ text: `Trunk leaning back ${Math.round(-deg(Math.asin(up.x)))}°${P.hang ? ` (so the centre of mass hangs under the bar), legs ${Math.round(deg(pike))}° forward of the trunk${(P.pike ?? "auto") === "auto" ? " (least effort)" : ""}` : ""}; upper arm raised ${Math.round(elev)}° from the side.` },
      ...(P.hang && swing > 0.005 ? [{ text: `The body swings ${Math.round(swing * 100)} cm behind the bar mid-pull${(P.swing ?? "auto") === "auto" ? " (least effort)" : ""}, keeping the forearms more upright.` }] : []),
      ...(ok ? [] : [{ warn: true, text: "No lean puts the centre of mass under the bar here." }])],
  };
  };
  if (!P.hang) return solve(0, 0);
  // Hanging: how far the legs come forward and how far the body swings behind the bar are the
  // lifter's choice; "auto" takes the least-effort pair (grid, then a finer grid around the best).
  const autoPike = (P.pike ?? "auto") === "auto", autoSwing = (P.swing ?? "auto") === "auto";
  const pikes = (lo, hi, n) => (autoPike ? Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n) : [rad(+P.pike || 0)]);
  const swings = (lo, hi, n) => (autoSwing ? Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n) : [+P.swing || 0]);
  let best = null;
  const tryAll = (ps, ss) => { for (const pk of ps) for (const sw of ss) { const c = effortCost(ex, solve(pk, sw).joints, v); if (!best || c < best.c) best = { c, pk, sw }; } };
  tryAll(pikes(0, rad(60), 4), swings(0, 0.3, 4));
  tryAll(pikes(Math.max(0, best.pk - rad(10)), Math.min(rad(60), best.pk + rad(10)), 2), swings(Math.max(0, best.sw - 0.04), Math.min(0.3, best.sw + 0.04), 4));
  return solve(best.pk, best.sw);
}
