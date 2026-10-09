// Straight-line hip muscle model from the OpenSim geometry in data/opensim/hip-muscles.json
// (Rajagopal et al. 2016, with Uhlrich et al. 2022's hip abductor paths), used by the single-joint hip
// abduction and adduction exercises (`hipModel` in their JSON). Pure functions, no DOM.
//
// Frames (OpenSim): x forward, y up, z to the right; right hip centre at the origin.
// Femur orientation in the pelvis = Rz(flexion) · Rx(adduction) · Ry(rotation), body-fixed,
// as in the model's hip joint. A muscle's moment arm about a coordinate q is −dL/dq (L = the
// length of its path: straight segments between its points, wrapped over the model's cylinders).

const rad = (d) => (d * Math.PI) / 180;

const rx = (a, [x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const ry = (a, [x, y, z]) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rz = (a, [x, y, z]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];

/** A femur-frame point in the pelvis frame, for hip angles in degrees ({ flexion, adduction, rotation }). */
export function femurToPelvis(p, { flexion = 0, adduction = 0, rotation = 0 }) {
  return rz(rad(flexion), rx(rad(adduction), ry(rad(rotation), p)));
}

/** Pelvis-frame point into the femur frame (inverse of femurToPelvis). */
const pelvisToFemur = (p, { flexion = 0, adduction = 0, rotation = 0 }) => ry(-rad(rotation), rx(-rad(adduction), rz(-rad(flexion), p)));

/**
 * Wrap one straight segment a → b (pelvis frame) over a cylinder, as OpenSim does: in the
 * cylinder's frame (axis = z) the path runs tangent to the circle, along the arc and tangent off
 * again; along the axis it rises evenly over the unrolled length. It wraps when the line cuts the
 * cylinder, or (with a `quadrant`) when it would pass on the forbidden side. Returns the points
 * to insert between a and b, or null.
 */
function wrapSegment(a, b, w, hip) {
  const [r0, r1, r2] = w.rotation;
  const toBody = (p) => (w.body === "femur" ? pelvisToFemur(p, hip) : p);
  const fromBody = (p) => (w.body === "femur" ? femurToPelvis(p, hip) : p);
  const toCyl = (p) => { const q = toBody(p); return rz(-r2, ry(-r1, rx(-r0, [q[0] - w.at[0], q[1] - w.at[1], q[2] - w.at[2]]))); };
  const fromCyl = (q) => { const p = rx(r0, ry(r1, rz(r2, q))); return fromBody([p[0] + w.at[0], p[1] + w.at[1], p[2] + w.at[2]]); };
  const P = toCyl(a), S = toCyl(b), r = w.radius;
  const dp = Math.hypot(P[0], P[1]), ds = Math.hypot(S[0], S[1]);
  if (dp <= r || ds <= r) return null;
  const dx = S[0] - P[0], dy = S[1] - P[1];
  const t = Math.max(0, Math.min(1, -(P[0] * dx + P[1] * dy) / (dx * dx + dy * dy || 1)));
  const cx = P[0] + t * dx, cy = P[1] + t * dy;
  const allowed = (ang) => ({ "+x": Math.cos(ang) > 0, "-x": Math.cos(ang) < 0, "+y": Math.sin(ang) > 0, "-y": Math.sin(ang) < 0 })[w.quadrant] ?? true;
  if (Math.hypot(cx, cy) >= r && allowed(Math.atan2(cy, cx))) return null;
  const tp = Math.atan2(P[1], P[0]), ts = Math.atan2(S[1], S[0]);
  const ap = Math.acos(r / dp), as = Math.acos(r / ds);
  const mod = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ways = [1, -1].map((s) => {
    const a1 = tp + s * ap, a2 = ts - s * as;
    const arc = mod(s * (a2 - a1));
    return { s, a1, arc, len: Math.sqrt(dp * dp - r * r) + r * arc + Math.sqrt(ds * ds - r * r) };
  });
  const ok = ways.filter((x) => allowed(x.a1 + (x.s * x.arc) / 2));
  const best = (ok.length ? ok : ways).reduce((m, x) => (x.len < m.len ? x : m));
  const lp = Math.sqrt(dp * dp - r * r), L2 = best.len;
  const n = Math.max(1, Math.ceil(best.arc / 0.3));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = best.a1 + (best.s * best.arc * i) / n;
    const along = (lp + (r * best.arc * i) / n) / L2;
    pts.push(fromCyl([r * Math.cos(ang), r * Math.sin(ang), P[2] + (S[2] - P[2]) * along]));
  }
  return pts;
}

/** The muscle's path points in the pelvis frame, wrapped over its cylinders (`wraps` = geometry.wraps). */
export function musclePath(m, hip, wraps = {}) {
  let pts = m.points.map((p) => (p.frame === "pelvis" ? p.at : femurToPelvis(p.at, hip)));
  for (const name of m.wraps ?? []) {
    const w = wraps[name];
    if (!w) continue;
    for (let i = 1; i < pts.length; i++) {
      const extra = wrapSegment(pts[i - 1], pts[i], w, hip);
      if (extra) { pts = [...pts.slice(0, i), ...extra, ...pts.slice(i)]; break; }
    }
  }
  return pts;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const muscleLength = (m, hip, wraps) => musclePath(m, hip, wraps).reduce((s, p, i, a) => (i ? s + dist(a[i - 1], p) : 0), 0);

/** Moment arm (metres) about one hip coordinate; positive = pulls that coordinate positive. */
export function momentArm(m, hip, coord, wraps) {
  const h = 0.25;
  const L = (d) => muscleLength(m, { ...hip, [coord]: (hip[coord] ?? 0) + d }, wraps);
  return -(L(h) - L(-h)) / (2 * rad(h));
}

/** Abduction moment arm in metres (positive = abducts). */
export const abductionArm = (m, hip, wraps) => -momentArm(m, hip, "adduction", wraps);

/**
 * Hip posture for an exercise angle (degrees of abduction; negative = crossed past the middle).
 * A variant's `hip.flexion` is the hip bend with the trunk upright; with `hip.lean` the trunk-lean
 * slider (degrees back, + = reclined) takes that much off, since the thighs stay on the seat.
 */
export function hipPosture(variant, angleDeg, placement) {
  const h = variant.hip ?? {};
  const lean = h.lean ? Number(placement?.lean ?? variant.params?.lean ?? 0) : 0;
  return { flexion: (h.flexion ?? 0) - lean, adduction: -angleDeg, rotation: 0, lean };
}

/** Solve the small system M y = b (Gaussian elimination with pivoting). */
function solveN(M, b) {
  const n = b.length;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !A[c][c]) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => (row[i] ? row[n] / row[i] : 0));
}

