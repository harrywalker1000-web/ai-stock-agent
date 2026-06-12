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
    <div
      className="bg-[#0D1626] border border-[#1E2D4A] rounded-t-xl px-5 py-3.5 flex items-center gap-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#1E2D4A] text-[#475569]">
        {String(n).padStart(2, "0")}
      </span>
      <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>
    </div>
  );
}

function Section({ id, n, title, color, children }: {
  id: string; n: number; title: string; color?: string; children: React.ReactNode;
}) {
  return (
    <div id={id} className="mb-6 rounded-xl overflow-hidden">
      <SectionHeader n={n} title={title} color={color} />
      <div className="bg-[#131929] border border-t-0 border-[#1E2D4A] px-5 py-5">
        {children}
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
  const color = score >= 8 ? "#10B981" : score >= 5 ? "#2D6BFF" : score >= 3 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex gap-1 items-center">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-3 w-5 rounded-sm"
          style={{ background: i < score ? color : "rgba(255,255,255,0.07)" }}
        />
      ))}
      <span className="ml-2 text-sm font-bold font-mono" style={{ color }}>{score}/10</span>
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
  const cvColor = conviction >= 8 ? "#10B981" : conviction >= 5 ? "#2D6BFF" : conviction >= 3 ? "#F59E0B" : "#EF4444";

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
                    style={{ background: i < conviction ? cvColor : "rgba(255,255,255,0.07)" }} />
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

          {/* Generated timestamp */}
          <p className="text-[10px] text-[#1E2D4A] mb-5 text-right">
            Generated {report.generated_at ?? "just now"}
          </p>

          {/* S1 — Fund Mandate */}
          <div id="s1" data-section>
            <Section n={1} id="s1" title="Fund Mandate Checklist" color="#2D6BFF">
              {(() => {
                const checks = mandate.checks ?? s1.checks ?? s1.checklist ?? [];
                const setupType = mandate.setup_type ?? fv(s1.setup_type);
                return (
                  <>
                    {setupType && (
                      <div className="mb-4">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#2D6BFF]/10 text-[#60A5FA] border border-[#2D6BFF]/30">
                          Setup: {setupType}
                        </span>
                      </div>
                    )}
                    {checks.length > 0 ? (
                      <div>
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
              {(() => {
                const historical = s4.historical ?? s4.income_statement ?? [];
                const earnings   = s4.earnings_surprises ?? s4.earnings_history ?? [];
                return (
                  <>
                    {historical.length > 0 ? (
                      <div className="overflow-x-auto mb-6">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#1E2D4A]">
                              {["Year", "Revenue", "YoY%", "Gross Margin", "EBITDA Margin", "Net Margin", "EPS", "FCF"].map((h) => (
                                <th key={h} className="text-[10px] font-medium text-[#475569] text-right first:text-left pb-2 px-2">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(historical as any[]).map((row: any, i: number, arr: any[]) => {
                              const prevRev = i > 0 ? Number(fv(arr[i - 1].revenue)) : null;
                              const curRev  = Number(fv(row.revenue));
                              const yoy     = prevRev && prevRev > 0 ? ((curRev - prevRev) / prevRev * 100) : null;
                              return (
                                <tr key={i} className="border-b border-[#1E2D4A]/50">
                                  <td className="py-2 px-2 font-mono text-white">{fv(row.year)}</td>
                                  <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">{fmtBn(row.revenue)}</td>
                                  <td className={`py-2 px-2 font-mono text-right ${yoy == null ? "text-[#475569]" : yoy >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                                    {yoy == null ? "—" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`}
                                    {fs(row.revenue) && <TagBadge source={fs(row.revenue)} />}
                                  </td>
                                  <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.gross_margin)) > 0 ? "text-[#94A3B8]" : "text-[#475569]"}`}>
                                    {fmtPct(row.gross_margin)}</td>
                                  <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.ebitda_margin)) > 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                                    {fmtPct(row.ebitda_margin)}</td>
                                  <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.net_margin)) > 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                                    {fmtPct(row.net_margin)}</td>
                                  <td className="py-2 px-2 font-mono text-right text-[#94A3B8]">{fmt$(row.eps)}</td>
                                  <td className={`py-2 px-2 font-mono text-right ${Number(fv(row.fcf)) >= 0 ? "text-[#94A3B8]" : "text-[#EF4444]"}`}>
                                    {fmtBn(row.fcf)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-[#475569] mb-4">Historical financials unavailable</p>
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
              })()}
            </Section>
          </div>

          {/* S5 — Forward Estimates & DCF */}
          <div id="s5" data-section>
            <Section n={5} id="s5" title="Forward Estimates & DCF" color="#10B981">
              {(() => {
                const estimates = s5.analyst_estimates ?? s5.estimates ?? {};
                const dcf       = s5.dcf ?? s5.dcf_model ?? {};
                const wacc      = s5.wacc ?? dcf.wacc_breakdown ?? {};
                const sensitivity = s5.sensitivity_table ?? s5.sensitivity ?? [];
                const implied   = fv(s5.implied_price ?? dcf.implied_price);
                const impliedUpside = fv(s5.implied_upside ?? dcf.implied_upside);
                return (
                  <>
                    {Object.keys(estimates).length > 0 && (
                      <div className="mb-6">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Analyst Estimates</p>
                        <div className="grid grid-cols-3 gap-3">
                          {Object.entries(estimates).slice(0, 6).map(([k, v]: [string, any]) => (
                            <StatCard key={k} label={k.replace(/_/g, " ")} value={fv(v)} source={fs(v)} />
                          ))}
                        </div>
                      </div>
                    )}
                    {Object.keys(dcf).length > 0 && (
                      <div className="mb-6">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">DCF Model</p>
                        <div className="grid grid-cols-2 gap-x-8">
                          {Object.entries(dcf).filter(([k]) => !["wacc_breakdown", "sensitivity"].includes(k)).map(([k, v]: [string, any]) => (
                            <KV key={k} label={k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                              value={<>{fv(v)}{fs(v) && <TagBadge source={fs(v)} />}</>} />
                          ))}
                        </div>
                        {implied != null && (
                          <div className="mt-4 flex items-center gap-4">
                            <div className="bg-[#131929] border border-[#1E2D4A] rounded-xl px-5 py-3 flex items-center gap-4">
                              <div>
                                <p className="text-[10px] text-[#475569] uppercase tracking-wider">Implied Price</p>
                                <p className="text-2xl font-bold font-mono text-[#10B981]">{fmt$(implied)}</p>
                              </div>
                              {impliedUpside != null && (
                                <div className={`text-lg font-bold font-mono ${Number(impliedUpside) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                                  {Number(impliedUpside) >= 0 ? "+" : ""}{fmtN(impliedUpside, 1)}%
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                    {Object.keys(estimates).length === 0 && Object.keys(dcf).length === 0 && (
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
                const peers = (s6.peer_table ?? s6.peer_comparison ?? s6.peers ?? []) as any[];
                const PEER_COLS = ["symbol", "pe", "pe_fwd", "ev_ebitda", "ps", "pb", "ebitda_margin", "net_margin", "debt_to_equity"];
                return (
                  <>
                    {metricFields.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
                        {metricFields.map(([label, v, unit]) => {
                          const raw = fv(v);
                          const display = unit === "$" ? fmt$(raw) : unit === "%" ? fmtPct(raw) : fmtN(raw, 2);
                          return <StatCard key={label as string} label={label as string} value={display} source={fs(v)} />;
                        })}
                      </div>
                    )}
                    {peers.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-2">Peer Comparison</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[#1E2D4A]">
                                <th className="text-[10px] font-medium text-[#475569] text-left pb-2 px-2">Ticker</th>
                                {PEER_COLS.filter(c => c !== "symbol").map((c) => (
                                  <th key={c} className="text-[10px] font-medium text-[#475569] text-right pb-2 px-2">
                                    {c.replace(/_/g, " ")}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {peers.map((row: any, i: number) => {
                                const sym = fv(row.symbol) ?? row.ticker ?? "—";
                                const isSubject = sym === ticker;
                                return (
                                  <tr key={i} className={`border-b border-[#1E2D4A]/50 ${isSubject ? "bg-[#2D6BFF]/5" : ""}`}>
                                    <td className={`py-2 px-2 font-mono ${isSubject ? "text-white font-bold" : "text-[#94A3B8]"}`}>{sym}</td>
                                    {PEER_COLS.filter(c => c !== "symbol").map((c) => {
                                      const v = row[c];
                                      const raw = fv(v);
                                      const txt = raw == null ? "—" : /margin|ebitda/i.test(c) ? fmtPct(raw) : fmtN(raw, 1);
                                      return <td key={c} className="py-2 px-2 font-mono text-right text-[#94A3B8]">{txt}</td>;
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {metricFields.length === 0 && peers.length === 0 && (
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
                const narrative = fv(aiNarr);
                const tailwinds = aiNarr?.tailwinds ?? [];
                const headwinds = aiNarr?.headwinds ?? [];
                // Macro stats from direct FRED fields on the section
                const macroFields = ([
                  ["10Y Yield",    s9.risk_free_rate],
                  ["Fed Funds",    s9.fed_funds_rate],
                  ["GDP Growth",   s9.gdp_growth],
                  ["Unemployment", s9.unemployment],
                ] as [string, any][]).filter(([, v]) => fv(v) != null);
                const hasContent = narrative || tailwinds.length > 0 || headwinds.length > 0 || macroFields.length > 0;
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
                    {narrative && (
                      <p className="text-xs text-[#94A3B8] leading-relaxed mb-5 whitespace-pre-wrap">
                        {narrative}
                        <span className="ml-1 text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">AI</span>
                      </p>
                    )}
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
                    {(instPct != null || insiderPct != null) && (
                      <div className="grid grid-cols-2 gap-3 mb-5">
                        {instPct != null && <StatCard label="Institutional Ownership" value={`${Number(instPct).toFixed(1)}%`} source={fs(s10.institutional_pct)} color="#2D6BFF" large />}
                        {insiderPct != null && <StatCard label="Insider Ownership" value={`${Number(insiderPct).toFixed(1)}%`} source={fs(s10.insider_pct)} color="#94A3B8" large />}
                      </div>
                    )}
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
                              const txn = String(fv(t.transaction ?? t.transaction_type ?? t.type) ?? "");
                              const isBuy = /buy|purchase/i.test(txn);
                              const sharesVal = fv(t.shares);
                              const priceVal  = fv(t.price);
                              return (
                                <tr key={i} className="border-b border-[#1E2D4A]/50">
                                  <td className="py-2 px-2 font-mono text-[#475569]">{fv(t.date) ?? "—"}</td>
                                  <td className="py-2 px-2 text-[#94A3B8]">{fv(t.name ?? t.insider) ?? "—"}</td>
                                  <td className={`py-2 px-2 font-mono text-right font-bold ${isBuy ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                                    {txn || "—"}
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
                    {totalAnal > 0 && (
                      <div className="mb-5">
                        <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Analyst Consensus</p>
                        <div className="flex items-end gap-1 h-14 mb-2">
                          {[
                            { label: "Buy", count: buyCnt, color: "#10B981" },
                            { label: "Hold", count: holdCnt, color: "#F59E0B" },
                            { label: "Sell", count: sellCnt, color: "#EF4444" },
                          ].map(({ label, count, color }) => {
                            const h = totalAnal > 0 ? (count / totalAnal) * 100 : 0;
                            return (
                              <div key={label} className="flex flex-col items-center gap-1 flex-1">
                                <span className="text-[10px] font-mono font-bold" style={{ color }}>{count}</span>
                                <div className="w-full rounded-t-sm" style={{ height: `${h}%`, background: `${color}50`, minHeight: count > 0 ? 4 : 0 }} />
                                <span className="text-[10px] text-[#475569]">{label}</span>
                              </div>
                            );
                          })}
                        </div>
                        {(ptMean ?? ptHigh ?? ptLow) && (
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            {ptMean != null && <StatCard label="Mean PT" value={fmt$(ptMean)} color="#2D6BFF" />}
                            {ptHigh != null && <StatCard label="High PT" value={fmt$(ptHigh)} color="#10B981" />}
                            {ptLow  != null && <StatCard label="Low PT"  value={fmt$(ptLow)}  color="#EF4444" />}
                          </div>
                        )}
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
                    {anyData ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                          <ScenarioCard type="bull" price={bull.price_target} upside={bull.upside_pct} probability={bull.probability} source={bull.source} trigger={bull.trigger ?? bull.assumptions ?? bull.catalyst} />
                          <ScenarioCard type="base" price={base.price_target} upside={base.upside_pct} probability={base.probability} source={base.source} trigger={base.trigger ?? base.assumptions} />
                          <ScenarioCard type="bear" price={bear.price_target} upside={bear.downside_pct != null ? -bear.downside_pct : bear.upside_pct} probability={bear.probability} source={bear.source} trigger={bear.trigger ?? bear.assumptions ?? bear.catalyst} />
                        </div>
                        {pwReturn != null && (
                          <div className="bg-[#131929] border border-[#1E2D4A] rounded-xl px-5 py-3 flex items-center gap-3 mb-4">
                            <span className="text-xs text-[#475569]">Probability-Weighted Expected Return:</span>
                            <span className={`text-lg font-bold font-mono ${Number(pwReturn) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                              {Number(pwReturn) >= 0 ? "+" : ""}{fmtN(pwReturn, 1)}%
                            </span>
                          </div>
                        )}
                        <p className="text-[10px] text-[#1E2D4A]">
                          Base = DCF model | Bull = analyst PT high | Bear = FMP crosscheck / stress
                        </p>
                      </>
                    ) : (
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
                const ourDir        = fv(s14.direction);
                const ourConv       = fv(s14.conviction);

                const streetParts: string[] = [];
                if (analystPT != null) streetParts.push(`Consensus PT: ${fmt$(analystPT)}`);
                if (analystRating) streetParts.push(`Rating: ${String(analystRating).toUpperCase()}`);
                if (curPrice != null) streetParts.push(`vs Current: ${fmt$(curPrice)}`);

                const ourParts: string[] = [];
                if (ourDir) ourParts.push(`Direction: ${ourDir}`);
                if (ourConv != null) ourParts.push(`Conviction: ${ourConv}/10`);
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
                          <TagBadge source={fs(s14.direction) || "mandate_checker"} />
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

          {/* S16 — Investment Committee Recommendation (hero) */}
          <div id="s16" data-section>
            <div className="mb-6 rounded-xl overflow-hidden">
              <div
                className="bg-[#0D1626] px-5 py-4 flex items-center gap-3"
                style={{ borderLeft: `3px solid ${dirColor}`, border: `1px solid ${dirColor}30`, borderLeftWidth: 3, borderLeftColor: dirColor }}
              >
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#1E2D4A] text-[#475569]">16</span>
                <h2 className="text-sm font-bold text-white tracking-wide">Investment Committee Recommendation</h2>
              </div>
              <div className="bg-[#131929] border border-t-0 px-5 py-6" style={{ borderColor: `${dirColor}30` }}>
                {/* Direction hero */}
                <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-4xl font-bold font-mono" style={{ color: dirColor }}>{direction}</span>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg"
                        style={{ background: `${dirColor}15`, color: dirColor, border: `1px solid ${dirColor}40` }}>
                        {report.company_name ?? ticker}
                      </span>
                    </div>
                    <ConvictionBar score={conviction} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Expected Return 12M", value: fv(s16.expected_return_12m ?? rec.expected_return_12m), color: "#10B981" },
                      { label: "Position Size",       value: fv(s16.position_size_pct ?? rec.suggested_size_pct) != null ? `${fv(s16.position_size_pct ?? rec.suggested_size_pct)}%` : null },
                      { label: "Stop Loss",           value: fv(s16.stop_loss_pct ?? rec.stop_loss_pct) != null ? `${fv(s16.stop_loss_pct ?? rec.stop_loss_pct)}%` : null, color: "#EF4444" },
                    ].filter(({ value }) => value != null).map(({ label, value, color }) => (
                      <StatCard key={label} label={label} value={value} color={color} />
                    ))}
                  </div>
                </div>

                {/* Investment arguments */}
                {(() => {
                  const args = s16.three_arguments ?? s16.investment_arguments ?? s16.arguments ?? rec.arguments ?? [];
                  return args.length > 0 ? (
                    <div className="mb-5">
                      <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3">Investment Arguments</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(args as any[]).slice(0, 3).map((arg: any, i: number) => (
                          <div key={i} className="bg-[#0D1626] border border-[#1E2D4A] rounded-xl p-4">
                            <p className="text-[10px] font-bold text-[#2D6BFF] mb-2">{i + 1}</p>
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
                    <div className="mb-5">
                      <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider mb-2">Key Risks</p>
                      <ul className="space-y-1.5">
                        {(risks as any[]).slice(0, 5).map((r: any, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                            <span className="text-[#EF4444] shrink-0">!</span>
                            {typeof r === "string" ? r : (r.risk ?? r.text ?? JSON.stringify(r))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}

                {/* Committee narrative */}
                {(() => {
                  const narrative = fv(s16.narrative ?? s16.committee_narrative ?? rec.narrative);
                  return narrative ? (
                    <div className="bg-[#0D1626] border border-[#1E2D4A] rounded-xl p-5">
                      <p className="text-[10px] font-bold text-[#475569] uppercase tracking-wider mb-3 flex items-center gap-2">
                        Committee Narrative
                        <span className="text-[9px] font-bold px-1 py-0 rounded leading-5 inline-block align-middle bg-[#78350F] text-[#FBBF24] border border-[#F59E0B]/30">Sonnet</span>
                      </p>
                      <p className="text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap">{narrative}</p>
                    </div>
                  ) : null;
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
    </div>
  );
}
