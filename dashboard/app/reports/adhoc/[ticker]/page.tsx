/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CandlestickChart from "@/components/CandlestickChart";

// ─── Helper functions ────────────────────────────────────────────────────────
function fv(f: any): any {
  if (f !== null && typeof f === "object" && "value" in f) return f.value;
  return f;
}
function fs(f: any): string { return f?.source ?? ""; }
function fmt$(n: any): string { return n == null ? "—" : `$${Number(fv(n)).toFixed(2)}`; }
function fmtPct(n: any): string { const v = fv(n); return v == null ? "—" : `${Number(v).toFixed(1)}%`; }
function fmtBn(n: any): string {
  const raw = fv(n);
  if (raw == null) return "—";
  const v = Number(raw);
  if (isNaN(v)) return "—";
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}
function fmtN(n: any, dp = 1): string { const v = fv(n); return v == null ? "—" : Number(v).toFixed(dp); }
function usd(n: any) { return fmt$(n); }

// ─── Nav sections ────────────────────────────────────────────────────────────
const NAV = [
  { id: "s1",  n: 1,  label: "Fund Mandate" },
  { id: "s2",  n: 2,  label: "Company Overview" },
  { id: "s3",  n: 3,  label: "News & Catalysts" },
  { id: "s4",  n: 4,  label: "Historical Financials" },
  { id: "s5",  n: 5,  label: "Forward Est. & DCF" },
  { id: "s6",  n: 6,  label: "Valuation Metrics" },
  { id: "s7",  n: 7,  label: "Technical Analysis" },
  { id: "s8",  n: 8,  label: "Competitive Moat" },
  { id: "s9",  n: 9,  label: "Industry & Macro" },
  { id: "s10", n: 10, label: "Institutional" },
  { id: "s11", n: 11, label: "Risk Register" },
  { id: "s12", n: 12, label: "Scenario Analysis" },
  { id: "s13", n: 13, label: "Sentiment" },
  { id: "s14", n: 14, label: "Where We Differ" },
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
    <span className={`ml-1 inline-block text-[9px] font-bold px-1 py-0 rounded leading-5 align-middle border
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
    <div className="bg-[#131929] border border-[#1E2D4A] rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[10px] text-[#475569] uppercase tracking-wider font-medium">{label}</p>
      <p className={`font-mono font-bold ${large ? "text-2xl" : "text-lg"}`} style={{ color: color ?? "#E2E8F0" }}>
        {value ?? "—"}
        {source && <TagBadge source={source} />}
      </p>
    </div>
  );
}

function SectionHeader({ n, title, color = "#2D6BFF" }: { n: number; title: string; color?: string }) {
  return (
    <div className="bg-[#0D1626] border border-[#1E2D4A] rounded-t-xl overflow-hidden">
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${color}, transparent 60%)` }} />
      <div className="px-5 py-3.5 flex items-center gap-3">
        <span className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-mono font-bold shrink-0"
          style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
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
      <div className="bg-[#0F1623] border border-t-0 border-[#1E2D4A] px-5 py-5">
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
        <p className="text-[10px] text-[#475569] uppercase tracking-wider">criteria passed</p>
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
              <p className="text-[9px] font-mono" style={{ color }}>
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
          <p className="text-[9px] text-[#475569]">current</p>
        </div>
      </div>
    </div>
  );
}

function CheckItem({ passed, name, detail, source }: {
  passed: boolean; name: string; detail?: string; source?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#1E2D4A] last:border-0">
      <span className={`text-sm font-bold mt-0.5 shrink-0 w-4 text-center ${passed ? "text-[#10B981]" : "text-[#EF4444]"}`}>
        {passed ? "+" : "-"}
      </span>
      <div className="flex-1">
        <span className="text-xs text-[#E2E8F0]">{name}</span>
        {detail && <span className="text-[10px] text-[#475569] ml-2">{detail}</span>}
      </div>
      {source && <TagBadge source={source} />}
    </div>
  );
}

