// The demo video's scenes (script: video/script.md). Each run(api) sets up a page state, shows its
// caption and captures frames: api.open(hash), api.js(code), api.hold(seconds), api.sweep(id, from, to, seconds).
const cap = (api, text, top = false) => api.js(`__v.cap(${JSON.stringify(text)}, ${top}); return 1;`);
const hl = (api, sel) => api.js(`__v.hl(${JSON.stringify(sel ?? "")}); return 1;`);
const to = (api, sel, block = "start") => api.js(`__v.to(${JSON.stringify(sel)}, ${JSON.stringify(block)}); return 1;`);
// A set-up slider found by its label text (they are built by the page, without ids).
const slider = (api, label) => api.js(`const l = [...document.querySelectorAll("#placement-sliders label")].find((x) => x.innerText.startsWith(${JSON.stringify(label)}));
  const i = l?.querySelector("input[type=range]"); if (!i) throw new Error("no slider ${label}"); i.id ||= "v-" + Math.random().toString(36).slice(2); return i.id;`);
// Reading time: about 2.6 words a second, at least 3 s.
const read = (text, extra = 0) => Math.max(3, text.split(/\s+/).length / 2.6) + extra;

const T = {
  intro: "Force Curve Lab shows where an exercise is hard, why it is hard there, and which muscles do the work. It runs in the browser, on a phone too, and needs no account.",
  lever1: "Every exercise is a lever. The weight pulls straight down; how hard it is for the joint depends on its moment arm: the horizontal distance from the elbow to that line.",
  lever2: "Move the slider, or press Play, and watch the moment arm change through the lift.",
  curves: "The chart compares the load's torque with how strong the muscles are at each angle. The hardest point, the sticking point, is where the effort peaks — not always where the load is heaviest.",
  variants1: "Change the equipment and the curve changes: a cable pulls along its own line, so moving the pulley moves the hardest point.",
  variants2: "Compare two variants directly: the dashed line is the comparison.",
  muscles: "The body map shows which muscles work and how hard, estimated from the joint's effort. The close-up shows the individual muscles and how the work is shared.",
  squat1: "Squats, deadlifts, presses and rows are solved in 3D, with balance over the mid-foot. The table shows the load on each joint.",
  squat2: "Deep in the squat, the thigh rests on the calf and takes part of the load off the knee — modelled based on published data.",
  setup1: "Set-up sliders change stance, grip or posture, and each ⓘ explains what it does.",
  setup2: "Every setting is in the link, so a teacher can share exactly this view.",
  core: "Core exercises show the trunk muscles in 3D, from a published spine model. Round the back, and the work moves from the hips to the back muscles.",
  grip: "Grip exercises go down to the fingers: tendon forces and the loads on the finger pulleys.",
  expert: "In Expert mode, every curve and muscle share shows its measured values and the study it comes from.",
  data: "Strength curves come from published measurements, the 3D muscle paths from open musculoskeletal models, and muscle shares are checked against EMG studies.",
  licences: "The open models and their licences: the hip and lumbar spine models are MIT-licensed, the ARMS hand model is for non-commercial use only, and the muscle maps from wger are CC-BY-SA.",
  data2: "Anything estimated is marked as an estimate, and the model page lists what each lift can and can't show.",
  edu: "Force Curve Lab is a teaching tool. Its numbers are model estimates for typical adults, not medical or training advice, and some parts — like the pinch model — are still work in progress.",
};

