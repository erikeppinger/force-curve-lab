// Finger statics for the edge lift: one finger as a planar chain wrist → MCP → PIP → DIP → tip,
// loaded at the finger pad by the edge. Turns joint moments into tendon tensions (FDP, FDS) and
// pulley loads (A2, A4).
//
// Local frame (metres): MCP at the origin, the metacarpal hanging along -y (wrist above, at
// (0, metacarpal)), x towards the palm. Segment angles are measured from -y, positive towards +x,
// so positive joint angles are flexion and a positive (counter-clockwise) moment flexes.
// The hand hangs so the load line passes under the wrist (no wrist moment): in this frame the
// edge's push on the pad points from the wrist towards the contact point.
// Pure functions only — imported by the browser UI and by node tests.

import { G, interp } from "./physics.js";

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => { const l = len(a); return { x: a.x / l, y: a.y / l }; };
const cross = (r, f) => r.x * f.y - r.y * f.x;
const dir = (phi) => ({ x: Math.sin(phi), y: -Math.cos(phi) });
/** Palm-side normal of a segment at angle phi. */
export const volar = (phi) => ({ x: Math.cos(phi), y: Math.sin(phi) });

/** How far (degrees) the fingertip pad's surface turns either side of the distal phalanx's palm side (curvature; estimate). */
export const PAD_WRAP = 35;

/**
 * Friction the pad needs: the edge's push u on the pad (finger's frame) against the contact normal.
 * Both bodies are curved, so they touch where their surfaces face each other: the pad's surface
 * faces the distal phalanx's palm side ± PAD_WRAP; the edge's runs from its face (square to the
 * block's pull, tilted by incutDeg: + = incut, pressing the pad deeper into the hold; − = sloping)
 * round the lip to its front (+90°, towards the finger's middle phalanx). The contact takes the
 * shared direction closest to the push; needed coefficient = tan(angle between push and contact
 * normal); 0 when the pad can meet the face squarely, Infinity when no shared direction presses
 * into the pad. Angles are measured from the push, + towards the lip. With a constant coefficient
 * it doesn't depend on the load, only on how the pad meets the edge (on rough holds the finger
 * pad's friction hardly depends on load: Dzidek et al. 2017).
 */
export function frictionNeeded(u, phiD, incutDeg = 0, wrapDeg = PAD_WRAP) {
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const ang = (v) => Math.atan2(u.x * v.y - u.y * v.x, dot(u, v));
  const dD = dir(phiD);
  const s = Math.sign(ang({ x: -dD.x, y: -dD.y })) || 1; // + = towards the lip (the DIP side)
  const n = volar(phiD);
  const padMid = s * ang({ x: -n.x, y: -n.y }); // the pad's surface, pressing into it
  const pad = [padMid - rad(wrapDeg), padMid + rad(wrapDeg)];
  const edge = [-rad(incutDeg), Math.PI / 2];
  const lo = Math.max(pad[0], edge[0]), hi = Math.min(pad[1], edge[1]);
  // Shared range: the contact normal nearest the push; none: the nearest pair of directions.
  const m = lo <= hi ? Math.min(hi, Math.max(lo, 0)) : pad[1] < edge[0] ? (pad[1] + edge[0]) / 2 : (pad[0] + edge[1]) / 2;
  return Math.abs(m) < Math.PI / 2 - 1e-9 ? Math.abs(Math.tan(m)) : Infinity;
}

/**
 * Segment end points for a PIP angle (degrees), with the grip's MCP and DIP angles.
 * Contact: the centre of the edge's pressure on the distal phalanx, P.contactFromDip metres from
 * the DIP (default: half the distal phalanx, as Vigouroux et al. assumed).
 */
export function fingerPose(f, P, pipDeg) {
  const L = f.lengths;
  const phiP = rad(P.mcp);
  const phiM = phiP + rad(pipDeg);
  const phiD = phiM + rad(P.dip);
  const wrist = { x: 0, y: L.metacarpal };
  const mcp = { x: 0, y: 0 };
  const pip = add(mcp, dir(phiP), L.proximal);
  const dipJ = add(pip, dir(phiM), L.middle);
  const tip = add(dipJ, dir(phiD), L.distal);
  const dist = Math.min(L.distal, Math.max(0, P.contactFromDip ?? L.distal / 2));
  const contact = add(dipJ, dir(phiD), dist);
  return { wrist, mcp, pip, dip: dipJ, tip, contact, contactFromDip: dist, phi: { p: phiP, m: phiM, d: phiD } };
}

/** Rotation (radians) that turns the local frame so the wrist sits straight above the contact. */
export function handTilt(p) {
  const w = sub(p.wrist, p.contact);
  return Math.atan2(w.x, w.y); // rotating counter-clockwise by this brings w onto +y
}

/** Load on a pulley where a tendon under tension T turns from direction u_in to u_out (N). */
const pulleyLoad = (T, uFrom, uTo) => T * len(add(uTo, uFrom, -1));

/**
 * Full analysis at one PIP angle. P = variant params merged with the placement sliders
 * (contactFromDip, fingerShare); opts: loadKg (whole block, one hand), strengthPct.
 */
/**
 * The arm holding the block: straight, hanging from the shoulder, turned forward (armForward)
 * and out to the side (armSide) by the given angles (degrees). The block hangs from the hand.
 * Returns the torques the shoulder (flexors, abductors) and the elbow must hold, and the pull
 * along the arm. Small-angle composition: forward and sideways reach add as offsets.
 */
