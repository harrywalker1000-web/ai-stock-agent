/**
 * Contour lines generated from a real series (checklist 6: the ornament *is* the data).
 * The series is normalised, smoothed, and drawn as N stacked iso-lines whose amplitude
 * decays with distance from the "true" line — read as topography of the equity curve.
 * Decorative: aria-hidden, never placed behind a chart plot, table or body text.
 */
"use client";

type Props = {
  values: number[];
  lines?: number;
  className?: string;
  /** draw the true series line in brass (hero use) */
  highlight?: boolean;
  /** animate the draw-in once on mount (disabled by prefers-reduced-motion in globals.css) */
  drawIn?: boolean;
  height?: number;
};

function smooth(v: number[], k = 3): number[] {
  return v.map((_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(v.length - 1, i + k); j++) { s += v[j]; n++; }
    return s / n;
  });
}

function pathFor(ys: number[], w: number, h: number): string {
  if (ys.length < 2) return "";
  const step = w / (ys.length - 1);
  const pts = ys.map((y, i) => [i * step, y * h] as const);
  // Catmull-Rom → cubic Bézier for a hand-drawn, survey-map feel
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export default function Contours({ values, lines = 9, className, highlight = false, drawIn = false, height = 240 }: Props) {
  const W = 1000, H = height;
  const clean = values.filter((x) => typeof x === "number" && isFinite(x));
  if (clean.length < 3) return null;
  const s = smooth(clean, Math.max(1, Math.round(clean.length / 40)));
  const lo = Math.min(...s), hi = Math.max(...s);
  const norm = s.map((x) => (hi === lo ? 0.5 : 1 - (x - lo) / (hi - lo))); // 0 top … 1 bottom

  const paths: { d: string; o: number; main: boolean }[] = [];
  const mid = Math.floor(lines / 2);
  for (let k = 0; k < lines; k++) {
    const off = (k - mid) / lines;               // vertical offset of this iso-line
    const amp = 1 - Math.abs(k - mid) / (lines * 0.9); // relief flattens away from the true line
    const ys = norm.map((y) => 0.5 + off * 0.9 + (y - 0.5) * 0.7 * Math.max(0.15, amp));
    paths.push({ d: pathFor(ys, W, H), o: 0.08 + 0.14 * Math.max(0, amp), main: k === mid });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" vectorEffect="non-scaling-stroke"
          stroke={p.main && highlight ? "rgb(var(--accent))" : "rgb(var(--ink-3))"}
          strokeOpacity={p.main && highlight ? 0.55 : p.o}
          strokeWidth={p.main && highlight ? 1.5 : 1}
          pathLength={drawIn ? 1 : undefined}
          style={drawIn ? { strokeDasharray: 1, strokeDashoffset: 1, animation: `contour-draw 900ms ${i * 40}ms cubic-bezier(0.23,1,0.32,1) forwards` } : undefined}
        />
      ))}
      {drawIn && <style>{`@keyframes contour-draw { to { stroke-dashoffset: 0; } }`}</style>}
    </svg>
  );
}
