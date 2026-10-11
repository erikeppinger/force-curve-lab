// 3D figure for a single-joint exercise: the 2D chain (physics.js) placed in its plane on a 3D
// body, so the plane of the movement shows (front raise vs lateral raise, a fly lying vs standing,
// toes in or out). Display only: the statics stay 2D.
//
// exercise.figure3d = { kind: "chain", base: "shoulder" | "knee", plane: "frontal" | "sagittal" |
//   "transverse", both: true (the other limb mirrors the working one), start: "3d" | "2d",
//   yawKey: placement key that turns the plane about the vertical (degrees, + = outwards),
//   cam: { yaw, pitch } the camera to start with }.
// A variant may set `oneSided: true` (the other limb rests) or `yaw3d` (degrees).
// The 2D frame's x and y axes are mapped onto the plane at the base joint of a standing body
// (world: x forward, y up, z to the right, as in multijoint3d.js); then the scene is turned so the
// variant's gravity points down (lying, inclined), and stood on the floor.

import { v3, add3, sub3, dot3, cross3, len3, unit3, mirror } from "./multijoint3d.js";
import { gravityOf } from "./physics.js";

const rad = (d) => (d * Math.PI) / 180;

/** Rotation turning unit vector a onto unit vector b (Rodrigues), as a function of points. */
function turnOnto(a, b, flipAxis) {
  const c = dot3(a, b);
  let axis = cross3(a, b);
  const s = len3(axis);
  if (s < 1e-9) {
    if (c > 0) return (p) => p;
    axis = flipAxis; // opposite: half a turn about an axis normal to both
  }
  const k = unit3(axis), ang = s < 1e-9 ? Math.PI : Math.atan2(s, c);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  return (p) => add3(add3(v3(p.x * cos, p.y * cos, p.z * cos), cross3(k, p), sin), k, dot3(k, p) * (1 - cos));
}

/** Plane axes (world) for the 2D frame's x and y: frontal (x out to the right side, y up), sagittal (x forward, y up), transverse (x out to the side, y forward). */
export function planeAxes(plane, yawDeg = 0) {
  const c = Math.cos(rad(yawDeg)), s = Math.sin(rad(yawDeg));
  if (plane === "sagittal") return { ex: v3(c, 0, s), ey: v3(0, 1, 0) }; // + yaw: toes / hand turned out
  if (plane === "transverse") return { ex: v3(s, 0, c), ey: v3(c, 0, -s) };
  return { ex: v3(s, 0, c), ey: v3(0, 1, 0) }; // frontal; + yaw: the plane turned forwards (scapular plane)
}

/**
 * The hand and what it holds, for a variant's grip3d: "supinated" (palm forward / up, handle across
 * the body), "pronated" (palm back / down) or "neutral" (hammer: palm facing in, handle in the
 * plane of the curl). The palm is drawn on the side it faces; a barbell spans both hands.
 */
function grip(variant, chain, t2, m2, both, { line, dot, dir2, Z, type, angleSense }) {
  const l = Math.hypot(t2.x - m2.x, t2.y - m2.y) || 1;
  const u = { x: (t2.x - m2.x) / l, y: (t2.y - m2.y) / l };
  // The forearm's front (flexor) side: the way it turns when the elbow bends.
  const front = unit3(dir2({ x: -u.y * angleSense, y: u.x * angleSense }));
  const g = variant.grip3d;
  const palm = g === "supinated" ? front : g === "pronated" ? v3(-front.x, -front.y, -front.z) : v3(0, 0, -1);
  const handle = g === "neutral" ? front : Z;
  const bar = /Barbell|EZ/.test(variant.equipment ?? "") && type === "gravity";
  for (const [tip, s] of both ? [[chain[2], 1], [mirror(chain[2]), -1]] : [[chain[2], 1]]) {
    const pm = v3(palm.x, palm.y, palm.z * s), h = v3(handle.x, handle.y, handle.z * s);
    // Palm: a short plate beside the handle on the palm side, along the handle.
    const c = add3(tip, pm, 0.03);
    line(add3(c, h, -0.045), add3(c, h, 0.045), 0.03, "body");
    if (!bar && type === "gravity") {
      line(add3(tip, h, -0.09), add3(tip, h, 0.09), 0.025, "equipment");
      dot(add3(tip, h, -0.1), 0.045, "weight");
      dot(add3(tip, h, 0.1), 0.045, "weight");
    }
  }
  if (bar) {
    const t = chain[2];
    line(v3(t.x, t.y, 0.55), v3(t.x, t.y, -0.55), 0.03, "equipment");
    for (const z of [0.5, -0.5]) dot(v3(t.x, t.y, z), 0.11, "weight");
  }
}

