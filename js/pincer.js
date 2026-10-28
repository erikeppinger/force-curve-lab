// Pincer: the thumb tip against the index pad, built up from simple to detailed ("Channellocks").
// Level 0 ("pliers"): each digit a rigid jaw on one pivot (index MCP, thumb base), one flexor each.
// Level 1 ("jointed"): each digit a chain flexing in its own plane (index MCP–PIP–DIP, thumb base–
// MCP–IP), pressed by the same squeeze F along its pad's normal; every flexion joint is balanced
// by the muscles crossing it (static optimisation). The two planes meet at an angle in a real tip
// pinch (the thumb comes from the side), so each digit is solved in its own plane; what that
// leaves out (thumb opposition, finger spread) is level 2.
// Postures: index MCP / PIP / DIP and thumb MCP / IP as measured in tip pinch (Shimawaki et al.
// 2020), the index's by object width. Moment arms and muscle forces: the ARMS hand model at those
// postures (data/opensim/arms-pincer.json, NON-COMMERCIAL). Each digit's frame: its proximal
// joint at the origin, its first bone along +x, flexion turning counter-clockwise (towards +y, the
// palm side). Angles in degrees. Pure functions.


/** Solve M x = b for a small dense system (Gaussian elimination with pivoting). */
function solveN(A, b) {
  const n = b.length, X = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(X[r][c]) > Math.abs(X[p][c])) p = r;
    [X[c], X[p]] = [X[p], X[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !X[c][c]) continue;
      const f = X[r][c] / X[c][c];
      for (let k = c; k <= n; k++) X[r][k] -= f * X[c][k];
    }
  }
  return X.map((r, i) => (r[i] ? r[n] / r[i] : 0));
}

/**
 * min Σ c_j x_j² / 2 subject to Σ_j x_j col_j = b and lo_j ≤ x_j ≤ hi_j, through its dual:
 * x_j(y) = clamp(col_j · y / c_j), with y found by Newton steps (backtracking) on the convex
 * dual function. Returns { x, residual } (residual = |Σ x_j col_j − b| ÷ |b|).
 */
export function boundedLeastSquares(cols, b, cost, lo, hi) {
  const m = b.length;
  const dot = (u, v) => { let s = 0; for (let i = 0; i < m; i++) s += u[i] * v[i]; return s; };
  const xOf = (j, t) => Math.min(hi[j], Math.max(lo[j], t / cost[j]));
  const H = (j, t) => { const x = xOf(j, t); return t * x - (cost[j] * x * x) / 2; }; // conjugate of the bounded quadratic
  const phi = (y) => cols.reduce((s, col, j) => s + H(j, dot(col, y)), 0) - dot(b, y);
  const nb = Math.hypot(...b) || 1;
  // Start from the unconstrained optimum (every muscle free): starting at y = 0 leaves every
  // activation on its lower bound, so the first Newton step has no curvature to work with.
  const s0 = Math.max(1e-12, ...cols.map((col, j) => dot(col, col) / cost[j]));
  let y = solveN(b.map((_, p) => b.map((_, q) => cols.reduce((s, col, j) => s + (col[p] * col[q]) / cost[j], 0) + (p === q ? 1e-9 * s0 : 0))), b);
  // Stop when converged, or when the residual stalls (an infeasible problem: no point iterating).
  let bestG = Infinity, since = 0;
  for (let it = 0; it < 300; it++) {
    const t = cols.map((col) => dot(col, y));
    const x = t.map((tj, j) => xOf(j, tj));
    const g = b.map((bq, q) => cols.reduce((s, col, j) => s + col[q] * x[j], 0) - bq);
    const gn = Math.hypot(...g);
    if (gn < 1e-9 * nb) break;
    if (gn < bestG * 0.999) { bestG = gn; since = 0; } else if (++since > 25 && gn > 1e-3 * nb) break;
    const scale = Math.max(1e-12, ...cols.map((col, j) => dot(col, col) / cost[j]));
    const Hm = b.map((_, p) => b.map((_, q) => cols.reduce((s, col, j) => s + (x[j] > lo[j] && x[j] < hi[j] ? (col[p] * col[q]) / cost[j] : 0), 0) + (p === q ? 1e-9 * scale : 0)));
    const d = solveN(Hm, g).map((v) => -v);
    let step = 1;
    const f0 = phi(y), slope = dot(g, d);
    while (step > 1e-10 && phi(y.map((v, q) => v + step * d[q])) > f0 + 1e-4 * step * slope) step /= 2;
    y = y.map((v, q) => v + step * d[q]);
  }
  const x = cols.map((col, j) => xOf(j, dot(col, y)));
  const r = b.map((bq, q) => cols.reduce((s, col, j) => s + col[q] * x[j], 0) - bq);
  return { x, residual: Math.hypot(...r) / nb };
}

