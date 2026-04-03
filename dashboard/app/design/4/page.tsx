"use client";
// Design 4: NEON CYBER — Blade Runner / cyberpunk. Hot pink + electric blue on near-black.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function GridCanvas() {
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
      t += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width; const H = canvas.height;

      // Perspective grid lines converging to horizon
      const horizon = H * 0.55;
      const vanishX = W / 2;
      ctx.strokeStyle = "rgba(255,0,110,0.15)";
      ctx.lineWidth = 1;

      // Vertical lines
      for (let i = -20; i <= 20; i++) {
        const bx = W / 2 + i * 80;
        ctx.beginPath();
        ctx.moveTo(bx, H);
        ctx.lineTo(vanishX + (bx - vanishX) * 0.01, horizon);
        ctx.stroke();
      }

      // Horizontal lines with animation
      for (let j = 0; j < 20; j++) {
        const progress = ((j / 20) + t * 0.3) % 1;
        const y = horizon + (H - horizon) * progress;
        const spread = (y - horizon) / (H - horizon);
        const x0 = vanishX - spread * W * 0.8;
        const x1 = vanishX + spread * W * 0.8;
        ctx.globalAlpha = spread * 0.4;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
      }

      // Horizontal scan line sweeping down
      const scanY = ((t * 0.5) % 1) * H;
      const scanGrad = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 4);
      scanGrad.addColorStop(0, "transparent");
      scanGrad.addColorStop(0.8, "rgba(0,212,255,0.12)");
      scanGrad.addColorStop(1, "rgba(0,212,255,0.25)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 20, W, 24);

      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

// Glitchy text
function GlitchText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 80);
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      <span>{text}</span>
      {glitch && (
        <>
          <span style={{ position: "absolute", top: 0, left: 2, color: "#FF006E", opacity: 0.8, clipPath: "inset(0 0 70% 0)" }}>{text}</span>
          <span style={{ position: "absolute", top: 0, left: -2, color: "#00D4FF", opacity: 0.8, clipPath: "inset(40% 0 0 0)" }}>{text}</span>
        </>
      )}
    </div>
  );
}

// Neon hexagon grid decoration
function HexGrid() {
  const hexes = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const x = c * 44 + (r % 2 ? 22 : 0);
      const y = r * 38;
      hexes.push({ x, y, key: `${r}-${c}` });
    }
  }
  return (
    <svg width={220} height={120} viewBox="0 0 220 120" style={{ opacity: 0.35 }}>
      {hexes.map(h => (
        <polygon key={h.key}
          points={`${h.x + 20},${h.y} ${h.x + 36},${h.y + 10} ${h.x + 36},${h.y + 30} ${h.x + 20},${h.y + 40} ${h.x + 4},${h.y + 30} ${h.x + 4},${h.y + 10}`}
          fill="none" stroke="#FF006E" strokeWidth="0.5"
        />
      ))}
    </svg>
  );
}

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface PData { stats: Stats; positions: { ticker: string; pct_change: number; direction: string }[]; }

