import { analyze, sampleCurve } from "./physics.js";
import { muscleActivation } from "./muscles.js";
import { renderChart } from "./chart.js";
import { renderFigure, figureBounds, viewTitle, renderMultiFigure, multiBounds } from "./figure.js";
import { analyzeMulti, sampleMulti } from "./multijoint.js";
import { CAMERAS, scene3d, bounds3d, renderView3d } from "./view3d.js";
import { fetchExercise, descriptionParagraphs, bodyBackground, muscleOverlay, isBackMuscle } from "./wger.js";
import { loadRegion, regionsOf, viewsFor, renderRegionView, regionValues } from "./regions.js";
import { analyzeFinger, sampleFinger } from "./finger.js";
import { renderFingerFigure, fingerBounds } from "./fingerfig.js";

const EXERCISES = [
  "biceps-curl", "triceps-extension", "wrist-curl", "reverse-wrist-curl", "edge-lift", "lateral-raise", "front-raise", "chest-fly", "straight-arm-pulldown",
  "leg-extension", "leg-curl", "calf-raise", "hip-abduction", "glute-kickback",
  "squat", "romanian-deadlift", "deadlift", "split-squat", "leg-press", "hip-thrust", "bench-press", "overhead-press", "bent-over-row", "seated-row", "lat-pulldown", "pull-up",
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

/** Cables and bands pull towards a movable point (pulley or band anchor). */
const anchored = (v) => v.load?.type === "cable" || v.load?.type === "band";
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
  // Placement sliders: pl=key:value,key:value (a number or "auto").
  const placement = p.has("pl")
    ? Object.fromEntries(p.get("pl").split(",").map((kv) => kv.split(":"))
      .filter(([k, v]) => k && v && (v === "auto" || !Number.isNaN(+v))).map(([k, v]) => [k, v === "auto" ? v : +v]))
    : undefined;
  return { ex: p.get("ex"), variant: p.get("v"), compare: p.get("cmp"), load: num("kg"), px: num("px"), py: num("py"), placement };
}
function writeHash() {
  const p = new URLSearchParams({ ex: state.exercise.id, v: state.variantId, kg: state.loadKg });
  if (state.compareId) p.set("cmp", state.compareId);
  if (anchored(variant())) {
    p.set("px", state.pulley.x.toFixed(2));
    p.set("py", state.pulley.y.toFixed(2));
  }
  // Only placement values that differ from the variant's preset, so plain links stay short.
  const changed = Object.entries(state.placement ?? {}).filter(([k, v]) => v !== variant().params?.[k]);
  if (changed.length) p.set("pl", changed.map(([k, v]) => `${k}:${v === "auto" ? v : +(+v).toFixed(4)}`).join(","));
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

function setVariant(id, pulley, load, placement) {
  state.variantId = id;
  const v = variant();
  // Machines, cables and ankle weights need very different loads: use the variant's default.
  const kg = load ?? v.defaultLoadKg;
  if (kg != null) { state.loadKg = kg; $("load").value = kg; $("load-out").textContent = `${kg} kg`; }
  state.pulley = anchored(v) ? { ...(pulley ?? v.load.pulley) } : null;
  $("variant").value = id;
  $("pulley-controls").hidden = !anchored(v);
  const band = v.load?.type === "band";
  $("pulley-reset").textContent = band ? "Reset anchor" : "Reset pulley";
  for (const id of ["pulley-x-label", "pulley-y-label"]) {
    $(id).textContent = $(id).textContent.replace(/^(Pulley|Band anchor)/, band ? "Band anchor" : "Pulley");
  }
  if (state.pulley) {
    $("pulley-x").value = state.pulley.x;
    $("pulley-y").value = state.pulley.y;
  }
  setPlacement(v, placement);
  if (state.exercise.model === "finger" && !state.playing) {
    state.angle = v.params.pip;
    $("angle").value = state.angle;
  }
  $("variant-notes").textContent = v.strengthScale ? `${v.notes} Strength in this posture: ${v.strengthScale.note}` : v.notes;
  $("variant-equipment").textContent = v.equipment;
  $("figure-title").textContent = viewTitle(state.exercise, v);
  $("load-label").textContent = state.exercise.model === "finger" ? "Block (one hand)" : v.load?.type === "reaction" ? "Added load" : "Load";
}

/** Foot-placement sliders (3D lifts): start from the variant's preset. */
function setPlacement(v, override = {}) {
  const spec = state.exercise.placement;
  $("placement-controls").hidden = !spec;
  if (!spec) { state.placement = null; return; }
  state.placement = Object.fromEntries(spec.map((s) => [s.key, override[s.key] ?? v.params[s.key]]));
  $("placement-sliders").replaceChildren(...spec.map((s) => {
    const label = document.createElement("label");
    const out = document.createElement("output");
    const isAuto = () => state.placement[s.key] === "auto";
    const input = Object.assign(document.createElement("input"), { type: "range", min: s.min, max: s.max, step: s.step, value: isAuto() ? 0 : state.placement[s.key] });
    const show = () => { out.textContent = isAuto() ? "auto" : `${Math.round(state.placement[s.key] * s.scale)} ${s.unit}`; input.disabled = isAuto(); };
    input.addEventListener("input", () => { state.placement[s.key] = +input.value; show(); writeHash(); renderSoon(); });
    label.append(`${s.label} `, out, input);
    if (s.auto) {
      // A value the model can pick itself (e.g. the least-effort sideways floor push).
      const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: isAuto() });
      box.addEventListener("change", () => { state.placement[s.key] = box.checked ? "auto" : +input.value; show(); writeHash(); render(); });
      const auto = Object.assign(document.createElement("span"), { className: "auto-toggle" });
      auto.append(box, ` ${s.auto}`);
      label.append(auto);
    }
    show();
    return label;
  }));
}

