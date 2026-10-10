// Pinch lift: a block hanging from one hand, held between the thumb and the fingers.
// From the block's weight to the squeeze, from the squeeze to the muscles. Pure functions.
//
// 1. Squeeze. The block's two faces are vertical and parallel, so its sideways balance makes the
//    thumb press exactly as hard as all fingers together (N). Its weight is held by friction on
//    both faces. Finger pad friction grows less than in proportion to the pressing force,
//    F = μ·N0·(Ni/N0)^n per contact patch (Adams et al. 2013: 2/3 ≤ n ≤ 1; n = 1 is Amontons'
//    law), so the same squeeze spread over more patches (fingers) holds more. μ is the ordinary
//    coefficient at N0 = 10 N per patch.
// 2. Capacity. The most a hand squeezes a wooden pinch hold, measured with pressure mats in
//    advanced climbers (ex.pinch.capacity: N per face), × strength %, × a wrist factor (flexion
//    costs about 25% at 38°: Goislard de Monsabert et al. 2023). Effort = squeeze ÷ capacity.
// 3. Muscles. The pincer model (pincer.js: thumb and index finger, each a planar chain, ARMS
//    moment arms and muscle forces at the measured postures for this width) carries the thumb's
//    squeeze and one finger's share. Its own maximum is far below a real hand's (small thumb and
//    extensor muscles saturate first in a planar model), so at each width it is scaled so that it
//    fails exactly at the capacity: it shows how the load spreads over the muscles, not how
//    strong the hand is.

import { jointed, pliers, pincerGeometry, pinchHand } from "./pincer.js";

const G = 9.81;
export const N0 = 10;

/** Friction one face holds with squeeze N spread evenly over `patches` contact patches (N). */
export const faceFriction = (N, patches, mu, n) => (N > 0 ? mu * N0 * patches * (N / patches / N0) ** n : 0);

/** Squeeze (N) needed to hold weight W (N): the thumb face (one patch) plus the finger face. */
export function squeezeFor(W, { mu, n = 1, fingers }) {
  // Both faces' friction ∝ N^n: total = μ·N0·(N/N0)^n·(1 + fingers^(1−n)).
  const k = (mu * N0 * (1 + fingers ** (1 - n))) / N0 ** n;
  return W > 0 ? (W / k) ** (1 / n) : 0;
}

/** The weight (N) a squeeze N holds. */
export const holdsWeight = (N, { mu, n = 1, fingers }) => faceFriction(N, 1, mu, n) + faceFriction(N, fingers, mu, n);

/** Wrist factor on pinch strength: flexion costs up to 25% at 38° (linear, estimate); extension nothing. */
export const wristFactor = (deg) => 1 - 0.25 * Math.min(1, Math.max(0, deg / 38));

/**
 * Does the pincer hold a thumb squeeze `thumb` (N) with one finger carrying `index` (N)? Level 0:
 * pliers (FPL and FDP alone, each a rigid jaw on one pivot); level 1: jointed (every joint
 * balanced). Returns the activations (0–1) when it holds, else null.
 */
function holds(ex, data, w, thumb, index, level) {
  if (level === 0) {
    const [jI, jT] = pliers(ex, data, w).jaws;
    const act = { FDPI: (index * jI.perNewton) / jI.force, FPL: (thumb * jT.perNewton) / jT.force };
    return act.FDPI <= 1 && act.FPL <= 1 ? act : null;
  }
  const r = jointed(ex, data, w, { index, thumb });
  return r.holds ? r.act : null;
}

/** The model's own maximum thumb squeeze (model newtons) at width w, each finger carrying 1/fingers of it. */
const modelMaxCache = new Map();
function modelMax(ex, data, w, fingers, level) {
  const key = `${ex.id}|${w}|${fingers}|${level}`;
  if (!modelMaxCache.has(key)) {
    const ok = (m) => holds(ex, data, w, m, m / fingers, level);
    let lo = 0, hi = 8;
    while (ok(hi) && hi < 1e6) { lo = hi; hi *= 2; }
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    modelMaxCache.set(key, lo);
  }
  return modelMaxCache.get(key);
}

