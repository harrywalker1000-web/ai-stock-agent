/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import CandlestickChart from "@/components/CandlestickChart";

const SECTIONS = [
  { key: "s1",  label: "Fund Mandate" },
  { key: "s2",  label: "Company Info" },
  { key: "s3",  label: "Setup Checklist" },
  { key: "s4",  label: "Valuation" },
  { key: "s5",  label: "Market Timing" },
  { key: "s6",  label: "Investment Thesis" },
  { key: "s7",  label: "Recommendation" },
  { key: "snews", label: "News & Catalysts" },
  { key: "s8",  label: "Technical Analysis" },
  { key: "s9",  label: "Sentiment" },
  { key: "s10", label: "Institutional Activity" },
  { key: "s11", label: "Historical Performance" },
  { key: "s12", label: "Risk Dashboard" },
  { key: "s13", label: "Scenario Analysis" },
  { key: "s14", label: "Data Reliability" },
];

function pct(n: any) { return n == null ? "—" : `${Number(n).toFixed(1)}%`; }
function usd(n: any) { return n == null ? "—" : `$${Number(n).toFixed(2)}`; }
function num(n: any, dp = 1) { return n == null ? "—" : Number(n).toFixed(dp); }

function Card({ id, title, children, open, onToggle }: {
  id: string; title: string; children: React.ReactNode; open: boolean; onToggle: () => void;
}) {
  return (
    <div id={id} className="card mb-3 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/02 transition-all"
      >
        <span className="text-sm font-bold text-[#E8EDF2]">{title}</span>
        <span className="text-[#4B5563] text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-white/04 last:border-0">
      <span className="text-xs text-[#6B7280]">{label}</span>
      <span className="text-xs font-mono text-right" style={{ color: color ?? "#C4CDD6" }}>{value ?? "—"}</span>
    </div>
  );
}

