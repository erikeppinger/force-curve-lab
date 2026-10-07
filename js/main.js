import { analyze, sampleCurve } from "./physics.js";
import { muscleActivation } from "./muscles.js";
import { renderChart } from "./chart.js";
import { renderFigure, figureBounds, viewTitle, renderMultiFigure, multiBounds } from "./figure.js";
import { analyzeMulti, sampleMulti } from "./multijoint.js";
import { CAMERAS, scene3d, bounds3d, renderView3d } from "./view3d.js";
import { fetchExercise, descriptionParagraphs, bodyBackground, muscleOverlay, isBackMuscle } from "./wger.js";

const EXERCISES = [
  "biceps-curl", "triceps-extension", "lateral-raise", "front-raise", "chest-fly", "straight-arm-pulldown",
  "leg-extension", "leg-curl", "calf-raise", "hip-abduction", "glute-kickback",
  "squat", "romanian-deadlift", "split-squat", "leg-press", "hip-thrust", "bench-press",
];
const $ = (id) => document.getElementById(id);

const state = {
  catalog: {},
  exercise: null,
  variantId: null,
  compareId: "",
  loadKg: 10,
  peakTorqueNm: 60,
  bodyMassKg: 75,
  strengthPct: 100,
  body: null,
  placement: null, // live foot placement for 3D lifts (main variant only)
  cam: { ...CAMERAS["3d"] },
  angle: 90,
  pulley: null,
  playing: false,
  direction: 1,
};

const variant = (id = state.variantId) => state.exercise.variants.find((v) => v.id === id);
const opts = (v) => ({
  loadKg: state.loadKg,
  peakTorqueNm: state.peakTorqueNm,
  bodyMassKg: state.bodyMassKg,
  strengthPct: state.strengthPct,
  body: state.body,
  placement: v.id === state.variantId ? state.placement : undefined,
  pulley: v.id === state.variantId ? state.pulley : undefined,
});

// ---------- URL hash <-> state (shareable teaching links) ----------
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (k) => (p.has(k) && !Number.isNaN(+p.get(k)) ? +p.get(k) : undefined);
  return { ex: p.get("ex"), variant: p.get("v"), compare: p.get("cmp"), load: num("kg"), px: num("px"), py: num("py") };
}
function writeHash() {
  const p = new URLSearchParams({ ex: state.exercise.id, v: state.variantId, kg: state.loadKg });
  if (state.compareId) p.set("cmp", state.compareId);
  if (variant().load?.type === "cable") {
    p.set("px", state.pulley.x.toFixed(2));
    p.set("py", state.pulley.y.toFixed(2));
  }
  history.replaceState(null, "", `#${p}`);
}

// ---------- setup ----------
async function loadExercise(id) {
  const res = await fetch(`data/exercises/${id}.json`);
  return res.json();
}

function fillSelect(sel, items, includeNone) {
  sel.replaceChildren();
  if (includeNone) sel.add(new Option("— none —", ""));
  for (const v of items) sel.add(new Option(v.name, v.id));
}

function setVariant(id, pulley, load) {
  state.variantId = id;
  const v = variant();
  // Machines, cables and ankle weights need very different loads: use the variant's default.
  const kg = load ?? v.defaultLoadKg;
  if (kg != null) { state.loadKg = kg; $("load").value = kg; $("load-out").textContent = `${kg} kg`; }
  state.pulley = v.load?.type === "cable" ? { ...(pulley ?? v.load.pulley) } : null;
  $("variant").value = id;
  $("pulley-controls").hidden = v.load?.type !== "cable";
  if (state.pulley) {
    $("pulley-x").value = state.pulley.x;
    $("pulley-y").value = state.pulley.y;
  }
  setPlacement(v);
  $("variant-notes").textContent = v.notes;
  $("variant-equipment").textContent = v.equipment;
  $("figure-title").textContent = viewTitle(state.exercise, v);
  $("load-label").textContent = v.load?.type === "reaction" ? "Added load" : "Load";
}

