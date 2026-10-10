#!/usr/bin/env python3
"""Thumb postures for pinching blocks of different widths in the ARMS hand model, and the muscles there.

    python tools/arms_pinch_span.py Hand_Wrist_Model_for_development.osim fingers.json out.json

fingers.json: {"w35": {"2mcp_flexion": ..., ...}, ...} finger postures by width (mm in the key),
interpolated between the given widths (held beyond them) (the index finger's measured angles applied to all fingers).
For each block width 20-110 mm the thumb's base (cmc_flexion, cmc_abduction, within the model's
ranges) is set so that the thumb pad lies `width` + soft tissue from the index pad, choosing the
posture closest to neutral; the thumb's MP and IP stay at their measured pinch values. Then every
muscle's moment arms about every coordinate in COORDS and its active force at full activation
(force-length at that posture) are written, as tools/arms_posture_arms.py does.
Pad points are estimates: 60% along the distal phalanx, continuing the middle (thumb: proximal)
phalanx's line. LICENCE: ARMS is NON-COMMERCIAL only; the JSON says so.
"""
import json
import math
import sys

import numpy as np
import opensim as osim

src, fingers_file, out = sys.argv[1:4]
TISSUE = 0.016  # thumb pad + finger pad soft tissue between the bones' pad points (m), estimate
THUMB = {"mp_flexion": 3.5, "ip_flexion": 13.3}  # Vigouroux et al. 2011, wide objects
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
for mm in WIDTHS:
    base = {**fingers_for(mm), **THUMB}
    best = None
    for fl in range(-45, 16, 3):
        for ab in range(-25, 26, 3):
            set_pose({**base, "cmc_flexion": fl, "cmc_abduction": ab})
            gap = np.linalg.norm(pad("proximal_thumb", "distal_thumb", 0.025) - pad("2midph", "2distph", 0.0187)) - TISSUE
            score = (gap - mm / 1000) ** 2 + 1e-8 * (fl * fl + ab * ab)
            if best is None or score < best[0]:
                best = (score, fl, ab, gap)
    _, fl, ab, gap = best
    pose = {**base, "cmc_flexion": fl, "cmc_abduction": ab}
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
    res["thumbBase"][key] = {"cmc_flexion": fl, "cmc_abduction": ab, "gapMm": round(gap * 1000, 1)}
    print(f"{mm} mm: cmc flexion {fl}, abduction {ab}, gap {gap * 1000:.1f} mm")
with open(out, "w") as f:
    json.dump(res, f, indent=1)
print(f"wrote {out}")
