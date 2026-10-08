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
  const L = S.lengths[id];
  const k = L.proximal / S.lengths.index.proximal;
  const momentArms = Object.fromEntries(Object.entries(base.momentArms).map(([key, v]) => [key, v * k]));
  return {
    lengths: L, momentArms, bowstring: base.bowstring, insertions: base.insertions,
    pulleys: { a2DistalEdge: (L.proximal * (1 - S.a2Length[id])) / 2, a4: 0.5 },
    pulleyStrength: { a2: S.pulleyStrength.a2[id], a4: S.pulleyStrength.a4[id] },
  };
}

/** Joint limits (degrees) for the reach search: flexion positive. */
const LIMITS = { mcp: [-30, 90], pip: [0, 115], dip: [-30, 80] };
/**
 * Cost weights of departing from the grip's angles: the grip type lives in the PIP and fingertip
 * joints, so fingers of different length adjust mainly at the knuckle (MCP), and the ring and
 * little fingers also by bending their metacarpal forward at the base of the hand ("cupping").
 */
const WEIGHT = { mcp: 0.1, pip: 1, dip: 1, cmc: 0.5 };
/** Cost of a finger that can't reach the edge at all (it then carries nothing). */
const MISS = 400; // about a 20° change of the PIP: a finger that can only touch in a contorted posture stays off

const rot = (p, t) => ({ x: Math.cos(t) * p.x - Math.sin(t) * p.y, y: Math.sin(t) * p.x + Math.cos(t) * p.y });

/**
 * Pose of a finger whose pad (a fraction `frac` along the distal phalanx) must touch `targetW`
 * (relative to the wrist; metacarpal hanging along -y). Searches the metacarpal's forward bend
 * (0 … cmcMax), the fingertip angle near the grip's and the two-link reach of knuckle and middle
 * joint; keeps the posture closest to the grip's angles `ref` {mcp, pip, dip} within the joint
 * limits. The pose is in the finger's own frame (metacarpal along -y, knuckle at the origin) with
 * `turn` = the metacarpal's bend. Null if the finger can't reach the edge.
 */
function reachPose(g, targetW, frac, ref, cmcMax = 0) {
  const L = g.lengths;
  const d = frac * L.distal;
  let best = null;
  const dipLo = Math.max(LIMITS.dip[0], ref.dip - 15), dipHi = Math.min(LIMITS.dip[1], ref.dip + 15);
  for (let cmcDeg = 0; cmcDeg <= cmcMax + 1e-9; cmcDeg += 2) {
    const k = rad(cmcDeg);
    const mcpW = add({ x: 0, y: 0 }, dir(k), L.metacarpal);
    const target = rot(sub(targetW, mcpW), -k);
    const D = len(target);
    const tq = Math.atan2(target.x, -target.y);
    for (let dipDeg = dipLo; dipDeg <= dipHi + 1e-9; dipDeg += 1) {
      const delta = rad(dipDeg);
      const v = { x: d * Math.sin(delta), y: -(L.middle + d * Math.cos(delta)) };
      const s = len(v), eps = Math.atan2(v.x, -v.y);
      if (D > L.proximal + s || D < Math.abs(L.proximal - s)) continue;
      const A = Math.acos(Math.max(-1, Math.min(1, (L.proximal ** 2 + D * D - s * s) / (2 * L.proximal * D))));
      for (const phiP of [tq - A, tq + A]) {
        const pip = add({ x: 0, y: 0 }, dir(phiP), L.proximal);
        const phiM = Math.atan2(target.x - pip.x, -(target.y - pip.y)) - eps;
        const a = { mcp: deg(phiP), pip: deg(phiM - phiP), dip: dipDeg };
        if (a.mcp < LIMITS.mcp[0] || a.mcp > LIMITS.mcp[1] || a.pip < LIMITS.pip[0] || a.pip > LIMITS.pip[1]) continue;
        const cost = WEIGHT.mcp * (a.mcp - ref.mcp) ** 2 + WEIGHT.pip * (a.pip - ref.pip) ** 2 + WEIGHT.dip * (a.dip - ref.dip) ** 2 + WEIGHT.cmc * cmcDeg ** 2;
        if (!best || cost < best.cost) best = { cost, a, phiP, phiM, pip, delta, k };
      }
    }
  }
  if (!best) return null;
  const phiD = best.phiM + best.delta;
  const dipJ = add(best.pip, dir(best.phiM), L.middle);
  return {
    wrist: { x: 0, y: L.metacarpal }, mcp: { x: 0, y: 0 }, pip: best.pip, dip: dipJ,
    tip: add(dipJ, dir(phiD), L.distal), contact: add(dipJ, dir(phiD), d), contactFromDip: d,
    phi: { p: best.phiP, m: best.phiM, d: phiD },
    pipDeg: best.a.pip, mcpDeg: best.a.mcp, dipDeg: best.a.dip, cmcDeg: deg(best.k), turn: best.k, cost: best.cost,
  };
}

