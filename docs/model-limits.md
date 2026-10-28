# Model limits

We tried 5 standard upper-body and 10 standard leg exercises from the wger starter library against the single-joint model, to see where it stops working. Nine fitted after generalising the model. The six that didn't now run on a separate **multi-joint model** (`js/multijoint.js`), described in the second half of this page.

| Exercise | Status | Variants |
|---|---|---|
| Triceps extension | ✅ added | cable pushdown, overhead dumbbell, lying EZ-bar (skullcrusher) |
| Front raise | ✅ added | dumbbell, cable from behind, chest-supported 45° incline, dumbbell to overhead |
| Chest fly | ✅ added | lying dumbbell, standing cable, pec deck |
| Straight-arm pulldown / pullover | ✅ added | cable pulldown, lying dumbbell pullover |
| Bench press | ✅ 3D (shoulder and elbow) | medium, wide and close grip, elbows flared, 30° incline |
| Leg extension | ✅ added | machine, ankle weight |
| Leg curl | ✅ added | lying machine, seated machine, standing with ankle weight |
| Calf raise | ✅ added | single-leg with dumbbell, two-leg machine, seated machine |
| Hip abduction | ✅ added (3D figure, OpenSim muscle model) | standing cable, side-lying, standing machine, seated machine with trunk lean |
| Hip adduction | ✅ added (3D figure, OpenSim muscle model) | standing cable, side-lying (bottom leg), seated machine with trunk lean |
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
- **Range of motion per variant.** A variant can now set its own range: the overhead front raise and the Lu raise go to 180°, the other raises stop at 90°, side-lying adduction stops where the leg meets the floor. Not split yet: the standing cable kickback realistically uses 30° to −25°, the kneeling one 90° to −25°.
- **A variant can't change the joint set-up.** Seated vs lying leg curls would need both hip angles shown properly. (The seated hip machines get around this with the hip model below: the hip bend is a parameter of the muscle model, not a second joint.)
- **Straight limbs.** The soft elbow in a fly and the forward lean in a straight-arm pulldown aren't modelled.
- **The shoulder blade moves too.** The lateral and front raises, the straight-arm pulldown and the fly turn the arm about one fixed shoulder point, but the shoulder blade turns with the arm: Braman et al. 2009 measured about 2.3° at the shoulder joint per 1° of shoulder-blade upward rotation when raising the arm (2.7 lowering; about 3.7 : 1 in the first 30°), against Inman's classic 2 : 1. Each of these exercises now says so under the angle slider; the shoulder-blade muscles (trapezius, serratus anterior, rhomboids) aren't analysed. For the fly the share of shoulder-blade motion hasn't been sourced (TODO). The other single-joint exercises are single-joint as performed strictly; the finger-roll wrist curl's finger work and the calf raise's toe joints (taken as a fixed pivot at the ball of the foot) are noted in their files.
- **3D muscle drawings** are schematic strips on the side of each segment the data names, on both limbs (the split squat: front leg only) and on both sides of the spine; which ones you see depends on the camera, as on a real body (the back muscles are hidden from the front). Every listed muscle of the 3D lifts is drawn.
- **Muscle drawings with a fixed origin.** Muscles that run from the trunk or pelvis to the moving limb (lat, teres major and sternal pec in the pulldown and pullover, pectoralis in the fly, gluteus medius in hip abduction, gluteus maximus in the kickback) are drawn from a fixed body point to their insertion, so they stretch with the limb. The others still ride along the limb segment. The points are schematic.
- **Machine cams: a choice of shapes, each with its basis.** Machines differ, so each machine variant offers several cam shapes (the set-up's "Cam shape" choice; Expert mode and the model page give each one's source). The three leg-extension machines use profiles read off Folland & Morris 2008 (the mean of eight machines, and the two extremes), checked against their Table I; they were measured at 20–100° of knee bend, so the app holds them flat below 20°. The pec deck's default is a linkage machine's computed curve from its 1989 patent (Maag, FIG. 4: 97% of the stack at the pads early, 121% at mid-range, 68% as the arms close). The leg curl's default is a rising cam whose radius doubles from straight to fully bent, from one patent's survey of commercial leg machines (Cunningham) and Harman's 1983 Nautilus check; the in-between shape is an estimate. The rising pec-deck cam and the falling hip-abduction cam follow only the direction makers describe (estimates). Every machine also offers a round pulley (constant lever, physics). The hip adduction, lateral raise and kickback cams are still illustrative. Stack kg don't compare with dumbbell kg, and the absolute scale of a cam is nominal.
- **Curl muscle weights: shape sourced, level estimated.** How the biceps', brachialis' and brachioradialis' weights change over the elbow angle now follows their moment arms (Murray et al. 1995) relative to each other: the brachioradialis gains share with flexion, the biceps loses some. Each muscle's overall level (its weight at 90°) is its normalized potential moment from Ramsay et al. 2009 (biceps 1, brachialis 0.75, brachioradialis 0.40). The palm-up vs palm-down change in the biceps' moment arm (a few mm, their Fig. 6) is left to the grip factors from Coratella et al. The curls' elbow flexors in the multi-joint lifts (rows, pull-ups) still use their own estimated weights.
- **Wrist curls: strength measured, muscle shares estimated.** The statics are exact (forearm flat: torque ∝ cos of the wrist angle; behind the back: ∝ sin). Strength curves and peak torques are from Delp et al. 1996 (10 men): flexion strongest at 40° of flexion, so the seated curl's sticking point is about 30° bent back, not at the level hand; extension nearly flat. Their test held the elbow at 90° with the forearm supinated, as in the seated curl. Muscle weights follow each muscle's moment potential (size × moment arm) from Gonzalez et al. 1997, at two wrist angles: the finger flexors (FDP, FDS) lead, the dedicated wrist flexors follow. The finger roll's extra finger work is only a higher share for FDS and FDP: the finger joints aren't modelled. A second data set (Vigouroux et al. 2015, wrist neutral, forearm mid-pronated) measured more: flexion 15.7 Nm with the fingers free and 26.8 Nm with the finger flexors helping (untrained men; climbers 17.9 and 36.1 Nm), extension about 10 and 12 Nm. A curl grips the dumbbell, so the finger flexors do help: the 11 / 6.5 Nm defaults may be low for most lifters. Left as they are (the strength slider covers the range) until a gripped-curl strength curve turns up.
- **Close-ups are schematic.** The forearm, upper-arm, shoulder, trunk, hip/thigh and lower-leg drawings place muscles where atlases show them, simplified and not to scale. Their colours use the same activation estimates as the bars, so a muscle that looks distinct in the drawing is not resolved any better by the model. Where an exercise only has a group value (quadriceps, hamstrings, pectoralis, the external rotators of the shoulder or hip), all heads show that value and are hatched: which head works more needs a muscle model (OpenSim) or EMG. Two exceptions use measured per-head shares (`regionShares`): the Romanian deadlift's hamstrings from Ono et al. 2011 (surface EMG in the stiff-leg deadlift: semitendinosus lowest) and the leg curl's from Messer et al. 2018 (MRI after the Nordic exercise: semitendinosus highest). The sources disagree on hip extension (Messer et al. found the semitendinosus highest in the 45° back extension), and Park & Lim 2023 show the split shifts with hip rotation, so these are one study's pattern each, not settled values.
- **wger links.** The starter library has no exercise ids (its `Movement Pattern` column is empty and `Equipment` is unreliable, e.g. "None (Bodyweight)" for the leg-extension machine). All 23 ids are now set by hand from wger's public exercise list; four have no exact match there, so they link the closest entry and name the alternatives in their note.

## Hip abduction and adduction: OpenSim muscle model

### How it works
- **Geometry from OpenSim.** `tools/osim-hip.mjs` reads the Rajagopal et al. 2016 leg model directly from its XML, with Uhlrich et al. 2022's updated paths for the gluteus medius, minimus and TFL (no OpenSim install needed). It writes `data/opensim/hip-muscles.json` with the 25 right-leg muscles that cross the hip: maximum force, path points relative to the hip centre, and the wrap cylinders (gluteus maximus over the pelvis, adductors along the femur shaft, iliopsoas at the pelvic brim).
- **Moment arms.** `js/hipmodel.js` puts the femur at any hip bend, abduction and rotation (the model's flexion → adduction → rotation order). It wraps each path over its cylinders the way OpenSim does (tangent, arc, tangent; when the line cuts the cylinder or passes on its forbidden side), and takes the moment arm as minus the change of length per radian.
- **Muscle shares: static optimisation.** Each muscle can pull with its maximum force × moment arms about flexion, adduction and rotation. The working-way total is scaled to the measured strength, so the strength curves stay the measured ones. The activations minimise the sum of squared activations while the muscles make the joint torque about the ab/adduction axis and nothing about the other two, so a muscle that also extends or rotates strongly costs extra (others have to cancel it). Seated, the seat is taken to carry flexion–extension and the pads and footrests rotation, so only ab/adduction is balanced there. The solution is exact: a = clamp(Aᵀy, 0, 1), with y found by Newton steps on the dual.
- **Force–length from OpenSim itself.** `tools/opensim_export.py` (run with OpenSim 4.6) gives every muscle's force at full activation at each posture: the Millard muscle model with the tendon in equilibrium, on a hip bend (0–120°) × ab/adduction (−50 to 20°) grid, knee straight and bent 90°. `tools/hip-force.mjs` stores it as a share of the maximum force; the optimisation uses that force instead of the maximum, so a muscle that is short (or overstretched) at this posture counts for less. Example: the hamstrings with the hip bent 90° are overstretched with the knee straight (about 10% of their force) and near full force with the knee bent (seated).
- **Seated machines and trunk lean.** One seated variant per exercise. The trunk-lean slider sets the hip bend (90° − lean; the thighs stay on the seat, the pelvis tilts with the trunk). The figure is 3D (drag to turn, zoom to the hip) and draws each muscle along its model path, coloured by its activation.

### What it shows
- **Seated abduction, 20° apart, 5 kg** (light, about 25–60% effort): leaning back 45° (hip bent 45°) shares the work: gluteus medius 32%, upper gluteus maximus 26%, piriformis 23%. Upright (90°): upper gluteus maximus 63%, piriformis 59%, gluteus medius 13%. Leaning forward 30° (120°): upper gluteus maximus 82%, gluteus medius 0%. The gluteus medius's abduction moment arm falls from 4–5.4 cm (hip straight) to 0.2–1.5 cm at 90°, and its front part reverses past that.
- **Standing**, the gluteus medius leads (about 73% at 20° with the cable's default load), with TFL, gluteus minimus and the sartorius/rectus femoris helping.
- **Adduction:** adductor longus/brevis/gracilis lead, then the adductor magnus; the lower gluteus maximus and the hamstrings help a little (they also extend, which has to be cancelled). Seated, leaning changes little: the adductors keep their leverage.

### Checked against
- **OpenSim 4.6 itself:** the JS moment arms (`js/hipmodel.js`, with its own cylinder wrapping) against OpenSim's `computeMomentArm` for all 25 muscles, about all three hip axes, at hip bend 0–120° and abduction 0–50°: mean difference about 0.1 cm, largest 1–2 cm (TFL and sartorius at the extremes). The knee bent 90° changes no hip moment arm (only the muscles' force, through their length).
- **The model's own strength curves vs the measured ones** (sum of every muscle's force × moment arm, with force–length):
  - *Adduction vs angle* matches well. Relative to 25°: model 0.59 / 0.83 / 0.96 / 1.0 at −15 / 0 / 15 / 40°, measured (Chen & Franklin) 0.62 / 0.72 / 0.88 / 1.0. Without force–length the leverage alone rose steadily, the wrong shape.
  - *Adduction vs hip bend:* the model drops 15–28% by 45° (more with the leg out), measured about 40%. Right direction; without force–length there was no drop.
  - *Abduction vs angle* is only partly reproduced. The model peaks near 10° of abduction and has dropped 27% by 40°; Neumann et al. measured a steady fall to 36% of the −10° value. Without force–length the leverage alone rose.
  - *Abduction vs hip bend:* the model drops 18% by 45°, measured about the same as straight.
  - So the shares use the model, and the strength curves stay the measured ones.
