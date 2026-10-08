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
| Lunge / split squat | ✅ 3D | Bulgarian, Bulgarian with forward lean, split squat, feet in line, front knee caving in |
| Romanian deadlift | ✅ 3D | barbell, stiff-legged, wide stance toes out |
| Deadlift | ✅ multi-joint | conventional, trap (hex) bar |
| Bent-over row | ✅ 3D | barbell (trunk ~45°), trunk horizontal, more upright, wide grip elbows out |
| Lat pulldown | ✅ 3D | wide grip, close neutral grip, close palms up, behind the neck |
| Pull-up, chin-up | ✅ 3D | wide pull-up, chin-up, neutral grip |
| Seated cable row, chest-supported row | ✅ 3D | trunk upright, leaning back, leaning forward, wide bar elbows out; dumbbells on an incline pad |
| Overhead press | ✅ 3D | standing, wide grip, behind the neck, seated dumbbells |
| Hip thrust | ✅ 3D | barbell, feet further away, glute bridge, knees caving in, wide stance toes out |

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
9. **The body map only had a front view.** Triceps, lats, hamstrings, glutes and calves are on the back. Both views now show when needed. The list of back-view wger muscle ids has been checked against the live API (2026-10-08).

## Still limited (added, but the numbers are approximate)

- **Muscles that cross two joints.** Muscle weights depend on one joint angle only, so the long heads of the triceps and biceps and the hamstrings keep the same share in every posture. The only exception is the gastrocnemius in the seated calf raise (modifier 0.65). Strength is now corrected per variant for the other joint's angle (see *Two-joint muscles and grip* below). Fix for the weights: tables that take both joint angles.
- **Stabiliser demand is one-directional and arm-specific.** It only counts torque that rotates the upper arm backwards (as in a curl). In a pushdown or a pulldown the shoulder holding work isn't counted, so the new exercises have no stabiliser muscles.
- **Flat 2D.** In a standing cable fly gravity is perpendicular to the plane, so holding the arms up isn't counted. Cables that run beside the body are drawn through it.
- **One range of motion per exercise.** A standing cable kickback realistically uses 30° to −25°, the kneeling one 90° to −25°. The incline front raise keeps getting harder past 90°, outside the range.
- **A variant can't change the joint set-up.** The common *seated* hip-abduction machine (hip bent 90°, knee bent, horizontal plane) is a different chain from standing abduction, so it was left out. The same applies to seated vs lying leg curls if both hip angles needed to be shown properly.
- **Straight limbs.** The soft elbow in a fly and the forward lean in a straight-arm pulldown aren't modelled.
- **Machine cams are illustrative.** None was measured, and stack kg don't compare with dumbbell kg.
- **Curl muscle weights: shape sourced, level estimated.** How the biceps', brachialis' and brachioradialis' weights change over the elbow angle now follows their moment arms (Murray et al. 1995) relative to each other: the brachioradialis gains share with flexion, the biceps loses some. Each muscle's overall level (its weight at 90°) is still an estimate; it needs muscle sizes (physiological cross-sections, e.g. Lieber et al. 1992 or Holzbaur et al. 2005 on the reading list). The palm-up vs palm-down change in the biceps' moment arm (a few mm, their Fig. 6) is left to the grip factors from Coratella et al. The curls' elbow flexors in the multi-joint lifts (rows, pull-ups) still use their own estimated weights.
- **Wrist curls are estimates throughout.** The statics are exact (forearm flat: torque ∝ cos of the wrist angle; behind the back: ∝ sin), but the wrist strength curves, peak torques and every muscle weight are estimates marked `TODO`; candidate sources are on the reading list. The finger roll's extra finger work is only a higher share for FDS and FDP: the finger joints aren't modelled.
- **Close-ups are schematic.** The forearm, shoulder and hip/thigh drawings place muscles where atlases show them, simplified and not to scale. Their colours use the same activation estimates as the bars, so a muscle that looks distinct in the drawing is not resolved any better by the model. Where an exercise only has a group value (quadriceps, hamstrings, pectoralis, the external rotators of the shoulder or hip), all heads show that value and are hatched: which head works more needs a muscle model (OpenSim) or EMG.
- **wger links.** The starter library has no exercise ids (its `Movement Pattern` column is empty and `Equipment` is unreliable, e.g. "None (Bodyweight)" for the leg-extension machine). All 23 ids are now set by hand from wger's public exercise list; four have no exact match there, so they link the closest entry and name the alternatives in their note.

