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
    // `place.frame`: a ready 3D frame ({ X, Y, Z, at, trunk }) for scenes that aren't a side or front view (the Pallof press, seen from above).
    F = place.frame ?? bodyFrame(place.plane, place.up);
    const o = data.bodies.lumbar5, at = place.frame ? place.frame.at : F.W(place.at);
    const trunkLen = place.frame ? place.frame.trunk : place.top ? Math.hypot(place.top.x - place.at.x, place.top.y - place.at.y) : null;
    const k = trunkLen ? trunkLen / Math.hypot(data.bodies.thorax[0] - o[0], data.bodies.thorax[1] - o[1]) : 1;
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

const rotZ = (th) => (p) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th), y: p.x * Math.sin(th) + p.y * Math.cos(th), z: p.z });
const mapPrims = (prims, T) => prims.map((p) => (p.kind === "line" ? { ...p, a: T(p.a), b: T(p.b) } : p.kind === "dot" ? { ...p, c: T(p.c) } : { ...p, pts: p.pts.map(T) }));

/**
 * Single-joint core exercises (crunch: `trunk3d.pose` "curl"; leg raise: "chain"): the lumbar model
 * on the body built from the exercise's 2D posture shapes and moving chain, in the exercise frame
 * (x towards the belly, y towards the head), then turned so the variant's gravity points down. In
 * the crunch the model bends by the curl angle (the whole curl as lumbar bend, a simplification:
 * a real crunch curls the upper back most); in the leg raise the trunk stays straight.
 */
export function trunkChainScene3d(data, exercise, variant, result, activation, gravity) {
  const curl = exercise.trunk3d.pose === "curl";
  const { base, mid, tip } = result.pose;
  const out = [];
  const W = (p, z = 0) => ({ x: p.x, y: p.y, z });
  const line = (a, b, w, cls, extra) => out.push({ kind: "line", a, b, w, cls, ...extra });
  const HIP = 0.09, SH = 0.19;
  const P2 = ([x, y]) => ({ x, y });
  // The still body: wide pieces (pelvis, trunk) as a see-through outline, limbs on both sides
  // (arms above the hips, legs below), equipment as two rails.
  for (const sh of exercise.postures?.[variant.posture] ?? []) {
    if (sh.shape === "circle") { out.push({ kind: "dot", c: W(P2(sh.at)), r: sh.r, cls: sh.class ?? "body", ...(sh.class ? {} : { part: "head" }) }); continue; }
    const a = P2(sh.from), b = P2(sh.to);
    if (sh.class === "equipment") {
      // Lying on the floor: the floor plane replaces the 2D floor line. Hanging: the bar runs across. Benches: two rails.
      if (variant.posture === "floor" || variant.posture === "lying") continue;
      if (variant.posture === "hanging") { const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; line(W(m, -0.45), W(m, 0.45), 0.035, "equipment"); continue; }
      for (const z of [0.2, -0.2]) line(W(a, z), W(b, z), sh.w, "equipment");
      continue;
    }
    if (sh.w >= 0.18) { line(W(a), W(b), sh.w * 1.15, "body ghost", { part: "torso" }); continue; }
    const s = Math.min(a.y, b.y) > 0.3 ? SH : HIP;
    for (const z of [s, -s]) line(W(a, z), W(b, z), sh.w, z > 0 ? "body" : "body back", { part: `limb${z > 0 ? "R" : "L"}${s}` });
  }
  // The moving chain: the curling upper trunk (outline + head) or the legs.
  const SD = exercise.segments.draw;
  if (curl) {
    line(W(base), W(mid), (SD?.w?.[0] ?? 0.24) * 1.15, "body ghost", { part: "torso" });
    const h = SD?.head ? { x: mid.x + (tip.x - mid.x) * SD.head.at, y: mid.y + (tip.y - mid.y) * SD.head.at } : tip;
    out.push({ kind: "dot", c: W(h), r: SD?.head?.r ?? 0.11, cls: "body", part: "head" });
  } else {
    for (const z of [HIP, -HIP]) {
      const o = { part: `leg${z > 0 ? "R" : "L"}` }, cls = z > 0 ? "body" : "body back";
      line(W(base, z), W(mid, z), SD?.w?.[0] ?? 0.14, cls, o);
      line(W(mid, z), W(tip, z), SD?.w?.[1] ?? 0.1, cls, o);
    }
    // Muscles drawn on the legs (e.g. the rectus femoris), shaded by their effort.
    const act = Object.fromEntries(activation.map((m) => [m.id, m.value ?? 0]));
    const segs = { proximal: [base, mid], distal: [mid, tip] };
    for (const m of exercise.muscles.filter((x) => x.draw && segs[x.draw.seg] && x.draw.along)) {
      const [from, to] = segs[m.draw.seg];
      const l = Math.hypot(to.x - from.x, to.y - from.y) || 1, u = { x: (to.x - from.x) / l, y: (to.y - from.y) / l }, n = { x: -u.y, y: u.x };
      const at = (t) => ({ x: from.x + u.x * t + n.x * (m.draw.offset ?? 0), y: from.y + u.y * t + n.y * (m.draw.offset ?? 0) });
      const v = act[m.id] ?? 0, title = `${m.name}: ${Math.round(v * 100)}%`;
      for (const z of [HIP, -HIP]) {
        line(W(at(m.draw.along[0]), z), W(at(m.draw.along[1]), z), m.draw.w, "muscle-base", { title, top: 0.05 });
        line(W(at(m.draw.along[0]), z), W(at(m.draw.along[1]), z), m.draw.w, "muscle-on", { opacity: v, title, top: 0.05 });
      }
    }
  }
  // The lumbar model: on the pivot (crunch) or 10 cm above the hip (leg raise), trunk along +y.
  const place = curl
    ? { flexDeg: result.angle ?? 0, at: W(base), up: { x: 0, y: 1 }, top: mid, plane: "sagittal" }
    : { flexDeg: 0, at: { x: 0, y: 0.1 }, up: { x: 0, y: 1 }, top: { x: 0, y: 0.52 }, plane: "sagittal" };
  const all = [...trunkScene3d(data, exercise, activation, place), ...out];
  // Turn the scene so gravity points down (lying: the back on the floor), and add the floor.
  const g = gravity ?? { x: 0, y: -1 };
  const turned = Math.hypot(g.x, g.y) > 1e-9 ? mapPrims(all, rotZ(Math.atan2(-1, 0) - Math.atan2(g.y, g.x))) : all;
  if (variant.posture === "hanging") return turned;
  const ys = turned.flatMap((p) => (p.kind === "line" ? [p.a.y - p.w / 2, p.b.y - p.w / 2] : p.kind === "dot" ? [p.c.y - p.r] : p.pts.map((q) => q.y)));
  const xs = turned.flatMap((p) => (p.kind === "line" ? [p.a.x, p.b.x] : p.kind === "dot" ? [p.c.x] : p.pts.map((q) => q.x)));
  const y0 = Math.min(...ys) - 0.005, x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2;
  return [{ kind: "poly", pts: [[x0, -0.6], [x1, -0.6], [x1, 0.6], [x0, 0.6]].map(([x, z]) => ({ x, y: y0, z })), cls: "floor3d" }, ...turned];
}