const COORDS = ["flexion", "adduction", "rotation"];

/**
 * The muscle's force at full activation as a share of its maximum (OpenSim's force–length with
 * the tendon in equilibrium, `m.active` on `geometry.forceGrid`), bilinear between grid points
 * and held at the grid's edges. Knee straight or bent 90° (seated). 1 if the data has no table.
 */
export function activeFactor(m, hip, geometry, kneeBent = false) {
  const g = geometry.forceGrid, t = m.active?.[kneeBent ? "knee90" : "knee0"];
  if (!g || !t) return 1;
  const at = (xs, x) => {
    const v = Math.min(xs.at(-1), Math.max(xs[0], x));
    let i = 0;
    while (i < xs.length - 2 && v > xs[i + 1]) i++;
    return [i, (v - xs[i]) / (xs[i + 1] - xs[i])];
  };
  const [i, u] = at(g.flexion, hip.flexion ?? 0), [j, w] = at(g.adduction, hip.adduction ?? 0);
  return (1 - u) * ((1 - w) * t[i][j] + w * t[i][j + 1]) + u * ((1 - w) * t[i + 1][j] + w * t[i + 1][j + 1]);
}

/**
 * Muscle activations by static optimisation over all model muscles crossing the hip. Muscle j at
 * activation a_j pulls k·F_j·r_jq about each hip coordinate q (F_j = its force at full activation
 * at this posture, from OpenSim's force–length) (flexion, adduction, rotation; r =
 * its moment arms at this posture). k scales the model so that all muscles pulling the working way
 * together give the measured strength (`result.capacity`). The activations minimise Σ a_j² while
 * the muscles produce the joint torque about the abduction–adduction axis and nothing about the
 * other two (the load has no moment about them, so a muscle that also extends or rotates must be
 * balanced by others), with 0 ≤ a_j ≤ 1. A variant's `hip.balance` can drop coordinates that a
 * support takes instead (seated: the seat carries flexion–extension, pads and footrests rotation).
 * Returns { id → activation }.
 */
