#!/usr/bin/env python3
"""Export leg-muscle moment arms and force capacity from an OpenSim model as JSON.

Run locally with OpenSim installed (free; e.g. `conda install -c opensim-org opensim`):

    python tools/opensim_export.py path/to/Rajagopal2016.osim data/opensim/rajagopal-right-leg.json

Made for the Rajagopal et al. 2016 full-body model (https://simtk.org/home/full_body),
but any model works if the coordinate names are given (see --help). Only the JSON output
belongs in the repo; the model file stays out unless its licence allows it.

What it writes, for every right-leg muscle that crosses the hip, knee or ankle:
- the muscle's parameters (max isometric force, optimal fibre length, tendon slack length,
  pennation angle);
- on two angle grids (hip flexion x knee angle, knee angle x ankle angle; the other
  coordinates held at 0):
  - the moment arm about each coordinate it crosses (metres, OpenSim's sign: positive
    = the muscle pulls the coordinate in its positive direction);
  - the active fibre force along the tendon at full activation, and the passive force
    (newtons), so moment arm x force gives the muscle's torque capacity at that posture.

Angles are in degrees, in the model's own coordinate convention (recorded in the output
with each coordinate's range). Converting to the app's conventions happens when the JSON
is turned into exercise data, not here.
"""

import argparse
import datetime
import json
import math
import sys

try:
    import opensim as osim
except ImportError:  # pragma: no cover - depends on the local install
    sys.exit("OpenSim's Python package isn't installed. See https://opensimconfluence.atlassian.net "
             "(conda: conda install -c opensim-org opensim).")

DEFAULT_COORDS = {
    "hip_flexion": "hip_flexion_r",
    "hip_adduction": "hip_adduction_r",
    "hip_rotation": "hip_rotation_r",
    "knee": "knee_angle_r",
    "ankle": "ankle_angle_r",
}


def frange(lo, hi, step):
    n = int(round((hi - lo) / step))
    return [lo + i * step for i in range(n + 1)]


