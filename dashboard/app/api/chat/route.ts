import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/data-path";

const AGENT_PERSONALITIES: Record<string, string> = {
  macro: "You are the Macro Analyst for Haz Capital Management, an autonomous AI hedge fund. You monitor global macroeconomic conditions, central bank policy, VIX levels, and broad market regimes. You classify the market as RISK-ON, RISK-OFF, or NEUTRAL. You speak with confidence and precision. You are the first agent in the pipeline — the others rely on your macro read. Be concise, data-driven, and forward-looking. Never waffle.",
  sector: "You are the Sector Analyst for Haz Capital Management. You identify which sectors offer the best risk-adjusted forward returns given current macro conditions. You benchmark stocks within their sectors — a high P/E is normal for high-growth tech but abnormal for industrials. You speak in relative terms: 'Healthcare is outperforming on a 3-month basis, but this dislocation looks temporary.' Be specific about sector rotation signals.",
  institutional: "You are the Institutional Tracker for Haz Capital Management. You follow the smart money — 13-F filings, dark pool activity, block trades, and fund accumulation patterns. You know where the real money is moving before the headlines catch up. You speak like someone who has read every SEC filing this quarter. Be specific about which funds, when, and at what price levels.",
  news: "You are the News & Catalyst Agent for Haz Capital Management. You scan thousands of headlines daily to identify genuine market-moving catalysts vs noise. You distinguish between macro news (affects the whole market) and company-specific news (affects one stock). You are deeply skeptical of sentiment-driven narrative. You ask: 'Is this news actually new information, or just the market repricing what it already knew?'",
  candidate: "You are the Candidate Generator for Haz Capital Management. You process signals from Phase 1 agents to rank the 950-stock universe down to the best 50 candidates for deep analysis. You run a dislocation screen on S&P 500 members to surface quality stocks down >20% in a month. You speak in terms of composite scores, signal weights, and dislocation thresholds.",
  fundamental: "You are the Fundamental Analyst for Haz Capital Management. You analyse balance sheets, income statements, valuations, and peer comparisons. You always benchmark within sector — a tech P/E of 30x is not the same as an industrial P/E of 30x. You output price_vs_intrinsic_value (peer-relative % premium/discount) and identify dislocation_opportunity when price has meaningfully disconnected from fundamental value. You cite specific numbers: P/E ratios, EV/EBITDA, revenue growth, margin trends.",
  quant: "You are the Quant & Technical Analyst for Haz Capital Management. You produce a mean_reversion_score (0–100) and forward_bias for every ticker. You look at RSI oversold depth, % below SMA200, proximity to 52-week lows, selling volume exhaustion, Bollinger Bands, and Stochastic oscillators. High scores mean the stock is likely to bounce. You speak in numbers: 'RSI 24, 31% below SMA200, mean_reversion_score 82 — this is oversold, not broken.'",
  sentiment: "You are the Sentiment Analyst for Haz Capital Management. You classify sentiment as leading (pricing in future events) or lagging (reacting to past price moves). Lagging negative sentiment on a fundamentally strong stock after a broad selloff is a contrarian buy signal. You output contrarian_signal=true when analyst consensus still shows significant upside but sentiment looks backward-looking. You're the team's contrarian — you ask 'is the crowd right, or just loud?'",
  memory: "You are the Memory & Pattern Agent for Haz Capital Management. You remember every trade, every decision, every mistake. You surface historical patterns: 'The last 3 times we entered a RISK-OFF dislocation long, 2 of 3 were profitable within 6 weeks.' You maintain the entry theses and compare them against current conditions. You don't make decisions — you provide context and track record.",
  committee: "You are the Investment Committee of Haz Capital Management. You are the final decision-maker — you hear from all 9 other agents and make the call. You classify every candidate as Scenario A (momentum), B (dislocation long), C (dislocation short), or D (skip). You are authoritative and direct. You own every decision. You cite the specific data points that drove each choice. CRITICAL: Always refer to stocks by their real ticker symbol (e.g. NVDA, AAPL, META) — never use placeholders like 'Company X'. If a question is better answered by a specific agent (e.g. live macro conditions → Macro Agent, technical levels → Quant Agent, recent news → News Agent), say so and direct Harry there.",
  executor: "You are the Trade Executor for Haz Capital Management. You don't form opinions on markets — that's not your job. The Committee decides. You execute. You speak in operational terms: order types, position sizes, timing, slippage estimates, paper vs live trading status. You are always in paper trading mode until explicitly changed by Harry Walker.",
};

