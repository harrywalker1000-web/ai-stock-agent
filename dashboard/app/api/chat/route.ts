import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { dataDir, reportsDir, memoryDir } from "@/lib/data-path";

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
  committee: "You are the Investment Committee of Haz Capital Management. You are the final decision-maker — you hear from all 9 other agents and make the call. You classify every candidate as Scenario A (momentum), B (dislocation long), C (dislocation short), or D (skip). You are authoritative and direct. You own every decision. You cite the specific data points that drove each choice. CRITICAL: Always refer to stocks by their real ticker symbol (e.g. NVDA, AAPL, META) — never use placeholders like 'Company X'.",
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
    "reports/committee_report.json",
    "memory/positions_log.json",
    "memory/decision_log.json",
    "reports/pipeline_result.json",
  ],
  executor:      ["reports/pipeline_result.json", "memory/positions_log.json"],
};

function safeRead(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function loadAgentContext(agentId: string): string {
  const files = AGENT_REPORT_FILES[agentId] ?? ["reports/pipeline_result.json"];
  const base = dataDir();
  const chunks: string[] = [];

  for (const rel of files) {
    const data = safeRead(path.join(base, rel));
    if (!data) continue;

    // For committee/executor: summarise positions concisely rather than dumping the whole log
    if (rel === "memory/positions_log.json") {
      const positions = Object.entries(data as Record<string, Record<string, unknown>>).map(([ticker, p]) => ({
        ticker,
        direction: p.direction,
        entry_price: p.entry_price,
        current_price: p.current_price,
        pct_change: p.pct_change,
        pnl_absolute: p.pnl_absolute,
        conviction: p.conviction,
        scenario: p.scenario,
        entry_thesis: p.entry_thesis,
      }));
      chunks.push(`CURRENT PORTFOLIO POSITIONS:\n${JSON.stringify(positions, null, 2)}`);
      continue;
    }

    // For decision_log: last 10 decisions only
    if (rel === "memory/decision_log.json") {
      const decisions = Array.isArray(data) ? data.slice(-10) : data;
      chunks.push(`RECENT DECISIONS (last 10):\n${JSON.stringify(decisions, null, 2)}`);
      continue;
    }

    // For pipeline_result: top-level summary + phase_b committee decisions only
    if (rel === "reports/pipeline_result.json") {
      const summary = {
        pipeline_summary: (data as Record<string, unknown>).pipeline_summary,
        phase_b_decisions: ((data as Record<string, unknown>).phase_b as Record<string, unknown>)?.committee,
        phase_a_mode: (data as Record<string, unknown>).phase_a_mode,
        run_date: (data as Record<string, unknown>).run_date,
      };
      chunks.push(`LAST PIPELINE RUN SUMMARY:\n${JSON.stringify(summary, null, 2)}`);
      continue;
    }

    chunks.push(`${rel.toUpperCase().replace(/[/_]/g, " ").replace(".JSON", "")}:\n${JSON.stringify(data, null, 2)}`);
  }

  return chunks.join("\n\n---\n\n");
}

// Use gpt-4o for the committee (decision quality matters); mini for others
const MODEL_FOR_AGENT: Record<string, string> = {
  committee: "gpt-4o",
};

export async function POST(request: NextRequest) {
  try {
    const { agentId, message, notifyAgent } = await request.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const personality = AGENT_PERSONALITIES[agentId] || AGENT_PERSONALITIES.committee;
    const liveContext = loadAgentContext(agentId);
    const model = MODEL_FOR_AGENT[agentId] ?? "gpt-4o-mini";

    const systemPrompt = `${personality}

${liveContext ? `=== LIVE DATA FROM YOUR LAST PIPELINE RUN ===\n${liveContext}\n=== END LIVE DATA ===\n` : ""}
You are responding to a message from Harry Walker, the fund manager and owner of Haz Capital Management. Be specific — cite real ticker symbols, real numbers, real conviction scores from the data above. Never use placeholders like "Company X". If you don't have data for something, say so explicitly rather than inventing generic statements. Maximum 4 paragraphs unless asked for more.
${notifyAgent ? "\n[NOTIFY MODE: This message will be logged and considered in tomorrow's pipeline run. Acknowledge this.]" : ""}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
      return NextResponse.json({ error: `OpenAI error: ${err}` }, { status: 500 });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "No response generated.";

    return NextResponse.json({ reply, model });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
