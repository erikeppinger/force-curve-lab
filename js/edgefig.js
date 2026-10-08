// Edge lift figures, one per view tab:
//   Fingers: the four fingers side by side in side view, each in its own posture on the edge, with
//            its flexor tendons (thicker = more tension), the A2 and A4 pulleys (coloured by their
//            share of the cadaver breaking load) and its share of the block.
//   Hand:    the hand from the front (palm towards the viewer, index left) on the edge, with the
//            hand's tilt, each finger's share and the wrist's sideways moment.
//   Arm:     the body holding the block, from the front and from the side, with the shoulder and
//            elbow loads.
// Geometry comes from fingerSet / armLoads (js/finger.js); drawing only.

import { volar, handTilt, fingerPose } from "./finger.js";

const NS = "http://www.w3.org/2000/svg";
const rad = (d) => (d * Math.PI) / 180;
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const rotate = (t) => (p) => ({ x: Math.cos(t) * p.x - Math.sin(t) * p.y, y: Math.sin(t) * p.x + Math.cos(t) * p.y });
const pct = (x) => `${Math.round(x * 100)}%`;

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

/** Colour from calm to alarming for a share of a limit (0 … 1+). */
export const loadColour = (x) => `color-mix(in srgb, var(--warning) ${Math.round(Math.min(1, Math.max(0, x)) * 100)}%, var(--j-ankle))`;
/** Colour for a muscle effort (resting → working). */
const effortColour = (e) => `color-mix(in srgb, var(--muscle-on) ${Math.round(Math.min(1, Math.max(0, e)) * 100)}%, var(--muscle-base))`;

/**
 * Text keeps the same on-screen size whatever the viewBox: --k = viewBox units per screen pixel,
 * used by the label styles (font-size: calc(Npx * var(--k))).
 */
function textScale(svg, vbWidth, vbHeight) {
  // The drawing is fitted into the element (and capped in height by CSS), so the scale is set by
  // whichever side is tighter.
  const r = svg.getBoundingClientRect();
  const k = Math.max(vbWidth / (r.width || vbWidth), vbHeight && r.height ? vbHeight / r.height : 0);
  svg.style.setProperty("--k", k.toFixed(3));
  return k;
}

function arrowDefs(svg, id) {
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id, viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }, mk);
}

/** Drawing helpers in metres with y up, for a viewBox mapped by `px`. */
function pen(svg, px, S) {
  const line = (a, b, cls, wM, extra = {}) => {
    const A = px(a), B = px(b);
    return el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: cls, "stroke-width": wM * S, ...extra }, svg);
  };
  const poly = (pts, cls, extra = {}) => el("polyline", { points: pts.map(px).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" "), class: cls, ...extra }, svg);
  const polygon = (pts, cls, extra = {}) => el("polygon", { points: pts.map(px).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" "), class: cls, ...extra }, svg);
  const dot = (p, rM, cls, extra = {}) => { const q = px(p); return el("circle", { cx: q.x, cy: q.y, r: rM * S, class: cls, ...extra }, svg); };
  const text = (p, s, cls, dx = 0, dy = 0, anchor = "middle") => {
    const q = px(p);
    const t = el("text", { x: q.x + dx, y: q.y + dy, class: `ef-label ${cls}`, "text-anchor": anchor }, svg);
    t.textContent = s;
    return t;
  };
  /** A limb segment: outlined skin. */
  const limb = (a, b, wM, cls = "ef-skin", extra = {}) => { line(a, b, "ef-edge", wM + 3 / S, extra); return line(a, b, cls, wM, extra); };
  return { line, poly, polygon, dot, text, limb };
}

// ---------- Fingers: four side views ----------

/** One finger's points turned so its wrist sits straight above its pad, pad at the origin. */
function sideGeometry(pose) {
  const R = rotate(handTilt(pose));
  const W = Object.fromEntries(["wrist", "mcp", "pip", "dip", "tip", "contact"].map((k) => [k, sub(R(pose[k]), R(pose.contact))]));
  return { R, W };
}

