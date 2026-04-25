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
  expected_return_12m: string | null;
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

type AgentStatus = "pending" | "running" | "done" | "failed";
interface Progress {
  status: string;
  agents: Record<string, AgentStatus>;
  pct: number;
  done: number;
  total: number;
}

export default function AdhocInputPage() {
  const [ticker, setTicker]       = useState("");
  const [useCache, setUseCache]   = useState(true);
  const [status, setStatus]       = useState<"idle"|"queued"|"error">("idle");
  const [queued, setQueued]       = useState<string | null>(null);
  const [queuedAt, setQueuedAt]   = useState<number | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [recent, setRecent]       = useState<ReportPreview[]>([]);
  const [progress, setProgress]   = useState<Progress | null>(null);

  useEffect(() => {
    // Restore queued state across refreshes
    try {
      const raw = localStorage.getItem("adhocQueued");
      if (raw) {
        const { ticker: t, queuedAt: qa } = JSON.parse(raw) as { ticker: string; queuedAt: number };
        const age = Date.now() - qa;
        if (age < 20 * 60 * 1000) {
          setQueued(t); setQueuedAt(qa); setStatus("queued");
        } else {
          localStorage.removeItem("adhocQueued");
        }
      }
    } catch { /* ignore */ }

    fetch("/api/adhoc")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRecent(data);
          // Clear queued banner only if a fresh report appeared (dated today)
          try {
            const raw = localStorage.getItem("adhocQueued");
            if (raw) {
              const { ticker: t, queuedAt } = JSON.parse(raw) as { ticker: string; queuedAt: number };
              const today = new Date().toISOString().slice(0, 10);
              const freshReport = data.find(
                (r: ReportPreview) => r.ticker === t && r.date >= today
              );
              const isStale = Date.now() - queuedAt > 20 * 60 * 1000;
              if (freshReport || isStale) {
                localStorage.removeItem("adhocQueued");
                setStatus("idle");
                setQueued(null);
              }
            }
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, []);

  // Poll GitHub Actions for per-agent progress while queued
  useEffect(() => {
    if (status !== "queued" || !queued || !queuedAt) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/adhoc/progress?ticker=${queued}&queuedAt=${queuedAt}`);
        const data: Progress & { status: string } = await res.json();
        if (!stopped) {
          setProgress(data);
          // If completed, refresh the reports list after a short delay
          if (data.status === "completed") {
            setTimeout(() => {
              fetch("/api/adhoc").then(r => r.json()).then(d => {
                if (Array.isArray(d)) setRecent(d);
              }).catch(() => {});
            }, 3000);
          }
        }
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 6000);
    return () => { stopped = true; clearInterval(iv); };
  }, [status, queued, queuedAt]);

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
        const now = Date.now();
        setQueued(t);
        setQueuedAt(now);
        setProgress(null);
        setStatus("queued");
        try { localStorage.setItem("adhocQueued", JSON.stringify({ ticker: t, queuedAt: now })); } catch { /* ignore */ }
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
              className="flex-1 bg-[#0D1117] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E8EDF2] placeholder-[#4B5563] font-mono uppercase focus:outline-none focus:border-[#0EA5E9]/50 transition-all"
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
            <p className="text-sm font-bold text-[#10B981] mb-1">Analysis queued for {queued}</p>
            {/* Dynamic status line */}
            <p className="text-xs text-[#9CA3AF] mb-4">
              {progress?.status === "completed"
                ? "All agents done — report will appear below shortly."
                : progress?.status === "failed"
                ? "Workflow failed. Check GitHub Actions for details."
                : progress?.status === "in_progress"
                ? (() => {
                    const running = STEPS.find(s => progress?.agents[s.key] === "running");
                    return running
                      ? `${running.label} running…`
                      : `Workflow in progress (${progress?.done ?? 0}/${progress?.total ?? 6} agents done)`;
                  })()
                : "Agents are starting up in the cloud (~3–5 min total)."}
            </p>
            {/* Agent pipeline steps */}
            <div className="flex flex-wrap gap-x-1 gap-y-2 mb-4">
              {STEPS.map((s, i) => {
                const agentStatus = progress?.agents[s.key] ?? "pending";
                const isDone    = agentStatus === "done";
                const isRunning = agentStatus === "running";
                const isFailed  = agentStatus === "failed";
                const dotColor  = isDone    ? "bg-[#10B981] border-[#10B981]"
                                : isRunning ? "bg-[#0EA5E9] border-[#0EA5E9] animate-pulse"
                                : isFailed  ? "bg-[#EF4444] border-[#EF4444]"
                                :             "bg-transparent border-[#374151]";
                const labelColor = isDone    ? "text-[#10B981]"
                                 : isRunning ? "text-[#0EA5E9]"
                                 : isFailed  ? "text-[#EF4444]"
                                 :             "text-[#4B5563]";
                return (
                  <div key={s.key} className="flex items-center gap-1.5 text-xs">
                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold transition-all ${dotColor}`}>
                      {isDone ? (
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : isFailed ? "✕" : i + 1}
                    </span>
                    <span className={`transition-colors ${labelColor}`}>{s.label}</span>
                    {i < STEPS.length - 1 && (
                      <span className={`${isDone ? "text-[#10B981]/50" : "text-[#374151]"}`}>→</span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-[10px] text-[#6B7280] mb-1">
                <span>{progress?.done ?? 0} of {progress?.total ?? 6} agents complete</span>
                <span>{progress?.pct ?? 0}%</span>
              </div>
              <div className="h-1.5 bg-white/05 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0EA5E9] rounded-full transition-all duration-500"
                  style={{ width: `${progress?.pct ?? 0}%` }}
                />
              </div>
            </div>
            <div className="pt-3 border-t border-white/05">
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
                        {r.expected_return_12m && (
                          <div>
                            <p className="text-[10px] text-[#6B7280]">12M Return</p>
                            <p className="text-xs font-mono text-[#E8EDF2]">{r.expected_return_12m}</p>
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
