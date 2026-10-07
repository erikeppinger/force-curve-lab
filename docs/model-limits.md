# Model limits

We tried 5 standard upper-body and 10 standard leg exercises from the wger starter library against the single-joint model, to see where it stops working. Nine fitted after generalising the model. The six that didn't now run on a separate **multi-joint model** (`js/multijoint.js`), described in the second half of this page.

| Exercise | Status | Variants |
|---|---|---|
| Triceps extension | ✅ added | cable pushdown, overhead dumbbell, lying EZ-bar (skullcrusher) |
| Front raise | ✅ added | dumbbell, cable from behind, chest-supported 45° incline |
| Chest fly | ✅ added | lying dumbbell, standing cable, pec deck |
| Straight-arm pulldown / pullover | ✅ added | cable pulldown, lying dumbbell pullover |
| Bench press | ✅ 3D (shoulder and elbow) | medium, wide and close grip, elbows flared, 30° incline |
| Leg extension | ✅ added | machine, ankle weight |
| Leg curl | ✅ added | lying machine, seated machine, standing with ankle weight |
| Calf raise | ✅ added | single-leg with dumbbell, two-leg machine, seated machine |
| Hip abduction | ✅ added | standing cable, side-lying, standing machine |
| Glute kickback | ✅ added | standing cable, kneeling with ankle weight, machine |
| Squat | ✅ 3D | high-bar, low-bar, front, goblet, wide (sumo), knees caving in |
| Leg press | ✅ 3D | feet middle, high, low, wide toes-out, narrow, toes in, knees caving in |
| Lunge / split squat | ✅ multi-joint | Bulgarian, Bulgarian with forward lean, split squat |
| Romanian deadlift | ✅ multi-joint | barbell, stiff-legged |
| Deadlift | ✅ multi-joint | conventional, trap (hex) bar |
| Bent-over row | ✅ multi-joint | barbell (trunk ~45°), trunk horizontal, more upright |
| Overhead press | ✅ 3D | standing, wide grip, behind the neck, seated dumbbells |
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
   - **Squat, Romanian deadlift:** both feet flat, and the centre of mass of body + load stays over the mid-foot. The squat sets the shin angle from the knee angle and solves the trunk lean (in 3D, see below). The hinge sets the knee bend from the hip angle and solves the shin angle (which is what pushes the hips back). If no angle balances, the UI says so.
   - **Deadlift:** the same hinge, with more knee bend and a range down to the floor (bar at plate height, about 22 cm). The arms hang straight down from the shoulders, but a straight bar can't pass through the legs: where it would, the straight arms swing forward until the bar just touches the shins or thighs (the bar is taken to touch without pushing). A trap bar's handles sit beside the legs, so there the load hangs straight down all the way.
   - **Bent-over row:** the hinge held at a fixed hip angle; the driver is the pull. The hands move in a straight line from hanging under the shoulders to the trunk, the elbow bends away from the belly, and balance still sets the shin angle. On top of hip, knee and ankle it adds shoulder (extension) and elbow (flexion) torques per arm, each from the arm segments and half the load on its free side.
   - **Split squat / lunge:** front foot flat, rear foot on a bench or the floor. The floor and bench push straight up, and how the weight splits between them follows from where the centre of mass is. The UI shows the front leg's share.
   - **Leg press:** hips fixed in the seat, feet moving along the sled rail. The plate pushes along the rail with m·g·sin(rail angle). This one runs in 3D; see below.
   - **Hip thrust / glute bridge:** shoulders on the bench (or floor), feet flat, bar on the hips. Both contacts push straight up, and the reactions come from moment balance.
   - **Bench press:** shoulders fixed, both hands on the bar, the bar moving in a straight line from the touch point to lockout. Runs in 3D; see below.
2. **Statics:** each joint's torque is the moment of every force on one side of it, choosing the side whose forces are all known (everything above the hip in a squat; the leg and sled in a leg press). Torques are per leg (or arm), positive when the joint's working muscles resist.
3. **Per joint:** a strength curve (hip extension, knee extension, plantarflexion) turns torque into effort. The joint whose effort peaks first is the sticking point. The figure draws each joint's moment arm to the line of action of the forces on its free side.

