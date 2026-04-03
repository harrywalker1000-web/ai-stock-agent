"use client";
// Design 7: OBSIDIAN — Deep black + gold accents + hot cyan grid floor. Positions ticker tape. Huge portfolio number.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function ObsidianCanvas() {
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
    const stars: Star[] = Array.from({ length: 300 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1 + 0.2, p: Math.random() * Math.PI * 2 }));
    let t = 0; let frame: number;
    const draw = () => {
      t += 0.006;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width; const H = canvas.height;

      // Stars
      stars.forEach(s => {
        ctx.globalAlpha = 0.1 + 0.15 * Math.abs(Math.sin(t + s.p));
        ctx.fillStyle = "white";
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
      });

      // Gold glow top-centre
      const gg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.5);
      gg.addColorStop(0, "rgba(245,166,35,0.12)"); gg.addColorStop(1, "transparent");
      ctx.globalAlpha = 1; ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);

      // Pink glow bottom-left
      const pg = ctx.createRadialGradient(W * 0.1, H * 0.9, 0, W * 0.1, H * 0.9, W * 0.4);
      pg.addColorStop(0, "rgba(255,0,110,0.1)"); pg.addColorStop(1, "transparent");
      ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);

      // Cyan grid floor (bottom 35%)
      const gy = H * 0.65;
      ctx.strokeStyle = "rgba(0,212,255,0.14)"; ctx.lineWidth = 1;
      for (let i = -20; i <= 20; i++) {
        ctx.beginPath(); ctx.moveTo(W / 2 + i * 65, H); ctx.lineTo(W / 2, gy); ctx.stroke();
      }
      for (let j = 0; j < 10; j++) {
        const progress = ((j / 10) + t * 0.2) % 1;
        const y = gy + (H - gy) * progress;
        const spread = (y - gy) / (H - gy);
        ctx.globalAlpha = spread * 0.45;
        ctx.beginPath(); ctx.moveTo(W / 2 - spread * W * 0.8, y); ctx.lineTo(W / 2 + spread * W * 0.8, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}


// Ticker tape
function Tape({ positions }: { positions: { ticker: string; pct_change: number }[] }) {
  const items = [...positions, ...positions, ...positions];
  return (
    <div style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 48, whiteSpace: "nowrap", animation: "d7tape 25s linear infinite" }}>
        {items.map((p, i) => (
          <span key={i} style={{ fontSize: 11, letterSpacing: 2, fontFamily: "monospace", color: p.pct_change >= 0 ? "#00FF87" : "#FF4141" }}>
            {p.ticker}&nbsp;&nbsp;{p.pct_change >= 0 ? "▲" : "▼"}&nbsp;{Math.abs(p.pct_change).toFixed(2)}%
            <span style={{ opacity: 0.15, margin: "0 24px" }}>|</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes d7tape { from { transform: translateX(0) } to { transform: translateX(-33.33%) } }`}</style>
    </div>
  );
}

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface PData { stats: Stats; positions: { ticker: string; pct_change: number; direction: string }[]; }

export default function Design7() {
  const [data, setData] = useState<PData | null>(null);
  useEffect(() => { fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {}); }, []);
  const s = data?.stats;
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  const glassCard = {
    background: "rgba(255,255,255,0.035)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)" as string,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
  };

  return (
    <div style={{ background: "#030005", minHeight: "100vh", overflowY: "auto", color: "white", fontFamily: "system-ui, sans-serif" }}>
      <div className="fixed inset-0"><ObsidianCanvas /></div>

      {/* Hero */}
      <div style={{ position: "relative", zIndex: 10, padding: "32px 60px 0", display: "grid", gridTemplateColumns: "1fr 300px", gap: 48, alignItems: "start" }}>
        {/* Left */}
        <div>
          {/* Giant portfolio value */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 5, color: "#F5A623", marginBottom: 12, opacity: 0.8 }}>LIVE NET ASSET VALUE</div>
            <div style={{ fontSize: "clamp(56px,10vw,110px)", fontWeight: 900, letterSpacing: -5, lineHeight: 1,
              background: "linear-gradient(135deg, #FEF3C7 0%, #F5A623 60%, #D97706 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              textShadow: "none", filter: "drop-shadow(0 0 40px rgba(245,166,35,0.3))",
            }}>
              {s ? fmtUsd(s.total_value) : "———"}
            </div>
          </div>

          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.2)", marginBottom: 40 }}>PAPER TRADING · ALPACA API · UPDATED DAILY 09:45 ET</div>

          <h1 style={{ fontSize: "clamp(52px,8vw,90px)", fontWeight: 900, letterSpacing: -4, lineHeight: 0.92, marginBottom: 28 }}>
            Eight agents.<br />
            <span style={{ color: "#00D4FF", textShadow: "0 0 40px rgba(0,212,255,0.5)" }}>One position.</span>
          </h1>

          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", maxWidth: 460, lineHeight: 1.9, marginBottom: 44 }}>
            Macro regime, news sentiment, quant signals, fundamental value and institutional flow — converged by committee vote every market morning.
          </p>

          {/* Stat cards row */}
          {s && (
            <div style={{ display: "flex", gap: 10, marginBottom: 44 }}>
              {[
                { label: "Daily P&L", val: fmt(s.daily_pnl_pct) + "%", sub: fmtUsd(s.daily_pnl_absolute), color: s.daily_pnl_pct >= 0 ? "#00FF87" : "#FF4141" },
                { label: "Total P&L", val: fmt(s.total_pnl_pct) + "%", sub: fmtUsd(s.total_pnl_absolute), color: s.total_pnl_pct >= 0 ? "#00FF87" : "#FF4141" },
                { label: "Positions", val: String(s.active_positions), sub: "open trades", color: "#00D4FF" },
                { label: "Pipeline", val: "LIVE", sub: "GitHub Actions", color: "#F5A623" },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, ...glassCard, padding: "18px 16px", borderTop: `2px solid ${item.color}60` }}>
                  <div style={{ fontSize: 8, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>{item.label.toUpperCase()}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: item.color, letterSpacing: -0.5 }}>{item.val}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 4, fontFamily: "monospace" }}>{item.sub}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/dashboard">
              <button style={{ padding: "16px 40px", background: "linear-gradient(135deg,#F5A623,#D97706)", color: "#030005", border: "none", fontSize: 13, fontWeight: 800, letterSpacing: 3, cursor: "pointer", borderRadius: 10, boxShadow: "0 0 40px rgba(245,166,35,0.4)" }}>
                ENTER PORTFOLIO
              </button>
            </Link>
            <Link href="/reports">
              <button style={{ padding: "16px 40px", ...glassCard, color: "#00D4FF", fontSize: 13, fontWeight: 600, letterSpacing: 2, cursor: "pointer", boxShadow: "0 0 20px rgba(0,212,255,0.15)" }}>
                DAILY REPORTS
              </button>
            </Link>
          </div>
        </div>

        {/* Right: position list */}
        <div style={{ ...glassCard, padding: "24px 20px", borderTop: "2px solid rgba(255,0,110,0.3)" }}>
          <div style={{ fontSize: 8, letterSpacing: 4, color: "#FF99CC", marginBottom: 18 }}>LIVE POSITIONS</div>
          {(data?.positions ?? []).slice(0, 11).map(p => (
            <Link href={`/position/${p.ticker}`} key={p.ticker} style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{p.ticker}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>{p.direction.toUpperCase()}</div>
                </div>
                <div style={{ fontSize: 12, color: p.pct_change >= 0 ? "#00FF87" : "#FF4141", fontFamily: "monospace", fontWeight: 600 }}>
                  {p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(2)}%
                </div>
              </div>
            </Link>
          ))}
          <Link href="/dashboard">
            <div style={{ marginTop: 14, fontSize: 10, color: "#F5A623", textAlign: "center", letterSpacing: 2, cursor: "pointer" }}>ALL POSITIONS →</div>
          </Link>
        </div>
      </div>

      {/* Ticker tape */}
      {(data?.positions ?? []).length > 0 && (
        <div style={{ position: "relative", zIndex: 10, padding: "32px 0", borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 48 }}>
          <Tape positions={data!.positions} />
        </div>
      )}

      {/* Agent strip */}
      <div style={{ position: "relative", zIndex: 10, padding: "20px 60px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6 }}>
          {["Macro", "News", "Sector", "Quant", "Fundamental", "Sentiment", "Institutional", "Committee"].map((name, i) => (
            <div key={name} style={{
              ...glassCard, padding: "16px 10px", textAlign: "center",
              borderTop: i === 7 ? "2px solid rgba(245,166,35,0.5)" : "2px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginBottom: 6, fontFamily: "monospace" }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: i === 7 ? "#F5A623" : "rgba(255,255,255,0.6)" }}>{name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
