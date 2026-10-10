// Break test: every exercise and variant at the ends and middle of its range, with extreme settings
// (no load and a heavy one, weak and strong, light and heavy body, every placement slider at its
// ends and on auto). Nothing may throw, and every number in the result must be finite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { analyze } from "../js/physics.js";
import { analyzeMulti } from "../js/multijoint.js";
import { analyzeEdge, liftProfile } from "../js/finger.js";
import { muscleActivation } from "../js/muscles.js";

const body = JSON.parse(readFileSync(new URL("../data/body.json", import.meta.url)));
const dir = new URL("../data/exercises/", import.meta.url);
const ids = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const SKIP = new Set(["maxBlockKg", "ratio", "friction", "needed"]); // Infinity is a legitimate answer there (no load, FDP only; a push that doesn't press into the pad)

function nonFinite(o, path = "r", seen = new Set()) {
  if (!o || typeof o !== "object" || seen.has(o)) return null;
  seen.add(o);
  for (const [k, v] of Object.entries(o)) {
    if (SKIP.has(k)) continue;
    if (typeof v === "number" && !Number.isFinite(v)) return `${path}.${k} = ${v}`;
    const deeper = nonFinite(v, `${path}.${k}`, seen);
    if (deeper) return deeper;
  }
  return null;
}

const settings = [
  { loadKg: 0, strengthPct: 100, bodyMassKg: 75, peakTorqueNm: 60 },
  { loadKg: 250, strengthPct: 50, bodyMassKg: 140, peakTorqueNm: 5 },
];

for (const id of ids) {
  test(`break test: ${id} stays finite at the extremes`, () => {
    const ex = JSON.parse(readFileSync(new URL(`${id}.json`, dir)));
    if (ex.hipModel) ex.hipModel.geometry = JSON.parse(readFileSync(new URL(`../${ex.hipModel.data}`, import.meta.url)));
    const [lo, hi] = ex.angleRange;
    const spec = ex.placement ?? [];
    const placements = [undefined, Object.fromEntries(spec.map((s) => [s.key, s.min])), Object.fromEntries(spec.map((s) => [s.key, s.max])),
      Object.fromEntries(spec.filter((s) => s.auto).map((s) => [s.key, "auto"]))];
    const finger = ex.model === "finger";
    for (const v of ex.variants) {
      for (const pl of finger ? placements.slice(0, 3) : placements) {
        for (const st of settings) {
          for (const x of finger ? [lo, hi] : [lo, (lo + hi) / 2, hi]) {
            const o = { ...st, body, placement: pl ? { ...v.params, ...pl } : undefined, pulley: v.load?.pulley };
            const r = finger ? analyzeEdge(ex, v, x, o) : ex.model === "multi" ? analyzeMulti(ex, v, x, o) : analyze(ex, v, x, o);
            const bad = nonFinite(r);
            assert.equal(bad, null, `${v.id} @${x}: ${bad}`);
            for (const m of muscleActivation(ex, v, r, x)) {
              if (m.value != null) assert.ok(m.value >= 0 && m.value <= 1, `${v.id} @${x}: ${m.id} = ${m.value}`);
            }
          }
        }
      }
    }
  });
}

test("break test: the lift profile stays finite and never pulls negative", () => {
  for (const m of [0, 0.5, 300]) for (const liftTime of [0.25, 1.5]) {
    const L = liftProfile(m, { liftTime });
    for (let t = -1; t < 2 * L.duration; t += 0.05) {
      const p = L.at(t);
      assert.ok(Number.isFinite(p.F) && p.F >= -1e-9, `m=${m} T=${liftTime} t=${t}: ${p.F}`);
    }
  }
});