function prettify(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function AiTag({ title = "Estimated by LLM — not directly from live API data" }: { title?: string }) {
  return (
    <span
      title={title}
      className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 cursor-help align-middle"
    >
      AI
    </span>
  );
}
function safeNote(n: any): string | null {
  if (n == null || n === "") return null;
  if (typeof n === "object") {
    // e.g. {clean: true, notes: "..."} — extract notes key or stringify minimally
    return (n as any).notes ?? (n as any).detail ?? Object.entries(n).map(([k,v])=>`${k}: ${v}`).join(", ");
  }
  // Remove Python dict-like representations: {'key': 'val'}
  const str = String(n);
  if (str.startsWith("{") && str.includes(":")) {
    try {
      const parsed = JSON.parse(str.replace(/'/g, '"'));
      return (parsed as any).notes ?? (parsed as any).detail ?? null;
    } catch { return null; }
  }
  return str === "no flags" || str === "unavailable" ? str : str;
}

function CheckList({ items, useDetail }: { items: any[]; useDetail?: boolean }) {
  return (
    <div className="space-y-1.5">
      {items.map((c: any, i: number) => {
        const note = safeNote(useDetail ? (c.detail ?? c.note) : (c.note ?? c.detail));
        const label = prettify(String(c.item ?? ""));
        return (
          <div key={i} className="flex items-start gap-2">
            <span className={`text-xs mt-0.5 shrink-0 ${c.pass ? "text-[#10B981]" : "text-[#EF4444]"}`}>
              {c.pass ? "✓" : "✗"}
            </span>
            <div className="flex-1 flex justify-between items-start gap-2">
              <span className="text-xs text-[#C4CDD6]">{label}</span>
              {note && <span className="text-[10px] text-[#6B7280] font-mono text-right max-w-[50%]">{note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SemiGauge({
  value, max = 100, color, size = 100, strokeW = 7,
  label, sublabel,
}: {
  value: number; max?: number; color: string; size?: number; strokeW?: number;
  label?: string; sublabel?: string;
}) {
  const R = size * 0.38;
  const cx = size / 2, cy = size * 0.48;
  const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const circ = Math.PI * R;
  const pct = Math.min(1, Math.max(0, value / max));
  const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`} className="overflow-visible">
      {/* Track */}
      <path d={arc} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} strokeLinecap="round" />
      {/* Fill */}
      <path d={arc} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} />
      {label && (
        <text x={cx} y={cy - size * 0.1} textAnchor="middle" fill={color}
          fontSize={size * 0.22} fontWeight="bold" fontFamily="monospace">{label}</text>
      )}
      {sublabel && (
        <text x={cx} y={cy + 2} textAnchor="middle" fill="#6B7280"
          fontSize={size * 0.09} fontFamily="sans-serif">{sublabel}</text>
      )}
    </svg>
  );
}

function ConvictionGauge({ value, color }: { value: number; color: string }) {
  return <SemiGauge value={value} max={100} color={color} size={100} strokeW={7}
    label={String(value)} sublabel="CONVICTION" />;
}

function RSIGauge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-[#4B5563]">—</span>;
  const color = value >= 70 ? "#F59E0B" : value <= 30 ? "#10B981" : "#0EA5E9";
  const label = value >= 70 ? "Overbought" : value <= 30 ? "Oversold" : "Neutral";
  return (
    <div className="flex flex-col items-center">
      <SemiGauge value={value} max={100} color={color} size={84} strokeW={6}
        label={value.toFixed(0)} />
      <span className="text-[10px] font-bold -mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

export default function AdhocTickerPage() {
  const { ticker } = useParams() as { ticker: string };
  const router = useRouter();
  const [report, setReport] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/adhoc/${ticker}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setReport(data);
          const all: Record<string, boolean> = {};
          SECTIONS.forEach((s) => { all[s.key] = true; });
          setOpen(all);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [ticker]);

  const toggle = (k: string) => setOpen((prev) => ({ ...prev, [k]: !prev[k] }));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080C10] flex items-center justify-center">
        <p className="text-sm text-[#6B7280]">Loading report for {ticker}...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-[#080C10] flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-[#EF4444]">{error ?? "Report not found."}</p>
        <p className="text-xs text-[#6B7280]">The analysis may still be running (~3–5 min).</p>
        <div className="flex gap-3">
          <button onClick={() => { setLoading(true); setError(null); window.location.reload(); }}
            className="text-xs px-4 py-2 rounded-lg bg-white/05 hover:bg-white/08 text-[#E8EDF2] transition-all">
            Refresh
          </button>
          <Link href="/reports/adhoc" className="text-xs px-4 py-2 rounded-lg bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-all">
            Back to Research
          </Link>
        </div>
      </div>
    );
  }

  const s1   = report.s1_mandate   ?? {};
  const s2   = report.s2_company   ?? {};
  const s3   = report.s3_setup     ?? {};
  const s4   = report.s4_valuation ?? {};
  const s5   = report.s5_timing    ?? {};
  const s6   = report.s6_thesis    ?? {};
  const s7   = report.s7_recommendation ?? {};
  const snews = report.s8_news ?? {};
  const s8   = report.s8_technical ?? {};
  const s9   = report.s9_sentiment ?? {};
  const s10  = report.s10_institutional ?? {};
  const s11  = report.s11_performance ?? {};
  const s12  = report.s12_risk     ?? {};
  const s13  = report.s13_scenarios ?? {};
  const s14  = report.s14_data     ?? {};

  const direction = s7.direction ?? "PASS";
  const conviction = s7.conviction;
  const cvColor = conviction == null ? "#6B7280" : conviction >= 70 ? "#10B981" : conviction >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <div className="min-h-screen bg-[#080C10] pb-20">
      <div className="max-w-6xl mx-auto px-6 pt-8 flex gap-8">

        {/* Sticky sidebar nav */}
        <aside className="hidden lg:block w-44 shrink-0">
          <div className="sticky top-8">
            <Link href="/reports/adhoc" className="text-[10px] text-[#4B5563] hover:text-[#6B7280] block mb-4">← Research</Link>
            <nav className="space-y-0.5">
              {SECTIONS.map((s, i) => (
                <a key={s.key} href={`#${s.key}`}
                  className="block text-[11px] text-[#4B5563] hover:text-[#9CA3AF] py-0.5 transition-all">
                  {i + 1}. {s.label}
                </a>
              ))}
            </nav>
            <button onClick={() => window.print()}
              className="mt-6 w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#6B7280] hover:text-[#E8EDF2] py-2 px-3 rounded-lg bg-white/04 hover:bg-white/08 border border-white/06 hover:border-white/12 transition-all">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0">
                <path d="M5 1a1 1 0 0 0-1 1v2H3a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2a1 1 0 0 0-1-1H5zm6 3V2H5v2h6zm1 5H4a.5.5 0 0 0 0 1h8a.5.5 0 0 0 0-1zm0 2H4a.5.5 0 0 0 0 1h8a.5.5 0 0 0 0-1z"/>
              </svg>
              Export PDF
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">

          {/* Report header */}
          <div className="mb-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">{report.ticker}</h1>
                  <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                    direction === "BUY"  ? "bg-[#10B981]/15 text-[#10B981]" :
                    direction === "SELL" ? "bg-[#EF4444]/15 text-[#EF4444]" :
                    direction === "HOLD" ? "bg-[#F59E0B]/15 text-[#F59E0B]" :
                                          "bg-white/05 text-[#6B7280]"
                  }`}>{direction}</span>
                  {report.cached && (
                    <span className="text-xs text-[#6B7280] bg-white/05 px-2 py-0.5 rounded">
                      Cached — {report.date}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#9CA3AF] mt-1">
                  {report.company_name}{report.sector ? ` · ${report.sector}` : ""}
                  {report.macro_regime ? ` · ${report.macro_regime}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0 ml-4 flex flex-col items-end gap-1">
                {report.current_price != null && (
                  <p className="font-mono text-2xl font-bold text-[#E8EDF2]">{usd(report.current_price)}</p>
                )}
                {conviction != null && <ConvictionGauge value={conviction} color={cvColor} />}
              </div>
            </div>

            {/* Mandate badge */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                s1.pass ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30"
                        : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30"
              }`}>
                {s1.pass ? "✓ MANDATE PASS" : `✗ MANDATE FAIL — ${s1.fail_reason}`}
              </div>
              {!s1.pass && (
                <span className="text-[10px] text-[#6B7280]">
                  The fund mandate checks eligibility (market cap, liquidity, geography). Failures are often data gaps — check section 1 for details. Analysis and recommendation are still valid.
                </span>
              )}
            </div>

            {(s7.expected_return_12m ?? s7.expected_return_2_3yr) && (
              <span className="ml-3 text-xs text-[#6B7280]">
                Expected return 12M: <span className="text-[#E8EDF2] font-mono">{s7.expected_return_12m ?? s7.expected_return_2_3yr}</span>
              </span>
            )}
          </div>

          {/* Force refresh button */}
          <div className="mb-6 flex gap-2">
            <button onClick={() => router.push(`/reports/adhoc`)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/05 hover:bg-white/08 text-[#6B7280] hover:text-[#E8EDF2] transition-all">
              ← Run Another
            </button>
          </div>

          {/* S1 — Mandate */}
          <Card id="s1" title="1. Fund Mandate Checklist" open={open.s1} onToggle={() => toggle("s1")}>
            <CheckList items={s1.checks ?? []} />
            {s1.setup_type && (
              <p className="text-xs text-[#6B7280] mt-3">Setup type: <span className="text-[#E8EDF2]">{s1.setup_type}</span></p>
            )}
          </Card>

          {/* S2 — Company Info */}
          <Card id="s2" title="2. Company Info" open={open.s2} onToggle={() => toggle("s2")}>
            {/* Overview text */}
            {(s2.background?.overview ?? s2.background?.description) && (
              <p className="text-xs text-[#C4CDD6] leading-relaxed mb-4">
                {s2.background.overview ?? s2.background.description}
                <AiTag title="Company overview from LLM training knowledge — may be outdated" />
              </p>
            )}
            {/* HQ / employees */}
            {(s2.background?.hq || s2.background?.employees) && (
              <div className="flex gap-4 mb-4 items-center">
                {s2.background.hq && <KV label="HQ" value={s2.background.hq} />}
                {s2.background.employees && <KV label="Employees" value={Number(s2.background.employees).toLocaleString()} />}
                <AiTag title="HQ and employee count from LLM training knowledge — verify with company filings" />
              </div>
            )}
            {/* Revenue segments */}
            {Array.isArray(s2.background?.revenue_segments) && s2.background.revenue_segments.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  Revenue Segments
                  {(s2.background as any)?.revenue_segments_source !== "fmp" && (
                    <AiTag title="Estimated from LLM training knowledge — real segment data unavailable from API" />
                  )}
                </p>
                <div className="space-y-1.5">
                  {(s2.background.revenue_segments as any[]).map((seg: any, i: number) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-xs text-[#9CA3AF]">{seg.segment}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-white/05 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0EA5E9]/60 rounded-full" style={{ width: `${seg.weight_pct ?? 0}%` }} />
                        </div>
                        <span className="text-xs font-mono text-[#C4CDD6] w-10 text-right">{seg.weight_pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Financial snapshot — historical table */}
            {Array.isArray((s2.financial_snapshot as any)?.historical) && (s2.financial_snapshot as any).historical.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Historical Financials</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-[#C4CDD6]">
                    <thead>
                      <tr className="text-[#6B7280] text-[10px] border-b border-white/06">
                        <th className="text-left pb-2 pr-4 font-normal">Year</th>
                        <th className="text-right pb-2 pr-4 font-normal">Revenue</th>
                        <th className="text-right pb-2 pr-4 font-normal">EBITDA</th>
                        <th className="text-right pb-2 font-normal">Net Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((s2.financial_snapshot as any).historical as any[]).map((row: any, i: number) => (
                        <tr key={i} className="border-t border-white/04">
                          <td className="py-1.5 pr-4 font-mono">{row.year}</td>
                          <td className="py-1.5 pr-4 font-mono text-right">{row.revenue != null ? `$${(row.revenue/1e9).toFixed(1)}B` : "—"}</td>
                          <td className="py-1.5 pr-4 font-mono text-right">{row.ebitda != null ? `$${(row.ebitda/1e9).toFixed(1)}B` : "—"}</td>
                          <td className="py-1.5 font-mono text-right">{row.net_income != null ? `$${(row.net_income/1e9).toFixed(1)}B` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* Scalar fields in financial_snapshot */}
            {s2.financial_snapshot && Object.keys(s2.financial_snapshot).length > 0 && (
              <div className="mb-4">
                <div className="bg-white/02 rounded-lg p-3 divide-y divide-white/04">
                  {Object.entries(s2.financial_snapshot as Record<string, any>)
                    .filter(([, v]) => v != null && !Array.isArray(v) && typeof v !== "object")
                    .slice(0, 12)
                    .map(([k, v]) => (
                      <KV key={k} label={prettify(k)} value={String(v)} />
                    ))}
                </div>
              </div>
            )}
            {/* Comparables */}
            {Array.isArray(s2.comparables) && s2.comparables.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Comparables</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-[#C4CDD6]">
                    <thead>
                      <tr className="text-[#6B7280] text-[10px]">
                        {Object.keys(s2.comparables[0]).map((k) => (
                          <th key={k} className="text-left pb-2 pr-4 font-normal">{k.replace(/_/g, " ")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(s2.comparables as any[]).map((row: any, i: number) => (
                        <tr key={i} className="border-t border-white/04">
                          {Object.values(row).map((v: any, j) => (
                            <td key={j} className="py-1.5 pr-4 font-mono">{String(v ?? "—")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {s2.quality_of_earnings?.moat && (
              <div>
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  Quality of Earnings / Moat
                  <AiTag title="Moat assessment from LLM training knowledge — qualitative estimate" />
                </p>
                <p className="text-xs text-[#C4CDD6]">{s2.quality_of_earnings.moat}</p>
              </div>
            )}
          </Card>

          {/* S3 — Setup Checklist */}
          <Card id="s3" title="3. Setup Checklist" open={open.s3} onToggle={() => toggle("s3")}>
            {s3.setup_type && (
              <p className="text-xs text-[#0EA5E9] font-bold mb-3">Setup: {s3.setup_type}</p>
            )}
            <CheckList items={s3.checklist ?? []} useDetail />
          </Card>

          {/* S4 — Valuation */}
          <Card id="s4" title="4. Valuation" open={open.s4} onToggle={() => toggle("s4")}>
            {s4.narrative && <p className="text-xs text-[#C4CDD6] leading-relaxed mb-3">{s4.narrative}</p>}
            {s4.methodology && <KV label="Methodology" value={s4.methodology} />}
            {(s4.expected_roi_12m ?? s4.expected_roi_2_3yr ?? s4.expected_return_12m ?? s4.expected_return_2_3yr) && <KV label="Expected ROI 12M" value={s4.expected_roi_12m ?? s4.expected_roi_2_3yr ?? s4.expected_return_12m ?? s4.expected_return_2_3yr} color="#10B981" />}
            {(s4.consensus_target ?? s4.analyst_consensus_target) != null && <KV label="Consensus Target" value={usd(s4.consensus_target ?? s4.analyst_consensus_target)} />}
            {s4.intrinsic_value_estimate != null && <KV label="Intrinsic Value Est." value={usd(s4.intrinsic_value_estimate)} />}
            {s4.moic_estimate && <KV label="MOIC Estimate" value={s4.moic_estimate} />}
            {s4.is_forecast_realistic != null && <KV label="Forecast Realistic?" value={s4.is_forecast_realistic ? "Yes" : "No"} />}
            {s4.own_view && <KV label="Our View" value={s4.own_view} />}
            {s4.trade_type_classification && <KV label="Trade Type" value={s4.trade_type_classification} />}
          </Card>

          {/* S5 — Market Timing */}
          <Card id="s5" title="5. Market Timing" open={open.s5} onToggle={() => toggle("s5")}>
            {s5.narrative && <p className="text-xs text-[#C4CDD6] leading-relaxed mb-3">{s5.narrative}</p>}
            {s5.entry_verdict && (
              <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg mb-3 ${
                s5.entry_verdict === "favourable"   ? "bg-[#10B981]/10 text-[#10B981]" :
                s5.entry_verdict === "unfavourable" ? "bg-[#EF4444]/10 text-[#EF4444]" :
                                                      "bg-[#F59E0B]/10 text-[#F59E0B]"
              }`}>
                Entry: {s5.entry_verdict}
              </div>
            )}
            {s5.macro_context && <KV label="Macro context" value={s5.macro_context} />}
            {s5.technical_setup && <KV label="Technical setup" value={s5.technical_setup} />}
            {s5.recent_catalyst && <KV label="Recent catalyst" value={s5.recent_catalyst} />}
            {s5.downside_scenario && <KV label="Downside scenario" value={s5.downside_scenario} />}
          </Card>

          {/* S6 — Investment Thesis */}
          <Card id="s6" title="6. Investment Thesis" open={open.s6} onToggle={() => toggle("s6")}>
            {s6.narrative ? (
              <>
                <p className="text-xs text-[#C4CDD6] leading-relaxed whitespace-pre-wrap">{s6.narrative}</p>
                <p className="mt-2"><AiTag title="Thesis narrative synthesised by Committee AI from live scoring data and LLM training knowledge" /></p>
              </>
            ) : (
              <p className="text-xs text-[#4B5563]">No thesis generated.</p>
            )}
          </Card>

          {/* S7 — Recommendation */}
          <Card id="s7" title="7. Recommendation" open={open.s7} onToggle={() => toggle("s7")}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Direction",       value: direction,                  color: direction === "BUY" ? "#10B981" : direction === "SELL" ? "#EF4444" : "#F59E0B" },
                { label: "Conviction",      value: conviction ?? "—",          color: cvColor },
                { label: "12M Return",       value: s7.expected_return_12m ?? s7.expected_return_2_3yr ?? "—", color: "#E8EDF2" },
                { label: "Suggested Size",  value: s7.suggested_size_pct ? `${s7.suggested_size_pct}%` : "—", color: "#E8EDF2" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white/03 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-lg font-bold font-mono" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>
            {s7.stop_loss_pct && (
              <KV label="Stop loss" value={`${s7.stop_loss_pct}% below entry`} color="#EF4444" />
            )}
            {Array.isArray(s7.key_risks) && s7.key_risks.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  Key Risks
                  <AiTag title="Risk factors from LLM training knowledge — not exhaustive" />
                </p>
                <ul className="space-y-1">
                  {(s7.key_risks as string[]).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#C4CDD6]">
                      <span className="text-[#F59E0B] mt-0.5 shrink-0">⚠</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* S News — News & Catalysts */}
          <Card id="snews" title="News & Catalysts" open={open.snews} onToggle={() => toggle("snews")}>
            {Array.isArray(snews.catalysts) && snews.catalysts.length > 0 ? (
              <div className="space-y-3">
                {(snews.catalysts as any[]).map((c: any, i: number) => {
                  const dir = c.direction ?? c.catalyst_type ?? "NEUTRAL";
                  const dirColor = dir === "BULLISH" ? "#10B981" : dir === "BEARISH" ? "#EF4444" : "#F59E0B";
                  return (
                    <div key={i} className="rounded-xl p-3 bg-white/02 border border-white/05">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono font-bold" style={{ color: dirColor }}>{dir}</span>
                        {c.ticker && <span className="text-[10px] font-mono text-[#6B7280]">{c.ticker}</span>}
                        {c.date && <span className="text-[10px] text-[#4B5563]">{c.date}</span>}
                      </div>
                      <p className="text-xs text-[#C4CDD6] font-medium mb-1">{c.catalyst ?? c.headline ?? c.title ?? "—"}</p>
                      {c.reasoning && <p className="text-[11px] text-[#6B7280] leading-relaxed">{c.reasoning}</p>}
                      {c.source && <p className="text-[10px] text-[#4B5563] mt-1">Source: {c.source}</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[#6B7280]">No news catalysts found for this ticker in the current news cycle. Re-run the analysis for fresh data.</p>
            )}
          </Card>

          {/* S8 — Technical */}
          <Card id="s8" title="8. Technical Analysis" open={open.s8} onToggle={() => toggle("s8")}>
            <div className="mb-5">
              <CandlestickChart ticker={ticker} />
            </div>
            {/* RSI + S/R visual */}
            <div className="flex items-start gap-6 mb-4 flex-wrap">
              <div className="flex flex-col items-center">
                <RSIGauge value={s8.rsi_14} />
              </div>
              {(s8.support != null || s8.resistance != null) && (
                <div className="flex-1 min-w-[160px] bg-white/02 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-3">Support / Resistance</p>
                  <div className="space-y-2">
                    {s8.resistance != null && (
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#EF4444]">Resistance</span>
                        <span className="text-xs font-mono text-[#EF4444]">{usd(s8.resistance)}</span>
                      </div>
                    )}
                    {s8.support != null && s8.resistance != null && (
                      <div className="w-full h-px bg-white/08" />
                    )}
                    {s8.support != null && (
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#10B981]">Support</span>
                        <span className="text-xs font-mono text-[#10B981]">{usd(s8.support)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              <KV label="RSI (14)" value={num(s8.rsi_14)} />
              <KV label="Trend" value={s8.trend} />
              <KV label="MACD Signal" value={s8.macd_signal} />
              <KV label="Forward Bias" value={s8.forward_bias} />
              <KV label="BB Position" value={s8.bb_position} />
              <KV label="Chart Pattern" value={s8.chart_pattern} />
              <KV label="Support" value={usd(s8.support)} />
              <KV label="Resistance" value={usd(s8.resistance)} />
              <KV label="ATR %" value={pct(s8.atr_pct)} />
              <KV label="OBV Trend" value={s8.obv_trend} />
              <KV label="Mean Reversion Score" value={num(s8.mean_reversion_score)} />
              <KV label="Quant Score" value={num(s8.quant_score, 0)} />
            </div>
            {s8.quant_summary && <p className="text-xs text-[#9CA3AF] mt-3">{s8.quant_summary}</p>}
          </Card>

          {/* S9 — Sentiment */}
          <Card id="s9" title="9. Sentiment" open={open.s9} onToggle={() => toggle("s9")}>
            <KV label="Analyst Consensus" value={s9.analyst_consensus} />
            <KV label="News Tone" value={s9.news_tone} />
            <KV label="Short Interest" value={pct(s9.short_interest_pct)} />
            <KV label="Upgrade Momentum" value={s9.upgrade_momentum} />
            <KV label="Contrarian Signal" value={s9.contrarian_signal == null ? "—" : s9.contrarian_signal ? "Yes" : "No"} />
            <KV label="Retail Euphoria" value={s9.retail_euphoria == null ? "—" : s9.retail_euphoria ? "Yes" : "No"} />
            <KV label="Sentiment Score" value={num(s9.sentiment_score, 0)} />
            {s9.sentiment_summary && <p className="text-xs text-[#9CA3AF] mt-3">{s9.sentiment_summary}</p>}
          </Card>

          {/* S10 — Institutional */}
          <Card id="s10" title="10. Institutional Activity" open={open.s10} onToggle={() => toggle("s10")}>
            {s10.multi_fund_flag && (
              <p className="text-xs text-[#10B981] font-bold mb-3">2+ institutional funds holding — convergence signal</p>
            )}
            {/* Ownership summary from Yahoo Finance */}
            {(s10.institutional_pct != null || s10.insider_pct != null) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {s10.institutional_pct != null && (
                  <div className="bg-white/03 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-1">Institutional</p>
                    <p className="text-lg font-bold font-mono text-[#0EA5E9]">{Number(s10.institutional_pct).toFixed(1)}%</p>
                  </div>
                )}
                {s10.insider_pct != null && (
                  <div className="bg-white/03 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-1">Insider</p>
                    <p className="text-lg font-bold font-mono text-[#E8EDF2]">{Number(s10.insider_pct).toFixed(1)}%</p>
                  </div>
                )}
              </div>
            )}
            {/* Major holders */}
            {Array.isArray(s10.major_holders) && s10.major_holders.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
                  Known Major Holders <AiTag title="From LLM training knowledge — verify with SEC 13F filings" />
                </p>
                <div className="space-y-1">
                  {(s10.major_holders as any[]).slice(0, 6).map((h: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-[#C4CDD6]">{h.name ?? h}</span>
                      {h.pct != null && <span className="font-mono text-[#6B7280]">{Number(h.pct).toFixed(1)}%</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Analyst consensus from rating history */}
            {(s10.analyst_consensus || s10.analyst_target || s10.analyst_trend) && (
              <div className="mb-3 bg-white/02 rounded-lg p-3">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Analyst Ratings <AiTag title="From LLM training knowledge — verify with current broker data" />
                </p>
                {s10.analyst_consensus && <KV label="Consensus" value={s10.analyst_consensus} />}
                {s10.analyst_target && <KV label="Avg Target" value={usd(s10.analyst_target)} color="#10B981" />}
                {s10.analyst_trend && <KV label="Rating Trend (24m)" value={s10.analyst_trend} />}
                {s10.analyst_summary && <p className="text-[11px] text-[#9CA3AF] mt-2">{s10.analyst_summary}</p>}
              </div>
            )}
            {/* Convergence signals from institutional agent */}
            {Array.isArray(s10.convergence_signals) && s10.convergence_signals.length > 0 && (
              <div className="space-y-2">
                {(s10.convergence_signals as any[]).map((c: any, i: number) => (
                  <div key={i} className="bg-white/03 rounded-lg p-3 text-xs text-[#C4CDD6]">
                    <span className="font-bold text-[#E8EDF2]">{c.fund ?? c.institution}</span>
                    {c.action && <span className="ml-2 text-[#6B7280]">{c.action}</span>}
                    {c.shares && <span className="ml-2 font-mono">{c.shares} shares</span>}
                  </div>
                ))}
              </div>
            )}
            {s10.note && <p className="text-[11px] text-[#4B5563] mt-2">{s10.note}</p>}
          </Card>

          {/* S11 — Performance */}
          <Card id="s11" title="11. Historical Performance" open={open.s11} onToggle={() => toggle("s11")}>
            {[s11.ret_1m, s11.ret_3m, s11.ret_6m, s11.ret_1yr].every(v => v == null) && (
              <p className="text-xs text-[#4B5563] mb-3">Return data unavailable for this run. Re-run with Force Refresh to retry.</p>
            )}
            <div className="grid grid-cols-2 gap-x-6">
              <KV label="1M Return" value={pct(s11.ret_1m)} color={s11.ret_1m != null ? (s11.ret_1m >= 0 ? "#10B981" : "#EF4444") : undefined} />
              <KV label="3M Return" value={pct(s11.ret_3m)} color={s11.ret_3m != null ? (s11.ret_3m >= 0 ? "#10B981" : "#EF4444") : undefined} />
              <KV label="6M Return" value={pct(s11.ret_6m)} color={s11.ret_6m != null ? (s11.ret_6m >= 0 ? "#10B981" : "#EF4444") : undefined} />
              <KV label="1yr Return" value={pct(s11.ret_1yr)} color={s11.ret_1yr != null ? (s11.ret_1yr >= 0 ? "#10B981" : "#EF4444") : undefined} />
              <KV label="vs SPY 1yr" value={pct(s11.vs_spy_1yr)} />
              <KV label="52w High" value={usd(s11.high_52w)} />
              <KV label="52w Low" value={usd(s11.low_52w)} />
              <KV label="% From 52w High" value={pct(s11.pct_from_high)} />
            </div>
          </Card>

          {/* S12 — Risk */}
          <Card id="s12" title="12. Risk Dashboard" open={open.s12} onToggle={() => toggle("s12")}>
            <div className="grid grid-cols-2 gap-x-6">
              <KV label="Beta" value={s12.beta != null ? num(s12.beta) : "—"}
                color={s12.beta != null ? (s12.beta > 1.5 ? "#EF4444" : s12.beta < 0.8 ? "#10B981" : "#C4CDD6") : undefined} />
              <KV label="Liquidity Risk" value={s12.liquidity_risk ?? "—"}
                color={s12.liquidity_risk === "low" ? "#10B981" : s12.liquidity_risk === "high" ? "#EF4444" : "#F59E0B"} />
              <KV label="Max Drawdown" value={s12.max_drawdown != null ? pct(s12.max_drawdown) : "—"}
                color={s12.max_drawdown != null && s12.max_drawdown < -30 ? "#EF4444" : undefined} />
              <KV label="30d Volatility" value={s12.volatility_pct != null ? pct(s12.volatility_pct) : "—"} />
              <KV label="ATR %" value={s12.atr_pct != null ? pct(s12.atr_pct) : "—"} />
              <KV label="Net Debt / EBITDA" value={s12.debt_to_equity != null ? num(s12.debt_to_equity) : "—"}
                color={s12.debt_to_equity != null ? (s12.debt_to_equity > 4 ? "#EF4444" : s12.debt_to_equity > 2 ? "#F59E0B" : "#10B981") : undefined} />
              <KV label="Current Ratio" value={s12.current_ratio != null ? num(s12.current_ratio) : "—"}
                color={s12.current_ratio != null ? (s12.current_ratio < 1 ? "#EF4444" : s12.current_ratio > 2 ? "#10B981" : "#C4CDD6") : undefined} />
              <KV label="Geographic Risk" value={s12.geographic_concentration ?? "No flag"} />
            </div>
            {/* Key risks from recommendation */}
            {Array.isArray(s7.key_risks) && s7.key_risks.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  Key Risks
                  <AiTag title="Risk factors from LLM training knowledge — not exhaustive" />
                </p>
                <ul className="space-y-1.5">
                  {(s7.key_risks as string[]).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#C4CDD6]">
                      <span className="text-[#EF4444] mt-0.5 shrink-0">▲</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(s12.data_conflicts) && s12.data_conflicts.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider mb-1">Data Conflicts</p>
                {(s12.data_conflicts as any[]).map((c, i) => (
                  <p key={i} className="text-xs text-[#F59E0B]">⚠ {typeof c === "string" ? c : c.metric ?? c.resolution ?? JSON.stringify(c)}</p>
                ))}
              </div>
            )}
          </Card>

          {/* S13 — Scenarios */}
          <Card id="s13" title="13. Scenario Analysis" open={open.s13} onToggle={() => toggle("s13")}>
            <p className="mb-3"><AiTag title="Bull/Base/Bear scenarios and price targets are AI-synthesised from live scoring data and LLM training knowledge — not analyst forecasts" /></p>
            {/* Price target chart */}
            {(s13.bull?.price_target || s13.base?.price_target || s13.bear?.price_target) && (() => {
              const chartData = [
                { name: "Bear", price: s13.bear?.price_target ?? 0, color: "#EF4444", prob: s13.bear?.probability ?? 20 },
                { name: "Base", price: s13.base?.price_target ?? 0, color: "#0EA5E9", prob: s13.base?.probability ?? 50 },
                { name: "Bull", price: s13.bull?.price_target ?? 0, color: "#10B981", prob: s13.bull?.probability ?? 30 },
              ];
              const minVal = Math.min(...chartData.map(d => d.price)) * 0.95;
              return (
                <div className="mb-5">
                  <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-3">Price Targets</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 60, top: 4, bottom: 4 }}>
                      <XAxis type="number" domain={[minVal, "auto"]} tick={{ fill: "#4B5563", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 11 }} width={36} />
                      <RTooltip
                        formatter={(v: any) => [`$${v}`, "Target"]}
                        contentStyle={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: "#9CA3AF" }}
                      />
                      <Bar dataKey="price" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: any) => `$${v}`, fill: "#9CA3AF", fontSize: 11 }}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} fillOpacity={0.7} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: "bull", label: "Bull Case", prob: s13.bull?.probability ?? 30, color: "#10B981", data: s13.bull },
                { key: "base", label: "Base Case", prob: s13.base?.probability ?? 50, color: "#0EA5E9", data: s13.base },
                { key: "bear", label: "Bear Case", prob: s13.bear?.probability ?? 20, color: "#EF4444", data: s13.bear },
              ].map(({ key, label, prob, color, data }) => (
                <div key={key} className="bg-white/03 rounded-xl p-4" style={{ borderLeft: `2px solid ${color}` }}>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color }}>{label}</span>
                    <span className="text-[10px] text-[#6B7280]">{prob}% prob</span>
                  </div>
                  {data?.price_target && (
                    <p className="text-lg font-bold font-mono" style={{ color }}>{usd(data.price_target)}</p>
                  )}
                  {(data?.upside_pct != null || data?.downside_pct != null) && (
                    <p className="text-xs font-mono text-[#9CA3AF]">
                      {data.upside_pct != null ? `+${data.upside_pct}%` : `-${data.downside_pct}%`}
                    </p>
                  )}
                  {(data?.catalyst ?? data?.trigger ?? data?.assumptions) && (
                    <p className="text-[10px] text-[#6B7280] mt-2 leading-relaxed">
                      {data.catalyst ?? data.trigger ?? data.assumptions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* S14 — Data Reliability */}
          <Card id="s14" title="14. Data Reliability" open={open.s14} onToggle={() => toggle("s14")}>
            {/* Confidence level with colour */}
            {(() => {
              const lvl = typeof s14.data_confidence === "string" ? s14.data_confidence : (s14.data_confidence as any)?.level ?? "medium";
              const color = lvl === "high" ? "#10B981" : lvl === "low" ? "#EF4444" : "#F59E0B";
              return (
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold uppercase" style={{ color }}>{lvl} confidence</span>
                  <div className="flex gap-1">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-8 h-1.5 rounded-full"
                        style={{ background: i <= (lvl === "high" ? 3 : lvl === "medium" ? 2 : 1) ? color : "rgba(255,255,255,0.08)" }} />
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* Why is confidence at this level */}
            {s14.confidence_reason && (
              <p className="text-[11px] text-[#9CA3AF] leading-relaxed mb-4">{s14.confidence_reason}</p>
            )}
            <KV label="Sources checked" value={s14.sources_count ?? "—"} />
            {s14.conflicts_count != null && (
              <KV label="Data conflicts" value={s14.conflicts_count}
                color={s14.conflicts_count > 0 ? "#F59E0B" : "#10B981"} />
            )}
            <KV label="Last Updated" value={s14.last_updated} />
            <KV label="Agents Run" value={(s14.agents_run as string[] ?? []).join(", ")} />
            {/* Per-source breakdown */}
            {Array.isArray(s14.sources) && s14.sources.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Data Sources</p>
                <div className="space-y-1.5">
                  {(s14.sources as any[]).filter(src => src.type !== "conflict").map((src: any, i: number) => {
                    const isLlm = src.type === "llm_knowledge";
                    return (
                      <div key={i} className="flex items-start gap-2 bg-white/02 rounded-lg p-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                          isLlm ? "bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20"
                                : "bg-[#0EA5E9]/10 text-[#0EA5E9] border border-[#0EA5E9]/20"
                        }`}>{isLlm ? "AI" : "API"}</span>
                        <div>
                          <p className="text-[10px] font-bold text-[#C4CDD6]">{src.field}</p>
                          <p className="text-[10px] text-[#4B5563]">{src.source}</p>
                          {src.note && <p className="text-[10px] text-[#374151] mt-0.5">{src.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

        </main>
      </div>
    </div>
  );
}
