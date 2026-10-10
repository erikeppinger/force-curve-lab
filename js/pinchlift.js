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

import { jointed, pliers, pincerGeometry } from "./pincer.js";

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
 * The lift at block width widthMm. opts: loadKg, strengthPct, placement {mu, n, fingers, wrist,
 * level}. Returns the squeeze, the effort (squeeze ÷ capacity), the maximum block, the friction on
 * each face and the muscle activations at this load (null when the grip fails).
 */
export function analyzePinch(ex, data, v, widthMm, { loadKg, strengthPct = 100, placement } = {}) {
  const P = { ...v.params, ...placement };
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
export function samplePinch(ex, data, v, opts, step = 5) {
  const [lo, hi] = ex.angleRange;
  const out = [];
  for (let mm = lo; mm <= hi + 1e-9; mm += step) out.push(analyzePinch(ex, data, v, mm, opts));
  return out;
}
