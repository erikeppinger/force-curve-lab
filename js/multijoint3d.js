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
    return [L3(t(H), t(K), 0.14, cls), L3(t(K), t(A), 0.1, cls), L3(t(heel), t(toes), 0.06, cls)];
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
    return { H, K, tilt: Math.atan2(s.x * f.x + s.z * f.z, s.y) };
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
    const legsY = (2 * kg * (m.thigh * lerp3(K, H, c.thigh).y + m.shank * lerp3(A, K, c.shank).y + m.foot * L.ankleHeight / 2)) / legsKg;
    const comY = (legsKg * legsY + m.headTrunk * kg * trunkCom.y + armsKg * armCom.y + loadKg * bar.y) / total;
    return { back, S, bar, trunkCom, armCom, comX, comY, total };
  };
  let tlo = rad(-20), thi = rad(89);
  const ok = (upper(tlo).comX - balanceX) * (upper(thi).comX - balanceX) <= 0;
  for (let i = 0; i < 60; i++) { const mid = (tlo + thi) / 2; if (upper(mid).comX < balanceX) tlo = mid; else thi = mid; }
  const U = upper((tlo + thi) / 2);

  // Per leg, from the foot up: floor push W/2 at the mid-foot, then segment weights.
  const cop = add3(v3(A.x, 0, A.z), f, L.midfoot);
  const Fy = (U.total * G) / 2;
  const footW = weight(add3(A, f, L.midfoot), m.foot * kg);
  const shankW = weight(lerp3(A, K, c.shank), m.shank * kg);
  const thighW = weight(lerp3(K, H, c.thigh), m.thigh * kg);
  const solveAt = (ratio) => {
    const grf = { at: cop, f: v3(0, Fy, -ratio * Fy) }; // + ratio: floor pushes the right foot inwards
    const dir = unit3(grf.f);
    const Mankle = moment3(A, [grf, footW]);
    const Mknee = moment3(K, [grf, footW, shankW]);
    const Mhip = moment3(H, [grf, footW, shankW, thighW]);
    return { grf, dir, Mhip, Mknee, Mankle, ...legComponents({ H, K, A, f, back: U.back, Mhip, Mknee, Mankle, knee: x, line: { at: cop, dir } }) };
  };
  // Static optimisation over the sideways push: least sum of squared efforts (muscle groups only).
  const cost = (ratio) => {
    const js = solveAt(ratio).joints;
    return ex.joints.filter((j) => !j.passive).reduce((sum, j) => {
      const t = js[j.id].torque;
      const cap = interp(j.strength.points, js[j.id].angle) * (t < 0 && j.negative ? j.negative.peakTorqueNm : j.peakTorqueNm);
      return sum + (t < 0 && !j.negative ? 0 : (t / cap) ** 2);
    }, 0);
  };
  let ratio = P.sidePush;
  if (ratio === "auto" || ratio == null) {
    let a = -0.6, b = 0.6;
    for (let i = 0; i < 60; i++) {
      const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
      if (cost(m1) < cost(m2)) b = m2; else a = m1;
    }
    ratio = (a + b) / 2;
  }
  const { grf, dir, Mhip, Mknee, Mankle, joints, frames } = solveAt(ratio);

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
    info: ok ? [{ text: `Feet push ${ratio >= 0 ? "outwards" : "inwards"} against the floor with ${Math.round(Math.abs(ratio) * 100)}% of the vertical force${P.sidePush === "auto" || P.sidePush == null ? " (least-effort estimate)" : ""}.` }] : [{ warn: true, text: "Can't balance: no trunk angle keeps the centre of mass over the mid-foot here." }],
  };
}

/**
 * Elbow on the circle of positions that fit both arm segments, chosen so that in the front view
 * it sits `offsetZ` outside (+) or inside (−) the hand ("elbows stacked under the bar" = 0), and
 * below the hand. Returns the closest point if the offset can't be reached.
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
  cands.sort((a, b) => dot3(a, front) - dot3(b, front)); // the lowest (towards the floor) first
  return { E: cands[0], ok: true };
}

/**
 * Bench press (driver: bar height, 0 = on the chest, 100 = arms locked out). Shoulders fixed on
 * the bench; both hands on a rigid bar at the grip width; the bar moves in a straight line from
 * the touch point to lockout over the shoulders. The elbow is placed relative to the hand in
 * the front view (elbowOut: + outside, − inside; see elbowUnderHand); the flare angle follows.
 * Each hand pushes straight up with half the bar (no sideways pull on it).
 */
export function bench3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const P = { ...v.params, ...placement };
  const L = body.lengths, m = body.mass, c = body.com;
  const t = rad(P.incline ?? 0); // head end raised
  const rot = (p) => v3(p.x * Math.cos(t) + p.y * Math.sin(t), -p.x * Math.sin(t) + p.y * Math.cos(t), p.z);
  const mid = v3(0, 0.6, 0);
  const S = add3(mid, Z, L.shoulderHalfWidth);
  const toFeet = rot(v3(1, 0, 0)), front = rot(UP);
  const dz = P.gripHalf - L.shoulderHalfWidth;
  const reach = Math.sqrt(Math.max(0, (L.upperArm + L.forearm) ** 2 - dz * dz)) * 0.985;
  const touch = add3(mid, rot(v3(P.touch, L.chestDepth, 0)));
  const lockout = add3(mid, UP, reach);
  const k = x / 100;
  const hand = v3(touch.x + (lockout.x - touch.x) * k, touch.y + (lockout.y - touch.y) * k, P.gripHalf);
  const { E, ok } = elbowUnderHand(S, hand, L.upperArm, L.forearm, P.elbowOut, front);

  const bar = { at: hand, f: v3(0, (-loadKg * G) / 2, 0) };
  const foreW = weight(lerp3(E, hand, c.forearmHand), m.forearmHand * kg);
  const upperW = weight(lerp3(S, E, c.upperArm), m.upperArm * kg);
  const Mel = moment3(E, [bar, foreW]);
  const Msh = moment3(S, [bar, foreW, upperW]);
  const dU = unit3(sub3(E, S)), dF = unit3(sub3(hand, E));
  const eFlex = unit3(cross3(dU, dF)); // elbow flexion axis
  const eSide = unit3(cross3(eFlex, dF)); // turning about it moves the hand inwards
  const horizAdd = deg(Math.atan2(dot3(dU, front), dot3(dU, Z))); // 0 = out to the side, 90 = up
  const elbowFlex = angleBetween3(dU, dF);
  const flare = deg(Math.atan2(dot3(dU, Z), dot3(dU, toFeet))); // top view: 0 = along the body
  const line = { at: hand, dir: UP };
  const joints = {
    "shoulder-h": { at: S, angle: horizAdd, torque: dot3(Msh, toFeet), ...toLine(S, line.at, line.dir) },
    "shoulder-flex": { at: S, angle: horizAdd, torque: -dot3(Msh, Z) },
    "shoulder-rotation": { at: S, angle: horizAdd, torque: -dot3(Msh, dU) },
    elbow: { at: E, angle: elbowFlex, torque: dot3(Mel, eFlex), ...toLine(E, line.at, line.dir) },
    "elbow-side": { at: E, angle: elbowFlex, torque: dot3(Mel, eSide) },
  };

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
    forces: both(hand).map((at) => ({ at, dir: v3(0, -1, 0) })),
    flare,
    info: [{ text: `Elbow flare (upper arm from the body, seen from above): ${Math.round(flare)}°.` },
      ...(ok ? [] : [{ warn: true, text: "The elbows can't sit that far from the hands at this bar height; shown as close as the arm allows." }])],
  };
}