export function armLoads(ex, P, loadKg, { body, bodyMassKg = 75, strengthPct = 100 } = {}) {
  const a = ex.arm;
  if (!a || !body) return null;
  const L = body.lengths, m = body.mass, c = body.com;
  const W = loadKg * G;
  const sf = Math.sin(rad(P.armForward ?? 0)), ss = Math.sin(rad(P.armSide ?? 0));
  const tilt = Math.hypot(sf, ss); // sine of the arm's angle from vertical
  const reach = L.upperArm + L.forearm; // shoulder → grip
  // Arm weight: upper arm and forearm + hand at their centres of mass.
  const armMoment = G * bodyMassKg * (m.upperArm * c.upperArm * L.upperArm + m.forearmHand * (L.upperArm + c.forearmHand * L.forearm));
  const foreMoment = G * bodyMassKg * m.forearmHand * c.forearmHand * L.forearm;
  const shoulderForward = (W * reach + armMoment) * sf;
  const shoulderSide = (W * reach + armMoment) * ss;
  const elbow = (W * L.forearm + foreMoment) * tilt;
  const scale = strengthPct / 100;
  const capFlex = a.shoulderFlexion.peakTorqueNm * interp(a.shoulderFlexion.points, P.armForward ?? 0) * scale;
  const capAbd = a.shoulderAbduction.peakTorqueNm * interp(a.shoulderAbduction.points, P.armSide ?? 0) * scale;
  const capElbow = a.elbowStraight.peakTorqueNm * scale;
  const armWeight = G * bodyMassKg * (m.upperArm + m.forearmHand);
  return {
    traction: (W + armWeight) * Math.sqrt(Math.max(0, 1 - tilt * tilt)), // pull along the arm at the shoulder
    shoulderForward, shoulderSide, elbow,
    effort: { shoulderForward: shoulderForward / capFlex, shoulderSide: shoulderSide / capAbd, elbow: elbow / capElbow },
  };
}

/**
 * Tendon tensions and pulley loads of one finger in a given pose, for a force on its pad.
 * g: the finger's data (lengths, momentArms, bowstring, pulleys, insertions, pulleyStrength).
 */
function fingerStatics(g, P, p, force, pipDeg) {
  // Moment the flexors must supply at each joint (positive = the load opens the joint).
  const need = (j) => -cross(sub(p.contact, j), force);
  const mDip = need(p.dip), mPip = need(p.pip), mMcp = need(p.mcp);
  // Under load the flexor tendons bowstring away from the PIP as it bends (Schweizer), which
  // lengthens their PIP moment arms beyond the unloaded cadaver values.
  const r = { ...g.momentArms };
  r.fdpPip += interp(g.bowstring.fdp, pipDeg);
  r.fdsPip += interp(g.bowstring.fds, pipDeg);

  // DIP: only the FDP flexes it. With the DIP bent back (full crimp) joint structures carry part
  // of the moment passively (Vigouroux et al.: about a fifth).
  const passive = Math.max(0, mDip) * (P.dipPassiveShare ?? 0);
  const fdp = Math.max(0, mDip - passive) / r.fdpDip;
  // PIP: FDS supplies what FDP doesn't. If FDP already over-flexes the PIP, the extensor
  // mechanism has to hold it (not modelled as a tension, reported as a moment).
  const fdsRaw = (mPip - fdp * r.fdpPip) / r.fdsPip;
  const fds = Math.max(0, fdsRaw);
  const pipExtensor = Math.max(0, -fdsRaw * r.fdsPip);
  // MCP: what the two long flexors leave over goes to the intrinsics (+) or the extensors (−).
  const mcpRest = mMcp - fdp * r.fdpMcp - fds * r.fdsMcp;

  // Pulleys: tendons run straight between pulleys (bowstring), bone-axis geometry.
  const L = g.lengths;
  const uP = dir(p.phi.p), uM = dir(p.phi.m), uD = dir(p.phi.d);
  const a2 = add(p.pip, uP, -g.pulleys.a2DistalEdge);
  const a4 = add(p.pip, uM, g.pulleys.a4 * L.middle);
  const fdsIns = add(p.pip, uM, g.insertions.fds * L.middle);
  const fdpIns = add(p.dip, uD, g.insertions.fdp * L.distal);
  const fA2 = pulleyLoad(fdp, uP, unit(sub(a4, a2))) + pulleyLoad(fds, uP, unit(sub(fdsIns, a2)));
  const fA4 = fdp * len(add(unit(sub(a2, a4)), unit(sub(fdpIns, a4))));
  return {
    moments: { dip: mDip, pip: mPip, mcp: mMcp }, passive,
    tendons: { fdp, fds }, pipExtensor, mcpRest, momentArms: r,
    pulleys: {
      a2: fA2, a4: fA4, a2Point: a2, a4Point: a4,
      // Share of the pulley's breaking load (cadaver test, Lin et al. 1990), if the data has it.
      a2Share: g.pulleyStrength ? fA2 / g.pulleyStrength.a2 : null,
      a4Share: g.pulleyStrength ? fA4 / g.pulleyStrength.a4 : null,
    },
  };
}

/** One finger of the set as a finger-data object like ex.finger (moment arms scaled by size). */
export function setFinger(ex, id) {
  const S = ex.fingers, base = ex.finger;
  // Wrist → knuckle: the middle metacarpal less how far this knuckle sits back (the knuckle line).
  const L = S.knuckleBack ? { ...S.lengths[id], metacarpal: S.lengths.middle.metacarpal - S.knuckleBack[id] } : S.lengths[id];
  // Scaled against the published index finger, also when the user enters their own lengths.
  const k = L.proximal / (S.refIndexProximal ?? S.lengths.index.proximal);
  const momentArms = Object.fromEntries(Object.entries(base.momentArms).map(([key, v]) => [key, v * k]));
  return {
    lengths: L, momentArms, bowstring: base.bowstring, insertions: base.insertions,
    pulleys: { a2DistalEdge: (L.proximal * (1 - S.a2Length[id])) / 2, a4: 0.5 },
    pulleyStrength: { a2: S.pulleyStrength.a2[id], a4: S.pulleyStrength.a4[id] },
    mcpRange: S.mcpRange?.[id], // measured active range of this knuckle (degrees)
  };
}

