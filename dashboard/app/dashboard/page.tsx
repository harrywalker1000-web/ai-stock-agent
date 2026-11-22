"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import { Alert, Badge, Button, EmptyState, KpiRail, PageHeader, Panel, SectionTitle, Segmented, Signed, Skeleton, Stat, Ticker, toneOf } from "@/components/ui/primitives";
import { T, CATEGORICAL, axisProps, gridProps, tooltipProps, fmtPctSigned } from "@/lib/chart-theme";

interface Position {
  ticker: string; company: string; sector: string; direction: string;
  entry_price: number; current_price: number; pct_change: number;
  pnl_absolute: number; position_size: number; pct_portfolio: number;
  entry_date: string; conviction: number; entry_conviction?: number; status: string;
  setup_type?: string; expected_roi?: string;
  stop_price?: number | null; has_native_stop?: boolean; conviction_source?: "committee" | "log" | null;
  native_order_type?: string | null; native_trail_pct?: number | null; native_limit_price?: number | null;
}

interface PortfolioData {
  positions: Position[];
  stats: {
    total_value: number; cash: number; deployed: number; deployed_pct: number;
    total_pnl_pct: number | null; total_pnl_absolute: number | null;
    daily_pnl_pct: number; daily_pnl_absolute: number;
    active_positions: number; pipeline_status: string; pipeline_last_run: string; pipeline_detail?: string; trading_mode?: "paper" | "live"; starting_capital?: number | null;
    margin_warning?: boolean;
  };
  history: Array<{ date: string; value: number }>;
  sectors: Array<{ sector: string; value: number; color: string }>;
  agent_conviction?: Array<{ name: string; score: number; count: number; source: string }>;
  _positions_closed?: number;
}

interface BenchmarkPeriod {
  start_date: string | null;
  end_date: string | null;
  portfolio_return_pct: number | null;
  spy_return_pct: number | null;
  alpha: number | null;
  note?: "since_inception" | "insufficient_history";
  series: Array<{ date: string; portfolio_pct: number; spy_pct: number }>;
}

// /api/benchmark — computed live from Alpaca equity history + SPY closes (lib/benchmark.ts)
interface BenchmarkData {
  inception_date?: string;
  as_of?: string | null;
  includes_intraday?: boolean;
  error?: string;
  periods?: Record<"1W" | "1M" | "6M" | "YTD" | "All", BenchmarkPeriod>;
}

const BENCH_PERIODS = ["1W", "1M", "6M", "YTD", "All"] as const;
type BenchPeriod = typeof BENCH_PERIODS[number];

interface AgentAccuracyEntry {
  total_trades: number;
  correct_direction: number;
  wrong_direction: number;
  neutral_calls: number;
  directional_accuracy_pct: number | null;
}

interface AttributionData {
  total_closed_trades: number;
  win_rate_pct: number | null;
  avg_pnl_pct: number | null;
  avg_alpha_vs_spy: number | null;
  agents: Record<string, AgentAccuracyEntry>;
  last_attributed?: string | null;
  recent_trades: Array<{
    ticker: string; direction: string; entry_date: string; exit_date: string;
    pnl_pct: number; alpha_vs_spy: number | null; sector: string | null; exit_reason: string;
  }>;
}


