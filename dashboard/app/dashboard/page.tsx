"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";

interface Position {
  ticker: string; company: string; sector: string; direction: string;
  entry_price: number; current_price: number; pct_change: number;
  pnl_absolute: number; position_size: number; pct_portfolio: number;
  entry_date: string; conviction: number; status: string;
  setup_type?: string; expected_roi?: string;
  stop_price?: number | null; has_native_stop?: boolean;
  native_order_type?: string | null; native_trail_pct?: number | null; native_limit_price?: number | null;
}

interface PortfolioData {
  positions: Position[];
  stats: {
    total_value: number; cash: number; deployed: number; deployed_pct: number;
    total_pnl_pct: number; total_pnl_absolute: number;
    daily_pnl_pct: number; daily_pnl_absolute: number;
    active_positions: number; pipeline_status: string; pipeline_last_run: string;
    margin_warning?: boolean;
  };
  history: Array<{ date: string; value: number }>;
  sectors: Array<{ sector: string; value: number; color: string }>;
  agent_conviction?: Array<{ name: string; score: number; count: number; source: string }>;
  _positions_closed?: number;
}

interface BenchmarkPeriod {
  portfolio_return_pct: number | null;
  spy_return_pct: number | null;
  alpha: number | null;
  note?: string;
}

interface BenchmarkData {
  inception_date?: string;
  nav_points?: number;
  last_updated?: string;
  error?: string;
  periods: {
    "1w"?: BenchmarkPeriod;
    "1m"?: BenchmarkPeriod;
    "6m"?: BenchmarkPeriod;
    "ytd"?: BenchmarkPeriod;
  };
  daily_series: Array<{ date: string; portfolio_cumulative: number; spy_cumulative: number }>;
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
  recent_trades: Array<{
    ticker: string; direction: string; entry_date: string; exit_date: string;
    pnl_pct: number; alpha_vs_spy: number | null; sector: string | null; exit_reason: string;
  }>;
}

function fmt(n: number, decimals = 2) {
  return n >= 0
    ? `+${n.toFixed(decimals)}`
    : n.toFixed(decimals);
}

function fmtCurrency(n: number) {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-2">{label}</p>
      <p className={`font-display text-3xl font-bold ${color || "text-[#E8EDF2]"}`}>{value}</p>
      {sub && <p className="text-xs text-[#6B7280] mt-1">{sub}</p>}
    </div>
  );
}

const TIMEFRAMES = ["1W", "1M", "3M", "All"];

