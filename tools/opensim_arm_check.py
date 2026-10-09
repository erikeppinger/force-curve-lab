#!/usr/bin/env python3
"""Elbow muscle numbers from OpenSim's Arm26 model (adapted from Holzbaur et al. 2005, CC BY 3.0),
to check the curls and triceps extensions. Run locally with OpenSim:

    python tools/opensim_arm_check.py arm26.osim out.json

Writes, on a shoulder flexion (r_shoulder_elev: -30..180) x elbow flexion (0..140) grid, every
muscle's moment arm about the elbow and the shoulder (m; OpenSim sign: + pulls the coordinate +)
and its active fibre force along the tendon at full activation (N, fibre-tendon equilibrium).
"""
import json
import math
import sys

import opensim as osim

src, out = sys.argv[1:3]
model = osim.Model(src)
state = model.initSystem()
cs = model.getCoordinateSet()
for i in range(cs.getSize()):
    cs.get(i).setClamped(state, False)
sh, el = cs.get("r_shoulder_elev"), cs.get("r_elbow_flex")
muscles = model.getMuscles()
names = [muscles.get(i).getName() for i in range(muscles.getSize())]
shoulders = list(range(-30, 181, 15))
elbows = list(range(0, 141, 10))
data = {n: {"max": muscles.get(n).getMaxIsometricForce(), "elbowArm": [], "shoulderArm": [], "active": []} for n in names}
for s in shoulders:
    rows = {n: ([], [], []) for n in names}
    for e in elbows:
        sh.setValue(state, math.radians(s), False)
        el.setValue(state, math.radians(e), False)
        model.assemble(state)
        model.realizePosition(state)
        for n in names:
            muscles.get(n).setActivation(state, 1.0)
        model.equilibrateMuscles(state)
        model.realizeDynamics(state)
        for n in names:
            m = muscles.get(n)
            rows[n][0].append(m.computeMomentArm(state, el))
            rows[n][1].append(m.computeMomentArm(state, sh))
            rows[n][2].append(m.getActiveFiberForceAlongTendon(state))
    for n in names:
        data[n]["elbowArm"].append(rows[n][0])
        data[n]["shoulderArm"].append(rows[n][1])
        data[n]["active"].append(rows[n][2])
res = {"model": src.replace("\\", "/").split("/")[-1], "opensim": osim.GetVersionAndDate(),
       "licence": "Arm26 (OpenSim team, adapted from Holzbaur et al. 2005): CC BY 3.0",
       "shoulderRange": [round(math.degrees(sh.getRangeMin())), round(math.degrees(sh.getRangeMax()))],
       "shoulders": shoulders, "elbows": elbows, "muscles": data}
with open(out, "w") as f:
    json.dump(res, f)
print(f"wrote {out}")