function ScenarioCard({ type, price, upside, probability, source, trigger }: {
  type: "bull" | "base" | "bear"; price: any; upside: any; probability: any; source?: string; trigger?: string;
}) {
  const cfg = {
    bull: { label: "Bull Case", color: "#10B981", border: "#10B981" },
    base: { label: "Base Case", color: "#2D6BFF", border: "#2D6BFF" },
    bear: { label: "Bear Case", color: "#EF4444", border: "#EF4444" },
  }[type];
  return (
    <div
      className="bg-[#0D1626] rounded-xl p-4 flex flex-col gap-2"
      style={{ borderLeft: `3px solid ${cfg.border}`, border: `1px solid ${cfg.border}30`, borderLeftWidth: 3, borderLeftColor: cfg.color }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
        {probability != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2D4A] text-[#94A3B8]">
            {fv(probability)}% prob
          </span>
        )}
      </div>
      <p className="text-2xl font-bold font-mono" style={{ color: cfg.color }}>{usd(price)}</p>
      {upside != null && (
        <p className="text-xs font-mono text-[#94A3B8]">
          {Number(fv(upside)) >= 0 ? "+" : ""}{fmtN(upside, 1)}%
        </p>
      )}
      {trigger && <p className="text-[10px] text-[#475569] leading-relaxed mt-1">{trigger}</p>}
      {source && <TagBadge source={source} />}
    </div>
  );
}

