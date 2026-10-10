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
 * the edge-lift statics' set.fingers (res.tendons, tmax, touches).
 */
export function handScene3d(posture, fingers) {
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
    const value = f ? (f.touches ? Math.min(1, (f.res?.tendons?.[t.tendon] ?? 0) / (f.tmax?.[t.tendon] || 1)) : 0) : null;
    const title = value == null ? `${nameOf(name)}: not modelled (path only)` : `${nameOf(name)}: ${Math.round(value * 100)}% of this finger's maximum`;
    const w = t ? 0.0035 : 0.0022;
    for (let i = 1; i < m.path.length; i++) {
      L(m.path[i - 1], m.path[i], w, value == null ? "tendon-idle" : "muscle-base", { title, top: 20 });
      if (value != null) L(m.path[i - 1], m.path[i], w, "muscle-on", { opacity: value, title, top: 20 });
    }
  }
  return prims;
}