import { setFinger, refTension } from "./finger.js";

const rad = (d) => (d * Math.PI) / 180;
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (r, f) => r.x * f.y - r.y * f.x;
const dir = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
const interp = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]); } return pts.at(-1)[1]; };

export const INDEX_MUSCLES = ["FDPI", "FDSI", "EDCI", "EIP", "LUMI", "1stDI_MC2", "1stPI"];
export const THUMB_MUSCLES = ["FPL", "FPB", "OPP", "APB", "ADPt", "ADPo", "1stDI_MC1", "EPL", "EPB", "APL"];
/** The thumb's long (forearm) muscles; the rest of THUMB_MUSCLES sit in the hand (thenar, adductor, interosseus). */
export const THUMB_EXTRINSIC = ["FPL", "EPL", "EPB", "APL"];
/** A thumb strength factor: one number, or { extrinsic, intrinsic } for the long and the small muscles. */
export const thumbFactor = (strength, n) => (typeof strength === "number" ? strength : THUMB_EXTRINSIC.includes(n) ? strength.extrinsic : strength.intrinsic);
/** ARMS finger flexor slips by finger, for their force–length (active ÷ maximum force at the posture). */
const SLIPS = { index: "I", middle: "M", ring: "R", little: "L" };
const INDEX_COORDS = ["2mcp_flexion", "2pm_flexion", "2md_flexion"];
const THUMB_COORDS = ["cmc_flexion", "mp_flexion", "ip_flexion"];

/** A planar digit: joints, pad and its palm-side normal, for segment lengths and joint angles (degrees). */
function chain(lengths, angles, padAlong, padDepth) {
  let phi = 0, p = { x: 0, y: 0 };
  const joints = [p];
  lengths.forEach((L, k) => {
    phi += rad(angles[k]);
    if (k < lengths.length - 1) { p = add(p, dir(phi), L); joints.push(p); }
  });
  const volar = dir(phi + Math.PI / 2);
  const last = joints.at(-1), Ld = lengths.at(-1);
  return { joints, pad: add(add(last, dir(phi), padAlong * Ld), volar, padDepth), tip: add(last, dir(phi), Ld), volar, phi };
}

/**
 * Geometry for an object width w (metres): each digit in its own plane, `ex.pincer` giving the
 * lengths, the posture tables (index angles by width in mm, thumb MCP / IP) and the pad position.
 * Index: MCP (first angle, measured from the metacarpal), PIP, DIP. Thumb: base fixed at 0 (only
 * the chain's shape matters for its joint moments), MCP, IP.
 */
export function pincerGeometry(ex, w) {
  const P = ex.pincer, L = P.lengths, mm = w * 1000;
  const a = { mcp: interp(P.index.mcp, mm), pip: interp(P.index.pip, mm), dip: interp(P.index.dip, mm) };
  const index = chain([L.index.proximal, L.index.middle, L.index.distal], [a.mcp, a.pip, a.dip], P.padAlong, P.padDepth);
  const at = (t) => (Array.isArray(t) ? interp(t, mm) : t); // a number or a table by width (mm)
  const t = { mcp: at(P.thumb.mcp), ip: at(P.thumb.ip) };
  const thumb = chain([L.thumb.metacarpal, L.thumb.proximal, L.thumb.distal], [0, t.mcp, t.ip], P.padAlong, P.padDepth);
  return { width: w, angles: { index: a, thumb: t }, index, thumb };
}

/** The muscles' data at width w: ARMS moment arms and forces, interpolated between the exported postures. */
function musclesAt(data, w) {
  const keys = Object.keys(data.postures).sort((p, q) => data.widths[p] - data.widths[q]);
  const ws = keys.map((k) => data.widths[k]);
  const x = Math.min(ws.at(-1), Math.max(ws[0], w * 1000));
  let i = 0;
  while (i < ws.length - 2 && x > ws[i + 1]) i++;
  const u = (x - ws[i]) / (ws[i + 1] - ws[i] || 1);
  const A = data.postures[keys[i]].muscles, B = data.postures[keys[Math.min(i + 1, keys.length - 1)]].muscles;
  const mix = (p, q) => (1 - u) * p + u * q;
  return Object.fromEntries(Object.keys(A).map((n) => [n, { active: mix(A[n].active, B[n].active), max: A[n].max,
    arms: Object.fromEntries(Object.keys(A[n].arms).map((c) => [c, mix(A[n].arms[c], B[n].arms[c])])) }]));
}