function fmtCurrency(n: number) {
  const r = Math.round(n);
  const abs = Math.abs(r);
  if (r === 0) return "$0";
  const sign = r > 0 ? "+" : "−";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs}`;
}

const TIMEFRAMES = ["1W", "1M", "3M", "All"] as const;

// Fixed sector → categorical slot ("colour follows the entity, never its rank").
// Order validated with dataviz validate_palette.js; sectors without a slot fold to "Other".
const SECTOR_SLOT: Record<string, number> = {
  "Technology": 0, "Financial Services": 1, "Healthcare": 2, "Consumer Cyclical": 3,
  "Communication Services": 4, "Industrials": 5, "Energy": 6, "Consumer Defensive": 7,
};
interface SectorGroup { sector: string; value: number; color: string; members?: string[] }
function groupSectors(sectors: { sector: string; value: number }[]): SectorGroup[] {
  const out: SectorGroup[] = [];
  const other: SectorGroup = { sector: "Other sectors", value: 0, color: T.lineStrong, members: [] };
  let cash: SectorGroup | null = null;
  for (const s of sectors) {
    if (s.sector === "Cash") { cash = { sector: "Cash", value: s.value, color: T.line }; continue; }
    const slot = SECTOR_SLOT[s.sector];
    if (slot === undefined) { other.value += s.value; other.members!.push(s.sector); continue; }
    out.push({ sector: s.sector, value: s.value, color: CATEGORICAL[slot] });
  }
  out.sort((a, b) => b.value - a.value);
  if (other.value > 0) out.push({ ...other, value: Math.round(other.value * 10) / 10 });
  if (cash) out.push(cash);
  return out;
}

export default function DashboardPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [runModal, setRunModal] = useState<"review" | "full" | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [runMode, setRunMode] = useState<"review" | "full" | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [benchPeriod, setBenchPeriod] = useState<BenchPeriod>("1M");
  const [attribution, setAttribution] = useState<AttributionData | null>(null);
  const [intradayAlerts, setIntradayAlerts] = useState<Array<{ level: string; ticker: string; message: string; timestamp: string }>>([]);

  useEffect(() => {
    fetch("/api/portfolio")
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d) throw new Error(`HTTP ${r.status}`);
        setData(d);
        // _source "no_data" = Alpaca unreachable: numbers would be zeros, not real values
        if (d?.stats?._source === "no_data") setLoadError("Live Alpaca data unavailable — figures below are not current.");
      })
      .catch((e) => setLoadError(`Portfolio data unavailable (${e instanceof Error ? e.message : "network error"}).`))
      .finally(() => setLoading(false));
    fetch("/api/benchmark")
      .then((r) => r.json())
      .then((d: BenchmarkData) => setBenchmark(d))
      .catch(() => setBenchmark({ error: "Benchmark unavailable — network error" }));
    fetch("/api/attribution")
      .then((r) => r.json())
      .then((d: AttributionData) => setAttribution(d))
      .catch(() => null);
    // Intraday alerts
    fetch("/api/intraday")
      .then((r) => r.json())
      .then((d) => {
        const activeAlerts = (d?.alerts ?? []).filter(
          (a: { level: string }) => a.level !== "INFO"
        );
        setIntradayAlerts(activeAlerts);
      })
      .catch(() => null);
  }, []);

  // Queues the real pipeline on GitHub Actions (/api/run), then polls the run's status.
  const startRun = async (type: "review" | "full") => {
    setRunModal(null);
    setRunMode(type);
    setRunStatus("running");
    const label = type === "review" ? "Position Review" : "Full Research Run";
    setRunLog([`Queuing ${label} on GitHub Actions...`]);
    const queuedAt = Date.now();
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunStatus("error");
        setRunLog((prev) => [...prev, `Error: ${data.error ?? `HTTP ${res.status}`}`,
          ...(data.run?.html_url ? [`Current run: ${data.run.html_url}`] : [])]);
        return;
      }
      setRunLog((prev) => [...prev, "Queued. The pipeline takes ~30-45 min; trades only execute while the market is open."]);
    } catch (e) {
      setRunStatus("error");
      setRunLog((prev) => [...prev, `Network error: ${String(e)}`]);
      return;
    }

    // Poll every 30s for up to 2h
    let lastStatus = "";
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 30000));
      try {
        const r = await fetch("/api/run");
        const d = await r.json();
        const run = d.run;
        if (!run || new Date(run.created_at).getTime() < queuedAt - 60000) continue; // not visible yet
        if (run.status !== lastStatus) {
          lastStatus = run.status;
          setRunLog((prev) => [...prev, `GitHub status: ${run.status.replace(/_/g, " ")} — ${run.html_url}`]);
        }
        if (run.status === "completed") {
          const ok = run.conclusion === "success";
          setRunStatus(ok ? "done" : "error");
          setRunLog((prev) => [...prev, ok
            ? "Run complete. The dashboard redeploys with the new data in a few minutes — refresh then."
            : `Run finished with conclusion: ${run.conclusion}. See the GitHub log above.`]);
          return;
        }
      } catch { /* transient — keep polling */ }
    }
  };

  const filteredHistory = (() => {
    const h = data?.history ?? [];
    if (timeframe === "All" || h.length === 0) return h;
    const days = timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : 90;
    const last = new Date(`${h[h.length - 1].date}T12:00:00Z`);
    last.setUTCDate(last.getUTCDate() - days);
    const cutoff = last.toISOString().slice(0, 10);
    // start from the last close on/before the cutoff so the window spans the full period
    const startIdx = Math.max(0, h.findLastIndex((p) => p.date <= cutoff));
    return h.slice(startIdx);
  })();

  // Benchmark vs SPY — each period arrives rebased to 0% at its own start (lib/benchmark.ts)
  const activePeriod = benchmark?.periods?.[benchPeriod] ?? null;
  const benchSeries = activePeriod?.series ?? [];
  const hasInsufficientHistory = (p: BenchmarkPeriod | null | undefined) => !p || p.note === "insufficient_history" || p.alpha == null;

  const stats = data?.stats;
  const positions = [...(data?.positions ?? [])].sort((a, b) => b.pct_portfolio - a.pct_portfolio);
  const visiblePositions = showAllPositions ? positions : positions.slice(0, 10);

  const agentConviction = data?.agent_conviction ?? [];

  const pipelineStatus = stats?.pipeline_status ?? "unknown";
  const pipelineLabel = pipelineStatus === "success" ? "Pipeline OK" : pipelineStatus === "degraded" ? "Pipeline Degraded" : pipelineStatus === "stale" ? "Pipeline Stale" : pipelineStatus === "failed" ? "Pipeline Failed" : "Status Unknown";

  const sectorGroups = groupSectors(data?.sectors ?? []);
  const fmtUsd0 = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(v) || 0);
  const lastRun = stats?.pipeline_last_run ? String(stats.pipeline_last_run).slice(0, 10) : null;

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-24 pt-10 sm:px-6">
      <PageHeader
        title="Portfolio"
        description="Live positions and performance from the Alpaca paper account."
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1" title={stats?.pipeline_detail ?? undefined}>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${pipelineStatus === "success" ? "bg-gain" : pipelineStatus === "unknown" ? "bg-ink-3" : "bg-caution"}`} />
              {pipelineLabel}{lastRun ? ` · last run ${lastRun}` : ""}
            </span>
            {stats?.trading_mode === "live" && <Badge tone="loss">Live trading — real money</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setRunModal("review")} disabled={runStatus === "running"}>Review positions</Button>
            <Button variant="primary" onClick={() => setRunModal("full")} disabled={runStatus === "running"}>Run full research</Button>
          </>
        }
      />

      {/* Run confirmation — accessible dialog */}
      {runModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="run-title"
          onKeyDown={(e) => { if (e.key === "Escape") setRunModal(null); }}>
          <div className="absolute inset-0 bg-canvas/80" onClick={() => setRunModal(null)} />
          <div className="relative w-full max-w-md rounded-lg border border-line bg-raised p-6 shadow-pop">
            <h2 id="run-title" className="font-serif text-h2 text-ink-1">{runModal === "review" ? "Review positions" : "Run full research"}</h2>
            <p className="mt-3 text-body text-ink-2">
              {runModal === "review"
                ? "Re-evaluates every open position and decides whether to hold, resize or exit. Takes about 10–20 minutes on GitHub Actions."
                : "Runs the whole daily pipeline: position review plus new-opportunity research. Takes about 30–45 minutes on GitHub Actions."}
            </p>
            <p className="mt-3 text-label text-caution">Places paper-trading orders if the US market is open.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRunModal(null)} autoFocus>Cancel</Button>
              <Button variant="primary" onClick={() => startRun(runModal)}>{runModal === "review" ? "Start review" : "Start research run"}</Button>
            </div>
          </div>
        </div>
      )}

      {runStatus !== "idle" && (
        <div className={`tex-dots mb-8 rounded-md border px-5 py-4 ${runStatus === "running" ? "border-accent/40" : runStatus === "done" ? "border-gain/40" : "border-loss/40"}`} aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <p className={`text-body font-medium ${runStatus === "running" ? "text-accent" : runStatus === "done" ? "text-gain" : "text-loss"}`}>
              {runStatus === "running" ? `${runMode === "review" ? "Position review" : "Research run"} in progress` : runStatus === "done" ? "Run complete" : "Run failed"}
            </p>
            {runStatus !== "running" && <Button size="sm" variant="ghost" onClick={() => { setRunStatus("idle"); setRunLog([]); }}>Dismiss</Button>}
          </div>
          <ul className="mt-2 space-y-0.5">{runLog.map((line, i) => <li key={i} className="text-label text-ink-2 break-words">{line}</li>)}</ul>
        </div>
      )}

      {intradayAlerts.length > 0 && (
        <div className="mb-8 space-y-2">
          {intradayAlerts.map((a, i) => {
            const isStop = a.level === "STOP_EXECUTED" || a.level === "STOP_PENDING";
            return (
              <Alert key={i} tone={isStop ? "loss" : "caution"}
                title={<>{isStop ? "Stop-loss" : a.level === "PORTFOLIO_ALERT" ? "Portfolio alert" : "Alert"} · {a.ticker} <span className="font-normal text-ink-3">{a.timestamp?.slice(11, 16)} UTC</span></>}>
                {a.message}
              </Alert>
            );
          })}
        </div>
      )}

      {loadError && <div className="mb-8"><Alert tone="loss" title="Data unavailable">{loadError}</Alert></div>}

      {/* ── Hero figure + KPI rail (no boxes) ── */}
      <section aria-label="Summary" className="mb-12">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          {loading ? <Skeleton className="h-12 w-64" /> : (
            <p className="font-serif text-figure font-medium tracking-tight text-ink-1 tabular">{stats ? fmtUsd0(stats.total_value) : "—"}</p>
          )}
          {!loading && stats && (
            <p className="pb-1.5 text-lead">
              <Signed value={stats.total_pnl_pct} /> <span className="text-ink-3">total ·</span>{" "}
              <span className={`tabular ${(stats.total_pnl_absolute ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>
                {stats.total_pnl_absolute == null ? "—" : `${stats.total_pnl_absolute >= 0 ? "+" : "−"}${fmtUsd0(Math.abs(stats.total_pnl_absolute))}`}
              </span>
              {stats.starting_capital ? <span className="text-ink-3"> on {fmtUsd0(stats.starting_capital)}</span> : null}
            </p>
          )}
        </div>
        <KpiRail className="mt-6">
          {loading || !stats ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i}><Skeleton className="h-4 w-16" /><Skeleton className="mt-2 h-6 w-20" /></div>
          )) : (
            <>
              <Stat label="Today" tone={toneOf(stats.daily_pnl_pct)} value={<Signed value={stats.daily_pnl_pct} />} sub={fmtCurrency(stats.daily_pnl_absolute ?? 0)} />
              <Stat label="Invested" tone={stats.margin_warning ? "caution" : "neutral"} value={`${(stats.deployed_pct ?? 0).toFixed(1)}%`}
                sub={stats.margin_warning ? "Margin in use" : `$${((stats.deployed ?? 0) / 1000).toFixed(1)}K`} />
              <Stat label="Cash" value={`$${((stats.cash ?? 0) / 1000).toFixed(1)}K`} sub={`${Math.max(100 - (stats.deployed_pct ?? 0), 0).toFixed(1)}% uninvested`} />
              <Stat label="Positions" value={stats.active_positions ?? 0} sub="all long" />
            </>
          )}
        </KpiRail>
      </section>

      {/* ── Performance + sectors ── */}
      <div className="mb-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle description="Account value at each daily close" action={<Segmented label="Performance period" options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />}>
            Performance
          </SectionTitle>
          <div className="h-[300px]">
            {loading ? <Skeleton className="h-full w-full rounded-md" /> : filteredHistory.length < 2 ? (
              <EmptyState title="Not enough history" className="h-full">Performance appears after two daily closes.</EmptyState>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} minTickGap={40}
                    tickFormatter={(v: string) => new Date(`${v}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} />
                  <YAxis {...axisProps} width={56} domain={["auto", "auto"]} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}K`} />
                  <Tooltip {...tooltipProps}
                    labelFormatter={(d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    formatter={(v) => [fmtUsd0(Number(v)), "Account value"]} />
                  <Area type="monotone" dataKey="value" stroke={T.accent} strokeWidth={2} fill={T.accent} fillOpacity={0.06}
                    activeDot={{ r: 4, fill: T.accent, stroke: T.surface, strokeWidth: 2 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel>
          <SectionTitle description="Share of portfolio value">Sectors</SectionTitle>
          {loading ? <Skeleton className="mx-auto h-[168px] w-[168px] rounded-full" /> : sectorGroups.length === 0 ? (
            <EmptyState title="No allocation data" />
          ) : (
            <>
              <div className="h-[168px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sectorGroups} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={1.5}
                      dataKey="value" nameKey="sector" stroke={T.surface} strokeWidth={2} isAnimationActive={false}>
                      {sectorGroups.map((g) => <Cell key={g.sector} fill={g.color} />)}
                    </Pie>
                    <Tooltip {...tooltipProps}
                      formatter={(v, name, item) => [`${Number(v).toFixed(1)}% of portfolio`, (item?.payload as SectorGroup | undefined)?.members?.length ? `${String(name)}: ${(item?.payload as SectorGroup).members!.join(", ")}` : String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 divide-y divide-line">
                {sectorGroups.map((g) => (
                  <li key={g.sector} className="flex items-center justify-between gap-3 py-1.5 text-label" title={g.members?.join(", ")}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: g.color }} />
                      <span className="truncate text-ink-2">{g.sector}</span>
                    </span>
                    <span className="text-ink-1 tabular">{g.value.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      {/* ── Positions ── */}
      <Panel className="mb-6" padded={false}>
        <div className="px-6 pt-6">
          <SectionTitle description={`${positions.length} open positions, largest first`}>Positions</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-body">
            <thead>
              <tr className="border-y border-line text-left text-label text-ink-3">
                <th scope="col" className="py-2.5 pl-6 pr-3 font-medium">Holding</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Return</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Weight</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Setup</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Conviction</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Stop</th>
                <th scope="col" className="py-2.5 pl-3 pr-6 text-right font-medium">Entered</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line">
                  {[140, 60, 50, 70, 80, 70, 70].map((w, j) => (
                    <td key={j} className={`py-3.5 ${j === 0 ? "pl-6 pr-3" : "px-3"}`}><Skeleton className="h-4" /></td>
                  ))}
                </tr>
              )) : visiblePositions.length === 0 ? (
                <tr><td colSpan={7} className="p-6"><EmptyState title={loadError ? "Positions unavailable" : "No open positions"}>{loadError ?? "New positions appear after the next pipeline run."}</EmptyState></td></tr>
              ) : visiblePositions.map((pos) => {
                const breached = !pos.has_native_stop && pos.stop_price != null &&
                  (pos.direction === "short" ? pos.current_price >= pos.stop_price : pos.current_price <= pos.stop_price);
                return (
                  <tr key={pos.ticker} onClick={() => { window.location.href = `/position/${pos.ticker}`; }}
                    className="tr-hover border-b border-line last:border-0">
                    <td className="py-3 pl-6 pr-3">
                      <a href={`/position/${pos.ticker}`} className="flex items-baseline gap-3" onClick={(e) => e.stopPropagation()}>
                        <Ticker className="w-14 shrink-0">{pos.ticker}</Ticker>
                        <span className="truncate text-label text-ink-3">{pos.company}</span>
                      </a>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Signed value={pos.pct_change} className="block" />
                      <span className={`block text-micro tabular ${pos.pnl_absolute >= 0 ? "text-gain/80" : "text-loss/80"}`}>{fmtCurrency(pos.pnl_absolute)}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular">
                      <span className="block text-ink-1">{pos.pct_portfolio.toFixed(1)}%</span>
                      <span className="block text-micro text-ink-3">${((pos.position_size ?? 0) / 1000).toFixed(1)}K</span>
                    </td>
                    <td className="px-3 py-3 text-label text-ink-2">{pos.setup_type ?? "—"}</td>
                    <td className="px-3 py-3">
                      {pos.conviction != null ? (
                        <span className="flex items-center gap-2" title={pos.conviction_source === "committee" ? "Committee score from the latest run" : "Logged at the last decision — not re-scored in the latest run"}>
                          <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-raised">
                            <span className="block h-full rounded-full bg-ink-2" style={{ width: `${Math.max(0, Math.min(100, pos.conviction))}%` }} />
                          </span>
                          <span className="tabular text-ink-1">{pos.conviction}</span>
                          {pos.conviction_source === "log" && <span className="text-micro text-ink-3">logged</span>}
                        </span>
                      ) : <span className="text-ink-3">—</span>}
                      {pos.entry_conviction != null && pos.entry_conviction > 0 && pos.entry_conviction !== pos.conviction && (
                        <span className="mt-0.5 block text-micro text-ink-3 tabular">at entry {pos.entry_conviction}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {pos.stop_price != null ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="tabular text-ink-1">
                            {pos.native_order_type === "trailing_stop" && pos.native_trail_pct ? `${pos.native_trail_pct}% trail` : `$${pos.stop_price.toFixed(2)}`}
                          </span>
                          {pos.has_native_stop ? (
                            <Badge tone="neutral" title="Stop order placed at Alpaca — enforced automatically">At broker</Badge>
                          ) : breached ? (
                            <Badge tone="loss" title="Price is through this level, and no stop order exists at Alpaca">Breached · not placed</Badge>
                          ) : (
                            <span className="text-micro text-ink-3" title="Recorded by the pipeline only — no stop order exists at Alpaca">not placed</span>
                          )}
                        </span>
                      ) : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="py-3 pl-3 pr-6 text-right text-label text-ink-3 tabular whitespace-nowrap">{pos.entry_date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {positions.length > 10 && (
          <div className="border-t border-line px-6 py-3">
            <Button size="sm" variant="ghost" onClick={() => setShowAllPositions(!showAllPositions)} aria-expanded={showAllPositions}>
              {showAllPositions ? "Show top 10 only" : `Show all ${positions.length} positions`}
            </Button>
          </div>
        )}
      </Panel>

      {/* ── Returns vs S&P 500 ── */}
      <Panel className="mb-6">
        <SectionTitle
          description={activePeriod?.start_date
            ? `${activePeriod.start_date} to ${activePeriod.end_date}${benchmark?.includes_intraday ? " (live)" : ""}. Both lines start at 0% on the first day.`
            : "Time-weighted portfolio return against SPY, dividends included"}
          action={<Segmented label="Comparison period" options={BENCH_PERIODS} value={benchPeriod} onChange={setBenchPeriod} />}>
          Returns against the S&amp;P 500
        </SectionTitle>

        {activePeriod && !hasInsufficientHistory(activePeriod) && (
          <KpiRail className="mb-6">
            <Stat label="Portfolio" tone={toneOf(activePeriod.portfolio_return_pct)} value={<Signed value={activePeriod.portfolio_return_pct} />} />
            <Stat label="S&P 500 (SPY)" value={<Signed value={activePeriod.spy_return_pct} className="text-ink-1" />} />
            <Stat label="Difference" tone={toneOf(activePeriod.alpha)} value={<Signed value={activePeriod.alpha} suffix=" pts" />} />
          </KpiRail>
        )}

        <div className="mb-3 flex items-center gap-5 text-label text-ink-2">
          <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0.5 w-5 rounded-full bg-accent" />Portfolio</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0 w-5 border-t-2 border-dashed border-ink-3" />S&amp;P 500</span>
        </div>
        <div className="h-[240px]">
          {!benchmark ? <Skeleton className="h-full w-full rounded-md" /> : benchSeries.length < 2 ? (
            <EmptyState title={benchmark.error ? "Data unavailable" : "Not enough history for this period"} className="h-full">{benchmark.error}</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={benchSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} minTickGap={40}
                  tickFormatter={(v: string) => new Date(`${v}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} />
                <YAxis {...axisProps} width={56} domain={["auto", "auto"]} tickFormatter={(v) => fmtPctSigned(Number(v), 1)} />
                <ReferenceLine y={0} stroke={T.lineStrong} />
                <Tooltip {...tooltipProps}
                  labelFormatter={(d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  formatter={(v, name) => [fmtPctSigned(Number(v)), name === "portfolio_pct" ? "Portfolio" : "S&P 500"]} />
                <Line type="monotone" dataKey="spy_pct" stroke={T.ink3} strokeWidth={1.5} strokeDasharray="4 3" dot={false}
                  activeDot={{ r: 3, fill: T.ink3, stroke: T.surface, strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="portfolio_pct" stroke={T.accent} strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: T.accent, stroke: T.surface, strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ── Signal attribution ── */}
        <Panel className="lg:col-span-3">
          <SectionTitle description={attribution && attribution.total_closed_trades > 0
            ? `${attribution.total_closed_trades} attributed trade${attribution.total_closed_trades !== 1 ? "s" : ""}${attribution.last_attributed ? `, last on ${String(attribution.last_attributed).slice(0, 10)}. Exits since then are not yet attributed.` : ""}`
            : "Which agents called the direction correctly on closed trades"}>
            Agent accuracy on closed trades
          </SectionTitle>
          {!attribution ? <Skeleton className="h-32 w-full" /> : attribution.total_closed_trades === 0 ? (
            <EmptyState title="No closed trades attributed yet">Accuracy appears here once positions are closed and attributed.</EmptyState>
          ) : (
            <>
              <KpiRail className="mb-6">
                <Stat label="Win rate" value={attribution.win_rate_pct != null ? `${attribution.win_rate_pct.toFixed(0)}%` : "—"} />
                <Stat label="Average return" tone={toneOf(attribution.avg_pnl_pct)} value={<Signed value={attribution.avg_pnl_pct} digits={1} />} />
                <Stat label="Average vs SPY" tone={toneOf(attribution.avg_alpha_vs_spy)} value={<Signed value={attribution.avg_alpha_vs_spy} digits={1} suffix=" pts" />} />
              </KpiRail>
              <ul className="space-y-3">
                {Object.entries(attribution.agents).map(([name, a]) => (
                  <li key={name} className="grid grid-cols-[110px_1fr_auto] items-center gap-4">
                    <span className="text-label capitalize text-ink-2">{name}</span>
                    <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-raised">
                      <span className="block h-full rounded-full bg-ink-2" style={{ width: `${a.directional_accuracy_pct ?? 0}%` }} />
                    </span>
                    <span className="text-label text-ink-1 tabular">
                      {a.directional_accuracy_pct != null ? `${a.directional_accuracy_pct.toFixed(0)}%` : "—"}
                      <span className="ml-2 text-ink-3">{a.correct_direction} of {a.correct_direction + a.wrong_direction}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {attribution.recent_trades.length > 0 && (
                <div className="mt-6 border-t border-line pt-4">
                  <p className="mb-2 text-label text-ink-3">Recent exits</p>
                  <ul className="divide-y divide-line">
                    {attribution.recent_trades.map((t, i) => (
                      <li key={`${t.ticker}-${i}`} className="flex items-baseline justify-between gap-4 py-2">
                        <span className="flex items-baseline gap-3"><Ticker>{t.ticker}</Ticker><span className="text-label text-ink-3">{t.exit_date}</span></span>
                        <Signed value={t.pnl_pct} digits={1} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ── Book composition: conviction + extremes, one block ── */}
        <Panel className="lg:col-span-2">
          <SectionTitle description="Average score each agent gave current holdings in the latest run">Book composition</SectionTitle>
          {loading ? <Skeleton className="h-32 w-full" /> : (
            <>
              <ul className="space-y-3">
                {agentConviction.map((a) => (
                  <li key={a.name} className="grid grid-cols-[96px_1fr_auto] items-center gap-4">
                    <span className="text-label text-ink-2">{a.name}</span>
                    <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-raised">
                      <span className="block h-full rounded-full bg-ink-2" style={{ width: `${a.score}%` }} />
                    </span>
                    <span className="text-label text-ink-1 tabular">{a.score}<span className="text-ink-3"> · {a.count}</span></span>
                  </li>
                ))}
              </ul>
              {positions.length > 0 && (() => {
                const best = positions.reduce((b, p) => (p.pnl_absolute > b.pnl_absolute ? p : b), positions[0]);
                const worst = positions.reduce((w, p) => (p.pnl_absolute < w.pnl_absolute ? p : w), positions[0]);
                return (
                  <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4">
                    {[["Best", best], ["Worst", worst]].map(([label, p]) => {
                      const pos = p as Position;
                      return (
                        <div key={label as string}>
                          <dt className="text-label text-ink-3">{label as string} position</dt>
                          <dd className="mt-1 flex items-baseline gap-2"><Ticker>{pos.ticker}</Ticker><Signed value={pos.pct_change} /></dd>
                          <dd className={`text-label tabular ${pos.pnl_absolute >= 0 ? "text-gain" : "text-loss"}`}>{fmtCurrency(pos.pnl_absolute)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                );
              })()}
            </>
          )}
        </Panel>
      </div>
    </main>
  );
}
