// Detail view: schematic close-ups of one body region (data/regions/*.json), each muscle
// coloured by its own estimated activation. Complements the coarse wger overview map.
//
// A region view lists muscles as bellies from `from` towards `to` (SVG px): the belly fills
// the `belly` fraction [t0, t1] of that line with maximum width `w`, bowed sideways by
// `bend` px; thin tendons join the ends, and `tendons` fan out from `to` (e.g. to the fingers).
// The abbreviation sits along the belly at `labelAt` (fraction of the line; default mid-belly).

const NS = "http://www.w3.org/2000/svg";
const cache = new Map();

export async function loadRegion(id) {
  if (!cache.has(id)) cache.set(id, fetch(`data/regions/${id}.json`).then((r) => r.json()));
  return cache.get(id);
}

/** Region ids used by an exercise's muscles, in order of first use. */
export const regionsOf = (exercise) => [...new Set(exercise.muscles.map((m) => m.region).filter(Boolean))];

/** The views of a region that show at least one of the exercise's muscles. */
export function viewsFor(region, exercise) {
  const ids = new Set(exercise.muscles.filter((m) => m.region === region.id).map((m) => m.regionPath ?? m.id));
  return region.views.filter((v) => v.muscles.some((m) => ids.has(m.id)));
}

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/** Closed outline of a spindle-shaped belly (pure; exported for tests). */
export function bellyPath({ from, to, belly: [t0, t1], w, bend = 0 }, steps = 16) {
  const d = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(...d);
  const u = [d[0] / len, d[1] / len];
  const n = [-u[1], u[0]];
  const left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const t = t0 + (t1 - t0) * s;
    const half = (w / 2) * Math.sin(Math.PI * s) ** 0.75;
    const bow = bend * Math.sin(Math.PI * t);
    const c = [from[0] + d[0] * t + n[0] * bow, from[1] + d[1] * t + n[1] * bow];
    left.push([c[0] + n[0] * half, c[1] + n[1] * half]);
    right.push([c[0] - n[0] * half, c[1] - n[1] * half]);
  }
  const pts = [...left, ...right.reverse()];
  return `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L")} Z`;
}

/**
 * Draw one view into `svg`. `values`: Map muscle id → activation 0–1, null (involved but not
 * resolved by the model), or absent (not part of this exercise).
 */
export function renderRegionView(svg, region, view, values, onPick) {
  const [x0, y0, w0, h0] = region.viewBox;
  svg.setAttribute("viewBox", `${x0} ${y0} ${w0} ${h0}`);
  svg.replaceChildren();
  const defs = el("defs", {}, svg);
  const pat = el("pattern", { id: `hatch-${view.id}`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "hatch-line" }, pat);

  for (const d of view.outline) el("path", { d, class: "region-outline" }, svg);
  for (const [a, b, w] of view.bones ?? []) el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "stroke-width": w, class: "region-bone" }, svg);

  for (const m of view.muscles) {
    const info = region.muscles[m.id];
    const has = values.has(m.id);
    const v = values.get(m.id);
    const g = el("g", { class: `region-muscle${has ? " involved" : ""}`, "data-muscle": m.id, tabindex: has ? 0 : -1 }, svg);
    const at = (t) => [m.from[0] + (m.to[0] - m.from[0]) * t, m.from[1] + (m.to[1] - m.from[1]) * t];
    const tendon = (a, b) => el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "region-tendon" }, g);
    if (m.belly[0] > 0) tendon(m.from, at(m.belly[0]));
    if (m.belly[1] < 1) tendon(at(m.belly[1]), m.to);
    for (const t of m.tendons ?? []) tendon(m.to, t);
    const d = bellyPath(m);
    el("path", { d, class: "region-belly-base" }, g);
    if (has && v == null) el("path", { d, class: "region-belly-hatch", fill: `url(#hatch-${view.id})` }, g);
    else if (has) el("path", { d, class: "region-belly-on", "fill-opacity": (0.1 + 0.9 * v).toFixed(3) }, g);
    // Label along the belly (narrow muscles side by side stay readable), never upside down.
    const mid = at(m.labelAt ?? (m.belly[0] + m.belly[1]) / 2);
    let deg = (Math.atan2(m.to[1] - m.from[1], m.to[0] - m.from[0]) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
    el("text", { x: mid[0], y: mid[1], class: "region-label", "text-anchor": "middle", "dominant-baseline": "central", transform: `rotate(${deg.toFixed(1)} ${mid[0]} ${mid[1]})` }, g).textContent = info.abbr;
    const state = !has ? "not part of this exercise" : v == null ? "involved, not resolved by the model" : `${Math.round(v * 100)}%`;
    el("title", {}, g).textContent = `${info.name}: ${state}. ${info.action}.`;
    if (has && onPick) {
      g.addEventListener("click", () => onPick(m.id));
      g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && onPick(m.id));
    }
  }
}
