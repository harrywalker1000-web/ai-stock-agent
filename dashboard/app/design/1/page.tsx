"use client";
// Design 1: TERMINAL — Bloomberg-meets-Matrix trading terminal aesthetic
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const cols = Math.floor(canvas.width / 16);
    const drops: number[] = Array(cols).fill(0);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%+-=<>NVDAAMDAAAPPLGOOGL";
    let frame: number;
    const draw = () => {
      ctx.fillStyle = "rgba(0,8,0,0.06)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drops.forEach((y, i) => {
        ctx.font = "14px monospace";
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = i % 7 === 0 ? "#ffffff" : "#00FF41";
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 16, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 16;
      });
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" style={{ opacity: 0.12 }} aria-hidden />;
}

function Blink() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn(v => !v), 530); return () => clearInterval(t); }, []);
  return <span style={{ opacity: on ? 1 : 0 }}>█</span>;
}

interface Stats { total_value: number; daily_pnl_absolute: number; daily_pnl_pct: number; total_pnl_absolute: number; total_pnl_pct: number; active_positions: number; }
interface PData { stats: Stats; positions: { ticker: string; pct_change: number; direction: string }[]; }

const LOGS = [
  "BOOT    HAZ-CAPITAL autonomous trading system v2.1",
  "INIT    Loading market universe — 4,812 instruments",
  "AGENT   Macro: Fed watch, yield curve, VIX regime",
  "AGENT   News: processing 3,241 articles via NLP",
  "AGENT   Quant: RSI / MACD / Bollinger across universe",
  "AGENT   Fundamental: SEC EDGAR + Alpha Vantage",
  "AGENT   Sector: rotation signals — Tech overweight",
  "AGENT   Sentiment: options flow, short interest",
  "AGENT   Institutional: 13F delta — 19 new positions",
  "VOTE    Committee convening — 8 agents present",
  "VOTE    Consensus reached — conviction threshold: 72",
  "EXEC    Placing orders via Alpaca paper trading API",
  "DONE    Pipeline complete ✓  Next: 09:45 ET",
];

export default function Design1() {
  const [data, setData] = useState<PData | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/portfolio").then(r => r.json()).then(setData).catch(() => {});
    LOGS.forEach((l, i) => setTimeout(() => setLines(p => [...p, l]), 350 + i * 300));
  }, []);

  const s = data?.stats;
  const fmtUsd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  return (
    <div style={{ background: "#000800", color: "#00FF41", fontFamily: "'Courier New', monospace", minHeight: "100vh", overflowY: "auto" }}>
      {/* Scanlines overlay */}
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)", opacity: 0.4 }} />

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid #00FF4125", padding: "10px 24px", display: "flex", justifyContent: "space-between", fontSize: 11, position: "relative", zIndex: 10 }}>
        <span style={{ letterSpacing: 3, fontWeight: "bold" }}>◈ HAZ-CAPITAL // AUTONOMOUS TRADING SYSTEM</span>
        <span style={{ opacity: 0.5 }}>● ONLINE &nbsp;|&nbsp; {new Date().toUTCString().slice(0, -4)} UTC</span>
      </div>

      <div style={{ position: "relative", minHeight: "calc(100vh - 41px)" }}>
        <MatrixRain />
        <div style={{ position: "relative", zIndex: 10, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "calc(100vh - 41px)" }}>

          {/* Left: pipeline log */}
          <div style={{ padding: "28px 28px", borderRight: "1px solid #00FF4118", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 9, letterSpacing: 3, opacity: 0.4, marginBottom: 20 }}>DAILY PIPELINE LOG</div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {lines.map((line, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 8, display: "flex", gap: 12, opacity: i === lines.length - 1 ? 1 : 0.65 }}>
                  <span style={{ opacity: 0.35, minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ color: line.startsWith("EXEC") ? "#FFD700" : line.startsWith("VOTE") ? "#00D4FF" : line.startsWith("DONE") ? "#00FF41" : "#00FF4199" }}>{line}</span>
                </div>
              ))}
              {lines.length < LOGS.length && (
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <span style={{ opacity: 0.4 }}>{">"}</span>&nbsp;<Blink />
                </div>
              )}
            </div>

            {/* Bottom ticker */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #00FF4118" }}>
              <div style={{ fontSize: 9, letterSpacing: 3, opacity: 0.4, marginBottom: 10 }}>LIVE POSITIONS</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(data?.positions ?? []).slice(0, 8).map(p => (
                  <span key={p.ticker} style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #00FF4130", color: p.pct_change >= 0 ? "#00FF41" : "#FF4141" }}>
                    {p.ticker} {p.pct_change >= 0 ? "+" : ""}{p.pct_change.toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: portfolio stats */}
          <div style={{ padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 9, letterSpacing: 4, opacity: 0.4, marginBottom: 12 }}>NET ASSET VALUE</div>
            <div style={{ fontSize: 80, fontWeight: "bold", letterSpacing: -3, lineHeight: 1, marginBottom: 8, textShadow: "0 0 40px rgba(0,255,65,0.4)" }}>
              {s ? fmtUsd(s.total_value) : "———"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.45, marginBottom: 48, letterSpacing: 2 }}>PAPER TRADING ACCOUNT</div>

            {s && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 48 }}>
                {[
                  { label: "DAILY P&L", val: fmtUsd(s.daily_pnl_absolute), sub: fmt(s.daily_pnl_pct) + "%", pos: s.daily_pnl_absolute >= 0 },
                  { label: "TOTAL P&L", val: fmtUsd(s.total_pnl_absolute), sub: fmt(s.total_pnl_pct) + "%", pos: s.total_pnl_absolute >= 0 },
                  { label: "OPEN POSITIONS", val: String(s.active_positions), sub: "ACTIVE TRADES", pos: true },
                  { label: "PIPELINE", val: "ACTIVE", sub: "09:45 ET DAILY", pos: true },
                ].map(item => (
                  <div key={item.label} style={{ borderLeft: `2px solid ${item.pos ? "#00FF41" : "#FF4141"}50`, paddingLeft: 14 }}>
                    <div style={{ fontSize: 9, opacity: 0.4, letterSpacing: 3, marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 18, fontWeight: "bold", color: item.pos ? "#00FF41" : "#FF4141" }}>{item.val}</div>
                    <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/dashboard">
                <button style={{ padding: "14px 32px", background: "#00FF41", color: "#000800", fontSize: 12, fontFamily: "monospace", fontWeight: "bold", border: "none", cursor: "pointer", letterSpacing: 3 }}>
                  {">"} ENTER SYSTEM
                </button>
              </Link>
              <Link href="/reports">
                <button style={{ padding: "14px 32px", background: "transparent", color: "#00FF41", fontSize: 12, fontFamily: "monospace", border: "1px solid #00FF4140", cursor: "pointer", letterSpacing: 3 }}>
                  VIEW LOGS
                </button>
              </Link>
            </div>

            <div style={{ marginTop: 40, fontSize: 10, opacity: 0.25, letterSpacing: 1 }}>
              8 SPECIALIST AGENTS · ALPACA PAPER API · GITHUB ACTIONS PIPELINE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
