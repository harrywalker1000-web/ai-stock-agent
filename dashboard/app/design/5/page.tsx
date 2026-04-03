"use client";
// Design 5: GLASS VAULT — Deep navy space + overlapping frosted glass panels. Gold + cyan luxury fintech.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function SpaceCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);

    // Stars
    type Star = { x: number; y: number; r: number; alpha: number; pulse: number };
    const stars: Star[] = Array.from({ length: 180 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.5 + 0.3,
      alpha: Math.random() * 0.6 + 0.1,
      pulse: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    let frame: number;
    const draw = () => {
      t += 0.01;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        const a = s.alpha * (0.7 + 0.3 * Math.sin(t + s.pulse));
        ctx.globalAlpha = a;
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Nebula blobs
      [[0.15, 0.3, "#F5A623"], [0.8, 0.6, "#0EA5E9"], [0.5, 0.8, "#8B5CF6"], [0.6, 0.2, "#06B6D4"]].forEach(([rx, ry, color]) => {
        const x = (rx as number) * canvas.width + Math.sin(t * 0.2) * 30;
        const y = (ry as number) * canvas.height + Math.cos(t * 0.15) * 20;
        const g = ctx.createRadialGradient(x, y, 0, x, y, canvas.width * 0.25);
        g.addColorStop(0, (color as string) + "12");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

// Animated golden ring with data points orbiting
function GoldOrb() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 33); return () => clearInterval(t); }, []);
  const cx = 180; const cy = 180; const size = 360;
  const orbiters = [
    { r: 80, speed: 0.018, color: "#F5A623", label: "FUND", dot: 8 },
    { r: 110, speed: 0.012, color: "#0EA5E9", label: "QUANT", dot: 6 },
    { r: 140, speed: 0.008, color: "#8B5CF6", label: "SENT", dot: 5 },
    { r: 165, speed: 0.005, color: "#06B6D4", label: "MACRO", dot: 7 },
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: "drop-shadow(0 0 60px rgba(245,166,35,0.2))" }}>
      <defs>
        <radialGradient id="g5core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#F5A623" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#92400E" stopOpacity="0" />
        </radialGradient>
        {orbiters.map((o, i) => (
          <linearGradient key={i} id={`oring${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={o.color} stopOpacity="0" />
            <stop offset="50%" stopColor={o.color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={o.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {/* Rings */}
      {orbiters.map((o, i) => (
        <circle key={`ring-${i}`} cx={cx} cy={cy} r={o.r} fill="none" stroke={o.color} strokeWidth="0.5" strokeOpacity="0.2" />
      ))}

      {/* Core glow */}
      <circle cx={cx} cy={cy} r={55} fill="url(#g5core)" />
      <circle cx={cx} cy={cy} r={28} fill="#F5A623" opacity="0.7" />
      <circle cx={cx} cy={cy} r={14} fill="#FEF3C7" opacity="0.95" />
      {/* HAZ text */}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={10} fill="#92400E" fontWeight={700} letterSpacing={3} fontFamily="monospace">HAZ</text>

      {/* Orbiters */}
      {orbiters.map((o, i) => {
        const angle = tick * o.speed + i * 1.5;
        const dx = cx + o.r * Math.cos(angle);
        const dy = cy + o.r * Math.sin(angle);
        const ldx = cx + o.r * Math.cos(angle + 0.3);
        const ldy = cy + o.r * Math.sin(angle + 0.3);
        return (
          <g key={`orb-${i}`}>
            <circle cx={dx} cy={dy} r={o.dot} fill={o.color} filter={`drop-shadow(0 0 10px ${o.color})`} />
            <text x={ldx + 8} y={ldy + 4} fontSize={7} fill={o.color} fontFamily="monospace" opacity={0.7}>{o.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface PData { stats: Stats; positions: { ticker: string; pct_change: number; direction: string; sector: string }[]; }

const glass = {
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 20,
};

export default function Design5() {
  const [data, setData] = useState<PData | null>(null);
  useEffect(() => { fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {}); }, []);
  const s = data?.stats;
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  return (
    <div style={{ background: "#020B18", minHeight: "100vh", overflowY: "auto", color: "white", fontFamily: "system-ui, sans-serif" }}>
      {/* Space bg */}
      <div className="fixed inset-0"><SpaceCanvas /></div>
      {/* Gold radial at center-top */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 800px 400px at 50% 10%, rgba(245,166,35,0.06) 0%, transparent 70%)" }} />

      {/* Nav — glass */}
      <nav style={{ position: "relative", zIndex: 20, padding: "16px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", ...glass, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #F5A623, #D97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "#020B18", letterSpacing: 1 }}>H</div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: "#FDE68A" }}>HAZ CAPITAL</span>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>
          <Link href="/dashboard" style={{ color: "#F5A623", textDecoration: "none" }}>PORTFOLIO</Link>
          <Link href="/reports" style={{ color: "inherit", textDecoration: "none" }}>REPORTS</Link>
          <Link href="/team" style={{ color: "inherit", textDecoration: "none" }}>TEAM</Link>
        </div>
      </nav>

      {/* Main hero */}
      <div style={{ position: "relative", zIndex: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 60, padding: "60px 60px 40px", alignItems: "center", minHeight: "calc(90vh - 60px)" }}>
        {/* Left */}
        <div>
          <div style={{ fontSize: 10, letterSpacing: 5, color: "#F5A623", marginBottom: 24, opacity: 0.8 }}>AUTONOMOUS INTELLIGENCE · PAPER TRADING</div>

          <h1 style={{
            fontSize: "clamp(56px,9vw,110px)", fontWeight: 800, lineHeight: 1.0, letterSpacing: -4, marginBottom: 28,
            background: "linear-gradient(135deg, #FEF3C7 0%, #F5A623 40%, #D97706 80%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            The vault<br />
            <span style={{ background: "linear-gradient(135deg, #E8EDF2 0%, rgba(255,255,255,0.4) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              is open.
            </span>
          </h1>

          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 460, lineHeight: 1.8, marginBottom: 48 }}>
            Eight AI specialists working in concert — macro, quant, fundamental, sentiment. Every market signal analysed. Every position sized by conviction.
          </p>

          {/* Glass stat cards */}
          {s && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 48, maxWidth: 440 }}>
              {[
                { label: "Portfolio Value", val: fmtUsd(s.total_value), color: "#F5A623" },
                { label: "Daily P&L", val: fmt(s.daily_pnl_absolute), sub: fmt(s.daily_pnl_pct) + "%", color: s.daily_pnl_absolute >= 0 ? "#10B981" : "#EF4444" },
                { label: "Total P&L", val: fmt(s.total_pnl_absolute), sub: fmt(s.total_pnl_pct) + "%", color: s.total_pnl_absolute >= 0 ? "#10B981" : "#EF4444" },
                { label: "Open Positions", val: String(s.active_positions), sub: "active trades", color: "#0EA5E9" },
              ].map(item => (
                <div key={item.label} style={{ ...glass, padding: "20px 24px" }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>{item.label.toUpperCase()}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: item.color, letterSpacing: -0.5 }}>{item.val}</div>
                  {item.sub && <div style={{ fontSize: 11, color: item.color, opacity: 0.6, marginTop: 4 }}>{item.sub}</div>}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/dashboard">
              <button style={{
                padding: "16px 40px", borderRadius: 12, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", letterSpacing: 1,
                background: "linear-gradient(135deg, #F5A623 0%, #D97706 100%)",
                boxShadow: "0 0 40px rgba(245,166,35,0.4), 0 8px 32px rgba(0,0,0,0.3)",
                color: "#020B18",
              }}>Enter Portfolio</button>
            </Link>
            <Link href="/reports">
              <button style={{
                padding: "16px 40px", fontSize: 14, fontWeight: 600, cursor: "pointer", letterSpacing: 1,
                ...glass, color: "rgba(255,255,255,0.7)",
              }}>Daily Reports</button>
            </Link>
          </div>
        </div>

        {/* Right: Orb + position list */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <GoldOrb />
          {/* Glass positions panel */}
          <div style={{ ...glass, padding: "20px 24px", width: 260 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#F5A623", marginBottom: 16, opacity: 0.8 }}>LIVE POSITIONS</div>
            {(data?.positions ?? []).slice(0, 7).map(p => (
              <Link href={`/position/${p.ticker}`} key={p.ticker} style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{p.ticker}</span>
                  <span style={{ color: p.pct_change >= 0 ? "#10B981" : "#EF4444", fontFamily: "monospace" }}>
                    {p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(2)}%
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom agent pills */}
      <div style={{ position: "relative", zIndex: 10, padding: "32px 60px 60px" }}>
        <div style={{ ...glass, padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: 4, color: "#F5A623", opacity: 0.7 }}>PIPELINE</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Macro", "News", "Sector", "Quant", "Fundamental", "Sentiment", "Institutional", "Committee"].map((name, i) => (
              <div key={name} style={{
                padding: "6px 14px", borderRadius: 100, fontSize: 11, fontWeight: 500,
                background: i === 7 ? "rgba(245,166,35,0.15)" : "rgba(255,255,255,0.04)",
                border: i === 7 ? "1px solid rgba(245,166,35,0.4)" : "1px solid rgba(255,255,255,0.08)",
                color: i === 7 ? "#F5A623" : "rgba(255,255,255,0.5)",
              }}>{name}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
