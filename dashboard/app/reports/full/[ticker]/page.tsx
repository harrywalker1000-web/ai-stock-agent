/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import CandlestickChart from "@/components/CandlestickChart";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SegmentData { date: string; segments: { name: string; value: number; pct: number }[]; }
interface PitchData {
  earnings_surprises: { period: string; actual: number | null; estimate: number | null; surprise_pct: number | null }[];
  price_target: { high: number; low: number; mean: number; median: number; updated: string } | null;
  recommendation_trend: { period: string; strong_buy: number; buy: number; hold: number; sell: number; strong_sell: number; total: number } | null;
  news: { headline: string; source: string; url: string; datetime: number; summary: string }[];
  key_metrics: { ev_ebitda: number | null; ev_revenue: number | null; fcf_yield: number | null; roic: number | null; pb_ratio: number | null; enterprise_value: number | null; net_debt_ebitda: number | null; date: string | null } | null;
  insider_trades: { name: string; role: string; transaction_type: string; shares: number | null; price: number | null; date: string; disposition: string }[];
  revenue_segments: SegmentData | null;
  revenue_geo: SegmentData | null;
  sources: Record<string, string | null>;
}
interface CompanyProfile {
  name: string | null; description: string | null; ceo: string | null;
  sector: string | null; industry: string | null; country: string | null;
  employees: string | null; website: string | null; exchange: string | null;
  ipo_date: string | null; image: string | null;
}
interface FullFinancials {
  company_profile: CompanyProfile | null;
  income_statement: { date: string; year: string; revenue: number | null; gross_profit: number | null; ebitda: number | null; net_income: number | null; eps: number | null; gross_margin: number | null; ebitda_margin: number | null; net_margin: number | null }[];
  key_metrics_history: { date: string; year: string; ev_ebitda: number | null; roic: number | null; pb_ratio: number | null; pe_ratio: number | null; fcf_yield: number | null }[];
  analyst_estimates: { date: string; estimated_revenue_avg: number | null; estimated_eps_avg: number | null; number_analyst_estimated_revenue: number | null }[];
  pt_consensus: { high: number | null; low: number | null; mean: number | null; median: number | null } | null;
}
interface Comp {
  ticker: string; company: string; is_subject?: boolean;
  revenue_bn: number | null; pe_ratio?: number | null; ps_ratio?: number | null;
  ebitda_margin_pct: number | null; net_margin_pct: number | null; de_ratio: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtN  = (n: number | null | undefined, d = 1) => n == null ? "—" : n.toFixed(d);
const fmtBn = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n/1e12).toFixed(1)}T`;
  if (a >= 1e9)  return `$${(n/1e9).toFixed(1)}B`;
  if (a >= 1e6)  return `$${(n/1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
};
const fmtPct   = (n: number | null | undefined, d = 1) => n == null ? "—" : `${(n * 100).toFixed(d)}%`;
const fmtPctRaw = (n: number | null | undefined, d = 1) => n == null ? "—" : `${Number(n).toFixed(d)}%`;
const fmtPrice  = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const yoy = (curr: number | null, prev: number | null) =>
  !curr || !prev || prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100;
const dirBadge  = (d: string) => { const u = d.toUpperCase(); return u.includes("BUY") || u.includes("LONG") ? "bg-green-700 text-white" : u.includes("SELL") || u.includes("SHORT") ? "bg-red-700 text-white" : "bg-amber-500 text-white"; };
const convBar   = (n: number) => n >= 70 ? "bg-green-500" : n >= 50 ? "bg-amber-400" : "bg-red-400";
function parsePyList(s: string): string[] {
  if (!s) return [];
  const t = s.trim();
  if (!t.startsWith("[")) return [s];
  try { return JSON.parse(t.replace(/'/g, '"')); }
  catch { const m = t.match(/'([^']+)'/g); return m ? m.map(x => x.slice(1,-1)) : [s]; }
}
function prettify(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function safeNote(n: any): string | null {
  if (n == null || n === "") return null;
  if (typeof n === "object") return (n as any).notes ?? (n as any).detail ?? Object.entries(n).map(([k,v])=>`${k}: ${v}`).join(", ");
  const str = String(n);
  if (str.startsWith("{") && str.includes(":")) { try { const p = JSON.parse(str.replace(/'/g, '"')); return (p as any).notes ?? (p as any).detail ?? null; } catch { return null; } }
  return str;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SlideHeader({ title, n, total = 18 }: { title: string; n: number | string; total?: number }) {
  return (
    <div className="slide-header bg-[#1B2951] text-white flex justify-between items-center px-7 py-3.5 print:break-before-page">
      <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{title}</h2>
      {typeof n === "number" && <span className="text-[10px] text-blue-300 font-mono">{n} / {total}</span>}
    </div>
  );
}
function Slide({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="slide-section border border-slate-200 rounded-b-2xl overflow-hidden mb-7 print:mb-0 print:rounded-none print:border-x-0 print:border-b-0 bg-white">
      {children}
    </div>
  );
}
function SourceBadge({ src, href }: { src: string; href?: string }) {
  const isAI = /llm|ai|gpt|committee/i.test(src);
  const cls = isAI ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-sky-50 text-sky-600 border-sky-200";
  const badge = <span className={`inline-flex items-center text-[8px] font-mono px-1.5 py-0.5 rounded border ${cls} print:hidden ml-1 shrink-0`}>{isAI ? "AI" : src}{!isAI && href ? " ↗" : ""}</span>;
  if (!isAI && href) return <a href={href} target="_blank" rel="noreferrer" className="print:hidden">{badge}</a>;
  return badge;
}
function AiTag({ title = "Estimated by LLM" }: { title?: string }) {
  return <span title={title} className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 cursor-help align-middle print:hidden">AI</span>;
}
function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-mono text-right" style={{ color: color ?? "#374151" }}>{value ?? "—"}</span>
    </div>
  );
}
function CheckList({ items, useDetail }: { items: any[]; useDetail?: boolean }) {
  return (
    <div className="space-y-1.5">
      {items.map((c: any, i: number) => {
        const note = safeNote(useDetail ? (c.detail ?? c.note) : (c.note ?? c.detail));
        return (
          <div key={i} className="flex items-start gap-2">
            <span className={`text-xs mt-0.5 shrink-0 ${c.pass ? "text-green-600" : "text-red-500"}`}>{c.pass ? "✓" : "✗"}</span>
            <div className="flex-1 flex justify-between items-start gap-2">
              <span className="text-xs text-slate-700">{prettify(String(c.item ?? ""))}</span>
              {note && <span className="text-[10px] text-slate-400 font-mono text-right max-w-[55%]">{note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function SemiGauge({ value, max = 100, color, size = 100, strokeW = 7, label, sublabel }: { value: number; max?: number; color: string; size?: number; strokeW?: number; label?: string; sublabel?: string }) {
  const R = size * 0.38; const cx = size / 2; const cy = size * 0.48;
  const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const circ = Math.PI * R; const pct = Math.min(1, Math.max(0, value / max)); const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`} className="overflow-visible">
      <path d={arc} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={strokeW} strokeLinecap="round" />
      <path d={arc} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      {label && <text x={cx} y={cy - size * 0.1} textAnchor="middle" fill={color} fontSize={size * 0.22} fontWeight="bold" fontFamily="monospace">{label}</text>}
      {sublabel && <text x={cx} y={cy + 2} textAnchor="middle" fill="#9CA3AF" fontSize={size * 0.09} fontFamily="sans-serif">{sublabel}</text>}
    </svg>
  );
}
function ConvictionGauge({ value, color }: { value: number; color: string }) {
  return <SemiGauge value={value} max={100} color={color} size={90} strokeW={7} label={String(value)} sublabel="CONVICTION" />;
}
function RSIGauge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-slate-400">—</span>;
  const color = value >= 70 ? "#F59E0B" : value <= 30 ? "#10B981" : "#3B82F6";
  const label = value >= 70 ? "Overbought" : value <= 30 ? "Oversold" : "Neutral";
  return (
    <div className="flex flex-col items-center">
      <SemiGauge value={value} max={100} color={color} size={80} strokeW={6} label={value.toFixed(0)} />
      <span className="text-[10px] font-bold -mt-1" style={{ color }}>{label}</span>
    </div>
  );
}
function RecBar({ trend }: { trend: PitchData["recommendation_trend"] }) {
  if (!trend || !trend.total) return null;
  const t = trend.total;
  const pct = (n: number) => Math.max(1, Math.round((n / t) * 100));
  const buyTotal = trend.strong_buy + trend.buy; const sellTotal = trend.sell + trend.strong_sell;
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
function PriceChart({ candles }: { candles: any[] }) {
  if (!candles.length) return <div className="h-28 bg-slate-50 rounded-xl flex items-center justify-center text-xs text-slate-400">Price chart unavailable</div>;
  const data = candles.map((c: any) => ({ t: new Date(c.time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }), p: Number(c.close.toFixed(2)) }));
  const min = Math.min(...data.map(d => d.p)); const max = Math.max(...data.map(d => d.p));
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

const SECTIONS = [
  { key: "cover",   label: "Cover" },
  { key: "s1",     label: "Fund Mandate" },
  { key: "s2",     label: "Investment Arguments" },
  { key: "s3",     label: "Where We Differ" },
  { key: "s4",     label: "Business Overview" },
  { key: "snews",  label: "Latest News" },
  { key: "s5",     label: "Historical Financials" },
  { key: "s6",     label: "Valuation Metrics" },
  { key: "s7",     label: "Competitive Landscape" },
  { key: "s8",     label: "Valuation Analysis" },
  { key: "s9",     label: "Risk & Mitigation" },
  { key: "s10",    label: "Technical Analysis" },
  { key: "s11",    label: "Industry & Market" },
  { key: "s12",    label: "Catalysts & Timing" },
  { key: "s13",    label: "Institutional Activity" },
  { key: "s14",    label: "Scenario Analysis" },
  { key: "s15",    label: "Sentiment" },
  { key: "s16",    label: "Setup Checklist" },
  { key: "s17",    label: "Recommendation" },
  { key: "s18",    label: "Data Reliability" },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function FullReportPage() {
  const params = useParams();
  const ticker = String(params.ticker).toUpperCase();

  const [adhoc,          setAdhoc]          = useState<Record<string, any> | null>(null);
  const [pitch,          setPitch]          = useState<PitchData | null>(null);
  const [full,           setFull]           = useState<FullFinancials | null>(null);
  const [comps,          setComps]          = useState<Comp[]>([]);
  const [candles,        setCandles]        = useState<any[]>([]);
  const [newsSynthesis,  setNewsSynthesis]  = useState<string | null>(null);
  const [newsLoading,    setNewsLoading]    = useState(false);
  const [err,            setErr]            = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/adhoc/${ticker}`).then(r => r.json()),
      fetch(`/api/pitch-data/${ticker}`).then(r => r.json()).catch(() => null),
      fetch(`/api/full-financials/${ticker}`).then(r => r.json()).catch(() => null),
      fetch(`/api/comparables/${ticker}`).then(r => r.json()).catch(() => ({ comparables: [] })),
      fetch(`/api/chart/${ticker}?tf=1W`).then(r => r.json()).catch(() => ({ candles: [] })),
    ]).then(([ad, pd, fd, compsData, chartData]) => {
      if (ad.error) { setErr(ad.error); setLoading(false); return; }
      setAdhoc(ad);
      setPitch(pd);
      setFull(fd);
      setComps(compsData?.comparables || []);
      setCandles(chartData?.candles || []);
      setLoading(false);
    }).then(() => {
      // Lazy-load LLM news synthesis after main data
      setNewsLoading(true);
      fetch(`/api/news-analysis/${ticker}`)
        .then(r => r.json())
        .then(d => { if (d.synthesis) setNewsSynthesis(d.synthesis); })
        .catch(() => {})
        .finally(() => setNewsLoading(false));
    }).catch(e => { setErr(String(e)); setLoading(false); });
  }, [ticker]);

  const handlePrint = () => window.print();

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#1B2951] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 font-mono text-sm">Loading {ticker} full report…</p>
        <p className="text-slate-300 text-xs mt-1">Fetching from pipeline · FMP · Finnhub · yfinance</p>
      </div>
    </div>
  );

  if (err || !adhoc) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center max-w-sm">
        <p className="text-4xl font-bold text-[#1B2951] mb-2">{ticker}</p>
        <p className="text-slate-500 text-sm mb-4">{err || "No report found."}</p>
        <p className="text-slate-400 text-xs mb-6">Run an adhoc analysis first to generate the pipeline data.</p>
        <a href="/reports/adhoc" className="text-sm text-amber-600 hover:underline">← Research tab</a>
      </div>
    </div>
  );

  // Destructure pipeline data
  const s1  = adhoc.s1_mandate ?? {};
  const s2c = adhoc.s2_company ?? {};
  const s3s = adhoc.s3_setup ?? {};
  const s4  = adhoc.s4_valuation ?? {};
  const s5  = adhoc.s5_timing ?? {};
  const s6  = adhoc.s6_thesis ?? {};
  const s7  = adhoc.s7_recommendation ?? {};
  const s8t = adhoc.s8_technical ?? {};
  const s9  = adhoc.s9_sentiment ?? {};
  const s10 = adhoc.s10_institutional ?? {};
  const s11 = adhoc.s11_performance ?? {};
  const s12 = adhoc.s12_risk ?? {};
  const s13 = adhoc.s13_scenarios ?? {};
  const s14 = adhoc.s14_data ?? {};
  const bg   = s2c.background ?? {};
  const fin  = s2c.financial_snapshot ?? {};
  const moat = s2c.quality_of_earnings ?? {};
  const mkt  = s2c.market_analysis ?? {};
  const mgmt = s2c.management_team ?? {};

  const direction  = adhoc.direction ?? s7.direction ?? "PASS";
  const conviction = adhoc.conviction;
  const cvColor    = conviction == null ? "#6B7280" : conviction >= 70 ? "#10B981" : conviction >= 40 ? "#F59E0B" : "#EF4444";
  const analystConsensus = s10.analyst_consensus || s9.analyst_consensus;
  const hasLivePE  = comps.length > 0;

  const yhooHref = `https://finance.yahoo.com/quote/${ticker}`;
  const fhHref   = `https://finnhub.io/`;
  const fmpHref  = `https://financialmodelingprep.com/financial-summary/${ticker}`;

  // Three investment arguments — skip generic catalyst/risk items, clean list strings
  const SKIP_ITEMS = new Set(["upcoming_catalysts", "key_risks", "near_term_catalyst", "setup_type", "above_20pct_threshold", "eps_growth_consistent", "fcf_positive", "leverage_vs_peers", "default_risk", "sustainability_assessment", "tam_room_to_grow"]);
  const isPyList = (s: string) => /^\s*\[/.test(s);
  const investmentArgs = (() => {
    const passing = (s3s.checklist || [])
      .filter((c: any) => c.pass && !SKIP_ITEMS.has(c.item) && String(c.detail ?? "").length > 35 && !isPyList(String(c.detail ?? "")))
      .slice(0, 3);
    if (passing.length >= 2) return passing;
    // Fallback: split thesis narrative into sentences
    if (s6.narrative) {
      const sentences = s6.narrative.split(/\.\s+/).filter((s: string) => s.length > 50 && !s.toLowerCase().includes("however") && !s.toLowerCase().includes("suggest caution")).slice(0, 3);
      return sentences.map((s: string, i: number) => ({ item: `Argument ${i + 1}`, detail: s + ".", pass: true }));
    }
    return passing;
  })();

  // PEG calculation
  const pegData = (() => {
    const subject = comps.find(c => c.is_subject);
    const pe = (subject as any)?.pe_ratio ?? null;
    const estimates = full?.analyst_estimates ?? [];
    if (estimates.length < 2 || !pe) return null;
    const latestEps = estimates[0].estimated_eps_avg;
    const prevEps   = estimates[1].estimated_eps_avg;
    if (!latestEps || !prevEps || prevEps <= 0) return null;
    const epsGrowth = ((latestEps - prevEps) / Math.abs(prevEps)) * 100;
    if (epsGrowth <= 0) return null;
    const peg = pe / epsGrowth;
    return { pe, epsGrowth, peg };
  })();

  // EV/EBITDA trend data for chart
  const evEbitdaTrend = (full?.key_metrics_history ?? [])
    .filter(m => m.ev_ebitda != null && m.ev_ebitda > 0 && m.ev_ebitda < 200)
    .map(m => ({ year: m.year ?? m.date?.split("-")[0], ev_ebitda: Number(m.ev_ebitda!.toFixed(1)) }))
    .reverse();

  // Insider buys/sells
  const buyInsiders  = (pitch?.insider_trades || []).filter(t => t.disposition === "A" || /buy|acquire/i.test(t.transaction_type));
  const sellInsiders = (pitch?.insider_trades || []).filter(t => t.disposition === "D" || /sale|sell/i.test(t.transaction_type));

  // Peer P/E average (from live comparables)
  const peerPEs = comps.filter(c => !c.is_subject && (c as any).pe_ratio != null && (c as any).pe_ratio > 0 && (c as any).pe_ratio < 200).map(c => (c as any).pe_ratio as number);
  const peerAvgPE = peerPEs.length > 0 ? peerPEs.reduce((a: number, b: number) => a + b, 0) / peerPEs.length : null;
  const subjectPE  = comps.find(c => c.is_subject) ? ((comps.find(c => c.is_subject) as any).pe_ratio as number | null) : null;

  // Best available analyst price target (Finnhub > FMP consensus)
  const bestPT = pitch?.price_target ?? full?.pt_consensus ?? null;

  // Expected return from analyst PT median vs current price
  const ptExpectedReturn = bestPT?.median && adhoc.current_price
    ? (((bestPT.median - adhoc.current_price) / adhoc.current_price) * 100).toFixed(1)
    : null;

  // Resistance fallback: use 52w high when pipeline didn't compute it
  const resistanceLevel = s8t.resistance ?? s11.high_52w ?? null;

  // Near-term catalysts
  const catalystItem = (s3s.checklist || []).find((c: any) => c.item === "upcoming_catalysts");
  const parsedCatalysts: string[] = catalystItem?.detail ? parsePyList(catalystItem.detail) : [];
  const quarters = (fin.forward || []).filter((f: any) => typeof f.year === "string" && f.year.includes("q"));

  // Weighted return
  const weightedReturn = (() => {
    const { bull, base, bear } = s13;
    if (!bull || !base || !bear) return null;
    return ((bull.probability / 100) * (bull.upside_pct || 0) + (base.probability / 100) * (base.upside_pct || 0) + (bear.probability / 100) * -(bear.downside_pct || 0)).toFixed(1);
  })();

  const riskLevels = ["High", "Medium", "Low"];

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#0F172A] print:bg-white">
      <style>{`
        @media print {
          @page { margin: 12mm 14mm; size: A4; }
          #cover { page-break-after: avoid; }
          .slide-section { page-break-inside: avoid; }
          .slide-header { background-color: #1B2951 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .slide-header * { color: white !important; }
          .recharts-wrapper, .recharts-responsive-container { break-inside: avoid; }
        }
      `}</style>
      <div className="max-w-[1100px] mx-auto px-5 py-10 print:px-0 print:py-0 flex gap-8">

        {/* ── Sidebar nav ── */}
        <aside className="hidden xl:block w-44 shrink-0 print:hidden">
          <div className="sticky top-8">
            <a href="/reports/adhoc" className="text-[10px] text-slate-400 hover:text-slate-600 block mb-4">← Research</a>
            <nav className="space-y-0.5">
              {SECTIONS.map((s, i) => (
                <a key={s.key} href={`#${s.key}`} className="block text-[11px] text-slate-400 hover:text-slate-700 py-0.5 transition-colors truncate">
                  {i > 0 ? `${i}. ` : ""}{s.label}
                </a>
              ))}
            </nav>
            <button onClick={handlePrint} className="mt-6 w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 py-2 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 transition-all">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0"><path d="M5 1a1 1 0 0 0-1 1v2H3a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2a1 1 0 0 0-1-1H5zm6 3V2H5v2h6zm1 5H4a.5.5 0 0 0 0 1h8a.5.5 0 0 0 0-1zm0 2H4a.5.5 0 0 0 0 1h8a.5.5 0 0 0 0-1z"/></svg>
              Export PDF
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">

          {/* Toolbar */}
          <div className="print:hidden flex justify-between items-center mb-6">
            <a href="/reports/adhoc" className="text-sm text-slate-500 hover:text-slate-700">← All Research</a>
            <div className="flex items-center gap-3">
              <a href={`/pitch/${ticker}`} className="text-xs text-slate-400 hover:text-slate-600">Pitch view</a>
              <a href={`/reports/adhoc/${ticker}`} className="text-xs text-slate-400 hover:text-slate-600">Research view</a>
              <button onClick={handlePrint} className="px-4 py-2 bg-[#1B2951] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">Export PDF</button>
            </div>
          </div>

          {/* ── COVER ── */}
          <div id="cover" className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-7 print:rounded-none print:border-0">
            <div className="bg-[#1B2951] text-white px-8 py-5 flex justify-between items-start">
              <div>
                <p className="text-xs font-mono text-blue-300 uppercase tracking-[0.15em]">Haz Capital Management</p>
                <p className="text-xs text-blue-400 mt-0.5">Full Equity Research · {adhoc.date}</p>
              </div>
              <span className={`text-sm font-bold px-5 py-2.5 rounded-xl ${dirBadge(direction)}`}>{direction.replace(/_/g, " ")}</span>
            </div>
            <div className="px-8 py-7 border-b border-slate-100">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <h1 className="text-[5rem] font-bold tracking-tight text-[#1B2951] leading-none">{ticker}</h1>
                  {adhoc.company_name && adhoc.company_name !== ticker && adhoc.company_name !== "NA" && adhoc.company_name !== "N/A" && (
                    <p className="text-2xl text-slate-400 font-light mt-1">{full?.company_profile?.name ?? adhoc.company_name}</p>
                  )}
                  {(() => { const sec = full?.company_profile?.sector ?? adhoc.sector; return sec && sec !== "N/A" && sec !== "NA" && <p className="text-sm text-slate-400 mt-0.5">{sec}</p>; })()}
                </div>
                <div className="border-2 border-[#1B2951] rounded-2xl p-5 text-center min-w-[190px]">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-3">Analyst Price Target Range</p>
                  {bestPT ? (
                    <>
                      <div className="flex justify-between text-sm font-mono font-bold mb-2">
                        <span className="text-red-600">{fmtPrice(bestPT.low)}</span>
                        <span className="text-amber-600">{fmtPrice(bestPT.median)}</span>
                        <span className="text-green-600">{fmtPrice(bestPT.high)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Low</span><span>Median</span><span>High</span></div>
                      <SourceBadge src={pitch?.price_target ? "Finnhub" : "FMP"} href={pitch?.price_target ? fhHref : fmpHref} />
                    </>
                  ) : s13.bear && s13.bull ? (
                    <>
                      <div className="flex justify-between text-sm font-mono font-bold mb-2">
                        <span className="text-red-600">{fmtPrice(s13.bear?.price_target)}</span>
                        <span className="text-amber-600">{fmtPrice(s13.base?.price_target)}</span>
                        <span className="text-green-600">{fmtPrice(s13.bull?.price_target)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400"><span>Bear</span><span>Base</span><span>Bull</span></div>
                      <SourceBadge src="AI" />
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-slate-100">
              {[
                { l: "Current Price",    v: fmtPrice(adhoc.current_price),       src: "yfinance", href: yhooHref },
                { l: "Market Cap",       v: fmtBn(adhoc.market_cap),             src: "yfinance", href: yhooHref },
                { l: "PT Median",        v: bestPT?.median ? fmtPrice(bestPT.median) : "—", src: bestPT === pitch?.price_target ? "Finnhub" : "FMP", href: bestPT === pitch?.price_target ? fhHref : fmpHref },
                { l: "vs 52w High",      v: s11.pct_from_high != null ? `${s11.pct_from_high}%` : "—", src: "yfinance", href: yhooHref },
                { l: "Analyst Rating",   v: (analystConsensus || "—") as string, src: "Yahoo Finance", href: yhooHref },
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
                <span className="font-mono font-bold text-[#1B2951]">{conviction} / 100</span>
              </div>
              <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-2.5 rounded-full ${convBar(conviction)}`} style={{ width: `${conviction}%` }} />
              </div>
            </div>
          </div>

          {/* ── S1: FUND MANDATE ── */}
          <Slide id="s1">
            <SlideHeader title="Fund Mandate Checklist" n={1} />
            <div className="p-7">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold mb-4 ${s1.pass ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {s1.pass ? "✓ MANDATE PASS" : `✗ MANDATE FAIL — ${s1.fail_reason}`}
              </div>
              <CheckList items={s1.checks ?? []} />
            </div>
          </Slide>

          {/* ── S2: THREE INVESTMENT ARGUMENTS ── */}
          <Slide id="s2">
            <SlideHeader title="Three Investment Arguments" n={2} />
            <div className="p-7">
              {investmentArgs.length > 0 ? (() => {
                const cagr   = (s3s.checklist || []).find((c: any) => c.item === "revenue_cagr_3yr");
                const moat   = (s3s.checklist || []).find((c: any) => c.item === "moat_strength");
                const incStmt = full?.income_statement ?? [];
                // Supporting stats to inject per argument slot
                const statsBySlot: Record<number, React.ReactNode> = {
                  0: cagr?.detail ? (
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs bg-green-50 border border-green-200 rounded-lg px-2 py-1">
                        <span className="text-slate-500">Revenue CAGR 3yr:</span>
                        <span className="font-mono font-bold text-green-700">{cagr.detail}%</span>
                        <SourceBadge src="yfinance" href={yhooHref} />
                      </span>
                      {pitch?.key_metrics?.roic != null && (
                        <span className="inline-flex items-center gap-1 text-xs bg-sky-50 border border-sky-200 rounded-lg px-2 py-1">
                          <span className="text-slate-500">ROIC:</span>
                          <span className="font-mono font-bold text-sky-700">{fmtPct(pitch.key_metrics.roic)}</span>
                          <SourceBadge src="FMP" href={fmpHref} />
                        </span>
                      )}
                    </div>
                  ) : null,
                  1: incStmt.length >= 2 ? (() => {
                    const yoyRev = yoy(incStmt[0].revenue, incStmt[1].revenue);
                    return yoyRev != null ? (
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs bg-sky-50 border border-sky-200 rounded-lg px-2 py-1">
                          <span className="text-slate-500">Latest Revenue YoY:</span>
                          <span className={`font-mono font-bold ${yoyRev >= 0 ? "text-green-700" : "text-red-600"}`}>{yoyRev >= 0 ? "+" : ""}{yoyRev.toFixed(1)}%</span>
                          <SourceBadge src="FMP" href={fmpHref} />
                        </span>
                        {incStmt[0].ebitda_margin != null && (
                          <span className="inline-flex items-center gap-1 text-xs bg-sky-50 border border-sky-200 rounded-lg px-2 py-1">
                            <span className="text-slate-500">EBITDA Margin:</span>
                            <span className="font-mono font-bold text-sky-700">{fmtPct(incStmt[0].ebitda_margin)}</span>
                            <SourceBadge src="FMP" href={fmpHref} />
                          </span>
                        )}
                      </div>
                    ) : null;
                  })() : null,
                  2: moat?.detail ? (
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
                        <span className="text-slate-500">Moat:</span>
                        <span className="font-mono font-bold text-indigo-700">{moat.detail}</span>
                        <AiTag />
                      </span>
                      {subjectPE != null && peerAvgPE != null && (
                        <span className={`inline-flex items-center gap-1 text-xs rounded-lg px-2 py-1 border ${subjectPE < peerAvgPE ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                          <span className="text-slate-500">P/E vs peers:</span>
                          <span className={`font-mono font-bold ${subjectPE < peerAvgPE ? "text-green-700" : "text-amber-700"}`}>{subjectPE.toFixed(1)}x vs {peerAvgPE.toFixed(1)}x avg</span>
                          <SourceBadge src="yfinance" href={yhooHref} />
                        </span>
                      )}
                    </div>
                  ) : null,
                };
                return (
                  <div className="space-y-4">
                    {investmentArgs.map((arg: any, i: number) => (
                      <div key={i} className="flex gap-4 p-5 border border-slate-200 rounded-xl bg-slate-50">
                        <span className="w-8 h-8 rounded-full bg-[#1B2951] text-white text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#1B2951] mb-1">{prettify(String(arg.item ?? `Argument ${i+1}`))}</p>
                          <p className="text-sm text-slate-700 leading-relaxed">{String(arg.detail ?? "")}</p>
                          {statsBySlot[i]}
                          <div className="mt-2"><AiTag title="Investment argument from pipeline analysis" /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })() : (
                <p className="text-sm text-slate-400">Investment arguments require an adhoc pipeline report. Run the analysis to populate this section.</p>
              )}
            </div>
          </Slide>

          {/* ── S3: WHERE WE DIFFER ── */}
          <Slide id="s3">
            <SlideHeader title="Where We Differ" n={3} />
            <div className="p-7 grid grid-cols-2 gap-7">
              <div className="border border-slate-200 rounded-xl p-5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Street Consensus</p>
                <p className="text-2xl font-bold text-[#1B2951] capitalize mb-1">{analystConsensus || "—"}</p>
                {pitch?.price_target && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1 mb-1">
                      <p className="text-[9px] text-slate-400">Median price target</p>
                      <SourceBadge src="Finnhub" href={fhHref} />
                    </div>
                    <p className="text-xl font-mono font-bold text-slate-700">{fmtPrice(pitch.price_target.median)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Range: {fmtPrice(pitch.price_target.low)} – {fmtPrice(pitch.price_target.high)}</p>
                  </div>
                )}
                {pitch?.recommendation_trend && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1 mb-2">
                      <p className="text-[9px] text-slate-400">Analyst recommendation distribution</p>
                      <SourceBadge src="Finnhub" href={fhHref} />
                    </div>
                    <RecBar trend={pitch.recommendation_trend} />
                  </div>
                )}
                {s10.analyst_trend && <p className="text-xs text-slate-500 mt-3">Trend: <span className="font-semibold capitalize">{s10.analyst_trend}</span></p>}
              </div>
              <div className="border-2 border-[#1B2951] rounded-xl p-5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B2951] mb-3">Our Differentiated View</p>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-lg font-bold px-4 py-1.5 rounded-xl ${dirBadge(direction)}`}>{direction.replace(/_/g, " ")}</span>
                  {conviction != null && <div className="flex items-center gap-1"><ConvictionGauge value={conviction} color={cvColor} /></div>}
                </div>
                {(() => {
                  // Show the investment thesis instead of stale AI valuation text
                  const viewText = s6.narrative
                    ? s6.narrative.split(/\.\s+/).filter((t: string) => t.length > 40 && !t.toLowerCase().includes("however") && !t.toLowerCase().includes("caution")).slice(0, 2).join(". ").replace(/\.$/, "") + "."
                    : (s4.own_view ?? null);
                  if (!viewText) return null;
                  return (
                    <p className="text-xs text-slate-700 leading-relaxed mb-3">
                      {viewText}
                      <AiTag title="Investment thesis from pipeline committee analysis" />
                    </p>
                  );
                })()}
                {(adhoc.expected_return_12m ?? s7.expected_return_12m ?? s7.expected_return_2_3yr) && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider">Expected 12m return</span>
                    <span className="font-mono font-bold text-green-700">{adhoc.expected_return_12m ?? s7.expected_return_12m ?? s7.expected_return_2_3yr}</span>
                    <AiTag />
                  </div>
                )}
                {s9.contrarian_signal && (
                  <div className="mt-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">Contrarian Long Signal Detected</p>
                    {s9.sentiment_summary && <p className="text-xs text-indigo-600 mt-1 leading-relaxed">{s9.sentiment_summary}<AiTag /></p>}
                  </div>
                )}
                {!s9.contrarian_signal && s9.sentiment_summary && (
                  <p className="text-xs text-slate-600 mt-3 leading-relaxed italic">{s9.sentiment_summary}<AiTag /></p>
                )}
              </div>
            </div>
          </Slide>

          {/* ── S4: BUSINESS OVERVIEW ── */}
          <Slide id="s4">
            <SlideHeader title="Business Overview" n={4} />
            <div className="p-7">

              {/* Company description — FMP profile */}
              {(() => {
                const prof = full?.company_profile;
                if (!prof?.description) return null;
                return (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {prof.image && <img src={prof.image} alt={prof.name ?? ticker} className="h-8 w-8 object-contain rounded" />}
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">About {prof.name ?? ticker}</p>
                      <SourceBadge src="Financial Modeling Prep" href={fmpHref} />
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{prof.description}</p>
                  </div>
                );
              })()}

              {/* Key company facts — FMP */}
              {(() => {
                const prof = full?.company_profile;
                const facts = [
                  { l: "Sector", v: (() => { const s = prof?.sector ?? adhoc.sector; return s && s !== "N/A" && s !== "NA" ? s : null; })() },
                  { l: "Industry", v: prof?.industry ?? null },
                  { l: "CEO", v: prof?.ceo ?? mgmt.ceo ?? null },
                  { l: "Employees", v: prof?.employees ? Number(prof.employees).toLocaleString() : null },
                  { l: "Exchange", v: prof?.exchange ?? null },
                  { l: "IPO Date", v: prof?.ipo_date ?? null },
                  { l: "HQ", v: bg.hq ?? prof?.country ?? null },
                  { l: "Website", v: prof?.website ?? null },
                ].filter(f => f.v);
                if (!facts.length) return null;
                const isApi = !!prof;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {facts.map(f => (
                      <div key={f.l} className="p-3 border border-slate-100 rounded-xl bg-slate-50">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">{f.l} {isApi ? <SourceBadge src="Financial Modeling Prep" href={fmpHref} /> : <AiTag />}</p>
                        {f.l === "Website" && f.v
                          ? <a href={f.v} target="_blank" rel="noreferrer" className="font-semibold text-xs text-sky-600 hover:underline truncate block">{f.v.replace(/^https?:\/\//, "")}</a>
                          : <p className="font-semibold text-sm">{f.v}</p>}
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="grid grid-cols-5 gap-8">
              <div className="col-span-3">
                {!full?.company_profile?.description && bg.overview && <p className="text-sm text-slate-700 leading-relaxed mb-4">{bg.overview}<AiTag title="Company overview from LLM training knowledge" /></p>}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[{ l: "Moat Width", v: moat.moat || "—" }, { l: "Setup Type", v: s3s.setup_type || "—" }, { l: "Competition", v: mkt.competition_intensity || "—" }].filter(m => m.v && m.v !== "—").map(m => (
                    <div key={m.l} className="p-3 border border-slate-100 rounded-xl bg-slate-50">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">{m.l} <AiTag /></p>
                      <p className="font-semibold text-sm">{m.v}</p>
                    </div>
                  ))}
                </div>
                {mgmt.track_record && (
                  <div className="p-4 bg-[#EEF2F8] rounded-xl mb-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B2951] mb-2">Management Assessment <AiTag /></p>
                    <p className="text-xs text-slate-500">{mgmt.track_record}</p>
                    {mgmt.red_flags && <p className="text-xs text-red-600 mt-1">⚠ {mgmt.red_flags}</p>}
                  </div>
                )}
                {moat.competitive_advantages?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Competitive Advantages <AiTag /></p>
                    <ul className="space-y-1">
                      {moat.competitive_advantages.map((a: string) => (
                        <li key={a} className="text-xs text-slate-700 flex gap-2"><span className="text-amber-500 shrink-0">›</span>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="col-span-2">
                {(() => {
                  const apiSegs = pitch?.revenue_segments;
                  const aiSegs  = bg.revenue_segments;
                  if (apiSegs?.segments?.length) return (
                    <div className="mb-6">
                      <div className="flex items-center gap-1 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Revenue by Segment</p><SourceBadge src="Financial Modeling Prep" href={fmpHref} /></div>
                      <div className="space-y-3">
                        {apiSegs.segments.slice(0, 6).map(seg => (
                          <div key={seg.name}>
                            <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-700">{seg.name}</span><span className="font-mono text-slate-500">{seg.pct.toFixed(1)}%</span></div>
                            <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-[#1B2951] rounded-full" style={{ width: `${seg.pct}%` }} /></div>
                          </div>
                        ))}
                      </div>
                      {apiSegs.date && <p className="text-[9px] text-slate-400 mt-1">FY ending {apiSegs.date}</p>}
                    </div>
                  );
                  if (aiSegs?.length) return (
                    <div className="mb-6">
                      <div className="flex items-center gap-1 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Revenue by Segment</p><SourceBadge src="AI" /></div>
                      <div className="space-y-3">
                        {aiSegs.map((seg: any) => (
                          <div key={seg.segment}>
                            <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-700">{seg.segment}</span><span className="font-mono text-slate-500">{seg.weight_pct}%</span></div>
                            <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-[#1B2951] rounded-full" style={{ width: `${seg.weight_pct}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                  return null;
                })()}
                {(() => {
                  const apiGeo = pitch?.revenue_geo;
                  const aiGeo  = bg.geography_breakdown;
                  if (apiGeo?.segments?.length) return (
                    <div className="mb-5">
                      <div className="flex items-center gap-1 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Geographic Exposure</p><SourceBadge src="Financial Modeling Prep" href={fmpHref} /></div>
                      <div className="space-y-2">
                        {apiGeo.segments.slice(0, 6).map(g => (
                          <div key={g.name} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-600 w-28 shrink-0 truncate">{g.name}</span>
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full"><div className="h-1.5 bg-amber-400 rounded-full" style={{ width: `${g.pct}%` }} /></div>
                            <span className="font-mono w-10 text-right">{g.pct.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                      {apiGeo.date && <p className="text-[9px] text-slate-400 mt-1">FY ending {apiGeo.date}</p>}
                    </div>
                  );
                  if (aiGeo?.length) return (
                    <div className="mb-5">
                      <div className="flex items-center gap-1 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Geographic Exposure</p><SourceBadge src="AI" /></div>
                      <div className="space-y-2">
                        {aiGeo.map((g: any) => (
                          <div key={g.region} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-600 w-24 shrink-0">{g.region}</span>
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full"><div className="h-1.5 bg-amber-400 rounded-full" style={{ width: `${g.pct}%` }} /></div>
                            <span className="font-mono w-8 text-right">{g.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                  return null;
                })()}
                {moat.barriers_to_entry && (
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-blue-800 mb-1">Barriers to Entry <AiTag /></p>
                    <p className="text-xs text-blue-700 leading-relaxed">{moat.barriers_to_entry}</p>
                  </div>
                )}
              </div>
              </div>{/* end grid grid-cols-5 */}
            </div>{/* end p-7 */}
          </Slide>

          {/* ── SNEWS: LATEST NEWS ── */}
          {(pitch?.news?.length ?? 0) > 0 && (
          <Slide id="snews">
            <SlideHeader title="Latest News & Developments" n="news" />
            <div className="p-7">

              {/* LLM news synthesis */}
              {(newsSynthesis || newsLoading) && (
                <div className="mb-6 p-5 bg-[#EEF2F8] rounded-2xl border border-[#D1D9EC]">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B2951]">Analyst Intelligence Synthesis</p>
                    <SourceBadge src="Finnhub" />
                    <AiTag title="LLM synthesis of recent headlines — qualitative interpretation only" />
                  </div>
                  {newsLoading && !newsSynthesis
                    ? <p className="text-xs text-slate-400 animate-pulse">Analysing {pitch!.news.length} articles…</p>
                    : <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{newsSynthesis}</p>
                  }
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Past 30 days · {pitch!.news.length} articles</p>
                <SourceBadge src="Finnhub" />
              </div>
              <div className="space-y-5">
                {pitch!.news.map((n, i) => {
                  const date = new Date(n.datetime * 1000);
                  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <div key={i} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-4 mb-1.5">
                        <a href={n.url} target="_blank" rel="noreferrer"
                          className="text-sm font-semibold text-[#1B2951] hover:underline leading-snug flex-1">
                          {n.headline}
                        </a>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{dateStr}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mb-2">{n.source}</p>
                      {n.summary && <p className="text-xs text-slate-600 leading-relaxed">{n.summary}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </Slide>
          )}

          {/* ── S5: HISTORICAL FINANCIALS ── */}
          <Slide id="s5">
            <SlideHeader title="Historical Financials" n={5} />
            <div className="p-7">
              {(full?.income_statement?.length ?? 0) > 0 ? (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Income Statement — Annual (5yr)</p>
                    <SourceBadge src="Financial Modeling Prep" href={fmpHref} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#1B2951] text-white">
                          {["Year","Revenue","YoY%","Gross Mgn","EBITDA Mgn","Net Mgn","EPS"].map((h, i) => (
                            <th key={h} className={`px-3 py-2.5 font-semibold uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {full!.income_statement.map((row, i) => {
                          const prev = full!.income_statement[i + 1];
                          const revG = prev ? yoy(row.revenue, prev.revenue) : null;
                          return (
                            <tr key={row.date} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                              <td className="px-3 py-2.5 font-mono font-semibold">{row.year}{i === 0 ? " ★" : ""}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{fmtBn(row.revenue)}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{revG == null ? "—" : <span className={revG >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>{revG >= 0 ? "↑" : "↓"}{Math.abs(revG).toFixed(1)}%</span>}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{row.gross_margin != null ? fmtPct(row.gross_margin) : "—"}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{row.ebitda_margin != null ? fmtPct(row.ebitda_margin) : "—"}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{row.net_margin != null ? fmtPct(row.net_margin) : "—"}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{row.eps != null ? `$${row.eps.toFixed(2)}` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : fin.historical?.length > 0 ? (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Historical Financials</p>
                    <SourceBadge src="yfinance" href={yhooHref} />
                  </div>
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="bg-[#1B2951] text-white">{["Year","Revenue","EBITDA Mgn","Net Mgn"].map((h,i) => <th key={h} className={`px-3 py-2.5 font-semibold uppercase tracking-wide ${i===0?"text-left":"text-right"}`}>{h}</th>)}</tr></thead>
                    <tbody>{fin.historical.map((row: any, i: number) => (<tr key={row.year} className={i%2===0?"bg-slate-50":"bg-white"}><td className="px-3 py-2.5 font-mono font-semibold">{row.year}</td><td className="px-3 py-2.5 text-right font-mono">{fmtBn(row.revenue)}</td><td className="px-3 py-2.5 text-right font-mono">{row.ebitda&&row.revenue?`${((row.ebitda/row.revenue)*100).toFixed(1)}%`:"—"}</td><td className="px-3 py-2.5 text-right font-mono">{row.net_income&&row.revenue?`${((row.net_income/row.revenue)*100).toFixed(1)}%`:"—"}</td></tr>))}</tbody>
                  </table>
                </div>
              ) : null}

              {((pitch?.earnings_surprises?.length ?? 0) > 0 || (full?.analyst_estimates?.length ?? 0) > 0) && (
              <div className={`grid gap-6 ${(pitch?.earnings_surprises?.length ?? 0) > 0 && (full?.analyst_estimates?.length ?? 0) > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                {/* Earnings surprises */}
                {(pitch?.earnings_surprises?.length ?? 0) > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Earnings Surprise History</p><SourceBadge src="Finnhub" href={fhHref} /></div>
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="bg-indigo-900 text-white">{["Quarter","Est.","Actual","Beat/Miss"].map((h,i) => <th key={h} className={`px-3 py-2 font-semibold uppercase tracking-wide ${i===0?"text-left":"text-right"}`}>{h}</th>)}</tr></thead>
                      <tbody>{pitch!.earnings_surprises.slice(0, 5).map((e, i) => (<tr key={e.period} className={i%2===0?"bg-slate-50":"bg-white"}><td className="px-3 py-2 font-mono">{e.period}</td><td className="px-3 py-2 text-right font-mono">{e.estimate!=null?e.estimate.toFixed(2):"—"}</td><td className="px-3 py-2 text-right font-mono font-semibold">{e.actual!=null?e.actual.toFixed(2):"—"}</td><td className={`px-3 py-2 text-right font-mono font-bold ${(e.surprise_pct??0)>0?"text-green-600":(e.surprise_pct??0)<0?"text-red-500":"text-slate-400"}`}>{e.surprise_pct!=null?`${e.surprise_pct>=0?"+":""}${e.surprise_pct.toFixed(1)}%`:"—"}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}

                {/* FMP analyst estimates */}
                {(full?.analyst_estimates?.length ?? 0) > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Analyst Consensus Estimates</p><SourceBadge src="Financial Modeling Prep" href={fmpHref} /></div>
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="bg-slate-700 text-white">{["Quarter","Revenue Est.","EPS Est."].map((h,i) => <th key={h} className={`px-3 py-2 font-semibold uppercase tracking-wide ${i===0?"text-left":"text-right"}`}>{h}</th>)}</tr></thead>
                      <tbody>{full!.analyst_estimates.slice(0, 4).map((e, i) => (<tr key={e.date} className={i%2===0?"bg-slate-50":"bg-white"}><td className="px-3 py-2 font-mono">{e.date}</td><td className="px-3 py-2 text-right font-mono">{fmtBn(e.estimated_revenue_avg)}</td><td className="px-3 py-2 text-right font-mono">{e.estimated_eps_avg!=null?`$${e.estimated_eps_avg.toFixed(2)}`:"—"}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
              </div>
              )}
            </div>
          </Slide>

          {/* ── S6: VALUATION METRICS ── */}
          <Slide id="s6">
            <SlideHeader title="Valuation Metrics" n={6} />
            <div className="p-7 grid grid-cols-2 gap-7">
              <div>
                <div className="flex items-center gap-2 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Price Performance — 1yr Weekly</p><SourceBadge src="yfinance" href={yhooHref} /></div>
                <PriceChart candles={candles} />
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[["1m", s11.ret_1m], ["3m", s11.ret_3m], ["6m", s11.ret_6m]].map(([l, v]) => (
                    <div key={l as string} className="text-center p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-[9px] text-slate-400 uppercase">{l} Return</p>
                      <p className={`font-bold text-xs mt-0.5 font-mono ${v != null ? (Number(v) >= 0 ? "text-green-600" : "text-red-500") : ""}`}>{v != null ? `${(Number(v)*100).toFixed(1)}%` : "—"}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[["52w High", fmtPrice(s11.high_52w)], ["52w Low", fmtPrice(s11.low_52w)]].map(([l, v]) => (
                    <div key={l as string} className="text-center p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-[9px] text-slate-400 uppercase">{l}</p>
                      <p className="font-bold text-xs mt-0.5 font-mono">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                {pitch?.key_metrics && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Key Multiples (Latest)</p><SourceBadge src="Financial Modeling Prep" href={fmpHref} /></div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {[
                        { l: "EV/EBITDA",  v: pitch.key_metrics.ev_ebitda  != null ? `${fmtN(pitch.key_metrics.ev_ebitda)}x`  : "—" },
                        { l: "EV/Revenue", v: pitch.key_metrics.ev_revenue  != null ? `${fmtN(pitch.key_metrics.ev_revenue)}x`  : "—" },
                        { l: "FCF Yield",  v: pitch.key_metrics.fcf_yield   != null ? fmtPct(pitch.key_metrics.fcf_yield)        : "—" },
                        { l: "ROIC",       v: pitch.key_metrics.roic        != null ? fmtPct(pitch.key_metrics.roic)             : "—" },
                      ].map(m => (
                        <div key={m.l} className="text-center p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                          <p className="text-[9px] text-indigo-500 uppercase tracking-wider">{m.l}</p>
                          <p className="font-bold text-sm mt-0.5 text-indigo-800">{m.v}</p>
                        </div>
                      ))}
                    </div>
                    {pitch.key_metrics.date && <p className="text-[9px] text-slate-400">As of {pitch.key_metrics.date}</p>}
                  </div>
                )}

                {/* EV/EBITDA trend chart */}
                {evEbitdaTrend.length >= 2 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">EV/EBITDA Trend (5yr)</p><SourceBadge src="Financial Modeling Prep" href={fmpHref} /></div>
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={evEbitdaTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={30} tickFormatter={v => `${v}x`} />
                        <Tooltip contentStyle={{ fontSize: 10, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", borderRadius: 8 }} formatter={(v: any) => [`${v}x`, "EV/EBITDA"]} />
                        <Line type="monotone" dataKey="ev_ebitda" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* PEG analysis or secondary metrics */}
                {pegData ? (
                  <div className="p-4 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">PEG Ratio Analysis</p>
                      <SourceBadge src="yfinance" href={yhooHref} />
                      <SourceBadge src="Financial Modeling Prep" href={fmpHref} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[9px] text-slate-400 mb-0.5">P/E Ratio</p><p className="font-bold text-sm">{fmtN(pegData.pe)}x</p></div>
                      <div><p className="text-[9px] text-slate-400 mb-0.5">EPS Growth</p><p className="font-bold text-sm">{fmtN(pegData.epsGrowth)}%</p></div>
                      <div>
                        <p className="text-[9px] text-slate-400 mb-0.5">PEG</p>
                        <p className={`font-bold text-sm ${pegData.peg < 1 ? "text-green-600" : pegData.peg < 2 ? "text-amber-600" : "text-red-600"}`}>{fmtN(pegData.peg)}</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-2">{pegData.peg < 1 ? "PEG < 1 suggests undervalued relative to growth" : pegData.peg < 2 ? "PEG 1–2 is within fair value range" : "PEG > 2 suggests premium to growth rate"}</p>
                  </div>
                ) : (
                  /* Fill space with P/E vs peers + Net Debt/EBITDA when no PEG */
                  <div className="p-4 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Valuation vs Peers</p>
                      <SourceBadge src="yfinance" href={yhooHref} />
                      <SourceBadge src="Financial Modeling Prep" href={fmpHref} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {subjectPE != null && <div className="text-center p-3 bg-slate-50 rounded-xl"><p className="text-[9px] text-slate-400 mb-1">P/E (Subject)</p><p className="font-bold text-sm">{subjectPE.toFixed(1)}x</p></div>}
                      {peerAvgPE != null && (
                        <div className={`text-center p-3 rounded-xl ${subjectPE != null && subjectPE < peerAvgPE ? "bg-green-50" : "bg-amber-50"}`}>
                          <p className="text-[9px] text-slate-400 mb-1">Peer Avg P/E</p>
                          <p className={`font-bold text-sm ${subjectPE != null && subjectPE < peerAvgPE ? "text-green-700" : "text-amber-700"}`}>{peerAvgPE.toFixed(1)}x</p>
                        </div>
                      )}
                      {pitch?.key_metrics?.net_debt_ebitda != null && <div className="text-center p-3 bg-slate-50 rounded-xl"><p className="text-[9px] text-slate-400 mb-1">Net Debt/EBITDA</p><p className="font-bold text-sm">{fmtN(pitch.key_metrics.net_debt_ebitda)}x</p></div>}
                      {pitch?.key_metrics?.pb_ratio != null && <div className="text-center p-3 bg-slate-50 rounded-xl"><p className="text-[9px] text-slate-400 mb-1">P/Book</p><p className="font-bold text-sm">{fmtN(pitch.key_metrics.pb_ratio)}x</p></div>}
                    </div>
                    {subjectPE != null && peerAvgPE != null && (
                      <p className="text-[9px] text-slate-400 mt-3">
                        {ticker} P/E ({subjectPE.toFixed(1)}x) is {subjectPE < peerAvgPE ? "below" : "above"} peer average ({peerAvgPE.toFixed(1)}x) — trading at a {subjectPE < peerAvgPE ? "discount" : "premium"} to the peer group.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Slide>

          {/* ── S7: COMPETITIVE LANDSCAPE ── */}
          <Slide id="s7">
            <SlideHeader title="Competitive Landscape & Trading Comparables" n={7} />
            <div className="p-7">
              {comps.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{hasLivePE ? "Live Trading Multiples" : "Peer Group Financials"}</p>
                    <SourceBadge src={hasLivePE ? "yfinance" : "AI"} href={hasLivePE ? yhooHref : undefined} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#1B2951] text-white">
                          {["Company","Ticker","Revenue","P/E","P/S","EBITDA Mgn","Net Mgn","D/E"].map((h, i) => (
                            <th key={h} className={`px-3 py-2.5 font-semibold uppercase tracking-wide ${i<=1?"text-left":"text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comps.map((c, i) => (
                          <tr key={c.ticker} className={c.is_subject ? "bg-amber-50 border-l-4 border-amber-400" : i%2===0 ? "bg-slate-50" : "bg-white"}>
                            <td className="px-3 py-2.5 font-semibold">{c.company}{c.is_subject ? " ★" : ""}</td>
                            <td className="px-3 py-2.5 font-mono">{c.ticker}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{c.revenue_bn!=null?`$${c.revenue_bn.toFixed(1)}B`:"—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{(c as any).pe_ratio!=null?`${((c as any).pe_ratio as number).toFixed(1)}x`:"—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{(c as any).ps_ratio!=null?`${((c as any).ps_ratio as number).toFixed(1)}x`:"—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{c.ebitda_margin_pct!=null?`${c.ebitda_margin_pct.toFixed(1)}%`:"—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{c.net_margin_pct!=null?`${c.net_margin_pct.toFixed(1)}%`:"—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{c.de_ratio!=null?c.de_ratio.toFixed(2):"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">Source: yahoo-finance2 live market data. ★ = subject company.</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">No comparable data available.</p>
              )}
            </div>
          </Slide>

          {/* ── S8: VALUATION ANALYSIS ── */}
          <Slide id="s8">
            <SlideHeader title="Valuation Analysis" n={8} />
            <div className="p-7 grid grid-cols-2 gap-7">
              <div>
                <div className="flex items-center gap-1 mb-1"><p className="text-[9px] text-slate-400 uppercase tracking-wider">Methodology</p><AiTag /></div>
                <p className="text-2xl font-bold text-[#1B2951] mb-4">{s4.methodology || "—"}</p>
                <div className="flex items-center gap-1 mb-1"><p className="text-[9px] text-slate-400 uppercase tracking-wider">Near-term Upside</p><AiTag /></div>
                <p className="text-3xl font-bold text-green-600 mb-1">{s4.near_term_upside_pct || "—"}</p>
                <p className="text-xs text-slate-400">vs. peers: <span className="font-semibold text-slate-700 capitalize">{s4.cheap_vs_peers || "—"}</span></p>
                {/* Only show AI valuation text when we lack live peer P/E comparison */}
                {!subjectPE && (s4.implied_multiples || s4.narrative) && <p className="text-xs text-slate-600 leading-relaxed mt-4">{s4.implied_multiples || s4.narrative}<AiTag /></p>}
              </div>
              <div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Analyst Price Targets</p>
                      <SourceBadge src={pitch?.price_target ? "Finnhub" : "FMP"} href={pitch?.price_target ? fhHref : fmpHref} />
                    </div>
                    {bestPT ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[{l:"Low",v:fmtPrice(bestPT.low),cls:"text-red-600"},{l:"Median",v:fmtPrice(bestPT.median),cls:"text-amber-600"},{l:"High",v:fmtPrice(bestPT.high),cls:"text-green-600"}].map(m=>(
                            <div key={m.l} className="p-2 bg-slate-50 rounded-lg"><p className="text-[9px] text-slate-400 mb-1">{m.l}</p><p className={`text-sm font-bold font-mono ${m.cls}`}>{m.v}</p></div>
                          ))}
                        </div>
                        {bestPT.median && adhoc.current_price && (
                          <p className="text-[9px] text-slate-400 mt-2">Implied upside to median: <span className={`font-bold ${Number(ptExpectedReturn) >= 0 ? "text-green-600" : "text-red-600"}`}>{Number(ptExpectedReturn) >= 0 ? "+" : ""}{ptExpectedReturn}%</span></p>
                        )}
                      </>
                    ) : <p className="text-xs text-slate-400">Not available from Finnhub or FMP</p>}
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">P/E vs Peers</p>
                      <SourceBadge src="yfinance" href={yhooHref} />
                    </div>
                    {subjectPE != null && peerAvgPE != null ? (
                      <div>
                        <div className="grid grid-cols-2 gap-2 text-center mb-2">
                          <div className="p-2 bg-amber-50 rounded-lg border border-amber-100"><p className="text-[9px] text-amber-600 mb-1">{ticker} P/E</p><p className="text-lg font-bold font-mono text-amber-700">{subjectPE.toFixed(1)}x</p></div>
                          <div className="p-2 bg-slate-50 rounded-lg"><p className="text-[9px] text-slate-400 mb-1">Peer Avg</p><p className="text-lg font-bold font-mono">{peerAvgPE.toFixed(1)}x</p></div>
                        </div>
                        <p className="text-[9px] text-slate-400">{ticker} trades at a <span className={`font-bold ${subjectPE < peerAvgPE ? "text-green-600" : "text-amber-600"}`}>{subjectPE < peerAvgPE ? "discount" : "premium"}</span> to the {peerPEs.length}-stock peer group ({((subjectPE - peerAvgPE) / peerAvgPE * 100).toFixed(1)}%).</p>
                      </div>
                    ) : <p className="text-xs text-slate-400">Run analysis with comparables to see peer comparison.</p>}
                  </div>
                </div>
                {pitch?.recommendation_trend && (
                  <div className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Analyst Rec. Trend</p><SourceBadge src="Finnhub" href={fhHref} /></div>
                    <RecBar trend={pitch.recommendation_trend} />
                  </div>
                )}
              </div>
            </div>
          </Slide>

          {/* ── S9: RISK & MITIGATION ── */}
          <Slide id="s9">
            <SlideHeader title="Risk & Mitigation" n={9} />
            <div className="p-7">
              {s7.key_risks?.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Risk Register</p><AiTag title="Risk factors identified by committee AI" /></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#1B2951] text-white">
                          {["#","Risk","Category","Likelihood","Impact","Mitigation Context"].map((h,i)=>(
                            <th key={h} className={`px-3 py-2.5 font-semibold uppercase tracking-wide ${i<=1?"text-left":"text-center"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(s7.key_risks as string[]).slice(0, 5).map((risk: string, i: number) => {
                          const likelihood = riskLevels[Math.min(i, 2)];
                          const impact = riskLevels[Math.min(i, 2)];
                          const lColor = likelihood === "High" ? "text-red-600" : likelihood === "Medium" ? "text-amber-600" : "text-green-600";
                          const cat = /regulat|legal|compli/i.test(risk) ? "Regulatory" : /compet|market|share/i.test(risk) ? "Competitive" : /debt|cash|financ/i.test(risk) ? "Financial" : /macro|rate|gdp|fx/i.test(risk) ? "Macro" : "Execution";
                          const mitigation = i === 0 && s5.downside_scenario ? s5.downside_scenario : i === 1 && s13.bear?.assumptions ? s13.bear.assumptions : s12.geographic_concentration ? `Geographic risk: ${s12.geographic_concentration}` : "Monitor via pipeline re-run";
                          return (
                            <tr key={i} className={i%2===0?"bg-slate-50":"bg-white"}>
                              <td className="px-3 py-2.5 font-mono text-slate-400">{i+1}</td>
                              <td className="px-3 py-2.5 text-slate-700 max-w-[180px]">{risk}</td>
                              <td className="px-3 py-2.5 text-center"><span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-semibold">{cat}</span></td>
                              <td className={`px-3 py-2.5 text-center font-bold ${lColor}`}>{likelihood}</td>
                              <td className={`px-3 py-2.5 text-center font-bold ${lColor}`}>{impact}</td>
                              <td className="px-3 py-2.5 text-slate-500 text-[10px] max-w-[200px]">{mitigation}<AiTag /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Risk Metrics</p><SourceBadge src="yfinance" href={yhooHref} /></div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ["Beta", fmtN(s12.beta)],
                      ["Debt/Equity", fmtN(s12.debt_to_equity)],
                      ["Current Ratio", fmtN(s12.current_ratio)],
                      ["Liquidity Risk", s12.liquidity_risk || "—"],
                    ].map(([l,v])=>(
                      <div key={l as string} className="p-3 border border-slate-200 rounded-xl bg-slate-50 text-center">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">{l}</p>
                        <p className="font-bold text-sm capitalize">{v}</p>
                      </div>
                    ))}
                  </div>
                  {s12.data_conflicts && Array.isArray(s12.data_conflicts) && s12.data_conflicts.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider mb-1">Data Conflict Alert</p>
                      {s12.data_conflicts.slice(0, 2).map((c: any, i: number) => (
                        <p key={i} className="text-[10px] text-amber-700 leading-relaxed">{c.metric}: yfinance {fmtBn(c.yfinance_value)} vs SEC EDGAR {fmtBn(c.sec_edgar_value)} ({c.diff_pct?.toFixed(1)}% diff)</p>
                      ))}
                    </div>
                  )}
                </div>
                {(pitch?.insider_trades?.length ?? 0) > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Insider Transactions</p><SourceBadge src="Financial Modeling Prep" href={fmpHref} /></div>
                    <div className="flex gap-3 mb-2 text-xs">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{buyInsiders.length} Buys</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{sellInsiders.length} Sales</span>
                    </div>
                    <div className="space-y-1.5">
                      {pitch!.insider_trades.slice(0, 4).map((t, i) => {
                        const isBuy = t.disposition === "A" || /buy|acquire/i.test(t.transaction_type);
                        return (
                          <div key={i} className={`flex justify-between items-center p-2.5 rounded-lg border text-xs ${isBuy?"bg-green-50 border-green-200":"bg-red-50 border-red-200"}`}>
                            <div><p className="font-semibold text-slate-700">{t.name}</p><p className="text-slate-400 text-[9px]">{t.role?.replace("officer: ", "")}</p></div>
                            <div className="text-right"><p className={`font-bold font-mono ${isBuy?"text-green-700":"text-red-600"}`}>{isBuy?"+":" −"}{t.shares?.toLocaleString()} sh</p><p className="text-slate-400 text-[9px]">{t.date}{t.price?` @ $${Number(t.price).toFixed(2)}`:""}</p></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Slide>

          {/* ── S10: TECHNICAL ANALYSIS ── */}
          <Slide id="s10">
            <SlideHeader title="Technical Analysis" n={10} />
            <div className="p-7">
              <div className="mb-5"><CandlestickChart ticker={ticker} /></div>
              <div className="flex items-start gap-6 mb-4 flex-wrap">
                <RSIGauge value={s8t.rsi_14} />
                {(s8t.support != null || resistanceLevel != null) && (
                  <div className="flex-1 min-w-[160px] bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Support / Resistance</p>
                    <div className="space-y-2">
                      {resistanceLevel != null && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-red-500">Resistance{s8t.resistance == null ? " (52w High)" : ""}</span>
                          <span className="text-xs font-mono text-red-500">{fmtPrice(resistanceLevel)}</span>
                        </div>
                      )}
                      {s8t.support != null && resistanceLevel != null && <div className="w-full h-px bg-slate-200" />}
                      {s8t.support != null && <div className="flex justify-between"><span className="text-[10px] text-green-600">Support</span><span className="text-xs font-mono text-green-600">{fmtPrice(s8t.support)}</span></div>}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-6">
                <KV label="RSI (14)" value={fmtN(s8t.rsi_14)} />
                <KV label="Trend" value={s8t.trend} />
                <KV label="MACD Signal" value={s8t.macd_signal} />
                <KV label="Forward Bias" value={s8t.forward_bias} />
                <KV label="BB Position" value={s8t.bb_position} />
                <KV label="Chart Pattern" value={s8t.chart_pattern} />
                <KV label="ATR %" value={fmtPctRaw(s8t.atr_pct)} />
                <KV label="OBV Trend" value={s8t.obv_trend} />
                <KV label="Mean Reversion" value={fmtN(s8t.mean_reversion_score)} />
                <KV label="Quant Score" value={fmtN(s8t.quant_score, 0)} />
              </div>
              {s8t.quant_summary && <p className="text-xs text-slate-500 mt-3 italic">{s8t.quant_summary}</p>}
            </div>
          </Slide>

          {/* ── S11: INDUSTRY & MARKET ── */}
          <Slide id="s11">
            <SlideHeader title="Industry & Market Analysis" n={11} />
            <div className="p-7">
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="col-span-2 bg-[#EEF2F8] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-[#1B2951]">Total Addressable Market</p><AiTag /></div>
                  <p className="text-sm text-slate-700 leading-relaxed">{mkt.tam_usd || "—"}</p>
                  {mkt.macro_factors && <p className="text-xs text-slate-500 mt-3 leading-relaxed">{mkt.macro_factors}</p>}
                </div>
                <div className="space-y-3">
                  {[{ l: "Expected CAGR", v: mkt.growth_rate || "—", src: "AI" }, { l: "Competition", v: mkt.competition_intensity || "—", src: "AI" }, { l: "Revenue CAGR 3yr", v: (s3s.checklist || []).find((c: any) => c.item === "revenue_cagr_3yr")?.detail ? `${(s3s.checklist || []).find((c: any) => c.item === "revenue_cagr_3yr").detail}%` : "—", src: "yfinance" }].map(m => (
                    <div key={m.l} className="p-4 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-1 mb-1"><p className="text-[9px] text-slate-400 uppercase tracking-wider">{m.l}</p><SourceBadge src={m.src} href={m.src==="yfinance"?yhooHref:undefined} /></div>
                      <p className="font-bold text-xl text-[#1B2951]">{m.v}</p>
                    </div>
                  ))}
                </div>
              </div>
              {mkt.sector_trends && (
                <div className="p-4 border border-slate-100 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-2 mb-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Key Sector Trends</p><AiTag /></div>
                  <p className="text-sm text-slate-700 leading-relaxed">{mkt.sector_trends}</p>
                </div>
              )}
            </div>
          </Slide>

          {/* ── S12: CATALYSTS & TIMING ── */}
          <Slide id="s12">
            <SlideHeader title="Catalysts & Entry Timing" n={12} />
            <div className="p-7 grid grid-cols-2 gap-7">
              <div>
                <div className="flex items-center gap-2 mb-4"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Technical Setup</p><SourceBadge src="yfinance OHLCV" href={yhooHref} /></div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { l: "RSI (14)", v: fmtN(s8t.rsi_14) },
                    { l: "MACD Signal", v: s8t.macd_signal || "—" },
                    { l: "Trend", v: s8t.trend || "—" },
                    { l: "Entry Verdict", v: s5.entry_verdict || "—" },
                    { l: "Support", v: fmtPrice(s8t.support) },
                    { l: resistanceLevel && s8t.resistance == null ? "Resistance (52w H)" : "Resistance", v: fmtPrice(resistanceLevel) },
                  ].map(m => (
                    <div key={m.l} className="p-3 border border-slate-100 rounded-xl bg-slate-50"><p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">{m.l}</p><p className="font-bold text-sm capitalize">{m.v}</p></div>
                  ))}
                </div>
                {s5.narrative && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-1"><p className="text-xs font-semibold text-slate-600">Macro & Timing Context</p><AiTag /></div>
                    <p className="text-xs text-slate-600 leading-relaxed">{s5.narrative}</p>
                  </div>
                )}
              </div>
              <div>
                {parsedCatalysts.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Near-Term Catalysts</p><AiTag /></div>
                    <div className="space-y-3">
                      {parsedCatalysts.slice(0, 3).map((cat, i) => {
                        const contextNote = i === 0 && quarters.length > 0 ? `Analyst est: Revenue ${fmtBn(quarters[0]?.revenue)}, EPS ${fmtN(quarters[0]?.net_income, 2)}` : null;
                        return (
                          <div key={cat} className="p-4 bg-green-50 border border-green-200 rounded-xl">
                            <div className="flex gap-3 items-start">
                              <span className="w-5 h-5 rounded-full bg-green-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                              <div><p className="text-xs font-bold text-green-800 mb-1">{cat}</p>{contextNote && <p className="text-[10px] text-green-700">{contextNote}</p>}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(pitch?.news?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Recent Headlines</p>
                    <p className="text-xs text-slate-500">See <a href="#snews" className="text-sky-600 hover:underline">Latest News section</a> for full articles with summaries.</p>
                  </div>
                )}
              </div>
            </div>
          </Slide>

          {/* ── S13: INSTITUTIONAL ACTIVITY ── */}
          <Slide id="s13">
            <SlideHeader title="Institutional Activity" n={13} />
            <div className="p-7">
              {(s10.institutional_pct != null || s10.insider_pct != null) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {s10.institutional_pct != null && (<div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center"><p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Institutional</p><p className="text-lg font-bold font-mono text-blue-600">{Number(s10.institutional_pct).toFixed(1)}%</p></div>)}
                  {s10.insider_pct != null && (<div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center"><p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Insider</p><p className="text-lg font-bold font-mono text-slate-700">{Number(s10.insider_pct).toFixed(1)}%</p></div>)}
                </div>
              )}
              {Array.isArray(s10.major_holders) && s10.major_holders.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Major Holders <AiTag title="From LLM training knowledge — verify with SEC 13F filings" /></p>
                  <div className="space-y-1">
                    {(s10.major_holders as any[]).slice(0, 6).map((h: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                        <span className="text-slate-600">{h.name ?? h}</span>
                        {h.pct != null && <span className="font-mono font-semibold">{Number(h.pct).toFixed(1)}%</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(s10.convergence_signals) && s10.convergence_signals.length > 0 && (
                <div className="space-y-2">
                  {(s10.convergence_signals as any[]).map((c: any, i: number) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-3 text-xs text-slate-700">
                      <span className="font-bold">{c.fund ?? c.institution}</span>
                      {c.action && <span className="ml-2 text-slate-400">{c.action}</span>}
                      {c.shares && <span className="ml-2 font-mono">{c.shares} shares</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Slide>

          {/* ── S14: SCENARIO ANALYSIS ── */}
          <Slide id="s14">
            <SlideHeader title="Scenario Analysis" n={14} />
            <div className="p-7">
              {/* Analyst consensus scenarios — real data from Finnhub/FMP */}
              {bestPT && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Analyst Consensus Scenarios</p>
                    <SourceBadge src={pitch?.price_target ? "Finnhub" : "FMP"} href={pitch?.price_target ? fhHref : fmpHref} />
                  </div>
                  {(() => {
                    const bearPT = bestPT.low ?? 0;
                    const basePT = bestPT.median ?? 0;
                    const bullPT = bestPT.high ?? 0;
                    const price  = adhoc.current_price ?? 0;
                    const chartData = [
                      { name: "Bear (PT Low)",    price: bearPT, color: "#EF4444" },
                      { name: "Base (PT Median)", price: basePT, color: "#F59E0B" },
                      { name: "Bull (PT High)",   price: bullPT, color: "#10B981" },
                    ];
                    const minVal = Math.min(price * 0.93, bearPT * 0.95);
                    return (
                      <>
                        <ResponsiveContainer width="100%" height={100}>
                          <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 80, top: 4, bottom: 4 }}>
                            <XAxis type="number" domain={[minVal, "auto"]} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => `$${v.toFixed(0)}`} />
                            <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} width={76} />
                            <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Price Target"]} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }} />
                            <Bar dataKey="price" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: any) => `$${Number(v).toFixed(0)}`, fill: "#6b7280", fontSize: 11 }}>
                              {chartData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.8} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          {[{l:"Bear (PT Low)",v:bearPT,cls:"text-red-600",bg:"bg-red-50 border-red-200"},{l:"Base (PT Median)",v:basePT,cls:"text-amber-600",bg:"bg-amber-50 border-amber-200"},{l:"Bull (PT High)",v:bullPT,cls:"text-green-600",bg:"bg-green-50 border-green-200"}].map(m=>(
                            <div key={m.l} className={`p-4 rounded-xl border text-center ${m.bg}`}>
                              <p className="text-[9px] text-slate-500 mb-1">{m.l}</p>
                              <p className={`text-xl font-bold font-mono ${m.cls}`}>${m.v.toFixed(0)}</p>
                              {price > 0 && <p className={`text-[10px] mt-1 font-semibold ${m.v >= price ? "text-green-600" : "text-red-600"}`}>{m.v >= price ? "+" : ""}{(((m.v - price) / price) * 100).toFixed(1)}%</p>}
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* AI agent model scenarios */}
              <div className="mb-2 flex items-center gap-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Agent Model Scenarios</p>
                <AiTag title="AI-synthesised — not analyst forecasts" />
              </div>
              {(s13.bull?.price_target || s13.base?.price_target || s13.bear?.price_target) && !bestPT && (() => {
                const chartData = [
                  { name: "Bear", price: s13.bear?.price_target ?? 0, color: "#EF4444" },
                  { name: "Base", price: s13.base?.price_target ?? 0, color: "#F59E0B" },
                  { name: "Bull", price: s13.bull?.price_target ?? 0, color: "#10B981" },
                ];
                const minVal = Math.min(...chartData.map(d => d.price)) * 0.95;
                return (
                  <div className="mb-5">
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 60, top: 4, bottom: 4 }}>
                        <XAxis type="number" domain={[minVal, "auto"]} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => `$${v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} width={36} />
                        <Tooltip formatter={(v: any) => [`$${v}`, "Target"]} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="price" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: any) => `$${v}`, fill: "#6b7280", fontSize: 11 }}>
                          {chartData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.7} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[{key:"bull",label:"Bull Case",hdr:"bg-green-700",txt:"text-green-700",bg:"bg-green-50",border:"border-green-200"},{key:"base",label:"Base Case",hdr:"bg-amber-500",txt:"text-amber-700",bg:"bg-amber-50",border:"border-amber-200"},{key:"bear",label:"Bear Case",hdr:"bg-red-700",txt:"text-red-700",bg:"bg-red-50",border:"border-red-200"}].map(({key,label,hdr,txt,bg:sbg,border})=>{
                  const sc = s13[key]; if(!sc) return null;
                  return (
                    <div key={key} className={`rounded-2xl overflow-hidden border ${border}`}>
                      <div className={`${hdr} text-white px-5 py-3 flex justify-between items-center`}><span className="text-xs font-bold uppercase tracking-widest">{label}</span><span className="text-xs font-mono opacity-80">{sc.probability}% prob.</span></div>
                      <div className={`${sbg} p-5`}>
                        <p className={`text-3xl font-bold mb-1 font-mono ${txt}`}>{fmtPrice(sc.price_target)}</p>
                        <p className="text-sm font-semibold text-slate-600 mb-3">{sc.upside_pct?`+${sc.upside_pct}% upside`:sc.downside_pct?`-${sc.downside_pct}% downside`:""}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{sc.assumptions||sc.catalyst||""}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {s13.bull && s13.base && s13.bear && weightedReturn && (
                <div className="border border-slate-200 rounded-xl p-4 max-w-sm">
                  <div className="flex items-center gap-2 mb-3"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Probability-Weighted Return</p><AiTag /></div>
                  <div className="space-y-2">
                    {[{l:"Bull",prob:s13.bull.probability,ret:s13.bull.upside_pct,sign:1,cls:"text-green-600"},{l:"Base",prob:s13.base.probability,ret:s13.base.upside_pct,sign:1,cls:"text-amber-600"},{l:"Bear",prob:s13.bear.probability,ret:s13.bear.downside_pct,sign:-1,cls:"text-red-600"}].map(({l,prob,ret,sign,cls})=>(
                      <div key={l} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 w-10">{l}</span>
                        <span className="text-slate-400 w-12 text-right">{prob}%</span>
                        <span className="text-slate-400 w-4 text-center">×</span>
                        <span className={`${cls} font-mono w-16 text-right`}>{sign>0?"+":"-"}{ret??0}%</span>
                        <span className="text-slate-400 w-4 text-center">=</span>
                        <span className="font-mono font-semibold text-right w-14">{((prob/100)*(ret??0)*sign).toFixed(1)}%</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-200 flex justify-between text-xs font-bold">
                      <span className="text-slate-700">Expected Return</span>
                      <span className={`font-mono text-base ${Number(weightedReturn)>=0?"text-green-600":"text-red-600"}`}>{Number(weightedReturn)>=0?"+":""}{weightedReturn}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Slide>

          {/* ── S15: SENTIMENT ── */}
          <Slide id="s15">
            <SlideHeader title="Sentiment" n={15} />
            <div className="p-7 grid grid-cols-2 gap-x-8">
              <div>
                <KV label="Analyst Consensus" value={s9.analyst_consensus} />
                <KV label="News Tone" value={s9.news_tone} />
                <KV label="Short Interest" value={s9.short_interest_pct != null ? `${s9.short_interest_pct}%` : "—"} />
                <KV label="Upgrade Momentum" value={s9.upgrade_momentum} />
              </div>
              <div>
                <KV label="Contrarian Signal" value={s9.contrarian_signal == null ? "—" : s9.contrarian_signal ? "Yes" : "No"} color={s9.contrarian_signal ? "#10B981" : undefined} />
                <KV label="Retail Euphoria" value={s9.retail_euphoria == null ? "—" : s9.retail_euphoria ? "Yes" : "No"} color={s9.retail_euphoria ? "#EF4444" : undefined} />
                <KV label="Sentiment Score" value={fmtN(s9.sentiment_score, 0)} />
              </div>
              {s9.sentiment_summary && <p className="col-span-2 text-xs text-slate-500 mt-3 italic">{s9.sentiment_summary}<AiTag /></p>}
            </div>
          </Slide>

          {/* ── S16: SETUP CHECKLIST ── */}
          <Slide id="s16">
            <SlideHeader title="Setup Checklist" n={16} />
            <div className="p-7">
              {s3s.setup_type && <p className="text-xs text-blue-600 font-bold mb-3">Setup: {s3s.setup_type}</p>}
              <CheckList items={s3s.checklist ?? []} useDetail />
            </div>
          </Slide>

          {/* ── S17: RECOMMENDATION ── */}
          <Slide id="s17">
            <SlideHeader title="Investment Recommendation" n={17} />
            <div>
              <div className="bg-[#1B2951] text-white px-8 py-7 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-blue-300 uppercase tracking-[0.15em] mb-2">Final Recommendation</p>
                  <p className="text-6xl font-bold tracking-tight">{direction.replace(/_/g, " ")}</p>
                  <p className="text-blue-300 mt-2 text-sm">{adhoc.company_name !== ticker ? adhoc.company_name : ticker} · {adhoc.sector || "Equity"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-300 uppercase tracking-widest mb-1">Conviction Score</p>
                  <p className="text-6xl font-bold">{conviction}<span className="text-2xl text-blue-300">/100</span></p>
                  <div className="w-48 h-2.5 bg-white/20 rounded-full overflow-hidden mt-3">
                    <div className={`h-2.5 rounded-full ${convBar(conviction)}`} style={{ width: `${conviction}%` }} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="px-8 py-7">
                  <div className="flex items-center gap-1 mb-2">
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest">Expected Return (12m)</p>
                    {ptExpectedReturn ? <SourceBadge src={pitch?.price_target ? "Finnhub" : "FMP"} href={pitch?.price_target ? fhHref : fmpHref} /> : <AiTag />}
                  </div>
                  <p className={`text-3xl font-bold ${ptExpectedReturn ? (Number(ptExpectedReturn) >= 0 ? "text-green-700" : "text-red-600") : "text-[#1B2951]"}`}>
                    {ptExpectedReturn ? `${Number(ptExpectedReturn) >= 0 ? "+" : ""}${ptExpectedReturn}%` : (adhoc.expected_return_12m ?? s7.expected_return_12m ?? "—")}
                  </p>
                  {ptExpectedReturn && bestPT?.median && (
                    <p className="text-[10px] text-slate-400 mt-1">vs analyst median PT of {fmtPrice(bestPT.median)} · current {fmtPrice(adhoc.current_price)}</p>
                  )}
                </div>
                <div className="px-8 py-7">
                  <div className="flex items-center gap-1 mb-2">
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest">Stop Loss Reference</p>
                    <SourceBadge src="yfinance" href={yhooHref} />
                  </div>
                  <p className="text-3xl font-bold text-[#1B2951]">
                    {s8t.support ? fmtPrice(s8t.support) : `−${s7.stop_loss_pct ?? "—"}%`}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {s8t.support ? `Technical support level — loss vs current: ${adhoc.current_price ? ((s8t.support - adhoc.current_price) / adhoc.current_price * 100).toFixed(1) : "—"}%` : "Pipeline estimate"}
                  </p>
                </div>
              </div>
            </div>
          </Slide>

          {/* ── S18: DATA RELIABILITY ── */}
          <Slide id="s18">
            <SlideHeader title="Data Reliability" n={18} />
            <div className="p-7">
              {(() => {
                const lvl = typeof s14.data_confidence === "string" ? s14.data_confidence : (s14.data_confidence as any)?.level ?? "medium";
                const color = lvl === "high" ? "#10B981" : lvl === "low" ? "#EF4444" : "#F59E0B";
                return (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-bold uppercase" style={{ color }}>{lvl} confidence</span>
                    <div className="flex gap-1">{[1,2,3].map(i => (<div key={i} className="w-8 h-1.5 rounded-full" style={{ background: i<=(lvl==="high"?3:lvl==="medium"?2:1)?color:"rgba(0,0,0,0.1)" }} />))}</div>
                  </div>
                );
              })()}
              {s14.confidence_reason && <p className="text-[11px] text-slate-500 leading-relaxed mb-4">{s14.confidence_reason}</p>}
              <div className="grid grid-cols-2 gap-x-8 mb-4">
                <KV label="Sources checked" value={s14.sources_count ?? "—"} />
                {s14.conflicts_count != null && <KV label="Data conflicts" value={s14.conflicts_count} color={s14.conflicts_count > 0 ? "#F59E0B" : "#10B981"} />}
                <KV label="Last Updated" value={s14.last_updated} />
                <KV label="Agents Run" value={(s14.agents_run as string[] ?? []).join(", ")} />
              </div>
              {Array.isArray(s14.sources) && s14.sources.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data Sources</p>
                  <div className="space-y-1.5">
                    {(s14.sources as any[]).filter(src => src.type !== "conflict").slice(0, 12).map((src: any, i: number) => {
                      const isLlm = src.type === "llm_knowledge";
                      return (
                        <div key={i} className="flex items-start gap-2 bg-slate-50 rounded-lg p-2">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${isLlm?"bg-amber-50 text-amber-600 border border-amber-200":"bg-sky-50 text-sky-600 border border-sky-200"}`}>{isLlm?"AI":"API"}</span>
                          <div><p className="text-[10px] font-bold text-slate-700">{src.field}</p><p className="text-[10px] text-slate-400">{src.source}</p></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Slide>

          {/* Footer */}
          <div className="text-center text-[11px] text-slate-400 py-4">
            <p className="font-mono">{ticker} · {adhoc.date} · Haz Capital Management · Full Equity Research</p>
            <p className="mt-1">Not financial advice. For informational purposes only.</p>
            <div className="flex justify-center gap-3 mt-2 flex-wrap print:hidden">
              {[{ label: "yfinance — Price, returns, technicals", isAI: false }, { label: "Finnhub — EPS surprises, analyst targets, news", isAI: false }, { label: "FMP — Income statement, segments, insider trades, key metrics", isAI: false }, { label: "AI — Narratives, thesis, scenarios, risk categorisation", isAI: true }].map(s => (
                <span key={s.label} className={`text-[9px] px-2 py-0.5 rounded border ${s.isAI?"bg-amber-50 text-amber-600 border-amber-200":"bg-sky-50 text-sky-600 border-sky-200"}`}>{s.label}</span>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
