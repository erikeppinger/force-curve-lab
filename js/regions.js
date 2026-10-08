// Detail view: schematic close-ups of one body region (data/regions/*.json), each muscle
// coloured by its own estimated activation. Complements the coarse wger overview map.
//
// A region view lists muscles in two forms (SVG px):
// - spindles: a belly from `from` towards `to`, filling the `belly` fraction [t0, t1] of that
//   line with maximum width `w`, bowed sideways by `bend` px; thin tendons join the ends, and
//   `tendons` fan out from `to` (e.g. to the fingers). The abbreviation sits along the belly at
//   `labelAt` (fraction of the line; default mid-belly).
// - outlines: fan-shaped muscles (deltoid, pectoralis, latissimus) as an SVG path `d`, with the
//   abbreviation at `label` [x, y], turned by `labelAngle` degrees.
//
// An exercise muscle joins a close-up with `region` and draws on the paths in `regionPath`
// (one id or a list; default its own id). A muscle that covers several drawn muscles (e.g.
// "quadriceps" → four heads) colours each with the group's value and hatches it: the model
// doesn't resolve the heads.

const NS = "http://www.w3.org/2000/svg";
const cache = new Map();

export async function loadRegion(id) {
  if (!cache.has(id)) cache.set(id, fetch(`data/regions/${id}.json`).then((r) => r.json()));
  return cache.get(id);
}

/** Drawn muscle ids an exercise muscle colours. */
export const pathsOf = (m) => [m.regionPath ?? m.id].flat();

/** Region ids used by an exercise's muscles, in order of first use. */
export const regionsOf = (exercise) => [...new Set(exercise.muscles.map((m) => m.region).filter(Boolean))];

/** The views of a region that show at least one of the exercise's muscles. */
export function viewsFor(region, exercise) {
  const ids = new Set(exercise.muscles.filter((m) => m.region === region.id).flatMap(pathsOf));
  return region.views.filter((v) => v.muscles.some((m) => ids.has(m.id)));
}

/**
 * Drawn muscle id → { value, group, muscleId } from the activation list. value: 0–1, or null
 * (involved but not modelled); group: the exercise muscle's name when it covers several drawn
 * muscles. Two exercise muscles on the same drawing: the larger value wins.
 */
export function regionValues(activation) {
  const out = new Map();
  for (const m of activation.filter((x) => x.region)) {
    const paths = pathsOf(m);
    for (const p of paths) {
      const prev = out.get(p);
      if (prev && (m.value ?? -1) <= (prev.value ?? -1)) continue;
      out.set(p, { value: m.value, group: paths.length > 1 ? m.name : null, muscleId: m.id });
    }
  }
  return out;
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

/** Label position and angle (degrees, never upside down) of a drawn muscle. */
function labelOf(m) {
  if (m.d) return { at: m.label, deg: m.labelAngle ?? 0 };
  const t = m.labelAt ?? (m.belly[0] + m.belly[1]) / 2;
  const at = [m.from[0] + (m.to[0] - m.from[0]) * t, m.from[1] + (m.to[1] - m.from[1]) * t];
  let deg = (Math.atan2(m.to[1] - m.from[1], m.to[0] - m.from[0]) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return { at, deg };
}

/** Draw one view into `svg`. `values`: from regionValues(); absent = not part of this exercise. */
export function renderRegionView(svg, region, view, values, onPick) {
  const [x0, y0, w0, h0] = view.viewBox ?? region.viewBox;
  svg.setAttribute("viewBox", `${x0} ${y0} ${w0} ${h0}`);
  svg.replaceChildren();
  const defs = el("defs", {}, svg);
  const hatch = `hatch-${region.id}-${view.id}`;
  const pat = el("pattern", { id: hatch, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "hatch-line" }, pat);

  for (const d of view.outline) el("path", { d, class: "region-outline" }, svg);
  for (const [a, b, w] of view.bones ?? []) el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "stroke-width": w, class: "region-bone" }, svg);

  for (const m of view.muscles) {
    const info = region.muscles[m.id];
    const hit = values.get(m.id);
    const has = Boolean(hit);
    const v = hit?.value;
    const g = el("g", { class: `region-muscle${has ? " involved" : ""}`, "data-muscle": m.id, tabindex: has ? 0 : -1 }, svg);
    let d = m.d;
    if (!d) {
      const at = (t) => [m.from[0] + (m.to[0] - m.from[0]) * t, m.from[1] + (m.to[1] - m.from[1]) * t];
      const tendon = (a, b) => el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "region-tendon" }, g);
      if (m.belly[0] > 0) tendon(m.from, at(m.belly[0]));
      if (m.belly[1] < 1) tendon(at(m.belly[1]), m.to);
      for (const t of m.tendons ?? []) tendon(m.to, t);
      d = bellyPath(m);
    }
    el("path", { d, class: "region-belly-base" }, g);
    if (has && v != null) el("path", { d, class: "region-belly-on", "fill-opacity": (0.1 + 0.9 * v).toFixed(3) }, g);
    if (has && (v == null || hit.group)) el("path", { d, class: "region-belly-hatch", fill: `url(#${hatch})` }, g);
    const { at, deg } = labelOf(m);
    el("text", { x: at[0], y: at[1], class: "region-label", "text-anchor": "middle", "dominant-baseline": "central", transform: `rotate(${deg.toFixed(1)} ${at[0]} ${at[1]})` }, g).textContent = info.abbr;
    const state = !has ? "not part of this exercise"
      : v == null ? "involved, not resolved by the model"
      : hit.group ? `${Math.round(v * 100)}% for the whole ${hit.group.toLowerCase()} group (the model doesn't split it)`
      : `${Math.round(v * 100)}%`;
    el("title", {}, g).textContent = `${info.name}: ${state}. ${info.action}.`;
    if (has && onPick) {
      g.addEventListener("click", () => onPick(hit.muscleId));
      g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && onPick(hit.muscleId));
    }
  }
}
