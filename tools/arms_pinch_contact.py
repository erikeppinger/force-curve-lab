#!/usr/bin/env python3
"""Pinch-block postures with the fingers lying along the block's face, from the ARMS hand model.

    python tools/arms_pinch_contact.py Hand_Wrist_Model_for_development.osim out.json

The four-finger pinch block grip: the fingers nearly straight, lying on one face, the thumb on the
other. For each block width (20-80 mm) the index finger takes the posture with the MOST of the
finger on the face that still lets the thumb reach across: straight (PIP = DIP = 0: contact up to
the knuckle), else bent at the PIP only (contact up to the PIP), else bent at the DIP too
(the distal phalanx alone); within that, the least PIP + DIP bending, then the least knuckle
bending (the hand stays above the block, its web on the top edge, as in a plate pinch; bending the
knuckles hangs the hand off one side), then the thumb base where the thumb squeezes hardest (its straight squeeze: its muscles balancing the pad's
push at its base, MP and IP, as js/pincer.js pinchHand does, with the app's thumb strength factors;
the fingers are far stronger here, so the thumb sets the hand's maximum). The face lies on the index's distal phalanx (its pad 60% along it, facing as the bone's
palm side does); the thumb pad must lie the width + 16 mm of soft tissue (estimate) straight
across it (within 1 mm), below the face's top edge (the last joint on the face) and with the
thumb's MP joint outside the block, and the thumb's base 4° inside ARMS's ranges (at their ends it is
weak; estimate). The middle, ring and little fingers take the index's PIP and
DIP; their knuckles are set so that their pads lie on the same face. The thumb's MP and IP stay at
Vigouroux et al.'s wide-object values. This only asks what the ARMS hand can reach (an estimate,
no measured block postures exist). Then, as tools/arms_pinch_span.py does, every muscle's moment
arms about COORDS and its active force at full activation are written, and the face (ground
frame: point = the index pad, n towards the thumb, up = along the face towards the knuckles, top
= the top edge's height above the pad) for tools/arms_hand_export.py.
LICENCE: ARMS is NON-COMMERCIAL only; the JSON says so.
"""
import itertools
import json
import math
import sys

import numpy as np
import opensim as osim

src, out = sys.argv[1:3]
TISSUE = 0.016
THUMB = {"mp_flexion": 3.5, "ip_flexion": 13.3}  # Vigouroux et al. 2011, wide objects
WIDTHS = list(range(20, 81, 10))  # wider: only the fingertips reach, with the little finger's knuckle bent back 35° at 90 mm; none at 100-110 mm
FL, AB = (-41, 11), (-21, 21)
THUMB_SCALE = {"extrinsic": 2.316, "intrinsic": 8.453}  # data/opensim/pinch-whole-flat.json thumbScale (only their ratio matters here)
THUMB_EXTRINSIC = ["FPL", "EPL", "EPB", "APL"]
THUMB_MUSCLES = ["FPL", "FPB", "OPP", "APB", "ADPt", "ADPo", "1stDI_MC1", "EPL", "EPB", "APL"]
THUMB_COORDS = ["cmc_flexion", "mp_flexion", "ip_flexion"]


def thumb_need():
    """The thumb chain's joint moments per newton on its pad (js/pincer.js chain + digitNeed, base at 0)."""
    L, ang, along, depth = [0.0446, 0.0311, 0.025], [0, THUMB["mp_flexion"], THUMB["ip_flexion"]], 0.6, 0.007
    phi, p, joints = 0.0, np.zeros(2), []
    for k, l in enumerate(L):
        phi += math.radians(ang[k]); joints.append(p.copy())
        if k < 2: p = p + l * np.array([math.cos(phi), math.sin(phi)])
    u, volar = np.array([math.cos(phi), math.sin(phi)]), np.array([-math.sin(phi), math.cos(phi)])
    pad = p + u * along * L[2] + volar * depth
    f = -volar
    return np.array([-((pad - j)[0] * f[1] - (pad - j)[1] * f[0]) for j in joints])


NEED = thumb_need()


def bounded_ls(A, b):
    """min ||x||^2 / 2, A x = b, 0 <= x <= 1 (js/pincer.js boundedLeastSquares: Newton on the dual). Returns the relative residual."""
    m, n = A.shape
    x_of = lambda y: np.clip(A.T @ y, 0, 1)
    phi = lambda y: sum((lambda t, x: t * x - x * x / 2)(t, min(1, max(0, t))) for t in A.T @ y) - b @ y
    y = np.linalg.solve(A @ A.T + 1e-9 * np.eye(m), b)
    for _ in range(200):
        x = x_of(y); g = A @ x - b
        if np.linalg.norm(g) < 1e-9 * np.linalg.norm(b): break
        free = (A.T @ y > 0) & (A.T @ y < 1)
        H = (A[:, free] @ A[:, free].T) + 1e-9 * np.eye(m) * max(1e-12, (A * A).sum(0).max())
        d = -np.linalg.solve(H, g)
        step, f0, slope = 1.0, phi(y), g @ d
        while step > 1e-10 and phi(y + step * d) > f0 + 1e-4 * step * slope: step /= 2
        y = y + step * d
    return np.linalg.norm(A @ x_of(y) - b) / np.linalg.norm(b)


