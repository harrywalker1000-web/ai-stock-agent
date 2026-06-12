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
  source?: string;
}

const DIRECTION_STYLE: Record<string, string> = {
  BUY:  "text-[#10B981] bg-[#10B981]/10",
  HOLD: "text-[#F59E0B] bg-[#F59E0B]/10",
  SELL: "text-[#EF4444] bg-[#EF4444]/10",
  PASS: "text-[#6B7280] bg-white/05",
};

// 6 real workflow steps — matches adhoc_report.yml exactly (no sync step)
const SETUP_STEPS    = [{ key: "checkout", label: "Checkout" }, { key: "python", label: "Python" }, { key: "install", label: "Dependencies" }];
const ANALYSIS_STEPS = [{ key: "analysis", label: "Run Analysis\n(6 agents)" }];
const FINALIZE_STEPS = [{ key: "commit", label: "Commit" }, { key: "deploy", label: "Deploy" }];

type StepStatus = "pending" | "running" | "done" | "failed";
interface Progress {
  status: string;
  steps: Record<string, StepStatus>;
  pct: number;
  done: number;
  total: number;
}

function StepDot({ status, label }: { status: StepStatus; label: string }) {
  const isDone = status === "done", isRunning = status === "running", isFailed = status === "failed";
  const dot = isDone ? "bg-[#10B981] border-[#10B981] text-white"
    : isRunning ? "bg-[#0EA5E9] border-[#0EA5E9] text-white animate-pulse"
    : isFailed  ? "bg-[#EF4444] border-[#EF4444] text-white"
    : "bg-transparent border-[#374151] text-[#374151]";
  const lbl = isDone ? "text-[#10B981]" : isRunning ? "text-[#0EA5E9]" : isFailed ? "text-[#EF4444]" : "text-[#4B5563]";
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${dot}`}>
        {isDone ? <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : isFailed ? <span className="text-xs">✕</span>
          : isRunning ? <span className="text-[10px] font-bold">•••</span>
          : <span className="w-2 h-2 rounded-full bg-[#374151]/40 block" />}
      </span>
      <span className={`text-[9px] text-center leading-tight whitespace-pre-line transition-colors ${lbl}`}>{label}</span>
    </div>
  );
}

function PhaseRow({ label, stepList, steps }: { label: string; stepList: { key: string; label: string }[]; steps: Record<string, StepStatus> }) {
  const get = (k: string): StepStatus => steps[k] ?? "pending";
  return (
    <div>
      <p className="text-[9px] font-bold text-[#374151] uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-start gap-1">
        {stepList.map((s, i) => (
          <div key={s.key} className="flex items-start">
            <StepDot status={get(s.key)} label={s.label} />
            {i < stepList.length - 1 && (
              <div className={`self-start mt-3 w-5 h-px mx-1 shrink-0 ${get(s.key) === "done" ? "bg-[#10B981]/40" : "bg-[#374151]"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineSteps({ steps }: { steps: Record<string, StepStatus> }) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-4">
      <PhaseRow label="Setup" stepList={SETUP_STEPS} steps={steps} />
      <PhaseRow label="Analysis" stepList={ANALYSIS_STEPS} steps={steps} />
      <PhaseRow label="Finalise" stepList={FINALIZE_STEPS} steps={steps} />
    </div>
  );
}

// Pro-rata smooth progress: purely time-based, snaps only when pipeline completes
// Total ~11 min. Ease curve: fast early, slow toward 95% cap.
const TOTAL_MS = 11 * 60 * 1000;

