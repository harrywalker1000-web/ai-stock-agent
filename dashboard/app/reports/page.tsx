"use client";

/**
 * Daily reports — "the morning note".
 * Left: a ledger of sessions (date, regime, P&L with a diverging bar — the real run of
 * good and bad days at a glance). Right: the selected day as an editorial note.
 * The committee's working sits behind one disclosure; it is reference, not the story.
 */
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, EmptyState, Skeleton, Ticker } from "@/components/ui/primitives";
import { IconChevronDown } from "@/components/ui/icons";

interface AgentFinding { agent: string; finding: string; }
interface Decision { ticker: string; action: string; conviction: number; thesis: string; }
interface ScorecardRow {
  ticker: string; composite_score: number | null; fundamental_score: number | null; quant_score: number | null;
  sentiment_score: number | null; agent_spread: number | null; conflict_flag: boolean; direction: string | null;
  was_debated: boolean; debate_reason: string | null; action: string; investment_thesis: string | null;
  key_risks: string[]; key_catalysts: string[]; conviction: number | null; fundamental_summary: string | null;
  quant_summary: string | null; sentiment_summary: string | null; upside_pct: number | null;
  debate_detail: Record<string, unknown> | null;
}
interface PipelineFunnel { analyzed: number; debated: number; entered: number; }
interface Mover { ticker: string; contribution: number; move_pct: number; sector?: string | null; sector_move_pct?: number | null; why?: string | null; }
interface BriefingTrade { ticker: string; action: string; verb: string; shares: number; notional: number; why?: string | null; }
interface MarketTheme { title: string; what_happened?: string; why_it_matters?: string; next?: string; our_exposure?: { ticker: string; effect: string; why?: string }[]; }
interface Briefing {
  headline: string;
  pnl?: { date: string; abs: number; pct: number; spy_pct?: number | null; movers?: Mover[]; other?: number | null; why?: string | null } | null;
  trades: BriefingTrade[]; not_executed: { ticker: string; reason: string }[]; watch: string[];
  market?: { mood?: string | null; themes: MarketTheme[] } | null;
}
interface Report {
  briefing?: Briefing | null;
  date: string; macro_regime: string; new_positions: number; exits: number; holds: number; increases: number; decreases: number;
  daily_pnl: string; daily_pnl_pct?: string | null; daily_pnl_date?: string | null;
  summary: string; narrative: string; agent_findings: AgentFinding[]; decisions: Decision[];
  open_positions_after?: number; market_closed?: boolean; pipeline_funnel?: PipelineFunnel | null;
  scorecards_summary?: ScorecardRow[] | null;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
const money = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const pct = (n: number, d = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}%`;
const tone = (n: number) => (n > 0 ? "text-gain" : n < 0 ? "text-loss" : "text-ink-2");
const regimeWord = (r: string) => (r === "RISK-ON" ? "Risk-on" : r === "RISK-OFF" ? "Risk-off" : r ? r.charAt(0) + r.slice(1).toLowerCase() : "—");

/** Day P&L in dollars: briefing figure if present, else parsed from the legacy "+$1,234" string. */
function dayPnl(r: Report): number | null {
  if (r.briefing?.pnl && typeof r.briefing.pnl.abs === "number") return r.briefing.pnl.abs;
  const m = String(r.daily_pnl ?? "").replace(/,/g, "").match(/([+-−]?)\$?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[2]);
  return m[1] === "-" || m[1] === "−" ? -v : v;
}
function dayPct(r: Report): number | null {
  if (r.briefing?.pnl && typeof r.briefing.pnl.pct === "number") return r.briefing.pnl.pct;
  const m = String(r.daily_pnl_pct ?? "").match(/([+-−]?)(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[2]);
  return m[1] === "-" || m[1] === "−" ? -v : v;
}

/* ── Ledger ──────────────────────────────────────────────────────────────── */
function Ledger({ reports, selected, onSelect, maxAbs }: { reports: Report[]; selected: string | null; onSelect: (d: string) => void; maxAbs: number }) {
  return (
    <ol aria-label="Sessions" className="divide-y divide-line border-y border-line">
      {reports.map((r) => {
        const v = dayPnl(r);
        const w = v == null || maxAbs === 0 ? 0 : Math.max(2, (Math.abs(v) / maxAbs) * 50);
        const active = r.date === selected;
        return (
          <li key={r.date}>
            <button onClick={() => onSelect(r.date)} aria-current={active ? "true" : undefined}
              className={`group grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3 text-left transition-colors duration-fast ${
                active ? "bg-raised" : "hover:bg-raised/50"}`}>
              <span className="flex items-baseline gap-2">
                <span className={`text-body ${active ? "text-ink-1 font-medium" : "text-ink-1"}`}>{day(r.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="text-micro text-ink-3">{regimeWord(r.macro_regime)}</span>
              </span>
              <span className={`text-body tabular ${v == null ? "text-ink-3" : tone(v)}`}>{v == null ? "—" : money(v)}</span>
              {/* diverging bar: centre line = $0 */}
              <span aria-hidden className="relative col-span-2 h-1 rounded-full bg-line/60">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong/60" />
                {v != null && v !== 0 && (
                  <span className={`absolute inset-y-0 rounded-full ${v > 0 ? "left-1/2 bg-gain" : "right-1/2 bg-loss"}`} style={{ width: `${w}%` }} />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Attribution: movers + everything else, summing to the day ─────────── */
const GRID = "grid-cols-[112px_88px_minmax(0,1fr)] sm:grid-cols-[120px_96px_minmax(0,200px)_minmax(0,1fr)]";
function Attribution({ pnl }: { pnl: NonNullable<Briefing["pnl"]> }) {
  const movers = pnl.movers ?? [];
  const other = pnl.abs - movers.reduce((s, m) => s + (m.contribution ?? 0), 0);
  const rows = [
    ...movers.map((m) => ({ key: m.ticker, label: <Ticker>{m.ticker}</Ticker>, value: m.contribution, move: m.move_pct, why: m.why })),
    ...(Math.abs(other) >= 1 ? [{ key: "_other", label: <span className="text-label text-ink-3">Everything else</span>, value: other, move: null as number | null, why: "Smaller positions and intraday trades" }] : []),
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div>
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.key} className={`grid ${GRID} items-center gap-x-4 gap-y-1`}>
            <span className="whitespace-nowrap">{r.label}</span>
            <span className={`text-right text-body tabular ${tone(r.value)}`}>
              {money(r.value)}
              {r.move != null && <span className="block text-micro text-ink-3">{pct(r.move, 1)} price</span>}
            </span>
            <span aria-hidden className="relative h-2">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong/70" />
              <span className={`absolute inset-y-0 rounded-sm ${r.value >= 0 ? "left-1/2 bg-gain/80" : "right-1/2 bg-loss/80"}`}
                style={{ width: `${(Math.abs(r.value) / max) * 50}%` }} />
            </span>
            <span className="col-span-3 text-label text-ink-2 sm:col-span-1">{r.why ?? ""}</span>
          </li>
        ))}
      </ul>
      <div className={`mt-4 grid ${GRID} items-baseline gap-x-4 border-t border-line pt-3`}>
        <span className="text-label text-ink-3">Day total</span>
        <span className={`text-right text-body font-medium tabular ${tone(pnl.abs)}`}>{money(pnl.abs)}</span>
      </div>
    </div>
  );
}

/* ── Note sections ───────────────────────────────────────────────────────── */
function NoteSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h3 className="mb-4 font-serif text-h3 text-ink-1">{title}</h3>
      {children}
    </section>
  );
}

const VERB_TONE: Record<string, string> = {
  enter_long: "text-gain", enter_short: "text-gain", increase: "text-gain", decrease: "text-caution", exit: "text-loss", reverse: "text-caution",
};

function Note({ r }: { r: Report }) {
  const b = r.briefing;
  const v = dayPnl(r);
  const p = dayPct(r);
  const [working, setWorking] = useState(false);
  useEffect(() => { setWorking(false); }, [r.date]);

  return (
    <article aria-labelledby="note-title" className="min-w-0">
      <p className="text-label text-ink-3">
        {day(r.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {regimeWord(r.macro_regime)} market
        {r.open_positions_after != null ? ` · ${r.open_positions_after} positions after trading` : ""}
      </p>
      <h2 id="note-title" className="mt-3 max-w-[44ch] font-serif text-[22px] font-medium leading-[1.3] text-ink-1 sm:text-[26px]">
        {b?.headline || r.summary || "No summary recorded for this session."}
      </h2>

      {/* Result line */}
      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className={`font-serif text-figure font-medium tabular ${v == null ? "text-ink-3" : tone(v)}`}>{v == null ? "—" : money(v)}</p>
        <p className="text-lead text-ink-2">
          {p != null && <span className={`tabular ${tone(p)}`}>{pct(p)}</span>}
          {b?.pnl?.spy_pct != null && <span className="text-ink-3"> · S&amp;P 500 <span className="tabular">{pct(b.pnl.spy_pct)}</span></span>}
          <span className="block text-label text-ink-3">
            Result for {r.daily_pnl_date ? day(r.daily_pnl_date, { weekday: "long", day: "numeric", month: "short" }) : "the previous session"}
          </span>
        </p>
      </div>

      <div className="mt-10 space-y-10">
        {b?.pnl && (b.pnl.movers?.length ?? 0) > 0 && (
          <NoteSection title="What moved the portfolio">
            {b.pnl.why && <p className="mb-5 max-w-[65ch] text-body text-ink-2">{b.pnl.why}</p>}
            <Attribution pnl={b.pnl} />
          </NoteSection>
        )}

        {b && (
          <NoteSection title={b.trades.length ? `Trades placed (${b.trades.length})` : "Trades placed"}>
            {b.trades.length === 0 ? (
              <p className="text-body text-ink-2">No trades. The portfolio was left as it was.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {b.trades.map((t, i) => (
                  <li key={`${t.ticker}-${i}`} className="grid grid-cols-[88px_64px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 py-2.5 text-body sm:grid-cols-[96px_72px_88px_minmax(0,1fr)]">
                    <span className={`whitespace-nowrap ${VERB_TONE[t.action] ?? "text-ink-2"}`}>{t.verb}</span>
                    <Ticker>{t.ticker}</Ticker>
                    <span className="text-right tabular text-ink-1">${Math.round(t.notional).toLocaleString("en-US")}</span>
                    <span className="col-span-3 text-label text-ink-2 sm:col-span-1">{t.why ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {b.not_executed.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-label text-ink-3">Wanted, but not placed</p>
                <ul className="space-y-1.5">
                  {b.not_executed.map((n) => (
                    <li key={n.ticker} className="grid grid-cols-[72px_1fr] gap-x-4 text-label">
                      <Ticker className="text-ink-2">{n.ticker}</Ticker><span className="text-ink-2">{n.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </NoteSection>
        )}

        {b?.market && b.market.themes.length > 0 && (
          <NoteSection title="What moved markets">
            {b.market.mood && <p className="mb-5 max-w-[65ch] text-body text-ink-2">{b.market.mood}</p>}
            <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
              {b.market.themes.map((t, i) => (
                <div key={i} className="min-w-0">
                  <p className="text-body font-medium text-ink-1">{t.title}</p>
                  {t.what_happened && <p className="mt-1 text-label text-ink-2">{t.what_happened}</p>}
                  {t.why_it_matters && <p className="mt-1 text-label text-ink-3">{t.why_it_matters}</p>}
                  {t.our_exposure && t.our_exposure.length > 0 && (
                    <p className="mt-2 text-label text-ink-3">
                      Our exposure:{" "}
                      {t.our_exposure.map((e, j) => (
                        <span key={e.ticker} title={e.why ?? undefined}>
                          {j > 0 && ", "}
                          <span className={e.effect === "positive" ? "text-gain" : e.effect === "negative" ? "text-loss" : "text-ink-2"}>
                            {e.ticker} {e.effect === "positive" ? "helped" : e.effect === "negative" ? "hurt" : "mixed"}
                          </span>
                        </span>
                      ))}
                    </p>
                  )}
                  {t.next && <p className="mt-1 text-label text-ink-3">Next: {t.next}</p>}
                </div>
              ))}
            </div>
          </NoteSection>
        )}

        {b && b.watch.length > 0 && (
          <NoteSection title="What to watch">
            <ul className="max-w-[65ch] space-y-2">
              {b.watch.map((w, i) => (
                <li key={i} className="grid grid-cols-[16px_1fr] text-body text-ink-2"><span aria-hidden className="text-ink-3">–</span>{w}</li>
              ))}
            </ul>
          </NoteSection>
        )}

        {!b && (
          <NoteSection title="Committee summary">
            <p className="max-w-[65ch] text-body text-ink-2">{r.summary}</p>
          </NoteSection>
        )}

        {/* ── The committee's working: reference material behind one control ── */}
        <section className="border-t border-line pt-6">
          <Button variant="ghost" onClick={() => setWorking((w) => !w)} aria-expanded={working} className="-ml-3">
            {working ? "Hide the committee's working" : "Show the committee's working"}
            <IconChevronDown size={16} className={`transition-transform duration-base ${working ? "rotate-180" : ""}`} />
          </Button>
          {working && <Working r={r} />}
        </section>
      </div>
    </article>
  );
}

/* ── Committee working ───────────────────────────────────────────────────── */
function Working({ r }: { r: Report }) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const f = r.pipeline_funnel;
  return (
    <div className="mt-6 space-y-10">
      {f && (
        <div>
          <p className="mb-3 text-label text-ink-3">Shortlist</p>
          <p className="text-body text-ink-2">
            <span className="text-ink-1 tabular">{f.analyzed}</span> stocks analysed, <span className="text-ink-1 tabular">{f.debated}</span> debated by the committee,{" "}
            <span className="text-ink-1 tabular">{f.entered}</span> bought.
          </p>
        </div>
      )}

      {r.scorecards_summary && r.scorecards_summary.length > 0 && (
        <div>
          <p className="mb-3 text-label text-ink-3">Stocks reviewed ({r.scorecards_summary.length}) · select a row for the agents&rsquo; views</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-body">
              <thead>
                <tr className="border-b border-line text-left text-label text-ink-3">
                  <th scope="col" className="py-2 pr-4 font-medium">Stock</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Score</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Fundamental</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Quant</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Sentiment</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Debate</th>
                  <th scope="col" className="py-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {r.scorecards_summary.map((row) => {
                  const open = openRow === row.ticker;
                  const detail = !!(row.investment_thesis || row.fundamental_summary || row.quant_summary || row.sentiment_summary || row.key_risks?.length || row.key_catalysts?.length);
                  return (
                    <React.Fragment key={row.ticker}>
                      <tr className={`border-b border-line ${detail ? "tr-hover" : ""}`} onClick={() => detail && setOpenRow(open ? null : row.ticker)}
                        tabIndex={detail ? 0 : undefined}
                        onKeyDown={(e) => { if (detail && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenRow(open ? null : row.ticker); } }}
                        aria-expanded={detail ? open : undefined}>
                        <td className="py-2.5 pr-4"><Ticker>{row.ticker}</Ticker></td>
                        <td className="py-2.5 pr-4 text-right font-medium tabular text-ink-1">{row.composite_score ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular text-ink-2">{row.fundamental_score ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular text-ink-2">{row.quant_score ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular text-ink-2">{row.sentiment_score ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-label text-ink-2">{row.was_debated ? (row.debate_reason === "likely_entry" ? "Required" : "Contested") : "—"}
                          {row.conflict_flag && <span className="text-ink-3"> · agents split</span>}</td>
                        <td className="py-2.5 text-label text-ink-1">
                          <span className="inline-flex items-center gap-1.5">
                            {String(row.action ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) || "—"}
                            {detail && <IconChevronDown size={14} className={`text-ink-3 transition-transform duration-fast ${open ? "rotate-180" : ""}`} />}
                          </span>
                        </td>
                      </tr>
                      {open && detail && (
                        <tr className="border-b border-line bg-raised/40">
                          <td colSpan={7} className="px-4 py-5">
                            <dl className="grid gap-x-8 gap-y-4 md:grid-cols-3">
                              {[["Fundamental", row.fundamental_score, row.fundamental_summary], ["Quant", row.quant_score, row.quant_summary], ["Sentiment", row.sentiment_score, row.sentiment_summary]].map(([a, sc, view]) => (
                                <div key={a as string}>
                                  <dt className="text-label text-ink-3">{a as string} · <span className="tabular text-ink-1">{(sc as number | null) ?? "—"}</span></dt>
                                  <dd className="mt-1 text-label text-ink-2">{(view as string | null) ?? "No summary"}</dd>
                                </div>
                              ))}
                            </dl>
                            {row.investment_thesis && <p className="mt-5 max-w-[70ch] text-label text-ink-2"><span className="text-ink-3">Committee thesis: </span>{row.investment_thesis}</p>}
                            <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
                              {row.key_catalysts?.length > 0 && (
                                <div><p className="text-label text-ink-3">Catalysts</p><ul className="mt-1 space-y-0.5">{row.key_catalysts.map((c, i) => <li key={i} className="text-label text-ink-2">{c}</li>)}</ul></div>
                              )}
                              {row.key_risks?.length > 0 && (
                                <div><p className="text-label text-ink-3">Risks</p><ul className="mt-1 space-y-0.5">{row.key_risks.map((c, i) => <li key={i} className="text-label text-ink-2">{c}</li>)}</ul></div>
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
        </div>
      )}

      {r.narrative && (
        <div>
          <p className="mb-3 text-label text-ink-3">{r.briefing ? "Committee notes, written before sizing (intentions, not trades)" : "Committee narrative"}</p>
          <div className="max-w-[70ch] space-y-3 text-body text-ink-2">
            {r.narrative.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </div>
      )}

      {r.decisions?.length > 0 && (
        <div>
          <p className="mb-3 text-label text-ink-3">{r.briefing ? "Committee decisions (intent)" : "Decisions"}</p>
          <ul className="divide-y divide-line border-y border-line">
            {r.decisions.map((d, i) => (
              <li key={`${d.ticker}-${i}`} className="grid grid-cols-[72px_96px_1fr_auto] gap-x-4 py-2.5 text-label">
                <Ticker>{d.ticker}</Ticker>
                <span className={VERB_TONE[d.action] ?? "text-ink-2"}>{String(d.action ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span>
                <span className="text-ink-2">{d.thesis}</span>
                <span className="tabular text-ink-3">{d.conviction}/100</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.agent_findings?.length > 0 && (
        <div>
          <p className="mb-3 text-label text-ink-3">What each agent found</p>
          <dl className="grid gap-x-10 gap-y-5 md:grid-cols-2">
            {r.agent_findings.map((f) => (
              <div key={f.agent} className="min-w-0">
                <dt className="text-label font-medium text-ink-1">{f.agent}</dt>
                <dd className="mt-1 text-label text-ink-2">{f.finding}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
function ReportsInner() {
  const router = useRouter();
  const params = useSearchParams();
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
      .then(setReports)
      .catch((e) => setError(`Could not load reports: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await loadPage(reports.length);
      setReports((prev) => [...prev, ...more]);
    } catch (e) {
      setError(`Could not load older reports: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingMore(false);
    }
  };

  const selectedDate = params.get("date") ?? reports[0]?.date ?? null;
  const selected = reports.find((r) => r.date === selectedDate) ?? reports[0] ?? null;
  const maxAbs = useMemo(() => Math.max(0, ...reports.map((r) => Math.abs(dayPnl(r) ?? 0))), [reports]);
  const select = (d: string) => {
    router.replace(`/reports?date=${d}`, { scroll: false });
    if (typeof window !== "undefined" && window.innerWidth < 1024) document.getElementById("note")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-24 pt-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-8">
        <div className="max-w-2xl">
          <h1 className="font-serif text-h1 font-medium text-ink-1">Daily reports</h1>
          <p className="mt-2 text-lead text-ink-2">The committee&rsquo;s note for each weekday: how the portfolio did, what moved it, and what was traded.</p>
        </div>
        <Button variant="ghost" href="/reports/adhoc">Research a stock</Button>
      </header>

      {error && reports.length === 0 ? (
        <Alert tone="loss" title="Data unavailable">{error}</Alert>
      ) : !loading && reports.length === 0 ? (
        <EmptyState title="No reports yet">A note appears here after each weekday pipeline run.</EmptyState>
      ) : (
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Ledger — sticky on desktop */}
          <aside aria-label="Sessions" className="order-2 lg:order-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-label font-medium text-ink-2">Sessions</h2>
              {total > 0 && <span className="text-micro text-ink-3 tabular">{reports.length} of {total}</span>}
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <>
                <Ledger reports={reports} selected={selected?.date ?? null} onSelect={select} maxAbs={maxAbs} />
                {error && <p className="mt-3 text-label text-loss">{error}</p>}
                {hasMore && (
                  <Button size="sm" variant="ghost" className="mt-3 w-full" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load older sessions"}
                  </Button>
                )}
              </>
            )}
          </aside>

          <div id="note" className="order-1 min-w-0 scroll-mt-20 lg:order-2">
            {loading || !selected ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-64" /><Skeleton className="h-10 w-full max-w-xl" /><Skeleton className="h-10 w-3/4 max-w-lg" />
                <Skeleton className="mt-6 h-12 w-48" />
              </div>
            ) : (
              <Note r={selected} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1280px] px-4 pt-10 sm:px-6"><Skeleton className="h-10 w-64" /></main>}>
      <ReportsInner />
    </Suspense>
  );
}