/**
 * Flexion moments (N·m per N of squeeze) the muscles of one digit must supply, proximal joint
 * first. The block presses the pad along its normal (1 N) and, holding the block's weight by
 * friction, pulls it towards the fingertip by `slip` N (the friction used per newton of squeeze:
 * μ when the hand squeezes no harder than it must). Digits point down the block's faces.
 */
function digitNeed(d, slip = 0) {
  const f = { x: -d.volar.x + slip * Math.cos(d.phi), y: -d.volar.y + slip * Math.sin(d.phi) };
  return d.joints.map((j) => -cross(sub(d.pad, j), f));
}
/** Index MCP, PIP, DIP, then thumb base, MCP, IP; `slip` = {index, thumb}. */
function needPerNewton(G, slip = {}) {
  return [...digitNeed(G.index, slip.index ?? 0), ...digitNeed(G.thumb, slip.thumb ?? 0)];
}

/**
 * Level 0, pliers: rigid jaws on the index MCP and the thumb base, FDP and FPL. Muscle force =
 * squeeze × lever ÷ tendon moment arm; the weaker jaw sets the maximum squeeze.
 */
export function pliers(ex, data, w, slip = {}) {
  const G = pincerGeometry(ex, w);
  if (!G) return null;
  const M = musclesAt(data, w), need = needPerNewton(G, slip);
  const jaws = [
    { id: "index", muscle: "FDPI", lever: need[0], arm: M.FDPI.arms["2mcp_flexion"], force: M.FDPI.active },
    { id: "thumb", muscle: "FPL", lever: need[3], arm: M.FPL.arms.cmc_flexion, force: M.FPL.active },
  ].map((j) => ({ ...j, maxSqueeze: j.lever > 0 ? (j.force * j.arm) / j.lever : Infinity, perNewton: j.lever / j.arm }));
  return { geometry: G, jaws, maxSqueeze: Math.min(...jaws.map((j) => j.maxSqueeze)) };
}

/**
 * Level 1, jointed: all six flexion joints balanced for a squeeze of `squeezeN` (N, or
 * {index, thumb} when the index finger carries only its share of the thumb's), by the index and
 * thumb muscles (least summed squared activation, 0–1). Returns activations and whether it holds.
 */
export function jointed(ex, data, w, squeezeN, slip = {}) {
  const sq = typeof squeezeN === "number" ? { index: squeezeN, thumb: squeezeN } : squeezeN;
  const G = pincerGeometry(ex, w);
  if (!G) return null;
  const M = musclesAt(data, w), need = needPerNewton(G, slip);
  const coords = [...INDEX_COORDS, ...THUMB_COORDS];
  const names = [...INDEX_MUSCLES, ...THUMB_MUSCLES].filter((n) => M[n]);
  const cols = names.map((n) => coords.map((c) => M[n].arms[c] * M[n].active));
  const b = need.map((v, k) => v * (k < 3 ? sq.index : sq.thumb));
  const { x, residual } = boundedLeastSquares(cols, b, cols.map(() => 1), cols.map(() => 0), cols.map(() => 1));
  return { geometry: G, act: Object.fromEntries(names.map((n, j) => [n, x[j]])), holds: residual < 1e-3, need: b };
}

/** ARMS names per finger: digit number (coordinates) and muscle suffix. */
export const FINGERS = { index: { d: "2", s: "I" }, middle: { d: "3", s: "M" }, ring: { d: "4", s: "R" }, little: { d: "5", s: "L" } };
/** Muscles acting on the fingers in ARMS (wrist muscles left out: the wrist isn't balanced here). */
const FINGER_MUSCLES = ["FDPI", "FDPM", "FDPR", "FDPL", "FDSI", "FDSM", "FDSR", "FDSL", "EDCI", "EDCM", "EDCR", "EDCL", "EIP", "EDM",
  "LUMI", "LUMM", "LUMR", "LUML", "1stDI_MC2", "2ndDI", "3rdDI", "4thDI", "1stPI", "2ndPI", "3rdPI", "ADM", "FDM"];

/**
 * Level 2, the whole hand: the thumb against `fingers` (ids from FINGERS), each finger its own
 * planar chain (its own bone lengths, ARMS moment arms and muscle forces; every finger in the
 * index finger's measured posture, an estimate), all sharing the squeeze N. The fingers share no
 * muscles (each has its own flexor slips, extensor and small muscles; the deep flexor's common
 * belly isn't modelled here), so least summed squared activation splits exactly: finger i alone
 * costs c_i·N_i² (c_i from its own balance at 1 N), and the total is least with N_i ∝ 1/c_i.
 * Every joint of every digit is balanced. Returns activations, each finger's share and whether
 * it holds.
 */
