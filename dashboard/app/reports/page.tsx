"use client";

import React, { useEffect, useState } from "react";

interface AgentFinding { agent: string; finding: string; }
interface Decision { ticker: string; action: string; conviction: number; thesis: string; }
interface ScorecardRow {
  ticker: string;
  composite_score: number | null;
  fundamental_score: number | null;
  quant_score: number | null;
  sentiment_score: number | null;
  agent_spread: number | null;
  conflict_flag: boolean;
  direction: string | null;
  was_debated: boolean;
  debate_reason: string | null;
  action: string;
  investment_thesis: string | null;
  key_risks: string[];
  key_catalysts: string[];
  conviction: number | null;
  fundamental_summary: string | null;
  quant_summary: string | null;
  sentiment_summary: string | null;
  upside_pct: number | null;
  debate_detail: Record<string, unknown> | null;
}
interface PipelineFunnel { analyzed: number; debated: number; entered: number; }
interface Report {
  date: string; macro_regime: string; new_positions: number; exits: number;
  holds: number; increases: number; decreases: number;
  daily_pnl: string; daily_pnl_pct?: string | null; daily_pnl_date?: string | null;
  summary: string; narrative: string; agent_findings: AgentFinding[];
  decisions: Decision[];
  open_positions_after?: number; market_closed?: boolean;
  benchmark_summary?: string | null; benchmark_alpha_1w?: number | null;
  pipeline_funnel?: PipelineFunnel | null;
  scorecards_summary?: ScorecardRow[] | null;
}

function RegimeBadge({ regime }: { regime: string }) {
  if (regime === "RISK-ON") return <span className="badge-risk-on">{regime}</span>;
  if (regime === "RISK-OFF") return <span className="badge-risk-off">{regime}</span>;
  return <span className="badge-neutral">{regime}</span>;
}