def thumb_strength():
    """The thumb's largest straight squeeze (N) at the current pose."""
    for m in THUMB_MUSCLES:
        muscles.get(m).setActivation(state, 1.0)
    model.equilibrateMuscles(state)
    model.realizeDynamics(state)
    cols = []
    for m in THUMB_MUSCLES:
        mu = muscles.get(m); k = THUMB_SCALE["extrinsic" if m in THUMB_EXTRINSIC else "intrinsic"]
        cols.append([mu.computeMomentArm(state, cs.get(c)) * mu.getActiveFiberForceAlongTendon(state) * k for c in THUMB_COORDS])
    A = np.array(cols).T
    lo, hi = 0.0, 50.0
    while bounded_ls(A, NEED * hi) < 1e-3 and hi < 1e5: lo, hi = hi, hi * 2
    for _ in range(14):
        mid = (lo + hi) / 2
        if bounded_ls(A, NEED * mid) < 1e-3: lo = mid
        else: hi = mid
    return lo  # the thumb base 4° inside ARMS's ranges (-45..15, -25..25): weak at their ends (estimate)
DIGITS = "2345"

model = osim.Model(src)
state = model.initSystem()
cs = model.getCoordinateSet()
for i in range(cs.getSize()):
    cs.get(i).setClamped(state, False)
muscles = model.getMuscles()
bodies = model.getBodySet()
names = [muscles.get(i).getName() for i in range(muscles.getSize())]
COORDS = ["cmc_flexion", "cmc_abduction", "mp_flexion", "ip_flexion"] + [f"{d}{j}_flexion" for d in DIGITS for j in ("mcp", "pm", "md")]


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


def tip_offset(prox, dist, length):
    """The tip in the distal body's frame: `length` along the distal bone's line, all joints straight."""
    set_pose({})
    a, b = g(prox), g(dist)
    d = (b - a) / np.linalg.norm(b - a) * length
    return model.getGround().expressVectorInAnotherFrame(state, osim.Vec3(*d), bodies.get(dist))


LEN = {"2": 0.0187, "3": 0.0186, "4": 0.0185, "5": 0.0170}  # distal phalanges, as tools/arms_hand_export.py
TIPS = {**{f"{d}distph": tip_offset(f"{d}midph", f"{d}distph", LEN[d]) for d in DIGITS},
        "distal_thumb": tip_offset("proximal_thumb", "distal_thumb", 0.025)}


def tip(dist):
    t = bodies.get(dist).findStationLocationInGround(state, TIPS[dist])
    return np.array([t.get(0), t.get(1), t.get(2)])


def pad(dist):
    return g(dist) + 0.6 * (tip(dist) - g(dist))


def face(pose):
    """The index pad, the face normal (towards the palm side of the distal phalanx) and 'up' along it."""
    set_pose({**pose, "2md_flexion": pose["2md_flexion"] + 2})
    t1 = tip("2distph")
    set_pose(pose)
    t0, p = tip("2distph"), pad("2distph")
    up = g("2distph") - t0
    up /= np.linalg.norm(up)
    n = t1 - t0  # the tip moves to the palm side as the DIP bends
    n -= (n @ up) * up
    return p, n / np.linalg.norm(n), up


def mode_of(pip, dip):
    return "mcp" if pip == 0 and dip == 0 else "pip" if dip == 0 else "dip"


def thumb_fit(fingers, mm, strongest=False):
    """A thumb base that puts its pad `mm` across the face (within 1 mm): the first found, or with
    strongest=True the one along the reachable curve where the thumb squeezes hardest. None if none."""
    set_pose({**fingers, **THUMB})
    p, n, up = face(fingers)
    top = {"mcp": g("2proxph"), "pip": g("2midph"), "dip": g("2distph")}[mode_of(fingers["2pm_flexion"], fingers["2md_flexion"])]
    top_up = (top - p) @ up
    want = mm / 1000 + TISSUE

    def check(fl, ab):
        set_pose({**fingers, **THUMB, "cmc_flexion": fl, "cmc_abduction": ab})
        t = pad("distal_thumb")
        ok = (t - p) @ up < top_up - 0.005 and (g("proximal_thumb") - p) @ n > want - TISSUE / 2 - 0.003
        return (t - p) @ n - want, ok

    found = []
    for ab in range(AB[0], AB[1] + 1, 2):  # along the abduction range: the flexion that reaches (sign change, then bisection)
        prev = None
        for fl in range(FL[0], FL[1] + 1, 4):
            e, _ = check(fl, ab)
            if prev is not None and (prev[1] < 0) != (e < 0):
                lo, hi = prev[0], fl
                for _ in range(8):
                    mid = (lo + hi) / 2
                    em, _ = check(mid, ab)
                    if (em < 0) == (prev[1] < 0): lo = mid
                    else: hi = mid
                fl_hit = round((lo + hi) / 2, 1)
                e, ok = check(fl_hit, ab)
                if ok and abs(e) < 0.001:
                    found.append({"cmc_flexion": fl_hit, "cmc_abduction": ab})
                    if not strongest: return found[0], top_up
            prev = (fl, e)
    if not found:
        return None
    best = max(found, key=lambda th: (set_pose({**fingers, **THUMB, **th}), thumb_strength())[1])
    return best, top_up


