// Figure: body (posture shapes from the exercise JSON), the moving chain, load, cable or
// machine, force vector, moment arm and muscles coloured by estimated activation.
// Everything is defined in the exercise's own frame and rotated so that the variant's
// gravity points down the screen (lying postures appear lying). With no in-plane gravity
// (a top view) nothing is rotated.

import { gravityOf } from "./physics.js";

const NS = "http://www.w3.org/2000/svg";
const BASE_S = 150; // px per metre
const S = BASE_S;
const MARGIN = 0.25; // m around the drawing

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const unit = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const P = ([x, y]) => ({ x, y });

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

/** Rotation that takes the variant's gravity to screen-down (identity when gravity is 0). */
export function screenRotation(variant) {
  const g = gravityOf(variant);
  if (Math.hypot(g.x, g.y) < 1e-9) return 0;
  return -Math.PI / 2 - Math.atan2(g.y, g.x);
}

/** Title for the figure card. */
export function viewTitle(exercise, variant) {
  if (variant.viewLabel) return variant.viewLabel;
  return { side: "Side view", front: "Front view", top: "Top view", "3d": "3D view (drag to turn)" }[exercise.view ?? "side"];
}

const postureOf = (exercise, variant) => {
  const all = exercise.postures ?? {};
  return all[variant.posture] ?? Object.values(all)[0] ?? [];
};

/**
 * Zoomed frame around the moving joint: the moving segment over its whole range plus a stretch
 * of the fixed one, for small joints (wrist, ankle) that are tiny in the whole-body view.
 * Carries its own drawing scale (px per metre) so the picture keeps about the same pixel size.
 */
export function zoomBounds(exercise, variant, poses) {
  const R = rotator(screenRotation(variant));
  const proximalMoves = exercise.movingJoint === "proximal";
  const reach = exercise.segments.distal;
  const pts = [];
  for (const p of poses) {
    const joint = proximalMoves ? p.base : p.mid;
    const other = proximalMoves ? p.mid : p.base;
    const len = Math.hypot(other.x - joint.x, other.y - joint.y) || 1;
    const back = { x: joint.x + ((other.x - joint.x) / len) * reach * 0.6, y: joint.y + ((other.y - joint.y) / len) * reach * 0.6 };
    pts.push(R(joint), R(p.tip), R(back));
  }
  const m = Math.max(0.04, reach * 0.45);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const b = { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m };
  b.scale = 380 / Math.max(b.x1 - b.x0, b.y1 - b.y0);
  return b;
}

/** Bounding box (screen frame, metres) that holds the body, the chain over its whole range and the pulley. */
export function figureBounds(exercise, variant, poses, pulley) {
  const rot = screenRotation(variant);
  const R = rotator(rot);
  const pts = [];
  for (const s of postureOf(exercise, variant)) {
    if (s.shape === "circle") { const c = R(P(s.at)); pts.push(add(c, { x: s.r, y: s.r }), add(c, { x: -s.r, y: -s.r })); }
    else if (s.shape === "ellipse") { const c = R(P(s.at)); const r = Math.max(s.rx, s.ry); pts.push(add(c, { x: r, y: r }), add(c, { x: -r, y: -r })); }
    else pts.push(R(P(s.from)), R(P(s.to)));
  }
  for (const p of poses) pts.push(R(p.base), R(p.mid), R(p.tip));
  if (pulley) pts.push(R(pulley));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) - MARGIN, x1: Math.max(...xs) + MARGIN, y0: Math.min(...ys) - MARGIN, y1: Math.max(...ys) + MARGIN };
}

function rotator(rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (p) => ({ x: c * p.x - s * p.y, y: s * p.x + c * p.y });
}