Segment lengths and masses are shared in `data/body.json`.

The tests check the classic hand formulas (e.g. squat hip torque = Σ m·g·horizontal distance in front of the hip). They also check equilibrium: the squat's ankle torque worked out from the floor up equals the one from the top down, the hip thrust's hip torque is the same from the trunk side and the leg side, and both reactions add up to the body + bar weight.

### What it shows

- **Squat:** low-bar moves torque from the knees to the hips; the front and goblet squats keep the trunk upright and load the knees more. The ankle torque stays small and constant: it's the weight above the ankle times the 4 cm from the ankle to the mid-foot.
- **Romanian deadlift:** hip torque grows steadily through the hinge, and the knee has a small *flexor* demand (hamstrings and calves pulling the knee back).
- **Deadlift:** around the knees the conventional bar is pushed out in front of the shins, the hips go back to keep the balance, and the hip torque climbs to several times the knee torque. The trap bar keeps the load under the shoulders and lets the knees bend more, which moves torque from the hips to the knees (at the floor, with the default load: trap bar vs conventional: hip 136 vs 176 Nm, knee 90 vs 47 Nm per leg). The model predicts this from geometry alone; the knee-bend rates (0.7° and 0.9° per degree of hip flexion) are assumptions.
- **Bent-over row:** the trunk angle decides the hip and lower-back load (at the start, with 50 kg: 177 Nm per leg with the trunk horizontal, 126 at 45°, 62 fairly upright). The pull brings the bar closer to the hips, so that load eases a little through each rep. A flat trunk makes the top of the pull a shoulder-extension (lats) job. Upright, the load travels along the trunk, so the shoulder does little and the elbow flexors carry it. The knee has a flexor demand, as in the Romanian deadlift.
- **Split squat:** leaning forward with a more vertical shin moves torque from the knee to the hip.
- **Leg press:** feet high = more hip, less knee; feet low = the opposite. Stance width, toe angle and knee tracking: see the 3D section.
- **Hip thrust:** effort is highest at lockout, where hip-extensor strength is lowest. Moving the feet further away turns the knee demand from quads to hamstrings.
- **Bench press:** see the 3D section: grip width decides whether the pecs or the triceps do more.

### Still limited

- **Posture rules are assumptions.** "Shin angle = a fixed fraction of knee angle" (squat), the knee-bend rate in the hinge, the fixed trunk lean in the split squat and the straight bar path in the bench are reasonable shapes, not measurements. Real lifters vary. The balance constraint is solid; the rest isn't.
- **Contacts push straight up** (no friction) in the split squat and hip thrust, and the foot's push is taken at the mid-foot. That's what makes those lifts solvable. Real feet also push sideways and move their centre of pressure.
- **Bench press shoulders don't move.** The shoulder joints are fixed on the bench; real shoulder blades retract and move. The default elbow placement (as close under the bar as the arm allows) brings the elbow moment arms near the measured ones, but not for every grip; see the 3D bench section.
- **Spine as one rigid trunk.** Erector-spinae load is approximated by the hip's effort.
- **Strength per joint ignores the other joints.** As with the single-joint model, two-joint muscles (hamstrings, rectus femoris, gastrocnemius) aren't credited for their length at the other joint.
- **Deadlift at the floor is past the measured hip strength.** Anderson's hip-extension curve was tested up to 74° of hip flexion; the deadlift starts near 135°, where the app holds the 74° value flat. The effort near the floor is an extrapolation, so its near-limit readings at a modest 50 kg say more about the strength curve than about real lifters. The bar path, the lats pulling the bar back and the shoulders sitting in front of the bar are not modelled; arms are straight lines from shoulder to bar.
- **Rows in the side view only.** The elbows stay in the side-view plane (tucked). Flared elbows turn the pull into horizontal abduction (rear delts), which needs the 3D arm model. The shoulder blades (rhomboids, middle trapezius) aren't modelled. The hand path is a straight line, and the trunk is held perfectly still, with no hip drive or body English. Seated cable rows and chest-supported rows aren't in yet.
- **One driver range per exercise.** The glute bridge only reaches about 0–35° of hip flexion before the hips hit the floor (the UI flags it), but shares the hip thrust's 0–80° range. The split squat starts at 40° of front-knee bend because a rear foot on the floor can't be reached with a straighter front leg.
- **Leg press:** sled weight and friction are ignored; only the plates count.
- **Strength numbers are estimates**, per leg, for a typical trained adult, marked `TODO` with no source checked. Use the strength slider to scale them.