/**
 * Whole hand (level 2): thumb from ARMS, fingers from the edge-lift finger model, each pad's force
 * inside its friction cone (pincer.js pinchHand). The thumb's muscles are scaled once so that a
 * straight squeeze (no weight) at 65 mm reaches the measured maximum (ex.pinch.capacity); the
 * fingers keep their own measured reference tensions. Then the squeeze, its split between the
 * fingers and the largest block follow from the balance of every joint.
 * Strength and wrist scale every muscle alike, so the largest block and the squeeze there scale
 * in proportion (the balance is linear in the forces): they are found at full strength only. The
 * page reads them from a table (ex.pincer.whole, written by tools/pinch-table.mjs with
 * wholeMax below) and interpolates; without the table they are found here by bisection.
 */
export const WHOLE = { 4: ["index", "middle", "ring", "little"], 2: ["index", "middle"] };
const calibCache = new Map(), maxCache = new Map();
function bisect(ok, start, iters = 14) {
  let lo = 0, hi = start;
  while (ok(hi) && hi < 1e5) { lo = hi; hi *= 2; }
  for (let k = 0; k < iters; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}
/** The thumb's strength factor that makes a straight squeeze at 65 mm the measured maximum. */
export function thumbScale(ex, data) {
  if (ex.pincer.whole?.thumbScale) return ex.pincer.whole.thumbScale;
  if (!calibCache.has(ex.id)) {
    const s = bisect((N) => pinchHand(ex, data, ex.pincer.fingerModel, 0.065, 0, { squeeze: N }).holds, 4, 24);
    calibCache.set(ex.id, ex.pinch.capacity / s);
  }
  return calibCache.get(ex.id);
}
/** Largest weight (N) and the squeeze there at full strength, width w (m), friction mu {thumb, finger}. */
export function wholeMax(ex, data, w, fingers, mu, iters = 14) {
  const o = { fingers: WHOLE[fingers], mu, strength: thumbScale(ex, data), fingerStrength: 1 };
  const Wmax = bisect((x) => pinchHand(ex, data, ex.pincer.fingerModel, w, x, o).holds, Math.max(20, 2 * mu.thumb * ex.pinch.capacity), iters);
  return { Wmax, squeeze: Wmax > 0 ? pinchHand(ex, data, ex.pincer.fingerModel, w, Wmax * 0.999, o).squeezeN : 0 };
}
/** Linear interpolation weights of x on the grid g (held at the ends). */
function cell(g, x) {
  if (x <= g[0]) return [0, 0, 0];
  if (x >= g[g.length - 1]) return [g.length - 1, g.length - 1, 0];
  let i = 0;
  while (g[i + 1] < x) i++;
  return [i, i + 1, (x - g[i]) / (g[i + 1] - g[i])];
}
/** wholeMax from the table: trilinear in width, thumb μ and the fingers' μ ÷ the thumb's. */
function tableMax(t, mm, fingers, mu) {
  const T = t[fingers];
  const cs = [cell(t.widths, mm), cell(t.mu, mu.thumb), cell(T.ratio, mu.finger / mu.thumb)];
  const out = { Wmax: 0, squeeze: 0 };
  for (let k = 0; k < 8; k++) {
    let wt = 1;
    const idx = cs.map(([i0, i1, u], d) => { const hi = (k >> d) & 1; wt *= hi ? u : 1 - u; return hi ? i1 : i0; });
    if (!wt) continue;
    const [W, S] = T.max[idx[0]][idx[1]][idx[2]];
    out.Wmax += wt * W; out.squeeze += wt * S;
  }
  return out;
}
function analyzeWhole(ex, data, P, w, W, scale) {
  const edge = ex.pincer.fingerModel, k = WHOLE[P.fingers] ? +P.fingers : 4, fingers = WHOLE[k];
  // Friction per patch at the even split of the least squeeze (n < 1: lighter patches grip relatively more).
  const Nmin = squeezeFor(W, { mu: P.mu, n: P.n, fingers: k });
  const muAt = (Np) => (W > 0 && P.n < 1 ? P.mu * (Np / N0) ** (P.n - 1) : P.mu);
  const mu = { thumb: +muAt(Nmin).toFixed(3), finger: +muAt(Nmin / k).toFixed(3) };
  const t = ex.pincer.whole;
  let full;
  if (t) full = tableMax(t, w * 1000, k, mu);
  else {
    const key = JSON.stringify([ex.id, w, k, mu]);
    if (!maxCache.has(key)) { if (maxCache.size > 500) maxCache.clear(); maxCache.set(key, wholeMax(ex, data, w, k, mu)); }
    full = maxCache.get(key);
  }
  const Wmax = full.Wmax * scale, squeezeAtMax = full.squeeze * scale;
  const r = pinchHand(ex, data, edge, w, Math.min(W, Wmax * 0.999), { fingers, mu, strength: thumbScale(ex, data) * scale, fingerStrength: scale });
  const fN = fingers.reduce((s, id) => s + r.digits[id].N, 0);
  const holds = W <= Wmax && r.holds;
  return {
    W, squeezeN: holds ? r.squeezeN : Math.max(Nmin, squeezeAtMax), minSqueezeN: Nmin, capacityN: squeezeAtMax, effort: Wmax > 0 ? W / Wmax : Infinity, maxBlockKg: Wmax / G,
    shares: Object.fromEntries(fingers.map((id) => [id, fN > 0 ? r.digits[id].N / fN : 1 / k])),
    perFingerN: fN / k,
    friction: { thumb: r.digits.thumb.T, fingers: fingers.reduce((s, id) => s + r.digits[id].T, 0) },
    act: holds ? r.act : null,
  };
}

/**
 * The lift at block width widthMm. opts: loadKg, strengthPct, placement {mu, n, fingers, wrist,
 * level}. Returns the squeeze, the effort (squeeze ÷ capacity), the maximum block, the friction on
 * each face and the muscle activations at this load (null when the grip fails).
 */
export function analyzePinch(ex, data, v, widthMm, { loadKg, strengthPct = 100, placement } = {}) {
  const P = { ...v.params, ...placement };
  if (P.level === "whole") {
    const w = widthMm / 1000;
    const scale = (strengthPct / 100) * wristFactor(P.wrist ?? 0);
    return { widthMm, ...analyzeWhole(ex, data, P, w, loadKg * G, scale), geometry: pincerGeometry(ex, w), level: 2, fingers: P.fingers };
  }
  const fingers = P.fingers, level = P.level === "pliers" ? 0 : 1;
  const f = { mu: P.mu, n: P.n, fingers };
  const w = widthMm / 1000;
  const W = loadKg * G;
  const N = squeezeFor(W, f);
  const cap = ex.pinch.capacity * (strengthPct / 100) * wristFactor(P.wrist ?? 0);
  const effort = N / cap;
  const m = modelMax(ex, data, w, fingers, level) * Math.min(effort, 1.5);
  return {
    widthMm, W, squeezeN: N, perFingerN: N / fingers, capacityN: cap, effort,
    maxBlockKg: holdsWeight(cap, f) / G,
    friction: { thumb: faceFriction(N, 1, P.mu, P.n), fingers: faceFriction(N, fingers, P.mu, P.n) },
    act: effort <= 1 ? holds(ex, data, w, m, m / fingers, level) ?? {} : null,
    geometry: pincerGeometry(ex, w), level, fingers,
  };
}

/** The lift across the block-width range (for the charts). */
export function samplePinch(ex, data, v, opts, step = { ...v.params, ...opts?.placement }.level === "whole" ? 10 : 5) {
  const [lo, hi] = ex.angleRange;
  const out = [];
  for (let mm = lo; mm <= hi + 1e-9; mm += step) out.push(analyzePinch(ex, data, v, mm, opts));
  return out;
}
