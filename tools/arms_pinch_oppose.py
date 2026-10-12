#!/usr/bin/env python3
"""EXPERIMENT (not used by the app): thumb postures that OPPOSE the finger pads, from the ARMS hand model.

Tried 2026-10-12 after the 3D hand showed that tools/arms_pinch_span.py's postures put the thumb
partly beside the index finger (sideways share of the thumb -> index line 0.48-0.58). This search
brings it down to 0.19-0.43, but the thumb's base then sits at the edge of ARMS's ranges (CMC
flexion +15 deg up to 30 mm, abduction +25 deg from 30 mm; the FPL's CMC moment arm turns negative
at 20-30 mm), and the model fits the measurements worse: the thumb's muscles need x 9.3 (not x 3.4)
to reach the measured 194 N, 50 mm comes out 62% weaker than 80 mm (Huang et al.: equal), the peak
rises to 35 kg, and the index FDP force per newton of squeeze leaves Vigouroux et al.'s 2.5-3. Kept
for the record; the app uses tools/arms_pinch_span.py.

    python tools/arms_pinch_oppose.py Hand_Wrist_Model_for_development.osim fingers.json out.json

fingers.json: {"w35": {"2mcp_flexion": ..., ...}, ...} finger postures by width (mm in the key),
interpolated between the given widths (held beyond them) (the index finger's measured angles applied to all fingers).
For each block width 20-110 mm the thumb's base (cmc_flexion, cmc_abduction, within the model's
ranges; MP and IP stay at their measured values) is set so that the thumb pad lies `width` + soft tissue from the index pad AND
opposite it: the line between the pads should run across the palm, not along the finger spread
(index MCP -> little MCP), as when the four fingers lie side by side on one face of a block and
the thumb presses the other. Score: (gap error / 2 mm)^2 + (sideways share / 0.1)^2, coarse grid then
refined. (Freeing MP and IP as well made them jump between widths.) Then every
muscle's moment arms about every coordinate in COORDS and its active force at full activation
(force-length at that posture) are written, as tools/arms_posture_arms.py does.
Pad points are estimates: 60% along the distal phalanx, continuing the middle (thumb: proximal)
phalanx's line. LICENCE: ARMS is NON-COMMERCIAL only; the JSON says so.
"""
import itertools
import json
import math
import sys

import numpy as np
import opensim as osim

src, fingers_file, out = sys.argv[1:4]
TISSUE = 0.016  # thumb pad + finger pad soft tissue between the bones' pad points (m), estimate
THUMB = {"mp_flexion": 3.5, "ip_flexion": 13.3}  # Vigouroux et al. 2011, wide objects
RANGES = {"cmc_flexion": (-45, 15), "cmc_abduction": (0, 25)}  # within ARMS's ranges; abduction on the opposing side only (no flip between widths)
WIDTHS = list(range(20, 111, 10))

model = osim.Model(src)
state = model.initSystem()
cs = model.getCoordinateSet()
for i in range(cs.getSize()):
    cs.get(i).setClamped(state, False)
muscles = model.getMuscles()
bodies = model.getBodySet()
names = [muscles.get(i).getName() for i in range(muscles.getSize())]
COORDS = ["cmc_flexion", "cmc_abduction", "mp_flexion", "ip_flexion"] + [f"{d}{j}_flexion" for d in "2345" for j in ("mcp", "pm", "md")]
finger_postures = json.load(open(fingers_file))


def set_pose(values):
    for i in range(cs.getSize()):
        c = cs.get(i)
        if not c.isConstrained(state):
            c.setValue(state, math.radians(values.get(c.getName(), 0.0)), False)
    model.assemble(state)
    model.realizePosition(state)


def g(body):
    p = bodies.get(body).getPositionInGround(state)
    return np.array([p.get(0), p.get(1), p.get(2)])


def pad(prox, dist, length):
    a, b = g(prox), g(dist)
    u = (b - a) / np.linalg.norm(b - a)
    return b + u * 0.6 * length


def fingers_for(mm):
    """Finger angles at width mm: linear between the given widths, held beyond them."""
    keys = sorted(finger_postures, key=lambda k: int(k[1:]))
    ws = [int(k[1:]) for k in keys]
    if mm <= ws[0]:
        return finger_postures[keys[0]]
    if mm >= ws[-1]:
        return finger_postures[keys[-1]]
    i = max(j for j in range(len(ws)) if ws[j] <= mm)
    u = (mm - ws[i]) / (ws[i + 1] - ws[i])
    a, b = finger_postures[keys[i]], finger_postures[keys[i + 1]]
    return {c: a[c] + u * (b[c] - a[c]) for c in a}


res = {"licence": "Derived from the ARMS hand and wrist model (McFarland DC, Binder-Markey BI, Nichols JA, Wohlman SJ, de Bruin M, Murray WM (2021). bioRxiv 2021.12.28.474357): NON-COMMERCIAL use only.",
       "coords": COORDS, "postures": {}, "widths": {}, "thumbBase": {}}


def measure(values):
    set_pose(values)
    t, i = pad("proximal_thumb", "distal_thumb", 0.025), pad("2midph", "2distph", 0.0187)
    spread = g("2proxph") - g("5proxph")
    spread /= np.linalg.norm(spread)
    d = i - t
    return np.linalg.norm(d) - TISSUE, abs(d @ spread) / np.linalg.norm(d)


def score(values, mm):
    gap, side = measure(values)
    return ((gap - mm / 1000) / 0.002) ** 2 + (side / 0.1) ** 2


KEYS = list(RANGES)
for mm in WIDTHS:
    base = {**fingers_for(mm), **THUMB}
    best = None
    grid = [list(range(lo, hi + 1, 5)) for lo, hi in RANGES.values()]
    for c in itertools.product(*grid):
        v = {**base, **dict(zip(KEYS, c))}
        sc = score(v, mm)
        if best is None or sc < best[0]:
            best = (sc, dict(zip(KEYS, c)))
    for step in (5, 2, 1):  # refine: coordinate steps around the best
        improved = True
        while improved:
            improved = False
            for k in KEYS:
                for sgn in (1, -1):
                    c = dict(best[1]); c[k] = min(RANGES[k][1], max(RANGES[k][0], c[k] + sgn * step))
                    sc = score({**base, **c}, mm)
                    if sc < best[0] - 1e-12:
                        best, improved = (sc, c), True
    thumb = best[1]
    gap, side = measure({**base, **thumb})
    pose = {**base, **thumb}
    set_pose(pose)
    for n in names:
        muscles.get(n).setActivation(state, 1.0)
    model.equilibrateMuscles(state)
    model.realizeDynamics(state)
    key = f"w{mm}"
    res["postures"][key] = {"pose": pose, "muscles": {n: {"active": round(muscles.get(n).getActiveFiberForceAlongTendon(state), 2),
                                                        "max": round(muscles.get(n).getMaxIsometricForce(), 1),
                                                        "arms": {c: round(muscles.get(n).computeMomentArm(state, cs.get(c)), 6) for c in COORDS}} for n in names}}
    res["widths"][key] = mm
    res["thumbBase"][key] = {**thumb, "gapMm": round(gap * 1000, 1), "sideways": round(side, 3)}
    print(f"{mm} mm: {thumb}, gap {gap * 1000:.1f} mm, sideways share {side:.2f}")
with open(out, "w") as f:
    json.dump(res, f, indent=1)
print(f"wrote {out}")