## 3D: leg press foot placement

Stance width, toes in or out and knees caving in all happen outside the side-view plane, so the leg press now runs on a 3D model (`js/multijoint3d.js`) with a drag-to-turn view (`js/view3d.js`, hand-rolled SVG, no libraries).

### How it works

- **Placement controls:** feet up or down the plate, each foot's distance from the middle, toes out or in, knees out or in of the line over the toes. The variants are presets for these sliders.
- **Posture:** the ankle slides along the rail until the hip–ankle distance matches the knee angle. The knee sits in the plane of the hip–ankle line and the foot ("knees over the toes"), then turns about that line by the knee-tracking angle.
- **Forces:** the plate pushes along the rail at each mid-foot (half the sled force per leg), plus the leg's segment weights.
- **Joint moments as vectors**, split into anatomical components:
  - **Hip:** extension, adduction (+) / abduction (−), external (+) / internal (−) rotation. Muscles: glutes and adductor magnus, adductors vs gluteus medius and minimus, deep external rotators.
  - **Knee:** extension (quadriceps), and valgus (+) / varus (−). The sideways knee moment is carried mostly by ligaments and the joint surfaces, so it's shown as torque without an effort figure.
  - **Ankle:** plantarflexion.
- **Tests:**
  - With the feet under the hips and the toes forward, every sideways and rotation component is exactly zero (the 3D model reduces to the side view).
  - A hand-derived hip moment vector F·(a·z − dz·v) for a foot set out to the side.
  - Teaching points: a wide, toes-out stance loads the adductors and external rotators; knees caving in raises the valgus moment.

### What it shows

- **Feet high or low** still swaps hip and knee work, as in the side view.
- **Wider stance and toes out:** the push tends to spread the thighs and turn them inwards, so the adductors and external rotators must hold. The knee extension torque drops a little, and the knee gets an external valgus moment (the push line passes outside the knee).
- **Narrow stance, toes forward:** the sideways components nearly vanish.
- **Knees caving in** (relative to the toes) raises the knee's valgus moment; pushing the knees out lowers it.
- **At exactly 90° of knee bend** the knee's valgus axis lines up with the thigh, so hip rotation and knee valgus are the same moment. They separate at other angles. This is real geometry, not a bug.

### What it can't show

- **Which part of the quadriceps works.** All four heads extend the knee, so net joint torques can't say whether toes out shifts work towards the vastus medialis. That needs a muscle model (moment arms and lines of action per muscle, e.g. OpenSim) or EMG data; sources not checked yet (`TODO`).
- **Sideways grip on the plate.** The plate is assumed to push straight along the rail. Real feet can also push outwards or inwards against each other through friction, which would change the hip's sideways and rotation moments.
- **Rotator and adductor strengths** are rough constants (`TODO`), so their effort percentages are the least reliable numbers on the page.
- **The ankle's side-to-side (inversion / eversion) moment** isn't reported.

## 3D: squat

The squat runs on the same 3D machinery as the leg press (`squat3d`).

- **Placement controls:** shin forward lean, stance width, toes out or in, knees out or in of the toes, and the sideways floor push.
- **Posture:** feet flat; the knee tracks over the toes (turned by knee tracking); the hips sit at hip width, as far back as the shin-lean rule requires; the trunk leans until body + bar balance over the mid-foot.
- **Forces:** each foot carries half the weight. **How hard the feet push sideways against the floor can't be found from statics:** the two feet can push apart or together through the body without changing the balance. By default the model uses *static optimisation*: it picks the sideways push (within friction, up to 60% of the vertical force) that gives the least total muscle effort. Untick "least effort" to set it by hand.
- **Tests:**
  - With the feet under the hips and the toes forward, the 3D squat reproduces the side-view squat exactly.
  - The least-effort push really is lower-effort than fixed alternatives.
  - The teaching points: low-bar vs front squat, knees caving in at a fixed push, and a wide stance with vertical shins.

