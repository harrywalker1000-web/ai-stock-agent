"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// Animated particle/ticker canvas
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

// Central geometric AI entity
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
      <div className="absolute w-48 h-48 rounded-full border border-[#0EA5E9]/30 animate-[spin_15s_linear_infinite_reverse]"
        style={{
          backgroundImage: "conic-gradient(from 180deg, transparent 60%, rgba(6,182,212,0.4) 100%)",
        }}
      />
      {/* Inner ring */}
      <div className="absolute w-32 h-32 rounded-full border border-[#0EA5E9]/40 animate-pulse-slow" />

      {/* Core hexagon */}
      <div className="relative z-10 w-24 h-24 flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(6,182,212,0.1) 100%)",
          boxShadow: "0 0 60px rgba(14,165,233,0.3), inset 0 0 30px rgba(14,165,233,0.1)",
          borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%",
          border: "1px solid rgba(14,165,233,0.4)",
        }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          {/* Abstract AI network icon */}
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

export default function HomePage() {
  return (
    <div className="h-[calc(100vh-64px)] bg-[#080C10] relative overflow-hidden flex flex-col items-center justify-center">
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

      {/* Floating tickers canvas */}
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

      {/* Main content */}
      <div className="relative z-10 text-center px-6 max-w-4xl">
        {/* Entity */}
        <div className="flex justify-center mb-10">
          <AIEntity />
        </div>

        {/* Headline */}
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

        {/* Sub-headline */}
        <p className="text-[#6B7280] text-lg sm:text-xl mb-10 max-w-xl mx-auto font-light tracking-wide">
          A fully autonomous AI hedge fund.{" "}
          <span className="text-[#E8EDF2]/60">11 agents. One portfolio.</span>
        </p>

        {/* Agent count badges */}
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

        {/* CTA Buttons */}
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
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: "linear-gradient(to top, #080C10, transparent)" }}
        aria-hidden
      />
    </div>
  );
}
