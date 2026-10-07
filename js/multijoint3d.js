// 3D statics for lifts where the feet (or hands) leave the side-view plane: stance width,
// toes in or out, knees tracking in or out. First user: the leg press.
//
// World frame: x forward (the way the lifter faces), y up, z to the lifter's right; metres.
// The right leg is analysed; the left is its mirror image. Each joint's moment is split into
// anatomical components (Grood & Suntay-style joint axes, projected with dot products):
//   hip:   extension, adduction (+) / abduction (−), external (+) / internal (−) rotation
//   knee:  extension, valgus (+) / varus (−) — mostly resisted by ligaments, not muscles
//   ankle: plantarflexion
// All values are per leg and positive when that muscle group (or structure) must resist.
// Pure functions only — imported by the browser UI and by node tests.

import { G } from "./physics.js";

export const v3 = (x, y, z) => ({ x, y, z });
export const add3 = (a, b, k = 1) => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
export const sub3 = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len3 = (a) => Math.sqrt(dot3(a, a));
export const unit3 = (a) => { const l = len3(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
const lerp3 = (a, b, t) => add3(a, sub3(b, a), t);
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const angleBetween3 = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, dot3(unit3(a), unit3(b))))));
export const mirror = (p) => v3(p.x, p.y, -p.z);

/** Σ (p − about) × F over point forces: the external moment vector about a point. */
export function moment3(about, forces) {
  return forces.reduce((M, { at, f }) => add3(M, cross3(sub3(at, about), f)), v3(0, 0, 0));
}

/**
 * Leg press in 3D (driver: knee flexion). Hips fixed in the seat, both feet on the plate,
 * which moves along its rail and pushes along the rail (no shear between plate and feet).
 * Placement (per variant, or live from the sliders):
 *   footHeight: how far up the plate the ankles sit, from the hips' line (m)
 *   halfWidth:  each foot's distance from the midline (m)
 *   toeOut:     foot turned out (+) or in (−), degrees
 *   kneeTrack:  knee out (+) or in (−) of the line over the toes, degrees
 * The knee is placed over the toes: in the plane of the hip–ankle line and the foot.
 */