const unitCache = new Map();
/** Posture offsets tried per joint (degrees) and the penalty per degree² for leaving the measured posture. */
const OFFSETS = [-20, -10, 0, 10, 20];
const STRAY = 1e-6;
/**
 * One finger at width w: the posture near the measured one (index finger's angles ± 20° per
 * joint) in which its muscles balance a 1 N squeeze with the least summed squared activation
 * (plus a small penalty for straying); its own muscles only. Fingers whose tendons can't balance
 * the index finger's exact angles (the knuckle bends too much for the middle joints) settle where
 * they can, as real fingers do.
 */
function fingerUnit(ex, data, w, id, slip = 0) {
  const key = `${ex.id}|${w}|${id}|${slip}`;
  if (!unitCache.has(key)) {
    const P = ex.pincer, a0 = pincerGeometry(ex, w).angles.index, L = P.fingers?.[id] ?? P.lengths.index;
    const M = musclesAt(data, w);
    const rows = ["mcp", "pm", "md"].map((j) => `${FINGERS[id].d}${j}_flexion`);
    const names = FINGER_MUSCLES.filter((n) => M[n] && rows.some((r) => Math.abs(M[n].arms[r] ?? 0) > 1e-6));
    const cols = names.map((n) => rows.map((r) => (M[n].arms[r] ?? 0) * M[n].active));
    const at = (dm, dp, dd) => {
      const ang = { mcp: a0.mcp + dm, pip: Math.max(0, a0.pip + dp), dip: a0.dip + dd };
      const need = digitNeed(chain([L.proximal, L.middle, L.distal], [ang.mcp, ang.pip, ang.dip], P.padAlong, P.padDepth), slip);
      const solve = (N) => { const { x, residual } = boundedLeastSquares(cols, need.map((v) => v * N), cols.map(() => 1), cols.map(() => 0), cols.map(() => 1)); return { act: Object.fromEntries(names.map((n, j) => [n, x[j]])), holds: residual < 1e-3, cost: x.reduce((s, v) => s + v * v, 0) }; };
      const u = solve(1);
      return { ang, solve, cost: u.cost, holds: u.holds, score: u.cost + STRAY * (dm * dm + dp * dp + dd * dd) };
    };
    let best = at(0, 0, 0);
    if (!best.holds) best = { ...best, score: Infinity };
    for (const dm of OFFSETS) for (const dp of OFFSETS) for (const dd of OFFSETS) {
      const t = at(dm, dp, dd);
      if (t.holds && t.score < best.score) best = t;
    }
    unitCache.set(key, best);
  }
  return unitCache.get(key);
}

export function fullHand(ex, data, w, squeezeN, fingers = Object.keys(FINGERS), slip = {}) {
  const units = fingers.map((id) => fingerUnit(ex, data, w, id, slip.finger ?? 0));
  const inv = units.map((u) => 1 / u.cost), sum = inv.reduce((a, b) => a + b, 0);
  const share = Object.fromEntries(fingers.map((id, i) => [id, inv[i] / sum]));
  const parts = fingers.map((id, i) => units[i].solve(squeezeN * share[id]));
  // The thumb: its three joints against the whole squeeze (as in level 1, without the index finger).
  const G = pincerGeometry(ex, w), M = musclesAt(data, w);
  const tn = digitNeed(G.thumb, slip.thumb ?? 0);
  const tNames = THUMB_MUSCLES.filter((n) => M[n]);
  const tCols = tNames.map((n) => THUMB_COORDS.map((c) => M[n].arms[c] * M[n].active));
  const t = boundedLeastSquares(tCols, tn.map((v) => v * squeezeN), tCols.map(() => 1), tCols.map(() => 0), tCols.map(() => 1));
  const act = Object.assign({}, ...parts.map((p) => p.act), Object.fromEntries(tNames.map((n, j) => [n, t.x[j]])));
  const postures = Object.fromEntries(fingers.map((id, i) => [id, units[i].ang]));
  return { geometry: G, act, share, postures, holds: t.residual < 1e-3 && parts.every((p) => p.holds) };
}

/**
 * One finger's posture at width w with friction mu: near the index finger's measured angles (± 20°
 * per joint), the one in which this finger alone presses 1 N into the face (its force anywhere in
 * its friction cone) with the least summed squared activation, plus a small penalty for straying.
 * Fingers whose tendons can't balance the index finger's exact angles settle where they can.
 */
