"use client";
// Design 3: EDITORIAL — Metalab-inspired. Large type, position pills left, brutalist confidence.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface Position { ticker: string; direction: string; pct_change: number; sector: string; }
interface PData { stats: Stats; positions: Position[]; }

// Horizontal ticker tape
function TickerTape({ positions }: { positions: Position[] }) {
  const items = [...positions, ...positions, ...positions];
  return (
    <div style={{ overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "12px 0" }}>
      <div style={{
        display: "flex", gap: 40, whiteSpace: "nowrap",
        animation: "tape 30s linear infinite",
      }}>
        {items.map((p, i) => (
          <span key={i} style={{ fontSize: 12, letterSpacing: 2, color: p.pct_change >= 0 ? "#10B981" : "#EF4444", fontFamily: "monospace" }}>
            {p.ticker} &nbsp; {p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(2)}%
            <span style={{ opacity: 0.2, margin: "0 20px" }}>·</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes tape { from { transform: translateX(0) } to { transform: translateX(-33.33%) } }`}</style>
    </div>
  );
}

// Giant revolving ring with text — like an editorial accent
function Ring() {
  const [deg, setDeg] = useState(0);
  useEffect(() => { const t = setInterval(() => setDeg(d => d + 0.15), 16); return () => clearInterval(t); }, []);
  const r = 110; const cx = 130; const cy = 130;
  const label = "AUTONOMOUS · AI · HEDGE · FUND · 2024 · PAPER · TRADING · LIVE · ";
  return (
    <svg width={260} height={260} viewBox="0 0 260 260" style={{ overflow: "visible" }}>
      <defs>
        <path id="circle-path" d={`M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r}`} />
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      <g style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${deg}deg)` }}>
        <text fontSize={8} fill="rgba(255,255,255,0.25)" letterSpacing={3} fontFamily="monospace">
          <textPath href="#circle-path">{label}{label}</textPath>
        </text>
      </g>
      {/* Center HAZ mark */}
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={18} fill="white" fontWeight={700} letterSpacing={4} fontFamily="monospace">HAZ</text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.3)" letterSpacing={5} fontFamily="monospace">CAPITAL</text>
    </svg>
  );
}

export default function Design3() {
  const [data, setData] = useState<PData | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {});
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollY(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const s = data?.stats;
  const positions = data?.positions ?? [];
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  return (
    <div ref={containerRef} style={{ background: "#0C0C0C", minHeight: "100vh", overflowY: "auto", color: "white", fontFamily: "system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 30,
        padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: scrollY > 20 ? "rgba(12,12,12,0.95)" : "transparent",
        backdropFilter: scrollY > 20 ? "blur(20px)" : "none",
        borderBottom: scrollY > 20 ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
        transition: "all 0.3s",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 4, color: "rgba(255,255,255,0.9)" }}>HAZ CAPITAL</span>
        <div style={{ display: "flex", gap: 32, fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>
          <Link href="/dashboard" style={{ color: "inherit", textDecoration: "none", transition: "color 0.2s" }}>PORTFOLIO</Link>
          <Link href="/reports" style={{ color: "inherit", textDecoration: "none" }}>REPORTS</Link>
          <Link href="/team" style={{ color: "inherit", textDecoration: "none" }}>TEAM</Link>
        </div>
      </nav>

      {/* Hero — two column */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" }}>
        {/* Left: position list pills */}
        <div style={{ padding: "60px 24px 40px", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>LIVE POSITIONS</div>
          {positions.slice(0, 11).map(p => (
            <Link href={`/position/${p.ticker}`} key={p.ticker} style={{ textDecoration: "none" }}>
              <div style={{
                padding: "8px 14px", borderRadius: 100, fontSize: 12, fontWeight: 500, cursor: "pointer",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: p.pct_change >= 0 ? "#10B981" : "#EF4444",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: "border-color 0.2s, background 0.2s",
              }}>
                <span style={{ color: "white", fontSize: 11, fontWeight: 600 }}>{p.ticker}</span>
                <span style={{ fontSize: 10 }}>{p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(1)}%</span>
              </div>
            </Link>
          ))}
          {positions.length === 0 && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", lineHeight: 1.8 }}>Loading<br />positions…</div>
          )}

          <div style={{ flex: 1 }} />
          <Link href="/dashboard">
            <div style={{ padding: "8px 14px", borderRadius: 100, fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", cursor: "pointer", textAlign: "center" }}>
              All positions →
            </div>
          </Link>
        </div>

        {/* Right: main editorial content */}
        <div style={{ padding: "60px 60px 40px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 60 }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: 4, color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>AUTONOMOUS TRADING · EST. 2024</div>
                <h1 style={{
                  fontSize: "clamp(60px, 10vw, 130px)", fontWeight: 900, lineHeight: 0.92, letterSpacing: -4,
                  color: "white", margin: 0,
                }}>
                  We trade<br />
                  <span style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic", fontWeight: 400 }}>markets.</span>
                </h1>
              </div>
              <div style={{ flexShrink: 0, marginLeft: 40 }}>
                <Ring />
              </div>
            </div>

            <div style={{ maxWidth: 500, marginBottom: 48 }}>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", lineHeight: 1.8, margin: 0 }}>
                Eight AI specialists — macro, quant, fundamental, sentiment and more — converge daily into a single autonomous decision. Every trade logged. Every call accountable.
              </p>
            </div>

            {/* Stats row */}
            {s && (
              <div style={{ display: "flex", gap: 0, marginBottom: 48, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 32 }}>
                {[
                  { label: "Portfolio", val: fmtUsd(s.total_value) },
                  { label: "Daily", val: fmt(s.daily_pnl_pct) + "%", color: s.daily_pnl_pct >= 0 ? "#10B981" : "#EF4444" },
                  { label: "Total P&L", val: fmtUsd(s.total_pnl_absolute), color: s.total_pnl_absolute >= 0 ? "#10B981" : "#EF4444" },
                  { label: "Positions", val: String(s.active_positions) },
                ].map((item, i) => (
                  <div key={item.label} style={{ flex: 1, paddingLeft: i > 0 ? 32 : 0, borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none", marginLeft: i > 0 ? 32 : 0 }}>
                    <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>{item.label.toUpperCase()}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: item.color ?? "white", letterSpacing: -1 }}>{item.val}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Link href="/dashboard">
                <button style={{
                  padding: "16px 36px", background: "white", color: "#0C0C0C", border: "none",
                  fontSize: 13, fontWeight: 700, letterSpacing: 2, cursor: "pointer", borderRadius: 4,
                }}>ENTER PORTFOLIO</button>
              </Link>
              <Link href="/reports">
                <button style={{
                  padding: "16px 36px", background: "transparent", color: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, fontWeight: 500, cursor: "pointer", borderRadius: 4, letterSpacing: 2,
                }}>DAILY REPORTS</button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Ticker tape */}
      {positions.length > 0 && <TickerTape positions={positions} />}

      {/* Agent grid */}
      <div style={{ padding: "60px 40px 80px" }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: "rgba(255,255,255,0.2)", marginBottom: 40 }}>AGENT PIPELINE / 8 SPECIALISTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 1 }}>
          {["Macro", "News", "Sector", "Quant", "Fundamental", "Sentiment", "Institutional", "Committee"].map((name, i) => (
            <div key={name} style={{
              padding: "24px 16px", border: "1px solid rgba(255,255,255,0.06)",
              transition: "background 0.2s",
            }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
