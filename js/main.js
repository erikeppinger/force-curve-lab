import { analyze, sampleCurve, rangeOf } from "./physics.js";
import { muscleActivation } from "./muscles.js";
import { renderChart } from "./chart.js";
import { renderFigure, figureBounds, zoomBounds, viewTitle, renderMultiFigure, multiBounds } from "./figure.js";
import { analyzeMulti, sampleMulti } from "./multijoint.js";
import { CAMERAS, scene3d, bounds3d, renderView3d } from "./view3d.js";
import { fetchExercise, descriptionParagraphs, bodyBackground, muscleOverlay, isBackMuscle } from "./wger.js";
import { loadRegion, regionsOf, viewsFor, renderRegionView, regionValues } from "./regions.js";
import { analyzeEdge, sampleEdge, idealEdge, liftProfile } from "./finger.js";
import { renderFingersView, renderHandView, renderArmView } from "./edgefig.js";

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
  hand: null, // edge lift: the user's own finger bone lengths (m), or null for the typical hand
  edgeView: "fingers", // edge lift: which figure (fingers | hand | arm)
  liftT: null, // edge lift: time in the played lift (s); null = holding (the static view)
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
  hand: state.hand,
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
  // Own hand: hand=16 numbers in mm (knuckle back, proximal, middle, distal per finger).
  const hand = p.has("hand") ? p.get("hand").split(",").map(Number) : undefined;
  return { ex: p.get("ex"), variant: p.get("v"), compare: p.get("cmp"), load: num("kg"), px: num("px"), py: num("py"), placement, hand: hand?.length === 16 && hand.every((x) => Number.isFinite(x)) ? hand : undefined };
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
  if (state.hand && state.exercise.fingers) p.set("hand", handList().map((x) => +(x * 1000).toFixed(1)).join(","));
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

