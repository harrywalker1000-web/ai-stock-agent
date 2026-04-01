"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";

interface Position {
  ticker: string; company: string; sector: string; direction: string;
  entry_price: number; current_price: number; pct_change: number;
  pnl_absolute: number; position_size: number; pct_portfolio: number;
  entry_date: string; conviction: number; status: string;
  setup_type?: string; expected_roi?: string;
}

interface PortfolioData {
  positions: Position[];
  stats: {
    total_value: number; cash: number; deployed: number; deployed_pct: number;
    total_pnl_pct: number; total_pnl_absolute: number;
    daily_pnl_pct: number; daily_pnl_absolute: number;
    active_positions: number; pipeline_status: string; pipeline_last_run: string;
  };
  history: Array<{ date: string; value: number }>;
  sectors: Array<{ sector: string; value: number; color: string }>;
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
  const [runModal, setRunModal] = useState<"review" | "full" | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [runMode, setRunMode] = useState<"review" | "full" | null>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
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

  const stats = data?.stats;
  const positions = data?.positions ?? [];

  const agentAccuracy = [
    { name: "Quant", score: 76 }, { name: "Memory", score: 80 },
    { name: "Committee", score: 73 }, { name: "Fundamental", score: 71 },
    { name: "Macro", score: 72 }, { name: "Sentiment", score: 69 },
    { name: "Sector", score: 68 }, { name: "News", score: 63 },
  ];

  const pipelineStatus = stats?.pipeline_status ?? "unknown";
  const pipelineColor = pipelineStatus === "success" ? "#10B981" : pipelineStatus === "failed" ? "#EF4444" : "#6B7280";
  const pipelineLabel = pipelineStatus === "success" ? "Pipeline OK" : pipelineStatus === "failed" ? "Pipeline Failed" : "Not Yet Run";

  return (
    <div className="min-h-screen bg-[#080C10] pb-16">
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
              className="px-4 py-2 rounded-lg text-xs font-bold text-[#0EA5E9] border border-[#0EA5E9]/30 bg-[#0EA5E9]/08 hover:bg-[#0EA5E9]/14 transition-all disabled:opacity-40"
            >
              Review Positions
            </button>
            <button
              onClick={() => setRunModal("full")}
              disabled={runStatus === "running"}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 transition-all disabled:opacity-40"
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
                <button onClick={() => startRun(runModal)} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 transition-all">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Run progress panel */}
        {runStatus !== "idle" && (
          <div className={`card p-5 mb-6 border ${runStatus === "running" ? "border-[#0EA5E9]/30" : runStatus === "done" ? "border-[#10B981]/30" : "border-[#EF4444]/30"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {runStatus === "running" && <span className="w-2 h-2 rounded-full bg-[#0EA5E9] animate-pulse" />}
                {runStatus === "done" && <span className="w-2 h-2 rounded-full bg-[#10B981]" />}
                {runStatus === "error" && <span className="w-2 h-2 rounded-full bg-[#EF4444]" />}
                <span className={`text-sm font-bold ${runStatus === "running" ? "text-[#0EA5E9]" : runStatus === "done" ? "text-[#10B981]" : "text-[#EF4444]"}`}>
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
          <StatCard
            label="Deployed"
            value={loading ? "—" : `${(stats?.deployed_pct ?? 0).toFixed(1)}%`}
            sub={loading ? "" : `$${((stats?.deployed ?? 0) / 1000).toFixed(1)}K`}
          />
          <StatCard
            label="Cash"
            value={loading ? "—" : `$${((stats?.cash ?? 0) / 1000).toFixed(1)}K`}
            sub={loading ? "" : `${(100 - (stats?.deployed_pct ?? 0)).toFixed(1)}% idle`}
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
                        ? "bg-[#0EA5E9]/20 text-[#0EA5E9]"
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
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
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
                  stroke="#0EA5E9"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#0EA5E9" }}
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
              {(data?.sectors ?? []).slice(0, 5).map((s) => (
                <div key={s.sector} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[#6B7280]">{s.sector}</span>
                  </div>
                  <span className="text-[#E8EDF2] font-medium">{s.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Positions table */}
        <div className="card p-6 mb-6">
          <h2 className="font-display text-lg font-bold text-[#E8EDF2] mb-5">Active Positions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/06">
                  {["Ticker", "Company", "Dir", "Setup Type", "Conviction", "Exp. ROI", "P&L %", "Entry Date"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider pb-3 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
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
                  positions.map((pos) => (
                    <tr
                      key={pos.ticker}
                      className="tr-hover border-b border-white/04 transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/position/${pos.ticker}`}
                    >
                      <td className="px-2 py-3">
                        <div>
                          <span className="font-mono font-bold text-[#E8EDF2]">{pos.ticker}</span>
                          <p className="text-xs text-[#6B7280] mt-0.5">{pos.sector}</p>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <span className="text-[#6B7280] max-w-[130px] block truncate text-xs">{pos.company}</span>
                      </td>
                      <td className="px-2 py-3">
                        <span className={pos.direction === "long" ? "badge-long" : "badge-short"}>{pos.direction}</span>
                      </td>
                      <td className="px-2 py-3">
                        <span className="text-xs text-[#0EA5E9] bg-[#0EA5E9]/10 px-2 py-0.5 rounded-md font-medium whitespace-nowrap">
                          {pos.setup_type ?? "—"}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#0EA5E9]" style={{ width: `${pos.conviction}%` }} />
                          </div>
                          <span className="text-xs font-mono text-[#E8EDF2]">{pos.conviction}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <span className="text-xs font-mono font-semibold text-[#10B981]">{pos.expected_roi ?? "—"}</span>
                      </td>
                      <td className={`px-2 py-3 font-mono font-semibold text-sm ${pos.pct_change >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                        {fmt(pos.pct_change)}%
                      </td>
                      <td className="px-2 py-3 text-xs text-[#6B7280] font-mono">{pos.entry_date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom analytics row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent accuracy */}
          <div className="lg:col-span-2 card p-6">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2] mb-5">Agent Signal Accuracy</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={agentAccuracy} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} width={75} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(8,12,16,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    color: "#E8EDF2",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [`${Number(v)}%`, "Accuracy"]}
                />
                <Bar dataKey="score" fill="#0EA5E9" radius={[0, 4, 4, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
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
                const best = [...positions].sort((a, b) => b.pct_change - a.pct_change)[0];
                return (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#E8EDF2]">{best.ticker}</span>
                      <span className="text-[#10B981] font-semibold text-lg">{fmt(best.pct_change)}%</span>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1 truncate">{best.company}</p>
                  </div>
                );
              })() : <p className="text-[#6B7280] text-sm">No positions yet</p>}
            </div>

            <div className="card p-5">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-widest mb-3">Worst Performer</p>
              {positions.length > 0 ? (() => {
                const worst = [...positions].sort((a, b) => a.pct_change - b.pct_change)[0];
                return (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#E8EDF2]">{worst.ticker}</span>
                      <span className={`font-semibold text-lg ${worst.pct_change >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                        {fmt(worst.pct_change)}%
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1 truncate">{worst.company}</p>
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
