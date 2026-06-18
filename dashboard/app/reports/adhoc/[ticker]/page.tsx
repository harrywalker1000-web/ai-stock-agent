/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CandlestickChart from "@/components/CandlestickChart";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";

// ─── Helper functions ────────────────────────────────────────────────────────
const NP = "Not publicly disclosed";

function fv(f: any): any {
  if (f !== null && typeof f === "object" && "value" in f) return f.value;
  return f;
}
function fs(f: any): string { return f?.source ?? ""; }
function fmt$(n: any): string { return n == null ? NP : `$${Number(fv(n)).toFixed(2)}`; }
function fmtPct(n: any): string { const v = fv(n); return v == null ? NP : `${Number(v).toFixed(1)}%`; }
function fmtBn(n: any): string {
  const raw = fv(n);
  if (raw == null) return NP;
  const v = Number(raw);
  if (isNaN(v)) return NP;
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}
function fmtN(n: any, dp = 1): string { const v = fv(n); return v == null ? NP : Number(v).toFixed(dp); }
function usd(n: any) { return fmt$(n); }

// ─── Nav sections ────────────────────────────────────────────────────────────
const NAV = [
  { id: "s1",  n: 1,  label: "Fund Mandate" },
  { id: "s2",  n: 2,  label: "Company Overview" },
  { id: "s3",  n: 3,  label: "News & Catalysts" },
  { id: "s4",  n: 4,    label: "Historical Financials" },
  { id: "s4b", n: "4b", label: "Revenue Drivers" },
  { id: "s5",  n: 5,    label: "Forward Est. & DCF" },
  { id: "s6",  n: 6,    label: "Valuation Metrics" },
  { id: "s14", n: 14,   label: "Where We Differ" },
  { id: "sc",  n: "C",  label: "SOTP Valuation" },
  { id: "s7",  n: 7,    label: "Technical Analysis" },
  { id: "s8",  n: 8,    label: "Competitive Moat" },
  { id: "sb",  n: "B",  label: "Porter's Five Forces" },
  { id: "s9",  n: 9,    label: "Industry & Macro" },
  { id: "s10",  n: 10,    label: "Institutional" },
  { id: "s10b", n: "10b", label: "Management" },
  { id: "sh",   n: "H",   label: "ESG" },
  { id: "sj",   n: "J",   label: "M&A Track Record" },
  { id: "s11",  n: 11,    label: "Risk Register" },
  { id: "s12", n: 12, label: "Scenario Analysis" },
  { id: "s13", n: 13, label: "Sentiment" },
  { id: "s15", n: 15, label: "Setup Checklist" },
  { id: "s16", n: 16, label: "Recommendation" },
  { id: "s17", n: 17, label: "Data Reliability" },
];

// ─── Loading steps ────────────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  "Fetching market data from FMP",
  "Loading financials & earnings history",
  "Running DCF model",
  "Pulling analyst estimates",
  "Checking fund mandate criteria",
  "Analysing technical indicators",
  "Scanning institutional filings",
  "Reading insider transactions (SEC)",
  "Processing news catalysts",
  "Evaluating competitive moat",
  "Assessing industry & macro",
  "Scoring sentiment signals",
  "Building scenario analysis",
  "Generating investment arguments",
  "Synthesising committee recommendation",
  "Running reliability checks",
  "Assembling final report",
];

// ─── Reusable components ──────────────────────────────────────────────────────

function TagBadge({ source }: { source: string }) {
  if (!source) return null;
  const isAI = /llm|ai|gpt|sonnet|claude|estimated/i.test(source);
  return (
    <span className={`ml-1 inline-block text-[10px] font-bold px-1 py-0 rounded leading-5 align-middle border
      ${isAI
        ? "bg-[#78350F] text-[#FBBF24] border-[#F59E0B]/30"
        : "bg-[#1E3A5F] text-[#60A5FA] border-[#2D6BFF]/30"
      }`}
    >
      {isAI ? "AI" : source.toUpperCase().slice(0, 6)}
    </span>
  );
}

function StatCard({ label, value, source, color, large }: {
  label: string; value: React.ReactNode; source?: string; color?: string; large?: boolean;
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className={`font-mono font-bold ${large ? "text-2xl" : "text-lg"}`} style={{ color: color ?? "var(--text-primary)" }}>
        {value ?? "Not publicly disclosed"}
        {source && <TagBadge source={source} />}
      </p>
    </div>
  );
}

function SectionHeader({ n, title, color = "#2D6BFF" }: { n: number; title: string; color?: string }) {
  const c = `var(--section-accent, ${color})`;
  return (
    <div className="rounded-t-xl overflow-hidden" style={{ backgroundColor: "var(--bg-section-header)", border: "1px solid var(--border)" }}>
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${c}, transparent 60%)` }} />
      <div className="px-5 py-3.5 flex items-center gap-3">
        <span className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-mono font-bold shrink-0"
          style={{ background: `color-mix(in srgb, ${c} 10%, transparent)`, color: c, border: `1px solid color-mix(in srgb, ${c} 25%, transparent)` }}>
          {String(n).padStart(2, "0")}
        </span>
        <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>
      </div>
    </div>
  );
}

function Section({ id, n, title, color, children }: {
  id: string; n: number; title: string; color?: string; children: React.ReactNode;
}) {
  return (
    <div id={id} className="mb-7 rounded-xl overflow-hidden shadow-lg shadow-black/20">
      <SectionHeader n={n} title={title} color={color} />
      <div className="px-5 py-5" style={{ backgroundColor: "var(--bg-section-body)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function MandateRing({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? passed / total : 0;
  const R = 26, cx = 32, cy = 32;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - pct);
  const color = pct >= 0.75 ? "#10B981" : pct >= 0.55 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-center gap-3">
      <svg width={64} height={64} viewBox="0 0 64 64">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy + 5} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold" fontFamily="monospace">{passed}</text>
      </svg>
      <div>
        <p className="text-xl font-bold font-mono" style={{ color }}>{passed}/{total}</p>
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>criteria passed</p>
      </div>
    </div>
  );
}

function PriceRangeChart({ bearPrice, basePrice, bullPrice, currentPrice, bearUpside, baseUpside, bullUpside, bearProb, baseProb, bullProb, pwReturn }: {
  bearPrice: number; basePrice: number; bullPrice: number; currentPrice: number;
  bearUpside?: number | null; baseUpside?: number | null; bullUpside?: number | null;
  bearProb?: number | null; baseProb?: number | null; bullProb?: number | null;
  pwReturn?: number | null;
}) {
  const allPrices = [bearPrice, basePrice, bullPrice, currentPrice].filter(Boolean);
  const lo = Math.min(...allPrices) * 0.93;
  const hi = Math.max(...allPrices) * 1.07;
  const span = hi - lo || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  const bearPct = pct(bearPrice), basePct = pct(basePrice);
  const bullPct = pct(bullPrice), curPct  = pct(currentPrice);
  return (
    <div className="bg-[#080C14] border border-[#1E2D4A] rounded-2xl p-6">
      {/* Scenario probability badges */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {[
          { label: "Bear", prob: bearProb, color: "#EF4444" },
          { label: "Base", prob: baseProb, color: "#2D6BFF" },
          { label: "Bull", prob: bullProb, color: "#10B981" },
        ].map(({ label, prob, color }) => prob != null && (
          <span key={label} className="text-[10px] font-bold px-3 py-1 rounded-full"
            style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
            {label} {prob}%
          </span>
        ))}
        {pwReturn != null && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-[#475569]">PW Return</span>
            <span className={`text-lg font-bold font-mono ${Number(pwReturn) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
              {Number(pwReturn) >= 0 ? "+" : ""}{Number(pwReturn).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Price labels */}
      <div className="relative h-14 mb-2">
        {[
          { p: bearPct, price: bearPrice, upside: bearUpside, color: "#EF4444", label: "Bear" },
          { p: basePct, price: basePrice, upside: baseUpside, color: "#2D6BFF", label: "Base" },
          { p: bullPct, price: bullPrice, upside: bullUpside, color: "#10B981", label: "Bull" },
        ].map(({ p, price, upside, color, label }) => (
          <div key={label} className="absolute text-center" style={{ left: `${p}%`, transform: "translateX(-50%)" }}>
            <p className="text-xs font-bold font-mono" style={{ color }}>{fmt$(price)}</p>
            {upside != null && (
              <p className="text-[10px] font-mono" style={{ color }}>
                {Number(upside) >= 0 ? "+" : ""}{Number(upside).toFixed(1)}%
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Range bar */}
      <div className="relative h-5 mb-2">
        {/* Track */}
        <div className="absolute inset-0 rounded-full bg-[#1E2D4A]" />
        {/* Coloured fill: bear → bull */}
        <div className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${bearPct}%`,
            width: `${bullPct - bearPct}%`,
            background: "linear-gradient(90deg, #EF444450, #2D6BFF60, #10B98150)",
          }} />
        {/* Current price tick */}
        <div className="absolute top-0 bottom-0 w-1 rounded-full bg-white shadow-lg shadow-white/20"
          style={{ left: `${curPct}%`, transform: "translateX(-50%)" }} />
        {/* Dot markers */}
        {[
          { p: bearPct, color: "#EF4444" },
          { p: basePct, color: "#2D6BFF" },
          { p: bullPct, color: "#10B981" },
        ].map(({ p, color }, i) => (
          <div key={i} className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#080C14]"
            style={{ left: `${p}%`, transform: "translate(-50%, -50%)", background: color }} />
        ))}
      </div>

      {/* Current price label */}
      <div className="relative h-8">
        <div className="absolute text-center" style={{ left: `${curPct}%`, transform: "translateX(-50%)" }}>
          <p className="text-[11px] font-bold font-mono text-white">{fmt$(currentPrice)}</p>
          <p className="text-[10px] text-[#475569]">current</p>
        </div>
      </div>
    </div>
  );
}

function CheckItem({ passed, name, detail, source }: {
  passed: boolean; name: string; detail?: string; source?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className={`text-sm font-bold mt-0.5 shrink-0 w-4 text-center ${passed ? "text-[#10B981]" : "text-[#EF4444]"}`}>
        {passed ? "+" : "-"}
      </span>
      <div className="flex-1">
        <span className="text-xs" style={{ color: "var(--text-primary)" }}>{name}</span>
        {detail && <span className="text-[10px] ml-2" style={{ color: "var(--text-muted)" }}>{detail}</span>}
      </div>
      {source && <TagBadge source={source} />}
    </div>
  );
}

function ScenarioCard({ type, price, upside, probability, source, trigger }: {
  type: "bull" | "base" | "bear"; price: any; upside: any; probability: any; source?: string; trigger?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = {
    bull: { label: "Bull Case", color: "#10B981", border: "#10B981" },
    base: { label: "Base Case", color: "#2D6BFF", border: "#2D6BFF" },
    bear: { label: "Bear Case", color: "#EF4444", border: "#EF4444" },
  }[type];
  const triggerStr = trigger ? String(trigger) : null;
  const isLong     = triggerStr && triggerStr.length > 120;
  const displayTxt = triggerStr && !expanded && isLong ? triggerStr.slice(0, 120) + "…" : triggerStr;
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ backgroundColor: "var(--bg-card)", borderLeft: `3px solid ${cfg.color}`, border: `1px solid ${cfg.border}30`, borderLeftWidth: 3, borderLeftColor: cfg.color }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
        {probability != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-card-dark)", color: "var(--text-secondary)" }}>
            {fv(probability)}% prob
          </span>
        )}
      </div>
      <p className="text-2xl font-bold font-mono" style={{ color: cfg.color }}>{usd(price)}</p>
      {upside != null && (
        <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
          {Number(fv(upside)) >= 0 ? "+" : ""}{fmtN(upside, 1)}%
        </p>
      )}
      {displayTxt && (
        <div>
          <p className="text-[10px] leading-relaxed mt-1" style={{ color: "var(--text-muted)" }}>{displayTxt}</p>
          {isLong && (
            <button onClick={() => setExpanded(e => !e)}
              className="text-[10px] mt-1 cursor-pointer"
              style={{ color: cfg.color }}>
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
      {source && <TagBadge source={source} />}
    </div>
  );
}

function HeatCell({ value, min, max, currentPrice }: { value: number; min: number; max: number; currentPrice?: number }) {
  const aboveCurrent = currentPrice != null && value > currentPrice;
  const r = aboveCurrent ? 16  : 239;
  const g = aboveCurrent ? 185 : 68;
  const b = aboveCurrent ? 129 : 68;
  const range = max - min || 1;
  const t = (value - min) / range;
  const intensity = 0.12 + t * 0.18;
  const bg = `rgba(${r},${g},${b},${intensity.toFixed(2)})`;
  const border = `rgba(${r},${g},${b},0.35)`;
  return (
    <td
      className="text-center text-[10px] font-mono py-1.5 px-2 border border-[#1E2D4A]"
      style={{ background: bg, borderColor: border, color: `rgb(${r},${g},${b})` }}
    >
      {fmt$(value)}
    </td>
  );
}

function SemiGauge({ value, max = 100, color, size = 96 }: {
  value: number; max?: number; color: string; size?: number;
}) {
  const R = size * 0.38;
  const cx = size / 2, cy = size * 0.52;
  const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const circ = Math.PI * R;
  const t = Math.min(1, Math.max(0, value / max));
  const offset = circ * (1 - t);
  return (
    <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`} className="overflow-visible">
      <path d={arc} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} strokeLinecap="round" />
      <path d={arc} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} />
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
        fontSize={size * 0.22} fontWeight="bold" fontFamily="monospace">{value.toFixed(0)}</text>
    </svg>
  );
}

function ConvictionBar({ score }: { score: number }) {
  // score is 0-100; render 10 segments each representing 10 points
  const filled = Math.round(score / 10);
  const color = score >= 80 ? "#10B981" : score >= 50 ? "#2D6BFF" : score >= 30 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex gap-1 items-center">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-3 w-5 rounded-sm"
          style={{ background: i < filled ? color : "rgba(255,255,255,0.07)" }}
        />
      ))}
      <span className="ml-2 text-sm font-bold font-mono" style={{ color }}>{score}/100</span>
    </div>
  );
}

function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xs font-mono text-right" style={{ color: color ?? "var(--text-secondary)" }}>{value ?? "Not publicly disclosed"}</span>
    </div>
  );
}

// ─── Chart components (inline SVG — no external deps) ────────────────────────

