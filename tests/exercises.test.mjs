// Data checks for every exercise file listed in js/main.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
const ids = JSON.parse(main.match(/const EXERCISES = (\[[^\]]*\])/)[1]);
const load = (id) => JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
const sorted = (pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1][0]);

for (const id of ids) {
  const ex = load(id);

  test(`${id}: basic shape`, () => {
    assert.equal(ex.id, id);
    assert.ok(["elbow", "shoulder"].includes(ex.movingJoint ?? "elbow"));
    assert.ok(["side", "front"].includes(ex.view ?? "side"));
    assert.ok(ex.angleLabel, "angleLabel");
    assert.ok(ex.variants.some((v) => v.id === ex.defaults.variant), "default variant exists");
    assert.equal(new Set(ex.variants.map((v) => v.id)).size, ex.variants.length, "unique variant ids");
  });

  test(`${id}: phases cover the range of motion`, () => {
    const [lo, hi] = ex.angleRange;
    assert.equal(ex.phases[0].range[0], lo);
    assert.equal(ex.phases.at(-1).range[1], hi);
    ex.phases.forEach((p, i) => i && assert.equal(p.range[0], ex.phases[i - 1].range[1]));
  });

  test(`${id}: curated tables are sorted and carry a note`, () => {
    assert.ok(sorted(ex.strengthCurve.points));
    assert.ok(ex.strengthCurve.note && ex.strengthCurve.source);
    for (const m of ex.muscles) {
      assert.ok(sorted(m.weight), m.id);
      assert.ok(m.note, `${m.id} note`);
      assert.ok(["jointEffort", "shoulderFlexorDemand"].includes(m.driver), `${m.id} driver`);
      if (m.driver === "shoulderFlexorDemand") assert.ok(ex.shoulderFlexorCapacityNm > 0);
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
      assert.ok(["gravity", "cable", "machine"].includes(v.load.type), v.id);
      if (v.load.type === "cable") assert.ok(Number.isFinite(v.load.pulley.x) && Number.isFinite(v.load.pulley.y));
    }
  });
}