/** Joint limits (degrees) for the reach search: flexion positive; deviation + = ulnar. */
const LIMITS = { mcp: [-30, 90], pip: [0, 115], dip: [-30, 80], dev: [-25, 30], roll: [-30, 30] };
/**
 * Cost weights of departing from the grip's angles: the grip type lives in the PIP and fingertip
 * joints, so fingers of different length adjust mainly at the knuckle (MCP), the ring and little
 * fingers also by bending their metacarpal forward at the base of the hand ("cupping"), and the
 * whole hand by tilting sideways (radial/ulnar deviation at the wrist, or the arm leaning) and by
 * rolling about its long axis (forearm pronation/supination), which costs little. Estimates.
 */
const WEIGHT = { mcp: 0.5, pip: 1, dip: 1, cmc: 0.5, dev: 1, roll: 0.05, depthMm: 1, slideMm: 1 };
/**
 * How far (m) the edge may sit nearer the fingertip or the DIP crease than the set contact point:
 * the pad is about 2 cm long, so fingers of different length can meet one flat edge with
 * different parts of their pads instead of bending their joints (estimate).
 */
const SLIDE = 0.006;
const DEVSTEP = 15, MSTEP = 8; // coarse search grid (degrees): hand tilt, middle-finger knuckle
/** How far (m) a pad may sit deeper or shallower on the edge than the middle finger's. */
const DEPTH = 0.006;
/** Cost of a finger that can't reach the edge at all (it then carries nothing). */
const MISS = 900; // about a 30° change of the PIP: a finger that can only touch in a contorted posture stays off

const rot = (p, t) => ({ x: Math.cos(t) * p.x - Math.sin(t) * p.y, y: Math.sin(t) * p.x + Math.cos(t) * p.y });

/**
 * Pose of a finger whose pad (a fraction `frac` along the distal phalanx) must touch `targetW`
 * (relative to the wrist; metacarpal hanging along -y). Searches the metacarpal's forward bend
 * (0 … cmcMax) and the fingertip angle near the grip's (coarse, then fine), solving knuckle and
 * middle joint by two-link reach; keeps the posture closest to the grip's angles `ref`
 * {mcp, pip, dip} within the joint limits. The pose is in the finger's own frame (metacarpal along
 * -y, knuckle at the origin) with `turn` = the metacarpal's bend. Null if it can't reach.
 */
function reachPose(g, targetW, frac, ref, cmcMax = 0, quick = false) {
  const L = g.lengths;
  const mcpLim = g.mcpRange ?? LIMITS.mcp;
  const d = frac * L.distal;
  const dipLo = Math.max(LIMITS.dip[0], ref.dip - 15), dipHi = Math.min(LIMITS.dip[1], ref.dip + 15);
  const tryPose = (cmcDeg, dipDeg, best) => {
    const k = rad(cmcDeg);
    const mcpW = add({ x: 0, y: 0 }, dir(k), L.metacarpal);
    const target = rot(sub(targetW, mcpW), -k);
    const D = len(target);
    const tq = Math.atan2(target.x, -target.y);
    const delta = rad(dipDeg);
    const v = { x: d * Math.sin(delta), y: -(L.middle + d * Math.cos(delta)) };
    const s = len(v), eps = Math.atan2(v.x, -v.y);
    if (D > L.proximal + s || D < Math.abs(L.proximal - s)) return best;
    const A = Math.acos(Math.max(-1, Math.min(1, (L.proximal ** 2 + D * D - s * s) / (2 * L.proximal * D))));
    for (const phiP of [tq - A, tq + A]) {
      const pip = add({ x: 0, y: 0 }, dir(phiP), L.proximal);
      const phiM = Math.atan2(target.x - pip.x, -(target.y - pip.y)) - eps;
      const a = { mcp: deg(phiP), pip: deg(phiM - phiP), dip: dipDeg };
      if (a.mcp < mcpLim[0] || a.mcp > mcpLim[1] || a.pip < LIMITS.pip[0] || a.pip > LIMITS.pip[1]) continue;
      const cost = WEIGHT.mcp * (a.mcp - ref.mcp) ** 2 + WEIGHT.pip * (a.pip - ref.pip) ** 2 + WEIGHT.dip * (a.dip - ref.dip) ** 2 + WEIGHT.cmc * cmcDeg ** 2;
      if (!best || cost < best.cost) best = { cost, a, phiP, phiM, pip, delta, k, cmcDeg, dipDeg };
    }
    return best;
  };
  let best = null;
  for (let cm = 0; cm <= cmcMax + 1e-9; cm += 4) for (let dp = dipLo; dp <= dipHi + 1e-9; dp += 3) best = tryPose(cm, dp, best);
  if (!best) return null;
  const c0 = best.cmcDeg, d0 = best.dipDeg;
  if (!quick) for (let cm = Math.max(0, c0 - 3); cm <= Math.min(cmcMax, c0 + 3) + 1e-9; cm += 1) {
    for (let dp = Math.max(dipLo, d0 - 2); dp <= Math.min(dipHi, d0 + 2) + 1e-9; dp += 1) best = tryPose(cm, dp, best);
  }
  const phiD = best.phiM + best.delta;
  const dipJ = add(best.pip, dir(best.phiM), L.middle);
  return {
    wrist: { x: 0, y: L.metacarpal }, mcp: { x: 0, y: 0 }, pip: best.pip, dip: dipJ,
    tip: add(dipJ, dir(phiD), L.distal), contact: add(dipJ, dir(phiD), d), contactFromDip: d,
    phi: { p: best.phiP, m: best.phiM, d: phiD },
    pipDeg: best.a.pip, mcpDeg: best.a.mcp, dipDeg: best.a.dip, cmcDeg: deg(best.k), turn: best.k, cost: best.cost,
  };
}

