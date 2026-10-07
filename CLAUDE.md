# Force Curve Lab — notes for Claude

Static teaching site (GitHub Pages). Vanilla ES modules. **No build step, no npm dependencies, no CDNs.** Keep it that way so it loads fast on phones.

## Layout
- `index.html`, `css/style.css`: one page; light and dark mode via CSS variables
- `js/physics.js`: pure statics (`pose`, `loadForce`, `limbWeights`, `analyze`, `sampleCurve`). No DOM. Imported by the tests. Every exercise is a two-segment chain (base → mid → tip); `analyze` returns `jointTorque` (= `loadTorque` + `limbTorque`) about the moving joint, positive when it resists the lift.
- `js/muscles.js`: activation estimate from the physics result
- `js/figure.js`, `js/chart.js`: hand-rolled SVG rendering. The figure draws `postures` and muscle `draw` specs from the JSON, rotated so the variant's gravity points down
- `js/wger.js`: optional wger.de API calls; must fail silently
- `data/exercises/*.json`: all exercise content (chain, variants, strength curve, muscles, postures, phases)
- `docs/model-limits.md`: what the single-joint model can't do (multi-joint lifts) and what it approximates
- `tests/*.test.mjs`: `npm test` (node --test)

## Conventions
- Coordinates: base-joint origin, metres, in the exercise's frame: `side` (x forward, y towards the head), `front` (x out to the side, y towards the head), `top` (x out to the side, y forward). Gravity is per variant in that frame. Angles in degrees; positive joint torque = resists the lift.
- Physics changes need a test that checks a hand-computable case (e.g. m·g·L·sin θ).
- Curated numbers (strength curves, muscle weights, modifiers) are estimates. Never present them as measured. Keep or add a `source`/`note`, and never invent citations; write `TODO` if no source has been checked.
- wger content is CC-BY-SA: keep the attribution visible. Render wger descriptions as text only (no `innerHTML`).
- Test mobile width (375 px): no horizontal scroll, touch-sized controls.
- Run locally: `npm start` (port 8080), then check the browser console for errors.