/** The angle slider follows the variant's range of motion (some variants have their own). */
function applyRange(v) {
  const [lo, hi] = rangeOf(state.exercise, v);
  state.angle = Math.min(hi, Math.max(lo, state.angle));
  $("angle").min = lo; $("angle").max = hi; $("angle").value = state.angle;
}
/** Charts span the selected variant's range and the compared one's. */
function chartRange() {
  const a = rangeOf(state.exercise, variant());
  const b = state.compareId ? rangeOf(state.exercise, variant(state.compareId)) : a;
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

function setVariant(id, pulley, load, placement) {
  state.variantId = id;
  const v = variant();
  applyRange(v);
  // Machines, cables and ankle weights need very different loads: use the variant's default.
  // A load from a link is kept inside the slider's range.
  const kg = load != null ? Math.min(+$("load").max, Math.max(+$("load").min, load)) : v.defaultLoadKg;
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

function setZoom(on) {
  state.zoom = on;
  $("zoom-toggle").setAttribute("aria-pressed", String(on));
  $("zoom-toggle").textContent = on ? "Show the whole body" : "Zoom to the joint";
}

/** Foot-placement sliders (3D lifts): start from the variant's preset. */
function setPlacement(v, override = {}) {
  const spec = state.exercise.placement;
  $("placement-controls").hidden = !spec;
  if (!spec) { state.placement = null; return; }
  // Values from a link: "auto" only where the slider offers it, numbers kept inside the slider's range.
  const fromLink = (s) => { const x = override[s.key]; if (x === "auto") return s.auto ? x : undefined; return Number.isFinite(x) ? Math.min(s.max, Math.max(s.min, x)) : undefined; };
  state.placement = Object.fromEntries(spec.map((s) => [s.key, fromLink(s) ?? v.params[s.key]]));
  const edgeSpecs = spec.filter((s) => s.widget === "edge");
  $("placement-sliders").replaceChildren(...spec.flatMap((s) => {
    if (s.widget === "edge") return s === edgeSpecs[0] ? [edgeBars(edgeSpecs)] : [];
    const label = document.createElement("label");
    const out = document.createElement("output");
    const isAuto = () => state.placement[s.key] === "auto";
    const input = Object.assign(document.createElement("input"), { type: "range", min: s.min, max: s.max, step: s.step, value: isAuto() ? 0 : state.placement[s.key] });
    const show = () => { out.textContent = isAuto() ? "auto" : `${Math.round(state.placement[s.key] * s.scale)} ${s.unit}`; input.disabled = isAuto(); };
    input.addEventListener("input", () => { state.placement[s.key] = +input.value; show(); writeHash(); renderSoon(); });
    label.append(`${s.label} `, out, input);
    if (s.hint) label.append(Object.assign(document.createElement("small"), { className: "slider-hint", textContent: s.hint }));
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

/**
 * Edge lift: the edge height under each finger as four vertical bars side by side over a sketch of
 * the fingers (index left). Up = closer to the knuckles. "Fits this hand" sets all four to the
 * profile that keeps every finger in the grip's own angles (shown, not editable, while on).
 */
function edgeBars(specs) {
  const box = Object.assign(document.createElement("div"), { className: "edge-bars" });
  const head = Object.assign(document.createElement("div"), { className: "edge-bars-head", textContent: "Edge height under each finger (up = closer to the knuckles)" });
  const grid = Object.assign(document.createElement("div"), { className: "edge-bars-grid" });
  const sketch = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sketch.setAttribute("class", "edge-bars-sketch");
  sketch.setAttribute("viewBox", "0 0 400 200");
  sketch.setAttribute("preserveAspectRatio", "none");
  sketch.setAttribute("aria-hidden", "true");
  grid.append(sketch);
  const isAuto = () => specs.every((s) => state.placement[s.key] === "auto");
  const fitted = () => {
    const v = variant();
    const fit = idealEdge(state.exercise, { ...v.params, ...state.placement }, state.angle, state.hand);
    return Object.fromEntries(specs.map((s) => [s.key, fit[s.label.toLowerCase()].lift]));
  };
  const cols = specs.map((s) => {
    const col = Object.assign(document.createElement("label"), { className: "edge-bar" });
    const name = Object.assign(document.createElement("span"), { className: "edge-bar-name", textContent: s.label });
    const out = document.createElement("output");
    const input = Object.assign(document.createElement("input"), { type: "range", min: s.min, max: s.max, step: s.step });
    input.setAttribute("aria-label", `Edge under the ${s.label.toLowerCase()} finger (mm, up = closer to the knuckles)`);
    input.addEventListener("input", () => { state.placement[s.key] = +input.value; show(); writeHash(); renderSoon(); });
    col.append(input, name, out);
    return { s, input, out, col };
  });
  // Finger sketch behind the bars: each finger hangs from its knuckle (typical or own hand).
  const drawSketch = () => {
    const S = state.exercise.fingers;
    const hand = state.hand;
    const parts = S.order.map((id, i) => {
      const L = { ...S.lengths[id], ...(hand?.[id] ?? {}) };
      const back = hand?.[id]?.knuckleBack ?? S.knuckleBack?.[id] ?? 0;
      const x = 50 + i * 100, top = 10 + back * 2000, len = (L.proximal + L.middle + L.distal) * 2000;
      return `<rect x="${x - 20}" y="${top}" width="40" height="${len}" rx="20" class="edge-finger"/>`;
    });
    sketch.innerHTML = parts.join("");
  };
  const show = () => {
    const auto = isAuto();
    const fit = auto ? fitted() : null;
    for (const { s, input, out } of cols) {
      const val = auto ? fit[s.key] : state.placement[s.key] === "auto" ? 0 : state.placement[s.key];
      input.value = val;
      input.disabled = auto;
      out.textContent = `${val > 0.00005 ? "+" : val < -0.00005 ? "−" : ""}${Math.abs(val * 1000).toFixed(1)} mm`;
    }
    drawSketch();
  };
  const autoBox = Object.assign(document.createElement("input"), { type: "checkbox", checked: isAuto() });
  autoBox.addEventListener("change", () => {
    for (const { s } of cols) state.placement[s.key] = autoBox.checked ? "auto" : 0;
    show(); writeHash(); render();
  });
  const auto = Object.assign(document.createElement("label"), { className: "auto-toggle" });
  auto.append(autoBox, " Fits this hand (every finger in the grip's own angles)");
  const hint = Object.assign(document.createElement("small"), { className: "slider-hint", textContent: "All at 0 = a straight edge. Only the differences between the fingers matter. Shaped blocks raise or lower the edge under some fingers; the fitted profile shows what a hand of these lengths would need." });
  grid.append(...cols.map((c) => c.col));
  box.append(head, grid, auto, hint);
  box.refresh = show;
  show();
  return box;
}

// ---------- edge lift: the user's own finger lengths ----------
const BONES = ["knuckleBack", "proximal", "middle", "distal"];
const BONE_RANGE = { knuckleBack: [-10, 30], proximal: [10, 80], middle: [8, 60], distal: [8, 40] }; // mm
/** The typical hand from the data: knuckle line and phalanx lengths per finger (m). */
const typicalHand = () => {
  const S = state.exercise.fingers;
  return Object.fromEntries(S.order.map((id) => [id, { knuckleBack: S.knuckleBack?.[id] ?? 0, proximal: S.lengths[id].proximal, middle: S.lengths[id].middle, distal: S.lengths[id].distal }]));
};
/** The current hand (own or typical) as a flat list in the hash order. */
const handList = () => state.exercise.fingers.order.flatMap((id) => BONES.map((b) => (state.hand ?? typicalHand())[id][b]));
/** Fill the "Your hand" table; list = 16 lengths in mm from the URL, or undefined. */
function setHand(list) {
  const S = state.exercise.fingers;
  $("hand-panel").hidden = !S;
  if (!S) { state.hand = null; return; }
  // Lengths from a link outside the table's ranges are ignored (typical hand instead).
  if (list && !list.every((mm, i) => mm >= BONE_RANGE[BONES[i % 4]][0] && mm <= BONE_RANGE[BONES[i % 4]][1])) list = undefined;
  state.hand = list ? Object.fromEntries(S.order.map((id, i) => [id, Object.fromEntries(BONES.map((b, j) => [b, list[i * 4 + j] / 1000]))])) : null;
  if (list) $("hand-panel").open = true;
  $("hand-table").tBodies[0].replaceChildren(...S.order.map((id) => {
    const tr = document.createElement("tr");
    const th = Object.assign(document.createElement("th"), { scope: "row", textContent: S.labels[id] });
    tr.append(th);
    for (const b of BONES) {
      const td = document.createElement("td");
      const [lo, hi] = BONE_RANGE[b];
      const current = () => +(((state.hand ?? typicalHand())[id][b]) * 1000).toFixed(1);
      const input = Object.assign(document.createElement("input"), {
        type: "number", min: lo, max: hi, step: 0.5, inputMode: "decimal", value: current(),
        // The middle finger's knuckle is the reference for the knuckle line.
        disabled: b === "knuckleBack" && id === "middle",
      });
      input.setAttribute("aria-label", `${S.labels[id]} ${b === "knuckleBack" ? "knuckle set back" : `${b} phalanx`} (mm)`);
      input.addEventListener("change", () => {
        const mm = +input.value;
        if (!(mm >= lo && mm <= hi)) { input.value = current(); return; }
        state.hand = state.hand ?? typicalHand();
        state.hand[id][b] = mm / 1000;
        writeHash();
        render();
      });
      td.append(input);
      tr.append(td);
    }
    return tr;
  }));
}

/** What the strength setting means for this exercise, and why it matters (the "i" next to it). */
function strengthInfo(ex) {
  const why = "Why it matters: effort = the load's torque ÷ strength at that angle, so strength decides how hard the same load feels, where it fails (the sticking point is where effort peaks) and how much load is possible. It doesn't move the resistance curve: a stronger lifter has the same hardest point, just further from the limit.";
  if (ex.model === "finger") return `100% = typical maximum finger forces measured in recreational climbers (the reference tendon tensions and fingertip forces in the sources). The percentage scales every finger's maximum together. Strong climbers are often well above 100%. ${why}`;
  if (ex.model === "multi") return `100% = typical peak torques of each joint (hip, knee, ankle, shoulder, elbow …) for young adults, from the studies listed under References; each joint keeps its own strength curve over its angle. The percentage scales them all together. ${why}`;
  return `The most torque the muscles doing this lift can produce about the ${ex.joint.toLowerCase().replace(/ (flexion|extension|abduction|adduction|horizontal adduction).*$/, "")} at their strongest angle, in newton-metres; the default is a typical untrained to recreationally trained adult from the strength study in References. Over the range it follows the strength curve (the dotted line in the chart): muscles are weaker at some angles than others. ${why}`;
}

/** Does the body-mass setting change anything (limb weight, or body weight on the floor)? */
const usesBodyMass = (ex) => ex.model === "finger" || (ex.model === "multi" || Boolean(ex.segments.massFractions) || ex.variants.some((v) => v.load.bodyWeight > 0));
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
    // Several regions (compound lifts): a heading row per region keeps the views apart.
    if (regions.length > 1) box.append(Object.assign(document.createElement("h4"), { className: "detail-region-head", textContent: region.name }));
    for (const view of viewsFor(region, ex)) {
      const fig = document.createElement("figure");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `${region.name}: ${view.title}`);
      const cap = document.createElement("figcaption");
      cap.innerHTML = "<strong></strong> <span></span>";
      cap.querySelector("strong").textContent = `${view.title}.`;
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
  // What the single joint leaves out (e.g. the shoulder blade moving with the arm).
  $("joint-note").hidden = !ex.jointNote;
  $("joint-note").textContent = ex.jointNote ?? "";
  $("exercise-technique").hidden = !ex.technique;
  $("exercise-technique").textContent = ex.technique ?? "";
  $("angle-label").textContent = ex.angleLabel;
  const multi = ex.model === "multi";
  const finger = ex.model === "finger";
  const pct = pctStrength(ex);
  $("strength-label").textContent = finger ? "Strength (% of typical maximum fingertip force)" : multi ? "Strength (% of typical, all joints)" : `Strength (peak ${ex.joint.toLowerCase()} torque)`;
  $("strength-info").textContent = strengthInfo(ex);
  $("model-link").href = ex.model === "finger" ? "docs/edge-lift-model.html" : `docs/model.html?ex=${ex.id}`;
  $("bodymass-info").textContent = "Body mass sets the weight of the body segments (arm, leg, trunk) from typical body proportions. Limbs that move with the load add their own weight to the joint torque, and in standing lifts the body's weight also rests on the legs. It doesn't change strength: use the strength slider for that.";
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
  // The edge lift is a static hold: no lifting animation, the slider compares holds.
  $("play").hidden = false;
  $("play").textContent = finger ? "Play a lift" : "Play";
  $("lift-chart-box").hidden = !finger;
  state.liftT = null;
  // A new exercise starts paused (an animation running on the previous one doesn't carry over).
  if (state.playing) { state.playing = false; $("play").textContent = "Play"; $("play").setAttribute("aria-pressed", "false"); }
  $("view-buttons").hidden = ex.view !== "3d";
  // Zoom for single-joint lifts; on by default where the moving segment is small (e.g. the hand).
  $("zoom-buttons").hidden = Boolean(ex.model);
  setZoom(!ex.model && (ex.defaults.zoom ?? false));
  $("figure").classList.toggle("draggable", ex.view === "3d");
  $("joint-table").hidden = !multi; // the edge lift shows it in its Arm view
  $("finger-set").hidden = !finger; // shown again by renderFingerSet on the edge lift
  $("edge-summary").hidden = !finger;
  $("edge-tabs").hidden = !finger;
  $("edge-view-hint").hidden = !finger;
  $("torque-title").textContent = finger ? "Deep flexor (FDP) tension per finger, hold by hold" : "Resistance vs strength";
  $("effort-title").textContent = finger ? "A2 pulley load per finger" : "Effort across the range";
  $("effort-hint").textContent = finger ? "As a share of the A2 pulley's breaking load in cadaver tests (Lin et al. 1990, per finger): a guide to scale, not a safety limit. A finger off the edge shows 0." : "Joint torque ÷ strength at each angle. The peak is the sticking point.";
  buildLegend(ex);
  applyRange(ex.variants.find((v) => v.id === ex.defaults.variant) ?? ex.variants[0]);

  const vId = ex.variants.some((v) => v.id === h.variant) ? h.variant : ex.defaults.variant;
  setVariant(vId, h.px != null && h.py != null ? { x: h.px, y: h.py } : undefined, h.load, h.variant === vId ? h.placement : undefined);
  state.compareId = ex.variants.some((v) => v.id === h.compare) ? h.compare : "";
  $("compare").value = state.compareId;

  setHand(h.hand);
  $("muscle-list").replaceChildren();
  buildBodyMap();
  buildDetail();
  loadWger();
  renderReferences();
}

// ---------- render ----------
let curveCache = null;
function curves() {
  const key = JSON.stringify([state.exercise.id, state.variantId, state.compareId, state.loadKg, state.peakTorqueNm, state.bodyMassKg, state.strengthPct, state.pulley, state.placement, state.hand]);
  if (curveCache?.key === key) return curveCache;
  // While a slider is being dragged, keep the previous curves if they were slow to compute
  // (the figure and readouts still update live); renderSoon() redraws them once it pauses.
  const same = `${state.exercise.id}|${state.variantId}|${state.compareId}`;
  if (state.deferCurves && curveCache?.same === same && curveCache.ms > 50) return curveCache;
  const t0 = performance.now();
  const ex = state.exercise;
  if (ex.model === "finger") {
    const main = sampleEdge(ex, variant(), opts(variant()));
    const cmp = state.compareId ? sampleEdge(ex, variant(state.compareId), opts(variant(state.compareId))) : null;
    curveCache = { key, same, main, cmp, bounds: null, ms: performance.now() - t0 };
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

/** A tap or drag on a chart: move to that angle (or, in the edge lift's timeline, that moment). */
function scrubAngle(x) {
  setPlaying(false);
  state.angle = Math.round(x * 2) / 2;
  $("angle").value = state.angle;
  renderSoon();
}
function scrubLift(t) {
  if (state.playing) setPlaying(false);
  state.liftT = t;
  render();
}

/** Keep the floating control bar in step with the main slider and Play button. */
function syncDock() {
  const a = $("angle"), d = $("dock-angle");
  [d.min, d.max, d.step] = [a.min, a.max, a.step];
  d.value = a.value;
  $("dock-label").textContent = $("angle-label").textContent;
  $("dock-out").textContent = $("angle-out").textContent;
  $("dock-play").textContent = $("play").textContent;
  $("dock-play").hidden = $("play").hidden;
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
    ? [...ex.fingers.order.map((id) => [`fi-${id}`, ex.fingers.labels[id]]), ["dash", "Comparison (dashed)"]]
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
  renderChart($("torque-chart"), { onScrub: scrubAngle,
    xRange: chartRange(), series: torque, bands, marker: state.angle, yMin: Math.min(0, ...all), xUnit: unit,
    xLabel: ex.angleLabel, yLabel: "Torque per leg / arm (Nm)", yFormat: (x) => x.toFixed(0),
  });
  const effort = [...(cmp ? series(cmp, "effort", "dash", 100) : []), ...series(main, "effort", "", 100)];
  renderChart($("effort-chart"), { onScrub: scrubAngle,
    xRange: chartRange(), yMax: Math.max(100, ...effort.flatMap((s) => s.points.map((p) => p[1]))), xUnit: unit,
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

/** Edge lift: the four-finger table (shares, postures, tendons, pulleys, effort). */
function renderFingerSet(set) {
  $("finger-set").hidden = !set;
  if (!set) return;
  const pct = (x) => `${Math.round(x * 100)}%`;
  $("finger-table").tBodies[0].replaceChildren(...set.fingers.map((f) => {
    const tr = document.createElement("tr");
    const cells = f.touches
      ? [f.label, pct(f.share), `${Math.round(f.pose.mcpDeg)}° / ${Math.round(f.pose.pipDeg)}° / ${Math.round(f.pose.dipDeg)}°${f.pose.cmcDeg ? ` (cupped ${Math.round(f.pose.cmcDeg)}°)` : ""}`,
        `${f.res.tendons.fdp.toFixed(0)} / ${f.res.tendons.fds.toFixed(0)} N`, `${pct(f.res.pulleys.a2Share)} / ${pct(f.res.pulleys.a4Share)}`, pct(f.effort)]
      : [f.label, "—", "doesn't reach the edge", "", "", ""];
    cells.forEach((t, i) => {
      const td = document.createElement(i ? "td" : "th");
      td.textContent = t;
      if (i === 0) td.scope = "row";
      if (i === 5 && f.effort > 1) td.className = "over";
      tr.append(td);
    });
    return tr;
  }));
}

const EDGE_VIEWS = {
  fingers: { label: "The four fingers on the edge, side view: tendons, pulleys and each finger's share of the block", hint: "Each finger in its own posture on the edge (wrist straight above its pad). Tendons drawn thicker the harder they pull (FDP purple, FDS blue); pulleys coloured from green to red by their share of the cadaver breaking load; arrows: each finger's share of the block." },
  hand: { label: "The hand from the front on the edge: each finger's share, the hand's tilt and the wrist's sideways load", hint: "Palm towards you, index finger on the left. Under each finger: its share of the block (arrow) and its effort; dashed = off the edge. The edge's shape under each finger follows the bars in the controls; the curved arrow at the wrist is its sideways load." },
  arm: { label: "The arm holding the block, from the front and from the side, with shoulder and elbow loads", hint: "As taught: the straight arm rests on the front of the hip and the block hangs between the legs, so the shoulder and elbow are only pulled. Turned out or forward from there (sliders), the block acts on a lever at the shoulder and elbow (joints coloured by effort)." },
};

/** Edge lift: summary strip, the selected view (fingers, hand, arm), tables and per-finger charts. */
function renderFinger() {
  const ex = state.exercise;
  const v = variant();
  // Play: the force on the hand at this moment of the lift (Newton: m·(g + a) off the floor).
  const lift = liftProfile(state.loadKg, { liftTime: state.placement?.liftTime ?? 0.6 });
  const now = state.liftT == null ? null : lift.at(state.liftT);
  const effKg = now ? Math.max(1e-6, now.F / 9.81) : state.loadKg;
  const r = analyzeEdge(ex, v, state.angle, { ...opts(v), loadKg: effKg });
  const act = muscleActivation(ex, v, r, state.angle);
  const { main, cmp } = curves();
  const set = r.set;
  const P = r.P;

  // Summary strip
  const card = (label, value, tone) => {
    const d = Object.assign(document.createElement("div"), { className: `es-card${tone ? ` ${tone}` : ""}` });
    d.append(Object.assign(document.createElement("span"), { className: "es-label", textContent: label }), Object.assign(document.createElement("strong"), { textContent: value }));
    return d;
  };
  const armPeak = r.arm ? Math.max(r.arm.effort.shoulderForward, r.arm.effort.shoulderSide, r.arm.effort.elbow) : 0;
  $("edge-summary").replaceChildren(
    card("Block", `${state.loadKg} kg`),
    ...(now ? [card(`Now: ${now.phase.toLowerCase()}`, `${Math.round(now.F)} N · ${(now.F / lift.mg).toFixed(2)}×`, now.F > lift.mg * 1.02 ? "warn" : "")] : []),
    card("Max block", Number.isFinite(r.maxBlockKg) && effKg > 0.01 ? `≈ ${Math.round(r.maxBlockKg)} kg` : "—"),
    card("Hardest finger", r.peak ? `${r.peak.label} ${Math.round(r.peak.effort * 100)}%` : "—", r.peak?.effort > 1 ? "over" : ""),
    card("Highest pulley", r.pulleyPeak ? `${r.pulleyPeak.finger.label} ${r.pulleyPeak.pulley} ${Math.round(r.pulleyPeak.share * 100)}%` : "—", r.pulleyPeak?.share > 0.6 ? "warn" : ""),
    card("Wrist sideways", `${Math.abs(set.wristSide).toFixed(1)} Nm`),
    card("Shoulder / elbow", `${Math.round(armPeak * 100)}%`, armPeak > 1 ? "over" : ""),
  );

  // View tabs and the figure
  const view = EDGE_VIEWS[state.edgeView] ? state.edgeView : "fingers";
  for (const b of document.querySelectorAll("[data-edge-view]")) b.setAttribute("aria-selected", String(b.dataset.edgeView === view));
  $("figure").setAttribute("aria-label", EDGE_VIEWS[view].label);
  $("edge-view-hint").textContent = EDGE_VIEWS[view].hint;
  $("figure-title").textContent = { fingers: "Fingers, side view", hand: "Hand, front view", arm: "Arm and body" }[view];
  if (view === "fingers") renderFingersView($("figure"), { set, exercise: ex, P, pipDeg: state.angle });
  else if (view === "hand") renderHandView($("figure"), { set, P });
  else renderArmView($("figure"), { arm: r.arm, P, loadKg: state.loadKg });

  // Tables: per finger (fingers and hand views), the arm's joints (arm view).
  renderFingerSet(view === "arm" ? null : set);
  $("joint-table").hidden = view !== "arm" || !r.arm;
  if (r.arm) {
    const head = $("joint-table").tHead.rows[0].cells;
    [head[0].textContent, head[1].textContent, head[2].textContent, head[3].textContent] = ["Joint", "Load", "", "Effort"];
    const rows = [
      ["Pull along the arm", `${r.arm.traction.toFixed(0)} N`, null],
      ["Shoulder, forward", `${r.arm.shoulderForward.toFixed(1)} Nm`, r.arm.effort.shoulderForward],
      ["Shoulder, sideways", `${r.arm.shoulderSide.toFixed(1)} Nm`, r.arm.effort.shoulderSide],
      ["Elbow (kept straight)", `${r.arm.elbow.toFixed(1)} Nm`, r.arm.effort.elbow],
    ];
    $("joint-table").tBodies[0].replaceChildren(...rows.map(([name, load, effort]) => {
      const tr = document.createElement("tr");
      [name, load, "", effort == null ? "" : `${Math.round(effort * 100)}%`].forEach((t, i) => {
        const td = document.createElement(i ? "td" : "th");
        td.textContent = t;
        if (i === 0) { td.scope = "row"; td.className = "jt-f-arm"; }
        if (i === 3 && effort > 1) td.className = "over";
        tr.append(td);
      });
      return tr;
    }));
  }
  document.querySelector(".edge-bars")?.refresh?.();

  // Charts: FDP tension and A2 load per finger over the hold position.
  const bands = ex.phases.map((p) => ({ from: p.range[0], to: p.range[1], label: p.name }));
  const perFinger = (samples, get, dash) => ex.fingers.order.map((id) => ({ points: samples.map((s) => [s.angle, get(s.fingers[id])]), className: `fi-${id}${dash ? " dash" : ""}` }));
  renderChart($("torque-chart"), { onScrub: scrubAngle,
    xRange: chartRange(), series: [...(cmp ? perFinger(cmp, (f) => f.fdp, true) : []), ...perFinger(main, (f) => f.fdp)], bands, marker: state.angle,
    xLabel: ex.angleLabel, yLabel: "FDP tension (N)", yFormat: (x) => x.toFixed(0),
  });
  renderChart($("effort-chart"), { onScrub: scrubAngle,
    xRange: chartRange(), series: [...(cmp ? perFinger(cmp, (f) => f.a2 * 100, true) : []), ...perFinger(main, (f) => f.a2 * 100)], bands, marker: state.angle,
    xLabel: ex.angleLabel, yLabel: "A2 load (% of breaking)", yFormat: (x) => `${x.toFixed(0)}%`,
  });
  $("angle-out").textContent = `${state.angle.toFixed(0)}°`;
  // The lift over time, with where Play is now (or the middle of the hold when paused).
  const ts = [];
  for (let t = 0; t <= lift.duration + 1e-9; t += 0.02) ts.push([t, lift.at(Math.min(t, lift.duration - 1e-6)).F]);
  renderChart($("lift-chart"), { onScrub: scrubLift,
    xRange: [0, lift.duration], xUnit: " s", xStep: 1, bands: lift.bands, marker: state.liftT ?? lift.holdAt,
    series: [{ points: ts, className: "fi-middle" }, { points: [[0, lift.mg], [lift.duration, lift.mg]], className: "cap lift-weight" }],
    yMax: lift.peakF * 1.15, xLabel: "Time (s)", yLabel: "Force on the hand (N)", yFormat: (x) => x.toFixed(0),
  });

  // Notes under the figure
  $("ro-warning").hidden = !(r.peak?.effort > 1);
  $("ro-warning").textContent = `More than the ${r.peak?.label.toLowerCase()} finger's typical maximum: the grip would open here.`;
  const info = [];
  const turns = [];
  if (Math.abs(set.deviationDeg) >= 1) turns.push(`tilts ${Math.abs(set.deviationDeg).toFixed(0)}° towards the ${set.deviationDeg > 0 ? "little finger" : "thumb"} (wrist deviation or the arm leaning)`);
  if (Math.abs(set.rollDeg) >= 1) turns.push(`rolls ${Math.abs(set.rollDeg).toFixed(0)}° about its long axis (forearm rotation)`);
  if (turns.length) info.push({ text: `To bring the fingers onto the edge the hand ${turns.join(" and ")}.` });
  if (Math.abs(set.wristSide) > 0.05) info.push({ text: `The load centre sits ${Math.abs(set.loadCentre * 1000).toFixed(0)} mm towards the ${set.wristSide > 0 ? "thumb" : "little-finger"} side of the wrist: the wrist holds ${Math.abs(set.wristSide).toFixed(1)} Nm sideways.` });
  const fit = set.ideal;
  if (fit) info.push({ text: `An edge that fits ${state.hand ? "your" : "a typical"} hand in this grip exactly sits, compared with under the middle finger, ${["index", "ring", "little"].map((id) => `${id} ${fit[id].lift >= 0 ? "+" : "−"}${Math.abs(fit[id].lift * 1000).toFixed(1)} mm`).join(", ")} (+ = closer to the knuckles).` });
  if (Number.isFinite(r.maxBlockKg)) info.push({ text: `Max block: the load at which the hardest-working finger reaches its typical maximum while holding, with this grip, split and strength. Lifting off and setting down briefly asks up to ${(lift.peakF / lift.mg).toFixed(2)}× more (Play).` });
  $("ro-limb").hidden = false;
  $("ro-limb").replaceChildren(...info.map((i) => Object.assign(document.createElement("span"), { textContent: `${i.text} `, className: i.warn ? "warn" : "" })));
  renderPhase(ex);
  renderMuscles(act);
}

function render() {
  renderView();
  syncDock();
}
function renderView() {
  if (isFinger()) return renderFinger();
  if (isMulti()) return renderMulti();
  const ex = state.exercise;
  const v = variant();
  const r = analyze(ex, v, state.angle, opts(v));
  const act = muscleActivation(ex, v, r, state.angle);
  const { main, cmp, bounds } = curves();

  const frame = state.zoom ? zoomBounds(ex, v, main.map((s) => s.pose)) : bounds;
  renderFigure($("figure"), { exercise: ex, variant: v, result: r, activation: act, pulley: state.pulley, bounds: frame });

  const bands = ex.phases.map((p) => ({ from: p.range[0], to: p.range[1], label: p.name }));
  const strength = main.map((s) => [s.angle, s.capacity]);
  const torqueSeries = [
    { points: strength, className: "strength" },
    ...(cmp ? [{ points: cmp.map((s) => [s.angle, Math.max(0, s.jointTorque)]), className: "compare" }] : []),
    { points: main.map((s) => [s.angle, Math.max(0, s.jointTorque)]), className: "primary" },
  ];
  renderChart($("torque-chart"), { onScrub: scrubAngle,
    xRange: chartRange(), series: torqueSeries, bands, marker: state.angle,
    xLabel: ex.angleLabel, yLabel: "Torque (Nm)", yFormat: (v) => v.toFixed(0),
  });
  const effortSeries = [
    ...(cmp ? [{ points: cmp.map((s) => [s.angle, s.effort * 100]), className: "compare" }] : []),
    { points: main.map((s) => [s.angle, s.effort * 100]), className: "primary" },
  ];
  renderChart($("effort-chart"), { onScrub: scrubAngle,
    xRange: chartRange(), yMax: Math.max(100, ...effortSeries.flatMap((s) => s.points.map((p) => p[1]))),
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
  if (state.exercise.model === "finger") { // edge lift: time through one lift, looping
    state.liftT = (state.liftT ?? 0) + dt;
    render();
    requestAnimationFrame(tick);
    return;
  }
  const [lo, hi] = rangeOf(state.exercise, variant());
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
  $("play").textContent = on ? "Pause" : state.exercise?.model === "finger" ? "Play a lift" : "Play";
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
  $("zoom-toggle").addEventListener("click", () => { setZoom(!state.zoom); render(); });
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
  // Theme: Auto follows the system; Light/Dark override it (remembered in this browser if allowed).
  const themeButtons = [...document.querySelectorAll("[data-theme-set]")];
  const showTheme = () => { const t = document.documentElement.dataset.theme ?? "auto"; for (const b of themeButtons) b.setAttribute("aria-pressed", String(b.dataset.themeSet === t)); };
  for (const b of themeButtons) b.addEventListener("click", () => {
    const t = b.dataset.themeSet;
    if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { if (t === "auto") localStorage.removeItem("theme"); else localStorage.setItem("theme", t); } catch (e) { /* storage blocked: the choice lasts for this page */ }
    showTheme();
  });
  showTheme();
  for (const b of document.querySelectorAll("[data-edge-view]")) b.addEventListener("click", () => { state.edgeView = b.dataset.edgeView; render(); });
// Info buttons: the explanation floats next to the button on hover or keyboard focus; a tap
  // (touch screens) pins it open until the next tap anywhere.
  for (const b of document.querySelectorAll(".info-btn")) b.addEventListener("click", (e) => {
    e.preventDefault(); // inside a <label>: don't move focus to the slider
    e.stopPropagation();
    const open = b.getAttribute("aria-expanded") !== "true";
    for (const o of document.querySelectorAll(".info-btn")) o.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", () => { for (const o of document.querySelectorAll(".info-btn")) o.setAttribute("aria-expanded", "false"); });
  // Floating control bar: appears once the main slider has scrolled off the top of the screen.
  $("dock-angle").addEventListener("input", (e) => { $("angle").value = e.target.value; $("angle").dispatchEvent(new Event("input")); });
  $("dock-play").addEventListener("click", () => $("play").click());
  new IntersectionObserver(([e]) => {
    $("dock").hidden = e.isIntersecting || e.boundingClientRect.top > 0;
    document.body.classList.toggle("dock-on", !$("dock").hidden);
  }).observe(document.querySelector(".angle-row"));

  // Foldable sections: open on wide screens, folded on narrow ones (or with the stacked layout);
  // a choice made here is kept while the page is open.
  const narrow = () => document.documentElement.dataset.layout === "stacked" || (document.documentElement.dataset.layout !== "side" && matchMedia("(max-width: 899px)").matches);
  const folds = [...document.querySelectorAll("[data-fold]")];
  const chosen = {};
  for (const box of folds) {
    let head = box.querySelector(":scope > h3, :scope > h4");
    if (!head) {
      head = Object.assign(document.createElement("h4"), { textContent: box.dataset.foldLabel ?? "" });
      box.prepend(head);
    }
    head.classList.add("fold-head");
    const btn = Object.assign(document.createElement("button"), { type: "button", className: "fold-toggle" });
    btn.append(...head.childNodes);
    head.append(btn);
    btn.addEventListener("click", () => { chosen[box.dataset.fold] = !box.classList.contains("folded"); applyFold(box); });
  }
  const applyFold = (box) => {
    const shut = chosen[box.dataset.fold] ?? narrow();
    box.classList.toggle("folded", shut);
    box.querySelector(".fold-toggle").setAttribute("aria-expanded", String(!shut));
  };
  const applyFolds = () => folds.forEach(applyFold);
  applyFolds();
  matchMedia("(max-width: 899px)").addEventListener("change", applyFolds);

  // Layout: Auto (figure beside the curves on wide screens), side by side, or stacked.
  const layoutButtons = [...document.querySelectorAll("[data-layout-set]")];
  const showLayout = () => { const l = document.documentElement.dataset.layout ?? "auto"; for (const b of layoutButtons) b.setAttribute("aria-pressed", String(b.dataset.layoutSet === l)); };
  for (const b of layoutButtons) b.addEventListener("click", () => {
    const l = b.dataset.layoutSet;
    if (l === "auto") delete document.documentElement.dataset.layout; else document.documentElement.dataset.layout = l;
    try { if (l === "auto") localStorage.removeItem("layout"); else localStorage.setItem("layout", l); } catch (e) { /* storage blocked */ }
    showLayout(); applyFolds(); render();
  });
  showLayout();
  $("hand-reset").addEventListener("click", () => { setHand(undefined); writeHash(); render(); });
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