/** Foot-placement sliders (3D lifts): start from the variant's preset. */
function setPlacement(v) {
  const spec = state.exercise.placement;
  $("placement-controls").hidden = !spec;
  if (!spec) { state.placement = null; return; }
  state.placement = Object.fromEntries(spec.map((s) => [s.key, v.params[s.key]]));
  $("placement-sliders").replaceChildren(...spec.map((s) => {
    const label = document.createElement("label");
    const out = document.createElement("output");
    const input = Object.assign(document.createElement("input"), { type: "range", min: s.min, max: s.max, step: s.step, value: state.placement[s.key] });
    const show = () => { out.textContent = `${Math.round(state.placement[s.key] * s.scale)} ${s.unit}`; };
    input.addEventListener("input", () => { state.placement[s.key] = +input.value; show(); render(); });
    show();
    label.append(`${s.label} `, out, input);
    return label;
  }));
}

/** Does the body-mass setting change anything (limb weight, or body weight on the floor)? */
const usesBodyMass = (ex) => ex.model === "multi" || Boolean(ex.segments.massFractions) || ex.variants.some((v) => v.load.bodyWeight > 0);
const isMulti = () => state.exercise.model === "multi";

function buildBodyMap() {
  const mapped = state.exercise.muscles.filter((x) => x.wgerId);
  for (const front of [true, false]) {
    const box = $(front ? "bodymap-front" : "bodymap-back");
    const here = mapped.filter((m) => isBackMuscle(m.wgerId) !== front);
    box.replaceChildren();
    box.hidden = !here.length && !(front && !mapped.length);
    const bg = new Image();
    bg.src = bodyBackground(front);
    bg.alt = `${front ? "Front" : "Back"} view of the human muscular system`;
    box.appendChild(bg);
    for (const m of here) {
      const img = new Image();
      img.src = muscleOverlay(m.wgerId);
      img.alt = "";
      img.dataset.muscle = m.id;
      img.className = "overlay";
      box.appendChild(img);
    }
  }
  $("bodymap-front").parentElement.classList.toggle("both", !$("bodymap-front").hidden && !$("bodymap-back").hidden);
}

async function loadWger() {
  const box = $("wger-info");
  const exId = state.exercise.id;
  const id = state.exercise.wger?.exerciseId;
  box.hidden = true;
  $("wger-img").hidden = true;
  $("wger-img-credit").textContent = "";
  if (!id) return;
  try {
    const info = await fetchExercise(id);
    if (state.exercise.id !== exId) return; // switched exercise while loading
    const { name, paragraphs } = descriptionParagraphs(info);
    $("wger-name").textContent = name;
    $("wger-desc").replaceChildren(...paragraphs.map((t) => Object.assign(document.createElement("p"), { textContent: t })));
    const img = info.images.find((i) => i.is_main) ?? info.images[0];
    if (img) {
      $("wger-img").src = img.thumbnails?.medium ?? img.image;
      $("wger-img").hidden = false;
      $("wger-img-credit").textContent = `Image: ${img.license_author || "wger.de"}`;
    }
    $("wger-link").href = `https://wger.de/en/exercise/${id}/view/`;
    box.hidden = false;
  } catch {
    box.hidden = true; // offline or API change — the tool still works
  }
}