export function renderFigure(svg, { exercise, variant, result, activation, pulley, bounds }) {
  const V = bounds;
  const S = V.scale ?? BASE_S; // px per metre; a zoomed frame brings its own
  const k = S / BASE_S; // overlays (arrows, markers) are divided by this to keep their on-screen size
  const arrow = (k > 2 ? 1.6 : 1) / k; // and the force arrow a bit longer when zoomed in
  svg.setAttribute("viewBox", `0 0 ${((V.x1 - V.x0) * S).toFixed(1)} ${((V.y1 - V.y0) * S).toFixed(1)}`);
  svg.replaceChildren();
  const R = rotator(screenRotation(variant));
  const toPx = (p) => { const q = R(p); return { x: (q.x - V.x0) * S, y: (V.y1 - q.y) * S }; };
  const seg = (parent, a, b, cls, widthM, extra = {}) => {
    const A = toPx(a), B = toPx(b);
    return el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": widthM * S, ...extra }, parent);
  };
  const circle = (parent, c, r, cls) => { const C = toPx(c); return el("circle", { cx: C.x, cy: C.y, r: r * S, class: cls }, parent); };
  // Screen-frame helpers (for things that stand on the floor whatever the posture).
  const fromScreen = rotator(-screenRotation(variant));
  const gravityInPlane = Math.hypot(gravityOf(variant).x, gravityOf(variant).y) > 1e-9;

  const act = Object.fromEntries(activation.map((m) => [m.id, m.value]));
  const { base, mid, tip, joint } = result.pose;
  const shapes = postureOf(exercise, variant);

  // Floor: under the lowest body point, or under the foot for a closed-chain (reaction) load.
  let floorAt = 0;
  if (gravityInPlane) {
    const screenYs = shapes.flatMap((s) => (s.shape === "seg" ? [P(s.from), P(s.to)] : [P(s.at)])).map((p) => R(p).y);
    const floorY = variant.load.type === "reaction" ? R(tip).y : Math.min(...screenYs);
    seg(svg, fromScreen({ x: V.x0, y: floorY }), fromScreen({ x: V.x1, y: floorY }), "floor", 0.01);
    if (variant.load.type === "reaction") {
      const t = R(tip);
      seg(svg, fromScreen({ x: t.x - 0.04, y: floorY - 0.05 }), fromScreen({ x: t.x + 0.3, y: floorY - 0.05 }), "equipment", 0.1);
    }
    floorAt = floorY;
  }

  // Body
  for (const s of shapes) {
    const cls = s.class ?? "body";
    if (s.shape === "seg") seg(svg, P(s.from), P(s.to), cls, s.w);
    else if (s.shape === "circle") circle(svg, P(s.at), s.r, cls);
    else if (s.shape === "ellipse") {
      const C = toPx(P(s.at));
      el("ellipse", { cx: C.x, cy: C.y, rx: s.rx * S, ry: s.ry * S, class: cls }, svg);
    }
  }

  // Equipment behind the limb
  const proxDir = unit({ x: mid.x - base.x, y: mid.y - base.y });
  const proxSide = { x: -proxDir.y, y: proxDir.x };
  if (variant.proximalSupported) {
    const p0 = add(lerp(base, mid, 0.25), proxSide, -0.05);
    const p1 = add(add(mid, proxDir, 0.04), proxSide, -0.05);
    seg(svg, p0, p1, "pad", 0.06);
    if (gravityInPlane) {
      const m = R(lerp(p0, p1, 0.5));
      seg(svg, fromScreen(m), fromScreen({ x: m.x - 0.05, y: floorAt }), "equipment", 0.025);
    }
  }
  if (variant.load.type === "cable") {
    if (gravityInPlane) {
      const q = R(pulley);
      seg(svg, fromScreen({ x: q.x, y: floorAt }), fromScreen({ x: q.x, y: Math.max(q.y, V.y1 - MARGIN) }), "cable-column", 0.05);
    }
    seg(svg, tip, pulley, "cable", 0.008);
    circle(svg, pulley, 0.045, "pulley");
  }
  if (variant.load.type === "band") {
    // Band: drawn thicker when it carries tension, dashed when slack.
    seg(svg, tip, pulley, result.force.mag > 0 ? "band" : "band slack", 0.014);
    circle(svg, pulley, 0.03, "anchor");
  }
  if (variant.load.type === "machine") {
    // Cam at the joint, lever along the segment, pad on the side the force pushes from.
    circle(svg, joint, 0.07, "cam");
    const n = unit({ x: -result.force.x, y: -result.force.y });
    const at = result.force.at;
    const u = unit({ x: tip.x - joint.x, y: tip.y - joint.y });
    seg(svg, add(joint, n, 0.06), add(at, n, 0.06), "equipment", 0.025);
    seg(svg, add(add(at, n, 0.045), u, -0.05), add(add(at, n, 0.045), u, 0.05), "pad", 0.04);
  }

  // Limb with muscles (lower layers first)
  seg(svg, base, mid, "bone", 0.06);
  seg(svg, mid, tip, "bone", 0.05);
  const segs = { proximal: [base, mid], distal: [mid, tip] };
  const drawn = exercise.muscles.filter((m) => m.draw).sort((a, b) => (a.draw.layer ?? 0) - (b.draw.layer ?? 0));
  for (const m of drawn) {
    const d = m.draw;
    let a, b;
    if (d.points) [a, b] = d.points.map(P);
    else if (d.origin) {
      // Origin fixed on the body (body frame), insertion on the moving segment: the muscle stretches
      // and swings with the limb instead of moving rigidly with it.
      const [from, to] = segs[d.seg];
      const u = unit({ x: to.x - from.x, y: to.y - from.y });
      a = P(d.origin);
      b = add(add(from, u, d.insert), { x: -u.y, y: u.x }, d.offset ?? 0);
    } else {
      const [from, to] = segs[d.seg];
      const u = unit({ x: to.x - from.x, y: to.y - from.y });
      const n = { x: -u.y, y: u.x };
      a = add(add(from, u, d.along[0]), n, d.offset ?? 0);
      b = add(add(from, u, d.along[1]), n, d.offset ?? 0);
    }
    const value = act[m.id] ?? 0;
    const g = el("g", {}, svg);
    seg(g, a, b, "muscle-base", d.w);
    seg(g, a, b, "muscle-on", d.w, { "stroke-opacity": value.toFixed(3) });
    el("title", {}, g).textContent = `${m.name}: ${Math.round(value * 100)}%`;
  }
  for (const j of [base, mid]) circle(svg, j, 0.022 / k, "joint");

  // Load at the tip
  if (variant.load.type === "gravity") {
    const w = circle(svg, tip, variant.equipment.startsWith("Dumbbell") || variant.equipment.startsWith("Ankle") ? 0.055 : 0.09, "weight");
    if (k > 2) w.setAttribute("opacity", "0.35"); // zoomed: the plate is larger than the hand; keep the hand visible
  } else if (variant.load.type === "cable" || variant.load.type === "band") {
    circle(svg, tip, 0.025, "handle");
  }

  // Line of action, moment arm (from the moving joint) and force vector
  const f = result.force;
  if (f.mag > 0) {
    const u = unit(f);
    seg(svg, add(f.at, u, -0.5 / k), add(f.at, u, 0.5 / k), "line-of-action", 0.006 / k);
    seg(svg, joint, result.momentArmFoot, "moment-arm", 0.012 / k);
    const m = toPx(lerp(joint, result.momentArmFoot, 0.5));
    // Near the right edge (small figures such as the wrist), put the label to the left so it isn't cut off.
    const flip = m.x > (V.x1 - V.x0) * S - 90;
    el("text", { x: flip ? m.x - 6 : m.x + 6, y: m.y - 6, class: "fig-label", "text-anchor": flip ? "end" : "start" }, svg).textContent = `d = ${Math.abs(result.momentArm * 100).toFixed(0)} cm`;
    seg(svg, f.at, add(f.at, u, 0.28 * arrow), "force", 0.014 / k, { "marker-end": "url(#arrow)" });
    const t = toPx(add(f.at, u, 0.33 * arrow));
    el("text", { x: t.x, y: t.y + 4, class: "fig-label force-label", "text-anchor": "middle" }, svg).textContent = "F";
  }

  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, mk);
}

