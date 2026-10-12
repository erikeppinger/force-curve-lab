#!/usr/bin/env python3
"""Moment arms and force capacities of the ARMS hand model's muscles at given postures (no search).

    python tools/arms_posture_arms.py Hand_Wrist_Model_for_development.osim postures.json out.json

postures.json: {"name": {"coordinate": degrees, ...}, ...}; other coordinates at 0.
Writes per posture: every muscle's moment arm (m) about every listed coordinate in COORDS and its
active force at full activation (N), and the segment lengths between the thumb's and the index
finger's joint centres. LICENCE: ARMS is NON-COMMERCIAL only; the JSON says so.
"""
import json
import math
import sys

import numpy as np
import opensim as osim

src, postures_file, out = sys.argv[1:4]
model = osim.Model(src)
state = model.initSystem()
cs = model.getCoordinateSet()
for i in range(cs.getSize()):
    cs.get(i).setClamped(state, False)
muscles = model.getMuscles()
bodies = model.getBodySet()
COORDS = ["cmc_flexion", "cmc_abduction", "mp_flexion", "ip_flexion"] + [f"{d}{j}_flexion" for d in "2345" for j in ("mcp", "pm", "md")]
names = [muscles.get(i).getName() for i in range(muscles.getSize())]


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


postures = json.load(open(postures_file))
res = {"licence": "Derived from the ARMS hand and wrist model (McFarland DC, Binder-Markey BI, Nichols JA, Wohlman SJ, de Bruin M, Murray WM (2021). bioRxiv 2021.12.28.474357): NON-COMMERCIAL use only.",
       "coords": COORDS, "postures": {}}
set_pose({})
seg = lambda a, b: round(float(np.linalg.norm(g(b) - g(a))), 4)
res["lengths"] = {"thumb": {"metacarpal": seg("firstmc1", "proximal_thumb"), "proximal": seg("proximal_thumb", "distal_thumb")},
                  "index": {"metacarpal": seg("secondmc", "2proxph"), "proximal": seg("2proxph", "2midph"), "middle": seg("2midph", "2distph")}}
for name, pose in postures.items():
    set_pose(pose)
    for n in names:
        muscles.get(n).setActivation(state, 1.0)
    model.equilibrateMuscles(state)
    model.realizeDynamics(state)
    res["postures"][name] = {"pose": pose, "muscles": {n: {"active": round(muscles.get(n).getActiveFiberForceAlongTendon(state), 2),
                                                           "max": round(muscles.get(n).getMaxIsometricForce(), 1),
                                                           "arms": {c: round(muscles.get(n).computeMomentArm(state, cs.get(c)), 6) for c in COORDS}} for n in names}}
with open(out, "w") as f:
    json.dump(res, f, indent=1)
print(f"wrote {out}: {len(postures)} postures; lengths {res['lengths']}")
