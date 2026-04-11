"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ReportPreview {
  ticker: string;
  company_name: string;
  sector: string;
  current_price: number | null;
  date: string;
  direction: string;
  conviction: number | null;
  mandate_pass: boolean;
  expected_return_2_3yr: string | null;
  macro_regime: string;
}

const DIRECTION_STYLE: Record<string, string> = {
  BUY:  "text-[#10B981] bg-[#10B981]/10",
  HOLD: "text-[#F59E0B] bg-[#F59E0B]/10",
  SELL: "text-[#EF4444] bg-[#EF4444]/10",
  PASS: "text-[#6B7280] bg-white/05",
};

const STEPS = [
  { key: "macro",       label: "Macro Agent" },
  { key: "news",        label: "News & Catalyst Agent" },
  { key: "fundamental", label: "Fundamental Analyst" },
  { key: "quant",       label: "Quant Agent" },
  { key: "sentiment",   label: "Sentiment Agent" },
  { key: "committee",   label: "Investment Committee" },
];

export default function AdhocInputPage() {
  const [ticker, setTicker]       = useState("");
  const [useCache, setUseCache]   = useState(true);
  const [status, setStatus]       = useState<"idle"|"queued"|"error">("idle");
  const [queued, setQueued]       = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [recent, setRecent]       = useState<ReportPreview[]>([]);

  useEffect(() => {
    fetch("/api/adhoc")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRecent(data); })
      .catch(() => {});
  }, []);

  const run = async () => {
    const t = ticker.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!t) return;
    setStatus("idle");
    setErrorMsg(null);
    setQueued(null);

    try {
      const res = await fetch("/api/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t, forceRefresh: !useCache }),
      });
      const data = await res.json();
      if (data.error) {
        setErrorMsg(data.error);
        setStatus("error");
      } else {
        setQueued(t);
        setStatus("queued");
      }
    } catch (e) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[#080C10] pb-20">
      <div className="max-w-2xl mx-auto px-6 pt-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">Deep-Dive Research</h1>
          <p className="text-[#6B7280] text-sm mt-1">
            Full 14-section institutional analysis on any ticker. No positions modified.
          </p>
        </div>

        {/* Input card */}
        <div className="card p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Ticker (e.g. NVDA)"
              maxLength={5}
              className="flex-1 bg-white/08 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E8EDF2] placeholder-[#6B7280] font-mono uppercase focus:outline-none focus:border-[#0EA5E9]/50 transition-all"
            />
            <button
              onClick={run}
              disabled={!ticker.trim() || status === "queued"}
              className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 transition-all disabled:opacity-40"
            >
              Run Analysis
            </button>
          </div>

          {/* Cache toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseCache(true)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                useCache
                  ? "border-[#0EA5E9]/50 text-[#0EA5E9] bg-[#0EA5E9]/10"
                  : "border-white/10 text-[#6B7280] bg-white/03"
              }`}
            >
              Use cached (7 days)
            </button>
            <button
              onClick={() => setUseCache(false)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                !useCache
                  ? "border-[#F59E0B]/50 text-[#F59E0B] bg-[#F59E0B]/10"
                  : "border-white/10 text-[#6B7280] bg-white/03"
              }`}
            >
              Force refresh
            </button>
          </div>
        </div>

        {/* Status: queued */}
        {status === "queued" && queued && (
          <div className="card p-5 mb-6 border border-[#10B981]/30 bg-[#10B981]/05">
            <p className="text-sm font-bold text-[#10B981] mb-2">Analysis queued for {queued}</p>
            <p className="text-xs text-[#9CA3AF] mb-4">
              All 6 agents are running in the cloud. The report will appear below once
              the workflow completes and the dashboard redeploys (~3–5 minutes).
            </p>
            {/* Agent pipeline progress visualization */}
            <div className="flex flex-wrap gap-2">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                  <span className="w-5 h-5 rounded-full border border-[#374151] flex items-center justify-center text-[10px]">
                    {i + 1}
                  </span>
                  {s.label}
                  {i < STEPS.length - 1 && <span className="text-[#374151]">→</span>}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-white/05">
              <Link
                href={`/reports/adhoc/${queued}`}
                className="text-xs text-[#0EA5E9] hover:underline"
              >
                Check report page for {queued} →
              </Link>
            </div>
          </div>
        )}

        {/* Status: error */}
        {status === "error" && errorMsg && (
          <div className="card p-4 mb-6 border border-[#EF4444]/30 bg-[#EF4444]/05">
            <p className="text-xs text-[#EF4444]">Error: {errorMsg}</p>
            {errorMsg.includes("GITHUB_DISPATCH_TOKEN") && (
              <p className="text-xs text-[#6B7280] mt-2">
                Add <code className="text-[#E8EDF2]">GITHUB_DISPATCH_TOKEN</code> to Vercel
                environment variables (a GitHub PAT with <code className="text-[#E8EDF2]">workflow</code> scope).
              </p>
            )}
          </div>
        )}

        {/* Recent reports */}
        {recent.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">
              Cached Reports
            </h2>
            <div className="space-y-2">
              {recent.map((r) => {
                const dir = r.direction ?? "PASS";
                const ds = DIRECTION_STYLE[dir] ?? DIRECTION_STYLE.PASS;
                const cv = r.conviction;
                const cvColor = cv == null ? "#6B7280"
                  : cv >= 70 ? "#10B981"
                  : cv >= 40 ? "#F59E0B"
                  : "#EF4444";
                return (
                  <Link key={`${r.ticker}_${r.date}`} href={`/reports/adhoc/${r.ticker}`}>
                    <div className="card p-4 hover:border-white/15 transition-all cursor-pointer flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${ds}`}>{dir}</span>
                        <div>
                          <span className="font-mono text-sm font-bold text-[#E8EDF2]">{r.ticker}</span>
                          <span className="text-xs text-[#6B7280] ml-2">{r.company_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        {cv != null && (
                          <div>
                            <p className="text-[10px] text-[#6B7280]">Conviction</p>
                            <p className="text-sm font-bold font-mono" style={{ color: cvColor }}>{cv}</p>
                          </div>
                        )}
                        {r.expected_return_2_3yr && (
                          <div>
                            <p className="text-[10px] text-[#6B7280]">2–3yr Return</p>
                            <p className="text-xs font-mono text-[#E8EDF2]">{r.expected_return_2_3yr}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-[#4B5563]">{r.date}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {recent.length === 0 && status === "idle" && (
          <p className="text-xs text-[#4B5563] text-center mt-8">No cached reports yet. Run your first analysis above.</p>
        )}
      </div>
    </div>
  );
}