export default function Design4() {
  const [data, setData] = useState<PData | null>(null);
  useEffect(() => { fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {}); }, []);
  const s = data?.stats;
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  const neonText = { textShadow: "0 0 20px currentColor, 0 0 40px currentColor" };
  const neonBox = (color: string) => ({
    boxShadow: `0 0 20px ${color}40, inset 0 0 20px ${color}10`,
    border: `1px solid ${color}60`,
  });

  return (
    <div style={{ background: "#050008", minHeight: "100vh", overflowY: "auto", color: "white", fontFamily: "system-ui, sans-serif" }}>
      {/* Scanlines */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,0,110,0.015) 3px, rgba(255,0,110,0.015) 4px)",
      }} />

      {/* Grid canvas bg */}
      <div className="fixed inset-0 z-0"><GridCanvas /></div>

      {/* Side accent lines */}
      <div className="fixed left-0 top-0 bottom-0 w-px z-0" style={{ background: "linear-gradient(to bottom, transparent, #FF006E40, transparent)" }} />
      <div className="fixed right-0 top-0 bottom-0 w-px z-0" style={{ background: "linear-gradient(to bottom, transparent, #00D4FF40, transparent)" }} />

      {/* Nav */}
      <nav style={{ position: "relative", zIndex: 20, padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,0,110,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, background: "#00D4FF", borderRadius: "50%", boxShadow: "0 0 12px #00D4FF" }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 5, color: "#00D4FF", ...neonText }}>HAZ CAPITAL</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["PORTFOLIO", "REPORTS", "TEAM"].map((label, i) => (
            <Link key={label} href={label === "PORTFOLIO" ? "/dashboard" : label === "REPORTS" ? "/reports" : "/team"} style={{ textDecoration: "none" }}>
              <div style={{ padding: "6px 16px", fontSize: 10, letterSpacing: 3, color: i === 0 ? "#FF006E" : "rgba(255,255,255,0.4)", border: i === 0 ? "1px solid #FF006E40" : "1px solid transparent", borderRadius: 2 }}>
                {label}
              </div>
            </Link>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <div style={{ position: "relative", zIndex: 10, padding: "60px 60px 40px", display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center", minHeight: "85vh" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 6, color: "#FF006E", marginBottom: 24, ...neonText }}>
            AUTONOMOUS TRADING INTELLIGENCE
          </div>

          <div style={{ marginBottom: 32 }}>
            <GlitchText text="MARKET" style={{ display: "block", fontSize: "clamp(80px,14vw,160px)", fontWeight: 900, letterSpacing: -6, lineHeight: 0.9, color: "white" }} />
            <div style={{ fontSize: "clamp(80px,14vw,160px)", fontWeight: 900, letterSpacing: -6, lineHeight: 0.9,
              color: "#FF006E", ...neonText }}>
              DECODED.
            </div>
          </div>

          <div style={{ maxWidth: 480, marginBottom: 48 }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.9, margin: 0, borderLeft: "2px solid #FF006E30", paddingLeft: 20 }}>
              Eight autonomous agents process every signal — macro, quant, fundamental, sentiment — converging on a single decision daily. No emotion. No hesitation. Pure edge.
            </p>
          </div>

          {/* Stat cards */}
          {s && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,auto)", gap: 1, marginBottom: 48 }}>
              {[
                { label: "NET VALUE", val: fmtUsd(s.total_value), color: "#00D4FF" },
                { label: "DAILY P&L", val: fmt(s.daily_pnl_pct) + "%", sub: fmtUsd(s.daily_pnl_absolute), color: s.daily_pnl_pct >= 0 ? "#00FF87" : "#FF006E" },
                { label: "TOTAL P&L", val: fmt(s.total_pnl_pct) + "%", sub: fmtUsd(s.total_pnl_absolute), color: s.total_pnl_pct >= 0 ? "#00FF87" : "#FF006E" },
                { label: "POSITIONS", val: String(s.active_positions), sub: "OPEN", color: "#FF006E" },
              ].map(item => (
                <div key={item.label} style={{ padding: "20px 24px", ...neonBox(item.color), borderRadius: 2, minWidth: 140 }}>
                  <div style={{ fontSize: 8, letterSpacing: 4, color: item.color, marginBottom: 10, opacity: 0.7 }}>{item.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: item.color, ...neonText, letterSpacing: -1 }}>{item.val}</div>
                  {item.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{item.sub}</div>}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/dashboard">
              <button style={{
                padding: "16px 40px", background: "#FF006E", color: "white",
                fontSize: 13, fontWeight: 700, letterSpacing: 4,
                cursor: "pointer", ...neonBox("#FF006E"), border: "none", borderRadius: 2,
              }}>ENTER SYSTEM</button>
            </Link>
            <Link href="/reports">
              <button style={{
                padding: "16px 40px", background: "transparent", color: "#00D4FF",
                border: "1px solid #00D4FF40", fontSize: 13, fontWeight: 700, letterSpacing: 4,
                cursor: "pointer", borderRadius: 2,
              }}>VIEW INTEL</button>
            </Link>
          </div>
        </div>

        {/* Right decorative panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
          <HexGrid />
          <div style={{ padding: "20px", borderRadius: 4, ...neonBox("#00D4FF"), minWidth: 200 }}>
            <div style={{ fontSize: 8, letterSpacing: 4, color: "#00D4FF", marginBottom: 16, opacity: 0.7 }}>LIVE SIGNALS</div>
            {(data?.positions ?? []).slice(0, 6).map(p => (
              <div key={p.ticker} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 8, fontFamily: "monospace", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{p.ticker}</span>
                <span style={{ color: p.pct_change >= 0 ? "#00FF87" : "#FF006E" }}>{p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 8, letterSpacing: 3, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
            8 AGENTS · ALPACA API<br />GITHUB ACTIONS · DAILY
          </div>
        </div>
      </div>

      {/* Bottom agent strip */}
      <div style={{ position: "relative", zIndex: 10, padding: "20px 60px 40px", borderTop: "1px solid rgba(255,0,110,0.1)" }}>
        <div style={{ display: "flex", gap: 2 }}>
          {["MACRO", "NEWS", "SECTOR", "QUANT", "FUNDAMENTAL", "SENTIMENT", "INSTITUTIONAL", "COMMITTEE"].map((name, i) => (
            <div key={name} style={{
              flex: 1, padding: "12px 8px", textAlign: "center",
              fontSize: 8, letterSpacing: 2, color: i === 7 ? "#FF006E" : "rgba(255,255,255,0.25)",
              border: i === 7 ? "1px solid #FF006E30" : "1px solid rgba(255,255,255,0.04)",
              borderRadius: 2,
            }}>{name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
