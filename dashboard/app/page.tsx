"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// HeroCanvas — floating ticker particles (unchanged from original)
// ---------------------------------------------------------------------------
function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const tickers = [
      "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "UNH",
      "SPY", "DG", "EL", "CRM", "MKC", "COIN", "GS", "JPM", "BRK",
      "+2.4%", "-1.8%", "+5.2%", "-3.1%", "+8.7%", "BUY", "LONG",
    ];

    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      alpha: number; size: number; text: string; color: string;
    }> = [];

    const colors = ["#0EA5E9", "#06B6D4", "rgba(14,165,233,0.5)", "rgba(255,255,255,0.3)"];

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.4 + 0.1,
        size: Math.floor(Math.random() * 4) + 8,
        text: tickers[Math.floor(Math.random() * tickers.length)],
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let frame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -50) p.x = canvas.width + 50;
        if (p.x > canvas.width + 50) p.x = -50;
        if (p.y < -20) p.y = canvas.height + 20;
        if (p.y > canvas.height + 20) p.y = -20;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.font = `${p.size}px "Space Grotesk", monospace`;
        ctx.fillText(p.text, p.x, p.y);
      });

      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full opacity-20"
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// AIEntity — central geometric entity (unchanged from original)
// ---------------------------------------------------------------------------
function AIEntity() {
  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      {/* Outer rotating ring */}
      <div
        className="absolute w-64 h-64 rounded-full border border-[#0EA5E9]/20 animate-[spin_25s_linear_infinite]"
        style={{
          backgroundImage: "conic-gradient(from 0deg, transparent 70%, rgba(14,165,233,0.3) 100%)",
        }}
      />
      {/* Middle pulsing ring */}
      <div
        className="absolute w-48 h-48 rounded-full border border-[#0EA5E9]/30 animate-[spin_15s_linear_infinite_reverse]"
        style={{
          backgroundImage: "conic-gradient(from 180deg, transparent 60%, rgba(6,182,212,0.4) 100%)",
        }}
      />
      {/* Inner ring */}
      <div className="absolute w-32 h-32 rounded-full border border-[#0EA5E9]/40 animate-pulse-slow" />

      {/* Core hexagon */}
      <div
        className="relative z-10 w-24 h-24 flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(6,182,212,0.1) 100%)",
          boxShadow: "0 0 60px rgba(14,165,233,0.3), inset 0 0 30px rgba(14,165,233,0.1)",
          borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%",
          border: "1px solid rgba(14,165,233,0.4)",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="3" fill="#0EA5E9" />
          <circle cx="8" cy="12" r="2" fill="#06B6D4" />
          <circle cx="32" cy="12" r="2" fill="#06B6D4" />
          <circle cx="8" cy="28" r="2" fill="#06B6D4" />
          <circle cx="32" cy="28" r="2" fill="#06B6D4" />
          <circle cx="20" cy="6" r="1.5" fill="#0EA5E9" opacity="0.7" />
          <circle cx="20" cy="34" r="1.5" fill="#0EA5E9" opacity="0.7" />
          <line x1="20" y1="20" x2="8" y2="12" stroke="#0EA5E9" strokeWidth="0.8" strokeOpacity="0.6" />
          <line x1="20" y1="20" x2="32" y2="12" stroke="#0EA5E9" strokeWidth="0.8" strokeOpacity="0.6" />
          <line x1="20" y1="20" x2="8" y2="28" stroke="#0EA5E9" strokeWidth="0.8" strokeOpacity="0.6" />
          <line x1="20" y1="20" x2="32" y2="28" stroke="#0EA5E9" strokeWidth="0.8" strokeOpacity="0.6" />
          <line x1="20" y1="20" x2="20" y2="6" stroke="#0EA5E9" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="20" y1="20" x2="20" y2="34" stroke="#0EA5E9" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="8" y1="12" x2="32" y2="12" stroke="#06B6D4" strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1="8" y1="28" x2="32" y2="28" stroke="#06B6D4" strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1="8" y1="12" x2="8" y2="28" stroke="#06B6D4" strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1="32" y1="12" x2="32" y2="28" stroke="#06B6D4" strokeWidth="0.5" strokeOpacity="0.3" />
        </svg>
      </div>

      {/* Orbiting data points */}
      {[0, 72, 144, 216, 288].map((deg, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-[#0EA5E9]"
          style={{
            transform: `rotate(${deg}deg) translateX(96px)`,
            opacity: 0.6,
            boxShadow: "0 0 6px rgba(14,165,233,0.8)",
            animation: `spin ${20 + i * 3}s linear infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PortfolioStats {
  total_value: number;
  daily_pnl_absolute: number;
  daily_pnl_pct: number;
  total_pnl_absolute: number;
  total_pnl_pct: number;
  active_positions: number;
}

interface Position {
  ticker: string;
  direction: string;
  pct_change: number;
  entry_date: string;
}

interface PortfolioData {
  stats: PortfolioStats;
  positions: Position[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(value: number): string {
  if (value >= 0) return `+${value.toFixed(2)}`;
  return `${value.toFixed(2)}`;
}

function fmtUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// LiveStatsStrip
// ---------------------------------------------------------------------------
function SkeletonPill() {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-3 w-16 rounded bg-white/10 animate-pulse" />
      <div className="h-6 w-24 rounded bg-white/10 animate-pulse" />
      <div className="h-3 w-12 rounded bg-white/10 animate-pulse" />
    </div>
  );
}

function LiveStatsStrip({ data, loading }: { data: PortfolioData | null; loading: boolean }) {
  const positive = (n: number) => n >= 0;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/[0.06]"
      style={{ background: "rgba(8,12,16,0.85)", backdropFilter: "blur(16px)" }}
    >
      <div className="max-w-5xl mx-auto px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-6">
        {loading || !data ? (
          <>
            <SkeletonPill />
            <SkeletonPill />
            <SkeletonPill />
            <SkeletonPill />
          </>
        ) : (
          <>
            {/* Portfolio Value */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-[#6B7280] font-medium">Portfolio Value</span>
              <span className="text-xl font-bold text-[#E8EDF2] font-display tabular-nums">
                {fmtUsd(data.stats.total_value)}
              </span>
              <span className="text-[11px] text-[#6B7280]">paper trading</span>
            </div>

            {/* Daily P&L */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-[#6B7280] font-medium">Daily P&amp;L</span>
              <span
                className="text-xl font-bold font-display tabular-nums"
                style={{ color: positive(data.stats.daily_pnl_absolute) ? "#10B981" : "#EF4444" }}
              >
                {fmt(data.stats.daily_pnl_absolute)}
              </span>
              <span
                className="text-[11px] font-medium"
                style={{ color: positive(data.stats.daily_pnl_pct) ? "#10B981" : "#EF4444" }}
              >
                {fmt(data.stats.daily_pnl_pct)}%
              </span>
            </div>

            {/* Active Positions */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-[#6B7280] font-medium">Active Positions</span>
              <span className="text-xl font-bold text-[#E8EDF2] font-display tabular-nums">
                {data.stats.active_positions}
              </span>
              <span className="text-[11px] text-[#6B7280]">open trades</span>
            </div>

            {/* Total P&L */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-[#6B7280] font-medium">Total P&amp;L</span>
              <span
                className="text-xl font-bold font-display tabular-nums"
                style={{ color: positive(data.stats.total_pnl_absolute) ? "#10B981" : "#EF4444" }}
              >
                {fmt(data.stats.total_pnl_absolute)}
              </span>
              <span
                className="text-[11px] font-medium"
                style={{ color: positive(data.stats.total_pnl_pct) ? "#10B981" : "#EF4444" }}
              >
                {fmt(data.stats.total_pnl_pct)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline agents
// ---------------------------------------------------------------------------
const AGENTS = [
  { icon: "🌐", name: "Macro", desc: "Fed policy, rates, global regime" },
  { icon: "📰", name: "News", desc: "Real-time sentiment from headlines" },
  { icon: "📊", name: "Sector", desc: "Rotation and relative strength" },
  { icon: "🔢", name: "Quant", desc: "Statistical signals and momentum" },
  { icon: "📈", name: "Fundamental", desc: "Earnings, margins, valuation" },
  { icon: "💬", name: "Sentiment", desc: "Options flow and social signal" },
  { icon: "🏦", name: "Institutional", desc: "13F filings and block trades" },
  { icon: "⚖️", name: "Committee", desc: "Consensus vote and sizing" },
];

function PipelineSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-[#0EA5E9] font-medium mb-3 text-center">
          Agent Pipeline
        </p>
        <h2 className="text-3xl font-bold text-[#E8EDF2] font-display text-center mb-12">
          Eight specialists. One decision.
        </h2>

        {/* Horizontally scrollable strip */}
        <div className="overflow-x-auto pb-4 -mx-6 px-6">
          <div className="flex items-center gap-0 min-w-max mx-auto">
            {AGENTS.map((agent, i) => (
              <div key={agent.name} className="flex items-center">
                {/* Card */}
                <div
                  className="group relative w-36 rounded-xl p-4 cursor-default transition-all duration-300
                    hover:scale-[1.04] hover:-translate-y-1"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 24px rgba(14,165,233,0.25)";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(14,165,233,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  <div className="text-2xl mb-2">{agent.icon}</div>
                  <div className="text-sm font-semibold text-[#E8EDF2] mb-1">{agent.name}</div>
                  <div className="text-[11px] text-[#6B7280] leading-snug">{agent.desc}</div>

                  {/* Step number */}
                  <div
                    className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-[#0EA5E9]"
                    style={{ background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.2)" }}
                  >
                    {i + 1}
                  </div>
                </div>

                {/* Connector arrow */}
                {i < AGENTS.length - 1 && (
                  <div className="flex items-center px-1">
                    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                      <path
                        d="M0 6h16M12 1l5 5-5 5"
                        stroke="rgba(14,165,233,0.35)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live Positions section
// ---------------------------------------------------------------------------
function PositionCard({ pos }: { pos: Position }) {
  const isLong = pos.direction === "long";
  const positive = pos.pct_change >= 0;

  return (
    <Link href={`/position/${pos.ticker}`}>
      <div
        className="rounded-xl p-5 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 20px rgba(14,165,233,0.15)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(14,165,233,0.3)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <span className="text-lg font-bold text-[#E8EDF2] font-display">{pos.ticker}</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{
              background: isLong ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
              color: isLong ? "#10B981" : "#EF4444",
              border: `1px solid ${isLong ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}
          >
            {pos.direction}
          </span>
        </div>

        <div
          className="text-2xl font-bold font-display tabular-nums mb-1"
          style={{ color: positive ? "#10B981" : "#EF4444" }}
        >
          {fmt(pos.pct_change)}%
        </div>

        <div className="text-[11px] text-[#6B7280]">
          Entry: {pos.entry_date !== "—" ? pos.entry_date : "pending"}
        </div>
      </div>
    </Link>
  );
}

function LivePositionsSection({ positions }: { positions: Position[] }) {
  const top3 = positions.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-[#0EA5E9] font-medium mb-3 text-center">
          Live Positions
        </p>
        <h2 className="text-2xl font-bold text-[#E8EDF2] font-display text-center mb-8">
          Current holdings
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {top3.map((pos) => (
            <PositionCard key={pos.ticker} pos={pos} />
          ))}
        </div>
        <div className="text-center mt-6">
          <Link
            href="/dashboard"
            className="text-sm text-[#0EA5E9] hover:text-[#38BDF8] transition-colors duration-200 underline underline-offset-4"
          >
            View all positions
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How It Works section
// ---------------------------------------------------------------------------
const HOW_IT_WORKS = [
  {
    time: "9:45 AM ET",
    title: "Daily Analysis",
    desc: "All agents analyse the full market universe — macro, news, sector rotation, quant signals, fundamentals, and sentiment.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    time: "Committee Vote",
    title: "Committee Vote",
    desc: "Every agent scores each candidate. The committee aggregates scores, resolves conflicts, and determines sizing with conviction weighting.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    time: "Automated",
    title: "Execution",
    desc: "Orders are placed automatically via Alpaca paper trading. Positions are tracked in real time and reviewed each morning.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

function HowItWorksSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-[#0EA5E9] font-medium mb-3 text-center">
          How It Works
        </p>
        <h2 className="text-3xl font-bold text-[#E8EDF2] font-display text-center mb-12">
          From signal to execution
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((step) => (
            <div
              key={step.title}
              className="rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02]"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.2)" }}
              >
                {step.icon}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[#0EA5E9] font-medium mb-1">
                {step.time}
              </div>
              <h3 className="text-base font-bold text-[#E8EDF2] mb-2">{step.title}</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer CTA
// ---------------------------------------------------------------------------
function FooterCTA() {
  return (
    <section className="py-24 px-6 text-center">
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 600px 300px at 50% 50%, rgba(14,165,233,0.06) 0%, transparent 70%)",
        }}
      />
      <p className="text-[10px] uppercase tracking-widest text-[#0EA5E9] font-medium mb-4">
        Ready to explore?
      </p>
      <h2 className="text-4xl font-bold text-[#E8EDF2] font-display mb-10">
        The portfolio is live.
      </h2>
      <div className="flex flex-col items-center gap-4">
        <Link href="/dashboard">
          <button
            className="px-10 py-4 rounded-xl font-semibold text-white text-base transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%)",
              boxShadow: "0 0 40px rgba(14,165,233,0.4)",
            }}
          >
            Enter Portfolio
          </button>
        </Link>
        <Link
          href="/reports"
          className="text-sm text-[#6B7280] hover:text-[#E8EDF2] transition-colors duration-200 underline underline-offset-4"
        >
          View Reports
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------
function Divider() {
  return (
    <div className="max-w-4xl mx-auto px-6">
      <div
        className="h-px w-full"
        style={{ background: "linear-gradient(to right, transparent, rgba(14,165,233,0.2), transparent)" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function HomePage() {
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((data: PortfolioData) => {
        setPortfolioData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-[#080C10] text-[#E8EDF2] min-h-screen overflow-y-auto">

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 1 — HERO (100vh)                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(14,165,233,1) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,1) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
          aria-hidden
        />

        {/* Floating tickers */}
        <HeroCanvas />

        {/* Ambient orbs */}
        <div
          className="orb w-[600px] h-[600px]"
          style={{
            background: "#0EA5E9",
            top: "-100px",
            left: "-100px",
            animation: "orb 14s ease-in-out infinite",
          }}
          aria-hidden
        />
        <div
          className="orb w-[500px] h-[500px]"
          style={{
            background: "#06B6D4",
            bottom: "-100px",
            right: "-100px",
            animation: "orb 18s ease-in-out infinite reverse",
          }}
          aria-hidden
        />

        {/* Main hero content */}
        <div className="relative z-10 text-center px-6 max-w-4xl pb-32">
          <div className="flex justify-center mb-10">
            <AIEntity />
          </div>

          <h1
            className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-[#E8EDF2] tracking-tight leading-tight mb-4"
            style={{ textShadow: "0 0 60px rgba(14,165,233,0.15)" }}
          >
            The market doesn&apos;t wait.
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #0EA5E9 0%, #06B6D4 50%, #E8EDF2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Neither do we.
            </span>
          </h1>

          <p className="text-[#6B7280] text-lg sm:text-xl mb-10 max-w-xl mx-auto font-light tracking-wide">
            A fully autonomous AI hedge fund.{" "}
            <span className="text-[#E8EDF2]/60">11 agents. One portfolio.</span>
          </p>

          <div className="flex items-center justify-center gap-3 mb-10 flex-wrap">
            {["11 Agents", "Daily Pipeline", "Paper Trading", "Forward-Looking"].map((tag) => (
              <span
                key={tag}
                className="text-xs font-medium text-[#6B7280] px-3 py-1.5 rounded-full"
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/dashboard">
              <button
                className="px-8 py-4 rounded-xl font-semibold text-white text-sm transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%)",
                  boxShadow: "0 0 30px rgba(14,165,233,0.35)",
                }}
              >
                View Portfolio
              </button>
            </Link>
            <Link href="/team">
              <button
                className="px-8 py-4 rounded-xl font-semibold text-[#E8EDF2] text-sm transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] hover:border-[#0EA5E9]/50"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                }}
              >
                Meet the Team
              </button>
            </Link>
          </div>
        </div>

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none z-10"
          style={{ background: "linear-gradient(to top, #080C10, transparent)" }}
          aria-hidden
        />

        {/* Live stats strip */}
        <LiveStatsStrip data={portfolioData} loading={loading} />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2 — PIPELINE FLOW                                           */}
      {/* ------------------------------------------------------------------ */}
      <PipelineSection />

      <Divider />

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 3 — LIVE POSITIONS (conditional)                            */}
      {/* ------------------------------------------------------------------ */}
      {portfolioData && portfolioData.positions.length > 0 && (
        <>
          <LivePositionsSection positions={portfolioData.positions} />
          <Divider />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 4 — HOW IT WORKS                                            */}
      {/* ------------------------------------------------------------------ */}
      <HowItWorksSection />

      <Divider />

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 5 — FOOTER CTA                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative">
        <FooterCTA />
      </div>
    </div>
  );
}
