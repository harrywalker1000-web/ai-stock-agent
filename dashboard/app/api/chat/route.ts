import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/data-path";

// ---------------------------------------------------------------------------
// Agent personalities
// ---------------------------------------------------------------------------
const AGENT_PERSONALITIES: Record<string, string> = {
  macro: "You are the Macro Analyst for Haz Capital Management. You own the market regime read — RISK-ON, RISK-OFF, or NEUTRAL — and your view drives every other agent's positioning. You speak in clear regime calls backed by specific data: Fed stance, VIX level, yield curve shape, inflation trend. You are forward-looking, not descriptive.",
  sector: "You are the Sector Analyst for Haz Capital Management. You identify the best and worst sectors given the current macro regime. You speak in relative terms with specific sector calls, rotation signals, and valuation benchmarks. A tech P/E of 30x is normal; an industrial P/E of 30x is not.",
  institutional: "You are the Institutional Tracker for Haz Capital Management. You track 13-F filings, dark pool activity, block trades, and smart money accumulation. You cite specific funds, position sizes, and timing. You know where the real money is moving before headlines catch up.",
  news: "You are the News & Catalyst Agent for Haz Capital Management. You filter signal from noise — genuine market-moving catalysts vs sentiment-driven noise. You are deeply skeptical and ask: is this new information, or is the market repricing what it already knew?",
  candidate: "You are the Candidate Generator for Haz Capital Management. You rank the 950-stock universe down to the top candidates using composite scores, signal weights, and dislocation screens. You speak in scores and filters, not opinions.",
  fundamental: "You are the Fundamental Analyst for Haz Capital Management. You analyse balance sheets, valuations, and peer comparisons. You cite specific numbers: P/E, EV/EBITDA, revenue growth, margins, ROIC. You always benchmark within sector.",
  quant: "You are the Quant & Technical Analyst for Haz Capital Management. You own the technical picture — RSI, MACD, SMA200, support/resistance, mean reversion scores. You speak in numbers and levels: 'RSI 28, 18% below SMA200, mean reversion score 84 — oversold, not broken.'",
  sentiment: "You are the Sentiment Analyst for Haz Capital Management. You distinguish leading from lagging sentiment. Lagging negative sentiment on a fundamentally strong stock after a broad selloff is a contrarian buy signal. You are the team's contrarian.",
  memory: "You are the Memory & Pattern Agent for Haz Capital Management. You remember every trade, every decision, every mistake, and surface historical patterns. You provide context and track record — you don't make decisions.",
  committee: "You are the Investment Committee of Haz Capital Management — the final decision-maker. You hear from all agents and own every call. You classify positions as Scenario A (momentum), B (dislocation long), C (dislocation short), or D (skip). You are authoritative, direct, and brutally specific. If a question is better answered by a specialist agent, say so in one line. CRITICAL: Always use real ticker symbols — never placeholders like 'Company X'.",
  executor: "You are the Trade Executor for Haz Capital Management. The Committee decides, you execute. You speak in operational terms: order types, position sizes, timing, slippage. You are in paper trading mode unless explicitly told otherwise by Harry Walker.",
};

// ---------------------------------------------------------------------------
// Data loading helpers
// ---------------------------------------------------------------------------

