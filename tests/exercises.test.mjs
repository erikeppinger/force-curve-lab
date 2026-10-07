// Data checks for every exercise file listed in js/main.js, and model-wide invariants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, sampleCurve, gravityOf } from "../js/physics.js";
import { screenRotation } from "../js/figure.js";

const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
const ids = [...main.match(/const EXERCISES = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const sorted = (pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1][0]);
const opts = (ex) => ({ loadKg: ex.defaults.loadKg, peakTorqueNm: ex.defaults.peakTorqueNm, bodyMassKg: 75 });

test("main.js lists every exercise once", () => {
  assert.ok(ids.length >= 17);
  assert.equal(new Set(ids).size, ids.length);
});

const single = ids.filter((id) => load(id).model !== "multi");
const multi = ids.filter((id) => load(id).model === "multi");

for (const id of multi) {
  const ex = load(id);
  test(`${id}: multi-joint shape`, () => {
    assert.equal(ex.id, id);
    assert.ok(["standing", "split", "legPress3d", "hipThrust", "squat3d", "bench3d"].includes(ex.solver));
    assert.ok(ex.joints.length >= 1);
    for (const j of ex.joints) {
      assert.ok(sorted(j.strength.points) && j.strength.note && j.strength.source, j.id);
      if (!j.passive) assert.ok(j.peakTorqueNm > 0 && (!j.negative || j.negative.peakTorqueNm > 0), j.id);
    }
    for (const m of ex.muscles) {
      assert.ok(m.note && sorted(m.weight), m.id);
      if (m.driver !== "none") assert.ok(ex.joints.some((j) => j.id === m.joint), `${m.id}: joint ${m.joint}`);
    }
    assert.ok(ex.variants.some((v) => v.id === ex.defaults.variant));
    const [lo, hi] = ex.angleRange;
    assert.equal(ex.phases[0].range[0], lo);
    assert.equal(ex.phases.at(-1).range[1], hi);
  });
}

for (const id of single) {
  const ex = load(id);

  test(`${id}: basic shape`, () => {
    assert.equal(ex.id, id);
    assert.ok(["distal", "proximal"].includes(ex.movingJoint ?? "distal"));
    assert.ok(["side", "front", "top"].includes(ex.view ?? "side"));
    assert.ok([1, -1].includes(ex.angleSense ?? 1));
    assert.ok(["increase", "decrease"].includes(ex.concentric ?? "increase"));
    assert.ok(ex.angleLabel && ex.joint, "angleLabel and joint");
    assert.ok(ex.segments.proximal > 0 && ex.segments.distal > 0 && ex.segments.names.length === 2);
    assert.ok(ex.variants.some((v) => v.id === ex.defaults.variant), "default variant exists");
    assert.equal(new Set(ex.variants.map((v) => v.id)).size, ex.variants.length, "unique variant ids");
    for (const v of ex.variants) {
      if (v.posture) assert.ok(ex.postures?.[v.posture], `${v.id}: posture ${v.posture}`);
    }
  });

  test(`${id}: phases cover the range of motion`, () => {
    const [lo, hi] = ex.angleRange;
    assert.equal(ex.phases[0].range[0], lo);
    assert.equal(ex.phases.at(-1).range[1], hi);
    ex.phases.forEach((p, i) => i && assert.equal(p.range[0], ex.phases[i - 1].range[1]));
  });

  test(`${id}: curated numbers are sorted and carry a note and source`, () => {
    assert.ok(sorted(ex.strengthCurve.points));
    assert.ok(ex.strengthCurve.note && ex.strengthCurve.source);
    if (ex.segments.massFractions) {
      assert.equal(ex.segments.massFractions.length, 2);
      assert.equal(ex.segments.comFractions.length, 2);
      assert.ok(ex.segments.massNote && ex.segments.massSource);
    }
    for (const m of ex.muscles) {
      assert.ok(sorted(m.weight), m.id);
      assert.ok(m.note, `${m.id} note`);
      assert.ok(["jointEffort", "stabiliserDemand"].includes(m.driver), `${m.id} driver`);
      if (m.driver === "stabiliserDemand") assert.ok(ex.stabiliserCapacityNm > 0);
      if (m.draw) assert.ok(m.draw.points || (["proximal", "distal"].includes(m.draw.seg) && m.draw.along.length === 2), `${m.id} draw`);
    }
    for (const v of ex.variants) {
      for (const k of Object.keys(v.muscleModifiers ?? {})) assert.ok(ex.muscles.some((m) => m.id === k), `${v.id}: ${k}`);
      if (v.load.type === "machine") {
        const cam = v.load.camProfile;
        assert.ok(sorted(cam.points) && cam.note && cam.source, `${v.id} cam`);
        assert.ok(v.load.padDistance > 0);
      }
    }
  });

  test(`${id}: variant load types are known`, () => {
    for (const v of ex.variants) {
      assert.ok(["gravity", "cable", "machine", "reaction", "band"].includes(v.load.type), v.id);
      if (v.load.type === "band") assert.ok(v.load.refLength > v.load.restLength && v.load.restLength > 0, `${v.id}: band lengths`);
      if (v.load.type === "cable") assert.ok(Number.isFinite(v.load.pulley.x) && Number.isFinite(v.load.pulley.y));
      if (v.load.type === "reaction") assert.ok(v.load.bodyWeight >= 0 && v.load.bodyWeight <= 1);
    }
  });

  test(`${id}: every variant gives finite results across the range`, () => {
    for (const v of ex.variants) {
      for (const s of sampleCurve(ex, v, opts(ex), 5)) {
        for (const k of ["jointTorque", "loadTorque", "limbTorque", "momentArm", "effort", "capacity"]) {
          assert.ok(Number.isFinite(s[k]), `${v.id} @${s.angle}: ${k} = ${s[k]}`);
        }
        assert.ok(s.capacity > 0 && s.effort >= 0);
      }
    }
  });

  test(`${id}: machines always resist the lift`, () => {
    for (const v of ex.variants.filter((x) => x.load.type === "machine")) {
      for (const s of sampleCurve(ex, v, opts(ex), 5)) assert.ok(s.loadTorque > 0, `${v.id} @${s.angle}`);
    }
  });

  test(`${id}: the figure turns gravity to point down the screen`, () => {
    for (const v of ex.variants) {
      const g = gravityOf(v);
      const r = screenRotation(v);
      const down = { x: Math.cos(r) * g.x - Math.sin(r) * g.y, y: Math.sin(r) * g.x + Math.cos(r) * g.y };
      const len = Math.hypot(g.x, g.y);
      if (len > 0) {
        assert.ok(Math.abs(down.x) < 1e-9 && down.y < 0, `${v.id}`);
      } else {
        assert.equal(r, 0, `${v.id}: top view stays unrotated`);
      }
    }
  });
}

test("limb weight adds nothing when gravity is perpendicular to the plane of motion", () => {
  const ex = load("chest-fly");
  for (const id of ["cable", "pec-deck"]) {
    const v = ex.variants.find((x) => x.id === id);
    assert.equal(analyze(ex, v, 30, opts(ex)).limbTorque, 0);
  }
});
