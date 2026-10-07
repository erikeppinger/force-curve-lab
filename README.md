# Force Curve Lab

An interactive teaching tool that shows **where an exercise is hard and which muscles do the work**, and how both change with equipment (dumbbell, barbell, cable, machine) and positioning (pulley height, arm angle).

Exercises (2–5 equipment variants each):

- **Arms and shoulders:** biceps curl, triceps extension, lateral raise, front raise, chest fly, straight-arm pulldown / pullover
- **Legs:** leg extension, leg curl, calf raise, hip abduction, glute kickback
- **Multi-joint:** squat, Romanian deadlift, deadlift (conventional and trap bar), split squat / lunge, leg press, hip thrust, bench press, overhead press, bent-over row, seated cable row, chest-supported row, lat pulldown, pull-up and chin-up. These show hip, knee and ankle torques and effort together.
- **3D:** the leg press, squat, Romanian deadlift, split squat, hip thrust, bench press, overhead press and the rows have placement controls (foot height, stance width, toe angle, knee tracking; grip width and elbow position), sideways and rotation components at the hip, knee, shoulder and elbow, and a drag-to-turn 3D view.

[`docs/model-limits.md`](docs/model-limits.md) explains how both models work and what they still approximate.

For each exercise variant it shows:

- **Side, front or top view.** Animated limb in the right posture (standing, seated, lying, kneeling), load, force direction, line of action and the **moment arm**.
- **Resistance vs. strength.** The load's torque at the joint compared with the muscles' strength at each angle.
- **Effort curve.** Torque ÷ strength across the range of motion. Its peak is the sticking point.
- **Muscles involved.** Estimated relative activation per muscle, shown as bars and on the wger muscle map.
- **Compare mode.** Overlay any two variants, e.g. a dumbbell curl against a Bayesian cable curl.

It's a static site with no build step and no dependencies, and it works on phones. Shareable links keep the current state in the URL hash, e.g. `#v=cable-bayesian&cmp=dumbbell&kg=10`.

## Run locally

```bash
npm start        # http://localhost:8080  (zero-dependency node server)
npm test         # physics unit tests (node --test)
```

ES modules and `fetch` need a web server; opening `index.html` directly from disk won't work.

## Deploy to GitHub Pages

Push to GitHub, then go to **Settings → Pages → Deploy from a branch → `main` / root**. Nothing needs building.

## How it works

