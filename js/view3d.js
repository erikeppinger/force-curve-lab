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
    // A muscle from the trunk to a limb (`origin`, e.g. the pectoralis from the collarbone and breastbone):
    // a fan of fibres from the origin points to the insertion (`along[1]` on the segment), both sides.
    const ori = d.origin && result.frames[d.origin]?.points;
    if (ori) {
      for (const o of ori) for (const [p, q] of result.asymmetric ? [[o, b]] : [[o, b], [mirrorZ(o), mirrorZ(b)]]) {
        line(p, q, d.w, "muscle-base", { title: m.name });
        line(p, q, d.w, "muscle-on", { opacity: act[m.id], title: `${m.name}: ${Math.round(act[m.id] * 100)}%` });
      }
      continue;
    }
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
export function bounds3d(scenes, cam, margin = 0.12) {
  const xs = [], ys = [];
  const put = (p, r = 0) => { const q = project(p, cam); xs.push(q.x - r, q.x + r); ys.push(q.y - r, q.y + r); };
  for (const prims of scenes) {
    for (const p of prims) {
      if (p.kind === "line") { put(p.a, p.w / 2); put(p.b, p.w / 2); }
      else if (p.kind === "dot") put(p.c, p.r);
      else p.pts.forEach((q) => put(q));
    }
  }
  const m = margin;
  return { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m };
}

/**
 * Parts for body pieces that don't name one: the trunk (thick lines), the bars across the hips and
 * shoulders (plain "body" lines running sideways, along z) and the head make the torso; other body lines that
 * share an end point and a style (a thigh, its shank and foot) make one limb.
 */
export function autoParts(prims) {
  const bodyCls = (p) => /(^| )body( |$)/.test(p.cls ?? "");
  const out = prims.map((p) => ({ ...p }));
  const free = [];
  for (const p of out) {
    if (p.part || !bodyCls(p)) continue;
    if (p.kind === "dot") { if (p.r >= 0.09 && p.cls === "body") p.part = "torso"; continue; }
    if (p.kind !== "line") continue;
    const d = sub3(p.b, p.a), l = Math.hypot(d.x, d.y, d.z) || 1;
    if (p.cls === "body" && (p.w >= 0.25 || Math.abs(d.z / l) > 0.9)) p.part = "torso";
    else free.push(p);
  }
  // Union-find over shared end points (same style).
  const parent = free.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const same = (u, v) => Math.hypot(u.x - v.x, u.y - v.y, u.z - v.z) < 1e-6;
  for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
    const p = free[i], q = free[j];
    if (p.cls === q.cls && [p.a, p.b].some((u) => same(u, q.a) || same(u, q.b))) parent[find(i)] = find(j);
  }
  free.forEach((p, i) => { p.part = `limb${find(i)}`; });
  return out;
}