/** Switch exercise: reset controls, labels, body map and wger info. `h` = values from the URL hash. */
function setExercise(id, h = {}) {
  const ex = (state.exercise = state.catalog[id]);
  const view = ex.view ?? "side";
  const ui = { load: [1, 30, 0.5], strength: [25, 110], ...ex.ui };
  $("exercise").value = id;
  $("exercise-name").textContent = ex.name;
  $("angle-note").textContent = ex.angleNote;
  $("angle-label").textContent = ex.angleLabel;
  const multi = ex.model === "multi";
  $("strength-label").textContent = multi ? "Strength (% of typical, all joints)" : `Strength (peak ${ex.joint.toLowerCase()} torque)`;
  $("pulley-x-label").textContent = view === "side" ? "Pulley forward / back" : "Pulley side to side";
  $("pulley-y-label").textContent = view === "top" ? "Pulley forward / back" : "Pulley height";
  fillSelect($("variant"), ex.variants);
  fillSelect($("compare"), ex.variants, true);

  state.loadKg = h.load ?? ex.defaults.loadKg;
  state.peakTorqueNm = ex.defaults.peakTorqueNm;
  state.bodyMassKg = ex.defaults.bodyMassKg ?? 75;
  [$("load").min, $("load").max, $("load").step] = ui.load;
  [$("strength").min, $("strength").max] = multi ? [50, 150] : ui.strength;
  state.strengthPct = 100;
  $("bodymass-control").hidden = !usesBodyMass(ex);
  $("bodymass").value = state.bodyMassKg; $("bodymass-out").textContent = `${state.bodyMassKg} kg`;
  $("load").value = state.loadKg; $("load-out").textContent = `${state.loadKg} kg`;
  $("strength").value = multi ? 100 : state.peakTorqueNm;
  $("strength-out").textContent = multi ? "100%" : `${state.peakTorqueNm} Nm`;
  $("readouts").hidden = multi;
  $("view-buttons").hidden = ex.view !== "3d";
  $("figure").classList.toggle("draggable", ex.view === "3d");
  $("joint-table").hidden = !multi;
  buildLegend(ex);
  const [lo, hi] = ex.angleRange;
  state.angle = Math.min(hi, Math.max(lo, state.angle));
  $("angle").min = lo; $("angle").max = hi; $("angle").value = state.angle;

  const vId = ex.variants.some((v) => v.id === h.variant) ? h.variant : ex.defaults.variant;
  setVariant(vId, h.px != null && h.py != null ? { x: h.px, y: h.py } : undefined, h.load);
  state.compareId = ex.variants.some((v) => v.id === h.compare) ? h.compare : "";
  $("compare").value = state.compareId;

  $("muscle-list").replaceChildren();
  buildBodyMap();
  loadWger();
}

// ---------- render ----------
let curveCache = null;
function curves() {
  const key = JSON.stringify([state.exercise.id, state.variantId, state.compareId, state.loadKg, state.peakTorqueNm, state.bodyMassKg, state.strengthPct, state.pulley, state.placement]);
  if (curveCache?.key === key) return curveCache;
  const ex = state.exercise;
  if (ex.model === "multi") {
    const main = sampleMulti(ex, variant(), opts(variant()));
    const cmp = state.compareId ? sampleMulti(ex, variant(state.compareId), opts(variant(state.compareId))) : null;
    curveCache = { key, main, cmp, bounds: ex.view === "3d" ? null : multiBounds(main) };
    return curveCache;
  }
  const main = sampleCurve(ex, variant(), opts(variant()));
  const cmp = state.compareId ? sampleCurve(ex, variant(state.compareId), opts(variant(state.compareId))) : null;
  const bounds = figureBounds(ex, variant(), main.map((s) => s.pose), state.pulley);
  curveCache = { key, main, cmp, bounds };
  return curveCache;
}

function phaseAt(angle) {
  return state.exercise.phases.find((p) => angle >= p.range[0] && angle <= p.range[1]) ?? state.exercise.phases.at(-1);
}

/** Legend for the torque chart: one entry per joint for multi-joint lifts. */
function buildLegend(ex) {
  const items = ex.model === "multi"
    ? [...ex.joints.map((j) => [`joint-${j.id}`, j.negative ? `${j.action} (+) / ${j.negative.action.toLowerCase()} (−)` : `${j.name} (${j.action.toLowerCase()})`]),
      ["cap", "Strength (dotted)"], ["dash", "Comparison (dashed)"]]
    : [["primary", "Selected variant"], ["compare", "Comparison"], ["strength", "Muscle strength (capacity)"]];
  $("torque-legend").replaceChildren(...items.map(([cls, text]) => {
    const li = document.createElement("li");
    const sw = document.createElement("i");
    sw.className = `sw ${cls}`;
    li.append(sw, text);
    return li;
  }));
}

function renderPhase(ex) {
  const ph = phaseAt(state.angle);
  $("phase-name").textContent = state.playing ? `${ph.name} · ${state.direction * (ex.concentric === "decrease" ? -1 : 1) > 0 ? "concentric (lifting)" : "eccentric (lowering)"}` : ph.name;
  $("phase-text").textContent = ph.text;
}