/** Solve H x = b (small dense system, Gaussian elimination with pivoting). */
function solveLinear(H, b) {
  const n = b.length, A = H.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let k = i; k <= n; k++) A[r][k] -= f * A[i][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let k = i + 1; k < n; k++) s -= A[i][k] * x[k];
    x[i] = s / A[i][i];
  }
  return x;
}

/** Reference (maximal) tendon tensions of one finger's FDP and FDS, scaled by muscle size. */
export const refTension = (ex, id) => {
  const S = ex.fingers, refT = ex.finger.referenceTension;
  return { fdp: refT.fdp * (S.pcsa.fdp[id] / S.pcsa.fdp.middle), fds: refT.fds * (S.pcsa.fds[id] / S.pcsa.fds.middle) };
};

/**
 * Least-effort split of the block between the touching fingers. Per newton on its pad, finger i
 * needs FDP tension a_i and FDS tension b_i; with Tp_i, Ts_i its muscles' reference tensions,
 * σ_i = a_i s_i / Tp_i is its FDP slip's relative tension (s = shares, Σ s = 1). The cost is
 *   J = Σ [σ_i² + (b_i s_i / Ts_i)²] + λ Σ_{pairs of middle, ring, little} (σ_i − σ_j)²,
 * the second term linking the FDP slips that share one muscle belly (the "quadriga"): it pulls
 * them towards the same relative tension. λ = q / (1 − q): q = 0 independent slips, q = 1 one
 * belly (equal relative tension in every touching slip). J = sᵀ H s; its minimum under Σ s = 1
 * is s ∝ H⁻¹ 1, re-solved without any finger that would get a negative share.
 * A finger that only just reaches the edge (posture cost between MISS/2 and MISS) takes part with a
 * weight w falling to 0 (its cost terms ÷ w², its links × w), so its share fades out instead of
 * jumping when a few millimetres of edge decide whether it touches.
 */
function shareLoad(fingers, q) {
  const coupled = (f) => f.id !== "index";
  const lambda = q >= 1 ? 1e4 : q / (1 - q);
  for (const f of fingers) f.share = 0;
  let active = fingers.filter((f) => f.touches);
  while (active.length) {
    const n = active.length;
    const al = active.map((f) => f.per.a / f.tmax.fdp);
    const w = active.map((f) => f.reach);
    const link = (i, j) => (i !== j && coupled(active[i]) && coupled(active[j]) ? lambda * w[i] * w[j] : 0);
    const H = active.map((fi, i) => active.map((fj, j) => {
      if (i !== j) return -link(i, j) * al[i] * al[j];
      const links = active.reduce((s, _, k) => s + link(i, k), 0);
      return (al[i] ** 2 + (fi.per.b / fi.tmax.fds) ** 2) / w[i] ** 2 + links * al[i] ** 2;
    }));
    const x = solveLinear(H, new Array(n).fill(1));
    const sum = x.reduce((a, b) => a + b, 0);
    const s = x.map((v) => v / sum);
    if (s.every((v) => v >= 0)) { active.forEach((f, i) => { f.share = s[i]; }); return; }
    active = active.filter((_, i) => s[i] > 0);
  }
}

/**
 * All four fingers on one edge (ex.fingers). The fingertips line up on the edge; every finger keeps
 * close to the grip's PIP and fingertip angles and takes up its length at the knuckle (longer
 * fingers bend the knuckle more), the ring and little finger also by cupping, and the whole hand
 * may tilt sideways at the wrist (radial/ulnar deviation), which lowers one side's knuckles. Where
 * the edge sits relative to the hand (searched along the middle finger's knuckle angle) and the
 * hand's tilt are chosen so the four postures together stay closest to the grip; a finger that
 * can't reach doesn't touch. The edge under each finger sits at P.edgeIndex / edgeMiddle /
 * edgeRing / edgeLittle (metres, + = closer to the knuckles; only the differences from the middle
 * finger's matter), or "auto" = the profile that fits this hand in this grip (see idealEdge),
 * and the whole edge may tilt (P.edgeTilt). The block's weight W is shared for least effort
 * (shareLoad; P.quadriga = how far the FDP slips of the middle, ring and little finger act as one
 * muscle). hand: optional own lengths {index: {knuckleBack, proximal, middle, distal}, …} (m).
 * P.fingersOn: which fingers go on the edge: "auto" (default: a finger that can't reach
 * comfortably stays off), "all", "no-index" or "no-little" (that finger deliberately off; every
 * other finger kept on, whatever posture that takes).
 */