export function renderFingersView(svg, { set, exercise: ex, P, pipDeg }) {
  svg.replaceChildren();
  if (!set) return;
  const narrow = (svg.clientWidth || 700) < 560;
  const cols = narrow ? 2 : 4;
  const S = 2600; // px per metre
  // Every finger in a shared frame (pad at the origin, wrist above it) so the panels line up on the edge.
  const items = set.fingers.map((f) => {
    const pose = f.pose ?? { ...fingerPose(f.g, { ...P, contactFromDip: (P.contactFromDip ?? 0.01) * (f.g.lengths.distal / ex.finger.lengths.distal) }, pipDeg), turn: 0 };
    return { f, pose, ...sideGeometry(pose) };
  });
  const pts = items.flatMap(({ W }) => [lerp(W.mcp, W.wrist, 0.5), W.mcp, W.pip, W.dip, W.tip, W.contact]);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const box = { x0: Math.min(...xs) - 0.03, x1: Math.max(...xs) + 0.035, y0: Math.min(...ys) - 0.045, y1: Math.max(...ys) + 0.01 };
  const pw = (box.x1 - box.x0) * S;
  const k = textScale(svg, pw * cols);
  const head = 58 * k, foot = 62 * k; // room for the labels above and below each panel (screen px × k)
  const ph = (box.y1 - box.y0) * S + head + foot;
  const rows = Math.ceil(items.length / cols);
  svg.setAttribute("viewBox", `0 0 ${(pw * cols).toFixed(0)} ${(ph * rows).toFixed(0)}`);
  arrowDefs(svg, "ef-arrow");

  items.forEach(({ f, pose, R, W }, i) => {
    const ox = (i % cols) * pw, oy = Math.floor(i / cols) * ph + head;
    const px = (p) => ({ x: ox + (p.x - box.x0) * S, y: oy + (box.y1 - p.y) * S });
    const g = el("g", { class: f.touches ? "ef-finger" : "ef-finger ef-off" }, svg);
    const d = pen(g, px, S);
    const phi = pose.phi;
    const n = (a) => R(volar(a)); // palm side of a segment
    const u = (a) => R({ x: Math.sin(a), y: -Math.cos(a) });
    const nMc = n(0), nP = n(phi.p), nM = n(phi.m), nD = n(phi.d);
    const scale = f.g.lengths.proximal / 0.044; // thinner little finger

    // Panel background card
    el("rect", { x: ox + 4 * k, y: oy - head + 4 * k, width: pw - 8 * k, height: ph - 8 * k, rx: 12 * k, class: "ef-panel" }, g);

    // Edge block under the pad (cross-section), the same height in every panel.
    const uD = u(phi.d);
    const e0 = add(add(W.tip, uD, 0.004), nD, 0.008), e1 = add(add(W.tip, uD, -0.024), nD, 0.008);
    d.polygon([e0, e1, add(e1, nD, 0.012), add(e0, nD, 0.012)], "ef-edgeblock");

    // Skin and bones: hand (half the metacarpal), then the three phalanges.
    const palmTop = lerp(W.mcp, W.wrist, 0.5);
    d.limb(palmTop, W.mcp, 0.03 * scale);
    d.limb(W.mcp, W.pip, 0.02 * scale);
    d.limb(W.pip, W.dip, 0.018 * scale);
    d.limb(W.dip, W.tip, 0.016 * scale);
    for (const [a, b] of [[palmTop, W.mcp], [W.mcp, W.pip], [W.pip, W.dip], [W.dip, W.tip]]) d.line(a, b, "ef-bone", 0.003);

    if (f.touches && f.res) {
      const r = f.res;
      // Tendons: from the palm through A2 (FDS ends on the middle phalanx, FDP through A4 to the tip).
      const tw = (T) => Math.min(0.006, 0.0012 + T / 60000);
      const a2 = add(R(r.pulleys.a2Point), nP, 0.004), a4 = add(R(r.pulleys.a4Point), nM, 0.004);
      const off = (p) => sub(p, R(pose.contact));
      const A2 = off(a2), A4 = off(a4);
      const start = [add(palmTop, nMc, 0.011 * scale), add(W.mcp, { x: (nMc.x + nP.x) / 2, y: (nMc.y + nP.y) / 2 }, 0.012 * scale), A2];
      const fdsIns = add(lerp(W.pip, W.dip, f.g.insertions.fds), nM, 0.003);
      const fdpIns = add(lerp(W.dip, W.tip, f.g.insertions.fdp), nD, 0.003);
      d.poly([...start, fdsIns], "ef-tendon ef-fds", { "stroke-width": tw(r.tendons.fds) * S, fill: "none" });
      d.poly([...start, A4, fdpIns], "ef-tendon ef-fdp", { "stroke-width": tw(r.tendons.fdp) * S, fill: "none" });
      // Pulleys as bands, coloured by their share of the breaking load.
      const band = (p, along, len, share, label, side) => {
        d.line(add(p, along, -len / 2), add(p, along, len / 2), "ef-pulley", 0.007, { stroke: loadColour(share / 0.8) });
        d.text(add(p, side, -0.022), `${label} ${pct(share)}`, "ef-small", 0, 4 * k);
      };
      band(add(A2, u(phi.p), -0.007), u(phi.p), 0.014, r.pulleys.a2Share, "A2", nP);
      band(A4, u(phi.m), 0.007, r.pulleys.a4Share, "A4", nM);
      // The block's pull on the pad, longer for a larger share.
      const pad = add(W.contact, nD, 0.008);
      d.line(pad, add(pad, { x: 0, y: -(0.008 + 0.05 * f.share) }), "ef-force", 0.0022, { "marker-end": "url(#ef-arrow)" });
    } else {
      d.text({ x: (box.x0 + box.x1) / 2, y: box.y0 + 0.012 }, "off the edge", "ef-muted", 0, 0);
    }
    for (const j of [W.mcp, W.pip, W.dip]) d.dot(j, 0.0035, "ef-joint");

    // Labels: name and share on top, effort and angles at the bottom.
    const cx = ox + pw / 2;
    el("text", { x: cx, y: oy - head + 26 * k, class: "ef-label ef-name", "text-anchor": "middle" }, g).textContent = f.label;
    el("text", { x: cx, y: oy - head + 48 * k, class: "ef-label ef-share", "text-anchor": "middle" }, g).textContent = f.touches ? `${pct(f.share)} of the block` : "off the edge";
    if (f.touches) {
      const eff = el("text", { x: cx, y: oy + ph - head - foot + 16 * k, class: "ef-label ef-effort", "text-anchor": "middle" }, g);
      eff.textContent = `effort ${pct(f.effort)}`;
      if (f.effort > 1) eff.style.fill = "var(--warning)";
      el("text", { x: cx, y: oy + ph - head - foot + 34 * k, class: "ef-label ef-small", "text-anchor": "middle" }, g).textContent =
        `MCP ${Math.round(f.pose.mcpDeg)}° · PIP ${Math.round(f.pose.pipDeg)}° · DIP ${Math.round(f.pose.dipDeg)}°`;
      if (f.pose.cmcDeg >= 1) el("text", { x: cx, y: oy + ph - head - foot + 50 * k, class: "ef-label ef-small", "text-anchor": "middle" }, g).textContent = `palm cupped ${Math.round(f.pose.cmcDeg)}°`;
    }
  });
}

