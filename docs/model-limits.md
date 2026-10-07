# Model limits: what broke when we added 15 standard exercises

We tried to add 5 standard upper-body and 10 standard leg exercises from the wger starter library to the single-joint model, to see where it stops working. Nine now work. Six can't be modelled honestly with one moving joint, so they're written up here instead of being added with made-up numbers.

| Exercise | Status | Variants |
|---|---|---|
| Triceps extension | ✅ added | cable pushdown, overhead dumbbell, lying EZ-bar (skullcrusher) |
| Front raise | ✅ added | dumbbell, cable from behind, chest-supported 45° incline |
| Chest fly | ✅ added | lying dumbbell, standing cable, pec deck |
| Straight-arm pulldown / pullover | ✅ added | cable pulldown, lying dumbbell pullover |
| Bench press | ❌ needs a multi-joint model | |
| Leg extension | ✅ added | machine, ankle weight |
| Leg curl | ✅ added | lying machine, seated machine, standing with ankle weight |
| Calf raise | ✅ added | single-leg with dumbbell, two-leg machine, seated machine |
| Hip abduction | ✅ added | standing cable, side-lying, standing machine |
| Glute kickback | ✅ added | standing cable, kneeling with ankle weight, machine |
| Squat | ❌ needs a multi-joint model | |
| Leg press | ❌ needs a multi-joint model | |
| Lunge / split squat | ❌ needs a multi-joint model | |
| Romanian deadlift | ❌ needs a balance constraint | |
| Hip thrust | ❌ statically indeterminate in this model | |

## What broke, and what changed to fix it

Each of these was a real break: the exercise either gave wrong numbers or couldn't be described at all.

1. **The model only knew arms.** Segments were called `upperArm` / `forearm` and the origin was always the shoulder. The chain is now generic (`proximal` / `distal`, base → mid → tip), so it can be hip → knee → ankle or knee → ankle → ball of the foot.
2. **Effort only counted flexion.** Effort was the torque resisting *flexion*, so every extension lift (triceps, leg extension, pulldown, kickback) showed 0% effort. Exercises now say which way the lift goes (`concentric: "decrease"`), and `jointTorque` is the torque resisting the lift. The animation labels lifting and lowering from the same setting.
3. **Joints bend different ways.** The knee flexes the opposite way to the elbow (`angleSense: -1`), and the ankle's 0° has the foot at right angles to the shin (`angleOffset: 90`).
4. **Gravity was fixed straight down.** Lying (skullcrusher, pullover, dumbbell fly, lying leg curl), kneeling (kickback), leaning (incline front raise) and horizontal-plane movements (pec deck, cable fly) need gravity in a different direction relative to the body, or none in the plane of motion. Each variant now has a `gravity` vector, and the figure turns the drawing so gravity points down the screen.
5. **Limbs weighed nothing.** Side-lying hip abduction with no ankle weight showed zero torque, although the leg (about 16% of body mass) is the whole load. Segment masses and centres of mass are now part of every exercise, with a body-mass slider. **This slightly changes the existing curl and lateral-raise numbers** (the forearm adds ~3.6 Nm at 90° in a curl, the arm ~12 Nm at the top of a lateral raise).
6. **No body weight or closed chains.** In a calf raise the floor pushes up on the ball of the foot with your body weight. There's now a `reaction` load with a body-weight share (1 on one leg, 0.5 on two, 0 seated).
7. **The figure was hard-coded.** It drew a standing body and the curl's muscles by id. Postures and muscle drawings are now data in each exercise file.
8. **The UI was sized for arms.** Load was 1–30 kg and strength 25–110 Nm (knee extensors are ~200+ Nm, leg-extension stacks 50+ kg). There was one default load per exercise, though an ankle weight and a machine stack differ ten-fold. Ranges are now per exercise and default loads per variant.
9. **The body map only had a front view.** Triceps, lats, hamstrings, glutes and calves are on the back. Both views now show when needed. The list of back-view wger muscle ids is from memory and marked `TODO` until it can be checked against the API.

## Still limited (added, but the numbers are approximate)

- **Muscles that cross two joints.** Strength curves and muscle weights depend on one joint angle only. But the triceps long head is stronger overhead, the hamstrings are stronger in a seated leg curl than a lying one, and the gastrocnemius goes slack in a seated calf raise. These differences can't be shown, except for one estimated 0.5 factor on the gastrocnemius in the seated calf raise. Fix: strength and weight tables that take both joint angles, or per-variant curves.
- **Stabiliser demand is one-directional and arm-specific.** It only counts torque that rotates the upper arm backwards (as in a curl). In a pushdown or a pulldown the shoulder holding work isn't counted, so the new exercises have no stabiliser muscles.
- **Flat 2D.** In a standing cable fly gravity is perpendicular to the plane, so holding the arms up isn't counted. Cables that run beside the body are drawn through it.
- **One range of motion per exercise.** A standing cable kickback realistically uses 30° to −25°, the kneeling one 90° to −25°. The incline front raise keeps getting harder past 90°, outside the range.
- **A variant can't change the joint set-up.** The common *seated* hip-abduction machine (hip bent 90°, knee bent, horizontal plane) is a different chain from standing abduction, so it was left out. The same applies to seated vs lying leg curls if both hip angles needed to be shown properly.
- **Straight limbs.** The soft elbow in a fly and the forward lean in a straight-arm pulldown aren't modelled.
- **Machine cams are illustrative.** None was measured, and stack kg don't compare with dumbbell kg.
- **wger links.** The starter library has no exercise ids (its `Movement Pattern` column is empty and `Equipment` is unreliable, e.g. "None (Bodyweight)" for the leg-extension machine), so the wger panel stays hidden for new exercises (`TODO` in each file).

## Didn't fit: these need a multi-joint model

All six break the same core assumption: **one joint moves and everything else stays still.**

- **Bench press** (and overhead press, rows, pull-ups, dips): shoulder and elbow move together while the hands are tied to a bar. How the torque splits between them depends on the bar path and elbow position.
- **Squat, leg press, lunge / split squat**: hip, knee and ankle all move together. With free weights, the body's centre of mass and the bar must stay over the mid-foot. A leg press instead fixes the path of the feet.
- **Romanian deadlift**: closest to fitting, as it is mostly the hip. But the hips move back to keep the bar over the mid-foot, so treating the hip as a fixed pivot overstates the moment arm at the bottom.
- **Hip thrust / glute bridge**: three contacts (upper back on the bench, feet on the floor, bar on the hips). How the load splits between them can't be found from one joint's statics.

### What a multi-joint model needs

The statics are the easy part: for a known posture, each joint's torque is the load times the horizontal distance from that joint to the line of action. What's missing:

1. **Posture across the range**: hip, knee and ankle (or shoulder and elbow) angles at each point of the lift. This comes from a constraint (bar over the mid-foot, a fixed sled or bar path) plus one or two shape parameters (e.g. torso lean or squat depth). This is inverse kinematics, not a lookup table.
2. **Per-joint outputs**: one torque, strength and effort curve per joint, and charts that show 2–3 joints at once. The sticking point is whichever joint's effort peaks first.
3. **Per-joint strength curves** for hip and knee extension and plantarflexion, sourced properly.
4. **Contacts**: where the ground and bench push (feet, back), for hip thrusts and benches.

Steps 1–2 would cover squat, leg press, lunge and RDL with one model, and bench press and rows with the same model applied to the arm.