export function fingerSet(ex0, P, pipDeg, W, strengthPct = 100, hand = null) {
  const ex = withHand(ex0, hand);
  const S = ex.fingers;
  if (!S) return null;
  const frac = Math.min(1, (P.contactFromDip ?? ex.finger.lengths.distal / 2) / ex.finger.lengths.distal);
  const gs = Object.fromEntries(S.order.map((id) => [id, setFinger(ex, id)]));
  const refAngles = { mcp: P.mcp, pip: pipDeg, dip: P.dip };
  const zMid = S.knuckleSide.middle;
  const edgeTilt = rad(P.edgeTilt ?? 0);
  const choice = P.fingersOn ?? "auto";
  const left = new Set(choice === "no-index" ? ["index"] : choice === "no-little" ? ["little"] : []);
  const forced = choice !== "auto"; // an explicit choice keeps every other finger on
  const KEEP = 1e6; // the miss cost that keeps a finger on: only an unreachable one may still miss
  let missCost = forced ? KEEP : MISS;
  const ideal = idealEdge(ex, P, pipDeg);
  // Set heights are relative to the edge under the middle finger (P.edgeMiddle); "auto" = fitted.
  const mid = P.edgeMiddle === "auto" ? 0 : P.edgeMiddle ?? 0;
  const offsets = Object.fromEntries(S.order.map((id) => {
    if (id === "middle") return [id, 0];
    const v = P[EDGE_KEY[id]] ?? 0;
    return [id, v === "auto" ? ideal[id].lift : v - mid];
  }));
  // Edge height under each finger relative to the middle finger's (towards the wrist = +), with
  // the hand tilted sideways by devDeg: the edge's own tilt and the hand's tilt add up (both lower
  // the little-finger side relative to the knuckles).
  const lift = (id, devDeg) => offsets[id] / Math.cos(rad(devDeg)) + Math.tan(edgeTilt + rad(devDeg)) * (S.knuckleSide[id] - zMid);
  // The edge (relative to the wrist, in the hand's frame) for a given middle-finger knuckle angle.
  const edgeAt = (mcpDeg) => {
    const gm = gs.middle;
    const p = fingerPose(gm, { ...P, mcp: mcpDeg, contactFromDip: frac * gm.lengths.distal }, pipDeg);
    return sub(p.contact, p.wrist);
  };
  // One hand posture: the middle finger's knuckle angle (sets where the edge sits under the hand),
  // the sideways tilt (dev) and the roll about the hand's long axis (roll, + = the thumb side's pads
  // deeper towards the palm). Every other finger reaches the edge in its best posture.
  const solve = (mcpDeg, devDeg, rollDeg, fine = false) => {
    const c = edgeAt(mcpDeg);
    const u = unit(c), n = { x: -u.y, y: u.x };
    const sol = S.order.map((id) => {
      if (left.has(id)) return { id, target: null, depth: 0, pose: null, left: true };
      // Up the pull's line (towards the wrist) by the edge's lift, across it by the roll; the pad
      // may rest a little deeper or shallower on the edge (coarse, then fine).
      const base = add(add(c, u, -lift(id, devDeg)), n, Math.tan(rad(rollDeg)) * (S.knuckleSide[id] - zMid));
      const Ld = gs[id].lengths.distal;
      const at = (dx, sl = 0) => {
        const target = add(base, n, dx);
        const fr = Math.min(0.9, Math.max(0.2, frac + sl / Ld));
        const pose = reachPose(gs[id], target, fr, refAngles, S.cmcFlexMax?.[id] ?? 0, !fine);
        if (pose) pose.cost += WEIGHT.depthMm * (dx * 1000) ** 2 + WEIGHT.slideMm * (sl * 1000) ** 2;
        return { id, target, depth: dx, slide: sl, pose };
      };
      const pick = (a, b) => (!a.pose || (b.pose && b.pose.cost < a.pose.cost) ? b : a);
      if (id === "middle") return at(0);
      const slides = [-SLIDE, 0, SLIDE];
      // (Coarse: the pad slides only where its middle can't reach.)
      let b = (fine ? [-DEPTH, -DEPTH / 2, 0, DEPTH / 2, DEPTH] : [-DEPTH, 0, DEPTH]).flatMap((dx) => { const z = at(dx); return z.pose && !fine ? [z] : [z, ...slides.filter(Boolean).map((sl) => at(dx, sl))]; }).reduce(pick);
      if (fine && b.pose) for (const dx of [b.depth - 0.002, b.depth - 0.001, b.depth + 0.001, b.depth + 0.002]) if (Math.abs(dx) <= DEPTH + 1e-9) b = pick(b, at(dx, b.slide));
      if (fine && b.pose) for (const sl of [b.slide - 0.002, b.slide - 0.001, b.slide + 0.001, b.slide + 0.002]) if (Math.abs(sl) <= SLIDE + 1e-9) b = pick(b, at(b.depth, sl));
      return b;
    });
    const total = sol.reduce((s, f) => s + (f.left ? 0 : f.pose ? f.pose.cost : missCost), 0) + WEIGHT.dev * devDeg ** 2 + WEIGHT.roll * rollDeg ** 2;
    return { mcp: mcpDeg, dev: devDeg, roll: rollDeg, c, sol, total, misses: sol.filter((f) => !f.left && !f.pose).length };
  };
  const better = (a, b) => (!a || b.total < a.total ? b : a);
  const ok = (key, v) => v >= LIMITS[key][0] && v <= LIMITS[key][1];
  const at = (b, key, v, fine) => solve(key === "mcp" ? v : b.mcp, key === "dev" ? v : b.dev, key === "roll" ? v : b.roll, fine);
  /** Best value of one posture coordinate with the others held: a grid, then finer steps around it. */
  const along = (key, grid, fineStep) => {
    for (const v of grid) if (ok(key, v)) best = better(best, at(best, key, v));
    const v0 = best[key];
    for (const v of [v0 - 2 * fineStep, v0 - fineStep, v0 + fineStep, v0 + 2 * fineStep]) if (ok(key, v)) best = better(best, at(best, key, v));
  };
  const range = (lo, hi, step) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const follow = Math.round(Math.max(LIMITS.dev[0], Math.min(LIMITS.dev[1], -(P.edgeTilt ?? 0))));
  const devs = [...new Set([0, follow, ...range(LIMITS.dev[0], LIMITS.dev[1], DEVSTEP)])];
  let best = null;
  // Start from the hand tilted to several angles (one following the edge's tilt), over the edge
  // position; then alternate tilt, roll and edge position; fine pad depths and small steps at the end.
  const search = () => {
    best = null;
    for (const dv of devs) for (const m of range(LIMITS.mcp[0], LIMITS.mcp[1], MSTEP)) best = better(best, solve(m, dv, 0));
    for (let round = 0; round < 2; round++) {
      along("dev", range(LIMITS.dev[0], LIMITS.dev[1], 5), 2);
      along("roll", range(LIMITS.roll[0], LIMITS.roll[1], 10), 3);
      along("mcp", range(best.mcp - 6, best.mcp + 6, 3), 1);
    }
    best = solve(best.mcp, best.dev, best.roll, true);
    for (const key of ["mcp", "dev", "roll"]) for (const d of [-1, 1]) if (ok(key, best[key] + d)) best = better(best, at(best, key, best[key] + d, true));
    return best;
  };
  if (forced) search();
  else {
    // Auto: once letting fingers drop freely, once trying to keep every finger on (a search that
    // starts with a finger off rarely finds its way back to all four); the cheaper posture wins.
    const free = search();
    missCost = KEEP;
    const all = search();
    all.total -= all.misses * (KEEP - MISS);
    best = all.total < free.total ? all : free;
    missCost = MISS;
  }

  const dev = rad(best.dev);
  const u = unit(best.c); // the block's pull on every pad (hand hangs with the wrist above the edge)
  // The pull is vertical; with the hand tilted sideways only cos(dev) of its long-axis part lies
  // in the fingers' bending plane, the rest pushes the fingers sideways (collateral ligaments and
  // interossei; reported, not analysed).
  const uPlane = { x: u.x, y: u.y * Math.cos(dev) };
  const fingers = best.sol.map(({ id, target, pose: p, left: off }) => {
    const f = { id, label: S.labels[id], g: gs[id], pose: p, z: S.knuckleSide[id], target, touches: Boolean(p), tmax: refTension(ex, id), share: 0, force: 0, effort: 0, ...(off ? { leftOff: true } : {}) };
    if (!p) return f;
    const uf = rot(uPlane, -p.turn); // the pull in this finger's own frame
    // A bent-back fingertip carries part of the DIP moment passively (as in the full crimp).
    const Pf = { ...P, dipPassiveShare: p.dipDeg < 0 ? (P.dipPassiveShare ?? 0) : 0 };
    const st = fingerStatics(gs[id], Pf, p, uf, p.pipDeg);
    // Weight in the split: 1 for a comfortable reach, fading to 0 as the posture cost nears MISS.
    // (Kept on by choice: full weight whatever the posture costs.)
    const reach = forced ? 1 : Math.min(1, Math.max(0, (MISS - p.cost) / (MISS / 2)));
    return { ...f, touches: reach > 0, reach, Pf, uf, per: { a: st.tendons.fdp, b: st.tendons.fds } };
  });
  const q = Math.min(1, Math.max(0, P.quadriga ?? 0));
  shareLoad(fingers, q);
  const scale = 100 / strengthPct;
  for (const f of fingers) {
    if (!f.touches) continue;
    f.force = W * f.share;
    f.res = fingerStatics(f.g, f.Pf, f.pose, { x: f.uf.x * f.force, y: f.uf.y * f.force }, f.pose.pipDeg);
    f.sideways = f.force * Math.abs(u.y) * Math.sin(Math.abs(dev));
    f.friction = frictionNeeded(f.uf, f.pose.phi.d, P.incut ?? 0);
  }
  for (const f of fingers) if (f.touches) f.effort = Math.max(f.res.tendons.fdp / f.tmax.fdp, f.res.tendons.fds / f.tmax.fds) * scale;
  // Sideways moment about the middle of the wrist (thumb side positive): each pad's vertical pull
  // at its sideways position, which the hand's tilt shifts (z' = y·sin dev + z·cos dev).
  for (const f of fingers) f.zWorld = (f.target?.y ?? 0) * Math.sin(dev) + f.z * Math.cos(dev);
  const wristSide = fingers.reduce((m, f) => m + f.force * f.zWorld, 0);
  return { fingers, wristSide, loadCentre: W > 0 ? wristSide / W : 0, deviationDeg: best.dev, rollDeg: best.roll, quadriga: q, edge: best.c, offsets, ideal };
}

