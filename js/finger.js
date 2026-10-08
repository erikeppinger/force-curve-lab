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
function setFinger(ex, id) {
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
const WEIGHT = { mcp: 0.1, pip: 1, dip: 1, cmc: 0.5, dev: 0.2, roll: 0.05, depthMm: 1 };
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
function reachPose(g, targetW, frac, ref, cmcMax = 0) {
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
  for (let cm = Math.max(0, c0 - 3); cm <= Math.min(cmcMax, c0 + 3) + 1e-9; cm += 1) {
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
const refTension = (ex, id) => {
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
      // Up the pull's line (towards the wrist) by the edge's lift, across it by the roll; the pad
      // may rest a little deeper or shallower on the edge (coarse, then fine).
      const base = add(add(c, u, -lift(id, devDeg)), n, Math.tan(rad(rollDeg)) * (S.knuckleSide[id] - zMid));
      const at = (dx) => {
        const target = add(base, n, dx);
        const pose = reachPose(gs[id], target, frac, refAngles, S.cmcFlexMax?.[id] ?? 0);
        if (pose) pose.cost += WEIGHT.depthMm * (dx * 1000) ** 2;
        return { id, target, depth: dx, pose };
      };
      const pick = (a, b) => (!a.pose || (b.pose && b.pose.cost < a.pose.cost) ? b : a);
      if (id === "middle") return at(0);
      let b = (fine ? [-DEPTH, -DEPTH / 2, 0, DEPTH / 2, DEPTH] : [-DEPTH, 0, DEPTH]).map(at).reduce(pick);
      if (fine && b.pose) for (const dx of [b.depth - 0.002, b.depth - 0.001, b.depth + 0.001, b.depth + 0.002]) if (Math.abs(dx) <= DEPTH + 1e-9) b = pick(b, at(dx));
      return b;
    });
    const total = sol.reduce((s, f) => s + (f.pose ? f.pose.cost : MISS), 0) + WEIGHT.dev * devDeg ** 2 + WEIGHT.roll * rollDeg ** 2;
    return { mcp: mcpDeg, dev: devDeg, roll: rollDeg, c, sol, total };
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
  // Start from a straight hand and from one that follows the edge's tilt, over the edge position;
  // then alternate tilt, roll and edge position.
  let best = null;
  const follow = Math.round(Math.max(LIMITS.dev[0], Math.min(LIMITS.dev[1], -(P.edgeTilt ?? 0))));
  for (const dv of follow === 0 ? [0] : [0, follow]) for (const m of range(LIMITS.mcp[0], LIMITS.mcp[1], 6)) best = better(best, solve(m, dv, 0));
  for (let round = 0; round < 2; round++) {
    along("dev", range(LIMITS.dev[0], LIMITS.dev[1], 5), 2);
    along("roll", range(LIMITS.roll[0], LIMITS.roll[1], 10), 3);
    along("mcp", range(best.mcp - 6, best.mcp + 6, 3), 1);
  }
  // Fine pad depths at the end, with small steps of every coordinate.
  best = solve(best.mcp, best.dev, best.roll, true);
  for (const key of ["mcp", "dev", "roll"]) for (const d of [-1, 1]) if (ok(key, best[key] + d)) best = better(best, at(best, key, best[key] + d, true));

  const dev = rad(best.dev);
  const u = unit(best.c); // the block's pull on every pad (hand hangs with the wrist above the edge)
  // The pull is vertical; with the hand tilted sideways only cos(dev) of its long-axis part lies
  // in the fingers' bending plane, the rest pushes the fingers sideways (collateral ligaments and
  // interossei; reported, not analysed).
  const uPlane = { x: u.x, y: u.y * Math.cos(dev) };
  const fingers = best.sol.map(({ id, target, pose: p }) => {
    const f = { id, label: S.labels[id], g: gs[id], pose: p, z: S.knuckleSide[id], target, touches: Boolean(p), tmax: refTension(ex, id), share: 0, force: 0, effort: 0 };
    if (!p) return f;
    const uf = rot(uPlane, -p.turn); // the pull in this finger's own frame
    // A bent-back fingertip carries part of the DIP moment passively (as in the full crimp).
    const Pf = { ...P, dipPassiveShare: p.dipDeg < 0 ? (P.dipPassiveShare ?? 0) : 0 };
    const st = fingerStatics(gs[id], Pf, p, uf, p.pipDeg);
    // Weight in the split: 1 for a comfortable reach, fading to 0 as the posture cost nears MISS.
    const reach = Math.min(1, Math.max(0, (MISS - p.cost) / (MISS / 2)));
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
  }
  for (const f of fingers) if (f.touches) f.effort = Math.max(f.res.tendons.fdp / f.tmax.fdp, f.res.tendons.fds / f.tmax.fds) * scale;
  // Sideways moment about the middle of the wrist (thumb side positive): each pad's vertical pull
  // at its sideways position, which the hand's tilt shifts (z' = y·sin dev + z·cos dev).
  for (const f of fingers) f.zWorld = f.target.y * Math.sin(dev) + f.z * Math.cos(dev);
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
 * The edge lift as the app shows it: all four fingers on the edge (fingerSet), the arm (armLoads)
 * and summary numbers. Efforts scale linearly with the block (the split doesn't depend on it), so
 * the block at which the hardest-working finger reaches its maximum is load ÷ that effort.
 * tendons: the whole FDP and FDS (summed over the four slips) expressed against one finger's
 * reference tension, for the muscle bars.
 */
export function analyzeEdge(ex, v, pipDeg, { loadKg, strengthPct = 100, placement, body, bodyMassKg, hand } = {}) {
  const P = { ...v.params, ...placement };
  const set = fingerSet(ex, P, pipDeg, loadKg * G, strengthPct, hand);
  const on = set.fingers.filter((f) => f.touches && f.share > 0);
  const peak = on.reduce((a, f) => (!a || f.effort > a.effort ? f : a), null);
  const pulleyPeak = on.flatMap((f) => [
    { finger: f, pulley: "A2", share: f.res.pulleys.a2Share, load: f.res.pulleys.a2 },
    { finger: f, pulley: "A4", share: f.res.pulleys.a4Share, load: f.res.pulleys.a4 },
  ]).reduce((a, b) => (!a || b.share > a.share ? b : a), null);
  const refT = ex.finger.referenceTension;
  const sum = (get) => set.fingers.reduce((s, f) => s + get(f), 0);
  const rel = (k) => sum((f) => f.res?.tendons[k] ?? 0) / sum((f) => f.tmax[k]);
  return {
    angle: pipDeg, P, set, peak, pulleyPeak,
    maxBlockKg: peak && peak.effort > 0 ? loadKg / peak.effort : Infinity,
    tendons: { fdp: rel("fdp") * refT.fdp, fds: rel("fds") * refT.fds },
    arm: armLoads(ex, P, loadKg, { body, bodyMassKg, strengthPct }),
  };
}

/** Curves over the PIP range for every finger (the set is a search, so every `step` degrees). */
export function sampleEdge(ex, v, opts, step = 10) {
  const [lo, hi] = ex.angleRange;
  const P = { ...v.params, ...opts?.placement };
  const out = [];
  for (let a = lo; ; a += step) {
    const x = Math.min(a, hi);
    const set = fingerSet(ex, P, x, (opts?.loadKg ?? 0) * G, opts?.strengthPct ?? 100, opts?.hand);
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
      const set = fingerSet(ex, P, x, (opts?.loadKg ?? 0) * G, opts?.strengthPct ?? 100, opts?.hand);
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