// ---------- Hand: front view ----------

export function renderHandView(svg, { set, P }) {
  svg.replaceChildren();
  if (!set) return;
  const S = 4200; // px per metre
  const dev = rad(set.deviationDeg);
  // Hand frame (y along the hand, z sideways, thumb side +) → front view turned by the hand's
  // tilt. The viewer looks at the palm with the index on the left.
  const toWorld = (y, z) => ({ y: y * Math.cos(dev) - z * Math.sin(dev), z: y * Math.sin(dev) + z * Math.cos(dev) });
  const fingers = set.fingers.map((f) => {
    const L = f.g.lengths;
    const k = f.pose ? f.pose.turn : 0;
    const kn = -L.metacarpal * Math.cos(k);
    const along = (p) => kn + (f.pose ? p.x * Math.sin(k) + p.y * Math.cos(k) : 0);
    const ys = f.pose
      ? [kn, along(f.pose.pip), along(f.pose.dip), along(f.pose.contact), along(f.pose.tip)]
      : [kn, kn - L.proximal, kn - L.proximal - L.middle, kn - L.proximal - L.middle - L.distal * 0.6, kn - L.proximal - L.middle - L.distal];
    return { f, pts: ys.map((y) => toWorld(y, f.z)), w: 0.017 * (L.proximal / 0.044) };
  });
  const all = fingers.flatMap((x) => x.pts);
  const minY = Math.min(...all.map((p) => p.y));
  const V = { z0: -0.075, z1: 0.075, y0: minY - 0.06, y1: 0.04 };
  svg.setAttribute("viewBox", `0 0 ${((V.z1 - V.z0) * S).toFixed(0)} ${((V.y1 - V.y0) * S).toFixed(0)}`);
  const k = textScale(svg, (V.z1 - V.z0) * S, (V.y1 - V.y0) * S);
  const px = (p) => ({ x: (V.z1 - p.z) * S, y: (V.y1 - p.y) * S });
  const d = pen(svg, (p) => px({ y: p.y, z: p.x }), S); // pen works in {x, y}: x carries z here
  const P2 = (p) => ({ x: p.z, y: p.y });
  arrowDefs(svg, "eh-arrow");

  // Edge block across the hand: one section per finger at its height (the edge shape).
  const mid = fingers.find((x) => x.f.id === "middle");
  const yEdge0 = mid.pts[3].y;
  const tilt = Math.tan(rad(P.edgeTilt ?? 0));
  const zMid = mid.pts[3].z;
  const secs = fingers.map(({ f, pts }) => ({ z0: pts[3].z + 0.0105, z1: pts[3].z - 0.0105, off: set.offsets?.[f.id] ?? 0 }));
  secs[0].z0 += 0.02; secs.at(-1).z1 -= 0.02;
  for (const s of secs) {
    const h = (z) => yEdge0 + s.off + tilt * (z - zMid);
    d.polygon([{ x: s.z0, y: h(s.z0) }, { x: s.z1, y: h(s.z1) }, { x: s.z1, y: h(s.z1) - 0.014 }, { x: s.z0, y: h(s.z0) - 0.014 }], "ef-edgeblock");
  }

  // Forearm, palm (rounded), thumb stub on the index side.
  d.limb({ x: 0, y: 0.04 }, { x: 0, y: 0 }, 0.055);
  const kn = fingers.map(({ pts }) => pts[0]);
  const outline = [P2(toWorld(0.006, 0.029)), P2(toWorld(-0.025, 0.039)), add(P2(kn[0]), { x: 0.006, y: 0 }), ...kn.map(P2), add(P2(kn.at(-1)), { x: -0.006, y: 0 }), P2(toWorld(-0.03, -0.035)), P2(toWorld(0.006, -0.027))];
  d.polygon(outline, "ef-skin ef-palm");

  // Fingers: tapered segments, coloured by effort; dashed if off the edge.
  for (const { f, pts, w } of fingers) {
    const extra = f.touches ? {} : { "stroke-dasharray": "8 8", opacity: 0.55 };
    for (let i = 0; i < 4; i++) {
      const seg = d.limb(P2(pts[i]), P2(pts[i + 1]), w * (1 - i * 0.1), "ef-skin", extra);
      void seg;
    }
    d.dot(P2(pts[0]), 0.0028, "ef-joint"); // knuckle
    const c = P2(pts[3]);
    if (f.touches && f.share > 0.005) {
      const len = 0.01 + 0.035 * f.share;
      d.line({ x: c.x, y: c.y - 0.006 }, { x: c.x, y: c.y - 0.006 - len }, "ef-force", 0.0018, { "marker-end": "url(#eh-arrow)" });
      d.text({ x: c.x, y: c.y - 0.006 - len }, pct(f.share), "ef-share", 0, 18 * k);
    }
    d.text({ x: c.x, y: minY - 0.045 }, f.label, f.touches ? "ef-name" : "ef-name ef-muted", 0, 0);
    if (f.touches) { const t = d.text({ x: c.x, y: minY - 0.045 }, pct(f.effort), "ef-effort", 0, 18 * k); if (f.effort > 1) t.style.fill = "var(--warning)"; }
  }

  // Wrist: sideways moment as a curved arrow, and the hand's tilt and roll.
  const m = set.wristSide;
  if (Math.abs(m) > 0.05) {
    const r = 0.022, s = m > 0 ? 1 : -1; // + = load towards the thumb side
    const a0 = rad(60), a1 = rad(120);
    const arc = (a) => ({ x: s * r * Math.cos(a), y: 0.012 + r * Math.sin(a) });
    const p0 = px({ z: arc(a0).x, y: arc(a0).y }), p1 = px({ z: arc(a1).x, y: arc(a1).y });
    el("path", { d: `M${p0.x},${p0.y} A${r * S},${r * S} 0 0 ${s > 0 ? 0 : 1} ${p1.x},${p1.y}`, class: "ef-moment", "marker-end": "url(#eh-arrow)" }, svg);
    d.text({ x: 0, y: 0.04 }, `wrist ${Math.abs(m).toFixed(1)} Nm sideways`, "ef-small", 0, -6);
  }
  const notes = [];
  if (Math.abs(set.deviationDeg) >= 1) notes.push(`tilted ${Math.abs(set.deviationDeg).toFixed(0)}° towards the ${set.deviationDeg > 0 ? "little finger" : "thumb"}`);
  if (Math.abs(set.rollDeg ?? 0) >= 1) notes.push(`rolled ${Math.abs(set.rollDeg).toFixed(0)}°`);
  if (notes.length) d.text({ x: 0, y: minY - 0.045 }, `Hand ${notes.join(", ")}`, "ef-small", 0, 40 * k);
}