/**
 * The Pallof press (`trunk3d.pose` "standing"): the solver's top view (x the right side, y forward)
 * stood up: an upright body (or half kneeling) with the lumbar model straight on it, the arms from
 * the shoulders to the hands at the solver's hand height, and the cable level to its anchor.
 */
export function pallofScene3d(data, exercise, variant, result, activation, body) {
  const L = body.lengths, P = variant.params ?? {};
  const kneel = /kneel/.test(variant.id);
  const hipY = kneel ? L.thigh + 0.05 : L.ankleHeight + L.shank + L.thigh;
  const l5Y = hipY + body.trunkParts.l5s1, sY = hipY + L.trunk, hY = l5Y + (P.handHeight ?? 0.35);
  const T = (p, h) => ({ x: p.y, y: h, z: p.x }); // top view → world: forward = 2D y, the right side = 2D x
  const out = [];
  const line = (a, b, w, cls, extra) => out.push({ kind: "line", a, b, w, cls, ...extra });
  const HIP = 0.09;
  // Legs: standing, or half kneeling (front thigh level, back knee on the floor).
  for (const [z, front] of [[HIP, true], [-HIP, false]]) {
    const o = { part: `leg${z > 0 ? "R" : "L"}` }, cls = z > 0 ? "body" : "body back";
    const hip = { x: 0, y: hipY, z };
    if (!kneel) {
      const knee = { x: 0, y: hipY - L.thigh, z }, ankle = { x: 0, y: L.ankleHeight, z };
      line(hip, knee, 0.14, cls, o); line(knee, ankle, 0.1, cls, o); line({ x: -L.heel, y: 0.03, z }, { x: L.footFront, y: 0.03, z }, 0.06, cls, o);
    } else if (front) {
      const knee = { x: L.thigh, y: L.ankleHeight + L.shank, z }, ankle = { x: L.thigh, y: L.ankleHeight, z };
      line(hip, knee, 0.14, cls, o); line(knee, ankle, 0.1, cls, o); line({ x: L.thigh - L.heel, y: 0.03, z }, { x: L.thigh + L.footFront, y: 0.03, z }, 0.06, cls, o);
    } else {
      const knee = { x: 0, y: 0.05, z };
      line(hip, knee, 0.14, cls, o); line(knee, { x: -L.shank, y: 0.05, z }, 0.1, cls, o);
    }
  }
  line({ x: 0, y: hipY, z: 0 }, { x: 0, y: sY, z: 0 }, 0.3 * 1.15, "body ghost", { part: "torso" });
  out.push({ kind: "dot", c: { x: 0, y: sY + 0.22, z: 0 }, r: 0.11, cls: "body", part: "head" });
  for (const { from, to, elbow } of result.arms ?? []) {
    const s = T(from, sY), e = T(elbow ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, (sY + hY) / 2), h = T(to, hY);
    const cls = from.x > 0 ? "body" : "body back", part = `arm${from.x > 0 ? "R" : "L"}`;
    line(s, e, 0.07, cls, { part }); line(e, h, 0.06, cls, { part });
  }
  for (const p of result.props ?? []) {
    if (p.cls === "cable") line(T(p.a, hY), T(p.b, hY), 0.012, "cable");
    else { const c = T({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }, 0); line(c, { ...c, y: hY + 0.4 }, 0.06, "equipment"); }
  }
  out.push({ kind: "poly", pts: [[-0.8, -1.7], [1.0, -1.7], [1.0, 0.6], [-0.8, 0.6]].map(([x, z]) => ({ x, y: 0, z })), cls: "floor3d" });
  const frame = { X: { x: 1, y: 0, z: 0 }, Y: { x: 0, y: 1, z: 0 }, Z: { x: 0, y: 0, z: 1 }, at: { x: 0, y: l5Y, z: 0 }, trunk: L.trunk - body.trunkParts.l5s1 };
  return [...trunkScene3d(data, exercise, activation, { frame, flexDeg: 0 }), ...out];
}
