"use client";

const TECH_STACK = [
  { name: "Python 3.11", category: "Runtime", color: "#F59E0B" },
  { name: "OpenAI GPT-4o-mini", category: "Intelligence", color: "#0EA5E9" },
  { name: "yfinance", category: "Market Data", color: "#10B981" },
  { name: "SEC EDGAR", category: "Fundamentals", color: "#8B5CF6" },
  { name: "Alpha Vantage", category: "Financials", color: "#06B6D4" },
  { name: "Finnhub", category: "News", color: "#F59E0B" },
  { name: "Alpaca", category: "Execution", color: "#10B981" },
  { name: "SQLite", category: "Memory", color: "#6B7280" },
  { name: "Next.js 14", category: "Frontend", color: "#E8EDF2" },
  { name: "Vercel", category: "Deployment", color: "#E8EDF2" },
  { name: "GitHub Actions", category: "Automation", color: "#6B7280" },
  { name: "Tailwind CSS", category: "Styling", color: "#06B6D4" },
];

const PHILOSOPHY_POINTS = [
  {
    title: "Forward-Looking Mandate",
    body: "The system asks one question above all others: where is this stock going? Not where has it been. Every agent produces at least one forward-looking signal — mean reversion scores, dislocation opportunity flags, leading vs lagging sentiment classification.",
  },
  {
    title: "Multi-Agent Debate",
    body: "11 specialised agents each form an independent view before the Investment Committee synthesises. Disagreements are surfaced, not hidden. If Fundamental says buy and Quant says wait, both views appear in the final rationale.",
  },
  {
    title: "Quality Over Quantity",
    body: "The system makes decisions, not recommendations. If no genuine opportunities exist, it holds cash. There are no trade quotas — a day with zero new positions is correct behaviour if nothing clears the conviction threshold.",
  },
  {
    title: "Memory & Self-Improvement",
    body: "Every decision is stored with full reasoning. Over time, the system tracks which signals had the most predictive value. Patterns that led to winning trades are weighted higher. Mistakes are never forgotten.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#080C10] pb-24">
      <div className="max-w-4xl mx-auto px-6 pt-12">
        {/* Header */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-xs font-medium"
            style={{ background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.2)", color: "#0EA5E9" }}>
            Fund Overview
          </div>
          <h1 className="font-display text-5xl font-bold text-[#E8EDF2] leading-tight mb-4">
            Haz Capital<br />Management
          </h1>
          <p className="text-[#6B7280] text-xl leading-relaxed max-w-2xl">
            A fully autonomous AI hedge fund, built from scratch. No human enters the trades — 11 specialised AI agents handle research, debate, and execution every morning before market open.
          </p>
        </div>

        {/* What this is */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[#E8EDF2] mb-5">What This Is</h2>
          <div className="card p-8">
            <p className="text-[#6B7280] leading-relaxed mb-4">
              Haz Capital Management is a paper-trading AI hedge fund running on real market data. The system runs at 9:15am EST every trading day via GitHub Actions, working through an 11-agent pipeline that mirrors how a real institutional research desk operates — macro context first, then sector analysis, institutional flow, news, candidate generation, deep fundamental and quantitative analysis, sentiment, and finally an Investment Committee that weighs all inputs and makes the call.
            </p>
            <p className="text-[#6B7280] leading-relaxed mb-4">
              The fund currently operates in paper trading mode using Alpaca&apos;s paper account — real market prices, real order execution logic, zero real capital at risk. The goal is to reach 20+ consecutive successful daily runs before considering live trading.
            </p>
            <p className="text-[#6B7280] leading-relaxed">
              Every decision the system makes is stored with full reasoning — which agents flagged it, what signals drove the conviction, what the thesis is, and how it compares to the original entry thesis on every subsequent review.
            </p>
          </div>
        </section>

        {/* How it was built */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[#E8EDF2] mb-5">How It Was Built</h2>
          <div className="card p-8">
            <div className="flex items-start gap-4 mb-6 pb-6 border-b border-white/06">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%)", boxShadow: "0 0 20px rgba(14,165,233,0.3)" }}>
                <span className="font-display text-lg font-bold text-white">H</span>
              </div>
              <div>
                <p className="font-semibold text-[#E8EDF2] mb-1">Harry Walker</p>
                <p className="text-[#6B7280] text-sm">Designed the system architecture, wrote the investment philosophy, set the forward-looking mandate, and manages the fund.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/05 border border-white/08">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#E8EDF2" strokeWidth="1.5" />
                  <path d="M2 17L12 22L22 17" stroke="#E8EDF2" strokeWidth="1.5" />
                  <path d="M2 12L12 17L22 12" stroke="#E8EDF2" strokeWidth="1.5" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[#E8EDF2] mb-1">Claude Code + GPT-4o-mini</p>
                <p className="text-[#6B7280] text-sm">Claude Code built the entire system across multiple sessions. GPT-4o-mini runs inside every agent as the reasoning engine — analysing financial data, producing structured outputs, and reasoning about forward price movements.</p>
              </div>
            </div>
            <p className="text-[#6B7280] text-sm mt-6 italic border-l-2 border-[#0EA5E9]/30 pl-4">
              The AI-assisted development approach isn&apos;t a disclaimer — it&apos;s the whole point. This system is a demonstration of what can be built when a human with domain expertise and financial judgment works closely with an AI with engineering capabilities.
            </p>
          </div>
        </section>

        {/* Philosophy */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[#E8EDF2] mb-5">Investment Philosophy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PHILOSOPHY_POINTS.map((p) => (
              <div key={p.title} className="card p-6">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-[#0EA5E9] to-[#06B6D4] mb-4" />
                <h3 className="font-display text-base font-bold text-[#E8EDF2] mb-2">{p.title}</h3>
                <p className="text-[#6B7280] text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[#E8EDF2] mb-5">Technology</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TECH_STACK.map((tech) => (
              <div key={tech.name} className="card p-4">
                <div className="w-2 h-2 rounded-full mb-2" style={{ background: tech.color }} />
                <p className="text-sm font-semibold text-[#E8EDF2] leading-tight">{tech.name}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">{tech.category}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Status */}
        <section className="mb-16">
          <div className="card p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h2 className="font-display text-xl font-bold text-[#E8EDF2] mb-3">Current Status</h2>
                <div className="space-y-2">
                  {[
                    { label: "Mode", value: "Paper Trading", color: "#F59E0B" },
                    { label: "Pipeline", value: "Live — 9:15am EST Mon–Fri", color: "#10B981" },
                    { label: "Agents", value: "11 of 11 operational", color: "#10B981" },
                    { label: "Capital", value: "$100,000 paper account (Alpaca)", color: "#6B7280" },
                    { label: "Live trading", value: "After 20+ successful runs", color: "#6B7280" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3 text-sm">
                      <span className="text-[#6B7280] w-28">{s.label}</span>
                      <span style={{ color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#6B7280] mb-2">Source code</p>
                <a
                  href="https://github.com/harrywalker1000-web/ai-stock-agent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#E8EDF2] transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer note */}
        <div className="text-center text-[#4B5563] text-sm">
          <p>Haz Capital Management — paper trading only. Not financial advice.</p>
          <p className="mt-1">Built by Harry Walker with Claude Code.</p>
        </div>
      </div>
    </div>
  );
}
