# Model limits

We tried 5 standard upper-body and 10 standard leg exercises from the wger starter library against the single-joint model, to see where it stops working. Nine fitted after generalising the model. The six that didn't now run on a separate **multi-joint model** (`js/multijoint.js`), described in the second half of this page.

| Exercise | Status | Variants |
|---|---|---|
| Triceps extension | ✅ added | cable pushdown, overhead dumbbell, lying EZ-bar (skullcrusher) |
| Front raise | ✅ added | dumbbell, cable from behind, chest-supported 45° incline |
| Chest fly | ✅ added | lying dumbbell, standing cable, pec deck |
| Straight-arm pulldown / pullover | ✅ added | cable pulldown, lying dumbbell pullover |
| Bench press | ✅ multi-joint (shoulder only, see below) | flat, bar to upper chest, 30° incline |
| Leg extension | ✅ added | machine, ankle weight |
| Leg curl | ✅ added | lying machine, seated machine, standing with ankle weight |
| Calf raise | ✅ added | single-leg with dumbbell, two-leg machine, seated machine |
| Hip abduction | ✅ added | standing cable, side-lying, standing machine |
| Glute kickback | ✅ added | standing cable, kneeling with ankle weight, machine |
| Squat | ✅ multi-joint | high-bar, low-bar, front, goblet |
| Leg press | ✅ multi-joint | feet middle, high, low |
| Lunge / split squat | ✅ multi-joint | Bulgarian, Bulgarian with forward lean, split squat |
| Romanian deadlift | ✅ multi-joint | barbell, stiff-legged |
| Hip thrust | ✅ multi-joint | barbell, feet further away, glute bridge |

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

## Multi-joint model

All six broke the same single-joint assumption: **one joint moves and everything else stays still.** In these lifts several joints move together, tied by a constraint.

### How it works

For each position in the lift (the *driver*, e.g. knee angle):

1. **A solver finds the posture** from the lift's constraint:
   - **Squat, Romanian deadlift:** both feet flat, and the centre of mass of body + load stays over the mid-foot. The squat sets the shin angle from the knee angle and solves the trunk lean. The hinge sets a slight knee bend and solves the shin angle (which is what pushes the hips back). If no angle balances, the UI says so.
   - **Split squat / lunge:** front foot flat, rear foot on a bench or the floor. The floor and bench push straight up, and how the weight splits between them follows from where the centre of mass is. The UI shows the front leg's share.
   - **Leg press:** hips fixed in the seat, feet moving along the sled rail. The plate pushes along the rail with m·g·sin(rail angle).
   - **Hip thrust / glute bridge:** shoulders on the bench (or floor), feet flat, bar on the hips. Both contacts push straight up, and the reactions come from moment balance.
   - **Bench press:** shoulder fixed, the bar moving in a straight line from the touch point to lockout, forearms vertical.
2. **Statics:** each joint's torque is the moment of every force on one side of it, choosing the side whose forces are all known (everything above the hip in a squat; the leg and sled in a leg press). Torques are per leg (or arm), positive when the joint's working muscles resist.
3. **Per joint:** a strength curve (hip extension, knee extension, plantarflexion) turns torque into effort. The joint whose effort peaks first is the sticking point. The figure draws each joint's moment arm to the line of action of the forces on its free side.

Segment lengths and masses are shared in `data/body.json`.

The tests check the classic hand formulas (e.g. squat hip torque = Σ m·g·horizontal distance in front of the hip). They also check equilibrium: the squat's ankle torque worked out from the floor up equals the one from the top down, the hip thrust's hip torque is the same from the trunk side and the leg side, and both reactions add up to the body + bar weight.

### What it shows

- **Squat:** low-bar moves torque from the knees to the hips; the front and goblet squats keep the trunk upright and load the knees more. The ankle torque stays small and constant: it's the weight above the ankle times the 4 cm from the ankle to the mid-foot.
- **Romanian deadlift:** hip torque grows steadily through the hinge, and the knee has a small *flexor* demand (hamstrings and calves pulling the knee back).
- **Split squat:** leaning forward with a more vertical shin moves torque from the knee to the hip.
- **Leg press:** feet high = more hip, less knee; feet low = the opposite.
- **Hip thrust:** effort is highest at lockout, where hip-extensor strength is lowest. Moving the feet further away turns the knee demand from quads to hamstrings.
- **Bench press:** the shoulder's moment arm is largest with the bar on the chest and close to zero at lockout.

### Still limited

- **Posture rules are assumptions.** "Shin angle = a fixed fraction of knee angle" (squat), the knee-bend rate in the hinge, the fixed trunk lean in the split squat and the straight bar path in the bench are reasonable shapes, not measurements. Real lifters vary. The balance constraint is solid; the rest isn't.
- **Contacts push straight up** (no friction) in the split squat and hip thrust, and the foot's push is taken at the mid-foot. That's what makes those lifts solvable. Real feet also push sideways and move their centre of pressure.
- **Bench press is shoulder-only.** With vertical forearms the elbow has no torque in a side view; the triceps' real demand comes from the frontal plane (bar inside or outside the elbows), which needs 3D. The triceps is listed as "not modelled".
- **Spine as one rigid trunk.** Erector-spinae load is approximated by the hip's effort.
- **Strength per joint ignores the other joints.** As with the single-joint model, two-joint muscles (hamstrings, rectus femoris, gastrocnemius) aren't credited for their length at the other joint.
- **One driver range per exercise.** The glute bridge only reaches about 0–35° of hip flexion before the hips hit the floor (the UI flags it), but shares the hip thrust's 0–80° range. The split squat starts at 40° of front-knee bend because a rear foot on the floor can't be reached with a straighter front leg.
- **Leg press:** sled weight and friction are ignored; only the plates count.
- **Strength numbers are estimates**, per leg, for a typical trained adult, marked `TODO` with no source checked. Use the strength slider to scale them.
