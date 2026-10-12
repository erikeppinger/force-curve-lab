#!/usr/bin/env python3
"""Trunk muscles from the OpenSim lumbar spine model (Christophy et al. 2012, MIT licence).

    python tools/lumbar_export.py Lumbar_C_210.osim data/opensim/lumbar-muscles.json

Writes, for each muscle group and side (rectus abdominis, external and internal obliques, psoas,
iliocostalis, longissimus, multifidus, quadratus lumborum; right and left):
- capacity: the summed force at full activation (fibre-tendon equilibrium, force-length at the
  posture) times the moment arm about each of the model's three trunk coordinates
  (flex_extension, lat_bending, axial_rotation; N·m), along sweeps of each coordinate with the
  others neutral;
- paths: every fascicle's path points in the neutral posture (ground frame, metres, rounded);
- posed: the same paths and the bodies' positions along the flex_extension sweep (pelvis fixed),
  so the page can bend the lumbar spine by interpolating (fascicles in the order of `paths`).
The coordinates' signs are the model's; the JSON records which way is flexion, right bending and
right rotation by checking the rectus abdominis and the right external oblique.
"""
import json
import math
import re
import sys

import opensim as osim

src, out = sys.argv[1:3]
model = osim.Model(src)
state = model.initSystem()
cs = model.getCoordinateSet()
muscles = model.getMuscles()
COORDS = ["flex_extension", "lat_bending", "axial_rotation"]
GROUPS = [("rectus-abdominis", r"^rect_abd"), ("external-oblique", r"^EO"), ("internal-oblique", r"^IO"), ("psoas", r"^Ps_"),
          ("iliocostalis", r"^IL_"), ("longissimus", r"^LT"), ("multifidus", r"^MF_"), ("quadratus-lumborum", r"^QL_")]


def group_of(name):
    for g, pat in GROUPS:
        if re.search(pat, name):
            return g
    return None


def side_of(name):
    return "r" if name.endswith("_r") or name.endswith("_R") else "l"


def pose(values):
    for c in COORDS:
        cs.get(c).setValue(state, math.radians(values.get(c, 0.0)), False)
    model.assemble(state)
    model.realizePosition(state)


def capacities(values):
    pose(values)
    for i in range(muscles.getSize()):
        muscles.get(i).setActivation(state, 1.0)
    model.equilibrateMuscles(state)
    model.realizeDynamics(state)
    out = {}
    for i in range(muscles.getSize()):
        m = muscles.get(i)
        g = group_of(m.getName())
        if not g:
            continue
        F = m.getActiveFiberForceAlongTendon(state)
        key = f"{g}_{side_of(m.getName())}"
        acc = out.setdefault(key, {c: 0.0 for c in COORDS})
        for c in COORDS:
            acc[c] += F * m.computeMomentArm(state, cs.get(c))
    return {k: {c: round(v, 2) for c, v in d.items()} for k, d in out.items()}


SWEEPS = {"flex_extension": list(range(-60, 21, 10)), "lat_bending": list(range(-20, 21, 10)), "axial_rotation": list(range(-30, 31, 15))}
res = {"licence": "Derived from the lumbar spine model of Christophy M, Faruk Senan NA, Lotz JC, O'Reilly OM (2012), A musculoskeletal model for the lumbar spine, Biomech Model Mechanobiol 11:19-34 (simtk.org/projects/lumbarspine, MIT licence).",
       "coords": COORDS, "sweeps": {}}
for c, vals in SWEEPS.items():
    res["sweeps"][c] = [{"deg": v, "groups": capacities({c: v})} for v in vals]

# Signs: the rectus abdominis flexes, the right external oblique bends right and turns the trunk left.
neutral = res["sweeps"]["flex_extension"][[s["deg"] for s in res["sweeps"]["flex_extension"]].index(0)]["groups"]
res["signs"] = {"flexion": "negative" if neutral["rectus-abdominis_r"]["flex_extension"] < 0 else "positive",
                "rightBendByRightEO": "positive" if neutral["external-oblique_r"]["lat_bending"] > 0 else "negative",
                "rotationByRightEO": "positive" if neutral["external-oblique_r"]["axial_rotation"] > 0 else "negative"}

bodies = model.getBodySet()


def snapshot(digits):
    """Paths of every grouped fascicle and the bodies' origins in the current posture, plus a point
    40 cm up the torso (`thorax`, roughly the upper back) so the spine can be drawn above L1."""
    paths = {}
    for i in range(muscles.getSize()):
        m = muscles.get(i)
        g = group_of(m.getName())
        if not g:
            continue
        pp = m.getGeometryPath().getCurrentPath(state)
        pts = [[round(v, digits) for v in pp.get(k).getLocationInGround(state).to_numpy()] for k in range(pp.getSize())]
        paths.setdefault(g, []).append({"name": m.getName(), "side": side_of(m.getName()), "path": pts})
    b = {bodies.get(i).getName(): [round(v, digits) for v in bodies.get(i).getPositionInGround(state).to_numpy()] for i in range(bodies.getSize())}
    torso = bodies.get("torso")
    b["thorax"] = [round(v, digits) for v in torso.findStationLocationInGround(state, osim.Vec3(0, 0.4, 0)).to_numpy()]
    return paths, b


# Paths in the neutral posture.
pose({})
res["paths"], res["bodies"] = snapshot(4)
# The same along the flexion sweep (path point counts can change with wrapping: kept per pose).
res["posed"] = []
for deg in SWEEPS["flex_extension"]:
    pose({"flex_extension": deg})
    p, b = snapshot(3)
    res["posed"].append({"deg": deg, "bodies": b, "paths": {g: [f["path"] for f in lst] for g, lst in p.items()}})
with open(out, "w") as f:
    json.dump(res, f, separators=(",", ":"))
print("signs", res["signs"])
for g in ["rectus-abdominis", "external-oblique", "internal-oblique", "iliocostalis", "longissimus", "multifidus", "quadratus-lumborum", "psoas"]:
    print(g, {s: neutral.get(f"{g}_{s}") for s in "rl"})
print(f"wrote {out}")
