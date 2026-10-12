// 3D trunk view of the core exercises (trunk3d.js): the lumbar spine model's muscles shaded by the exercise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trunkValues, trunkScene3d } from "../js/trunk3d.js";

const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const lumbar = JSON.parse(readFileSync(new URL("../data/opensim/lumbar-muscles.json", import.meta.url)));
const GROUPS = Object.keys(lumbar.paths);

test("every core exercise maps its muscles onto the lumbar model's groups", () => {
  for (const id of ["crunch", "leg-raise", "back-extension", "plank", "side-plank", "pallof-press"]) {
    const ex = load(id);
    assert.ok(ex.trunk3d?.map, id);
    for (const [m, groups] of Object.entries(ex.trunk3d.map)) {
      assert.ok(ex.muscles.some((x) => x.id === m), `${id}: ${m}`);
      for (const g of groups) {
        const [name, side] = g.split(":");
        assert.ok(GROUPS.includes(name), `${id}: ${g}`);
        assert.ok(side == null || side === "r" || side === "l", `${id}: ${g}`);
      }
    }
  }
});

test("the Pallof press lights one side's external oblique and the other side's internal oblique", () => {
  const ex = load("pallof-press");
  const v = trunkValues(ex, [{ id: "external-oblique", value: 0.6 }]);
  assert.equal(v["external-oblique_l"], 0.6);
  assert.equal(v["internal-oblique_r"], 0.6);
  assert.equal(v["external-oblique_r"], undefined);
  assert.equal(v["internal-oblique_l"], undefined);
});

test("the scene draws every fascicle; muscles the exercise doesn't load stay idle", () => {
  const ex = load("crunch");
  const prims = trunkScene3d(lumbar, ex, [{ id: "rectus-abdominis", value: 0.5 }, { id: "external-oblique", value: 0.3 }]);
  const on = prims.filter((p) => p.cls === "muscle-on");
  assert.ok(on.length > 0 && on.every((p) => /Rectus|oblique/.test(p.title)));
  assert.ok(prims.some((p) => p.cls === "tendon-idle" && /Longissimus/.test(p.title)));
  const segs = Object.values(lumbar.paths).flat().reduce((s, f) => s + f.path.length - 1, 0);
  assert.equal(prims.filter((p) => p.cls === "muscle-base" || p.cls === "tendon-idle").length, segs);
});

test("the posed trunk: upright at 0°, bent forward with flexion, set on the solver's pelvis", async () => {
  const { posedTrunk } = await import("../js/trunk3d.js");
  const { analyzeMulti } = await import("../js/multijoint.js");
  // Upright: the exported neutral paths (to the posed snapshot's 1 mm rounding).
  const up = posedTrunk(lumbar, 0);
  const g = "longissimus";
  up.paths[g].forEach((f, i) => f.path.forEach((p, k) => p.forEach((v, c) => assert.ok(Math.abs(v - lumbar.paths[g][i].path[k][c]) < 0.002))));
  // Flexed 40° (model sign: negative): the thorax point moves forward (+x) and the bend is about 40°.
  const fl = posedTrunk(lumbar, -40), l1 = fl.bodies.lumbar1, th = fl.bodies.thorax, l10 = up.bodies.lumbar1, th0 = up.bodies.thorax;
  assert.ok(th[0] > th0[0] + 0.1);
  const ang = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
  assert.ok(Math.abs(ang(l1, th) - ang(l10, th0) - 40) < 8, `${ang(l1, th) - ang(l10, th0)}`);
  // Halfway between two exported postures: halfway positions.
  const a = posedTrunk(lumbar, -30).bodies.thorax, b = posedTrunk(lumbar, -20).bodies.thorax, m = posedTrunk(lumbar, -25).bodies.thorax;
  m.forEach((v, c) => assert.ok(Math.abs(v - (a[c] + b[c]) / 2) < 1e-9));
  // On the back extension: the model's L5 lands on the solver's L5, and the spine leaves along the pelvis.
  const ex = load("back-extension");
  const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
  const r = analyzeMulti(ex, ex.variants[0], 45, { loadKg: 0, bodyMassKg: 75, body, placement: { rounding: 20 } });
  const [H, L5] = r.segs.pelvis, l = Math.hypot(L5.x - H.x, L5.y - H.y);
  const prims = trunkScene3d(lumbar, ex, [{ id: "erector-spinae", value: 0.5 }], { flexDeg: 20, at: L5, up: { x: (L5.x - H.x) / l, y: (L5.y - H.y) / l }, top: r.segs.upperBack[1] });
  const spine = prims.filter((p) => p.part === "spine");
  assert.ok(Math.hypot(spine[0].b.x - L5.x, spine[0].b.y - L5.y) < 1e-9, "L5 on L5");
});

test("planks: the trunk set on the body, belly down in the plank, left side down in the side plank", async () => {
  const { analyzeMulti } = await import("../js/multijoint.js");
  const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
  const place = (ex, r) => {
    const [H, S] = r.segs.trunk, l = Math.hypot(S.x - H.x, S.y - H.y);
    return { flexDeg: 0, at: r.joints.find((j) => j.id === "lumbar").at, up: { x: (S.x - H.x) / l, y: (S.y - H.y) / l }, top: S, plane: ex.view === "front" ? "frontal" : "sagittal", result: r };
  };
  const meanY = (prims, re) => { const ys = prims.filter((p) => re.test(p.title ?? "") && p.cls !== "muscle-on").flatMap((p) => [p.a.y, p.b.y]); return ys.reduce((a, b) => a + b, 0) / ys.length; };
  const plank = load("plank");
  const rp = analyzeMulti(plank, plank.variants[0], 0, { loadKg: 0, bodyMassKg: 75, body });
  const pp = trunkScene3d(lumbar, plank, [], place(plank, rp));
  assert.ok(meanY(pp, /^Rectus abdominis/) < meanY(pp, /^Longissimus/), "belly below the back");
  const side = load("side-plank");
  const rs = analyzeMulti(side, side.variants[0], 0, { loadKg: 0, bodyMassKg: 75, body });
  const ps = trunkScene3d(lumbar, side, [], place(side, rs));
  assert.ok(meanY(ps, /\(left\)/) < meanY(ps, /\(right\)/) - 0.05, "left side down");
  assert.ok(ps.some((p) => p.cls === "floor3d"));
});
