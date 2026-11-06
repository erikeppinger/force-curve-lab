"""
Shoulder and arm muscle paths from the Stanford-VA upper limb model (Holzbaur KR, Murray WM,
Delp SL 2005, Ann Biomed Eng 33(6):829-840; BSD licence, cite the paper), read straight from its
SIMM files (.jnt joints/wrap objects, .msl muscles): OpenSim 4 can't import SIMM any more.

Run (needs numpy; the opensim env has it):
  python -I tools/simm_arm_paths.py "<dir with Stanford VA upper limb model.jnt/.msl>" data/opensim/arm-paths.json

Output, for js/armmodel.js: each muscle's path points and wrap surfaces on one of three bones,
in that bone's anatomical axes (y along the bone towards its upper joint, z the elbow's axis,
x = y x z forward), relative to its upper joint centre:
  thorax  - thorax, collarbone, shoulder blade (relative to the shoulder joint, which moves as
            the collarbone and shoulder blade follow the arm: tabulated by shoulder elevation),
  humerus - relative to the shoulder joint,
  ulna    - forearm bones and wrist (relative to the elbow; the radius turns with forearm
            rotation, `pro_sup`, so its points are tabulated by it).
A point that moves with a joint angle carries a table over that angle (`by`, `grid`). Points with
a SIMM range are used only inside it (`when`). Finger and thumb muscles are left out (the app
draws no fingers here); the wrist muscles end at their wrist-neutral insertions. Tori (posterior
deltoid over the shoulder blade, infraspinatus, wrist) aren't carried over: the app wraps only
ellipsoids, spheres and cylinders.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

SKIP = ("FDS", "FDP", "EDC", "EDM", "EIP", "EPL", "EPB", "FPL", "APL")  # fingers and thumb (prefixes)
SKIP_EXACT = {"PQ", "SUP"}  # forearm rotators, in no exercise (SUP winds round the radius in a way the cylinder rule here misses)
GRID = {"shoulder_elv": list(range(0, 181, 10)), "shoulder_rot": list(range(-90, 21, 10)),
        "elbow_flexion": list(range(0, 131, 10)), "pro_sup": list(range(-90, 91, 15))}


# ---------- parsing ----------
def strip_comments(text):
    out, i = [], 0
    while True:
        j = text.find("/*", i)
        if j < 0:
            out.append(text[i:]); break
        out.append(text[i:j]); i = text.find("*/", j) + 2
    return "".join(out)


def blocks(lines, kind):
    """Yield (name, body lines) for each 'begin<kind> name' ... 'end<kind>'."""
    cur = None
    for ln in lines:
        w = ln.split()
        if not w:
            continue
        if w[0] == f"begin{kind}":
            cur = (w[1] if len(w) > 1 else "", [])
        elif w[0] == f"end{kind}" and cur:
            yield cur; cur = None
        elif cur:
            cur[1].append(ln)


def parse_jnt(path):
    lines = strip_comments(Path(path).read_text(encoding="latin-1")).splitlines()
    funcs = {}
    for name, body in blocks(lines, "function"):
        pts = [tuple(float(v) for v in ln.strip().strip("()").split(",")) for ln in body if ln.strip().startswith("(")]
        funcs[name] = np.array(pts)
    joints = {}
    for name, body in blocks(lines, "joint"):
        j = {"axes": {}, "dof": {}}
        for ln in body:
            w = ln.split()
            if w[0] == "segments": j["parent"], j["child"] = w[1], w[2]
            elif w[0] == "order": j["order"] = w[1:]
            elif w[0] in ("axis1", "axis2", "axis3"): j["axes"][w[0][-1]] = np.array([float(v) for v in w[1:4]])
            elif w[0] in ("tx", "ty", "tz", "r1", "r2", "r3"):
                if w[1] == "constant": j["dof"][w[0]] = float(w[2])
                else:
                    f, g = w[2].split("(")
                    j["dof"][w[0]] = (f, g.rstrip(")"))
        joints[j["child"]] = j
    wraps = {}
    for name, body in blocks(lines, "wrapobject"):
        w = {"active": True, "quadrant": None}
        for ln in body:
            t = ln.split()
            if t[0] == "wraptype": w["type"] = t[1]
            elif t[0] == "segment": w["seg"] = t[1]
            elif t[0] == "active": w["active"] = t[1] != "no"
            elif t[0] == "xyz_body_rotation": w["rot"] = [float(v) for v in t[1:4]]
            elif t[0] == "translation": w["c"] = [float(v) for v in t[1:4]]
            elif t[0] == "radius": w["radius"] = [float(v) for v in t[1:]]
            elif t[0] == "quadrant": w["quadrant"] = t[1]
        wraps[name] = w
    return funcs, joints, wraps


def parse_msl(path):
    lines = strip_comments(Path(path).read_text(encoding="latin-1")).splitlines()
    muscles = {}
    for name, body in blocks(lines, "muscle"):
        if name == "defaultmuscle":
            continue
        m = {"points": [], "wraps": [], "fmax": None}
        inpts = False
        for ln in body:
            t = ln.split()
            if not t: continue
            if t[0] == "beginpoints": inpts = True; continue
            if t[0] == "endpoints": inpts = False; continue
            if inpts:
                p = {"p": [float(v) for v in t[:3]], "seg": t[4]}
                if "ranges" in t:
                    k = t.index("ranges")
                    rng = ln[ln.index("(") + 1:ln.index(")")].split(",")
                    p["when"] = [t[k + 2], float(rng[0]), float(rng[1])]
                m["points"].append(p)
            elif t[0] == "max_force": m["fmax"] = float(t[1])
            elif t[0] == "wrapobject":
                w = {"name": t[1]}
                if len(t) > 2 and t[2] == "range": w["range"] = [int(t[3]), int(t[4])]
                m["wraps"].append(w)
        muscles[name] = m
    return muscles


# ---------- kinematics ----------
def spline(pts, x):
    """SIMM functions: natural cubic spline through the points (linear for two), held at the ends."""
    xs, ys = pts[:, 0], pts[:, 1]
    x = min(max(x, xs[0]), xs[-1])
    n = len(xs)
    if n == 2:
        return ys[0] + (ys[1] - ys[0]) * (x - xs[0]) / (xs[1] - xs[0])
    h = np.diff(xs)
    A = np.zeros((n, n)); r = np.zeros(n)
    A[0, 0] = A[-1, -1] = 1
    for i in range(1, n - 1):
        A[i, i - 1], A[i, i], A[i, i + 1] = h[i - 1], 2 * (h[i - 1] + h[i]), h[i]
        r[i] = 3 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1])
    c = np.linalg.solve(A, r)
    i = min(np.searchsorted(xs, x, side="right") - 1, n - 2)
    b = (ys[i + 1] - ys[i]) / h[i] - h[i] * (2 * c[i] + c[i + 1]) / 3
    d = (c[i + 1] - c[i]) / (3 * h[i])
    t = x - xs[i]
    return ys[i] + b * t + c[i] * t * t + d * t ** 3


def rot(axis, deg):
    a = np.asarray(axis, float); a = a / np.linalg.norm(a)
    t = math.radians(deg); c, s = math.cos(t), math.sin(t)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + s * K + (1 - c) * K @ K


class Model:
    def __init__(self, funcs, joints):
        self.funcs, self.joints = funcs, joints

    def dof(self, j, k, q):
        v = j["dof"][k]
        if isinstance(v, float): return v
        f, g = v
        return spline(self.funcs[f], q.get(g, 0.0))

    def deps(self, seg, stop):
        """Generalised coordinates used on the chain from `stop` down to `seg`."""
        out = []
        while seg != stop and seg in self.joints:
            j = self.joints[seg]
            for v in j["dof"].values():
                if not isinstance(v, float) and v[1] not in out: out.append(v[1])
            seg = j["parent"]
        return out

    def frame(self, seg, q):
        """(R, o) of a segment in the thorax frame (= ground)."""
        if seg in ("thorax", "ground") or seg not in self.joints:
            return np.eye(3), np.zeros(3)
        j = self.joints[seg]
        R, o = self.frame(j["parent"], q)
        # SIMM: the operations in `order`, each about the parent's axes as already moved (body-fixed).
        for op in j["order"]:
            if op == "t":
                o = o + R @ np.array([self.dof(j, k, q) for k in ("tx", "ty", "tz")])
            else:
                R = R @ rot(j["axes"][op[1]], self.dof(j, op, q))
        return R, o

    def world(self, seg, p, q):
        R, o = self.frame(seg, q)
        return o + R @ np.asarray(p)


def xyz_body(deg):
    rx, ry, rz = deg
    return rot([1, 0, 0], rx) @ rot([0, 1, 0], ry) @ rot([0, 0, 1], rz)


# ---------- export ----------
def main(src, out):
    src = Path(src)
    funcs, joints, wraps = parse_jnt(next(src.glob("*.jnt")))
    muscles = parse_msl(next(src.glob("*.msl")))
    M = Model(funcs, joints)
    q0 = {}
    elbow_axis = joints["ulna"]["axes"]["3"]  # in the humerus frame; the ulna turns about it
    GH = lambda q: M.world("humerus", [0, 0, 0], q)
    EL = lambda q: M.world("ulna", [0, 0, 0], q)
    WR = lambda q: M.world("lunate", [0, 0, 0], q)

    def anat(seg_R, y_world, z_world):
        y = y_world / np.linalg.norm(y_world)
        z = z_world - y * (z_world @ y); z /= np.linalg.norm(z)
        x = np.cross(y, z)
        return np.stack([x, y, z])  # rows: world -> anatomical coordinates

    def bone_frame(bone, q):
        """Origin and rotation (world -> anatomical) of a bone's anatomical frame at pose q."""
        if bone == "thorax":
            return GH(q), np.eye(3)
        Rh, _ = M.frame("humerus", q)
        if bone == "humerus":
            return GH(q), anat(Rh, GH(q) - EL(q), Rh @ elbow_axis)
        Ru, _ = M.frame("ulna", q)
        # The ulna's long axis: elbow -> wrist with the forearm neutral (fixed in the ulna).
        q_n = {**q, "pro_sup": 0.0}
        y_u = Ru.T @ (EL(q_n) - WR(q_n))  # in ulna coordinates (the same for any pro_sup)
        return EL(q), anat(Ru, Ru @ y_u, Rh @ elbow_axis)

    def host(seg):
        s = seg
        while True:
            if s in ("thorax", "clavicle", "scapula", "clavphant", "scapphant", "ground"): return "thorax"
            if s == "humerus": return "humerus"
            if s in ("ulna", "radius"): return "ulna"
            if s not in joints: return "ulna"  # hand bones: on the forearm, wrist neutral
            s = joints[s]["parent"]

    def deps_for(seg, bone):
        stop = {"thorax": "thorax", "humerus": "humerus", "ulna": "ulna"}[bone]
        d = [g for g in M.deps(seg, stop) if g in GRID and g not in ("flexion", "deviation")]
        if bone == "thorax" and "shoulder_elv" not in d: d = ["shoulder_elv"] + d  # the shoulder joint moves
        return d

    def tabulate(fn, deps):
        """fn(q) -> list; a nested table over the deps' grids (or the plain value)."""
        if not deps: return fn(dict(q0))
        def rec(i, q):
            if i == len(deps): return fn(q)
            return [rec(i + 1, {**q, deps[i]: float(v)}) for v in GRID[deps[i]]]
        return rec(0, dict(q0))

    def local(bone, world_pt, q):
        o, A = bone_frame(bone, q)
        return [round(float(v), 5) for v in A @ (world_pt - o)]

    def point_entry(p):
        bone = host(p["seg"])
        deps = deps_for(p["seg"], bone)
        val = tabulate(lambda q: local(bone, M.world(p["seg"], p["p"], q), q), deps)
        e = {"bone": bone, **({"by": deps, "grid": val} if deps else {"p": val})}
        if "when" in p: e["when"] = p["when"]
        return e

    used = set()
    out_m = {}
    for name, m in muscles.items():
        if name.startswith(SKIP) or name in SKIP_EXACT: continue
        ws = [w for w in m["wraps"] if w["name"] in wraps and wraps[w["name"]]["active"] and wraps[w["name"]]["type"] != "torus"]
        used.update(w["name"] for w in ws)
        out_m[name] = {"fmax": m["fmax"], "points": [point_entry(p) for p in m["points"]], **({"wraps": ws} if ws else {})}

    out_w = {}
    for name in sorted(used):
        w = wraps[name]
        bone = host(w["seg"]); deps = deps_for(w["seg"], bone)
        Rw = xyz_body(w.get("rot", [0, 0, 0]))
        def fn(q, w=w, bone=bone, Rw=Rw):
            Rs, _ = M.frame(w["seg"], q)
            o, A = bone_frame(bone, q)
            c = A @ (M.world(w["seg"], w.get("c", [0, 0, 0]), q) - o)
            ax = A @ Rs @ Rw  # columns: the wrap object's axes in anatomical coordinates
            return [round(float(v), 5) for v in c] + [round(float(v), 5) for v in ax.T.flatten()]
        r = w["radius"]
        out_w[name] = {"type": w["type"], "bone": bone, "radius": r if len(r) > 1 else r[0],
                       **({"quadrant": w["quadrant"]} if w["quadrant"] else {}),
                       **({"by": deps, "grid": tabulate(fn, deps)} if deps else {"cax": fn(dict(q0))})}

    hum = float(np.linalg.norm(GH(q0) - EL(q0))); fore = float(np.linalg.norm(EL(q0) - WR(q0)))
    data = {
        "source": "Stanford-VA upper limb model (Holzbaur KR, Murray WM, Delp SL 2005, Ann Biomed Eng 33(6):829-840), BSD licence; exported from its SIMM files by tools/simm_arm_paths.py",
        "frames": "Per bone, x forward, y along the bone towards its upper joint, z the elbow's axis; thorax: the model's thorax axes. Origins: shoulder joint (thorax, humerus), elbow (ulna). Metres.",
        "grids": GRID,
        "lengths": {"humerus": round(hum, 5), "forearm": round(fore, 5)},
        "muscles": out_m, "wraps": out_w,
    }
    Path(out).write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out_m)} muscles, {len(out_w)} wrap objects, humerus {hum:.4f} m, forearm {fore:.4f} m -> {out}")
    return M


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
