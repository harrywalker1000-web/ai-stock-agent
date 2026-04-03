"use client";
// Design 8: VOID — Pure cinematic. Giant pulsing magenta orb, full-width. Overlay glass stats. Blade Runner meets luxury.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function VoidCanvas() {
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
    const stars: Star[] = Array.from({ length: 350 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.2, p: Math.random() * Math.PI * 2 }));
    let t = 0; let frame: number;
    const draw = () => {
      t += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width; const H = canvas.height;

      // Stars — denser
      stars.forEach(s => {
        const a = 0.08 + 0.18 * Math.abs(Math.sin(t * 0.8 + s.p));
        ctx.globalAlpha = a;
        ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Giant pulsing orb — pink/magenta/violet
      const orbX = W * 0.5 + Math.sin(t * 0.3) * W * 0.04;
      const orbY = H * 0.42 + Math.cos(t * 0.25) * H * 0.03;
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.2);
      const R = Math.min(W, H) * 0.38 * pulse;
      const g1 = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, R);
      g1.addColorStop(0, "rgba(255,80,200,0.55)");
      g1.addColorStop(0.3, "rgba(180,0,255,0.25)");
      g1.addColorStop(0.65, "rgba(80,0,160,0.1)");
      g1.addColorStop(1, "transparent");
      ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

      // Secondary cyan orb offset
      const o2x = W * 0.65 + Math.cos(t * 0.2) * W * 0.05;
      const o2y = H * 0.35 + Math.sin(t * 0.3) * H * 0.04;
      const g2 = ctx.createRadialGradient(o2x, o2y, 0, o2x, o2y, Math.min(W, H) * 0.22);
      g2.addColorStop(0, "rgba(0,212,255,0.18)");
      g2.addColorStop(0.5, "rgba(0,100,200,0.08)");
      g2.addColorStop(1, "transparent");
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

      // Grid floor
      const gy = H * 0.68;
      ctx.lineWidth = 0.8;
      for (let i = -20; i <= 20; i++) {
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = "#FF006E";
        ctx.beginPath(); ctx.moveTo(W / 2 + i * 60, H); ctx.lineTo(W / 2, gy); ctx.stroke();
      }
      for (let j = 0; j < 8; j++) {
        const p2 = ((j / 8) + t * 0.18) % 1;
        const y = gy + (H - gy) * p2;
        const s2 = (y - gy) / (H - gy);
        ctx.globalAlpha = s2 * 0.35;
        ctx.strokeStyle = "#00D4FF";
        ctx.beginPath(); ctx.moveTo(W / 2 - s2 * W * 0.75, y); ctx.lineTo(W / 2 + s2 * W * 0.75, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface PData { stats: Stats; positions: { ticker: string; pct_change: number; direction: string }[]; }

export default function Design8() {
  const [data, setData] = useState<PData | null>(null);
  useEffect(() => { fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {}); }, []);
  const s = data?.stats;
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  const glass = {
    background: "rgba(0,0,0,0.4)",
    backdropFilter: "blur(32px)",
    WebkitBackdropFilter: "blur(32px)" as string,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20,
  };

  const positions = data?.positions ?? [];

  return (
    <div style={{ background: "#000000", minHeight: "100vh", overflowY: "auto", color: "white", fontFamily: "system-ui, sans-serif", position: "relative" }}>
      <div className="fixed inset-0"><VoidCanvas /></div>

      {/* Nav — minimal */}
      <nav style={{ position: "relative", zIndex: 20, padding: "24px 56px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 6, color: "rgba(255,255,255,0.85)" }}>HAZ CAPITAL</span>
        <div style={{ display: "flex", gap: 32, fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.35)" }}>
          <Link href="/dashboard" style={{ color: "#FF80CF", textDecoration: "none" }}>PORTFOLIO</Link>
          <Link href="/reports" style={{ color: "inherit", textDecoration: "none" }}>REPORTS</Link>
          <Link href="/team" style={{ color: "inherit", textDecoration: "none" }}>TEAM</Link>
        </div>
      </nav>

      {/* Main hero — centred */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "85vh", padding: "0 32px", textAlign: "center" }}>

        <div style={{ fontSize: 10, letterSpacing: 7, color: "#FF80CF", marginBottom: 28, textShadow: "0 0 30px rgba(255,128,207,0.8)" }}>
          AUTONOMOUS INTELLIGENCE
        </div>

        <h1 style={{ fontSize: "clamp(72px,14vw,160px)", fontWeight: 900, letterSpacing: -7, lineHeight: 0.88, marginBottom: 40 }}>
          <span style={{ display: "block",
            background: "linear-gradient(180deg, #FFFFFF 0%, rgba(255,128,207,0.9) 60%, rgba(180,0,255,0.7) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            filter: "drop-shadow(0 0 60px rgba(255,80,200,0.4))",
          }}>THE</span>
          <span style={{ display: "block",
            background: "linear-gradient(180deg, #FFFFFF 0%, #00D4FF 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            filter: "drop-shadow(0 0 60px rgba(0,212,255,0.4))",
          }}>VAULT</span>
        </h1>

        {/* Portfolio value — massive, centred */}
        {s && (
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: "clamp(40px,7vw,80px)", fontWeight: 800, letterSpacing: -3,
              background: "linear-gradient(135deg,#FEF3C7,#F5A623,#D97706)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              filter: "drop-shadow(0 0 30px rgba(245,166,35,0.5))",
            }}>
              {fmtUsd(s.total_value)}
            </div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>PAPER TRADING NET VALUE</div>
          </div>
        )}

        {/* Glass stat row */}
        {s && (
          <div style={{ display: "flex", gap: 12, marginBottom: 48, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { label: "Daily P&L", val: fmt(s.daily_pnl_pct) + "%", sub: fmtUsd(s.daily_pnl_absolute), color: s.daily_pnl_pct >= 0 ? "#00FF87" : "#FF4141" },
              { label: "Total P&L", val: fmt(s.total_pnl_pct) + "%", sub: fmtUsd(s.total_pnl_absolute), color: s.total_pnl_pct >= 0 ? "#00FF87" : "#FF4141" },
              { label: "Active Positions", val: String(s.active_positions), sub: "open trades", color: "#FF80CF" },
              { label: "Agents", val: "8", sub: "specialists", color: "#00D4FF" },
            ].map(item => (
              <div key={item.label} style={{ ...glass, padding: "18px 28px", minWidth: 140 }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>{item.label.toUpperCase()}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color, textShadow: `0 0 20px ${item.color}60` }}>{item.val}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 16, marginBottom: 60 }}>
          <Link href="/dashboard">
            <button style={{
              padding: "18px 48px", borderRadius: 14, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#FF006E,#9400D3)",
              boxShadow: "0 0 60px rgba(255,0,110,0.5), 0 0 120px rgba(148,0,211,0.25)",
              color: "white", letterSpacing: 2,
            }}>ENTER</button>
          </Link>
          <Link href="/reports">
            <button style={{ padding: "18px 48px", ...glass, color: "#00D4FF", fontSize: 14, fontWeight: 600, letterSpacing: 2, cursor: "pointer", boxShadow: "0 0 30px rgba(0,212,255,0.2)" }}>
              REPORTS
            </button>
          </Link>
        </div>

        {/* Compact position pills */}
        {positions.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 700 }}>
            {positions.map(p => (
              <Link href={`/position/${p.ticker}`} key={p.ticker} style={{ textDecoration: "none" }}>
                <div style={{
                  padding: "6px 14px", borderRadius: 100, fontSize: 11, cursor: "pointer",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  color: p.pct_change >= 0 ? "#00FF87" : "#FF4141", fontFamily: "monospace", fontWeight: 600,
                  backdropFilter: "blur(12px)",
                }}>
                  {p.ticker} &nbsp;{p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(1)}%
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Bottom agent bar */}
      <div style={{ position: "relative", zIndex: 10, padding: "0 56px 56px" }}>
        <div style={{ ...glass, padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 8, letterSpacing: 4, color: "rgba(255,255,255,0.2)" }}>8 AGENT PIPELINE</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["Macro", "News", "Sector", "Quant", "Fundamental", "Sentiment", "Institutional", "Committee"].map((name, i) => (
              <div key={name} style={{
                padding: "5px 12px", borderRadius: 100, fontSize: 9, fontWeight: 500, letterSpacing: 0.5,
                background: i === 7 ? "rgba(255,0,110,0.15)" : "rgba(255,255,255,0.04)",
                border: i === 7 ? "1px solid rgba(255,0,110,0.4)" : "1px solid rgba(255,255,255,0.07)",
                color: i === 7 ? "#FF80CF" : "rgba(255,255,255,0.4)",
              }}>{name}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
