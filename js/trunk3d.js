// 3D trunk view for the core exercises: every trunk-muscle fascicle of the OpenSim lumbar spine
// model (Christophy et al. 2012, MIT licence; data/opensim/lumbar-muscles.json, neutral posture)
// around the spine, shaded by the exercise's muscle activations, so the side and diagonal
// muscles (the obliques, the quadratus lumborum) show next to the straight ones. Display only.
// Upright by default; with `exercise.trunk3d.pose: "lumbar"` (back extension) the model bends to the
// solver's lower-back angle (interpolated between the exported postures, data.posed) and is set
// on the solver's pelvis, with the rest of the body (legs, head, arms, pads, hip muscles) drawn
// from the 2D result around it.
//
// exercise.trunk3d.map: { <exercise muscle id>: [lumbar groups, each "group" (both sides) or "group:r" / "group:l"] }
// (lumbar groups: rectus-abdominis, external-oblique, internal-oblique, psoas, iliocostalis,
// longissimus, multifidus, quadratus-lumborum). Model frame = view3d's world: x forward, y up, z right.

const v3 = ([x, y, z]) => ({ x, y, z });
const NAMES = { "rectus-abdominis": "Rectus abdominis", "external-oblique": "External oblique", "internal-oblique": "Internal oblique", psoas: "Psoas",
  iliocostalis: "Iliocostalis", longissimus: "Longissimus", multifidus: "Multifidus", "quadratus-lumborum": "Quadratus lumborum" };
const WIDTH = { "rectus-abdominis": 0.02, "external-oblique": 0.005, "internal-oblique": 0.005, psoas: 0.005 };

/** Each lumbar group and side's activation (0–1) from the exercise's muscle activations, or null (not modelled). */
export function trunkValues(exercise, activation) {
  const act = Object.fromEntries(activation.map((m) => [m.id, m.value]));
  const out = {};
  for (const [id, groups] of Object.entries(exercise.trunk3d?.map ?? {})) {
    if (act[id] == null) continue;
    for (const spec of groups) {
      const [g, side] = spec.split(":");
      for (const s of side ? [side] : ["r", "l"]) out[`${g}_${s}`] = Math.max(out[`${g}_${s}`] ?? 0, act[id]);
    }
  }
  return out;
}

/** A path resampled to n points evenly along its length (so postures with a wrap point more or less still blend). */
function resample(path, n) {
  if (path.length === n) return path;
  const d = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + Math.hypot(...path[i].map((v, k) => v - path[i - 1][k])));
  const total = d.at(-1) || 1;
  return Array.from({ length: n }, (_, j) => {
    const t = (total * j) / (n - 1);
    let i = 1;
    while (i < d.length - 1 && d[i] < t) i++;
    const f = (t - d[i - 1]) / ((d[i] - d[i - 1]) || 1);
    return path[i].map((v, k) => path[i - 1][k] + (v - path[i - 1][k]) * f);
  });
}

/** Paths and bodies with the lumbar spine at `flexDeg` (model sign: negative = flexion), blended between the exported postures. */
export function posedTrunk(data, flexDeg) {
  const P = data.posed;
  if (!P?.length) return { paths: data.paths, bodies: data.bodies };
  const x = Math.max(P[0].deg, Math.min(P.at(-1).deg, flexDeg));
  let i = 1;
  while (i < P.length - 1 && P[i].deg < x) i++;
  const [p0, p1] = [P[i - 1], P[i]], t = (x - p0.deg) / (p1.deg - p0.deg || 1);
  const mix = (a, b) => a.map((v, k) => v + (b[k] - v) * t);
  const paths = Object.fromEntries(Object.entries(data.paths).map(([g, list]) => [g, list.map((fas, j) => {
    const n = fas.path.length;
    const [a, b] = [resample(p0.paths[g][j], n), resample(p1.paths[g][j], n)];
    return { ...fas, path: a.map((q, k) => mix(q, b[k])) };
  })]));
  const bodies = Object.fromEntries(Object.keys(p0.bodies).map((k) => [k, mix(p0.bodies[k], p1.bodies[k])]));
  return { paths, bodies };
}

/**
 * Where the 2D result sits in the 3D world and which way the body's axes point there.
 * plane "sagittal" (a side-view result: 2D x, y = world x, y; the body's right = world +z) or
 * "frontal" (a front-view result such as the side plank: 2D x → world −z, y → y, the body's front
 * towards the viewer, +x). up: the trunk's direction in the 2D frame (pelvis → head).
 */
