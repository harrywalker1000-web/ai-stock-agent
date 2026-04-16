/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const SECTIONS = [
  { key: "s1",  label: "Fund Mandate" },
  { key: "s2",  label: "Company Info" },
  { key: "s3",  label: "Setup Checklist" },
  { key: "s4",  label: "Valuation" },
  { key: "s5",  label: "Market Timing" },
  { key: "s6",  label: "Investment Thesis" },
  { key: "s7",  label: "Recommendation" },
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

function CheckList({ items }: { items: any[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((c: any, i: number) => (
        <div key={i} className="flex items-start gap-2">
          <span className={`text-xs mt-0.5 ${c.pass ? "text-[#10B981]" : "text-[#EF4444]"}`}>
            {c.pass ? "✓" : "✗"}
          </span>
          <div>
            <span className="text-xs text-[#C4CDD6]">{c.item}</span>
            {c.note && <span className="text-[10px] text-[#6B7280] ml-2">{c.note}</span>}
          </div>
        </div>
      ))}
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
              className="mt-6 w-full text-[10px] text-[#4B5563] hover:text-[#E8EDF2] py-1.5 px-2 rounded-lg bg-white/03 hover:bg-white/06 transition-all">
              Print / PDF
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
              <div className="text-right shrink-0 ml-4">
                {report.current_price != null && (
                  <p className="font-mono text-2xl font-bold text-[#E8EDF2]">{usd(report.current_price)}</p>
                )}
                {conviction != null && (
                  <div className="mt-1">
                    <span className="text-[10px] text-[#6B7280]">Conviction </span>
                    <span className="text-2xl font-bold font-mono" style={{ color: cvColor }}>{conviction}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Mandate badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
              s1.pass ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30"
                      : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30"
            }`}>
              {s1.pass ? "✓ MANDATE PASS" : `✗ MANDATE FAIL — ${s1.fail_reason}`}
            </div>

            {s7.expected_return_2_3yr && (
              <span className="ml-3 text-xs text-[#6B7280]">
                Expected return 2–3yr: <span className="text-[#E8EDF2] font-mono">{s7.expected_return_2_3yr}</span>
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
            {s2.background?.description && (
              <p className="text-xs text-[#C4CDD6] leading-relaxed mb-4">{s2.background.description}</p>
            )}
            {/* Financial snapshot */}
            {s2.financial_snapshot && Object.keys(s2.financial_snapshot).length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Financials Snapshot</p>
                <div className="bg-white/02 rounded-lg p-3 divide-y divide-white/04">
                  {Object.entries(s2.financial_snapshot as Record<string, any>).slice(0, 10).map(([k, v]) => (
                    <KV key={k} label={k.replace(/_/g, " ")} value={String(v)} />
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
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">Quality of Earnings / Moat</p>
                <p className="text-xs text-[#C4CDD6]">{s2.quality_of_earnings.moat}</p>
              </div>
            )}
          </Card>

          {/* S3 — Setup Checklist */}
          <Card id="s3" title="3. Setup Checklist" open={open.s3} onToggle={() => toggle("s3")}>
            {s3.setup_type && (
              <p className="text-xs text-[#0EA5E9] font-bold mb-3">Setup: {s3.setup_type}</p>
            )}
            <CheckList items={s3.checklist ?? []} />
          </Card>

          {/* S4 — Valuation */}
          <Card id="s4" title="4. Valuation" open={open.s4} onToggle={() => toggle("s4")}>
            {s4.narrative && <p className="text-xs text-[#C4CDD6] leading-relaxed mb-3">{s4.narrative}</p>}
            {s4.methodology && <KV label="Methodology" value={s4.methodology} />}
            {s4.expected_roi_2_3yr && <KV label="Expected ROI 2–3yr" value={s4.expected_roi_2_3yr} color="#10B981" />}
            {s4.consensus_target && <KV label="Consensus Target" value={usd(s4.consensus_target)} />}
            {s4.own_view && <KV label="Our View" value={s4.own_view} />}
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
            {s6.narrative
              ? <p className="text-xs text-[#C4CDD6] leading-relaxed whitespace-pre-wrap">{s6.narrative}</p>
              : <p className="text-xs text-[#4B5563]">No thesis generated.</p>
            }
          </Card>

          {/* S7 — Recommendation */}
          <Card id="s7" title="7. Recommendation" open={open.s7} onToggle={() => toggle("s7")}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Direction",       value: direction,                  color: direction === "BUY" ? "#10B981" : direction === "SELL" ? "#EF4444" : "#F59E0B" },
                { label: "Conviction",      value: conviction ?? "—",          color: cvColor },
                { label: "2–3yr Return",    value: s7.expected_return_2_3yr ?? "—", color: "#E8EDF2" },
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
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Key Risks</p>
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

          {/* S8 — Technical */}
          <Card id="s8" title="8. Technical Analysis" open={open.s8} onToggle={() => toggle("s8")}>
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
            <KV label="Contrarian Signal" value={s9.contrarian_signal} />
            <KV label="Retail Euphoria" value={s9.retail_euphoria ?? "—"} />
            <KV label="Sentiment Score" value={num(s9.sentiment_score, 0)} />
            {s9.sentiment_summary && <p className="text-xs text-[#9CA3AF] mt-3">{s9.sentiment_summary}</p>}
          </Card>

          {/* S10 — Institutional */}
          <Card id="s10" title="10. Institutional Activity" open={open.s10} onToggle={() => toggle("s10")}>
            {s10.multi_fund_flag && (
              <p className="text-xs text-[#10B981] font-bold mb-3">2+ institutional funds holding — convergence signal</p>
            )}
            {Array.isArray(s10.convergence_signals) && s10.convergence_signals.length > 0 ? (
              <div className="space-y-2">
                {(s10.convergence_signals as any[]).map((c: any, i: number) => (
                  <div key={i} className="bg-white/03 rounded-lg p-3 text-xs text-[#C4CDD6]">
                    <span className="font-bold text-[#E8EDF2]">{c.fund ?? c.institution}</span>
                    {c.action && <span className="ml-2 text-[#6B7280]">{c.action}</span>}
                    {c.shares && <span className="ml-2 font-mono">{c.shares} shares</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#4B5563]">{s10.note ?? "No institutional convergence signals found."}</p>
            )}
          </Card>

          {/* S11 — Performance */}
          <Card id="s11" title="11. Historical Performance" open={open.s11} onToggle={() => toggle("s11")}>
            <div className="grid grid-cols-2 gap-x-6">
              <KV label="1M Return" value={pct(s11.ret_1m)} color={s11.ret_1m >= 0 ? "#10B981" : "#EF4444"} />
              <KV label="3M Return" value={pct(s11.ret_3m)} color={s11.ret_3m >= 0 ? "#10B981" : "#EF4444"} />
              <KV label="6M Return" value={pct(s11.ret_6m)} color={s11.ret_6m >= 0 ? "#10B981" : "#EF4444"} />
              <KV label="1yr Return" value={pct(s11.ret_1yr)} color={s11.ret_1yr >= 0 ? "#10B981" : "#EF4444"} />
              <KV label="vs SPY 1yr" value={pct(s11.vs_spy_1yr)} />
              <KV label="52w High" value={usd(s11.high_52w)} />
              <KV label="52w Low" value={usd(s11.low_52w)} />
              <KV label="% From 52w High" value={pct(s11.pct_from_high)} />
            </div>
          </Card>

          {/* S12 — Risk */}
          <Card id="s12" title="12. Risk Dashboard" open={open.s12} onToggle={() => toggle("s12")}>
            <KV label="Beta" value={num(s12.beta)} />
            <KV label="Max Drawdown" value={pct(s12.max_drawdown)} />
            <KV label="30d Volatility" value={pct(s12.volatility_pct)} />
            <KV label="ATR %" value={pct(s12.atr_pct)} />
            <KV label="Net Debt / EBITDA" value={num(s12.debt_to_equity)} />
            <KV label="Current Ratio" value={num(s12.current_ratio)} />
            <KV label="Liquidity Risk" value={s12.liquidity_risk} />
            <KV label="Geographic Concentration" value={s12.geographic_concentration ?? "No flag"} />
            {Array.isArray(s12.data_conflicts) && s12.data_conflicts.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider mb-1">Data Conflicts</p>
                {(s12.data_conflicts as string[]).map((c, i) => (
                  <p key={i} className="text-xs text-[#F59E0B]">⚠ {c}</p>
                ))}
              </div>
            )}
          </Card>

          {/* S13 — Scenarios */}
          <Card id="s13" title="13. Scenario Analysis" open={open.s13} onToggle={() => toggle("s13")}>
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
            <KV label="Data Confidence" value={
              typeof s14.data_confidence === "string"
                ? s14.data_confidence
                : (s14.data_confidence as any)?.level ?? "—"
            } />
            <KV label="Last Updated" value={s14.last_updated} />
            <KV label="Agents Run" value={(s14.agents_run as string[] ?? []).join(", ")} />
            {Array.isArray(s14.sources) && (s14.sources as any[]).map((src: any, i: number) => (
              <div key={i} className="mt-2 bg-white/02 rounded-lg p-2">
                <p className="text-[10px] font-bold text-[#6B7280]">{src.field}</p>
                <p className="text-[10px] text-[#4B5563]">{src.source}</p>
              </div>
            ))}
          </Card>

        </main>
      </div>
    </div>
  );
}
