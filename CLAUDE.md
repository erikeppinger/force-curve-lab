# Force Curve Lab — notes for Claude

Static teaching site (GitHub Pages). Vanilla ES modules. **No build step, no npm dependencies, no CDNs.** Keep it that way so it loads fast on phones.

## Layout
- `index.html`, `css/style.css`: one page; light and dark mode via CSS variables
- `js/physics.js`: pure statics for single-joint exercises (`pose`, `loadForce`, `limbWeights`, `analyze`, `sampleCurve`). No DOM. Imported by the tests. Every exercise is a two-segment chain (base → mid → tip); `analyze` returns `jointTorque` (= `loadTorque` + `limbTorque`) about the moving joint, positive when it resists the lift. Load types: gravity, cable, machine (cam), reaction (closed chain), band. A variant's `strengthScale` (factor or points) corrects strength for posture or grip.
- `js/multijoint.js`: multi-joint lifts. A solver per lift family turns the driver value into a posture (balance, rail, bar path, contacts), then `jointTorque` sums the moments on one side of each joint. Side-view solvers: `standing` (squat / hinge / deadlift / bent-over row via `load: "row"`), `split`, `hipThrust`, `seatedRow`. `analyzeMulti` applies strength curves, a joint's `negative` curve for the opposite direction, and `jointScale` corrections (variant- or exercise-level). Shared anthropometry in `data/body.json`
- `js/multijoint3d.js`: 3D statics (vectors, joint moments split into anatomical components). Solvers: `legPress3d`, `squat3d`, `hinge3d` (RDL), `split3d`, `hipThrust3d` (legs share `legFromFloor`); `bench3d`, `press3d`, `row3d`, `pull3d` (arms). Right limb analysed, left mirrored. Forces statics can't decide (sideways floor push, bar spread) use static optimisation (`leastEffort`) or a visible slider, never a hidden guess. `jointScaleAt`: posture corrections by factor, points (own or another joint's angle via `by`, one torque `direction`), or a shoulder × elbow `grid`.
- `js/view3d.js`: hand-rolled orthographic 3D view in SVG with drag-to-turn and camera presets
- `js/muscles.js`: activation estimate from the physics result (a muscle may follow several joint components via `joints`)
- `js/figure.js`, `js/chart.js`: hand-rolled SVG rendering. The figure draws `postures` and muscle `draw` specs from the JSON, rotated so the variant's gravity points down
- `js/finger.js`, `js/fingerfig.js`: the edge lift (`"model": "finger"`): finger statics (FDP from the DIP moment, FDS from the PIP, MCP leftover, A2/A4 pulley loads) and its side-view figure. Variant `params` hold the grip posture; `placement` sliders the pressure point and finger share
- `js/regions.js`, `data/regions/*.json`: close-ups of one body region (schematic, each muscle a belly + tendons, coloured by activation). A muscle joins a close-up via `region` (and `regionPath` if its id differs from the drawing's)
- `js/wger.js`: optional wger.de API calls; must fail silently. The muscle-map SVGs are copied in `assets/wger/` (CC-BY-SA, keep the attribution)
- `data/exercises/*.json`: all exercise content (chain, variants, strength curve, muscles, postures, phases, `placement` sliders)
- `data/references.json`: every paper cited in a `source` field, shown in the app's References section
- `docs/model-limits.md`: what the model approximates, per lift, and how each was checked against measurements; `docs/reading-list.md`: papers still to get
- `tools/opensim_export.py`: optional, run locally with OpenSim: exports leg-muscle moment arms and force capacity from the Rajagopal model as JSON (`data/opensim/`). Not part of the site or the tests
- `tests/*.test.mjs`: `npm test` (node --test)
- Uploaded papers are read locally and removed from the repo afterwards (copyright); never commit PDFs

## Conventions
- Coordinates: base-joint origin, metres, in the exercise's frame: `side` (x forward, y towards the head), `front` (x out to the side, y towards the head), `top` (x out to the side, y forward). Gravity is per variant in that frame. Angles in degrees; positive joint torque = resists the lift.
- Physics changes need a test that checks a hand-computable case (e.g. m·g·L·sin θ). For multi-joint solvers, also check equilibrium (the same torque from both sides of a joint, reactions that add up to the weight).
- Curated numbers (strength curves, muscle weights, modifiers) are estimates. Never present them as measured. Keep or add a `source`/`note`, and never invent citations; write `TODO` if no source has been checked. A new paper cited in a `source` also needs an entry in `data/references.json` (a test checks both ways).
- wger content is CC-BY-SA: keep the attribution visible. Render wger descriptions as text only (no `innerHTML`).
- Test mobile width (375 px): no horizontal scroll, touch-sized controls.
- Run locally: `npm start` (port 8080), then check the browser console for errors.
