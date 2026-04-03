"use client";
// Design 2: AURORA — Deep atmospheric purple with animated nebula gradients, cinematic
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function AuroraCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    let t = 0;
    let frame: number;
    const draw = () => {
      t += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width; const H = canvas.height;

      // Flowing aurora bands
      [[W * 0.2, H * 0.4, "#6D28D9"], [W * 0.5, H * 0.6, "#7C3AED"], [W * 0.8, H * 0.3, "#4F46E5"],
       [W * 0.6, H * 0.7, "#8B5CF6"], [W * 0.3, H * 0.5, "#2563EB"]].forEach(([bx, by, color], i) => {
        const x = (bx as number) + Math.sin(t + i * 1.3) * 180;
        const y = (by as number) + Math.cos(t * 0.7 + i * 0.9) * 120;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 350 + i * 60);
        g.addColorStop(0, (color as string) + "28");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });

      // Star particles
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 3; i++) {
        const sx = (Math.sin(t * 0.1 + i * 137.5) * 0.5 + 0.5) * W;
        const sy = (Math.cos(t * 0.13 + i * 89.3) * 0.5 + 0.5) * H;
        ctx.globalAlpha = 0.4 + Math.sin(t * 3 + i) * 0.3;
        ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

// Orbital orrery — concentric animated rings with glowing planet dots
function Orrery() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 50); return () => clearInterval(t); }, []);
  const W = 320; const CX = W / 2; const CY = W / 2;
  const rings = [
    { r: 60, speed: 0.025, color: "#7C3AED", dotR: 5 },
    { r: 95, speed: 0.016, color: "#0EA5E9", dotR: 7 },
    { r: 130, speed: 0.010, color: "#8B5CF6", dotR: 4 },
    { r: 155, speed: 0.007, color: "#06B6D4", dotR: 6 },
  ];
  return (
    <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} style={{ filter: "drop-shadow(0 0 40px rgba(124,58,237,0.5))" }}>
      {/* Core glow */}
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#7C3AED" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#4C1D95" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#EDE9FE" />
          <stop offset="100%" stopColor="#7C3AED" />
        </radialGradient>
      </defs>
      <circle cx={CX} cy={CY} r={40} fill="url(#core)" />
      <circle cx={CX} cy={CY} r={22} fill="url(#glow)" opacity="0.9" />
      <circle cx={CX} cy={CY} r={10} fill="white" opacity="0.95" />

      {rings.map((ring, i) => {
        const angle = tick * ring.speed + i * 1.8;
        const dx = CX + ring.r * Math.cos(angle);
        const dy = CY + ring.r * Math.sin(angle);
        return (
          <g key={i}>
            <circle cx={CX} cy={CY} r={ring.r} fill="none" stroke={ring.color} strokeWidth="0.5" strokeOpacity="0.3" />
            <circle cx={dx} cy={dy} r={ring.dotR} fill={ring.color} filter={`drop-shadow(0 0 8px ${ring.color})`} />
          </g>
        );
      })}
    </svg>
  );
}

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface PData { stats: Stats; }