/** Does the body-mass setting change anything (limb weight, or body weight on the floor)? */
const usesBodyMass = (ex) => ex.model !== "finger" && (ex.model === "multi" || Boolean(ex.segments.massFractions) || ex.variants.some((v) => v.load.bodyWeight > 0));
const isMulti = () => state.exercise.model === "multi";
const isFinger = () => state.exercise.model === "finger";
/** Strength as % of typical (multi-joint lifts, edge lift) instead of a peak torque in Nm. */
const pctStrength = (ex) => ex.model === "multi" || ex.model === "finger";

function buildBodyMap() {
  const mapped = state.exercise.muscles.filter((x) => x.wgerId);
  // Nothing on the wger map but a close-up exists (e.g. forearm muscles): show only the close-up.
  const detailOnly = !mapped.length && regionsOf(state.exercise).length > 0;
  for (const front of [true, false]) {
    const box = $(front ? "bodymap-front" : "bodymap-back");
    const here = mapped.filter((m) => isBackMuscle(m.wgerId) !== front);
    box.replaceChildren();
    box.hidden = detailOnly || (!here.length && !(front && !mapped.length));
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
  $("bodymap-front").parentElement.hidden = detailOnly;
}

/** Close-up views for the exercise's body regions (see js/regions.js). */
let detail = [];
async function buildDetail() {
  const ex = state.exercise;
  detail = [];
  $("muscle-detail").hidden = true;
  const regions = await Promise.all(regionsOf(ex).map(loadRegion));
  if (state.exercise !== ex) return; // switched exercise while loading
  const box = $("detail-views");
  box.replaceChildren();
  for (const region of regions) {
    for (const view of viewsFor(region, ex)) {
      const fig = document.createElement("figure");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `${region.name}: ${view.title}`);
      const cap = document.createElement("figcaption");
      cap.innerHTML = "<strong></strong> <span></span>";
      cap.querySelector("strong").textContent = `${regions.length > 1 ? `${region.name}: ` : ""}${view.title}.`;
      cap.querySelector("span").textContent = view.caption;
      fig.append(svg, cap);
      box.append(fig);
      detail.push({ region, view, svg });
    }
  }
  $("detail-region").textContent = regions.map((r) => r.name.toLowerCase()).join(", ");
  $("muscle-detail").hidden = !detail.length;
  renderSoon();
}

