"use client";

import { useState } from "react";

interface AdhocReport {
  ticker: string;
  company_name: string;
  sector: string;
  current_price: number | null;
  date: string;
  executive_summary: string;
  bull_case: string;
  bear_case: string;
  verdict: "bullish" | "neutral" | "bearish";
  conviction: number;
  suggested_entry: number | null;
  suggested_exit: number | null;
  stop_loss: number | null;
  risk_factors: string[];
  key_catalysts: string[];
  valuation_note: string;
  disclaimer: string;
  generated_at: string;
  cached?: boolean;
  error?: string;
}

const VERDICT_STYLES = {
  bullish: { bg: "bg-[#10B981]/10", border: "border-[#10B981]/30", text: "text-[#10B981]", label: "Bullish" },
  neutral: { bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30", text: "text-[#F59E0B]", label: "Neutral" },
  bearish: { bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30", text: "text-[#EF4444]", label: "Bearish" },
};

function fmt(n: number | null | undefined, prefix = "$"): string {
  if (n == null) return "—";
  return `${prefix}${n.toFixed(2)}`;
}

export default function AdhocReportPage() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AdhocReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/report/${t}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Unknown error");
      } else {
        setReport(data as AdhocReport);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const verdict = report?.verdict ?? "neutral";
  const vs = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.neutral;

  return (
    <div className="min-h-screen bg-[#080C10] pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">Research Report</h1>
          <p className="text-[#6B7280] text-sm mt-1">Generate an ad-hoc deep-dive on any ticker. No trades placed.</p>
        </div>

        {/* Input */}
        <div className="card p-6 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
              placeholder="Enter ticker (e.g. AAPL)"
              className="flex-1 bg-white/05 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E8EDF2] placeholder-[#4B5563] font-mono uppercase focus:outline-none focus:border-[#0EA5E9]/50 transition-all"
              disabled={loading}
            />
            <button
              onClick={generate}
              disabled={loading || !ticker.trim()}
              className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 transition-all disabled:opacity-40 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                  </svg>
                  Generating...
                </>
              ) : "Generate Report"}
            </button>
          </div>
          {loading && (
            <p className="text-xs text-[#6B7280] mt-3">Fetching live data and running analysis — this takes 1-3 minutes...</p>
          )}
          {error && (
            <p className="text-xs text-[#EF4444] mt-3">Error: {error}</p>
          )}
        </div>

        {/* Report */}
        {report && !report.error && (
          <>
            {/* Header card */}
            <div className={`card p-6 mb-5 border ${vs.border} ${vs.bg}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-display text-2xl font-bold text-[#E8EDF2]">{report.ticker}</h2>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${vs.bg} ${vs.text} border ${vs.border}`}>{vs.label}</span>
                    {report.cached && <span className="text-xs text-[#6B7280] bg-white/05 px-2 py-0.5 rounded">Cached today</span>}
                  </div>
                  <p className="text-sm text-[#9CA3AF]">{report.company_name} · {report.sector}</p>
                </div>
                <div className="text-right">
                  {report.current_price != null && (
                    <p className="font-mono text-xl font-bold text-[#E8EDF2]">${report.current_price.toFixed(2)}</p>
                  )}
                  <div className="flex items-center gap-1 justify-end mt-1">
                    <span className="text-xs text-[#6B7280]">Conviction:</span>
                    <span className={`text-xs font-bold font-mono ${vs.text}`}>{report.conviction}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-[#C4CDD6] leading-relaxed">{report.executive_summary}</p>
            </div>

            {/* Bull / Bear */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div className="card p-5 border border-[#10B981]/20">
                <p className="text-xs font-bold text-[#10B981] uppercase tracking-wider mb-2">Bull Case</p>
                <p className="text-sm text-[#C4CDD6] leading-relaxed">{report.bull_case}</p>
              </div>
              <div className="card p-5 border border-[#EF4444]/20">
                <p className="text-xs font-bold text-[#EF4444] uppercase tracking-wider mb-2">Bear Case</p>
                <p className="text-sm text-[#C4CDD6] leading-relaxed">{report.bear_case}</p>
              </div>
            </div>

            {/* Price targets */}
            <div className="card p-5 mb-5">
              <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Price Levels</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Suggested Entry", value: fmt(report.suggested_entry), color: "#10B981" },
                  { label: "Target Exit", value: fmt(report.suggested_exit), color: "#0EA5E9" },
                  { label: "Stop Loss", value: fmt(report.stop_loss), color: "#EF4444" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/03 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-1">{label}</p>
                    <p className="font-mono font-bold text-lg" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#6B7280] mt-3 leading-relaxed">{report.valuation_note}</p>
            </div>

            {/* Catalysts & Risks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {report.key_catalysts?.length > 0 && (
                <div className="card p-5">
                  <p className="text-xs font-bold text-[#0EA5E9] uppercase tracking-wider mb-2">Key Catalysts</p>
                  <ul className="space-y-1.5">
                    {report.key_catalysts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#C4CDD6]">
                        <span className="text-[#0EA5E9] mt-0.5">→</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.risk_factors?.length > 0 && (
                <div className="card p-5">
                  <p className="text-xs font-bold text-[#F59E0B] uppercase tracking-wider mb-2">Risk Factors</p>
                  <ul className="space-y-1.5">
                    {report.risk_factors.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#C4CDD6]">
                        <span className="text-[#F59E0B] mt-0.5">⚠</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Disclaimer */}
            <div className="px-4 py-3 rounded-xl bg-white/02 border border-white/05">
              <p className="text-[10px] text-[#4B5563] leading-relaxed">{report.disclaimer}</p>
              <p className="text-[10px] text-[#4B5563] mt-1">Generated: {report.generated_at}</p>
            </div>

            {/* Print button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => window.print()}
                className="text-xs text-[#6B7280] hover:text-[#E8EDF2] px-3 py-1.5 rounded-lg bg-white/05 hover:bg-white/08 transition-all"
              >
                Print / Export
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