- **Dostal et al. 1986 (Table 1, hip straight):** model vs Dostal's moment arms. Gluteus medius middle and rear 4.0–4.9 vs 6.0–6.7 cm; gluteus minimus 3.9–5.2 vs 4.3–5.8; TFL 5.5 vs 3.9; piriformis 2.4 vs 5.2; adductor brevis 5.5 vs 7.1, longus 5.8 vs 3.2, magnus 3.5–6.4 vs 6.2–7.6. Same signs and roles; sizes mostly within about ±30%, up to about 2× apart for the piriformis and adductor longus (different specimens and attachment points).
- **Dostal et al. (Table 2, actions at 0, 40 and 90° of flexion):** reproduced in direction. The gluteus medius and minimus lose their abduction with the hip bent and their front parts turn against it; TFL and piriformis keep abducting; the adductors keep adducting.
- **Chen & Franklin (Fig. 6):** abduction strength about the same at 45° of hip bend as straight; the model's summed force × moment arm falls only 5%. Adduction measured about 40% weaker at 45°, but the model's leverage doesn't fall. The loss is more likely the adductors working shorter (force–length), which the leverage model leaves out, so the measured value is used.

### Still limited
- **Muscles missing:** the model has no obturators, gemelli, quadratus femoris or pectineus. Dostal found the external rotators turn into abductors with the hip bent 90°, so the model likely underrates seated abduction strength and the deep rotators' share. The pectineus shows "not modelled".
- **Strength beyond 45° of hip bend** (seated abduction) follows the model's summed maximum force × moment arm, relative to 45°: about 0.54 at 90° and 0.41 at 120°. With force–length the model says lower still (0.41 at 90°), but it already overstates the drop to 45° and lacks the deep rotators, so both are likely too low; the leverage-only value is kept until a measurement is found (reading list). Seated adduction is held at the measured 45° value.
- **Passive forces** (stretched muscles pulling back at the ends of the range) are exported but not used. Velocity isn't modelled (the curves are isometric).
- **Wrapping:** cylinders only; the three wraps around the knee (gracilis, semimembranosus, semitendinosus on the tibia) are left out, which doesn't change their hip moment arms. Two-joint muscles use the knee straight, so seated (knee bent) the hamstrings' and gracilis' hip moment arms are approximate.
- **The supports' share** (seated flexion and rotation) is an assumption; how much the pads and footrests really take isn't measured.
- **Range:** 0–60° of abduction. The hip itself abducts about 45° in common norms (a source is still to find), more with the hip bent; strength is measured only to 40° and held beyond. Past about 45°, standing, most people tilt the pelvis, which isn't modelled.
- **Licence:** Rajagopal et al. 2016 and Uhlrich et al. 2022 are under the MIT licence (SimTK project pages); `data/opensim/hip-muscles.json` carries the notice. The Lai et al. 2017 changes in the 2023 model file state no licence and are left out (they only change the knee end of the two-joint muscles; the hip moment arms move by at most 0.2 cm).

## OpenSim cross-check: the other leg exercises

Run 2026-10-09 with OpenSim 4.6: `tools/opensim_export.py` on Rajagopal2016.osim (grids hip × knee and knee × ankle, every muscle's force at full activation with force–length), then `node tools/opensim-check.mjs export.json`. Nothing in the app was changed by it; the 2023 model file (with Lai et al.'s changes) was run locally as a second opinion, not published.

**Strength-curve shapes: the model doesn't reproduce the measured ones, so the measured curves stay.**
- Knee extension (relative to peak, at 0 / 30 / 60 / 90° of knee flexion): measured 0.14 / 0.73 / 1.0 / 0.86, model 0.81 / 1.0 / 0.84 / 0.46. The model peaks at 30° instead of about 65° and is far too strong near full extension. Lai's version is closer (peak 45–60°) but still 0.65 at 0°.
- Knee flexion: measured peak at 30°, model at 60° (hip 70°).
- Hip extension: measured peak at about 50°, model at 25°, and the model falls to 0.28 at 120° where the measured curve is held at 0.94.
- Plantarflexion: same shape, the model's peak about 10° further towards plantarflexion.
- Generic musculoskeletal models are scaled from cadaver and MRI data, not fitted to dynamometer curves, so this is a limit of the model, not a reason to change the measured curves.

