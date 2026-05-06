/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ── Interfaces ───────────────────────────────────────────────────────────────
interface Report {
  ticker: string; company_name: string; sector: string;
  current_price: number; market_cap: number; date: string;
  direction: string; conviction: number; expected_return_12m: string;
  s2_company: any; s3_setup: any; s4_valuation: any; s5_timing: any;
  s6_thesis: any; s7_recommendation: any; s8_technical: any;
  s9_sentiment: any; s10_institutional: any; s11_performance: any;
  s12_risk: any; s13_scenarios: any; s14_data: any; agent_scores: any;
}
interface Comp {
  ticker: string; company: string; is_subject?: boolean;
  revenue_bn: number | null; pe_ratio?: number | null; ps_ratio?: number | null;
  gross_margin_pct?: number | null; ebitda_margin_pct: number | null;
  net_margin_pct: number | null; de_ratio: number | null;
}
interface PitchData {
  earnings_surprises: { period: string; year: number; quarter: number; actual: number | null; estimate: number | null; surprise_pct: number | null }[];
  price_target: { high: number; low: number; mean: number; median: number; updated: string } | null;
  recommendation_trend: { period: string; strong_buy: number; buy: number; hold: number; sell: number; strong_sell: number; total: number } | null;
  news: { headline: string; source: string; url: string; datetime: number; summary: string }[];
  key_metrics: { ev_ebitda: number | null; ev_revenue: number | null; fcf_yield: number | null; roic: number | null; pb_ratio: number | null; enterprise_value: number | null; net_debt_ebitda: number | null; date: string | null } | null;
  insider_trades: { name: string; role: string; transaction_type: string; shares: number | null; price: number | null; date: string; disposition: string }[];
  sources: Record<string, string | null>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (n: number | null | undefined, d = 1) => n == null ? "—" : n.toFixed(d);
const fmtBn = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
};
const fmtPct = (n: number | null | undefined, d = 1) => n == null ? "—" : `${(n * 100).toFixed(d)}%`;
const fmtPrice = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const yoy = (curr: number | null, prev: number | null) =>
  !curr || !prev || prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100;
