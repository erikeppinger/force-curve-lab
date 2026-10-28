// Pinch lift, whole hand: the largest block and the squeeze there at full strength, over block
// width, thumb friction and the fingers' friction ÷ the thumb's. The page interpolates in these
// tables instead of searching for the maximum live (seconds per slider move). One table for the
// shared posture (pincer.wholeData: 4 and 2 fingers) and one for each variant with its own posture
// (variant.pincer.wholeData, its own finger count: the four-finger flat-pad pinch).
// Rerun after any change to the pincer model or its data (tests/pinch.test.mjs checks the tables
// against the live model):
//   node tools/pinch-table.mjs
// Derived from the ARMS hand model: NON-COMMERCIAL use only (the JSON says so).
import { readFileSync, writeFileSync } from "node:fs";
import { wholeMax, thumbScale, pinchVariant } from "../js/pinchlift.js";

const root = new URL("../", import.meta.url);
const exFile = new URL("data/exercises/pinch-lift.json", root);
const ex = JSON.parse(readFileSync(exFile));
const data = JSON.parse(readFileSync(new URL(ex.pincer.data, root)));
ex.pincer.fingerModel = JSON.parse(readFileSync(new URL(ex.pincer.fingerData, root)));
delete ex.pincer.whole; // compute live

const widthsOf = ([lo, hi]) => { const out = []; for (let mm = lo; mm <= hi; mm += 5) out.push(mm); return out; };
const muSlider = ex.placement.find((p) => p.key === "mu");
const mu = [];
for (let m = muSlider.min; m <= muSlider.max + 1e-9; m += 0.1) mu.push(+m.toFixed(2));
// Fingers' μ ÷ thumb's μ: k^(1−n) at the even split, n down to 2/3 (the n slider's minimum).
const ratio = { 4: [1, 1.2, 1.4, 1.6], 2: [1, 1.1, 1.2, 1.3] };

function table(exV, dataV, counts, posture, widths) {
  const out = {
    licence: "Derived from the ARMS hand and wrist model (McFarland et al. 2021, bioRxiv 2021.12.28.474357): NON-COMMERCIAL use only.",
    note: `Whole-hand pinch at full strength, ${posture}: max[width][thumb μ][ratio] = [largest weight (N), squeeze there (N)]. Written by tools/pinch-table.mjs.`,
    thumbScale: Object.fromEntries(Object.entries(thumbScale(exV, dataV)).map(([k, v]) => [k, +v.toFixed(5)])), widths, mu,
  };
  const t0 = Date.now();
  for (const k of counts) {
    out[k] = { ratio: ratio[k], max: widths.map((mm) => mu.map((m) => ratio[k].map((r) => {
      const { Wmax, squeeze } = wholeMax(exV, dataV, mm / 1000, k, { thumb: m, finger: +(m * r).toFixed(3) }, 18);
      return [+Wmax.toFixed(2), +squeeze.toFixed(2)];
    }))) };
    console.log(`${posture}: ${k} fingers done, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return out;
}

const write = (path, out) => { writeFileSync(new URL(path, root), JSON.stringify(out)); console.log(`wrote ${path}`); };
write(ex.pincer.wholeData ?? "data/opensim/pinch-whole.json", table(ex, data, [4, 2], "the shared (tip-pinch) posture", widthsOf(ex.angleRange)));
for (const v of ex.variants.filter((x) => x.pincer?.wholeData)) {
  const dataV = JSON.parse(readFileSync(new URL(v.pincer.data, root)));
  const exV = pinchVariant(ex, { ...v, pincer: { ...v.pincer, whole: null } });
  write(v.pincer.wholeData, table(exV, dataV, [v.params.fingers], `${v.name} (its own posture)`, widthsOf(v.angleRange ?? ex.angleRange)));
}
