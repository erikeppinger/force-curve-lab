// Estimated relative muscle activation (0–1) from the statics result.
// Illustrative model: activation = demand on the joint × the muscle's angle-dependent
// weight × variant modifier. Not EMG — see "weight" tables in the exercise JSON.
// Drivers: "jointEffort" (prime movers and synergists of the moving joint) and
// "stabiliserDemand" (holding the proximal segment still, e.g. the upper arm in a curl).
// Multi-joint exercises: each muscle names its `joint`; its weight table is indexed by that
// joint's angle. Driver "none" = not modelled (value null).

import { interp } from "./physics.js";

export function muscleActivation(exercise, variant, result, angleDeg) {
  if (exercise.model === "multi") {
    return exercise.muscles.map((m) => {
      if (m.driver === "none") return { ...m, value: null };
      const j = result.joints.find((x) => x.id === m.joint);
      // Two-sided joints: a muscle with `sign` only works when the torque has that sign.
      if (m.sign && Math.sign(j.torque) !== m.sign) return { ...m, value: 0 };
      const mod = variant.muscleModifiers?.[m.id] ?? 1;
      return { ...m, value: Math.min(1, Math.max(0, j.effort * interp(m.weight, j.angle) * mod)) };
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
