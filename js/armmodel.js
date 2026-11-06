// Shoulder and arm muscles drawn along their paths in the Stanford-VA upper limb model (Holzbaur
// et al. 2005, BSD licence), for the 3D arm lifts. data/opensim/arm-paths.json
// (tools/simm_arm_paths.py) holds each right-arm muscle's points on the thorax (with the
// collarbone and shoulder blade, tabulated by shoulder elevation as they follow the arm), the
// humerus or the forearm, in that bone's axes; here they are carried onto the solver's upper arm,
// forearm and trunk, scaled by the upper arm's length. Display only: the statics and activations
// stay the app's; each model muscle is shaded by the exercise muscle it belongs to
// (ARM_MAP, plus the exercise's `armModel.map`). Paths wrap over the model's ellipsoids,
// spheres and cylinders (deltoids over the humeral head, triceps and biceps over the elbow ...).

import { v3, add3 as add, sub3 as sub, dot3 as dot, cross3 as cross, len3 as len, unit3 as unit } from "./multijoint3d.js";
import { wrapOverCylinder, wrapOverEllipsoid } from "./wrap.js";

const deg = (r) => (r * 180) / Math.PI;
const angle = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))));
const perp = (v, n) => add(v, n, -dot(v, n));

/** Multilinear lookup in a table over the grids of `by` (nested, first coordinate outermost). */
function lookup(grid, by, grids, q) {
  if (!by.length) return grid;
  const xs = grids[by[0]], x = Math.max(xs[0], Math.min(xs[xs.length - 1], q[by[0]] ?? 0));
  let i = xs.findIndex((v) => v >= x);
  if (i <= 0) return lookup(grid[0], by.slice(1), grids, q);
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  const a = lookup(grid[i - 1], by.slice(1), grids, q), b = lookup(grid[i], by.slice(1), grids, q);
  return a.map((v, k) => v + (b[k] - v) * t);
}

/**
 * The solver's bones as frames like the model's: origin, axes (x forward, y along the bone towards
 * its upper joint, z the elbow's axis), and the joint angles the tables need. Null when a frame is
 * missing.
 */
export function armBones(frames, { proSup = 0, shoulderRot = 0 } = {}) {
  const { trunk, upperArm, forearm } = frames ?? {};
  if (!trunk || !upperArm || !forearm) return null;
  const S = upperArm.from, E = upperArm.to, W = forearm.to;
  const dU = unit(sub(E, S)), dF = unit(sub(W, E));
  const yT = unit(sub(trunk.to, trunk.from));
  // The trunk's forward (`forward`, else the solver's `anterior`), or from the side-to-side axis (z, to the right).
  const zHint = trunk.right ?? v3(0, 0, 1);
  const fwd = trunk.forward ?? trunk.anterior;
  const xT = fwd ? unit(perp(fwd, yT)) : unit(cross(yT, zHint));
  const thorax = { o: S, x: xT, y: yT, z: cross(xT, yT) };
  // The elbow's axis: across the bend (upper arm × forearm), pointing to the right for a right arm
  // bending forward. Nearly straight, the arm's front (`anterior`, the biceps' side) gives it.
  const yH = v3(-dU.x, -dU.y, -dU.z);
  const bend = cross(dU, dF);
  let zH;
  if (len(bend) > 0.17) zH = unit(perp(bend, yH));
  else zH = unit(cross(unit(perp(upperArm.anterior ?? thorax.x, yH)), yH));
  const humerus = { o: S, x: cross(yH, zH), y: yH, z: zH };
  const yU = v3(-dF.x, -dF.y, -dF.z), zU = unit(perp(zH, yU));
  const ulna = { o: E, x: cross(yU, zU), y: yU, z: zU };
  return {
    bones: { thorax, humerus, ulna },
    q: { shoulder_elv: angle(dU, v3(-yT.x, -yT.y, -yT.z)), elbow_flexion: Math.min(130, angle(dU, dF)), pro_sup: proSup, shoulder_rot: shoulderRot },
  };
}

/**
 * The right arm's model muscles as polylines in the solver's frame: [{ name, fmax, pts }]. Needs
 * frames.trunk, upperArm (shoulder → elbow) and forearm (elbow → hand); `proSup` is the forearm's
 * rotation (−90 supinated, 0 neutral, 90 pronated). Null if a frame is missing.
 */