function renderMulti() {
  const ex = state.exercise;
  const v = variant();
  const r = analyzeMulti(ex, v, state.angle, opts(v));
  const act = muscleActivation(ex, v, r, state.angle);
  const { main, cmp, bounds } = curves();
  if (ex.view === "3d") {
    // Bounds over the whole range for this camera, so the figure doesn't jump while animating.
    const camKey = `${state.cam.yaw},${state.cam.pitch}`;
    if (curves().camKey !== camKey) {
      Object.assign(curves(), { camKey, bounds3: bounds3d(main.filter((_, i) => i % 8 === 0 || i === main.length - 1).map((s) => scene3d(ex, s, act)), state.cam) });
    }
    renderView3d($("figure"), scene3d(ex, r, act), state.cam, curves().bounds3);
  } else {
    renderMultiFigure($("figure"), { exercise: ex, variant: v, result: r, activation: act, bounds });
  }

  const unit = ex.angleUnit ?? "°";
  const bands = ex.phases.map((p) => ({ from: p.range[0], to: p.range[1], label: p.name }));
  const series = (samples, key, cls, scale = 1) => ex.joints.flatMap((j, i) => (key !== "torque" && j.passive ? [] : [{
    points: samples.map((s) => [s.angle, s.joints[i][key] * scale]), className: `joint-${j.id} ${cls}`,
  }]));
  // Capacity lines only for the main (extensor) groups; two-sided ones would clutter.
  const caps = series(main, "capacity", "cap").filter((s) => !ex.joints.find((j) => s.className.startsWith(`joint-${j.id} `))?.negative);
  const torque = [...caps, ...(cmp ? series(cmp, "torque", "dash") : []), ...series(main, "torque", "")];
  const all = torque.flatMap((s) => s.points.map((p) => p[1]));
  renderChart($("torque-chart"), {
    xRange: ex.angleRange, series: torque, bands, marker: state.angle, yMin: Math.min(0, ...all), xUnit: unit,
    xLabel: ex.angleLabel, yLabel: "Torque per leg / arm (Nm)", yFormat: (x) => x.toFixed(0),
  });
  const effort = [...(cmp ? series(cmp, "effort", "dash", 100) : []), ...series(main, "effort", "", 100)];
  renderChart($("effort-chart"), {
    xRange: ex.angleRange, yMax: Math.max(100, ...effort.flatMap((s) => s.points.map((p) => p[1]))), xUnit: unit,
    series: effort, bands, marker: state.angle, xLabel: ex.angleLabel, yLabel: "Effort (% of max)", yFormat: (x) => `${x.toFixed(0)}%`,
  });

  $("angle-out").textContent = `${state.angle.toFixed(0)}${unit}`;
  const body = $("joint-table").tBodies[0];
  body.replaceChildren(...r.joints.map((j) => {
    const tr = document.createElement("tr");
    const opposite = j.torque < -0.5;
    const action = opposite && j.negative ? j.negative.action : j.action;
    const cells = [
      j.name,
      `${Math.abs(j.torque).toFixed(0)} Nm`,
      j.momentArm == null ? "—" : `${(j.momentArm * 100).toFixed(1)} cm`,
      j.effort == null ? "ligaments" : `${(j.effort * 100).toFixed(0)}%`,
    ];
    cells.forEach((t, i) => {
      const td = document.createElement(i ? "td" : "th");
      td.textContent = t;
      if (i === 0) {
        td.scope = "row";
        td.className = `jt-${j.id}`;
        if (j.negative) td.append(Object.assign(document.createElement("small"), { textContent: action }));
      }
      if (i === 1 && opposite && !j.negative) td.append(Object.assign(document.createElement("small"), { textContent: "opposite muscles" }));
      if (i === 3 && j.effort > 1) td.className = "over";
      tr.append(td);
    });
    tr.title = opposite && !j.negative ? `${j.name}: the opposite muscles to ${j.action.toLowerCase()} have to work here.` : action;
    return tr;
  }));
  const over = r.joints.filter((j) => j.effort > 1);
  $("ro-warning").hidden = !over.length;
  $("ro-warning").textContent = `Load exceeds ${over.map((j) => j.name.toLowerCase()).join(" and ")} strength here — this is where the lift would fail.`;
  const info = ex.view === "3d" ? [{ text: "Moment arm = the joint's 3D distance from the plate's push line; it feeds every component of that joint's torque." }, ...r.info] : r.info;
  $("ro-limb").hidden = !info.length;
  $("ro-limb").replaceChildren(...info.map((i) => Object.assign(document.createElement("span"), { textContent: `${i.text} `, className: i.warn ? "warn" : "" })));
  renderPhase(ex);
  renderMuscles(act);
}