export function hipActivations(exercise, variant, result, geometry) {
  const sign = exercise.hipModel.direction === "adduction" ? -1 : 1;
  const knee = Boolean(variant.hip?.kneeBent);
  const arms = geometry.muscles.map((m) => {
    const F = m.fmax * activeFactor(m, result.hip, geometry, knee);
    return COORDS.map((q) => F * momentArm(m, result.hip, q, geometry.wraps));
  });
  const out = Object.fromEntries(geometry.muscles.map((m) => [m.id, 0]));
  const total = arms.reduce((s, r) => s + Math.max(0, -sign * r[1]), 0); // abduction = −adduction
  const T = Math.max(0, result.jointTorque);
  if (!total || !T || !(result.capacity > 0)) return out;
  const k = result.capacity / total;
  const keep = COORDS.map((q, i) => i).filter((i) => (variant.hip?.balance ?? COORDS).includes(COORDS[i]));
  const A = arms.map((r) => keep.map((i) => k * r[i])); // per muscle: moments at full activation
  const b = keep.map((i) => (i === 1 ? -sign * T : 0));
  const n = keep.length;
  // The optimum is a_j = clamp(A_j · y, 0, 1) for the y (one value per hip coordinate) that
  // minimises the convex dual φ(y) = Σ H(A_j · y) − b · y, H = the integral of the clamp: Newton
  // steps with backtracking. If the load is beyond what the muscles can balance, y runs off and
  // the muscles end at their bounds.
  const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
  const H = (s) => (s <= 0 ? 0 : s >= 1 ? s - 0.5 : (s * s) / 2);
  const phi = (y) => A.reduce((s, r) => s + H(dot(r, y)), 0) - dot(b, y);
  const clamp = (s) => Math.min(1, Math.max(0, s));
  let y = Array(n).fill(0);
  for (let it = 0; it < 60; it++) {
    const s = A.map((r) => dot(r, y));
    const g = b.map((_, q) => A.reduce((acc, r, j) => acc + r[q] * clamp(s[j]), 0) - b[q]);
    if (Math.hypot(...g) < 1e-6 * T) break;
    const scale = Math.max(...A.map((r) => dot(r, r)), 1e-12);
    const M = b.map((_, p) => b.map((_, q) => A.reduce((acc, r, j) => acc + (s[j] > 0 && s[j] < 1 ? r[p] * r[q] : 0), 0) + (p === q ? 1e-6 * scale : 0)));
    const d = solveN(M, g).map((x) => -x);
    let t = 1;
    const f0 = phi(y), slope = dot(g, d);
    while (t > 1e-8 && phi(y.map((v, q) => v + t * d[q])) > f0 + 1e-4 * t * slope) t /= 2;
    y = y.map((v, q) => v + t * d[q]);
  }
  geometry.muscles.forEach((m, j) => { out[m.id] = clamp(dot(A[j], y)); });
  return out;
}

/** A listed muscle's value: the force-weighted mean activation of its model parts (`osim`). */
export function groupActivation(m, acts, geometry) {
  const parts = geometry.muscles.filter((g) => m.osim.includes(g.id));
  const f = parts.reduce((s, g) => s + g.fmax, 0);
  return f ? parts.reduce((s, g) => s + g.fmax * acts[g.id], 0) / f : 0;
}

// ---------- 3D figure ----------

const v3 = ([x, y, z]) => ({ x, y, z });
const plus = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

/**
 * Scene for js/view3d.js: body, seat or floor, cable, the right leg's muscles along their model
 * paths (coloured by activation), the load and its moment arm. World = the pelvis frame turned so
 * gravity points down (or, seated, tilted by the trunk lean); the right hip stays at the origin.
 * The 2D statics (x out to the side, −y down the leg) map onto the plane the femur moves in.
 */
