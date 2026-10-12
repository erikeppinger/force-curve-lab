// 3D hand view for the edge lift: bones and every muscle's path from the ARMS hand model
// (data/opensim/arms-hand.json, NON-COMMERCIAL licence: the view says so), at the grip's preset
// posture. The flexor tendons the edge-lift statics computes (FDP, FDS per finger) are coloured by
// their tension ÷ that finger's maximum; the other muscles are drawn grey (not modelled).
//
// Hand frame (export, right-handed): x along the middle metacarpal towards the fingers, y to the
// palm, z towards the thumb. Drawn with the fingers pointing right (x), back of the hand up.

// Turned 180° about the finger axis (y → −y, z → −z): back of the hand up, no mirroring.
const v3 = ([x, y, z]) => ({ x, y: -y, z: -z });
const SLIP = { I: "index", M: "middle", R: "ring", L: "little" };

/** The muscle's finger and tendon for the app's statics ("FDPI" → index fdp), or null. */
function tendonOf(name) {
  const m = /^(FDP|FDS)([IMRL])$/.exec(name);
  return m ? { finger: SLIP[m[2]], tendon: m[1].toLowerCase() } : null;
}

/** Display name of an ARMS muscle (abbreviation as in the model, with a plain name for the main ones). */
const NAMES = { FDP: "Deep finger flexor (FDP)", FDS: "Superficial finger flexor (FDS)", EDC: "Finger extensor (EDC)", LUM: "Lumbrical", FPL: "Long thumb flexor (FPL)",
  ECRL: "Wrist extensor ECRL", ECRB: "Wrist extensor ECRB", ECU: "Wrist extensor ECU", FCR: "Wrist flexor FCR", FCU: "Wrist flexor FCU", PL: "Palmaris longus" };
const nameOf = (n) => { const k = Object.keys(NAMES).find((p) => n.startsWith(p)); return k ? `${NAMES[k]}${n.length > k.length ? ` ${n.slice(k.length)}` : ""}` : n; };

/**
 * Primitives for js/view3d.js. `posture`: the ARMS export's posture (joints, muscles); `fingers`:
 * the edge-lift statics' set.fingers (res.tendons, tmax, touches). `valueOf(name)`, if given,
 * replaces that: each ARMS muscle's activation 0–1, or null when the statics don't model it.
 */
export function handScene3d(posture, fingers, valueOf) {
  const prims = [];
  const L = (a, b, w, cls, extra) => prims.push({ kind: "line", a: v3(a), b: v3(b), w, cls, ...extra });
  const J = posture.joints;
  // Bones: metacarpals and phalanges as body lines, thinner towards the tips; the thumb likewise.
  for (const f of ["index", "middle", "ring", "little"]) {
    const p = J[f];
    L(J.wrist, p[0], 0.012, "body back", { bone: true });
    for (let i = 0; i + 1 < p.length; i++) L(p[i], p[i + 1], [0.016, 0.014, 0.012, 0.011][i] ?? 0.011, "body", { bone: true });
  }
  for (let i = 0; i + 1 < J.thumb.length; i++) L(J.thumb[i], J.thumb[i + 1], 0.015, "body", { bone: true });
  L(J.wrist, J.thumb[0], 0.014, "body back", { bone: true });
  L([J.wrist[0] - 0.08, J.wrist[1], J.wrist[2]], J.wrist, 0.05, "body back"); // forearm stub (clipped by the frame)
  // Muscles along their model paths.
  const byId = Object.fromEntries((fingers ?? []).map((f) => [f.id, f]));
  for (const [name, m] of Object.entries(posture.muscles)) {
    const t = tendonOf(name);
    const f = t && byId[t.finger];
    const value = valueOf ? valueOf(name) : f ? (f.touches ? Math.min(1, (f.res?.tendons?.[t.tendon] ?? 0) / (f.tmax?.[t.tendon] || 1)) : 0) : null;
    const title = value == null ? `${nameOf(name)}: not modelled (path only)` : `${nameOf(name)}: ${Math.round(value * 100)}% ${valueOf ? "of its maximum" : "of this finger's maximum"}`;
    const w = t ? 0.0035 : 0.0022;
    for (let i = 1; i < m.path.length; i++) {
      L(m.path[i - 1], m.path[i], w, value == null ? "tendon-idle" : "muscle-base", { title, top: 20 });
      if (value != null) L(m.path[i - 1], m.path[i], w, "muscle-on", { opacity: value, title, top: 20 });
    }
  }
  return prims;
}

/**
 * Pinch lift: the whole-hand model's activations (pincer.js pinchHand: thumb muscles by their ARMS
 * names, FDP_index, FDS_index, EXT_index ...) on the ARMS muscles; the finger extensor estimate is
 * shown on the EDC slip. Muscles the model leaves out are null (drawn grey).
 */
export function pinchValueOf(act) {
  return (name) => {
    if (!act) return null;
    const m = /^(FDP|FDS|EDC)([IMRL])$/.exec(name);
    const key = m ? `${m[1] === "EDC" ? "EXT" : m[1]}_${SLIP[m[2]]}` : name;
    return act[key] == null ? null : Math.max(0, Math.min(1, act[key]));
  };
}

/** The block between the thumb pad and the finger pads: a see-through box `widthMm` wide. */
export function pinchBlock(posture, widthMm) {
  const J = posture.joints;
  const P = (p) => v3(p);
  const t = P(J.thumb.at(-1));
  const fingerTips = ["index", "middle", "ring", "little"].map((f) => P(J[f].at(-1)));
  const f = { x: 0, y: 0, z: 0 };
  for (const q of fingerTips.slice(0, 2)) { f.x += q.x / 2; f.y += q.y / 2; f.z += q.z / 2; }
  const d = { x: f.x - t.x, y: f.y - t.y, z: f.z - t.z }, l = Math.hypot(d.x, d.y, d.z) || 1;
  const n = { x: d.x / l, y: d.y / l, z: d.z / l };
  // Second axis: along the fingers (hand x) made square to n; third: n × that.
  let u = { x: 1 - n.x * n.x, y: -n.x * n.y, z: -n.x * n.z };
  const ul = Math.hypot(u.x, u.y, u.z) || 1; u = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
  const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
  const c = { x: (t.x + f.x) / 2, y: (t.y + f.y) / 2, z: (t.z + f.z) / 2 };
  const [a, b, h] = [widthMm / 2000, 0.03, 0.06];
  const corner = (i, j, k) => ({ x: c.x + n.x * a * i + u.x * b * j + v.x * h * k, y: c.y + n.y * a * i + u.y * b * j + v.y * h * k, z: c.z + n.z * a * i + u.z * b * j + v.z * h * k });
  const faces = [[[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]];
  return faces.map((fc) => ({ kind: "poly", pts: fc.map(([i, j, k]) => corner(i, j, k)), cls: "plate3d block3d", block: true }));
}
