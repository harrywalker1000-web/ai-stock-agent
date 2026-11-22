"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, KpiRail, Stat, Skeleton, Ticker, Signed, EmptyState, toneOf } from "@/components/ui/primitives";
import { IconChevronRight } from "@/components/ui/icons";
import Contours from "@/components/ui/Contours";
import { T, axisProps, tooltipProps } from "@/lib/chart-theme";

interface Stats {
  total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number;
  total_pnl_absolute: number | null; total_pnl_pct: number | null; active_positions: number;
  pipeline_status?: string; pipeline_last_run?: string; starting_capital?: number | null; _source?: string;
}
interface Pos { ticker: string; company?: string; pct_change: number; pct_portfolio: number; pnl_absolute: number }
interface PData { stats: Stats; positions: Pos[]; history: { date: string; value: number }[] }

const usd0 = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(v) || 0);
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// The real pipeline order (agents/portfolio_manager.py) — a genuine sequence, so numbered.
const STAGES = ["Macro", "Sectors", "Institutional flow", "News", "Candidates", "Fundamental · Quant · Sentiment", "Committee", "Trade", "Memory"];

export default function HomePage() {
  const [data, setData] = useState<PData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/portfolio")
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: PData) => { if (d?.stats?._source === "no_data") setError(true); setData(d); })
      .catch(() => setError(true));
  }, []);

  const s = data?.stats;
  const history = data?.history ?? [];
  const values = useMemo(() => history.map((h) => h.value), [history]);
  const top = useMemo(() => [...(data?.positions ?? [])].sort((a, b) => b.pct_portfolio - a.pct_portfolio).slice(0, 8), [data]);
  const since = history[0]?.date;
  // One tick per month (first trading day), so labels never repeat
  const monthTicks = useMemo(() => {
    const seen = new Set<string>();
    return history.filter((h) => { const m = h.date.slice(0, 7); if (seen.has(m)) return false; seen.add(m); return true; }).map((h) => h.date);
  }, [history]);
  const pipelineText = s?.pipeline_status === "success" ? "Pipeline ran" : s?.pipeline_status === "degraded" ? "Pipeline degraded" : s?.pipeline_status === "stale" ? "Pipeline stale" : "Pipeline status unknown";

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-24 sm:px-6">
      {/* Terrain band — contour lines drawn from the portfolio's own equity history */}
      <div aria-hidden className="pointer-events-none -mx-4 h-24 overflow-hidden sm:-mx-6 sm:h-28">
        {values.length > 2 && <Contours values={values} lines={11} className="h-full w-full" height={120} />}
      </div>

      <section className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Hero ── */}
        <div className="min-w-0">
          <h1 className="max-w-[18ch] font-serif text-[40px] font-medium leading-[1.1] tracking-tight text-ink-1 sm:text-[52px]">
            An AI investment committee running a paper portfolio of US stocks
          </h1>
          <p className="mt-5 max-w-[60ch] text-lead text-ink-2">
            Every weekday at 10:30 New York time, eleven agents research the market, a committee debates
            their evidence, and the resulting trades are placed with Alpaca&rsquo;s paper-trading account.
          </p>

          <div className="mt-12">
            <p className="text-label text-ink-3">Portfolio value{since ? ` · since ${fmtDate(since)}` : ""}</p>
            {s && !error ? (
              <p className="mt-1 font-serif text-[56px] font-medium leading-none tracking-tight text-ink-1 tabular sm:text-display">
                {usd0(s.total_value)}
              </p>
            ) : error ? (
              <p className="mt-2 font-serif text-h1 text-ink-2">Live data unavailable</p>
            ) : (
              <Skeleton className="mt-2 h-16 w-80 max-w-full" />
            )}
          </div>

          {/* Equity curve — the product itself as the hero graphic */}
          <div className="mt-6 h-[220px]" aria-label="Portfolio value over time">
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" {...axisProps} ticks={monthTicks} interval="preserveStartEnd" minTickGap={24}
                    tickFormatter={(d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short" })} />
                  <YAxis hide domain={["dataMin - 2000", "dataMax + 2000"]} />
                  <Tooltip {...tooltipProps}
                    labelFormatter={(d) => fmtDate(String(d))}
                    formatter={(v) => [usd0(Number(v)), "Value"]} />
                  <Area type="monotone" dataKey="value" stroke={T.accent} strokeWidth={2} fill={T.accent} fillOpacity={0.06}
                    activeDot={{ r: 4, fill: T.accent, stroke: T.surface, strokeWidth: 2 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : error ? (
              <EmptyState title="Performance history unavailable" className="h-full">The portfolio feed could not be reached.</EmptyState>
            ) : (
              <Skeleton className="h-full w-full rounded-md" />
            )}
          </div>

          <KpiRail className="mt-8">
            {s && !error ? (
              <>
                <Stat label="Total return" tone={toneOf(s.total_pnl_pct)}
                  value={<Signed value={s.total_pnl_pct} />}
                  sub={s.total_pnl_absolute != null ? usd0(s.total_pnl_absolute) : "—"} />
                <Stat label="Today" tone={toneOf(s.daily_pnl_pct)} value={<Signed value={s.daily_pnl_pct} />} sub={usd0(s.daily_pnl_absolute)} />
                <Stat label="Positions" value={s.active_positions} sub="long equity" />
                <Stat label={pipelineText} value={s.pipeline_last_run ? fmtDate(String(s.pipeline_last_run).slice(0, 10)) : "—"} sub="Daily, GitHub Actions" />
              </>
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i}><Skeleton className="h-4 w-20" /><Skeleton className="mt-2 h-6 w-24" /></div>
              ))
            )}
          </KpiRail>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button variant="primary" href="/dashboard">Open the portfolio</Button>
            <Button variant="ghost" href="/reports">Read today&rsquo;s report</Button>
          </div>
        </div>

        {/* ── Largest positions ── */}
        <aside aria-labelledby="largest" className="lg:pt-2">
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <h2 id="largest" className="font-serif text-h3 text-ink-1">Largest positions</h2>
            <span className="text-micro text-ink-3">Weight · return</span>
          </div>
          <ul>
            {top.length > 0 ? top.map((p) => (
              <li key={p.ticker}>
                <Link href={`/position/${p.ticker}`}
                  className="group grid grid-cols-[64px_1fr_auto_auto] items-baseline gap-3 border-b border-line py-3 transition-colors duration-fast hover:bg-raised/60">
                  <Ticker>{p.ticker}</Ticker>
                  <span className="truncate text-label text-ink-3">{p.company ?? ""}</span>
                  <span className="text-label text-ink-2 tabular">{p.pct_portfolio.toFixed(1)}%</span>
                  <Signed value={p.pct_change} className="w-16 text-right text-body" />
                </Link>
              </li>
            )) : !error ? Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="flex justify-between border-b border-line py-3.5"><Skeleton className="h-4 w-14" /><Skeleton className="h-4 w-12" /></li>
            )) : <li className="py-4 text-body text-ink-3">Positions unavailable.</li>}
          </ul>
          {s && (
            <Link href="/dashboard" className="mt-4 inline-flex items-center gap-1 text-label font-medium text-accent hover:text-ink-1">
              All {s.active_positions} positions <IconChevronRight size={14} />
            </Link>
          )}
        </aside>
      </section>

      {/* ── How decisions are made: a real sequence ── */}
      <section aria-labelledby="how" className="mt-24 border-t border-line pt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="how" className="font-serif text-h2 text-ink-1">How each trade is decided</h2>
          <Link href="/team" className="inline-flex items-center gap-1 text-label font-medium text-accent hover:text-ink-1">
            Meet the agents <IconChevronRight size={14} />
          </Link>
        </div>
        <ol className="mt-8 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-9">
          {STAGES.map((name, i) => (
            <li key={name} className="relative border-t border-line pt-3">
              <span aria-hidden className={`absolute -top-px left-0 h-px w-8 ${name === "Committee" ? "bg-accent" : "bg-ink-3"}`} />
              <span className="block text-micro text-ink-3 tabular">{i + 1}</span>
              <span className={`mt-1 block text-label ${name === "Committee" ? "text-ink-1 font-medium" : "text-ink-2"}`}>{name}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
