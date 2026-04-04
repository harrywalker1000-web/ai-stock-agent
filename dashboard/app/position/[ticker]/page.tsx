"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import Link from "next/link";
import { MOCK_POSITION_DETAIL } from "@/lib/mock-data";

const CandlestickChart = lazy(() => import("@/components/CandlestickChart"));

type PositionDetail = typeof MOCK_POSITION_DETAIL;

// ── Small reusable components ────────────────────────────────────────────────

function SectionCard({ title, children, dataSource }: { title: string; children: React.ReactNode; dataSource?: "live" | "llm" | "mixed" }) {
  const badge = dataSource === "live"
    ? { label: "Live API", color: "#10B981" }
    : dataSource === "llm"
    ? { label: "LLM estimate — may be stale", color: "#F59E0B" }
    : dataSource === "mixed"
    ? { label: "Live + LLM", color: "#F5A623" }
    : null;
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-bold text-[#E8EDF2]">{title}</h2>
        {badge && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ color: badge.color, background: `${badge.color}18` }}>
            {badge.label}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function CheckRow({ item, pass, detail }: { item: string; pass: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/05 last:border-0">
      <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${pass ? "bg-[#10B981]/20" : "bg-[#EF4444]/20"}`}>
        {pass ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3"><polyline points="20,6 9,17 4,12" /></svg>
        ) : (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm text-[#E8EDF2] font-medium">{item}</p>
        {detail && <p className="text-xs text-[#6B7280] mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

function AgentScoreBar({ agent, score, view }: { agent: string; score: number; view: string }) {
  const color = score >= 70 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-start gap-4 py-3 border-b border-white/06 last:border-0">
      <div className="w-24 flex-shrink-0">
        <span className="text-xs font-semibold text-[#E8EDF2]">{agent}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
          </div>
          <span className="text-xs font-mono font-bold w-6" style={{ color }}>{score}</span>
        </div>
        <p className="text-xs text-[#6B7280]">{view}</p>
      </div>
    </div>
  );
}

function FmtBn(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function FmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

// ── Main page ────────────────────────────────────────────────────────────────

type LiveComp = {
  ticker: string; company: string; is_subject?: boolean;
  revenue_bn: number | null; pe_ratio: number | null; ps_ratio: number | null;
  ebitda_margin_pct: number | null; net_margin_pct: number | null; de_ratio: number | null;
};

export default function PositionPage({ params }: { params: { ticker: string } }) {
  const { ticker } = params;
  const [position, setPosition] = useState<PositionDetail | null>(null);
const [liveComps, setLiveComps] = useState<{ comparables: LiveComp[]; note: string } | null>(null);
  const [compsLoading, setCompsLoading] = useState(true);

  useEffect(() => {
    // Use the dedicated position API which assembles all agent data
    fetch(`/api/position/${ticker}`)
      .then((r) => r.json())
      .then((data) => setPosition({ ...MOCK_POSITION_DETAIL, ...data }))
      .catch(() => setPosition(MOCK_POSITION_DETAIL));
  }, [ticker]);

  useEffect(() => {
    setCompsLoading(true);
    fetch(`/api/comparables/${ticker}`)
      .then((r) => r.json())
      .then((data) => setLiveComps(data))
      .catch(() => setLiveComps(null))
      .finally(() => setCompsLoading(false));
  }, [ticker]);

  if (!position) {
    return (
      <div className="min-h-screen bg-[#080C10] flex items-center justify-center">
        <div className="text-[#6B7280]">Loading...</div>
      </div>
    );
  }

  const isProfit = position.pct_change >= 0;
  const pnlColor = isProfit ? "#10B981" : "#EF4444";
  const allAgentScores = position.agent_scores ?? MOCK_POSITION_DETAIL.agent_scores;
  const bullishAgents = allAgentScores.filter((a) => a.score >= 70).map((a) => a.agent);
  const bearishAgents = allAgentScores.filter((a) => a.score < 50).map((a) => a.agent);

  const fm = position.fund_mandate ?? MOCK_POSITION_DETAIL.fund_mandate;
  const ci = position.company_info ?? MOCK_POSITION_DETAIL.company_info;
  const fs = position.financial_snapshot ?? MOCK_POSITION_DETAIL.financial_snapshot;
  const comps = liveComps?.comparables ?? (position.comparables ?? MOCK_POSITION_DETAIL.comparables);
  const ma = position.market_analysis ?? MOCK_POSITION_DETAIL.market_analysis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const technicalData = (position as any).technical_data ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentDebate = (position as any).agent_debate ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentimentData = (position as any).sentiment_data ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newsCatalysts: Array<{ticker:string;catalyst:string;catalyst_type:string;direction:string;signal_confidence:string;reasoning:string}> = (position as any).news_catalysts ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineSource: string | undefined = (position as any)._source;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macroRegime: string | undefined = (position as any)._macro_regime;
  const qe = position.quality_of_earnings ?? MOCK_POSITION_DETAIL.quality_of_earnings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mgmt = (position as any).management_team ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arh = (position as any).analyst_rating_history ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ct = (position as any).cap_table ?? null;
  const sc = position.setup_checklist ?? MOCK_POSITION_DETAIL.setup_checklist;
  const val = position.valuation ?? MOCK_POSITION_DETAIL.valuation;
  const rec = position.recommendation ?? MOCK_POSITION_DETAIL.recommendation;
  const thesisBullets = position.investment_thesis_bullets ?? MOCK_POSITION_DETAIL.investment_thesis_bullets;
  const mandateChecklist = position.mandate_checklist ?? MOCK_POSITION_DETAIL.mandate_checklist;

  // Comparables colour helper
  const subjectComp = comps.find((c) => (c as { is_subject?: boolean }).is_subject);
  function compColor(field: "ebitda_margin_pct" | "net_margin_pct", peer: typeof comps[0]) {
    if (!subjectComp) return "text-[#E8EDF2]";
    const sv = (subjectComp as Record<string, unknown>)[field] as number | null;
    const pv = peer[field] as number | null;
    if (sv == null || pv == null) return "text-[#6B7280]";
    return sv >= pv ? "text-[#10B981]" : "text-[#EF4444]";
  }

  return (
    <div className="min-h-screen bg-[#080C10] pb-20">
      <div className="max-w-7xl mx-auto px-6 pt-8">

        {/* Breadcrumb */}
        <Link href="/dashboard" className="flex items-center gap-2 text-[#6B7280] hover:text-[#E8EDF2] transition-colors mb-6 text-sm w-fit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6" /></svg>
          Back to Dashboard
        </Link>

        {/* ── Position header ── */}
        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="font-display text-4xl font-bold text-[#E8EDF2]">{position.ticker}</h1>
                <span className={position.direction === "long" ? "badge-long" : "badge-short"}>{position.direction}</span>
                <span className="text-xs font-medium text-[#6B7280] px-2.5 py-1 rounded-lg bg-white/05 border border-white/08">{position.sector}</span>
                <span className="text-xs font-bold text-[#F5A623] px-2.5 py-1 rounded-lg bg-[#F5A623]/10">
                  Scenario {position.scenario ?? "B"}
                </span>
                {fm?.setup_type && (
                  <span className="text-xs font-bold text-[#8B5CF6] px-2.5 py-1 rounded-lg bg-[#8B5CF6]/10">{fm.setup_type}</span>
                )}
              </div>
              <p className="text-[#6B7280]">{position.company}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-4xl font-bold" style={{ color: pnlColor }}>
                {position.pct_change >= 0 ? "+" : ""}{position.pct_change.toFixed(2)}%
              </p>
              <p className="text-sm mt-0.5" style={{ color: pnlColor }}>
                {position.pnl_absolute >= 0 ? "+" : ""}${Math.abs(position.pnl_absolute).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-6 border-t border-white/06">
            {[
              { label: "Entry Price", value: `$${position.entry_price.toFixed(2)}` },
              { label: "Current Price", value: `$${position.current_price.toFixed(2)}` },
              { label: "Position Size", value: `$${(position.position_size / 1000).toFixed(1)}K` },
              { label: "% Portfolio", value: `${position.pct_portfolio.toFixed(1)}%` },
              { label: "Entry Date", value: position.entry_date },
              { label: "Conviction", value: `${position.conviction}/100` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-1">{label}</p>
                <p className="font-mono font-semibold text-[#E8EDF2]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recommendation + Thesis ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Recommendation badge */}
          <div className="card p-6 flex flex-col justify-between">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2] mb-4">Recommendation</h2>
            <div className="flex items-center gap-4 mb-5">
              <div className={`px-5 py-3 rounded-xl text-2xl font-display font-bold ${rec.direction === "LONG" ? "bg-[#10B981]/20 text-[#10B981]" : "bg-[#EF4444]/20 text-[#EF4444]"}`}>
                {rec.direction}
              </div>
              <div>
                <p className="text-3xl font-display font-bold text-[#E8EDF2]">{val?.expected_roi_2_3yr ?? position.expected_roi ?? "—"}</p>
                <p className="text-xs text-[#6B7280]">Expected Return</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#6B7280]">Conviction</span>
                <span className="font-mono font-bold text-[#E8EDF2]">{rec.conviction ?? position.conviction}/100</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${rec.conviction ?? position.conviction}%` }} />
              </div>
              {rec.stop_loss_note && (
                <p className="text-xs text-[#6B7280] mt-3 leading-relaxed">{rec.stop_loss_note}</p>
              )}
            </div>
          </div>

          {/* Investment thesis bullets */}
          <div className="lg:col-span-2 card p-6 bg-gradient-to-br from-[#F5A623]/10 to-transparent border border-[#F5A623]/20">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2] mb-4">Investment Thesis</h2>
            <ul className="space-y-2.5">
              {thesisBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-[#F5A623]/20 text-[#F5A623] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-sm text-[#E8EDF2] leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Price chart ── */}
        <div className="card p-6 mb-6">
          <Suspense fallback={<div style={{ height: 310 }} className="flex items-center justify-center text-xs text-[#6B7280]">Loading chart...</div>}>
            <CandlestickChart ticker={position.ticker} entryPrice={position.entry_price} />
          </Suspense>
        </div>

        {/* ── Fund Mandate + Setup Checklist ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <SectionCard title="Fund Mandate Checklist" dataSource="mixed">
            {mandateChecklist.map((item) => (
              <CheckRow key={item.item} item={item.item} pass={item.pass} />
            ))}
            {fm && (
              <div className="mt-4 pt-4 border-t border-white/06 grid grid-cols-2 gap-3">
                {[
                  { label: "Market Cap", value: fm.market_cap_figure },
                  { label: "Avg Daily Volume", value: fm.avg_daily_volume_usd },
                  { label: "Float %", value: fm.float_pct ? `${fm.float_pct}%` : "—" },
                  { label: "Exchange", value: fm.exchange ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm font-mono text-[#E8EDF2]">{value}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-0.5">Geography / Sanctions</p>
                  <p className="text-xs text-[#E8EDF2]">{fm.geography_flags.exposure_detail}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-0.5">PEPs Check</p>
                  <p className="text-xs text-[#E8EDF2]">{fm.peps_check.notes}</p>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Setup Checklist" dataSource="mixed">
            {(sc as Array<{ item: string; detail: string }>).map((item) => (
              <div key={item.item} className="py-2.5 border-b border-white/05 last:border-0">
                <p className="text-xs font-semibold text-[#E8EDF2] uppercase tracking-wider mb-0.5">{item.item}</p>
                <p className="text-xs text-[#6B7280] leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </SectionCard>
        </div>

        {/* ── Financial Snapshot + Comparables ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Financial Snapshot */}
          <SectionCard title="Financial Snapshot" dataSource="mixed">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/08">
                    <th className="text-left text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">Period</th>
                    <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">Revenue</th>
                    <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">EBITDA</th>
                    <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">Net Income</th>
                  </tr>
                </thead>
                <tbody>
                  {(fs?.historical ?? []).map((row) => (
                    <tr key={row.year} className="border-b border-white/04">
                      <td className="py-2 font-mono text-[#6B7280]">{row.year}</td>
                      <td className="py-2 text-right font-mono text-[#E8EDF2]">{FmtBn(row.revenue)}</td>
                      <td className="py-2 text-right font-mono text-[#E8EDF2]">{FmtBn(row.ebitda)}</td>
                      <td className={`py-2 text-right font-mono ${(row.net_income ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{FmtBn(row.net_income)}</td>
                    </tr>
                  ))}
                  {(fs?.forward ?? []).map((row) => (
                    <tr key={row.year} className="border-b border-white/04 border-dashed">
                      <td className="py-2 font-mono text-[#F59E0B]">{row.year}</td>
                      <td className="py-2 text-right font-mono text-[#F59E0B]/80">{FmtBn(row.revenue)}</td>
                      <td className="py-2 text-right font-mono text-[#F59E0B]/80">{FmtBn(row.ebitda)}</td>
                      <td className={`py-2 text-right font-mono ${(row.net_income ?? 0) >= 0 ? "text-[#10B981]/80" : "text-[#EF4444]/80"}`}>{FmtBn(row.net_income)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Data confidence from pipeline */}
            {(() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dc = (fs as any)?.data_confidence as {level?: string; sources_used?: string[]; conflicts_count?: number} | undefined;
              if (!dc) return null;
              const lvl = dc.level ?? "";
              return (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className={`font-bold px-1.5 py-0.5 rounded ${lvl === "high" ? "bg-[#10B981]/10 text-[#10B981]" : lvl === "medium" ? "bg-[#F59E0B]/10 text-[#F59E0B]" : "bg-[#EF4444]/10 text-[#EF4444]"}`}>
                    {lvl} confidence
                  </span>
                  <span className="text-[#6B7280]">Sources: {(dc.sources_used ?? []).join(", ")}</span>
                  {dc.conflicts_count ? <span className="text-[#F59E0B]">{dc.conflicts_count} conflict(s)</span> : null}
                </div>
              );
            })()}
            <p className="text-xs text-[#6B7280] mt-2">Yellow rows = forward estimates ({(fs?.forward?.[0] as { source?: string } | undefined)?.source ?? "analyst consensus"})</p>
          </SectionCard>

          {/* Comparables */}
          <SectionCard title="Peer Comparables" dataSource={liveComps ? "live" : "mixed"}>
            {compsLoading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-[#6B7280]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623] animate-pulse" />
                Fetching live data from Yahoo Finance...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/08">
                      <th className="text-left text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">Ticker</th>
                      <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">Rev</th>
                      <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">P/E</th>
                      <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">P/S</th>
                      <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">EBITDA Mgn</th>
                      <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">Net Mgn</th>
                      <th className="text-right text-[#6B7280] pb-2 font-semibold uppercase tracking-wider">D/E</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((c) => {
                      const isSubject = (c as { is_subject?: boolean }).is_subject;
                      const lc = c as LiveComp;
                      // For P/E: lower is "cheaper" — green if we are cheaper
                      function peColor(peer: LiveComp) {
                        const sv = (subjectComp as LiveComp | undefined)?.pe_ratio;
                        if (!sv || !peer.pe_ratio) return "text-[#6B7280]";
                        return sv <= peer.pe_ratio ? "text-[#10B981]" : "text-[#EF4444]";
                      }
                      return (
                        <tr key={c.ticker} className={`border-b border-white/04 ${isSubject ? "bg-[#F5A623]/05" : ""}`}>
                          <td className="py-2">
                            <span className={`font-mono font-bold ${isSubject ? "text-[#F5A623]" : "text-[#E8EDF2]"}`}>{c.ticker}</span>
                            {isSubject && <span className="ml-1 text-[#F5A623] text-xs">(us)</span>}
                          </td>
                          <td className="py-2 text-right font-mono text-[#E8EDF2]">{lc.revenue_bn != null ? `$${lc.revenue_bn.toFixed(1)}B` : "—"}</td>
                          <td className={`py-2 text-right font-mono font-semibold ${isSubject ? "text-[#E8EDF2]" : peColor(lc)}`}>{lc.pe_ratio != null ? lc.pe_ratio.toFixed(1) + "x" : "—"}</td>
                          <td className="py-2 text-right font-mono text-[#E8EDF2]">{lc.ps_ratio != null ? lc.ps_ratio.toFixed(1) + "x" : "—"}</td>
                          <td className={`py-2 text-right font-mono font-semibold ${isSubject ? "text-[#E8EDF2]" : compColor("ebitda_margin_pct", c)}`}>{FmtPct(lc.ebitda_margin_pct)}</td>
                          <td className={`py-2 text-right font-mono font-semibold ${isSubject ? "text-[#E8EDF2]" : compColor("net_margin_pct", c)}`}>{FmtPct(lc.net_margin_pct)}</td>
                          <td className="py-2 text-right font-mono text-[#E8EDF2]">{lc.de_ratio != null ? lc.de_ratio.toFixed(1) + "x" : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-[#6B7280] mt-3">
              {liveComps?.note && <span className="mr-2">Peers: {liveComps.note}.</span>}
              P/E &amp; margins: green = we are cheaper/more profitable. Data: Yahoo Finance (TTM).
            </p>
          </SectionCard>
        </div>

        {/* ── Market Analysis + Quality of Earnings ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <SectionCard title="Market Analysis" dataSource={pipelineSource === "pipeline" ? "live" : "llm"}>
            {macroRegime && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${macroRegime === "RISK-OFF" ? "bg-[#EF4444]/10 text-[#EF4444]" : macroRegime === "RISK-ON" ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#F59E0B]/10 text-[#F59E0B]"}`}>
                Macro Regime: {macroRegime}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(ma as any)?._favoured_themes && <span className="font-normal text-[#6B7280] ml-2">Favoured: {((ma as any)._favoured_themes as string[]).slice(0,3).join(", ")}</span>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: "TAM", value: ma?.tam_usd ?? "—" },
                { label: "Growth Rate", value: ma?.growth_rate ?? "—" },
                { label: "Competition", value: ma?.competition_intensity ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/03 rounded-xl p-3">
                  <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-sm font-semibold text-[#E8EDF2]">{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Sector Trends</p>
                <p className="text-sm text-[#E8EDF2] leading-relaxed">{ma?.sector_trends ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Macro Factors</p>
                <p className="text-sm text-[#E8EDF2] leading-relaxed">{ma?.macro_factors ?? "—"}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Quality of Earnings" dataSource="mixed">
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white/03">
              <div>
                <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-0.5">Economic Moat</p>
                <p className={`text-xl font-display font-bold ${qe?.moat === "Wide" ? "text-[#10B981]" : qe?.moat === "Narrow" ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>{qe?.moat ?? "—"}</p>
              </div>
              <div className="ml-4">
                <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-0.5">Sustainability</p>
                <p className="text-sm text-[#E8EDF2]">{qe?.sustainability ?? "—"}</p>
              </div>
            </div>
            <div className="mb-3">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Competitive Advantages</p>
              <ul className="space-y-1.5">
                {(qe?.competitive_advantages ?? []).map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#E8EDF2]">
                    <span className="text-[#10B981] mt-0.5">▸</span>{a}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Barriers to Entry</p>
              <p className="text-sm text-[#E8EDF2] leading-relaxed">{qe?.barriers_to_entry ?? "—"}</p>
            </div>
          </SectionCard>
        </div>

        {/* ── Valuation + Market Timing ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <SectionCard title="Valuation" dataSource={pipelineSource === "pipeline" ? "live" : "mixed"}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: "Trade Type", value: val?.trade_type_classification ?? "—" },
                { label: "Methodology", value: val?.methodology ?? "—" },
                { label: "Analyst Target (Live)", value: sentimentData?.analyst_target_live != null ? `$${sentimentData.analyst_target_live.toFixed(0)}` : val?.analyst_consensus_target ? `$${val.analyst_consensus_target}` : "—" },
                { label: "P/E (Trailing)", value: (fs as unknown as {pe_ratio?: number})?.pe_ratio != null ? `${((fs as unknown as {pe_ratio: number}).pe_ratio).toFixed(1)}x` : "—" },
                { label: "P/E vs Peers", value: (fs as unknown as {pe_ratio?: number; pe_peer_avg?: number})?.pe_ratio != null && (fs as unknown as {pe_peer_avg?: number})?.pe_peer_avg != null ? `${((fs as unknown as {pe_ratio: number}).pe_ratio).toFixed(1)}x vs ${((fs as unknown as {pe_peer_avg: number}).pe_peer_avg).toFixed(1)}x avg` : "—" },
                { label: "Expected ROI 2-3yr", value: val?.expected_roi_2_3yr ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/03 rounded-xl p-3">
                  <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-sm font-mono font-semibold text-[#E8EDF2]">{value}</p>
                </div>
              ))}
            </div>
            {val?.implied_multiples && (
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Implied Multiples</p>
                <p className="text-sm text-[#E8EDF2] leading-relaxed">{val.implied_multiples}</p>
              </div>
            )}
            {val?.is_forecast_realistic && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Forecast Realism</p>
                <p className="text-sm text-[#E8EDF2] leading-relaxed">{val.is_forecast_realistic}</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Market Timing" dataSource="mixed">
            <div className="p-4 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 mb-4">
              <p className="text-xs font-bold text-[#F59E0B] uppercase tracking-wider mb-2">Why Entry NOW</p>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <p className="text-sm text-[#E8EDF2] leading-relaxed">{(position as any).market_timing ?? "Quant timing signals not available for this position."}</p>
            </div>
            {arh && (
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Analyst Ratings (24m)</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "Consensus", value: arh.current_consensus, color: arh.current_consensus === "Buy" ? "#10B981" : arh.current_consensus === "Hold" ? "#F59E0B" : "#EF4444" },
                    { label: "Analysts", value: arh.num_analysts != null ? String(arh.num_analysts) : "—", color: "#E8EDF2" },
                    { label: "Avg Target", value: arh.avg_target_price != null ? `$${arh.avg_target_price}` : "—", color: "#E8EDF2" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white/03 rounded-xl p-2.5 text-center">
                      <p className="text-xs text-[#6B7280] mb-1">{label}</p>
                      <p className="text-sm font-bold" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#6B7280]">24m trend: <span className={arh.trend_24m === "Upgrading" ? "text-[#10B981]" : arh.trend_24m === "Downgrading" ? "text-[#EF4444]" : "text-[#F59E0B]"}>{arh.trend_24m}</span></span>
                  {arh.implied_upside_pct != null && <span className="text-[#10B981] font-mono font-bold">+{arh.implied_upside_pct.toFixed(0)}% implied upside</span>}
                </div>
                <p className="text-xs text-[#6B7280] leading-relaxed mt-2">{arh.summary}</p>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Agent scores ── */}
        <div className="card p-6 mb-6">
          <h2 className="font-display text-lg font-bold text-[#E8EDF2] mb-4">Agent Scores at Entry</h2>
          {bullishAgents.length > 0 && bearishAgents.length > 0 && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20">
              <p className="text-xs font-bold text-[#F59E0B] uppercase tracking-wider mb-1">Signal Conflict Detected</p>
              <p className="text-xs text-[#6B7280]">
                <span className="text-[#10B981]">{bullishAgents.join(", ")}: BULLISH</span>
                {" "}←→{" "}
                <span className="text-[#EF4444]">{bearishAgents.join(", ")}: BEARISH</span>
              </p>
            </div>
          )}
          {allAgentScores.map((a) => (
            <AgentScoreBar key={a.agent} agent={a.agent} score={a.score} view={a.view} />
          ))}
        </div>

        {/* ── Agent Debate (iterative challenge/response/resolution) ── */}
        {agentDebate && (
          <div className="card p-6 mb-6 border border-[#F59E0B]/20">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Agent Debate</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[#F59E0B]/15 text-[#F59E0B]">
                  Spread {agentDebate.spread ?? "≥20"} pts
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#6B7280]">
                  <span className="text-[#10B981] font-bold">{agentDebate.high_agent}</span>
                  {" "}({agentDebate.high_agent_score})
                  {" vs "}
                  <span className="text-[#F59E0B] font-bold">{agentDebate.dissenter}</span>
                  {" "}({agentDebate.original_dissenter_score})
                </span>
              </div>
            </div>

            {/* Tension identified */}
            {agentDebate.tension_identified && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-white/03 border border-white/06">
                <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-1">Tension identified</p>
                <p className="text-xs text-[#9CA3AF] italic">{agentDebate.tension_identified}</p>
              </div>
            )}

            {/* Exchange — 3 steps */}
            <div className="space-y-3">
              {/* Step 1: Committee challenge */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F5A623]/15 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#F5A623]">C</span>
                </div>
                <div className="flex-1 bg-white/03 rounded-xl p-4">
                  <p className="text-[10px] text-[#F5A623] uppercase tracking-wider font-bold mb-1">Committee challenge → {agentDebate.dissenter}</p>
                  <p className="text-sm text-[#C4CDD6] leading-relaxed">{agentDebate.committee_challenge}</p>
                </div>
              </div>

              {/* Step 2: Analyst response */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F59E0B]/15 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#F59E0B]">A</span>
                </div>
                <div className="flex-1 bg-white/03 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-[#F59E0B] uppercase tracking-wider font-bold">{agentDebate.dissenter} response</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
                        agentDebate.analyst_outcome === "held"
                          ? "bg-white/08 text-[#6B7280]"
                          : agentDebate.analyst_outcome === "revised_up"
                          ? "bg-[#10B981]/10 text-[#10B981]"
                          : "bg-[#EF4444]/10 text-[#EF4444]"
                      }`}>
                        {agentDebate.analyst_outcome === "held" ? "held" : agentDebate.analyst_outcome === "revised_up" ? `↑ +${agentDebate.analyst_score_delta}` : `↓ ${agentDebate.analyst_score_delta}`}
                      </span>
                      <span className="font-mono text-[#E8EDF2]">{agentDebate.analyst_revised_score ?? agentDebate.original_dissenter_score}</span>
                    </div>
                  </div>
                  <p className="text-sm text-[#C4CDD6] leading-relaxed">{agentDebate.analyst_response}</p>
                </div>
              </div>

              {/* Step 3: Committee resolution */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F5A623]/15 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#F5A623]">R</span>
                </div>
                <div className="flex-1 bg-white/03 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-[#F5A623] uppercase tracking-wider font-bold">Committee resolution</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#6B7280]">Final {agentDebate.dissenter} score:</span>
                      <span className="font-mono font-bold text-[#E8EDF2]">{agentDebate.final_dissenter_score}</span>
                      {agentDebate.final_dissenter_score !== agentDebate.original_dissenter_score && (
                        <span className={`font-mono text-xs ${(agentDebate.final_dissenter_score ?? 0) > (agentDebate.original_dissenter_score ?? 0) ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                          ({(agentDebate.final_dissenter_score ?? 0) > (agentDebate.original_dissenter_score ?? 0) ? "+" : ""}{(agentDebate.final_dissenter_score ?? 0) - (agentDebate.original_dissenter_score ?? 0)})
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-[#C4CDD6] leading-relaxed">{agentDebate.committee_resolution}</p>
                  {agentDebate.committee_resolution_reasoning && (
                    <p className="text-xs text-[#6B7280] mt-2 italic">Key factor: {agentDebate.committee_resolution_reasoning}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Quant Technical + Sentiment ── */}
        {(technicalData || sentimentData || newsCatalysts.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {technicalData && (
              <SectionCard title="Quant Technical" dataSource="live">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: "Trend", value: technicalData.trend ?? "—", color: technicalData.trend === "uptrend" ? "#10B981" : technicalData.trend === "downtrend" ? "#EF4444" : "#F59E0B" },
                    { label: "RSI (14)", value: technicalData.rsi_14 != null ? technicalData.rsi_14.toFixed(1) : "—", color: technicalData.rsi_14 < 30 ? "#10B981" : technicalData.rsi_14 > 70 ? "#EF4444" : "#E8EDF2" },
                    { label: "MACD", value: technicalData.macd_signal ?? "—", color: technicalData.macd_signal === "bullish" ? "#10B981" : "#EF4444" },
                    { label: "Volume", value: technicalData.volume_trend ?? "—", color: "#E8EDF2" },
                    { label: "Support", value: technicalData.support != null ? `$${technicalData.support.toFixed(2)}` : "—", color: "#10B981" },
                    { label: "Resistance", value: technicalData.resistance != null ? `$${technicalData.resistance.toFixed(2)}` : "—", color: "#EF4444" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white/03 rounded-lg p-2">
                      <p className="text-xs text-[#6B7280] mb-0.5">{label}</p>
                      <p className="text-sm font-mono font-semibold" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mb-2">
                  <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-1">Trade Type</p>
                  <span className="text-xs font-bold text-[#F5A623] bg-[#F5A623]/10 px-2 py-0.5 rounded">{technicalData.trade_type ?? "—"}</span>
                  <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${technicalData.forward_bias === "bullish" ? "text-[#10B981] bg-[#10B981]/10" : "text-[#EF4444] bg-[#EF4444]/10"}`}>{technicalData.forward_bias ?? "—"}</span>
                </div>
                {technicalData.key_patterns?.length > 0 && (
                  <div>
                    <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-1">Patterns</p>
                    <div className="flex flex-wrap gap-1">
                      {technicalData.key_patterns.map((p: string) => (
                        <span key={p} className="text-xs text-[#6B7280] bg-white/05 px-1.5 py-0.5 rounded">{p.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            )}

            {sentimentData && (
              <SectionCard title="Sentiment Analysis" dataSource="live">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: "Analyst Consensus", value: sentimentData.analyst_consensus ?? "—", color: sentimentData.analyst_consensus === "Buy" ? "#10B981" : sentimentData.analyst_consensus === "Sell" ? "#EF4444" : "#F59E0B" },
                    { label: "Upside to Target", value: sentimentData.price_target_upside_pct != null ? `+${sentimentData.price_target_upside_pct.toFixed(1)}%` : "—", color: "#10B981" },
                    { label: "Short Interest", value: sentimentData.short_interest_pct != null ? `${sentimentData.short_interest_pct.toFixed(1)}%` : "—", color: "#E8EDF2" },
                    { label: "Squeeze Risk", value: sentimentData.short_squeeze_risk ?? "—", color: sentimentData.short_squeeze_risk === "high" ? "#EF4444" : sentimentData.short_squeeze_risk === "medium" ? "#F59E0B" : "#10B981" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white/03 rounded-lg p-2">
                      <p className="text-xs text-[#6B7280] mb-0.5">{label}</p>
                      <p className="text-sm font-mono font-semibold" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
                {sentimentData.analyst_target_live && (
                  <div className="mb-2 text-xs text-[#6B7280]">
                    Live targets: <span className="text-[#10B981]">Low ${sentimentData.analyst_low_live?.toFixed(0)}</span> / <span className="text-[#E8EDF2]">${sentimentData.analyst_target_live?.toFixed(0)}</span> / <span className="text-[#10B981]">High ${sentimentData.analyst_high_live?.toFixed(0)}</span>
                    {sentimentData.num_analysts && <span className="ml-1">({sentimentData.num_analysts} analysts)</span>}
                  </div>
                )}
                {sentimentData.contrarian_signal && (
                  <div className="mb-2 px-2 py-1 rounded bg-[#F59E0B]/10 text-xs text-[#F59E0B] font-semibold">Contrarian signal active</div>
                )}
                <p className="text-xs text-[#6B7280] leading-relaxed">{sentimentData.sentiment_summary}</p>
              </SectionCard>
            )}

            {newsCatalysts.length > 0 && (
              <SectionCard title="News Catalysts" dataSource="live">
                <div className="space-y-3">
                  {newsCatalysts.map((c, i) => (
                    <div key={i} className="py-2 border-b border-white/05 last:border-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${c.direction === "LONG" ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#EF4444]/10 text-[#EF4444]"}`}>{c.direction}</span>
                        <span className="text-xs text-[#6B7280]">{c.catalyst_type?.replace(/_/g, " ")}</span>
                        <span className={`ml-auto text-xs font-mono ${c.signal_confidence === "high" ? "text-[#10B981]" : c.signal_confidence === "low" ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>{c.signal_confidence}</span>
                      </div>
                      <p className="text-xs font-semibold text-[#E8EDF2] mb-0.5">{c.catalyst}</p>
                      <p className="text-xs text-[#6B7280] leading-relaxed">{c.reasoning}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* ── Management + Cap Table ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <SectionCard title="Management Team" dataSource="llm">
            {mgmt && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">CEO</p>
                  <p className="text-sm text-[#E8EDF2] leading-relaxed">{mgmt.ceo}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Track Record</p>
                  <p className="text-sm text-[#E8EDF2] leading-relaxed">{mgmt.track_record}</p>
                </div>
                {mgmt.red_flags ? (
                  <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20">
                    <p className="text-xs font-bold text-[#EF4444] uppercase tracking-wider mb-1">Red Flags</p>
                    <p className="text-sm text-[#E8EDF2]">{mgmt.red_flags}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-[#10B981]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12" /></svg>
                    No red flags identified
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Cap Table" dataSource="mixed">
            {ct && (
              <div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Institutions", value: ct.institutional_pct != null ? `${ct.institutional_pct}%` : "—" },
                    { label: "Insiders", value: ct.insider_pct != null ? `${ct.insider_pct}%` : "—" },
                    { label: "Float", value: ct.float_pct != null ? `${ct.float_pct}%` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white/03 rounded-xl p-3 text-center">
                      <p className="text-xs text-[#6B7280] mb-1">{label}</p>
                      <p className="text-lg font-display font-bold text-[#E8EDF2]">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Major Holders</p>
                <div className="space-y-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((ct as any).major_holders ?? []).map((h: any) => (
                    <div key={h.name} className="flex items-center justify-between">
                      <span className="text-xs text-[#E8EDF2]">{h.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${Math.min(h.pct * 3, 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono text-[#6B7280] w-8 text-right">{h.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Company Info ── */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Company Overview</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-md text-[#F59E0B] bg-[#F59E0B]/10">LLM estimate — may be stale</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: "HQ", value: ci?.hq ?? "—" },
                  { label: "Employees", value: ci?.employees != null ? ci.employees.toLocaleString() : "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-[#E8EDF2]">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-[#6B7280] leading-relaxed">{ci?.overview ?? "—"}</p>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Revenue Segments</p>
                <div className="space-y-2">
                  {(ci?.revenue_segments ?? []).map((seg) => (
                    <div key={seg.segment}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#E8EDF2]">{seg.segment}</span>
                        <span className="text-[#6B7280] font-mono">{seg.weight_pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${seg.weight_pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Geography</p>
                <div className="space-y-1.5">
                  {(ci?.geography_breakdown ?? []).map((g) => (
                    <div key={g.region} className="flex justify-between text-xs">
                      <span className="text-[#E8EDF2]">{g.region}</span>
                      <span className="text-[#6B7280] font-mono">{g.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Review timeline ── */}
        <div className="card p-6">
          <h2 className="font-display text-lg font-bold text-[#E8EDF2] mb-4">Daily Review Timeline</h2>
          <div className="space-y-3">
            {(position.review_timeline && position.review_timeline.length > 0
              ? position.review_timeline
              : []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ).map((r: any, i: number) => {
              const actionColor = r.decision === "enter_long" || r.decision === "hold" || r.decision === "increase"
                ? "#10B981" : r.decision === "decrease" ? "#F59E0B" : "#EF4444";
              const timelineLength = position.review_timeline?.length ?? MOCK_POSITION_DETAIL.review_timeline.length;
              return (
                <div key={i} className="flex gap-4 pb-3 border-b border-white/06 last:border-0">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: actionColor }} />
                    {i < timelineLength - 1 && <div className="w-px flex-1 bg-white/08" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-[#6B7280]">{r.date}</span>
                      <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-md" style={{ color: actionColor, background: `${actionColor}20` }}>
                        {r.decision.replace(/_/g, " ")}
                      </span>
                      {r.conviction != null && (
                        <span className="text-xs text-[#6B7280]">conviction {r.conviction}/100</span>
                      )}
                      {r.size_pct != null && (
                        <span className="text-xs text-[#6B7280]">→ {r.size_pct}% portfolio</span>
                      )}
                    </div>
                    <p className="text-sm text-[#6B7280]">{r.rationale}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