/** Placement keys of the edge offsets under each finger (relative to the middle finger). */
const EDGE_KEY = { index: "edgeIndex", ring: "edgeRing", little: "edgeLittle" };

/** The exercise with the user's own finger bone lengths (moment arms still scaled from the data's index). */
function withHand(ex, hand) {
  if (!hand || !ex.fingers) return ex;
  const S = ex.fingers;
  const lengths = Object.fromEntries(S.order.map((id) => [id, { ...S.lengths[id], ...hand[id] }]));
  const knuckleBack = Object.fromEntries(S.order.map((id) => [id, hand[id]?.knuckleBack ?? S.knuckleBack?.[id] ?? 0]));
  return { ...ex, fingers: { ...S, lengths, knuckleBack, refIndexProximal: S.lengths.index.proximal } };
}

/**
 * The edge that fits a hand in a grip exactly: every finger in the grip's own angles (no knuckle
 * adjustment, no cupping, hand straight), the hand hanging with the wrist above the middle
 * finger's pad. Per finger: lift = how much closer to the knuckles (+) its pad sits than the
 * middle finger's, along the pull; depth = how much deeper (towards the palm, +) across it.
 */
export function idealEdge(ex0, P, pipDeg, hand = null) {
  const ex = withHand(ex0, hand);
  const S = ex.fingers;
  if (!S) return null;
  const frac = Math.min(1, (P.contactFromDip ?? ex.finger.lengths.distal / 2) / ex.finger.lengths.distal);
  const contact = (id) => {
    const g = setFinger(ex, id);
    const p = fingerPose(g, { ...P, contactFromDip: frac * g.lengths.distal }, pipDeg);
    return sub(p.contact, p.wrist);
  };
  const cm = contact("middle");
  const u = unit(cm), n = { x: -u.y, y: u.x };
  return Object.fromEntries(S.order.map((id) => {
    const d = sub(contact(id), cm);
    return [id, { lift: -(d.x * u.x + d.y * u.y), depth: d.x * n.x + d.y * n.y }];
  }));
}

