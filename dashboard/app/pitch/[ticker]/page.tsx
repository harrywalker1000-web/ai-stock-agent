/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Report {
  ticker: string; company_name: string; sector: string;
  current_price: number; market_cap: number; date: string;
  direction: string; conviction: number; expected_return_12m: string;
  s2_company: any; s3_setup: any; s4_valuation: any; s5_timing: any;
  s6_thesis: any; s7_recommendation: any; s8_technical: any; s8_news: any;
  s9_sentiment: any; s10_institutional: any; s11_performance: any;
  s12_risk: any; s13_scenarios: any;
}

const fmtN = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : n.toFixed(d);

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;

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

const dirCls = (d: string) => {
  if (d === "BUY" || d === "LONG" || d === "ENTER_LONG") return "text-green-700 bg-green-50 border-green-200";
  if (d === "SELL" || d === "SHORT") return "text-red-700 bg-red-50 border-red-200";
  return "text-amber-700 bg-amber-50 border-amber-200";
};

function SH({ n, title, agent }: { n: number; title: string; agent?: string }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-4 pb-3 border-b border-slate-200">
      <span className="text-lg font-bold text-amber-500 w-6 shrink-0">{n}</span>
      <div className="flex-1">
        <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-widest">{title}</h2>
        {agent && <p className="text-xs text-slate-400 font-mono">{agent}</p>}
      </div>
    </div>
  );
}

