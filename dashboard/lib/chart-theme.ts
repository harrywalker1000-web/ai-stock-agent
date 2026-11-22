/**
 * Chart theme (dataviz skill + DESIGN_DIRECTION.md). Recharts takes literal colours
 * as SVG attributes, so the token hex values are mirrored here — keep in sync with
 * app/globals.css. Categorical order validated with dataviz/validate_palette.js
 * (dark, surface #171A1D: all checks pass). Never cycle; >8 series fold to "Other".
 */
export const T = {
  canvas: "#111315", surface: "#171A1D", raised: "#1E2226", line: "#2A2F35", lineStrong: "#6B737C",
  ink1: "#ECEDEE", ink2: "#B3B8BE", ink3: "#8E959D",
  accent: "#C8A15A", gain: "#4DB887", loss: "#E2706A", caution: "#E39A57",
} as const;

export const CATEGORICAL = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] as const;

/** Axis props: recessive, 12px, AA ink-3, tabular */
export const axisProps = {
  tick: { fill: T.ink3, fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const;

export const gridProps = { stroke: T.line, strokeDasharray: "0", vertical: false } as const;

/** Tooltip container — same surface/border/radius as menus (shadow-pop) */
export const tooltipProps = {
  contentStyle: {
    background: T.raised,
    border: `1px solid ${T.line}`,
    borderRadius: 8,
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.45)",
    color: T.ink1,
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    padding: "8px 10px",
  },
  labelStyle: { color: T.ink3, marginBottom: 4, fontSize: 12 },
  itemStyle: { color: T.ink1, padding: 0 },
  cursor: { stroke: T.lineStrong, strokeWidth: 1 },
  wrapperStyle: { outline: "none" },
} as const;

/** Format helpers shared by tooltips and axes */
export const fmtPctSigned = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`;
export const fmtUsdK = (v: number) => `$${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}K`;