export function bodyFrame(plane, up) {
  if (plane === "frontal") {
    const W = (p, d = 0) => ({ x: d, y: p.y, z: -p.x });
    // Lying on the left side: the body's right side up, its front towards the viewer.
    return { W, Y: { x: 0, y: up.y, z: -up.x }, Z: { x: 0, y: up.x, z: up.y }, X: { x: 1, y: 0, z: 0 } };
  }
  const W = (p, d = 0) => ({ x: p.x, y: p.y, z: d });
  // Front = the trunk's direction turned a quarter clockwise (face down on a bench, belly to the floor in a plank).
  return { W, Y: { x: up.x, y: up.y, z: 0 }, Z: { x: 0, y: 0, z: 1 }, X: { x: up.y, y: -up.x, z: 0 } };
}

const plus = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });

/**
 * Primitives for js/view3d.js: the spine, a faint pelvis and ribcage, and every fascicle.
 * `place` (optional) = { flexDeg: lumbar flexion (°, + = flexed), at: L5/S1 in the 2D frame
 * (metres), up: the trunk's direction there (pelvis → head), top: where the trunk ends (scales the
 * model to the body), plane: "sagittal" | "frontal" (see bodyFrame), result: the multi-joint result
 * (the rest of the body), arms: "folded" (across the chest) or as the result draws them }.
 */
export function trunkScene3d(data, exercise, activation, place) {
  const prims = [];
  const posed = place ? posedTrunk(data, -(place.flexDeg ?? 0)) : { paths: data.paths, bodies: data.bodies };
  // Model → world: the model's axes onto the body's (front, up, right), scaled so its trunk
  // (L5 → thorax point, upright) matches the body's, its L5 on the solver's L5.
  let X = ([x, y, z]) => ({ x, y, z });
  let F = null;
  if (place) {
    F = bodyFrame(place.plane, place.up);
    const o = data.bodies.lumbar5, at = F.W(place.at);
    const k = place.top ? Math.hypot(place.top.x - place.at.x, place.top.y - place.at.y) / Math.hypot(data.bodies.thorax[0] - o[0], data.bodies.thorax[1] - o[1]) : 1;
    X = ([x, y, z]) => plus(plus(plus(at, F.X, (x - o[0]) * k), F.Y, (y - o[1]) * k), F.Z, (z - o[2]) * k);
  }
  const L = (a, b, w, cls, extra) => prims.push({ kind: "line", a: X(a), b: X(b), w, cls, ...extra });
  const B = posed.bodies;
  const spine = ["sacrum", "lumbar5", "lumbar4", "lumbar3", "lumbar2", "lumbar1", "thorax"].map((k) => B[k]).filter(Boolean);
  for (let i = 1; i < spine.length; i++) L(spine[i - 1], spine[i], 0.025, "body", { bone: true, part: "spine" });
  // The torso's top (ribcage) and the pelvis as faint bars, so the muscles have something to attach to.
  const top = B.torso, pel = B.pelvis;
  if (top) L([top[0] + 0.02, top[1] + 0.12, top[2] - 0.13], [top[0] + 0.02, top[1] + 0.12, top[2] + 0.13], 0.015, "body back", { part: "ribs" });
  if (pel) L([pel[0] + 0.02, pel[1] + 0.02, pel[2] - 0.12], [pel[0] + 0.02, pel[1] + 0.02, pel[2] + 0.12], 0.015, "body back", { part: "pelvis" });
  const values = trunkValues(exercise, activation);
  for (const [g, list] of Object.entries(posed.paths)) {
    for (const f of list) {
      const v = values[`${g}_${f.side}`];
      const title = `${NAMES[g] ?? g} (${f.side === "r" ? "right" : "left"}): ${v == null ? "not modelled here" : `${Math.round(v * 100)}%`}`;
      const w = WIDTH[g] ?? 0.003;
      for (let i = 1; i < f.path.length; i++) {
        L(f.path[i - 1], f.path[i], w, v == null ? "tendon-idle" : "muscle-base", { title });
        if (v != null) L(f.path[i - 1], f.path[i], w, "muscle-on", { opacity: v, title });
      }
    }
  }
  if (place?.result) prims.push(...bodyAround(place.result, exercise, activation, F, place));
  return prims;
}

/**
 * The multi-joint result's body outside the trunk, in 3D: legs on both sides (the body's right
 * and left, F.Z), arms, the head, pads, bench and floor, and the muscles drawn on the thighs.
 */
