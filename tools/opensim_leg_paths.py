#!/usr/bin/env python3
"""Right-leg muscle paths from the Rajagopal et al. 2016 model (MIT licence) for the 3D lifts'
muscle drawings (js/legmodel.js). Run with OpenSim:

    python tools/opensim_leg_paths.py Rajagopal2016.osim data/opensim/leg-paths.json

Every path point of each right-leg muscle, relative to the joint centre of its segment, in the
model's axes with every coordinate at zero (x forward, y up, z to the right): pelvis points
relative to the hip centre, femur points relative to the hip centre, tibia points relative to the
knee centre, talus, calcaneus and toe points relative to the ankle centre. Kneecap points (the
quadriceps' insertion) move with the knee: tabulated relative to the knee centre, in the tibia's
axes, every 10° of knee flexion. Wrapping surfaces are left out (the drawing joins the points).
Also: segment lengths (hip → knee, knee → ankle centres) and each muscle's maximum isometric force.
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
    c = cs.get(i)
    if not c.isConstrained(state):
        c.setValue(state, 0.0, False)
model.assemble(state)
model.realizePosition(state)
ground = model.getGround()
bodies = model.getBodySet()


def vec(v):
    return [v.get(0), v.get(1), v.get(2)]


def in_ground(body, loc):
    return vec(bodies.get(body).findStationLocationInGround(state, osim.Vec3(*loc)))


def joint_centre(joint):
    return vec(model.getJointSet().get(joint).getChildFrame().getPositionInGround(state))


HIP, KNEE, ANKLE = joint_centre("hip_r"), joint_centre("walker_knee_r"), joint_centre("ankle_r")
SEG = {"pelvis": HIP, "femur_r": HIP, "tibia_r": KNEE, "talus_r": ANKLE, "calcn_r": ANKLE, "toes_r": ANKLE}
REL = {"pelvis": "pelvis", "femur_r": "femur", "tibia_r": "tibia", "talus_r": "foot", "calcn_r": "foot", "toes_r": "foot"}
r = lambda p, c: [round(p[k] - c[k], 5) for k in range(3)]

# Kneecap points: at each knee angle, in the tibia's axes, then carried back to the neutral pose.
knee = cs.get("knee_angle_r")
tibia = bodies.get("tibia_r")
R0 = tibia.getTransformInGround(state).R()
t0 = vec(tibia.getPositionInGround(state))
ANGLES = list(range(0, 141, 10))


def patella_track(loc):
    rows = []
    for a in ANGLES:
        knee.setValue(state, math.radians(a), True)
        model.realizePosition(state)
        p_tib = vec(bodies.get("patella_r").findStationLocationInAnotherFrame(state, osim.Vec3(*loc), tibia))
        # neutral-pose ground position of that tibia-fixed point, relative to the knee centre
        g = [sum(R0.get(i, j) * p_tib[j] for j in range(3)) + t0[i] for i in range(3)]
        rows.append([a] + r(g, KNEE))
    knee.setValue(state, 0.0, True)
    model.realizePosition(state)
    return rows


# Wrapping cylinders on the right leg's bodies (and the pelvis): centre relative to the segment's
# joint centre and the cylinder's own axes (its z = the axis), in the model's axes at the neutral
# pose; radius; quadrant (the side the path must stay on, OpenSim's convention).
def rot_xyz(r):
    cx, sx, cy, sy, cz, sz = math.cos(r[0]), math.sin(r[0]), math.cos(r[1]), math.sin(r[1]), math.cos(r[2]), math.sin(r[2])
    Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
    mul = lambda A, B: [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mul(mul(Rx, Ry), Rz)


wraps = {}
for bname in ("pelvis", "femur_r", "tibia_r"):
    b = bodies.get(bname)
    Rb = b.getTransformInGround(state).R()
    Rg = [[Rb.get(i, j) for j in range(3)] for i in range(3)]
    ws = b.getWrapObjectSet()
    for k in range(ws.getSize()):
        w = osim.WrapCylinder.safeDownCast(ws.get(k))
        if w is None:
            continue
        name = w.getName()
        if bname == "pelvis" and not name.endswith("_r"):
            continue
        Rw = rot_xyz(vec(w.get_xyz_body_rotation()))
        axes = [[round(sum(Rg[i][m] * Rw[m][j] for m in range(3)), 5) for i in range(3)] for j in range(3)]  # columns: x, y, z axis
        wraps[name] = {"seg": REL[bname], "c": r(in_ground(bname, vec(w.get_translation())), SEG[bname]), "axes": axes,
                       "radius": round(w.get_radius(), 4), "quadrant": w.get_quadrant()}

muscles = {}
ms = model.getMuscles()
for i in range(ms.getSize()):
    m = ms.get(i)
    name = m.getName()
    if not name.endswith("_r"):
        continue
    pts = []
    pps = m.getGeometryPath().getPathPointSet()
    for k in range(pps.getSize()):
        pp = pps.get(k)
        body = pp.getParentFrame().findBaseFrame().getName()
        loc = vec(pp.getLocation(state))
        if body == "patella_r":
            pts.append({"seg": "patella", "track": patella_track(loc)})
        else:
            pts.append({"seg": REL[body], "p": r(in_ground(body, loc), SEG[body])})
    wl = m.getGeometryPath().getWrapSet()
    names = [wl.get(k).getWrapObjectName() for k in range(wl.getSize())]
    muscles[name] = {"fmax": round(m.getMaxIsometricForce(), 1), "points": pts, **({"wraps": names} if names else {})}

# Check values for the drawing (tests/legmodel.test.mjs): each muscle's path length in OpenSim,
# standing straight and with the hip, knee or ankle bent.
POSES = {"neutral": {}, "hip90": {"hip_flexion_r": 90}, "knee90": {"knee_angle_r": 90}, "ankle20": {"ankle_angle_r": 20}}
check = {}
for pose, vals in POSES.items():
    for c, v in vals.items():
        cs.get(c).setValue(state, math.radians(v), False)
    model.assemble(state)
    model.realizePosition(state)
    check[pose] = {n: round(ms.get(n).getGeometryPath().getLength(state), 4) for n in muscles}
    for c in vals:
        cs.get(c).setValue(state, 0.0, False)
    model.assemble(state)
    model.realizePosition(state)

res = {
    "model": src.replace("\\", "/").split("/")[-1],
    "licence": "Rajagopal et al. 2016 full-body model, MIT licence",
    "opensim": osim.GetVersionAndDate(),
    "axes": "x forward, y up, z to the right; every coordinate at zero",
    "lengths": {"femur": round(math.dist(HIP, KNEE), 4), "tibia": round(math.dist(KNEE, ANKLE), 4)},
    "hip": r(HIP, HIP), "knee": r(KNEE, HIP), "ankle": r(ANKLE, KNEE),
    "patellaAngles": ANGLES,
    "wraps": wraps,
    "muscles": muscles,
    "checkLengths": {"poses": POSES, "lengths": check},
}
with open(out, "w") as f:
    json.dump(res, f, separators=(",", ":"))
print(f"wrote {out}: {len(muscles)} muscles")