def others_onto_face(pose):
    """Middle, ring and little: their PIP and DIP as the index's, their knuckle set so their pads lie on its face."""
    pose = dict(pose)
    for d in "345":
        pose[f"{d}pm_flexion"], pose[f"{d}md_flexion"] = pose["2pm_flexion"], pose["2md_flexion"]
        for _ in range(5):  # Newton on the knuckle
            set_pose(pose)
            p, n, _ = face(pose)
            o = (pad(f"{d}distph") - p) @ n
            q = {**pose, f"{d}mcp_flexion": pose[f"{d}mcp_flexion"] + 1}
            set_pose(q)
            slope = (pad(f"{d}distph") - p) @ n - o
            pose[f"{d}mcp_flexion"] = round(pose[f"{d}mcp_flexion"] - o / slope, 1)
    return pose


CANDIDATES = {"mcp": [(0, 0)], "pip": [(p, 0) for p in range(5, 61, 5)], "dip": [(p, d) for d in range(5, 41, 5) for p in range(0, 61, 10)]}
res = {"licence": "Derived from the ARMS hand and wrist model (McFarland DC, Binder-Markey BI, Nichols JA, Wohlman SJ, de Bruin M, Murray WM (2021). bioRxiv 2021.12.28.474357): NON-COMMERCIAL use only.",
       "coords": COORDS, "postures": {}, "widths": {}, "thumbBase": {}}
for mm in WIDTHS:
    found = None
    for mode in ("mcp", "pip", "dip"):
        for pip, dip in sorted(CANDIDATES[mode], key=lambda c: c[0] + c[1]):
            for mcp in sorted(range(-10, 91, 5), key=abs):  # the least knuckle bending first
                fingers = {f"{d}{j}_flexion": v for d in DIGITS for j, v in (("mcp", mcp), ("pm", pip), ("md", dip))}
                if thumb_fit(fingers, mm):  # reachable: now the strongest thumb along the reachable curve
                    thumb, top_up = thumb_fit(fingers, mm, strongest=True)
                    set_pose({**fingers, **THUMB, **thumb})
                    found = (mode, (thumb_strength(), mcp, thumb, top_up, fingers))
                    break
            if found:
                break
        if found:
            break
    key = f"w{mm}"
    if not found:
        print(f"{mm} mm: the thumb can't reach across")
        continue
    mode, (_, mcp, thumb, top_up, fingers) = found
    pose = others_onto_face({**fingers, **THUMB, **thumb})
    set_pose(pose)
    p, n, up = face(pose)
    for m in names:
        muscles.get(m).setActivation(state, 1.0)
    model.equilibrateMuscles(state)
    model.realizeDynamics(state)
    res["postures"][key] = {"pose": pose, "contact": mode,
                            "face": {"point": [round(v, 6) for v in p], "n": [round(v, 6) for v in n], "up": [round(v, 6) for v in up], "top": round(float(top_up), 5)},
                            "muscles": {m: {"active": round(muscles.get(m).getActiveFiberForceAlongTendon(state), 2),
                                            "max": round(muscles.get(m).getMaxIsometricForce(), 1),
                                            "arms": {c: round(muscles.get(m).computeMomentArm(state, cs.get(c)), 6) for c in COORDS}} for m in names}}
    res["widths"][key] = mm
    set_pose(pose)
    t = pad("distal_thumb")
    res["thumbBase"][key] = {**thumb, "gapMm": round(float((t - p) @ n - TISSUE) * 1000, 1), "alongFaceMm": round(float((t - p) @ up) * 1000, 1), "thumbSqueezeN": round(found[1][0], 1)}
    print(f"{mm} mm: contact to the {mode.upper()}; index MCP {mcp}, PIP {fingers['2pm_flexion']}, DIP {fingers['2md_flexion']};",
          "MCP middle/ring/little", [pose[f"{d}mcp_flexion"] for d in "345"], "; thumb", thumb, res["thumbBase"][key])
with open(out, "w") as f:
    json.dump(res, f, indent=1)
print(f"wrote {out}")