**Two-joint corrections:**
- Plantarflexion by knee angle (Cresswell et al.): agrees. Model vs app at knee 0 / 30 / 60 / 120°: 1.11 / 1.08 / 0.94 / 0.67 vs 1.20 / 1.06 / 0.97 / 0.72. Only at 90° do they differ (model 0.77, measured 0.92).
- Knee flexion by hip angle (Guex et al.): agrees with the hip straight (model 0.76, measured 0.61, both weaker than the base test), disagrees at 90° of hip flexion (model 0.85, measured 1.09: the model's hamstrings are overstretched there). Measured kept.
- Hip extension by knee angle (Yamamoto et al.): the model finds almost no loss with the knee bent 90° (0.94; measured 0.82). Measured kept.
- Calf raise, knee straight: the model's own ratio (knee straight ÷ knee 50°: 1.11 / 1.25 / 1.34 at 0 / 20 / 30°) can't be put on the measured knee-bent curve, which falls much more steeply near the top than the model's (0.18 vs 0.32 at 34–35°); stacked on it, a single-leg bodyweight raise would need about 170% at the top. Used consistently instead (the model's knee-straight curve shape, anchored to Cresswell's measured 1.2 at foot flat), the factor comes out 1.34 / 1.52 / 1.98 / 2.50 at 10 / 20 / 30 / 34°, close to the earlier Chen-based values (2.52 at 34°) and matching Chen & Franklin's knee-extended datasets. **Now used** above foot flat; below it the measured 1.2 is kept (the model gives 0.88 at 20° of dorsiflexion, which would make a deficit single-leg raise 111%).
- Knee extension by hip angle (rectus femoris): the app has no correction; the model gives 1.13 with the hip straight vs the leg-extension test's 80°, 0.97 at 90°. Measured, there is no difference: Black et al. 1993 found 140.4 Nm sitting vs 139.0 Nm lying (isokinetic, 24 recreational athletes). Not added. The same study confirms the leg-curl correction: knee flexion 0.62 with the hip near straight vs bent 80° (app, from Guex et al.: about 0.67 between those angles).

**Muscle weights** (the model's activation ÷ effort in static optimisation, comparable to the app's weight tables, which are mostly `TODO` estimates):
- Kickback: same direction as the app (gluteus maximus falls with hip flexion, hamstrings and adductor magnus rise), larger swings. With the knee bent 90° (kneeling) the model's hamstrings nearly drop out near full hip extension (0.03–0.11 vs 0.6–1.1 with the knee straight). **Now used:** the kickback has a knee-bend slider (0–120°, presets: standing 0°, kneeling 90°); it moves the ankle load, scales hip-extension strength by knee bend (Yamamoto et al., as in the lifts) and rescales the gluteus maximus, hamstrings and adductor magnus by the model's ratio to the knee straight (`kneeFactor`, hip × knee grid).
- Leg extension: vasti agree (about 1.0). The model's rectus femoris falls from 0.67 at 90° of knee flexion to 0 at full extension (short with the hip bent 80°); the app keeps it at 0.7–0.8. EMG studies generally show the rectus femoris active in the leg extension throughout, and static optimisation is known to under-use two-joint muscles, so the app's values are kept.
- Leg curl: the model gives the gastrocnemius a large share near full knee extension (1.1–1.4 vs the app's 0.5) and, lying (hip straight), drops the hamstrings to 0.13 at 120° of knee flexion (active insufficiency). The app's flatter weights are kept until checked against EMG.
- Leg curl, checked with Marchetti et al. 2021 (15 trained men, lying, isometric): knee-flexion force at 90° was 0.66–0.68 of the straight-knee force; the app's curve gives 0.68. Toes pulled up vs pointed: +22% at 90° (significant), +17% straight (not significant), against Vuk's isokinetic 10% that the app uses; biceps femoris EMG unchanged, gastrocnemius EMG 44% higher with the toes pointed and the knee straight.
- Calf raise: the model works the soleus hardest (1.4–1.5 vs gastrocnemius 0.7–0.8 knee straight) and makes the gastrocnemius almost silent seated (0–0.4); the app uses measured EMG for the seated drop (× 0.65). Kept.


## OpenSim cross-check: elbow (Arm26 model)

Run 2026-10-09 with OpenSim 4.6: `tools/opensim_arm_check.py` on Arm26 (the OpenSim team's version of Holzbaur et al. 2005's arm, CC BY 3.0: biceps long and short heads, brachialis, the three triceps heads; shoulder flexion and elbow joints; no brachioradialis). Nothing in the app was changed by it.

- **Elbow flexion strength** (shoulder at 90°): agrees with the measured curve (Pinter et al.): model 0.61 / 0.88 / 1.0 / 0.96 / 0.78 at 30 / 60 / 90 / 100 / 120° of flexion, measured 0.53 / 0.77 / 1.0 / 0.99 / 0.79. Beyond the measured 120° the model keeps falling (0.50 at 140°); the app holds 0.79 there (no measurement, see the curve note).
- **Biceps vs brachialis** (standing curl): the model's ratio of their weights matches the app's (Murray et al. moment arms × Ramsay et al. sizes) in mid-range, 1.37 vs 1.40 at 40° and 1.23 vs 1.35 at 80°; near a straight arm the model leans on the brachialis (0.32 vs 1.64 at 0°), at 120° it has them equal (app 1.31).
- **Curls by shoulder angle:** the model changes elbow-flexion strength by only a few percent with the upper arm forward or back (45° forward: 0.94–1.02; 30° back: 0.97–1.09 of standing). The app's preacher factor (0.87–0.96) and Bayesian curl (1.0, biceps × 1.05) are in that range or a little beyond.
- **Elbow extension strength:** the model is nearly flat towards the straight arm (0.99 at 20° of flexion) where the measured curve falls to 0.56: the measured curve stays.
- **Triceps by shoulder angle:** the model makes elbow extension about 20% stronger with the upper arm down (pushdown) and 10% stronger overhead than with it raised 90°, and the long head's weight falls overhead with the elbow bent (0.79 at 120°: overstretched in this model). The app uses 1.0 for the pushdown and 0.85–0.9 overhead (see the variants' notes and sources). Not changed: the model's shoulder is a single flexion axis, and its long head is known to be simplified.
- **Not covered:** the brachioradialis (hammer and reverse curls) and the shoulder muscles. The full Stanford-VA upper limb model (Holzbaur et al. 2005, BSD licence) is downloaded, but only as the original SIMM files: its shoulder (coupled shoulder-blade motion, ellipsoid wrapping of the deltoids) needs OpenSim's own import, which OpenSim 4 no longer has.

## OpenSim cross-check: shoulder (MoBL-ARMS model)

> **Non-commercial source.** These numbers come from the MoBL-ARMS model (Saul KR et al. 2015, Comput Methods Biomech Biomed Engin 18(13):1445–1458, as updated by McFarland DC et al. 2019), which is under a Creative Commons non-commercial licence. They are a check only; the app's shoulder data don't use them.

Run 2026-10-09 with OpenSim 4.6: `tools/opensim_shoulder_check.py` (MOBL_ARMS_fixed_41.osim: every shoulder muscle's moment arms about the plane of elevation, elevation and humeral rotation, and its force at full activation, arm unrotated, elbow straight). The muscle shares come from static optimisation that balances all three shoulder moments (the load only acts on the elevation): balancing elevation alone gave implausible results, e.g. a lateral deltoid that drops out above 90°, because most shoulder muscles also rotate the arm or swing its plane.

- **Up to 90° of elevation:**
  - *Lateral raise:* the lateral deltoid leads (model weight 1.5–1.7) and the supraspinatus fades as the arm rises (0.74 → 0.39 from 0° to 60°), the same direction as the app's estimates (lateral deltoid 0.7–1.0, supraspinatus 0.9 → 0.6). The model leaves the anterior deltoid out below 90°; the app gives it 0.35–0.42.
  - *Front raise:* the anterior deltoid leads, as in the app. The model has the clavicular pectoralis working only near the start (0.42 at 0°, none past 60°; app 0.5–0.6 throughout) and the lateral deltoid joining in, to about 1.0 at 90° (app 0.45).
  - *Straight-arm pulldown:* the long head of the triceps takes a large share near the bottom (2.0 at 0–60°; app 0.5) and the sternal pectoralis pulls hard from 60–120° (1.2–1.7; app 0.3–0.47), with the lats moderate (0.5–0.9; app 0.7–1.0, the main mover).
  - *Chest fly* (horizontal adduction at 90° of elevation): the sternal pectoralis leads, as in the app, with a larger anterior deltoid share (1.2–1.9 vs the app's 0.5–0.6).
- **Above 90° the model can't hold the arm** with the humerus unrotated (no solution within the muscles' strength at 30% effort): real overhead lifting turns the arm out, and MoBL-ARMS moves the shoulder blade by a fixed rhythm without the trapezius and serratus. So the overhead raises aren't checked.
- **Strength curves:** not compared; the summed capacities depend on the same unrotated posture.
- **Why the app's weights stay:** static optimisation that minimises squared activation is known to under-use muscles that co-contract or cross two joints (EMG of lateral raises shows the anterior deltoid clearly active), and these weights are still `TODO` estimates waiting for EMG data. The model results mark where to look: the front raise's clavicular pectoralis and lateral deltoid, the pulldown's triceps long head and sternal pectoralis.

## OpenSim cross-check: hand and wrist (ARMS model)

> **Non-commercial source.** The numbers in this section come from the ARMS hand and wrist model (McFarland DC, Binder-Markey BI, Nichols JA, Wohlman SJ, de Bruin M, Murray WM (2021). A musculoskeletal model of the hand and wrist capable of simulating functional tasks. bioRxiv 2021.12.28.474357), which is licensed for non-commercial use only. They are a check; nothing in the app's data was taken from it. Anyone reusing this page commercially should leave this section out or get a licence from the authors.

Run 2026-10-09 with OpenSim 4.6: `tools/opensim_hand_check.py` (index finger moment arms, per-finger flexor force at the edge lift's grips, wrist muscles from 60° of flexion to 60° of extension with the fingers straight and gripping).

**Edge lift:**
- *Per-finger flexor size* agrees with the app's (Lieber et al. PCSA): FDP index / middle / ring / little 24 / 26 / 21 / 29% (app 22 / 28 / 22 / 28%), FDS 24 / 39 / 26 / 11% (app 27 / 40 / 26 / 6%: ARMS gives the little finger's FDS more).
- *Force–length doesn't matter in these grips:* every finger flexor works at 91–100% of its maximum force in the open hand, half crimp and full crimp.
- *Moment arms:* DIP (FDP) 3.1–5.0 mm, growing with flexion (app: 4.1 mm, An et al.'s average); MCP FDP 9.5–10.6, FDS 10.5–12.2 mm (app 11.1 and 11.9). At the PIP in the crimps the app is larger: half crimp FDP 8.4 vs 12.2 mm, FDS 5.9 vs 8.0 mm, and ARMS's FDS moment arm shrinks as the PIP bends (7.6 mm straight, 4.9 mm at 100°). The app adds Schweizer's measured bowstringing of the loaded tendons over the PIP; ARMS is unloaded geometry, so the gap is expected and the app's measured values stay. If ARMS's shrinking FDS arm is right, the FDS works at even less leverage in a deep crimp than the app shows.

**Wrist curls:**
- *Strength curves:* extension matches the measured curve (Delp et al.) closely with the fingers straight (peak with the wrist bent back 10–20° in both) and falls a little faster when the wrist is curled with the fingers gripping. Flexion doesn't: ARMS peaks at 10° of flexion, measured at 40°. The measured curves stay.
- *Muscle weights* (force × moment arm per group, relative to the largest, fingers gripping): the finger flexors dominate flexion and the ECU stays small, as in the app (Gonzalez et al.). Different: ECRL 0.78 vs the app's 0.33 at neutral (ARMS gives it 337 N maximum force; Gonzalez's architecture data make it a small extensor); FCU nearly silent at 40° of flexion (0.02 vs 0.39: in ARMS it is short and slack there, 12 N active of 480 N); FCR 0.57 vs 0.34 at neutral. Both are models built on different muscle data, so the published Gonzalez values stay; EMG would settle it.

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
- **Bench press shoulders move only by slider.** By default the shoulder joints are fixed on the bench; two sliders move them (shoulder blades pulled back into the bench, and up or down along the body) as a straight shift of the joint, keeping the chest and touch point in place. How far lifters actually move them isn't sourced (`TODO`), so the default stays 0. The default elbow placement (as close under the bar as the arm allows) brings the elbow moment arms near the measured ones, but not for every grip; see the 3D bench section.
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

## Deep squat and thigh–calf contact (added 2026-10-13)

The squat now goes to 150° of knee flexion (the back of the thigh on the calf). Below about 130° the thigh rests on the calf and pushes the shank away from it, which takes part of the knee's extension moment (`thighCalf` in the exercise JSON, `thighCalfForce` in multijoint3d.js, applied in `legFromFloor`).

- **Data:** Zelle et al. 2007 measured it with a pressure mat in 10 adults' body-weight squats: no contact below about 130°, 5% of body weight per leg at the start (134.8°), 34.2% at the deepest point (151.8°), centred 15.1 cm down the calf, growing exponentially; the model follows those means. Zelle et al. 2009 applied it in the same way (a force on the calf) and found the knee's compressive force at full depth fell from 4.9 to 2.9 times body weight; Hartmann et al.'s review stresses that most deep-squat knee calculations leave it out.
- **Effect here:** high-bar squat, 40 kg, 75 kg lifter: the knee's effort at 150° falls from 118% to 96% (205 N per leg, 31 Nm off each knee); the knee's hardest point moves up to about 130–140°, just before the contact takes over, as Zelle et al. describe. The hip is unchanged (the push on the thigh and the one on the calf cancel there).
- **Limits:** the force follows the knee angle and body mass only (measured without a bar; thicker thighs and calves press earlier and harder, and the spread between people was large). The knee's strength below 103° and the hip's beyond 74° are held at their last measured values.
- **Ankle:** a deep squat with the heels down needs a lot of ankle bend. The page notes a shin lean beyond 40° and warns beyond 50°: in the weight-bearing lunge test young adults reached 50 ± 8° (Bennell et al. 1998), elite athletes 41–42 ± 6° (Nagulkar et al. 2024). The front squat's upright shin passes 50° from about 135°: real lifters raise their heels, wear lifting shoes or lean further.
- **Geometry limits found by the break test:** the wide, toes-out squat can't keep its shins at their lean beyond about 130° (the knee search fails) and needs more hip bend than hips allow beyond 120°, so its range stops at 120°. The page now warns when the shin lean can't be met, and when the hips would have to bend more than 140° (passive hip flexion in 30–40-year-old men averaged 120°, range 90–150°: Roaas & Andersson 1982), e.g. with the shin-lean slider near its minimum.

## 3D: bench press

Shoulder **and** elbow (`bench3d`), with both hands on a rigid bar.

- **Placement controls:** grip width, elbow placement ("under the bar", or a set distance outside or inside the hands in the front view), where the bar touches the chest, and the bar spread. The flare angle, the upper arm's angle from the trunk and the forearm's tilt are outputs, shown under the table.
- **Posture:**
  - Shoulders are fixed on the bench, and the bar moves in a straight line from the chest to lockout over the shoulders.
  - The elbow sits on the circle of positions where both arm segments fit, at the point closest to under the bar. That is the smallest elbow moment arm for a vertical push, the coaching cue "elbows under the bar". The manual option instead places it at a set offset from the hand in the front view.
  - Grip widths and touch points are derived from Mausehund et al. (see below). The chest is raised 20 cm above the shoulder joints for the arch; that height is an estimate.
- **Forces:** each hand pushes straight up with half the bar (the bar isn't pulled apart or squeezed).
- **Components:**
  - **Shoulder:** horizontal adduction (pecs), flexion (front delts), rotation (rotator cuff), and abduction in the bench plane (deltoid; added 2026-10-13). On a flat bench the bar's moment has no part about the chest's normal; on an incline it does (about half the horizontal-adduction moment at 30°): the weight also swings the arm towards the feet within the bench plane. Before, that part was dropped, which made the incline press too easy. Flexion strength follows the arm's elevation from the trunk (the overhead press's curve), so the incline, with the arm further overhead, works where the flexors are a little weaker.
  - **Elbow:** extension (triceps), plus its sideways moment (ligaments).
- **Tests:** the shoulder components match their hand formulas (flexion = F × forward distance, horizontal adduction = F × grip offset from the shoulder). The elbow's moment equals F × the horizontal elbow–hand distance. Close grip loads the triceps, wide grip the pecs.

What it shows:

- **Grip width:** close grip loads the triceps and nearly removes the pecs' across-the-body work; wide grip does the opposite (about 1.6× the medium grip's horizontal-adduction torque at 80 kg, 109 vs 68 Nm per arm on the chest). Elbow torque runs close > medium > wide, as measured.
- **Elbows outside the hands** (manual placement) bring in shoulder rotation torques and a larger elbow moment arm. With the elbows under the bar, the push lies in the arm's plane, so the rotation and sideways elbow torques vanish.

Limits:

- **Fixed shoulder joints and a straight-line bar path.** Real shoulder blades retract and move, and real bar paths curve. With fixed shoulders the close grip can't get its elbows under the bar mid-press (moment arm too large), and the wide grip gets them closer than lifters do (too small). Holding the forearm vertical instead would need the shoulder joint to move 14–19 cm mid-press, which isn't plausible, so the real answer lies in shoulder-blade movement. The shoulder-blade sliders now shift the joints: with the close grip, 3 cm back and 2 cm down cuts the shoulder-flexion torque at the bottom (about 66 → 60 Nm at 60 kg) and lengthens the elbow's moment arm there (6.6 → 10 cm), but barely changes mid-press, so the mid-press mismatch remains. The shoulder blade's tilt and rotation, which change the glenoid's direction, aren't modelled.
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

- **Fixed trunk and shoulders.** Lifters lean back at the start and shrug the shoulder blades up at lockout. Neither is modelled, so the start torques and the overhead geometry are approximate. A shrug can't be added as a simple slider: lifting the shoulder joints moves the whole hand path with them and leaves every torque unchanged. Its real effect is the shoulder blade's upward rotation (glenoid facing up, muscle lengths), which needs a shoulder-blade model.
- **Straight bar path.** At the start the line passes the chin; real lifters tilt the head back or curve the path.
- **Strength overhead is partly estimated.** Flexion strength is measured up to 160° (Aronis et al. 2025: standing, isometric, 14 men; it falls almost linearly to 56% of its 90° value at 160°) and held flat beyond. Abduction is sourced up to 90°; beyond that it is marked `TODO` (50% of peak at 180°). The adduction peak (90 Nm) is also an estimate. The overhead front raise follows the measured flexion curve, and above 90° its clavicular pectoralis share falls and its lateral deltoid share rises with Aronis et al.'s EMG; the Lu raise holds the 90° value above 90° (estimate), and the shoulder-blade muscles (serratus anterior, lower trapezius) are listed with estimated shares only.
- **Shoulder blade muscles** (serratus anterior, trapezius) are listed but not estimated.

## 3D: deadlift, Romanian deadlift, split squat and hip thrust

**Romanian deadlift range:** 0–130° of hip flexion, so the bar can go down to the floor (45 cm plates touch at about 125° with soft knees and a flat back, sooner with straighter knees or a rounded back; the model says so when they do). The hip strength curve is only measured to 74° and held flat beyond, so the effort past about 75° is an estimate. How deep someone can hinge with nearly straight knees depends on hamstring flexibility, which the model doesn't limit.

The deadlift uses the same 3D hinge as the Romanian deadlift. With the feet under the hips, toes forward and no sideways push it reduces exactly to the side view (tested for the conventional and trap-bar pulls), including the rule that a straight bar must pass in front of the shins and thighs (the straight arms swing forward just enough). Controls: knee bend as a share of the hip bend, stance width, toe angle, knee tracking and the sideways floor push. Stance width and toe angle of both pulls come from Escamilla et al. 2000 (12 + 12 national-level powerlifters, read in full): conventional 32 cm between the feet with the toes out 14°, sumo 70 cm and 42°. Knee bend: 0.7° (conventional) and 0.9° (sumo) per degree of hip flexion (estimates), and the back is a slider from arched (−20°) to rounded (+40°), default straight (the upper half of the trunk bends forward or back from the lower half).

**Checked against Escamilla et al. at lift-off:**
- *Reproduced:* the hip extensors do most of the work in both pulls; the knee extensors help in both and much more in the sumo pull (model at the floor with 200 kg: knee 27 vs 49 Nm per leg, 1.8×; measured 3.1×).
- *Not reproduced:* the hip moment comes out lower in the sumo pull (model 341 vs 501 Nm per leg; measured about the same, 512 vs 599 Nm for both legs together, not significantly different); they measured an ankle dorsiflexor moment in the sumo group, the model keeps a plantarflexor one; and the model bends the knees more (conventional 95° vs 56°, sumo 122° vs 54°).
- *Why the knee angles weren't fitted:* a knee rule fitted to their measured angles (19° as the bar passes the knees, 56° at lift-off) makes the straight-trunk model reach the floor only by pushing the hips about 40 cm behind the ankles, tilting the shins back, and turns the knee moment into flexion in both pulls, against their measurement. Their published lift-off segment angles (trunk 24°, thigh and shank from the horizontal) don't close with typical segment lengths either: they would put the shoulders about 0.8 m above the bar, more than an arm's length, so part of the difference lies in how the angles were defined and measured. Back rounding doesn't change this for an angle measured to the hip–shoulder line, as theirs was.

The other three also run in 3D with the same leg model as the squat. The tests check that the hinge and the hip thrust reduce exactly to their side-view versions when the feet are under the hips, the toes point forward and there's no sideways push.

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

## Holding muscles (isometric)

The lifts' joint tables can also list what is held still while the lift moves (switch "Show holding muscles", on by default, remembered in the browser):
- **Lower back (L5/S1):** the back extensors' moment at the lumbosacral joint: head, upper and middle trunk, arms and any load in the hands or on the back, about a point 10 cm up the trunk from the hips (estimate). Whole trunk, both sides together (the hip column is per leg). Example, RDL with 50 kg at 90° of hip flexion: 266 Nm at L5/S1 vs 179 Nm per hip.
- **Upper back (mid-back):** the same at the middle of the trunk, for head, upper trunk, arms and load. It is what holds the back from rounding further; front squats and goblet squats load it more than back squats.
- **Grip:** the load in each hand (deadlifts, RDLs, rows, goblet squat).
- **Shoulders (lats, rear delts), per arm:** the moment that keeps the straight arm and bar from swinging forward. Zero when the bar hangs under the shoulders (the RDL here); in the deadlift it appears around the knees, where the bar must pass in front of the legs.
- In the seated row's finish the arms pull the trunk back, so the back moments turn negative: the abdominals hold instead (shown as the opposite muscles).
- Trunk segment masses from de Leva (head 6.94%, upper trunk 15.96%, middle trunk 16.33%, lower trunk 11.17% of body mass); where along the trunk they sit, and the L5/S1 height, are estimates. No strength norms yet (trunk extension, grip), so no effort is shown; on the reading list.

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
- **Shoulder blades by slider:** a travel slider moves the shoulder joint from reached forward at the start to squeezed back at the end (straight along the trunk's front–back axis). Squeezing 6 cm takes torque off the shoulder at the top (bent-over row at 60 kg: about 44 → 37 Nm) and puts more on the elbow (51 → 56 Nm). How far lifters move them isn't sourced (`TODO`); default 0. The muscles doing it (rhomboids, middle trapezius) still aren't estimated.
- **Straight hand path:** real rows arc.

## 3D: pull-ups and lat pulldowns

The `pull3d` solver uses the same arm model as the press, pulling instead of pushing.

- **Pulldown:** seated, trunk leaning back at the variant's angle. The cable pulls the bar's middle towards the pulley, and the bar passes that direction to each hand. The hip holds the trunk.
- **Pull-up:** the bar holds each hand up with half of body + belt weight. The body leans back until its centre of mass hangs under the bar, so the lean grows through the pull.
- **Hands:** they move in a straight line in the trunk's frame, from overhead to the upper chest (or behind the neck).
- **Elbows:** "under the bar" (closest to the pull's line), or at a set offset from the hands.
- **Shoulder blades by slider:** a travel slider raises the shoulder joints by half of it with the arms overhead and pulls them down by half at the end ("packing" the shoulders), along the trunk. In a 75 kg pull-up, 6 cm of travel lowers the elbow torque at the top from about 25 to 12 Nm and the shoulder extension from 31 to 29 Nm; at the start nothing changes. How far lifters move them isn't sourced (`TODO`); default 0.
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

Each finger is a planar chain: wrist → MCP → PIP → DIP. The statics were built and checked on the index finger (bone lengths and tendon moment arms of An et al. 1983) and are applied to all four fingers of the four-finger set below; the page shows the four fingers (summary, Fingers / Hand / Arm views, per-finger charts). The block's weight times the finger's share pulls on the finger pad; the hand hangs so that pull runs straight under the wrist (no wrist moment). From the joint moments:
- **FDP** is the only muscle that bends the DIP, so its tension is the DIP moment ÷ its moment arm (minus the passive part when the DIP is bent back: 22% of the moment in Vigouroux et al.'s crimp).
- **FDS** supplies the rest of the PIP moment. If the FDP alone already over-bends the PIP, the extensor mechanism must hold it; the app reports that moment instead of an FDS tension.
- **MCP**: what the two long flexors leave over goes to the intrinsic hand muscles or the extensors (reported, not modelled as forces).
- **Pulleys**: the tendons run straight between A2's distal edge and A4 (bowstring), and each pulley carries the vector sum of the tendon pulls on it.
- Under load the tendons bowstring further from the PIP as it bends (Schweizer: 4.3 mm for FDP in the crimp, 0.2 mm in the slope grip, 1.75 mm for FDS), which is added to the PIP moment arms.

### Checked against the paper

On Vigouroux et al.'s own set-up (1 cm hold, pull along the metacarpal, their crimp posture) the model gives FDP:FDS 1.3 (they estimated 1.75), A2 2.5× and A4 1.5× the fingertip force (they: 2.7× and 2.4×). Without Schweizer's bowstring correction the ratio came out 0.5, the wrong way round; the unloaded cadaver moment arms are too small for a loaded crimp. Their slope grip can't be compared: its PIP moment (3.4 Nm at 97 N) shows their pull ran across the finger, unlike a block hanging under the wrist. A test pins the crimp comparison.

### Still limited
- **Friction (added 2026-10-10, contact rule revised the same day).** Pad and edge are both curved, so they touch where their surfaces face each other. The pad's surface faces the distal phalanx's palm side ± 35° (its curvature; estimate); the edge's runs from its top face (square to the pull, tilted by the face-angle slider: + incut, − sloping) round the lip to its front. The contact takes the shared direction nearest the push, and the needed coefficient is tan(push ÷ contact normal angle). A pad that can face a level or incut top squarely needs none; a sloping face needs tan(slope) on every finger; a fingertip that meets the edge steeply only reaches the lip and needs more. Examples at the presets on a level edge: full crimp 0 everywhere; half crimp 0, little finger 0.41; open hand 0.14–0.44, rising to 0.8–1.0 as the PIP straightens towards the slope grip. (The first version took the fingertip bone's own direction as the contact normal, which is only right on the lip; it overstated the need on flat faces.) Measured coefficients differ widely by what they measure: the most a fingertip holds on rock 2.5–3.3 (Li et al. 2001), what climbers used on gym-hold surfaces 0.56–0.86 (Fuss et al. 2020); default 1 (estimate). On rough holds the finger pad's friction hardly depends on the pressing force (Dzidek et al. 2017; above about 2 N the pad's contact area stops growing, Adams et al. 2013); on smooth or moist surfaces it falls with force and rises with contact area (Warman & Ennos 2009; Adams et al. 2013), not modelled for the edge. Not modelled either: chalk and moisture (Clarke et al. 2024: chalk mainly makes friction more consistent), the edge's depth (a shallow edge forces the pad onto the lip).

- **The arm carrying the block** is a straight line from shoulder to grip, turned forward and to the side by two sliders (small-angle approximation). Straight down it only transmits the pull; turned out, the shoulder holds the block on a lever (30 kg at 20° forward: about 67 Nm, near typical shoulder-flexion strength). The elbow's effort is an upper bound: a locked straight elbow also resists over-straightening passively.
- **Four fingers (physics only).** Bone lengths per finger from Lin et al. 1989 and FDP/FDS sizes from Lieber et al. 1992; moment arms scaled from the index finger by size (estimate); knuckles 2 cm apart and set back from the middle finger's by 3 / 3 / 8 mm (index / ring / little; estimates, not from the metacarpal lengths); ring and little metacarpals may cup 10° and 20° (estimate). The fingertips line up on the edge, each pad up to 6 mm deeper or shallower; each finger keeps close to the grip's PIP and fingertip angles and adjusts at the knuckle; the hand may tilt sideways (−25° to +30°, wrist deviation or the arm leaning) and roll about its long axis (±30°, forearm rotation). The edge's position under the hand and the tilt are chosen so the four postures stay closest to the grip (weighted squared angle changes; the weights are estimates), and a finger that could only touch in a contorted posture stays off, fading out of the split as its posture cost rises. The block is split for least effort (sum of squared tension ÷ reference tension), with the FDP slips of the middle, ring and little finger pulled towards equal relative tension by the quadriga slider (default 50%, a guess: the strength of the link on an edge isn't measured). The edge under the index, ring and little finger can be offset from the middle finger's (four bars, one per finger), or set to the profile that fits the hand exactly in the grip (every finger in the grip's own angles; in the half crimp this is, to first order, the difference in metacarpal + proximal phalanx length). Users can enter their own bone lengths; moment arms are still scaled from the published index finger. The edge may meet each pad up to 6 mm nearer the fingertip or the DIP crease than the set contact point (estimate), and the search runs twice in Auto (fingers free to drop / all kept on) because a search that starts with a finger off rarely finds all four again. A setting chooses which fingers hold the edge (Auto, all four, without the index, without the little finger). With the measured postures the open hand keeps index, middle and ring on and the little finger off on a straight edge, one of the two patterns Fischer et al. saw. Known gaps: (1) the search weights (knuckle 0.5, tilt 1, PIP and DIP 1 per degree², pad slide 1 per mm²) are estimates; the knuckle angles they produce were checked against Fischer et al.'s middle finger only; (2) the little finger, when it touches, can take a large share (up to about 30%) because Lieber et al. measured a little-finger FDP as large as the middle finger's; climbers usually report the little finger as the weakest, which this model would only show through the small FDS, not the FDP; (3) the sideways part of the pull on a tilted hand (collateral ligaments, interossei) isn't analysed; (4) the block's own balance isn't solved (it hangs level or at the set tilt under the hand); (5) no published per-finger split on an edge has been checked against.
- **Finger split checked against measurements (2026-10-15).** With the presets, the least-effort split gives index / middle / ring / little 20 / 36 / 22 / 21% in the full crimp and 15 / 41 / 25 / 20% in the half crimp and open hand. Vigouroux et al. 2008 measured each fingertip in a crimp (8 subjects): 25 / 32 / 27 / 16% (97 / 124 / 106 / 65 N). The middle finger leads in both, but the app gives the little finger more and the index and ring less. Göb et al. 2022 (22 mm ledge, a sensor per finger, 26 climbers; values only as plots) rank the half crimp index ≈ middle > ring > little, so the app's half-crimp index share looks too low. Not changed yet: the split follows the flexors' sizes (Lieber et al.) and the knuckle set-backs, which are estimates (above). Their modelled A2 loads, 199 / 420 / 277 / 69 N (middle at 90% of its breaking load), are a second check still to run.
- **No edge depth.** Strength doesn't change with the edge's depth. Amca et al. 2012 measured it (1–4 cm): crimps gain up to 2–3 cm and then level off, the open hand keeps gaining (half crimp 361 / 490 / 531 / 517 N; open hand 351 N at 1 cm, 576 N at 4 cm). A depth slider could use their numbers.
- **Where the edge presses is a slider.** Vigouroux et al. put the load at half the distal phalanx on a 1 cm hold. On a 20–25 mm edge the whole distal phalanx rests on it, but where the pressure centre sits hasn't been measured, and it matters: pressing closer to the DIP shifts the work from FDP to FDS.
- **The grip postures are measured on a different hold** (added 2026-10-10). Open hand, half crimp and full crimp take the middle finger's angles from Fischer et al. 2024 (motion capture, 11 elite climbers, real climbing moves on a 23 mm edge with a 25° incut, feet on; mean of both hands): MCP 4° / PIP 54° / DIP 1°, 14° / 72° / −12° and 40° / 87° / −26°. Climbers varied a lot (open-hand PIP −4° to 82°), the index and little fingers weren't measured, and an incut edge lets the fingertip bend back further than a block's flat edge would; the edge-lift block is not incut. Vigouroux et al.'s single-finger postures (slope: MCP −21°, PIP 26°, DIP 39°; crimp: −3°, 107°, −23°) were used before; their crimp is kept for the check above. The half crimp's maximum force uses the crimp's. Posed photos and videos were measured as a plausibility check only (they agree on the crimps; posed open hands show PIP 45–51°), since a demonstration photo isn't a loaded hold.
- **Pulley positions and tendon insertions are estimates** (`pulleysNote` in the data file), so pulley loads are the least certain output. The A3 pulley and the thumb in the full crimp aren't modelled.
- **Hanging (added 2026-10-10).** The edge lift can load the hand with the body instead of a block: (body mass × (1 − share on the feet) + added weight) ÷ hands. Finger statics unchanged (the push runs from pad to wrist either way); the arm overhead only pulls, so no arm loads or Play. With the default (recreational) finger strength a 75 kg climber is close to the limit in a free two-hand hang on the half crimp. Checked against hang data: climbers around French 7a (IRCRA 20, 25 climbers) held 133 ± 14% of body mass for 5 s in a two-arm hang on a 21 mm edge in both crimp and open hand (Ferrer-Uris et al. 2023, Table 2); the model needs about 124% strength in the half crimp, 151% in the full crimp and 144% in the open hand to hold that. In one-arm hangs on a 20 mm rung (5 s, half crimp or open hand, self-selected), 421 intermediate to elite climbers held about 85% (men, about 60 kg per hand) and 80% (women, about 44 kg) of body mass (Torr et al. 2022, Table 2): the model needs about 160% / 185% (men, half crimp / open hand) and 115% / 135% (women). So 100% is a recreational level, as intended. Two gaps show: the crimps differ by more than measured (the full crimp comes out relatively weaker), and the open hand comes out weaker than the half crimp, while both studies measured them about equally strong. The ARMS hand model wouldn't change the little finger: its little-finger FDP is the strongest slip (237 N) and its FDS the weakest (75 N), as in the cadaver data used here. One-hand lifts like the edge lift itself (Bourne et al. 2011: 15 experienced climbers on a force plate, crimp) reached about 393 N (40 kg, range 27–58 kg) on a 12.5 mm edge, close to the model's 38 kg (half crimp) and 31–33 kg (open hand, full crimp) at 100% (added 2026-10-28). On shallower edges they fell to about 283 / 240 / 185 / 110 N at 7.3 / 5.8 / 4.3 / 2.8 mm, and the shallow-edge forces didn't follow the deep-edge ones: the fingertip pulp limits there. The model has no edge depth as such (only where on the distal phalanx the edge presses), so it can't show that drop.
- **One lift over time (Play).** The force on the hand follows Newton's m·(g + a): no force while the block rests, a build-up while the floor still carries it, lift-off on a minimum-jerk path (5 cm, estimate; the time is a slider), hold at exactly the weight, set-down and release. Only the block's acceleration is included, not the arm's or body's.
- **No co-contraction.** The flexors only do what the statics require; the intrinsic muscles and extensors appear only as leftover moments. Vigouroux et al. distributed forces by optimisation over all six muscles, so their FDS can differ.