| Layer | Approach | Where |
|---|---|---|
| Load torque | Live 2D statics in the browser: torque = r × F about the joint, plus the limb's own weight. Gravity's direction depends on the posture; cables pull towards the pulley; machines push through a pad with torque = m·g·r(angle) from a cam table; closed-chain lifts (calf raise) get the floor's push with a share of body weight. | `js/physics.js` |
| Strength curve | Relative torque–angle table × the user's peak torque | `strengthCurve` in exercise JSON |
| Multi-joint lifts | A solver finds the posture from the lift's constraint (centre of mass over the mid-foot, sled rail, bar path, bench and floor contacts); each joint's torque is the moment of all forces on one side of it | `js/multijoint.js`, `data/body.json` |
| Muscle activation | Demand (effort, or stabilising torque) × the muscle's angle-dependent weight × variant modifier | `js/muscles.js`, `muscles` in JSON |
| Exercise text and images | Fetched live from the [wger API](https://wger.de/api/v2/) and optional (the tool still works offline) | `js/wger.js` |

Each exercise is a two-segment chain (base → mid → tip, e.g. shoulder → elbow → hand or hip → knee → ankle) in its own plane, in metres from the base joint. `view` sets the frame: `side` (x forward, y towards the head), `front` (x out to the side, y towards the head) or `top` (x out to the side, y forward). Joint angles are in degrees; positive torque means the load resists the lift.

### Data honesty

The physics (layer 1) is exact for the idealised model. Strength curves and muscle weights are **approximate, curated values** and are labelled that way in the UI. Each one carries a `source` / `note` field. Replace the `TODO` sources with literature references before relying on them.

## Adding an exercise or variant

1. Add a variant to `data/exercises/<id>.json`, or copy the closest file for a new single-joint exercise and add its id to `EXERCISES` in `js/main.js` (it then appears in the Exercise menu).
2. Exercise fields:
   - Chain: `segments` (`proximal`, `distal` lengths in m, `names`, optional `massFractions` / `comFractions` for limb weight), `movingJoint` (`distal`: e.g. elbow or knee moves | `proximal`: the whole limb swings about the base), `view`.
   - Angle: `angleRange`, `angleLabel`, `angleNote`, `angleSense` (−1 if a growing angle turns the limb clockwise, e.g. the knee), `angleOffset` (degrees added for the pose, e.g. 90 at the ankle), `concentric` (`decrease` if lifting makes the angle smaller, e.g. extensions).
   - Content: `strengthCurve`, `muscles` (`driver`: `jointEffort` | `stabiliserDemand`; optional `draw`), `postures` (body shapes for the figure), `phases`, `defaults`, `ui` (slider ranges).
3. Variant fields: `posture`, `gravity` (`{x, y}` in the exercise's frame; default straight down, `{x: 0, y: 0}` for a horizontal plane), `viewLabel`, `proximalAngle` (fixed angle of the proximal segment, or its offset when it moves), `distalBend`, `proximalSupported`, `load` (`gravity` | `cable` with `pulley` | `machine` with `padDistance` and `camProfile` `[[angle, effective radius in m]]` | `reaction` with `bodyWeight` share), `defaultLoadKg`, `muscleModifiers`, `notes`.
4. Multi-joint lifts (`"model": "multi"`) instead pick a `solver` (`standing`, `split`, `hipThrust`, `seatedRow`, and the 3D `legPress3d`, `squat3d`, `bench3d`, `press3d`, `hinge3d`, `split3d`, `hipThrust3d`, `row3d`, `pull3d`) with per-variant `params`, and list `joints` with their strength curves; each muscle names its `joint`. Copy the closest existing file.
5. Add a test in `tests/` that pins down the variant's key teaching point with a hand-computable case. `tests/exercises.test.mjs` checks every listed exercise file's structure and model-wide invariants automatically.

## Roadmap

- [x] Lateral raise (dumbbell, cable, machine)
- [x] Triceps extension, front raise, chest fly, straight-arm pulldown, leg extension, leg curl, calf raise, hip abduction, glute kickback
- [x] Postures (lying, seated, kneeling, horizontal plane), limb weight, body weight for closed-chain lifts
- [x] Two-joint muscles and grip in the single-joint exercises: lying vs seated leg curl, preacher, hammer and reverse curls, overhead and lying triceps (Guex 2012, Guenzkofer 2012, Kohn 2018, Kleiber 2015)
- [x] Calf raise knee angle (Cresswell 1995, Baptista 2014, Kovács 2024); rectus femoris checked, no correction (Black 1993, Bampouras 2017)
- [x] Two-joint muscles in the multi-joint lifts: calf strength by knee angle, hamstring knee-flexion strength by hip angle (Cresswell 1995, Guex 2012)
- [x] Machines with cam profiles (resistance curve as a data table): `load.type: "machine"`. The lateral-raise cam is illustrative; measured profiles still needed
- [x] Resistance bands (`load.type: "band"`): band curl, band lateral raise
- [x] Multi-joint model: squat, Romanian deadlift, split squat, leg press, hip thrust, bench press
- [x] Deadlift: conventional (bar has to clear the shins) and trap bar
- [x] Overhead press in 3D: standing, wide grip, behind the neck, seated dumbbells
- [x] Bent-over row: three trunk angles, shoulder and elbow torques on top of the hinge
- [x] Seated cable row (trunk angles) and chest-supported row
- [ ] Multi-joint: measured posture rules instead of assumed ones
- [x] 3D leg press: stance width, toe angle, knee tracking
- [x] 3D squat (stance, toe angle, knee tracking, least-effort sideways floor push)
- [x] 3D bench press (grip width, elbows vs hands, shoulder and elbow components)
- [x] Bench elbows "under the bar", grips and touch points from Mausehund et al.: elbow moment arms near the measured ones
- [x] 3D Romanian deadlift, split squat (sideways balance) and hip thrust
- [x] 3D rows: grip width and elbow flare (lats vs rear delts)
- [x] Pull-ups, chin-ups and lat pulldowns: grip width and grip, body lean, elbow strength by arm angle and grip
- [ ] Moving shoulder blades in the bench, press and rows
- [x] Literature sources for the strength curves, peak strengths and limb masses (see `docs/model-limits.md`)
- [x] References section in the app: the current exercise's papers, plus all 24 papers and resources with links and what each is used for (`data/references.json`)
- [x] Hip rotation strength by hip flexion (Uritani 2012); hammer and reverse curl muscle factors at matched effort (Coratella 2023)
- [ ] Literature for muscle activation weights, machine cam profiles and rear-delt (horizontal abduction) strength; optionally precomputed OpenSim results as JSON
- [x] Back-view body map
- [ ] Vendor the wger SVGs locally for offline use; wger exercise ids: 8 set (7 from the starter CSV's media URLs, still to confirm), the rest still missing
- [ ] Translations (DE)

## Licences and credits

- Exercise descriptions, images and muscle-map SVGs: [wger.de](https://wger.de), **CC-BY-SA 3.0**, loaded at runtime with attribution. If you vendor these files into the repo, they stay CC-BY-SA.
- Code licence: _not chosen yet_ (add a `LICENSE` file).