/** Tapping a muscle in a close-up points at its bar in the list. */
function pickMuscle(muscleId) {
  const i = state.exercise.muscles.findIndex((m) => m.id === muscleId);
  const li = $("muscle-list").children[i];
  if (!li) return;
  li.classList.remove("picked");
  void li.offsetWidth; // restart the highlight animation
  li.classList.add("picked");
  li.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  const finger = ex.model === "finger";
  const pct = pctStrength(ex);
  $("strength-label").textContent = finger ? "Strength (% of typical maximum fingertip force)" : multi ? "Strength (% of typical, all joints)" : `Strength (peak ${ex.joint.toLowerCase()} torque)`;
  $("pulley-x-label").textContent = view === "side" ? "Pulley forward / back" : "Pulley side to side";
  $("pulley-y-label").textContent = view === "top" ? "Pulley forward / back" : "Pulley height";
  fillSelect($("variant"), ex.variants);
  fillSelect($("compare"), ex.variants, true);

  state.loadKg = h.load ?? ex.defaults.loadKg;
  state.peakTorqueNm = ex.defaults.peakTorqueNm;
  state.bodyMassKg = ex.defaults.bodyMassKg ?? 75;
  [$("load").min, $("load").max, $("load").step] = ui.load;
  [$("strength").min, $("strength").max] = pct ? [50, 150] : ui.strength;
  state.strengthPct = 100;
  $("bodymass-control").hidden = !usesBodyMass(ex);
  $("bodymass").value = state.bodyMassKg; $("bodymass-out").textContent = `${state.bodyMassKg} kg`;
  $("load").value = state.loadKg; $("load-out").textContent = `${state.loadKg} kg`;
  $("strength").value = pct ? 100 : state.peakTorqueNm;
  $("strength-out").textContent = pct ? "100%" : `${state.peakTorqueNm} Nm`;
  $("readouts").hidden = multi || finger;
  $("view-buttons").hidden = ex.view !== "3d";
  $("figure").classList.toggle("draggable", ex.view === "3d");
  $("joint-table").hidden = !(multi || finger);
  $("joint-table").tHead.rows[0].cells[0].textContent = finger ? "Structure" : "Joint";
  $("joint-table").tHead.rows[0].cells[1].textContent = finger ? "Force" : "Torque";
  $("joint-table").tHead.rows[0].cells[2].textContent = finger ? "× fingertip" : "Moment arm";
  $("torque-title").textContent = finger ? "Tendon forces" : "Resistance vs strength";
  $("effort-title").textContent = finger ? "Pulley loads" : "Effort across the range";
  $("effort-hint").textContent = finger ? "Force on the A2 and A4 pulleys as the middle joint (PIP) bends. Pulley injuries happen here." : "Joint torque ÷ strength at each angle. The peak is the sticking point.";
  buildLegend(ex);
  const [lo, hi] = ex.angleRange;
  state.angle = Math.min(hi, Math.max(lo, state.angle));
  $("angle").min = lo; $("angle").max = hi; $("angle").value = state.angle;

  const vId = ex.variants.some((v) => v.id === h.variant) ? h.variant : ex.defaults.variant;
  setVariant(vId, h.px != null && h.py != null ? { x: h.px, y: h.py } : undefined, h.load, h.variant === vId ? h.placement : undefined);
  state.compareId = ex.variants.some((v) => v.id === h.compare) ? h.compare : "";
  $("compare").value = state.compareId;

  $("muscle-list").replaceChildren();
  buildBodyMap();
  buildDetail();
  loadWger();
  renderReferences();
}

// ---------- render ----------
let curveCache = null;
function curves() {
  const key = JSON.stringify([state.exercise.id, state.variantId, state.compareId, state.loadKg, state.peakTorqueNm, state.bodyMassKg, state.strengthPct, state.pulley, state.placement]);
  if (curveCache?.key === key) return curveCache;
  // While a slider is being dragged, keep the previous curves if they were slow to compute
  // (the figure and readouts still update live); renderSoon() redraws them once it pauses.
  const same = `${state.exercise.id}|${state.variantId}|${state.compareId}`;
  if (state.deferCurves && curveCache?.same === same && curveCache.ms > 50) return curveCache;
  const t0 = performance.now();
  const ex = state.exercise;
  if (ex.model === "finger") {
    const main = sampleFinger(ex, variant(), opts(variant()));
    const cmp = state.compareId ? sampleFinger(ex, variant(state.compareId), opts(variant(state.compareId))) : null;
    curveCache = { key, same, main, cmp, bounds: fingerBounds(cmp ? [...main, ...cmp] : main), ms: performance.now() - t0 };
    return curveCache;
  }
  if (ex.model === "multi") {
    const main = sampleMulti(ex, variant(), opts(variant()));
    const cmp = state.compareId ? sampleMulti(ex, variant(state.compareId), opts(variant(state.compareId))) : null;
    curveCache = { key, same, main, cmp, bounds: ex.view === "3d" ? null : multiBounds(main), ms: performance.now() - t0 };
    return curveCache;
  }
  const main = sampleCurve(ex, variant(), opts(variant()));
  const cmp = state.compareId ? sampleCurve(ex, variant(state.compareId), opts(variant(state.compareId))) : null;
  const bounds = figureBounds(ex, variant(), main.map((s) => s.pose), state.pulley);
  curveCache = { key, same, main, cmp, bounds, ms: performance.now() - t0 };
  return curveCache;
}