function safeRead(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// Portfolio state from Alpaca — real qty, current price, unrealized P&L
function loadPortfolioState(base: string): string {
  const ps = safeRead(path.join(base, "reports/portfolio_state.json")) as Record<string, unknown> | null;
  if (!ps) return "";
  const positions = ps.positions as Record<string, Record<string, unknown>> | null;
  if (!positions) return "";

  const rows = Object.entries(positions).map(([ticker, p]) => ({
    ticker,
    side: p.side,
    qty: p.qty,
    avg_entry: p.avg_entry_price,
    current_price: p.current_price,
    market_value: p.market_value,
    unrealized_pnl: p.unrealized_pnl,
  }));

  const portfolioValue = ps.portfolio_value ?? ps.equity;
  const cash = ps.cash;
  return `LIVE PORTFOLIO (from Alpaca, as of ${ps.generated_at ?? ps.date ?? "last sync"}):\nTotal equity: $${Number(portfolioValue).toLocaleString()} | Cash: $${Number(cash).toLocaleString()}\n${JSON.stringify(rows, null, 2)}`;
}

// Entry thesis + signals from positions_log
function loadPositionTheses(base: string): string {
  const log = safeRead(path.join(base, "memory/positions_log.json")) as Record<string, Record<string, unknown>> | null;
  if (!log) return "";
  const entries = Object.entries(log).map(([ticker, p]) => ({
    ticker,
    direction: p.direction,
    entry_price: p.entry_price,
    entry_date: p.entry_date,
    conviction: p.conviction,
    stop_loss: p.stop_loss,
    size_pct: p.size_pct,
    thesis: truncate(String(p.entry_thesis ?? ""), 150),
    signals: Array.isArray(p.signals) ? (p.signals as string[]).slice(0, 3) : [],
  }));
  return `ENTRY THESES (from positions_log):\n${JSON.stringify(entries, null, 2)}`;
}

// Recent decisions from decision_log
function loadRecentDecisions(base: string, count = 5): string {
  const log = safeRead(path.join(base, "memory/decision_log.json"));
  const raw = Array.isArray(log) ? (log as Record<string, unknown>[]).slice(-count) : [];
  const decisions = raw.map((d) => ({
    date: d.date,
    ticker: d.ticker,
    action: d.action,
    conviction: d.conviction,
    rationale: truncate(String(d.rationale ?? ""), 120),
    key_catalysts: Array.isArray(d.key_catalysts) ? (d.key_catalysts as string[]).slice(0, 2) : [],
    key_risks: Array.isArray(d.key_risks) ? (d.key_risks as string[]).slice(0, 2) : [],
  }));
  return `RECENT DECISIONS (last ${count}):\n${JSON.stringify(decisions, null, 2)}`;
}

// Macro regime snapshot
function loadMacro(base: string): string {
  const m = safeRead(path.join(base, "reports/macro_report.json")) as Record<string, unknown> | null;
  if (!m) return "";
  return `MACRO REPORT (as of ${m.generated_at ?? "last run"}):\nRegime: ${m.regime} | Rate direction: ${m.interest_rate_direction} | Inflation: ${m.inflation_trend}\nFavoured themes: ${JSON.stringify(m.favoured_themes)}\nAvoid themes: ${JSON.stringify(m.avoid_themes)}\nGeopolitical risks: ${JSON.stringify(m.geopolitical_risks)}\nSummary: ${truncate(String(m.macro_summary ?? ""), 400)}`;
}

// Quant technicals for held positions only
function loadQuantForHeld(base: string): string {
  const q = safeRead(path.join(base, "reports/quant_report.json")) as Record<string, unknown> | null;
  const ps = safeRead(path.join(base, "memory/positions_log.json")) as Record<string, unknown> | null;
  if (!q || !ps) return "";
  const heldTickers = new Set(Object.keys(ps));
  const analyses = Array.isArray(q.quant_analyses) ? (q.quant_analyses as Record<string, unknown>[]) : [];
  const held = analyses
    .filter((a) => heldTickers.has(String(a.ticker)))
    .map((a) => ({
      ticker: a.ticker,
      rsi_14: a.rsi_14,
      macd_signal: a.macd_signal,
      mean_reversion_score: a.mean_reversion_score,
      forward_bias: a.forward_bias,
      support: a.support,
      resistance: a.resistance,
      quant_score: a.quant_score,
      summary: truncate(String(a.quant_summary ?? ""), 100),
    }));
  return held.length ? `QUANT TECHNICALS FOR HELD POSITIONS (as of ${q.generated_at ?? "last run"}):\n${JSON.stringify(held, null, 2)}` : "";
}

// Fundamental data for held positions
function loadFundamentalsForHeld(base: string): string {
  const f = safeRead(path.join(base, "reports/fundamental_report.json")) as Record<string, unknown> | null;
  const ps = safeRead(path.join(base, "memory/positions_log.json")) as Record<string, unknown> | null;
  if (!f || !ps) return "";
  const heldTickers = new Set(Object.keys(ps));
  const analyses = Array.isArray(f.fundamental_analyses) ? (f.fundamental_analyses as Record<string, unknown>[]) : [];
  const held = analyses
    .filter((a) => heldTickers.has(String(a.ticker)))
    .map((a) => ({
      ticker: a.ticker,
      pe_ratio: a.pe_ratio,
      pe_peer_avg: a.pe_peer_average,
      revenue_growth_yoy: a.revenue_growth_yoy,
      operating_margin: a.operating_margin,
      roic: a.roic,
      price_vs_intrinsic: a.price_vs_intrinsic_value,
      dislocation: a.dislocation_opportunity,
      key_strengths: Array.isArray(a.key_strengths) ? (a.key_strengths as string[]).slice(0, 2) : [],
      key_concerns: Array.isArray(a.key_concerns) ? (a.key_concerns as string[]).slice(0, 2) : [],
    }));
  return held.length ? `FUNDAMENTALS FOR HELD POSITIONS (as of ${f.generated_at ?? "last run"}):\n${JSON.stringify(held, null, 2)}` : "";
}

// Pipeline summary only
function loadPipelineSummary(base: string): string {
  const p = safeRead(path.join(base, "reports/pipeline_result.json")) as Record<string, unknown> | null;
  if (!p) return "";
  return `LAST PIPELINE RUN (${p.date ?? ""}, mode: ${p.phase_a_mode ?? ""}):\n${JSON.stringify(p.pipeline_summary ?? {}, null, 2)}`;
}

// Full agent report (for specialist agents) — capped
function loadReport(base: string, file: string, cap = 3000): string {
  const data = safeRead(path.join(base, file));
  if (!data) return "";
  const raw = JSON.stringify(data, null, 2);
  return truncate(raw, cap);
}

// Build context string per agent
function buildContext(agentId: string, base: string): { context: string; reportDate: string | null } {
  const sections: string[] = [];
  let reportDate: string | null = null;

  // Try to extract a report date
  const tryDate = (file: string) => {
    if (reportDate) return;
    const d = safeRead(path.join(base, file)) as Record<string, unknown> | null;
    reportDate = (d?.generated_at ?? d?.date ?? null) as string | null;
  };

  if (agentId === "committee" || agentId === "executor") {
    tryDate("reports/pipeline_result.json");
    sections.push(loadPortfolioState(base));
    sections.push(loadPositionTheses(base));
    sections.push(loadRecentDecisions(base));
    sections.push(loadPipelineSummary(base));
    if (agentId === "committee") {
      sections.push(loadMacro(base));
    }
  } else if (agentId === "quant") {
    tryDate("reports/quant_report.json");
    sections.push(loadPortfolioState(base));
    sections.push(loadQuantForHeld(base));
    sections.push(`FULL QUANT REPORT:\n${loadReport(base, "reports/quant_report.json", 3500)}`);
  } else if (agentId === "fundamental") {
    tryDate("reports/fundamental_report.json");
    sections.push(loadPortfolioState(base));
    sections.push(loadFundamentalsForHeld(base));
    sections.push(`FULL FUNDAMENTAL REPORT:\n${loadReport(base, "reports/fundamental_report.json", 3500)}`);
  } else if (agentId === "macro") {
    tryDate("reports/macro_report.json");
    sections.push(loadMacro(base));
  } else if (agentId === "memory") {
    tryDate("memory/decision_log.json");
    sections.push(loadRecentDecisions(base, 10));
    sections.push(`PATTERN HISTORY:\n${loadReport(base, "memory/pattern_history.json", 2000)}`);
  } else {
    // sector, institutional, news, sentiment, candidate
    const fileMap: Record<string, string> = {
      sector: "reports/sector_report.json",
      institutional: "reports/institutional_report.json",
      news: "reports/news_report.json",
      sentiment: "reports/sentiment_report.json",
      candidate: "reports/candidates_report.json",
    };
    const file = fileMap[agentId];
    if (file) {
      tryDate(file);
      sections.push(loadReport(base, file, 4000));
    }
  }

  const context = sections.filter(Boolean).join("\n\n---\n\n");
  return { context, reportDate };
}

// ---------------------------------------------------------------------------
// Live market prices via Yahoo Finance (no API key)
// ---------------------------------------------------------------------------
async function fetchLivePrices(base: string): Promise<string> {
  const tickers = new Set(["SPY", "QQQ", "%5EVIX"]);
  // Add portfolio tickers
  const ps = safeRead(path.join(base, "reports/portfolio_state.json")) as Record<string, unknown> | null;
  const positions = ps?.positions as Record<string, unknown> | null;
  if (positions) for (const t of Object.keys(positions)) tickers.add(t);

  const results: string[] = [];
  await Promise.allSettled(
    Array.from(tickers).map(async (ticker) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) });
        if (!res.ok) return;
        const json = await res.json() as { chart?: { result?: Array<{ meta?: Record<string, number> }> } };
        const meta = json?.chart?.result?.[0]?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose ?? meta.previousClose;
        const chgPct = prev ? (((price - prev) / prev) * 100).toFixed(2) : "?";
        const displayTicker = ticker === "%5EVIX" ? "^VIX" : ticker;
        results.push(`${displayTicker}: $${price?.toFixed(2)} (${Number(chgPct) >= 0 ? "+" : ""}${chgPct}% today)`);
      } catch { /* skip */ }
    })
  );

  if (!results.length) return "";
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" });
  return `LIVE PRICES (${now} ET):\n${results.join(" | ")}`;
}

