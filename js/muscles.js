// Estimated relative muscle activation (0–1) from the statics result.
// Illustrative model: activation = demand on the joint × the muscle's angle-dependent
// weight × variant modifier. Not EMG — see "weight" tables in the exercise JSON.
// Drivers: "jointEffort" (prime movers and synergists of the moving joint) and
// "stabiliserDemand" (holding the proximal segment still, e.g. the upper arm in a curl).
// Multi-joint exercises: each muscle names its `joint`; its weight table is indexed by that
// joint's angle. Driver "none" = not modelled (value null).
// Edge lift (model "finger"): driver "tendon", value = the tendon's tension ÷ its reference tension.

import { interp } from "./physics.js";

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
  return exercise.muscles.map((m) => {
    const demand =
      m.driver === "stabiliserDemand"
        ? result.stabiliserDemand / exercise.stabiliserCapacityNm
        : result.effort;
    const mod = variant.muscleModifiers?.[m.id] ?? 1; // estimates; see the variant's notes
    const value = Math.min(1, Math.max(0, demand * interp(m.weight, angleDeg) * mod));
    return { ...m, value };
  });
}
