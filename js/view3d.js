// Hand-rolled 3D view in SVG: orthographic projection, painter's-algorithm depth sort,
// drag (or the view buttons) to turn the camera. No dependencies.
//
// Camera: yaw turns about the vertical (0 = from the lifter's right side, 90 = from the
// front), pitch tilts down (90 = from above).

import { add3, sub3, unit3, mirror, v3 } from "./multijoint3d.js";

const NS = "http://www.w3.org/2000/svg";
const S = 150; // px per metre
const rad = (d) => (d * Math.PI) / 180;

export const CAMERAS = { side: { yaw: 0, pitch: 0 }, front: { yaw: 90, pitch: 0 }, top: { yaw: 0, pitch: 90 }, "3d": { yaw: 38, pitch: 22 } };

/** World point → { x, y } on screen (metres, y up) and depth (larger = nearer the camera). */
export function project(p, cam) {
  const cy = Math.cos(rad(cam.yaw)), sy = Math.sin(rad(cam.yaw));
  const X = p.x * cy - p.z * sy;
  const Z = p.x * sy + p.z * cy;
  const cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
  return { x: X, y: p.y * cp - Z * sp, depth: p.y * sp + Z * cp };
}

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

/** Everything to draw for one leg-press result, as 3D primitives. */
export function scene3d(exercise, result, activation) {
  const prims = [];
  const line = (a, b, w, cls, extra) => prims.push({ kind: "line", a, b, w, cls, ...extra });
  const { pose } = result;
  // Machine
  prims.push({ kind: "poly", pts: result.plate, cls: "plate3d" });
  for (const z of [-0.5, 0.5]) line(add3(result.rail[0], v3(0, 0, 1), z), add3(result.rail[1], v3(0, 0, 1), z), 0.02, "equipment");
  for (const z of [-0.25, 0.25]) line(add3(result.seat[0], v3(0, 0, 1), z), add3(result.seat[1], v3(0, 0, 1), z), 0.05, "equipment");
  // Body: trunk, head, pelvis, both legs (left leg drawn lighter)
  line(pose.trunk[0], pose.trunk[1], 0.3, "body");
  prims.push({ kind: "dot", c: pose.head, r: 0.11, cls: "body" });
  line(pose.pelvis[0], pose.pelvis[1], 0.16, "body");
  for (const side of ["left", "right"]) {
    const l = pose[side], cls = side === "left" ? "body back" : "body";
    line(l.H, l.K, 0.14, cls);
    line(l.K, l.A, 0.1, cls);
    line(l.heel, l.toes, 0.06, cls);
  }
  // Muscles of the right leg, on the side of the segment the JSON names.
  const act = Object.fromEntries(activation.map((m) => [m.id, m.value ?? 0]));
  const sides = (fr) => ({ anterior: fr.anterior, posterior: v3(-fr.anterior.x, -fr.anterior.y, -fr.anterior.z), lateral: fr.lateral, medial: v3(-fr.lateral.x, -fr.lateral.y, -fr.lateral.z) });
  for (const m of exercise.muscles.filter((x) => x.draw3d)) {
    const d = m.draw3d, fr = result.frames[d.seg];
    const dir = unit3(sub3(fr.to, fr.from));
    const off = sides(fr)[d.side];
    const a = add3(add3(fr.from, dir, d.along[0]), off, d.offset);
    const b = add3(add3(fr.from, dir, d.along[1]), off, d.offset);
    line(a, b, d.w, "muscle-base", { title: m.name });
    line(a, b, d.w, "muscle-on", { opacity: act[m.id], title: `${m.name}: ${Math.round(act[m.id] * 100)}%` });
  }
  // Joints, the plate's push and each joint's moment arm to it.
  for (const j of ["H", "K", "A"]) prims.push({ kind: "dot", c: pose.right[j], r: 0.022, cls: "joint", top: true });
  const { at, dir } = result.push;
  line(add3(at, dir, -0.25), add3(at, dir, 1.0), 0.006, "line-of-action", { top: true });
  line(at, add3(at, dir, 0.28), 0.014, "force", { top: true, arrow: true });
  line(mirror(at), add3(mirror(at), dir, 0.28), 0.014, "force", { top: true, arrow: true });
  for (const id of ["hip", "knee", "ankle"]) {
    const j = result.joints.find((x) => x.id === id);
    if (j.momentArm > 0.005) line(j.at, j.foot, 0.012, `moment-arm ma-${id}`, { top: true, label: `${Math.round(j.momentArm * 100)} cm` });
  }
  return prims;
}

/** Screen-space bounds of a set of scenes for a camera. */
export function bounds3d(scenes, cam) {
  const xs = [], ys = [];
  const put = (p, r = 0) => { const q = project(p, cam); xs.push(q.x - r, q.x + r); ys.push(q.y - r, q.y + r); };
  for (const prims of scenes) {
    for (const p of prims) {
      if (p.kind === "line") { put(p.a, p.w / 2); put(p.b, p.w / 2); }
      else if (p.kind === "dot") put(p.c, p.r);
      else p.pts.forEach((q) => put(q));
    }
  }
  const m = 0.12;
  return { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m };
}

export function renderView3d(svg, prims, cam, V) {
  svg.setAttribute("viewBox", `0 0 ${((V.x1 - V.x0) * S).toFixed(1)} ${((V.y1 - V.y0) * S).toFixed(1)}`);
  svg.replaceChildren();
  const px = (p) => { const q = project(p, cam); return { x: (q.x - V.x0) * S, y: (V.y1 - q.y) * S, depth: q.depth }; };
  const depthOf = (p) => (p.kind === "line" ? (px(p.a).depth + px(p.b).depth) / 2 : p.kind === "dot" ? px(p.c).depth : p.pts.reduce((s, q) => s + px(q).depth, 0) / p.pts.length);
  const sorted = prims.map((p) => ({ p, d: depthOf(p) + (p.top ? 100 : 0) })).sort((a, b) => a.d - b.d);
  for (const { p } of sorted) {
    if (p.kind === "poly") {
      el("polygon", { points: p.pts.map((q) => { const r = px(q); return `${r.x.toFixed(1)},${r.y.toFixed(1)}`; }).join(" "), class: p.cls }, svg);
    } else if (p.kind === "dot") {
      const c = px(p.c);
      el("circle", { cx: c.x, cy: c.y, r: p.r * S, class: p.cls }, svg);
    } else {
      const A = px(p.a), B = px(p.b);
      const attrs = { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: p.cls, "stroke-width": p.w * S };
      if (p.opacity != null) attrs["stroke-opacity"] = p.opacity.toFixed(3);
      if (p.arrow) attrs["marker-end"] = "url(#arrow)";
      const n = el("line", attrs, svg);
      if (p.title) el("title", {}, n).textContent = p.title;
      if (p.label) {
        el("text", { x: (A.x + B.x) / 2 + 4, y: (A.y + B.y) / 2 - 6, class: `fig-label ma-label ${p.cls.split(" ").find((c) => c.startsWith("ma-"))}` }, svg).textContent = p.label;
      }
    }
  }
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, mk);
}
