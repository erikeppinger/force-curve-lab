// Estimated relative muscle activation (0–1) from the statics result.
// Illustrative model: activation = demand on the joint × the muscle's angle-dependent
// weight × variant modifier. Not EMG — see "weight" tables in the exercise JSON.
// Drivers: "jointEffort" (prime movers and synergists of the moving joint) and
// "stabiliserDemand" (holding the proximal segment still, e.g. the upper arm in a curl).

import { interp } from "./physics.js";

export function muscleActivation(exercise, variant, result, angleDeg) {
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
