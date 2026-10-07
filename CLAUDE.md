# Force Curve Lab — notes for Claude

Static teaching site (GitHub Pages). Vanilla ES modules. **No build step, no npm dependencies, no CDNs.** Keep it that way so it loads fast on phones.

## Layout
- `index.html`, `css/style.css`: one page; light and dark mode via CSS variables
- `js/physics.js`: pure statics (`pose`, `loadForce`, `analyze`, `sampleCurve`). No DOM. Imported by the tests. The moving joint is the elbow or the shoulder (`movingJoint`); `analyze` returns `jointTorque` about it.
- `js/muscles.js`: activation estimate from the physics result
- `js/figure.js`, `js/chart.js`: hand-rolled SVG rendering
- `js/wger.js`: optional wger.de API calls; must fail silently
- `data/exercises/*.json`: all exercise content (variants, strength curve, muscles, phases)
- `tests/*.test.mjs`: `npm test` (node --test)

## Conventions
- Coordinates: shoulder origin, y up, metres; x forward in side-view exercises, x out to the side in front-view ones (`view: "front"`); angles in degrees; positive torque = flexion/abduction.
- Physics changes need a test that checks a hand-computable case (e.g. m·g·L·sin θ).
- Curated numbers (strength curves, muscle weights, modifiers) are estimates. Never present them as measured. Keep or add a `source`/`note`, and never invent citations; write `TODO` if no source has been checked.
- wger content is CC-BY-SA: keep the attribution visible. Render wger descriptions as text only (no `innerHTML`).
- Test mobile width (375 px): no horizontal scroll, touch-sized controls.
- Run locally: `npm start` (port 8080), then check the browser console for errors.
