// "Sources and numbers" (expert mode): the curated numbers behind the current exercise, straight
// from its JSON: each joint's strength curve (measured points, peak torques, note and source) and
// each muscle's weights, variant modifiers and links, with their notes and sources. Text only.

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null && k !== false));
  return n;
};
const pct = (v) => `${Math.round(v * 100)}%`;
const num = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

/** A small table of [angle, value] points; with a peak torque, also the torque in Nm. */
function pointsTable(points, { angleLabel = "angle", peak, unit = "°" } = {}) {
  const t = el("table", { className: "num-table" });
  const head = el("tr", {}, el("th", { textContent: angleLabel }), el("th", { textContent: "share" }), peak ? el("th", { textContent: "torque" }) : null);
  t.append(el("thead", {}, head));
  const body = el("tbody");
  for (const [a, v] of points) body.append(el("tr", {}, el("td", { textContent: `${num(a)}${unit}` }), el("td", { textContent: pct(v) }), peak ? el("td", { textContent: `${num(v * peak)} Nm` }) : null));
  t.append(body);
  return t;
}

const noteAndSource = (o) => [o?.note ? el("p", { className: "num-note", textContent: o.note }) : null, o?.source ? el("p", { className: "num-source", textContent: `Source: ${o.source}` }) : null];

/** One strength item: name, peak(s), curve, note, source. */
function strengthItem({ name, action, peak, negative, strength, angleLabel }) {
  const box = el("details", { className: "num-item" });
  const peaks = [peak != null ? `${action ?? "peak"}: ${num(peak)} Nm` : null, negative?.peakTorqueNm != null ? `${negative.action ?? "opposite"}: ${num(negative.peakTorqueNm)} Nm` : null].filter(Boolean).join(" · ");
  box.append(el("summary", {}, el("strong", { textContent: name }), peaks ? ` — ${peaks}` : ""));
  if (strength?.points) box.append(pointsTable(strength.points, { angleLabel: angleLabel ?? "angle", peak }));
  box.append(...noteAndSource(strength));
  if (negative?.points) {
    box.append(el("p", { className: "num-sub", textContent: `${negative.action ?? "Opposite direction"}:` }), pointsTable(negative.points, { angleLabel: angleLabel ?? "angle", peak: negative.peakTorqueNm }));
    box.append(...noteAndSource(negative));
  } else if (negative?.note) box.append(...noteAndSource(negative));
  return box;
}

/** Fill `box` with the exercise's numbers; `variant` is the selected one, `peakTorqueNm` the current single-joint peak. */
export function renderNumbers(box, ex, variant, { peakTorqueNm } = {}) {
  const parts = [];
  // Strength.
  const strength = [];
  if (ex.joints) for (const j of ex.joints) if (j.strength) strength.push(strengthItem({ name: j.name, action: j.action, peak: j.peakTorqueNm, negative: j.negative, strength: j.strength, angleLabel: j.angleLabel }));
  if (ex.strengthCurve) strength.push(strengthItem({ name: ex.strengthCurve.label ?? "Strength", action: "peak", peak: peakTorqueNm ?? ex.defaults?.peakTorqueNm, strength: ex.strengthCurve, angleLabel: ex.angleLabel }));
  if (strength.length) parts.push(el("h4", { textContent: "Strength curves" }), ...strength);
  // Corrections of the selected variant (posture, grip).
  const corr = [];
  if (variant?.strengthScale) corr.push(el("details", { className: "num-item" }, el("summary", {}, el("strong", { textContent: "Strength in this posture" }), variant.strengthScale.factor != null ? ` — × ${variant.strengthScale.factor}` : ""),
    variant.strengthScale.points ? pointsTable(variant.strengthScale.points, { angleLabel: variant.strengthScale.by ?? "angle" }) : null, ...noteAndSource(variant.strengthScale)));
  for (const [id, s] of Object.entries({ ...(ex.jointScale ?? {}), ...(variant?.jointScale ?? {}) })) {
    corr.push(el("details", { className: "num-item" }, el("summary", {}, el("strong", { textContent: `${ex.joints?.find((j) => j.id === id)?.name ?? id}: correction` }), s.factor != null ? ` — × ${s.factor}` : s.by ? ` — by ${s.by}` : ""),
      s.points ? pointsTable(s.points, { angleLabel: s.by ?? "angle" }) : null, ...noteAndSource(s)));
  }
  if (ex.placementStrength) corr.push(el("details", { className: "num-item" }, el("summary", {}, el("strong", { textContent: `Set-up: ${ex.placementStrength.key}` }), ` — ${Object.entries(ex.placementStrength.values ?? {}).map(([k, v]) => `${k} × ${v}`).join(", ")}`), ...noteAndSource(ex.placementStrength)));
  if (corr.length) parts.push(el("h4", { textContent: `Corrections (${variant?.name ?? "this variant"})` }), ...corr);
  // Muscles.
  const mus = [];
  for (const m of ex.muscles ?? []) {
    const how = [];
    if (m.driver === "none") how.push("not modelled");
    if (m.joints || m.joint) how.push(`follows ${(m.joints ?? [m.joint]).map((j) => (m.jointScale?.[j] ? `${j} × ${m.jointScale[j]}` : j)).join(", ")}`);
    if (m.sign || m.jointSign) how.push(m.jointSign ? `direction: ${Object.entries(m.jointSign).map(([j, s]) => `${j} ${s > 0 ? "+" : "−"}`).join(", ")}` : `only ${m.sign > 0 ? "positive" : "negative"} torque`);
    if (m.coContract) how.push(`co-contracts against ${m.coContract.with} at the ${m.coContract.joint} (share ${m.coContract.share ?? 1})`);
    const mods = (ex.variants ?? []).filter((v) => v.muscleModifiers?.[m.id] != null).map((v) => `${v.name}: × ${v.muscleModifiers[m.id]}`);
    const item = el("details", { className: "num-item" }, el("summary", {}, el("strong", { textContent: m.name }), how.length ? ` — ${how.join("; ")}` : ""));
    if (Array.isArray(m.weight)) item.append(el("p", { className: "num-sub", textContent: "Weight (share of the joint's effort) by angle:" }), pointsTable(m.weight, { angleLabel: m.joint ?? "angle" }));
    if (mods.length) item.append(el("p", { className: "num-sub", textContent: `Variant modifiers: ${mods.join(" · ")}` }));
    if (m.placementFactor) item.append(el("p", { className: "num-sub", textContent: `Set-up factor (${m.placementFactor.key}): ${m.placementFactor.values ? Object.entries(m.placementFactor.values).map(([k, v]) => `${k} × ${v}`).join(", ") : (m.placementFactor.points ?? []).map(([a, v]) => `${a}: × ${v}`).join(", ")}` }));
    item.append(...noteAndSource(m));
    mus.push(item);
  }
  if (ex.weightsNote || ex.weightsSource) mus.unshift(...noteAndSource({ note: ex.weightsNote, source: ex.weightsSource }));
  if (mus.length) parts.push(el("h4", { textContent: "Muscle shares" }), ...mus);
  box.replaceChildren(...(parts.length ? parts : [el("p", { textContent: "This exercise's numbers are on its model page (How the model works)." })]));
}
