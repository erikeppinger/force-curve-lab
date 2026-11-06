// Leg muscles drawn along their paths in the Rajagopal et al. 2016 model (MIT licence), for the
// 3D leg lifts. data/opensim/leg-paths.json (tools/opensim_leg_paths.py) holds each right-leg
// muscle's path points relative to its segment's joint centre, in the model's axes (x forward,
// y up, z to the right); here they are carried onto the solver's segments (frames.trunk for the
// pelvis, thigh, shank, foot), scaled to the app's thigh and shank lengths. Display only: the
// statics and the activations stay the app's; each model muscle is shaded by the activation of
// the exercise muscle it belongs to (`legModel.map` in the exercise's JSON). Paths wrap over the
// model's cylinders (gluteus maximus over the pelvis, calves and hamstrings over the knee ...).

import { v3, add3 as add, sub3 as sub, dot3 as dot, cross3 as cross, len3 as len, unit3 as unit } from "./multijoint3d.js";
import { wrapOverCylinder } from "./wrap.js";

const Z = v3(0, 0, 1);
const FOOT_FWD = 0.86; // the app's toe tips (0.16 m) over the model's (0.186 m) in front of the ankle

/** Axes (x forward, y along the segment towards its upper joint, z to the right) from y and a hint for z. */
function axes(y, zHint) {
  const z = unit(add(zHint, y, -dot(zHint, y)));
  return { x: cross(y, z), y, z };
}
const place = (o, ax, p, s = 1) => add(add(add(o, ax.x, p[0] * s), ax.y, p[1] * s), ax.z, p[2] * s);

/** Linear interpolation in a kneecap track ([angle, x, y, z] rows) at a knee flexion angle. */
function track(rows, deg) {
  const a = Math.max(rows[0][0], Math.min(rows[rows.length - 1][0], deg));
  let i = rows.findIndex((r) => r[0] >= a);
  if (i <= 0) return rows[0].slice(1);
  const [r0, r1] = [rows[i - 1], rows[i]], t = (a - r0[0]) / (r1[0] - r0[0]);
  return [1, 2, 3].map((k) => r0[k] + (r1[k] - r0[k]) * t);
}

/**
 * The right leg's model muscles as polylines in the solver's frame: [{ name, fmax, pts }]. Needs
 * frames.trunk (pelvis → shoulders), thigh (hip → knee), shank (knee → ankle) and foot (ankle →
 * toes); null if one is missing.
 */
export function legMusclePaths(data, frames) {
  const { trunk, thigh, shank, foot } = frames ?? {};
  if (!data || !trunk || !thigh || !shank || !foot) return null;
  const H = thigh.from, K = thigh.to, A = shank.to;
  const dT = unit(sub(K, H)), dS = unit(sub(A, K));
  // The knee's bending axis points to the left for a right leg bending normally (cross(thigh,
  // shank) = −z); nearly straight, fall back to the body's side-to-side axis.
  const c = cross(dT, dS);
  const zLeg = len(c) > 0.05 ? unit(v3(-c.x, -c.y, -c.z)) : Z;
  const kneeDeg = (Math.acos(Math.max(-1, Math.min(1, dot(dT, dS)))) * 180) / Math.PI;
  const pelvis = axes(unit(sub(trunk.to, trunk.from)), Z);
  const femur = axes(v3(-dT.x, -dT.y, -dT.z), zLeg), tibia = axes(v3(-dS.x, -dS.y, -dS.z), zLeg);
  const fwd = unit(sub(foot.to, foot.from));
  const shinUp = v3(-dS.x, -dS.y, -dS.z), up = unit(add(shinUp, fwd, -dot(shinUp, fwd)));
  const footAx = { x: fwd, y: up, z: cross(fwd, up) };
  const sT = len(sub(K, H)) / data.lengths.femur, sS = len(sub(A, K)) / data.lengths.tibia;
  const at = (q) => {
    switch (q.seg) {
      case "pelvis": return place(H, pelvis, q.p);
      case "femur": return place(H, femur, q.p, sT);
      case "tibia": return place(K, tibia, q.p, sS);
      case "patella": return place(K, tibia, track(q.track, kneeDeg), sS);
      // Talus, calcaneus, toes: the model's toe tips reach 19 cm in front of the ankle, the app's
      // foot about 16 cm (ball 14 cm + toes), so the forward offsets shrink to fit.
      default: return place(A, footAx, [q.p[0] * (q.p[0] > 0 ? FOOT_FWD : 1), q.p[1], q.p[2]]);
    }
  };
  // Wrapping cylinders carried onto their segment like the points: centre, axes, scaled radius.
  const seg = { pelvis: [H, pelvis, 1], femur: [H, femur, sT], tibia: [K, tibia, sS] };
  const turn = (ax, v) => place(v3(0, 0, 0), ax, v);
  const cyl = Object.fromEntries(Object.entries(data.wraps ?? {}).map(([n, w]) => {
    const [o, ax, sc] = seg[w.seg];
    return [n, { c: place(o, ax, w.c, sc), ax: w.axes.map((v) => turn(ax, v)), r: w.radius * sc, quadrant: w.quadrant }];
  }));
  return Object.entries(data.muscles).map(([name, m]) => {
    let pts = m.points.map(at);
    for (const wn of m.wraps ?? []) {
      const w = cyl[wn];
      if (!w) continue;
      for (let i = 1; i < pts.length; i++) {
        const extra = wrapOverCylinder(pts[i - 1], pts[i], w);
        if (extra) { pts = [...pts.slice(0, i), ...extra, ...pts.slice(i)]; break; }
      }
    }
    return { name, fmax: m.fmax, pts };
  });
}