export function renderView3d(svg, prims, cam, V) {
  svg.setAttribute("viewBox", `0 0 ${((V.x1 - V.x0) * S).toFixed(1)} ${((V.y1 - V.y0) * S).toFixed(1)}`);
  svg.replaceChildren();
  const px = (p) => { const q = project(p, cam); return { x: (q.x - V.x0) * S, y: (V.y1 - q.y) * S, depth: q.depth }; };
  const depthOf = (p) => (p.kind === "line" ? (px(p.a).depth + px(p.b).depth) / 2 : p.kind === "dot" ? px(p.c).depth : p.pts.reduce((s, q) => s + px(q).depth, 0) / p.pts.length);
  // `top`: drawn over the body (true = forces and labels; a number = a smaller lift, e.g. muscles).
  // `part`: body pieces of one part (the trunk with hips, shoulders and head; one limb) are drawn
  // together at the part's mean depth, outlines first and then fills, so the part has an outline
  // round itself but none inside (no stray caps at the hips or knees). A part drawn see-through
  // ("back") gets its opacity as a group, so where its pieces overlap it isn't darker.
  const items = [], parts = new Map();
  for (const p of autoParts(prims)) {
    const d = depthOf(p) + (p.top === true ? 100 : p.top || 0);
    if (!p.part) { items.push({ p, d }); continue; }
    let g = parts.get(p.part);
    if (!g) { g = { list: [], sum: 0 }; parts.set(p.part, g); items.push(g); }
    g.list.push({ p, d }); g.sum += d;
  }
  for (const g of parts.values()) g.d = g.sum / g.list.length;
  // Muscles on a body part: drawn with that part, over it where they face the camera, under it on the
  // far side. Sorted on their own they could fall behind the part's mean depth and vanish as the view
  // turned (a muscle on the front of the thigh, behind the leg's average depth seen from the side).
  const isBodyLine = (p) => p.kind === "line" && /(^| )body( |$)/.test(p.cls);
  const onPart = (m) => {
    const mid = { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2, z: (m.a.z + m.b.z) / 2 };
    let best = null;
    for (const [name, g] of parts) for (const { p } of g.list) {
      if (!isBodyLine(p) || /ghost/.test(p.cls)) continue;
      const ab = sub3(p.b, p.a), L2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1;
      const t = Math.max(0, Math.min(1, ((mid.x - p.a.x) * ab.x + (mid.y - p.a.y) * ab.y + (mid.z - p.a.z) * ab.z) / L2));
      const c = add3(p.a, ab, t), dist = Math.hypot(mid.x - c.x, mid.y - c.y, mid.z - c.z);
      // On the camera's side unless its offset from the limb's axis points well away from the camera:
      // a muscle at the limb's visible edge (offset across the view) stays on top.
      if (dist < p.w / 2 + 0.06 && (!best || dist < best.dist)) best = { name, dist, front: px(mid).depth - px(c).depth >= -0.3 * dist };
    }
    return best;
  };
  for (let i = items.length - 1; i >= 0; i--) {
    const p = items[i].p;
    if (!p || p.kind !== "line" || p.top === true || !/(^| )(muscle|tendon)-(base|on|idle)( |$)/.test(p.cls)) continue;
    const hit = onPart(p);
    if (!hit) continue;
    const g = parts.get(hit.name);
    (hit.front ? (g.over ??= []) : (g.under ??= [])).push(items[i]);
    items.splice(i, 1);
  }
  items.sort((a, b) => a.d - b.d);
  const isBody = (p) => p.kind === "line" && /(^| )body( |$)/.test(p.cls);
  const edge = (p, parent, cls = p.cls) => {
    const A = px(p.a), B = px(p.b);
    el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls.replace("body", "body-edge"), "stroke-width": p.w * S + Math.min(4, 0.3 * p.w * S) }, parent);
  };
  const draw = (p, parent, { withEdge = true, cls = p.cls } = {}) => {
    if (p.kind === "poly") {
      el("polygon", { points: p.pts.map((q) => { const r = px(q); return `${r.x.toFixed(1)},${r.y.toFixed(1)}`; }).join(" "), class: cls }, parent);
    } else if (p.kind === "dot") {
      const c = px(p.c);
      el("circle", { cx: c.x, cy: c.y, r: p.r * S, class: cls }, parent);
    } else {
      const A = px(p.a), B = px(p.b);
      // Body segments get a darker edge so a limb in front stands out from the one behind it.
      if (withEdge && isBody(p)) edge(p, parent, cls);
      const attrs = { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": p.w * S };
      if (p.opacity != null) attrs["stroke-opacity"] = p.opacity.toFixed(3);
      if (p.arrow) attrs["marker-end"] = "url(#arrow)";
      const n = el("line", attrs, parent);
      if (p.title) el("title", {}, n).textContent = p.title;
      if (p.label) {
        el("text", { x: (A.x + B.x) / 2 + 4, y: (A.y + B.y) / 2 - 6, class: `fig-label ma-label ${p.cls.split(" ").find((c) => c.startsWith("ma-"))}` }, parent).textContent = p.label;
      }
    }
  };
  for (const it of items) {
    if (it.p) { draw(it.p, svg); continue; }
    const list = it.list.sort((a, b) => a.d - b.d).map((x) => x.p);
    const back = list.every((p) => /(^| )back( |$)/.test(p.cls ?? ""));
    // Its muscles on the far side first (the part then covers them), base before the activation shade.
    const byDepth = (arr) => (arr ?? []).sort((a, b) => a.d - b.d || (/(muscle|tendon)-on/.test(a.p.cls) ? 1 : 0) - (/(muscle|tendon)-on/.test(b.p.cls) ? 1 : 0)).map((x) => x.p);
    for (const p of byDepth(it.under)) draw(p, svg);
    const g = el("g", { class: back ? "part back" : "part" }, svg);
    const own = (p) => (back ? p.cls.replace(/(^| )back( |$)/, "$1").trim() : p.cls);
    for (const p of list) if (isBody(p)) edge(p, g, own(p));
    for (const p of list) draw(p, g, { withEdge: false, cls: own(p) });
    for (const p of byDepth(it.over)) draw(p, svg);
  }
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, mk);
}