/**
 * All four fingers on one edge (ex.fingers). The fingertips line up on the edge; every finger keeps
 * close to the grip's PIP and fingertip angles and takes up its length at the knuckle (longer
 * fingers bend the knuckle more), the ring and little finger also by cupping. Where the edge sits
 * relative to the hand is chosen so the four postures together stay closest to the grip (searched
 * along the middle finger's knuckle angle); a finger that can't reach doesn't touch. The edge is
 * raised/lowered per finger by P.edgeTilt and P.edgeStep (a raised middle section under the middle
 * finger; P.stepRing = how far the ring finger is on it, 0 = beside it, 1 = fully on it). The block's weight W is shared among the
 * touching fingers for least effort: minimise Σ (tension ÷ muscle size)² over each finger's FDP and
 * FDS, which gives finger i a share ∝ 1 / c_i, c_i = its squared effort per newton.
 */
export function fingerSet(ex, P, pipDeg, W, strengthPct = 100) {
  const S = ex.fingers;
  if (!S) return null;
  const frac = Math.min(1, (P.contactFromDip ?? ex.finger.lengths.distal / 2) / ex.finger.lengths.distal);
  const gs = Object.fromEntries(S.order.map((id) => [id, setFinger(ex, id)]));
  const refAngles = { mcp: P.mcp, pip: pipDeg, dip: P.dip };
  const zMid = S.knuckleSide.middle;
  const step = P.edgeStep ?? 0, tilt = Math.tan(rad(P.edgeTilt ?? 0));
  const onStep = { index: 0, middle: 1, ring: P.stepRing ?? 0, little: 0 };
  const lift = (id) => -step * (1 - onStep[id]) + tilt * (S.knuckleSide[id] - zMid);
  // The edge for a given middle-finger knuckle angle (the middle finger in the grip's PIP/DIP).
  const edgeAt = (mcpDeg) => {
    const gm = gs.middle;
    const p = fingerPose(gm, { ...P, mcp: mcpDeg, contactFromDip: frac * gm.lengths.distal }, pipDeg);
    return sub(p.contact, p.wrist);
  };
  const solve = (c) => S.order.map((id) => {
    const t = { x: c.x, y: c.y - lift(id) + lift("middle") };
    return { id, pose: reachPose(gs[id], t, frac, refAngles, S.cmcFlexMax?.[id] ?? 0) };
  });
  const total = (sol) => sol.reduce((s, f) => s + (f.pose ? f.pose.cost : MISS), 0);
  // Coarse search over the middle finger's knuckle angle, then refine.
  let bestMcp = P.mcp, best = null;
  for (let m = LIMITS.mcp[0]; m <= LIMITS.mcp[1]; m += 6) {
    const sol = solve(edgeAt(m)), t = total(sol);
    if (!best || t < best.t) { best = { t, sol }; bestMcp = m; }
  }
  for (let m = bestMcp - 5; m <= bestMcp + 5; m += 1) {
    const sol = solve(edgeAt(m)), t = total(sol);
    if (t < best.t) { best = { t, sol }; }
  }
  const c = edgeAt(bestMcp); // (kept for the force direction; the refined edge differs < 1 mm)
  const u = unit(c); // the block's pull on every pad (hand hangs with the wrist above the edge)
  const refT = ex.finger.referenceTension;
  const fingers = best.sol.map(({ id, pose: p }) => {
    const f = { id, label: S.labels[id], g: gs[id], pose: p, z: S.knuckleSide[id], touches: Boolean(p) };
    if (!p) return { ...f, cost: Infinity, share: 0, force: 0, effort: 0 };
    const uf = rot(u, -p.turn); // the pull in this finger's own frame
    // A bent-back fingertip carries part of the DIP moment passively (as in the full crimp).
    const Pf = { ...P, dipPassiveShare: p.dipDeg < 0 ? (P.dipPassiveShare ?? 0) : 0 };
    const per = fingerStatics(gs[id], Pf, p, uf, p.pipDeg);
    const tmax = { fdp: refT.fdp * (S.pcsa.fdp[id] / S.pcsa.fdp.middle), fds: refT.fds * (S.pcsa.fds[id] / S.pcsa.fds.middle) };
    const cost = (per.tendons.fdp / tmax.fdp) ** 2 + (per.tendons.fds / tmax.fds) ** 2;
    return { ...f, Pf, uf, tmax, cost };
  });
  const inv = fingers.map((f) => (f.touches && f.cost > 0 ? 1 / f.cost : 0));
  const sum = inv.reduce((a, b) => a + b, 0);
  const scale = 100 / strengthPct;
  for (const [i, f] of fingers.entries()) {
    if (!f.touches) continue;
    f.share = sum > 0 ? inv[i] / sum : 0;
    f.force = W * f.share;
    f.res = fingerStatics(f.g, f.Pf, f.pose, { x: f.uf.x * f.force, y: f.uf.y * f.force }, f.pose.pipDeg);
    f.effort = Math.max(f.res.tendons.fdp / f.tmax.fdp, f.res.tendons.fds / f.tmax.fds) * scale;
  }
  // Sideways moment about the middle of the wrist (thumb side positive): the wrist holds it.
  const wristSide = fingers.reduce((m, f) => m + f.force * f.z, 0);
  return { fingers, wristSide, loadCentre: W > 0 ? wristSide / W : 0 };
}