/** Render now with the curves possibly held, then once more 150 ms after the slider stops. */
let soonTimer = null;
function renderSoon() {
  state.deferCurves = true;
  render();
  state.deferCurves = false;
  clearTimeout(soonTimer);
  soonTimer = setTimeout(render, 150);
}

function phaseAt(angle) {
  return state.exercise.phases.find((p) => angle >= p.range[0] && angle <= p.range[1]) ?? state.exercise.phases.at(-1);
}

/** Legend for the torque chart: one entry per joint for multi-joint lifts. */
function buildLegend(ex) {
  const items = ex.model === "finger"
    ? [["f-fdp", "FDP tendon"], ["f-fds", "FDS tendon"], ["f-a2", "A2 pulley (lower chart)"], ["f-a4", "A4 pulley (lower chart)"], ["dash", "Comparison (dashed)"]]
    : ex.model === "multi"
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
  // The edge lift is a hold: the slider sweeps the grip, not a lifting phase.
  $("phase-name").textContent = state.playing && ex.model !== "finger" ? `${ph.name} · ${state.direction * (ex.concentric === "decrease" ? -1 : 1) > 0 ? "concentric (lifting)" : "eccentric (lowering)"}` : ph.name;
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
  const info = ex.momentArmNote ? [{ text: ex.momentArmNote }, ...r.info] : r.info;
  $("ro-limb").hidden = !info.length;
  $("ro-limb").replaceChildren(...info.map((i) => Object.assign(document.createElement("span"), { textContent: `${i.text} `, className: i.warn ? "warn" : "" })));
  renderPhase(ex);
  renderMuscles(act);
}