## Multi-joint model

All six broke the same single-joint assumption: **one joint moves and everything else stays still.** In these lifts several joints move together, tied by a constraint.

### How it works

For each position in the lift (the *driver*, e.g. knee angle):

1. **A solver finds the posture** from the lift's constraint:
   - **Squat, Romanian deadlift:** both feet flat, and the centre of mass of body + load stays over the mid-foot. The squat sets the shin angle from the knee angle and solves the trunk lean (in 3D, see below). The hinge sets the knee bend from the hip angle and solves the shin angle (which is what pushes the hips back). If no angle balances, the UI says so.
   - **Deadlift:** the same hinge, with more knee bend and a range down to the floor (bar at plate height, about 22 cm). The arms hang straight down from the shoulders, but a straight bar can't pass through the legs: where it would, the straight arms swing forward until the bar just touches the shins or thighs (the bar is taken to touch without pushing). A trap bar's handles sit beside the legs, so there the load hangs straight down all the way.
   - **Bent-over row:** the hinge held at a fixed hip angle; the driver is the pull. The hands move in a straight line from hanging under the shoulders to the trunk, the elbow bends away from the belly, and balance still sets the shin angle. On top of hip, knee and ankle it adds shoulder (extension) and elbow (flexion) torques per arm, each from the arm segments and half the load on its free side.
   - **Seated cable row, chest-supported row:** hips fixed on a seat (or the chest on a pad), the trunk held at the variant's angle, and the hands pulling in a straight line from full reach towards the pulley to the belly. The cable pulls each hand towards the pulley with half the stack weight. Shoulder and elbow torques come from the arm side; the hip torque comes from the trunk, the arms and the cable. With a chest pad, the pad carries the trunk, so the hip torque is shown as zero.
   - **Split squat / lunge:** front foot flat, rear foot on a bench or the floor. In the side view the floor and bench push straight up, and how the weight splits between them follows from where the centre of mass is (the 3D version adds a sideways push). The UI shows the front leg's share.
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
- **Seated cable row:** the cable pulls the trunk forward, so the hips and lower back work hardest at the start, when the hands are far out and high above the hips. At 40 kg: 107 Nm per side upright, 76 leaning back 15°, 141 leaning forward 20°. Leaning back lets body weight counter the cable, which is why lifters do it when the weight gets heavy. On a chest-supported row the pad takes that job, leaving only the arms and upper back.
- **Split squat:** leaning forward with a more vertical shin moves torque from the knee to the hip.
- **Leg press:** feet high = more hip, less knee; feet low = the opposite. Stance width, toe angle and knee tracking: see the 3D section.
- **Hip thrust:** effort is highest at lockout, where hip-extensor strength is lowest. Moving the feet further away turns the knee demand from quads to hamstrings.
- **Bench press:** see the 3D section: grip width decides whether the pecs or the triceps do more.

### Still limited