/**
 * Exercise muscle → model muscles (without the "_r"), unless the exercise's `legModel.map` says
 * otherwise. The model has no pectineus, obturators, gemelli or quadratus femoris: the deep
 * external rotators show as the piriformis.
 */
export const LEG_MAP = {
  quadriceps: ["vasint", "vaslat", "vasmed", "recfem"],
  hamstrings: ["bflh", "bfsh", "semimem", "semiten"],
  "gluteus-maximus": ["glmax1", "glmax2", "glmax3"],
  "adductor-magnus": ["addmagDist", "addmagIsch", "addmagMid", "addmagProx"],
  adductors: ["addbrev", "addlong", "grac"],
  "gluteus-medius": ["glmed1", "glmed2", "glmed3", "glmin1", "glmin2", "glmin3"],
  "external-rotators": ["piri"],
  calves: ["gasmed", "gaslat", "soleus"],
  "hip-flexors": ["iliacus", "psoas"],
};

/** Readable names for the model's muscles (titles in the figure). */
export const LEG_MUSCLE_NAMES = {
  addbrev: "adductor brevis", addlong: "adductor longus", addmagDist: "adductor magnus (distal)", addmagIsch: "adductor magnus (ischial)",
  addmagMid: "adductor magnus (middle)", addmagProx: "adductor magnus (proximal)", bflh: "biceps femoris (long head)", bfsh: "biceps femoris (short head)",
  edl: "extensor digitorum longus", ehl: "extensor hallucis longus", fdl: "flexor digitorum longus", fhl: "flexor hallucis longus",
  gaslat: "lateral gastrocnemius", gasmed: "medial gastrocnemius", glmax1: "gluteus maximus (upper)", glmax2: "gluteus maximus (middle)",
  glmax3: "gluteus maximus (lower)", glmed1: "gluteus medius (front)", glmed2: "gluteus medius (middle)", glmed3: "gluteus medius (back)",
  glmin1: "gluteus minimus (front)", glmin2: "gluteus minimus (middle)", glmin3: "gluteus minimus (back)", grac: "gracilis",
  iliacus: "iliacus", perbrev: "peroneus brevis", perlong: "peroneus longus", piri: "piriformis", psoas: "psoas", recfem: "rectus femoris",
  sart: "sartorius", semimem: "semimembranosus", semiten: "semitendinosus", soleus: "soleus", tfl: "tensor fasciae latae",
  tibant: "tibialis anterior", tibpost: "tibialis posterior", vasint: "vastus intermedius", vaslat: "vastus lateralis", vasmed: "vastus medialis",
};
