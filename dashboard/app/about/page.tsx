"use client";

const TECH_STACK = [
  { name: "Python 3.11", category: "Runtime", color: "#E39A57" },
  { name: "Anthropic Claude (OpenAI fallback)", category: "Intelligence", color: "#C8A15A" },
  { name: "yfinance", category: "Market Data", color: "#4DB887" },
  { name: "SEC EDGAR", category: "Fundamentals", color: "#B3B8BE" },
  { name: "Alpha Vantage", category: "Financials", color: "#C8A15A" },
  { name: "Finnhub", category: "News", color: "#E39A57" },
  { name: "Alpaca", category: "Execution", color: "#4DB887" },
  { name: "SQLite", category: "Memory", color: "#8E959D" },
  { name: "Next.js 14", category: "Frontend", color: "#ECEDEE" },
  { name: "Vercel", category: "Deployment", color: "#ECEDEE" },
  { name: "GitHub Actions", category: "Automation", color: "#8E959D" },
  { name: "Tailwind CSS", category: "Styling", color: "#C8A15A" },
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
    <div className="min-h-screen bg-canvas pb-24">
      <div className="max-w-4xl mx-auto px-6 pt-12">
        {/* Header */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-xs font-medium"
            style={{ background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.2)", color: "#C8A15A" }}>
            Fund Overview
          </div>
          <h1 className="font-display text-5xl font-bold text-ink-1 leading-tight mb-4">
            Haz Capital<br />Management
          </h1>
          <p className="text-ink-3 text-xl leading-relaxed max-w-2xl">
            A fully autonomous AI hedge fund, built from scratch. No human enters the trades — 11 specialised AI agents handle research, debate, and execution every morning before market open.
          </p>
        </div>

        {/* What this is */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-ink-1 mb-5">What This Is</h2>
          <div className="card p-8">
            <p className="text-ink-3 leading-relaxed mb-4">
              Haz Capital Management is a paper-trading AI hedge fund running on real market data. The system runs at 10:30am New York time every trading day via GitHub Actions, working through an 11-agent pipeline that mirrors how a real institutional research desk operates — macro context first, then sector analysis, institutional flow, news, candidate generation, deep fundamental and quantitative analysis, sentiment, and finally an Investment Committee that weighs all inputs and makes the call.
            </p>
            <p className="text-ink-3 leading-relaxed mb-4">
              The fund currently operates in paper trading mode using Alpaca&apos;s paper account — real market prices, real order execution logic, zero real capital at risk. The goal is to reach 20+ consecutive successful daily runs before considering live trading.
            </p>
            <p className="text-ink-3 leading-relaxed">
              Every decision the system makes is stored with full reasoning — which agents flagged it, what signals drove the conviction, what the thesis is, and how it compares to the original entry thesis on every subsequent review.
            </p>
          </div>
        </section>

        {/* How it was built */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-ink-1 mb-5">How It Was Built</h2>
          <div className="card p-8">
            <div className="flex items-start gap-4 mb-6 pb-6 border-b border-white/06">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #C8A15A 0%, #C8A15A 100%)", boxShadow: "0 0 20px rgba(14,165,233,0.3)" }}>
                <span className="font-display text-lg font-bold text-white">H</span>
              </div>
              <div>
                <p className="font-semibold text-ink-1 mb-1">Harry Walker</p>
                <p className="text-ink-3 text-sm">Designed the system architecture, wrote the investment philosophy, set the forward-looking mandate, and manages the fund.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/05 border border-white/08">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#ECEDEE" strokeWidth="1.5" />
                  <path d="M2 17L12 22L22 17" stroke="#ECEDEE" strokeWidth="1.5" />
                  <path d="M2 12L12 17L22 12" stroke="#ECEDEE" strokeWidth="1.5" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-ink-1 mb-1">Claude Code + Claude</p>
                <p className="text-ink-3 text-sm">Claude Code built the entire system across multiple sessions. Anthropic Claude runs inside every agent as the reasoning engine, with OpenAI as an automatic fallback — analysing financial data, producing structured outputs, and reasoning about forward price movements.</p>
              </div>
            </div>
            <p className="text-ink-3 text-sm mt-6 border-l-2 border-accent/30 pl-4">
              The AI-assisted development approach isn&apos;t a disclaimer — it&apos;s the whole point. This system is a demonstration of what can be built when a human with domain expertise and financial judgment works closely with an AI with engineering capabilities.
            </p>
          </div>
        </section>

        {/* Philosophy */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-ink-1 mb-5">Investment Philosophy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PHILOSOPHY_POINTS.map((p) => (
              <div key={p.title} className="card p-6">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-accent to-accent mb-4" />
                <h3 className="font-display text-base font-bold text-ink-1 mb-2">{p.title}</h3>
                <p className="text-ink-3 text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pipeline Modes */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-ink-1 mb-2">Pipeline Modes</h2>
          <p className="text-ink-3 text-sm mb-5">
            The daily pipeline has two phases. <strong className="text-ink-2">Phase A</strong> reviews positions you already hold.{" "}
            <strong className="text-ink-2">Phase B</strong> researches fresh opportunities. The mode you set in{" "}
            <a href="/settings" className="text-accent hover:underline">Settings</a> controls how deeply Phase A runs — Phase B always runs the full research pipeline.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                name: "Auto",
                tag: "Recommended",
                tagColor: "#C8A15A",
                desc: "Runs Standard every day. If any held position has earnings within the next 3 days, Fundamental Analyst is added automatically — so you get deep analysis exactly when it matters most, without paying for it every day.",
                phaseA: "Macro + News + Quant + Sentiment (+Fundamental near earnings)",
                phaseB: "All research agents + Sentiment",
                cost: "Smart",
                costColor: "#C8A15A",
              },
              {
                name: "Lite",
                tag: null,
                tagColor: "",
                desc: "The bare minimum to make a sensible portfolio decision. Covers overnight macro shifts, breaking news on held tickers, and quantitative signals. Fast and cheap — right for quiet markets.",
                phaseA: "Macro + News + Quant",
                phaseB: "Research agents (no Sentiment)",
                cost: "Low",
                costColor: "#4DB887",
              },
              {
                name: "Standard",
                tag: null,
                tagColor: "",
                desc: "Adds Sentiment analysis on top of Lite. Sentiment changes daily — analyst rating upgrades, short interest shifts, options flow — and is the most useful incremental signal for reviewing existing positions.",
                phaseA: "Macro + News + Quant + Sentiment",
                phaseB: "All research agents + Sentiment",
                cost: "Medium",
                costColor: "#E39A57",
              },
              {
                name: "Full",
                tag: null,
                tagColor: "",
                desc: "Adds Fundamental Analyst to every Phase A run regardless of earnings schedule. Most appropriate when you want a complete quarterly data re-check on every position — but note fundamentals only change materially every 3 months.",
                phaseA: "All agents: Macro + News + Quant + Sentiment + Fundamental",
                phaseB: "All research agents + Sentiment",
                cost: "High",
                costColor: "#E2706A",
              },
            ].map((m) => (
              <div key={m.name} className="card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-display font-bold text-ink-1">{m.name}</span>
                  {m.tag && (
                    <span className="text-micro font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${m.tagColor}20`, color: m.tagColor }}>
                      {m.tag}
                    </span>
                  )}
                  <span className="ml-auto text-micro font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: `${m.costColor}15`, color: m.costColor }}>
                    {m.cost} cost
                  </span>
                </div>
                <p className="text-ink-3 text-sm leading-relaxed mb-4">{m.desc}</p>
                <div className="space-y-2 text-xs">
                  <div>
                    <p className="text-ink-3 mb-0.5">Phase A — Portfolio Review</p>
                    <p className="text-ink-2">{m.phaseA}</p>
                  </div>
                  <div>
                    <p className="text-ink-3 mb-0.5">Phase B — New Opportunities</p>
                    <p className="text-ink-2">{m.phaseB}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section className="mb-16">
          <h2 className="font-display text-2xl font-bold text-ink-1 mb-5">Technology</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TECH_STACK.map((tech) => (
              <div key={tech.name} className="card p-4">
                <div className="w-2 h-2 rounded-full mb-2" style={{ background: tech.color }} />
                <p className="text-sm font-semibold text-ink-1 leading-tight">{tech.name}</p>
                <p className="text-xs text-ink-3 mt-0.5">{tech.category}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Status */}
        <section className="mb-16">
          <div className="card p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h2 className="font-display text-xl font-bold text-ink-1 mb-3">Current Status</h2>
                <div className="space-y-2">
                  {[
                    { label: "Mode", value: "Paper Trading", color: "#E39A57" },
                    { label: "Pipeline", value: "Daily — 10:30am New York, Mon–Fri", color: "#4DB887" },
                    { label: "Agents", value: "11 of 11 operational", color: "#4DB887" },
                    { label: "Capital", value: "$100,000 paper account (Alpaca)", color: "#8E959D" },
                    { label: "Live trading", value: "After 20+ successful runs", color: "#8E959D" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3 text-sm">
                      <span className="text-ink-3 w-28">{s.label}</span>
                      <span style={{ color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-3 mb-2">Source code</p>
                <a
                  href="https://github.com/harrywalker1000-web/ai-stock-agent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-1 transition-all hover:scale-[1.02] active:scale-[0.98]"
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
        <div className="text-center text-ink-3 text-sm">
          <p>Haz Capital Management — paper trading only. Not financial advice.</p>
          <p className="mt-1">Built by Harry Walker with Claude Code.</p>
        </div>
      </div>
    </div>
  );
}
