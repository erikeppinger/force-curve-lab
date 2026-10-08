// Edge lift, extra figures: the hand from the front with all four fingers on the edge (shares,
// hand tilt, the wrist's sideways moment) and a small body sketch with the shoulder and elbow
// loads. Geometry comes from fingerSet / armLoads in js/finger.js; drawing only.

const NS = "http://www.w3.org/2000/svg";

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}
const rad = (d) => (d * Math.PI) / 180;

/** Stroke colour for an effort (0 … 1+): from the resting muscle colour to the active one. */
const effortColour = (e) => `color-mix(in srgb, var(--muscle-on) ${Math.round(Math.min(1, Math.max(0, e)) * 100)}%, var(--muscle-base))`;

function arrowDefs(svg, id) {
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id, viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, mk);
}

/**
 * The hand seen from the front (palm towards the viewer, index finger on the left, as on a
 * lifting block held in front of you), hanging from the wrist and tilted sideways as the model
 * chose, every finger drawn down to the edge, coloured by its effort, with its share of the block.
 * Frontal plane: z sideways (thumb side +), y up; the wrist at the origin.
 */
export function renderHandFront(svg, { set, exercise: ex, P }) {
  svg.replaceChildren();
  if (!set) return;
  const S = 5000; // px per metre
  const dev = rad(set.deviationDeg);
  // Hand frame (y along the hand, z sideways) → front view, turned by the hand's tilt. The viewer
  // looks at the palm, so the thumb side (+z) is drawn on the left.
  const toWorld = (y, z) => ({ y: y * Math.cos(dev) - z * Math.sin(dev), z: y * Math.sin(dev) + z * Math.cos(dev) });
  const fingers = set.fingers.map((f) => {
    const L = f.g.lengths;
    const k = f.pose ? f.pose.turn : 0;
    // Knuckle and joints along the hand's long axis (the depth towards the palm isn't drawn).
    const kn = -L.metacarpal * Math.cos(k);
    const along = (p) => kn + (f.pose ? p.x * Math.sin(k) + p.y * Math.cos(k) : 0);
    const pts = f.pose
      ? [kn, along(f.pose.pip), along(f.pose.dip), along(f.pose.contact)]
      : [kn, kn - L.proximal, kn - L.proximal - L.middle * 0.8, kn - L.proximal - L.middle * 0.8 - L.distal * 0.5];
    return { f, pts: pts.map((y) => toWorld(y, f.z)), knuckleHand: { y: kn, z: f.z } };
  });
  const all = fingers.flatMap((x) => x.pts);
  const minY = Math.min(...all.map((p) => p.y)), maxZ = 0.06;
  const V = { z0: -maxZ, z1: maxZ, y0: minY - 0.055, y1: 0.012 };
  svg.setAttribute("viewBox", `0 0 ${((V.z1 - V.z0) * S).toFixed(0)} ${((V.y1 - V.y0) * S).toFixed(0)}`);
  const px = (p) => ({ x: (V.z1 - p.z) * S, y: (V.y1 - p.y) * S });
  const line = (a, b, cls, wM, extra = {}) => {
    const A = px(a), B = px(b);
    return el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": wM * S, ...extra }, svg);
  };
  const text = (p, s, cls, dx = 0, dy = 0, anchor = "middle") => {
    const q = px(p);
    el("text", { x: q.x + dx, y: q.y + dy, class: `fig-label ${cls}`, "text-anchor": anchor }, svg).textContent = s;
  };
  arrowDefs(svg, "hand-arrow");

  // Edge: one height per finger's sideways position, from the touching middle finger's contact.
  const mid = fingers.find((x) => x.f.id === "middle");
  const yEdge0 = mid.pts[3].y;
  const step = P.edgeStep ?? 0, tilt = Math.tan(rad(P.edgeTilt ?? 0));
  const zMid = mid.pts[3].z;
  const ringOn = P.stepRing ?? 0;
  const sections = [
    { z0: 0.05, z1: zMid + 0.01, on: 0 }, { z0: zMid + 0.01, z1: zMid - 0.01, on: 1 },
    { z0: zMid - 0.01, z1: zMid - 0.03, on: ringOn }, { z0: zMid - 0.03, z1: -0.05, on: 0 },
  ];
  for (const s of sections) {
    const h = (z) => yEdge0 - step * (1 - s.on) + tilt * (z - zMid);
    const a = { y: h(s.z0), z: s.z0 }, b = { y: h(s.z1), z: s.z1 };
    const A = px(a), B = px(b), d = 0.012 * S;
    el("polygon", { points: `${A.x},${A.y} ${B.x},${B.y} ${B.x},${B.y + d} ${A.x},${A.y + d}`, class: "edge" }, svg);
  }

  // Forearm and palm.
  line({ y: 0.012, z: 0 }, { y: 0, z: 0 }, "body", 0.05);
  const palm = [toWorld(0, 0.028), ...fingers.map((x) => toWorld(x.knuckleHand.y, x.knuckleHand.z + (x.f.id === "index" ? 0.008 : x.f.id === "little" ? -0.008 : 0))), toWorld(0, -0.028)];
  el("polygon", { points: palm.map(px).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" "), class: "body palm" }, svg);

  // Fingers: segments coloured by effort; a dashed finger doesn't reach the edge.
  for (const { f, pts } of fingers) {
    const col = f.touches ? effortColour(f.effort) : "var(--muted)";
    for (let i = 0; i < 3; i++) line(pts[i], pts[i + 1], "finger-seg", 0.016 - i * 0.002, { stroke: col, ...(f.touches ? {} : { "stroke-dasharray": "6 6", opacity: 0.6 }) });
    for (const p of pts.slice(0, 3)) { const q = px(p); el("circle", { cx: q.x, cy: q.y, r: 0.003 * S, class: "joint" }, svg); }
    const c = pts[3];
    if (f.touches && f.share > 0.005) {
      const len = 0.008 + 0.03 * f.share;
      line({ y: c.y - 0.004, z: c.z }, { y: c.y - 0.004 - len, z: c.z }, "force", 0.0018, { "marker-end": "url(#hand-arrow)" });
      text({ y: c.y - 0.004 - len, z: c.z }, `${Math.round(f.share * 100)}%`, "force-label", 0, 40);
    }
    const yl = f.touches && f.share > 0.005 ? c.y - 0.012 - 0.03 * f.share : c.y - 0.008;
    text({ y: yl, z: c.z }, f.label, "finger-name", 0, 78);
  }

}