// Map agentId → which report file(s) to load
const AGENT_REPORT_FILES: Record<string, string[]> = {
  macro:         ["reports/macro_report.json"],
  sector:        ["reports/sector_report.json"],
  institutional: ["reports/institutional_report.json"],
  news:          ["reports/news_report.json"],
  candidate:     ["reports/candidates_report.json"],
  fundamental:   ["reports/fundamental_report.json"],
  quant:         ["reports/quant_report.json"],
  sentiment:     ["reports/sentiment_report.json"],
  memory:        ["memory/decision_log.json", "memory/pattern_history.json"],
  committee:     [
    "memory/positions_log.json",
    "memory/decision_log.json",
    "reports/pipeline_result.json",
  ],
  executor:      ["reports/pipeline_result.json", "memory/positions_log.json"],
};

// Hard cap on characters for any single report block sent to the LLM
const MAX_REPORT_CHARS = 3000;

function safeRead(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function getReportDate(agentId: string, base: string): string | null {
  // Try to extract generated_at from the primary report
  const primary = AGENT_REPORT_FILES[agentId]?.[0];
  if (!primary) return null;
  const data = safeRead(path.join(base, primary));
  return (data?.generated_at as string) ?? (data?.run_date as string) ?? null;
}

function loadAgentContext(agentId: string): string {
  const files = AGENT_REPORT_FILES[agentId] ?? ["reports/pipeline_result.json"];
  const base = dataDir();
  const chunks: string[] = [];

  for (const rel of files) {
    const data = safeRead(path.join(base, rel));
    if (!data) continue;

    if (rel === "memory/positions_log.json") {
      // Also pull portfolio total value so dollar P&L can be computed
      const portState = safeRead(path.join(base, "reports/portfolio_state.json"));
      const portfolioValue = portState?.portfolio_value ?? portState?.equity ?? null;

      const positions = Object.entries(data as Record<string, Record<string, unknown>>).map(([ticker, p]) => {
        const entryPrice = Number(p.entry_price ?? 0);
        const sizePct = Number(p.size_pct ?? 0);
        const dollarAllocated = portfolioValue && sizePct ? Math.round((sizePct / 100) * Number(portfolioValue)) : null;
        return {
          ticker,
          direction: p.direction,
          entry_price: entryPrice,
          current_price: p.current_price ?? null,
          pct_change: p.pct_change ?? null,
          pnl_absolute: p.pnl_absolute ?? null,
          size_pct_of_portfolio: sizePct,
          dollar_allocated: dollarAllocated,
          conviction: p.conviction,
          scenario: p.scenario,
          thesis: String(p.entry_thesis ?? "").slice(0, 120),
        };
      });
      const portLine = portfolioValue ? `Portfolio total value: $${Number(portfolioValue).toLocaleString()}` : "";
      chunks.push(`PORTFOLIO POSITIONS (${portLine}):\n${JSON.stringify(positions, null, 2)}`);
      continue;
    }

    if (rel === "memory/decision_log.json") {
      const raw = Array.isArray(data) ? data.slice(-5) : [];
      const decisions = raw.map((d: Record<string, unknown>) => ({
        date: d.date,
        ticker: d.ticker,
        action: d.action,
        conviction: d.conviction,
        reason: String(d.reason ?? "").slice(0, 100),
      }));
      chunks.push(`RECENT DECISIONS (last 5):\n${JSON.stringify(decisions, null, 2)}`);
      continue;
    }

    if (rel === "reports/pipeline_result.json") {
      const ps = (data as Record<string, unknown>).pipeline_summary ?? {};
      chunks.push(`LAST PIPELINE SUMMARY:\n${JSON.stringify({ run_date: (data as Record<string, unknown>).run_date, ...ps as object }, null, 2)}`);
      continue;
    }

    // All other reports: send but cap at MAX_REPORT_CHARS
    const raw = JSON.stringify(data, null, 2);
    const label = rel.toUpperCase().replace(/[/_]/g, " ").replace(".JSON", "");
    chunks.push(`${label}:\n${raw.slice(0, MAX_REPORT_CHARS)}${raw.length > MAX_REPORT_CHARS ? "\n...[truncated]" : ""}`);
  }

  return chunks.join("\n\n---\n\n");
}

// Fetch live prices for key market indicators + portfolio tickers via Yahoo Finance (no API key needed)
async function fetchLivePrices(agentId: string, base: string): Promise<string> {
  const tickers = new Set(["SPY", "QQQ", "%5EVIX"]); // SPY, QQQ, VIX always

  // Add portfolio tickers so committee/quant/fundamental can reference live prices
  const posLog = safeRead(path.join(base, "memory/positions_log.json"));
  if (posLog) {
    for (const ticker of Object.keys(posLog)) tickers.add(ticker);
  }

  const results: string[] = [];
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

  await Promise.allSettled(
    Array.from(tickers).map(async (ticker) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) });
        if (!res.ok) return;
        const json = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose ?? meta.previousClose;
        const chg = prev ? (((price - prev) / prev) * 100).toFixed(2) : "?";
        const displayTicker = ticker === "%5EVIX" ? "^VIX" : ticker;
        results.push(`${displayTicker}: $${price?.toFixed(2)} (${Number(chg) >= 0 ? "+" : ""}${chg}% today)`);
      } catch {
        // silently skip failed tickers
      }
    })
  );

  if (!results.length) return "";
  return `LIVE MARKET PRICES (as of ${now} ET):\n${results.join("\n")}`;
}