export const scenes = [
  { name: "title", async run(api) {
    await api.open("ex=biceps-curl&v=dumbbell&kg=10");
    await api.js(`__v.title("Force Curve Lab", "Where an exercise is hard, why, and which muscles do the work"); return 1;`);
    await api.hold(3.5);
    await api.js(`__v.title(); return 1;`);
  } },
  { name: "what it is", async run(api) {
    await cap(api, T.intro);
    await api.js(`__v.set("angle", 90); return 1;`);
    await api.hold(read(T.intro));
  } },
  { name: "lever", async run(api) {
    await cap(api, T.lever1);
    await hl(api, ".figure-card");
    await api.sweep("angle", 0, 140, read(T.lever1));
    await cap(api, T.lever2);
    await api.sweep("angle", 140, 60, read(T.lever2));
    await hl(api);
  } },
  { name: "curves", async run(api) {
    await to(api, ".charts");
    await hl(api, ".charts");
    await cap(api, T.curves);
    await api.sweep("angle", 20, 130, read(T.curves));
    await hl(api);
  } },
  { name: "variants", async run(api) {
    await api.open("ex=biceps-curl&v=cable-low&kg=10&cam=2d");
    await cap(api, T.variants1);
    await hl(api, "#pulley-controls");
    await api.js(`__v.set("angle", 90); return 1;`);
    const half = read(T.variants1) / 2;
    await api.sweep("pulley-x", 0.6, -0.4, half);
    await api.sweep("pulley-x", -0.4, 0.2, half);
    await hl(api);
    await cap(api, T.variants2);
    await api.js(`__v.set("compare", "dumbbell", "change"); __v.to(".charts"); __v.hl(".charts"); return 1;`);
    await api.hold(read(T.variants2, 1));
    await hl(api);
  } },
  { name: "muscles", async run(api) {
    await api.open("ex=biceps-curl&v=dumbbell&kg=12");
    await api.js(`__v.set("angle", 95); return 1;`);
    await to(api, "#muscles-card");
    await hl(api, "#muscles-card");
    await cap(api, T.muscles);
    await api.hold(read(T.muscles) / 2);
    await to(api, "#muscle-detail");
    await hl(api, "#muscle-detail");
    await api.hold(read(T.muscles) / 2);
    await hl(api);
  } },
  { name: "squat 3D", async run(api) {
    await api.open("ex=squat&v=high-bar&kg=40&cam=3d");
    await cap(api, T.squat1, true);
    await hl(api, "#joint-table");
    await api.sweep("angle", 0, 110, read(T.squat1));
    await hl(api);
    await cap(api, T.squat2, true);
    await api.sweep("angle", 110, 150, read(T.squat2) * 0.6);
    await api.hold(read(T.squat2) * 0.4);
  } },
  { name: "set-up", async run(api) {
    await api.open("ex=squat&v=high-bar&kg=40&cam=3d");
    await api.js(`__v.set("angle", 100); return 1;`);
    await to(api, "#placement-controls");
    await cap(api, T.setup1);
    const toe = await slider(api, "Toes out");
    await hl(api, "#placement-controls");
    await api.sweep(toe, 15, 40, read(T.setup1) * 0.6);
    await api.js(`const b = [...document.querySelectorAll("#placement-sliders .info-btn")][1]; b?.click(); return 1;`);
    await api.hold(read(T.setup1) * 0.4 + 1);
    await api.js(`document.body.click(); return 1;`);
    await hl(api);
    await cap(api, T.setup2);
    await api.js(`const d = document.createElement("div"); d.id = "v-url"; d.textContent = location.href.replace(/^http:\\/\\/localhost:\\d+\\//, "erikeppinger.github.io/force-curve-lab/");
      Object.assign(d.style, { position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#0d1117", color: "#9cc4ff", font: "500 20px ui-monospace, monospace", padding: "10px 18px", borderRadius: "10px", border: "1px solid #30363d", maxWidth: "90vw", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" });
      document.body.append(d); return 1;`);
    await api.hold(read(T.setup2, 1));
    await api.js(`document.getElementById("v-url")?.remove(); return 1;`);
  } },
  { name: "core", async run(api) {
    await api.open("ex=back-extension&v=bench45&kg=0&cam=side");
    await api.js(`__v.set("angle", 45); return 1;`);
    await cap(api, T.core);
    const round = await slider(api, "Back rounding");
    await api.hold(1.5);
    await api.sweep(round, 0, 40, read(T.core) - 1.5);
  } },
  { name: "grip", async run(api) {
    await api.open("ex=edge-lift&v=half-crimp&kg=20");
    await cap(api, T.grip);
    await hl(api, ".figure-card");
    await api.hold(read(T.grip, 1));
    await hl(api);
  } },
  { name: "expert", async run(api) {
    await api.open("ex=squat&v=high-bar&kg=40&cam=3d");
    await api.js(`document.querySelector('[data-mode-set="expert"]').click(); return 1;`);
    await to(api, "#numbers-card");
    await api.js(`const it = document.querySelector("#numbers .num-item"); if (it) it.open = true; return 1;`);
    await hl(api, "#numbers-card");
    await cap(api, T.expert);
    await api.hold(read(T.expert, 1.5));
    await hl(api);
    await api.js(`document.querySelector('[data-mode-set="basic"]').click(); return 1;`);
  } },
  { name: "data", async run(api) {
    await to(api, "#references-card");
    await hl(api, "#references-card");
    await cap(api, T.data);
    await api.hold(read(T.data));
    await cap(api, T.licences);
    await api.hold(read(T.licences));
    await hl(api);
    await cap(api, T.data2);
    await api.open("");
    await api.js(`location.href = "docs/model.html?ex=squat"; return 1;`).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    await api.js(`if (!window.__v) { ${"/* helpers are re-added by open(); here only the caption */"} } return 1;`);
    await api.js(`const s = document.createElement("style"); s.textContent = "#v-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);width:min(1180px,86vw);z-index:9999;background:rgba(12,14,18,.86);color:#fff;font:500 30px/1.38 system-ui,sans-serif;padding:14px 24px;border-radius:14px;text-align:center}"; document.head.append(s);
      const c = document.createElement("div"); c.id = "v-cap"; c.textContent = ${JSON.stringify(T.data2)}; document.body.append(c); return 1;`);
    await api.hold(read(T.data2, 1));
  } },
  { name: "teaching only", async run(api) {
    await api.open("ex=biceps-curl&v=dumbbell&kg=10");
    await api.js(`__v.title("For teaching", ${JSON.stringify(T.edu)}); return 1;`);
    await api.hold(read(T.edu, 1));
    await api.js(`__v.title("Force Curve Lab", "erikeppinger.github.io/force-curve-lab"); return 1;`);
    await api.hold(4);
  } },
];
