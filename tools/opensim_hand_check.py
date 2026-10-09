#!/usr/bin/env python3
"""Hand and wrist numbers from the ARMS model (McFarland et al. 2021), to check the edge lift and
the wrist curls. Run locally with OpenSim:

    python tools/opensim_hand_check.py Hand_Wrist_Model_for_development.osim out.json

The ARMS model is licensed for NON-COMMERCIAL use only (BSD 3-clause, non-commercial terms):
the model file stays out of the repo, and numbers derived from it must be marked as such.

Writes JSON with:
- index: FDP and FDS moment arms (m) about the index finger's DIP, PIP and MCP, each joint swept
  on its own (the others at 0), and at the edge lift's three grip postures;
- fingers: per finger, FDP and FDS max isometric force and their active force (full activation,
  fibre-tendon equilibrium) at each grip posture, wrist neutral;
- wrist: for wrist flexion -60..60 (OpenSim sign, + = flexion), every wrist-crossing muscle's
  moment arm and active force, with the fingers straight and in a hand-held grip (estimate:
  MCP 40, PIP 60, DIP 30).
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
FINGERS = {"index": "2", "middle": "3", "ring": "4", "little": "5"}
SLIP = {"index": "I", "middle": "M", "ring": "R", "little": "L"}
# The edge lift's grips (degrees of flexion; data/exercises/edge-lift.json, index finger).
GRIPS = {"open-hand": {"mcp": -21, "pip": 25.9, "dip": 38.8}, "half-crimp": {"mcp": 0, "pip": 90, "dip": 0},
         "full-crimp": {"mcp": -2.6, "pip": 106.5, "dip": -22.6}}


def pose(values):
    """values: {coordinate name: degrees}; every other coordinate 0."""
    for i in range(cs.getSize()):
        c = cs.get(i)
        c.setValue(state, math.radians(values.get(c.getName(), 0.0)), False)
    model.assemble(state)
    model.realizePosition(state)


def finger_pose(g, grip):
    return {f"{g}mcp_flexion": grip["mcp"], f"{g}pm_flexion": grip["pip"], f"{g}md_flexion": grip["dip"]}


def all_fingers(grip):
    p = {}
    for g in FINGERS.values():
        p.update(finger_pose(g, grip))
    return p


def active_forces():
    for i in range(muscles.getSize()):
        muscles.get(i).setActivation(state, 1.0)
    model.equilibrateMuscles(state)
    model.realizeDynamics(state)
    return {muscles.get(i).getName(): muscles.get(i).getActiveFiberForceAlongTendon(state) for i in range(muscles.getSize())}


def arm(name, coord):
    return muscles.get(name).computeMomentArm(state, cs.get(coord))


res = {"model": src.replace("\\", "/").split("/")[-1], "opensim": osim.GetVersionAndDate(),
       "licence": "ARMS hand and wrist model: non-commercial use only (BSD 3-clause with non-commercial terms); cite McFarland DC, Binder-Markey BI, Nichols JA, Wohlman SJ, de Bruin M, Murray WM (2021), bioRxiv 2021.12.28.474357."}

# 1. Index finger moment arms.
sweep = {"dip": ("2md_flexion", range(-30, 91, 10)), "pip": ("2pm_flexion", range(0, 111, 10)), "mcp": ("2mcp_flexion", range(-30, 91, 10))}
idx = {"sweep": {}, "grips": {}}
for joint, (coord, angles) in sweep.items():
    rows = []
    for a in angles:
        pose({coord: a})
        rows.append({"deg": a, "fdp": arm("FDPI", coord), "fds": arm("FDSI", coord) if joint != "dip" else 0.0})
    idx["sweep"][joint] = rows
for gname, grip in GRIPS.items():
    pose(finger_pose("2", grip))
    idx["grips"][gname] = {j: {"fdp": arm("FDPI", c), "fds": arm("FDSI", c) if j != "dip" else 0.0}
                           for j, c in [("dip", "2md_flexion"), ("pip", "2pm_flexion"), ("mcp", "2mcp_flexion")]}
res["index"] = idx

# 2. Per-finger force at each grip.
fingers = {}
for gname, grip in GRIPS.items():
    pose(all_fingers(grip))
    F = active_forces()
    fingers[gname] = {f: {"fdpMax": muscles.get(f"FDP{s}").getMaxIsometricForce(), "fdsMax": muscles.get(f"FDS{s}").getMaxIsometricForce(),
                          "fdp": F[f"FDP{s}"], "fds": F[f"FDS{s}"]} for f, s in SLIP.items()}
res["fingers"] = fingers

# 3. Wrist.
WRIST = ["FCR", "FCU", "PL", "ECRL", "ECRB", "ECU"] + [f"FDP{s}" for s in "ILMR"] + [f"FDS{s}" for s in "ILMR"] + [f"EDC{s}" for s in "ILMR"] + ["EDM", "EIP", "FPL", "APL", "EPL", "EPB"]
wrist = {}
for label, grip in [("straight", {"mcp": 0, "pip": 0, "dip": 0}), ("grip", {"mcp": 40, "pip": 60, "dip": 30})]:
    rows = []
    for a in range(-60, 61, 10):
        p = all_fingers(grip)
        p["flexion"] = a
        pose(p)
        F = active_forces()
        rows.append({"deg": a, "muscles": {n: {"arm": arm(n, "flexion"), "active": F[n], "max": muscles.get(n).getMaxIsometricForce()} for n in WRIST}})
    wrist[label] = rows
res["wrist"] = wrist
with open(out, "w") as f:
    json.dump(res, f, indent=1)
print(f"wrote {out}")