/** Edge lift: finger figure, tendon and pulley charts, and a table of the structures' loads. */
function renderFinger() {
  const ex = state.exercise;
  const v = variant();
  const r = analyzeFinger(ex, v, state.angle, opts(v));
  const act = muscleActivation(ex, v, r, state.angle);
  const { main, cmp, bounds } = curves();
  renderFingerFigure($("figure"), { exercise: ex, variant: v, result: r, bounds });

  const bands = ex.phases.map((p) => ({ from: p.range[0], to: p.range[1], label: p.name }));
  const lines = (samples, get, cls) => ({ points: samples.map((s) => [s.angle, get(s)]), className: cls });
  const tendons = [
    ...(cmp ? [lines(cmp, (s) => s.tendons.fdp, "f-fdp dash"), lines(cmp, (s) => s.tendons.fds, "f-fds dash")] : []),
    lines(main, (s) => s.tendons.fdp, "f-fdp"), lines(main, (s) => s.tendons.fds, "f-fds"),
  ];
  renderChart($("torque-chart"), {
    xRange: ex.angleRange, series: tendons, bands, marker: state.angle,
    xLabel: ex.angleLabel, yLabel: "Tendon tension (N)", yFormat: (x) => x.toFixed(0),
  });
  const pulleys = [
    ...(cmp ? [lines(cmp, (s) => s.pulleys.a2, "f-a2 dash"), lines(cmp, (s) => s.pulleys.a4, "f-a4 dash")] : []),
    lines(main, (s) => s.pulleys.a2, "f-a2"), lines(main, (s) => s.pulleys.a4, "f-a4"),
  ];
  renderChart($("effort-chart"), {
    xRange: ex.angleRange, series: pulleys, bands, marker: state.angle,
    xLabel: ex.angleLabel, yLabel: "Pulley load (N)", yFormat: (x) => x.toFixed(0),
  });

  $("angle-out").textContent = `${state.angle.toFixed(0)}°`;
  const F = r.fingertipN;
  const rows = [
    ["f-tip", "Fingertip", F, null, r.effort],
    ["f-fdp", "FDP tendon", r.tendons.fdp, r.tendons.fdp / F, null],
    ["f-fds", "FDS tendon", r.tendons.fds, r.tendons.fds / F, null],
    ["f-a2", "A2 pulley", r.pulleys.a2, r.pulleys.a2 / F, null],
    ["f-a4", "A4 pulley", r.pulleys.a4, r.pulleys.a4 / F, null],
  ];
  $("joint-table").tBodies[0].replaceChildren(...rows.map(([cls, name, force, ratio, effort]) => {
    const tr = document.createElement("tr");
    [name, `${force.toFixed(0)} N`, ratio == null ? "—" : `${ratio.toFixed(1)}×`, effort == null ? "" : `${(effort * 100).toFixed(0)}%`].forEach((t, i) => {
      const td = document.createElement(i ? "td" : "th");
      td.textContent = t;
      if (i === 0) { td.scope = "row"; td.className = `jt-${cls}`; }
      if (i === 3 && effort > 1) td.className = "over";
      tr.append(td);
    });
    return tr;
  }));
  $("ro-warning").hidden = !(r.effort > 1);
  $("ro-warning").textContent = "More than this finger's typical maximum: the grip would open here.";
  const info = [{ text: `This finger carries ${((F / (state.loadKg * 9.81)) * 100).toFixed(0)}% of the block (slider below). FDP:FDS = ${Number.isFinite(r.ratio) ? r.ratio.toFixed(2) : "FDP only"}.` }];
  if (r.passive > 0) info.push({ text: `The bent-back fingertip joint carries ${r.passive.toFixed(2)} Nm passively.` });
  if (r.pipExtensor > 0.01) info.push({ warn: true, text: `The FDP alone over-bends the middle joint: the extensor mechanism has to hold ${r.pipExtensor.toFixed(2)} Nm (not shown as a force).` });
  if (Math.abs(r.mcpRest) > 0.05) info.push({ text: `Knuckle (MCP): ${r.mcpRest > 0 ? "the intrinsic hand muscles add" : "the extensors (or intrinsics) hold back"} ${Math.abs(r.mcpRest).toFixed(2)} Nm.` });
  $("ro-limb").hidden = false;
  $("ro-limb").replaceChildren(...info.map((i) => Object.assign(document.createElement("span"), { textContent: `${i.text} `, className: i.warn ? "warn" : "" })));
  renderPhase(ex);
  renderMuscles(act);
}