function HeatCell({ value, min, max }: { value: number; min: number; max: number }) {
  const range = max - min || 1;
  const t = (value - min) / range; // 0..1
  const r = Math.round(239 - t * (239 - 16));
  const g = Math.round(68 + t * (185 - 68));
  const b = Math.round(68 + t * (129 - 68));
  const bg = `rgba(${r},${g},${b},0.18)`;
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
    <div className="flex justify-between items-start py-1.5 border-b border-[#1E2D4A] last:border-0">
      <span className="text-xs text-[#475569]">{label}</span>
      <span className="text-xs font-mono text-right" style={{ color: color ?? "#94A3B8" }}>{value ?? "—"}</span>
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
                  fill="#2D6BFF22" stroke="#2D6BFF" strokeWidth={1.5} />
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
        <p className="text-[9px] text-[#334155] mt-1 text-right">
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

  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Margin Profile</p>
      <div className="grid grid-cols-1 gap-3">
        {metrics.map(({ key, label, color }) => {
          const latestVal = Number(fv(latest?.[key]) ?? NaN);
          if (isNaN(latestVal)) return null;
          const neg = latestVal < 0;
          const clampedLatest = Math.max(-100, Math.min(100, latestVal));
          return (
            <div key={key}>
              {/* Current bar + value */}
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] text-[#64748B] w-14 shrink-0">{label}</span>
                <div className="flex-1 relative bg-[#0F1929] rounded h-5 overflow-hidden">
                  <div className="h-full rounded transition-all" style={{
                    width: `${Math.abs(clampedLatest)}%`,
                    background: neg ? `#EF444455` : `${color}44`,
                    borderRight: `2px solid ${neg ? "#EF4444" : color}`,
                  }} />
                  {/* Mini year sparkline dots */}
                  <div className="absolute inset-0 flex items-center justify-end gap-1 pr-2">
                    {ordered.map((yr: any, idx: number) => {
                      const v = Number(fv(yr[key]) ?? NaN);
                      if (isNaN(v)) return null;
                      const dotColor = v < 0 ? "#EF4444" : color;
                      return (
                        <div key={idx} title={`${yr.label ?? fv(yr.year)}: ${v.toFixed(1)}%`}
                          className="rounded-full shrink-0"
                          style={{ width: 5, height: 5, background: dotColor, opacity: 0.6 + 0.4 * (idx / ordered.length) }} />
                      );
                    })}
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold w-16 text-right shrink-0"
                  style={{ color: neg ? "#EF4444" : color }}>
                  {latestVal >= 0 ? "" : "−"}{Math.abs(latestVal) >= 100 ? Math.abs(latestVal).toFixed(0) : Math.abs(latestVal).toFixed(1)}%
                </span>
              </div>
              {/* Trend micro-values */}
              <div className="flex gap-0 pl-[72px]">
                {ordered.map((yr: any, idx: number) => {
                  const v = Number(fv(yr[key]) ?? NaN);
                  return (
                    <div key={idx} className="flex-1 text-center">
                      <span className="text-[7px] font-mono" style={{ color: isNaN(v) ? "#1E2D4A" : v < 0 ? "#EF444488" : `${color}99` }}>
                        {isNaN(v) ? "—" : (v >= 0 ? "" : "−") + (Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1))}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* Year axis labels */}
        <div className="flex gap-0 pl-[72px]">
          {ordered.map((yr: any, idx: number) => (
            <div key={idx} className="flex-1 text-center">
              <span className="text-[7px] font-mono text-[#334155]">{yr.label ?? fv(yr.year)}</span>
            </div>
          ))}
        </div>
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
        <p className="text-[9px] text-[#1E3A5F] text-right pt-1">Highlighted = subject company · Source: yfinance</p>
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
            <path key={i} d={arc.path} fill={arc.color} opacity={arc.label === "Public Float" ? 0.4 : 0.85} />
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
                <p className="text-[9px] text-[#475569]">{ticker.toUpperCase()} · Haz Capital</p>
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
            <p className="text-[8px] text-[#1E2D4A] mt-1.5 text-center">Powered by GPT-4o · Report data only · Not investment advice</p>
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
function HistoricalFinancialsSection({ s4 }: { s4: any }) {
  const [view, setView] = useState<"annual" | "quarterly">("annual");

  const annual    = s4.years ?? s4.historical ?? s4.income_statement ?? [];
  const quarterly = s4.quarters ?? s4.quarterly ?? [];
  const historical = view === "annual" ? annual : quarterly;
  const earnings   = s4.earnings_surprises ?? s4.earnings_history ?? [];
  const hasQoQ     = quarterly.length > 0;

  const periodLabel = view === "annual" ? "Annual" : "Quarterly";
  const growthLabel = view === "annual" ? "YoY%" : "QoQ%";
  const yearLabel   = view === "annual" ? "Year" : "Quarter";

  return (
    <>
      {/* View toggle */}
      <div className="flex items-center gap-2 mb-5">
        {(["annual", "quarterly"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            disabled={v === "quarterly" && !hasQoQ}
            className={[
              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all",
              view === v
                ? "bg-[#2D6BFF] text-white"
                : "bg-[#0F1929] text-[#475569] border border-[#1E2D4A] hover:border-[#2D6BFF] hover:text-[#94A3B8]",
              v === "quarterly" && !hasQoQ ? "opacity-30 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}>
            {v === "annual" ? "Annual" : "Quarterly (QoQ)"}
            {v === "quarterly" && !hasQoQ && <span className="ml-1 opacity-60">— N/A</span>}
          </button>
        ))}
      </div>

      <RevenueBarChart years={historical} viewLabel={periodLabel} />
      <MarginChart years={historical} />

      {historical.length > 0 ? (
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E2D4A]">
                {[yearLabel, "Revenue", growthLabel, "Gross Margin", "EBITDA Margin", "Net Margin", "EPS", "FCF"].map((h) => (
                  <th key={h} className="text-[10px] font-medium text-[#475569] text-right first:text-left pb-2 px-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(historical as any[]).map((row: any, i: number) => {
                const yoy = fv(row.revenue_yoy);
                return (
                  <tr key={i} className={`border-b border-[#1E2D4A]/50 ${i === 0 ? "bg-[#0F1929]/60" : ""}`}>
                    <td className="py-2 px-2 font-mono text-white font-semibold">{row.label ?? fv(row.year)}</td>
                    <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">{fmtBn(row.revenue)}</td>
                    <td className={`py-2 px-2 font-mono text-right ${yoy == null ? "text-[#475569]" : Number(yoy) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                      {yoy == null ? "—" : `${Number(yoy) >= 0 ? "+" : ""}${Number(yoy).toFixed(1)}%`}
                      {fs(row.revenue) && <TagBadge source={fs(row.revenue)} />}
                    </td>
                    <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.gross_margin)) > 0 ? "text-[#94A3B8]" : "text-[#475569]"}`}>
                      {fmtPct(row.gross_margin)}</td>
                    <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.ebitda_margin)) > 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                      {fmtPct(row.ebitda_margin)}</td>
                    <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.net_margin)) > 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                      {fmtPct(row.net_margin)}</td>
                    <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">{fmt$(row.eps_diluted ?? row.eps)}</td>
                    <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.fcf)) >= 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                      {fmtBn(row.fcf)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-[#475569] mb-4">
          {view === "quarterly" ? "Quarterly data not available for this ticker." : "Historical financials unavailable."}
        </p>
      )}

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
  const sections = report.sections ?? {};
  const mandate   = report.mandate ?? {};
  const s1  = sections.s1_cover          ?? sections.s1_mandate         ?? {};
  const s2  = sections.s2_overview        ?? sections.s2_company         ?? {};
  const s3  = sections.s3_news            ?? {};
  const s4  = sections.s4_financials      ?? sections.s4_financial       ?? {};
  const s5  = sections.s5_dcf             ?? sections.s5_forward         ?? {};
  const s6  = sections.s6_valuation       ?? {};
  const s7  = sections.s7_technicals      ?? sections.s7_technical       ?? {};
  const s8  = sections.s8_competitive     ?? {};
  const s9  = sections.s9_industry        ?? {};
  const s10 = sections.s10_institutional  ?? {};
  const s11 = sections.s11_risks          ?? {};
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

  return (
    <div className="min-h-screen bg-[#0B0F19] pb-20" ref={sectionRefs}>

      {/* ── Sticky cover bar ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#0B0F19]/95 backdrop-blur border-b border-[#1E2D4A] px-4 py-3 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold font-mono text-white">{ticker}</span>
              <span
                className="text-sm font-bold px-3 py-0.5 rounded-lg"
                style={{ background: `${dirColor}18`, color: dirColor, border: `1px solid ${dirColor}40` }}
              >
                {direction}
              </span>
            </div>
            {report.company_name && (
              <span className="text-xs text-[#475569] hidden sm:block">{report.company_name}</span>
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
              className="text-[10px] px-3 py-1.5 rounded bg-[#131929] border border-[#1E2D4A] text-[#475569] hover:text-white hover:border-[#10B981] transition-all">
              Regenerate
            </button>
            <button onClick={handlePrint}
              className="text-[10px] px-3 py-1.5 rounded bg-[#131929] border border-[#1E2D4A] text-[#475569] hover:text-white hover:border-[#2D6BFF] transition-all">
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
              className="text-[10px] text-[#475569] hover:text-[#60A5FA] block mb-5 transition-colors">
              &larr; Research
            </Link>
            <nav className="space-y-px">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-all
                    ${activeSection === item.id
                      ? "text-white bg-[#131929] border-l-2 border-[#2D6BFF]"
                      : "text-[#475569] hover:text-[#94A3B8] hover:bg-[#131929]/50"}`}
                >
                  <span className="font-mono text-[9px] w-4 text-center opacity-50">{item.n}</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-6 px-2">
              <button onClick={() => router.push("/reports/adhoc")}
                className="w-full text-[11px] py-2 px-3 rounded-lg bg-[#131929] border border-[#1E2D4A] text-[#475569] hover:text-white hover:border-[#2D6BFF] transition-all">
                Run Another
              </button>
            </div>
          </div>
        </aside>

        {/* ── Report body ────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">

          {/* ── Report Hero Cover ─────────────────────────────────────────── */}
          {(() => {
            const expRet  = fv(rec.expected_return_12m);
            const posSz   = fv(rec.position_size_pct);
            const stopLs  = fv(rec.stop_loss_pct);
            const heroStats = [
              { label: "Price",        val: currentPrice ? fmt$(currentPrice) : null, color: "#E2E8F0" },
              { label: "Market Cap",   val: fmtBn(s1.market_cap) !== "—" ? fmtBn(s1.market_cap) : null, color: "#94A3B8" },
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
                      <p className="text-[9px] text-[#475569] uppercase tracking-widest mb-2">Conviction Score</p>
                      <ConvictionBar score={conviction} />
                    </div>
                  </div>

                  {/* Stat cards row */}
                  {heroStats.length > 0 && (
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(heroStats.length, 5)}, 1fr)` }}>
                      {heroStats.map(({ label, val, color }) => (
                        <div key={label} className="rounded-xl px-4 py-3 border" style={{ background: "#080C14", borderColor: "#1E2D4A" }}>
                          <p className="text-[9px] text-[#475569] uppercase tracking-widest mb-1.5">{label}</p>
                          <p className="text-xl font-bold font-mono" style={{ color }}>{val}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* S1 — Fund Mandate */}
          <div id="s1" data-section>
            <Section n={1} id="s1" title="Fund Mandate Checklist" color="#2D6BFF">
              {(() => {
                const checks   = mandate.checks ?? s1.checks ?? s1.checklist ?? [];
                const setupType = mandate.setup_type ?? fv(s1.setup_type);
                const passedCnt = checks.filter((c: any) => c.pass ?? c.passed).length;
                return (
                  <>
                    <div className="flex items-center justify-between gap-6 mb-5 flex-wrap">
                      <MandateRing passed={passedCnt} total={checks.length || 17} />
                      <div className="flex gap-2 flex-wrap">
                        {setupType && (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#2D6BFF]/10 text-[#60A5FA] border border-[#2D6BFF]/30">
                            Setup: {setupType}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${passedCnt === checks.length ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30" : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30"}`}>
                          {checks.length - passedCnt} criteria failing
                        </span>
                      </div>
                    </div>
                    {checks.length > 0 ? (
                      <div className="border-t border-[#1E2D4A] pt-2">
                        {checks.map((c: any, i: number) => (
                          <CheckItem
                            key={i}
                            passed={c.pass ?? c.passed ?? false}
                            name={c.name ?? c.item ?? c.check ?? "—"}
                            detail={c.detail ?? c.note}
                            source={c.source}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#475569]">No mandate checks available.</p>
                    )}
                  </>
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
                    {narrative ? (
                      <div className="mb-5">
                        <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap">
                          {narrative}
                          <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
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
                      <p className="text-xs text-[#94A3B8] leading-relaxed mb-5 whitespace-pre-wrap">
                        {synthesis}
                        <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
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

          {/* S5 — Forward Estimates & DCF */}
          <div id="s5" data-section>
            <Section n={5} id="s5" title="Forward Estimates & DCF" color="#10B981">
              {(() => {
                const estimates = s5.analyst_estimates ?? s5.estimates ?? {};
                // DCF fields are flat on s5 (not nested under s5.dcf)
                const hasDcf    = !!(s5.implied_price || s5.pv_fcfs || s5.enterprise_value);
                const dcf       = hasDcf ? s5 : (s5.dcf ?? s5.dcf_model ?? {});
                const wacc      = s5.wacc_inputs ?? s5.wacc ?? (dcf as any).wacc_breakdown ?? {};
                const sensitivity: any[] = (s5.sensitivity_table && Array.isArray(s5.sensitivity_table))
                  ? s5.sensitivity_table
                  : s5.sensitivity ?? [];
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
                      const wacc_pct   = fv((wacc as any).wacc ?? (dcf as any).wacc);
                      const tgr        = fv((dcf as any).terminal_growth ?? (dcf as any).terminal_growth_rate);
                      const horizon    = fv((dcf as any).projection_years ?? (dcf as any).horizon_years ?? (dcf as any).years);
                      const curP       = Number(fv(report.current_price ?? s1.current_price) ?? 0);
                      const implP      = Number(implied ?? 0);
                      const upPct      = impliedUpside != null ? Number(impliedUpside) : (curP > 0 && implP > 0 ? ((implP - curP) / curP * 100) : null);
                      const upColor    = upPct != null && upPct >= 0 ? "#10B981" : "#EF4444";
                      const barFill    = (curP > 0 && implP > 0)
                        ? Math.max(5, Math.min(95, (Math.min(curP, implP) / Math.max(curP, implP)) * 100))
                        : 50;
                      const curIsLow   = implP > curP;
                      return (
                        <div className="mb-6">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">DCF Valuation</p>
                          {/* Visual bridge */}
                          {implP > 0 && curP > 0 && (
                            <div className="bg-[#080C14] border border-[#1E2D4A] rounded-2xl p-5 mb-4">
                              {/* Inputs row */}
                              <div className="flex items-center gap-4 mb-5 flex-wrap">
                                {wacc_pct != null && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-[#475569] uppercase tracking-wider">WACC</span>
                                    <span className="text-sm font-bold font-mono text-[#60A5FA]">{Number(wacc_pct).toFixed(1)}%</span>
                                  </div>
                                )}
                                {tgr != null && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-[#475569] uppercase tracking-wider">Terminal Growth</span>
                                    <span className="text-sm font-bold font-mono text-[#60A5FA]">{Number(tgr).toFixed(1)}%</span>
                                  </div>
                                )}
                                {horizon != null && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-[#475569] uppercase tracking-wider">Horizon</span>
                                    <span className="text-sm font-bold font-mono text-[#60A5FA]">{horizon}Y</span>
                                  </div>
                                )}
                                <span className="ml-auto text-[9px] text-[#1E3A5F] px-2 py-0.5 rounded border border-[#1E2D4A]">Discounted Cash Flow Model</span>
                              </div>
                              {/* Price comparison */}
                              <div className="flex items-end justify-between gap-6 mb-4">
                                <div>
                                  <p className="text-[9px] text-[#475569] uppercase tracking-wider mb-1">Current Price</p>
                                  <p className={`text-2xl font-bold font-mono ${curIsLow ? "text-[#94A3B8]" : "text-white"}`}>{fmt$(curP)}</p>
                                </div>
                                <div className="flex-1 flex items-center gap-2 pb-3">
                                  <div className="flex-1 h-2 rounded-full bg-[#1E2D4A] overflow-hidden">
                                    <div className="h-full rounded-full" style={{
                                      width: `${curIsLow ? barFill : 100}%`,
                                      background: curIsLow ? "#94A3B840" : `${upColor}60`,
                                    }} />
                                  </div>
                                  <span className={`text-lg font-bold font-mono ${upPct != null && upPct >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                                    {upPct != null ? `${upPct >= 0 ? "+" : ""}${upPct.toFixed(1)}%` : "→"}
                                  </span>
                                  <div className="flex-1 h-2 rounded-full bg-[#1E2D4A] overflow-hidden">
                                    <div className="h-full rounded-full" style={{
                                      width: `${curIsLow ? 100 : barFill}%`,
                                      background: curIsLow ? `${upColor}60` : "#94A3B840",
                                    }} />
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] text-[#475569] uppercase tracking-wider mb-1">DCF Implied</p>
                                  <p className={`text-2xl font-bold font-mono ${curIsLow ? "text-white" : "text-[#94A3B8]"}`} style={{ color: curIsLow ? upColor : undefined }}>{fmt$(implP)}</p>
                                </div>
                              </div>
                              <p className="text-[10px] text-[#475569] text-center">
                                {curIsLow ? `Stock is trading ${Math.abs(upPct ?? 0).toFixed(1)}% below DCF fair value` : `Stock is trading ${Math.abs(upPct ?? 0).toFixed(1)}% above DCF fair value`}
                              </p>
                            </div>
                          )}
                          {/* KV fallback for other DCF fields */}
                          <div className="grid grid-cols-2 gap-x-8">
                            {([
                              ["FCF Margin Avg", (dcf as any).fcf_margin_avg],
                              ["Terminal Growth", (dcf as any).terminal_growth],
                              ["Terminal Multiple", (dcf as any).terminal_multiple],
                              ["Peer EV/EBITDA Used", (dcf as any).peer_ev_ebitda_used],
                              ["PV of FCFs", (dcf as any).pv_fcfs],
                              ["PV Terminal", (dcf as any).pv_terminal],
                              ["Enterprise Value", (dcf as any).enterprise_value],
                              ["Net Debt", (dcf as any).net_debt],
                            ] as [string, any][]).filter(([, v]) => fv(v) != null).map(([label, v]) => (
                              <KV key={label} label={label}
                                value={<>{typeof fv(v) === "number" && label.includes("Value") ? fmtBn(fv(v)) : typeof fv(v) === "number" && label.includes("Growth") ? `${fv(v)}%` : fv(v)}{fs(v) && <TagBadge source={fs(v)} />}</>} />
                            ))}
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
                    {sensitivity.length > 0 && (() => {
                      const allVals = sensitivity.flat().map((v: any) => Number(fv(v))).filter((v: number) => !isNaN(v));
                      const min = Math.min(...allVals), max = Math.max(...allVals);
                      return (
                        <div>
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Sensitivity Analysis</p>
                          <div className="overflow-x-auto">
                            <table className="border-collapse">
                              <tbody>
                                {(sensitivity as any[][]).map((row: any[], i: number) => (
                                  <tr key={i}>
                                    {row.map((cell: any, j: number) => {
                                      const v = Number(fv(cell));
                                      if (isNaN(v)) return <td key={j} className="text-[10px] text-[#475569] px-2 py-1.5 border border-[#1E2D4A]">{fv(cell)}</td>;
                                      return <HeatCell key={j} value={v} min={min} max={max} />;
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
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
                const sPE = subjectRow ? getRaw(subjectRow, "pe") : null;
                const sPS = subjectRow ? getRaw(subjectRow, "ps") : null;
                // Use P/E as primary for profitable companies; P/S for pre-profit (no valid P/E)
                const primaryKey = (sPE != null && sPE > 0 && sPE < 1000) ? "pe" : "ps";
                const primaryLabel = primaryKey === "pe" ? "P/E" : "P/S";
                const subjectPrimary = primaryKey === "pe" ? sPE : sPS;

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
                          <span className="text-[9px] text-[#334155] px-2 py-0.5 rounded bg-[#1E2D4A]/60">
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
                        <p className="text-[9px] text-[#334155] mt-2">
                          ★ Primary metric · Cheap = ASTS trades at a discount to this peer on {primaryLabel} · Pricey = ASTS trades at a premium · Source: {livePeers.length > 0 ? "Yahoo Finance (live)" : "yfinance/FMP (report)"}
                        </p>
                      </div>
                    )}
                    <PeerBarChart peers={peerData} subjectTicker={ticker} metric="ev_ebitda" label="EV/EBITDA" />
                    {metricFields.length === 0 && peerData.length === 0 && (
                      <p className="text-xs text-[#475569]">Data unavailable</p>
                    )}
                  </>
                );
              })()}
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
                        ["Chart Pattern", s7.chart_pattern],
                      ].filter(([, v]) => v != null && fv(v) != null).map(([label, value]) => (
                        <KV key={label as string} label={label as string}
                          value={typeof value === "object" ? <>{fv(value)}<TagBadge source={fs(value)} /></> : String(fv(value))}
                        />
                      ))}
                    </div>
                    {fv(s7.quant_summary) && (
                      <p className="text-xs text-[#94A3B8] mt-4 leading-relaxed">{fv(s7.quant_summary)}</p>
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
                const aiNarr    = s8.ai_narrative as any;
                const moatRating = aiNarr?.moat_rating ?? null;
                const narrative  = aiNarr?.narrative   ?? null;
                const headlines  = (s8.recent_headlines ?? []) as string[];
                const moatColor  = moatRating === "Wide" ? "#10B981" : moatRating === "Narrow" ? "#F59E0B" : "#EF4444";
                const hasAi = moatRating || narrative;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-x-8 mb-4">
                      {[["Sector", s8.sector], ["Industry", s8.industry], ["Peer Count", s8.peer_count]].filter(([, v]) => fv(v) != null).map(([l, v]) => (
                        <KV key={l as string} label={l as string}
                          value={<>{fv(v)}{fs(v) && <TagBadge source={fs(v)} />}</>} />
                      ))}
                    </div>
                    {moatRating && (
                      <div className="mb-4">
                        <span className="text-sm font-bold px-3 py-1 rounded-lg"
                          style={{ background: `${moatColor}15`, color: moatColor, border: `1px solid ${moatColor}40` }}>
                          {moatRating} Moat
                        </span>
                        <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </div>
                    )}
                    {narrative && (
                      <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap">
                        {narrative}
                        <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
                    )}
                    {!hasAi && headlines.length > 0 && (
                      <div className="mt-2">
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
                    {!hasAi && headlines.length === 0 && <p className="text-xs text-[#475569]">Data unavailable</p>}
                  </>
                );
              })()}
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
                  <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                        {macroFields.map(([label, v]) => (
                          <StatCard key={label as string} label={label as string}
                            value={`${fmtN(v, 2)}%`} source={fs(v)} />
                        ))}
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
                                  {fv(h.shares) != null ? Number(fv(h.shares)).toLocaleString() : ""}
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
                          <span className="ml-2 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#1E3A5F] text-[#60A5FA] border border-[#2D6BFF]/30">SEC</span>
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

          {/* S11 — Risk Register */}
          <div id="s11" data-section>
            <Section n={11} id="s11" title="Risk Register" color="#EF4444">
              {(() => {
                const aiReg   = s11.ai_risk_register as any;
                const risks   = aiReg?.risks ?? [];
                const rawText = aiReg?.value ?? null;
                const finSnap = (s11.financials_snapshot ?? {}) as any;
                const techSnap = (s11.technicals_snapshot ?? {}) as any;
                const beta  = fv(finSnap.beta ?? s11.beta);
                const de    = fv(finSnap.debt_to_equity ?? s11.debt_to_equity ?? s11.de_ratio);
                const cr    = fv(finSnap.current_ratio ?? s11.current_ratio);
                const headlines = (s11.recent_headlines ?? []) as string[];
                return (
                  <>
                    {/* Financial snapshot always shown at top */}
                    {(beta != null || de != null || cr != null) && (
                      <div className="grid grid-cols-3 gap-3 mb-5">
                        {beta != null && <StatCard label="Beta" value={fmtN(beta, 2)} source={fs(finSnap.beta)} color={Number(beta) > 1.5 ? "#EF4444" : Number(beta) < 0.8 ? "#10B981" : "#94A3B8"} />}
                        {de   != null && <StatCard label="D/E Ratio" value={fmtN(de, 2)} source={fs(finSnap.debt_to_equity)} color={Number(de) > 2 ? "#EF4444" : "#94A3B8"} />}
                        {cr   != null && <StatCard label="Current Ratio" value={fmtN(cr, 2)} source={fs(finSnap.current_ratio)} color={Number(cr) < 1 ? "#EF4444" : Number(cr) > 2 ? "#10B981" : "#94A3B8"} />}
                        {fv(finSnap.pe_ttm) != null && <StatCard label="P/E TTM" value={fmtN(fv(finSnap.pe_ttm), 1)} source={fs(finSnap.pe_ttm)} />}
                        {fv(finSnap.ev_ebitda) != null && <StatCard label="EV/EBITDA" value={fmtN(fv(finSnap.ev_ebitda), 1)} source={fs(finSnap.ev_ebitda)} />}
                        {fv(techSnap.rsi) != null && <StatCard label="RSI" value={fmtN(fv(techSnap.rsi), 0)} source={fs(techSnap.rsi)} color={Number(fv(techSnap.rsi)) > 70 ? "#F59E0B" : "#94A3B8"} />}
                      </div>
                    )}
                    {risks.length > 0 ? (
                      <div className="mb-5 space-y-3">
                        {(risks as any[]).map((r: any, i: number) => {
                          const likeColor = r.likelihood === "High" ? "#EF4444" : r.likelihood === "Medium" ? "#F59E0B" : "#10B981";
                          const impColor  = r.impact     === "High" ? "#EF4444" : r.impact     === "Medium" ? "#F59E0B" : "#10B981";
                          return (
                            <div key={i} className="bg-[#0D1626] border border-[#1E2D4A] rounded-xl p-4">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-bold text-[#475569] w-5">{i + 1}.</span>
                                  <span className="text-xs font-bold text-white">{r.name ?? r.risk}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                  {r.category && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1E2D4A] text-[#94A3B8]">{r.category}</span>
                                  )}
                                  {r.likelihood && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                                      style={{ background: `${likeColor}15`, color: likeColor, border: `1px solid ${likeColor}30` }}>
                                      {r.likelihood}
                                    </span>
                                  )}
                                  {r.impact && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
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
                              <span className="ml-7 mt-1 inline-block text-[9px] font-bold px-1 py-0 rounded leading-5 bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : rawText ? (
                      <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap mb-4">{rawText}
                        <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
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
                return (
                  <>
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
                        <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
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
          <div id="s14" data-section>
            <Section n={14} id="s14" title="Where We Differ" color="#F59E0B">
              {(() => {
                const narrative     = fv(s14.ai_where_we_differ);
                const curPrice      = fv(s14.current_price);
                const analystPT     = fv(s14.analyst_pt_mean);
                const analystRating = fv(s14.analyst_rating);
                const ourDcf        = fv(s14.our_dcf_implied);
                const fmpDcf        = fv(s14.fmp_dcf_crosscheck);
                // Use committee direction (from S16) — s14.direction can be "BLOCK" from mandate
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
                return (
                  <>
                    {(streetParts.length > 0 || ourParts.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div className="bg-[#0D1626] border border-[#1E2D4A] rounded-xl p-4">
                          <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Street View</p>
                          <div className="space-y-1.5">
                            {streetParts.map((p, i) => {
                              const [lbl, val] = p.split(": ");
                              return <KV key={i} label={lbl} value={val} />;
                            })}
                          </div>
                          <TagBadge source={fs(s14.analyst_pt_mean) || "yfinance"} />
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
                        <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
                    )}
                    {!hasData && <p className="text-xs text-[#475569]">Data unavailable</p>}
                  </>
                );
              })()}
            </Section>
          </div>

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
                <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded border bg-[#78350F] text-[#FBBF24] border-[#F59E0B]/30">Sonnet 4.6</span>
              </div>

              <div className="px-6 py-6" style={{ background: "linear-gradient(180deg, #0A0E1A 0%, #0D1626 100%)", border: `1px solid ${dirColor}20`, borderTop: "none" }}>
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

                {/* Investment arguments */}
                {(() => {
                  const args = s16.three_arguments ?? s16.investment_arguments ?? s16.arguments ?? rec.arguments ?? [];
                  return args.length > 0 ? (
                    <div className="mb-6">
                      <p className="text-[10px] font-bold text-[#2D6BFF] uppercase tracking-wider mb-3">Investment Arguments</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(args as any[]).slice(0, 3).map((arg: any, i: number) => (
                          <div key={i} className="rounded-xl p-4 border"
                            style={{ background: "#080C14", borderColor: "#1E2D4A" }}>
                            <div className="flex items-center gap-2 mb-2.5">
                              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold font-mono shrink-0"
                                style={{ background: "#2D6BFF20", color: "#60A5FA", border: "1px solid #2D6BFF30" }}>{i + 1}</span>
                              <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, #2D6BFF30, transparent)" }} />
                            </div>
                            <p className="text-xs text-[#94A3B8] leading-relaxed">
                              {typeof arg === "string" ? arg : (arg.argument ?? arg.thesis ?? arg.text ?? JSON.stringify(arg))}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

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
                        <span className="text-[9px] font-bold px-1.5 py-0 rounded leading-5 bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">Sonnet</span>
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
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ok ? "text-[#10B981] bg-[#10B981]/10" : "text-[#EF4444] bg-[#EF4444]/10"}`}>
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
            <p className="text-[9px] text-[#1E2D4A] mt-1">
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