export function hipScene3d(exercise, variant, result, { geometry, acts, muscles, pulley }) {
  const hip = result.hip;
  const half = -geometry.hipInPelvis[2]; // pelvis midline, z (right hip at 0)
  const g = variant.gravity ?? { x: 0, y: -1 };
  const tilt = variant.hip?.lean ? 0 : Math.PI - Math.atan2(g.x, g.y);
  const W = (p) => (variant.hip?.lean ? rz(rad(hip.lean), p) : rx(tilt, p));
  const W_inv = (p) => (variant.hip?.lean ? rz(-rad(hip.lean), p) : rx(-tilt, p));
  const map2 = (p) => W(femurToPelvis([0, p.y, p.x], { flexion: hip.flexion }));
  const L1 = exercise.segments.proximal, L2 = exercise.segments.distal;
  const seated = Boolean(variant.hip?.kneeBent);
  const mirror = (p) => [p[0], p[1], 2 * half - p[2]];
  // A leg in the pelvis frame (hip, knee, ankle); seated, the lower leg hangs straight down.
  const leg = (h) => {
    const knee = femurToPelvis([0, -L1, 0], h);
    const ankle = seated ? plus(knee, W_inv([0, -L2, 0])) : femurToPelvis([0, -L1 - L2, 0], h);
    return [[0, 0, 0], knee, ankle];
  };
  const L3 = (a, b, w, cls, extra) => ({ kind: "line", a: v3(a), b: v3(b), w, cls, ...extra });
  const right = leg(hip);
  // The other leg: seated it mirrors the working one (both press the pads); otherwise it stays down.
  const left = (seated ? right : leg({ flexion: hip.flexion })).map(mirror);
  const [H, K, A] = right.map(W);
  const [lH, lK, lA] = left.map(W);
  const mid = W([0, 0, half]);
  const up = W([0, 1, 0]);
  const shoulder = plus(mid, up, 0.52);
  const prims = [
    L3(mid, shoulder, 0.3, "body"), { kind: "dot", c: v3(plus(shoulder, up, 0.2)), r: 0.11, cls: "body" },
    L3(lH, H, 0.16, "body"),
    L3(lH, lK, 0.14, "body back"), L3(lK, lA, 0.1, "body back"),
    L3(H, K, 0.14, "body"), L3(K, A, 0.1, "body"),
  ];
  // Muscles of the right leg along the model's path points (pelvis → femur), drawn over the body.
  for (const m of muscles) {
    for (const part of geometry.muscles.filter((x) => m.osim?.includes(x.id))) {
      const pts = musclePath(part, hip, geometry.wraps).map(W);
      const a = acts[part.id] ?? 0;
      const title = `${m.name} (${part.id}): ${Math.round(a * 100)}%`;
      for (let i = 1; i < pts.length; i++) {
        prims.push(L3(pts[i - 1], pts[i], 0.02, "muscle-base", { title, top: 50 }));
        prims.push(L3(pts[i - 1], pts[i], 0.02, "muscle-on", { opacity: a, title, top: 50 }));
      }
    }
  }
  const f = result.force;
  const forces = [];
  const joints = [{ id: "hip", at: v3(H), foot: v3(H), momentArm: 0 }];
  if (f.mag > 0) {
    const at = map2(f.at);
    const d = map2({ x: f.x / f.mag, y: f.y / f.mag });
    forces.push({ at: v3(at), dir: v3(d) });
    const foot = map2(result.momentArmFoot);
    joints[0] = { id: "hip", at: v3(H), foot: v3(foot), momentArm: Math.abs(result.momentArm) };
    if (variant.load?.type === "cable" || variant.load?.type === "band") {
      const p = map2(pulley ?? variant.load.pulley);
      prims.push(L3(at, p, 0.01, "cable"), { kind: "dot", c: v3(p), r: 0.03, cls: "equipment" });
    } else if (variant.load?.type === "machine") {
      prims.push(L3(plus(at, [0, -0.08, 0]), plus(at, [0, 0.08, 0]), 0.07, "equipment"));
    }
  }
  if (seated) {
    // The backrest reclines with the trunk; leaning forward, it stays upright behind.
    const pad = (p) => rz(rad(Math.max(0, hip.lean)), p);
    const back = pad([-0.14, 0, half]);
    // Seat under both thighs (the midline is at z = half, the left hip at 2·half).
    const [z0, z1] = [2 * half - 0.22, 0.22];
    prims.push({ kind: "poly", pts: [[-0.2, z0], [0.45, z0], [0.45, z1], [-0.2, z1]].map(([x, z]) => ({ x, y: -0.09, z })), cls: "plate3d bench3d" });
    prims.push(L3(back, plus(back, pad([0, 1, 0]), 0.6), 0.05, "equipment"));
  } else {
    const ys = prims.flatMap((p) => (p.kind === "line" ? [p.a.y, p.b.y] : p.kind === "dot" ? [p.c.y - p.r] : []));
    const y0 = Math.min(...ys) - 0.06;
    prims.push({ kind: "poly", pts: [[-0.5, -0.9], [0.5, -0.9], [0.5, 0.9], [-0.5, 0.9]].map(([x, z]) => ({ x, y: y0, z: z + half })), cls: "floor3d" });
  }
  return { scene: prims, frames: {}, forces, joints };
}