function ScoreBar({ score, label }: { score: number | null; label: string }) {
  if (score == null) return <span className="text-[#3D4655] text-[10px]">—</span>;
  const color = score >= 70 ? "#10B981" : score >= 50 ? "#F5A623" : "#EF4444";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 rounded-full bg-white/08 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono" style={{ color }}>{score}</span>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  if (!action) return null;
  const isEntry = action.includes("enter");
  const isExit  = action.includes("exit");
  const isHold  = action.includes("hold");
  const color   = isEntry ? "#10B981" : isExit ? "#EF4444" : isHold ? "#6B7280" : "#3D4655";
  const label   = action.replace(/_/g, " ");
  return (
    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}20` }}>
      {label}
    </span>
  );
}

function ScorecardTable({ rows }: { rows: ScorecardRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-[#3D4655] uppercase tracking-wider border-b border-white/06">
            <th className="text-left py-2 pr-3 font-semibold">Ticker</th>
            <th className="text-center py-2 px-2 font-semibold">Score</th>
            <th className="text-center py-2 px-2 font-semibold hidden sm:table-cell">Fund</th>
            <th className="text-center py-2 px-2 font-semibold hidden sm:table-cell">Quant</th>
            <th className="text-center py-2 px-2 font-semibold hidden sm:table-cell">Sent</th>
            <th className="text-center py-2 px-2 font-semibold hidden md:table-cell">Spread</th>
            <th className="text-center py-2 px-2 font-semibold">Debated</th>
            <th className="text-left py-2 pl-2 font-semibold">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expanded === row.ticker;
            const hasDetail = !!(row.investment_thesis || row.fundamental_summary || row.quant_summary || row.sentiment_summary || row.key_risks?.length || row.key_catalysts?.length);
            return (
              <React.Fragment key={row.ticker}>
                <tr
                  className={`border-b border-white/04 ${hasDetail ? "cursor-pointer hover:bg-white/[0.02]" : ""}`}
                  onClick={() => hasDetail && setExpanded(isOpen ? null : row.ticker)}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[#E8EDF2]">{row.ticker}</span>
                      {row.conflict_flag && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#EF4444]/15 text-[#EF4444]">conflict</span>
                      )}
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-2">
                    <span className={`font-mono font-bold ${(row.composite_score ?? 0) >= 65 ? "text-[#10B981]" : (row.composite_score ?? 0) >= 50 ? "text-[#F5A623]" : "text-[#EF4444]"}`}>
                      {row.composite_score ?? "—"}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-2 hidden sm:table-cell">
                    <ScoreBar score={row.fundamental_score} label="F" />
                  </td>
                  <td className="text-center py-2.5 px-2 hidden sm:table-cell">
                    <ScoreBar score={row.quant_score} label="Q" />
                  </td>
                  <td className="text-center py-2.5 px-2 hidden sm:table-cell">
                    <ScoreBar score={row.sentiment_score} label="S" />
                  </td>
                  <td className="text-center py-2.5 px-2 hidden md:table-cell">
                    <span className={`font-mono text-[10px] ${(row.agent_spread ?? 0) >= 20 ? "text-[#F59E0B]" : "text-[#3D4655]"}`}>
                      {row.agent_spread ?? "—"}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-2">
                    {row.was_debated ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B]">
                        {row.debate_reason === "likely_entry" ? "mandatory" : "contested"}
                      </span>
                    ) : (
                      <span className="text-[#3D4655] text-[10px]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-2">
                    <div className="flex items-center gap-1.5">
                      <ActionBadge action={row.action} />
                      {hasDetail && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3D4655" strokeWidth="2"
                          className={`transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}>
                          <polyline points="6,9 12,15 18,9" />
                        </svg>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && hasDetail && (
                  <tr key={`${row.ticker}-detail`} className="bg-white/[0.015]">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="space-y-3">
                        {/* Agent views — bull vs bear framing */}
                        {(row.fundamental_score != null || row.quant_score != null || row.sentiment_score != null) && (
                          <div>
                            <p className="text-[10px] text-[#3D4655] uppercase tracking-wider font-semibold mb-2">Agent views</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {[
                                { agent: "Fundamental", score: row.fundamental_score, view: row.fundamental_summary },
                                { agent: "Quant", score: row.quant_score, view: row.quant_summary },
                                { agent: "Sentiment", score: row.sentiment_score, view: row.sentiment_summary },
                              ].map(({ agent, score, view }) => {
                                const isBull = (score ?? 0) >= 65;
                                const isBear = (score ?? 0) < 50;
                                return (
                                  <div key={agent} className={`rounded-lg p-3 border ${isBull ? "border-[#10B981]/20 bg-[#10B981]/05" : isBear ? "border-[#EF4444]/20 bg-[#EF4444]/05" : "border-white/06 bg-white/02"}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[10px] font-bold text-[#E8EDF2]">{agent}</span>
                                      <span className={`text-[10px] font-mono font-bold ${isBull ? "text-[#10B981]" : isBear ? "text-[#EF4444]" : "text-[#F5A623]"}`}>
                                        {score ?? "—"}/100
                                        {isBull ? " ▲" : isBear ? " ▼" : ""}
                                      </span>
                                    </div>
                                    {view && <p className="text-[10px] text-[#6B7280] leading-relaxed">{view}</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {/* Investment thesis */}
                        {row.investment_thesis && (
                          <div>
                            <p className="text-[10px] text-[#3D4655] uppercase tracking-wider font-semibold mb-1">Committee thesis</p>
                            <p className="text-xs text-[#6B7280] leading-relaxed">{row.investment_thesis}</p>
                          </div>
                        )}
                        {/* Catalysts */}
                        {row.key_catalysts?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#3D4655] uppercase tracking-wider font-semibold mb-1">Key catalysts</p>
                            <ul className="space-y-0.5">
                              {row.key_catalysts.map((c, i) => (
                                <li key={i} className="text-[10px] text-[#6B7280] flex gap-1.5">
                                  <span className="text-[#10B981] flex-shrink-0">→</span> {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* Risks */}
                        {row.key_risks?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#3D4655] uppercase tracking-wider font-semibold mb-1">Key risks</p>
                            <ul className="space-y-0.5">
                              {row.key_risks.map((r, i) => (
                                <li key={i} className="text-[10px] text-[#6B7280] flex gap-1.5">
                                  <span className="text-[#EF4444] flex-shrink-0">⚠</span> {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgentFindingCard({ finding }: { finding: AgentFinding }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = finding.finding.length > 160;
  return (
    <button
      className="flex gap-3 p-3 rounded-xl bg-white/[0.02] text-left w-full hover:bg-white/[0.04] transition-colors"
      onClick={() => isLong && setExpanded(!expanded)}
    >
      <div className="w-1 rounded-full bg-[#F5A623]/40 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#E8EDF2] mb-0.5">{finding.agent}</p>
        <p className="text-xs text-[#6B7280] leading-relaxed">
          {expanded || !isLong ? finding.finding : finding.finding.slice(0, 160) + "…"}
        </p>
        {isLong && (
          <p className="text-[10px] text-[#F5A623] mt-1">{expanded ? "Show less" : "Show more"}</p>
        )}
      </div>
    </button>
  );
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
                <span className="text-[#F5A623]">{report.increases} increases</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className={`font-mono font-semibold text-sm ${
                report.daily_pnl.startsWith("+") ? "text-[#10B981]" : "text-[#EF4444]"
              }`}>
                {report.daily_pnl}
                {report.daily_pnl_pct && (
                  <span className="font-normal opacity-70 ml-1">{report.daily_pnl_pct}</span>
                )}
              </span>
              <span className="block text-[10px] text-[#6B7280] mt-0.5">
                {report.daily_pnl_date
                  ? `${report.daily_pnl_date} full day`
                  : "prev trading day"}
              </span>
            </div>
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

          {/* Pipeline funnel */}
          {report.pipeline_funnel && (
            <div>
              <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3">Pipeline Funnel</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "Analysed", value: report.pipeline_funnel.analyzed, color: "#6B7280" },
                  { label: "Debated", value: report.pipeline_funnel.debated, color: "#F59E0B" },
                  { label: "Entered", value: report.pipeline_funnel.entered, color: "#10B981" },
                ].map(({ label, value, color }, i, arr) => (
                  <React.Fragment key={label}>
                    <div className="flex flex-col items-center px-4 py-2 rounded-xl bg-white/[0.02] border border-white/06">
                      <span className="font-mono font-bold text-lg" style={{ color }}>{value}</span>
                      <span className="text-[10px] text-[#3D4655] uppercase tracking-wider mt-0.5">{label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D4655" strokeWidth="2">
                        <polyline points="9,18 15,12 9,6" />
                      </svg>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Stocks reviewed this run */}
          {report.scorecards_summary && report.scorecards_summary.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3">
                Stocks Reviewed ({report.scorecards_summary.length})
                <span className="ml-2 font-normal text-[#3D4655] normal-case tracking-normal">click a row to expand agent views &amp; risks</span>
              </h3>
              <ScorecardTable rows={report.scorecards_summary} />
            </div>
          )}

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
                      <div className="text-xs font-mono text-[#F5A623] self-start whitespace-nowrap">
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
                  <AgentFindingCard key={f.agent} finding={f} />
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
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">Daily Reports</h1>
            <p className="text-[#6B7280] text-sm mt-1">
              Committee narratives and daily pipeline decisions
            </p>
          </div>
          <a
            href="/reports/adhoc"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-[#F5A623] border border-[#F5A623]/30 bg-[#F5A623]/08 hover:bg-[#F5A623]/14 transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Research any ticker
          </a>
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
