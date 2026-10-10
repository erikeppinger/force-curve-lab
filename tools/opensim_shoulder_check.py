#!/usr/bin/env python3
"""Shoulder muscle numbers from the MoBL-ARMS model (Saul et al. 2015, as updated by McFarland et
al. 2019), to check the shoulder exercises (raises, presses, flyes, pulldowns). Run with OpenSim:

    python tools/opensim_shoulder_check.py MOBL_ARMS_fixed_41.osim out.json

LICENCE: MoBL-ARMS is under a Creative Commons non-commercial licence: the numbers are a check,
written up in docs/model-limits.md and marked non-commercial; they don't go into the app's data.

Writes, on a plane-of-elevation (elv_angle: 0 = arm out to the side, 90 = forward) x elevation
(shoulder_elv 0..180) grid with no humeral rotation and the elbow straight, every muscle's moment
arm about elv_angle, shoulder_elv and shoulder_rot (m; OpenSim sign) and its active force at full
activation (N, fibre-tendon equilibrium).
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
names = [cs.get(i).getName() for i in range(cs.getSize())]
COORDS = ["elv_angle", "shoulder_elv", "shoulder_rot"]
for c in COORDS:
    if c not in names:
        sys.exit(f"{c} not in the model: {names}")
muscles = model.getMuscles()
mnames = [muscles.get(i).getName() for i in range(muscles.getSize())]
planes = [-30, 0, 30, 60, 90]
elevs = list(range(0, 181, 15))
data = {n: {"max": muscles.get(n).getMaxIsometricForce(), "arms": {c: [] for c in COORDS}, "active": []} for n in mnames}
for p in planes:
    rows = {n: ({c: [] for c in COORDS}, []) for n in mnames}
    for e in elevs:
        for i in range(cs.getSize()):
            c = cs.get(i)
            if not c.isConstrained(state):
                c.setValue(state, 0.0, False)
        cs.get("elv_angle").setValue(state, math.radians(p), False)
        cs.get("shoulder_elv").setValue(state, math.radians(e), False)
        model.assemble(state)
        model.realizePosition(state)
        for n in mnames:
            muscles.get(n).setActivation(state, 1.0)
        model.equilibrateMuscles(state)
        model.realizeDynamics(state)
        for n in mnames:
            m = muscles.get(n)
            for c in COORDS:
                rows[n][0][c].append(m.computeMomentArm(state, cs.get(c)))
            rows[n][1].append(m.getActiveFiberForceAlongTendon(state))
    for n in mnames:
        for c in COORDS:
            data[n]["arms"][c].append(rows[n][0][c])
        data[n]["active"].append(rows[n][1])
res = {"model": src.replace("\\", "/").split("/")[-1], "opensim": osim.GetVersionAndDate(),
       "licence": "MoBL-ARMS (Saul et al. 2015; McFarland et al. 2019): Creative Commons non-commercial; numbers for checks only",
       "planes": planes, "elevations": elevs, "muscles": data,
       "ranges": {c: [round(math.degrees(cs.get(c).getRangeMin())), round(math.degrees(cs.get(c).getRangeMax()))] for c in COORDS}}
with open(out, "w") as f:
    json.dump(res, f)
print(f"wrote {out}: {len(mnames)} muscles")
