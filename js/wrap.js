// Muscle paths over wrapping surfaces, as OpenSim does: shared by the hip model (js/hipmodel.js),
// the 3D leg drawings (js/legmodel.js) and the arm drawings (js/armmodel.js). No imports, so any
// of them can use it.

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const along = (o, d, k) => ({ x: o.x + d.x * k, y: o.y + d.y * k, z: o.z + d.z * k });

/** OpenSim's `quadrant` ("+x", "-y", "x" ...) as a test on a point's (x, y, z) in the surface's frame. */
function sideTest(quadrant) {
  const q = !quadrant || quadrant === "all" ? null : quadrant.length === 1 ? `+${quadrant}` : quadrant;
  if (!q) return () => true;
  const k = { x: 0, y: 1, z: 2 }[q[1]], s = q[0] === "-" ? -1 : 1;
  return (p) => s * p[k] > 0;
}

/**
 * The way round a circle (radius r, centre at the origin) from P to S in 2D: tangent off P, along
 * the arc, tangent onto S. `ok(angle)` says whether the arc's middle is on the allowed side; the
 * shorter allowed way wins (or the shorter one if neither is). Null when P or S is inside.
 */
function arcWay(P, S, r, ok) {
  const dp = Math.hypot(P[0], P[1]), ds = Math.hypot(S[0], S[1]);
  if (dp <= r || ds <= r) return null;
  const tp = Math.atan2(P[1], P[0]), ts = Math.atan2(S[1], S[0]);
  const ap = Math.acos(r / dp), as = Math.acos(r / ds);
  const mod = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const lp = Math.sqrt(dp * dp - r * r), ls = Math.sqrt(ds * ds - r * r);
  const ways = [1, -1].map((s) => {
    const a1 = tp + s * ap, a2 = ts - s * as;
    const arc = mod(s * (a2 - a1));
    return { s, a1, arc, lp, len: lp + r * arc + ls };
  });
  const good = ways.filter((w) => ok(w.a1 + (w.s * w.arc) / 2));
  return (good.length ? good : ways).reduce((m, w) => (w.len < m.len ? w : m));
}

/** The line P → S (2D or 3D arrays) cuts a circle / sphere of radius r: its closest point, or null. */
function cut(P, S, r) {
  const d = P.map((v, i) => S[i] - v);
  const dd = d.reduce((s, v) => s + v * v, 0) || 1;
  const t = Math.max(0, Math.min(1, -P.reduce((s, v, i) => s + v * d[i], 0) / dd));
  const C = P.map((v, i) => v + t * d[i]);
  return Math.hypot(...C) < r ? C : null;
}

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
  const allowed = sideTest(quadrant);
  const C = cut(P.slice(0, 2), S.slice(0, 2), r);
  if (!C || !allowed([...C, 0])) return null;
  const best = arcWay(P, S, r, (ang) => allowed([Math.cos(ang), Math.sin(ang), 0]));
  if (!best) return null;
  const n = Math.max(1, Math.ceil(best.arc / 0.3));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = best.a1 + (best.s * best.arc * i) / n;
    const k = (best.lp + (r * best.arc * i) / n) / best.len;
    pts.push(fromCyl([r * Math.cos(ang), r * Math.sin(ang), P[2] + (S[2] - P[2]) * k]));
  }
  return pts;
}

/**
 * Wrap a → b over an ellipsoid (centre `c`, axes `ax`, semi-axes `radii`; a sphere has three equal
 * ones) under the same rule as the cylinder: only where the line cuts it on the allowed side. The
 * ellipsoid is stretched into a unit sphere, the path runs over the great circle through both
 * points there (tangent on, arc, tangent off) and is stretched back: still tangent to the
 * ellipsoid, though not exactly the shortest path over it as OpenSim's is (checked against its
 * lengths, docs/model-limits.md). Returns the points to insert between a and b, or null.
 */
export function wrapOverEllipsoid(a, b, { c, ax, radii }, quadrant) {
  const toUnit = (p) => { const d = sub(p, c); return [0, 1, 2].map((i) => dot(d, ax[i]) / radii[i]); };
  const fromUnit = (q) => along(along(along(c, ax[0], q[0] * radii[0]), ax[1], q[1] * radii[1]), ax[2], q[2] * radii[2]);
  const P = toUnit(a), S = toUnit(b);
  const allowed = sideTest(quadrant);
  const C = cut(P, S, 1);
  if (!C || !allowed(C)) return null;
  // The plane through the centre and both points: e1 towards P, e2 across, in that plane.
  const np = Math.hypot(...P);
  const e1 = P.map((v) => v / np);
  const n = [P[1] * S[2] - P[2] * S[1], P[2] * S[0] - P[0] * S[2], P[0] * S[1] - P[1] * S[0]];
  const nn = Math.hypot(...n);
  if (nn < 1e-12) return null; // P, S and the centre in a line: no unique way round
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]].map((v) => v / nn);
  const in2 = (q) => [q.reduce((s, v, i) => s + v * e1[i], 0), q.reduce((s, v, i) => s + v * e2[i], 0)];
  const at = (ang) => e1.map((v, i) => Math.cos(ang) * v + Math.sin(ang) * e2[i]);
  const best = arcWay(in2(P), in2(S), 1, (ang) => allowed(at(ang)));
  if (!best) return null;
  const k = Math.max(1, Math.ceil(best.arc / 0.25));
  const pts = [];
  for (let i = 0; i <= k; i++) pts.push(fromUnit(at(best.a1 + (best.s * best.arc * i) / k)));
  return pts;
}