function render() {
  if (isMulti()) return renderMulti();
  const ex = state.exercise;
  const v = variant();
  const r = analyze(ex, v, state.angle, opts(v));
  const act = muscleActivation(ex, v, r, state.angle);
  const { main, cmp, bounds } = curves();

  renderFigure($("figure"), { exercise: ex, variant: v, result: r, activation: act, pulley: state.pulley, bounds });

  const bands = ex.phases.map((p) => ({ from: p.range[0], to: p.range[1], label: p.name }));
  const strength = main.map((s) => [s.angle, s.capacity]);
  const torqueSeries = [
    { points: strength, className: "strength" },
    ...(cmp ? [{ points: cmp.map((s) => [s.angle, Math.max(0, s.jointTorque)]), className: "compare" }] : []),
    { points: main.map((s) => [s.angle, Math.max(0, s.jointTorque)]), className: "primary" },
  ];
  renderChart($("torque-chart"), {
    xRange: ex.angleRange, series: torqueSeries, bands, marker: state.angle,
    xLabel: ex.angleLabel, yLabel: "Torque (Nm)", yFormat: (v) => v.toFixed(0),
  });
  const effortSeries = [
    ...(cmp ? [{ points: cmp.map((s) => [s.angle, s.effort * 100]), className: "compare" }] : []),
    { points: main.map((s) => [s.angle, s.effort * 100]), className: "primary" },
  ];
  renderChart($("effort-chart"), {
    xRange: ex.angleRange, yMax: Math.max(100, ...effortSeries.flatMap((s) => s.points.map((p) => p[1]))),
    series: effortSeries, bands, marker: state.angle,
    xLabel: ex.angleLabel, yLabel: "Effort (% of max)", yFormat: (v) => `${v.toFixed(0)}%`,
  });

  // Readouts
  $("angle-out").textContent = `${state.angle.toFixed(0)}°`;
  $("ro-torque").textContent = `${Math.max(0, r.jointTorque).toFixed(1)} Nm`;
  $("ro-arm").textContent = r.force.mag > 0 ? `${Math.abs(r.momentArm * 100).toFixed(1)} cm` : "—";
  $("ro-limb").hidden = !r.limbs.length;
  $("ro-limb").textContent = `Includes ${r.limbTorque.toFixed(1)} Nm from the ${ex.segments.massLabel ?? "limb"}'s own weight; the moment arm is the load's.`;
  $("ro-effort").textContent = `${(r.effort * 100).toFixed(0)}%`;
  $("ro-effort").classList.toggle("over", r.effort > 1);
  $("ro-warning").hidden = !(r.effort > 1);
  $("ro-warning").textContent = "Load exceeds strength at this angle — this is where the lift would fail.";
  renderPhase(ex);
  renderMuscles(act);
}

/** Muscle bars + wger body map overlays. A null value means "not modelled". */
function renderMuscles(act) {
  const list = $("muscle-list");
  if (list.children.length !== act.length) {
    list.replaceChildren(...act.map((m) => {
      const li = document.createElement("li");
      li.innerHTML = `<div class="m-head"><span class="m-name"></span><span class="m-role"></span><span class="m-val"></span></div><div class="bar"><span></span></div><p class="m-note"></p>`;
      li.querySelector(".m-name").textContent = m.name;
      li.querySelector(".m-role").textContent = m.role;
      li.querySelector(".m-note").textContent = m.note;
      return li;
    }));
  }
  act.forEach((m, i) => {
    const li = list.children[i];
    li.querySelector(".m-val").textContent = m.value == null ? "not modelled" : `${Math.round(m.value * 100)}%`;
    li.querySelector(".bar span").style.width = `${(m.value ?? 0) * 100}%`;
  });
  for (const img of $("muscles-card").querySelectorAll(".bodymap img.overlay")) {
    const m = act.find((x) => x.id === img.dataset.muscle);
    img.style.opacity = (0.12 + 0.88 * (m?.value ?? 0)).toFixed(3);
  }
}

