#!/usr/bin/env node
// Extract the right hip muscles' geometry from an OpenSim model (.osim XML), no OpenSim needed.
//
//   node tools/osim-hip.mjs Rajagopal2016.osim data/opensim/hip-muscles.json --abductors RajagopalLaiUhlrich2023.osim
//
// With --abductors, the gluteus medius, gluteus minimus and TFL paths come from that file
// (Uhlrich et al. 2022's updated hip abductor paths, MIT licence), everything else from the first
// (Rajagopal et al. 2016, MIT licence). This keeps out the Lai et al. 2017 changes, whose licence
// isn't stated (they only touch the knee end of the two-joint muscles and the knee).
//
// Writes, for each muscle crossing the right hip: max isometric force and its path points,
// expressed relative to the hip centre in the pelvis frame (points before the hip) or the
// femur frame (points after it). OpenSim axes: x forward, y up, z to the right. Wrapping
// cylinders are exported too (`wraps`: body, centre relative to the hip, body-fixed XYZ rotation,
// radius, quadrant); points on the tibia are moved into the femur frame with the knee straight.
// Only the JSON belongs in the repo.

import fs from "node:fs";

const args = process.argv.slice(2);
const ai = args.indexOf("--abductors");
const abdSrc = ai >= 0 ? args.splice(ai, 2)[1] : null;
const [src, out] = args;
if (!src || !out) { console.error("usage: node tools/osim-hip.mjs model.osim out.json [--abductors other.osim]"); process.exit(1); }
const xml = fs.readFileSync(src, "utf8");
const abdXml = abdSrc ? fs.readFileSync(abdSrc, "utf8") : xml;
const ABDUCTORS = new Set(["glmed1_r", "glmed2_r", "glmed3_r", "glmin1_r", "glmin2_r", "glmin3_r", "tfl_r"]);
const nums = (s) => s.trim().split(/\s+/).map(Number);

const block = (tag, name) => {
  const i = xml.indexOf(`<${tag} name="${name}">`);
  if (i < 0) throw new Error(`no ${tag} ${name}`);
  return xml.slice(i, xml.indexOf(`</${tag}>`, i));
};
const offset = (joint, frame) => {
  const j = block("CustomJoint", joint) || "";
  const f = j.slice(j.indexOf(`<PhysicalOffsetFrame name="${frame}">`));
  return nums(f.match(/<translation>([^<]*)</)[1]);
};
const hipInPelvis = offset("hip_r", "pelvis_offset");
const kneeJoint = xml.match(/<CustomJoint name="walker_knee_r">[\s\S]*?<\/CustomJoint>/)?.[0];
// Knee straight: the tibia origin sits at the knee joint's parent offset in the femur frame
// (the walker knee's translations are functions of knee angle; at 0 they are ~0).
const kneeInFemur = kneeJoint ? nums(kneeJoint.match(/<PhysicalOffsetFrame name="femur_r_offset">[\s\S]*?<translation>([^<]*)</)[1]) : [0, -0.4, 0];

const MUSCLES = ["glmed1_r", "glmed2_r", "glmed3_r", "glmin1_r", "glmin2_r", "glmin3_r", "tfl_r", "piri_r",
  "glmax1_r", "glmax2_r", "glmax3_r", "sart_r", "recfem_r",
  "addbrev_r", "addlong_r", "addmagProx_r", "addmagMid_r", "addmagDist_r", "addmagIsch_r", "grac_r",
  "iliacus_r", "psoas_r", "semimem_r", "semiten_r", "bflh_r"];

const muscles = [];
for (const name of MUSCLES) {
  const m = (ABDUCTORS.has(name) ? abdXml : xml).match(new RegExp(`<Millard2012EquilibriumMuscle name="${name}">([\\s\\S]*?)</Millard2012EquilibriumMuscle>`))[1];
  const fmax = Number(m.match(/<max_isometric_force>([^<]*)</)[1]);
  const pts = [];
  for (const p of m.matchAll(/<(PathPoint|ConditionalPathPoint|MovingPathPoint) name="([^"]*)">([\s\S]*?)<\/\1>/g)) {
    const frame = p[3].match(/<socket_parent_frame>\/bodyset\/([^<]*)</)[1];
    const loc = p[3].match(/<location>([^<]*)</);
    const kind = p[1];
    let xyz = loc ? nums(loc[1]) : [0, 0, 0];
    if (kind === "MovingPathPoint") console.warn(`${name}: moving point ${p[2]} (location at default)`);
    let f = frame;
    if (frame === "pelvis") xyz = xyz.map((v, i) => v - hipInPelvis[i]);
    else if (frame === "tibia_r") { xyz = xyz.map((v, i) => v + kneeInFemur[i]); f = "femur_r"; }
    else if (frame !== "femur_r") { console.warn(`${name}: skips point on ${frame}`); continue; }
    pts.push({ frame: f === "pelvis" ? "pelvis" : "femur", at: xyz.map((v) => +v.toFixed(4)), ...(kind !== "PathPoint" ? { kind } : {}) });
  }
  const wraps = [...m.matchAll(/<wrap_object>([^<]*)</g)].map((w) => w[1]);
  muscles.push({ id: name.replace(/_r$/, ""), fmax: Math.round(fmax), points: pts, ...(wraps.length ? { wraps } : {}) });
}

// Wrap cylinders the muscles use, in the same hip-centred frames as the points.
const wraps = {};
for (const name of new Set(muscles.flatMap((m) => m.wraps ?? []))) {
  const i0 = xml.indexOf(`<WrapCylinder name="${name}">`);
  const w = i0 < 0 ? null : xml.slice(i0, xml.indexOf("</WrapCylinder>", i0));
  if (!w) { console.warn(`wrap ${name}: not a cylinder, left out`); continue; }
  const before = xml.slice(0, xml.indexOf(`<WrapCylinder name="${name}">`));
  const body = before.slice(before.lastIndexOf("<Body name=")).match(/<Body name="([^"]*)"/)[1];
  let t = nums(w.match(/<translation>([^<]*)</)[1]);
  if (body === "pelvis") t = t.map((v, i) => v - hipInPelvis[i]);
  else if (body !== "femur_r") { console.warn(`wrap ${name} on ${body}: left out`); continue; }
  wraps[name] = { body: body === "pelvis" ? "pelvis" : "femur", at: t.map((v) => +v.toFixed(4)), rotation: nums(w.match(/<xyz_body_rotation>([^<]*)</)[1]),
    radius: Number(w.match(/<radius>([^<]*)</)[1]), quadrant: w.match(/<quadrant>([^<]*)</)?.[1]?.trim() ?? "all" };
}

fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ""), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  source: abdSrc ? "Rajagopal et al. (2016) full-body model (Rajagopal2016.osim), with the hip abductor paths (gluteus medius, minimus, TFL) of Uhlrich et al. (2022) (RajagopalLaiUhlrich2023.osim); both from github.com/opensim-org/opensim-models" : `Rajagopal et al. (2016) full-body model (${src.split(/[\/]/).pop()})`,
  licence: "Derived from models under the MIT licence: Copyright (c) 2015, Stanford University (Rajagopal et al. 2016, simtk.org/projects/full_body); Copyright (c) 2020, Stanford University (Uhlrich et al. 2022, simtk.org/projects/fbmodpassivecal). Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.",
  axes: "metres, relative to the right hip centre; x forward, y up, z to the right; pelvis points in the pelvis frame, femur points in the femur frame",
  hipInPelvis, kneeInFemur, muscles, wraps,
}, null, 1) + "\n");
console.log(`wrote ${muscles.length} muscles to ${out}`);
