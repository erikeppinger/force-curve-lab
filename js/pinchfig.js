// Pinch lift figure: the block from the front, the thumb pressing one face and the index finger
// (standing for the fingers) the other, each in its measured posture for this width, with the
// squeeze on each face and the friction holding the block. Geometry from pincerGeometry
// (js/pincer.js: each digit a planar chain, base at the origin, flexion towards +y, the palm
// side); drawing only.

const NS = "http://www.w3.org/2000/svg";
function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

/**
 * Place a digit so its pad presses the face at x = faceX, the push into the block along `towards`
 * (+1 = to the right), the digit running up from its pad (the hand above the block).
 */
function placeDigit(d, faceX, towards) {
  const t = Math.atan2(0, towards) - Math.atan2(d.volar.y, d.volar.x); // turn the palm side onto the face
  const R = (p) => ({ x: Math.cos(t) * p.x - Math.sin(t) * p.y, y: Math.sin(t) * p.x + Math.cos(t) * p.y });
  let pts = [...d.joints, d.tip].map(R);
  let pad = R(d.pad);
  if (pts[0].y < pad.y) { pts = pts.map((p) => ({ x: p.x, y: 2 * pad.y - p.y })); } // base above the pad
  const shift = { x: faceX - pad.x, y: -pad.y };
  return { pts: pts.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })), pad: { x: faceX, y: 0 } };
}

/** r: analyzePinch's result. */
export function renderPinchView(svg, { r }) {
  svg.replaceChildren();
  const G = r.geometry;
  const w = r.widthMm / 1000;
  const thumb = placeDigit(G.thumb, -w / 2, 1);
  const index = placeDigit(G.index, w / 2, -1);
  const all = [...thumb.pts, ...index.pts, { x: -w / 2 - 0.02, y: -0.07 }, { x: w / 2 + 0.02, y: -0.07 }];
  const x0 = Math.min(...all.map((p) => p.x)) - 0.03, x1 = Math.max(...all.map((p) => p.x)) + 0.03;
  const y0 = Math.min(...all.map((p) => p.y)) - 0.01, y1 = Math.max(...all.map((p) => p.y)) + 0.02;
  const S = 1000; // viewBox units per metre
  svg.setAttribute("viewBox", `0 0 ${((x1 - x0) * S).toFixed(0)} ${((y1 - y0) * S).toFixed(0)}`);
  const rect = svg.getBoundingClientRect();
  svg.style.setProperty("--k", Math.max(((x1 - x0) * S) / (rect.width || (x1 - x0) * S), 0.2).toFixed(3));
  const px = (p) => ({ x: (p.x - x0) * S, y: (y1 - p.y) * S });
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "pa", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, mk);
  const line = (a, b, cls, wM, extra = {}) => { const A = px(a), B = px(b); return el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": wM * S, ...extra }, svg); };
  const text = (p, s, cls, anchor = "middle") => { const q = px(p); const t = el("text", { x: q.x, y: q.y, class: `ef-label ${cls}`, "text-anchor": anchor }, svg); t.textContent = s; return t; };

  // The block, hanging below the pads.
  const A = px({ x: -w / 2, y: 0.012 }), B = px({ x: w / 2, y: -0.07 });
  el("rect", { x: A.x, y: A.y, width: B.x - A.x, height: B.y - A.y, class: "ef-edgeblock" }, svg);
  text({ x: 0, y: -0.04 }, `${r.widthMm.toFixed(0)} mm`, "ef-small");
  // Digits: skin, bones, joints.
  for (const [d, label] of [[thumb, "Thumb"], [index, r.fingers > 1 ? `Fingers (${r.fingers})` : "Finger"]]) {
    for (let i = 0; i < d.pts.length - 1; i++) line(d.pts[i], d.pts[i + 1], "ef-skin", 0.016);
    for (let i = 0; i < d.pts.length - 1; i++) line(d.pts[i], d.pts[i + 1], "ef-bone", 0.004);
    for (const p of d.pts.slice(0, -1)) { const q = px(p); el("circle", { cx: q.x, cy: q.y, r: 0.0035 * S, class: "ef-joint" }, svg); }
    const top = d.pts.reduce((a, p) => (p.y > a.y ? p : a));
    text({ x: top.x, y: top.y + 0.008 }, label, "ef-name");
  }
  // Squeeze (into each face) and friction (up along each face).
  if (r.squeezeN > 0) {
    const L = 0.025;
    line({ x: -w / 2 - L - 0.01, y: 0 }, { x: -w / 2 - 0.004, y: 0 }, "ef-force", 0.003, { "marker-end": "url(#pa)" });
    line({ x: w / 2 + L + 0.01, y: 0 }, { x: w / 2 + 0.004, y: 0 }, "ef-force", 0.003, { "marker-end": "url(#pa)" });
    text({ x: 0, y: 0.022 }, `squeeze ${Math.round(r.squeezeN)} N each side`, "ef-share");
    const up = (x, F) => { const h = Math.min(0.035, 0.035 * F / Math.max(1, r.W / 2)); line({ x, y: -0.06 }, { x, y: -0.06 + h }, "ef-moment", 0.0025, { "marker-end": "url(#pa)" }); };
    up(-w / 2 + 0.006, r.friction.thumb);
    up(w / 2 - 0.006, r.friction.fingers);
    text({ x: 0, y: -0.062 }, `friction ${Math.round(r.friction.thumb)} + ${Math.round(r.friction.fingers)} N`, "ef-small");
  }
}