/**
 * One lift over time, for Play: the force the hand must apply to the block (N), from Newton's
 * second law F = m·(g + a) once the block is off the floor. Phases:
 *   rest     block on the floor, no pull;
 *   pull     the pull builds up while the floor still carries the rest (F: 0 → m·g, smooth);
 *   lift     the block rises `height` in `liftTime` along a minimum-jerk path, so it speeds up
 *            (F > m·g) and then slows down (F < m·g);
 *   hold     still: F = m·g;
 *   lower    back down the same path: F < m·g first, then > m·g as it is slowed before touching;
 *   release  the floor takes the block back (F: m·g → 0).
 * Everything along the straight arm (fingers, wrist, elbow, shoulder) carries this same pull.
 * Timings and height are estimates (the pull's build-up follows the 1–1.5 s in the
 * StrengthClimbing guide); the minimum-jerk path is the usual model of a smooth reach.
 */
export function liftProfile(massKg, { liftTime = 0.6, height = 0.05, pullTime = 1.2, holdTime = 2.5, restTime = 0.8, releaseTime = 0.5 } = {}) {
  const mg = massKg * G;
  const smooth = (x) => x * x * (3 - 2 * x);
  const mjAcc = (tau) => (height * (60 * tau - 180 * tau ** 2 + 120 * tau ** 3)) / liftTime ** 2; // d²/dt² of the min-jerk path
  const mjPos = (tau) => height * (10 * tau ** 3 - 15 * tau ** 4 + 6 * tau ** 5);
  const phases = [
    ["Rest", restTime, () => ({ F: 0, y: 0, a: 0 })],
    ["Pull", pullTime, (u) => ({ F: mg * smooth(u), y: 0, a: 0 })],
    ["Lift", liftTime, (u) => { const a = mjAcc(u); return { F: massKg * (G + a), y: mjPos(u), a }; }],
    ["Hold", holdTime, () => ({ F: mg, y: height, a: 0 })],
    ["Lower", liftTime, (u) => { const a = -mjAcc(u); return { F: massKg * (G + a), y: height - mjPos(u), a }; }],
    ["Release", releaseTime, (u) => ({ F: mg * (1 - smooth(u)), y: 0, a: 0 })],
  ];
  const duration = phases.reduce((s, p) => s + p[1], 0);
  const bands = [];
  let t0 = 0;
  for (const [name, dt] of phases) { bands.push({ from: t0, to: t0 + dt, label: name }); t0 += dt; }
  const at = (t) => {
    let s = ((t % duration) + duration) % duration;
    for (const [name, dt, f] of phases) {
      if (s <= dt) return { phase: name, t, ...f(dt > 0 ? s / dt : 1) };
      s -= dt;
    }
    return { phase: "Rest", t, F: 0, y: 0, a: 0 };
  };
  const peakA = (5.7735 * height) / liftTime ** 2; // largest acceleration of a minimum-jerk move
  return { duration, bands, at, mg, peakF: massKg * (G + peakA), holdAt: restTime + pullTime + liftTime + holdTime / 2 };
}

/**
 * The edge lift as the app shows it: all four fingers on the edge (fingerSet), the arm (armLoads)
 * and summary numbers. Efforts scale linearly with the block (the split doesn't depend on it), so
 * the block at which the hardest-working finger reaches its maximum is load ÷ that effort.
 * tendons: the whole FDP and FDS (summed over the four slips) expressed against one finger's
 * reference tension, for the muscle bars.
 */
/**
 * The load on one hand (kg). Block lift (P.mode "block", the default): the block. Hang ("hang"):
 * the body hanging from the edge, less what the feet carry (P.feet, % of body weight), plus any
 * added weight (loadKg), shared by P.hands hands. The finger statics are the same either way: the
 * edge's push runs from the pad towards the wrist, whatever pulls on the arm.
 */
export function handLoadKg(P, loadKg, bodyMassKg = 75) {
  if (P.mode !== "hang") return loadKg;
  return Math.max(0, bodyMassKg * (1 - (P.feet ?? 0) / 100) + loadKg) / Math.max(1, Number(P.hands ?? 2));
}