function RevenueBarChart({ years, viewLabel = "Annual" }: { years: any[], viewLabel?: string }) {
  if (!years || years.length === 0) return null;
  // Reverse so oldest year is on the left
  const ordered = [...years].reverse();
  const vals = ordered.map((y: any) => Math.abs(Number(fv(y.revenue) ?? 0)));
  const maxV = Math.max(...vals, 1);
  const n = ordered.length;

  const W = 520, H = 170;
  const pad = { top: 40, right: 20, bottom: 48, left: 20 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slotW = innerW / n;
  const barW = Math.min(Math.floor(slotW * 0.55), 60);

  const fmtRev = (v: number) => {
    if (v >= 1e12) return `$${(v/1e12).toFixed(1)}T`;
    if (v >= 1e9)  return `$${(v/1e9).toFixed(1)}B`;
    if (v >= 1e6)  return `$${(v/1e6).toFixed(v >= 100e6 ? 0 : 1)}M`;
    return `$${(v/1e3).toFixed(0)}K`;
  };
  const fmtNm = (nm: number) => {
    const abs = Math.abs(nm);
    return `${nm < 0 ? "−" : ""}${abs >= 100 ? abs.toFixed(0) : abs.toFixed(1)}%`;
  };

  const source = fv(years[0]?.revenue?.source) || "yfinance/FMP";

  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">
        Revenue Trend <span className="text-[#334155] normal-case font-normal">({viewLabel})</span>
      </p>
      <div className="bg-[#080C14] border border-[#1E2D4A] rounded-xl p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[260px]" style={{ maxHeight: 190 }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line key={t} x1={pad.left} x2={W - pad.right}
              y1={pad.top + innerH * (1 - t)} y2={pad.top + innerH * (1 - t)}
              stroke="#1E2D4A" strokeWidth={0.5} strokeDasharray="4 3" />
          ))}
          {ordered.map((yr: any, i: number) => {
            const rev = Math.abs(Number(fv(yr.revenue) ?? 0));
            const nm = Number(fv(yr.net_margin) ?? NaN);
            const yoyRaw = fv(yr.revenue_yoy);
            const h = Math.max((rev / maxV) * innerH, 3);
            const cx = pad.left + i * slotW + slotW / 2;
            const bx = cx - barW / 2;
            const by = pad.top + innerH - h;
            const nmColor = isNaN(nm) ? "#475569" : nm >= 10 ? "#10B981" : nm >= 0 ? "#F59E0B" : "#EF4444";
            const hasYoy = yoyRaw != null && !isNaN(Number(yoyRaw));
            const yoyVal = hasYoy ? Number(yoyRaw) : 0;

            return (
              <g key={i}>
                {/* Bar fill + border */}
                <rect x={bx} y={by} width={barW} height={h} rx={4}
                  fill="#2D6BFF55" stroke="#2D6BFF" strokeWidth={1.5}>
                  <title>{yr.label ?? fv(yr.year)}: {fmtRev(rev)}{hasYoy ? ` (${yoyVal >= 0 ? "+" : ""}${yoyVal.toFixed(1)}% YoY)` : ""}</title>
                </rect>
                {/* YoY/QoQ badge — top row */}
                {hasYoy && (
                  <text x={cx} y={by - 22} textAnchor="middle"
                    fill={yoyVal >= 0 ? "#10B981" : "#EF4444"} fontSize={8} fontFamily="monospace" fontWeight="bold">
                    {yoyVal >= 0 ? "▲" : "▼"} {yoyVal >= 0 ? "+" : ""}{Math.abs(yoyVal) >= 100 ? yoyVal.toFixed(0) : yoyVal.toFixed(1)}%
                  </text>
                )}
                {/* Revenue label */}
                <text x={cx} y={by - 8} textAnchor="middle" fill="#CBD5E1" fontSize={9} fontFamily="monospace">
                  {fmtRev(rev)}
                </text>
                {/* Year label */}
                <text x={cx} y={pad.top + innerH + 16} textAnchor="middle" fill="#94A3B8" fontSize={9.5} fontFamily="monospace" fontWeight="bold">
                  {yr.label ?? fv(yr.year)}
                </text>
                {/* Net margin below year */}
                {!isNaN(nm) && nm !== 0 && (
                  <text x={cx} y={pad.top + innerH + 30} textAnchor="middle" fill={nmColor} fontSize={7.5} fontFamily="monospace">
                    NM {fmtNm(nm)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p className="text-[10px] text-[#334155] mt-1 text-right">
          Bars = Revenue · ▲▼ = Growth · NM = Net Margin below year · Source: {source}
        </p>
      </div>
    </div>
  );
}

function MarginChart({ years }: { years: any[] }) {
  if (!years || years.length === 0) return null;
  const metrics = [
    { key: "gross_margin",  label: "Gross",  color: "#10B981" },
    { key: "ebitda_margin", label: "EBITDA", color: "#818CF8" },
    { key: "net_margin",    label: "Net",    color: "#F59E0B" },
  ];
  const hasAny = metrics.some(m => years.some((y: any) => fv(y[m.key]) != null));
  if (!hasAny) return null;
  const ordered = [...years].reverse(); // oldest first
  const latest = years[0];

  // Normalize bars relative to max absolute value across all metrics & years
  const allAbsVals = metrics.flatMap(({ key }) =>
    years.map((y: any) => Math.abs(Number(fv(y[key]) ?? NaN))).filter(v => !isNaN(v))
  );
  const maxAbs = Math.max(...allAbsVals, 1);

  const fmtPctVal = (v: number) => `${v >= 0 ? "+" : ""}${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}%`;

  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Margin Profile</p>

      {/* Bar rows — one per metric */}
      <div className="space-y-3 mb-4">
        {metrics.map(({ key, label, color }) => {
          const latestVal = Number(fv(latest?.[key]) ?? NaN);
          if (isNaN(latestVal)) return null;
          const neg = latestVal < 0;
          const barPct = (Math.abs(latestVal) / maxAbs) * 100;
          const barColor = neg ? "#EF4444" : color;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[11px] font-medium w-14 shrink-0" style={{ color: "var(--text-secondary)" }}>{label}</span>
              <div className="flex-1 rounded-full h-4 overflow-hidden" style={{ backgroundColor: "var(--bg-card-dark)" }}>
                <div className="h-full rounded-full" style={{
                  width: `${Math.max(barPct, 1)}%`,
                  background: `${barColor}55`,
                  borderRight: `2px solid ${barColor}`,
                }} />
              </div>
              <span className="text-[11px] font-mono font-bold w-16 text-right shrink-0"
                style={{ color: neg ? "#EF4444" : color }}>
                {fmtPctVal(latestVal)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Year-by-year table */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {/* Header row */}
        <div className="grid text-[10px] font-bold uppercase tracking-wider px-3 py-2"
          style={{ gridTemplateColumns: `80px repeat(${ordered.length}, 1fr)`, backgroundColor: "var(--bg-card-dark)", color: "var(--text-muted)" }}>
          <span>Metric</span>
          {ordered.map((yr: any) => (
            <span key={fv(yr.year)} className="text-center">{yr.label ?? fv(yr.year)}</span>
          ))}
        </div>
        {/* Metric rows */}
        {metrics.map(({ key, label, color }, mi) => {
          const rowHasData = ordered.some((y: any) => fv(y[key]) != null);
          if (!rowHasData) return null;
          return (
            <div key={key}
              className="grid text-[10px] font-mono px-3 py-2"
              style={{
                gridTemplateColumns: `80px repeat(${ordered.length}, 1fr)`,
                backgroundColor: mi % 2 === 0 ? "var(--bg-section-body)" : "var(--bg-card-dark)",
                borderTop: "1px solid var(--border)",
              }}>
              <span className="font-medium" style={{ color }}>{label}</span>
              {ordered.map((yr: any) => {
                const v = Number(fv(yr[key]) ?? NaN);
                const vColor = isNaN(v) ? "var(--text-muted)" : v < 0 ? "#EF4444" : v < 5 ? "#F59E0B" : color;
                return (
                  <span key={fv(yr.year)} className="text-center" style={{ color: vColor }}>
                    {isNaN(v) ? "—" : fmtPctVal(v)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeerBarChart({ peers, subjectTicker, metric = "ev_ebitda", label = "EV/EBITDA" }: {
  peers: any[]; subjectTicker: string; metric?: string; label?: string;
}) {
  const rows = peers.map((p: any) => ({
    sym: String(fv(p.symbol) ?? p.ticker ?? ""),
    val: Number(fv(p[metric]) ?? 0),
  })).filter(r => !isNaN(r.val) && r.val !== 0 && r.val > 0).slice(0, 8);
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.val - a.val);
  const maxV = Math.max(...sorted.map(r => r.val), 1);
  return (
    <div className="mt-5">
      <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Peer {label} Comparison</p>
      <div className="bg-[#080C14] border border-[#1E2D4A] rounded-xl p-4 space-y-2">
        {sorted.map(({ sym, val }) => {
          const isSubject = sym.toUpperCase() === subjectTicker.toUpperCase();
          const barPct = (val / maxV) * 100;
          const color = isSubject ? "#F59E0B" : "#2D6BFF";
          return (
            <div key={sym} className="flex items-center gap-3">
              <span className={`text-[10px] font-mono font-bold w-14 shrink-0 ${isSubject ? "text-[#F59E0B]" : "text-[#475569]"}`}>
                {sym}
              </span>
              <div className="flex-1 bg-[#1E2D4A] rounded-full h-3 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: `${color}70` }} />
              </div>
              <span className="text-[10px] font-mono w-10 text-right shrink-0" style={{ color: isSubject ? "#F59E0B" : "#94A3B8" }}>
                {val.toFixed(1)}x
              </span>
            </div>
          );
        })}
        <p className="text-[10px] text-[#1E3A5F] text-right pt-1">Highlighted = subject company · Source: yfinance</p>
      </div>
    </div>
  );
}

function OwnershipDonut({ instPct, insiderPct, instSource, insiderSource }: {
  instPct: number | null; insiderPct: number | null; instSource?: string; insiderSource?: string;
}) {
  if (instPct == null && insiderPct == null) return null;
  const inst    = Number(instPct ?? 0);
  const insider = Number(insiderPct ?? 0);
  const pub     = Math.max(0, 100 - inst - insider);
  const segments = [
    { label: "Institutional", pct: inst,    color: "#2D6BFF", source: instSource },
    { label: "Insider",       pct: insider, color: "#F59E0B", source: insiderSource },
    { label: "Public Float",  pct: pub,     color: "#1E2D4A", source: undefined },
  ];
  const cx = 60, cy = 60, R = 44, r = 28;
  let cumAngle = -Math.PI / 2;
  const arcs = segments.map(s => {
    const theta = (s.pct / 100) * 2 * Math.PI;
    const start = cumAngle;
    cumAngle += theta;
    const end = cumAngle;
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
    const xi1 = cx + r * Math.cos(start), yi1 = cy + r * Math.sin(start);
    const xi2 = cx + r * Math.cos(end),   yi2 = cy + r * Math.sin(end);
    const large = theta > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`;
    return { ...s, path };
  });
  return (
    <div className="bg-[#080C14] border border-[#1E2D4A] rounded-xl p-4 mb-5">
      <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Ownership Breakdown</p>
      <div className="flex items-center gap-6 flex-wrap">
        <svg width={120} height={120} viewBox="0 0 120 120">
          {arcs.map((arc, i) => arc.pct > 0 && (
            <path key={i} d={arc.path} fill={arc.color} opacity={arc.label === "Public Float" ? 0.4 : 0.85}>
              <title>{arc.label}: {arc.pct.toFixed(1)}%</title>
            </path>
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" fill="#E2E8F0" fontSize={13} fontWeight="bold" fontFamily="monospace">
            {inst.toFixed(0)}%
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="#475569" fontSize={8} fontFamily="monospace">Inst.</text>
        </svg>
        <div className="space-y-2">
          {segments.filter(s => s.pct > 0).map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color, opacity: s.label === "Public Float" ? 0.4 : 0.85 }} />
              <span className="text-[10px] text-[#94A3B8]">{s.label}</span>
              <span className="text-[10px] font-mono font-bold text-[#E2E8F0] ml-auto pl-3">{s.pct.toFixed(1)}%</span>
              {s.source && <TagBadge source={s.source} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalystBar({ buyCnt, holdCnt, sellCnt }: { buyCnt: number; holdCnt: number; sellCnt: number }) {
  const total = buyCnt + holdCnt + sellCnt;
  if (total === 0) return null;
  const segments = [
    { label: "Buy",  count: buyCnt,  color: "#10B981" },
    { label: "Hold", count: holdCnt, color: "#F59E0B" },
    { label: "Sell", count: sellCnt, color: "#EF4444" },
  ].filter(s => s.count > 0);
  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-2">
        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Analyst Ratings</p>
        <span className="text-[10px] text-[#475569]">{total} analysts</span>
      </div>
      {/* Stacked horizontal bar */}
      <div className="flex h-8 rounded-lg overflow-hidden w-full mb-3">
        {segments.map(({ label, count, color }) => {
          const pct = (count / total) * 100;
          return (
            <div key={label} className="flex items-center justify-center flex-col transition-all relative"
              style={{ width: `${pct}%`, background: `${color}55`, borderRight: "1px solid #0F1623" }}>
              {pct > 12 && (
                <span className="text-[10px] font-bold font-mono absolute inset-0 flex items-center justify-center" style={{ color }}>
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex gap-4">
        {segments.map(({ label, count, color }) => {
          const pct = ((count / total) * 100).toFixed(0);
          return (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              <span className="text-[10px] text-[#94A3B8]">{label}</span>
              <span className="text-[10px] font-mono font-bold" style={{ color }}>{count} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Research Chatbot ─────────────────────────────────────────────────────────
function buildReportContext(ticker: string, report: Record<string, any>): string {
  const v = (f: any): any => (f !== null && typeof f === "object" && "value" in f ? f.value : f);
  const pct = (n: any) => { const x = v(n); return x == null ? "N/A" : `${Number(x).toFixed(1)}%`; };
  const money = (n: any) => {
    const x = Number(v(n) ?? 0); if (!x) return "N/A";
    if (Math.abs(x) >= 1e12) return `$${(x/1e12).toFixed(2)}T`;
    if (Math.abs(x) >= 1e9)  return `$${(x/1e9).toFixed(1)}B`;
    if (Math.abs(x) >= 1e6)  return `$${(x/1e6).toFixed(0)}M`;
    return `$${x.toFixed(2)}`;
  };
  const num  = (n: any, dp = 1) => { const x = v(n); return x == null ? "N/A" : Number(x).toFixed(dp); };
  const str  = (n: any) => String(v(n) ?? "N/A");
  const list = (arr: any[], key = "") => Array.isArray(arr)
    ? arr.slice(0, 5).map((x: any, i: number) => `  ${i+1}. ${typeof x === "string" ? x : (v(x?.[key]) ?? JSON.stringify(x))}`).join("\n")
    : "  N/A";

  const sections = report.sections ?? {};
  const s1  = sections.s1_cover ?? sections.s1_mandate ?? {};
  const s4  = sections.s4_financials ?? sections.s4_financial ?? {};
  const s5  = sections.s5_dcf ?? sections.s5_forward ?? {};
  const s6  = sections.s6_valuation ?? {};
  const s7  = sections.s7_technicals ?? sections.s7_technical ?? {};
  const s10 = sections.s10_institutional ?? {};
  const s11 = sections.s11_risks ?? {};
  const s12 = sections.s12_scenarios ?? {};
  const s13 = sections.s13_sentiment ?? {};
  const s14 = sections.s14_differ ?? {};
  const s15 = sections.s15_checklist ?? {};
  const s16 = sections.s16_recommendation ?? {};
  const s3  = sections.s3_news ?? {};
  const s2  = sections.s2_overview ?? sections.s2_company ?? {};

  const rec = s16.direction != null ? s16 : (report.s7_recommendation ?? {});
  const historical = s4.years ?? s4.historical ?? s4.income_statement ?? [];
  const technicals = report.technicals ?? {};
  const icBreakdown = rec.conviction_breakdown ?? {};

  const finRows = (historical as any[]).slice(0, 5).map((row: any) =>
    `  ${str(row.label ?? row.year)}: Rev=${money(row.revenue)} YoY=${num(v(row.revenue_yoy))}% GM=${pct(row.gross_margin)} EBITDA Mgn=${pct(row.ebitda_margin)} Net Mgn=${pct(row.net_margin)} EPS=${num(row.eps_diluted ?? row.eps, 2)} FCF=${money(row.fcf)}`
  ).join("\n");

  const icBD = Object.entries(icBreakdown).filter(([k]) => !["raw_total","final_conviction"].includes(k))
    .map(([k, c]: [string, any]) => `  ${k}: ${c.score}/${c.max} (${c.input})`).join("\n");

  const bear = v(s12.bear) ?? {};
  const base = v(s12.base) ?? {};
  const bull = v(s12.bull) ?? {};

  const nearCatalysts = Array.isArray(s3.near_term_catalysts) ? s3.near_term_catalysts : [];
  const medCatalysts  = Array.isArray(s3.medium_term_catalysts) ? s3.medium_term_catalysts : [];
  const risks = Array.isArray(s11.key_risks) ? s11.key_risks : (Array.isArray(rec.key_risks) ? rec.key_risks : []);

  const ar = (s10.analyst_ratings ?? {}) as Record<string, any>;
  const consensus = str(ar.consensus ?? s14.analyst_consensus);

  const lines = [
    `TICKER: ${ticker.toUpperCase()} | Company: ${str(s1.company_name ?? s2.company_name)}`,
    `Sector: ${str(s1.sector ?? s2.sector)} | Industry: ${str(s1.industry ?? s2.industry)}`,
    `Market Cap: ${money(s1.market_cap)} | Current Price: $${num(s1.current_price, 2)} | 52w Range: $${num(s1["52w_low"] ?? technicals["52w_low"], 2)}–$${num(s1["52w_high"] ?? technicals["52w_high"], 2)}`,
    `Setup Type: ${str(s1.setup_type)}`,
    "",
    "--- INVESTMENT COMMITTEE RECOMMENDATION ---",
    `Direction: ${str(rec.direction)} | Conviction: ${v(rec.conviction_score ?? rec.conviction) ?? "N/A"}/100`,
    `Expected Return 12m: ${str(rec.expected_return_12m)} | Position Size: ${num(rec.position_size_pct, 1)}% | Stop Loss: ${num(rec.stop_loss_pct, 1)}%`,
    `Source: ${str(rec.conviction_source)}`,
    "Three Arguments:",
    list(rec.three_arguments ?? []),
    "Key Risks (IC):",
    list(rec.key_risks ?? []),
    rec.committee_narrative ? `Committee Narrative:\n${String(rec.committee_narrative).slice(0, 800)}` : "",
    icBD ? `\nConviction Sub-Components:\n${icBD}` : "",
    "",
    "--- HISTORICAL FINANCIALS (Annual) ---",
    "Year: Revenue, YoY%, Gross Margin, EBITDA Margin, Net Margin, EPS, FCF",
    finRows || "  No data",
    "",
    "--- VALUATION ---",
    `P/E TTM: ${num(s6.pe_ttm)}x | Fwd P/E: ${num(s6.pe_fwd)}x | EV/EBITDA: ${num(s6.ev_ebitda)}x | P/S: ${num(s6.ps)}x | FCF Yield: ${pct(s6.fcf_yield)}`,
    `DCF Implied Price: $${num(s5.implied_price ?? s5.dcf?.implied_price, 2)} | Upside: ${pct(s5.upside_pct ?? s5.implied_upside)} | WACC: ${pct((s5.wacc_inputs ?? s5.wacc ?? {}).wacc ?? s5.wacc)}`,
    `Analyst PT Mean: $${num(s14.analyst_pt_mean, 2)} | Our DCF: $${num(s14.our_dcf_implied, 2)}`,
    "",
    "--- TECHNICALS ---",
    `RSI: ${num(technicals.rsi)} | Trend: ${str(technicals.trend_signal)} | Quant Score: ${num(s7.quant_score)}`,
    `Support: $${num(technicals.support_1 ?? technicals.support, 2)} | Resistance: $${num(technicals.resistance_1 ?? technicals.resistance, 2)}`,
    `Pct from 52w High: ${pct(technicals.pct_from_52w_high)} | ATR%: ${num(technicals.atr_pct)}%`,
    "",
    "--- SCENARIOS ---",
    `Bear: $${num(v(bear.price_target) ?? bear.price_target, 2)} (${num(v(bear.probability) ?? bear.probability, 0)}% prob) — ${str(bear.trigger ?? bear.assumption)}`,
    `Base: $${num(v(base.price_target) ?? base.price_target, 2)} (${num(v(base.probability) ?? base.probability, 0)}% prob) — ${str(base.trigger ?? base.assumption)}`,
    `Bull: $${num(v(bull.price_target) ?? bull.price_target, 2)} (${num(v(bull.probability) ?? bull.probability, 0)}% prob) — ${str(bull.trigger ?? bull.assumption)}`,
    `Probability-Weighted Return: ${pct(s12.probability_weighted_return)}`,
    "",
    "--- ANALYST CONSENSUS ---",
    `Consensus: ${consensus} | Buy: ${v(ar.buy_count) ?? "N/A"} | Hold: ${v(ar.hold_count) ?? "N/A"} | Sell: ${v(ar.sell_count) ?? "N/A"}`,
    `PT Mean: $${num(s14.analyst_pt_mean, 2)} | PT High: $${num(s14.analyst_pt_high, 2)} | PT Low: $${num(s14.analyst_pt_low, 2)}`,
    "",
    "--- NEAR-TERM CATALYSTS ---",
    nearCatalysts.length ? list(nearCatalysts) : "  No data",
    "--- MEDIUM-TERM CATALYSTS ---",
    medCatalysts.length ? list(medCatalysts) : "  No data",
    "",
    "--- KEY RISKS ---",
    risks.length ? list(risks) : "  No data",
    "",
    "--- SENTIMENT ---",
    `Score: ${num(s13.sentiment_score)}/100 | Contrarian Signal: ${str(s13.contrarian_signal)}`,
    `Short Interest: ${pct(s13.short_pct_float ?? s1.short_pct_float)} | Institutional: ${pct(s10.institutional_pct ?? s1.institutional_pct)}`,
    `News Tone: ${str(s13.news_tone)} | Analyst Upgrade Momentum: ${str(s13.upgrade_momentum)}`,
    "",
    "--- SETUP CHECKLIST ---",
    `Score: ${num(s15.overall_score)}/100 | Criteria: ${v(s15.passed_count) ?? "N/A"}/${v(s15.total_count) ?? "N/A"} passed`,
    "",
    `Report Generated: ${report.generated_at ?? "unknown"}`,
  ];

  return lines.filter(l => l !== undefined).join("\n");
}

function ResearchChatbot({ ticker, report }: { ticker: string; report: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: "user" as const, content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context: buildReportContext(ticker, report),
          ticker,
        }),
      });
      const data = await res.json() as { reply: string };
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) { scrollToBottom(); inputRef.current?.focus(); } }, [open, messages]);

  const SUGGESTIONS = [
    `What's the bull case for ${ticker}?`,
    "What are the biggest risks?",
    "Is the valuation cheap or expensive?",
    "What does the DCF imply?",
    "What is the analyst consensus?",
  ];

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div className="w-[380px] bg-[#060D1A] border border-[#1E2D4A] rounded-2xl shadow-2xl flex flex-col"
          style={{ height: 520, boxShadow: "0 0 40px rgba(45,107,255,0.15)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2D4A] shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#2D6BFF] flex items-center justify-center text-white text-[10px] font-black">
                AI
              </div>
              <div>
                <p className="text-[11px] font-bold text-white">Research AI</p>
                <p className="text-[10px] text-[#475569]">{ticker.toUpperCase()} · Haz Capital</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#475569] hover:text-white text-lg leading-none cursor-pointer">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div>
                <p className="text-[11px] text-[#475569] mb-3 leading-relaxed">
                  Ask me anything about <span className="text-[#2D6BFF] font-bold">{ticker.toUpperCase()}</span> — financials, valuation, risks, scenarios, or the investment committee recommendation.
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="w-full text-left text-[10px] text-[#64748B] border border-[#1E2D4A] rounded-lg px-3 py-2 hover:border-[#2D6BFF] hover:text-[#94A3B8] transition-all cursor-pointer">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={[
                  "max-w-[88%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed",
                  m.role === "user"
                    ? "bg-[#2D6BFF] text-white rounded-br-sm"
                    : "bg-[#0F1929] border border-[#1E2D4A] text-[#CBD5E1] rounded-bl-sm",
                ].join(" ")}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#0F1929] border border-[#1E2D4A] rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1.5 items-center">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#2D6BFF]"
                      style={{ animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 shrink-0">
            <div className="flex gap-2 bg-[#0F1929] border border-[#1E2D4A] rounded-xl px-3 py-2 focus-within:border-[#2D6BFF] transition-colors">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Ask about ${ticker.toUpperCase()}…`}
                className="flex-1 bg-transparent text-[11px] text-white placeholder-[#334155] outline-none min-w-0" />
              <button onClick={send} disabled={!input.trim() || loading}
                className="shrink-0 w-6 h-6 rounded-lg bg-[#2D6BFF] flex items-center justify-center disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-[#4B7FFF] transition-colors">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 9L9 5L1 1V4.5L6.5 5L1 5.5V9Z" fill="white"/>
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-[#1E2D4A] mt-1.5 text-center">Powered by GPT-4o · Report data only · Not investment advice</p>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button onClick={() => setOpen(o => !o)}
        className={[
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer",
          open ? "bg-[#0F1929] border-2 border-[#2D6BFF]" : "bg-[#2D6BFF] hover:bg-[#4B7FFF]",
        ].join(" ")}
        style={{ boxShadow: "0 0 20px rgba(45,107,255,0.4)" }}>
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4L14 14M14 4L4 14" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="9" cy="10" r="1" fill="white"/>
            <circle cx="12" cy="10" r="1" fill="white"/>
            <circle cx="15" cy="10" r="1" fill="white"/>
          </svg>
        )}
      </button>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}

// ─── S4 Historical Financials with Annual / QoQ toggle ───────────────────────
function ValuationThermometer({ label, range }: {
  label: string;
  range: { min: number; max: number; avg: number; current: number | null; percentile: number | null } | null;
}) {
  if (!range || range.current == null || range.max <= range.min) return null;
  const { min, max, avg, current, percentile } = range;
  const pct = Math.max(2, Math.min(98, percentile ?? Math.round((current - min) / (max - min) * 100)));
  const avgPct = Math.round((avg - min) / (max - min) * 100);
  // Color: green = cheap (low pctile), amber = fair, red = expensive (high pctile)
  const dotColor = pct <= 30 ? "#10B981" : pct >= 70 ? "#EF4444" : "#F59E0B";
  const fillColor = pct <= 30 ? "#10B981" : pct >= 70 ? "#EF4444" : "#2D6BFF";
  const label_pct = pct <= 30 ? "historically cheap" : pct >= 70 ? "historically expensive" : "near average";
  return (
    <div className="mb-5 group">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[10px] text-[#475569] font-medium uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium" style={{ color: dotColor }}>{label_pct}</span>
          <span className="text-sm font-mono font-bold text-white">
            {current.toFixed(1)}x <span className="text-[10px] text-[#475569] font-normal">({pct}th pctile)</span>
          </span>
        </div>
      </div>
      <div className="relative h-3 bg-[#0A0E1A] rounded-full border border-[#1E2D4A] overflow-visible">
        {/* Filled region */}
        <div
          className="absolute inset-y-0 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `${fillColor}22` }}
        />
        {/* Avg tick */}
        <div className="absolute inset-y-0 w-px bg-[#334155]" style={{ left: `${avgPct}%` }} />
        {/* Current dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#0B0F19] shadow-lg transition-transform duration-200 group-hover:scale-125 motion-safe:transition-transform"
          style={{ left: `calc(${pct}% - 7px)`, background: dotColor, boxShadow: `0 0 8px ${dotColor}66` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[#334155] mt-1.5">
        <span className="text-[#475569]">{min.toFixed(1)}x <span className="text-[#1E2D4A]">5Y low</span></span>
        <span className="text-[#475569]">{avg.toFixed(1)}x <span className="text-[#1E2D4A]">avg</span></span>
        <span className="text-[#475569]">{max.toFixed(1)}x <span className="text-[#1E2D4A]">5Y high</span></span>
      </div>
    </div>
  );
}

function DPSBarChart({ data }: { data: { year: string; dps: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "#475569" }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} width={44} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#0A0E1A", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11, padding: "8px 12px" }}
          labelStyle={{ color: "#94A3B8", marginBottom: 4 }}
          cursor={{ fill: "#1E2D4A44" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [`$${Number(v).toFixed(4)}`, "Annual DPS"]}
        />
        <Bar
          dataKey="dps"
          fill="#2D6BFF"
          radius={[4, 4, 0, 0]}
          animationDuration={700}
          animationEasing="ease-out"
          activeBar={{ fill: "#60A5FA" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Porter's Five Forces ────────────────────────────────────────────────────

const FORCE_META: { key: string; label: string; shortLabel: string }[] = [
  { key: "competitive_rivalry",  label: "Competitive Rivalry",     shortLabel: "Rivalry"     },
  { key: "threat_new_entrants",  label: "Threat of New Entrants",  shortLabel: "New Entrants"},
  { key: "threat_substitutes",   label: "Threat of Substitutes",   shortLabel: "Substitutes" },
  { key: "buyer_power",          label: "Bargaining Power of Buyers",  shortLabel: "Buyers"  },
  { key: "supplier_power",       label: "Bargaining Power of Suppliers", shortLabel: "Suppliers"},
];

function forceColor(score: number): string {
  if (score <= 1) return "#10B981";
  if (score <= 2) return "#34D399";
  if (score <= 3) return "#F59E0B";
  if (score <= 4) return "#F97316";
  return "#EF4444";
}

// ---------------------------------------------------------------------------
// Section C: SOTP Valuation
// ---------------------------------------------------------------------------
function SOTPSection({ s_c }: { s_c: any }) {
  const segments = (s_c.enriched_segments ?? s_c.segments ?? []) as any[];
  const hasSegments = segments.length > 0;
  const hasMults = segments.some((s: any) => s.multiple_base != null);

  const AiBadge = () => <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>;
  const CalcBadge = () => <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#0F2A50] text-[#60A5FA] border border-[#2D6BFF]/30">CALC</span>;

  const upsideColor = (pct: number | null) =>
    pct == null ? "#94A3B8" : pct >= 20 ? "#10B981" : pct >= 0 ? "#60A5FA" : "#EF4444";

  const currentPrice = fv(s_c.current_price);
  const peerEvRev    = fv(s_c.peer_median_ev_rev);
  const peerEvEbitda = fv(s_c.peer_median_ev_ebitda);
  const subjEvRev    = fv(s_c.subj_ev_rev);

  if (!hasSegments) {
    return (
      <div className="text-center py-8 text-[#64748B] text-sm">
        Segment revenue breakdown not available from FMP for this ticker.
        <div className="text-xs mt-1 text-[#475569]">SOTP analysis requires FMP product segmentation data.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Peer multiple reference row */}
      {(peerEvRev != null || subjEvRev != null || currentPrice != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {currentPrice != null && <StatCard label="Current Price" value={`$${Number(currentPrice).toFixed(2)}`} source={fs(s_c.current_price)} />}
          {subjEvRev    != null && <StatCard label="Subject EV/Rev"      value={`${Number(subjEvRev).toFixed(1)}x`}    source={fs(s_c.subj_ev_rev)} />}
          {peerEvRev    != null && <StatCard label="Peer Med. EV/Rev"    value={`${Number(peerEvRev).toFixed(1)}x`}    source={fs(s_c.peer_median_ev_rev)} />}
          {peerEvEbitda != null && <StatCard label="Peer Med. EV/EBITDA" value={`${Number(peerEvEbitda).toFixed(1)}x`} source={fs(s_c.peer_median_ev_ebitda)} />}
        </div>
      )}

      {/* Segment table */}
      <div>
        <h3 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
          Segment Revenue &amp; Assigned Multiples
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#1E3A5F]">
                <th className="pb-2 text-[#64748B] font-medium">Segment</th>
                <th className="pb-2 text-[#64748B] font-medium text-right">Revenue</th>
                <th className="pb-2 text-[#64748B] font-medium text-right">% Total</th>
                <th className="pb-2 text-[#64748B] font-medium text-right">Low x</th>
                <th className="pb-2 text-[#64748B] font-medium text-right">Base x</th>
                <th className="pb-2 text-[#64748B] font-medium text-right">High x</th>
                <th className="pb-2 text-[#64748B] font-medium text-right">Value (Base)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E3A5F]/40">
              {segments.map((seg: any, i: number) => {
                const rev   = fv(seg.revenue);
                const pct   = fv(seg.pct_of_total);
                const mBase = seg.multiple_base;
                const valBn = seg.value_base_bn;
                return (
                  <tr key={i} className="hover:bg-[#1E3A5F]/20 transition-colors">
                    <td className="py-2 text-[#CBD5E1] font-medium pr-2">{seg.name}</td>
                    <td className="py-2 text-right text-[#94A3B8]">
                      {rev != null
                        ? (rev >= 1e9 ? `$${(rev / 1e9).toFixed(1)}B` : `$${(rev / 1e6).toFixed(0)}M`)
                        : NP}
                      <span className="ml-0.5 text-[10px] text-[#2D6BFF] opacity-70">FMP</span>
                    </td>
                    <td className="py-2 text-right text-[#94A3B8]">
                      {pct != null ? `${Number(pct).toFixed(1)}%` : NP}
                    </td>
                    <td className="py-2 text-right text-[#64748B]">
                      {seg.multiple_low != null ? `${Number(seg.multiple_low).toFixed(1)}x` : NP}
                    </td>
                    <td className="py-2 text-right font-semibold text-[#60A5FA]">
                      {mBase != null ? <>{Number(mBase).toFixed(1)}x<AiBadge /></> : NP}
                    </td>
                    <td className="py-2 text-right text-[#64748B]">
                      {seg.multiple_high != null ? `${Number(seg.multiple_high).toFixed(1)}x` : NP}
                    </td>
                    <td className="py-2 text-right text-[#10B981] font-medium">
                      {valBn != null ? <>${Number(valBn).toFixed(1)}B<CalcBadge /></> : NP}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasMults && (
          <p className="mt-2 text-[10px] text-[#475569]">
            Revenues: FMP API &nbsp;|&nbsp; Multiples: <span className="text-[#FBBF24]">AI estimates</span> anchored on peer group data &nbsp;|&nbsp; Values: Python [CALCULATED]
          </p>
        )}
      </div>

      {/* Bear / Base / Bull implied equity value cards */}
      {(s_c.implied_price_base != null || s_c.implied_price_bear != null) && (
        <div>
          <h3 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
            Implied Equity Value <CalcBadge />
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {([
              { label: "Bear", color: "#EF4444", ev: s_c.total_ev_bear_bn, eq: s_c.equity_value_bear_bn, ip: s_c.implied_price_bear, up: s_c.upside_pct_bear },
              { label: "Base", color: "#2D6BFF", ev: s_c.total_ev_base_bn, eq: s_c.equity_value_base_bn, ip: s_c.implied_price_base, up: s_c.upside_pct_base },
              { label: "Bull", color: "#10B981", ev: s_c.total_ev_bull_bn, eq: s_c.equity_value_bull_bn, ip: s_c.implied_price_bull, up: s_c.upside_pct_bull },
            ] as { label: string; color: string; ev: number | null; eq: number | null; ip: number | null; up: number | null }[]).map(({ label, color, ev, eq, ip, up }) => (
              <div key={label} className="bg-[#0B1628] rounded-xl p-4 border border-[#1E3A5F]/60">
                <div className="text-xs font-semibold mb-3" style={{ color }}>{label} Case</div>
                <div className="space-y-2">
                  {ev != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-[#64748B]">Total EV</span>
                      <span className="text-xs text-[#CBD5E1]">${Number(ev).toFixed(1)}B</span>
                    </div>
                  )}
                  {s_c.net_debt_bn != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-[#64748B]">Less: Net Debt</span>
                      <span className="text-xs text-[#94A3B8]">${Number(s_c.net_debt_bn).toFixed(1)}B</span>
                    </div>
                  )}
                  {eq != null && (
                    <div className="flex justify-between items-baseline border-t border-[#1E3A5F]/40 pt-2">
                      <span className="text-[10px] text-[#64748B]">Equity Value</span>
                      <span className="text-xs font-semibold text-[#CBD5E1]">${Number(eq).toFixed(1)}B</span>
                    </div>
                  )}
                  {ip != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-[#64748B]">Implied Price</span>
                      <span className="text-xs font-bold" style={{ color }}>${Number(ip).toFixed(2)}</span>
                    </div>
                  )}
                  {up != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-[#64748B]">vs Current</span>
                      <span className="text-xs font-bold" style={{ color: upsideColor(up) }}>
                        {up > 0 ? "+" : ""}{Number(up).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Multiple rationale from AI */}
      {hasMults && segments.some((s: any) => s.rationale) && (
        <div>
          <h3 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">Multiple Rationale <AiBadge /></h3>
          <div className="space-y-1.5">
            {segments.filter((s: any) => s.rationale).map((seg: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-[#D97706] shrink-0 font-medium">{seg.name}:</span>
                <span className="text-[#94A3B8]">{seg.rationale}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology note */}
      {s_c.ai_methodology && (
        <div className="bg-[#0B1628] rounded-xl p-4 border border-[#D97706]/20">
          <div className="text-[10px] text-[#D97706] font-semibold mb-1">Methodology Note <AiBadge /></div>
          <p className="text-xs text-[#94A3B8] leading-relaxed">{s_c.ai_methodology}</p>
        </div>
      )}

      {s_c.ai_source && (
        <p className="text-[10px] text-[#475569]">{s_c.ai_source}</p>
      )}
    </div>
  );
}

function PorterFiveForcesSection({ s_porter }: { s_porter: any }) {
  const forces         = (s_porter.ai_forces ?? {}) as any;
  const attractiveness = forces.overall_attractiveness as string | undefined;
  const narrative      = forces.sector_narrative as string | null | undefined;
  const aiSource       = s_porter.ai_source as string | null;

  const clampScore = (v: any) => v != null ? Math.min(5, Math.max(1, Number(v))) : null;
  const forceEntries = FORCE_META.map(m => ({
    ...m,
    score:     clampScore(forces[m.key]?.score),
    rationale: forces[m.key]?.rationale ?? null,
  }));

  const hasData = forceEntries.some(f => f.score !== null);

  if (!hasData) {
    return (
      <p className="text-xs text-[#475569]">
        Porter&apos;s Five Forces requires pipeline data. Re-run to populate this section.
      </p>
    );
  }

  // Radar chart data — higher score = bigger polygon = higher threat; clamp AI output to [1,5]
  const radarData = FORCE_META.map(m => ({
    subject:  m.shortLabel,
    score:    Math.min(5, Math.max(1, Number(forces[m.key]?.score ?? 3))),
    fullMark: 5,
  }));

  const avgScore   = forceEntries.reduce((sum, f) => sum + (f.score ?? 3), 0) / forceEntries.length;
  const attrColor  = attractiveness === "High" ? "#10B981" : attractiveness === "Medium" ? "#F59E0B" : "#EF4444";

  return (
    <div className="space-y-5">
      <p className="text-[10px] text-[#475569]">
        Score 1 (low threat, favourable) → 5 (high threat, unfavourable). AI-assessed from industry and competitive search data.
      </p>

      {/* Radar + attractiveness */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-full sm:w-56 shrink-0">
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
              <PolarGrid stroke="#1E2D4A" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }}
              />
              <Radar
                dataKey="score"
                stroke="#F97316"
                fill="#F97316"
                fillOpacity={0.25}
                strokeWidth={1.5}
              />
              <Tooltip
                contentStyle={{ background: "#0D1626", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "#94A3B8" }}
                formatter={(v: any) => [`${v} / 5`, "Threat score"]}
              />
            </RadarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-[#334155] text-center -mt-1">Threat level (outer = higher threat)</p>
        </div>

        <div className="flex-1 space-y-3">
          {attractiveness && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#475569]">Industry Attractiveness</span>
              <span className="text-sm font-bold px-3 py-1 rounded-lg border"
                style={{ color: attrColor, borderColor: `${attrColor}40`, background: `${attrColor}12` }}>
                {attractiveness}
              </span>
              <span className="text-[10px] px-1.5 py-px rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 font-bold">AI</span>
            </div>
          )}
          <div className="text-[10px] text-[#475569] flex items-center gap-1.5">
            Avg threat score:
            <span className="font-bold font-mono" style={{ color: forceColor(avgScore) }}>
              {avgScore.toFixed(1)}/5
            </span>
          </div>
          {narrative && (
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">{narrative}</p>
          )}
        </div>
      </div>

      {/* Force breakdown cards */}
      <div className="space-y-2">
        {forceEntries.map(({ label, score, rationale }) => {
          if (score === null) return null;
          const c = forceColor(score);
          return (
            <div key={label} className="flex items-start gap-3 bg-[#080C14] border border-[#1E2D4A] rounded-xl px-4 py-3 motion-safe:hover:border-[#334155] transition-colors">
              {/* Score pill */}
              <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold font-mono border"
                style={{ color: c, borderColor: `${c}40`, background: `${c}12` }}>
                {score}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-semibold text-[#E2E8F0]">{label}</span>
                  {/* Mini bar */}
                  <div className="flex-1 h-1 bg-[#1E2D4A] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(score / 5) * 100}%`, background: c }} />
                  </div>
                </div>
                {rationale && (
                  <p className="text-[10px] text-[#94A3B8] leading-snug">{rationale}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {aiSource && <p className="text-[10px] text-[#334155]">{aiSource}</p>}
    </div>
  );
}

// ─── M&A Track Record ────────────────────────────────────────────────────────

const MA_TYPE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Acquisition:          { color: "#60A5FA", bg: "#2D6BFF14", border: "#2D6BFF40" },
  Divestiture:          { color: "#F97316", bg: "#F9731614", border: "#F9731640" },
  Merger:               { color: "#A78BFA", bg: "#A78BFA14", border: "#A78BFA40" },
  "Strategic Partnership": { color: "#34D399", bg: "#34D39914", border: "#34D39940" },
  "Spin-off":           { color: "#F59E0B", bg: "#F59E0B14", border: "#F59E0B40" },
  "Joint Venture":      { color: "#E879F9", bg: "#E879F914", border: "#E879F940" },
};

const MA_STATUS_STYLE: Record<string, { color: string }> = {
  Completed: { color: "#10B981" },
  Pending:   { color: "#F59E0B" },
  Cancelled: { color: "#EF4444" },
  Rumoured:  { color: "#94A3B8" },
};

function MaTrackRecordSection({ s_ma }: { s_ma: any }) {
  const events     = (s_ma.ai_events ?? []) as {
    year?: number; type?: string; target?: string; deal_value?: string | null; status?: string;
  }[];
  const narrative   = s_ma.ai_narrative as string | null;
  const aiSource    = s_ma.ai_source as string | null;
  const ma8k        = (s_ma.ma_8k_filings ?? []) as { date: string; items: string; url: string }[];
  const maNews      = (s_ma.ma_news_headlines ?? []) as { headline: string; date: string; url: string }[];

  const hasContent = events.length > 0 || narrative || ma8k.length > 0 || maNews.length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs text-[#475569]">
        No M&A activity identified in available sources. Re-run the pipeline for an updated search.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* AI-extracted event timeline */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Deal History</span>
            <span className="text-[10px] px-1.5 py-px rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 font-bold">AI</span>
          </div>
          <div className="space-y-2">
            {events.map((ev, i) => {
              const typeStyle = MA_TYPE_STYLE[ev.type ?? ""] ?? { color: "#94A3B8", bg: "#94A3B814", border: "#94A3B840" };
              const statusStyle = MA_STATUS_STYLE[ev.status ?? ""] ?? { color: "#94A3B8" };
              return (
                <div key={i} className="flex items-start gap-3 bg-[#080C14] border border-[#1E2D4A] rounded-xl p-3 motion-safe:hover:border-[#8B5CF6]/30 transition-colors">
                  {/* Year pill */}
                  <div className="shrink-0 text-center">
                    <span className="text-[11px] font-bold font-mono text-[#8B5CF6]">
                      {ev.year ?? "—"}
                    </span>
                  </div>
                  {/* Divider */}
                  <div className="w-px self-stretch bg-[#1E2D4A] shrink-0" />
                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {ev.type && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border"
                          style={{ color: typeStyle.color, background: typeStyle.bg, borderColor: typeStyle.border }}>
                          {ev.type}
                        </span>
                      )}
                      {ev.status && (
                        <span className="text-[10px] font-medium" style={{ color: statusStyle.color }}>
                          {ev.status}
                        </span>
                      )}
                      {ev.deal_value && (
                        <span className="text-[10px] font-mono text-[#60A5FA]">{ev.deal_value}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#E2E8F0] leading-snug">{ev.target ?? "—"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Narrative */}
      {narrative && (
        <div className="bg-[#8B5CF6]/05 border border-[#8B5CF6]/20 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] px-1.5 py-px rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 font-bold">AI</span>
            <span className="text-[10px] text-[#475569]">M&A Strategy Assessment</span>
          </div>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">{narrative}</p>
          {aiSource && <p className="text-[10px] text-[#334155] pt-1">{aiSource}</p>}
        </div>
      )}

      {/* Recent M&A SEC 8-K filings */}
      {ma8k.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide block mb-2">
            Recent M&A-Related SEC 8-K Filings
          </span>
          <div className="space-y-1.5">
            {ma8k.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-[10px]">
                <span className="font-mono text-[#475569] shrink-0">{f.date}</span>
                <span className="text-[#334155] shrink-0">Items: {f.items}</span>
                <a href={f.url} target="_blank" rel="noreferrer"
                  className="text-[#60A5FA] hover:text-white truncate transition-colors">
                  SEC EDGAR →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent M&A news headlines from Finnhub */}
      {maNews.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide block mb-2">
            Recent M&A News (Finnhub · 30 days)
          </span>
          <div className="space-y-1.5">
            {maNews.map((n, i) => (
              <div key={i} className="flex items-start gap-3 text-[10px]">
                <span className="font-mono text-[#475569] shrink-0">
                  {n.date ? new Date(typeof n.date === "number" ? n.date * 1000 : n.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </span>
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noreferrer"
                    className="text-[#94A3B8] hover:text-white transition-colors leading-snug">
                    {n.headline}
                  </a>
                ) : (
                  <span className="text-[#94A3B8] leading-snug">{n.headline}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ESG & Sustainability ─────────────────────────────────────────────────────

function esgRiskBand(score: number | null): { label: string; color: string } {
  if (score === null) return { label: "No data", color: "#475569" };
  if (score < 10)    return { label: "Negligible Risk", color: "#10B981" };
  if (score < 20)    return { label: "Low Risk",        color: "#34D399" };
  if (score < 30)    return { label: "Medium Risk",     color: "#F59E0B" };
  if (score < 40)    return { label: "High Risk",       color: "#F97316" };
  return               { label: "Severe Risk",          color: "#EF4444" };
}

function esgPerfLabel(raw: string | null | undefined): string {
  const map: Record<string, string> = {
    STRONG_PERFORMER:    "Strong Performer",
    ABOVE_AVG_PERFORMER: "Above Average",
    AVG_PERFORMER:       "Average",
    BELOW_AVG_PERFORMER: "Below Average",
    WEAK_PERFORMER:      "Weak Performer",
  };
  return raw ? (map[raw] ?? raw) : "—";
}

function controversyLabel(level: number | null): { text: string; color: string } {
  if (level === null) return { text: "—", color: "#475569" };
  const levels = ["None", "Low", "Moderate", "Significant", "High", "Severe"];
  const colors  = ["#10B981", "#34D399", "#F59E0B", "#F97316", "#EF4444", "#DC2626"];
  return { text: levels[level] ?? `Level ${level}`, color: colors[level] ?? "#475569" };
}

function ESGSection({ s_esg }: { s_esg: any }) {
  const totalScore    = fv(s_esg.total_esg_score);
  const envScore      = fv(s_esg.environment_score);
  const socialScore   = fv(s_esg.social_score);
  const govScore      = fv(s_esg.governance_score);
  const controversy   = fv(s_esg.highest_controversy);
  const performance   = fv(s_esg.esg_performance);
  const ratingPeriod  = fv(s_esg.rating_period);
  const msciRating    = s_esg.ai_msci_rating as string | null;
  const initiatives   = (s_esg.ai_initiatives ?? []) as { name: string; description: string }[];
  const narrative     = s_esg.ai_narrative as string | null;
  const aiSource      = s_esg.ai_source as string | null;

  const hasScores = totalScore != null || envScore != null || socialScore != null || govScore != null;

  if (!hasScores && !narrative && initiatives.length === 0) {
    return (
      <p className="text-xs text-[#475569]">
        ESG data requires pipeline data. Sustainalytics scores are sourced from yfinance — some tickers may not have coverage.
      </p>
    );
  }

  const scoreCards = [
    { label: "Total ESG Risk", value: totalScore,   accent: "#60A5FA", desc: "Overall risk score" },
    { label: "Environmental",  value: envScore,     accent: "#34D399", desc: "E pillar" },
    { label: "Social",         value: socialScore,  accent: "#A78BFA", desc: "S pillar" },
    { label: "Governance",     value: govScore,     accent: "#F59E0B", desc: "G pillar" },
  ];

  const band = esgRiskBand(totalScore != null ? Number(totalScore) : null);
  const ctv  = controversyLabel(controversy != null ? Number(controversy) : null);

  return (
    <div className="space-y-5">
      {/* Note: Sustainalytics risk score — lower is better */}
      <p className="text-[10px] text-[#475569]">
        Sustainalytics ESG risk score (via yfinance) — lower score = less ESG risk exposure.
        Ranges: 0–10 Negligible · 10–20 Low · 20–30 Medium · 30–40 High · 40+ Severe.
      </p>

      {/* Score cards */}
      {hasScores && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {scoreCards.map(({ label, value, accent, desc }) => {
            const num   = value != null ? Number(value) : null;
            const b     = esgRiskBand(num);
            return (
              <div key={label} className="bg-[#080C14] border border-[#1E2D4A] rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[10px] font-medium" style={{ color: accent }}>{label}</span>
                <span className="text-2xl font-bold font-mono text-white">
                  {num != null ? num.toFixed(1) : NP}
                </span>
                {num != null && (
                  <span className="text-[10px] font-semibold" style={{ color: b.color }}>{b.label}</span>
                )}
                <span className="text-[10px] text-[#334155] mt-auto">Sustainalytics · {desc}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-2 items-center">
        {performance && (
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border"
            style={{ color: band.color, borderColor: `${band.color}40`, background: `${band.color}12` }}>
            {esgPerfLabel(performance)}
          </span>
        )}
        {controversy != null && (
          <span className="text-[10px] px-2.5 py-1 rounded-lg border"
            style={{ color: ctv.color, borderColor: `${ctv.color}40`, background: `${ctv.color}12` }}>
            Controversy: {ctv.text}
          </span>
        )}
        {ratingPeriod && (
          <span className="text-[10px] px-2.5 py-1 rounded-lg border border-[#1E2D4A] text-[#475569] bg-[#080C14]">
            Rated: {ratingPeriod}
          </span>
        )}
        {msciRating && (
          <span className="text-[10px] px-2.5 py-1 rounded-lg border border-[#2D6BFF]/40 text-[#60A5FA] bg-[#2D6BFF]/10 flex items-center gap-1">
            <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-1 py-px rounded">AI</span>
            MSCI: {msciRating}
          </span>
        )}
      </div>

      {/* AI Initiatives */}
      {initiatives.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-[#60A5FA] uppercase tracking-wide">Key Initiatives</span>
            <span className="text-[10px] px-1.5 py-px rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 font-bold">AI</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {initiatives.map((init, i) => (
              <div key={i} className="bg-[#080C14] border border-[#1E2D4A] rounded-xl p-3 space-y-1 motion-safe:hover:border-[#2D6BFF]/40 transition-colors">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-[#60A5FA] mt-px shrink-0">{i + 1}</span>
                  <span className="text-[11px] font-semibold text-[#E2E8F0]">{init.name}</span>
                </div>
                <p className="text-[10px] text-[#94A3B8] leading-relaxed pl-4">{init.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Narrative */}
      {narrative && (
        <div className="bg-[#2D6BFF]/05 border border-[#2D6BFF]/20 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] px-1.5 py-px rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 font-bold">AI</span>
            <span className="text-[10px] text-[#475569]">ESG Assessment</span>
          </div>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">{narrative}</p>
          {aiSource && <p className="text-[10px] text-[#334155] pt-1">{aiSource}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Management & Governance ─────────────────────────────────────────────────

function ManagementGovernanceSection({ s10b }: { s10b: any }) {
  const ceoName         = fv(s10b.ceo_name) as string | null;
  const ceoProfile      = s10b.ai_ceo_profile as string | null;
  const tenureNote      = s10b.ai_tenure_note as string | null;
  const leadership      = s10b.ai_leadership_style as string | null;
  const board           = (s10b.ai_board_assessment ?? {}) as { total_members?: number | null; independent_pct?: number | null; governance_flag?: string };
  const executives      = (s10b.executives ?? []) as any[];
  const employees       = fv(s10b.employees);
  const aiSource        = s10b.ai_source as string | null;

  const govFlag: string  = board.governance_flag ?? "No red flags identified";
  const isFlag           = govFlag.toLowerCase().startsWith("flag:");
  const hasBoardData     = board.total_members != null || board.independent_pct != null;

  if (!ceoName && executives.length === 0 && !ceoProfile) {
    return (
      <div className="flex items-start gap-3 p-5 rounded-2xl border-l-4 border-[#2D6BFF] bg-[#0F1629]">
        <svg className="w-5 h-5 text-[#2D6BFF] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-[#475569]">Management data requires pipeline data. Re-run the pipeline to populate this section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── CEO card ───────────────────────────────────────────────────────── */}
      {(ceoName || ceoProfile) && (
        <div className="rounded-2xl border border-[#1E2D4A] bg-[#0F1629] overflow-hidden">
          {/* Left accent strip header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1E2D4A] bg-[#0A0E1A]">
            <div className="w-1 self-stretch rounded-full bg-[#2D6BFF]" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white">{ceoName ?? "CEO"}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2D6BFF]/15 border border-[#2D6BFF]/30 text-[#60A5FA] font-medium">
                  Chief Executive Officer
                </span>
                {tenureNote && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1E2D4A] border border-[#334155] text-[#93C5FD] font-medium">
                    {tenureNote}
                  </span>
                )}
              </div>
              {employees != null && (
                <p className="text-[10px] text-[#475569] mt-0.5">
                  {Number(employees).toLocaleString()} employees
                </p>
              )}
            </div>
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-medium">AI</span>
          </div>

          {/* Bio body */}
          <div className="px-5 py-4 space-y-3">
            {ceoProfile && (
              <p className="text-xs text-[#93C5FD]/80 leading-relaxed">{ceoProfile}</p>
            )}
            {leadership && (
              <div className="flex items-start gap-2 rounded-xl border border-[#2D6BFF]/20 bg-[#2D6BFF]/6 px-3 py-2.5">
                <svg className="w-3.5 h-3.5 text-[#60A5FA] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-[10px] text-[#60A5FA] leading-relaxed">{leadership}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Board governance row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#1E2D4A] bg-[#0F1629] px-4 py-3 text-center">
          <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Board Size</p>
          <p className="text-lg font-bold text-white font-mono">
            {board.total_members != null ? board.total_members : "—"}
          </p>
          <p className="text-[10px] text-[#334155] mt-0.5">
            {hasBoardData ? "Tavily [AI EXTRACTED]" : "Data not found"}
          </p>
        </div>
        <div className="rounded-xl border border-[#1E2D4A] bg-[#0F1629] px-4 py-3 text-center">
          <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Independent</p>
          <p className="text-lg font-bold font-mono" style={{ color: board.independent_pct != null && board.independent_pct >= 50 ? "#22C55E" : "#F59E0B" }}>
            {board.independent_pct != null ? `${board.independent_pct}%` : "—"}
          </p>
          <p className="text-[10px] text-[#334155] mt-0.5">
            {hasBoardData ? "Tavily [AI EXTRACTED]" : "Data not found"}
          </p>
        </div>
        <div className="rounded-xl border border-[#1E2D4A] bg-[#0F1629] px-4 py-3 text-center flex flex-col items-center justify-center">
          <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-2">Governance</p>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full ${
            isFlag
              ? "bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#FCD34D]"
              : "bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#4ADE80]"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isFlag ? "bg-[#F59E0B]" : "bg-[#22C55E]"}`} />
            {isFlag ? govFlag.replace("Flag: ", "") : "No red flags"}
          </span>
          <p className="text-[10px] text-[#334155] mt-1.5">AI assessment</p>
        </div>
      </div>

      {/* ── Key executives table ────────────────────────────────────────────── */}
      {executives.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Key Executives — FMP</p>
          <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#080C14]">
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-[#475569] uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-[#475569] uppercase tracking-wider">Title</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-bold text-[#475569] uppercase tracking-wider">Compensation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D4A]">
                {executives.slice(0, 8).map((exec: any, i: number) => {
                  const pay = fv(exec.pay);
                  return (
                    <tr
                      key={i}
                      className="transition-colors duration-150 hover:bg-[#1E2D4A]/20 cursor-default"
                    >
                      <td className="px-4 py-2.5 font-medium text-white">{exec.name || "—"}</td>
                      <td className="px-4 py-2.5 text-[#93C5FD]/70">{exec.title || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#60A5FA]">
                        {pay != null
                          ? `$${Number(pay).toLocaleString()}`
                          : <span className="text-[#334155]">Not disclosed</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Source attribution */}
      {aiSource && (
        <p className="text-[10px] text-[#334155]">
          AI narrative: <span className="text-indigo-400/70">{aiSource}</span>
          {" · "}Executive data: FMP /v3/key-executives
        </p>
      )}
    </div>
  );
}

// ─── Category config for Revenue Driver cards ─────────────────────────────────
const DRIVER_CATEGORY: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pricing:    { label: "Pricing",      color: "#60A5FA", bg: "#2D6BFF1A", border: "#2D6BFF40" },
  volume:     { label: "Volume",       color: "#818CF8", bg: "#6366F11A", border: "#6366F140" },
  geographic: { label: "Geographic",   color: "#34D399", bg: "#10B9811A", border: "#10B98140" },
  product:    { label: "Product",      color: "#A78BFA", bg: "#8B5CF61A", border: "#8B5CF640" },
  m_and_a:    { label: "M&A",          color: "#FCD34D", bg: "#F59E0B1A", border: "#F59E0B40" },
  efficiency: { label: "Efficiency",   color: "#6EE7B7", bg: "#10B9811A", border: "#10B98140" },
  regulatory: { label: "Regulatory",   color: "#94A3B8", bg: "#4758691A", border: "#47586940" },
};

function RevenueGrowthDriversSection({ s4b }: { s4b: any }) {
  const drivers: any[] = s4b.drivers ?? [];
  const aiSource: string = s4b.ai_source ?? "";
  const revenueGrowth = fv(s4b.recent_revenue_growth_pct);

  if (!drivers || drivers.length === 0) {
    return (
      <div className="flex items-start gap-3 p-5 rounded-2xl border-l-4 border-[#2D6BFF] bg-[#0F1629]">
        <svg className="w-5 h-5 text-[#2D6BFF] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-[#475569]">
          Revenue growth driver analysis requires pipeline data. Re-run the pipeline to populate this section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary row */}
      {revenueGrowth != null && (
        <div className="flex items-center gap-3 text-xs text-[#475569]">
          <span>Most recent annual revenue growth:</span>
          <span
            className={`font-semibold text-sm ${Number(revenueGrowth) >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}
          >
            {Number(revenueGrowth) >= 0 ? "+" : ""}
            {Number(revenueGrowth).toFixed(1)}%
          </span>
          <span className="text-[#1E2D4A]">•</span>
          <span className="text-[#334155]">FMP/yfinance [CALCULATED]</span>
        </div>
      )}

      {/* Driver cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {drivers.map((d: any, i: number) => {
          const cat = DRIVER_CATEGORY[d.category] ?? DRIVER_CATEGORY["pricing"];
          return (
            <div
              key={i}
              className="relative flex flex-col gap-3 rounded-2xl border p-5 transition-all duration-200 motion-safe:hover:scale-[1.015] cursor-default group"
              style={{
                background: "#0F1629",
                borderColor: "#1E2D4A",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = cat.border.replace("40", "80");
                (e.currentTarget as HTMLElement).style.background = cat.bg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#1E2D4A";
                (e.currentTarget as HTMLElement).style.background = "#0F1629";
              }}
            >
              {/* Number + AI badge row */}
              <div className="flex items-center justify-between">
                <div
                  className="w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm"
                  style={{ background: cat.bg, border: `1px solid ${cat.border}`, color: cat.color }}
                >
                  {i + 1}
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                  AI
                </span>
              </div>

              {/* Driver name */}
              <p className="text-sm font-semibold text-white leading-snug">{d.name}</p>

              {/* Mechanism */}
              <p className="text-xs text-[#93C5FD]/75 leading-relaxed flex-1">{d.mechanism}</p>

              {/* Evidence callout */}
              {d.evidence && (
                <div className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/8 px-3 py-2">
                  <svg className="w-3 h-3 text-[#FCD34D] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#FCD34D] font-medium leading-relaxed">{d.evidence}</p>
                    {d.evidence_source && (
                      <p className="text-[10px] text-[#78716C] mt-0.5 truncate">
                        {(() => {
                          try { return new URL(d.evidence_source).hostname; }
                          catch { return d.evidence_source; }
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Category badge */}
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[10px] font-medium px-2.5 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}
                >
                  {cat.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Source attribution */}
      {aiSource && (
        <p className="text-[10px] text-[#334155]">
          Source: Tavily earnings call + analyst search →{" "}
          <span className="text-indigo-400/70">{aiSource}</span>
        </p>
      )}
    </div>
  );
}

function HistoricalFinancialsSection({ s4 }: { s4: any }) {
  const [view, setView] = useState<"annual" | "quarterly">("annual");

  const annual    = (s4.years ?? s4.historical ?? s4.income_statement ?? []) as any[];
  const quarterly = s4.quarters ?? s4.quarterly ?? [];
  const historical = view === "annual" ? annual : quarterly;
  const earnings   = s4.earnings_surprises ?? s4.earnings_history ?? [];
  const hasQoQ     = quarterly.length > 0;
  const coverageNote: string | null = s4.data_coverage_note ?? null;

  const periodLabel = view === "annual" ? "Annual" : "Quarterly";
  const growthLabel = view === "annual" ? "YoY%" : "QoQ%";
  const yearLabel   = view === "annual" ? "Year" : "Quarter";

  return (
    <>
      {/* View toggle + coverage badge */}
      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          {(["annual", "quarterly"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              disabled={v === "quarterly" && !hasQoQ}
              className={[
                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all duration-150",
                view === v
                  ? "bg-[#2D6BFF] text-white"
                  : "bg-[#0F1929] text-[#475569] border border-[#1E2D4A] hover:border-[#2D6BFF] hover:text-[#94A3B8]",
                v === "quarterly" && !hasQoQ ? "opacity-30 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}>
              {v === "annual" ? "Annual" : "Quarterly"}
              {v === "quarterly" && !hasQoQ && <span className="ml-1 opacity-60">— N/A</span>}
            </button>
          ))}
        </div>
        {coverageNote && (
          <span className="text-[10px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-full px-3 py-1">
            {coverageNote}
          </span>
        )}
      </div>

      <RevenueBarChart years={historical} viewLabel={periodLabel} />
      <MarginChart years={historical} />

      {historical.length > 0 ? (
        <div className="overflow-x-auto mb-6 rounded-xl border border-[#1E2D4A]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E2D4A] bg-[#080C14]">
                {[yearLabel, "Revenue", growthLabel, "Gross Mgn", "EBITDA Mgn", "Net Mgn", "EPS", "BVPS", "CFPS", "FCF"].map((h) => (
                  <th key={h} className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider text-right first:text-left py-2.5 px-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historical.map((row: any, i: number) => {
                const yoy = fv(row.revenue_yoy);
                const isMostRecent = i === 0;
                return (
                  <tr
                    key={i}
                    className={[
                      "border-b border-[#1E2D4A]/40 last:border-0 transition-colors duration-150",
                      isMostRecent ? "bg-[#1E2D4A]/20 hover:bg-[#1E2D4A]/35" : "hover:bg-[#1E2D4A]/15",
                    ].join(" ")}
                  >
                    <td className={`py-2.5 px-3 font-mono font-bold ${isMostRecent ? "text-white" : "text-[#94A3B8]"}`}>
                      {row.label ?? fv(row.year)}
                      {isMostRecent && <span className="ml-2 text-[10px] text-[#2D6BFF] font-normal uppercase tracking-wide">latest</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-[#94A3B8]">{fmtBn(row.revenue)}</td>
                    <td className={`py-2.5 px-3 font-mono text-right font-medium ${yoy == null ? "text-[#334155]" : Number(yoy) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                      {yoy == null ? "—" : `${Number(yoy) >= 0 ? "+" : ""}${Number(yoy).toFixed(1)}%`}
                    </td>
                    <td className={`py-2.5 px-3 font-mono text-right ${Number(fv(row.gross_margin)) > 0 ? "text-[#94A3B8]" : "text-[#334155]"}`}>
                      {fmtPct(row.gross_margin)}</td>
                    <td className={`py-2.5 px-3 font-mono text-right ${Number(fv(row.ebitda_margin)) > 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                      {fmtPct(row.ebitda_margin)}</td>
                    <td className={`py-2.5 px-3 font-mono text-right font-medium ${Number(fv(row.net_margin)) > 0 ? "text-[#10B981]" : Number(fv(row.net_margin)) < 0 ? "text-[#EF4444]" : "text-[#334155]"}`}>
                      {fmtPct(row.net_margin)}</td>
                    <td className="py-2.5 px-3 font-mono text-right text-[#94A3B8]">{fmt$(row.eps_diluted ?? row.eps)}</td>
                    <td className="py-2.5 px-3 font-mono text-right text-[#94A3B8]">{fmt$(row.bvps)}</td>
                    <td className="py-2.5 px-3 font-mono text-right text-[#94A3B8]">{fmt$(row.cfps)}</td>
                    <td className={`py-2.5 px-3 font-mono text-right ${Number(fv(row.fcf)) >= 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                      {fmtBn(row.fcf)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] mb-6">
          <div className="w-1 self-stretch bg-[#334155] rounded-full" />
          <p className="text-xs text-[#475569]">
            {view === "quarterly"
              ? "Quarterly breakdowns are not available for this ticker."
              : "Historical financial data is not available — the company may be recently listed or data is outside free-tier API coverage."}
          </p>
        </div>
      )}

      {/* Dividend History */}
      {(() => {
        const divHistory: { year: string; dps: number; source: string }[] = s4.dividend_history ?? [];
        const isPaying: boolean = s4.is_dividend_paying ?? divHistory.some((d) => d.dps > 0);
        return (
          <div className="mb-6">
            <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Dividend History</p>
            {isPaying && divHistory.length > 0 ? (
              <>
                <DPSBarChart data={divHistory} />
                <table className="w-full text-xs mt-3">
                  <thead>
                    <tr className="border-b border-[#1E2D4A]">
                      {["Year", "DPS"].map((h) => (
                        <th key={h} className="text-[10px] font-medium text-[#475569] text-right first:text-left pb-2 px-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {divHistory.map((d, i) => (
                      <tr key={i} className="border-b border-[#1E2D4A]/50">
                        <td className="py-1 px-2 font-mono text-[#94A3B8]">{d.year}</td>
                        <td className="py-1 px-2 font-mono text-right text-[#94A3B8]">${d.dps.toFixed(4)} <span className="text-[10px] text-[#334155]">[{d.source}]</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-xs text-[#475569]">[Non-dividend paying stock]</p>
            )}
          </div>
        );
      })()}

      {earnings.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Earnings Surprise History</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E2D4A]">
                {["Quarter", "Est. EPS", "Act. EPS", "Surprise%"].map((h) => (
                  <th key={h} className="text-[10px] font-medium text-[#475569] text-right first:text-left pb-2 px-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(earnings as any[]).slice(0, 4).map((row: any, i: number) => {
                const surp = Number(fv(row.surprise_pct ?? row.surprise));
                return (
                  <tr key={i} className="border-b border-[#1E2D4A]/50">
                    <td className="py-2 px-2 font-mono text-[#94A3B8]">{fv(row.quarter ?? row.period)}</td>
                    <td className="py-2 px-2 font-mono text-right text-[#475569]">{fmt$(row.estimate ?? row.eps_estimate)}</td>
                    <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">{fmt$(row.actual ?? row.eps_actual)}</td>
                    <td className={`py-2 px-2 font-mono text-right font-bold ${surp >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                      {isNaN(surp) ? "—" : `${surp >= 0 ? "+" : ""}${surp.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen({ ticker }: { ticker: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx((prev) => Math.min(prev + 1, PIPELINE_STEPS.length - 1));
    }, 3500);
    const elapsedTimer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { clearInterval(stepTimer); clearInterval(elapsedTimer); };
  }, []);

  const progress = Math.round((stepIdx / (PIPELINE_STEPS.length - 1)) * 100);
  const remaining = Math.max(0, Math.round((PIPELINE_STEPS.length - 1 - stepIdx) * 3.5) - elapsed % 4);

  return (
    <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-block text-5xl font-bold font-mono text-white tracking-widest mb-3
            border border-[#1E2D4A] bg-[#131929] rounded-2xl px-6 py-3">
            {ticker}
          </div>
          <p className="text-[#2D6BFF] font-medium text-sm mt-2">Running Research Pipeline</p>
          <p className="text-[#475569] text-xs mt-1">{elapsed}s elapsed &middot; ~{remaining}s remaining</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-1.5 bg-[#1E2D4A] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #2D6BFF, #10B981)" }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-[#475569]">{progress}% complete</span>
            <span className="text-[10px] text-[#475569]">{stepIdx + 1}/{PIPELINE_STEPS.length}</span>
          </div>
        </div>

        {/* Steps list */}
        <div className="bg-[#131929] border border-[#1E2D4A] rounded-xl p-4 space-y-1.5">
          {PIPELINE_STEPS.map((step, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div key={i} className={`flex items-center gap-3 py-1 ${i > stepIdx + 2 ? "opacity-20" : ""}`}>
                <span className={`text-[10px] w-4 text-center shrink-0
                  ${done ? "text-[#10B981]" : active ? "text-[#2D6BFF]" : "text-[#1E2D4A]"}`}>
                  {done ? "+" : active ? ">" : "o"}
                </span>
                <span className={`text-xs ${done ? "text-[#475569] line-through" : active ? "text-white" : "text-[#1E2D4A]"}`}>
                  {step}
                </span>
                {active && (
                  <span className="ml-auto flex gap-0.5">
                    {[0, 1, 2].map((j) => (
                      <span key={j} className="w-1 h-1 rounded-full bg-[#2D6BFF] animate-pulse"
                        style={{ animationDelay: `${j * 150}ms` }} />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-[#1E2D4A] text-[10px] mt-4">
          This page will update automatically when complete
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdhocTickerPage() {
  const { ticker: rawTicker } = useParams() as { ticker: string };
  const ticker = rawTicker.toUpperCase();
  const router = useRouter();

  const [report, setReport] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("s1");
  const [livePeers, setLivePeers] = useState<any[]>([]);
  const [tavilyBannerDismissed, setTavilyBannerDismissed] = useState(false);
  const [anthropicBannerDismissed, setAnthropicBannerDismissed] = useState(false);
  const [brandMode, setBrandMode] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Trigger pipeline on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Try GET first (serves cached report — works on Vercel and locally)
    // Fall back to POST only if no cached report exists (local dev with Python)
    fetch(`/api/adhoc/${ticker}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        // No cached report — try to generate (requires local Python)
        const post = await fetch(`/api/adhoc/${ticker}`, { method: "POST" });
        if (!post.ok) {
          const d = await post.json();
          return Promise.reject(d.error ?? "Pipeline failed — ensure Python and API keys are configured locally");
        }
        return post.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setReport(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticker]);

  // Fetch live comparables (always up-to-date peer list, overrides stale JSON peers)
  useEffect(() => {
    if (!ticker) return;
    fetch(`/api/comparables/${ticker}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.comparables) && data.comparables.length > 1) {
          setLivePeers(data.comparables);
        }
      })
      .catch(() => {});
  }, [ticker]);

  // IntersectionObserver for active section highlight
  const sectionRefs = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    document.querySelectorAll("[data-section]").forEach((el) => observerRef.current!.observe(el));
  }, []);

  const handlePrint = () => window.print();

  if (loading) return <LoadingScreen ticker={ticker} />;

  if (error || !report) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center gap-5 px-4">
        <div className="text-center">
          <p className="text-4xl font-bold font-mono text-[#EF4444] mb-3">{ticker}</p>
          <p className="text-sm text-[#EF4444] mb-2">{error ?? "No data found"}</p>
          <p className="text-xs text-[#475569]">
            {error?.includes("API") ? "Check API keys are configured" : `No data found for ${ticker}`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setLoading(true); setError(null); }}
            className="text-xs px-4 py-2 rounded-lg bg-[#131929] border border-[#1E2D4A] text-[#94A3B8] hover:text-white hover:border-[#2D6BFF] transition-all"
          >
            Retry
          </button>
          <Link href="/reports/adhoc"
            className="text-xs px-4 py-2 rounded-lg bg-[#2D6BFF]/10 border border-[#2D6BFF]/30 text-[#60A5FA] hover:bg-[#2D6BFF]/20 transition-all">
            Back to Research
          </Link>
        </div>
      </div>
    );
  }

  // ── Extract sections ──────────────────────────────────────────────────────
  const sections    = report.sections ?? {};
  const mandate     = report.mandate ?? {};
  const brandColors = (report.brand_colors ?? {}) as { primary?: string; secondary?: string; on_brand_text?: string; confidence?: string };
  const s1  = sections.s1_cover          ?? sections.s1_mandate         ?? {};
  const s2  = sections.s2_overview        ?? sections.s2_company         ?? {};
  const s3  = sections.s3_news            ?? {};
  const s4  = sections.s4_financials      ?? sections.s4_financial       ?? {};
  const s4b = sections.s4b_drivers        ?? {};
  const s5  = sections.s5_dcf             ?? sections.s5_forward         ?? {};
  const s6  = sections.s6_valuation       ?? {};
  const s7  = sections.s7_technicals      ?? sections.s7_technical       ?? {};
  const s8       = sections.s8_competitive     ?? {};
  const s_porter = sections.s_b_porter        ?? {};
  const s9  = sections.s9_industry        ?? {};
  const s10  = sections.s10_institutional  ?? {};
  const s10b  = sections.s10b_management  ?? {};
  const s_c    = sections.s_c_sotp        ?? {};
  const s_esg = sections.s_h_esg         ?? {};
  const s_ma  = sections.s_j_ma          ?? {};
  const s11  = sections.s11_risks         ?? {};
  const s12 = sections.s12_scenarios      ?? {};
  const s13 = sections.s13_sentiment      ?? {};
  const s14 = sections.s14_differ         ?? {};
  const s15 = sections.s15_checklist      ?? {};
  const s16 = sections.s16_recommendation ?? {};
  const s17 = sections.s17_reliability    ?? {};

  // Fallback to flat structure (old format)
  const rec     = s16.direction          != null ? s16 : (report.s7_recommendation ?? {});
  const direction = fv(rec.direction)    ?? fv(s16.action) ?? "—";
  const conviction = Number(fv(rec.conviction_score ?? rec.conviction) ?? 0);
  const cvColor = conviction >= 80 ? "#10B981" : conviction >= 50 ? "#2D6BFF" : conviction >= 30 ? "#F59E0B" : "#EF4444";

  const dirColor = direction === "BUY" || direction === "STRONG BUY" ? "#10B981"
    : direction === "SELL" || direction === "AVOID" ? "#EF4444"
    : direction === "HOLD" ? "#F59E0B"
    : "#94A3B8";

  const currentPrice = fv(report.current_price ?? s1.current_price);
  const mandatePassed = mandate.passed ?? fv(s1.mandate_passed) ?? false;
  const tavilyQuotaExceeded: boolean = !!(report as any).tavily_quota_exceeded;
  const anthropicError: { type?: string; message?: string; model?: string } | null =
    (report as any).api_errors?.anthropic ?? null;

  // Compute next monthly reset date (1st of the month after generated_at)
  const tavilyResetDate = (() => {
    try {
      const d = new Date((report as any).generated_at ?? Date.now());
      const reset = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return reset.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } catch { return "the 1st of next month"; }
  })();

  const anthropicErrorMeta: Record<string, { label: string; detail: string; color: string; border: string; bg: string }> = {
    missing_key:  { label: "API Key Missing",           detail: "ANTHROPIC_API_KEY is not set in your environment. All AI narrative sections are blank. Set the key and re-run the pipeline.", color: "#F87171", border: "#EF444440", bg: "#EF44440A" },
    invalid_key:  { label: "Invalid API Key",            detail: "Anthropic rejected the API key. Check that ANTHROPIC_API_KEY is correct and active in your Anthropic console.", color: "#F87171", border: "#EF444440", bg: "#EF44440A" },
    rate_limit:   { label: "Rate Limit Hit",             detail: "Too many requests were sent to the Anthropic API in a short window. Wait a few minutes, then re-run the pipeline.", color: "#FCD34D", border: "#F59E0B40", bg: "#F59E0B0A" },
    billing:      { label: "Credit Balance Exhausted",   detail: "The Anthropic account may be out of credits. All AI narrative sections are blank. Top up credits at console.anthropic.com and re-run.", color: "#FCD34D", border: "#F59E0B40", bg: "#F59E0B0A" },
    overloaded:   { label: "API Temporarily Overloaded", detail: "Anthropic returned a 529 overload error. This is transient — wait a few minutes and re-run the pipeline.", color: "#FCD34D", border: "#F59E0B40", bg: "#F59E0B0A" },
    connection:   { label: "Connection Error",           detail: "Could not reach the Anthropic API. Check your network connection and re-run.", color: "#FCD34D", border: "#F59E0B40", bg: "#F59E0B0A" },
    api_error:    { label: "Anthropic API Error",        detail: "An unexpected Anthropic API error occurred. AI narrative sections may be incomplete. Check logs for details.", color: "#FCD34D", border: "#F59E0B40", bg: "#F59E0B0A" },
  };

  const cssVars = {
    "--section-accent": (brandMode && brandColors.primary) ? brandColors.primary : "#2D6BFF",
    "--bg-page":           lightMode ? "#F0F4F8" : "#0B0F19",
    "--bg-section-header": lightMode ? "#1B2951" : "#0D1626",
    "--bg-section-body":   lightMode ? "#FFFFFF" : "#0F1623",
    "--bg-card":           lightMode ? "#F1F5F9" : "#131929",
    "--bg-card-dark":      lightMode ? "#E2EBF4" : "#080C14",
    "--border":            lightMode ? "#CBD5E1" : "#1E2D4A",
    "--text-primary":      lightMode ? "#1E293B" : "#E2E8F0",
    "--text-secondary":    lightMode ? "#374151" : "#94A3B8",
    "--text-muted":        lightMode ? "#475569" : "#8896AA",
  } as React.CSSProperties;

  return (
    <div className="adhoc-report min-h-screen pb-20" ref={sectionRefs}
      style={{ ...cssVars, backgroundColor: "var(--bg-page)" }}>

      {/* ── Theme CSS overrides: converts all hardcoded dark-theme colors to CSS vars ── */}
      <style>{`
        .adhoc-report .text-\\[#475569\\] { color: var(--text-muted) !important; }
        .adhoc-report .text-\\[#1E2D4A\\] { color: var(--border) !important; }
        .adhoc-report .bg-\\[#131929\\] { background-color: var(--bg-card) !important; }
        .adhoc-report .bg-\\[#0D1626\\] { background-color: var(--bg-card) !important; }
        .adhoc-report .bg-\\[#0F1623\\] { background-color: var(--bg-section-body) !important; }
        .adhoc-report .bg-\\[#080C14\\] { background-color: var(--bg-card-dark) !important; }
        .adhoc-report .border-\\[#1E2D4A\\] { border-color: var(--border) !important; }
        .adhoc-report .divide-\\[#1E2D4A\\] > * + * { border-color: var(--border) !important; }
        .adhoc-report .text-\\[#94A3B8\\] { color: var(--text-secondary) !important; }
        .adhoc-report .text-\\[#E2E8F0\\] { color: var(--text-primary) !important; }
        .adhoc-report .bg-\\[#1E2D4A\\] { background-color: var(--bg-card-dark) !important; }
        .adhoc-report table thead th { background-color: var(--bg-card-dark) !important; }
      `}</style>

      {/* ── Sticky cover bar ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 backdrop-blur border-b px-4 py-3 print:hidden"
        style={{ backgroundColor: lightMode ? "rgba(240,244,248,0.95)" : "rgba(11,15,25,0.95)", borderColor: "var(--border)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              {s1.company_image && (
                <img
                  src={s1.company_image}
                  alt=""
                  className="w-7 h-7 rounded object-contain bg-white/5 shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <span className="text-xl font-bold font-mono text-white">{ticker}</span>
              <span
                className="text-sm font-bold px-3 py-0.5 rounded-lg"
                style={{ background: `${dirColor}18`, color: dirColor, border: `1px solid ${dirColor}40` }}
              >
                {direction}
              </span>
            </div>
            {report.company_name && (
              <span className="text-xs hidden sm:block" style={{ color: "var(--text-muted)" }}>{report.company_name}</span>
            )}
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border
                ${mandatePassed
                  ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30"
                  : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30"}`}
            >
              MANDATE {mandatePassed ? "PASS" : "FAIL"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {currentPrice && (
              <span className="text-lg font-bold font-mono text-white">{fmt$(currentPrice)}</span>
            )}
            {conviction > 0 && (
              <div className="flex gap-0.5 items-center">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-2 w-3 rounded-sm"
                    style={{ background: i < Math.round(conviction / 10) ? cvColor : "rgba(255,255,255,0.07)" }} />
                ))}
              </div>
            )}
            {/* Light / Dark toggle — always visible */}
            <button
              onClick={() => setLightMode(m => !m)}
              title={lightMode ? "Switch to dark theme" : "Switch to light theme"}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded border transition-all"
              style={lightMode
                ? { background: "#E2EBF4", color: "#1B2951", borderColor: "#CBD5E1" }
                : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }
              }>
              {lightMode ? "☀ Light" : "◐ Dark"}
            </button>
            {/* Brand color toggle — only when brand colors are available */}
            {brandColors.primary ? (
              <button
                onClick={() => setBrandMode(m => !m)}
                title={brandMode ? "Switch to default palette" : `Use brand colours: ${brandColors.primary}`}
                className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded border transition-all"
                style={brandMode
                  ? { background: `${brandColors.primary}22`, color: brandColors.primary, borderColor: `${brandColors.primary}55` }
                  : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }
                }>
                <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20" style={{ background: brandColors.primary }} />
                Brand
              </button>
            ) : (
              <span
                title="Regenerate this report to extract brand colours"
                className="text-[10px] px-3 py-1.5 rounded border cursor-help"
                style={{ background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)", opacity: 0.5 }}>
                <span className="w-2.5 h-2.5 rounded-full inline-block mr-1.5 bg-slate-500 shrink-0 align-middle" />
                Brand
              </span>
            )}
            <button
              onClick={() => {
                setReport(null);
                setError(null);
                setLoading(true);
                fetch(`/api/adhoc/${ticker}`, { method: "POST" })
                  .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error ?? "Failed")))
                  .then(d => { setReport(d); setLoading(false); })
                  .catch(e => { setError(String(e)); setLoading(false); });
              }}
              className="text-[10px] px-3 py-1.5 rounded border transition-all"
              style={{ background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
              Regenerate
            </button>
            <button onClick={handlePrint}
              className="text-[10px] px-3 py-1.5 rounded border transition-all"
              style={{ background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-6 flex gap-6">

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-56 shrink-0 print:hidden">
          <div className="sticky top-16 h-[calc(100vh-5rem)] overflow-y-auto pb-10">
            <Link href="/reports/adhoc"
              className="text-[10px] block mb-5 transition-colors hover:text-[#60A5FA]"
              style={{ color: "var(--text-muted)" }}>
              &larr; Research
            </Link>
            <nav className="space-y-px">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-all"
                  style={activeSection === item.id
                    ? { color: "#fff", backgroundColor: "var(--bg-card)", borderLeft: "2px solid #2D6BFF" }
                    : { color: "var(--text-muted)" }}
                >
                  <span className="font-mono text-[10px] shrink-0 opacity-50 w-6 text-right">{String(item.n).padStart(2, "0")}</span>
                  <span className="text-[10px]">{item.label}</span>
                </a>
              ))}
            </nav>
            <div className="mt-6 px-2">
              <button onClick={() => router.push("/reports/adhoc")}
                className="w-full text-[11px] py-2 px-3 rounded-lg border transition-all"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
                Run Another
              </button>
            </div>
          </div>
        </aside>

        {/* ── Report body ────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">

          {/* ── Tavily quota exhausted banner ─────────────────────────────── */}
          {tavilyQuotaExceeded && !tavilyBannerDismissed && (
            <div className="mb-6 flex items-start gap-4 rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/6 px-5 py-4">
              <svg className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#FCD34D] mb-1">Tavily search credits exhausted</p>
                <p className="text-xs text-[#D97706]/80 leading-relaxed">
                  This report&apos;s AI narrative sections — Company Overview, News Catalysts, Revenue Drivers, Industry &amp; Macro,
                  Competitive Moat, Sentiment, and Where We Differ — rely on Tavily web searches that could not run.
                  Those sections will appear empty or show fallback text only.
                  Structured data (financials, technicals, valuation metrics) is unaffected.
                </p>
                <p className="text-xs text-[#FCD34D] mt-2">
                  Credits reset on <span className="font-semibold">{tavilyResetDate}</span>.
                  Re-run the pipeline after that date to get the full report.
                </p>
              </div>
              <button
                onClick={() => setTavilyBannerDismissed(true)}
                className="shrink-0 text-[#78716C] hover:text-[#D97706] transition-colors mt-0.5 cursor-pointer"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Anthropic API error banner ────────────────────────────────── */}
          {anthropicError && !anthropicBannerDismissed && (() => {
            const meta = anthropicErrorMeta[anthropicError.type ?? "api_error"] ?? anthropicErrorMeta["api_error"];
            return (
              <div
                className="mb-4 flex items-start gap-4 rounded-2xl border px-5 py-4"
                style={{ borderColor: meta.border, background: meta.bg }}
              >
                <svg className="w-5 h-5 shrink-0 mt-0.5" style={{ color: meta.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold mb-1" style={{ color: meta.color }}>
                    Anthropic AI — {meta.label}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: meta.color, opacity: 0.75 }}>
                    {meta.detail}
                  </p>
                  {anthropicError.message && (
                    <p className="text-[10px] mt-1.5 font-mono text-[#475569] break-all">
                      {anthropicError.message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setAnthropicBannerDismissed(true)}
                  className="shrink-0 text-[#475569] hover:text-[#94A3B8] transition-colors mt-0.5 cursor-pointer"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })()}

          {/* ── Report Hero Cover ─────────────────────────────────────────── */}
          {(() => {
            const expRet  = fv(rec.expected_return_12m);
            const posSz   = fv(rec.position_size_pct);
            const stopLs  = fv(rec.stop_loss_pct);
            const heroStats = [
              { label: "Price",        val: currentPrice ? fmt$(currentPrice) : null, color: "#E2E8F0" },
              { label: "Market Cap",   val: fmtBn(s1.market_cap) !== NP ? fmtBn(s1.market_cap) : null, color: "#94A3B8" },
              { label: "Exp. Return",  val: expRet,   color: expRet && String(expRet).startsWith("-") ? "#EF4444" : "#10B981" },
              { label: "Position",     val: posSz != null ? `${posSz}%` : null, color: "#94A3B8" },
              { label: "Stop Loss",    val: stopLs != null ? `-${stopLs}%` : null, color: "#EF4444" },
            ].filter(s => s.val != null);
            return (
              <div className="mb-8 rounded-2xl overflow-hidden border border-[#1E2D4A] shadow-2xl shadow-black/40 print:mb-4">
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${dirColor} 0%, ${dirColor}60 50%, transparent 100%)` }} />
                <div className="px-6 py-6" style={{ background: "linear-gradient(135deg, #0A0E1A 0%, #0D1626 60%, #0A0E1A 100%)" }}>
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-4xl font-bold font-mono text-white tracking-tight">{ticker}</span>
                        <span className="text-lg font-bold px-4 py-1.5 rounded-xl"
                          style={{ background: `${dirColor}20`, color: dirColor, border: `1px solid ${dirColor}50` }}>
                          {direction}
                        </span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${mandatePassed ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30" : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30"}`}>
                          MANDATE {mandatePassed ? "PASS" : "FAIL"}
                        </span>
                      </div>
                      {report.company_name && (
                        <p className="text-[#60A5FA] text-sm font-medium">{report.company_name}</p>
                      )}
                      {report.generated_at && (
                        <p className="text-[#1E3A5F] text-[10px] mt-1">Generated {String(report.generated_at).slice(0, 19).replace("T", " ")} UTC</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[#475569] uppercase tracking-widest mb-2">Conviction Score</p>
                      <ConvictionBar score={conviction} />
                    </div>
                  </div>

                  {/* Stat cards row */}
                  {heroStats.length > 0 && (
                    <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: `repeat(${Math.min(heroStats.length, 5)}, 1fr)` }}>
                      {heroStats.map(({ label, val, color }) => (
                        <div key={label} className="rounded-xl px-4 py-3 border" style={{ background: "#080C14", borderColor: "#1E2D4A" }}>
                          <p className="text-[10px] text-[#475569] uppercase tracking-widest mb-1.5">{label}</p>
                          <p className="text-xl font-bold font-mono" style={{ color }}>{val}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 2-line thesis from first investment argument */}
                  {(() => {
                    const args = rec.three_arguments ?? rec.investment_arguments ?? rec.arguments ?? [];
                    if (!args.length) return null;
                    const first = args[0];
                    const title = typeof first === "object" ? first.title : null;
                    const body  = typeof first === "string" ? first : (first.reasoning ?? first.argument ?? first.text ?? "");
                    const lead  = body ? String(body).slice(0, 220) + (String(body).length > 220 ? "…" : "") : null;
                    if (!title && !lead) return null;
                    return (
                      <div className="border-t border-[#1E2D4A]/60 pt-4">
                        <p className="text-[10px] text-[#334155] uppercase tracking-wider mb-1.5">Core Thesis</p>
                        {title && <p className="text-sm font-semibold text-[#CBD5E1] mb-1">{title}</p>}
                        {lead && <p className="text-xs text-[#475569] leading-relaxed">{lead}</p>}
                        <span className="mt-1.5 inline-block text-[10px] font-bold px-1.5 py-0 rounded leading-5 bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI · Sonnet 4.6</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

          {/* S1 — Fund Mandate */}
          <div id="s1" data-section>
            <Section n={1} id="s1" title="Fund Mandate" color="#2D6BFF">
              {(() => {
                const checks   = mandate.checks ?? s1.checks ?? s1.checklist ?? [];
                const setupType = mandate.setup_type ?? fv(s1.setup_type);
                const passedCnt = checks.filter((c: any) => c.pass ?? c.passed).length;
                const failedCnt = checks.length - passedCnt;
                const overallPass = checks.length > 0 && failedCnt === 0;
                const scoreColor  = overallPass ? "#10B981" : failedCnt <= 2 ? "#F59E0B" : "#EF4444";
                return (
                  <div className="flex items-center gap-5 flex-wrap">
                    <MandateRing passed={passedCnt} total={checks.length || 17} />
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-2xl font-bold font-mono" style={{ color: scoreColor }}>
                          {passedCnt}<span className="text-base text-[#475569]">/{checks.length}</span>
                        </span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${overallPass ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30" : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30"}`}>
                          {overallPass ? "PASS" : `${failedCnt} failing`}
                        </span>
                        {setupType && (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#2D6BFF]/10 text-[#60A5FA] border border-[#2D6BFF]/30">
                            Setup: {setupType}
                          </span>
                        )}
                      </div>
                      {failedCnt > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {checks.filter((c: any) => !(c.pass ?? c.passed)).slice(0, 4).map((c: any, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20">
                              {c.name ?? c.item ?? c.check}
                            </span>
                          ))}
                          {failedCnt > 4 && <span className="text-[10px] text-[#475569]">+{failedCnt - 4} more</span>}
                        </div>
                      )}
                      <p className="text-[10px] text-[#334155]">Full checklist → <span className="text-[#2D6BFF]">Section 15</span></p>
                    </div>
                  </div>
                );
              })()}
            </Section>
          </div>

          {/* S2 — Company Overview */}
          <div id="s2" data-section>
            <Section n={2} id="s2" title="Company Overview" color="#10B981">
              {(() => {
                const narrative = fv(s2.ai_narrative);
                const fmpDesc   = fv(s2.fmp_description);
                const factFields = ([
                  ["CEO",          s2.ceo],
                  ["Employees",    s2.employees],
                  ["IPO Date",     s2.ipo_date],
                  ["Sector",       s2.sector],
                  ["Industry",     s2.industry],
                  ["Country",      s2.country],
                  ["Market Cap",   s2.market_cap],
                  ["Rev CAGR 3Y",  s2.revenue_cagr_3y],
                  ["Exchange",     s2.exchange],
                  ["Website",      s2.website],
                ] as [string, any][]).filter(([, v]) => fv(v) != null);
                const hasContent = narrative || fmpDesc || factFields.length > 0;
                return (
                  <>
                    {narrative && !String(narrative).startsWith("Synthesis failed") ? (
                      <div className="mb-5">
                        <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap">
                          {narrative}
                          <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                        </p>
                      </div>
                    ) : fmpDesc ? (
                      <div className="mb-5">
                        <p className="text-xs text-[#94A3B8] leading-relaxed">{fmpDesc}</p>
                        <TagBadge source={fs(s2.fmp_description)} />
                      </div>
                    ) : null}
                    {factFields.length > 0 && (
                      <div className="grid grid-cols-2 gap-x-6">
                        {factFields.map(([label, v]) => (
                          <KV key={label} label={label}
                            value={<>
                              {label === "Market Cap" ? fmtBn(v) : String(fv(v) ?? "—")}
                              {fs(v) && <TagBadge source={fs(v)} />}
                            </>} />
                        ))}
                      </div>
                    )}

                    {/* Market Position (Upgrade 1) */}
                    {(() => {
                      const msPct   = s2.market_share_pct as string | null | undefined;
                      const compRank = s2.competitive_rank as string | null | undefined;
                      const comps   = (s2.named_competitors ?? []) as string[];
                      const src     = s2.mktpos_source as string | undefined;
                      if (!msPct && !compRank && !comps.length) {
                        return (
                          <p className="mt-4 text-[10px] text-[#334155]">
                            Market share: <span className="text-[#475569]">[Not publicly disclosed]</span>
                          </p>
                        );
                      }
                      return (
                        <div className="mt-4 pt-4 border-t border-[#1E2D4A]/60">
                          <p className="text-[10px] font-semibold text-[#60A5FA] uppercase tracking-wider mb-2">Market Position</p>
                          <div className="flex flex-wrap gap-3">
                            {msPct && src === "tavily" && (
                              <div className="bg-[#0B1628] rounded-lg px-3 py-2 text-xs">
                                <span className="text-[#64748B]">Market Share: </span>
                                <span className="font-bold text-[#60A5FA]">{msPct}</span>
                                <TagBadge source={src} />
                              </div>
                            )}
                            {compRank && (
                              <div className="bg-[#0B1628] rounded-lg px-3 py-2 text-xs">
                                <span className="text-[#64748B]">Position: </span>
                                <span className="font-bold text-[#10B981]">{compRank}</span>
                                {src && <TagBadge source={src} />}
                              </div>
                            )}
                          </div>
                          {comps.length > 0 && (
                            <p className="mt-2 text-[10px] text-[#64748B]">
                              Key competitors: <span className="text-[#94A3B8]">{comps.join(", ")}</span>
                            </p>
                          )}
                          {src && <p className="mt-1 text-[10px] text-[#334155]">{src}</p>}
                        </div>
                      );
                    })()}

                    {!hasContent && <p className="text-xs text-[#475569]">Data unavailable</p>}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S3 — News & Catalysts */}
          <div id="s3" data-section>
            <Section n={3} id="s3" title="News & Catalysts" color="#F59E0B">
              {(() => {
                const aiSynth  = s3.ai_synthesis as any;
                const synthesis = fv(aiSynth);
                const nearTerm  = aiSynth?.near_term_catalysts   ?? [];
                const medTerm   = aiSynth?.medium_term_catalysts  ?? [];
                const riskEvts  = aiSynth?.key_risk_events        ?? [];
                const newsItems  = (s3.news_items ?? []) as any[];
                const upcoming   = (s3.upcoming_earnings ?? []) as any[];
                const hasAi = synthesis || nearTerm.length > 0 || medTerm.length > 0 || riskEvts.length > 0;
                return (
                  <>
                    {upcoming.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {upcoming.slice(0, 2).map((e: any, i: number) => (
                          <div key={i} className="bg-[#0D1626] border border-[#F59E0B]/30 rounded-lg px-3 py-2 text-xs">
                            <span className="text-[#F59E0B] font-bold">{fv(e.quarter) ?? "Earnings"}</span>
                            <span className="text-[#94A3B8] ml-2">{fv(e.date)}</span>
                            {fv(e.eps_estimate) != null && (
                              <span className="text-[#475569] ml-2">EPS est: {fmt$(fv(e.eps_estimate))}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {synthesis && (
                      <div className="mb-5 space-y-2">
                        {String(synthesis).split(/\n\n+/).map((para, pi) => (
                          <p key={pi} className="text-xs text-[#94A3B8] leading-relaxed">
                            {para}
                            {pi === 0 && <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>}
                          </p>
                        ))}
                      </div>
                    )}
                    {nearTerm.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-[#10B981] uppercase tracking-wider mb-2">Near-Term Catalysts</p>
                        <ul className="space-y-1">
                          {nearTerm.map((c: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                              <span className="text-[#10B981] shrink-0">+</span>
                              {typeof c === "string" ? c : (c.catalyst ?? c.headline ?? c.text ?? JSON.stringify(c))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {medTerm.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-[#2D6BFF] uppercase tracking-wider mb-2">Medium-Term Catalysts</p>
                        <ul className="space-y-1">
                          {medTerm.map((c: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                              <span className="text-[#2D6BFF] shrink-0">+</span>
                              {typeof c === "string" ? c : (c.catalyst ?? c.text ?? JSON.stringify(c))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {riskEvts.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider mb-2">Key Risk Events</p>
                        <ul className="space-y-1">
                          {riskEvts.map((c: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                              <span className="text-[#EF4444] shrink-0">!</span>
                              {typeof c === "string" ? c : (c.event ?? c.text ?? JSON.stringify(c))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Fallback: raw headlines when AI synthesis failed */}
                    {!hasAi && newsItems.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Recent Headlines</p>
                        <ul className="space-y-2">
                          {newsItems.slice(0, 8).map((n: any, i: number) => (
                            <li key={i} className="border-b border-[#1E2D4A] pb-2 last:border-0">
                              <p className="text-xs text-[#94A3B8]">{n.headline}</p>
                              {n.date && <p className="text-[10px] text-[#475569] mt-0.5">{n.date}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!hasAi && newsItems.length === 0 && upcoming.length === 0 && (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S4 — Historical Financials */}
          <div id="s4" data-section>
            <Section n={4} id="s4" title="Historical Financials" color="#2D6BFF">
              <HistoricalFinancialsSection s4={s4} />
            </Section>
          </div>

          {/* S4b — Revenue Growth Drivers */}
          <div id="s4b" data-section>
            <Section n={"4b" as any} id="s4b" title="Revenue Growth Drivers" color="#3B82F6">
              <RevenueGrowthDriversSection s4b={s4b} />
            </Section>
          </div>

          {/* S5 — Forward Estimates & DCF */}
          <div id="s5" data-section>
            <Section n={5} id="s5" title="Forward Estimates & DCF" color="#10B981">
              {(() => {
                const estimates = s5.analyst_estimates ?? s5.estimates ?? {};
                // DCF fields are flat on s5 (not nested under s5.dcf)
                const hasDcf    = !!(s5.implied_price || s5.pv_fcfs || s5.enterprise_value);
                const dcf       = hasDcf ? s5 : (s5.dcf ?? s5.dcf_model ?? {});
                const wacc      = s5.wacc_inputs ?? s5.wacc ?? (dcf as any).wacc_breakdown ?? {};
                const implied   = fv(s5.implied_price ?? (dcf as any).implied_price);
                const impliedUpside = fv(s5.upside_pct ?? s5.implied_upside ?? (dcf as any).implied_upside);
                return (
                  <>
                    {Object.keys(estimates).length > 0 && (() => {
                      const EST_LABEL: Record<string, string> = {
                        eps_current_fy: "EPS Current FY",
                        eps_next_fy: "EPS Next FY",
                        eps_growth_cur: "EPS Growth (Cur %)",
                        eps_growth_next: "EPS Growth (Next %)",
                        rev_current_fy: "Revenue Current FY",
                        rev_next_fy: "Revenue Next FY",
                      };
                      const fmtEst = (k: string, v: any): string => {
                        const raw = fv(v);
                        if (raw == null) return "—";
                        if (k.startsWith("rev")) return fmtBn(raw);
                        if (k.includes("growth")) return `${Number(raw).toFixed(1)}%`;
                        if (k.startsWith("eps")) return `$${Number(raw).toFixed(2)}`;
                        return String(raw);
                      };
                      return (
                        <div className="mb-6">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Analyst Estimates</p>
                          <div className="grid grid-cols-3 gap-3">
                            {Object.entries(estimates).slice(0, 6).map(([k, v]: [string, any]) => (
                              <StatCard key={k}
                                label={EST_LABEL[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                value={fmtEst(k, v)} source={fs(v)} />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {(Object.keys(dcf).length > 0 || hasDcf) && (() => {
                      const wacc_pct    = fv((wacc as any).wacc ?? (dcf as any).wacc);
                      const tgr         = fv((dcf as any).terminal_growth ?? s5.terminal_growth);
                      const curP        = Number(fv(report.current_price ?? s1.current_price) ?? 0);
                      const implP       = Number(implied ?? 0);
                      const upPct       = impliedUpside != null ? Number(impliedUpside) : (curP > 0 && implP > 0 ? ((implP - curP) / curP * 100) : null);
                      const upColor     = upPct != null && upPct >= 0 ? "#10B981" : "#EF4444";
                      const curIsLow    = implP > curP;
                      const fcfMargRaw  = fv((dcf as any).fcf_margin_avg ?? s5.fcf_margin_avg);
                      const pvFcfs      = fv((dcf as any).pv_fcfs ?? s5.pv_fcfs);
                      const pvTerm      = fv((dcf as any).pv_terminal ?? s5.pv_terminal);
                      const evVal       = fv((dcf as any).enterprise_value ?? s5.enterprise_value);
                      const ndVal       = fv((dcf as any).net_debt ?? s5.net_debt);
                      const termMult    = fv((dcf as any).terminal_multiple ?? s5.terminal_multiple);
                      const eqVal       = (evVal != null && ndVal != null) ? Number(evVal) - Number(ndVal) : null;
                      const fmtBnDcf    = (v: any) => v != null ? `$${Number(v).toFixed(0)}B` : null;
                      return (
                        <div className="mb-6">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">DCF Valuation</p>

                          {implP > 0 && curP > 0 ? (
                            /* ── Full DCF output card ── */
                            <div className="rounded-2xl overflow-hidden mb-4" style={{ border: `1px solid ${upColor}25` }}>
                              {/* Hero: current vs implied */}
                              <div className="bg-[#080C14] px-5 pt-5 pb-4">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                  <div>
                                    <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Current Price</p>
                                    <p className="text-3xl font-bold font-mono text-[#94A3B8]">{fmt$(curP)}</p>
                                  </div>
                                  <div className="flex-1 text-center">
                                    <p className="text-2xl font-bold font-mono" style={{ color: upColor }}>
                                      {upPct != null ? `${upPct >= 0 ? "+" : ""}${upPct.toFixed(1)}%` : "—"}
                                    </p>
                                    <div className="mt-1.5 h-1.5 rounded-full bg-[#1E2D4A] overflow-hidden mx-4">
                                      <div className="h-full rounded-full" style={{
                                        width: `${Math.max(5, Math.min(95, (Math.min(curP, implP) / Math.max(curP, implP)) * 100))}%`,
                                        background: upColor + "70",
                                        marginLeft: curIsLow ? "0" : "auto",
                                      }} />
                                    </div>
                                    <p className="text-[10px] text-[#475569] mt-1">{curIsLow ? "upside to fair value" : "above fair value"}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">DCF Fair Value</p>
                                    <p className="text-3xl font-bold font-mono" style={{ color: upColor }}>{fmt$(implP)}</p>
                                  </div>
                                </div>
                                {/* Methodology line */}
                                <p className="text-[10px] text-[#334155] leading-relaxed">
                                  [CALCULATED] 3-year projection horizon
                                  {fcfMargRaw != null ? ` · ${Number(fcfMargRaw).toFixed(1)}% avg FCF margin (3yr historical)` : ""}
                                  {wacc_pct != null ? ` · ${Number(wacc_pct).toFixed(1)}% WACC` : ""}
                                  {termMult != null ? ` · ${Number(termMult).toFixed(1)}× terminal EV/EBITDA` : (tgr != null ? ` · ${Number(tgr).toFixed(2)}% terminal growth` : "")}
                                  {" · FMP/yfinance [CALCULATED]"}
                                </p>
                              </div>

                              {/* Value build-up waterfall */}
                              {(pvFcfs != null || pvTerm != null) && (
                                <div className="bg-[#0A0E1A] border-t border-[#1E2D4A] px-5 py-4">
                                  <p className="text-[10px] text-[#334155] uppercase tracking-wider mb-3">Value Build-up</p>
                                  <div className="space-y-2">
                                    {([
                                      { label: "PV of FCFs (3-year explicit period)", val: pvFcfs,  sign: " ",  sum: false },
                                      { label: "PV of Terminal Value",                val: pvTerm,  sign: "+",  sum: false },
                                      { label: "Enterprise Value",                    val: evVal,   sign: "=",  sum: true  },
                                      { label: "Less: Net Debt (Debt − Cash)",        val: ndVal != null ? -Number(ndVal) : null, sign: "−", sum: false },
                                      { label: "Equity Value",                        val: eqVal,   sign: "=",  sum: true  },
                                    ] as { label: string; val: any; sign: string; sum: boolean }[])
                                      .filter(r => r.val != null)
                                      .map((row, i) => (
                                        <div key={i} className={`flex items-center gap-3 ${row.sum ? "border-t border-[#1E2D4A] pt-2" : ""}`}>
                                          <span className={`text-[11px] font-mono w-5 text-center shrink-0 ${row.sum ? "text-[#60A5FA]" : "text-[#475569]"}`}>{row.sign}</span>
                                          <span className="text-[11px] text-[#94A3B8] flex-1">{row.label}</span>
                                          <span className={`text-[11px] font-mono tabular-nums ${row.sum ? "font-bold text-white" : "text-[#64748B]"}`}>
                                            {Number(row.val) < 0 ? `-$${Math.abs(Number(row.val)).toFixed(0)}B` : `$${Number(row.val).toFixed(0)}B`}
                                          </span>
                                        </div>
                                      ))}
                                    <div className="border-t border-[#60A5FA]/20 pt-2 flex items-center gap-3">
                                      <span className="text-[11px] font-mono w-5 text-center shrink-0" style={{ color: upColor }}>÷</span>
                                      <span className="text-[11px] text-[#94A3B8] flex-1">Per Share (÷ diluted shares outstanding)</span>
                                      <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: upColor }}>{fmt$(implP)}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* ── DCF not calculable ── */
                            <div className="flex items-start gap-3 bg-[#0D1626] border border-[#1E2D4A] rounded-xl px-4 py-3 mb-4">
                              <svg className="shrink-0 mt-0.5" width={14} height={14} viewBox="0 0 16 16" fill="none">
                                <circle cx={8} cy={8} r={7} stroke="#475569" strokeWidth={1.5}/>
                                <path d="M8 5v3.5M8 11v.5" stroke="#475569" strokeWidth={1.5} strokeLinecap="round"/>
                              </svg>
                              <p className="text-[11px] text-[#475569] leading-relaxed">
                                DCF implied price could not be calculated — this typically occurs when a company has negative or insufficient historical free cash flow (common for growth-stage companies, insurers, and pre-profit businesses). WACC inputs and peer multiples below are shown for reference.
                              </p>
                            </div>
                          )}

                          {/* KV details */}
                          <div className="grid grid-cols-2 gap-x-8">
                            {([
                              ["FCF Margin (3yr Avg)", (dcf as any).fcf_margin_avg ?? s5.fcf_margin_avg],
                              ["Terminal Growth Rate", (dcf as any).terminal_growth ?? s5.terminal_growth],
                              ["Terminal EV/EBITDA",   (dcf as any).terminal_multiple ?? s5.terminal_multiple],
                              ["Peer EV/EBITDA Median",(dcf as any).peer_ev_ebitda_used ?? s5.peer_ev_ebitda_used],
                              ["PV of FCFs",           (dcf as any).pv_fcfs ?? s5.pv_fcfs],
                              ["PV Terminal Value",    (dcf as any).pv_terminal ?? s5.pv_terminal],
                              ["Enterprise Value",     (dcf as any).enterprise_value ?? s5.enterprise_value],
                              ["Net Debt",             (dcf as any).net_debt ?? s5.net_debt],
                            ] as [string, any][]).filter(([, v]) => fv(v) != null).map(([label, v]) => {
                              const raw = fv(v);
                              const formatted = Array.isArray(raw)
                                ? (raw as number[]).map(n => n.toFixed(1)).join(", ")
                                : typeof raw === "number" && (label.includes("PV") || label.includes("Value") || label.includes("Debt"))
                                  ? fmtBnDcf(raw)
                                  : typeof raw === "number" && label.includes("Margin")
                                    ? `${raw}%`
                                  : typeof raw === "number" && label.includes("Growth")
                                    ? `${raw}%`
                                  : typeof raw === "number" && label.includes("EV/EBITDA")
                                    ? `${raw}`
                                  : raw;
                              return (
                                <KV key={label} label={label}
                                  value={<>{formatted}{fs(v) && <TagBadge source={fs(v)} />}</>} />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    {Object.keys(wacc).length > 0 && (
                      <div className="mb-6">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">WACC Inputs</p>
                        <div className="grid grid-cols-2 gap-x-8">
                          {Object.entries(wacc).map(([k, v]: [string, any]) => (
                            <KV key={k} label={k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                              value={<>{fv(v)}{fs(v) && <TagBadge source={fs(v)} />}</>} />
                          ))}
                        </div>
                      </div>
                    )}
                    {(() => {
                      /* Sensitivity table — s5.sensitivity_table is {wacc_steps, mult_steps, rows, source} */
                      const st = s5.sensitivity_table as any;
                      if (!st || !st.rows || !Array.isArray(st.rows) || st.rows.length === 0) return null;
                      const multSteps: number[] = st.mult_steps ?? [];
                      const rows: { wacc_pct: number; prices: (number | null)[] }[] = st.rows;
                      const allPrices = rows.flatMap(r => r.prices).filter((v): v is number => v != null);
                      const minP = Math.min(...allPrices), maxP = Math.max(...allPrices);
                      const curP2 = Number(fv(report.current_price ?? s1.current_price) ?? 0);
                      return (
                        <div>
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-1">Sensitivity: Implied Price (WACC × Terminal EV/EBITDA)</p>
                          <p className="text-[10px] text-[#334155] mb-3">Rows = WACC %; Columns = Terminal EV/EBITDA multiple. Green = above current price, Red = below.</p>
                          <div className="overflow-x-auto">
                            <table className="border-collapse text-[10px]">
                              <thead>
                                <tr>
                                  <td className="px-2 py-1.5 border border-[#1E2D4A] text-[#475569]">WACC ↓ / EV/EBITDA →</td>
                                  {multSteps.map(m => (
                                    <td key={m} className="px-2 py-1.5 border border-[#1E2D4A] text-[#475569] text-center font-mono">{m}×</td>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1.5 border border-[#1E2D4A] text-[#475569] font-mono">{row.wacc_pct}%</td>
                                    {row.prices.map((p, j) => (
                                      p != null
                                        ? <HeatCell key={j} value={p} min={minP} max={maxP} currentPrice={curP2} />
                                        : <td key={j} className="px-2 py-1.5 border border-[#1E2D4A] text-[#475569] text-center">—</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-[10px] text-[#334155] mt-2">[CALCULATED] FMP/yfinance · Bold = current base case</p>
                        </div>
                      );
                    })()}
                    {Object.keys(estimates).length === 0 && !hasDcf && Object.keys(dcf).length === 0 && (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S6 — Valuation Metrics */}
          <div id="s6" data-section>
            <Section n={6} id="s6" title="Valuation Metrics" color="#2D6BFF">
              {(() => {
                const metricFields = ([
                  ["P/E TTM",    s6.pe_ttm,           undefined],
                  ["P/E Fwd",   s6.pe_fwd,            undefined],
                  ["P/B",       s6.price_to_book,      undefined],
                  ["P/S",       s6.price_to_sales,     undefined],
                  ["EV/EBITDA", s6.ev_ebitda,          undefined],
                  ["FCF Yield", s6.fcf_yield,          "%"],
                  ["ROIC",      s6.roic,               "%"],
                  ["ROE",       s6.roe,                "%"],
                  ["Beta",      s6.beta,               undefined],
                  ["Div Yield", s6.dividend_yield,     "%"],
                  ["52W High",  s6["52w_high"],        "$"],
                  ["52W Low",   s6["52w_low"],         "$"],
                  ["% from 52W High", s6.pct_from_52w_high, "%"],
                ] as [string, any, string?][]).filter(([, v]) => fv(v) != null);
                // Prefer live comparables (always correct peers) over stale JSON peers
                const jsonPeers = (s6.peer_table ?? s6.peer_comparison ?? s6.peers ?? []) as any[];
                // Normalize live comparables to the same shape as jsonPeers
                const peerData: any[] = livePeers.length > 0
                  ? livePeers.map(p => ({
                      symbol: p.ticker,
                      company_name: p.company,
                      pe: p.pe_ratio,
                      pe_fwd: p.pe_fwd,
                      ev_ebitda: p.ev_ebitda,
                      ps: p.ps_ratio,
                      pb: p.pb_ratio,
                      ebitda_margin: p.ebitda_margin_pct,
                      net_margin: p.net_margin_pct,
                      debt_to_equity: p.de_ratio,
                      _is_subject: p.is_subject,
                    }))
                  : jsonPeers;

                // Find subject row and determine primary valuation metric
                const subjectRow = peerData.find(r =>
                  (fv(r.symbol) ?? r.symbol ?? "").toUpperCase() === ticker.toUpperCase() || r._is_subject
                );
                const getRaw = (row: any, key: string): number | null => {
                  const val = fv(row[key]) ?? row[key];
                  if (val == null) return null;
                  const n = Number(val);
                  return isNaN(n) ? null : n;
                };
                const sPE    = subjectRow ? getRaw(subjectRow, "pe")     : null;
                const sPEfwd = subjectRow ? getRaw(subjectRow, "pe_fwd") : null;
                const sPS    = subjectRow ? getRaw(subjectRow, "ps")     : null;
                // Priority: trailing P/E → forward P/E → P/S
                const primaryKey   = (sPE    != null && sPE    > 0 && sPE    < 1000) ? "pe"
                                   : (sPEfwd != null && sPEfwd > 0 && sPEfwd < 1000) ? "pe_fwd"
                                   : "ps";
                const primaryLabel = primaryKey === "pe" ? "P/E" : primaryKey === "pe_fwd" ? "Fwd P/E" : "P/S";
                const subjectPrimary = primaryKey === "pe" ? sPE : primaryKey === "pe_fwd" ? sPEfwd : sPS;

                const PEER_COLS = ["pe", "pe_fwd", "ev_ebitda", "ps", "pb", "ebitda_margin", "net_margin", "debt_to_equity"];
                const COL_LABELS: Record<string, string> = {
                  pe: "P/E", pe_fwd: "Fwd P/E", ev_ebitda: "EV/EBITDA",
                  ps: "P/S", pb: "P/B", ebitda_margin: "EBITDA Mgn",
                  net_margin: "Net Mgn", debt_to_equity: "D/E",
                };

                return (
                  <>
                    {metricFields.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
                        {metricFields.map(([label, v, unit]) => {
                          const raw = Number(fv(v));
                          const display = unit === "$" ? fmt$(fv(v)) : unit === "%" ? fmtPct(fv(v)) : fmtN(fv(v), 2);
                          const color = label === "Beta" ? (raw > 2 ? "#EF4444" : raw < 0.8 ? "#10B981" : "#94A3B8")
                            : label === "% from 52W High" ? (raw < -30 ? "#EF4444" : raw > -10 ? "#10B981" : "#F59E0B")
                            : label === "ROIC" || label === "ROE" ? (raw > 15 ? "#10B981" : raw > 5 ? "#F59E0B" : "#EF4444")
                            : label === "FCF Yield" ? (raw > 5 ? "#10B981" : raw > 0 ? "#F59E0B" : "#EF4444")
                            : undefined;
                          return <StatCard key={label as string} label={label as string} value={display} source={fs(v)} color={color} />;
                        })}
                      </div>
                    )}
                    {peerData.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Peer Comparison</p>
                          <span className="text-[10px] text-[#334155] px-2 py-0.5 rounded bg-[#1E2D4A]/60">
                            Primary: <span className="text-[#60A5FA] font-bold">{primaryLabel}</span> · vs ASTS = cheap/pricey on {primaryLabel}
                          </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-[#1E2D4A]">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[#1E2D4A] bg-[#080C14]">
                                <th className="text-[10px] font-medium text-[#475569] text-left py-2.5 px-3 sticky left-0 bg-[#080C14]">Ticker</th>
                                {PEER_COLS.map((c) => (
                                  <th key={c} className={`text-[10px] font-medium text-right py-2.5 px-3 ${c === primaryKey ? "text-[#60A5FA]" : "text-[#475569]"}`}>
                                    {COL_LABELS[c]}{c === primaryKey ? " ★" : ""}
                                  </th>
                                ))}
                                <th className="text-[10px] font-medium text-[#60A5FA] text-right py-2.5 px-3 whitespace-nowrap">
                                  vs {ticker.toUpperCase()}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {peerData.map((row: any, i: number) => {
                                const sym = (fv(row.symbol) ?? row.symbol ?? "—").toString().toUpperCase();
                                const isSubject = sym === ticker.toUpperCase() || row._is_subject;
                                const peerPrimary = getRaw(row, primaryKey);
                                const delta = (!isSubject && peerPrimary != null && subjectPrimary != null && subjectPrimary !== 0)
                                  ? ((peerPrimary - subjectPrimary) / Math.abs(subjectPrimary)) * 100
                                  : null;
                                // delta > 0 → peer more expensive → ASTS cheap (green)
                                // delta < 0 → peer cheaper → ASTS pricey (red)
                                const vsLabel = delta == null ? (isSubject ? "Subject" : "—")
                                  : delta > 10 ? `Cheap +${delta.toFixed(0)}%`
                                  : delta < -10 ? `Pricey ${delta.toFixed(0)}%`
                                  : "~At par";
                                const vsColor = delta == null ? (isSubject ? "#60A5FA" : "#475569")
                                  : delta > 10 ? "#10B981"
                                  : delta < -10 ? "#EF4444"
                                  : "#94A3B8";
                                return (
                                  <tr key={i} className={`border-b border-[#1E2D4A]/40 last:border-0 transition-colors ${isSubject ? "bg-[#2D6BFF]/8" : "hover:bg-[#1E2D4A]/30"}`}>
                                    <td className={`py-2.5 px-3 font-mono font-bold sticky left-0 ${isSubject ? "text-[#60A5FA] bg-[#0A1628]" : "text-[#94A3B8]"}`}>{sym}</td>
                                    {PEER_COLS.map((c) => {
                                      const raw = getRaw(row, c);
                                      const txt = raw == null ? "—" : /margin|ebitda/i.test(c) ? `${raw.toFixed(1)}%` : raw.toFixed(1);
                                      const isPrimary = c === primaryKey;
                                      const neg = raw != null && (/margin|ebitda/i.test(c) || c === "ev_ebitda") && raw < 0;
                                      return (
                                        <td key={c} className={`py-2.5 px-3 font-mono text-right ${
                                          isPrimary
                                            ? `font-bold ${neg ? "text-[#EF4444]" : isSubject ? "text-[#60A5FA]" : "text-white"}`
                                            : neg ? "text-[#EF4444]" : "text-[#94A3B8]"
                                        }`}>
                                          {txt}
                                        </td>
                                      );
                                    })}
                                    <td className="py-2.5 px-3 font-mono text-right">
                                      <span className="text-[10px] font-bold" style={{ color: vsColor }}>{vsLabel}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[10px] text-[#334155] mt-2">
                          ★ Primary metric · Cheap = {ticker} trades at a discount to this peer on {primaryLabel} · Pricey = {ticker} trades at a premium · Source: {livePeers.length > 0 ? "Yahoo Finance (live)" : "yfinance/FMP (report)"}
                        </p>
                      </div>
                    )}
                    <PeerBarChart peers={peerData} subjectTicker={ticker} metric="ev_ebitda" label="EV/EBITDA" />
                    {(() => {
                      const vh = s6.val_history as any;
                      if (!vh || (!vh.pe_range && !vh.pb_range && !vh.ev_ebitda_range)) return null;
                      return (
                        <div className="mt-6">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-4">Historical Valuation Context — 5Y Range</p>
                          <ValuationThermometer label="EV/EBITDA" range={vh.ev_ebitda_range} />
                          <ValuationThermometer label="P/E (Trailing)" range={vh.pe_range} />
                          <ValuationThermometer label="P/B" range={vh.pb_range} />
                          <p className="text-[10px] text-[#334155] mt-1">Source: yfinance [CALCULATED] — dot = current, bar = 5Y range, line = 5Y avg</p>
                        </div>
                      );
                    })()}
                    {metricFields.length === 0 && peerData.length === 0 && (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}

                    {/* Brand Value (Upgrade 2) — B2C companies only */}
                    {(() => {
                      const bv  = s2.brand_value as string | null | undefined;
                      const br  = s2.brand_rank  as string | null | undefined;
                      const rl  = s2.ranking_list as string | null | undefined;
                      const bsrc = s2.brand_source as string | null | undefined;
                      const sector = String(fv(s2.sector) ?? "");
                      const isB2C = ["Consumer Cyclical", "Consumer Defensive", "Communication Services"].includes(sector);
                      if (!isB2C || (!bv && !br)) return null;
                      return (
                        <div className="mt-4 pt-4 border-t border-[#1E2D4A]/60">
                          <p className="text-[10px] font-semibold text-[#60A5FA] uppercase tracking-wider mb-2">Brand Value</p>
                          <div className="flex flex-wrap gap-3">
                            {bv && (
                              <div className="bg-[#0B1628] rounded-lg px-3 py-2 text-xs">
                                <span className="text-[#64748B]">Brand Value: </span>
                                <span className="font-bold text-[#10B981]">{bv}</span>
                              </div>
                            )}
                            {br && (
                              <div className="bg-[#0B1628] rounded-lg px-3 py-2 text-xs">
                                <span className="text-[#64748B]">{rl ?? "Brand Ranking"}: </span>
                                <span className="font-bold text-[#60A5FA]">{br}</span>
                              </div>
                            )}
                          </div>
                          <p className="mt-1 text-[10px] text-[#334155]">Source: {bsrc ?? "Kantar BrandZ / Interbrand via Tavily"} <TagBadge source="tavily" /></p>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S14 — Where We Differ (moved here: contrarian thesis visible before supporting data) */}
          <div id="s14" data-section>
            <Section n={14} id="s14" title="Where We Differ" color="#F59E0B">
              {(() => {
                const narrative     = fv(s14.ai_where_we_differ);
                const curPrice      = fv(s14.current_price);
                const analystPT     = fv(s14.analyst_pt_mean);
                const analystRating = fv(s14.analyst_rating);
                const ourDcf        = fv(s14.our_dcf_implied);
                const fmpDcf        = fv(s14.fmp_dcf_crosscheck);
                const ourDir  = direction !== "—" ? direction : fv(s14.direction);
                const ourConv = Number(fv(rec.conviction_score ?? rec.conviction) ?? 0) || null;

                const streetParts: string[] = [];
                if (analystPT != null) streetParts.push(`Consensus PT: ${fmt$(analystPT)}`);
                if (analystRating) streetParts.push(`Rating: ${String(analystRating).toUpperCase()}`);
                if (curPrice != null) streetParts.push(`vs Current: ${fmt$(curPrice)}`);

                const ourParts: string[] = [];
                if (ourDir) ourParts.push(`Direction: ${ourDir}`);
                if (ourConv) ourParts.push(`Conviction: ${ourConv}/100`);
                if (ourDcf != null) ourParts.push(`Our DCF: ${fmt$(ourDcf)}`);
                if (fmpDcf != null) ourParts.push(`FMP DCF: ${fmt$(fmpDcf)}`);

                const hasData = streetParts.length > 0 || ourParts.length > 0 || narrative;
                const leadSentence = narrative
                  ? String(narrative).split(/(?<=[.!?])\s+/)[0] ?? String(narrative).slice(0, 200)
                  : null;
                return (
                  <>
                    {leadSentence && (
                      <blockquote className="mb-5 pl-4 py-3 pr-4 rounded-r-xl border-l-4 border-[#F59E0B]"
                        style={{ background: "linear-gradient(90deg, #1C160A 0%, #0D1626 100%)" }}>
                        <p className="text-sm font-semibold text-[#FCD34D] leading-relaxed">{leadSentence}</p>
                        <p className="text-[10px] text-[#92400E] mt-1 uppercase tracking-wider">Haz Capital view — where we differ from consensus</p>
                      </blockquote>
                    )}
                    {ourParts.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div className="bg-[#0D1626] border border-[#1E2D4A] rounded-xl p-4">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Street Consensus</p>
                          <p className="text-xs text-[#334155] leading-relaxed">
                            Analyst price targets and buy/hold/sell counts are shown in full in{" "}
                            <span className="text-[#2D6BFF]">Section 10 — Institutional Activity</span>.
                          </p>
                        </div>
                        <div className="bg-[#0D1626] border border-[#2D6BFF]/40 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-[#2D6BFF] uppercase tracking-wider mb-3">Our View</p>
                          <div className="space-y-1.5">
                            {ourParts.map((p, i) => {
                              const [lbl, val] = p.split(": ");
                              return <KV key={i} label={lbl} value={val} />;
                            })}
                          </div>
                          <TagBadge source="Haz Capital" />
                        </div>
                      </div>
                    )}
                    {narrative && (
                      <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap">
                        {narrative}
                        <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
                    )}
                    {!hasData && <p className="text-xs text-[#475569]">Data unavailable</p>}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* SC — SOTP Valuation */}
          <div id="sc" data-section>
            <Section n={"C" as any} id="sc" title="SOTP Valuation" color="#D97706">
              <SOTPSection s_c={s_c} />
            </Section>
          </div>

          {/* S7 — Technical Analysis */}
          <div id="s7" data-section>
            <Section n={7} id="s7" title="Technical Analysis" color="#F59E0B">
              <div className="mb-5">
                <CandlestickChart ticker={ticker} />
              </div>
              {(() => {
                const rsi = Number(fv(s7.rsi ?? s7.rsi_14));
                const rsiColor = rsi >= 70 ? "#F59E0B" : rsi <= 30 ? "#10B981" : "#2D6BFF";
                const rsiLabel = rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : "Neutral";
                const quantScore = Number(fv(s7.quant_score));
                const quantColor = quantScore >= 70 ? "#10B981" : quantScore >= 40 ? "#F59E0B" : "#EF4444";
                return (
                  <>
                    <div className="flex items-start gap-6 mb-5 flex-wrap">
                      {!isNaN(rsi) && rsi > 0 && (
                        <div className="flex flex-col items-center gap-1">
                          <SemiGauge value={rsi} max={100} color={rsiColor} size={88} />
                          <span className="text-[10px] font-bold" style={{ color: rsiColor }}>{rsiLabel}</span>
                          <span className="text-[10px] text-[#475569]">RSI(14)</span>
                        </div>
                      )}
                      {!isNaN(quantScore) && quantScore > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] text-[#475569] uppercase tracking-wider">Quant Score</p>
                          <div className="flex items-center gap-3">
                            <div className="w-32 h-2 bg-[#1E2D4A] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${quantScore}%`, background: quantColor }} />
                            </div>
                            <span className="text-sm font-bold font-mono" style={{ color: quantColor }}>
                              {quantScore.toFixed(0)}
                            </span>
                          </div>
                          {fv(s7.trend_signal) && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border text-center"
                              style={{ color: quantColor, borderColor: `${quantColor}40`, background: `${quantColor}10` }}>
                              {fv(s7.trend_signal)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-8">
                      {[
                        ["MACD Signal",   s7.macd_signal],
                        ["SMA 50",        s7.sma_50],
                        ["SMA 200",       s7.sma_200],
                        ["BB Position",   s7.bb_position],
                        ["ATR %",         s7.atr_pct != null ? fmtPct(s7.atr_pct) : null],
                        ["Support",       s7.support != null ? fmt$(s7.support) : null],
                        ["Resistance",    s7.resistance != null ? fmt$(s7.resistance) : null],
                        ["Trend",         s7.trend],
                        ["OBV Trend",     s7.obv_trend],
                        ["Entry Context", s7.trend_context ?? null],
                      ].filter(([, v]) => v != null && fv(v) != null).map(([label, value]) => (
                        <KV key={label as string} label={label as string}
                          value={typeof value === "object" ? <>{fv(value)}<TagBadge source={fs(value)} /></> : String(fv(value))}
                        />
                      ))}
                    </div>

                    {/* Quant score breakdown */}
                    {(() => {
                      const rawDetail = s7.quant_score_detail as Record<string, string> | null | undefined;
                      const detail = rawDetail ? Object.values(rawDetail) : [];
                      if (!detail.length) return null;
                      return (
                        <div className="mt-5 rounded-xl border border-[#1E2D4A] overflow-hidden">
                          <div className="bg-[#0D1626] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">Quant Score Breakdown</div>
                          <div className="divide-y divide-[#1E2D4A]">
                            {detail.map((line, i) => {
                              const isPos = line.startsWith("+");
                              const isZero = line.startsWith("0 ");
                              const col = isPos ? "#10B981" : isZero ? "#475569" : "#EF4444";
                              const parts = line.split(" ");
                              return (
                                <div key={i} className="flex items-start gap-3 px-4 py-2 text-xs">
                                  <span className="font-mono font-bold shrink-0 mt-px" style={{ color: col }}>{parts[0]}</span>
                                  <span style={{ color: "var(--text-secondary)" }}>{parts.slice(1).join(" ")}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {fv(s7.quant_summary) && (
                      <p className="text-xs text-[#94A3B8] mt-4 leading-relaxed">{fv(s7.quant_summary)}</p>
                    )}

                    {/* AI Chart Pattern Analysis */}
                    {(s7.ai_chart_pattern || s7.ai_pattern_evidence || s7.ai_outlook_4_8w) && (
                      <div className="mt-5 rounded-xl border border-[#1E2D4A] overflow-hidden">
                        <div className="bg-[#0D1626] px-4 py-2 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#475569]">Pattern Analysis</span>
                          <TagBadge source="claude-haiku" />
                        </div>
                        <div className="p-4 space-y-3">
                          {s7.ai_chart_pattern && (
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-[#475569] uppercase tracking-wider w-28 shrink-0">Detected Pattern</span>
                              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s7.ai_chart_pattern}</span>
                            </div>
                          )}
                          {s7.ai_pattern_evidence && (
                            <div>
                              <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Evidence</p>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s7.ai_pattern_evidence}</p>
                            </div>
                          )}
                          {s7.ai_pattern_invalidation && (
                            <div>
                              <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Invalidation Level</p>
                              <p className="text-xs leading-relaxed text-[#F59E0B]">{s7.ai_pattern_invalidation}</p>
                            </div>
                          )}
                          {s7.ai_entry_explanation && (
                            <div>
                              <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Entry Quality</p>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s7.ai_entry_explanation}</p>
                            </div>
                          )}
                          {s7.ai_outlook_4_8w && (
                            <div className="rounded-lg bg-[#080C14] border border-[#1E2D4A] px-3 py-2">
                              <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">4–8 Week Outlook</p>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>{s7.ai_outlook_4_8w}</p>
                            </div>
                          )}
                          {s7.ai_volume_narrative && (
                            <div>
                              <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Volume Context</p>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s7.ai_volume_narrative}</p>
                            </div>
                          )}
                          {s7.ai_momentum_read && (
                            <div>
                              <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-1">Momentum Read</p>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s7.ai_momentum_read}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S8 — Competitive Moat */}
          <div id="s8" data-section>
            <Section n={8} id="s8" title="Competitive Moat" color="#10B981">
              {(() => {
                const aiNarr     = s8.ai_narrative as any;
                const moatRating = aiNarr?.moat_rating ?? null;
                const narrative  = aiNarr?.narrative   ?? null;
                const headlines  = (s8.recent_headlines ?? []) as string[];
                const moatTotal  = s8.moat_score_total as number | null ?? null;
                const moatLabel  = s8.moat_score_label as string | null ?? null;
                const dim5       = s8.moat_dim5_score  as number | null ?? null;
                const moatQuant  = (s8.moat_quant ?? {}) as Record<string, { score: number; label: string; value?: string | null; source?: string }>;
                const quant4     = Object.values(moatQuant);

                const scoreColor = moatTotal === null ? "#475569"
                  : moatTotal >= 75 ? "#10B981"
                  : moatTotal >= 52 ? "#60A5FA"
                  : moatTotal >= 32 ? "#F59E0B"
                  : "#EF4444";

                const hasAi = moatRating || narrative;

                return (
                  <div className="space-y-5">
                    {/* Moat Score summary row */}
                    {moatTotal !== null && (
                      <div className="flex flex-wrap items-center gap-4 bg-[#080C14] border border-[#1E2D4A] rounded-xl p-4">
                        <div className="flex items-end gap-2">
                          <span className="text-4xl font-bold font-mono" style={{ color: scoreColor }}>{moatTotal}</span>
                          <span className="text-lg text-[#475569] mb-1">/100</span>
                        </div>
                        <div>
                          <p className="text-base font-semibold" style={{ color: scoreColor }}>{moatLabel}</p>
                          <p className="text-[10px] text-[#475569]">Composite moat score · 5 dimensions</p>
                        </div>
                        {moatRating && (
                          <span className="ml-auto text-[11px] font-bold px-3 py-1 rounded-lg border"
                            style={{
                              color: moatRating === "Wide" ? "#10B981" : moatRating === "Narrow" ? "#F59E0B" : "#EF4444",
                              borderColor: moatRating === "Wide" ? "#10B98140" : moatRating === "Narrow" ? "#F59E0B40" : "#EF444440",
                              background: moatRating === "Wide" ? "#10B98112" : moatRating === "Narrow" ? "#F59E0B12" : "#EF444412",
                            }}>
                            {moatRating} Moat
                            <span className="ml-1.5 text-[10px] font-bold px-1 py-px rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">AI</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* 5-dimension breakdown bars */}
                    {(quant4.length > 0 || dim5 !== null) && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wide">Dimension Breakdown</p>
                        {quant4.map((dim, i) => (
                          <div key={i} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-[#94A3B8]">{dim.label}</span>
                              <div className="flex items-center gap-2">
                                {dim.value && <span className="font-mono text-[#475569]">{dim.value}</span>}
                                <span className="font-bold text-white font-mono">{dim.score}<span className="text-[#475569]">/20</span></span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-[#1E2D4A] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${(dim.score / 20) * 100}%`, background: scoreColor }} />
                            </div>
                          </div>
                        ))}
                        {dim5 !== null && (
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-[#94A3B8] flex items-center gap-1">
                                Competitive Position
                                <span className="text-[10px] font-bold px-1 py-px rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">AI</span>
                              </span>
                              <span className="font-bold text-white font-mono">{dim5}<span className="text-[#475569]">/20</span></span>
                            </div>
                            <div className="h-1.5 bg-[#1E2D4A] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${(dim5 / 20) * 100}%`, background: scoreColor }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Context grid */}
                    <div className="grid grid-cols-2 gap-x-8">
                      {[["Sector", s8.sector], ["Industry", s8.industry], ["Peer Count", s8.peer_count]].filter(([, v]) => fv(v) != null).map(([l, v]) => (
                        <KV key={l as string} label={l as string}
                          value={<>{fv(v)}{fs(v) && <TagBadge source={fs(v)} />}</>} />
                      ))}
                    </div>

                    {/* AI Narrative */}
                    {narrative && (
                      <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap">
                        {narrative}
                        <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
                    )}
                    {!hasAi && headlines.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Recent Context</p>
                        <ul className="space-y-1.5">
                          {headlines.slice(0, 5).map((h, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                              <span className="text-[#475569] shrink-0">·</span>{h}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!hasAi && moatTotal === null && headlines.length === 0 && (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}

                    {/* Subscriber Comparison (Upgrade 3) */}
                    {(() => {
                      const subComp = (s8 as any).subscriber_comparison ?? {};
                      const comps   = (subComp.competitors ?? []) as any[];
                      if (!comps.length) return null;
                      const sorted = [...comps].sort((a, b) => (b.subscribers_m ?? 0) - (a.subscribers_m ?? 0));
                      const maxVal = sorted[0]?.subscribers_m ?? 1;
                      return (
                        <div className="mt-5 pt-5 border-t border-[#1E2D4A]/60">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">
                            Subscriber / User Comparison (millions)
                            <span className="ml-1 text-[10px] text-[#FBBF24] font-normal">[AI extracted from Tavily]</span>
                          </p>
                          <div className="space-y-2">
                            {sorted.map((c: any, i: number) => {
                              const pct = Math.max(4, Math.round((c.subscribers_m / maxVal) * 100));
                              return (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="text-[10px] text-[#94A3B8] w-28 shrink-0 truncate">{c.name}</div>
                                  <div className="flex-1 bg-[#0A1020] rounded-full h-4 overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${pct}%`, background: i === 0 ? "#2D6BFF" : "#1E3A5F" }}
                                    />
                                  </div>
                                  <div className="text-[10px] font-mono text-[#94A3B8] w-14 text-right shrink-0">
                                    {c.subscribers_m?.toFixed(1)}M
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {subComp.source && (
                            <p className="mt-2 text-[10px] text-[#334155]">{subComp.source}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </Section>
          </div>

          {/* SB — Porter's Five Forces */}
          <div id="sb" data-section>
            <Section n={"B" as any} id="sb" title="Porter's Five Forces" color="#F97316">
              <PorterFiveForcesSection s_porter={s_porter} />
            </Section>
          </div>

          {/* S9 — Industry & Macro */}
          <div id="s9" data-section>
            <Section n={9} id="s9" title="Industry & Macro" color="#2D6BFF">
              {(() => {
                const aiNarr  = s9.ai_narrative as any;
                const narrative     = fv(aiNarr);
                const competitive   = aiNarr?.competitive_dynamics as string | undefined;
                const ipoRisk       = aiNarr?.ipo_and_event_risk as string | null | undefined;
                const tailwinds     = aiNarr?.tailwinds ?? [];
                const headwinds     = aiNarr?.headwinds ?? [];
                const AiBadge = () => (
                  <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                );
                // Macro stats from direct FRED fields on the section
                const macroFields = ([
                  ["10Y Yield",    s9.risk_free_rate],
                  ["Fed Funds",    s9.fed_funds_rate],
                  ["GDP Growth",   s9.gdp_growth],
                  ["Unemployment", s9.unemployment],
                ] as [string, any][]).filter(([, v]) => fv(v) != null);
                const hasContent = narrative || competitive || tailwinds.length > 0 || headwinds.length > 0 || macroFields.length > 0;
                return (
                  <>
                    {macroFields.length > 0 && (
                      <div className="mb-5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                          {macroFields.map(([label, v]) => (
                            <StatCard key={label as string} label={label as string}
                              value={`${fmtN(v, 2)}%`} source={fs(v)} />
                          ))}
                        </div>
                        <p className="text-[10px] text-[#334155]">
                          Exposure for <span className="text-[#60A5FA] font-mono">{ticker}</span> to these macro factors — see Tailwinds &amp; Headwinds below.
                          <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                        </p>
                      </div>
                    )}
                    {/* Industry overview */}
                    {narrative && (
                      <p className="text-xs text-[#94A3B8] leading-relaxed mb-4 whitespace-pre-wrap">
                        {narrative}<AiBadge />
                      </p>
                    )}
                    {/* Competitive dynamics */}
                    {competitive && (
                      <div className="mb-4 p-3 rounded-xl bg-[#0D1928] border border-[#1E3A5F]/60">
                        <p className="text-[10px] font-bold text-[#60A5FA] uppercase tracking-wider mb-1.5">Competitive Dynamics</p>
                        <p className="text-xs text-[#94A3B8] leading-relaxed">{competitive}<AiBadge /></p>
                      </div>
                    )}
                    {/* IPO / Event Risk */}
                    {ipoRisk && ipoRisk !== "null" && (
                      <div className="mb-5 p-3 rounded-xl bg-[#1A120A] border border-[#92400E]/60">
                        <p className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider mb-1.5">IPO &amp; Event Impact</p>
                        <p className="text-xs text-[#94A3B8] leading-relaxed">{ipoRisk}<AiBadge /></p>
                      </div>
                    )}
                    {/* Tailwinds / Headwinds */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {tailwinds.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-[#10B981] uppercase tracking-wider mb-2">Tailwinds</p>
                          <ul className="space-y-1.5">
                            {tailwinds.map((t: any, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                                <span className="text-[#10B981] shrink-0">+</span>
                                {typeof t === "string" ? t : (t.text ?? t.description ?? JSON.stringify(t))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {headwinds.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider mb-2">Headwinds</p>
                          <ul className="space-y-1.5">
                            {headwinds.map((h: any, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                                <span className="text-[#EF4444] shrink-0">!</span>
                                {typeof h === "string" ? h : (h.text ?? h.description ?? JSON.stringify(h))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {!hasContent && <p className="text-xs text-[#475569]">Data unavailable</p>}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S10 — Institutional */}
          <div id="s10" data-section>
            <Section n={10} id="s10" title="Institutional Activity" color="#F59E0B">
              {(() => {
                const instPct    = fv(s10.institutional_pct ?? s10.institutional_ownership);
                const insiderPct = fv(s10.insider_pct ?? s10.insider_ownership);
                const holders    = s10.top_holders ?? s10.major_holders ?? [];
                const insiderTrades = s10.insider_trades ?? s10.sec_trades ?? [];
                const consensus  = s10.analyst_ratings ?? s10.analyst_consensus ?? {};
                const pts        = s10.analyst_price_targets ?? {};
                const ptMean     = fv(s10.price_target_mean ?? pts.mean ?? consensus.mean_target);
                const ptHigh     = fv(s10.price_target_high ?? pts.high ?? consensus.high_target);
                const ptLow      = fv(s10.price_target_low  ?? pts.low  ?? consensus.low_target);
                const buyCnt     = Number(fv(consensus.buy_count  ?? s10.analyst_buy_count  ?? 0));
                const holdCnt    = Number(fv(consensus.hold_count ?? s10.analyst_hold_count ?? 0));
                const sellCnt    = Number(fv(consensus.sell_count ?? s10.analyst_sell_count ?? 0));
                const totalAnal  = buyCnt + holdCnt + sellCnt;
                return (
                  <>
                    <OwnershipDonut instPct={instPct != null ? Number(instPct) : null}
                      insiderPct={insiderPct != null ? Number(insiderPct) : null}
                      instSource={fs(s10.institutional_pct)} insiderSource={fs(s10.insider_pct)} />
                    {holders.length > 0 && (
                      <div className="mb-5">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Top Institutional Holders</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#1E2D4A]">
                              <th className="text-[10px] font-medium text-[#475569] text-left pb-2 px-2">Institution</th>
                              <th className="text-[10px] font-medium text-[#475569] text-right pb-2 px-2">Shares / %</th>
                              <th className="text-[10px] font-medium text-[#475569] text-right pb-2 px-2">Source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(holders as any[]).slice(0, 8).map((h: any, i: number) => (
                              <tr key={i} className="border-b border-[#1E2D4A]/50">
                                <td className="py-2 px-2 text-[#94A3B8]">{fv(h.holder) ?? fv(h.name) ?? fv(h.institution) ?? "—"}</td>
                                <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">
                                  {fv(h.shares) != null ? Number(fv(h.shares)).toLocaleString() : "Not disclosed"}
                                  {fv(h.pct_held ?? h.pct) != null ? ` (${Number(fv(h.pct_held ?? h.pct)).toFixed(1)}%)` : ""}
                                </td>
                                <td className="py-2 px-2 text-right">{h.source && <TagBadge source={typeof h.source === "string" ? h.source : fv(h.holder) ? "yfinance" : ""} />}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {insiderTrades.length > 0 && (
                      <div className="mb-5">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">
                          SEC Insider Transactions
                          <span className="ml-2 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#1E3A5F] text-[#60A5FA] border border-[#2D6BFF]/30">SEC</span>
                        </p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#1E2D4A]">
                              {["Date", "Name", "Transaction", "Shares", "Price"].map((h) => (
                                <th key={h} className="text-[10px] font-medium text-[#475569] text-right first:text-left pb-2 px-2">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(insiderTrades as any[]).slice(0, 6).map((t: any, i: number) => {
                              const txn = String(fv(t.transaction_type ?? t.transaction ?? t.type) ?? "");
                              const isBuy = /buy|purchase|acqui/i.test(txn);
                              const sharesVal = fv(t.shares);
                              const priceVal  = fv(t.price);
                              const nameVal   = fv(t.name ?? t.insider ?? t.reportingName);
                              const url       = t.filing_url as string | undefined;
                              return (
                                <tr key={i} className="border-b border-[#1E2D4A]/50">
                                  <td className="py-2 px-2 font-mono text-[#475569]">{fv(t.date) ?? "—"}</td>
                                  <td className="py-2 px-2 text-[#94A3B8]">
                                    {url && nameVal
                                      ? <a href={url} target="_blank" rel="noreferrer" className="hover:text-white underline underline-offset-2">{nameVal}</a>
                                      : (nameVal ?? "—")}
                                  </td>
                                  <td className={`py-2 px-2 font-mono text-right font-bold ${isBuy ? "text-[#10B981]" : txn ? "text-[#EF4444]" : "text-[#475569]"}`}>
                                    {txn || "Form 4"}
                                  </td>
                                  <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">
                                    {sharesVal != null ? Number(sharesVal).toLocaleString() : "—"}
                                  </td>
                                  <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">{priceVal != null ? fmt$(priceVal) : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <AnalystBar buyCnt={buyCnt} holdCnt={holdCnt} sellCnt={sellCnt} />
                    {(ptMean ?? ptHigh ?? ptLow) && (
                      <div className="grid grid-cols-3 gap-2 mb-5">
                        {ptMean != null && <StatCard label="Mean PT" value={fmt$(ptMean)} color="#2D6BFF" />}
                        {ptHigh != null && <StatCard label="High PT" value={fmt$(ptHigh)} color="#10B981" />}
                        {ptLow  != null && <StatCard label="Low PT"  value={fmt$(ptLow)}  color="#EF4444" />}
                      </div>
                    )}
                    {instPct == null && holders.length === 0 && insiderTrades.length === 0 && totalAnal === 0 && (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S10b — Management & Governance */}
          <div id="s10b" data-section>
            <Section n={"10b" as any} id="s10b" title="Management & Governance" color="#2D6BFF">
              <ManagementGovernanceSection s10b={s10b} />
            </Section>
          </div>

          {/* SH — ESG & Sustainability */}
          <div id="sh" data-section>
            <Section n={"H" as any} id="sh" title="ESG & Sustainability" color="#10B981">
              <ESGSection s_esg={s_esg} />
            </Section>
          </div>

          {/* SJ — M&A Track Record */}
          <div id="sj" data-section>
            <Section n={"J" as any} id="sj" title="M&A Track Record" color="#8B5CF6">
              <MaTrackRecordSection s_ma={s_ma} />
            </Section>
          </div>

          {/* S11 — Risk Register */}
          <div id="s11" data-section>
            <Section n={11} id="s11" title="Risk Register" color="#EF4444">
              {(() => {
                const aiReg   = s11.ai_risk_register as any;
                const risks   = aiReg?.risks ?? [];
                const rawText = aiReg?.value ?? null;
                const finSnap = (s11.financials_snapshot ?? {}) as any;
                const beta  = fv(finSnap.beta ?? s11.beta);
                const de    = fv(finSnap.debt_to_equity ?? s11.debt_to_equity ?? s11.de_ratio);
                const cr    = fv(finSnap.current_ratio ?? s11.current_ratio);
                const headlines = (s11.recent_headlines ?? []) as string[];
                return (
                  <>
                    {/* Financial snapshot — risk-relevant metrics only (valuation metrics → S6, RSI → S7) */}
                    {(beta != null || de != null || cr != null) && (
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        {beta != null && <StatCard label="Beta" value={fmtN(beta, 2)} source={fs(finSnap.beta)} color={Number(beta) > 1.5 ? "#EF4444" : Number(beta) < 0.8 ? "#10B981" : "#94A3B8"} />}
                        {de   != null && <StatCard label="D/E Ratio" value={fmtN(de, 2)} source={fs(finSnap.debt_to_equity)} color={Number(de) > 2 ? "#EF4444" : "#94A3B8"} />}
                        {cr   != null && <StatCard label="Current Ratio" value={fmtN(cr, 2)} source={fs(finSnap.current_ratio)} color={Number(cr) < 1 ? "#EF4444" : Number(cr) > 2 ? "#10B981" : "#94A3B8"} />}
                      </div>
                    )}
                    {(beta != null || de != null || cr != null) && (
                      <p className="text-[10px] text-[#334155] mb-5">
                        For valuation multiples (P/E, EV/EBITDA) see <span className="text-[#2D6BFF]">Section 6</span> · For RSI see <span className="text-[#2D6BFF]">Section 7</span>
                      </p>
                    )}
                    {risks.length > 0 ? (
                      <div className="mb-5 space-y-3">
                        {(risks as any[]).map((r: any, i: number) => {
                          const likeColor = r.likelihood === "High" ? "#EF4444" : r.likelihood === "Medium" ? "#F59E0B" : "#10B981";
                          const impColor  = r.impact     === "High" ? "#EF4444" : r.impact     === "Medium" ? "#F59E0B" : "#10B981";
                          const isHigh = r.likelihood === "High" && r.impact === "High";
                          const isMed  = !isHigh && (r.likelihood === "High" || r.impact === "High" || r.likelihood === "Medium" || r.impact === "Medium");
                          const severityBorder = isHigh ? "#EF4444" : isMed ? "#F59E0B" : "#10B981";
                          return (
                            <div key={i} className="bg-[#0D1626] border border-[#1E2D4A] rounded-xl p-4"
                              style={{ borderLeft: `3px solid ${severityBorder}` }}>
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-bold text-[#475569] w-5">{i + 1}.</span>
                                  <span className="text-xs font-bold text-white">{r.name ?? r.risk}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                  {r.category && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2D4A] text-[#94A3B8]">{r.category}</span>
                                  )}
                                  {r.likelihood && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                                      style={{ background: `${likeColor}15`, color: likeColor, border: `1px solid ${likeColor}30` }}>
                                      {r.likelihood}
                                    </span>
                                  )}
                                  {r.impact && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                                      style={{ background: `${impColor}15`, color: impColor, border: `1px solid ${impColor}30` }}>
                                      {r.impact} impact
                                    </span>
                                  )}
                                </div>
                              </div>
                              {(r.mechanism ?? r.detail ?? r.description) && (
                                <p className="text-[11px] text-[#94A3B8] leading-relaxed ml-7">
                                  {r.mechanism ?? r.detail ?? r.description}
                                </p>
                              )}
                              <span className="ml-7 mt-1 inline-block text-[10px] font-bold px-1 py-0 rounded leading-5 bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : rawText ? (
                      <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap mb-4">{rawText}
                        <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
                    ) : headlines.length > 0 ? (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Recent Context</p>
                        <ul className="space-y-1.5">
                          {headlines.slice(0, 6).map((h, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                              <span className="text-[#475569] shrink-0">·</span>{h}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : beta == null && de == null && cr == null ? (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    ) : null}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S12 — Scenario Analysis */}
          <div id="s12" data-section>
            <Section n={12} id="s12" title="Scenario Analysis" color="#10B981">
              {(() => {
                const bull = s12.bull ?? s12.bull_case ?? {};
                const base = s12.base ?? s12.base_case ?? {};
                const bear = s12.bear ?? s12.bear_case ?? {};
                const pwReturn = fv(s12.probability_weighted_return ?? s12.expected_return);
                const anyData = Object.keys(bull).length || Object.keys(base).length || Object.keys(bear).length;
                return (
                  <>
                    {anyData ? (() => {
                      const bearP   = Number(fv(bear.price_target));
                      const baseP   = Number(fv(base.price_target));
                      const bullP   = Number(fv(bull.price_target));
                      const curP    = Number(fv(report.current_price ?? s1.current_price) ?? 0);
                      const hasRange = bearP > 0 && baseP > 0 && bullP > 0 && curP > 0;
                      return (
                        <>
                          {hasRange && (
                            <div className="mb-5">
                              <PriceRangeChart
                                bearPrice={bearP} basePrice={baseP} bullPrice={bullP} currentPrice={curP}
                                bearUpside={fv(bear.upside_pct) ?? (bear.downside_pct != null ? -Number(fv(bear.downside_pct)) : null)}
                                baseUpside={fv(base.upside_pct)}
                                bullUpside={fv(bull.upside_pct)}
                                bearProb={fv(bear.probability)} baseProb={fv(base.probability)} bullProb={fv(bull.probability)}
                                pwReturn={pwReturn != null ? Number(pwReturn) : null}
                              />
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                            <ScenarioCard type="bear" price={bear.price_target} upside={bear.downside_pct != null ? -Number(fv(bear.downside_pct)) : bear.upside_pct} probability={bear.probability} source={bear.source} trigger={bear.trigger ?? bear.assumptions ?? bear.catalyst} />
                            <ScenarioCard type="base" price={base.price_target} upside={base.upside_pct} probability={base.probability} source={base.source} trigger={base.trigger ?? base.assumptions} />
                            <ScenarioCard type="bull" price={bull.price_target} upside={bull.upside_pct} probability={bull.probability} source={bull.source} trigger={bull.trigger ?? bull.assumptions ?? bull.catalyst} />
                          </div>
                          <p className="text-[10px] text-[#1E3A5F]">
                            Base = DCF model · Bull = analyst PT high · Bear = FMP stress / crosscheck
                          </p>
                        </>
                      );
                    })() : (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S13 — Sentiment */}
          <div id="s13" data-section>
            <Section n={13} id="s13" title="Sentiment" color="#2D6BFF">
              {(() => {
                const summary   = fv(s13.ai_sentiment);
                const shortPct  = fv(s13.short_interest_pct ?? s13.short_interest);
                const consensus = fv(s13.analyst_consensus);
                const newsItems = (s13.news_items ?? []) as any[];
                const hasStats = shortPct != null || consensus;
                // Derive a sentiment score proxy from available structured data
                const baseScore = consensus === "Buy" ? 70 : consensus === "Sell" ? 30 : consensus ? 50 : null;
                const shortAdj  = shortPct != null ? (Number(shortPct) > 15 ? -10 : Number(shortPct) < 5 ? 10 : 0) : 0;
                const sentScore = baseScore != null ? Math.min(100, Math.max(0, baseScore + shortAdj)) : null;
                const sentColor = sentScore != null ? (sentScore >= 65 ? "#10B981" : sentScore >= 40 ? "#2D6BFF" : "#EF4444") : "#475569";
                return (
                  <>
                    {sentScore != null && (
                      <div className="flex items-center gap-5 mb-5">
                        <SemiGauge value={sentScore} max={100} color={sentColor} size={88} />
                        <div>
                          <p className="text-[10px] text-[#475569] uppercase tracking-wider mb-0.5">Sentiment Score</p>
                          <p className="text-xs text-[#94A3B8]">[CALCULATED] from analyst consensus + short interest</p>
                        </div>
                      </div>
                    )}
                    {hasStats && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                        {shortPct != null && (
                          <StatCard label="Short Interest" value={`${Number(shortPct).toFixed(1)}%`}
                            source={fs(s13.short_interest_pct)}
                            color={Number(shortPct) > 15 ? "#EF4444" : Number(shortPct) < 5 ? "#10B981" : "#F59E0B"} />
                        )}
                        {consensus && <StatCard label="Analyst Consensus" value={consensus} source={fs(s13.analyst_consensus)} color="#94A3B8" />}
                      </div>
                    )}
                    {summary && (
                      <p className="text-xs text-[#94A3B8] leading-relaxed mb-5 whitespace-pre-wrap">
                        {summary}
                        <span className="ml-1 text-[10px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
                    )}
                    {!summary && newsItems.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Recent News ({newsItems.length} articles)</p>
                        <ul className="space-y-2">
                          {newsItems.slice(0, 6).map((n: any, i: number) => (
                            <li key={i} className="border-b border-[#1E2D4A] pb-2 last:border-0">
                              <p className="text-xs text-[#94A3B8]">{n.headline}</p>
                              {n.summary && <p className="text-[10px] text-[#475569] mt-0.5 leading-relaxed">{n.summary}</p>}
                              {n.date && <p className="text-[10px] text-[#1E2D4A] mt-0.5">{n.date}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!summary && !hasStats && newsItems.length === 0 && (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S14 — Where We Differ */}
          {/* S15 — Setup Checklist */}
          <div id="s15" data-section>
            <Section n={15} id="s15" title="Setup Checklist" color="#10B981">
              {(() => {
                const items  = s15.items ?? s15.checklist ?? s15.checks ?? [];
                const passed = items.filter((c: any) => c.pass ?? c.passed).length;
                const total  = items.length;
                const rate   = total > 0 ? passed / total : 0;
                const scoreColor = rate >= 0.75 ? "#10B981" : rate >= 0.5 ? "#F59E0B" : "#EF4444";
                return (
                  <>
                    {total > 0 && (
                      <>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="flex-1 h-2 bg-[#1E2D4A] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${rate * 100}%`, background: scoreColor }} />
                          </div>
                          <span className="text-sm font-bold font-mono shrink-0" style={{ color: scoreColor }}>
                            {passed}/{total} passed
                          </span>
                        </div>
                        <div>
                          {items.map((c: any, i: number) => (
                            <CheckItem
                              key={i}
                              passed={c.pass ?? c.passed ?? false}
                              name={c.name ?? c.item ?? c.check ?? "—"}
                              detail={c.detail ?? c.note ?? c.category}
                              source={c.source}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    {total === 0 && <p className="text-xs text-[#475569]">Data unavailable</p>}
                  </>
                );
              })()}
            </Section>
          </div>

          {/* S16 — Investment Committee Recommendation */}
          <div id="s16" data-section>
            <div className="mb-7 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
              {/* Gradient accent */}
              <div className="h-1" style={{ background: `linear-gradient(90deg, ${dirColor} 0%, ${dirColor}80 40%, transparent 100%)` }} />
              {/* Header */}
              <div className="px-6 py-4 flex items-center gap-3"
                style={{ background: "#080C14", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-mono font-bold shrink-0"
                  style={{ background: `${dirColor}18`, color: dirColor, border: `1px solid ${dirColor}40` }}>16</span>
                <h2 className="text-sm font-bold text-white tracking-wide">Investment Committee Recommendation</h2>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded border bg-[#78350F] text-[#FBBF24] border-[#F59E0B]/30">Sonnet 4.6</span>
              </div>

              <div className="px-6 py-6" style={{ background: "linear-gradient(180deg, #0A0E1A 0%, #0D1626 100%)", border: `1px solid ${dirColor}20`, borderTop: "none" }}>
                {/* Investment arguments — shown FIRST, most important output of the report */}
                {(() => {
                  const args = s16.three_arguments ?? s16.investment_arguments ?? s16.arguments ?? rec.arguments ?? [];
                  return args.length > 0 ? (
                    <div className="mb-7">
                      <p className="text-[10px] font-bold text-[#2D6BFF] uppercase tracking-wider mb-4">Investment Arguments</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(args as any[]).slice(0, 3).map((arg: any, i: number) => {
                          const isStructured = typeof arg === "object" && arg !== null && ("title" in arg || "data_point" in arg || "reasoning" in arg);
                          const title    = isStructured ? (arg.title ?? null) : null;
                          const dataPt   = isStructured ? (arg.data_point ?? null) : null;
                          const body     = isStructured
                            ? (arg.reasoning ?? arg.argument ?? arg.text ?? "")
                            : (typeof arg === "string" ? arg : (arg.argument ?? arg.thesis ?? arg.text ?? JSON.stringify(arg)));
                          return (
                            <div key={i} className="rounded-xl p-4 border flex flex-col"
                              style={{ background: "#080C14", borderColor: "#1E2D4A" }}>
                              <div className="flex items-center gap-2 mb-2.5">
                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold font-mono shrink-0"
                                  style={{ background: "#2D6BFF20", color: "#60A5FA", border: "1px solid #2D6BFF30" }}>{i + 1}</span>
                                {title && (
                                  <span className="text-[11px] font-semibold text-[#CBD5E1] leading-tight">{title}</span>
                                )}
                                <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, #2D6BFF30, transparent)" }} />
                              </div>
                              {dataPt && (
                                <div className="mb-2 px-2 py-1 rounded bg-[#0D1E38] border border-[#2D6BFF]/20">
                                  <span className="text-[10px] text-[#2D6BFF] font-semibold">DATA: </span>
                                  <span className="text-[10px] text-[#60A5FA] font-mono">{dataPt}</span>
                                </div>
                              )}
                              <p className="text-xs text-[#94A3B8] leading-relaxed flex-1">{body}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Direction + Conviction + Key stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-7 items-center">
                  <div>
                    <div className="flex items-baseline gap-4 mb-4">
                      <span className="text-5xl font-bold font-mono" style={{ color: dirColor }}>{direction}</span>
                      <div>
                        <p className="text-[10px] text-[#475569] uppercase tracking-wider">{report.company_name ?? ticker}</p>
                        <p className="text-[10px] text-[#475569]">Sub-component scored conviction</p>
                      </div>
                    </div>
                    <ConvictionBar score={conviction} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Exp. Return 12M", value: fv(s16.expected_return_12m ?? rec.expected_return_12m), color: (() => { const v = fv(s16.expected_return_12m ?? rec.expected_return_12m); return v && String(v).startsWith("-") ? "#EF4444" : "#10B981"; })() },
                      { label: "Position Size",   value: fv(s16.position_size_pct ?? rec.suggested_size_pct) != null ? `${fv(s16.position_size_pct ?? rec.suggested_size_pct)}%` : null, color: "#94A3B8" },
                      { label: "Stop Loss",       value: fv(s16.stop_loss_pct ?? rec.stop_loss_pct) != null ? `-${fv(s16.stop_loss_pct ?? rec.stop_loss_pct)}%` : null, color: "#EF4444" },
                    ].filter(({ value }) => value != null).map(({ label, value, color }) => (
                      <StatCard key={label} label={label} value={value} color={color} />
                    ))}
                  </div>
                </div>

                {/* Key risks */}
                {(() => {
                  const risks = s16.key_risks ?? rec.key_risks ?? [];
                  return risks.length > 0 ? (
                    <div className="mb-6 rounded-xl border border-[#EF4444]/20 p-4" style={{ background: "#0A0205" }}>
                      <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider mb-3">Key Risks</p>
                      <ul className="space-y-2">
                        {(risks as any[]).slice(0, 3).map((r: any, i: number) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs text-[#94A3B8] border-b border-[#1E2D4A]/50 pb-2 last:border-0 last:pb-0">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                              style={{ background: "#EF444420", color: "#EF4444", border: "1px solid #EF444430" }}>!</span>
                            <span>{typeof r === "string" ? r : (r.risk ?? r.text ?? JSON.stringify(r))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}

                {/* Committee narrative */}
                {(() => {
                  const narrative = fv(s16.narrative ?? s16.committee_narrative ?? rec.narrative);
                  if (!narrative) return null;
                  const paras = String(narrative).split(/\n\n+/);
                  return (
                    <div className="rounded-xl border border-[#1E2D4A] overflow-hidden">
                      <div className="px-5 py-3 flex items-center gap-2" style={{ background: "#080C14", borderBottom: "1px solid #1E2D4A" }}>
                        <span className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Committee Narrative</span>
                        <span className="text-[10px] font-bold px-1.5 py-0 rounded leading-5 bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">Sonnet</span>
                      </div>
                      <div className="px-5 py-4 space-y-4" style={{ background: "#0A0E1A" }}>
                        {paras.map((p, i) => (
                          <p key={i} className="text-xs text-[#94A3B8] leading-relaxed">{p}</p>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* S17 — Data Reliability */}
          <div id="s17" data-section>
            <Section n={17} id="s17" title="Data Reliability" color="#475569">
              {(() => {
                const coverage   = fv(s17.coverage ?? s17.data_confidence);
                const explanation = fv(s17.explanation ?? s17.confidence_reason);
                const apiCount   = fv(s17.api_fields_count ?? s17.api_count);
                const aiCount    = fv(s17.ai_fields_count  ?? s17.ai_count);
                const naCount    = fv(s17.na_count);
                const conflicts  = fv(s17.conflicts_count  ?? s17.conflicts);
                const sources    = s17.sources ?? s17.api_sources ?? [];
                const elapsed    = fv(s17.fetch_elapsed_seconds ?? s17.elapsed_seconds);
                const coverageColor = /full/i.test(coverage ?? "") ? "#10B981" : /partial/i.test(coverage ?? "") ? "#F59E0B" : "#EF4444";
                return (
                  <>
                    {coverage && (
                      <div className="mb-4 flex items-center gap-3">
                        <span className="text-sm font-bold px-3 py-1 rounded-lg"
                          style={{ background: `${coverageColor}15`, color: coverageColor, border: `1px solid ${coverageColor}40` }}>
                          {coverage} Coverage
                        </span>
                        {explanation && <p className="text-xs text-[#475569]">{explanation}</p>}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                      {[
                        { label: "API Fields",  value: apiCount,   color: "#2D6BFF" as const },
                        { label: "AI Fields",   value: aiCount,    color: "#F59E0B" as const },
                        { label: "N/A Fields",  value: naCount,    color: "#475569" as const },
                        { label: "Conflicts",   value: conflicts,  color: (Number(conflicts) > 0 ? "#EF4444" : "#10B981") as string },
                      ].filter(({ value }) => value != null).map(({ label, value, color }) => (
                        <StatCard key={label} label={label} value={value} color={color} />
                      ))}
                    </div>
                    {sources.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">API Sources</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(sources as any[]).map((src: any, i: number) => {
                            const ok = src.status === "ok" || src.responded === true;
                            return (
                              <div key={i} className="flex items-center justify-between bg-[#0D1626] border border-[#1E2D4A] rounded-lg px-3 py-2">
                                <span className="text-xs text-[#94A3B8]">{src.name ?? src.source ?? src}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ok ? "text-[#10B981] bg-[#10B981]/10" : "text-[#EF4444] bg-[#EF4444]/10"}`}>
                                  {ok ? "OK" : src.status ?? "ERR"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-8">
                      <KV label="Generated At" value={report.generated_at} />
                      {elapsed != null && <KV label="Fetch Time" value={`${Number(elapsed).toFixed(1)}s`} />}
                    </div>
                  </>
                );
              })()}
            </Section>
          </div>

          {/* Footer */}
          <div className="mt-10 text-center">
            <p className="text-[10px] text-[#1E2D4A]">
              {ticker} &middot; Haz Capital Research &middot; {report.generated_at ?? ""}
            </p>
            <p className="text-[10px] text-[#1E2D4A] mt-1">
              For internal use only. Not investment advice.
            </p>
          </div>

        </main>
      </div>

      {/* Research AI chatbot — fixed bottom-right, pre-loaded with full report context */}
      <ResearchChatbot ticker={ticker} report={report} />

    </div>
  );
}
