#!/usr/bin/env python3
"""Shoulder muscle geometry from the MoBL-ARMS model (Saul et al. 2015, as updated by McFarland et
al. 2019) for tools/mobl-cuff.mjs (rotator-cuff weights of the presses, pulls and rows). Run with
OpenSim:

    python tools/opensim_shoulder_export.py MOBL_ARMS_fixed_41.osim out.json [step]

LICENCE: MoBL-ARMS is under a Creative Commons non-commercial licence: what is made from this
export must say "non-commercial use only" (as the ARMS hand data do).

Grid (degrees, `step` apart, default 15): elv_angle (plane of elevation, 0 = out to the side, 90 =
forward) -90..120, shoulder_elv 0..180, shoulder_rot -90..90, and elbow_flexion 0..135 (45 apart).
At each posture, in the thorax (= ground: x forward, y up, z to the right):
  - hum: the upper arm's direction (shoulder joint -> elbow), fore: the forearm's (elbow -> wrist);
  - axes: the upper arm's angular velocity per unit rate of each shoulder coordinate (rad/rad),
    and vels: the shoulder joint centre's velocity (m/rad; the model moves the shoulder blade with
    the arm), so a moment M (N·m, about the joint centre) and a force F (N) on the arm have the
    generalised moment M·axis + F·vel about that coordinate;
  - per muscle crossing the shoulder: its moment arm about each shoulder coordinate (m, OpenSim
    sign) and its active force at full activation (N, fibre-tendon equilibrium).
"""
import json
import math
import sys

import numpy as np
import opensim as osim

src, out = sys.argv[1:3]
step = int(sys.argv[3]) if len(sys.argv) > 3 else 15
model = osim.Model(src)
state = model.initSystem()
cs = model.getCoordinateSet()
for i in range(cs.getSize()):
    cs.get(i).setClamped(state, False)
COORDS = ["elv_angle", "shoulder_elv", "shoulder_rot"]
MUSCLES = ["DELT1", "DELT2", "DELT3", "SUPSP", "INFSP", "SUBSC", "TMIN", "TMAJ", "PECM1", "PECM2", "PECM3",
           "LAT1", "LAT2", "LAT3", "CORB", "TRIlong", "BIClong", "BICshort"]
muscles = model.getMuscles()
ground = model.getGround()
hum, ulna, hand = (model.getBodySet().get(n) for n in ("humerus", "ulna", "hand"))
free = [cs.get(i) for i in range(cs.getSize()) if not cs.get(i).isConstrained(state)]


def pose(vals):
    for c in free:
        c.setValue(state, 0.0, False)
    for k, v in vals.items():
        cs.get(k).setValue(state, math.radians(v), False)
    model.assemble(state)
    model.realizePosition(state)


def rot(body):
    R = body.getTransformInGround(state).R()
    return np.array([[R.get(i, j) for j in range(3)] for i in range(3)])


def origin(body):
    p = body.getPositionInGround(state)
    return np.array([p.get(0), p.get(1), p.get(2)])


def unit(v):
    return (v / np.linalg.norm(v)).round(5).tolist()


grid = {"elv_angle": list(range(-90, 121, step)), "shoulder_elv": list(range(0, 181, step)),
        "shoulder_rot": list(range(-90, 91, step)), "elbow_flexion": [0, 45, 90, 135]}
rows = []
H = 1e-3  # rad, for the axes
# Checkpoint after each plane of elevation (the full grid takes about half an hour): a rerun picks up
# where the last one stopped.
part = out + ".part"
try:
    with open(part) as f:
        rows = json.load(f)
except (OSError, ValueError):
    rows = []
done = {r["q"][0] for r in rows}
for p in grid["elv_angle"]:
    if p in done:
        continue
    for e in grid["shoulder_elv"]:
        for r in grid["shoulder_rot"]:
            for el in grid["elbow_flexion"]:
                vals = {"elv_angle": p, "shoulder_elv": e, "shoulder_rot": r, "elbow_flexion": el}
                axes, vels = [], []
                for c in COORDS:
                    # One-sided at the ends of the range: the shoulder-blade couplings stop there.
                    lo, hi = (math.degrees(cs.get(c).getRangeMin()), math.degrees(cs.get(c).getRangeMax()))
                    a = vals[c] - (math.degrees(H) if vals[c] - math.degrees(H) >= lo else 0)
                    b = vals[c] + (math.degrees(H) if vals[c] + math.degrees(H) <= hi else 0)
                    pose({**vals, c: b}); R1, P1 = rot(hum), origin(hum)
                    pose({**vals, c: a}); R0, P0 = rot(hum), origin(hum)
                    d = math.radians(b - a)
                    W = (R1 - R0) @ ((R1 + R0) / 2).T / d  # skew matrix of the angular velocity
                    axes.append([round(float(x), 5) for x in ((W[2, 1] - W[1, 2]) / 2, (W[0, 2] - W[2, 0]) / 2, (W[1, 0] - W[0, 1]) / 2)])
                    vels.append([round(float(x), 5) for x in (P1 - P0) / d])  # the shoulder joint centre moves with the blade
                pose(vals)
                row = {"q": [p, e, r, el], "hum": unit(origin(ulna) - origin(hum)), "fore": unit(origin(hand) - origin(ulna)), "axes": axes, "vels": vels, "m": {}}
                for n in MUSCLES:
                    muscles.get(n).setActivation(state, 1.0)
                try:
                    model.equilibrateMuscles(state)
                except RuntimeError:  # one muscle's fibre equilibrium can fail at extreme postures: each on its own
                    row["failed"] = []
                    for n in MUSCLES:
                        try:
                            muscles.get(n).computeEquilibrium(state)
                        except RuntimeError:
                            row["failed"].append(n)
                # A muscle whose equilibrium failed is switched off for this posture (force 0, listed
                # in "failed"), so the others' forces can still be computed.
                for n in row.get("failed", []):
                    muscles.get(n).setAppliesForce(state, False)
                try:
                    model.realizeDynamics(state)
                    ok = True
                except RuntimeError:
                    ok = False
                    row["failed"] = list(MUSCLES)
                for n in MUSCLES:
                    m = muscles.get(n)
                    try:
                        f = m.getActiveFiberForceAlongTendon(state) if ok and n not in row.get("failed", []) else 0.0
                    except RuntimeError:
                        f = 0.0
                        row.setdefault("failed", []).append(n)
                    row["m"][n] = [round(m.computeMomentArm(state, cs.get(c)), 5) for c in COORDS] + [round(f, 1)]
                for n in MUSCLES:
                    muscles.get(n).setAppliesForce(state, True)
                rows.append(row)
    with open(part, "w") as f:
        json.dump(rows, f)
    print(f"plane {p} done", flush=True)
res = {"model": src.replace("\\", "/").split("/")[-1], "opensim": osim.GetVersionAndDate(),
       "licence": "MoBL-ARMS (Saul et al. 2015; McFarland et al. 2019): Creative Commons non-commercial; NON-COMMERCIAL use only",
       "grid": grid, "coords": COORDS, "muscles": MUSCLES, "fmax": {n: muscles.get(n).getMaxIsometricForce() for n in MUSCLES}, "rows": rows}
with open(out, "w") as f:
    json.dump(res, f)
print(f"wrote {out}: {len(rows)} postures")