def parse_range(text):
    lo, hi, step = (float(x) for x in text.split(":"))
    if step <= 0 or hi < lo:
        raise argparse.ArgumentTypeError(f"bad range {text!r}: use lo:hi:step with step > 0")
    return frange(lo, hi, step)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model", help="the .osim model file")
    ap.add_argument("out", help="output JSON path")
    ap.add_argument("--side", default="_r", help="suffix of the leg's muscles (default _r)")
    for key, name in DEFAULT_COORDS.items():
        ap.add_argument(f"--{key.replace('_', '-')}", default=name, help=f"coordinate name (default {name})")
    ap.add_argument("--hip-range", type=parse_range, default=frange(-20, 120, 10), help="hip flexion grid, lo:hi:step degrees (default -20:120:10). Write it with = when it starts with a minus: --hip-range=-20:120:10")
    ap.add_argument("--knee-range", type=parse_range, default=frange(0, 120, 10), help="knee grid (default 0:120:10)")
    ap.add_argument("--ankle-range", type=parse_range, default=frange(-30, 30, 10), help="ankle grid (default -30:30:10); e.g. --ankle-range=-30:30:5")
    args = ap.parse_args(argv)

    model = osim.Model(args.model)
    state = model.initSystem()
    coordset = model.getCoordinateSet()
    names = [coordset.get(i).getName() for i in range(coordset.getSize())]

    coords = {}
    for key in DEFAULT_COORDS:
        name = getattr(args, key)
        if name not in names:
            sys.exit(f"Coordinate {name!r} not in the model. Its coordinates: {', '.join(names)}. "
                     f"Pass the right one with --{key.replace('_', '-')}.")
        coords[key] = coordset.get(name)

    def set_pose(pose):
        """pose: {key: degrees}; every listed coordinate not in pose is set to 0."""
        for key, c in coords.items():
            c.setValue(state, math.radians(pose.get(key, 0.0)), False)
        model.assemble(state)  # satisfy constraints (e.g. the patella's coupling to the knee)
        model.realizePosition(state)

    muscles = model.getMuscles()
    leg = [muscles.get(i) for i in range(muscles.getSize()) if muscles.get(i).getName().endswith(args.side)]
    if not leg:
        sys.exit(f"No muscles ending in {args.side!r}.")

    # Which coordinates each muscle crosses: a non-zero moment arm at any of a few probe poses.
    probes = [{}, {"hip_flexion": 60, "knee": 60, "ankle": 10}, {"hip_flexion": 100, "knee": 100, "ankle": -20}]
    crosses = {m.getName(): set() for m in leg}
    for pose in probes:
        set_pose(pose)
        for m in leg:
            for key, c in coords.items():
                if abs(m.computeMomentArm(state, c)) > 1e-4:
                    crosses[m.getName()].add(key)
    leg = [m for m in leg if crosses[m.getName()]]

    def capacity(m):
        """Active (full activation) and passive fibre force along the tendon at the current pose."""
        try:
            m.setActivation(state, 1.0)
            model.equilibrateMuscles(state)
            model.realizeDynamics(state)
            return m.getActiveFiberForceAlongTendon(state), m.getPassiveFiberForceAlongTendon(state)
        except Exception:  # some muscle types have no activation state; report no force rather than guess
            return None, None

    grids = []
    for name, (k1, r1), (k2, r2) in [
        ("hip-knee", ("hip_flexion", args.hip_range), ("knee", args.knee_range)),
        ("knee-ankle", ("knee", args.knee_range), ("ankle", args.ankle_range)),
    ]:
        data = {m.getName(): {"momentArm": {k: [] for k in sorted(crosses[m.getName()])}, "activeForce": [], "passiveForce": []} for m in leg}
        for a1 in r1:
            rows = {m.getName(): {"momentArm": {k: [] for k in data[m.getName()]["momentArm"]}, "activeForce": [], "passiveForce": []} for m in leg}
            for a2 in r2:
                set_pose({k1: a1, k2: a2})
                for m in leg:
                    row = rows[m.getName()]
                    for k in row["momentArm"]:
                        row["momentArm"][k].append(round(m.computeMomentArm(state, coords[k]), 5))
                    act, pas = capacity(m)
                    row["activeForce"].append(None if act is None else round(act, 1))
                    row["passiveForce"].append(None if pas is None else round(pas, 1))
            for mname, row in rows.items():
                for k, v in row["momentArm"].items():
                    data[mname]["momentArm"][k].append(v)
                data[mname]["activeForce"].append(row["activeForce"])
                data[mname]["passiveForce"].append(row["passiveForce"])
            print(f"{name}: {k1} {a1:g}° done", file=sys.stderr)
        grids.append({
            "name": name,
            "rows": {"coordinate": k1, "degrees": r1},
            "columns": {"coordinate": k2, "degrees": r2},
            "fixedAtZero": [k for k in coords if k not in (k1, k2)],
            "muscles": data,
        })

    def rng(c):
        return [round(math.degrees(c.getRangeMin()), 1), round(math.degrees(c.getRangeMax()), 1)]

    out = {
        "note": "Generated by tools/opensim_export.py. Moment arms in metres (OpenSim sign: positive pulls the coordinate in its positive direction); forces in newtons. Arrays are [row][column] over each grid's degrees.",
        "model": model.getName(),
        "modelFile": args.model.replace("\\", "/").split("/")[-1],
        "opensimVersion": osim.GetVersion() if hasattr(osim, "GetVersion") else None,
        "generated": datetime.date.today().isoformat(),
        "coordinates": {k: {"name": c.getName(), "rangeDegrees": rng(c)} for k, c in coords.items()},
        "muscles": {m.getName(): {
            "crosses": sorted(crosses[m.getName()]),
            "maxIsometricForce": round(m.getMaxIsometricForce(), 1),
            "optimalFiberLength": round(m.getOptimalFiberLength(), 4),
            "tendonSlackLength": round(m.getTendonSlackLength(), 4),
            "pennationAtOptimalDegrees": round(math.degrees(m.getPennationAngleAtOptimalFiberLength()), 1)
            if hasattr(m, "getPennationAngleAtOptimalFiberLength") else None,
        } for m in leg},
        "grids": grids,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {args.out}: {len(leg)} muscles, {sum(len(g['rows']['degrees']) * len(g['columns']['degrees']) for g in grids)} poses.", file=sys.stderr)

    # Quick sanity check to eyeball: a few well-known moment arms at the neutral pose.
    set_pose({})
    for mname, key in [("vasint" + args.side, "knee"), ("soleus" + args.side, "ankle"), ("glmax2" + args.side, "hip_flexion")]:
        m = next((x for x in leg if x.getName() == mname), None)
        if m is not None:
            print(f"check: {mname} moment arm about {coords[key].getName()} at neutral = {m.computeMomentArm(state, coords[key]) * 100:.1f} cm", file=sys.stderr)


if __name__ == "__main__":
    main()