- **Posture rules are assumptions.** "Shin angle = a fixed fraction of knee angle" (squat), the knee-bend rate in the hinge, the fixed trunk lean in the split squat and the straight bar path in the bench are reasonable shapes, not measurements. Real lifters vary. The balance constraint is solid; the rest isn't.
- **Contacts push straight up** (no friction) in the split squat and hip thrust, and the foot's push is taken at the mid-foot. That's what makes those lifts solvable. Real feet also push sideways and move their centre of pressure.
- **Bench press shoulders don't move.** The shoulder joints are fixed on the bench; real shoulder blades retract and move. The default elbow placement (as close under the bar as the arm allows) brings the elbow moment arms near the measured ones, but not for every grip; see the 3D bench section.
- **Spine as one rigid trunk.** Erector-spinae load is approximated by the hip's effort.
- **Strength per joint ignores the other joints.** Two-joint muscles (hamstrings, rectus femoris, gastrocnemius) aren't credited for their length at the other joint in the multi-joint lifts. The single-joint leg curl, biceps curl and triceps extension now are (see "Two-joint muscles and grip").
- **Deadlift at the floor is past the measured hip strength.** Anderson's hip-extension curve was tested up to 74° of hip flexion; the deadlift starts near 135°, where the app holds the 74° value flat. The effort near the floor is an extrapolation, so its near-limit readings at a modest 50 kg say more about the strength curve than about real lifters. The bar path, the lats pulling the bar back and the shoulders sitting in front of the bar are not modelled; arms are straight lines from shoulder to bar.
- **Rows:** the shoulder blades (rhomboids, middle trapezius) aren't modelled; see the 3D rows section for elbow flare. The hand path is a straight line, and the trunk is held perfectly still, with no hip drive or body English. The cable row ignores pulley friction and the stack's inertia. The chest pad's contact isn't solved; the model just assumes it holds the trunk.
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

## 3D: Romanian deadlift, split squat and hip thrust

These three now run in 3D with the same leg model as the squat. The tests check that the hinge and the hip thrust reduce exactly to their side-view versions when the feet are under the hips, the toes point forward and there's no sideways push.

- **Romanian deadlift** (`hinge3d`):
  - Placement controls: stance width, toe angle, knee tracking, and the sideways floor push (least effort by default).
  - Knee bend follows the hip angle; balance over the mid-foot sets how far the hips go back.
  - In a wide, toes-out stance the hip extension hardly changes. The feet push outwards (about 11–14% of the vertical force), and setting that push to zero shows the adductor work it saves (about 80 Nm per side at 70° of hip flexion).
- **Split squat** (`split3d`):
  - Placement controls: front and rear foot distance from the midline, toe angle, front-knee tracking, and the sideways push of the front foot (least effort by default).
  - The contacts carry the weight, and the sideways balance sets how far the pelvis shifts sideways. With no sideways push the centre of mass must sit over the line between the contacts.
  - With no sideways push and the feet in line ("tightrope"), the front foot ends up under the middle of the body, inside the front hip. The front hip's sideways and rotation torques are then about a third higher than on hip-width tracks. That is the extra glute medius and rotator work, and the balance challenge, of a narrow split squat.
  - With least effort, the front foot presses inwards on the floor instead (6–22% of its vertical force on tracks, up to 35% feet in line), and the rotation load nearly vanishes.
- **Hip thrust** (`hipThrust3d`):
  - Placement controls: stance width, toe angle, knee tracking, and the sideways floor push.
  - Knees caving in barely changes hip extension. With no sideways push it brings in hip rotation and knee torques. Least effort instead has the feet push outwards (about 10–13% of the vertical force), which is what "knees out" (or a band around the knees) trains.
  - A wide, toes-out stance lowers the knee's share.

Limits:

- **Split squat:** the front foot can push sideways on the floor, and the rear contact pushes back equally. The push is least effort by default, with a slider. Because the rear contact is higher (a bench), that pair also tips the body sideways, and the sideways balance includes it (tested: moments about the front-back axis add to zero). With least effort the push is 6–35% of the front foot's vertical force, and the hip-rotation load nearly vanishes. Set to zero, the feet-in-line variant needs more than the measured hip internal-rotation strength when deep. The pelvis stays level (no hip drop), and the rear contact can't take front-back friction.
- **Pelvis shift instead of a hip drop.** Real lifters also let the pelvis tilt and the knee drift. The model keeps the pelvis level and moves it sideways as one piece.
- **Hip rotation strength** is from Uritani & Fukumoto 2012, by hip flexion. Internal rotation rises from 25 Nm lying back to 39 Nm sitting; external rotation stays about 37–43 Nm. Their group was mostly women (60 kg), so the values are likely low for men. Frontal-plane strength is the squat's.

