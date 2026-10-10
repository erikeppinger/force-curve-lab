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
  for (let it = 0; it < 300; it++) {
    const t = cols.map((col) => dot(col, y));
    const x = t.map((tj, j) => xOf(j, tj));
    const g = b.map((bq, q) => cols.reduce((s, col, j) => s + col[q] * x[j], 0) - bq);
    if (Math.hypot(...g) < 1e-9 * nb) break;
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

const rad = (d) => (d * Math.PI) / 180;
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (r, f) => r.x * f.y - r.y * f.x;
const dir = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
const interp = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]); } return pts.at(-1)[1]; };

export const INDEX_MUSCLES = ["FDPI", "FDSI", "EDCI", "EIP", "LUMI", "1stDI_MC2", "1stPI"];
export const THUMB_MUSCLES = ["FPL", "FPB", "OPP", "APB", "ADPt", "ADPo", "1stDI_MC1", "EPL", "EPB", "APL"];
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

/** The largest squeeze (N) the jointed pincer holds at width w (bisection). */
export function maxJointed(ex, data, w, hi = 400) {
  const ok = (F) => jointed(ex, data, w, F)?.holds;
  if (!ok(0.1)) return 0;
  let lo = 0.1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}
