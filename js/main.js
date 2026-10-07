import { analyze, sampleCurve } from "./physics.js";
import { muscleActivation } from "./muscles.js";
import { renderChart } from "./chart.js";
import { renderFigure } from "./figure.js";
import { fetchExercise, descriptionParagraphs, bodyBackground, muscleOverlay } from "./wger.js";

const EXERCISES = ["biceps-curl", "lateral-raise"];
const $ = (id) => document.getElementById(id);

const state = {
  catalog: {},
  exercise: null,
  variantId: null,
  compareId: "",
  loadKg: 10,
  peakTorqueNm: 60,
  angle: 90,
  pulley: null,
  playing: false,
  direction: 1,
};

const variant = (id = state.variantId) => state.exercise.variants.find((v) => v.id === id);
const opts = (v) => ({
  loadKg: state.loadKg,
  peakTorqueNm: state.peakTorqueNm,
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
  if (variant().load.type === "cable") {
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

function setVariant(id, pulley) {
  state.variantId = id;
  const v = variant();
  state.pulley = v.load.type === "cable" ? { ...(pulley ?? v.load.pulley) } : null;
  $("variant").value = id;
  $("pulley-controls").hidden = v.load.type !== "cable";
  if (state.pulley) {
    $("pulley-x").value = state.pulley.x;
    $("pulley-y").value = state.pulley.y;
  }
  $("variant-notes").textContent = v.notes;
  $("variant-equipment").textContent = v.equipment;
}

function buildBodyMap() {
  const box = $("bodymap");
  box.replaceChildren();
  const bg = new Image();
  bg.src = bodyBackground(true);
  bg.alt = "Front view of the human muscular system";
  box.appendChild(bg);
  for (const m of state.exercise.muscles.filter((x) => x.wgerId)) {
    const img = new Image();
    img.src = muscleOverlay(m.wgerId);
    img.alt = "";
    img.dataset.muscle = m.id;
    img.className = "overlay";
    box.appendChild(img);
  }
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
  const front = ex.view === "front";
  $("exercise").value = id;
  $("exercise-name").textContent = ex.name;
  $("angle-note").textContent = ex.angleNote;
  $("angle-label").textContent = ex.angleLabel;
  $("strength-label").textContent = `Strength (peak ${ex.joint.toLowerCase()} torque)`;
  $("figure-title").textContent = front ? "Front view" : "Side view";
  $("pulley-x-label").textContent = front ? "Pulley side to side" : "Pulley forward / back";
  fillSelect($("variant"), ex.variants);
  fillSelect($("compare"), ex.variants, true);

  state.loadKg = h.load ?? ex.defaults.loadKg;
  state.peakTorqueNm = ex.defaults.peakTorqueNm;
  $("load").value = state.loadKg; $("load-out").textContent = `${state.loadKg} kg`;
  $("strength").value = state.peakTorqueNm; $("strength-out").textContent = `${state.peakTorqueNm} Nm`;
  const [lo, hi] = ex.angleRange;
  state.angle = Math.min(hi, Math.max(lo, state.angle));
  $("angle").min = lo; $("angle").max = hi; $("angle").value = state.angle;

  const vId = ex.variants.some((v) => v.id === h.variant) ? h.variant : ex.defaults.variant;
  setVariant(vId, h.px != null && h.py != null ? { x: h.px, y: h.py } : undefined);
  state.compareId = ex.variants.some((v) => v.id === h.compare) ? h.compare : "";
  $("compare").value = state.compareId;

  $("muscle-list").replaceChildren();
  buildBodyMap();
  loadWger();
}

// ---------- render ----------
let curveCache = null;
function curves() {
  const key = JSON.stringify([state.exercise.id, state.variantId, state.compareId, state.loadKg, state.peakTorqueNm, state.pulley]);
  if (curveCache?.key === key) return curveCache;
  const ex = state.exercise;
  const main = sampleCurve(ex, variant(), opts(variant()));
  const cmp = state.compareId ? sampleCurve(ex, variant(state.compareId), opts(variant(state.compareId))) : null;
  curveCache = { key, main, cmp };
  return curveCache;
}

function phaseAt(angle) {
  return state.exercise.phases.find((p) => angle >= p.range[0] && angle <= p.range[1]) ?? state.exercise.phases.at(-1);
}

function render() {
  const ex = state.exercise;
  const v = variant();
  const r = analyze(ex, v, state.angle, opts(v));
  const act = muscleActivation(ex, v, r, state.angle);
  const { main, cmp } = curves();

  renderFigure($("figure"), { exercise: ex, variant: v, result: r, activation: act, pulley: state.pulley });

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
  $("ro-arm").textContent = `${Math.abs(r.momentArm * 100).toFixed(1)} cm`;
  $("ro-effort").textContent = `${(r.effort * 100).toFixed(0)}%`;
  $("ro-effort").classList.toggle("over", r.effort > 1);
  $("ro-warning").hidden = !(r.effort > 1);
  const ph = phaseAt(state.angle);
  $("phase-name").textContent = state.playing ? `${ph.name} · ${state.direction > 0 ? "concentric (lifting)" : "eccentric (lowering)"}` : ph.name;
  $("phase-text").textContent = ph.text;

  // Muscles: bars + wger body map overlays
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
    li.querySelector(".m-val").textContent = `${Math.round(m.value * 100)}%`;
    li.querySelector(".bar span").style.width = `${m.value * 100}%`;
  });
  for (const img of $("bodymap").querySelectorAll("img.overlay")) {
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
  $("strength").addEventListener("input", (e) => { state.peakTorqueNm = +e.target.value; $("strength-out").textContent = `${state.peakTorqueNm} Nm`; render(); });
  $("angle").addEventListener("input", (e) => { setPlaying(false); state.angle = +e.target.value; render(); });
  $("play").addEventListener("click", () => setPlaying(!state.playing));
  for (const axis of ["x", "y"]) {
    $(`pulley-${axis}`).addEventListener("input", (e) => { state.pulley[axis] = +e.target.value; writeHash(); render(); });
  }
  $("pulley-reset").addEventListener("click", () => { setVariant(state.variantId); writeHash(); render(); });
}

async function init() {
  const h = readHash();
  const all = await Promise.all(EXERCISES.map(loadExercise));
  for (const ex of all) state.catalog[ex.id] = ex;
  fillSelect($("exercise"), all);
  setExercise(EXERCISES.includes(h.ex) ? h.ex : EXERCISES[0], h);
  bind();
  addEventListener("resize", () => { if (!state.playing) render(); });
  render();
}

init();
