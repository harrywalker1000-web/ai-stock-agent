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

// Workflow takes ~10-12 min total. We creep the bar slowly toward the next real milestone
// so it's always visually moving, then snaps to real values when agents complete.
const TOTAL_MS = 11 * 60 * 1000;

function ProgressBar({ pct, done, total, queuedAt, active }: {
  pct: number; done: number; total: number; queuedAt: number | null; active: boolean;
}) {
  const [displayPct, setDisplayPct] = useState(pct);

  useEffect(() => {
    if (!active || !queuedAt) { setDisplayPct(pct); return; }

    const tick = () => {
      const elapsed = Date.now() - queuedAt;
      // Time-based estimate: creep linearly over TOTAL_MS, but cap just below next real milestone
      const timePct = Math.min((elapsed / TOTAL_MS) * 100, 99);
      // Never go backwards from real progress; also cap below the next whole step boundary
      const nextMilestone = ((done + 1) / total) * 100 - 1; // 1% below next real step
      const creep = Math.min(timePct, nextMilestone);
      setDisplayPct(Math.max(pct, creep));
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [pct, done, total, queuedAt, active]);

  // Snap immediately to real value when agents complete
  useEffect(() => { if (!active) setDisplayPct(pct); }, [pct, active]);

  const shown = Math.round(displayPct);

  return (
    <div className="mb-4">
      <div className="flex justify-between text-[10px] text-[#6B7280] mb-1">
        <span>{done} of {total} agents complete</span>
        <span>{shown}%</span>
      </div>
      <div className="h-1.5 bg-white/05 rounded-full overflow-hidden relative">
        {/* Real progress fill */}
        <div
          className="h-full bg-[#0EA5E9] rounded-full transition-all duration-300"
          style={{ width: `${displayPct}%` }}
        />
        {/* Shimmer sweep on top while active */}
        {active && (
          <div
            className="absolute inset-y-0 w-16 rounded-full opacity-40"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
              animation: "shimmer 1.8s infinite",
              left: `${displayPct}%`,
              transform: "translateX(-50%)",
            }}
          />
        )}
      </div>
      <style>{`@keyframes shimmer { 0%,100% { opacity: 0.2; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
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
  const [deleting, setDeleting]   = useState<string | null>(null); // "ticker_date" key being deleted

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

  const deleteReport = async (ticker: string, date: string) => {
    const key = `${ticker}_${date}`;
    setDeleting(key);
    try {
      const res = await fetch(`/api/adhoc?ticker=${ticker}&date=${date}`, { method: "DELETE" });
      if (res.ok) {
        setRecent((prev) => prev.filter((r) => !(r.ticker === ticker && r.date === date)));
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Delete failed: ${body.error ?? res.status}`);
      }
    } catch (err) {
      alert(`Delete failed: ${err}`);
    } finally {
      setDeleting(null);
    }
  };

  const deleteAll = async () => {
    if (!window.confirm(`Delete all ${recent.length} cached report${recent.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting("all");
    try {
      const res = await fetch("/api/adhoc?all=1", { method: "DELETE" });
      if (res.ok) {
        setRecent([]);
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Delete failed: ${body.error ?? res.status}`);
      }
    } catch (err) {
      alert(`Delete failed: ${err}`);
    } finally {
      setDeleting(null);
    }
  };

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
            <ProgressBar
              pct={progress?.pct ?? 0}
              done={progress?.done ?? 0}
              total={progress?.total ?? 6}
              queuedAt={queuedAt}
              active={progress?.status === "in_progress" || progress?.status === "queued" || !progress}
            />
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                Cached Reports ({recent.length})
              </h2>
              <button
                onClick={deleteAll}
                disabled={deleting === "all"}
                className="text-[10px] text-[#EF4444]/60 hover:text-[#EF4444] transition-all disabled:opacity-40 flex items-center gap-1"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
                </svg>
                {deleting === "all" ? "Deleting…" : "Clear all"}
              </button>
            </div>
            <div className="space-y-2">
              {recent.map((r) => {
                const dir = r.direction ?? "PASS";
                const ds = DIRECTION_STYLE[dir] ?? DIRECTION_STYLE.PASS;
                const cv = r.conviction;
                const cvColor = cv == null ? "#6B7280"
                  : cv >= 70 ? "#10B981"
                  : cv >= 40 ? "#F59E0B"
                  : "#EF4444";
                const rowKey = `${r.ticker}_${r.date}`;
                const isDeleting = deleting === rowKey;
                return (
                  <div key={rowKey} className="relative group">
                    <Link href={`/reports/adhoc/${r.ticker}`}>
                      <div className={`card p-4 hover:border-white/15 transition-all cursor-pointer flex items-center justify-between ${isDeleting ? "opacity-40" : ""}`}>
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
                          {/* Spacer so delete button doesn't overlap text */}
                          <div className="w-6" />
                        </div>
                      </div>
                    </Link>
                    {/* Delete button — shown on hover, sits over the right edge */}
                    <button
                      onClick={(e) => { e.preventDefault(); deleteReport(r.ticker, r.date); }}
                      disabled={!!deleting}
                      title={`Delete ${r.ticker} cache`}
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[#EF4444]/50 hover:text-[#EF4444] disabled:opacity-20 p-1.5 rounded-lg hover:bg-[#EF4444]/08"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
                      </svg>
                    </button>
                  </div>
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
