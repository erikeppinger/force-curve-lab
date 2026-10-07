// Side-view (sagittal) or front-view (frontal) figure: body, arm segments, load, cable or
// machine, force vector, moment arm and muscles coloured by estimated activation.

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

export function renderFigure(svg, { exercise, variant, result, activation, pulley }) {
  svg.setAttribute("viewBox", `0 0 ${(VIEW.x1 - VIEW.x0) * S} ${(VIEW.y1 - VIEW.y0) * S}`);
  svg.replaceChildren();
  const act = Object.fromEntries(activation.map((m) => [m.id, m.value]));
  seg(svg, { x: VIEW.x0, y: FLOOR_Y }, { x: VIEW.x1, y: FLOOR_Y }, "floor", 0.01);
  if (exercise.view === "front") drawFront(svg, variant, result, act, pulley);
  else drawSide(svg, variant, result, act, pulley);
  drawForce(svg, result);

  const defs = el("defs", {}, svg);
  const m = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, m);
}

function drawCable(svg, hand, pulley) {
  const P = px(pulley);
  seg(svg, { x: pulley.x, y: FLOOR_Y }, { x: pulley.x, y: Math.max(pulley.y, 0.3) }, "cable-column", 0.05);
  seg(svg, hand, pulley, "cable", 0.008);
  el("circle", { cx: P.x, cy: P.y, r: 0.045 * S, class: "pulley" }, svg);
}

function drawJoints(svg, ...joints) {
  for (const j of joints) {
    const J = px(j);
    el("circle", { cx: J.x, cy: J.y, r: 0.022 * S, class: "joint" }, svg);
  }
}

function drawHandLoad(svg, variant, hand) {
  const H = px(hand);
  if (variant.load.type === "gravity") {
    const r = variant.equipment.startsWith("Dumbbell") ? 0.055 : 0.09;
    el("circle", { cx: H.x, cy: H.y, r: r * S, class: "weight" }, svg);
  } else if (variant.load.type === "cable") {
    el("circle", { cx: H.x, cy: H.y, r: 0.025 * S, class: "handle" }, svg);
  }
}

/** Machine: cam at the joint axis, lever along the arm and a pad where the force acts. */
function drawMachine(svg, result) {
  const { joint, hand } = result.pose;
  const at = result.force.at;
  const J = px(joint);
  el("circle", { cx: J.x, cy: J.y, r: 0.07 * S, class: "cam" }, svg);
  const len = Math.hypot(hand.x - joint.x, hand.y - joint.y);
  const u = { x: (hand.x - joint.x) / len, y: (hand.y - joint.y) / len };
  const n = { x: -u.y, y: u.x }; // side of the arm the pad pushes on
  seg(svg, add(joint, n, 0.06), add(at, n, 0.06), "equipment", 0.025);
  seg(svg, add(add(at, n, 0.045), u, -0.05), add(add(at, n, 0.045), u, 0.05), "pad", 0.04);
}

function drawSide(svg, variant, result, act, pulley) {
  const { shoulder, elbow, hand, upperArmAngle: a, forearmAngle: phi } = result.pose;

  // Body
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
  if (variant.load.type === "cable") drawCable(svg, hand, pulley);
  if (variant.load.type === "machine") drawMachine(svg, result);

  // Arm with muscles (deeper muscles first)
  const foreInner = { x: Math.cos(phi), y: Math.sin(phi) };
  seg(svg, shoulder, elbow, "bone", 0.06);
  seg(svg, elbow, hand, "bone", 0.05);
  muscle(svg, shoulder, elbow, 0.5, 0.98, upperFront, 0.025, 0.04, act.brachialis ?? 0, "Brachialis");
  muscle(svg, shoulder, elbow, 0.15, 0.85, upperFront, 0.04, 0.055, act.biceps ?? 0, "Biceps brachii");
  muscle(svg, elbow, hand, 0.02, 0.55, foreInner, 0.03, 0.04, act.brachioradialis ?? 0, "Brachioradialis");
  muscle(svg, add(shoulder, upperDir, -0.02), add(shoulder, upperDir, 0.1), 0, 1, upperFront, 0.05, 0.06, act["anterior-deltoid"] ?? 0, "Anterior deltoid");
  drawJoints(svg, shoulder, elbow);
  drawHandLoad(svg, variant, hand);
}