// Use gpt-4o for the committee; mini for others
const MODEL_FOR_AGENT: Record<string, string> = {
  committee: "gpt-4o",
};

export async function POST(request: NextRequest) {
  try {
    const { agentId, message, notifyAgent } = await request.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: "[Error]: OpenAI API key not configured on this deployment." }, { status: 200 });
    }

    const base = dataDir();
    const personality = AGENT_PERSONALITIES[agentId] || AGENT_PERSONALITIES.committee;
    const reportContext = loadAgentContext(agentId);
    const reportDate = getReportDate(agentId, base);
    const liveContext = await fetchLivePrices(agentId, base);
    const model = MODEL_FOR_AGENT[agentId] ?? "gpt-4o-mini";

    const dataAgeNote = reportDate
      ? `Note: your report data below is from the pipeline run on ${reportDate}. When referencing this data, always clarify it is as of that date — not live.`
      : "Note: your report data has an unknown timestamp. Always clarify to Harry that your data may not be current.";

    const systemPrompt = `${personality}

${dataAgeNote}

${liveContext ? `${liveContext}\n` : ""}
${reportContext ? `=== PIPELINE REPORT DATA (as of ${reportDate ?? "last run"}) ===\n${reportContext}\n=== END REPORT DATA ===\n` : ""}
You are responding to Harry Walker, the fund manager and owner of Haz Capital Management. Rules:
- JUST ANSWER. Never explain methodology, never show your working unless asked. Harry is a professional — he doesn't need you to explain what P&L means.
- Give the number first, context second. "NVDA is up 12.5% — entry $177, now $199" not "To calculate P&L we compare entry to current..."
- Always cite real ticker symbols and real numbers from the data above — never invent or use placeholders.
- Note when data is live (prices fetched now) vs from the pipeline report (as of ${reportDate ?? "last run"}) — one short parenthetical is enough, not a paragraph.
- If you don't have a specific figure, say it in one sentence and move on. Don't pad.
- If the question is better suited to another agent, say so in one line: "Check the Quant Agent for the technical read."
- Be direct, sharp, and brief. Max 3 short paragraphs.
${notifyAgent ? "\n[NOTIFY MODE: This message will be logged and considered in tomorrow's pipeline run. Acknowledge this.]" : ""}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 600,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ reply: `[API error ${response.status}]: ${err.slice(0, 300)}` }, { status: 200 });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "[No content returned from model]";

    return NextResponse.json({ reply, model });
  } catch (err) {
    return NextResponse.json({ reply: `[Chat error]: ${String(err).slice(0, 200)}` }, { status: 200 });
  }
}
