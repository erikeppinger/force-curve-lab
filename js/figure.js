// Side-view (sagittal) figure: body, arm segments, load, cable, force vector,
// moment arm and muscles coloured by estimated activation.

const NS = "http://www.w3.org/2000/svg";
const S = 150; // px per metre
const VIEW = { x0: -1.05, x1: 1.05, y0: -1.5, y1: 0.42 };
const FLOOR_Y = -1.45;

const px = (p) => ({ x: (p.x - VIEW.x0) * S, y: (VIEW.y1 - p.y) * S });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

function seg(parent, a, b, cls, widthM, extra = {}) {
  const A = px(a), B = px(b);
  return el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": widthM * S, ...extra }, parent);
}

/** Muscle drawn as a thick rounded stroke alongside a bone, offset towards `normal`. */
function muscle(parent, from, to, t0, t1, normal, offset, widthM, value, title) {
  const a = add(lerp(from, to, t0), normal, offset);
  const b = add(lerp(from, to, t1), normal, offset);
  const g = el("g", {}, parent);
  seg(g, a, b, "muscle-base", widthM);
  seg(g, a, b, "muscle-on", widthM, { "stroke-opacity": value.toFixed(3) });
  el("title", {}, g).textContent = `${title}: ${Math.round(value * 100)}%`;
}

export function renderFigure(svg, { variant, result, activation, pulley }) {
  svg.setAttribute("viewBox", `0 0 ${(VIEW.x1 - VIEW.x0) * S} ${(VIEW.y1 - VIEW.y0) * S}`);
  svg.replaceChildren();
  const { shoulder, elbow, hand, upperArmAngle: a, forearmAngle: phi } = result.pose;
  const act = Object.fromEntries(activation.map((m) => [m.id, m]));

  // Floor and body
  seg(svg, { x: VIEW.x0, y: FLOOR_Y }, { x: VIEW.x1, y: FLOOR_Y }, "floor", 0.01);
  const hip = { x: 0, y: -0.55 };
  seg(svg, hip, { x: 0.02, y: FLOOR_Y }, "body", 0.14);
  seg(svg, { x: 0, y: 0.05 }, hip, "body", 0.2);
  const head = px({ x: 0.02, y: 0.24 });
  el("circle", { cx: head.x, cy: head.y, r: 0.11 * S, class: "body" }, svg);

  // Equipment behind the arm
  const upperDir = { x: Math.sin(a), y: -Math.cos(a) };
  const upperFront = { x: Math.cos(a), y: Math.sin(a) };
  if (variant.upperArmSupported) {
    const p0 = add(lerp(shoulder, elbow, 0.25), upperFront, -0.05);
    const p1 = add(add(elbow, upperDir, 0.04), upperFront, -0.05);
    seg(svg, p0, p1, "pad", 0.06);
    seg(svg, lerp(p0, p1, 0.5), { x: lerp(p0, p1, 0.5).x - 0.05, y: FLOOR_Y }, "equipment", 0.025);
  }
  if (variant.load.type === "cable") {
    const P = px(pulley);
    seg(svg, { x: pulley.x, y: FLOOR_Y }, { x: pulley.x, y: Math.max(pulley.y, 0.3) }, "cable-column", 0.05);
    seg(svg, hand, pulley, "cable", 0.008);
    el("circle", { cx: P.x, cy: P.y, r: 0.045 * S, class: "pulley" }, svg);
  }

  // Arm with muscles (deeper muscles first)
  const foreDir = { x: Math.sin(phi), y: -Math.cos(phi) };
  const foreInner = { x: Math.cos(phi), y: Math.sin(phi) };
  seg(svg, shoulder, elbow, "bone", 0.06);
  seg(svg, elbow, hand, "bone", 0.05);
  muscle(svg, shoulder, elbow, 0.5, 0.98, upperFront, 0.025, 0.04, act.brachialis?.value ?? 0, "Brachialis");
  muscle(svg, shoulder, elbow, 0.15, 0.85, upperFront, 0.04, 0.055, act.biceps?.value ?? 0, "Biceps brachii");
  muscle(svg, elbow, hand, 0.02, 0.55, foreInner, 0.03, 0.04, act.brachioradialis?.value ?? 0, "Brachioradialis");
  muscle(svg, add(shoulder, upperDir, -0.02), add(shoulder, upperDir, 0.1), 0, 1, upperFront, 0.05, 0.06, act["anterior-deltoid"]?.value ?? 0, "Anterior deltoid");
  for (const j of [shoulder, elbow]) {
    const J = px(j);
    el("circle", { cx: J.x, cy: J.y, r: 0.022 * S, class: "joint" }, svg);
  }

  // Load at the hand
  const H = px(hand);
  if (variant.load.type === "gravity") {
    const r = variant.equipment.startsWith("Dumbbell") ? 0.055 : 0.09;
    el("circle", { cx: H.x, cy: H.y, r: r * S, class: "weight" }, svg);
  } else {
    el("circle", { cx: H.x, cy: H.y, r: 0.025 * S, class: "handle" }, svg);
  }

  // Line of action, moment arm, force vector
  const f = result.force;
  if (f.mag > 0) {
    const u = { x: f.x / f.mag, y: f.y / f.mag };
    seg(svg, add(hand, u, -0.5), add(hand, u, 0.5), "line-of-action", 0.006);
    seg(svg, elbow, result.momentArmFoot, "moment-arm", 0.012);
    const mid = px(lerp(elbow, result.momentArmFoot, 0.5));
    const t = el("text", { x: mid.x + 6, y: mid.y - 6, class: "fig-label" }, svg);
    t.textContent = `d = ${Math.abs(result.momentArm * 100).toFixed(0)} cm`;
    seg(svg, hand, add(hand, u, 0.28), "force", 0.014, { "marker-end": "url(#arrow)" });
    const tip = px(add(hand, u, 0.33));
    el("text", { x: tip.x, y: tip.y + 4, class: "fig-label force-label", "text-anchor": "middle" }, svg).textContent = "F";
  }

  const defs = el("defs", {}, svg);
  const m = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, m);
}
