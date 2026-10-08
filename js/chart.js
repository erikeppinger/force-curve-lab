// Minimal dependency-free SVG line chart. Re-renders fully on each call (cheap at this size).

const NS = "http://www.w3.org/2000/svg";
const M = { l: 48, r: 14, t: 14, b: 38 };

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

/**
 * series: [{ points: [[x,y],...], className, label }]
 * bands:  [{ from, to, label }] shaded x-ranges (e.g. exercise phases)
 * marker: x position of the current-angle line
 */
export function renderChart(svg, { xRange, yMax, yMin = 0, series, bands = [], marker, xLabel, yLabel, yFormat = (v) => v, xUnit = "°", xStep: xStepIn, onScrub }) {
  // viewBox follows the rendered width (360–600) so labels stay legible on phones.
  const W = Math.round(Math.max(360, Math.min(600, svg.clientWidth || 600)));
  const H = Math.round(Math.max(220, W * 0.42));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const [x0, x1] = xRange;
  const rawTop = yMax ?? Math.max(...series.flatMap((s) => s.points.map((p) => p[1]))) * 1.05;
  // Negative values (e.g. the opposite muscle group working) get room below zero when asked for,
  // with gridlines on round steps through zero.
  let top = niceMax(rawTop), bottom = 0, step = top / 4;
  if (yMin < 0) {
    step = niceMax((rawTop - yMin * 1.05) / 4);
    top = Math.max(step, Math.ceil(rawTop / step) * step);
    bottom = Math.floor((yMin * 1.05) / step) * step;
  }
  const X = (x) => M.l + ((x - x0) / (x1 - x0)) * (W - M.l - M.r);
  const Y = (y) => H - M.b - ((Math.min(top, Math.max(bottom, y)) - bottom) / (top - bottom)) * (H - M.t - M.b);

  bands.forEach((b, i) => {
    el("rect", { x: X(b.from), y: M.t, width: X(b.to) - X(b.from), height: H - M.t - M.b, class: `band band-${i % 2}` }, svg);
    el("text", { x: (X(b.from) + X(b.to)) / 2, y: M.t + 12, class: "band-label", "text-anchor": "middle" }, svg).textContent = b.label;
  });

  for (let v = bottom; v <= top + 1e-9; v += step) {
    el("line", { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: "grid" }, svg);
    el("text", { x: M.l - 6, y: Y(v) + 4, class: "tick", "text-anchor": "end" }, svg).textContent = yFormat(v);
  }
  const xStep = xStepIn ?? (xUnit === "%" ? 25 : 30);
  for (let x = Math.ceil(x0 / xStep) * xStep; x <= x1; x += xStep) {
    el("text", { x: X(x), y: H - M.b + 16, class: "tick", "text-anchor": "middle" }, svg).textContent = `${x}${xUnit}`;
  }
  if (bottom < 0) el("line", { x1: M.l, x2: W - M.r, y1: Y(0), y2: Y(0), class: "zero" }, svg);
  el("text", { x: (M.l + W - M.r) / 2, y: H - 4, class: "axis-label", "text-anchor": "middle" }, svg).textContent = xLabel;
  el("text", { x: 12, y: (M.t + H - M.b) / 2, class: "axis-label", "text-anchor": "middle", transform: `rotate(-90 12 ${(M.t + H - M.b) / 2})` }, svg).textContent = yLabel;

  for (const s of series) {
    const d = s.points.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("");
    el("path", { d, class: `line ${s.className}` }, svg);
  }

  if (marker != null) {
    el("line", { x1: X(marker), x2: X(marker), y1: M.t, y2: H - M.b, class: "marker" }, svg);
  }
  // Tap or drag sideways on the chart to move the marker (vertical swipes still scroll the page).
  svg.classList.toggle("scrub", Boolean(onScrub));
  if (onScrub) {
    const toX = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      return Math.min(x1, Math.max(x0, x0 + ((px - M.l) / (W - M.l - M.r)) * (x1 - x0)));
    };
    // The pressed state lives on the element: the chart re-renders (and re-binds) while dragging.
    svg.onpointerdown = (e) => { svg.dataset.scrubbing = "1"; try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ } onScrub(toX(e)); };
    svg.onpointermove = (e) => { if (svg.dataset.scrubbing) onScrub(toX(e)); };
    svg.onpointerup = svg.onpointercancel = () => { delete svg.dataset.scrubbing; };
  } else {
    svg.onpointerdown = svg.onpointermove = svg.onpointerup = svg.onpointercancel = null;
  }
}