What it shows, and what it depends on:

- **The sideways floor push matters a lot.** With the feet pushed straight up, a wide stance needs over 200 Nm of hip adductor torque at 40° of knee bend, which isn't realistic. With the least-effort push, the sideways hip and knee torques stay small in every stance.
- **Wide (sumo) stance:** the hip/knee split depends mostly on the shin-lean rule. With fairly vertical shins (the usual sumo cue) the hips go back and the lift becomes hip-dominant; with the normal shin lean it doesn't. The shin-lean slider shows this.
- **Knees caving in:** at a fixed sideways push the knee's valgus moment and the hip's rotation load rise sharply. Under least effort the feet can push to cancel most of it, which is one way to read the coaching cue "spread the floor".

## 3D: bench press

Shoulder **and** elbow (`bench3d`), with both hands on a rigid bar.

- **Placement controls:** grip width, elbow placement ("under the bar", or a set distance outside or inside the hands in the front view), where the bar touches the chest, and the bar spread. The flare angle, the upper arm's angle from the trunk and the forearm's tilt are outputs, shown under the table.
- **Posture:**
  - Shoulders are fixed on the bench, and the bar moves in a straight line from the chest to lockout over the shoulders.
  - The elbow sits on the circle of positions where both arm segments fit, at the point closest to under the bar. That is the smallest elbow moment arm for a vertical push, the coaching cue "elbows under the bar". The manual option instead places it at a set offset from the hand in the front view.
  - Grip widths and touch points are derived from Mausehund et al. (see below). The chest is raised 20 cm above the shoulder joints for the arch; that height is an estimate.
- **Forces:** each hand pushes straight up with half the bar (the bar isn't pulled apart or squeezed).
- **Components:**
  - **Shoulder:** horizontal adduction (pecs), flexion (front delts), rotation (rotator cuff).
  - **Elbow:** extension (triceps), plus its sideways moment (ligaments).
- **Tests:** the shoulder components match their hand formulas (flexion = F × forward distance, horizontal adduction = F × grip offset from the shoulder). The elbow's moment equals F × the horizontal elbow–hand distance. Close grip loads the triceps, wide grip the pecs.

What it shows:

- **Grip width:** close grip loads the triceps and nearly removes the pecs' across-the-body work; wide grip does the opposite (about 1.6× the medium grip's horizontal-adduction torque at 80 kg, 109 vs 68 Nm per arm on the chest). Elbow torque runs close > medium > wide, as measured.
- **Elbows outside the hands** (manual placement) bring in shoulder rotation torques and a larger elbow moment arm. With the elbows under the bar, the push lies in the arm's plane, so the rotation and sideways elbow torques vanish.

Limits:

- **Fixed shoulder joints and a straight-line bar path.** Real shoulder blades retract and move, and real bar paths curve. With fixed shoulders the close grip can't get its elbows under the bar mid-press (moment arm too large), and the wide grip gets them closer than lifters do (too small). Holding the forearm vertical instead would need the shoulder joint to move 14–19 cm mid-press, which isn't plausible, so the real answer lies in shoulder-blade movement that this model doesn't have.
- **Pulling the bar apart.** Like the squat's floor push, how hard the hands pull the bar apart (or squeeze it) isn't fixed by statics. A slider sets it, defaulting to zero; its "least effort" option lets the model choose. In wider grips that choice pulls hard (up to about 40% of the vertical force) and shifts work from the pecs to the triceps, likely more than lifters really do, so it isn't the default. Unlike the squat, where pushing straight up gave unrealistic numbers, zero here gives results that match coaching experience.

## 3D: overhead press

Shoulder and elbow (`press3d`), standing or seated, with a bar or dumbbells. It reuses the bench's arm model with the body upright.

- **Placement controls:** grip width, elbows outside or inside the hands (front view), where the bar starts (in front of or behind the shoulders), and the bar spread.
- **Posture:**
  - Trunk upright and shoulder joints fixed.
  - The hands move in a straight line from the start position to lockout over the shoulders.
  - The elbow sits below the hand, at the chosen sideways offset.