export function armMusclePaths(data, frames, opts = {}) {
  const set = armBones(frames, opts);
  if (!data || !set) return null;
  const { bones, q } = set;
  const s = len(sub(frames.upperArm.to, frames.upperArm.from)) / data.lengths.humerus;
  const place = (b, p) => add(add(add(b.o, b.x, p[0] * s), b.y, p[1] * s), b.z, p[2] * s);
  const turn = (b, p) => add(add(add(v3(0, 0, 0), b.x, p[0]), b.y, p[1]), b.z, p[2]);
  const value = (e) => (e.by ? lookup(e.grid, e.by, data.grids, q) : e.p ?? e.cax);
  const surf = {};
  const surface = (name) => {
    if (name in surf) return surf[name];
    const w = data.wraps[name];
    if (!w) return (surf[name] = null);
    const b = bones[w.bone], v = value(w);
    const c = place(b, v.slice(0, 3)), ax = [0, 1, 2].map((i) => unit(turn(b, v.slice(3 + 3 * i, 6 + 3 * i))));
    const radii = (Array.isArray(w.radius) ? w.radius : [w.radius, w.radius, w.radius]).map((r) => r * s);
    return (surf[name] = { type: w.type, c, ax, radii, quadrant: w.quadrant });
  };
  const wrapOne = (a, b, w) => (w.type === "cylinder"
    ? wrapOverCylinder(a, b, { c: w.c, ax: w.ax, r: w.radii[0], quadrant: w.quadrant && (w.quadrant.length === 1 ? `+${w.quadrant}` : w.quadrant) })
    : wrapOverEllipsoid(a, b, w, w.quadrant));
  return Object.entries(data.muscles).map(([name, m]) => {
    // Points outside their range (`when`: a joint angle's span) drop out, as in SIMM.
    const kept = m.points.map((e, i) => ({ e, i: i + 1 })).filter(({ e }) => !e.when || (q[e.when[0]] >= e.when[1] && q[e.when[0]] <= e.when[2]));
    let pts = kept.map(({ e }) => place(bones[e.bone], value(e)));
    let idx = kept.map(({ i }) => i); // the original point numbers (wrap ranges count them); inserted points: NaN
    for (const wr of m.wraps ?? []) {
      const w = surface(wr.name);
      if (!w) continue;
      for (let i = 1; i < pts.length; i++) {
        if (wr.range) {
          const lo = idx.slice(0, i).filter((v) => !Number.isNaN(v)).pop(), hi = idx.slice(i).find((v) => !Number.isNaN(v));
          if (lo < wr.range[0] || hi > wr.range[1]) continue;
        }
        const extra = wrapOne(pts[i - 1], pts[i], w);
        if (extra) {
          pts = [...pts.slice(0, i), ...extra, ...pts.slice(i)];
          idx = [...idx.slice(0, i), ...extra.map(() => NaN), ...idx.slice(i)];
          break;
        }
      }
    }
    return { name, fmax: m.fmax, pts };
  });
}

/** Exercise muscle → model muscles; an exercise's `armModel.map` adds to or overrides these. */
export const ARM_MAP = {
  "anterior-deltoid": ["DELT1"],
  "lateral-deltoid": ["DELT2"],
  "posterior-deltoid": ["DELT3"],
  supraspinatus: ["SUPSP"],
  "rotator-cuff-ext": ["INFSP", "TMIN"],
  subscapularis: ["SUBSC"],
  "teres-major": ["TMAJ"],
  pectoralis: ["PECM1", "PECM2", "PECM3"],
  "pec-clavicular": ["PECM1"],
  "pec-sternal": ["PECM2", "PECM3"],
  latissimus: ["LAT1", "LAT2", "LAT3"],
  "latissimus-dorsi": ["LAT1", "LAT2", "LAT3"],
  triceps: ["TRIlong", "TRIlat", "TRImed", "ANC"],
  "triceps-long": ["TRIlong"],
  "triceps-lateral-medial": ["TRIlat", "TRImed"],
  anconeus: ["ANC"],
  biceps: ["BIClong", "BICshort"],
  brachialis: ["BRA"],
  brachioradialis: ["BRD"],
};

/** Forearm rotation (the model's pro_sup: −90 supinated, 0 neutral, 90 pronated) from a variant's grip. */
export function proSupOf(exercise, variant) {
  const own = exercise.armModel?.proSup;
  if (typeof own === "number") return own;
  if (own && variant.id in own) return own[variant.id];
  return { supinated: -90, neutral: 0, hammer: 0, pronated: 90 }[variant.grip3d] ?? own?.default ?? 90;
}

/** Readable names for the model's muscles (titles in the figure). */
export const ARM_MUSCLE_NAMES = {
  DELT1: "anterior deltoid", DELT2: "lateral deltoid", DELT3: "posterior deltoid", SUPSP: "supraspinatus", INFSP: "infraspinatus",
  SUBSC: "subscapularis", TMIN: "teres minor", TMAJ: "teres major", PECM1: "pectoralis major (clavicular)", PECM2: "pectoralis major (sternal)",
  PECM3: "pectoralis major (lower ribs)", LAT1: "latissimus dorsi (upper)", LAT2: "latissimus dorsi (middle)", LAT3: "latissimus dorsi (lower)",
  CORB: "coracobrachialis", TRIlong: "triceps (long head)", TRIlat: "triceps (lateral head)", TRImed: "triceps (medial head)", ANC: "anconeus",
  SUP: "supinator", BIClong: "biceps (long head)", BICshort: "biceps (short head)", BRA: "brachialis", BRD: "brachioradialis",
  ECRL: "extensor carpi radialis longus", ECRB: "extensor carpi radialis brevis", ECU: "extensor carpi ulnaris", FCR: "flexor carpi radialis",
  FCU: "flexor carpi ulnaris", PL: "palmaris longus", PT: "pronator teres",
};
