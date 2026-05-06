/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Report {
  ticker: string; company_name: string; sector: string;
  current_price: number; market_cap: number; date: string;
  direction: string; conviction: number; expected_return_12m: string;
  s2_company: any; s3_setup: any; s4_valuation: any; s5_timing: any;
  s6_thesis: any; s7_recommendation: any; s8_technical: any;
  s9_sentiment: any; s10_institutional: any; s11_performance: any;
  s12_risk: any; s13_scenarios: any;
}

const fmtN = (n: number | null | undefined, d = 1) => n == null ? "—" : n.toFixed(d);
const fmtBn = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
};
const fmtPrice = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const yoy = (curr: number | null, prev: number | null) =>
  !curr || !prev || prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100;
const dirCls = (d: string) => {
  const u = d.toUpperCase();
  if (u.includes("BUY") || u.includes("LONG")) return "bg-green-600 text-white";
  if (u.includes("SELL") || u.includes("SHORT")) return "bg-red-600 text-white";
  return "bg-amber-500 text-white";
};
const convColor = (n: number) => n >= 70 ? "bg-green-500" : n >= 50 ? "bg-amber-400" : "bg-red-400";

function Chapter({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 mt-14 mb-7 print:mt-10 print:break-before-page">
      <div className="w-1 h-7 bg-amber-400 rounded-full shrink-0" />
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#0F172A]">{title}</h2>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function TBD({ title, note }: { title: string; note: string }) {
  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-4 flex gap-3 items-start">
      <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded shrink-0 mt-0.5">TBD</span>
      <div>
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{note}</p>
      </div>
    </div>
  );
}