## 3D: rows

The bent-over row, the seated cable row and the chest-supported row now run in 3D (`row3d`). The trunk and legs work as before (balance over the mid-foot standing, a fixed seat, or a chest pad). The arms are 3D:

- **Hand path:** the hands move in a straight line from arms straight to the trunk, `gripHalf` from the midline.
- **Elbow:** it bends away from the belly and can be turned outwards about the shoulder–hand line by `flare` (0 = tucked).
- **Shoulder components:** in the trunk's frame, split into:
  - extension (about the side-to-side axis: lats)
  - horizontal abduction (about the trunk's long axis: rear delts)
  - rotation (rotator cuff)
- **Elbow:** flexion, plus its sideways moment.
- **Placement controls:** grip width and elbow flare.
- **Tests:**
  - With the elbows tucked and the hands at shoulder width, every torque matches the side view exactly.
  - The rear-delt torque matches F × the hand's sideways offset × the trunk's tilt.
  - Flaring the elbows moves work from the lats to the rear delts.

What it shows:

- **Elbow flare:** tucked elbows give a pure lat pull, with no horizontal-abduction torque. Flared elbows with a wide grip move part of the work to the rear delts and load the rotator cuff. Bent-over, at 40 kg, 70° flare: 20 Nm of horizontal abduction per arm and less shoulder extension. The hips' job barely changes.
- **Close-grip (V) handle on the cable row:** the hands sit inside the shoulders and the cable pulls them forward, so the shoulder also needs a little horizontal *adduction* (pecs).

Limits:

- **Rear-delt strength:** Lategan 2002 (103 men, isokinetic 60°/s): horizontal abduction 93 Nm, adduction 92 Nm. These are taken as constant over the range, because no angle curve is available.
- **Fixed shoulders:** the shoulder blades don't move, so the squeeze at the top isn't modelled.
- **Straight hand path:** real rows arc.

## 3D: pull-ups and lat pulldowns

The `pull3d` solver uses the same arm model as the press, pulling instead of pushing.

- **Pulldown:** seated, trunk leaning back at the variant's angle. The cable pulls the bar's middle towards the pulley, and the bar passes that direction to each hand. The hip holds the trunk.
- **Pull-up:** the bar holds each hand up with half of body + belt weight. The body leans back until its centre of mass hangs under the bar, so the lean grows through the pull.
- **Hands:** they move in a straight line in the trunk's frame, from overhead to the upper chest (or behind the neck).
- **Elbows:** "under the bar" (closest to the pull's line), or at a set offset from the hands.
- **Shoulder components:** extension (about the side-to-side axis), adduction (about the front-to-back axis) and rotation. The lats take the larger of extension and adduction; a muscle can now follow more than one joint component.
- **Elbow strength by grip and arm angle:** a new grid correction (`jointScale` with a `grid`). From Guenzkofer et al.'s measured table: shoulder flexion 0/60/135° × elbow 0–120° × palms up, neutral or down, relative to palms up with the arm at the side. Overhead the elbow flexors are much weaker (palms up 70%, palms down about 60% at 135° and 90°).
- **Hip flexion strength (pulldown):** from Anderson et al. (142 Nm, peak at 12° of extension). A joint's negative direction can now carry its own curve.

What it shows:

- **Wide grip vs close grip:** a wide grip with the elbows under the bar is mostly shoulder adduction (lats, teres major), and the elbows do little. A close or palms-up grip turns it into shoulder extension, and the elbow flexors take a large share.
- **Pull-ups are hard:** a wide pull-up at 75 kg needs about 71 Nm of shoulder adduction per arm, against men's measured maximum of 72 Nm.
- **Chin-ups:** palms up, the elbow flexors are stronger than palms down, one reason chin-ups feel easier. Even so, with these untrained strength values (Pinter et al.'s men × the overhead factor), a chin-up at 75 kg reaches about 100% elbow effort mid-pull. The strength slider scales this for trained lifters.

Limits:

- **No shoulder-blade movement:** depression and retraction at the bottom, upward rotation at the top.
- **Straight hand path, and legs that hang straight.**
- **Rough shoulder angle for the elbow correction:** Guenzkofer et al.'s shoulder angle is flexion. The arm's elevation stands in for it, also when the arm comes down at the side.
- **Shoulder strength:** extension and adduction are taken as constant over the range. Kulig et al. describe their shapes but give no numbers.

## 3D: what's left

- **Shoulder-blade movement** for the bench, press, rows and pulls.

## Edge lift (finger model)

### How it works

One finger as a planar chain: wrist → MCP → PIP → DIP, bone lengths and tendon moment arms of the index finger (An et al. 1983). The block's weight times the finger's share pulls on the finger pad; the hand hangs so that pull runs straight under the wrist (no wrist moment). From the joint moments:
- **FDP** is the only muscle that bends the DIP, so its tension is the DIP moment ÷ its moment arm (minus the passive part when the DIP is bent back: 22% of the moment in Vigouroux et al.'s crimp).
- **FDS** supplies the rest of the PIP moment. If the FDP alone already over-bends the PIP, the extensor mechanism must hold it; the app reports that moment instead of an FDS tension.
- **MCP**: what the two long flexors leave over goes to the intrinsic hand muscles or the extensors (reported, not modelled as forces).
- **Pulleys**: the tendons run straight between A2's distal edge and A4 (bowstring), and each pulley carries the vector sum of the tendon pulls on it.
- Under load the tendons bowstring further from the PIP as it bends (Schweizer: 4.3 mm for FDP in the crimp, 0.2 mm in the slope grip, 1.75 mm for FDS), which is added to the PIP moment arms.

### Checked against the paper

On Vigouroux et al.'s own set-up (1 cm hold, pull along the metacarpal, their crimp posture) the model gives FDP:FDS 1.3 (they estimated 1.75), A2 2.5× and A4 1.5× the fingertip force (they: 2.7× and 2.4×). Without Schweizer's bowstring correction the ratio came out 0.5, the wrong way round; the unloaded cadaver moment arms are too small for a loaded crimp. Their slope grip can't be compared: its PIP moment (3.4 Nm at 97 N) shows their pull ran across the finger, unlike a block hanging under the wrist. A test pins the crimp comparison.

### Still limited

- **Where the edge presses is a slider.** Vigouroux et al. put the load at half the distal phalanx on a 1 cm hold. On a 20–25 mm edge the whole distal phalanx rests on it, but where the pressure centre sits hasn't been measured, and it matters: pressing closer to the DIP shifts the work from FDP to FDS.
- **Index-finger geometry for "a finger".** The middle and ring fingers carry the most on an edge and are longer; tendon moment arms are averaged over each joint's range.
- **The half crimp posture is an estimate** (PIP 90°, DIP straight); neither paper measured it. Its maximum force uses the crimp's.
- **How the load splits between the fingers** is a slider (default 25%, equal shares; TODO: source).
- **Pulley positions and tendon insertions are estimates** (`pulleysNote` in the data file), so pulley loads are the least certain output. The A3 pulley and the thumb in the full crimp aren't modelled.
- **No co-contraction.** The flexors only do what the statics require; the intrinsic muscles and extensors appear only as leftover moments. Vigouroux et al. distributed forces by optimisation over all six muscles, so their FDS can differ.

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
- **Test postures differ from the exercises.** Plantarflexion was measured with the knee bent (gastrocnemius slack), so standing calf raises high on the toes look harder than they are. Elbow curves were measured with the arm raised 90°. The leg curl, the calf raise and the elbow exercises now correct for this (next section).
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

### Two-joint muscles and grip

Variants can carry a `strengthScale`: a factor on the strength curve, constant or varying with the joint angle, with its own note and source. It covers posture effects the base curve can't, because its test posture differs from the exercise:

| Exercise | Variant | Factor | From |
|---|---|---|---|
| Leg curl | Lying, standing (hip straight) | 0.61 | Guex et al. 2012: isometric knee flexion at 45° of knee bend was 62 Nm with the hip straight vs 110 Nm at 90° of hip flexion. The base curve's test had the hip at about 70° (101 Nm by interpolation). |
| Leg curl | Seated (hip 90°) | 1.09 | Same study. |
| Biceps curl | Preacher (upper arm 45° forward) | 0.87–0.96 by elbow angle | Guenzkofer et al. 2012, Table A1: supinated elbow flexion at 0° vs 60° of shoulder flexion, interpolated to 45°. |
| Biceps curl | Hammer (neutral grip) | 0.95–1.10 | Guenzkofer et al.: neutral vs supinated. Kohn et al. 2018 found no significant difference either. |
| Biceps curl | Reverse (palms down) | 0.83–0.99 | Guenzkofer et al. (torque). Kohn et al. measured 53% of supinated force at 70° of elbow flexion, so this may be optimistic. |
| Calf raise | Standing, single or two legs (knee straight) | 1.20 | Cresswell et al. 1995, Table 1: 134.9 Nm with the knee straight vs about 112 Nm at the base curve's 50° of knee bend (10 men). Baptista et al. 2014 (100 vs 73 Nm, knee straight vs 90°) and Kovács et al. 2024 (31% lower bent) agree. |
| Calf raise | Seated (knee 90°) | 0.92 | Cresswell et al.: 103.7 Nm at 90°. The gastrocnemius modifier is 0.65 (its EMG fell by about a third with the knee bent: Baptista et al., Kovács et al.). |
| Triceps extension | Overhead | 0.85–0.90 | Guenzkofer et al.: extension torque at 135° vs 0° of shoulder flexion (held at 135° for the 180° posture). |
| Triceps extension | Skullcrusher (shoulder 90°) | 0.89–0.95 | Interpolated between their 60° and 135°. |

What it shows:

- **Hamstrings:** a lying leg curl works the hamstrings at a much shorter length than a seated one. The same load is about 1.8× harder relative to strength (0.61 vs 1.09).
- **Hammer grip:**
  - Kleiber et al. 2015 found the biceps and brachioradialis working at the same levels with a neutral or palms-up grip; only palms down shifted work to the brachioradialis. Guenzkofer et al. found neutral and palms-up equally strong. So the data don't support the hammer curl as a brachioradialis exercise.
  - The reverse curl gets a 1.2× brachioradialis modifier. Kleiber et al. give the direction of the shift but not a number in the text, so the size is an estimate.
- **Overhead triceps:** measured elbow-extension torque was *lower* with the arm overhead, despite the long head being stretched there. Whether that position builds more muscle is a different question, about training rather than strength: Maeo et al. 2023 found about 1.5× more long-head growth with overhead training, at 34–39% lower loads.
- **Calf:** a standing calf raise (knee straight) has about 30% more plantarflexion strength than a seated one (knee bent 90°). The same load is about 1.3× harder, relative to strength, when seated.
- **Checked, no correction needed:**
  - Knee-extension strength doesn't change with the hip angle (two-joint rectus femoris). Black et al. 1993 measured 139 Nm supine vs 140 Nm sitting, Bampouras et al. 2017 245 vs 241 Nm.
  - Black et al.'s hamstring numbers (48 Nm supine vs 78 Nm sitting, a ratio of 0.62) confirm Guex et al.'s 0.56.
- **Hammer grip strength:** Mandalidis & O'Brien 2001 found neutral 2–5% weaker than palms up; Guenzkofer et al. found it equal or slightly stronger. Within about 5% either way.
- **Brachioradialis with palms down:**
  - Coratella et al. 2023 compared grips at the same relative effort (each grip at its own 8RM). Palms up gave the most biceps *and* brachioradialis activity. Neutral was −12% / −6% and palms down −19% / −5%.
  - The hammer and reverse curls now carry those factors (0.89 / 0.94 and 0.84 / 0.95) instead of the old 1.2× estimate.
  - Earlier studies at unmatched loads found no change (Boland et al.) or more brachioradialis with the palms turned down (Kleiber et al., Marcolin et al.).

Limits:

- **Single test angles:** Guex et al. tested one knee angle (45°), so the factor is applied across the whole range.
- **Reference postures:** Guenzkofer et al.'s reference (shoulder at 0°) isn't the base curve's posture (Pinter et al., arm raised to the side). The corrections are relative to the arm at the side (standing curl, pushdown), and those variants are taken as the base curve.
- **A suspect table value:** their arm-at-side extension value at 120° with a neutral forearm (7.2 Nm) looks like a misprint; the mean of the other two forearm positions is used instead.

### Cross-check against Lategan's norms

Lategan 2002 measured a large group of young South African men (aged 16–29, 71.5 kg on average, 116–438 per test). The tests were concentric and isokinetic at 60°/s (ankle 30°/s), and weren't corrected for gravity. The model's peak values come from isometric studies, so the two should agree roughly but not exactly: isokinetic torque at 60°/s is usually a little below isometric.

| Movement | Lategan (mean) | Model peak | Comment |
|---|---|---|---|
| Knee extension | 236 Nm | 200 Nm (Anderson) | Model about 15% lower: Anderson's sample and test position differ. Conservative. |
| Knee flexion (seated) | 159 Nm | 110 Nm (Anderson, seated) | Model about 30% lower. Seated, gravity helps flexion in Lategan's uncorrected test, so part of the gap is the lower leg's weight. |
| Plantarflexion, knee straight | 131 Nm (30°/s) | 143 Nm (119 × 1.20) | Agrees. Cresswell measured 135 Nm. |
| Elbow flexion, palms up / neutral | 57 / 49 Nm | 65 Nm (Pinter, all) or 85 Nm (men) | Model higher, as expected for isometric vs isokinetic. Lategan's two grips were different subgroups, so their ratio isn't a paired comparison. |
| Elbow extension | 48–61 Nm | 58 Nm (Pinter, all), 77–80 Nm (men) | Same pattern. |
| Shoulder flexion / extension | 81 / 87 Nm | 68 / 93 Nm (Mayer) | Close. Lategan notes his flexion value is higher than other studies'. |
| Shoulder external / internal rotation (arm out at 90°) | 39 / 51 Nm | 30 / 43 Nm (Mayer) | Model about 20% lower. |
| Horizontal abduction / adduction | 93 / 92 Nm | 93 / 92 Nm | Now taken from Lategan directly. |

Nothing here is far enough off to swap sources. The knee and rotation values may be on the low side for trained men, which the strength slider covers.

The calf raise had a double count, now fixed. Its peak had been raised from Anderson's 119 Nm to 150 Nm for the straight knee, by an unsourced amount. Once the measured ×1.20 knee correction was added, a standing calf raise reached 180 Nm, against 131–135 Nm measured. The peak is back to 119 Nm, and the correction gives 143 Nm.

### Cross-check against Chen & Franklin's dataset collection

Chen & Franklin (2025, read as the CC BY 4.0 preprint) collected several hundred isometric hip, knee and ankle torque datasets from the literature and plotted them normalised by body mass × height. They give ranges, not a pooled curve, and say outright that the studies are too varied to combine. Their raw data (`.mat`) are on figshare, which the build environment can't reach, so the ranges below are read from their text and figures. The model's default lifter is 75 kg and 1.75 m (131 kg·m).

| Movement | Chen & Franklin (Nm per kg·m) | Model | Comment |
|---|---|---|---|
| Hip extension | 1.0–1.6 with the hip well bent, below 1.0 near straight | 1.53 at the peak (200 Nm), 0.96 at 0° | Agrees, at the upper end. |
| Hip flexion | 1.5–2.0 near straight, below 1.0 well bent | 1.08 (142 Nm; lat pulldown only) | About 30% low. Only holds the lean-back in the pulldown, so its effort percentage reads high. |
| Knee extension | Peak 1.0–2.0 at 60–80° of knee bend | 1.53 at 65° | Agrees, angle and size. |
| Knee flexion | Roughly 0.5–1.2 | 0.84 (110 Nm) | Agrees. |
| Plantarflexion | 0.5–1.5 with the ankle dorsiflexed (some up to 2.0) | 0.91 knee bent, 1.09 knee straight | Agrees. |
| Hip abduction | Roughly 0.5–1.0 | 0.99 (130 Nm, 3D lifts), 0.84 (110 Nm, hip abduction) | Agrees, at the upper end. |
| Hip adduction | Roughly 0.5–1.3 (75–175 Nm) | 1.89 (247 Nm) | **High.** Welsh et al. tested trained ice hockey players. Adductor effort in the 3D leg lifts is probably shown too low; flagged in the data notes until a general-population source replaces it. |
| Hip rotation | Roughly 0.2–0.45 | 0.33 / 0.30 (43 / 39 Nm) | Agrees. |

Other points from the same paper:
- **Anderson et al. 2007 is the model's main leg source, and Chen & Franklin left it out.** Its fitted angle–velocity surface smooths the peaks, and its young men's plantarflexion peak (95 Nm, about 0.7 Nm per kg·m) is barely enough for walking. The model's peaks taken from Anderson (200 Nm hip and knee extension, 110 Nm knee flexion, 119 Nm plantarflexion, the knee-bent mean rather than the fitted value) all land inside Chen & Franklin's ranges above, so the sizes check out. The curve shapes are still Anderson's smooth fits, which may flatten real peaks.
- **Hip extension hardly changes with knee angle** in the three datasets they found (hip at 0–45°): the curves in their Figure 5 are nearly flat from 0° to 90° of knee bend. Two other studies on the reading list report 30–40% more with the knee nearly straight, so this stays open.
- **Lowering vs lifting:** measured joint torque rarely goes above 125% of isometric in eccentric tests, and rarely below 25% even at high concentric speeds. The app uses isometric strength in both phases, so effort while lowering is overstated by up to about a fifth.
- **Hip rotators change role as the hip bends.** The gluteus maximus and medius rotate the thigh outwards with the hip straight and turn into internal rotators when it is deeply bent (Chen & Franklin's moment-arm review, citing Delp et al. 1999). The model's "external rotators" keep the same weight at every hip angle, which overstates them at the bottom of a deep squat or leg press.

Rajagopal et al. 2016 (the OpenSim full-body model) gives each leg muscle's force capacity (from MRI volumes) and moment arms. Turning those into angle-dependent muscle weights needs the model run offline; the files are on simtk.org, which is also blocked here. Its strength validation cites Waters et al. 1974 on hip extension with the hamstrings, now on the reading list.

### Still without a source

- Muscle activation weights (62 values; the bench grip-width effects are now backed by Mausehund et al. qualitatively).
- Machine cam profiles.
- Hip-extension strength vs knee angle (the hamstrings' share at the hip): Chen & Franklin's data say little change, two other studies say 30–40%; see the reading list.
- Hip adduction peak for untrained lifters (the current value is from trained hockey players).