// ---------------------------------------------------------------------------
// Model routing
// ---------------------------------------------------------------------------
const MODEL_FOR_AGENT: Record<string, string> = {
  committee: "gpt-4o",
  fundamental: "gpt-4o",
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const { agentId, message, history, notifyAgent } = await request.json() as {
      agentId: string;
      message: string;
      history?: Array<{ role: "user" | "agent"; text: string }>;
      notifyAgent?: boolean;
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: "[Error]: OpenAI API key not configured on this deployment." });
    }

    const base = dataDir();
    const personality = AGENT_PERSONALITIES[agentId] ?? AGENT_PERSONALITIES.committee;
    const { context, reportDate } = buildContext(agentId, base);
    const liveContext = await fetchLivePrices(base);
    const model = MODEL_FOR_AGENT[agentId] ?? "gpt-4o-mini";

    const dataNote = reportDate
      ? `Pipeline data below is from ${reportDate}. When you reference it, say "as of [date]" — one brief note, not a disclaimer paragraph.`
      : "Pipeline data timestamp unknown — flag this if relevant.";

    const systemPrompt = [
      personality,
      "",
      dataNote,
      "",
      liveContext || "",
      context ? `=== PIPELINE DATA ===\n${context}\n=== END PIPELINE DATA ===` : "",
      "",
      "RESPONSE RULES — non-negotiable:",
      "1. Answer directly. Give the number/fact first, context second. Never explain methodology.",
      "2. Use real tickers and real numbers from the data. Never invent figures.",
      "3. If data is missing, say so in one sentence. Don't pad.",
      "4. Distinguish live prices (fetched now) from pipeline data (dated) — one brief note is enough.",
      "5. If a question is out of your lane, redirect in one line: 'Check the Quant Agent for technicals.'",
      "6. Max 3 short paragraphs unless Harry explicitly asks for more.",
      notifyAgent ? "7. [NOTIFY MODE: Log this message for tomorrow's pipeline run and acknowledge it.]" : "",
    ].filter(Boolean).join("\n");

    // Build conversation history for the model
    const priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-8)) { // last 8 turns max to stay within token limits
        priorMessages.push({ role: h.role === "user" ? "user" : "assistant", content: h.text });
      }
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...priorMessages,
          { role: "user", content: message },
        ],
        max_tokens: 500,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ reply: `[API error ${response.status}]: ${err.slice(0, 300)}` });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content?.trim() || "[No content returned]";

    return NextResponse.json({ reply, model });
  } catch (err) {
    return NextResponse.json({ reply: `[Chat error]: ${String(err).slice(0, 200)}` });
  }
}
