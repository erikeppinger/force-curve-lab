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
  if (exercise.model === "multi") {
    return exercise.muscles.map((m) => {
      if (m.driver === "none") return { ...m, value: null };
      // A muscle can serve several joint components (`joints`, e.g. the lats: shoulder extension
      // and adduction); it takes the largest demand among them.
      const mod = variant.muscleModifiers?.[m.id] ?? 1;
      const value = Math.max(...(m.joints ?? [m.joint]).map((id) => {
        const j = result.joints.find((x) => x.id === id);
        // Two-sided joints: a muscle with `sign` only works when the torque has that sign.
        if (m.sign && Math.sign(j.torque) !== m.sign) return 0;
        return j.effort * interp(m.weight, j.angle);
      }));
      return { ...m, value: Math.min(1, Math.max(0, value * mod)) };
    });
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
    const value = Math.min(1, Math.max(0, demand * interp(m.weight, angleDeg) * mod * kf));
    return { ...m, value };
  });
}