function render() {
  if (isFinger()) return renderFinger();
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
  if (detail.length) {
    const values = regionValues(act);
    for (const d of detail) renderRegionView(d.svg, d.region, d.view, values, pickMuscle);
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
  $("load").addEventListener("input", (e) => { state.loadKg = +e.target.value; $("load-out").textContent = `${state.loadKg} kg`; writeHash(); renderSoon(); });
  $("bodymass").addEventListener("input", (e) => { state.bodyMassKg = +e.target.value; $("bodymass-out").textContent = `${state.bodyMassKg} kg`; renderSoon(); });
  $("strength").addEventListener("input", (e) => {
    if (pctStrength(state.exercise)) { state.strengthPct = +e.target.value; $("strength-out").textContent = `${state.strengthPct}%`; }
    else { state.peakTorqueNm = +e.target.value; $("strength-out").textContent = `${state.peakTorqueNm} Nm`; }
    renderSoon();
  });
  $("angle").addEventListener("input", (e) => { setPlaying(false); state.angle = +e.target.value; render(); });
  $("play").addEventListener("click", () => setPlaying(!state.playing));
  for (const axis of ["x", "y"]) {
    $(`pulley-${axis}`).addEventListener("input", (e) => { state.pulley[axis] = +e.target.value; writeHash(); renderSoon(); });
  }
  $("pulley-reset").addEventListener("click", () => {
    // Only the pulley (or band anchor): keep the load and any placement the user set.
    state.pulley = { ...variant().load.pulley };
    $("pulley-x").value = state.pulley.x;
    $("pulley-y").value = state.pulley.y;
    writeHash();
    render();
  });
  $("placement-reset").addEventListener("click", () => { setPlacement(variant()); writeHash(); render(); });
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

// ---------- references ----------
/** All `source` strings in an exercise (or any JSON value), for matching against references. */
function sourcesOf(o, out = []) {
  if (Array.isArray(o)) o.forEach((x) => sourcesOf(x, out));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (k === "source" || /Source$/.test(k)) && typeof v === "string" ? out.push(v) : sourcesOf(v, out);
  return out;
}
const usesRef = (ex, ref) => sourcesOf(ex).some((s) => s.includes(ref.match));

/** One reference as a list item: citation (with link), what it's used for, and optionally where. Text only. */
function refItem(ref, usedIn) {
  const li = document.createElement("li");
  li.append(ref.citation);
  if (ref.url) {
    li.append(" ");
    li.append(Object.assign(document.createElement("a"), { href: ref.url, target: "_blank", rel: "noopener", textContent: ref.url.replace("https://doi.org/", "doi:") }));
  }
  li.append(Object.assign(document.createElement("small"), { textContent: ref.usedFor + (usedIn ? ` Used in: ${usedIn}.` : "") }));
  return li;
}

function renderReferences() {
  const R = state.references;
  if (!R) return;
  const ex = state.exercise;
  const mine = R.references.filter((r) => usesRef(ex, r) || (ex.model === "multi" && r.key === "de Leva 1996"));
  $("ref-current").replaceChildren(...(mine.length ? mine.map((r) => refItem(r)) : [Object.assign(document.createElement("li"), { textContent: "No published source for this exercise's numbers yet: they are estimates." })]));
  if ($("ref-all").childElementCount) return; // the full list doesn't change with the exercise
  $("ref-count").textContent = R.references.length;
  const groups = [...new Set(R.references.map((r) => r.group))];
  const names = (r) => Object.values(state.catalog).filter((e) => usesRef(e, r)).map((e) => e.name).join(", ");
  $("ref-all").replaceChildren(
    ...groups.flatMap((g) => [Object.assign(document.createElement("h4"), { textContent: g }),
      Object.assign(document.createElement("ul"), { className: "ref-list" })]),
    Object.assign(document.createElement("h4"), { textContent: "Resources" }),
    Object.assign(document.createElement("ul"), { className: "ref-list" }));
  const lists = $("ref-all").querySelectorAll("ul");
  groups.forEach((g, i) => lists[i].append(...R.references.filter((r) => r.group === g).map((r) => refItem(r, r.key === "de Leva 1996" ? "all multi-joint lifts and limb weights" : names(r)))));
  lists[groups.length].append(...R.resources.map((x) => {
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("a"), { href: x.url, target: "_blank", rel: "noopener", textContent: x.name }), ` (${x.licence})`);
    li.append(Object.assign(document.createElement("small"), { textContent: x.usedFor }));
    return li;
  }));
}

async function init() {
  const h = readHash();
  const [all, body, refs] = await Promise.all([Promise.all(EXERCISES.map(loadExercise)), fetch("data/body.json").then((r) => r.json()),
    fetch("data/references.json").then((r) => r.json()).catch(() => null)]);
  state.body = body;
  state.references = refs;
  for (const ex of all) state.catalog[ex.id] = ex;
  const sel = $("exercise");
  sel.replaceChildren();
  for (const [label, model] of [["Single joint", undefined], ["Multi-joint", "multi"], ["Grip", "finger"]]) {
    const group = document.createElement("optgroup");
    group.label = label;
    for (const ex of all.filter((x) => x.model === model)) group.append(new Option(ex.name, ex.id));
    sel.append(group);
  }
  setExercise(EXERCISES.includes(h.ex) ? h.ex : EXERCISES[0], h);
  bind();
  addEventListener("resize", () => { if (!state.playing) render(); });
  // A pasted or clicked link with a new #… (no reload): apply it. Our own writeHash uses
  // history.replaceState, which doesn't fire this event.
  addEventListener("hashchange", () => {
    const next = readHash();
    setExercise(EXERCISES.includes(next.ex) ? next.ex : EXERCISES[0], next);
    render();
  });
  render();
}

init();
