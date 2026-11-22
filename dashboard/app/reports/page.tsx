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
interface Mover {
  ticker: string; contribution: number; move_pct: number;
  sector?: string | null; sector_move_pct?: number | null; why?: string | null;
}
interface BriefingTrade { ticker: string; action: string; verb: string; shares: number; notional: number; why?: string | null; }
interface Briefing {
  headline: string;
  pnl?: {
    date: string; abs: number; pct: number; spy_pct?: number | null;
    movers?: Mover[]; other?: number | null; why?: string | null;
  } | null;
  trades: BriefingTrade[];
  not_executed: { ticker: string; reason: string }[];
  watch: string[];
  market?: { mood?: string | null; themes: MarketTheme[] } | null;
}
interface MarketTheme {
  title: string; what_happened?: string; why_it_matters?: string; next?: string;
  our_exposure?: { ticker: string; effect: string; why?: string }[];
}
interface Report {
  briefing?: Briefing | null;
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

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-ink-3 text-micro">—</span>;
  const color = score >= 70 ? "#4DB887" : score >= 50 ? "#C8A15A" : "#E2706A";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 rounded-full bg-raised overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-micro" style={{ color }}>{score}</span>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  if (!action) return null;
  const isEntry = action.includes("enter");
  const isExit  = action.includes("exit");
  const isHold  = action.includes("hold");
  const color   = isEntry ? "#4DB887" : isExit ? "#E2706A" : isHold ? "#8E959D" : "#8E959D";
  const label   = action.replace(/_/g, " ");
  return (
    <span className="text-micro font-bold px-1.5 py-0.5 rounded"
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
          <tr className="text-micro text-ink-3 border-b border-line">
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
                  className={`border-b border-line ${hasDetail ?"cursor-pointer hover:bg-white/[0.02]":""}`}
                  onClick={() => hasDetail && setExpanded(isOpen ? null : row.ticker)}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-ink-1">{row.ticker}</span>
                      {row.conflict_flag && (
                        <span className="text-micro font-bold px-1 py-0.5 rounded bg-loss/15 text-loss">conflict</span>
                      )}
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-2">
                    <span className={`font-bold ${(row.composite_score ?? 0) >= 65 ?"text-gain": (row.composite_score ?? 0) >= 50 ?"text-accent":"text-loss"}`}>
                      {row.composite_score ?? "—"}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-2 hidden sm:table-cell">
                    <ScoreBar score={row.fundamental_score} />
                  </td>
                  <td className="text-center py-2.5 px-2 hidden sm:table-cell">
                    <ScoreBar score={row.quant_score} />
                  </td>
                  <td className="text-center py-2.5 px-2 hidden sm:table-cell">
                    <ScoreBar score={row.sentiment_score} />
                  </td>
                  <td className="text-center py-2.5 px-2 hidden md:table-cell">
                    <span className={`text-micro ${(row.agent_spread ?? 0) >= 20 ?"text-caution":"text-ink-3"}`}>
                      {row.agent_spread ?? "—"}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-2">
                    {row.was_debated ? (
                      <span className="text-micro font-bold px-1.5 py-0.5 rounded bg-caution/15 text-caution">
                        {row.debate_reason === "likely_entry" ? "mandatory" : "contested"}
                      </span>
                    ) : (
                      <span className="text-ink-3 text-micro">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-2">
                    <div className="flex items-center gap-1.5">
                      <ActionBadge action={row.action} />
                      {hasDetail && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8E959D" strokeWidth="2"
                          className={`transition-transform duration-150 ${isOpen ?"rotate-180":""}`}>
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
                            <p className="text-micro text-ink-3 font-semibold mb-2">Agent views</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {[
                                { agent: "Fundamental", score: row.fundamental_score, view: row.fundamental_summary },
                                { agent: "Quant", score: row.quant_score, view: row.quant_summary },
                                { agent: "Sentiment", score: row.sentiment_score, view: row.sentiment_summary },
                              ].map(({ agent, score, view }) => {
                                const isBull = (score ?? 0) >= 65;
                                const isBear = (score ?? 0) < 50;
                                return (
                                  <div key={agent} className={`rounded-lg p-3 border ${isBull ?"border-gain/20 bg-gain/5": isBear ?"border-loss/20 bg-loss/5":"border-line bg-raised/50"}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-micro font-bold text-ink-1">{agent}</span>
                                      <span className={`text-micro font-bold ${isBull ?"text-gain": isBear ?"text-loss":"text-accent"}`}>
                                        {score ?? "—"}/100
                                        {isBull ? " ▲" : isBear ? " ▼" : ""}
                                      </span>
                                    </div>
                                    {view && <p className="text-micro text-ink-3 leading-relaxed">{view}</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {/* Investment thesis */}
                        {row.investment_thesis && (
                          <div>
                            <p className="text-micro text-ink-3 font-semibold mb-1">Committee thesis</p>
                            <p className="text-xs text-ink-3 leading-relaxed">{row.investment_thesis}</p>
                          </div>
                        )}
                        {/* Catalysts */}
                        {row.key_catalysts?.length > 0 && (
                          <div>
                            <p className="text-micro text-ink-3 font-semibold mb-1">Key catalysts</p>
                            <ul className="space-y-0.5">
                              {row.key_catalysts.map((c, i) => (
                                <li key={i} className="text-micro text-ink-3 flex gap-1.5">
                                  <span className="text-gain flex-shrink-0">→</span> {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* Risks */}
                        {row.key_risks?.length > 0 && (
                          <div>
                            <p className="text-micro text-ink-3 font-semibold mb-1">Key risks</p>
                            <ul className="space-y-0.5">
                              {row.key_risks.map((r, i) => (
                                <li key={i} className="text-micro text-ink-3 flex gap-1.5">
                                  <span className="text-loss flex-shrink-0">⚠</span> {r}
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
      <div className="w-1 rounded-full bg-accent/40 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-1 mb-0.5">{finding.agent}</p>
        <p className="text-xs text-ink-3 leading-relaxed">
          {expanded || !isLong ? finding.finding : finding.finding.slice(0, 160) + "…"}
        </p>
        {isLong && (
          <p className="text-micro text-accent mt-1">{expanded ? "Show less" : "Show more"}</p>
        )}
      </div>
    </button>
  );
}

function fmtMoney(n: number) {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const TRADE_COLORS: Record<string, string> = {
  enter_long: "#4DB887", enter_short: "#4DB887", increase: "#4DB887",
  decrease: "#C8A15A", exit: "#E2706A", reverse: "#C8A15A",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold text-ink-3 mb-3">{children}</h3>;
}

function BriefingView({ b }: { b: Briefing }) {
  const pnl = b.pnl;
  return (
    <div className="space-y-6">
      {pnl && (
        <div>
          <SectionTitle>How we did · {pnl.date}</SectionTitle>
          <div className="flex items-baseline gap-3 flex-wrap mb-2">
            <span className={`font-bold text-2xl ${pnl.abs >= 0 ?"text-gain":"text-loss"}`}>
              {fmtMoney(pnl.abs)}
            </span>
            <span className={`text-sm ${pnl.pct >= 0 ?"text-gain":"text-loss"}`}>
              {pnl.pct >= 0 ? "+" : ""}{pnl.pct.toFixed(2)}%
            </span>
            {pnl.spy_pct != null && (
              <span className="text-xs text-ink-3">
                S&amp;P 500 {pnl.spy_pct >= 0 ? "+" : ""}{pnl.spy_pct.toFixed(2)}%
              </span>
            )}
          </div>
          {pnl.why && <p className="text-sm text-ink-2 mb-3">{pnl.why}</p>}
          {pnl.movers && pnl.movers.length > 0 && (
            <div className="space-y-1.5">
              {pnl.movers.map((m) => (
                <div key={m.ticker} className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-line">
                  <span className="font-bold text-ink-1 w-14 shrink-0">{m.ticker}</span>
                  <span className={`text-sm w-20 shrink-0 ${m.contribution >= 0 ?"text-gain":"text-loss"}`}>
                    {fmtMoney(m.contribution)}
                  </span>
                  <span className={`text-xs w-14 shrink-0 pt-0.5 ${m.move_pct >= 0 ?"text-gain":"text-loss"}`}>
                    {m.move_pct >= 0 ? "+" : ""}{m.move_pct.toFixed(1)}%
                  </span>
                  <span className="text-xs text-ink-2 pt-0.5">{m.why ?? ""}</span>
                </div>
              ))}
              {(() => {
                // Recomputed so the rows always add up to the day's P&L — older reports
                // stored a residual after ALL positions while listing only the top movers.
                const other = typeof pnl.abs === "number"
                  ? pnl.abs - pnl.movers!.reduce((sum, m) => sum + (m.contribution ?? 0), 0)
                  : pnl.other;
                return other != null && Math.abs(other) >= 1 ? (
                  <p className="text-micro text-ink-3 pl-1">
                    Everything else (smaller positions, trades during the day): {fmtMoney(other)}
                  </p>
                ) : null;
              })()}
            </div>
          )}
        </div>
      )}

      {b.market && b.market.themes.length > 0 && (
        <div>
          <SectionTitle>What&apos;s moving markets</SectionTitle>
          {b.market.mood && <p className="text-sm text-ink-2 mb-3">{b.market.mood}</p>}
          <div className="space-y-2">
            {b.market.themes.map((t, i) => (
              <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-line">
                <p className="text-sm font-semibold text-ink-1">{t.title}</p>
                {t.what_happened && <p className="text-xs text-ink-2 mt-1">{t.what_happened}</p>}
                {t.why_it_matters && <p className="text-xs text-ink-3 mt-1">{t.why_it_matters}</p>}
                {t.our_exposure && t.our_exposure.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {t.our_exposure.map((e) => {
                      const c = e.effect === "positive" ? "#4DB887" : e.effect === "negative" ? "#E2706A" : "#C8A15A";
                      return (
                        <span key={e.ticker} title={e.why ?? ""} className="text-micro px-2 py-0.5 rounded-md"
                          style={{ color: c, background: `${c}20` }}>
                          {e.ticker} {e.effect === "positive" ? "▲" : e.effect === "negative" ? "▼" : "◆"}
                          {e.why ? <span className="font-sans opacity-80"> · {e.why}</span> : null}
                        </span>
                      );
                    })}
                  </div>
                )}
                {t.next && <p className="text-micro text-ink-3 mt-2">Next: {t.next}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>What we did today</SectionTitle>
        {b.trades.length === 0 ? (
          <p className="text-sm text-ink-3">No trades — the portfolio was left as it was.</p>
        ) : (
          <div className="space-y-1.5">
            {b.trades.map((t, i) => {
              const color = TRADE_COLORS[t.action] ?? "#8E959D";
              return (
                <div key={`${t.ticker}-${i}`} className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-line">
                  <span
                    className="text-micro font-bold px-2 py-0.5 rounded-md whitespace-nowrap w-20 text-center shrink-0"
                    style={{ color, background: `${color}20` }}
                  >
                    {t.verb}
                  </span>
                  <span className="font-bold text-ink-1 w-14 shrink-0">{t.ticker}</span>
                  <span className="text-xs text-ink-3 w-20 shrink-0 pt-0.5">
                    ${Math.round(t.notional).toLocaleString("en-US")}
                  </span>
                  <span className="text-xs text-ink-2 pt-0.5">{t.why ?? ""}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {b.not_executed.length > 0 && (
        <div>
          <SectionTitle>Wanted, but didn&apos;t happen</SectionTitle>
          <ul className="space-y-1">
            {b.not_executed.map((n) => (
              <li key={n.ticker} className="text-xs text-ink-3">
                <span className="font-bold text-ink-2 mr-2">{n.ticker}</span>{n.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {b.watch.length > 0 && (
        <div>
          <SectionTitle>What to watch</SectionTitle>
          <ul className="space-y-1 list-disc pl-4">
            {b.watch.map((w, i) => <li key={i} className="text-sm text-ink-2">{w}</li>)}
          </ul>
        </div>
      )}
    </div>
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
            <span className="text-sm text-ink-3">{report.date}</span>
            <RegimeBadge regime={report.macro_regime} />
            <div className="flex items-center gap-2 text-xs">
              {report.briefing ? (
                <>
                  {report.new_positions > 0 && <span className="text-gain">{report.new_positions} bought</span>}
                  {report.increases > 0 && <span className="text-gain">{report.increases} added to</span>}
                  {report.decreases > 0 && <span className="text-accent">{report.decreases} trimmed</span>}
                  {report.exits > 0 && <span className="text-loss">{report.exits} sold</span>}
                  {report.new_positions + report.increases + report.decreases + report.exits === 0 && (
                    <span className="text-ink-3">no trades</span>
                  )}
                </>
              ) : (
                <>
                  {report.new_positions > 0 && (
                    <span className="text-gain">+{report.new_positions} new</span>
                  )}
                  {report.exits > 0 && (
                    <span className="text-loss">{report.exits} exits</span>
                  )}
                  {report.holds > 0 && (
                    <span className="text-ink-3">{report.holds} holds</span>
                  )}
                  {report.increases > 0 && (
                    <span className="text-accent">{report.increases} increases</span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className={`font-semibold text-sm ${
 report.daily_pnl.startsWith("+") ?"text-gain":"text-loss"
 }`}>
                {report.daily_pnl}
                {report.daily_pnl_pct && (
                  <span className="font-normal opacity-70 ml-1">{report.daily_pnl_pct}</span>
                )}
              </span>
              <span className="block text-micro text-ink-3 mt-0.5">
                {report.daily_pnl_date
                  ? `${report.daily_pnl_date} full day`
                  : "prev trading day"}
              </span>
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#8E959D" strokeWidth="2"
              className={`transition-transform duration-200 ${open ?"rotate-180":""}`}
            >
              <polyline points="6,9 12,15 18,9" />
            </svg>
          </div>
        </div>
        <p className={`text-sm mt-3 text-left ${report.briefing ?"text-[#C9D1D9]":"text-ink-3"}`}>
          {report.summary}
        </p>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-line p-6 space-y-6">
          {report.briefing && <BriefingView b={report.briefing} />}

          {/* Pipeline funnel */}
          {report.pipeline_funnel && (
            <div>
              <h3 className="text-xs font-bold text-ink-3 mb-3">Pipeline Funnel</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "Analysed", value: report.pipeline_funnel.analyzed, color: "#8E959D" },
                  { label: "Debated", value: report.pipeline_funnel.debated, color: "#E39A57" },
                  { label: "Entered", value: report.pipeline_funnel.entered, color: "#4DB887" },
                ].map(({ label, value, color }, i, arr) => (
                  <React.Fragment key={label}>
                    <div className="flex flex-col items-center px-4 py-2 rounded-xl bg-white/[0.02] border border-line">
                      <span className="font-bold text-lg" style={{ color }}>{value}</span>
                      <span className="text-micro text-ink-3 mt-0.5">{label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E959D" strokeWidth="2">
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
              <h3 className="text-xs font-bold text-ink-3 mb-3">
                Stocks Reviewed ({report.scorecards_summary.length})
                <span className="ml-2 font-normal text-ink-3 normal-case tracking-normal">click a row to expand agent views &amp; risks</span>
              </h3>
              <ScorecardTable rows={report.scorecards_summary} />
            </div>
          )}

          {/* Full narrative */}
          <div>
            <h3 className="text-xs font-bold text-ink-3 mb-3">{report.briefing ? "Committee notes (written before sizing — intentions, not trades)" : "Committee Narrative"}</h3>
            <div className="text-sm text-ink-3 leading-relaxed space-y-3">
              {report.narrative.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>

          {/* Decisions */}
          {report.decisions?.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-ink-3 mb-3">{report.briefing ? "Committee decisions (intent)" : "Decisions"}</h3>
              <div className="space-y-2">
                {report.decisions.map((d, di) => {
                  const a = String(d.action ?? "");
                  const color = a === "skip" || a === "exit" || a.includes("short") ? "#E2706A"
                    : a === "decrease" ? "#E39A57"
                    : a === "hold" ? "#B3B8BE"
                    : "#4DB887";
                  return (
                    <div key={`${d.ticker}-${di}`} className="flex gap-4 p-3 rounded-xl bg-white/[0.02] border border-line">
                      <span className="font-bold text-ink-1 w-12">{d.ticker}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-md self-start whitespace-nowrap"
                        style={{ color, background: `${color}20` }}
                      >
                        {a.replace("_", " ")}
                      </span>
                      <div className="flex-1">
                        <p className="text-xs text-ink-3">{d.thesis}</p>
                      </div>
                      <div className="text-xs text-accent self-start whitespace-nowrap">
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
              <h3 className="text-xs font-bold text-ink-3 mb-3">Agent Findings</h3>
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const PAGE = 20;

  const loadPage = async (offset: number) => {
    const r = await fetch(`/api/reports?limit=${PAGE}&offset=${offset}`);
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !Array.isArray(d.reports)) throw new Error(d?.error ?? `HTTP ${r.status}`);
    setHasMore(!!d.has_more);
    setTotal(Number(d.total) || 0);
    return d.reports as Report[];
  };

  useEffect(() => {
    loadPage(0)
      .then((rs) => setReports(rs))
      .catch((e) => setError(`Could not load reports — ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await loadPage(reports.length);
      setReports((prev) => [...prev, ...more]);
    } catch (e) {
      setError(`Could not load older reports — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <div className="max-w-5xl mx-auto px-6 pt-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-serif text-h1 font-medium text-ink-1">Daily reports</h1>
            <p className="mt-2 text-lead text-ink-2">
              What the committee decided each weekday, and how the portfolio performed the day before.
            </p>
          </div>
          <a
            href="/reports/adhoc"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-accent border border-accent/30 bg-accent/8 hover:bg-accent/14 transition-all"
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
        ) : error && reports.length === 0 ? (
          <div className="card p-10 text-center border border-loss/30">
            <h3 className="font-serif text-h3 font-medium text-loss mb-2">Data unavailable</h3>
            <p className="text-ink-3 text-sm">{error}</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-raised/50">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8E959D" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h3 className="font-serif text-h3 font-medium text-ink-1 mb-2">No reports yet</h3>
            <p className="text-ink-3 text-sm">Daily reports will appear here after each pipeline run.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((r, i) => (
              <ReportCard key={r.date ?? i} report={r} />
            ))}
            {error && <p className="text-xs text-loss text-center">{error}</p>}
            {hasMore && (
              <div className="text-center pt-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm text-accent hover:text-accent font-medium transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : `Load older reports (${total - reports.length} more)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