// ---------- Arm: body from the front and the side ----------

export function renderArmView(svg, { arm, P, loadKg }) {
  svg.replaceChildren();
  if (!arm) return;
  const W = 700, H = 380;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  textScale(svg, W, H);
  arrowDefs(svg, "ea-arrow");
  const panel = (ox, title, angleDeg, side, torque, effort) => {
    // Schematic body in px: shoulder at the top of the trunk, the arm turned by angleDeg.
    const g = el("g", {}, svg);
    el("rect", { x: ox + 8, y: 8, width: W / 2 - 16, height: H - 16, rx: 14, class: "ef-panel" }, g);
    const T = (x, y, s, cls, anchor = "middle") => { const t = el("text", { x, y, class: `ef-label ${cls}`, "text-anchor": anchor }, g); t.textContent = s; return t; };
    T(ox + W / 4, 36, title, "ef-name");
    // As taught: the straight arm rests on the front of the hip and the block hangs in front of the
    // body between the legs. The model's arm angles are measured from there (0° = resting); the
    // resting arm's own small slant is carried by the hip, not the shoulder.
    const cx = ox + W / 4;
    const front = side === "front";
    const sh = { x: cx + (front ? 26 : 2), y: 110 };
    const up = 70, fore = 66;
    const rest = front ? -Math.asin(26 / (up + fore)) : rad(8); // hand at the midline / just in front of the thigh
    const t = rest + rad(angleDeg);
    const elb = { x: sh.x + up * Math.sin(t), y: sh.y + up * Math.cos(t) };
    const hand = { x: elb.x + fore * Math.sin(t), y: elb.y + fore * Math.cos(t) };
    const ln = (a, b, cls, w, extra = {}) => el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls, "stroke-width": w, ...extra }, g);
    const limb = (a, b, w) => { ln(a, b, "ef-edge", w + 3); ln(a, b, "ef-skin", w); };
    // Body: head, trunk, legs (front: apart, the other arm at the side; side: one leg).
    const hip = { x: cx, y: 230 };
    if (front) {
      limb({ x: cx - 13, y: 232 }, { x: cx - 36, y: 330 }, 22);
      limb({ x: cx + 13, y: 232 }, { x: cx + 36, y: 330 }, 22);
      limb({ x: cx - 27, y: 112 }, { x: cx - 32, y: 222 }, 15);
    } else limb(hip, { x: cx + 2, y: 330 }, 26);
    limb({ x: cx, y: 105 }, hip, 46);
    el("circle", { cx, cy: 72, r: 20, class: "ef-skin ef-head" }, g);
    // Arm, hand and block on its pin.
    limb(sh, elb, 17);
    limb(elb, hand, 15);
    ln(hand, { x: hand.x, y: hand.y + 30 }, "ef-pin", 3);
    el("rect", { x: hand.x - 18, y: hand.y + 30, width: 36, height: 26, rx: 4, class: "ef-weight" }, g);
    T(hand.x, hand.y + 48, `${Math.round(loadKg)} kg`, "ef-onweight");
    // Lever: the load line against the shoulder.
    if (Math.abs(angleDeg) > 0.5) {
      ln(sh, { x: sh.x, y: hand.y + 20 }, "ef-lever", 1.5);
      ln({ x: sh.x, y: hand.y + 20 }, { x: hand.x, y: hand.y + 20 }, "ef-lever", 1.5);
    }
    // Joints: ring coloured by effort, torque next to it.
    const joint = (p, e, label) => {
      el("circle", { cx: p.x, cy: p.y, r: 11, class: "ef-arm-joint", style: `fill: ${effortColour(e)}` }, g);
      T(p.x + 20, p.y + 5, label, "ef-small", "start");
    };
    joint(sh, effort.shoulder, `shoulder ${torque.shoulder.toFixed(0)} Nm · ${pct(effort.shoulder)}`);
    joint(elb, effort.elbow, `elbow ${torque.elbow.toFixed(0)} Nm · ${pct(effort.elbow)}`);
    T(ox + W / 4, H - 18, Math.abs(angleDeg) < 0.5 ? (front ? "arm resting on the hip, block between the legs" : "arm resting on the front of the thigh") : `arm ${angleDeg.toFixed(0)}° ${front ? "out to the side" : "forward"} of resting`, "ef-small");
  };
  const e = arm.effort;
  panel(0, "From the front", P.armSide ?? 0, "front", { shoulder: arm.shoulderSide, elbow: arm.elbow }, { shoulder: e.shoulderSide, elbow: e.elbow });
  panel(W / 2, "From the side", P.armForward ?? 0, "side", { shoulder: arm.shoulderForward, elbow: arm.elbow }, { shoulder: e.shoulderForward, elbow: e.elbow });
}