export default function Design2() {
  const [data, setData] = useState<PData | null>(null);
  useEffect(() => { fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {}); }, []);
  const s = data?.stats;
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const pos = (v: number) => v >= 0;

  return (
    <div style={{ background: "#03000E", minHeight: "100vh", overflowY: "auto", color: "white", fontFamily: "system-ui, sans-serif" }}>
      {/* Aurora bg */}
      <div className="fixed inset-0"><AuroraCanvas /></div>
      {/* Stars layer */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.3) 0%, transparent 100%), radial-gradient(1px 1px at 80% 10%, rgba(255,255,255,0.2) 0%, transparent 100%), radial-gradient(1px 1px at 50% 60%, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />
      {/* Vignette */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(3,0,14,0.8) 100%)" }} />

      {/* Nav */}
      <nav style={{ position: "relative", zIndex: 20, padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: "#EDE9FE" }}>HAZ CAPITAL</div>
        <div style={{ display: "flex", gap: 32, fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
          <Link href="/dashboard" style={{ color: "inherit", textDecoration: "none" }}>PORTFOLIO</Link>
          <Link href="/reports" style={{ color: "inherit", textDecoration: "none" }}>REPORTS</Link>
          <Link href="/team" style={{ color: "inherit", textDecoration: "none" }}>TEAM</Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "90vh", padding: "0 24px", textAlign: "center" }}>
        <div style={{ marginBottom: 48 }}><Orrery /></div>

        <div style={{ fontSize: 11, letterSpacing: 6, color: "#A78BFA", marginBottom: 20, fontWeight: 500 }}>AUTONOMOUS INTELLIGENCE</div>

        <h1 style={{ fontSize: "clamp(48px,8vw,96px)", fontWeight: 800, lineHeight: 1.05, marginBottom: 24, letterSpacing: -2,
          background: "linear-gradient(135deg, #EDE9FE 0%, #A78BFA 40%, #7C3AED 80%, #4C1D95 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
          Intelligence.<br />Automated.
        </h1>

        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.45)", maxWidth: 500, lineHeight: 1.7, marginBottom: 56 }}>
          Eight AI agents analysing every corner of the market. One autonomous portfolio. Running every market day.
        </p>

        {/* Live stats floating cards */}
        {s && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 56, width: "100%", maxWidth: 700 }}>
            {[
              { label: "Portfolio", val: fmtUsd(s.total_value), color: "#EDE9FE", isPos: true },
              { label: "Daily P&L", val: (s.daily_pnl_absolute >= 0 ? "+" : "") + fmtUsd(s.daily_pnl_absolute), sub: fmt(s.daily_pnl_pct) + "%", isPos: pos(s.daily_pnl_absolute) },
              { label: "Total P&L", val: (s.total_pnl_absolute >= 0 ? "+" : "") + fmtUsd(s.total_pnl_absolute), sub: fmt(s.total_pnl_pct) + "%", isPos: pos(s.total_pnl_absolute) },
              { label: "Positions", val: String(s.active_positions), sub: "open", isPos: true },
            ].map(item => (
              <div key={item.label} style={{
                padding: "16px 12px", borderRadius: 12, textAlign: "center",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(167,139,250,0.2)",
                backdropFilter: "blur(20px)",
              }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{item.label.toUpperCase()}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: item.isPos ? (item.color ?? "#10B981") : "#EF4444" }}>{item.val}</div>
                {item.sub && <div style={{ fontSize: 11, color: item.isPos ? "#A78BFA" : "#EF4444", marginTop: 2 }}>{item.sub}</div>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/dashboard">
            <button style={{
              padding: "16px 40px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)",
              boxShadow: "0 0 50px rgba(124,58,237,0.5), 0 0 100px rgba(124,58,237,0.2)",
              color: "white", letterSpacing: 1,
            }}>View Portfolio</button>
          </Link>
          <Link href="/reports">
            <button style={{
              padding: "16px 40px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(167,139,250,0.3)",
              color: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", letterSpacing: 1,
            }}>Daily Reports</button>
          </Link>
        </div>
      </div>

      {/* Agent strip */}
      <div style={{ position: "relative", zIndex: 10, padding: "40px 40px 80px", borderTop: "1px solid rgba(167,139,250,0.1)" }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: "#A78BFA", textAlign: "center", marginBottom: 32 }}>THE PIPELINE</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {["Macro", "News", "Sector", "Quant", "Fundamental", "Sentiment", "Institutional", "Committee"].map((name, i) => (
            <div key={name} style={{ padding: "8px 16px", borderRadius: 100, fontSize: 12, fontWeight: 500,
              background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)", color: "#C4B5FD",
              display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ opacity: 0.4, fontSize: 10 }}>{i + 1}</span> {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