const postureCache = new Map();
export function fingerPosture(ex, data, w, id, mu = 0) {
  const key = `${ex.id}|${w}|${id}|${mu}`;
  if (!postureCache.has(key)) {
    const P = ex.pincer, a0 = pincerGeometry(ex, w).angles.index, L = P.fingers?.[id] ?? P.lengths.index;
    const M = musclesAt(data, w);
    const rows = ["mcp", "pm", "md"].map((j) => `${FINGERS[id].d}${j}_flexion`);
    const names = FINGER_MUSCLES.filter((n) => M[n] && rows.some((r) => Math.abs(M[n].arms[r] ?? 0) > 1e-6));
    const mcols = names.map((n) => [...rows.map((r) => (M[n].arms[r] ?? 0) * M[n].active), 0]);
    let best = null;
    for (const dm of OFFSETS) for (const dp of OFFSETS) for (const dd of OFFSETS) {
      const ang = { mcp: a0.mcp + dm, pip: Math.max(0, a0.pip + dp), dip: a0.dip + dd };
      const d = chain([L.proximal, L.middle, L.distal], [ang.mcp, ang.pip, ang.dip], P.padAlong, P.padDepth);
      const edges = [1, -1].map((s) => [...digitNeed(d, s * mu).map((v) => -v), 1]);
      const cols = [...mcols, ...edges];
      const { x, residual } = boundedLeastSquares(cols, [0, 0, 0, 1], cols.map((_, j) => (j < names.length ? 1 : 1e-6)), cols.map(() => 0), cols.map((_, j) => (j < names.length ? 1 : 10)));
      if (residual > 1e-3) continue;
      const score = x.slice(0, names.length).reduce((s, v) => s + v * v, 0) + STRAY * (dm * dm + dp * dp + dd * dd);
      if (!best || score < best.score) best = { ang, score };
    }
    postureCache.set(key, best?.ang ?? { ...a0 });
  }
  return postureCache.get(key);
}

/**
 * The whole hand holding a hanging block of weight W (N) between the thumb and `fingers`, with
 * friction: each pad's force lies inside its friction cone, written as a non-negative mix of the
 * cone's two edges (−normal ± μ·along the digit; + pulls towards the fingertip, as the hanging
 * block does), so the squeeze and how much of the weight each pad carries are free. Solved
 * together: every joint of every digit balanced, the thumb pressing as hard as all fingers
 * (the block's sideways balance), the pads' along-the-digit forces adding up to W, least summed
 * squared activation plus a tiny cost per newton² of contact force (no squeezing harder than
 * needed for nothing). Postures: each finger near the index finger's measured posture, where it presses best (fingerPosture).
 * opts: mu = {thumb, finger} (friction per pad), strength (× every muscle's force), squeeze (fix
 * the thumb's pressing force instead of the weight, for calibration). Returns { holds, act,
 * digits: {id: {N, T}}, squeezeN }.
 */
