# Force Curve Lab

An interactive teaching tool that shows **where an exercise is hard and which muscles do the work**, and how both change with equipment (dumbbell, barbell, cable) and positioning (pulley height, arm angle).

For each exercise variant it shows:

- **Side view.** Animated arm, load, force direction, line of action and the **moment arm**.
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
| Load torque | Live 2D statics in the browser: torque = r × F about the joint. Gravity points down; cables pull towards the pulley. | `js/physics.js` |
| Strength curve | Relative torque–angle table × the user's peak torque | `strengthCurve` in exercise JSON |
| Muscle activation | Demand (effort, or shoulder-stabilising torque) × the muscle's angle-dependent weight × variant modifier | `js/muscles.js`, `muscles` in JSON |
| Exercise text and images | Fetched live from the [wger API](https://wger.de/api/v2/) and optional (the tool still works offline) | `js/wger.js` |

Coordinate system: origin at the shoulder, x forward, y up, metres. Joint angles are in degrees, and positive torque means flexion.

### Data honesty

The physics (layer 1) is exact for the idealised model. Strength curves and muscle weights are **approximate, curated values** and are labelled that way in the UI. Each one carries a `source` / `note` field. Replace the `TODO` sources with literature references before relying on them.

## Adding an exercise or variant

1. Add a variant to `data/exercises/<id>.json`, or copy the file for a new single-joint exercise and add its id to `EXERCISES` in `js/main.js`.
2. Variant fields: `upperArmAngle` (degrees from vertical, + = forward), `load.type` (`gravity` | `cable`), `load.pulley` (`{x, y}` in metres from the shoulder), `upperArmSupported`, `muscleModifiers`, `notes`.
3. Add a test in `tests/` that pins down the variant's key teaching point (e.g. where the peak is).

Multi-joint lifts (squat, bench press) need a multi-segment model. See the roadmap.

## Roadmap

- [ ] More single-joint exercises: lateral raise, triceps extension, chest fly, leg extension, leg curl
- [ ] Hammer/neutral grip as a variant parameter (brachioradialis emphasis)
- [ ] Machines with cam profiles (resistance curve as a data table)
- [ ] Bands (load grows with stretch)
- [ ] Multi-joint model for squat, deadlift and bench (hip/knee/shoulder torques)
- [ ] Literature sources for strength curves and muscle weights; optionally precomputed OpenSim results as JSON
- [ ] Back-view body map; vendor the wger SVGs locally for offline use
- [ ] Translations (DE)

## Licences and credits

- Exercise descriptions, images and muscle-map SVGs: [wger.de](https://wger.de), **CC-BY-SA 3.0**, loaded at runtime with attribution. If you vendor these files into the repo, they stay CC-BY-SA.
- Code licence: _not chosen yet_ (add a `LICENSE` file).
