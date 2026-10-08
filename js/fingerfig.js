// Side view of the edge lift: hand hanging from the forearm, one finger on the edge, the block's
// pull through the loading pin, flexor tendons drawn thicker the harder they pull, and the A2/A4
// pulleys with their loads. Geometry comes from js/finger.js (local frame), turned so the load
// hangs straight down under the wrist.

import { volar } from "./finger.js";

const NS = "http://www.w3.org/2000/svg";
const S = 2400; // px per metre
const MARGIN = 0.02;
const FOREARM = 0.035; // m of forearm drawn above the wrist
const PIN = 0.035; // m from the edge down to the weight

const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unit = (a) => { const l = Math.hypot(a.x, a.y); return { x: a.x / l, y: a.y / l }; };
const rot = (t) => (p) => ({ x: Math.cos(t) * p.x - Math.sin(t) * p.y, y: Math.sin(t) * p.x + Math.cos(t) * p.y });

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

/** Key points of one result in the drawing frame (wrist above the contact). */
function world(r) {
  const R = rot(r.tilt);
  const p = r.pose;
  const W = Object.fromEntries(["wrist", "mcp", "pip", "dip", "tip", "contact"].map((k) => [k, R(p[k])]));
  return { R, W };
}

/** Bounds over all sampled PIP angles, so the figure doesn't jump while animating. */
export function fingerBounds(samples) {
  const pts = samples.flatMap((r) => {
    const { W } = world(r);
    // Crop to the finger and the lower half of the palm; the wrist is off the top.
    return [lerp(W.mcp, W.wrist, 0.45), W.mcp, W.pip, W.dip, W.tip, add(W.contact, { x: 0, y: -PIN - 0.014 })];
  });
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) - MARGIN - 0.02, x1: Math.max(...xs) + MARGIN + 0.03, y0: Math.min(...ys) - MARGIN, y1: Math.max(...ys) + MARGIN };
}

export function renderFingerFigure(svg, { exercise, result: r, bounds: V }) {
  svg.setAttribute("viewBox", `0 0 ${((V.x1 - V.x0) * S).toFixed(1)} ${((V.y1 - V.y0) * S).toFixed(1)}`);
  svg.replaceChildren();
  const px = (p) => ({ x: (p.x - V.x0) * S, y: (V.y1 - p.y) * S });
  const line = (a, b, cls, wM, extra = {}) => {
    const A = px(a), B = px(b);
    return el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": wM * S, ...extra }, svg);
  };
  const poly = (pts, cls, extra = {}) => el("polyline", { points: pts.map(px).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" "), class: cls, ...extra }, svg);
  const text = (p, s, cls, dx = 0, dy = 0, anchor = "start") => { const q = px(p); el("text", { x: q.x + dx, y: q.y + dy, class: `fig-label ${cls}`, "text-anchor": anchor }, svg).textContent = s; };

  const f = exercise.finger;
  const { R, W } = world(r);
  const phi = r.pose.phi;
  const n = (a) => R(volar(a)); // palm-side normal in the drawing frame
  const u = (a) => R({ x: Math.sin(a), y: -Math.cos(a) });
  const nMc = n(0), nP = n(phi.p), nM = n(phi.m), nD = n(phi.d);

  // Load line: straight up from the edge through the wrist (the hand hangs so the wrist needs no moment)
  line(W.contact, add(W.contact, { x: 0, y: 0.2 }), "line-of-action", 0.0006);

  // Body: forearm, palm, phalanges (skin), then bones
  line(add(W.wrist, { x: 0, y: FOREARM }), W.wrist, "body", 0.05);
  line(W.wrist, W.mcp, "body", 0.034);
  line(W.mcp, W.pip, "body", 0.02);
  line(W.pip, W.dip, "body", 0.018);
  line(W.dip, W.tip, "body", 0.016);
  for (const [a, b] of [[W.wrist, W.mcp], [W.mcp, W.pip], [W.pip, W.dip], [W.dip, W.tip]]) line(a, b, "bone", 0.004);
  text(add(lerp(W.mcp, W.wrist, 0.4), nMc, -0.024), "↑ wrist", "joint-name", 0, 0, "middle");

  // Edge on the finger pad, the loading pin and the block's weight
  const uD = u(phi.d);
  const pad = add(W.contact, nD, 0.008);
  const e0 = add(add(W.tip, uD, 0.004), nD, 0.008), e1 = add(add(W.tip, uD, -0.024), nD, 0.008);
  poly([e0, e1, add(e1, nD, 0.012), add(e0, nD, 0.012), e0], "edge");
  const pinTop = add(pad, { x: 0, y: 0.006 });
  const weight = add(W.contact, { x: 0, y: -PIN });
  line(pinTop, weight, "cable", 0.0015);
  const Wp = px(weight);
  el("circle", { cx: Wp.x, cy: Wp.y, r: 0.011 * S, class: "weight" }, svg);
  line(pad, add(pad, { x: 0, y: -0.022 }), "force", 0.002, { "marker-end": "url(#arrow)" });
  text(add(pad, { x: 0, y: -0.022 }), `F = ${r.fingertipN.toFixed(0)} N`, "force-label", 6, 4);

  // Tendons: wrist → MCP → A2 → (FDS: middle-phalanx insertion | FDP: A4 → distal insertion)
  const tw = (T) => Math.min(0.006, 0.0012 + T / 60000); // m of stroke per newton
  const at = (p, nn, d) => add(p, nn, d);
  const a2 = at(R(r.pulleys.a2Point), nP, 0.004);
  const a4 = at(R(r.pulleys.a4Point), nM, 0.004);
  const start = [at(W.wrist, nMc, 0.011), at(W.mcp, unit(add(nMc, nP)), 0.012), a2];
  const fdsIns = at(lerp(W.pip, W.dip, f.insertions.fds), nM, 0.003);
  const fdpIns = at(lerp(W.dip, W.tip, f.insertions.fdp), nD, 0.003);
  poly([...start, fdsIns], "tendon tendon-fds", { "stroke-width": tw(r.tendons.fds) * S });
  poly([...start, a4, fdpIns], "tendon tendon-fdp", { "stroke-width": tw(r.tendons.fdp) * S });
  const tl = add(lerp(W.mcp, W.wrist, 0.3), nMc, 0.022);
  text(tl, `FDP ${r.tendons.fdp.toFixed(0)} N`, "tendon-label tl-fdp", 0, -8);
  text(tl, `FDS ${r.tendons.fds.toFixed(0)} N`, "tendon-label tl-fds", 0, 10);

  // Pulleys: bands across the tendons, labelled with their load
  const band = (p, along, nn, len, cls, label, load) => {
    const a = add(p, along, -len / 2), b = add(p, along, len / 2);
    line(a, b, `pulley-band ${cls}`, 0.006);
    text(add(p, nn, -0.019), `${label} ${load.toFixed(0)} N`, `pulley-label ${cls}`, 0, 4, "middle");
  };
  band(add(a2, u(phi.p), -0.007), u(phi.p), nP, 0.014, "pl-a2", "A2", r.pulleys.a2);
  band(a4, u(phi.m), nM, 0.007, "pl-a4", "A4", r.pulleys.a4);

  for (const j of [W.wrist, W.mcp, W.pip, W.dip]) { const q = px(j); el("circle", { cx: q.x, cy: q.y, r: 0.0035 * S, class: "joint" }, svg); }
  const lab = (p, s, nn) => text(add(p, nn, 0.016), s, "joint-name", 0, 4, "middle");
  lab(W.mcp, "MCP", nP); lab(W.pip, "PIP", nM); lab(W.dip, "DIP", nD);

  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, mk);
}
