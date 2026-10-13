// Expert mode, in place (numbers.js): every source the page shows beside a control, curve or muscle
// resolves to papers in data/references.json, so it shows as short linked keys, not raw text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { citedRefs } from "../js/numbers.js";

const refs = JSON.parse(readFileSync(new URL("../data/references.json", import.meta.url)));
const dir = new URL("../data/exercises/", import.meta.url);
const exercises = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir))));

test("the in-place sources resolve to reference keys", () => {
  const missing = [];
  for (const ex of exercises) {
    const shown = [
      ex.strengthCurve?.source, ...(ex.joints ?? []).map((j) => j.strength?.source), ...(ex.muscles ?? []).map((m) => m.source),
      ex.pinch?.capacitySource, ex.pinch?.frictionSource, ex.pinch?.wristSource,
      ex.finger?.momentArmsSource, ex.finger?.pulleyStrengthSource, ex.finger?.referenceTensionSource, ex.handModel?.source,
      ...(ex.variants ?? []).flatMap((v) => [v.strengthScale?.source, ex.finger ? v.source : null]),
    ];
    for (const s of shown) {
      if (!s || /^TODO|^Not (modelled|applicable)/.test(s)) continue;
      if (!citedRefs(s, refs).length) missing.push(`${ex.id}: ${s.slice(0, 80)}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("cited references come in the order the text names them, also by their short key", () => {
  const keys = (s) => citedRefs(s, refs).map((r) => r.key);
  assert.deepEqual(keys("Weights: shape from Murray et al. 1995 (see weightsNote); level from Ramsay et al. 2009"), ["Murray 1995", "Ramsay 2009"]);
  assert.deepEqual(keys("TODO: check against EMG literature"), []);
});