/** Front view of the right side of the body: the shoulder is the origin, the trunk is to its left. */
function drawFront(svg, variant, result, act, pulley) {
  const { shoulder, elbow, hand, upperArmAngle: a } = result.pose;
  const mid = -0.19; // trunk centre line

  // Body: trunk, legs, the other (resting) arm and head
  seg(svg, { x: mid, y: 0.02 }, { x: mid, y: -0.52 }, "body", 0.3);
  for (const dx of [-0.08, 0.08]) seg(svg, { x: mid + dx, y: -0.6 }, { x: mid + dx * 1.2, y: FLOOR_Y }, "body", 0.12);
  seg(svg, { x: 2 * mid, y: -0.02 }, { x: 2 * mid - 0.02, y: -0.6 }, "body", 0.07);
  seg(svg, { x: mid, y: 0.05 }, { x: mid, y: 0.14 }, "body", 0.08);
  const head = px({ x: mid, y: 0.25 });
  el("circle", { cx: head.x, cy: head.y, r: 0.11 * S, class: "body" }, svg);

  if (variant.load.type === "cable") drawCable(svg, hand, pulley);
  if (variant.load.type === "machine") drawMachine(svg, result);

  // Working arm with muscles (deeper muscles first)
  const armDir = { x: Math.sin(a), y: -Math.cos(a) };
  const armTop = { x: Math.cos(a), y: Math.sin(a) }; // lateral / upper side of the arm
  seg(svg, shoulder, elbow, "bone", 0.06);
  seg(svg, elbow, hand, "bone", 0.05);
  muscle(svg, { x: mid + 0.06, y: 0.14 }, { x: -0.03, y: 0.05 }, 0, 1, armTop, 0, 0.04, act["upper-trapezius"] ?? 0, "Upper trapezius");
  muscle(svg, { x: -0.15, y: 0.04 }, { x: 0.01, y: 0.03 }, 0, 1, armTop, 0, 0.03, act.supraspinatus ?? 0, "Supraspinatus");
  muscle(svg, add(shoulder, armDir, -0.01), add(shoulder, armDir, 0.12), 0, 1, armTop, -0.005, 0.045, act["anterior-deltoid"] ?? 0, "Anterior deltoid");
  muscle(svg, add(shoulder, armDir, -0.03), add(shoulder, armDir, 0.15), 0, 1, armTop, 0.035, 0.055, act["lateral-deltoid"] ?? 0, "Lateral deltoid");
  drawJoints(svg, shoulder, elbow);
  drawHandLoad(svg, variant, hand);
}

/** Line of action, moment arm (from the moving joint) and force vector. */
function drawForce(svg, result) {
  const f = result.force;
  if (!(f.mag > 0)) return;
  const { joint } = result.pose;
  const u = { x: f.x / f.mag, y: f.y / f.mag };
  seg(svg, add(f.at, u, -0.5), add(f.at, u, 0.5), "line-of-action", 0.006);
  seg(svg, joint, result.momentArmFoot, "moment-arm", 0.012);
  const mid = px(lerp(joint, result.momentArmFoot, 0.5));
  const t = el("text", { x: mid.x + 6, y: mid.y - 6, class: "fig-label" }, svg);
  t.textContent = `d = ${Math.abs(result.momentArm * 100).toFixed(0)} cm`;
  seg(svg, f.at, add(f.at, u, 0.28), "force", 0.014, { "marker-end": "url(#arrow)" });
  const tip = px(add(f.at, u, 0.33));
  el("text", { x: tip.x, y: tip.y + 4, class: "fig-label force-label", "text-anchor": "middle" }, svg).textContent = "F";
}
