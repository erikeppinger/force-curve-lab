// Muscle paths over a wrapping cylinder, as OpenSim does: shared by the hip model (js/hipmodel.js)
// and the 3D leg drawings (js/legmodel.js). No imports, so either can use it.

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const along = (o, d, k) => ({ x: o.x + d.x * k, y: o.y + d.y * k, z: o.z + d.z * k });

/**
 * Wrap a straight segment a → b over a cylinder (centre `c`, axes `ax` = [x, y, z] with z along the
 * cylinder, radius `r`, OpenSim's `quadrant`): in the cylinder's frame the path runs tangent to the
 * circle, along the arc and tangent off again; along the axis it rises evenly over the unrolled
 * length. It wraps only where the line cuts the cylinder on the side its quadrant allows, as
 * OpenSim does (a line that misses it, or cuts it on the other side, stays straight; checked against
 * OpenSim's lengths in tests/legmodel.test.mjs). Returns the points to insert between a and b, or null.
 */
export function wrapOverCylinder(a, b, { c, ax, r, quadrant }) {
  const toCyl = (p) => { const d = sub(p, c); return [dot(d, ax[0]), dot(d, ax[1]), dot(d, ax[2])]; };
  const fromCyl = (q) => along(along(along(c, ax[0], q[0]), ax[1], q[1]), ax[2], q[2]);
  const P = toCyl(a), S = toCyl(b);
  const dp = Math.hypot(P[0], P[1]), ds = Math.hypot(S[0], S[1]);
  if (dp <= r || ds <= r) return null;
  const dx = S[0] - P[0], dy = S[1] - P[1];
  const t = Math.max(0, Math.min(1, -(P[0] * dx + P[1] * dy) / (dx * dx + dy * dy || 1)));
  const cx = P[0] + t * dx, cy = P[1] + t * dy;
  const allowed = (ang) => ({ "+x": Math.cos(ang) > 0, "-x": Math.cos(ang) < 0, "+y": Math.sin(ang) > 0, "-y": Math.sin(ang) < 0 })[quadrant] ?? true;
  if (Math.hypot(cx, cy) >= r || !allowed(Math.atan2(cy, cx))) return null;
  const tp = Math.atan2(P[1], P[0]), ts = Math.atan2(S[1], S[0]);
  const ap = Math.acos(r / dp), as = Math.acos(r / ds);
  const mod = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ways = [1, -1].map((s) => {
    const a1 = tp + s * ap, a2 = ts - s * as;
    const arc = mod(s * (a2 - a1));
    return { s, a1, arc, len: Math.sqrt(dp * dp - r * r) + r * arc + Math.sqrt(ds * ds - r * r) };
  });
  const ok = ways.filter((w) => allowed(w.a1 + (w.s * w.arc) / 2));
  const best = (ok.length ? ok : ways).reduce((m, w) => (w.len < m.len ? w : m));
  const lp = Math.sqrt(dp * dp - r * r);
  const n = Math.max(1, Math.ceil(best.arc / 0.3));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = best.a1 + (best.s * best.arc * i) / n;
    const k = (lp + (r * best.arc * i) / n) / best.len;
    pts.push(fromCyl([r * Math.cos(ang), r * Math.sin(ang), P[2] + (S[2] - P[2]) * k]));
  }
  return pts;
}
