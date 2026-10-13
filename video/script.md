# Force Curve Lab — intro video script

About 3 minutes, 12 scenes. Each scene: what the screen shows (a page state the recording script sets up), then the narration (also shown as captions). Times are estimates at a calm speaking pace.

Rebuild after changes to the app or the captions (captions live in `scenes.mjs`; keep this file in step): serve the site (`node tools/serve.mjs 8094`), run `node video/record.mjs 8094` (frames and an ffmpeg list in `video/frames/`), then encode with ffmpeg:

`ffmpeg -f concat -safe 0 -i video/frames/list.txt -vf "fps=30,scale=1280:720:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 25 -movflags +faststart -an assets/intro/intro-720p.mp4`

---

## 1. What it is (0:00–0:15)
**Screen:** home page, biceps curl with a dumbbell, the figure and curves side by side.
**Narration:** Force Curve Lab shows where an exercise is hard, why it is hard there, and which muscles do the work. It runs in the browser, on a phone too, and needs no account.

## 2. The lever (0:15–0:35)
**Screen:** biceps curl; the angle slider moves from arm straight to fully bent; the orange moment-arm line grows and shrinks.
**Narration:** Every exercise is a lever. The weight pulls straight down; how hard it is for the joint depends on its moment arm, the horizontal distance from the elbow to that line. Move the slider, or press Play, and watch the moment arm change through the lift.

## 3. Resistance against strength (0:35–0:55)
**Screen:** the "Resistance vs strength" chart with the effort chart below; the marker follows the slider; the effort peak highlighted.
**Narration:** The chart compares the load's torque with how strong the muscles are at each angle. Muscles are weaker at some angles than others, so the hardest point, the sticking point, is where the effort peaks — not always where the load is heaviest.

## 4. Variants, cables and comparisons (0:55–1:15)
**Screen:** variant switches from dumbbell to cable; the pulley slider moves; "Compare with" adds the dumbbell curve as a dashed line.
**Narration:** Change the equipment and the curve changes: a cable pulls along its own line, so moving the pulley moves the hardest point. Compare two variants directly; the dashed line is the comparison.

## 5. Muscles (1:15–1:30)
**Screen:** the muscles card: body map lighting up, then the close-up of the upper arm.
**Narration:** The body map shows which muscles work and how hard, estimated from the joint's effort. The close-up shows the individual muscles and how the work is shared.

## 6. Whole-body lifts in 3D (1:30–1:55)
**Screen:** squat, 3D view turning; the joint table with hip, knee and ankle; the slider goes down to the deepest position; the thigh–calf contact arrows appear.
**Narration:** Squats, deadlifts, presses and rows are solved in 3D, with balance over the mid-foot. The table shows the load on each joint. Deep in the squat, the thigh rests on the calf and takes part of the load off the knee — modelled based on published data.

## 7. Set-up and sharing (1:55–2:10)
**Screen:** set-up sliders (stance width, toe angle) change; an ⓘ button opens its explanation; the address bar shows the link.
**Narration:** Set-up sliders change stance, grip or posture, and each ⓘ explains what it does. Every setting is in the link, so a teacher can share exactly this view.

## 8. Core and the trunk in 3D (2:10–2:25)
**Screen:** back extension; the rounding slider; the 3D trunk muscles from the OpenSim lumbar spine model bending with it.
**Narration:** Core exercises show the trunk muscles in 3D, from a published spine model. Round the back, and the work moves from the hips to the back muscles.

## 9. Grip (2:25–2:35)
**Screen:** edge lift, the four fingers with tendons and pulleys coloured by load.
**Narration:** Grip exercises go down to the fingers: tendon forces and the loads on the finger pulleys.

## 10. Expert mode: the numbers behind it (2:35–2:45)
**Screen:** header switch to Expert; the "Sources and numbers" card opens a strength curve with its paper.
**Narration:** In Expert mode, every curve and muscle share shows its measured values and the study it comes from.

## 11. Where the data comes from and the licences (2:45–3:10)
**Screen:** the References section; then the "How the model works" page.
**Narration:** Strength curves come from published measurements, the 3D muscle paths from open musculoskeletal models, and muscle shares are checked against EMG studies. The open models and their licences: the hip and lumbar spine models are MIT-licensed, the ARMS hand model is for non-commercial use only, and the muscle maps from wger are CC-BY-SA. Anything estimated is marked as an estimate, and the model page lists what each lift can and can't show.

## 12. For teaching only (3:00–3:15)
**Screen:** title card with the site address.
**Narration:** Force Curve Lab is a teaching tool. Its numbers are model estimates for typical adults, not medical or training advice, and some parts — like the pinch model — are still work in progress. Try it at erikeppinger.github.io/force-curve-lab.

---

## Notes for the review
- Licences: named in scene 11 (decided).
- Language: English as drafted; a German version would mean a second narration (Windows has a German voice, Hedda).
