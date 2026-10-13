// Estimated relative muscle activation (0–1) from the statics result.
// Illustrative model: activation = demand on the joint × the muscle's angle-dependent
// weight × variant modifier. Not EMG — see "weight" tables in the exercise JSON.
// Drivers: "jointEffort" (prime movers and synergists of the moving joint) and
// "stabiliserDemand" (holding the proximal segment still, e.g. the upper arm in a curl).
// Multi-joint exercises: each muscle names its `joint`; its weight table is indexed by that
// joint's angle. Driver "none" = not modelled (value null).
// Edge lift (model "finger"): driver "tendon", value = the tendon's tension ÷ its reference tension.
// Hip abduction / adduction (`hipModel`): driver "hipModel", static optimisation over the OpenSim
// hip muscles (js/hipmodel.js); a listed muscle shows the mean of its model parts (`osim`).

import { interp } from "./physics.js";
import { hipActivations, groupActivation } from "./hipmodel.js";

/** Bilinear in { hip: [...], knee: [...], factor: [hip][knee] }, held at the edges. */
function grid2(t, hip, knee) {
  const at = (xs, x) => { const v = Math.min(xs.at(-1), Math.max(xs[0], x)); let i = 0; while (i < xs.length - 2 && v > xs[i + 1]) i++; return [i, (v - xs[i]) / (xs[i + 1] - xs[i])]; };
  const [i, u] = at(t.hip, hip), [j, w] = at(t.knee, knee), f = t.factor;
  return (1 - u) * ((1 - w) * f[i][j] + w * f[i][j + 1]) + u * ((1 - w) * f[i + 1][j] + w * f[i + 1][j + 1]);
}

export function muscleActivation(exercise, variant, result, angleDeg) {
  // Edge lift: the statics give each flexor tendon's tension directly; scale it by the tension
  // measured at a maximal one-finger effort.
  if (exercise.model === "finger") {
    return exercise.muscles.map((m) => ({
      ...m,
      value: Math.min(1, result.tendons[m.tendon] / exercise.finger.referenceTension[m.tendon]),
      tension: result.tendons[m.tendon],
    }));
  }
  // Pinch lift: the pincer model's activations (scaled to the measured maximum), the largest of a
  // group's parts; a grip that fails puts every working muscle at its limit.
  if (exercise.model === "pinch") {
    return exercise.muscles.map((m) => {
      const parts = m.parts.filter((p) => result.act == null || p in result.act);
      if (!parts.length) return { ...m, value: null };
      return { ...m, value: result.act == null ? 1 : Math.min(1, Math.max(0, ...parts.map((p) => result.act[p]))) };
    });
  }
  if (exercise.model === "multi") {
    const acts = exercise.muscles.map((m) => {
      if (m.driver === "none") return { ...m, value: null };
      // A muscle can serve several joint components (`joints`, e.g. the lats: shoulder extension
      // and adduction); it takes the largest demand among them.
      const mod = variant.muscleModifiers?.[m.id] ?? 1;
      const value = Math.max(...(m.joints ?? [m.joint]).map((id) => {
        const j = result.joints.find((x) => x.id === id);
        // Two-sided joints: a muscle with `sign` only works when the torque has that sign.
        // `jointSign` sets it per joint (the hip thrust's hamstrings: hip extension, knee flexion).
        const sign = m.jointSign?.[id] ?? m.sign;
        if (sign && Math.sign(j.torque) !== sign) return 0;
        // `jointScale`: a joint the muscle follows at a fraction (e.g. the lats with the elbow in a pull).
        return j.effort * interp(m.weight, j.angle) * (m.jointScale?.[id] ?? 1);
      }));
      return { ...m, value: Math.min(1, Math.max(0, value * mod)) };
    });
    // `coContract` { with, joint, share }: a muscle that also has to hold against another muscle's
    // pull at its joint (the quadriceps against the hamstrings at the knee in a hip thrust). Its
    // load is the net torque plus the other muscle's activation × the opposite direction's
    // strength × its share of that strength, over this direction's strength.
    for (const m of acts) {
      const c = m.coContract;
      if (!c || m.value == null) continue;
      const other = acts.find((x) => x.id === c.with), j = result.joints.find((x) => x.id === c.joint);
      if (!other?.value || !j?.negative || !(j.capacity > 0)) continue;
      // Both directions' strength at this angle, with the joint's scale (strength slider, posture)
      // recovered from the capacity it reports for the direction its torque points in. The net
      // torque may point the other way (a bridge's knee): the muscle then holds only the excess.
      const pos = interp(j.strength.points, j.angle) * j.peakTorqueNm;
      const neg = interp(j.negative.points ?? j.strength.points, j.angle) * j.negative.peakTorqueNm;
      const k = j.capacity / (j.torque < 0 ? neg : pos);
      const load = (j.torque + other.value * neg * k * (c.share ?? 1)) / (pos * k);
      m.value = Math.min(1, Math.max(m.value, load * interp(m.weight, j.angle) * (variant.muscleModifiers?.[m.id] ?? 1)));
    }
    return acts;
  }
  const geo = exercise.hipModel?.geometry;
  const hipActs = geo && result.hip ? hipActivations(exercise, variant, result, geo) : null;
  return exercise.muscles.map((m) => {
    if (m.driver === "hipModel") return { ...m, value: hipActs && m.osim.length ? Math.min(1, groupActivation(m, hipActs, geo)) : null, parts: hipActs };
    const demand =
      m.driver === "stabiliserDemand"
        ? result.stabiliserDemand / exercise.stabiliserCapacityNm
        : result.effort;
    const mod = variant.muscleModifiers?.[m.id] ?? 1; // estimates; see the variant's notes
    // `kneeFactor`: the weight's change with the knee bend (e.g. the kickback's hamstrings), on a
    // hip × knee grid, bilinear and held at the edges.
    const kf = m.kneeFactor && result.knee != null ? grid2(m.kneeFactor, angleDeg, result.knee) : 1;
    // `placementFactor`: the weight's change with a placement slider (e.g. the calf raise's toe
    // angle: `points` by value), or with a choice (`values` by option, e.g. the arm's rotation).
    const pv = result.placement?.[m.placementFactor?.key] ?? variant.params?.[m.placementFactor?.key];
    const pf = !m.placementFactor ? 1 : m.placementFactor.values ? m.placementFactor.values[String(pv)] ?? 1 : interp(m.placementFactor.points, Number(pv ?? 0));
    const value = Math.min(1, Math.max(0, demand * interp(m.weight, angleDeg) * mod * kf * pf));
    return { ...m, value };
  });
}
