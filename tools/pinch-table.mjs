// Pinch lift, whole hand: the largest block and the squeeze there at full strength, over block
// width, thumb friction and the fingers' friction ÷ the thumb's, for 4 and 2 fingers. The page
// interpolates in this table instead of searching for the maximum live (seconds per slider move).
// Rerun after any change to the pincer model or its data (tests/pinch.test.mjs checks the table
// against the live model):
//   node tools/pinch-table.mjs
// Derived from the ARMS hand model: NON-COMMERCIAL use only (the JSON says so).
import { readFileSync, writeFileSync } from "node:fs";
import { wholeMax, thumbScale } from "../js/pinchlift.js";

const root = new URL("../", import.meta.url);
const exFile = new URL("data/exercises/pinch-lift.json", root);
const ex = JSON.parse(readFileSync(exFile));
const data = JSON.parse(readFileSync(new URL(ex.pincer.data, root)));
ex.pincer.fingerModel = JSON.parse(readFileSync(new URL(ex.pincer.fingerData, root)));
delete ex.pincer.whole; // compute live

const widths = [];
for (let mm = ex.angleRange[0]; mm <= ex.angleRange[1]; mm += 5) widths.push(mm);
const muSlider = ex.placement.find((p) => p.key === "mu");
const mu = [];
for (let m = muSlider.min; m <= muSlider.max + 1e-9; m += 0.1) mu.push(+m.toFixed(2));
// Fingers' μ ÷ thumb's μ: k^(1−n) at the even split, n down to 2/3 (the n slider's minimum).
const ratio = { 4: [1, 1.2, 1.4, 1.6], 2: [1, 1.1, 1.2, 1.3] };

const out = {
  licence: "Derived from the ARMS hand and wrist model (McFarland et al. 2021, bioRxiv 2021.12.28.474357): NON-COMMERCIAL use only.",
  note: "Whole-hand pinch at full strength: max[width][thumb μ][ratio] = [largest weight (N), squeeze there (N)]. Written by tools/pinch-table.mjs.",
  thumbScale: +thumbScale(ex, data).toFixed(5), widths, mu,
};
const t0 = Date.now();
for (const k of [4, 2]) {
  out[k] = { ratio: ratio[k], max: widths.map((mm) => mu.map((m) => ratio[k].map((r) => {
    const { Wmax, squeeze } = wholeMax(ex, data, mm / 1000, k, { thumb: m, finger: +(m * r).toFixed(3) }, 18);
    return [+Wmax.toFixed(2), +squeeze.toFixed(2)];
  }))) };
  console.log(`${k} fingers done, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const file = new URL(ex.pincer.wholeData ?? "data/opensim/pinch-whole.json", root);
writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${file.pathname}`);