export function legPress3d(ex, v, x, { loadKg, bodyMassKg: kg, body, placement }) {
  const P = { ...v.params, ...placement };
  const L = body.lengths, m = body.mass, c = body.com;
  const hipHalf = L.hipHalfWidth;
  const a = rad(P.railAngle);
  const u = v3(Math.cos(a), Math.sin(a), 0); // rail: away from the seat
  const vp = v3(-Math.sin(a), Math.cos(a), 0); // up the plate
  const Z = v3(0, 0, 1); // the right leg's lateral side
  const mid = v3(0, 0.45, 0);
  const H = add3(mid, Z, hipHalf);

  // Ankle: slide along the rail until hip→ankle matches the knee angle (law of cosines).
  const D = Math.sqrt(L.thigh ** 2 + L.shank ** 2 + 2 * L.thigh * L.shank * Math.cos(rad(x)));
  const dz = P.halfWidth - hipHalf;
  const s2 = D * D - P.footHeight ** 2 - dz * dz;
  const reach = s2 >= 0;
  const A = add3(add3(add3(mid, vp, P.footHeight), Z, P.halfWidth), u, Math.sqrt(Math.max(0, s2)));

  // Knee over the toes, then turned about the hip–ankle line by kneeTrack.
  const toe = rad(P.toeOut);
  const f = unit3(add3(add3(v3(0, 0, 0), vp, Math.cos(toe)), Z, Math.sin(toe))); // heel → toes
  const e = unit3(sub3(A, H));
  let p = unit3(sub3(f, add3(v3(0, 0, 0), e, dot3(f, e))));
  let q = unit3(cross3(e, p));
  if (q.z < 0) q = v3(-q.x, -q.y, -q.z); // q points to the outside
  const k = rad(P.kneeTrack);
  p = unit3(add3(add3(v3(0, 0, 0), p, Math.cos(k)), q, Math.sin(k)));
  const d = Math.min(len3(sub3(A, H)), L.thigh + L.shank - 1e-9);
  const along = (L.thigh ** 2 - L.shank ** 2 + d * d) / (2 * d);
  const K = add3(add3(H, e, along), p, Math.sqrt(Math.max(0, L.thigh ** 2 - along ** 2)));

  // Forces on the leg: the plate's push at the mid-foot, plus segment weights.
  const plate = add3(A, u, L.ankleHeight);
  const cop = add3(plate, f, L.midfoot);
  const Fmag = (loadKg * G * Math.sin(a)) / 2;
  const push = { at: cop, f: add3(v3(0, 0, 0), u, -Fmag) };
  const w = (at, mass) => ({ at, f: v3(0, -mass * G, 0) });
  const footW = w(add3(A, f, L.midfoot), m.foot * kg);
  const shankW = w(lerp3(A, K, c.shank), m.shank * kg);
  const thighW = w(lerp3(K, H, c.thigh), m.thigh * kg);

  const Mhip = moment3(H, [push, footW, shankW, thighW]);
  const Mknee = moment3(K, [push, footW, shankW]);
  const Mankle = moment3(A, [push, footW]);

  // Joint axes (see the header comment for the sign conventions).
  const dT = unit3(sub3(K, H)); // thigh, hip → knee
  const dS = unit3(sub3(A, K)); // shank, knee → ankle
  const eFlex = unit3(cross3(dT, dS)); // knee flexion axis
  const eAbd = unit3(cross3(dT, Z)); // rotating about it moves the knee outwards
  const eValgus = unit3(cross3(eFlex, dS)); // rotating about it moves the ankle outwards
  const eDorsi = unit3(cross3(f, v3(-dS.x, -dS.y, -dS.z))); // toes towards the shin
  const back = v3(-Math.sin(rad(P.backRecline)), Math.cos(rad(P.backRecline)), 0);

  // Line of the plate's push, and each joint's distance from it (for the figure).
  const toLine = (j) => {
    const t = dot3(sub3(j, cop), u);
    const foot = add3(cop, u, t);
    return { foot, momentArm: len3(sub3(j, foot)) };
  };
  const hipFlex = 180 - angleBetween3(back, dT);
  const comps = {
    hip: { at: H, angle: hipFlex, torque: dot3(Mhip, Z), ...toLine(H) },
    knee: { at: K, angle: x, torque: dot3(Mknee, eFlex), ...toLine(K) },
    ankle: { at: A, angle: 90 - angleBetween3(dS, f), torque: dot3(Mankle, eDorsi), ...toLine(A) },
    "hip-frontal": { at: H, angle: hipFlex, torque: dot3(Mhip, eAbd) },
    "hip-rotation": { at: H, angle: hipFlex, torque: -dot3(Mhip, dT) },
    "knee-frontal": { at: K, angle: x, torque: dot3(Mknee, eValgus) },
  };

  const S = add3(mid, back, L.trunk);
  const seatOut = v3(-back.y, back.x, 0); // behind the back rest
  const legs = (side) => {
    const t = side > 0 ? (pt) => pt : mirror;
    return { H: t(H), K: t(K), A: t(A), heel: t(add3(plate, f, -L.heel)), toes: t(add3(plate, f, L.footFront)) };
  };
  const plateCentre = add3(add3(mid, vp, 0.05), u, dot3(sub3(plate, mid), u) + 0.015);
  const plateCorners = [[-0.32, -0.45], [0.38, -0.45], [0.38, 0.45], [-0.32, 0.45]]
    .map(([up, side]) => add3(add3(plateCentre, vp, up), Z, side));
  return {
    joints: comps,
    moments: { hip: Mhip, knee: Mknee, ankle: Mankle },
    pose: { right: legs(1), left: legs(-1), pelvis: [mirror(H), H], trunk: [mid, S], head: add3(S, back, 0.22), cop, mirrorCop: mirror(cop) },
    frames: {
      thigh: { from: H, to: K, anterior: unit3(cross3(dT, eFlex)), lateral: unit3(cross3(dT, cross3(Z, dT))) },
      shank: { from: K, to: A, anterior: unit3(cross3(dS, eFlex)), lateral: unit3(cross3(dS, cross3(Z, dS))) },
    },
    push: { at: cop, dir: v3(-u.x, -u.y, -u.z), Fmag },
    plate: plateCorners,
    rail: [add3(add3(mid, vp, -0.3), u, 0.25), add3(add3(mid, vp, -0.3), u, 1.25)],
    seat: [add3(add3(mid, seatOut, 0.12), back, -0.05), add3(add3(mid, seatOut, 0.12), back, 0.8)],
    angles: { hipAbduction: deg(Math.asin(Math.max(-1, Math.min(1, dT.z)))) },
    info: reach ? [] : [{ warn: true, text: "The feet can't reach the plate at this knee angle with this placement." }],
  };
}