export default function DashboardPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [timeframe, setTimeframe] = useState("All");
  const [loading, setLoading] = useState(true);
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
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/benchmark")
      .then((r) => r.json())
      .then((d: BenchmarkData) => setBenchmark(d))
      .catch(() => null);
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

  const startRun = async (type: "review" | "full") => {
    setRunModal(null);
    setRunMode(type);
    setRunStatus("running");
    setRunLog([`Starting ${type === "review" ? "Position Review" : "Full Research Run"}...`]);
    const slowMsg = setTimeout(() => {
      setRunLog((prev) => [...prev, "Still running — this can take 10-20 minutes..."]);
    }, 120000);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      clearTimeout(slowMsg);
      const data = await res.json();
      if (res.ok) {
        setRunStatus("done");
        setRunLog((prev) => [...prev, "Run complete.", data.summary ?? ""]);
      } else {
        setRunStatus("error");
        setRunLog((prev) => [...prev, `Error: ${data.error ?? "unknown error"}`]);
      }
    } catch (e) {
      clearTimeout(slowMsg);
      setRunStatus("error");
      setRunLog((prev) => [...prev, `Network error: ${String(e)}`]);
    }
  };

  const filteredHistory = data?.history?.filter((h) => {
    if (timeframe === "All") return true;
    const days = timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return new Date(h.date) >= cutoff;
  }) ?? [];

  // Benchmark vs SPY series filtered by selected period
  const benchSeries = (() => {
    const full = benchmark?.daily_series ?? [];
    if (benchPeriod === "All") return full;
    if (benchPeriod === "YTD") {
      const yearStart = new Date().getFullYear() + "-01-01";
      return full.filter((d) => d.date >= yearStart);
    }
    const days = benchPeriod === "1W" ? 7 : benchPeriod === "1M" ? 30 : 182;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return full.filter((d) => d.date >= cutoffStr);
  })();

  // Current period alpha/returns for display
  const periodKey = benchPeriod === "1W" ? "1w" : benchPeriod === "1M" ? "1m" : benchPeriod === "6M" ? "6m" : benchPeriod === "YTD" ? "ytd" : null;
  const activePeriod = periodKey ? benchmark?.periods?.[periodKey as keyof typeof benchmark.periods] : null;
  const hasInsufficientHistory = (p: BenchmarkPeriod | null | undefined) => !p || p.note === "insufficient_history" || p.alpha == null;

  const stats = data?.stats;
  const positions = [...(data?.positions ?? [])].sort((a, b) => b.pct_portfolio - a.pct_portfolio);
  const visiblePositions = showAllPositions ? positions : positions.slice(0, 10);

  const agentConviction = data?.agent_conviction ?? [];
  const positionsClosed = data?._positions_closed ?? 0;

  const pipelineStatus = stats?.pipeline_status ?? "unknown";
  const pipelineColor = pipelineStatus === "success" ? "#10B981" : pipelineStatus === "failed" ? "#EF4444" : "#6B7280";
  const pipelineLabel = pipelineStatus === "success" ? "Pipeline OK" : pipelineStatus === "failed" ? "Pipeline Failed" : "Not Yet Run";

  return (
    <div className="min-h-screen bg-[#030005] pb-16">
      <div className="max-w-7xl mx-auto px-6 pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">Portfolio</h1>
            <p className="text-[#6B7280] text-sm mt-1">Haz Capital Management — Live Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg glass">
              <span className="w-2 h-2 rounded-full" style={{ background: pipelineColor, boxShadow: `0 0 6px ${pipelineColor}` }} />
              <span className="text-xs text-[#6B7280]">{pipelineLabel}</span>
            </div>
            <button
              onClick={() => setRunModal("review")}
              disabled={runStatus === "running"}
              className="px-4 py-2 rounded-lg text-xs font-bold text-[#F5A623] border border-[#F5A623]/30 bg-[#F5A623]/08 hover:bg-[#F5A623]/14 transition-all disabled:opacity-40"
            >
              Review Positions
            </button>
            <button
              onClick={() => setRunModal("full")}
              disabled={runStatus === "running"}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#F5A623] hover:bg-[#F5A623]/90 transition-all disabled:opacity-40"
            >
              Full Research Run
            </button>
          </div>
        </div>

        {/* Confirmation modal */}
        {runModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={() => setRunModal(null)} />
            <div className="relative card p-6 max-w-sm w-full mx-4">
              <h3 className="font-display text-lg font-bold text-[#E8EDF2] mb-2">
                {runModal === "review" ? "Review Positions" : "Full Research Run"}
              </h3>
              <p className="text-sm text-[#6B7280] mb-4">
                {runModal === "review"
                  ? "Runs Phase A only — re-evaluates all open positions and makes hold/exit/size decisions. Takes ~8-15 min."
                  : "Runs the full daily pipeline — Phase A position review + Phase B new opportunity research. Takes ~15-45 min depending on mode."}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setRunModal(null)} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-[#6B7280] bg-white/05 hover:bg-white/08 transition-all">Cancel</button>
                <button onClick={() => startRun(runModal)} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#F5A623] hover:bg-[#F5A623]/90 transition-all">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Run progress panel */}
        {runStatus !== "idle" && (
          <div className={`card p-5 mb-6 border ${runStatus === "running" ? "border-[#F5A623]/30" : runStatus === "done" ? "border-[#10B981]/30" : "border-[#EF4444]/30"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {runStatus === "running" && <span className="w-2 h-2 rounded-full bg-[#F5A623] animate-pulse" />}
                {runStatus === "done" && <span className="w-2 h-2 rounded-full bg-[#10B981]" />}
                {runStatus === "error" && <span className="w-2 h-2 rounded-full bg-[#EF4444]" />}
                <span className={`text-sm font-bold ${runStatus === "running" ? "text-[#F5A623]" : runStatus === "done" ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                  {runStatus === "running" ? `${runMode === "review" ? "Review" : "Full Run"} in progress...` : runStatus === "done" ? "Run complete" : "Run failed"}
                </span>
              </div>
              {runStatus !== "running" && (
                <button onClick={() => { setRunStatus("idle"); setRunLog([]); }} className="text-xs text-[#6B7280] hover:text-[#E8EDF2]">Dismiss</button>
              )}
            </div>
            <div className="space-y-1">
              {runLog.map((line, i) => (
                <p key={i} className="text-xs text-[#6B7280] font-mono">{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Intraday alert banner — only shown when active alerts exist */}
        {intradayAlerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {intradayAlerts.map((alert, i) => {
              const isStop = alert.level === "STOP_EXECUTED" || alert.level === "STOP_PENDING";
              const isPortfolio = alert.level === "PORTFOLIO_ALERT";
              const borderColor = isStop ? "border-[#EF4444]/40" : "border-[#F59E0B]/40";
              const dotColor = isStop ? "#EF4444" : "#F59E0B";
              const labelColor = isStop ? "text-[#EF4444]" : "text-[#F59E0B]";
              return (
                <div key={i} className={`card p-4 border ${borderColor}`}>
                  <div className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 animate-pulse" style={{ background: dotColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>
                          {isStop ? "Stop-Loss" : isPortfolio ? "Portfolio Alert" : "Alert"} — {alert.ticker}
                        </span>
                        <span className="text-[10px] text-[#6B7280]">{alert.timestamp?.slice(11, 16)} UTC</span>
                      </div>
                      <p className="text-sm text-[#E8EDF2]">{alert.message}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
          <div className="col-span-2 sm:col-span-1 lg:col-span-1 card p-5">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-2">Total P&L</p>
            <p className={`font-display text-3xl font-bold ${(stats?.total_pnl_pct ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
              {loading ? "—" : `${fmt(stats?.total_pnl_pct ?? 0)}%`}
            </p>
            <p className="text-xs text-[#6B7280] mt-1">
              {loading ? "" : fmtCurrency(stats?.total_pnl_absolute ?? 0)}
            </p>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-2">Daily P&L</p>
            <p className={`font-display text-2xl font-bold ${(stats?.daily_pnl_pct ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
              {loading ? "—" : `${fmt(stats?.daily_pnl_pct ?? 0)}%`}
            </p>
            <p className="text-xs text-[#6B7280] mt-1">
              {loading ? "" : fmtCurrency(stats?.daily_pnl_absolute ?? 0)}
            </p>
          </div>

          <StatCard
            label="Portfolio Value"
            value={loading ? "—" : `$${((stats?.total_value ?? 0) / 1000).toFixed(1)}K`}
          />
          <StatCard
            label="Positions"
            value={loading ? "—" : String(stats?.active_positions ?? 0)}
            sub="active"
          />
          <div className="card p-5">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-2">Deployed</p>
            <p className={`font-display text-3xl font-bold ${stats?.margin_warning ? "text-[#F59E0B]" : "text-[#E8EDF2]"}`}>
              {loading ? "—" : `${(stats?.deployed_pct ?? 0).toFixed(1)}%`}
            </p>
            <p className="text-xs text-[#6B7280] mt-1">
              {loading ? "" : stats?.margin_warning
                ? "⚠ Margin in use"
                : `$${((stats?.deployed ?? 0) / 1000).toFixed(1)}K`}
            </p>
          </div>
          <StatCard
            label="Cash"
            value={loading ? "—" : `$${((stats?.cash ?? 0) / 1000).toFixed(1)}K`}
            sub={loading ? "" : `${Math.max(100 - (stats?.deployed_pct ?? 0), 0).toFixed(1)}% idle`}
          />
          <StatCard
            label="Mode"
            value="Paper"
            sub="Alpaca verified"
            color="text-[#F59E0B]"
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Portfolio chart — 2 cols */}
          <div className="lg:col-span-2 card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Portfolio Performance</h2>
              <div className="flex gap-1">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      timeframe === tf
                        ? "bg-[#F5A623]/20 text-[#F5A623]"
                        : "text-[#6B7280] hover:text-[#E8EDF2] hover:bg-white/5"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={filteredHistory}>
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F5A623" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#F5A623" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6B7280", fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(8,12,16,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    color: "#E8EDF2",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [`$${Number(v).toLocaleString()}`, "Value"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#F5A623"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#F5A623" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sector allocation */}
          <div className="card p-6">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2] mb-5">Sector Allocation</h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data?.sectors ?? []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {(data?.sectors ?? []).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgba(8,12,16,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    color: "#E8EDF2",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, "Allocation"]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {(data?.sectors ?? []).map((s) => (
                <div key={s.sector} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[#6B7280]">{s.sector}</span>
                  </div>
                  <span className="text-[#E8EDF2] font-medium">{(s.value ?? 0).toFixed(1)}%</span>
                </div>
              ))}
              {(data?.sectors ?? []).length > 0 && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/06 mt-1">
                  <span className="text-[#6B7280]">Total</span>
                  <span className="text-[#F5A623] font-semibold">
                    {(data?.sectors ?? []).reduce((sum, s) => sum + s.value, 0).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Positions table */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Active Positions</h2>
            <span className="text-xs text-[#6B7280]">{positions.length} total · sorted by weight</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/06">
                  {["Ticker", "Dir", "P&L %", "Weight", "Setup", "Conviction", "Stop", "Entry"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider pb-3 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-2 py-3"><div className="skeleton h-4 w-16" /></td>
                      ))}
                    </tr>
                  ))
                ) : positions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-[#6B7280]">
                      No active positions — pipeline has not yet run
                    </td>
                  </tr>
                ) : (
                  visiblePositions.map((pos) => (
                    <tr
                      key={pos.ticker}
                      className="tr-hover border-b border-white/04 transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/position/${pos.ticker}`}
                    >
                      {/* Ticker + company */}
                      <td className="px-2 py-3">
                        <div>
                          <span className="font-mono font-bold text-[#E8EDF2]">{pos.ticker}</span>
                          <p className="text-[11px] text-[#6B7280] mt-0.5 truncate max-w-[120px]">{pos.company}</p>
                        </div>
                      </td>
                      {/* Direction */}
                      <td className="px-2 py-3">
                        <span className={pos.direction === "long" ? "badge-long" : "badge-short"}>{pos.direction}</span>
                      </td>
                      {/* P&L % */}
                      <td className={`px-2 py-3 font-mono font-bold text-sm ${pos.pct_change >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                        {fmt(pos.pct_change)}%
                        <p className="text-[10px] font-normal" style={{ color: pos.pnl_absolute >= 0 ? "#10B981" : "#EF4444" }}>
                          {fmtCurrency(pos.pnl_absolute)}
                        </p>
                      </td>
                      {/* Portfolio weight */}
                      <td className="px-2 py-3">
                        <span className="text-sm font-mono font-semibold text-[#E8EDF2]">{(pos.pct_portfolio ?? 0).toFixed(1)}%</span>
                        <p className="text-[10px] text-[#6B7280] mt-0.5">${((pos.position_size ?? 0) / 1000).toFixed(1)}K</p>
                      </td>
                      {/* Setup type */}
                      <td className="px-2 py-3">
                        <span className="text-xs text-[#F5A623] bg-[#F5A623]/10 px-2 py-0.5 rounded-md font-medium whitespace-nowrap">
                          {pos.setup_type ?? "—"}
                        </span>
                      </td>
                      {/* Conviction */}
                      <td className="px-2 py-3">
                        {pos.conviction != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pos.conviction}%`,
                                  background: pos.conviction >= 70 ? "#10B981" : pos.conviction >= 55 ? "#F5A623" : "#6B7280",
                                }}
                              />
                            </div>
                            <span className="text-xs font-mono text-[#E8EDF2]">{pos.conviction}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#6B7280]">—</span>
                        )}
                      </td>
                      {/* Stop-loss / native protective order */}
                      <td className="px-2 py-3">
                        {pos.stop_price != null ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono text-[#EF4444]">
                                {pos.native_order_type === "trailing_stop" && pos.native_trail_pct
                                  ? `${pos.native_trail_pct}% trail`
                                  : `$${pos.stop_price.toFixed(2)}`}
                              </span>
                              {pos.has_native_stop && (
                                <span
                                  title={
                                    pos.native_order_type === "stop_limit"
                                      ? `Stop-limit: triggers @ $${pos.stop_price.toFixed(2)}, limit @ $${pos.native_limit_price?.toFixed(2) ?? "?"}`
                                      : pos.native_order_type === "trailing_stop"
                                      ? `Trailing stop: ${pos.native_trail_pct}% below peak — enforced 24/7`
                                      : pos.native_order_type === "bracket"
                                      ? `Bracket: stop @ $${pos.stop_price.toFixed(2)} | take-profit set`
                                      : "Native Alpaca stop order — enforced 24/7"
                                  }
                                  className="text-[10px] text-[#EF4444] bg-[#EF4444]/10 px-1 rounded uppercase"
                                >
                                  {pos.native_order_type === "stop_limit" ? "S/L"
                                    : pos.native_order_type === "trailing_stop" ? "TRAIL"
                                    : pos.native_order_type === "bracket" ? "BKT"
                                    : "GTC"}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[#374151]">—</span>
                        )}
                      </td>
                      {/* Entry date */}
                      <td className="px-2 py-3 text-xs text-[#6B7280] font-mono whitespace-nowrap">{pos.entry_date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* See more / collapse */}
          {positions.length > 10 && (
            <div className="mt-4 pt-4 border-t border-white/06 text-center">
              <button
                onClick={() => setShowAllPositions(!showAllPositions)}
                className="text-sm text-[#F5A623] hover:text-[#FDE68A] font-medium transition-colors"
              >
                {showAllPositions
                  ? "Show less ↑"
                  : `Show ${positions.length - 10} more positions ↓`}
              </button>
            </div>
          )}
        </div>

        {/* vs SPY benchmark panel */}
        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Returns vs SPY</h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                {benchmark?.inception_date
                  ? `Since inception ${benchmark.inception_date} · paper trading`
                  : "Cumulative returns indexed to 0% at inception · paper trading"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Alpha badge */}
              {activePeriod && !hasInsufficientHistory(activePeriod) && (
                <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${(activePeriod.alpha ?? 0) >= 0 ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#EF4444]/15 text-[#EF4444]"}`}>
                  {(activePeriod.alpha ?? 0) >= 0 ? "+" : ""}{(activePeriod.alpha ?? 0).toFixed(1)}% alpha
                </div>
              )}
              {/* Period toggles */}
              <div className="flex gap-1">
                {BENCH_PERIODS.map((p) => {
                  const key = p === "1W" ? "1w" : p === "1M" ? "1m" : p === "6M" ? "6m" : p === "YTD" ? "ytd" : null;
                  const periodData = key ? benchmark?.periods?.[key as keyof typeof benchmark.periods] : null;
                  const insufficient = p !== "All" && hasInsufficientHistory(periodData);
                  return (
                    <button
                      key={p}
                      onClick={() => setBenchPeriod(p)}
                      disabled={insufficient}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        benchPeriod === p
                          ? "bg-[#F5A623]/20 text-[#F5A623]"
                          : insufficient
                          ? "text-[#374151] cursor-not-allowed"
                          : "text-[#6B7280] hover:text-[#E8EDF2] hover:bg-white/5"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-0.5 rounded-full bg-[#F5A623]" />
              <span className="text-xs text-[#6B7280]">Portfolio</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-0.5 rounded-full bg-[#00D4FF]" />
              <span className="text-xs text-[#6B7280]">SPY</span>
            </div>
          </div>

          {benchmark?.error && !benchmark.inception_date ? (
            <div className="flex items-center justify-center h-40 text-[#6B7280] text-sm">
              No benchmark data yet — runs automatically after each pipeline run
            </div>
          ) : benchSeries.length < 2 ? (
            <div className="flex items-center justify-center h-40 text-[#6B7280] text-sm">
              {benchPeriod !== "All" ? "Insufficient history for this period" : "Accumulating data — check back after more pipeline runs"}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={benchSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6B7280", fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6B7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                    domain={["auto", "auto"]}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(8,12,16,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "10px",
                      color: "#E8EDF2",
                      fontSize: "12px",
                    }}
                    formatter={(v, name) => [
                      `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`,
                      name === "portfolio_cumulative" ? "Portfolio" : "SPY",
                    ]}
                  />
                  <Line type="monotone" dataKey="portfolio_cumulative" stroke="#F5A623" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#F5A623" }} />
                  <Line type="monotone" dataKey="spy_cumulative" stroke="#00D4FF" strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 3, fill: "#00D4FF" }} />
                </LineChart>
              </ResponsiveContainer>

              {/* Period summary row */}
              {activePeriod && !hasInsufficientHistory(activePeriod) && (
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/06">
                  <div className="text-center">
                    <p className="text-xs text-[#6B7280] mb-1">Portfolio</p>
                    <p className={`font-mono font-bold text-sm ${(activePeriod.portfolio_return_pct ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                      {(activePeriod.portfolio_return_pct ?? 0) >= 0 ? "+" : ""}{(activePeriod.portfolio_return_pct ?? 0).toFixed(2)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-[#6B7280] mb-1">SPY</p>
                    <p className={`font-mono font-bold text-sm ${(activePeriod.spy_return_pct ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                      {(activePeriod.spy_return_pct ?? 0) >= 0 ? "+" : ""}{(activePeriod.spy_return_pct ?? 0).toFixed(2)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-[#6B7280] mb-1">Alpha</p>
                    <p className={`font-mono font-bold text-sm ${(activePeriod.alpha ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                      {(activePeriod.alpha ?? 0) >= 0 ? "+" : ""}{(activePeriod.alpha ?? 0).toFixed(2)}%
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Signal Attribution panel */}
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Signal Attribution</h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                {attribution && attribution.total_closed_trades > 0
                  ? `${attribution.total_closed_trades} closed trade${attribution.total_closed_trades !== 1 ? "s" : ""} · agent directional accuracy`
                  : "Populates as positions are closed — tracks which agents predicted the right direction"}
              </p>
            </div>
            {attribution && attribution.total_closed_trades > 0 && (
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-xs text-[#6B7280]">Win Rate</p>
                  <p className={`font-mono font-bold text-lg ${(attribution.win_rate_pct ?? 0) >= 50 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {attribution.win_rate_pct != null ? `${attribution.win_rate_pct.toFixed(0)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">Avg Alpha</p>
                  <p className={`font-mono font-bold text-lg ${(attribution.avg_alpha_vs_spy ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {attribution.avg_alpha_vs_spy != null ? `${attribution.avg_alpha_vs_spy >= 0 ? "+" : ""}${attribution.avg_alpha_vs_spy.toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">Avg P&L</p>
                  <p className={`font-mono font-bold text-lg ${(attribution.avg_pnl_pct ?? 0) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {attribution.avg_pnl_pct != null ? `${attribution.avg_pnl_pct >= 0 ? "+" : ""}${attribution.avg_pnl_pct.toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!attribution || attribution.total_closed_trades === 0 ? (
            <div className="flex items-center justify-center h-24 text-[#6B7280] text-sm border border-dashed border-white/08 rounded-xl">
              No closed trades yet — attribution begins on first exit
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Agent accuracy bars */}
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-3">Directional Accuracy by Agent</p>
                <div className="space-y-3">
                  {Object.entries(attribution.agents)
                    .filter(([, d]) => d.total_trades >= 1)
                    .sort(([, a], [, b]) => (b.directional_accuracy_pct ?? 0) - (a.directional_accuracy_pct ?? 0))
                    .map(([agent, d]) => {
                      const acc = d.directional_accuracy_pct;
                      const barColor = acc == null ? "#374151" : acc >= 65 ? "#10B981" : acc >= 50 ? "#F5A623" : "#EF4444";
                      return (
                        <div key={agent}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[#E8EDF2] font-medium capitalize w-28">{agent}</span>
                            <span className="text-[#6B7280]">{d.total_trades} trade{d.total_trades !== 1 ? "s" : ""}</span>
                            <span className="font-mono font-bold" style={{ color: barColor }}>
                              {acc != null ? `${acc.toFixed(0)}%` : "—"}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/08 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${acc ?? 0}%`, background: barColor }}
                            />
                          </div>
                          <p className="text-[10px] text-[#6B7280] mt-0.5">
                            {d.correct_direction}✓ · {d.wrong_direction}✗ · {d.neutral_calls} neutral
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Recent closed trades */}
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-3">Recent Closed Trades</p>
                {attribution.recent_trades.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No closed trades yet</p>
                ) : (
                  <div className="space-y-2">
                    {attribution.recent_trades.map((t, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/04 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#E8EDF2] text-sm w-14">{t.ticker}</span>
                          <span className={t.direction === "LONG" ? "badge-long" : "badge-short"}>{t.direction.toLowerCase()}</span>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className={`font-mono font-bold text-sm ${t.pnl_pct >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                              {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-[#6B7280]">{t.exit_date}</p>
                          </div>
                          {t.alpha_vs_spy != null && (
                            <div>
                              <p className={`font-mono text-xs ${t.alpha_vs_spy >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                                {t.alpha_vs_spy >= 0 ? "+" : ""}{t.alpha_vs_spy.toFixed(1)}% α
                              </p>
                              <p className="text-[10px] text-[#6B7280]">vs SPY</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom analytics row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent conviction */}
          <div className="lg:col-span-2 card p-6">
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Agent Conviction</h2>
              <span className="text-[10px] text-[#6B7280] bg-white/05 px-2 py-1 rounded-md mt-0.5">
                {positionsClosed === 0 ? "Accuracy tracking starts on first exit" : `${positionsClosed} closed positions`}
              </span>
            </div>
            <p className="text-xs text-[#6B7280] mb-4">Avg score each agent gave to current positions — not accuracy (no exits yet)</p>
            {agentConviction.length === 0 ? (
              <p className="text-sm text-[#6B7280]">No scorecard data yet</p>
            ) : (
              <div className="space-y-3">
                {agentConviction.map((a) => (
                  <div key={a.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[#E8EDF2] font-medium w-28">{a.name}</span>
                      <span className="text-[#6B7280]">{a.count} position{a.count !== 1 ? "s" : ""}</span>
                      <span className="font-mono font-bold text-[#F5A623]">{a.score}/100</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/08 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${a.score}%`,
                          background: a.score >= 70 ? "#10B981" : a.score >= 50 ? "#F5A623" : "#F59E0B",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="space-y-4">
            <div className="card p-5">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-3">Direction Split</p>
              {(() => {
                const longs = positions.filter((p) => p.direction === "long").length;
                const shorts = positions.filter((p) => p.direction === "short").length;
                const total = positions.length || 1;
                return (
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#10B981]">Long {longs}</span>
                        <span>{((longs / total) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-[#10B981]" style={{ width: `${(longs / total) * 100}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#EF4444]">Short {shorts}</span>
                        <span>{((shorts / total) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-[#EF4444]" style={{ width: `${(shorts / total) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="card p-5">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-3">Best Performer</p>
              {positions.length > 0 ? (() => {
                // Sort by unrealised P&L in dollars — works correctly for both longs and shorts
                const best = [...positions].sort((a, b) => b.pnl_absolute - a.pnl_absolute)[0];
                const isProfit = best.pnl_absolute >= 0;
                return (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#E8EDF2]">{best.ticker}</span>
                      <span className={`font-semibold text-lg ${isProfit ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                        {fmtCurrency(best.pnl_absolute)}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1 truncate">{best.company} · {fmt(best.pct_change)}% move</p>
                  </div>
                );
              })() : <p className="text-[#6B7280] text-sm">No positions yet</p>}
            </div>

            <div className="card p-5">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-3">Worst Performer</p>
              {positions.length > 0 ? (() => {
                const worst = [...positions].sort((a, b) => a.pnl_absolute - b.pnl_absolute)[0];
                const isProfit = worst.pnl_absolute >= 0;
                return (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#E8EDF2]">{worst.ticker}</span>
                      <span className={`font-semibold text-lg ${isProfit ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                        {fmtCurrency(worst.pnl_absolute)}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1 truncate">{worst.company} · {fmt(worst.pct_change)}% move</p>
                  </div>
                );
              })() : <p className="text-[#6B7280] text-sm">No positions yet</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