/** Everything to draw (scene3d's input) for one analyze() result. */
export function chainScene3d(ex, variant, result, { activation = [], pulley, body } = {}) {
  const F = ex.figure3d;
  const L = body?.lengths ?? { shank: 0.43, thigh: 0.43, trunk: 0.52, upperArm: 0.3, forearm: 0.33, hipHalfWidth: 0.09, shoulderHalfWidth: 0.19, footFront: 0.14, heel: 0.06 };
  const yaw = Number(variant.yaw3d ?? (F.yawKey ? result.placement?.[F.yawKey] ?? variant.params?.[F.yawKey] ?? 0 : 0));
  const { ex: X, ey: Y } = planeAxes(F.plane, yaw);
  const seated = /seated/.test(variant.posture ?? "");
  // Body points relative to the base joint (right side).
  const base = F.base === "knee" ? v3(0, 0, L.hipHalfWidth) : v3(0, 0, L.shoulderHalfWidth);
  const map2 = (p) => add3(add3(base, X, p.x), Y, p.y);
  const dir2 = (d) => add3(add3(v3(0, 0, 0), X, d.x), Y, d.y);
  const { base: b2, mid: m2, tip: t2 } = result.pose;
  const chain = [b2, m2, t2].map(map2);
  const both = F.both && !variant.oneSided;
  const lines = [];
  const line = (a, b, w, cls, extra) => lines.push({ kind: "line", a, b, w, cls, ...extra });
  const dot = (c, r, cls, extra) => lines.push({ kind: "dot", c, r, cls, ...extra });

  // The still body. Arms: shoulder at the base; legs: knee at the base. Each piece belongs to a
  // part (view3d.js draws a part's outline round the whole part, not round each piece).
  const knee = F.base === "knee";
  const machine = /Machine|Smith/.test(variant.equipment ?? "");
  let S, P;
  const arm = (sh, hand, s) => line(sh, hand, 0.065, s > 0 ? "body" : "body back", { part: s > 0 ? "armR" : "armL" });
  if (knee) {
    const hip = seated ? v3(-L.thigh, 0, L.hipHalfWidth) : v3(0, L.thigh, L.hipHalfWidth);
    P = v3(hip.x, hip.y, 0);
    S = add3(P, v3(0, L.trunk, 0));
    line(hip, chain[0], 0.14, "body", { part: "legR" });
    const lKnee = mirror(chain[0]);
    line(mirror(hip), lKnee, 0.14, "body back", { part: "legL" });
    if (!both) {
      // The other foot lifted behind the working leg.
      const lAnkle = add3(lKnee, v3(-0.3, -0.3, 0));
      line(lKnee, lAnkle, 0.1, "body back", { part: "legL" });
      line(lAnkle, add3(lAnkle, v3(0.05, -0.12, 0)), 0.07, "body back", { part: "legL" });
    }
    if (seated) {
      // Seat under the thighs, pad across the knees, hands on the pad.
      const pad = (z) => v3(-0.06, 0.11, z);
      line(pad(-0.3), pad(0.3), 0.06, "pad");
      for (const s of [1, -1]) arm(v3(S.x, S.y, s * L.shoulderHalfWidth), pad(s * 0.24), s);
      lines.push({ kind: "poly", pts: [[-L.thigh - 0.12, -0.25], [-0.15, -0.25], [-0.15, 0.25], [-L.thigh - 0.12, 0.25]].map(([x, z]) => v3(x, -0.09, z)), cls: "plate3d bench3d" });
    } else {
      for (const s of [1, -1]) arm(v3(S.x, S.y, s * L.shoulderHalfWidth), v3(S.x, S.y - L.upperArm - L.forearm, s * (L.shoulderHalfWidth + 0.04)), s);
      if (machine) line(v3(S.x, S.y + 0.06, -0.3), v3(S.x, S.y + 0.06, 0.3), 0.07, "pad");
      else dot(v3(S.x, S.y - L.upperArm - L.forearm - 0.04, L.shoulderHalfWidth + 0.04), 0.055, "weight"); // the dumbbell
    }
  } else {
    S = v3(0, 0, 0);
    P = v3(0, -L.trunk, 0);
    for (const s of [1, -1]) {
      const hip = v3(P.x, P.y, s * L.hipHalfWidth);
      const kn = seated ? add3(hip, v3(L.thigh, 0, 0)) : add3(hip, v3(0, -L.thigh, 0));
      const ankle = add3(kn, v3(0, -L.shank, 0));
      const o = { part: s > 0 ? "legR" : "legL" }, cls = s > 0 ? "body" : "body back";
      line(hip, kn, 0.14, cls, o);
      line(kn, ankle, 0.1, cls, o);
      line(add3(ankle, v3(-L.heel, -0.06, 0)), add3(ankle, v3(L.footFront, -0.06, 0)), 0.06, cls, o);
    }
    const lSh = v3(0, 0, -L.shoulderHalfWidth);
    if (!both) arm(lSh, add3(lSh, v3(0, -L.upperArm - L.forearm, 0)), -1);
  }
  const torso = { part: "torso" };
  line(add3(P, v3(0, 0, -L.hipHalfWidth)), add3(P, v3(0, 0, L.hipHalfWidth)), 0.16, "body", torso);
  line(P, S, 0.3, "body", torso);
  line(add3(S, v3(0, 0, -L.shoulderHalfWidth)), add3(S, v3(0, 0, L.shoulderHalfWidth)), 0.1, "body", torso);
  dot(add3(S, v3(0, 0.2, 0)), 0.11, "body", torso);

  // The working limb (and its mirror image), joints, muscles. A working leg joins its thigh's part.
  const limb = (pts, cls, part) => {
    line(pts[0], pts[1], 0.075, cls, { bone: true, part });
    line(pts[1], pts[2], knee ? 0.08 : 0.06, cls, { bone: true, part });
  };
  limb(chain, "body", knee ? "legR" : "limbR");
  if (both) limb(chain.map(mirror), "body back", knee ? "legL" : "limbL");
  const act = Object.fromEntries(activation.map((m) => [m.id, m.value ?? 0]));
  const segs = { proximal: [b2, m2], distal: [m2, t2] };
  for (const m of ex.muscles.filter((x) => x.draw)) {
    const d = m.draw;
    let a, b;
    if (d.points) [a, b] = d.points.map(([x, y]) => ({ x, y }));
    else {
      const [from, to] = segs[d.seg];
      const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const u = { x: (to.x - from.x) / l, y: (to.y - from.y) / l }, n = { x: -u.y, y: u.x };
      const at = (t, o) => ({ x: from.x + u.x * t + n.x * o, y: from.y + u.y * t + n.y * o });
      a = d.origin ? { x: d.origin[0], y: d.origin[1] } : at(d.along[0], d.offset ?? 0);
      b = d.origin ? at(d.insert, d.offset ?? 0) : at(d.along[1], d.offset ?? 0);
    }
    const A = map2(a), B = map2(b), v = act[m.id] ?? 0, title = `${m.name}: ${Math.round(v * 100)}%`;
    for (const [p, q] of both ? [[A, B], [mirror(A), mirror(B)]] : [[A, B]]) {
      line(p, q, d.w, "muscle-base", { title, top: 50 });
      line(p, q, d.w, "muscle-on", { opacity: v, title, top: 50 });
    }
  }

  // Load and equipment.
  const f = result.force, forces = [];
  const joint3 = map2(result.pose.joint);
  const joints = [{ id: "joint", at: joint3, foot: joint3, momentArm: 0 }];
  const type = variant.load?.type;
  if (variant.grip3d) grip(variant, chain, t2, m2, both, { line, dot, dir2, X, Y, Z: v3(0, 0, 1), type, angleSense: ex.angleSense ?? 1 });
  else if (type === "gravity") for (const p of both ? [chain[2], mirror(chain[2])] : [chain[2]]) dot(p, /Dumbbell|Ankle/.test(variant.equipment ?? "") ? 0.055 : 0.09, "weight");
  if (type === "cable" || type === "band") {
    const q = map2(pulley ?? variant.load.pulley);
    line(chain[2], q, type === "band" ? 0.014 : 0.008, type === "band" && !(f.mag > 0) ? "band slack" : type);
    dot(q, 0.04, type === "band" ? "anchor" : "pulley");
    dot(chain[2], 0.025, "handle");
  }
  if (type === "machine" && f.mag > 0) {
    const at = map2(f.at), n = unit3(dir2({ x: -f.x / f.mag, y: -f.y / f.mag }));
    line(add3(at, n, 0.045), add3(add3(at, n, 0.045), unit3(sub3(chain[2], chain[1])), 0.1), 0.04, "pad");
  }
  if (f.mag > 0) {
    forces.push({ at: map2(f.at), dir: unit3(dir2({ x: f.x / f.mag, y: f.y / f.mag })) });
    joints[0] = { id: "joint", at: joint3, foot: map2(result.momentArmFoot), momentArm: Math.abs(result.momentArm) };
  }

  // Turn the scene so the variant's gravity points down (lying, inclined); no gravity in the plane
  // (a horizontal movement): leave the body upright.
  const g = gravityOf(variant);
  const G3 = dir2(g);
  const R = len3(G3) > 1e-9 ? turnOnto(unit3(G3), v3(0, -1, 0), unit3(cross3(X, Y))) : (p) => p;
  const T = (p) => R(p);
  const prims = lines.map((p) => (p.kind === "line" ? { ...p, a: T(p.a), b: T(p.b) } : p.kind === "dot" ? { ...p, c: T(p.c) } : { ...p, pts: p.pts.map(T) }));
  const lying = len3(G3) > 1e-9 && Math.abs(dot3(R(v3(0, 1, 0)), v3(0, 1, 0))) < 0.5;
  // Floor: under the ball of the foot for a closed chain, else under the lowest body point.
  const ys = prims.flatMap((p) => (p.kind === "line" ? [p.a.y - p.w / 2, p.b.y - p.w / 2] : p.kind === "dot" ? [p.c.y - p.r] : p.pts.map((q) => q.y)));
  // A closed chain (calf raise) stands with the balls of the feet on a step, the heels free.
  const STEP = 0.15;
  const ball = T(chain[2]), stepTop = ball.y - 0.03;
  const floorY = type === "reaction" ? Math.min(stepTop - STEP, Math.min(...ys) - 0.02) : Math.min(...ys) - 0.02;
  const scene = [{ kind: "poly", pts: [[-0.6, -0.7], [0.8, -0.7], [0.8, 0.7], [-0.6, 0.7]].map(([x, z]) => v3(x, floorY, z)), cls: "floor3d" }];
  if (type === "reaction") {
    const [x0, x1, z] = [ball.x - 0.06, ball.x + 0.25, 0.35];
    const box = (pts) => scene.push({ kind: "poly", pts: pts.map(([x, y, zz]) => v3(x, y, zz)), cls: "plate3d bench3d" });
    box([[x0, stepTop, -z], [x1, stepTop, -z], [x1, stepTop, z], [x0, stepTop, z]]);
    box([[x0, stepTop, -z], [x0, floorY, -z], [x0, floorY, z], [x0, stepTop, z]]);
    box([[x1, stepTop, -z], [x1, floorY, -z], [x1, floorY, z], [x1, stepTop, z]]);
  }
  if (knee && seated) scene.push({ kind: "line", a: T(v3(-L.thigh / 2 - 0.1, -0.1, 0)), b: v3(T(v3(-L.thigh / 2 - 0.1, 0, 0)).x, floorY, 0), w: 0.05, cls: "equipment" }); // the seat's post
  if (lying) {
    // A bench under the trunk.
    const a = T(P), b = T(S), y = Math.min(a.y, b.y) - 0.16;
    scene.push({ kind: "poly", pts: [[a.x, -0.17], [b.x, -0.17], [b.x, 0.17], [a.x, 0.17]].map(([x, z]) => v3(x, y, z)), cls: "plate3d bench3d" });
  }
  return {
    scene: [...scene, ...prims],
    frames: {},
    forces: forces.map((q) => ({ at: T(q.at), dir: R(q.dir) })),
    joints: joints.map((j) => ({ ...j, at: T(j.at), foot: T(j.foot) })),
  };
}
