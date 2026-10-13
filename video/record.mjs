// Records the demo video's frames: drives a headless Edge through the scenes in scenes.mjs over the
// DevTools protocol, overlays the captions in the page, and writes JPEG frames plus an ffmpeg
// concat list (each frame with its display time) to video/frames/.
//   node video/record.mjs [port of a running local server, default 8094]
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { scenes } from "./scenes.mjs";

const PORT = process.argv[2] ?? "8094";
const SITE = `http://localhost:${PORT}/`;
const OUT = new URL("./frames/", import.meta.url);
const W = 1920, H = 1080, SCALE = 1; // 1080p frames
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { rmSync(OUT, { recursive: true, force: true }); } catch { /* held open: frames are overwritten by name and the list rewritten */ }
mkdirSync(OUT, { recursive: true });
const profile = new URL("./.edge-profile/", import.meta.url);
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--remote-debugging-port=9333",
  `--user-data-dir=${decodeURIComponent(profile.pathname).replace(/^\//, "")}`, `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  target = await fetch("http://127.0.0.1:9333/json/list").then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
}
if (!target) throw new Error("Edge didn't start");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });

// Frames: each written with how long it stays on screen.
let n = 0;
const list = [];
const frame = async (seconds) => {
  const { data } = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 88 });
  const name = `f${String(n++).padStart(5, "0")}.jpg`;
  writeFileSync(new URL(name, OUT), Buffer.from(data, "base64"));
  list.push([name, seconds]);
};

// In-page helpers: caption band, title card, highlight, slider moves.
const helpers = `
  window.__v = {
    style() {
      if (document.getElementById("v-style")) return;
      const s = document.createElement("style"); s.id = "v-style";
      s.textContent = \`
        #v-cap { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); width: min(1180px, 86vw); z-index: 9999;
          background: rgba(12,14,18,.86); color: #fff; font: 500 30px/1.38 system-ui, sans-serif; padding: 14px 24px; border-radius: 14px;
          box-shadow: 0 8px 30px rgba(0,0,0,.35); text-align: center; }
        #v-cap:empty { display: none; }
        #v-cap.top { bottom: auto; top: 22px; }
        #v-title { position: fixed; inset: 0; z-index: 10000; display: grid; place-content: center; text-align: center; gap: 18px;
          background: radial-gradient(ellipse at center, #1f2a3a 0%, #0d1117 75%); color: #fff; font-family: system-ui, sans-serif; }
        #v-title h1 { font-size: 64px; margin: 0; letter-spacing: -.5px; } #v-title p { font-size: 28px; margin: 0; color: #b8c4d6; max-width: 1100px; line-height: 1.4; }
        .dock { display: none !important; }
        .v-hl { outline: 4px solid #f0b429 !important; outline-offset: 4px; border-radius: 10px; }
        html { scroll-behavior: auto !important; }\`;
      document.head.append(s);
      const c = document.createElement("div"); c.id = "v-cap"; document.body.append(c);
    },
    cap(t, top = false) { this.style(); const c = document.getElementById("v-cap"); c.textContent = t ?? ""; c.classList.toggle("top", top); },
    title(h, p) { this.style(); let d = document.getElementById("v-title"); if (!h) { d?.remove(); return; }
      if (!d) { d = document.createElement("div"); d.id = "v-title"; document.body.append(d); }
      d.innerHTML = ""; const a = document.createElement("h1"); a.textContent = h; d.append(a); if (p) { const b = document.createElement("p"); b.textContent = p; d.append(b); } },
    hl(sel) { document.querySelectorAll(".v-hl").forEach((e) => e.classList.remove("v-hl")); if (sel) document.querySelector(sel)?.classList.add("v-hl"); },
    set(id, v, ev = "input") { const e = document.getElementById(id) ?? document.querySelector(id); e.value = v; e.dispatchEvent(new Event(ev, { bubbles: true })); },
    to(sel, block = "start") { const e = document.querySelector(sel); if (e) { e.scrollIntoView({ block }); window.scrollBy(0, block === "start" ? -12 : 0); } },
  };`;

const api = {
  // Load a page state from a link (hash), then re-add the helpers.
  async open(hash) {
    await cdp("Page.navigate", { url: `${SITE}#${hash}` });
    await sleep(400);
    await js(`try { localStorage.setItem("introSeen", "1"); } catch (e) {} return 1;`); // no welcome dialog in the recording
    await cdp("Page.reload", { ignoreCache: true });
    await sleep(2200);
    await js(helpers + "return 1;");
    await js("window.scrollTo(0, 0); return 1;");
  },
  js,
  frame,
  async hold(seconds) { await sleep(120); await frame(seconds); },
  // Move a slider from → to over `seconds`, a frame every 1/12 s.
  async sweep(id, from, to, seconds, fps = 12) {
    const steps = Math.max(2, Math.round(seconds * fps));
    for (let i = 0; i <= steps; i++) {
      const v = from + ((to - from) * i) / steps;
      await js(`__v.set(${JSON.stringify(id)}, ${v}); return 1;`);
      await frame(1 / fps);
    }
  },
};

for (const [i, scene] of scenes.entries()) {
  process.stdout.write(`scene ${i + 1}/${scenes.length}: ${scene.name}\n`);
  await scene.run(api);
}
// ffmpeg concat list (the last frame repeated, as the format needs).
const lines = list.flatMap(([f, s]) => [`file '${f}'`, `duration ${s.toFixed(4)}`]);
lines.push(`file '${list.at(-1)[0]}'`);
writeFileSync(new URL("list.txt", OUT), lines.join("\n") + "\n");
const total = list.reduce((t, [, s]) => t + s, 0);
console.log(`${n} frames, ${total.toFixed(1)} s`);
ws.close();
edge.kill();
