"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ReportPreview {
  filename?: string;
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

function formatDayLabel(dateStr: string): string {
  if (!dateStr) return "Unknown date";
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    const fmt = (x: Date) => x.toISOString().slice(0, 10);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (fmt(d) === fmt(today)) return "Today";
    if (fmt(d) === fmt(yesterday)) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

const DIRECTION_STYLE: Record<string, string> = {
  BUY:  "text-gain bg-gain/10",
  HOLD: "text-caution bg-caution/10",
  SELL: "text-loss bg-loss/10",
  PASS: "text-ink-3 bg-raised/50",
};

// 6 real workflow steps — matches adhoc_report.yml exactly (no sync step)
const SETUP_STEPS    = [{ key: "checkout", label: "Checkout" }, { key: "python", label: "Python" }, { key: "install", label: "Dependencies" }];
const ANALYSIS_STEPS = [{ key: "analysis", label: "Run Analysis\n(6 agents)" }];
const FINALIZE_STEPS = [{ key: "commit", label: "Commit" }];

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
  const dot = isDone ? "bg-gain border-gain text-white"
    : isRunning ? "bg-accent border-accent text-white animate-pulse"
    : isFailed  ? "bg-loss border-loss text-white"
    : "bg-transparent border-line text-ink-3";
  const lbl = isDone ? "text-gain" : isRunning ? "text-accent" : isFailed ? "text-loss" : "text-ink-3";
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${dot}`}>
        {isDone ? <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : isFailed ? <span className="text-xs">✕</span>
          : isRunning ? <span className="text-micro font-bold">•••</span>
          : <span className="w-2 h-2 rounded-full bg-line/40 block" />}
      </span>
      <span className={`text-micro text-center leading-tight whitespace-pre-line transition-colors ${lbl}`}>{label}</span>
    </div>
  );
}

function PhaseRow({ label, stepList, steps }: { label: string; stepList: { key: string; label: string }[]; steps: Record<string, StepStatus> }) {
  const get = (k: string): StepStatus => steps[k] ?? "pending";
  return (
    <div>
      <p className="text-micro font-bold text-ink-3 mb-2">{label}</p>
      <div className="flex items-start gap-1">
        {stepList.map((s, i) => (
          <div key={s.key} className="flex items-start">
            <StepDot status={get(s.key)} label={s.label} />
            {i < stepList.length - 1 && (
              <div className={`self-start mt-3 w-5 h-px mx-1 shrink-0 ${get(s.key) ==="done"?"bg-gain/40":"bg-line"}`} />
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
      <div className="flex justify-between text-micro text-ink-3 mb-1.5">
        <span>{active ? "Analysis running…" : pct >= 100 ? "Complete" : "Waiting"}</span>
        <span className="">{shown}%</span>
      </div>
      <div className="h-2 bg-raised/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${shown}%`,
            background: shown >= 100 ? "#4DB887" : "linear-gradient(90deg, #C8A15A, #C8A15A)",
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
  const [tab, setTab]             = useState<"manual" | "pipeline">("manual");
  const [deletedFiles, setDeletedFiles] = useState<Set<string>>(new Set());
  // Day-group folders: dates in this set have their DEFAULT open/closed state
  // flipped. Default is "most recent day open, older days closed" — toggling
  // a day just XORs it against that default, so we don't need to know the
  // full date list up front to seed initial state.
  const [toggledDays, setToggledDays] = useState<Set<string>>(new Set());
  const toggleDay = (date: string) => {
    setToggledDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

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
          // Load deleted files list; intersect with server response to prune stale entries
          // This hides files that were deleted from GitHub but Vercel hasn't redeployed yet
          try {
            const rawDel = localStorage.getItem("deletedReports");
            if (rawDel) {
              const serverKeys = new Set(data.map((r: ReportPreview) => r.filename ?? `${r.ticker}_${r.date}`));
              const stored: string[] = JSON.parse(rawDel);
              const stillRelevant = stored.filter(f => serverKeys.has(f));
              localStorage.setItem("deletedReports", JSON.stringify(stillRelevant));
              setDeletedFiles(new Set(stillRelevant));
            }
          } catch { /* ignore */ }
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

  const deleteReport = async (ticker: string, date: string, filename?: string) => {
    const key = filename ?? `${ticker}_${date}`;
    setDeleting(key);
    try {
      const url = filename
        ? `/api/adhoc?ticker=${ticker}&filename=${encodeURIComponent(filename)}`
        : `/api/adhoc?ticker=${ticker}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        setRecent((prev) => prev.filter((r) => {
          if (filename) return r.filename !== filename;
          return !(r.ticker === ticker && r.date === date);
        }));
        setDeletedFiles((prev) => {
          const next = new Set(prev);
          next.add(key);
          try { localStorage.setItem("deletedReports", JSON.stringify(Array.from(next))); } catch { /* ignore */ }
          return next;
        });
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

  // Deletes exactly the reports listed in the current tab — never anything else
  const deleteAll = async (targets: ReportPreview[], label: string) => {
    const names = targets.map((r) => r.filename).filter((f): f is string => !!f);
    if (names.length === 0) return;
    if (!window.confirm(`Delete all ${names.length} ${label} report${names.length !== 1 ? "s" : ""}? Reports in the other tab are kept. This cannot be undone.`)) return;
    setDeleting("all");
    try {
      const res = await fetch("/api/adhoc", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenames: names }),
      });
      if (res.ok) {
        const gone = new Set(names);
        setDeletedFiles((prev) => {
          const next = new Set(prev);
          names.forEach((n) => next.add(n));
          try { localStorage.setItem("deletedReports", JSON.stringify(Array.from(next))); } catch { /* ignore */ }
          return next;
        });
        setRecent((prev) => prev.filter((r) => !r.filename || !gone.has(r.filename)));
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
    const t = ticker.trim().toUpperCase().replace(/[^A-Z.\-]/g, "");
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
      } else if (data.cached && data.filename) {
        // Recent report exists and "Use cached" is on — open it instead of re-running
        window.location.href = `/reports/adhoc/${data.ticker}?file=${encodeURIComponent(data.filename)}`;
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
    <div className="min-h-screen bg-canvas pb-20">
      <div className="max-w-2xl mx-auto px-6 pt-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-h1 font-medium text-ink-1">Research a stock</h1>
          <p className="mt-2 text-lead text-ink-2">
            A full equity research report on any US-listed stock, in about ten minutes. Running a report never changes the portfolio.
          </p>
        </div>

        {/* Input card */}
        <div className="card p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.\-]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Ticker (e.g. NVDA)"
              maxLength={6}
              className="flex-1 bg-surface border border-line rounded-xl px-4 py-3 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent/50 transition-all"
            />
            <button
              onClick={run}
              disabled={!ticker.trim() || status === "queued"}
              className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-accent hover:bg-accent/90 transition-all disabled:opacity-40"
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
 ?"border-accent/50 text-accent bg-accent/10"
 :"border-line text-ink-3 bg-raised/50"
 }`}
            >
              Use cached (7 days)
            </button>
            <button
              onClick={() => setUseCache(false)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
 !useCache
 ?"border-caution/50 text-caution bg-caution/10"
 :"border-line text-ink-3 bg-raised/50"
 }`}
            >
              Force refresh
            </button>
          </div>
        </div>

        {/* Status: queued */}
        {status === "queued" && queued && (
          <div className="card p-5 mb-6 border border-gain/30 bg-gain/5">
            <p className="text-sm font-bold text-gain mb-1">Analysis queued for {queued}</p>
            {/* Dynamic status line */}
            <p className="text-xs text-ink-2 mb-4">
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
              <div className="pt-3 border-t border-line">
                <Link
                  href={`/reports/adhoc/${queued}`}
                  className="text-xs text-accent hover:underline"
                >
                  View full report for {queued} →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Status: error */}
        {status === "error" && errorMsg && (
          <div className="card p-4 mb-6 border border-loss/30 bg-loss/5">
            <p className="text-xs text-loss">Error: {errorMsg}</p>
            {errorMsg.includes("GITHUB_DISPATCH_TOKEN") && (
              <p className="text-xs text-ink-3 mt-2">
                Add <code className="text-ink-1">GITHUB_DISPATCH_TOKEN</code> to Vercel
                environment variables (a GitHub PAT with <code className="text-ink-1">workflow</code> scope).
              </p>
            )}
          </div>
        )}

        {/* Recent reports — tab toggle */}
        {(() => {
          const visibleRecent   = recent.filter(r => !deletedFiles.has(r.filename ?? `${r.ticker}_${r.date}`));
          if (visibleRecent.length === 0) return null;
          const manualReports   = visibleRecent.filter((r) => !r.source || r.source === "manual");
          const pipelineReports = visibleRecent.filter((r) => r.source === "pipeline_auto");
          const activeReports   = tab === "manual" ? manualReports : pipelineReports;

          const markSeen = (key: string) => {
            setSeenReports(prev => {
              const next = new Set(prev);
              next.add(key);
              try { localStorage.setItem("seenReports", JSON.stringify(Array.from(next))); } catch { /* ignore */ }
              return next;
            });
          };

          const ReportRow = ({ r }: { r: ReportPreview }) => {
            const dir = r.direction ?? "PASS";
            const ds = DIRECTION_STYLE[dir] ?? DIRECTION_STYLE.PASS;
            const cv = r.conviction;
            const cvColor = cv == null ? "#8E959D" : cv >= 70 ? "#4DB887" : cv >= 40 ? "#E39A57" : "#E2706A";
            const rowKey = r.filename ?? `${r.ticker}_${r.date}`;
            const isDeleting = deleting === rowKey;
            const seenKey = `${r.ticker}_${r.date}`;
            const isNew = !seenReports.has(seenKey);
            return (
              <div className="relative group">
                <Link href={r.filename ? `/reports/adhoc/${r.ticker}?file=${encodeURIComponent(r.filename)}` : `/reports/adhoc/${r.ticker}`} onClick={() => markSeen(seenKey)}>
                  <div className={`card p-4 hover:border-line-strong transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${isDeleting ?"opacity-40":""}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${ds}`}>{dir}</span>
                      <div>
                        <span className="text-sm font-bold text-ink-1">{r.ticker}</span>
                        <span className="text-xs text-ink-3 ml-2">{r.company_name}</span>
                        {isNew && (
                          <span className="ml-2 text-micro font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 align-middle">NEW</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      {cv != null && (
                        <div>
                          <p className="text-micro text-ink-3">Conviction</p>
                          <p className="text-sm font-bold" style={{ color: cvColor }}>{cv}</p>
                        </div>
                      )}
                      {r.expected_return_12m && (
                        <div>
                          <p className="text-micro text-ink-3">12M Return</p>
                          <p className="text-xs text-ink-1">{r.expected_return_12m}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-micro text-ink-3">{r.date}</p>
                      </div>
                      <div className="w-6" />
                    </div>
                  </div>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); deleteReport(r.ticker, r.date, r.filename); }}
                  disabled={!!deleting}
                  title={`Delete ${r.ticker} cache`}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-loss/50 hover:text-loss disabled:opacity-20 p-1.5 rounded-lg hover:bg-loss/8"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
                  </svg>
                </button>
              </div>
            );
          };

          return (
            <div>
              {/* Tab toggle */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setTab("manual")}
                  className={`text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
 tab ==="manual"
 ?"border-accent/50 text-accent bg-accent/10"
 :"border-line text-ink-3 bg-raised/50 hover:border-line hover:text-ink-2"
 }`}
                >
                  My Research{manualReports.length > 0 ? ` (${manualReports.length})` : ""}
                </button>
                <button
                  onClick={() => setTab("pipeline")}
                  className={`text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
 tab ==="pipeline"
 ?"border-ink-3/50 text-ink-2 bg-ink-3/10"
 :"border-line text-ink-3 bg-raised/50 hover:border-line hover:text-ink-2"
 }`}
                >
                  Pipeline Research{pipelineReports.length > 0 ? ` (${pipelineReports.length})` : ""}
                </button>
                {tab === "pipeline" && pipelineReports.length > 0 && (
                  <button
                    onClick={() => deleteAll(pipelineReports, "pipeline")}
                    disabled={deleting === "all"}
                    className="ml-auto text-micro text-loss/60 hover:text-loss transition-all disabled:opacity-40 flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
                    </svg>
                    {deleting === "all" ? "Deleting…" : "Clear all"}
                  </button>
                )}
              </div>

              {/* Active tab content — grouped into day "folders" (API already
                  sorts activeReports newest-first, so contiguous same-date
                  runs group correctly without re-sorting) */}
              {activeReports.length > 0 ? (() => {
                const dayGroups: { date: string; reports: ReportPreview[] }[] = [];
                for (const r of activeReports) {
                  const last = dayGroups[dayGroups.length - 1];
                  if (last && last.date === r.date) last.reports.push(r);
                  else dayGroups.push({ date: r.date, reports: [r] });
                }
                return (
                  <div className="space-y-1">
                    {dayGroups.map(({ date, reports }, idx) => {
                      const isMostRecent = idx === 0;
                      const isExpanded = toggledDays.has(date) ? !isMostRecent : isMostRecent;
                      return (
                        <div key={date || `unknown-${idx}`}>
                          <button
                            onClick={() => toggleDay(date)}
                            className="w-full flex items-center gap-2 py-2 text-left cursor-pointer group/day"
                          >
                            <svg
                              className={`w-3 h-3 text-ink-3 transition-transform shrink-0 ${isExpanded ?"rotate-90":""}`}
                              viewBox="0 0 16 16" fill="currentColor"
                            >
                              <path d="M6 4l4 4-4 4V4z" />
                            </svg>
                            <span className="text-xs font-semibold text-ink-2 group-hover/day:text-ink-1 transition-colors whitespace-nowrap">
                              {formatDayLabel(date)}
                            </span>
                            <span className="text-micro text-ink-3 whitespace-nowrap">
                              ({reports.length})
                            </span>
                            <div className="flex-1 border-t border-line ml-1" />
                          </button>
                          {isExpanded && (
                            <div className="space-y-2 mb-3">
                              {reports.map((r) => <ReportRow key={r.filename ?? `${r.ticker}_${r.date}`} r={r} />)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <p className="text-xs text-ink-3 text-center py-8">
                  {tab === "manual"
                    ? "No manual research yet — run an analysis above."
                    : "No pipeline reports yet — auto-generated for debated & entered stocks."}
                </p>
              )}
            </div>
          );
        })()}

        {recent.filter(r => !deletedFiles.has(r.filename ?? `${r.ticker}_${r.date}`)).length === 0 && status === "idle" && (
          <p className="text-xs text-ink-3 text-center mt-8">No cached reports yet. Run your first analysis above.</p>
        )}
      </div>
    </div>
  );
}