const dirBadge = (d: string) => {
  const u = d.toUpperCase();
  if (u.includes("BUY") || u.includes("LONG")) return "bg-green-700 text-white";
  if (u.includes("SELL") || u.includes("SHORT")) return "bg-red-700 text-white";
  return "bg-amber-500 text-white";
};
const convBar = (n: number) => n >= 70 ? "bg-green-500" : n >= 50 ? "bg-amber-400" : "bg-red-400";
function parsePyList(s: string): string[] {
  if (!s) return [];
  const t = s.trim();
  if (!t.startsWith("[")) return [s];
  try { return JSON.parse(t.replace(/'/g, '"')); }
  catch { const m = t.match(/'([^']+)'/g); return m ? m.map(x => x.slice(1,-1)) : [s]; }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SlideHeader({ title, n, total = 10 }: { title: string; n: number; total?: number }) {
  return (
    <div className="bg-[#1B2951] text-white flex justify-between items-center px-7 py-3.5 print:break-before-page">
      <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{title}</h2>
      <span className="text-[10px] text-blue-300 font-mono">{n} / {total}</span>
    </div>
  );
}
function Slide({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-b-2xl overflow-hidden mb-7 print:mb-0 print:rounded-none print:border-x-0 print:border-b-0 bg-white">
      {children}
    </div>
  );
}
function SourceBadge({ src, href }: { src: string; href?: string }) {
  const isAI = /llm|ai|gpt/i.test(src);
  const cls = isAI
    ? "bg-amber-50 text-amber-600 border-amber-200"
    : "bg-sky-50 text-sky-600 border-sky-200";
  const badge = (
    <span className={`inline-flex items-center text-[8px] font-mono px-1.5 py-0.5 rounded border ${cls} print:hidden ml-1 shrink-0`}>
      {isAI ? "AI" : src}{!isAI && href ? " ↗" : ""}
    </span>
  );
  if (!isAI && href) return <a href={href} target="_blank" rel="noreferrer" className="print:hidden">{badge}</a>;
  return badge;
}
function PriceChart({ candles }: { candles: any[] }) {
  if (!candles.length) return <div className="h-28 bg-slate-50 rounded-xl flex items-center justify-center text-xs text-slate-400">Price chart unavailable</div>;
  const data = candles.map((c: any) => ({
    t: new Date(c.time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    p: Number(c.close.toFixed(2)),
  }));
  const min = Math.min(...data.map(d => d.p));
  const max = Math.max(...data.map(d => d.p));
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={Math.floor(data.length / 4)} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} domain={[min * 0.97, max * 1.03]} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => `$${v.toFixed(0)}`} />
        <Tooltip contentStyle={{ fontSize: 10, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", borderRadius: 8 }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Close"]} labelStyle={{ color: "#64748b", fontSize: 10 }} />
        <Line type="monotone" dataKey="p" stroke="#1B2951" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
function RecBar({ trend }: { trend: PitchData["recommendation_trend"] }) {
  if (!trend || !trend.total) return null;
  const t = trend.total;
  const pct = (n: number) => Math.max(1, Math.round((n / t) * 100));
  const buyTotal  = trend.strong_buy + trend.buy;
  const sellTotal = trend.sell + trend.strong_sell;
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden gap-px mb-1.5">
        <div className="bg-green-700" style={{ width: `${pct(trend.strong_buy)}%` }} title={`Strong Buy: ${trend.strong_buy}`} />
        <div className="bg-green-400" style={{ width: `${pct(trend.buy)}%` }} title={`Buy: ${trend.buy}`} />
        <div className="bg-slate-300" style={{ width: `${pct(trend.hold)}%` }} title={`Hold: ${trend.hold}`} />
        <div className="bg-red-400"   style={{ width: `${pct(trend.sell)}%` }} title={`Sell: ${trend.sell}`} />
        <div className="bg-red-700"   style={{ width: `${pct(trend.strong_sell)}%` }} title={`Strong Sell: ${trend.strong_sell}`} />
      </div>
      <div className="flex justify-between text-[9px]">
        <span className="text-green-700 font-semibold">{buyTotal} Buy ({Math.round((buyTotal / t) * 100)}%)</span>
        <span className="text-slate-400">{trend.hold} Hold</span>
        <span className="text-red-600 font-semibold">{sellTotal} Sell</span>
      </div>
      <p className="text-[9px] text-slate-400 mt-0.5">{t} analysts · {trend.period}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PitchDetail() {
  const params  = useParams();
  const ticker  = String(params.ticker).toUpperCase();
  const [data,      setData]      = useState<Report | null>(null);
  const [comps,     setComps]     = useState<Comp[]>([]);
  const [candles,   setCandles]   = useState<any[]>([]);
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [err,       setErr]       = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/adhoc/${ticker}`).then(r => r.json()),
      fetch(`/api/comparables/${ticker}`).then(r => r.json()).catch(() => ({ comparables: [] })),
      fetch(`/api/chart/${ticker}?tf=1W`).then(r => r.json()).catch(() => ({ candles: [] })),
      fetch(`/api/pitch-data/${ticker}`).then(r => r.json()).catch(() => null),
    ]).then(([adhoc, compsData, chartData, pd]) => {
      if (adhoc.error) { setErr(adhoc.error); setLoading(false); return; }
      setData(adhoc);
      setComps(compsData?.comparables || []);
      setCandles(chartData?.candles || []);
      setPitchData(pd);
      setLoading(false);
    }).catch(e => { setErr(String(e)); setLoading(false); });
  }, [ticker]);

  if (loading)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1B2951] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-mono text-sm">Loading {ticker} pitch…</p>
          <p className="text-slate-300 text-xs mt-1">Fetching from yfinance · FMP · Finnhub</p>
        </div>
      </div>
    );
  if (err || !data)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-4xl font-bold text-[#1B2951] mb-2">{ticker}</p>
          <p className="text-slate-500 text-sm mb-6">{err || "No report found."}</p>
          <a href="/pitch" className="text-sm text-amber-600 hover:underline">← Pitch Generator</a>
        </div>
      </div>
    );

  // ── Destructure adhoc data ──
  const s2  = data.s2_company || {};   const s3  = data.s3_setup || {};
  const s4  = data.s4_valuation || {}; const s5  = data.s5_timing || {};
  const s6  = data.s6_thesis || {};    const s7  = data.s7_recommendation || {};
  const s8t = data.s8_technical || {}; const s9  = data.s9_sentiment || {};
  const s10 = data.s10_institutional || {}; const s11 = data.s11_performance || {};
  const s12 = data.s12_risk || {};     const s13 = data.s13_scenarios || {};
  const s14 = data.s14_data || {};
  const bg  = s2.background || {};     const fin = s2.financial_snapshot || {};
  const moat = s2.quality_of_earnings || {}; const mkt = s2.market_analysis || {};
  const mgmt = s2.management_team || {};

  const yhooHref = `https://finance.yahoo.com/quote/${ticker}`;
  const fmpHref  = `https://financialmodelingprep.com/financial-summary/${ticker}`;
  const fhHref   = `https://finnhub.io/`;

  // ── Computed values ──
  const highlights: string[] = (s3.checklist || [])
    .filter((c: any) => c.pass && !["setup_type","default_risk"].includes(c.item) && c.detail?.length > 20)
    .slice(0, 4).map((c: any) => c.detail as string);

  const catalystItem  = (s3.checklist || []).find((c: any) => c.item === "upcoming_catalysts");
  const nearTermItem  = (s3.checklist || []).find((c: any) => c.item === "near_term_catalyst");
  const parsedCatalysts: string[] = catalystItem?.detail ? parsePyList(catalystItem.detail) : [];
  const quarters = (fin.forward || []).filter((f: any) => typeof f.year === "string" && f.year.includes("q"));

  const adhocComps: Comp[] = (s2.comparables || [])
    .filter((c: any) => c.ticker && c.company && c.revenue_bn)
    .map((c: any) => ({ ...c, is_subject: c.ticker === ticker }));
  const useAdhocComps = comps.length === 0 && adhocComps.length > 0;
  const displayComps: Comp[] = comps.length > 0 ? comps : adhocComps;
  const hasLivePE = comps.length > 0;

  // Weighted expected return
  const weightedReturn = (() => {
    const { bull, base, bear } = s13;
    if (!bull || !base || !bear) return null;
    return ((bull.probability / 100) * (bull.upside_pct || 0)
           + (base.probability / 100) * (base.upside_pct || 0)
           + (bear.probability / 100) * -(bear.downside_pct || 0)).toFixed(1);
  })();

  // Best available analyst consensus
  const analystConsensus = s10.analyst_consensus || s9.analyst_consensus;

  // Insider summary for display
  const buyInsiders  = (pitchData?.insider_trades || []).filter(t => t.disposition === "A" || /buy|acquire/i.test(t.transaction_type));
  const sellInsiders = (pitchData?.insider_trades || []).filter(t => t.disposition === "D" || /sale|sell/i.test(t.transaction_type));

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#0F172A] print:bg-white">
      <div className="max-w-[980px] mx-auto px-5 py-10 print:px-0 print:py-0">

        {/* Toolbar */}
        <div className="print:hidden flex justify-between items-center mb-8">
          <a href="/pitch" className="text-sm text-slate-500 hover:text-slate-700">← All Pitches</a>
          <div className="flex items-center gap-3">
            {pitchData?.sources && Object.values(pitchData.sources).some(Boolean) && (
              <span className="text-[10px] text-slate-400 print:hidden">
                Live data from: {[...new Set(Object.values(pitchData.sources).filter(Boolean))].join(" · ")}
              </span>
            )}
            <button onClick={() => window.print()} className="px-5 py-2.5 bg-[#1B2951] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
              Export PDF
            </button>
          </div>
        </div>

        {/* ── COVER PAGE ── */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-7 print:rounded-none print:border-0 print:mb-0">
          <div className="bg-[#1B2951] text-white px-8 py-5 flex justify-between items-start">
            <div>
              <p className="text-xs font-mono text-blue-300 uppercase tracking-[0.15em]">Haz Capital Management</p>
              <p className="text-xs text-blue-400 mt-0.5">Equity Research · {data.date}</p>
            </div>
            <span className={`text-sm font-bold px-5 py-2.5 rounded-xl ${dirBadge(data.direction)}`}>
              {data.direction.replace(/_/g, " ")}
            </span>
          </div>
          <div className="px-8 py-7 border-b border-slate-100">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <h1 className="text-[5.5rem] font-bold tracking-tight text-[#1B2951] leading-none">{ticker}</h1>
                {data.company_name !== ticker && <p className="text-2xl text-slate-400 font-light mt-1">{data.company_name}</p>}
                {data.sector && <p className="text-sm text-slate-400 mt-0.5">{data.sector}</p>}
              </div>
              <div className="border-2 border-[#1B2951] rounded-2xl p-5 text-center min-w-[200px]">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-3">Analyst Price Target Range</p>
                {pitchData?.price_target ? (
                  <>
                    <div className="flex justify-between text-sm font-mono font-bold mb-2">
                      <span className="text-red-600">{fmtPrice(pitchData.price_target.low)}</span>
                      <span className="text-amber-600">{fmtPrice(pitchData.price_target.median)}</span>
                      <span className="text-green-600">{fmtPrice(pitchData.price_target.high)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Low</span><span>Median</span><span>High</span>
                    </div>
                    <SourceBadge src="Finnhub" href={fhHref} />
                  </>
                ) : s13.bear && s13.bull ? (
                  <>
                    <div className="flex justify-between text-sm font-mono font-bold mb-2">
                      <span className="text-red-600">{fmtPrice(s13.bear?.price_target)}</span>
                      <span className="text-amber-600">{fmtPrice(s13.base?.price_target)}</span>
                      <span className="text-green-600">{fmtPrice(s13.bull?.price_target)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Bear</span><span>Base</span><span>Bull</span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-6 divide-x divide-slate-100">
            {[
              { l: "Current Price",    v: fmtPrice(data.current_price),             src: "yfinance",       href: yhooHref },
              { l: "Market Cap",       v: fmtBn(data.market_cap),                   src: "yfinance",       href: yhooHref },
              { l: "Analyst PT Median",v: pitchData?.price_target ? fmtPrice(pitchData.price_target.median) : "—", src: "Finnhub", href: fhHref },
              { l: "vs 52w High",      v: s11.pct_from_high != null ? `${s11.pct_from_high}%` : "—", src: "yfinance", href: yhooHref },
              { l: "Analyst Rating",   v: (analystConsensus || "—") as string,       src: "Yahoo Finance",  href: yhooHref },
              { l: "Short Interest",   v: s9.short_interest_pct != null ? `${s9.short_interest_pct}%` : "—", src: "yfinance", href: yhooHref },
            ].map(m => (
              <div key={m.l} className="px-4 py-4">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider">{m.l}</p>
                  <SourceBadge src={m.src} href={m.href} />
                </div>
                <p className="text-sm font-bold capitalize">{m.v}</p>
              </div>
            ))}
          </div>
          <div className="px-8 py-4 border-t border-slate-100 bg-slate-50">
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="font-bold uppercase tracking-widest text-slate-500">Conviction Score <SourceBadge src="AI" /></span>
              <span className="font-mono font-bold text-[#1B2951]">{data.conviction} / 100</span>
            </div>
            <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-2.5 rounded-full ${convBar(data.conviction)}`} style={{ width: `${data.conviction}%` }} />
            </div>
          </div>
        </div>

        {/* 1 · INVESTMENT HIGHLIGHTS */}
        <Slide>
          <SlideHeader title="Investment Highlights" n={1} />
          <div className="p-7">
            {highlights.length > 0 && (
              <div className="grid grid-cols-2 gap-4 mb-5">
                {highlights.map((h, i) => (
                  <div key={i} className="flex gap-4 p-5 border border-slate-100 rounded-xl bg-slate-50">
                    <span className="w-7 h-7 rounded-full bg-[#1B2951] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-sm text-slate-700 leading-relaxed">{h}</p>
                  </div>
                ))}
              </div>
            )}
            {/* Analyst recommendation summary */}
            {pitchData?.recommendation_trend && (
              <div className="p-4 border border-slate-200 rounded-xl mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Wall Street Analyst Recommendation</p>
                  <SourceBadge src="Finnhub" href={fhHref} />
                </div>
                <RecBar trend={pitchData.recommendation_trend} />
              </div>
            )}
            {s6.narrative && (
              <div className="p-5 rounded-xl border-l-4 border-[#1B2951] bg-[#EEF2F8]">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B2951]">Investment Thesis</p>
                  <SourceBadge src="AI" />
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{s6.narrative}</p>
              </div>
            )}
          </div>
        </Slide>

        {/* 2 · BUSINESS OVERVIEW */}
        <Slide>
          <SlideHeader title="Business Overview" n={2} />
          <div className="p-7 grid grid-cols-5 gap-8">
            <div className="col-span-3">
              <p className="text-sm text-slate-700 leading-relaxed mb-1">{bg.overview || "—"}</p>
              <div className="flex items-center gap-1 mb-4"><SourceBadge src="AI" /></div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { l: "Headquarters", v: bg.hq || "—", src: "AI" },
                  { l: "Moat Width",   v: moat.moat || "—", src: "AI" },
                  { l: "Setup Type",   v: s3.setup_type || "—", src: "AI" },
                  { l: "Competition",  v: mkt.competition_intensity || "—", src: "AI" },
                ].map(m => (
                  <div key={m.l} className="p-3 border border-slate-100 rounded-xl bg-slate-50">
                    <div className="flex items-center gap-1 mb-0.5">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider">{m.l}</p>
                      <SourceBadge src={m.src} />
                    </div>
                    <p className="font-semibold text-sm">{m.v}</p>
                  </div>
                ))}
              </div>
              {mgmt.ceo && (
                <div className="p-4 bg-[#EEF2F8] rounded-xl mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B2951]">Management</p>
                    <SourceBadge src="AI" />
                  </div>
                  <p className="text-xs text-slate-700 mb-1"><span className="font-semibold">CEO: </span>{mgmt.ceo}</p>
                  {mgmt.track_record && <p className="text-xs text-slate-500">{mgmt.track_record}</p>}
                  {mgmt.red_flags && <p className="text-xs text-red-600 mt-1">⚠ {mgmt.red_flags}</p>}
                </div>
              )}
              {moat.competitive_advantages?.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Competitive Advantages <SourceBadge src="AI" /></p>
                  <ul className="space-y-1.5">
                    {moat.competitive_advantages.map((a: string) => (
                      <li key={a} className="text-xs text-slate-700 flex gap-2"><span className="text-amber-500 shrink-0">›</span>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="col-span-2">
              {bg.revenue_segments?.length > 0 && (
                <div className="mb-6">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Revenue by Segment <SourceBadge src="AI" /></p>
                  <div className="space-y-3">
                    {bg.revenue_segments.map((seg: any) => (
                      <div key={seg.segment}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-700">{seg.segment}</span>
                          <span className="font-mono text-slate-500">{seg.weight_pct}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full">
                          <div className="h-2 bg-[#1B2951] rounded-full" style={{ width: `${seg.weight_pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {bg.geography_breakdown?.length > 0 && (
                <div className="mb-5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Geographic Exposure <SourceBadge src="AI" /></p>
                  <div className="space-y-2">
                    {bg.geography_breakdown.map((g: any) => (
                      <div key={g.region} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 w-24 shrink-0">{g.region}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
                          <div className="h-1.5 bg-amber-400 rounded-full" style={{ width: `${g.pct}%` }} />
                        </div>
                        <span className="font-mono w-8 text-right">{g.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {moat.barriers_to_entry && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-blue-800 mb-1">Barriers to Entry <SourceBadge src="AI" /></p>
                  <p className="text-xs text-blue-700 leading-relaxed">{moat.barriers_to_entry}</p>
                </div>
              )}
            </div>
          </div>
        </Slide>

        {/* 3 · INDUSTRY & MARKET */}
        <Slide>
          <SlideHeader title="Industry & Market Analysis" n={3} />
          <div className="p-7">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="col-span-2 bg-[#EEF2F8] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B2951]">Total Addressable Market</p>
                  <SourceBadge src="AI" />
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{mkt.tam_usd || "—"}</p>
                {mkt.macro_factors && <p className="text-xs text-slate-500 mt-3 leading-relaxed">{mkt.macro_factors}</p>}
              </div>
              <div className="space-y-3">
                <div className="p-4 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-1 mb-1">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">Expected CAGR</p>
                    <SourceBadge src="AI" />
                  </div>
                  <p className="font-bold text-xl text-[#1B2951]">{mkt.growth_rate || "—"}</p>
                </div>
                <div className="p-4 border border-slate-200 rounded-xl">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Competition Intensity</p>
                  <p className="font-bold text-xl">{mkt.competition_intensity || "—"}</p>
                </div>
                <div className="p-4 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-1 mb-1">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">Revenue CAGR (3yr)</p>
                    <SourceBadge src="yfinance" href={yhooHref} />
                  </div>
                  <p className="font-bold text-xl text-green-600">
                    {(s3.checklist || []).find((c: any) => c.item === "revenue_cagr_3yr")?.detail
                      ? `${(s3.checklist || []).find((c: any) => c.item === "revenue_cagr_3yr").detail}%` : "—"}
                  </p>
                </div>
              </div>
            </div>
            {mkt.sector_trends && (
              <div className="p-4 border border-slate-100 rounded-xl bg-slate-50 mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Key Sector Trends</p>
                  <SourceBadge src="AI" />
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{mkt.sector_trends}</p>
              </div>
            )}
            {displayComps.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Key Market Players</p>
                  <SourceBadge src={hasLivePE ? "yfinance" : "AI"} href={hasLivePE ? yhooHref : undefined} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {displayComps.slice(0, 4).map((c) => (
                    <div key={c.ticker} className={`p-3 border rounded-xl ${c.is_subject ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-slate-700">{c.company}{c.is_subject ? " ★" : ""}</p>
                          <p className="text-[10px] font-mono text-slate-400">{c.ticker}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-mono font-bold text-[#1B2951]">{c.revenue_bn != null ? `$${c.revenue_bn.toFixed(1)}B` : "—"}</p>
                          <p className="text-[9px] text-slate-400">Revenue</p>
                        </div>
                      </div>
                      {c.ebitda_margin_pct != null && (
                        <p className="text-[9px] text-slate-500 mt-1">EBITDA Mgn: <span className="font-semibold">{c.ebitda_margin_pct.toFixed(1)}%</span></p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Slide>

        {/* 4 · FINANCIAL ANALYSIS */}
        <Slide>
          <SlideHeader title="Financial Analysis" n={4} />
          <div className="p-7 grid grid-cols-2 gap-7">
            <div>
              {/* Annual income statement */}
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Income Statement — Annual</p>
                <SourceBadge src="yfinance" href={yhooHref} />
              </div>
              {fin.historical?.length > 0 ? (
                <table className="w-full text-xs border-collapse mb-4">
                  <thead>
                    <tr className="bg-[#1B2951] text-white">
                      {["Year","Revenue","YoY","EBITDA Mgn","Net Mgn"].map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 font-semibold uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fin.historical.map((row: any, i: number) => {
                      const prev   = fin.historical[i + 1];
                      const revG   = prev ? yoy(row.revenue, prev.revenue) : null;
                      const ebitdaM = row.revenue && row.ebitda ? (row.ebitda / row.revenue) * 100 : null;
                      const netM    = row.revenue && row.net_income ? (row.net_income / row.revenue) * 100 : null;
                      return (
                        <tr key={row.year} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                          <td className="px-3 py-2.5 font-mono font-semibold">{row.year}{i === 0 ? " ★" : ""}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{fmtBn(row.revenue)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {revG == null ? <span className="text-slate-300">—</span>
                              : <span className={revG >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                                  {revG >= 0 ? "↑" : "↓"}{Math.abs(revG).toFixed(1)}%
                                </span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{ebitdaM != null ? `${ebitdaM.toFixed(1)}%` : "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{netM != null ? `${netM.toFixed(1)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="text-xs text-slate-400 mb-4">No historical data available.</p>}

              {/* Quarterly estimates */}
              {quarters.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Quarterly Consensus Estimates</p>
                    <SourceBadge src="Yahoo Finance" href={yhooHref} />
                  </div>
                  <table className="w-full text-xs border-collapse mb-3">
                    <thead>
                      <tr className="bg-slate-700 text-white">
                        {["Quarter","Revenue Est.","EPS Est."].map((h, i) => (
                          <th key={h} className={`px-3 py-2 font-semibold uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {quarters.map((q: any, i: number) => (
                        <tr key={q.year} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                          <td className="px-3 py-2 font-mono font-semibold">{q.year === "0q" ? "Current Q" : "Next Q"}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtBn(q.revenue)}</td>
                          <td className="px-3 py-2 text-right font-mono">{q.net_income != null ? fmtN(q.net_income, 2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Earnings surprises — from Finnhub */}
              {(pitchData?.earnings_surprises?.length ?? 0) > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Earnings Surprise History</p>
                    <SourceBadge src="Finnhub" href={fhHref} />
                  </div>
                  <table className="w-full text-xs border-collapse mb-3">
                    <thead>
                      <tr className="bg-indigo-900 text-white">
                        {["Quarter","EPS Est.","EPS Actual","Beat/Miss"].map((h, i) => (
                          <th key={h} className={`px-3 py-2 font-semibold uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pitchData!.earnings_surprises.slice(0, 4).map((e, i) => (
                        <tr key={e.period} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                          <td className="px-3 py-2 font-mono">{e.period}</td>
                          <td className="px-3 py-2 text-right font-mono">{e.estimate != null ? e.estimate.toFixed(2) : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{e.actual != null ? e.actual.toFixed(2) : "—"}</td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${(e.surprise_pct ?? 0) > 0 ? "text-green-600" : (e.surprise_pct ?? 0) < 0 ? "text-red-500" : "text-slate-400"}`}>
                            {e.surprise_pct != null ? `${e.surprise_pct >= 0 ? "+" : ""}${e.surprise_pct.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: "Beta",          v: fmtN(s12.beta),              src: "yfinance", href: yhooHref },
                  { l: "Debt/Equity",   v: fmtN(s12.debt_to_equity),    src: "yfinance", href: yhooHref },
                  { l: "Current Ratio", v: fmtN(s12.current_ratio),     src: "yfinance", href: yhooHref },
                ].map(m => (
                  <div key={m.l} className="text-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider">{m.l}</p>
                      <SourceBadge src={m.src} href={m.href} />
                    </div>
                    <p className="font-bold text-sm">{m.v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Price Performance — 1 Year (Weekly)</p>
                <SourceBadge src="yfinance" href={yhooHref} />
              </div>
              <PriceChart candles={candles} />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  ["1m Return", s11.ret_1m != null ? `${(s11.ret_1m * 100).toFixed(1)}%` : "—"],
                  ["3m Return", s11.ret_3m != null ? `${(s11.ret_3m * 100).toFixed(1)}%` : "—"],
                  ["6m Return", s11.ret_6m != null ? `${(s11.ret_6m * 100).toFixed(1)}%` : "—"],
                ].map(([l, v]) => (
                  <div key={l as string} className="text-center p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">{l}</p>
                    <p className="font-bold text-xs mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[["52w High", fmtPrice(s11.high_52w)], ["52w Low", fmtPrice(s11.low_52w)]].map(([l, v]) => (
                  <div key={l as string} className="text-center p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">{l}</p>
                    <p className="font-bold text-xs mt-0.5 font-mono">{v}</p>
                  </div>
                ))}
              </div>

              {/* FMP Key Metrics */}
              {pitchData?.key_metrics && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Advanced Valuation Metrics</p>
                    <SourceBadge src="Financial Modeling Prep" href={fmpHref} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: "EV/EBITDA",  v: pitchData.key_metrics.ev_ebitda  != null ? `${fmtN(pitchData.key_metrics.ev_ebitda)}x`  : "—" },
                      { l: "EV/Revenue", v: pitchData.key_metrics.ev_revenue  != null ? `${fmtN(pitchData.key_metrics.ev_revenue)}x`  : "—" },
                      { l: "FCF Yield",  v: pitchData.key_metrics.fcf_yield   != null ? fmtPct(pitchData.key_metrics.fcf_yield)        : "—" },
                      { l: "ROIC",       v: pitchData.key_metrics.roic        != null ? fmtPct(pitchData.key_metrics.roic)             : "—" },
                    ].map(m => (
                      <div key={m.l} className="text-center p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <p className="text-[9px] text-indigo-500 uppercase tracking-wider">{m.l}</p>
                        <p className="font-bold text-sm mt-0.5 text-indigo-800">{m.v}</p>
                      </div>
                    ))}
                  </div>
                  {pitchData.key_metrics.date && (
                    <p className="text-[9px] text-slate-400 mt-1">As of {pitchData.key_metrics.date}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Slide>

        {/* 5 · COMPETITIVE LANDSCAPE */}
        <Slide>
          <SlideHeader title="Competitive Landscape & Trading Comparables" n={5} />
          <div className="p-7">
            {displayComps.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    {hasLivePE ? "Live Trading Multiples" : "Peer Group Financials"}
                  </p>
                  <SourceBadge src={hasLivePE ? "yfinance" : "AI"} href={hasLivePE ? yhooHref : undefined} />
                </div>
                <table className="w-full text-xs border-collapse mb-3">
                  <thead>
                    <tr className="bg-[#1B2951] text-white">
                      {(hasLivePE
                        ? ["Company","Ticker","Revenue","P/E (TTM)","P/S (TTM)","EBITDA Mgn","Net Margin","D/E"]
                        : ["Company","Ticker","Revenue","Gross Mgn","EBITDA Mgn","Net Margin","D/E"]
                      ).map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 font-semibold uppercase tracking-wide ${i <= 1 ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayComps.map((c, i) => (
                      <tr key={c.ticker} className={c.is_subject ? "bg-amber-50 border-l-4 border-amber-400" : i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                        <td className="px-3 py-2.5 font-semibold">{c.company}{c.is_subject ? " ★" : ""}</td>
                        <td className="px-3 py-2.5 font-mono">{c.ticker}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{c.revenue_bn != null ? `$${c.revenue_bn.toFixed(1)}B` : "—"}</td>
                        {hasLivePE ? (
                          <>
                            <td className="px-3 py-2.5 text-right font-mono">{(c as any).pe_ratio != null ? `${((c as any).pe_ratio as number).toFixed(1)}x` : "—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{(c as any).ps_ratio != null ? `${((c as any).ps_ratio as number).toFixed(1)}x` : "—"}</td>
                          </>
                        ) : (
                          <td className="px-3 py-2.5 text-right font-mono">{(c as any).gross_margin_pct != null ? `${((c as any).gross_margin_pct as number).toFixed(1)}%` : "—"}</td>
                        )}
                        <td className="px-3 py-2.5 text-right font-mono">{c.ebitda_margin_pct != null ? `${c.ebitda_margin_pct.toFixed(1)}%` : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{c.net_margin_pct != null ? `${c.net_margin_pct.toFixed(1)}%` : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{c.de_ratio != null ? c.de_ratio.toFixed(2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-400">
                  {hasLivePE
                    ? "Source: yahoo-finance2 live market data. ★ = subject company. P/E and P/S are trailing twelve months."
                    : "Source: AI-estimated peer financials. Live P/E/P/S available for tickers in analyst-defined peer groups."}
                </p>
                {pitchData?.key_metrics?.ev_ebitda != null && (
                  <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl inline-flex gap-6">
                    <div>
                      <p className="text-[9px] text-indigo-500 uppercase tracking-wider mb-0.5">Subject EV/EBITDA <SourceBadge src="Financial Modeling Prep" href={fmpHref} /></p>
                      <p className="text-sm font-bold text-indigo-800">{fmtN(pitchData.key_metrics.ev_ebitda)}x</p>
                    </div>
                    {pitchData.key_metrics.ev_revenue != null && (
                      <div>
                        <p className="text-[9px] text-indigo-500 uppercase tracking-wider mb-0.5">Subject EV/Revenue</p>
                        <p className="text-sm font-bold text-indigo-800">{fmtN(pitchData.key_metrics.ev_revenue)}x</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">No comparable data available. Run an adhoc report to generate a peer group.</p>
            )}
          </div>
        </Slide>

        {/* 6 · VALUATION */}
        <Slide>
          <SlideHeader title="Valuation Analysis" n={6} />
          <div className="p-7">
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="border-r border-slate-100 pr-6">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider">Methodology</p>
                  <SourceBadge src="AI" />
                </div>
                <p className="text-2xl font-bold text-[#1B2951] mb-5">{s4.methodology || "—"}</p>
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider">Near-term Upside</p>
                  <SourceBadge src="AI" />
                </div>
                <p className="text-3xl font-bold text-green-600">{s4.near_term_upside_pct || "—"}</p>
                <p className="text-xs text-slate-400 mt-2">vs. peers: <span className="font-semibold text-slate-700 capitalize">{s4.cheap_vs_peers || "—"}</span></p>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-2">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider">Implied Multiples & Narrative</p>
                  <SourceBadge src="AI" />
                </div>
                <p className="text-sm text-slate-700 leading-relaxed mb-4">{s4.implied_multiples || s4.narrative || "—"}</p>
                {s13.bear && s13.base && s13.bull && (
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Price Target Summary <SourceBadge src="AI" /></p>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      {[
                        { l: "Current", v: fmtPrice(data.current_price), cls: "text-slate-700" },
                        { l: "Bear",    v: fmtPrice(s13.bear.price_target), cls: "text-red-600" },
                        { l: "Base",    v: fmtPrice(s13.base.price_target), cls: "text-amber-600" },
                        { l: "Bull",    v: fmtPrice(s13.bull.price_target), cls: "text-green-600" },
                      ].map(m => (
                        <div key={m.l}>
                          <p className="text-[9px] text-slate-400 mb-1">{m.l}</p>
                          <p className={`font-bold text-base font-mono ${m.cls}`}>{m.v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Real Analyst Price Target from Finnhub */}
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Analyst Price Targets</p>
                  <SourceBadge src="Finnhub" href={fhHref} />
                </div>
                {pitchData?.price_target ? (
                  <div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { l: "Low",    v: fmtPrice(pitchData.price_target.low),    cls: "text-red-600" },
                        { l: "Median", v: fmtPrice(pitchData.price_target.median), cls: "text-amber-600" },
                        { l: "High",   v: fmtPrice(pitchData.price_target.high),   cls: "text-green-600" },
                      ].map(m => (
                        <div key={m.l} className="text-center p-2.5 bg-slate-50 rounded-lg">
                          <p className="text-[9px] text-slate-400 mb-1">{m.l}</p>
                          <p className={`text-sm font-bold font-mono ${m.cls}`}>{m.v}</p>
                        </div>
                      ))}
                    </div>
                    {pitchData.price_target.mean && (
                      <div className="flex justify-between text-xs border-t border-slate-100 pt-2">
                        <span className="text-slate-500">Mean target</span>
                        <span className="font-mono font-bold">{fmtPrice(pitchData.price_target.mean)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs border-t border-slate-100 pt-2 mt-1">
                      <span className="text-slate-500">Current price</span>
                      <span className="font-mono font-bold">{fmtPrice(data.current_price)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-slate-100 pt-2 mt-1">
                      <span className="text-slate-500">Implied upside (median)</span>
                      <span className={`font-mono font-bold ${pitchData.price_target.median > data.current_price ? "text-green-600" : "text-red-600"}`}>
                        {data.current_price && pitchData.price_target.median
                          ? `${(((pitchData.price_target.median - data.current_price) / data.current_price) * 100).toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-[9px] text-slate-400 mb-1">Consensus Rating</p>
                        <p className="text-xl font-bold text-[#1B2951] capitalize">{analystConsensus || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 mb-1">Analyst Trend</p>
                        <p className="text-sm font-semibold capitalize">{s10.analyst_trend || "—"}</p>
                      </div>
                    </div>
                    {s10.analyst_summary && <p className="text-[10px] text-slate-500 leading-relaxed italic">{s10.analyst_summary}</p>}
                  </>
                )}
              </div>

              {/* Recommendation trend + current multiples */}
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Analyst Recommendation Trend</p>
                  <SourceBadge src="Finnhub" href={fhHref} />
                </div>
                {pitchData?.recommendation_trend
                  ? <RecBar trend={pitchData.recommendation_trend} />
                  : <p className="text-xs text-slate-400 mb-3">Not available</p>
                }
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Current Multiple vs Peers</p>
                    <SourceBadge src={hasLivePE ? "yfinance" : "AI"} href={hasLivePE ? yhooHref : undefined} />
                  </div>
                  {displayComps.slice(0, 3).map((c) => (
                    <div key={c.ticker} className={`flex justify-between items-center p-2 rounded-lg mb-1 ${c.is_subject ? "bg-amber-50 border border-amber-200" : "bg-slate-50"}`}>
                      <span className={`text-xs font-semibold ${c.is_subject ? "text-amber-700" : "text-slate-600"}`}>{c.ticker}{c.is_subject ? " ★" : ""}</span>
                      <div className="flex gap-3 text-xs font-mono">
                        {hasLivePE && (c as any).pe_ratio != null && <span>P/E {((c as any).pe_ratio as number).toFixed(1)}x</span>}
                        {hasLivePE && (c as any).ps_ratio != null && <span>P/S {((c as any).ps_ratio as number).toFixed(1)}x</span>}
                        {!hasLivePE && c.ebitda_margin_pct != null && <span>EBITDA {c.ebitda_margin_pct.toFixed(1)}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Slide>

        {/* 7 · CATALYSTS & TIMING */}
        <Slide>
          <SlideHeader title="Catalysts & Entry Timing" n={7} />
          <div className="p-7 grid grid-cols-2 gap-7">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Technical Setup</p>
                <SourceBadge src="yfinance OHLCV" href={yhooHref} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { l: "RSI (14)",      v: fmtN(s8t.rsi_14),         note: s8t.rsi_14 > 70 ? "Overbought" : s8t.rsi_14 < 30 ? "Oversold" : "Neutral" },
                  { l: "MACD Signal",   v: s8t.macd_signal || "—" },
                  { l: "Trend",         v: s8t.trend || "—" },
                  { l: "Entry Verdict", v: s5.entry_verdict || "—" },
                  { l: "Support",       v: fmtPrice(s8t.support) },
                  { l: "Resistance",    v: fmtPrice(s8t.resistance) },
                ].map(m => (
                  <div key={m.l} className="p-3 border border-slate-100 rounded-xl bg-slate-50">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">{m.l}</p>
                    <p className="font-bold text-sm capitalize">{m.v}</p>
                    {m.note && m.l === "RSI (14)" && <p className="text-[9px] text-amber-600 mt-0.5">{m.note}</p>}
                  </div>
                ))}
              </div>
              {s8t.quant_score != null && (
                <div className="p-4 bg-[#EEF2F8] rounded-xl">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-bold uppercase tracking-wide text-[#1B2951]">Quant Score <SourceBadge src="yfinance OHLCV" href={yhooHref} /></span>
                    <span className="font-mono font-bold">{s8t.quant_score}/100</span>
                  </div>
                  <div className="h-2 bg-white/70 rounded-full overflow-hidden">
                    <div className="h-2 bg-[#1B2951] rounded-full" style={{ width: `${s8t.quant_score}%` }} />
                  </div>
                  {s8t.quant_summary && <p className="text-xs text-slate-600 mt-2 italic leading-relaxed">{s8t.quant_summary}</p>}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Near-Term Catalysts</p>
                <SourceBadge src="AI" />
              </div>
              {parsedCatalysts.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {parsedCatalysts.map((cat, i) => {
                    const contextNote = i === 0 && nearTermItem?.detail ? nearTermItem.detail
                      : i === 1 && quarters.length > 0
                        ? `Analyst est: Revenue ${fmtBn(quarters[0]?.revenue)}, EPS ${fmtN(quarters[0]?.net_income, 2)} (current Q)`
                        : null;
                    return (
                      <div key={cat} className="p-4 bg-green-50 border border-green-200 rounded-xl">
                        <div className="flex gap-3 items-start">
                          <span className="w-5 h-5 rounded-full bg-green-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <div>
                            <p className="text-xs font-bold text-green-800 mb-1">{cat}</p>
                            {contextNote && <p className="text-[10px] text-green-700 leading-relaxed">{contextNote}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {s5.narrative && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-slate-600">Macro & Timing Context</p>
                    <SourceBadge src="AI" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{s5.narrative}</p>
                </div>
              )}

              {/* Live news from Finnhub */}
              {(pitchData?.news?.length ?? 0) > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Recent Headlines (30 days)</p>
                    <SourceBadge src="Finnhub" href={fhHref} />
                  </div>
                  <div className="space-y-2">
                    {pitchData!.news.slice(0, 4).map((n, i) => (
                      <a key={i} href={n.url} target="_blank" rel="noreferrer"
                        className="block p-3 border border-slate-100 rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-colors print:no-underline">
                        <p className="text-[10px] font-semibold text-slate-700 leading-snug mb-0.5 line-clamp-2">{n.headline}</p>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-slate-400">{n.source}</span>
                          <span className="text-[9px] text-slate-400">
                            {n.datetime ? new Date(n.datetime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Slide>

        {/* 8 · RISKS */}
        <Slide>
          <SlideHeader title="Key Risks" n={8} />
          <div className="p-7 grid grid-cols-2 gap-7">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Risk Register</p>
                <SourceBadge src="AI" />
              </div>
              {s7.key_risks?.length > 0 ? (
                <ul className="space-y-3 mb-4">
                  {s7.key_risks.map((r: string, i: number) => (
                    <li key={r} className="flex gap-3 p-4 border border-slate-200 rounded-xl">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-red-100 text-red-600" : i === 1 ? "bg-orange-100 text-orange-600" : "bg-amber-100 text-amber-700"}`}>{i + 1}</span>
                      <p className="text-sm text-slate-700">{r}</p>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Insider trades from FMP */}
              {(pitchData?.insider_trades?.length ?? 0) > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Insider Transactions (Recent)</p>
                    <SourceBadge src="Financial Modeling Prep" href={fmpHref} />
                  </div>
                  <div className="flex gap-3 mb-2 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                      {buyInsiders.length} Buys
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                      {sellInsiders.length} Sales
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {pitchData!.insider_trades.slice(0, 5).map((t, i) => {
                      const isBuy = t.disposition === "A" || /buy|acquire/i.test(t.transaction_type);
                      return (
                        <div key={i} className={`flex justify-between items-center p-2.5 rounded-lg border text-xs ${isBuy ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                          <div>
                            <p className="font-semibold text-slate-700">{t.name}</p>
                            <p className="text-slate-400 text-[9px]">{t.role?.replace("officer: ", "")}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold font-mono ${isBuy ? "text-green-700" : "text-red-600"}`}>{isBuy ? "+" : "−"}{t.shares?.toLocaleString()} sh</p>
                            <p className="text-slate-400 text-[9px]">{t.date} {t.price ? `@ $${Number(t.price).toFixed(2)}` : ""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Risk Metrics</p>
                <SourceBadge src="yfinance" href={yhooHref} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  ["Beta",          fmtN(s12.beta)],
                  ["Debt/Equity",   fmtN(s12.debt_to_equity)],
                  ["Current Ratio", fmtN(s12.current_ratio)],
                  ["Liquidity Risk",(s12.liquidity_risk || "—") as string],
                ].map(([l, v]) => (
                  <div key={l as string} className="p-3 border border-slate-200 rounded-xl bg-slate-50">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">{l}</p>
                    <p className="font-bold text-sm capitalize">{v}</p>
                  </div>
                ))}
              </div>
              {s10.major_holders?.length > 0 && (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Institutional Ownership</p>
                    <SourceBadge src="Yahoo Finance" href={yhooHref} />
                  </div>
                  {s10.major_holders.slice(0, 4).map((h: any) => (
                    <div key={h.name} className="flex justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                      <span className="text-slate-600">{h.name}</span>
                      <span className="font-mono font-semibold">{h.pct}%</span>
                    </div>
                  ))}
                  <p className="text-[9px] text-slate-400 mt-2">Total institutional: {s10.institutional_pct ?? "—"}%</p>
                </div>
              )}
            </div>
          </div>
        </Slide>

        {/* 9 · SCENARIO ANALYSIS */}
        <Slide>
          <SlideHeader title="Scenario Analysis" n={9} />
          <div className="p-7">
            <div className="grid grid-cols-3 gap-5 mb-5">
              {[
                { key: "bull", label: "Bull Case", hdr: "bg-green-700", txt: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
                { key: "base", label: "Base Case", hdr: "bg-amber-500", txt: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
                { key: "bear", label: "Bear Case", hdr: "bg-red-700",   txt: "text-red-700",   bg: "bg-red-50",   border: "border-red-200"   },
              ].map(({ key, label, hdr, txt, bg: sbg, border }) => {
                const sc = s13[key]; if (!sc) return null;
                return (
                  <div key={key} className={`rounded-2xl overflow-hidden border ${border}`}>
                    <div className={`${hdr} text-white px-5 py-3 flex justify-between items-center`}>
                      <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
                      <span className="text-xs font-mono opacity-80">{sc.probability}% prob.</span>
                    </div>
                    <div className={`${sbg} p-5`}>
                      <p className={`text-4xl font-bold mb-1 font-mono ${txt}`}>{fmtPrice(sc.price_target)}</p>
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
              {/* Weighted return */}
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Probability-Weighted Return</p>
                  <SourceBadge src="AI" />
                </div>
                {s13.bull && s13.base && s13.bear && (
                  <div className="space-y-2">
                    {[
                      { l: "Bull", prob: s13.bull.probability, ret: s13.bull.upside_pct, sign: 1, cls: "text-green-600" },
                      { l: "Base", prob: s13.base.probability, ret: s13.base.upside_pct, sign: 1, cls: "text-amber-600" },
                      { l: "Bear", prob: s13.bear.probability, ret: s13.bear.downside_pct, sign: -1, cls: "text-red-600" },
                    ].map(({ l, prob, ret, sign, cls }) => (
                      <div key={l} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 w-10">{l}</span>
                        <span className="text-slate-400 w-12 text-right">{prob}%</span>
                        <span className="text-slate-400 w-4 text-center">×</span>
                        <span className={`${cls} font-mono w-16 text-right`}>{sign > 0 ? "+" : "-"}{ret ?? 0}%</span>
                        <span className="text-slate-400 w-4 text-center">=</span>
                        <span className="font-mono font-semibold text-right w-14">{((prob / 100) * (ret ?? 0) * sign).toFixed(1)}%</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-1 border-t border-slate-200 flex justify-between text-xs font-bold">
                      <span className="text-slate-700">Expected Return</span>
                      <span className={`font-mono text-base ${Number(weightedReturn) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {Number(weightedReturn) >= 0 ? "+" : ""}{weightedReturn}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Differentiated view */}
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Differentiated View</p>
                  <SourceBadge src="AI" />
                </div>
                {s9.contrarian_signal && (
                  <div className="mb-2 px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg inline-block">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">Contrarian Long Signal</span>
                  </div>
                )}
                {s9.sentiment_summary && <p className="text-xs text-slate-700 leading-relaxed mt-2">{s9.sentiment_summary}</p>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    { l: "Fundamental", v: data.agent_scores?.fundamental },
                    { l: "Quant",       v: data.agent_scores?.quant },
                    { l: "Sentiment",   v: data.agent_scores?.sentiment },
                  ].map(({ l, v }) => (
                    <div key={l} className="p-2 bg-slate-50 rounded-lg">
                      <p className="text-[9px] text-slate-400 mb-0.5">{l}</p>
                      <p className="text-sm font-bold text-[#1B2951]">{v ?? "—"}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-slate-400 mt-2">Scenarios from multi-agent committee: Fundamental + Quant + Sentiment.</p>
              </div>
            </div>
          </div>
        </Slide>

        {/* 10 · RECOMMENDATION */}
        <Slide>
          <SlideHeader title="Investment Recommendation" n={10} />
          <div>
            <div className="bg-[#1B2951] text-white px-8 py-7 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-blue-300 uppercase tracking-[0.15em] mb-2">Final Recommendation</p>
                <p className="text-6xl font-bold tracking-tight">{data.direction.replace(/_/g, " ")}</p>
                <p className="text-blue-300 mt-2 text-sm">{data.company_name !== ticker ? data.company_name : ticker} · {data.sector || "Equity"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-300 uppercase tracking-widest mb-1">Conviction Score</p>
                <p className="text-6xl font-bold">{data.conviction}<span className="text-2xl text-blue-300">/100</span></p>
                <div className="w-48 h-2.5 bg-white/20 rounded-full overflow-hidden mt-3">
                  <div className={`h-2.5 rounded-full ${convBar(data.conviction)}`} style={{ width: `${data.conviction}%` }} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              {[
                { l: "Expected Return (12m)",  v: data.expected_return_12m,              src: "AI" },
                { l: "Suggested Position Size",v: `${s7.suggested_size_pct ?? "—"}%`,    src: "AI" },
                { l: "Stop Loss Threshold",    v: `−${s7.stop_loss_pct ?? "—"}%`,        src: "AI" },
              ].map(m => (
                <div key={m.l} className="px-8 py-7">
                  <div className="flex items-center gap-1 mb-2">
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest">{m.l}</p>
                    <SourceBadge src={m.src} />
                  </div>
                  <p className="text-3xl font-bold text-[#1B2951]">{m.v}</p>
                </div>
              ))}
            </div>
          </div>
        </Slide>

        {/* Footer with data source legend */}
        <div className="text-center text-[11px] text-slate-400 py-4">
          <p className="font-mono">{ticker} · {data.date} · Haz Capital Management · Autonomous AI Equity Research</p>
          <p className="mt-1">Not financial advice. For informational purposes only.</p>
          <div className="flex justify-center gap-4 mt-2 flex-wrap print:hidden">
            {[
              { label: "yfinance — Price, technicals, financials", isAI: false },
              { label: "Finnhub — EPS surprises, analyst targets, news", isAI: false },
              { label: "Financial Modeling Prep — EV/EBITDA, ROIC, insider trades", isAI: false },
              { label: "AI (GPT-4o) — Narratives, segments, thesis, scenarios", isAI: true },
            ].map(s => (
              <span key={s.label} className={`text-[9px] px-2 py-0.5 rounded border ${s.isAI ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-sky-50 text-sky-600 border-sky-200"}`}>
                {s.label}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