export default function PitchDetail() {
  const params = useParams();
  const ticker = String(params.ticker).toUpperCase();
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/adhoc/${ticker}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e)));
  }, [ticker]);

  if (err || !data)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        {err ? (
          <div className="text-center">
            <p className="text-4xl font-bold text-[#0F172A] mb-2">{ticker}</p>
            <p className="text-slate-500 text-sm mb-1">No adhoc report found for this ticker.</p>
            <p className="text-slate-400 text-xs mb-6">{err}</p>
            <a href="/pitch" className="text-sm text-amber-600 hover:underline">← Back</a>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 font-mono text-sm">Generating {ticker} pitch…</p>
          </div>
        )}
      </div>
    );

  const s2 = data.s2_company || {};
  const s3 = data.s3_setup || {};
  const s4 = data.s4_valuation || {};
  const s5 = data.s5_timing || {};
  const s6 = data.s6_thesis || {};
  const s7 = data.s7_recommendation || {};
  const s8t = data.s8_technical || {};
  const s9 = data.s9_sentiment || {};
  const s10 = data.s10_institutional || {};
  const s11 = data.s11_performance || {};
  const s12 = data.s12_risk || {};
  const s13 = data.s13_scenarios || {};
  const bg = s2.background || {};
  const fin = s2.financial_snapshot || {};
  const comps: any[] = s2.comparables || [];
  const mgmt = s2.management_team || {};
  const moat = s2.quality_of_earnings || {};
  const mkt = s2.market_analysis || {};
  const checklist: any[] = (s3.checklist || []).filter((c: any) => c.pass && c.item !== "setup_type" && c.item !== "default_risk").slice(0, 6);

  return (
    <div className="min-h-screen bg-white text-[#0F172A]">
      <div className="max-w-[920px] mx-auto px-10 py-12 print:px-8 print:py-10">

        {/* Toolbar */}
        <div className="print:hidden flex items-center justify-between mb-10">
          <a href="/pitch" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">← All Pitches</a>
          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-[#0F172A] text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors"
          >
            Export PDF
          </button>
        </div>

        {/* ── COVER ── */}
        <div className="mb-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Haz Capital Management · Equity Research</p>
              <p className="text-xs text-slate-400 mt-0.5">{data.date}</p>
            </div>
            <span className={`text-sm font-bold px-4 py-2 rounded-lg ${dirCls(data.direction)}`}>
              {data.direction.replace(/_/g, " ")}
            </span>
          </div>

          <div className="border-b-[3px] border-[#0F172A] pb-6 mb-7">
            <h1 className="text-[5.5rem] font-bold tracking-tight leading-none mb-1">{ticker}</h1>
            <p className="text-2xl text-slate-400 font-light">
              {data.company_name !== ticker ? data.company_name : ""}
              {data.sector ? <span className="text-lg"> · {data.sector}</span> : null}
            </p>
          </div>

          {/* Key metrics strip */}
          <div className="grid grid-cols-5 border border-slate-200 rounded-2xl overflow-hidden mb-6 divide-x divide-slate-200">
            {[
              { l: "Price", v: fmtPrice(data.current_price) },
              { l: "Market Cap", v: fmtBn(data.market_cap) },
              { l: "Expected Return", v: data.expected_return_12m },
              { l: "vs 52w High", v: s11.pct_from_high != null ? `${s11.pct_from_high}%` : "—" },
              { l: "Analyst View", v: (s10.analyst_consensus || s9.analyst_consensus || "—") as string },
            ].map((m) => (
              <div key={m.l} className="px-5 py-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{m.l}</p>
                <p className="text-lg font-bold capitalize">{m.v}</p>
              </div>
            ))}
          </div>

          {/* Conviction gauge */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-bold uppercase tracking-widest text-slate-500">Conviction Score</span>
              <span className="font-mono font-bold">{data.conviction} / 100</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-3 rounded-full ${convColor(data.conviction)}`} style={{ width: `${data.conviction}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-300 mt-1 px-0.5">
              {["0", "25", "50", "75", "100"].map((v) => <span key={v}>{v}</span>)}
            </div>
          </div>
        </div>

        {/* ── THESIS (dark card) ── */}
        <div className="bg-[#0F172A] text-white rounded-2xl p-8 mb-5">
          <p className="text-xs font-mono text-amber-400 uppercase tracking-widest mb-4">Investment Thesis</p>
          <p className="text-base leading-relaxed text-slate-200">{s6.narrative || "—"}</p>
        </div>

        {/* Setup checklist — synthesised key positives */}
        {checklist.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {checklist.map((c: any) => (
              <div key={c.item} className="flex gap-2 p-3 bg-green-50 border border-green-100 rounded-xl">
                <span className="text-green-500 shrink-0 text-sm mt-0.5">✓</span>
                <div>
                  <p className="text-xs font-bold text-slate-700 capitalize">{c.item.replace(/_/g, " ")}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── BUSINESS PROFILE ── */}
        <Chapter title="Business Profile" />
        <div className="grid grid-cols-2 gap-10">
          <div>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">{bg.overview || "—"}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {bg.hq && <div><p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">HQ</p><p className="font-semibold">{bg.hq}</p></div>}
              {moat.moat && <div><p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Moat</p><p className="font-semibold">{moat.moat}</p></div>}
              {mkt.competition_intensity && <div><p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Competition</p><p className="font-semibold">{mkt.competition_intensity}</p></div>}
              {s3.setup_type && <div><p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Setup Type</p><p className="font-semibold">{s3.setup_type}</p></div>}
            </div>
            {(mgmt.ceo || mgmt.track_record) && (
              <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Management</p>
                {mgmt.ceo && <p className="text-xs text-slate-700 mb-1"><span className="font-semibold">CEO: </span>{mgmt.ceo}</p>}
                {mgmt.track_record && <p className="text-xs text-slate-500">{mgmt.track_record}</p>}
                {mgmt.red_flags && <p className="text-xs text-red-600 mt-1">⚠ {mgmt.red_flags}</p>}
              </div>
            )}
            {moat.competitive_advantages?.length > 0 && (
              <div className="mt-4 space-y-2">
                {moat.competitive_advantages.map((a: string) => (
                  <div key={a} className="flex gap-2 text-sm">
                    <span className="text-amber-500 shrink-0">→</span>
                    <span className="text-slate-700">{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            {bg.revenue_segments?.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Revenue by Segment</p>
                <div className="space-y-3">
                  {bg.revenue_segments.map((seg: any) => (
                    <div key={seg.segment}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">{seg.segment}</span>
                        <span className="font-mono text-slate-500">{seg.weight_pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full">
                        <div className="h-2 bg-amber-400 rounded-full" style={{ width: `${seg.weight_pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bg.geography_breakdown?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Geography</p>
                <div className="space-y-3">
                  {bg.geography_breakdown.map((g: any) => (
                    <div key={g.region}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">{g.region}</span>
                        <span className="font-mono">{g.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div className="h-1.5 bg-slate-400 rounded-full" style={{ width: `${g.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── FINANCIAL PERFORMANCE ── */}
        <Chapter title="Financial Performance" />
        {fin.historical?.length > 0 ? (
          <table className="w-full text-sm border-collapse mb-6">
            <thead>
              <tr className="bg-[#0F172A] text-white text-xs uppercase tracking-wide">
                {["Year", "Revenue", "YoY", "EBITDA", "Margin", "Net Income", "Net Margin"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 font-semibold ${i === 0 ? "text-left rounded-tl-xl" : "text-right"} ${i === 6 ? "rounded-tr-xl" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fin.historical.map((row: any, i: number) => {
                const prev = fin.historical[i + 1];
                const revG = prev ? yoy(row.revenue, prev.revenue) : null;
                const ebitdaM = row.revenue && row.ebitda ? (row.ebitda / row.revenue) * 100 : null;
                const netM = row.revenue && row.net_income ? (row.net_income / row.revenue) * 100 : null;
                return (
                  <tr key={row.year} className={`border-b border-slate-100 ${i === 0 ? "bg-amber-50 font-semibold" : "hover:bg-slate-50"}`}>
                    <td className="px-4 py-3 font-mono">{row.year}{i === 0 ? " ★" : ""}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBn(row.revenue)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {revG == null ? <span className="text-slate-300">—</span> : (
                        <span className={revG >= 0 ? "text-green-600" : "text-red-500"}>
                          {revG >= 0 ? "↑" : "↓"} {Math.abs(revG).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBn(row.ebitda)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">{ebitdaM != null ? `${ebitdaM.toFixed(1)}%` : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBn(row.net_income)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">{netM != null ? `${netM.toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-sm text-slate-400 mb-6">No historical data available.</p>}
        <div className="grid grid-cols-6 gap-3">
          {[
            ["1m", s11.ret_1m != null ? `${(s11.ret_1m * 100).toFixed(1)}%` : "—"],
            ["3m", s11.ret_3m != null ? `${(s11.ret_3m * 100).toFixed(1)}%` : "—"],
            ["6m", s11.ret_6m != null ? `${(s11.ret_6m * 100).toFixed(1)}%` : "—"],
            ["52w High", fmtPrice(s11.high_52w)],
            ["52w Low", fmtPrice(s11.low_52w)],
            ["Short Int.", s9.short_interest_pct != null ? `${s9.short_interest_pct}%` : "—"],
          ].map(([l, v]) => (
            <div key={l as string} className="text-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{l}</p>
              <p className="text-sm font-bold">{v}</p>
            </div>
          ))}
        </div>

        {/* ── MARKET & COMPETITIVE POSITION ── */}
        <Chapter title="Market & Competitive Position" />
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="col-span-2 p-5 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Total Addressable Market</p>
            <p className="text-sm text-slate-700 leading-relaxed">{mkt.tam_usd || "—"}</p>
          </div>
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">CAGR</p>
            <p className="text-sm font-semibold text-slate-700">{mkt.growth_rate || "—"}</p>
          </div>
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Competition</p>
            <p className="text-xl font-bold">{mkt.competition_intensity || "—"}</p>
          </div>
        </div>

        {comps.filter((c) => c.revenue_bn != null || c.gross_margin_pct != null).length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[#0F172A]">
                {["Ticker", "Revenue", "Gross Margin", "EBITDA Margin", "Net Margin", "D/E"].map((h) => (
                  <th key={h} className="py-3 px-2 text-right first:text-left text-xs font-bold uppercase tracking-widest text-[#0F172A]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.ticker} className={`border-b border-slate-100 text-sm ${c.ticker === ticker ? "bg-amber-50 font-bold" : "hover:bg-slate-50"}`}>
                  <td className="py-3 px-2 font-mono">{c.ticker}{c.ticker === ticker ? " ●" : ""}</td>
                  <td className="py-3 px-2 text-right font-mono">{c.revenue_bn != null ? `$${c.revenue_bn}B` : "—"}</td>
                  <td className="py-3 px-2 text-right font-mono">{c.gross_margin_pct != null ? `${c.gross_margin_pct}%` : "—"}</td>
                  <td className="py-3 px-2 text-right font-mono">{c.ebitda_margin_pct != null ? `${c.ebitda_margin_pct}%` : "—"}</td>
                  <td className="py-3 px-2 text-right font-mono">{c.net_margin_pct != null ? `${c.net_margin_pct}%` : "—"}</td>
                  <td className="py-3 px-2 text-right font-mono">{c.de_ratio ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {s10.major_holders?.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Major Holders</p>
              {s10.major_holders.map((h: any) => (
                <div key={h.name} className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">{h.name}</span>
                  <span className="font-mono font-semibold">{h.pct}%</span>
                </div>
              ))}
              <p className="text-xs text-slate-400 mt-2">
                Inst: {s10.institutional_pct ?? "—"}% · Insider: {s10.insider_pct ?? "—"}%
              </p>
            </div>
            {s9.sentiment_summary && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Market Sentiment</p>
                <p className="text-sm text-slate-600 leading-relaxed">{s9.sentiment_summary}</p>
                <div className="flex gap-4 mt-3">
                  <div><p className="text-xs text-slate-400">Sentiment Score</p><p className="font-bold">{s9.sentiment_score ?? "—"}/100</p></div>
                  <div><p className="text-xs text-slate-400">Analyst Trend</p><p className="font-bold capitalize">{s10.analyst_trend || "—"}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VALUATION & TIMING ── */}
        <Chapter title="Valuation & Entry Timing" />
        <div className="grid grid-cols-3 gap-6 mb-6 items-start">
          <div className="border-r border-slate-200 pr-6">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Methodology</p>
            <p className="text-3xl font-bold mb-5">{s4.methodology || "—"}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Near-term Upside</p>
            <p className="text-4xl font-bold text-green-600">{s4.near_term_upside_pct || "—"}</p>
            <p className="text-xs text-slate-500 mt-2 capitalize">vs. peers: <span className="font-semibold">{s4.cheap_vs_peers || "—"}</span></p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Implied Multiples / Narrative</p>
            <p className="text-sm text-slate-700 leading-relaxed">{s4.implied_multiples || s4.narrative || "—"}</p>
          </div>
        </div>

        {/* Price target range visualization */}
        {s13.bull && s13.base && s13.bear && (
          <div className="border border-slate-200 rounded-2xl p-8 mb-6 bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-8">Price Target Range</p>
            <div className="relative h-16">
              <div className="absolute top-6 left-8 right-8 h-0.5 bg-slate-300 rounded-full" />
              {[
                { label: "Bear", price: s13.bear.price_target, prob: s13.bear.probability, cls: "text-red-600", dotCls: "bg-red-400", pos: "left-0" },
                { label: "Base", price: s13.base.price_target, prob: s13.base.probability, cls: "text-amber-700", dotCls: "bg-amber-400", pos: "left-1/2 -translate-x-1/2" },
                { label: "Bull", price: s13.bull.price_target, prob: s13.bull.probability, cls: "text-green-700", dotCls: "bg-green-500", pos: "right-0" },
              ].map((sc) => (
                <div key={sc.label} className={`absolute flex flex-col items-center ${sc.pos}`}>
                  <span className={`text-xs font-mono font-bold ${sc.cls}`}>{fmtPrice(sc.price)}</span>
                  <div className={`w-4 h-4 rounded-full mt-1 border-2 border-white shadow ${sc.dotCls}`} />
                  <span className="text-xs text-slate-400 mt-1">{sc.label} {sc.prob}%</span>
                </div>
              ))}
              <div className="absolute flex flex-col items-center" style={{
                left: `calc(${Math.max(5, Math.min(95, ((data.current_price - s13.bear.price_target) / (s13.bull.price_target - s13.bear.price_target)) * 100))}%)`,
                transform: "translateX(-50%)"
              }}>
                <span className="text-xs font-mono font-bold text-[#0F172A]">{fmtPrice(data.current_price)}</span>
                <div className="w-3 h-3 rounded-full bg-[#0F172A] mt-1 ring-2 ring-white ring-offset-1" />
                <span className="text-xs text-slate-500 mt-1">Current</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-5 gap-3 mb-5">
          {[
            { l: "RSI (14)", v: fmtN(s8t.rsi_14), note: s8t.rsi_14 > 70 ? "Overbought" : s8t.rsi_14 < 30 ? "Oversold" : "" },
            { l: "MACD", v: s8t.macd_signal || "—" },
            { l: "Trend", v: s8t.trend || "—" },
            { l: "Entry Verdict", v: s5.entry_verdict || "—" },
            { l: "Quant Score", v: `${s8t.quant_score ?? "—"}/100` },
          ].map((m) => (
            <div key={m.l} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{m.l}</p>
              <p className="font-bold text-base capitalize">{m.v}</p>
              {m.note && <p className="text-xs text-amber-600 mt-0.5">{m.note}</p>}
            </div>
          ))}
        </div>
        {s5.narrative && <p className="text-sm text-slate-600 italic leading-relaxed mb-4">{s5.narrative}</p>}

        <div className="grid grid-cols-2 gap-4">
          <TBD title="WACC & DCF Model" note="Discounted cash flow with WACC derivation, terminal value, and sensitivity table." />
          <TBD title="Historical Multiple Analysis" note="P/E, EV/EBITDA, P/S vs. sector median over 3 years — the 'why now' chart." />
        </div>

        {/* ── RISK ── */}
        <Chapter title="Risk Factors" />
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[["Beta", fmtN(s12.beta)], ["Debt/Equity", fmtN(s12.debt_to_equity)], ["Current Ratio", fmtN(s12.current_ratio)]].map(([l, v]) => (
                <div key={l as string} className="text-center p-4 border border-slate-200 rounded-xl bg-slate-50">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                  <p className="text-2xl font-bold">{v}</p>
                </div>
              ))}
            </div>
            {moat.barriers_to_entry && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm">
                <span className="font-semibold text-blue-800">Barriers to Entry: </span>
                <span className="text-blue-700">{moat.barriers_to_entry}</span>
              </div>
            )}
          </div>
          <div>
            {s7.key_risks?.length > 0 && (
              <ul className="space-y-3">
                {s7.key_risks.map((r: string, i: number) => (
                  <li key={r} className="flex gap-3 p-4 border border-slate-200 rounded-xl">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-red-100 text-red-600" : i === 1 ? "bg-orange-100 text-orange-600" : "bg-amber-100 text-amber-700"}`}>{i + 1}</span>
                    <p className="text-sm text-slate-700">{r}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── SCENARIOS ── */}
        <Chapter title="Scenario Analysis" />
        <div className="grid grid-cols-3 gap-5 mb-5">
          {[
            { key: "bull", label: "Bull Case", hdr: "bg-green-700", txt: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
            { key: "base", label: "Base Case", hdr: "bg-amber-500", txt: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
            { key: "bear", label: "Bear Case", hdr: "bg-red-600", txt: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
          ].map(({ key, label, hdr, txt, bg: sbg, border }) => {
            const sc = s13[key];
            if (!sc) return null;
            return (
              <div key={key} className={`rounded-2xl overflow-hidden border ${border}`}>
                <div className={`${hdr} text-white px-5 py-3 text-xs font-bold uppercase tracking-widest flex justify-between`}>
                  <span>{label}</span><span>{sc.probability}% probability</span>
                </div>
                <div className={`${sbg} p-5`}>
                  <p className={`text-4xl font-bold mb-1 ${txt}`}>{fmtPrice(sc.price_target)}</p>
                  <p className="text-sm font-semibold text-slate-600 mb-3">
                    {sc.upside_pct ? `+${sc.upside_pct}% upside` : sc.downside_pct ? `-${sc.downside_pct}% downside` : ""}
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">{sc.assumptions || sc.catalyst || ""}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TBD title="DCF Sensitivity Table" note="Price target range across WACC ±200bps and terminal growth rate ±1%." />
          <TBD title="Variant View / Edge" note="Where our thesis diverges from consensus — the key differentiated assumption." />
        </div>

        {/* ── RECOMMENDATION ── */}
        <div className="mt-14 rounded-2xl overflow-hidden border-2 border-[#0F172A] print:break-before-page">
          <div className="bg-[#0F172A] text-white px-8 py-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-amber-400 uppercase tracking-widest mb-2">Final Recommendation</p>
              <p className="text-5xl font-bold">{data.direction.replace(/_/g, " ")}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Conviction Score</p>
              <p className="text-6xl font-bold">{data.conviction}</p>
              <p className="text-sm text-slate-400">out of 100</p>
            </div>
          </div>
          <div className="px-8 pt-5 pb-2 bg-white">
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div className={`h-3 rounded-full ${convColor(data.conviction)}`} style={{ width: `${data.conviction}%` }} />
            </div>
            <p className="text-xs text-slate-300 text-right mb-6">{data.conviction}/100 conviction</p>
          </div>
          <div className="px-8 pb-8 grid grid-cols-3 gap-8 bg-white">
            {[
              ["Expected Return (12m)", data.expected_return_12m],
              ["Suggested Position Size", `${s7.suggested_size_pct ?? "—"}%`],
              ["Stop Loss", `−${s7.stop_loss_pct ?? "—"}%`],
            ].map(([l, v]) => (
              <div key={l as string}>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                <p className="text-3xl font-bold">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-5 border-t border-slate-200 flex justify-between text-xs text-slate-400">
          <span>Haz Capital Management · Autonomous AI Equity Research</span>
          <span>{data.date} · {ticker}</span>
        </div>
        <p className="text-xs text-slate-300 mt-1">Not financial advice. AI-generated for informational purposes only.</p>
      </div>
    </div>
  );
}