// ---------- multi-joint figure (world frame: x forward, y up, floor at y = 0) ----------

const ARM = 0.63; // shoulder → hand, for drawing the elbow

/** Bounding box over every sampled posture of a multi-joint lift. */
export function multiBounds(samples) {
  const pts = [{ x: 0, y: 0 }];
  for (const r of samples) {
    for (const d of [...r.draw, ...r.props]) {
      if (d.circle) pts.push(add(d.circle, { x: d.r, y: d.r }), add(d.circle, { x: -d.r, y: -d.r }));
      else pts.push(d.a, d.b);
    }
    for (const l of r.loads) pts.push(add(l.at, { x: 0.12, y: 0.12 }), add(l.at, { x: -0.12, y: -0.12 }));
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) - MARGIN, x1: Math.max(...xs) + MARGIN, y0: Math.min(...ys) - 0.08, y1: Math.max(...ys) + 0.15 };
}

export function renderMultiFigure(svg, { exercise, result, activation, bounds }) {
  const V = bounds;
  svg.setAttribute("viewBox", `0 0 ${((V.x1 - V.x0) * S).toFixed(1)} ${((V.y1 - V.y0) * S).toFixed(1)}`);
  svg.replaceChildren();
  const toPx = (p) => ({ x: (p.x - V.x0) * S, y: (V.y1 - p.y) * S });
  const seg = (parent, a, b, cls, w, extra = {}) => {
    const A = toPx(a), B = toPx(b);
    return el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": w * S, ...extra }, parent);
  };
  const circle = (c, r, cls) => { const C = toPx(c); el("circle", { cx: C.x, cy: C.y, r: r * S, class: cls }, svg); };

  seg(svg, { x: V.x0, y: 0 }, { x: V.x1, y: 0 }, "floor", 0.01);
  for (const p of result.props) seg(svg, p.a, p.b, p.cls, p.w);
  if (result.balance) seg(svg, { x: result.balance.x, y: 0 }, { x: result.balance.x, y: V.y1 }, "balance", 0.006);

  // Plates sit beside the body: draw them first, see-through, so the legs stay visible.
  for (const l of result.loads.filter((x) => x.kind === "plate")) circle(l.at, 0.225, "weight plate");

  for (const d of result.draw) {
    if (d.circle) circle(d.circle, d.r, d.cls);
    else seg(svg, d.a, d.b, d.cls, d.w);
  }

  // Muscles on named segments (offset to the counter-clockwise side of the segment's direction).
  const act = Object.fromEntries(activation.map((m) => [m.id, m.value]));
  for (const m of exercise.muscles.filter((x) => x.draw && result.segs[x.draw.seg])) {
    const [from, to] = result.segs[m.draw.seg];
    const u = unit({ x: to.x - from.x, y: to.y - from.y });
    const n = { x: -u.y, y: u.x };
    const a = add(add(from, u, m.draw.along[0]), n, m.draw.offset ?? 0);
    const b = add(add(from, u, m.draw.along[1]), n, m.draw.offset ?? 0);
    const value = act[m.id] ?? 0;
    const g = el("g", {}, svg);
    seg(g, a, b, "muscle-base", m.draw.w);
    seg(g, a, b, "muscle-on", m.draw.w, { "stroke-opacity": value.toFixed(3) });
    el("title", {}, g).textContent = `${m.name}: ${Math.round(value * 100)}%`;
  }

  // Arms (elbow bent behind when the hands are close to the shoulder)
  for (const { from, to, elbow } of result.arms) {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d >= ARM * 0.98 && !elbow) seg(svg, from, to, "body arm", 0.07);
    else {
      const e = elbow ?? elbowFor(from, to);
      seg(svg, from, e, "body arm", 0.07);
      seg(svg, e, to, "body arm", 0.06);
    }
  }

  for (const l of result.loads) circle(l.at, l.kind === "dumbbell" ? 0.06 : l.kind === "plate" || l.kind === "handle" ? 0.025 : 0.08, "weight");

  // Per joint: moment arm to the line of action of everything on its free side.
  for (const j of result.joints) {
    circle(j.at, 0.022, "joint");
    if (j.momentArm < 0.005) continue;
    const R = unit(j.resultant);
    seg(svg, add(j.foot, R, -0.12), add(j.foot, R, 0.12), `line-of-action ma-${j.id}`, 0.006);
    seg(svg, j.at, j.foot, `moment-arm ma-${j.id}`, 0.012);
    const mid = toPx(lerp(j.at, j.foot, 0.5));
    el("text", { x: mid.x + 4, y: mid.y - 6, class: `fig-label ma-label ma-${j.id}` }, svg).textContent = `${Math.round(j.momentArm * 100)} cm`;
  }
}

/** Elbow for drawing an arm of length ARM from shoulder to hand, bent backwards/down. */
function elbowFor(s, h) {
  const d = Math.min(Math.hypot(h.x - s.x, h.y - s.y), ARM - 1e-6);
  const e = unit({ x: h.x - s.x, y: h.y - s.y });
  const a = d / 2, k = Math.sqrt(Math.max(0, (ARM / 2) ** 2 - a * a));
  const n = { x: -e.y, y: e.x };
  const side = n.x < 0 ? 1 : -1; // towards the back (−x)
  return add(add(s, e, a), n, side * k);
}