function CS({ title, agent, note }: { title: string; agent: string; note?: string }) {
  return (
    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-semibold">
          COMING SOON
        </span>
        <span className="text-xs text-slate-400 font-mono">{agent}</span>
      </div>
      <p className="font-semibold text-sm text-slate-700">{title}</p>
      {note && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-bold text-lg capitalize">{value}</p>
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

  if (err)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-2 font-mono">No report found</p>
          <h2 className="text-3xl font-bold text-[#0F172A]">{ticker}</h2>
          <p className="text-slate-500 mt-2 text-sm max-w-xs">{err}</p>
          <a href="/pitch" className="mt-6 inline-block text-sm text-amber-600 hover:underline">
            ← Back to pitch generator
          </a>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-mono text-sm">Loading {ticker}…</p>
        </div>
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

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-white text-[#0F172A]">
      <div className="max-w-4xl mx-auto px-8 py-10 print:px-6 print:py-8">

        {/* Toolbar */}
        <div className="print:hidden flex items-center justify-between mb-8">
          <a href="/pitch" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
            ← All Pitches
          </a>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 bg-[#0F172A] text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors"
          >
            Export PDF
          </button>
        </div>

        {/* Cover */}
        <div className="border-b-2 border-[#0F172A] pb-8 mb-2">
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">
            Haz Capital Management · Investment Research
          </p>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-6xl font-bold">{ticker}</h1>
              {data.company_name !== ticker && (
                <p className="text-xl text-slate-500 mt-1">{data.company_name}</p>
              )}
              {data.sector && <p className="text-sm text-slate-400 mt-0.5">{data.sector}</p>}
            </div>
            <span className={`text-2xl font-bold px-6 py-3 border-2 rounded-2xl ${dirCls(data.direction)}`}>
              {data.direction.replace("_", " ")}
            </span>
          </div>
          <div className="flex flex-wrap gap-10 mt-6">
            {[
              ["Conviction", `${data.conviction}/100`],
              ["Expected Return (12m)", data.expected_return_12m],
              ["Current Price", fmtPrice(data.current_price)],
              ["Market Cap", fmtBn(data.market_cap)],
              ["Report Date", data.date],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-xs text-slate-400 uppercase tracking-wide">{l}</p>
                <p className="text-2xl font-bold mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 1. Investment Thesis */}
        <SH n={1} title="Investment Thesis" agent="Committee Agent" />
        <p className="text-sm text-slate-700 leading-relaxed">{s6.narrative || "—"}</p>

        {/* 2. Company Overview */}
        <SH n={2} title="Company Overview" agent="Fundamental Agent" />
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">{bg.overview || "—"}</p>
            <p className="text-sm"><span className="font-semibold">HQ:</span> <span className="text-slate-600">{bg.hq || "—"}</span></p>
            {bg.employees && (
              <p className="text-sm mt-1"><span className="font-semibold">Employees:</span> <span className="text-slate-600">{bg.employees.toLocaleString()}</span></p>
            )}
          </div>
          <div>
            {bg.revenue_segments?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Revenue Segments</p>
                <div className="space-y-2">
                  {bg.revenue_segments.map((seg: any) => (
                    <div key={seg.segment} className="flex items-center gap-2">
                      <div className="text-xs font-medium w-28 shrink-0 text-slate-700">{seg.segment}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${seg.weight_pct}%` }} />
                      </div>
                      <div className="text-xs text-slate-500 w-8 text-right font-mono">{seg.weight_pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bg.geography_breakdown?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Geography</p>
                <div className="space-y-1">
                  {bg.geography_breakdown.map((g: any) => (
                    <div key={g.region} className="flex justify-between text-sm">
                      <span className="text-slate-600">{g.region}</span>
                      <span className="font-mono font-medium">{g.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Market Opportunity */}
        <SH n={3} title="Market Opportunity" agent="Sector Agent" />
        <div className="grid grid-cols-2 gap-4">
          <Metric label="TAM / Market Size" value={mkt.tam_usd || "—"} />
          <Metric label="Expected CAGR" value={mkt.growth_rate || "—"} />
          <Metric label="Competition Intensity" value={mkt.competition_intensity || "—"} />
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Sector Trends</p>
            <p className="text-sm text-slate-700 leading-relaxed">{mkt.sector_trends || "—"}</p>
          </div>
        </div>

        {/* 4. Financial Performance */}
        <SH n={4} title="Financial Performance" agent="Fundamental Agent" />
        {fin.historical?.length > 0 && (
          <table className="w-full text-sm mb-5 border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                {["Year", "Revenue", "EBITDA", "Net Income"].map((h) => (
                  <th key={h} className="text-right first:text-left py-2 font-semibold text-slate-400 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fin.historical.map((row: any) => (
                <tr key={row.year} className="border-b border-slate-100">
                  <td className="py-2 font-mono font-semibold">{row.year}</td>
                  <td className="py-2 text-right font-mono">{fmtBn(row.revenue)}</td>
                  <td className="py-2 text-right font-mono">{fmtBn(row.ebitda)}</td>
                  <td className="py-2 text-right font-mono">{fmtBn(row.net_income)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap gap-6">
          {[
            ["1m Return", fmtPct(s11.ret_1m)],
            ["3m Return", fmtPct(s11.ret_3m)],
            ["6m Return", fmtPct(s11.ret_6m)],
            ["52w High", fmtPrice(s11.high_52w)],
            ["52w Low", fmtPrice(s11.low_52w)],
            ["vs 52w High", s11.pct_from_high != null ? `${s11.pct_from_high}%` : "—"],
          ].map(([l, v]) => (
            <div key={l as string}>
              <p className="text-xs text-slate-400 uppercase tracking-wide">{l}</p>
              <p className="text-base font-semibold mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        {/* 5. Competitive Landscape */}
        <SH n={5} title="Competitive Landscape" agent="Fundamental Agent" />
        {comps.filter((c) => c.revenue_bn != null || c.gross_margin_pct != null).length > 0 ? (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                {["Ticker", "Revenue", "Gross Mgn", "EBITDA Mgn", "Net Mgn", "D/E"].map((h) => (
                  <th key={h} className="text-right first:text-left py-2 font-semibold text-slate-400 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.ticker} className={`border-b border-slate-100 ${c.ticker === ticker ? "bg-amber-50 font-semibold" : ""}`}>
                  <td className="py-2 font-mono text-sm">{c.ticker}</td>
                  <td className="py-2 text-right font-mono">{c.revenue_bn != null ? `$${c.revenue_bn}B` : "—"}</td>
                  <td className="py-2 text-right font-mono">{c.gross_margin_pct != null ? `${c.gross_margin_pct}%` : "—"}</td>
                  <td className="py-2 text-right font-mono">{c.ebitda_margin_pct != null ? `${c.ebitda_margin_pct}%` : "—"}</td>
                  <td className="py-2 text-right font-mono">{c.net_margin_pct != null ? `${c.net_margin_pct}%` : "—"}</td>
                  <td className="py-2 text-right font-mono">{c.de_ratio ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">No comparable data available for this ticker.</p>
        )}

        {/* 6. Management & Moat */}
        <SH n={6} title="Management Quality & Moat" agent="Fundamental Agent + News Agent" />
        <div className="grid grid-cols-2 gap-8">
          <div>
            {mgmt.ceo && <p className="text-sm text-slate-700 mb-3"><span className="font-semibold">CEO: </span>{mgmt.ceo}</p>}
            {mgmt.track_record && <p className="text-sm text-slate-700 mb-2"><span className="font-semibold">Track Record: </span>{mgmt.track_record}</p>}
            {mgmt.red_flags && <p className="text-sm text-red-600"><span className="font-semibold">Red Flags: </span>{mgmt.red_flags}</p>}
          </div>
          <div>
            {moat.moat && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Moat Width</p>
                <p className="font-bold text-xl mt-0.5">{moat.moat}</p>
              </div>
            )}
            {moat.competitive_advantages?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Competitive Advantages</p>
                <ul className="space-y-1">
                  {moat.competitive_advantages.map((a: string) => (
                    <li key={a} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-amber-500 shrink-0">→</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {moat.barriers_to_entry && (
              <p className="text-sm text-slate-600"><span className="font-semibold">Barriers: </span>{moat.barriers_to_entry}</p>
            )}
          </div>
        </div>

        {/* 7. Setup, Timing & Catalysts */}
        <SH n={7} title="Setup, Timing & Catalysts" agent="Quant Agent + Macro Agent" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Metric label="Setup Type" value={s3.setup_type || "—"} />
          <Metric label="Entry Verdict" value={s5.entry_verdict || "—"} />
          <Metric label="Macro Regime" value={s5.macro_context?.split(".")[0] || "—"} />
        </div>
        {s5.narrative && <p className="text-sm text-slate-700 leading-relaxed">{s5.narrative}</p>}

        {/* 8. Valuation */}
        <SH n={8} title="Valuation" agent="Fundamental Agent" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Metric label="Methodology" value={s4.methodology || "—"} />
          <Metric label="Near-term Upside" value={s4.near_term_upside_pct || "—"} />
          <Metric label="vs. Peers" value={s4.cheap_vs_peers || "—"} />
        </div>
        {s4.narrative && <p className="text-sm text-slate-700 leading-relaxed mb-4">{s4.narrative}</p>}
        <div className="grid grid-cols-2 gap-4">
          <CS title="WACC & DCF Model" agent="Fundamental Agent" note="Discounted cash flow with WACC derivation, terminal value, and sensitivity table across discount rates." />
          <CS title="Historical Multiple Analysis" agent="Quant Agent" note="P/E, EV/EBITDA, P/S over 3 years vs. sector median — the 'why now' entry chart." />
        </div>

        {/* 9. Technical Analysis */}
        <SH n={9} title="Technical Analysis" agent="Quant Agent" />
        <div className="grid grid-cols-4 gap-4 mb-4">
          {[
            ["RSI (14)", fmtN(s8t.rsi_14)],
            ["MACD", s8t.macd_signal || "—"],
            ["Trend", s8t.trend || "—"],
            ["Quant Score", `${s8t.quant_score ?? "—"}/100`],
          ].map(([l, v]) => (
            <Metric key={l as string} label={l as string} value={v as string} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Metric label="Support" value={fmtPrice(s8t.support)} />
          <Metric label="Resistance" value={fmtPrice(s8t.resistance)} />
        </div>
        {s8t.quant_summary && <p className="text-sm text-slate-700 leading-relaxed">{s8t.quant_summary}</p>}

        {/* 10. Sentiment & Institutional */}
        <SH n={10} title="Sentiment & Institutional Activity" agent="Institutional Agent + News Agent" />
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="flex flex-wrap gap-6 mb-4">
              {[
                ["Analyst Consensus", (s9.analyst_consensus || s10.analyst_consensus || "—") as string],
                ["Sentiment Score", `${s9.sentiment_score ?? "—"}/100`],
                ["Short Interest", `${s9.short_interest_pct ?? "—"}%`],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">{l}</p>
                  <p className="font-semibold text-base mt-0.5 capitalize">{v}</p>
                </div>
              ))}
            </div>
            {s9.sentiment_summary && (
              <p className="text-sm text-slate-700 leading-relaxed">{s9.sentiment_summary}</p>
            )}
          </div>
          <div>
            {s10.major_holders?.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Major Holders</p>
                <div className="space-y-2 mb-3">
                  {s10.major_holders.map((h: any) => (
                    <div key={h.name} className="flex justify-between text-sm border-b border-slate-100 pb-1">
                      <span className="text-slate-700">{h.name}</span>
                      <span className="font-mono font-semibold">{h.pct}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Institutional: <span className="font-semibold">{s10.institutional_pct ?? "—"}%</span>
                  {" · "}
                  Insider: <span className="font-semibold">{s10.insider_pct ?? "—"}%</span>
                </p>
              </>
            )}
          </div>
        </div>

        {/* 11. Risk Factors */}
        <SH n={11} title="Risk Factors" agent="Risk Agent" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            ["Beta", fmtN(s12.beta)],
            ["Debt / Equity", fmtN(s12.debt_to_equity)],
            ["Current Ratio", fmtN(s12.current_ratio)],
          ].map(([l, v]) => (
            <Metric key={l as string} label={l as string} value={v as string} />
          ))}
        </div>
        {s7.key_risks?.length > 0 && (
          <ul className="space-y-2">
            {s7.key_risks.map((r: string) => (
              <li key={r} className="flex gap-2 text-sm text-slate-700">
                <span className="text-red-400 shrink-0 mt-0.5">▲</span>{r}
              </li>
            ))}
          </ul>
        )}

        {/* 12. Scenario Analysis */}
        <SH n={12} title="Scenario Analysis" agent="Committee Agent" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { key: "bull", label: "Bull Case", cls: "bg-green-50 border-green-200 text-green-700" },
            { key: "base", label: "Base Case", cls: "bg-amber-50 border-amber-200 text-amber-700" },
            { key: "bear", label: "Bear Case", cls: "bg-red-50 border-red-200 text-red-700" },
          ].map(({ key, label, cls }) => {
            const sc = s13[key];
            if (!sc) return null;
            return (
              <div key={key} className={`rounded-xl p-5 border-2 ${cls}`}>
                <p className="text-xs font-bold uppercase tracking-wide opacity-60 mb-3">{label}</p>
                <p className="text-3xl font-bold">{fmtPrice(sc.price_target)}</p>
                <p className="text-sm font-semibold mt-1">
                  {sc.upside_pct ? `+${sc.upside_pct}%` : sc.downside_pct ? `-${sc.downside_pct}%` : ""}
                </p>
                <p className="text-xs opacity-60 mt-2">Probability: {sc.probability}%</p>
                <p className="text-xs leading-relaxed mt-2 opacity-80">{sc.assumptions || sc.catalyst || ""}</p>
              </div>
            );
          })}
        </div>
        <CS title="DCF Sensitivity Table" agent="Fundamental Agent" note="Price target range across WACC ±200bps and terminal growth rate ±1%." />

        {/* 13. Recommendation */}
        <SH n={13} title="Final Recommendation" agent="Committee Agent" />
        <div className={`rounded-2xl p-6 border-2 ${dirCls(data.direction)}`}>
          <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
            <span className="text-4xl font-bold">{data.direction.replace("_", " ")}</span>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide opacity-60">Conviction</p>
              <p className="text-3xl font-bold">{data.conviction}/100</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-10">
            {[
              ["Expected Return (12m)", data.expected_return_12m],
              ["Suggested Position Size", `${s7.suggested_size_pct ?? "—"}%`],
              ["Stop Loss", `${s7.stop_loss_pct ?? "—"}%`],
            ].map(([l, v]) => (
              <div key={l as string}>
                <p className="text-xs uppercase tracking-wide opacity-60">{l}</p>
                <p className="text-xl font-bold mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Coming soon */}
        <div className="mt-10 border-t border-slate-100 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-5">
            Additional Analysis — Coming Soon
          </p>
          <div className="grid grid-cols-2 gap-4">
            <CS title="Variant View / Edge" agent="Committee Agent" note="Where our thesis differs from consensus — the key variant assumption driving alpha." />
            <CS title="Return Profile Waterfall" agent="Risk Agent" note="IRR calculation across scenarios, accounting for entry sizing and time horizon." />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-400">
          <div className="flex justify-between">
            <span>Haz Capital Management · Autonomous AI Research</span>
            <span>{data.date} · {ticker}</span>
          </div>
          <p className="mt-2">
            Generated by an autonomous AI system. Not financial advice. For informational purposes only.
          </p>
        </div>

      </div>
    </div>
  );
}