export function analyzeEdge(ex, v, pipDeg, { loadKg, strengthPct = 100, placement, body, bodyMassKg = 75, hand } = {}) {
  const P = { ...v.params, ...placement };
  const hang = P.mode === "hang";
  const handKg = handLoadKg(P, loadKg, bodyMassKg);
  const set = fingerSet(ex, P, pipDeg, handKg * G, strengthPct, hand);
  const on = set.fingers.filter((f) => f.touches && f.share > 0);
  const peak = on.reduce((a, f) => (!a || f.effort > a.effort ? f : a), null);
  const pulleyPeak = on.flatMap((f) => [
    { finger: f, pulley: "A2", share: f.res.pulleys.a2Share, load: f.res.pulleys.a2 },
    { finger: f, pulley: "A4", share: f.res.pulleys.a4Share, load: f.res.pulleys.a4 },
  ]).reduce((a, b) => (!a || b.share > a.share ? b : a), null);
  const refT = ex.finger.referenceTension;
  const sum = (get) => set.fingers.reduce((s, f) => s + get(f), 0);
  const rel = (k) => sum((f) => f.res?.tendons[k] ?? 0) / sum((f) => f.tmax[k]);
  // Friction: the touching finger that needs the most, against the skin–edge coefficient P.mu.
  const fr = on.reduce((a, f) => (!a || f.friction > a.friction ? f : a), null);
  const mu = Number(P.mu ?? Infinity);
  const friction = fr ? { needed: fr.friction, finger: fr, mu, slips: on.filter((f) => f.friction > mu) } : null;
  const maxHandKg = peak && peak.effort > 0 ? handKg / peak.effort : Infinity;
  return {
    angle: pipDeg, P, set, peak, pulleyPeak, friction, hang, handKg,
    maxBlockKg: maxHandKg,
    // Hang: the most added weight (negative = the body alone is too much: take that much off the feet or add a hand).
    maxAddedKg: hang ? maxHandKg * Math.max(1, Number(P.hands ?? 2)) - bodyMassKg * (1 - (P.feet ?? 0) / 100) : null,
    tendons: { fdp: rel("fdp") * refT.fdp, fds: rel("fds") * refT.fds },
    arm: hang ? null : armLoads(ex, P, handKg, { body, bodyMassKg, strengthPct }),
  };
}

/** Curves over the PIP range for every finger (the set is a search, so every `step` degrees). */
export function sampleEdge(ex, v, opts, step = 10) {
  const [lo, hi] = ex.angleRange;
  const P = { ...v.params, ...opts?.placement };
  const out = [];
  for (let a = lo; ; a += step) {
    const x = Math.min(a, hi);
    const set = fingerSet(ex, P, x, handLoadKg(P, opts?.loadKg ?? 0, opts?.bodyMassKg) * G, opts?.strengthPct ?? 100, opts?.hand);
    out.push({
      angle: x,
      fingers: Object.fromEntries(set.fingers.map((f) => [f.id, f.touches
        ? { touches: true, share: f.share, fdp: f.res.tendons.fdp, fds: f.res.tendons.fds, a2: f.res.pulleys.a2Share, a4: f.res.pulleys.a4Share, effort: f.effort }
        : { touches: false, share: 0, fdp: 0, fds: 0, a2: 0, a4: 0, effort: 0 }])),
    });
    if (x >= hi) break;
  }
  return out;
}

export function analyzeFinger(ex, v, pipDeg, { loadKg, strengthPct = 100, placement, body, bodyMassKg, indexShare, hand } = {}) {
  const f = ex.finger;
  const P = { ...v.params, ...placement };
  const W = loadKg * G;
  // indexShare (from sampleFinger): the index's share is already known, skip the four-finger set.
  const set = indexShare == null ? fingerSet(ex, P, pipDeg, W, strengthPct, hand) : null;
  // The detailed finger (index): its share is the least-effort split ("auto") or a set value.
  // If the index doesn't reach the edge in the four-finger set, the detailed view falls back to 25%.
  const idx = set?.fingers.find((x) => x.id === "index");
  const autoShare = indexShare ?? (idx?.touches ? idx.share : 0.25);
  const share = (P.fingerShare ?? "auto") === "auto" ? autoShare : P.fingerShare;
  const p = fingerPose(f, P, pipDeg);
  const F = W * share;
  const u = unit(sub(p.contact, p.wrist)); // direction of the edge's push on the pad
  const force = { x: F * u.x, y: F * u.y };
  const st = fingerStatics(f, P, p, force, pipDeg);
  const capacity = P.maxFingertipN * (strengthPct / 100);
  return {
    angle: pipDeg, pose: p, tilt: handTilt(p), force, fingertipN: F, share, indexReaches: indexShare != null ? indexShare > 0 : idx ? idx.touches : true,
    ...st,
    capacity, effort: F / capacity,
    maxBlockKg: capacity / (G * share), // block at which this finger reaches its maximum
    arm: armLoads(ex, P, loadKg, { body, bodyMassKg, strengthPct }),
    set,
    ratio: st.tendons.fds > 0 ? st.tendons.fdp / st.tendons.fds : Infinity,
  };
}

/**
 * The curves over the PIP range. The four-finger set (a search) is solved every 10° only and the
 * index's least-effort share interpolated in between.
 */
export function sampleFinger(ex, v, opts, step = 2.5) {
  const [lo, hi] = ex.angleRange;
  const P = { ...v.params, ...opts?.placement };
  let shareAt = null;
  if (ex.fingers && P.fingerShare === "auto") {
    const pts = [];
    for (let a = lo; a < hi + 10; a += 10) {
      const x = Math.min(a, hi);
      const set = fingerSet(ex, P, x, handLoadKg(P, opts?.loadKg ?? 0, opts?.bodyMassKg) * G, opts?.strengthPct ?? 100, opts?.hand);
      const idx = set.fingers.find((f) => f.id === "index");
      pts.push([x, idx.touches ? idx.share : 0.25]);
      if (x === hi) break;
    }
    shareAt = (a) => interp(pts, a);
  }
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += step) out.push(analyzeFinger(ex, v, a, { ...opts, indexShare: shareAt ? shareAt(a) : undefined }));
  return out;
}

export { deg };