const FU = 100; // newtons per contact-force unknown in handHold
export function handHold(ex, data, w, W, { fingers = Object.keys(FINGERS), mu = { thumb: 0, finger: 0 }, strength = 1, squeeze = null, quadriga = true } = {}) {
  const P = ex.pincer, M = musclesAt(data, w);
  const G = pincerGeometry(ex, w), a = G.angles.index;
  const digits = [...fingers.map((id) => {
    const L = P.fingers?.[id] ?? P.lengths.index;
    const q = fingerPosture(ex, data, w, id, mu.finger);
    return { id, ang: q, d: chain([L.proximal, L.middle, L.distal], [q.mcp, q.pip, q.dip], P.padAlong, P.padDepth), rows: ["mcp", "pm", "md"].map((j) => `${FINGERS[id].d}${j}_flexion`), mu: mu.finger, thumb: false };
  }), { id: "thumb", d: G.thumb, rows: THUMB_COORDS, mu: mu.thumb, thumb: true }];
  const rows = digits.flatMap((g) => g.rows);
  const R = rows.length; // then: sideways balance (thumb N − Σ finger N = 0), then the weight (Σ T = W) or the thumb's squeeze
  const names = [...FINGER_MUSCLES, ...THUMB_MUSCLES].filter((n) => M[n] && rows.some((r) => Math.abs(M[n].arms[r] ?? 0) > 1e-6));
  const cols = names.map((n) => [...rows.map((r) => (M[n].arms[r] ?? 0) * M[n].active * strength), 0, 0]);
  // Two cone edges per pad: moments the muscles must match (negative in the column), its normal and along-the-digit parts.
  const edgeCols = [];
  digits.forEach((g, i) => {
    for (const s of [1, -1]) {
      const need = digitNeed(g.d, s * g.mu);
      // In units of FU newtons, so these unknowns are scaled like the activations (0–1).
      const col = new Array(R + 2).fill(0);
      need.forEach((v, k) => { col[rows.indexOf(g.rows[k])] = -v * FU; });
      col[R] = (g.thumb ? 1 : -1) * FU;
      col[R + 1] = (squeeze == null ? s * g.mu : g.thumb ? 1 : 0) * FU;
      edgeCols.push({ col, i, s });
    }
  });
  let all = [...cols, ...edgeCols.map((e) => e.col)];
  let b = [...new Array(R).fill(0), 0, squeeze == null ? W : squeeze];
  // The quadriga: the deep flexor slips of the middle, ring and little finger share one muscle
  // belly, so they pull at the same activation (extra rows: a_i − a_j = 0).
  const slips = quadriga ? ["FDPM", "FDPR", "FDPL"].filter((n) => names.includes(n)) : [];
  for (let k = 1; k < slips.length; k++) {
    all = all.map((col, j) => [...col, j === names.indexOf(slips[k - 1]) ? 1 : j === names.indexOf(slips[k]) ? -1 : 0]);
    b = [...b, 0];
  }
  const nm = names.length;
  const { x, residual } = boundedLeastSquares(all, b, all.map((_, j) => (j < nm ? 1 : 1e-6 * FU * FU)), all.map(() => 0), all.map((_, j) => (j < nm ? 1 : 4000 / FU)));
  const out = Object.fromEntries(digits.map((g) => [g.id, { N: 0, T: 0 }]));
  edgeCols.forEach((e, k) => { const v = x[nm + k] * FU; const g = digits[e.i]; out[g.id].N += v; out[g.id].T += e.s * g.mu * v; });
  const postures = Object.fromEntries(digits.filter((g) => !g.thumb).map((g) => [g.id, g.ang]));
  return { holds: residual < 1e-3, act: Object.fromEntries(names.map((n, j) => [n, x[j]])), digits: out, squeezeN: out.thumb.N, postures, residual };
}

/**
 * The whole hand on a hanging block, thumb from ARMS, fingers from the edge-lift finger model
 * (edgeEx: the edge-lift exercise data). Each finger: the deep flexor (FDP) alone bends the
 * fingertip joint, the superficial flexor (FDS) the middle joint with the FDP's help (both as a
 * share of that finger's reference tension, moment arms scaled from the index finger by size, plus
 * the tendons' bowstringing as the middle joint bends); a middle-joint extensor may hold an
 * over-flexing FDP; the knuckle is left to the small hand muscles, as in the edge lift. Thumb: its
 * three joints balanced by its ARMS muscles (× strength). Contacts and solve as in handHold:
 * friction cones, sideways and weight balance, least summed squared activation.
 * opts: fingers, mu {thumb, finger}, strength (thumb muscles), fingerStrength (finger tendons),
 * squeeze (fix the thumb's pressing force instead of the weight). Returns { holds, act, digits, squeezeN }.
 */
