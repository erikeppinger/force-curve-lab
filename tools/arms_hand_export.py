#!/usr/bin/env python3
"""Hand geometry for the app's 3D hand view, from the ARMS hand and wrist model.

    python tools/arms_hand_export.py Hand_Wrist_Model_for_development.osim data/opensim/arms-hand.json

LICENCE: the ARMS model (McFarland et al. 2021) is for NON-COMMERCIAL use only. The JSON this
writes is derived from it and carries that restriction (stated in its `licence` field); the app
marks every view that uses it.

For each posture (the edge lift's three grips, wrist neutral) it writes, in a hand frame
(origin at the middle finger's MCP joint, metres; x towards the fingertips with the fingers
straight, y towards the palm, z towards the thumb side; right-handed, y = z × x):
- joints: every finger's and the thumb's joint centres from the wrist to the fingertip;
- muscles: every muscle's current path (points incl. wrapping), its maximum isometric force and
  its active force at full activation (fibre-tendon equilibrium).
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
muscles = model.getMuscles()
bodies = model.getBodySet()

GRIPS = {"open-hand": {"mcp": -21, "pip": 25.9, "dip": 38.8}, "half-crimp": {"mcp": 0, "pip": 90, "dip": 0},
         "full-crimp": {"mcp": -2.6, "pip": 106.5, "dip": -22.6}}
FINGERS = {"index": "2", "middle": "3", "ring": "4", "little": "5"}
# Thumb resting beside the index finger (estimate) for the edge grips.
THUMB = {"cmc_flexion": 0, "cmc_abduction": 0, "mp_flexion": 10, "ip_flexion": 10}


def pose(values):
    for i in range(cs.getSize()):
        c = cs.get(i)
        c.setValue(state, math.radians(values.get(c.getName(), 0.0)), False)
    model.assemble(state)
    model.realizePosition(state)


def ground(body, local=(0, 0, 0)):
    p = bodies.get(body).findStationLocationInGround(state, osim.Vec3(*local))
    return [p.get(0), p.get(1), p.get(2)]


def hand_frame():
    """Origin at the 3rd MCP; x along the 3rd metacarpal (wrist -> MCP), y and z from the 2nd/5th MCPs."""
    o = ground("3proxph")
    wrist = ground("thirdmc")
    x = [o[i] - wrist[i] for i in range(3)]
    n = math.sqrt(sum(v * v for v in x)); x = [v / n for v in x]
    side = [ground("2proxph")[i] - ground("5proxph")[i] for i in range(3)]  # towards the index (thumb side)
    d = sum(side[i] * x[i] for i in range(3)); z = [side[i] - d * x[i] for i in range(3)]
    n = math.sqrt(sum(v * v for v in z)); z = [v / n for v in z]
    y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]  # z × x: right-handed, y towards the palm

    return o, x, y, z


def to_hand(p, frame):
    o, x, y, z = frame
    d = [p[i] - o[i] for i in range(3)]
    return [round(sum(d[i] * a[i] for i in range(3)), 5) for a in (x, y, z)]


def active_forces():
    for i in range(muscles.getSize()):
        muscles.get(i).setActivation(state, 1.0)
    model.equilibrateMuscles(state)
    model.realizeDynamics(state)
    return {muscles.get(i).getName(): muscles.get(i).getActiveFiberForceAlongTendon(state) for i in range(muscles.getSize())}


# Fingertips: each distal phalanx's axis (from the previous joint, all joints straight) carried
# with the bone, at the app's distal phalanx lengths (index, middle, ring, little; thumb estimate).
TIP_LEN = {"2": 0.0187, "3": 0.0186, "4": 0.0185, "5": 0.0170, "thumb": 0.025}
pose({})
tip_local = {}
for g in FINGERS.values():
    a, b = ground(f"{g}midph"), ground(f"{g}distph")
    d = [b[i] - a[i] for i in range(3)]; n = math.sqrt(sum(v * v for v in d))
    dg = osim.Vec3(*[TIP_LEN[g] * v / n for v in d])
    tip_local[g] = model.getGround().expressVectorInAnotherFrame(state, dg, bodies.get(f"{g}distph"))
a, b = ground("proximal_thumb"), ground("distal_thumb")
d = [b[i] - a[i] for i in range(3)]; n = math.sqrt(sum(v * v for v in d))
tip_local["thumb"] = model.getGround().expressVectorInAnotherFrame(state, osim.Vec3(*[TIP_LEN["thumb"] * v / n for v in d]), bodies.get("distal_thumb"))


def tip(g):
    body = "distal_thumb" if g == "thumb" else f"{g}distph"
    v = tip_local[g]
    return ground(body, (v.get(0), v.get(1), v.get(2)))


res = {"licence": "Derived from the ARMS hand and wrist model (McFarland DC, Binder-Markey BI, Nichols JA, Wohlman SJ, de Bruin M, Murray WM (2021). A musculoskeletal model of the hand and wrist capable of simulating functional tasks. bioRxiv 2021.12.28.474357): NON-COMMERCIAL use only (BSD 3-clause with non-commercial terms, Copyright (c) 2021-present Northwestern University, Shirley Ryan AbilityLab, Drexel University, University of Florida, and Edward Hines VA Medical Center).",
       "frame": "metres; origin at the middle finger's MCP joint; x along the middle metacarpal towards the fingers, z towards the index/thumb side, y = z × x (towards the palm); right-handed", "postures": {}}
for gname, grip in GRIPS.items():
    p = dict(THUMB)
    for g in FINGERS.values():
        p.update({f"{g}mcp_flexion": grip["mcp"], f"{g}pm_flexion": grip["pip"], f"{g}md_flexion": grip["dip"]})
    pose(p)
    fr = hand_frame()
    joints = {}
    for f, g in FINGERS.items():
        mc = {"2": "secondmc", "3": "thirdmc", "4": "fourthmc", "5": "fifthmc"}[g]
        joints[f] = [to_hand(ground(mc), fr), to_hand(ground(f"{g}proxph"), fr), to_hand(ground(f"{g}midph"), fr), to_hand(ground(f"{g}distph"), fr), to_hand(tip(g), fr)]
    joints["thumb"] = [to_hand(ground("firstmc1"), fr), to_hand(ground("proximal_thumb"), fr), to_hand(ground("distal_thumb"), fr), to_hand(tip("thumb"), fr)]
    joints["wrist"] = to_hand(ground("capitate"), fr)
    F = active_forces()
    pose(p)  # equilibrate leaves positions; re-realize
    mus = {}
    for i in range(muscles.getSize()):
        m = muscles.get(i)
        path = m.getGeometryPath().getCurrentPath(state)
        pts = []
        for k in range(path.getSize()):
            pp = path.get(k)
            pts.append(to_hand(list(pp.getLocationInGround(state).to_numpy()), fr))
        mus[m.getName()] = {"path": pts, "max": round(m.getMaxIsometricForce(), 1), "active": round(F[m.getName()], 1)}
    res["postures"][gname] = {"joints": joints, "muscles": mus}
with open(out, "w") as f:
    json.dump(res, f, separators=(",", ":"))
print(f"wrote {out}")
