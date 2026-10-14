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
  // Machine cams: each shape on offer (effective radius = joint torque per unit of stack weight).
  const cams = variant?.load?.camProfiles ?? (variant?.load?.camProfile ? [variant.load.camProfile] : []);
  if (cams.length) {
    parts.push(el("h4", { textContent: `Machine cam shapes (${variant.name})` }), ...cams.map((c) => {
      const t = el("table", { className: "num-table" }, el("thead", {}, el("tr", {}, el("th", { textContent: "angle" }), el("th", { textContent: "effective radius" }))),
        el("tbody", {}, ...c.points.map(([a, m]) => el("tr", {}, el("td", { textContent: `${num(a)}°` }), el("td", { textContent: `${num(m * 100, 1)} cm` })))));
      return el("details", { className: "num-item" }, el("summary", {}, el("strong", { textContent: c.label ?? "Cam" })), t, ...noteAndSource(c));
    }));
  }
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

// ---------- expert mode, in place: the numbers next to the controls, curves and muscles ----------

/** The papers a source text cites (by the `match` text of data/references.json), in the order it names them. */
export function citedRefs(src, refs) {
  if (!src || !refs?.references) return [];
  // By the reference's match text, or its short key as written in running text ("Murray et al. 1995").
  const at = (r) => {
    const m = /^(.+) (\d{4})[a-z]?$/.exec(r.key);
    const names = [r.match, ...(m ? [`${m[1]} et al. ${m[2]}`, `${m[1]} ${m[2]}`] : [])];
    const hits = names.map((n) => src.indexOf(n)).filter((i) => i >= 0);
    return hits.length ? Math.min(...hits) : -1;
  };
  return refs.references.map((r) => ({ r, i: at(r) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.r);
}

/** "Label: Key 2007 · Key 2010" with links to the papers; an unchecked (TODO) source says so. */
export function sourceLine(src, refs, label = "Source") {
  const p = el("p", { className: "src-line" });
  const list = citedRefs(src, refs);
  if (!list.length) {
    p.textContent = !src || /^TODO/.test(src) ? `${label}: none checked yet (an estimate)` : `${label}: ${src}`;
    return p;
  }
  p.append(`${label}: `);
  list.forEach((r, i) => {
    if (i) p.append(" · ");
    p.append(r.url ? el("a", { href: r.url, target: "_blank", rel: "noopener", textContent: r.key }) : r.key);
  });
  if (/TODO/.test(src)) p.append(" (in part still an estimate)");
  return p;
}

const peakAt = (points) => points.reduce((b, p) => (p[1] > b[1] ? p : b), points[0]);

/**
 * Fill the expert-only boxes beside the strength slider (`strengthBox`) and under the torque chart
 * (`chartBox`): the default peak torque(s), where the measured curve peaks, and its papers.
 */
export function renderExpertInline(strengthBox, chartBox, ex, variant, refs) {
  const s = [], c = [];
  if (ex.strengthCurve?.points) {
    const [a] = peakAt(ex.strengthCurve.points), unit = ex.angleUnit ?? "°";
    s.push(el("p", { className: "src-line", textContent: `Typical peak (the slider's default): ${num(ex.defaults?.peakTorqueNm)} Nm, strongest at ${num(a)}${unit}.` }), sourceLine(ex.strengthCurve.source, refs, "Strength curve"));
    c.push(el("p", { className: "src-line", textContent: "Dots: the angles the strength curve was measured at (relative values × the peak set above)." }));
  }
  if (ex.joints) {
    for (const j of ex.joints.filter((x) => x.strength)) {
      const pk = j.strength.points ? peakAt(j.strength.points) : null;
      const line = sourceLine(j.strength.source, refs, j.peakTorqueNm != null ? `${j.name}: ${num(j.peakTorqueNm)} Nm${pk ? `, strongest at ${num(pk[0])}°` : ""}` : j.name);
      s.push(line);
    }
    if (s.length) c.push(el("p", { className: "src-line", textContent: "Strength lines: each joint's measured curve × its typical peak × the strength slider (posture corrections in Sources and numbers, below)." }));
  }
  if (ex.pinch) {
    s.push(el("p", { className: "src-line", textContent: `Maximal squeeze per face (the slider's 100%): ${num(ex.pinch.capacity)} N.` }), sourceLine(ex.pinch.capacitySource, refs, "Squeeze"),
      sourceLine(ex.pinch.frictionSource, refs, "Finger-pad friction"), sourceLine(ex.pinch.wristSource, refs, "Wrist angle"));
  }
  if (ex.finger) {
    s.push(sourceLine(ex.finger.momentArmsSource, refs, "Tendon moment arms"), sourceLine(ex.finger.pulleyStrengthSource, refs, "Pulley strength"),
      sourceLine(ex.finger.referenceTensionSource, refs, "Tendon tension check"));
    if (variant?.source) s.push(sourceLine(variant.source, refs, "Grip posture"));
  }
  if (variant?.strengthScale?.source) s.push(sourceLine(variant.strengthScale.source, refs, "Correction for this variant"));
  for (const cam of variant?.load?.camProfiles ?? []) s.push(sourceLine(cam.source, refs, `Cam "${cam.label}"`));
  strengthBox.replaceChildren(...s);
  strengthBox.hidden = !s.length;
  chartBox.replaceChildren(...c);
  chartBox.hidden = !c.length;
}

/** A muscle's source line: its curated share's papers, or the model that computes it (edge lift, pinch lift). */
export function muscleSourceLine(ex, m, refs) {
  if (m?.driver === "tendon") return sourceLine(ex.finger?.momentArmsSource, refs, "Computed from the finger statics (no curated share); moment arms");
  if (m?.parts && ex.handModel) return sourceLine(ex.handModel.source, refs, "Computed by the ARMS hand model (non-commercial use only; no curated share)");
  return sourceLine(m?.source, refs, "Muscle share");
}