- **Components:** the shoulder moment is split along body axes:
  - flexion (about the side-to-side axis: front delts)
  - abduction (about the front-to-back axis: side delts)
  - rotation about the upper arm (rotator cuff)

  The strength curves use the arm's elevation (0° by the side, 180° overhead). Overhead, "flexion" and "abduction" stop being distinct anatomical motions, and the split is only a bookkeeping choice.
- **Tests:**
  - Flexion = F × forward distance and abduction = F × sideways distance of the hand from the shoulder.
  - The arms' own weight adds m·g × distance.
  - Elbow moment = F × horizontal elbow–hand distance.
  - Lockout over the shoulder has no flexion torque.
  - Dumbbells give no sideways force.
  - The least-effort spread is the minimum.

What it shows:

- **Where the torque goes:**
  - The start loads the shoulder flexors, which have the largest front-to-back moment arm.
  - The middle loads the triceps, when the forearms are most tilted.
  - Lockout leaves only the abduction torque from a grip wider than the shoulders.
- **Grip width:** with a vertical push, the abduction torque is constant through the press (load × how far the hand is outside the shoulder). It gets harder towards lockout only because abduction strength drops overhead. A wide grip makes it about 3× the standard grip's.
- **Behind the neck:** the bar starts behind the shoulder, so it needs the shoulder *extensors*, and it loads the external rotators (infraspinatus, teres minor) two to three times as much as the standard press, with the arm raised and turned out. That is the position the press is usually criticised for.
- **Dumbbells:** with no bar there's nothing to push sideways against, so the bar-spread option doesn't apply.

Limits:

- **Fixed trunk and shoulders.** Lifters lean back at the start and shrug the shoulder blades up at lockout. Neither is modelled, so the start torques and the overhead geometry are approximate.
- **Straight bar path.** At the start the line passes the chin; real lifters tilt the head back or curve the path.
- **Strength overhead is estimated.** Flexion strength is sourced up to 110° and abduction up to 90°. Beyond that, both are marked `TODO` (60% and 50% of peak at 180°). The adduction peak (90 Nm) is also an estimate.
- **Shoulder blade muscles** (serratus anterior, trapezius) are listed but not estimated.

## 3D: what's left

- The **split squat, RDL and hip thrust** are still side-view only; stance width matters less there but could use the same tools.
- **Overhead press, rows and pull-ups** would follow the bench's arm model with different contacts.

## Sources for the curated numbers

Every strength curve, peak strength and limb mass now carries its source in the exercise file. Where a source only gives part of the answer, the note says which part is an estimate. The papers were read in full; the one conference abstract is marked as such.

| What | Source | What it gives |
|---|---|---|
| Hip extension, knee extension and flexion, plantarflexion | Anderson, Madigan & Nussbaum 2007 (*J Biomech*) | Full isometric curves (cosine model, young men), peak torques, tested ranges |
| Knee extension (cross-check) | Lindahl et al. 1972 (*Acta Orthop Scand*) | Same shape: peak near 50°, about 50% at 10° |
| Elbow flexion and extension | Pinter et al. 2010 (*J Electromyogr Kinesiol*) | Full curves (cubic fits), peak torques; arm raised 90° |
| Shoulder flexion, extension, abduction, rotation | Mayer et al. 1994 (*Int J Sports Med*) | Isometric peak torques (men) and angle of peak |
| Shoulder flexion, extension, abduction, horizontal adduction | Kulig, Andrews & Hay 1984 (*Exerc Sport Sci Rev*) | Curve shapes from the studies it reviews; shoulder extension numbers (Clarke et al.) |
| Shoulder abduction | Haidar et al. 2009 (conference abstract) | Relative strength at 0, 30, 60, 90° |
| Hip abduction | Neumann et al. 1988 (*Phys Ther*) | Torques at −10° to 40° |
| Hip adduction / abduction (3D lifts) | Welsh et al. 2020 (*Int J Sports Phys Ther*) | Isometric torques at 10° of abduction |
| Limb masses and centres of mass | de Leva 1996 (*J Biomech*) | Young adult males |
| Bench press sideways bar force and joint moments | Mausehund et al. 2022 (*J Strength Cond Res*) | Measured lateral forces, moment arms and moments by grip |

### What changed, and what it shows