function ProgressBar({ pct, queuedAt, active }: { pct: number; queuedAt: number | null; active: boolean }) {
  const [display, setDisplay] = useState(pct);

  useEffect(() => {
    if (!active || !queuedAt) { setDisplay(pct); return; }
    const tick = () => {
      const elapsed = Date.now() - queuedAt;
      // Ease-out curve: fast to 50% in first third, slow crawl to 95% cap
      const raw = Math.min(elapsed / TOTAL_MS, 1);
      const eased = 1 - Math.pow(1 - raw, 2.2); // ease-out power curve
      const timePct = Math.min(eased * 100, 95);
      setDisplay(d => Math.max(d, timePct, pct)); // never go backwards
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pct, queuedAt, active]);

  useEffect(() => { if (!active) setDisplay(pct); }, [pct, active]);

  const shown = Math.min(Math.round(display), 100);

  return (
    <div className="mb-4">
      <div className="flex justify-between text-[10px] text-[#6B7280] mb-1.5">
        <span>{active ? "Analysis running…" : pct >= 100 ? "Complete" : "Waiting"}</span>
        <span className="font-mono">{shown}%</span>
      </div>
      <div className="h-2 bg-white/05 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${shown}%`,
            background: shown >= 100 ? "#10B981" : "linear-gradient(90deg, #0EA5E9, #38BDF8)",
          }}
        />
      </div>
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
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [seenReports, setSeenReports] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Restore queued state — only expire if >20 min old; let progress poller handle completion
    try {
      const raw = localStorage.getItem("adhocQueued");
      if (raw) {
        const { ticker: t, queuedAt: qa } = JSON.parse(raw) as { ticker: string; queuedAt: number };
        if (Date.now() - qa < 20 * 60 * 1000) {
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
          // Load seen reports; seed with all current reports on first visit so none show as NEW
          try {
            const rawSeen = localStorage.getItem("seenReports");
            if (rawSeen) {
              setSeenReports(new Set(JSON.parse(rawSeen)));
            } else {
              const allKeys = data.map((r: ReportPreview) => `${r.ticker}_${r.date}`);
              localStorage.setItem("seenReports", JSON.stringify(allKeys));
              setSeenReports(new Set(allKeys));
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
          if (data.status === "completed") {
            setTimeout(() => {
              fetch("/api/adhoc").then(r => r.json()).then(d => {
                if (Array.isArray(d)) {
                  setRecent(d);
                  // Always clear the banner on completion — the report may have been committed
                  // with a different date or might be Vercel-cached; don't gate on date match
                  localStorage.removeItem("adhocQueued");
                  setStatus("idle");
                  setQueued(null);
                  // Any new reports not yet in seenReports will show the NEW badge
                }
              }).catch(() => {});
            }, 3000);
          }
          // Auto-unblock on failure so user can retry immediately
          if (data.status === "failed") {
            localStorage.removeItem("adhocQueued");
            setStatus("error");
            setErrorMsg("Workflow failed — check GitHub Actions for logs.");
            setQueued(null);
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
                ? "Pipeline complete — report will appear below shortly."
                : progress?.status === "failed"
                ? "Workflow failed. Check GitHub Actions for details."
                : progress?.status === "in_progress"
                ? (() => {
                    const allSteps = [...SETUP_STEPS, ...ANALYSIS_STEPS, ...FINALIZE_STEPS];
                    const running = allSteps.find(s => progress?.steps?.[s.key] === "running");
                    return running
                      ? `${running.label} running…`
                      : `Workflow in progress (${progress?.done ?? 0}/${progress?.total ?? 12} steps done)`;
                  })()
                : "Pipeline starting in the cloud (~10–12 min total)."}
            </p>
            {/* Full pipeline — 3 phases */}
            <PipelineSteps steps={progress?.steps ?? {}} />
            {/* Progress bar */}
            <ProgressBar
              pct={progress?.pct ?? 0}
              queuedAt={queuedAt}
              active={progress?.status === "in_progress" || progress?.status === "queued" || !progress}
            />
            {(progress?.steps?.commit === "done" || progress?.status === "completed") && (
              <div className="pt-3 border-t border-white/05">
                <Link
                  href={`/reports/adhoc/${queued}`}
                  className="text-xs text-[#0EA5E9] hover:underline"
                >
                  View full report for {queued} →
                </Link>
              </div>
            )}
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

        {/* Recent reports — split by source */}
        {recent.length > 0 && (() => {
          const manualReports   = recent.filter((r) => !r.source || r.source === "manual");
          const pipelineReports = recent.filter((r) => r.source === "pipeline_auto");

          const TrashIcon = () => (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
            </svg>
          );

          const markSeen = (key: string) => {
            setSeenReports(prev => {
              const next = new Set(prev);
              next.add(key);
              try { localStorage.setItem("seenReports", JSON.stringify([...next])); } catch { /* ignore */ }
              return next;
            });
          };

          const ReportRow = ({ r }: { r: ReportPreview }) => {
            const dir = r.direction ?? "PASS";
            const ds = DIRECTION_STYLE[dir] ?? DIRECTION_STYLE.PASS;
            const cv = r.conviction;
            const cvColor = cv == null ? "#6B7280" : cv >= 70 ? "#10B981" : cv >= 40 ? "#F59E0B" : "#EF4444";
            const rowKey = `${r.ticker}_${r.date}`;
            const isDeleting = deleting === rowKey;
            const isNew = !seenReports.has(rowKey);
            return (
              <div className="relative group">
                <Link href={`/reports/adhoc/${r.ticker}`} onClick={() => markSeen(rowKey)}>
                  <div className={`card p-4 hover:border-white/15 transition-all cursor-pointer flex items-center justify-between ${isDeleting ? "opacity-40" : ""}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${ds}`}>{dir}</span>
                      <div>
                        <span className="font-mono text-sm font-bold text-[#E8EDF2]">{r.ticker}</span>
                        <span className="text-xs text-[#6B7280] ml-2">{r.company_name}</span>
                        {isNew && (
                          <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#0EA5E9]/15 text-[#0EA5E9] border border-[#0EA5E9]/30 align-middle">NEW</span>
                        )}
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
                      <div className="w-6" />
                    </div>
                  </div>
                </Link>
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
          };

          return (
            <div className="space-y-6">
              {/* Manual section */}
              {manualReports.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">
                    My Research ({manualReports.length})
                  </h2>
                  <div className="space-y-2">
                    {manualReports.map((r) => <ReportRow key={`${r.ticker}_${r.date}`} r={r} />)}
                  </div>
                </div>
              )}

              {/* Pipeline auto section */}
              {pipelineReports.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                        Pipeline Research ({pipelineReports.length})
                      </h2>
                      <p className="text-[10px] text-[#3D4655] mt-0.5">
                        Auto-generated for debated &amp; entered stocks during daily pipeline runs
                      </p>
                    </div>
                    <button
                      onClick={deleteAll}
                      disabled={deleting === "all"}
                      className="text-[10px] text-[#EF4444]/60 hover:text-[#EF4444] transition-all disabled:opacity-40 flex items-center gap-1"
                    >
                      <TrashIcon />
                      {deleting === "all" ? "Deleting…" : "Clear all"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {pipelineReports.map((r) => <ReportRow key={`${r.ticker}_${r.date}`} r={r} />)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {recent.length === 0 && status === "idle" && (
          <p className="text-xs text-[#4B5563] text-center mt-8">No cached reports yet. Run your first analysis above.</p>
        )}
      </div>
    </div>
  );
}