export function analyzeFinger(ex, v, pipDeg, { loadKg, strengthPct = 100, placement, body, bodyMassKg } = {}) {
  const f = ex.finger;
  const P = { ...v.params, ...placement };
  const W = loadKg * G;
  const set = fingerSet(ex, P, pipDeg, W, strengthPct);
  // The detailed finger (index): its share is the least-effort split ("auto") or a set value.
  // If the index doesn't reach the edge in the four-finger set, the detailed view falls back to 25%.
  const idx = set?.fingers.find((x) => x.id === "index");
  const share = P.fingerShare === "auto" ? (idx?.touches ? idx.share : 0.25) : P.fingerShare;
  const p = fingerPose(f, P, pipDeg);
  const F = W * share;
  const u = unit(sub(p.contact, p.wrist)); // direction of the edge's push on the pad
  const force = { x: F * u.x, y: F * u.y };
  const st = fingerStatics(f, P, p, force, pipDeg);
  const capacity = P.maxFingertipN * (strengthPct / 100);
  return {
    angle: pipDeg, pose: p, tilt: handTilt(p), force, fingertipN: F, share, indexReaches: idx ? idx.touches : true,
    ...st,
    capacity, effort: F / capacity,
    maxBlockKg: capacity / (G * share), // block at which this finger reaches its maximum
    arm: armLoads(ex, P, loadKg, { body, bodyMassKg, strengthPct }),
    set,
    ratio: st.tendons.fds > 0 ? st.tendons.fdp / st.tendons.fds : Infinity,
  };
}

export function sampleFinger(ex, v, opts, step = 2.5) {
  const [lo, hi] = ex.angleRange;
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += step) out.push(analyzeFinger(ex, v, a, opts));
  return out;
}

export { deg };