/**
 * Small body sketch: the arm holding the block, from the front (out to the side) and from the
 * side (forward), with the shoulder and elbow coloured by effort and labelled with their torque.
 */
export function renderArmFigure(svg, { arm, P }) {
  svg.replaceChildren();
  if (!arm) return;
  const W = 560, H = 250;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  arrowDefs(svg, "arm-arrow");
  const panel = (ox, title, angleDeg, side, torque, effort) => {
    // Schematic proportions (px): shoulder at the top of the trunk.
    const sh = { x: ox + 140, y: 70 }, up = 62, fore = 58;
    const t = rad(angleDeg) * side;
    const el1 = { x: sh.x + up * Math.sin(t), y: sh.y + up * Math.cos(t) };
    const hand = { x: el1.x + fore * Math.sin(t), y: el1.y + fore * Math.cos(t) };
    const ln = (a, b, cls, w, extra = {}) => el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls, "stroke-width": w, ...extra }, svg);
    const tx = (x, y, s, cls, anchor = "middle") => { el("text", { x, y, class: `fig-label ${cls}`, "text-anchor": anchor }, svg).textContent = s; };
    tx(ox + 140, 18, title, "panel-title");
    // Trunk, head, the other arm (front view) or nothing (side view).
    el("circle", { cx: sh.x - side * 22, cy: 40, r: 13, class: "body" }, svg);
    ln({ x: sh.x - side * 22, y: 60 }, { x: sh.x - side * 22, y: 170 }, "body", 30);
    ln({ x: sh.x - side * 22, y: 170 }, { x: sh.x - side * 22, y: 235 }, "body", 20);
    // Load line straight down from the hand, and the lever it has about the shoulder.
    ln(hand, { x: hand.x, y: hand.y + 36 }, "cable", 2);
    el("rect", { x: hand.x - 12, y: hand.y + 36, width: 24, height: 16, rx: 3, class: "weight" }, svg);
    if (Math.abs(angleDeg) > 0.5) ln({ x: sh.x, y: sh.y }, { x: sh.x, y: hand.y + 10 }, "line-of-action", 1.5);
    ln(sh, el1, "body arm-seg", 13);
    ln(el1, hand, "body arm-seg", 11);
    const jt = (p, e) => el("circle", { cx: p.x, cy: p.y, r: 8, class: "joint", style: `fill: ${effortColour(e)}` }, svg);
    jt(sh, effort.shoulder);
    jt(el1, effort.elbow);
    tx(sh.x + side * 14, sh.y - 12, `${torque.shoulder.toFixed(0)} Nm · ${Math.round(effort.shoulder * 100)}%`, "small-note", side > 0 ? "start" : "end");
    tx(el1.x + side * 14, el1.y + 4, `${torque.elbow.toFixed(0)} Nm · ${Math.round(effort.elbow * 100)}%`, "small-note", side > 0 ? "start" : "end");
    tx(ox + 140, H - 4, `Arm at ${angleDeg.toFixed(0)}°`, "small-note");
  };
  const e = arm.effort;
  panel(0, "From the front (out to the side)", P.armSide ?? 0, 1, { shoulder: arm.shoulderSide, elbow: arm.elbow }, { shoulder: e.shoulderSide, elbow: e.elbow });
  panel(280, "From the side (forward)", P.armForward ?? 0, 1, { shoulder: arm.shoulderForward, elbow: arm.elbow }, { shoulder: e.shoulderForward, elbow: e.elbow });
}
