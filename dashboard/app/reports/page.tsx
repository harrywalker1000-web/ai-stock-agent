"use client";

import { useEffect, useState } from "react";

interface AgentFinding { agent: string; finding: string; }
interface Decision { ticker: string; action: string; conviction: number; thesis: string; }
interface Report {
  date: string; macro_regime: string; new_positions: number; exits: number;
  holds: number; increases: number; decreases: number; daily_pnl: string;
  summary: string; narrative: string; agent_findings: AgentFinding[];
  decisions: Decision[];
}

function RegimeBadge({ regime }: { regime: string }) {
  if (regime === "RISK-ON") return <span className="badge-risk-on">{regime}</span>;
  if (regime === "RISK-OFF") return <span className="badge-risk-off">{regime}</span>;
  return <span className="badge-neutral">{regime}</span>;
}

function ReportCard({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      {/* Header row — always visible */}
      <button
        className="w-full text-left p-6 hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm text-[#6B7280]">{report.date}</span>
            <RegimeBadge regime={report.macro_regime} />
            <div className="flex items-center gap-2 text-xs">
              {report.new_positions > 0 && (
                <span className="text-[#10B981]">+{report.new_positions} new</span>
              )}
              {report.exits > 0 && (
                <span className="text-[#EF4444]">{report.exits} exits</span>
              )}
              {report.holds > 0 && (
                <span className="text-[#6B7280]">{report.holds} holds</span>
              )}
              {report.increases > 0 && (
                <span className="text-[#0EA5E9]">{report.increases} increases</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-mono font-semibold text-sm ${
              report.daily_pnl.startsWith("+") ? "text-[#10B981]" : "text-[#EF4444]"
            }`}>
              {report.daily_pnl}
            </span>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#6B7280" strokeWidth="2"
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            >
              <polyline points="6,9 12,15 18,9" />
            </svg>
          </div>
        </div>
        <p className="text-sm text-[#6B7280] mt-3 text-left">{report.summary}</p>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-white/06 p-6 space-y-6">
          {/* Full narrative */}
          <div>
            <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3">Committee Narrative</h3>
            <div className="text-sm text-[#6B7280] leading-relaxed space-y-3">
              {report.narrative.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>

          {/* Decisions */}
          {report.decisions?.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3">Decisions</h3>
              <div className="space-y-2">
                {report.decisions.map((d) => {
                  const color = d.action === "skip" || d.action === "exit" || d.action.includes("short")
                    ? "#EF4444" : "#10B981";
                  return (
                    <div key={d.ticker} className="flex gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/06">
                      <span className="font-mono font-bold text-[#E8EDF2] w-12">{d.ticker}</span>
                      <span
                        className="text-xs font-bold uppercase px-2 py-0.5 rounded-md self-start whitespace-nowrap"
                        style={{ color, background: `${color}20` }}
                      >
                        {d.action.replace("_", " ")}
                      </span>
                      <div className="flex-1">
                        <p className="text-xs text-[#6B7280]">{d.thesis}</p>
                      </div>
                      <div className="text-xs font-mono text-[#0EA5E9] self-start whitespace-nowrap">
                        {d.conviction}/100
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agent findings */}
          {report.agent_findings?.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3">Agent Findings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {report.agent_findings.map((f) => (
                  <div key={f.agent} className="flex gap-3 p-3 rounded-xl bg-white/[0.02]">
                    <div className="w-1 rounded-full bg-[#0EA5E9]/40 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-[#E8EDF2] mb-0.5">{f.agent}</p>
                      <p className="text-xs text-[#6B7280]">{f.finding}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => { setReports(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#080C10] pb-16">
      <div className="max-w-5xl mx-auto px-6 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">Daily Reports</h1>
          <p className="text-[#6B7280] text-sm mt-1">
            Committee narratives and daily pipeline decisions
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-6">
                <div className="flex gap-4 mb-3">
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-4 w-16" />
                </div>
                <div className="skeleton h-3 w-full mb-2" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-white/05">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h3 className="font-display text-lg font-bold text-[#E8EDF2] mb-2">No reports yet</h3>
            <p className="text-[#6B7280] text-sm">Daily reports will appear here after each pipeline run.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((r, i) => (
              <ReportCard key={r.date ?? i} report={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