export function pinchHand(ex, data, edgeEx, w, W, { fingers = Object.keys(FINGERS), mu = { thumb: 0, finger: 0 }, strength = 1, fingerStrength = 1, squeeze = null } = {}) {
  const P = ex.pincer, M = musclesAt(data, w);
  const G = pincerGeometry(ex, w), a = G.angles.index;
  const bow = (pts) => interp(pts, a.pip);
  // Finger force–length: the edge-lift model's reference tensions times the ARMS flexor's force at
  // full activation ÷ its maximum at this width, relative to 60 mm (the middle of the measured
  // postures). Small: ARMS's FDP and FDS stay at 93–99% from 20 to 110 mm.
  const M60 = musclesAt(data, 0.06);
  const fl = (n) => (M[n] && M60[n] ? (M[n].active / M[n].max) / (M60[n].active / M60[n].max) : 1);
  // Fingers lying along the face (a variant's `contact`): every segment on the face may carry
  // force, so the knuckle is balanced too (else a push near it would cost nothing).
  const contact = contactAt(P, w);
  const J = contact ? 3 : 2; // rows per finger: [MCP,] PIP, DIP
  // Rows: per finger; then the thumb's three joints; then sideways and weight (or squeeze); with
  // contact, then the block's turning balance (in its plane).
  const fRows = fingers.length * J, R = fRows + 3, turn = R + 2;
  const cols = [], cost = [], hi = [], names = [];
  const row = () => new Array(R + (contact ? 3 : 2)).fill(0);
  const thumbHeight = contact ? thumbHeightAt(data, w) : 0;
  const digits = [];
  const armsCols = new Map(); // ARMS muscles by name (thumb muscles and the knuckles' small muscles)
  const armsCol = (n) => { if (!armsCols.has(n)) { armsCols.set(n, row()); names.push(n); cols.push(armsCols.get(n)); cost.push(1); hi.push(1); } return armsCols.get(n); };
  fingers.forEach((id, i) => {
    const g = setFinger(edgeEx, id), T = refTension(edgeEx, id), r = g.momentArms;
    const L = g.lengths;
    const pip = J * i + J - 2, dip = pip + 1, mcp = contact ? J * i : null;
    if (contact) {
      for (const [k, s] of contactPoints(contact)) digits.push({ id, d: segmentContact([L.proximal, L.middle, L.distal], [a.mcp, a.pip, a.dip], k, s, P.padDepth), rows: [mcp, pip, dip], mu: mu.finger, thumb: false, seg: k,
        height: heightOnFace([L.proximal, L.middle, L.distal], k, s, P.padAlong) });
    } else {
      const d = chain([L.proximal, L.middle, L.distal], [a.mcp, a.pip, a.dip], P.padAlong, P.padDepth);
      digits.push({ id, d: { need: (s) => digitNeed(d, s).slice(1) }, rows: [pip, dip], mu: mu.finger, thumb: false });
    }
    const sP = fingerStrength * fl(`FDP${SLIPS[id]}`), sS = fingerStrength * fl(`FDS${SLIPS[id]}`);
    const fdp = row(); fdp[pip] = (r.fdpPip + bow(g.bowstring.fdp)) * T.fdp * sP; fdp[dip] = r.fdpDip * T.fdp * sP;
    const fds = row(); fds[pip] = (r.fdsPip + bow(g.bowstring.fds)) * T.fds * sS;
    const ext = row(); ext[pip] = -r.fdsPip * T.fds * fingerStrength; // the extensor mechanism at the middle joint (estimate: as strong as the FDS there)
    if (contact) {
      fdp[mcp] = r.fdpMcp * T.fdp * sP; fds[mcp] = r.fdsMcp * T.fds * sS;
      // The knuckle's other flexors (interossei, lumbrical, the little finger's hypothenar muscles): ARMS, at its strength.
      const coord = `${FINGERS[id].d}mcp_flexion`;
      // (The first dorsal interosseus also moves the thumb: at the knuckle it keeps its ARMS strength, the thumb's calibration factor stays on the thumb.)
      for (const [n, m] of Object.entries(M)) if (!/^(FDP|FDS|EDC|EIP|EDM)/.test(n) && (m.arms[coord] ?? 0) > 1e-4) armsCol(n)[mcp] = m.arms[coord] * m.active * fingerStrength;
    }
    cols.push(fdp, fds, ext); cost.push(1, 1, 1); hi.push(1, 1, 1); names.push(`FDP_${id}`, `FDS_${id}`, `EXT_${id}`);
  });
  for (const n of THUMB_MUSCLES.filter((x) => M[x])) { const col = armsCol(n); THUMB_COORDS.forEach((c, k) => { col[fRows + k] = M[n].arms[c] * M[n].active * thumbFactor(strength, n); }); }
  digits.push({ id: "thumb", d: { need: (s) => digitNeed(G.thumb, s) }, rows: [fRows, fRows + 1, fRows + 2], mu: mu.thumb, thumb: true, height: thumbHeight });
  const nm = cols.length;
  const edges = [];
  digits.forEach((g, i) => {
    for (const s of [1, -1]) {
      const col = row();
      g.d.need(s * g.mu).forEach((v, k) => { col[g.rows[k]] = -v * FU; });
      col[R] = (g.thumb ? 1 : -1) * FU;
      col[R + 1] = (squeeze == null ? s * g.mu : g.thumb ? 1 : 0) * FU;
      // Turning: Σ finger N·height = thumb N·height + (w/2)(thumb friction − finger friction) (the weight hangs from the middle), per cm.
      if (contact) col[turn] = (g.thumb ? -1 : 1) * (g.height + (w / 2) * s * g.mu) * 100 * FU;
      cols.push(col); cost.push(1e-6 * FU * FU); hi.push(4000 / FU); edges.push({ i, s });
    }
  });
  const b = [...new Array(R).fill(0), 0, squeeze == null ? W : squeeze, ...(contact ? [0] : [])];
  const { x, residual } = boundedLeastSquares(cols, b, cost, cols.map(() => 0), hi);
  const out = Object.fromEntries(digits.map((g) => [g.id, { N: 0, T: 0 }]));
  edges.forEach((e, k) => {
    const v = x[nm + k] * FU, g = digits[e.i];
    out[g.id].N += v; out[g.id].T += e.s * g.mu * v;
    if (g.seg != null) (out[g.id].segments ??= [0, 0, 0])[g.seg] += v; // N on the proximal, middle, distal phalanx
  });
  return { holds: residual < 1e-3, act: Object.fromEntries(names.map((n, j) => [n, x[j]])), digits: out, squeezeN: out.thumb.N, residual, contact };
}

