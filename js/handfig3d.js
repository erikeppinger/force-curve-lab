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
  // See-through ("back"), so the tendons and muscles on the far side show from every angle.
  for (const f of ["index", "middle", "ring", "little"]) {
    const p = J[f];
    L(J.wrist, p[0], 0.012, "body back", { bone: true });
    for (let i = 0; i + 1 < p.length; i++) L(p[i], p[i + 1], [0.016, 0.014, 0.012, 0.011][i] ?? 0.011, "body back", { bone: true });
  }
  for (let i = 0; i + 1 < J.thumb.length; i++) L(J.thumb[i], J.thumb[i + 1], 0.015, "body back", { bone: true });
  L(J.wrist, J.thumb[0], 0.014, "body back", { bone: true });
  L([J.wrist[0] - 0.08, J.wrist[1], J.wrist[2]], J.wrist, 0.05, "body back"); // forearm stub (clipped by the frame)
  // Muscles along their model paths: the belly from the origin, then the tendon (its length from
  // the model, measured back from the insertion), drawn thinner and in its own colour (the finger
  // flexors' as in the 2D finger figure: FDP, FDS); both shaded by the muscle's force (a tendon
  // carries its muscle's force).
  const byId = Object.fromEntries((fingers ?? []).map((f) => [f.id, f]));
  for (const [name, m] of Object.entries(posture.muscles)) {
    const t = tendonOf(name);
    const f = t && byId[t.finger];
    const value = valueOf ? valueOf(name) : f ? (f.touches ? Math.min(1, (f.res?.tendons?.[t.tendon] ?? 0) / (f.tmax?.[t.tendon] || 1)) : 0) : null;
    const share = value == null ? "not modelled (path only)" : `${Math.round(value * 100)}% ${valueOf ? "of its maximum" : "of this finger's maximum"}`;
    const [belly, tendon] = splitPath(m.path, m.tendon ?? 0);
    const draw = (pts, w, base, on, title) => {
      for (let i = 1; i < pts.length; i++) {
        L(pts[i - 1], pts[i], w, value == null ? `${base}-idle` : `${base}-base`, { title, top: 20 });
        if (value != null) L(pts[i - 1], pts[i], w, on, { opacity: value, title, top: 20 });
      }
    };
    draw(belly, t ? 0.0045 : 0.0035, "muscle", "muscle-on", `${nameOf(name)}, muscle: ${share}`);
    draw(tendon, t ? 0.0025 : 0.002, "tendon", t ? `tendon-on tendon-${t.tendon}` : "tendon-on", `${nameOf(name)}, tendon: ${value == null ? "not modelled (path only)" : `carries ${share}`}`);
  }
  return prims;
}

/** A muscle path split `tendon` metres back from its insertion: [belly points, tendon points] (sharing the split point). */
export function splitPath(path, tendon) {
  let left = tendon;
  for (let i = path.length - 1; i > 0; i--) {
    const a = path[i - 1], b = path[i], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (l >= left) {
      const c = b.map((x, k) => x + ((a[k] - x) * left) / (l || 1));
      return [[...path.slice(0, i), c], [c, ...path.slice(i)]];
    }
    left -= l;
  }
  return [[], path]; // all tendon
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

const sub = (a, b) => a.map((x, i) => x - b[i]), add = (a, b) => a.map((x, i) => x + b[i]), mul = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], unit = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const PAD = 0.008; // soft tissue between a pad's bone point and the block (half of tools/arms_pinch_span.py's 16 mm)

/**
 * The block between the thumb pad and the pads of `fingers`: a see-through box `widthMm` wide.
 * The fingers' face: the posture's own (`face`, exported with the four-finger contact postures:
 * the fingers lie along it, the top edge at the last joint on it), else fitted to the pads (60%
 * along each distal phalanx), facing as the first finger's pad does (square to its distal phalanx,
 * in its bending plane), running along the knuckles, the top edge at the DIP joints. The thumb's
 * face lies `widthMm` across it. The block runs along the row (past the thumb if it sits beyond
 * the index).
 */
export function pinchBlock(posture, widthMm, fingers = ["index", "middle"]) {
  const J = posture.joints;
  const pads = fingers.map((f) => { const [, , m, d, t] = J[f]; return add(d, mul(sub(t, d), 0.6)); });
  const th = J.thumb, thumb = add(th.at(-2), mul(sub(th.at(-1), th.at(-2)), 0.6));
  let c, n, e, up, top;
  if (posture.face) { // exported with the posture (tools/arms_pinch_contact.py): the fingers lie along it
    const F = posture.face;
    [c, n, up, top] = [F.point, unit(F.n), unit(F.up), F.top];
    e = unit(cross(up, n));
  } else {
    const [, , m, d, t] = J[fingers[0]], ax = unit(sub(t, d));
    n = unit(cross(cross(unit(sub(d, m)), ax), ax));
    if (dot(n, sub(m, t)) < 0) n = mul(n, -1); // the palm side: back towards the curl
    c = mul(pads.reduce(add), 1 / pads.length);
    e = unit(sub(J[fingers[0]][1], J[fingers.at(-1)][1])); // along the knuckles
    n = unit(sub(n, mul(e, dot(n, e))));
    if (dot(sub(thumb, c), n) < 0) n = mul(n, -1);
    up = cross(n, e);
    if (dot(sub(J.middle[1], c), up) < 0) up = mul(up, -1); // towards the knuckles
    top = Math.min(...fingers.map((f) => dot(sub(J[f][3], c), up)));
  }
  const along = [...pads, thumb].map((p) => dot(sub(p, c), e));
  const N = [PAD, PAD + widthMm / 1000], E = [Math.min(...along) - 0.012, Math.max(...along) + 0.012], U = [top - 0.09, top];
  const corner = (i, j, k) => v3(add(c, add(mul(n, N[i]), add(mul(e, E[j]), mul(up, U[k])))));
  const faces = [[[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]];
  return faces.map((fc) => ({ kind: "poly", pts: fc.map(([i, j, k]) => corner(i, j, k)), cls: "plate3d block3d", block: true }));
}
