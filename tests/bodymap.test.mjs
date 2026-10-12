// Every muscle lights up somewhere: on the body map (wger's image or the site's own shape), or in
// a region close-up. Deep muscles (e.g. the subscapularis) may show in the close-up only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXTRA, MAP_BY_ID, extraOverlay } from "../js/bodymap-extra.js";

const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
const ids = [...main.match(/const EXERCISES = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("every muscle is on the body map or in a close-up; own overlays exist and are in wger's frame", () => {
  for (const id of ids) {
    const ex = JSON.parse(readFileSync(new URL(`../data/exercises/${id}.json`, import.meta.url)));
    for (const m of ex.muscles ?? []) {
      const keys = m.wgerId ? [m.wgerId] : m.mapId ? [m.mapId] : MAP_BY_ID[m.id] ?? [];
      assert.ok(keys.length || m.region, `${id}: ${m.id} lights up nowhere`);
      for (const k of keys) if (typeof k === "string") assert.ok(EXTRA[k], `${id}: ${m.id} → ${k}`);
    }
  }
  for (const k of Object.keys(EXTRA)) assert.match(decodeURIComponent(extraOverlay(k)), /viewBox="0 0 200 369.03"/);
  assert.deepEqual(MAP_BY_ID["erector-spinae"], ["erector"]);
});