- **Several guessed curves had the wrong shape.**
  - **Knee extension** is very weak near a straight knee (about 15% of peak at 0°, 46% at 15°). Leg-extension lockout and the top of a squat are genuinely weak positions.
  - **Hip extension** peaks at about 53° of hip flexion, not deep in flexion. Deeper than the tested 74° the curve is held flat, which is extrapolation.
  - **Elbow extension** peaks at about 55°, not 90°.
  - **Shoulder extension** is nearly flat and peaks around 65°, not overhead.
- **Thigh mass is 14% of body mass, not 10%.** That makes the leg's own weight matter more in leg extensions, leg curls and hip abduction.
- **The calf raise had a geometry error, now fixed.** The ankle-to-ball lever slopes down from the ankle, so its reach shrinks faster as you rise onto the toes.
- **Sources disagree on shoulder abduction near the start.** Haidar et al. find 0° the weakest position; Clarke et al. find it the strongest. The curve follows Haidar (the only numbers at these angles) and says so.
- **Test postures differ from the exercises.** Plantarflexion was measured with the knee bent (gastrocnemius slack), so standing calf raises high on the toes look harder than they are. Elbow curves were measured with the arm raised 90°. These are the two-joint-muscle effects on the roadmap.
- **Default loads were lowered** where the measured curves made the old defaults fail mid-range. Several defaults still pass 100% right at an end of the range (lockouts, hip hyperextension, the deepest squat). That's where the measured strength really is lowest.

### Checking the bench press against measurements

Mausehund et al. measured 35 trained lifters with an instrumented bar and force plates. They report net joint moments, moment arms, the sideways bar force and arm angles. The 3D bench now takes its geometry from that study:

- **Grip widths** come from their arm–bar angle at lockout (75° medium, 65° wide, 85° narrow), using this model's arm length and shoulder width. That gives hands 35, 45 and 24.5 cm from the middle.
- **Touch points:**
  - Medium and close are back-calculated from their peak shoulder moment arm (at the bottom). This puts the bar 16 and 20 cm towards the feet from the shoulder joints.
  - Wide is an estimate (13 cm). There the measured sideways force tilts the force line too much to back-calculate.
- **Elbows** go "under the bar" as far as the arm allows.

| Medium grip | Measured | Model |
|---|---|---|
| Elbow moment arm, mean / peak | 7.2 / 9.2 cm | 8.2 / 11.2 cm (no sideways force); 13.0 / 15.8 cm with their 17% sideways force |
| Shoulder moment arm, mean / peak | 15.6 / 22.1 cm | 20.2 / 24.5 cm (no sideways force); 14.4 / 22.0 cm with their sideways force |
| Upper arm from the trunk at the bottom | 59° | 50° |
| Sideways / vertical bar force | 0.17 (wide 0.38, narrow ≈ 0) | Least effort: 0.05 (wide 0.25, narrow −0.03) over the rep |

| Elbow moment arm, mean (no sideways force) | Measured | Model | Before this change |
|---|---|---|---|
| Wide | 6.4 cm | 2.1 cm | 15–20 cm for every grip |
| Medium | 7.2 cm | 8.2 cm | |
| Narrow | 8.2 cm | 13.1 cm | |

What this means:

- **Elbow moment arms:** for the medium grip they are now close to the measured ones; before, they were about twice as large. The grip-width trend in elbow torque (narrow > medium > wide) now matches the measurements, with or without the measured sideways forces. Before, the trend reversed with those forces.
- **Wide and narrow grips:** both are still off in opposite directions. Fixed shoulders let the wide grip stack its elbows almost perfectly under the bar but stop the narrow grip from doing so mid-press.
- **Shoulder moment arms** match the measurements once the measured sideways force is applied. The least-effort estimate of that force has the right trend but is smaller than measured.
- **Sideways force default:** it stays at zero; the measured values are shown on the slider.
- **Still to model:** shoulder-blade movement.

The arm angles in the paper are given as means over the rep (forearm) and at the bottom (upper arm), so they check the model only loosely.

### Still without a source

- Muscle activation weights (62 values; the bench grip-width effects are now backed by Mausehund et al. qualitatively).
- Machine cam profiles.
- Hip rotation strength in the 3D lifts, and the peak horizontal-adduction torque.
- How much the two-joint muscles change strength with the other joint's angle.