/**
 * The fingers' contact with the face at width w: "mcp" (straight, the whole finger on it), "pip"
 * (the middle and distal phalanges) or "dip" (the distal phalanx), from the variant's table
 * (pincer.contact: [[mm, mode], ...], the nearest width); null: the pad alone (pinchHand's default).
 */
export function contactAt(P, w) {
  if (!P.contact) return null;
  const mm = w * 1000;
  return P.contact.reduce((best, c) => (Math.abs(c[0] - mm) < Math.abs(best[0] - mm) ? c : best))[1];
}

/** The thumb pad's height on the face above the index pad (m) at width w (tools/arms_pinch_contact.py, linear between widths). */
function thumbHeightAt(data, w) {
  const keys = Object.keys(data.thumbBase).sort((p, q) => data.widths[p] - data.widths[q]);
  return interp(keys.map((k) => [data.widths[k], data.thumbBase[k].alongFaceMm / 1000]), w * 1000);
}

/** A contact's height on the face above the finger's pad (m): the segments on the face lie along it (estimate: every finger's pad at the index pad's height). */
function heightOnFace(lengths, k, s, padAlong) {
  const [Lp, Lm, Ld] = lengths;
  return [padAlong * Ld + Lm + (1 - s) * Lp, padAlong * Ld + (1 - s) * Lm, (padAlong - s) * Ld][k];
}

/**
 * Contact points on the face: two per segment on it, near its ends (fractions along it; the
 * distal one's pad), so any mix of the two puts the push anywhere between. Segments: 0 proximal,
 * 1 middle, 2 distal phalanx. Estimates.
 */
const SPANS = [[0.3, 0.9], [0.1, 0.9], [0.2, 0.8]];
function contactPoints(mode) {
  const segs = { mcp: [0, 1, 2], pip: [1, 2], dip: [2] }[mode];
  return segs.flatMap((k) => SPANS[k].map((s) => [k, s]));
}

/**
 * One contact on segment k of a finger chain (MCP at the origin), `s` along it, `depth` to the palm
 * side: its joint moments per newton pressed into the face ([MCP, PIP, DIP]; joints beyond the
 * segment carry none), friction `slip` along the segment as in digitNeed.
 */
function segmentContact(lengths, angles, k, s, depth) {
  let phi = 0, p = { x: 0, y: 0 };
  const joints = [];
  for (let j = 0; j <= k; j++) { phi += rad(angles[j]); joints.push(p); if (j < k) p = add(p, dir(phi), lengths[j]); }
  const volar = dir(phi + Math.PI / 2), c = add(add(p, dir(phi), s * lengths[k]), volar, depth);
  return {
    need: (slip) => {
      const f = { x: -volar.x + slip * Math.cos(phi), y: -volar.y + slip * Math.sin(phi) };
      return [0, 1, 2].map((j) => (j <= k ? -cross(sub(c, joints[j]), f) : 0));
    },
  };
}

/** The largest weight (N) the hand holds at width w (bisection on handHold). */
export function maxHold(ex, data, w, opts) {
  const ok = (W) => handHold(ex, data, w, W, opts).holds;
  let lo = 0, hi = 50;
  while (ok(hi) && hi < 1e5) { lo = hi; hi *= 2; }
  for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

/** The largest straight squeeze (N, no friction pull) the hand gives at width w: for calibrating its strength. */
export function maxSqueeze(ex, data, w, opts) {
  const ok = (N) => handHold(ex, data, w, 0, { ...opts, mu: { thumb: 0, finger: 0 }, squeeze: N }).holds;
  let lo = 0, hi = 4;
  while (ok(hi) && hi < 1e5) { lo = hi; hi *= 2; }
  for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

/** The largest squeeze (N) the jointed pincer holds at width w (bisection). */
export function maxJointed(ex, data, w, hi = 400) {
  const ok = (F) => jointed(ex, data, w, F)?.holds;
  if (!ok(0.1)) return 0;
  let lo = 0.1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}
