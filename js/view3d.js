// Hand-rolled 3D view in SVG: orthographic projection, painter's-algorithm depth sort,
// drag (or the view buttons) to turn the camera. No dependencies.
//
// Camera: yaw turns about the vertical (0 = from the lifter's right side, 90 = from the
// front), pitch tilts down (90 = from above).

import { add3, sub3, unit3, v3 } from "./multijoint3d.js";

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

/** Everything to draw for one 3D result: the solver's scene, muscles, forces and moment arms. */
export function scene3d(exercise, result, activation) {
  const prims = [...result.scene];
  const line = (a, b, w, cls, extra) => prims.push({ kind: "line", a, b, w, cls, ...extra });
  // Muscles on the side of the segment the JSON names: the right limb's, mirrored onto the left one
  // (both work alike) unless the lift is asymmetric (split squat: front leg only). Trunk muscles
  // run as a strip on each side of the spine.
  const act = Object.fromEntries(activation.map((m) => [m.id, m.value ?? 0]));
  const neg = (d) => v3(-d.x, -d.y, -d.z);
  const mirrorZ = (p) => v3(p.x, p.y, -p.z);
  for (const m of exercise.muscles.filter((x) => x.draw3d && result.frames[x.draw3d.seg])) {
    const d = m.draw3d, fr = result.frames[d.seg];
    const dir = unit3(sub3(fr.to, fr.from));
    const off = { anterior: fr.anterior, posterior: neg(fr.anterior), lateral: fr.lateral, medial: neg(fr.lateral) }[d.side];
    const a = add3(add3(fr.from, dir, d.along[0]), off, d.offset);
    const b = add3(add3(fr.from, dir, d.along[1]), off, d.offset);
    const trunk = d.seg === "trunk";
    const sides = trunk ? [[add3(a, fr.lateral, d.spread ?? 0.06), add3(b, fr.lateral, d.spread ?? 0.06)], [add3(a, fr.lateral, -(d.spread ?? 0.06)), add3(b, fr.lateral, -(d.spread ?? 0.06))]]
      : result.asymmetric ? [[a, b]] : [[a, b], [mirrorZ(a), mirrorZ(b)]];
    for (const [p, q] of sides) {
      line(p, q, d.w, "muscle-base", { title: m.name });
      line(p, q, d.w, "muscle-on", { opacity: act[m.id], title: `${m.name}: ${Math.round(act[m.id] * 100)}%` });
    }
  }
  // External forces (the plate, the floor, the bar) and each joint's moment arm to the main one.
  for (const { at, dir } of result.forces) {
    line(add3(at, dir, -0.35), add3(at, dir, 0.9), 0.006, "line-of-action", { top: true });
    line(at, add3(at, dir, 0.28), 0.014, "force", { top: true, arrow: true });
  }
  for (const j of result.joints) {
    if (j.foot && !prims.some((p) => p.kind === "dot" && p.c === j.at)) prims.push({ kind: "dot", c: j.at, r: 0.022, cls: "joint", top: true });
    if (j.momentArm > 0.005) line(j.at, j.foot, 0.012, `moment-arm ma-${j.id}`, { top: true, label: `${Math.round(j.momentArm * 100)} cm` });
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
  // `top`: drawn over the body (true = forces and labels; a number = a smaller lift, e.g. muscles).
  const sorted = prims.map((p) => ({ p, d: depthOf(p) + (p.top === true ? 100 : p.top || 0) })).sort((a, b) => a.d - b.d);
  for (const { p } of sorted) {
    if (p.kind === "poly") {
      el("polygon", { points: p.pts.map((q) => { const r = px(q); return `${r.x.toFixed(1)},${r.y.toFixed(1)}`; }).join(" "), class: p.cls }, svg);
    } else if (p.kind === "dot") {
      const c = px(p.c);
      el("circle", { cx: c.x, cy: c.y, r: p.r * S, class: p.cls }, svg);
    } else {
      const A = px(p.a), B = px(p.b);
      // Body segments get a darker edge so a limb in front stands out from the one behind it.
      if (/(^| )body( |$)/.test(p.cls)) el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: p.cls.replace("body", "body-edge"), "stroke-width": p.w * S + 4 }, svg);
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