## Pinch lift (added 2026-10-10)

### How it works
- **Squeeze from friction.** The block's faces are vertical and parallel, so the thumb presses as hard as all fingers together (N). Each contact patch holds μ·N0·(N_patch/N0)^n (N0 = 10 N; Adams et al. 2013: 2/3 ≤ n ≤ 1). With n = 1 (default; dry or chalked skin on a rough surface, where the pad's contact area stops growing above about 2 N) the squeeze is weight ÷ 2μ, whatever the finger count; with n < 1 (moist skin, smooth blocks) spreading the squeeze over more fingers holds more. μ is a slider (default 0.6, estimate).
- **Capacity.** About 194 N per face: maximal whole-hand pinch of 5 and 8 cm wooden holds in 22 advanced climbers (Huang et al. 2026; 377–398 N, no width difference), read as summed over both faces (the paper doesn't say). × strength % × a wrist factor (flexion −25% at 38°, extension 0: Goislard de Monsabert et al. 2023; linear between, estimate). Gauge palmar pinch in untrained adults is about half (Mathiowetz et al. 1985: men 104 N; Massy-Westropp et al. 2023: 83–107 N).
- **Muscles.** Thumb and index finger as planar chains at the postures measured on 3.5–7.5 cm objects (Vigouroux et al. 2011, light grip), ARMS moment arms and forces (non-commercial). Pliers (FPL and FDP only) or jointed (every joint balanced, static optimisation). The model alone fails at 15–25 N of squeeze (small thumb muscles and extensors saturate), so at each width it is scaled to fail exactly at the capacity: it shows the load's distribution, not the hand's strength.

- **Four fingers lying along the face (added 2026-10-27).** In the pinch-block grip the fingers lie along one face, not just their pads: on wide holds the proximal and middle phalanges touch too, and Huang et al. (2026) describe more flexion lifting them off on narrower ones, but nobody has measured block postures or how the pressure spreads along the finger. So both are estimates. **Posture** (tools/arms_pinch_contact.py, ARMS): for each width, the posture with the most finger on the face that still lets the thumb pad reach the width plus 16 mm of soft tissue straight across, below the face's top edge (the last joint on it): straight fingers, contact up to the knuckle, at 20–50 mm; bent at the middle joint, contact up to it, at 60–70 mm; the fingertips alone at 80 mm. Then the least finger bending, then the least knuckle bending, then the thumb base where the thumb squeezes hardest. The knuckle rule keeps the hand above the block, its web on the top edge, as in a plate pinch: choosing the knuckle angle for the strongest thumb instead bent the knuckles 80° at 20 mm and hung the hand off one side (2026-10-27 review). The thumb's base is kept 4° inside ARMS's ranges: at their ends it squeezed half as hard, and picking the posture nearest neutral instead made the thumb's straight squeeze swing between 39 and 193 N from one width to the next. The index knuckle goes from 0° at 20 mm to 25° at 50 mm and 0–5° at 60–80 mm; the thumb's straight squeeze before calibration is about 215–225 N at 20–50 mm and 74–106 N at 60–80 mm, where it has to reach further (the calibration at 50 and 80 mm evens the two out: largest block at μ 0.6 about 18 kg at 20–50 mm, 21 kg at 60–80 mm, finger shares about 26 / 50 / 21 / 3%); the others take its middle and end joints, their knuckles set so all four pads lie on one face (the little finger's bends back 26° at 80 mm). Beyond 80 mm only the fingertips reach, with the little finger's knuckle bent back 35° (90 mm), and nothing at 100–110 mm, so the variant ends at 80 mm. In the model the narrower the block, the more finger lies on it: the thumb's reach limits wide blocks, which is the opposite of Huang et al.'s guess for narrow holds (their 5 and 8 cm holds may both be in the range where the fingers lie flat). **Forces** (pincer.js pinchHand with the variant's `contact` table): every segment on the face carries force anywhere along it (two contact points per segment, each with its friction cone), so the knuckle is balanced too: the long flexors with the finger model's moment arms and ARMS's interossei and lumbricals (the first dorsal interosseus at its ARMS strength there, not the thumb's calibration factor, which first gave the index 48–67% of the load). The block mustn't turn: the fingers' push sits at the thumb's height (from the ARMS postures, 5–60 mm above the finger pad), shifted by the friction on the two faces; each finger's contacts are measured from its own pad (an estimate: the pads lie at slightly different heights). With that the push spreads over the proximal phalanx and the fingertip on narrow blocks and over the middle phalanx on wider ones, and the middle finger carries the most. The fingers alone could press 225–711 N, so the thumb (calibrated to the measured squeeze at 50 and 80 mm) still sets the maximum. Not modelled: the thenar eminence on the face (Huang et al.: 55% of the stronger climbers pressed it on), the block turning about the other axes (the thumb lands beside the index finger), and the contact patch's size.
- **Whole hand with friction (added 2026-10-11, default).** The thumb (ARMS, all three joints) against all fingers (the edge lift's finger model: ARMS's ring finger can't press near the measured posture), each pad's force anywhere inside its friction cone, so the block's weight pulls the pads towards the fingertips and the hand picks squeeze and weight shares for least effort. The thumb's base posture per width (20–110 mm) is found in the ARMS model (tools/arms_pinch_span.py), with force–length: the long flexor drops from about 200 N (20–30 mm) to 136 N (80 mm) and 76 N (110 mm). Thumb muscles scaled in two groups (2026-10-12) so the straight squeeze is the measured 194 N at both 50 and 80 mm (Huang et al.: equal): long muscles × 2.3, small ones × 8.5. (One factor, × 3.4 at 65 mm, had 50 mm at half of 80 mm.) Fingers with ARMS's force–length by width (1–3%). Result at μ 0.6: largest block about 20 / 24 / 22 / 18.5 / 12 kg at 40 / 50 / 60 / 80 / 90 mm; squeeze a few per cent above the friction minimum; finger shares about 21 / 40 / 21 / 18%. The largest block is precomputed at full strength (data/opensim/pinch-whole.json, tools/pinch-table.mjs: every 5 mm, μ every 0.1, four finger-to-thumb friction ratios) and interpolated; strength and wrist scale it in proportion, since the balance is linear in the muscle forces (checked: half strength holds half the weight to 2%).

### Checked against
- Index FDP force per newton of squeeze at 35–75 mm: 2.7–3.0 in the model, 2.5–3.0 in Vigouroux et al. 2011 (their EMG-driven model). A test keeps it in band.
- With μ 0.6, the maximum block (about 24 kg) is in the range climbers report for the Lattice pinch block (forum reports, not a study).

### Still limited
- Whether Huang et al.'s 377–398 N is both faces summed or one face: the paper doesn't say. Read as one face, the maximum would double.
- The thumb sits partly beside the index finger, not straight opposite the finger pads (the 3D hand shows it): the posture search only matches the pad gap to the width. Asking for opposition too (tools/arms_pinch_oppose.py, 2026-10-12) put ARMS's thumb base at the edge of its ranges and fitted worse: thumb muscles × 9.3 instead of × 3.4 (the single-factor calibration then), 50 mm 62% weaker than 80 mm (Huang et al.: equal), peak 35 kg, the Vigouroux check failed. Kept the distance-only postures.
- The narrow side was too steep with one thumb strength factor (50 mm at half of 80 mm); the two-group calibration fixes the straight squeeze at both measured widths, but the factors (× 2.3 long, × 8.5 small muscles) are a calibration, not a measurement. The fingers keep their narrowest measured posture below 35 mm (Shimawaki et al. 2020: a few degrees of change down to 2 mm); pad points and soft tissue in the thumb-posture search are estimates.
- The capacity is taken as flat over 40–80 mm (measured only at 50 and 80 mm), and as the mixed men-and-women mean of advanced climbers.
- The postures are from light grips; under a maximal load they change (dynamics not captured). Thumb opposition, out-of-plane forces, the palm and thenar eminence on the block, contact along the whole fingers, and lift-off accelerations are not modelled.
- Wall-mounted pinch holds differ: there the thumb pushed only 20–25% of the fingers' force (Fuss et al. 2004, cited in Huang et al.), because the arm takes the sideways balance; on a hanging block it can't.

## Core exercises (added 2026-10-11)

### How it works
- **Single joint, like the arm and leg exercises.** Crunch: the upper trunk, arms crossed, and the head swing about the lower back at the top of the pelvis (the pelvis stays on the floor). Leg raise: both legs swing about the hips, with a knee-bend slider. Back extension: the straight trunk and head swing about the hips, legs held by the pads. A plate held at the chest acts 85% of the way from the pivot to the shoulders; behind the head, at the chain's end.
- **Strength.** Crunch: isometric trunk flexion at −20° to 40° (Wessel et al. 1992, 15 men and 15 women, seated, pelvis strapped), with the trunk's own weight taken off using their passive curve (one subject, read off a figure: an estimate); peak 180 Nm for men (Wessel et al. 1994: about 183 Nm in 39 men; Kumar et al. 1995 imply about 190 Nm; the 1992 group's 140 Nm mixed men and women). Leg raise: hip flexion from Anderson et al. 2007 (young men, both hips: 283 Nm), strongest with the hip straight, 44% at 74° (tested range; held flat beyond). Back extension: hip extension from the same paper (both hips: 400 Nm), as in the glute kickback.
- **Masses.** de Leva's segments; how the trunk splits above and below the pivot, and where the crossed arms sit, are estimates.

### What it shows
- Lying flat, the crunch and the lying leg raise are hardest at the very start, where the body part is horizontal; hanging, the leg raise is hardest with the legs horizontal (90°), where the hip flexors are also short and weak (body weight alone: about 76% of a young man's maximum). Bent knees take about a quarter off.
- The 45° back extension peaks where the trunk is horizontal (45° of hip bend) and keeps load at the top; the horizontal one peaks at the top. A plate behind the head gives about 60% more torque than at the chest.

### Still limited
- The crunch's trunk is one rigid piece on one pivot; a real curl bends the whole thoracic and lumbar spine. A bodyweight crunch comes out at about 56% of a young man's trunk-flexion strength at the start and 65% at 40° (the abdominals weaken as they shorten). Past about 40° a sit-up continues at the hips (hip flexors), not covered.
- Hip flexion strength beyond 74° (the top of a hanging leg raise) is extrapolated; curling the pelvis up at the top (posterior tilt, 'toes to bar') is trunk flexion and is left out. The abdominals' load in the leg raise (holding the pelvis) is a weight, not a balance.
- The back extension (since 2026-10-12 two joints: the hips and the lower back at L5/S1, solver `backExtension`) splits the trunk's bend between the hips and a back-rounding slider. For the same trunk position the moment about L5/S1 doesn't change with rounding; the hips bend less (glutes and hamstrings shorter, weaker: Anderson et al.) and the lower back works flexed, where Graves et al. 1990 measured it stronger (56 men: 238 Nm straight to 465 Nm at 72° of flexion). Part of that flexed strength is ligaments and discs taking up load, which the model doesn't separate; the rounding is drawn as a bend at L5/S1 only (a real spine bends over all lumbar levels). The erector spinae's moment arm at L5/S1 shrinks 9.7% from upright to 45° of flexion in men (MRI, Jorgensen 2001, as used by Jorgensen, Marras & Waters 2002, doi:10.1177/154193120204601312); Graves's measured torque already includes this. Checked with the OpenSim lumbar spine model (Christophy et al. 2012, MIT licence; `tools/lumbar_export.py` → `data/opensim/lumbar-muscles.json`): the back muscles' active capacity (iliocostalis, longissimus, multifidus and quadratus lumborum, force × moment arm about the model's flexion coordinate, both sides) is highest near upright (105 Nm at 10° of flexion) and falls to 80 Nm at 60° (−24%), while Graves et al. measured strength rising about 45% over the same range. The model's absolute values are well below measured strength (its muscles are set weak), so only the trend is used: the extra strength when flexed is mostly passive (ligaments, discs, fascia). Its side-bending capacity comes mostly from the obliques and the iliocostalis, and its twisting capacity is tiny (about 7 Nm from each external oblique against 80 Nm measured), so it isn't used for the Pallof press's numbers.
- Core exercises' 3D view (`js/trunk3d.js`): all 210 trunk-muscle fascicles of the lumbar spine model in its upright posture, shaded by the exercise's muscle effort through each exercise's `trunk3d.map` (exercise muscle → model groups, a side where it matters: the side plank lies on the right side, the Pallof press's cable is on the left). Display only. The crunch and leg raise show it on a simple body built from the 2D figure, turned so gravity points down (lying on the floor, on a bench, a ball or hanging from a bar); in the crunch the model bends by the curl angle, so the whole curl shows as lumbar bend (a real crunch curls the upper back most), in the leg raise it stays straight while the legs move. The Pallof press stands it upright on a standing or half-kneeling body, with the cable level at hand height (its solver works in the top view, so the body is drawn, not solved, in 3D). set straight on the body for the planks (belly down; the side plank lying on its left side, facing the viewer); the back extension's view bends the model's lumbar spine to the lower-back angle (the rounding slider, arched included) and sets it on the pelvis, blending between postures exported every 10° from 60° of flexion to 20° of extension. The model's upper body is one rigid piece above L1, so the upper-back half of the 2D figure's curve shows as lumbar bend; the model is scaled to the body's trunk length.
- Muscle weights: the crunch's and leg raise's levels follow Escamilla et al. 2006 (crunch: rectus abdominis 48–56%, external oblique 27% of maximum; hanging knee-up: rectus abdominis 69–75%, obliques 79–85%, rectus femoris only 15%); the back extension's follow Andersen et al. 2021 (relative only). The iliopsoas isn't measured with surface EMG.

## Planks, side plank and Pallof press (added 2026-10-12)

### How it works
- **Planks** (multi-joint solver `plank`): the body is a straight beam from the feet (or knees) to the shoulders, held up at the toes (knees) and under the shoulders, the upper arms vertical. The supports push straight up. The torque at the hip (per leg) and at the lower back (L5/S1) is the moment of the legs' end of the beam; a test checks that the hip torque is the same from the trunk's side and that the supports carry the body weight. The slider raises the support (forearms or hands on a bench), tilting the body: every torque shrinks with the cosine of the tilt (to 75°).
- **Side plank:** the same beam in the frontal plane, on one forearm and the edge of the lower foot. The lower back must stop side-bending; the lower hip's abductors hold both legs (the upper leg lies on the lower one).
- **Pallof press** (solver `pallof`, top view): the cable pulls the hands sideways; the trunk must stop it twisting (the sideways pull × the hands' reach in front of the spine) and bending sideways (the pull × the hands' height above L5/S1, 35 cm, estimate).
- **Strength:** trunk flexion about 190 Nm for men (derived from Kumar et al. 1995's extension value and extension ÷ flexion ratio), side-bending 163 Nm and twisting 80 Nm (Kumar et al. 1995, 41 men, seated, hips strapped; women about 60–70% of men), hip flexion 142 Nm per hip (Anderson et al.), hip abduction 185 Nm (Danneskiold-Samsøe et al., men 20–29).

### What it shows
- Forearm plank on the floor: about 46% of the trunk-flexion strength at the lower back and 35% of the hip flexors'. Ekstrom et al. 2007 measured the rectus abdominis at 43% and the external oblique at 47% of their maximum in this plank.
- Side plank on the floor: about 54% of the side-bending strength and of the lower hip's abductors; Ekstrom et al. measured the external oblique at 69% and the gluteus medius at 74%, and the back extensors at 40–42% (5–6% in the front plank). Horsak et al. 2017 (20 young adults, right side) found more in the side bridge: external oblique 99 ± 36%, internal oblique 52 ± 25%, lumbar back muscles 52 ± 14%, rectus abdominis 28 ± 20%. The model's 54% sits between the two studies for the back muscles and below both for the external oblique, which also has to brace the trunk against twisting.
- A high plank (on the hands) starts tilted about 20°, a little easier than on the forearms; from the knees about 40% less. The forearms carry about 70% of the weight.
- Pallof press: the twist grows about five-fold from the hands at the chest to the arms straight; the side-bend stays the same.

### Still limited
- The body is a rigid straight beam; sagging or piking (the usual failure) isn't modelled. The supports push straight up (no friction).
- The trunk strengths were measured seated with the hips strapped; standing, the hips and legs help resist a twist (Pallof press), which isn't modelled. The hip abduction exercise uses a mixed-group value (110 Nm), the side plank the young men's 185 Nm, so the two aren't directly comparable.
- Pallof press muscle weights have no EMG source yet (TODO); Horsak et al. 2017 (here, not yet read in full) measured the side bridge and planks in another set of stabilisation exercises.

## Muscle shares checked against EMG (added 2026-10-12)

The muscle weights were estimates marked TODO. They were checked against 20 EMG studies (reading list rows 32–60) with a script that finds each lift's 1RM in the model and compares every muscle's mean activation at the studies' loads (`emgcheck.mjs` in the session scratchpad, not in the repo). Published values are % of a maximal isometric contraction and often exceed 100% in dynamic lifts, so only ratios between muscles and between variants were compared, never absolute levels. Where the studies agreed the weights changed; elsewhere the measured values went into the muscle notes and the model was left as it was.

Changed:
- **Lats in pulls** (lat pulldown, pull-up, bent-over and seated row): net joint torques left them nearly idle in the underhand and close-grip pulldown (0.04 vs the biceps' 0.53) because the cable's line passes close to the shoulder. EMG puts them at about 1.5 times the biceps whatever the grip (Lusk et al. 2010: 0.62–0.67 vs 0.38–0.43 at 70% 1RM; Lehman et al. 2004; Youdas et al. 2010: 117–130% in pull-ups and chin-ups alike). They also hold the shoulder down against the pull, which the statics miss. Fix: the lats also follow the elbow's effort × 1.2 (`jointScale` in muscles.js). Now 1.2 times the biceps in the underhand pulldown, 1.3 in the chin-up, 1.2 in the bent-over row.
- **Anterior deltoid in the overhead press:** it now follows abduction as well as flexion (its fibres abduct with the arm raised). Before, it came out well below the middle deltoid; measured above it (Campos et al. 2020: 33% vs 28% at 60% 1RM). Now equal.
- **Hamstrings:** the trap-bar deadlift scales them by 0.8 and the hip thrust's weights are 0.8 of before (Andersen et al. 2018 at 1RM: barbell deadlift 28% above the hex bar and 20% above the hip thrust; the model had all three equal).
- **Serratus anterior and lower trapezius in the lateral and front raise:** higher below shoulder height (Ekstrom et al. 2003, loaded raises in the scapular plane: serratus 62% below 80° and 96% above 120°, lower trapezius 50% and 61%). The upper trapezius already matched (72% and 79%).

Checked, matching:
- Hip thrust vs back squat, gluteus maximus: model 1.8 times, measured 1.9–2.4 (Contreras et al. 2015). Split squat vs back squat: model and McCurdy et al. 2018 both 1.6.
- Lateral raise deltoid parts (Campos et al.: middle 30%, rear 24%, front 21%) match the weights' ratios. Upper trapezius in raises.
- Sumo vs conventional deadlift: more quadriceps in the sumo (Escamilla et al. 2002), as the model gives. Straight-arm pulldown vs pullover: more lats and triceps in the pulldown (Muyor et al. 2022).

Checked, not matching (left, noted):
- **Core exercises (added 2026-10-13, Oliva-Lozano & Muyor 2020 review):** curl-ups reach 68–81% of maximum in the rectus abdominis (the model's floor crunch about 56–65%); the front plank depends strongly on technique (shoulder blades together and pelvis tilted back: rectus abdominis about 78%, obliques 110–120%), which this model can't represent; back extensions about 56% on a bench, the model 35% mean (39% peak) at body weight on the 45° bench, lower, probably because the lumbar strength comes from Graves et al.'s MedX tests, which measure the lower back at its strongest. No Pallof press in the review.
- **Glutes across lifts:** the studies disagree with each other (McCurdy et al.: stiff-leg deadlift = squat; Contreras et al.: hip thrust ≈ 2 × squat; Andersen et al.: hip thrust ≈ barbell deadlift), so no refit. The model gives the hinge more glute than the squat.
- **Quadriceps in the hip thrust:** measured as high as in the squat (Contreras et al.: 100% vs 110%), the model much lower. Since 2026-10-13 they also hold against the hamstrings' pull at the knee (`coContract` in muscles.js: the net knee torque plus the hamstrings' activation × knee-flexion strength × 0.75, their estimated share), but in the lower half of the thrust the knee needs flexing overall and that pull doesn't exceed it, so the model still has them nearly idle there (mean 0.08 vs the squat's 0.35 at 75% 1RM). The EMG points to co-contraction for knee stability beyond these mechanics.
- **Fixed 2026-10-13: the quadriceps followed the knee whichever way its torque pointed.** Near lockout in the squat, deadlift and leg press, and through most of the hip thrust's bridge variants, the knee needs flexing (or rests on the locked joint), yet the quadriceps showed up to 30% (squat, deadlift) and up to 100% (bridges). They now work only for knee extension (`sign`); the hip thrust's hamstrings also take the knee's flexion demand (`jointSign`). The RDL and rows keep the hamstrings on the hip alone: their knee-flexion demand is held largely by the nearly straight, locked knee, and adding it would push the hamstrings above McCurdy et al.'s measurements.
- **Biceps across pull grips:** measured nearly constant (Lusk et al.), the model's grip effect is larger.
- **Bench press incline (fixed 2026-10-13):** the anterior deltoid rose at every incline (Trebs et al. 2010) while the model gave it less, and the model made the incline press stronger (1RM about 90 kg vs 80 kg flat). Cause: the shoulder moment about the chest's normal (abduction in the bench plane) wasn't carried by any joint component. With it, and flexion strength by arm elevation: incline 1RM about 77 kg vs 76 kg flat (lifters are usually somewhat weaker on the incline; the remaining gap would need incline strength data), anterior deltoid 0.65 vs 0.37 at 70% 1RM, pectoralis 0.45 vs 0.52.
- **Absolute strength:** the model's 1RMs are low (75 kg man: deadlift about 40 kg, squat 43 kg, bench 80 kg) because the strength curves come from dynamometer studies of ordinary adults (Anderson et al. 2007); the strength slider scales them. Since 2026-10-13 it reaches 200% (multi-joint lifts, edge and pinch lift), and its ⓘ text says what 100% means and that people who train sit around 150–200% (an estimate).

Not usable: the triceps heads' study (Kholinne et al. 2018) was unloaded (notes only); the oblique-thickness study (J Sport Rehabil 2021) is a training study, not EMG; the scan `00124278-199508000-00011.pdf` (Signorile et al. 1995, J Strength Cond Res) has no text layer. Still without EMG: the Pallof press, the subscapularis, the pectineus in hip adduction.

## Break test

Every exercise × variant × start, middle and end of the range × extreme settings (no load and 250 kg, strength 50–150%, body mass 40–140 kg, every placement slider at its minimum, its maximum and on auto), plus own finger lengths at the ends of their ranges and the lift profile at 0–300 kg: about 4,900 runs, no exceptions and no NaN or Infinity. In the browser: every exercise and variant at both slider ends and both load ends, comparisons, and malformed links, with no console errors. What it did find:

- **Fixed: wide-stance squat couldn't balance standing.** The 3D squat measured the shin's forward lean along the turned-out foot, so in a wide toes-out stance the inward slant of the legs counted as lean and tipped the straight leg forward; with a light bar no trunk angle balanced. The lean is now the side-view angle (identical for toes forward; regression test).
- **Fixed: link values outside the controls.** A link could set a negative or huge load, placement values outside their sliders, or negative finger lengths. Loads and placement values are now clamped to the sliders' ranges; finger lengths outside the table's ranges fall back to the typical hand.
- **Fixed: chin-ups came out harder than wide pull-ups** (elbow effort 169% at body weight vs 101% at the shoulder for the wide pull-up), against common experience. The body hung nearly straight under the bar and the hands followed a straight line from overhead to the chest in the trunk's frame, so with a narrow grip the elbow had to sit 25 cm in front of the hand at mid-pull, forearm almost horizontal. Hanging lifters swing the body behind the bar and may bring the legs forward. Both are now the lifter's choice, picked for least effort over all joints (shoulder, elbow and the hip flexors that hold the legs, with Anderson et al.'s hip-flexion strength); both are sliders with "least effort" as the default. Result at body weight: the chin-up peaks at 73% (shoulder extension), the neutral grip at 73%, the wide pull-up stays at 101% (shoulder adduction); the trunk leans back about 25° in the chin-up, 12° in the wide pull-up. The swing reaches its 30 cm limit in the chin-up, so a real lifter may swing further. Tests: chin-up easier than wide pull-up; the chin-up still asks more of the shoulder extensors and elbow flexors, the wide pull-up of the adductors.
- **Fixed: single-leg calf raise near the top** (was 197% effort at 35° of plantarflexion with body weight only; two-leg 151%). The plantarflexion strength curve was measured with the knee bent 50° (Anderson et al.), where the gastrocnemius is slack, and falls to 21% of its foot-flat value at 34°. Chen & Franklin's collection of datasets with the knee extended or slightly flexed (their Fig. 11) keeps roughly half at 30° (about 70% at 20°; individual datasets about 30–70%). The standing calf raises' strength factor now follows the ankle angle (1.2 at and below foot-flat, as before, rising to 2.5 at 34°), so the knee-straight curve keeps 70% at 20° and 45% at 34°. Read off a figure, so approximate. Now: single-leg with body weight 97% at the top, two-leg with 20 kg 75%.
- **Known: glute bridge past 35° of hip flexion** (hips below the floor; the page warns), **bench press elbows-out** at some bar heights (the elbows can't reach the set flare; the page warns), **edge lift below about 10° at the PIP** (the index finger can't reach a straight edge with a nearly straight finger).
- **Speed:** every render is under 50 ms except the edge lift (about 120–130 ms per slider step, the four-finger search). Fine while dragging; the curves are held and redrawn after the slider stops.

**Second round (2026-10-12, before committing the core exercises, 3D trunk and EMG changes):** in the model, every exercise × variant × each placement control alone (every choice, each slider at minimum, middle, maximum and auto) × three loads × three people (40 kg / 25%, 75 kg / 100%, 140 kg / 110%) × the whole range in 5° steps, including the 3D scenes (chain, hip, multi-joint and trunk): about 195,000 runs, no exceptions, no NaN or Infinity, every activation within 0–1. In the browser: all 34 exercises × every variant × every view button × angle start, middle and end × every visible slider at both ends and every choice × load, strength and body mass at both ends × every comparison (about 4,500 page states), at 375 px width with 2D and 3D views, Play on every exercise that has it, and malformed links. The fuzz test now also runs each control alone. Found and fixed:

- **Incline bench, elbows set by hand:** from 10% of the bar height up, the elbow flipped to beside the head (flare 19° → 160°, shoulder rotation 130%). Near lockout on an incline both elbow positions that fit the arm lie close to the bench plane, and "the lower one" picked the wrong one; the bench now prefers the elbow towards the feet as well as below the bar (regression test). The same fix removed a flip at lockout in the close-grip bench.
- **Pinch lift at a width the grip can't span** (four fingers at 110 mm): the page showed "Effort Infinity%"; it now says "too wide" with a warning.
- **Further-reading links without a licence** showed "(undefined)" in the References section (already in the live version).
- **Hidden controls:** a variant without set-up sliders left the previous variant's sliders in the hidden panel, and the pulley sliders stayed in the page for variants without a pulley; nothing a user could reach, but they threw when triggered. Both cleared or guarded.

Checked, not changed:

- **Leg extension at lockout:** strength is 14% of peak at 0° (Anderson et al.'s fitted curve, inside their tested range), so effort drops steeply over the last 5° (10 kg stack: 133% at 0°, 75% at 5°). Lindahl et al. measured about 50% at 10° where the curve gives 35%, but Folland & Morris 40% at 20° where it gives 55%: the two bracket the curve, so it stays as measured (settled 2026-10-13).
- **Deadlift with the knee-bend slider above 100% of the hip bend:** the sumo start couldn't balance at the bottom (from 110%; conventional and trap bar from 130%). Since 2026-10-13 the slider stops at 100%.
- **Bench press, close grip, elbows fully inside:** the upper arm runs just inside the shoulder line (flare −1°), where it would touch the ribs; since 2026-10-13 the page warns.
- **Speed:** 2–80 ms per slider step on a fresh page (3D trunk view about 40 ms, pull-up up to 80 ms, the split squat's curve recomputation after a slider stops under 50 ms; edge lift as before). A test that drives thousands of states in one page session gets slower over time (memory), which a user won't reach.

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
| Hip adduction | Chen & Franklin 2025 (meta-visualization, *J Biomech*); Danneskiold-Samsøe et al. (peak) | Curve shape vs abduction angle and hip flexion, read off Fig. 6 |
| Hip muscle moment arms | Dostal, Soderberg & Andrews 1986 (*Phys Ther*) | Abduction/adduction moment arms at 0°, 40° and 90° of hip flexion |
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
- **Calf raise: toes in / out (added 2026-10-11).** A slider turns the whole leg (standing variants). Mechanically nothing changes: leg and foot turn together, so the ankle's lever and torque are the same (a test checks it). The gastrocnemius is now two heads: the lateral head at 90% of the medial head's level in a standing heel rise, and both shifted by the foot angle by Cibulka et al. 2017's EMG (toes out: medial 79.2 vs 75.8% MVIC toes in; lateral 68.9 vs 70.7), linear between toes in, forward and out. Cibulka's 'as far as possible' is placed at ±45°, the angle Nunes et al. 2020 trained with (estimate). Riemann et al. 2011 confirmed the direction with 130–135% body mass in both the lifting and the lowering phase (20 participants; values only in figures). Nunes et al. 2020 found the shift in growth too: 9 weeks of calf raises with the toes out at 45° thickened the medial head 8.4% (toes in 3.8%, forward 5.8%), with the toes in the lateral head 9.1% (out 5.5%, forward 6.4%); the app quotes this in the slider's hint, it doesn't model growth. Not modelled: the foot rolling onto its inner or outer edge, which would change the lever (the big-toe joint sits further forward than the little toe's).
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
- **Hip extension hardly changes with knee angle** in the three datasets they found (hip at 0–45°): the curves in their Figure 5 are nearly flat from 0° to 90° of knee bend. Two other studies report more with the knee nearly straight: Yamamoto et al. 2015 (read: 93 vs 76 Nm, knee at 15° vs 90°, prone, 10 men) and a sprinter study (29–42%, not obtainable). The app now uses Yamamoto et al.'s 82% at 90° of knee bend as a hip-extension correction in all multi-joint lifts; it was measured with the hip straight, while lifts work with the hip bent.
- **Lowering vs lifting:** measured joint torque rarely goes above 125% of isometric in eccentric tests, and rarely below 25% even at high concentric speeds. The app uses isometric strength in both phases, so effort while lowering is overstated by up to about a fifth.
- **Hip rotators change role as the hip bends.** The gluteus maximus and medius rotate the thigh outwards with the hip straight and turn into internal rotators when it is deeply bent (Chen & Franklin's moment-arm review, citing Delp et al. 1999). The model's "external rotators" keep the same weight at every hip angle, which overstates them at the bottom of a deep squat or leg press.

Rajagopal et al. 2016 (the OpenSim full-body model) gives each leg muscle's force capacity (from MRI volumes) and moment arms. The hip part is now in use for hip abduction and adduction (see that section; read straight from the model file, with wrapping); the knee and ankle muscles of the other leg exercises are still to do. Its strength validation cites Waters et al. 1974 on hip extension with the hamstrings, now on the reading list.

### Still without a source

- Muscle activation weights (62 values; the bench grip-width effects are now backed by Mausehund et al. qualitatively).
- Machine cam profiles, apart from the leg extension (measured) and the pec deck linkage (a patent's computed curve): the rest are estimates from patents, a 1983 abstract and makers' descriptions, or illustrative.
- Hip-extension strength vs knee angle: now from one study (Yamamoto et al. 2015, 82% at 90° of knee bend, hip straight); how it changes with the hip bent isn't measured.
- Hip adduction peak for untrained lifters (the current value is from trained hockey players).