// ---------- animation ----------
let last = 0;
function tick(t) {
  if (!state.playing) return;
  const dt = last ? (t - last) / 1000 : 0;
  last = t;
  const [lo, hi] = state.exercise.angleRange;
  const speed = (hi - lo) / (state.direction > 0 ? 1.4 : 2.2); // lowering slower than lifting
  state.angle += state.direction * speed * dt;
  if (state.angle >= hi) { state.angle = hi; state.direction = -1; }
  if (state.angle <= lo) { state.angle = lo; state.direction = 1; }
  $("angle").value = state.angle;
  render();
  requestAnimationFrame(tick);
}
function setPlaying(on) {
  state.playing = on;
  $("play").textContent = on ? "Pause" : "Play";
  $("play").setAttribute("aria-pressed", on);
  last = 0;
  if (on) requestAnimationFrame(tick);
  else render();
}

// ---------- wiring ----------
function bind() {
  $("exercise").addEventListener("change", (e) => { setExercise(e.target.value); writeHash(); render(); });
  $("variant").addEventListener("change", (e) => { setVariant(e.target.value); writeHash(); render(); });
  $("compare").addEventListener("change", (e) => { state.compareId = e.target.value; writeHash(); render(); });
  $("load").addEventListener("input", (e) => { state.loadKg = +e.target.value; $("load-out").textContent = `${state.loadKg} kg`; writeHash(); render(); });
  $("bodymass").addEventListener("input", (e) => { state.bodyMassKg = +e.target.value; $("bodymass-out").textContent = `${state.bodyMassKg} kg`; render(); });
  $("strength").addEventListener("input", (e) => {
    if (isMulti()) { state.strengthPct = +e.target.value; $("strength-out").textContent = `${state.strengthPct}%`; }
    else { state.peakTorqueNm = +e.target.value; $("strength-out").textContent = `${state.peakTorqueNm} Nm`; }
    render();
  });
  $("angle").addEventListener("input", (e) => { setPlaying(false); state.angle = +e.target.value; render(); });
  $("play").addEventListener("click", () => setPlaying(!state.playing));
  for (const axis of ["x", "y"]) {
    $(`pulley-${axis}`).addEventListener("input", (e) => { state.pulley[axis] = +e.target.value; writeHash(); render(); });
  }
  $("pulley-reset").addEventListener("click", () => { setVariant(state.variantId); writeHash(); render(); });
  $("placement-reset").addEventListener("click", () => { setPlacement(variant()); render(); });
  for (const b of $("view-buttons").querySelectorAll("button")) {
    b.addEventListener("click", () => { state.cam = { ...CAMERAS[b.dataset.cam] }; render(); });
  }
  // Drag to turn the 3D view (horizontal drags only on touch, so the page still scrolls).
  let drag = null;
  $("figure").addEventListener("pointerdown", (e) => {
    if (state.exercise.view !== "3d") return;
    drag = { x: e.clientX, y: e.clientY, cam: { ...state.cam } };
    $("figure").setPointerCapture(e.pointerId);
  });
  $("figure").addEventListener("pointermove", (e) => {
    if (!drag) return;
    state.cam.yaw = drag.cam.yaw - (e.clientX - drag.x) * 0.5;
    state.cam.pitch = Math.max(-10, Math.min(90, drag.cam.pitch + (e.clientY - drag.y) * 0.5));
    if (!state.playing) render();
  });
  const end = () => { drag = null; };
  $("figure").addEventListener("pointerup", end);
  $("figure").addEventListener("pointercancel", end);
}

async function init() {
  const h = readHash();
  const [all, body] = await Promise.all([Promise.all(EXERCISES.map(loadExercise)), fetch("data/body.json").then((r) => r.json())]);
  state.body = body;
  for (const ex of all) state.catalog[ex.id] = ex;
  const sel = $("exercise");
  sel.replaceChildren();
  for (const [label, multi] of [["Single joint", false], ["Multi-joint", true]]) {
    const group = document.createElement("optgroup");
    group.label = label;
    for (const ex of all.filter((x) => (x.model === "multi") === multi)) group.append(new Option(ex.name, ex.id));
    sel.append(group);
  }
  setExercise(EXERCISES.includes(h.ex) ? h.ex : EXERCISES[0], h);
  bind();
  addEventListener("resize", () => { if (!state.playing) render(); });
  render();
}

init();
