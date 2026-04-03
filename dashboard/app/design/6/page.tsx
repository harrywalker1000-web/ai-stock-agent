"use client";
// Design 6: NEON VAULT — Perspective grid floor (D4) + glass panels + gold orb (D5) + pink/cyan neon
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function GridStarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    type Star = { x: number; y: number; r: number; p: number };
    const stars: Star[] = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * Math.PI * 2 }));
    let t = 0; let frame: number;
    const draw = () => {
      t += 0.008;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width; const H = canvas.height;

      // Stars
      stars.forEach(s => {
        ctx.globalAlpha = (0.15 + 0.2 * Math.sin(t + s.p));
        ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Atmospheric nebula glow
      [["#FF006E", 0.2, 0.2], ["#00D4FF", 0.8, 0.3], ["#7C3AED", 0.5, 0.15], ["#F5A623", 0.15, 0.7]].forEach(([col, rx, ry]) => {
        const x = (rx as number) * W + Math.sin(t * 0.2) * 60;
        const y = (ry as number) * H + Math.cos(t * 0.15) * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.28);
        g.addColorStop(0, (col as string) + "18"); g.addColorStop(1, "transparent");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });

      // Perspective grid floor (bottom 40%)
      const gy = H * 0.6;
      const vanishX = W / 2;
      ctx.strokeStyle = "rgba(255,0,110,0.18)"; ctx.lineWidth = 1;
      for (let i = -18; i <= 18; i++) {
        const bx = W / 2 + i * 70;
        ctx.beginPath(); ctx.moveTo(bx, H); ctx.lineTo(vanishX, gy); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(0,212,255,0.12)";
      for (let j = 0; j < 12; j++) {
        const progress = ((j / 12) + t * 0.25) % 1;
        const y = gy + (H - gy) * progress;
        const spread = (y - gy) / (H - gy);
        ctx.globalAlpha = spread * 0.5;
        ctx.beginPath(); ctx.moveTo(vanishX - spread * W * 0.85, y); ctx.lineTo(vanishX + spread * W * 0.85, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

function NeonOrb() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 33); return () => clearInterval(t); }, []);
  const cx = 160; const cy = 160; const size = 320;
  const rings = [
    { r: 70,  speed: 0.022, color: "#FF006E", dot: 7, label: "QUANT" },
    { r: 100, speed: 0.014, color: "#00D4FF", dot: 5, label: "MACRO" },
    { r: 128, speed: 0.009, color: "#F5A623", dot: 8, label: "FUND" },
    { r: 152, speed: 0.006, color: "#8B5CF6", dot: 5, label: "SENT" },
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: "drop-shadow(0 0 60px rgba(255,0,110,0.3))" }}>
      <defs>
        <radialGradient id="g6core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF99CC" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#FF006E" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#4C0020" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g6inner" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="#FF99CC" />
        </radialGradient>
      </defs>
      {rings.map((o, i) => (
        <circle key={`ring-${i}`} cx={cx} cy={cy} r={o.r} fill="none" stroke={o.color} strokeWidth="0.6" strokeOpacity="0.25" />
      ))}
      <circle cx={cx} cy={cy} r={52} fill="url(#g6core)" />
      <circle cx={cx} cy={cy} r={26} fill="#FF006E" opacity="0.8" />
      <circle cx={cx} cy={cy} r={12} fill="url(#g6inner)" opacity="0.95" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={7} fill="#4C0020" fontWeight={900} letterSpacing={3} fontFamily="monospace">HAZ</text>
      {rings.map((o, i) => {
        const angle = tick * o.speed + i * 1.6;
        const dx = cx + o.r * Math.cos(angle); const dy = cy + o.r * Math.sin(angle);
        return (
          <g key={`dot-${i}`}>
            <circle cx={dx} cy={dy} r={o.dot} fill={o.color} filter={`drop-shadow(0 0 8px ${o.color})`} />
            <text x={dx + o.dot + 3} y={dy + 4} fontSize={6} fill={o.color} fontFamily="monospace" opacity={0.7}>{o.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function GlitchTitle({ text }: { text: string }) {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { setGlitch(true); setTimeout(() => setGlitch(false), 100); }, 5000 + Math.random() * 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <span>{text}</span>
      {glitch && <>
        <span style={{ position: "absolute", top: 0, left: 3, color: "#FF006E", opacity: 0.85, clipPath: "inset(0 0 65% 0)" }}>{text}</span>
        <span style={{ position: "absolute", top: 0, left: -3, color: "#00D4FF", opacity: 0.85, clipPath: "inset(50% 0 0 0)" }}>{text}</span>
      </>}
    </div>
  );
}

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface PData { stats: Stats; positions: { ticker: string; pct_change: number; direction: string }[]; }

const glass = { background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" as string, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16 };

export default function Design6() {
  const [data, setData] = useState<PData | null>(null);
  useEffect(() => { fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {}); }, []);
  const s = data?.stats;
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const neonGlow = (color: string) => ({ boxShadow: `0 0 24px ${color}40, inset 0 0 16px ${color}08`, border: `1px solid ${color}40`, borderRadius: 16 });

  return (
    <div style={{ background: "#04000C", minHeight: "100vh", overflowY: "auto", color: "white", fontFamily: "system-ui, sans-serif" }}>
      <div className="fixed inset-0"><GridStarCanvas /></div>

      {/* Nav glass bar */}
      <nav style={{ position: "relative", zIndex: 20, padding: "18px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", ...glass, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF006E", boxShadow: "0 0 12px #FF006E, 0 0 24px #FF006E60" }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 5, color: "#FF99CC" }}>HAZ CAPITAL</span>
        </div>
        <div style={{ display: "flex", gap: 24, fontSize: 10, letterSpacing: 3 }}>
          {[["PORTFOLIO", "/dashboard"], ["REPORTS", "/reports"], ["TEAM", "/team"]].map(([label, href]) => (
            <Link key={label} href={href} style={{ color: label === "PORTFOLIO" ? "#FF006E" : "rgba(255,255,255,0.35)", textDecoration: "none" }}>{label}</Link>
          ))}
        </div>
      </nav>

      {/* Hero grid */}
      <div style={{ position: "relative", zIndex: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 48, padding: "48px 60px", minHeight: "calc(90vh - 57px)", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 6, color: "#FF006E", marginBottom: 20, textShadow: "0 0 20px #FF006E" }}>
            AUTONOMOUS TRADING INTELLIGENCE
          </div>

          <h1 style={{ fontSize: "clamp(64px,11vw,130px)", fontWeight: 900, letterSpacing: -5, lineHeight: 0.9, marginBottom: 32 }}>
            <GlitchTitle text="SIGNAL." />
            <br />
            <span style={{ color: "#00D4FF", textShadow: "0 0 40px rgba(0,212,255,0.6)" }}>DECODED.</span>
          </h1>

          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.38)", maxWidth: 440, lineHeight: 1.9, marginBottom: 44, borderLeft: "2px solid rgba(255,0,110,0.3)", paddingLeft: 18 }}>
            Eight AI specialists converge on a single daily decision — macro, quant, fundamental, sentiment. No emotion. Pure edge. Live in paper.
          </p>

          {/* Glass stat cards with neon glow */}
          {s && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 44 }}>
              {[
                { label: "NET VALUE", val: fmtUsd(s.total_value), color: "#00D4FF" },
                { label: "DAILY P&L", val: fmt(s.daily_pnl_pct) + "%", sub: fmtUsd(s.daily_pnl_absolute), color: s.daily_pnl_pct >= 0 ? "#00FF87" : "#FF4141" },
                { label: "TOTAL P&L", val: fmt(s.total_pnl_pct) + "%", sub: fmtUsd(s.total_pnl_absolute), color: s.total_pnl_pct >= 0 ? "#00FF87" : "#FF4141" },
                { label: "POSITIONS", val: String(s.active_positions), sub: "OPEN", color: "#F5A623" },
              ].map(item => (
                <div key={item.label} style={{ padding: "18px 16px", ...neonGlow(item.color) }}>
                  <div style={{ fontSize: 8, letterSpacing: 3, color: item.color, marginBottom: 10, opacity: 0.7 }}>{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: item.color, letterSpacing: -0.5, textShadow: `0 0 20px ${item.color}80` }}>{item.val}</div>
                  {item.sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4, fontFamily: "monospace" }}>{item.sub}</div>}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/dashboard">
              <button style={{ padding: "15px 36px", background: "linear-gradient(135deg,#FF006E,#C0005A)", color: "white", border: "none", fontSize: 13, fontWeight: 700, letterSpacing: 3, cursor: "pointer", borderRadius: 8, boxShadow: "0 0 40px rgba(255,0,110,0.5)" }}>
                ENTER SYSTEM
              </button>
            </Link>
            <Link href="/reports">
              <button style={{ padding: "15px 36px", ...glass, color: "#00D4FF", fontSize: 13, fontWeight: 600, letterSpacing: 3, cursor: "pointer", boxShadow: "0 0 20px rgba(0,212,255,0.2)" }}>
                VIEW INTEL
              </button>
            </Link>
          </div>
        </div>

        {/* Right: Neon orb + positions glass panel */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <NeonOrb />
          <div style={{ ...glass, padding: "20px 24px", width: 240, ...neonGlow("#FF006E") }}>
            <div style={{ fontSize: 8, letterSpacing: 4, color: "#FF99CC", marginBottom: 14 }}>LIVE POSITIONS</div>
            {(data?.positions ?? []).slice(0, 7).map(p => (
              <Link href={`/position/${p.ticker}`} key={p.ticker} style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "monospace" }}>
                  <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>{p.ticker}</span>
                  <span style={{ color: p.pct_change >= 0 ? "#00FF87" : "#FF4141" }}>{p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(2)}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Agent bar */}
      <div style={{ position: "relative", zIndex: 10, padding: "0 60px 50px" }}>
        <div style={{ ...glass, padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 8, letterSpacing: 4, color: "rgba(255,255,255,0.2)" }}>PIPELINE</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["Macro", "News", "Sector", "Quant", "Fundamental", "Sentiment", "Institutional", "Committee"].map((name, i) => (
              <div key={name} style={{ padding: "6px 14px", borderRadius: 100, fontSize: 10, fontWeight: 500,
                background: i === 7 ? "rgba(255,0,110,0.12)" : "rgba(255,255,255,0.03)",
                border: i === 7 ? "1px solid rgba(255,0,110,0.35)" : "1px solid rgba(255,255,255,0.07)",
                color: i === 7 ? "#FF99CC" : "rgba(255,255,255,0.4)",
              }}>{name}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