function bodyAround(r, exercise, activation, F, place) {
  const out = [];
  const P = (p, side = 0) => plus(F.W(p), F.Z, side); // side: towards the body's right
  const A = (p, d) => F.W(p, d); // across the 2D plane (equipment width, the floor)
  const line = (a, b, w, cls, extra) => out.push({ kind: "line", a, b, w, cls, ...extra });
  const HIP = 0.09, SH = 0.19, PAD = 0.14;
  const pts = [];
  for (const d of r.draw) {
    if (d.circle) { out.push({ kind: "dot", c: P(d.circle), r: d.r, cls: d.cls, part: "head" }); pts.push(d.circle); continue; }
    pts.push(d.a, d.b);
    // The trunk itself: a see-through outline, so the model's muscles show inside it.
    if (d.trunk) { line(P(d.a), P(d.b), d.w * 1.15, "body ghost", { part: "torso" }); continue; }
    for (const [s, side] of [[HIP, "R"], [-HIP, "L"]]) line(P(d.a, s), P(d.b, s), d.w, s > 0 ? d.cls : `${d.cls} back`, { part: `leg${side}` });
  }
  if (place.arms === "folded") {
    // Arms folded across the chest: elbows out to the sides, each hand on the other shoulder's side.
    for (const { from, to } of r.arms ?? []) for (const s of [SH, -SH]) {
      const e = P({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, s * 1.5);
      line(P(from, s), e, 0.07, s > 0 ? "body" : "body back", { part: `arm${s}` });
      line(e, P(to, -s * 0.3), 0.06, s > 0 ? "body" : "body back", { part: `arm${s}` });
    }
  } else {
    // As the 2D result draws them: one arm entry = both arms alike; two = the lower (support) arm, then the upper one.
    const arms = r.arms ?? [];
    const sides = arms.length === 1 ? [[arms[0], SH], [arms[0], -SH]] : arms.map((a, i) => [a, i === 0 ? -SH : SH]);
    for (const [{ from, to, elbow }, s] of sides) {
      // Front view (side plank): the support arm's forearm points at the viewer, flat on the support.
      if (place.plane === "frontal" && s < 0 && arms.length === 2) {
        line(P(from, 0), P(to, 0), 0.07, "body", { part: "armSupport" });
        line(P(to, 0), plus(P(to, 0), F.X, 0.3), 0.06, "body", { part: "armSupport" });
        pts.push(to);
        continue;
      }
      const e = elbow ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      line(P(from, s), P(e, s), 0.07, s > 0 ? "body" : "body back", { part: `arm${s}` });
      line(P(e, s), P(to, s), 0.06, s > 0 ? "body" : "body back", { part: `arm${s}` });
      pts.push(to);
    }
  }
  for (const p of r.props ?? []) {
    const d = p.cls === "pad" ? PAD : 0.22;
    for (const dd of [d, -d]) line(A(p.a, dd), A(p.b, dd), p.w, p.cls);
    if (p.cls === "pad") line(A(p.a, 0), A(p.b, 0), p.w, p.cls);
    pts.push(p.a, p.b);
  }
  // The floor, where the 2D figure has one.
  if (!r.noFloor) {
    const xs = pts.map((p) => p.x), x0 = Math.min(...xs) - 0.25, x1 = Math.max(...xs) + 0.25;
    out.push({ kind: "poly", pts: [A({ x: x0, y: 0 }, -0.5), A({ x: x1, y: 0 }, -0.5), A({ x: x1, y: 0 }, 0.5), A({ x: x0, y: 0 }, 0.5)], cls: "floor3d" });
  }
  const act = Object.fromEntries(activation.map((m) => [m.id, m.value ?? 0]));
  for (const m of exercise.muscles.filter((x) => x.draw && r.segs[x.draw.seg] && x.draw.seg !== "trunk")) {
    const [from, to] = r.segs[m.draw.seg];
    const l = Math.hypot(to.x - from.x, to.y - from.y) || 1, u = { x: (to.x - from.x) / l, y: (to.y - from.y) / l }, n = { x: -u.y, y: u.x };
    const at = (t) => ({ x: from.x + u.x * t + n.x * (m.draw.offset ?? 0), y: from.y + u.y * t + n.y * (m.draw.offset ?? 0) });
    const v = act[m.id] ?? 0, title = `${m.name}: ${Math.round(v * 100)}%`;
    for (const s of [HIP, -HIP]) {
      line(P(at(m.draw.along[0]), s), P(at(m.draw.along[1]), s), m.draw.w, "muscle-base", { title, top: 0.05 });
      line(P(at(m.draw.along[0]), s), P(at(m.draw.along[1]), s), m.draw.w, "muscle-on", { opacity: v, title, top: 0.05 });
    }
  }
  return out;
}
