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
export function analyzeFinger(ex, v, pipDeg, { loadKg, strengthPct = 100, placement } = {}) {
  const f = ex.finger;
  const P = { ...v.params, ...placement };
  const p = fingerPose(f, P, pipDeg);
  const F = loadKg * G * P.fingerShare;
  const u = unit(sub(p.contact, p.wrist)); // direction of the edge's push on the pad
  const force = { x: F * u.x, y: F * u.y };
  // Moment the flexors must supply at each joint (positive = the load opens the joint).
  const need = (j) => -cross(sub(p.contact, j), force);
  const mDip = need(p.dip), mPip = need(p.pip), mMcp = need(p.mcp);
  // Under load the flexor tendons bowstring away from the PIP as it bends (Schweizer), which
  // lengthens their PIP moment arms beyond the unloaded cadaver values.
  const r = { ...f.momentArms };
  r.fdpPip += interp(f.bowstring.fdp, pipDeg);
  r.fdsPip += interp(f.bowstring.fds, pipDeg);

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
  const uP = dir(p.phi.p), uM = dir(p.phi.m), uD = dir(p.phi.d);
  const a2 = add(p.pip, uP, -f.pulleys.a2DistalEdge);
  const a4 = add(p.pip, uM, f.pulleys.a4 * f.lengths.middle);
  const fdsIns = add(p.pip, uM, f.insertions.fds * f.lengths.middle);
  const fdpIns = add(p.dip, uD, f.insertions.fdp * f.lengths.distal);
  const fA2 = pulleyLoad(fdp, uP, unit(sub(a4, a2))) + pulleyLoad(fds, uP, unit(sub(fdsIns, a2)));
  const fA4 = fdp * len(add(unit(sub(a2, a4)), unit(sub(fdpIns, a4))));

  const capacity = P.maxFingertipN * (strengthPct / 100);
  return {
    angle: pipDeg, pose: p, tilt: handTilt(p), force, fingertipN: F,
    moments: { dip: mDip, pip: mPip, mcp: mMcp }, passive,
    tendons: { fdp, fds }, pipExtensor, mcpRest, momentArms: r,
    pulleys: {
      a2: fA2, a4: fA4, a2Point: a2, a4Point: a4,
      // Share of the pulley's breaking load (cadaver test, Lin et al. 1990), if the data has it.
      a2Share: f.pulleyStrength ? fA2 / f.pulleyStrength.a2 : null,
      a4Share: f.pulleyStrength ? fA4 / f.pulleyStrength.a4 : null,
    },
    capacity, effort: F / capacity,
    maxBlockKg: capacity / (G * P.fingerShare), // block at which this finger reaches its maximum
    ratio: fds > 0 ? fdp / fds : Infinity,
  };
}

export function sampleFinger(ex, v, opts, step = 2.5) {
  const [lo, hi] = ex.angleRange;
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += step) out.push(analyzeFinger(ex, v, a, opts));
  return out;
}

export { deg };
