import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/data-path";

// ---------------------------------------------------------------------------
// Agent personalities
// ---------------------------------------------------------------------------
const AGENT_PERSONALITIES: Record<string, string> = {
  macro: "You're the Macro Analyst on Harry's team. You think about the big picture — the economy, the Fed, rates, inflation, elections, wars, oil — and what it means for markets and for our positions.",
  sector: "You're the Sector Analyst on Harry's team. You think about which parts of the market are in or out of favour and why, and how that affects what we own.",
  institutional: "You're the Institutional Tracker on Harry's team. You follow what big funds are buying and selling (13F filings, large holders) and what that signals.",
  news: "You're the News & Catalyst analyst on Harry's team. You separate news that genuinely changes a company's prospects from noise the market has already priced in.",
  candidate: "You're the Candidate Generator on Harry's team. You screen the stock universe for new ideas worth a closer look, and can explain why something did or didn't make the cut.",
  fundamental: "You're the Fundamental Analyst on Harry's team. You look at the businesses themselves — growth, margins, balance sheets, valuation versus peers.",
  quant: "You're the Quant & Technical Analyst on Harry's team. You read price action — trends, momentum, support and resistance — and explain it in plain terms.",
  sentiment: "You're the Sentiment Analyst on Harry's team. You read analyst views, short interest and crowd mood, and you're happy to be the contrarian.",
  memory: "You're the team's memory. You know every past trade and decision, what worked, what didn't, and the patterns in our own track record.",
  committee: "You're the Investment Committee chair on Harry's team — you make the final calls and can speak to any position, any decision, and the overall strategy.",
  executor: "You're the Trade Executor on Harry's team. You know exactly what was bought and sold, when, at what size, and why some intended trades didn't happen. This is a paper-trading account.",
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

// Latest daily report briefing — what actually happened most recently
function loadLatestBriefing(base: string): string {
  try {
    const dir = path.join(base, "reports");
    const files = fs.readdirSync(dir).filter((f) => /^daily_report_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.reverse()) {
      const r = safeRead(path.join(dir, f)) as Record<string, unknown> | null;
      if (!r) continue;
      const b = r.briefing as Record<string, unknown> | null;
      const head = `LATEST DAILY REPORT (${r.date}): ${r.summary ?? ""}\nP&L ${r.daily_pnl} ${r.daily_pnl_pct ?? ""} for ${r.daily_pnl_date ?? "previous day"}`;
      return b ? `${head}\n${truncate(JSON.stringify({ pnl: b.pnl, trades: b.trades, not_executed: b.not_executed, watch: b.watch }), 2500)}` : head;
    }
  } catch { /* none */ }
  return "";
}

function loadMarketBackdrop(base: string): string {
  const m = safeRead(path.join(base, "reports/market_backdrop.json")) as Record<string, unknown> | null;
  if (!m) return "";
  return `WHAT'S MOVING MARKETS (researched ${m.generated_at ?? m.date}):\n${truncate(JSON.stringify({ mood: m.market_mood, themes: m.themes }), 3000)}`;
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

  // Everyone on the team knows the basics: where the portfolio stands, what happened
  // today, and what's moving markets — so any agent can answer a general question.
  if (agentId !== "committee" && agentId !== "executor" && agentId !== "quant" && agentId !== "fundamental") {
    sections.unshift(loadPortfolioState(base));
  }
  sections.unshift(loadMarketBackdrop(base));
  sections.unshift(loadLatestBriefing(base));

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
// Model calls — Claude with live web search when available, OpenAI fallback
// ---------------------------------------------------------------------------
type Turn = { role: "user" | "assistant"; content: string };

const CLAUDE_MODEL = "claude-sonnet-5-5";

async function askClaude(apiKey: string, system: string, turns: Turn[]): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      system,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: turns,
    }),
    signal: AbortSignal.timeout(55000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
}

async function askOpenAI(apiKey: string, system: string, turns: Turn[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: system }, ...turns], max_tokens: 1000 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// Claude needs user/assistant turns that alternate and start with the user.
function toTurns(history: Array<{ role: "user" | "agent"; text: string }> | undefined, message: string): Turn[] {
  const turns: Turn[] = [];
  for (const h of (history ?? []).slice(-10)) {
    const role = h.role === "user" ? "user" : "assistant";
    if (!h.text?.trim()) continue;
    if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += "\n\n" + h.text;
    else turns.push({ role, content: h.text });
  }
  // The client sends history that already ends with this message — don't send it twice.
  if (turns.length && turns[turns.length - 1].role === "user" && turns[turns.length - 1].content.trim() === message.trim()) {
    turns.pop();
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();
  if (turns.length && turns[turns.length - 1].role === "user") turns[turns.length - 1].content += "\n\n" + message;
  else turns.push({ role: "user", content: message });
  return turns;
}

// Replies render as plain text in the chat bubble.
function stripMarkdown(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
}

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

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!anthropicKey && !openaiKey) {
      return NextResponse.json({ reply: "I can't respond right now — no AI provider key is configured on this deployment." });
    }

    const base = dataDir();
    const personality = AGENT_PERSONALITIES[agentId] ?? AGENT_PERSONALITIES.committee;
    const { context, reportDate } = buildContext(agentId, base);
    const liveContext = await fetchLivePrices(base);
    const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "full" });

    const system = [
      personality,
      `Today is ${today}. You're chatting with Harry, who owns this fund. Talk to him like a sharp, friendly colleague would — not like a report generator.`,
      "",
      "HOW TO ANSWER:",
      "- Answer the question he actually asked, first, in plain English. Then the reasoning behind it.",
      "- Have a view. If he asks what you think, say what you think and why, including the risks.",
      "- Use the team's data below for anything about our portfolio, trades and decisions — quote real tickers and numbers from it, and never make figures up.",
      anthropicKey
        ? "- For current events, news, or anything the data below doesn't cover, use web search rather than guessing."
        : "- If he asks about something the data doesn't cover, say what you don't know rather than guessing.",
      "- You can step outside your specialty — you know what the rest of the team knows. Mention a teammate only if they'd genuinely add more.",
      "- Match length to the question: a quick question gets a couple of sentences; a big one can get a few short paragraphs.",
      "- Explain jargon if you use it. No markdown headings or bold — this renders as plain text.",
      reportDate ? `- Team data is from the last pipeline run (${reportDate}); live prices below are current.` : "",
      notifyAgent ? "- [Note mode: acknowledge that this will be logged for the next pipeline run.]" : "",
      "",
      liveContext || "",
      context ? `=== TEAM DATA ===\n${context}\n=== END TEAM DATA ===` : "",
    ].filter((l) => l !== null).join("\n");

    const turns = toTurns(history, message);
    let reply = "";
    let model = "";
    if (anthropicKey) {
      try {
        reply = await askClaude(anthropicKey, system, turns);
        model = CLAUDE_MODEL;
      } catch (err) {
        console.error("Chat: Claude failed, falling back to OpenAI:", err);
      }
    }
    if (!reply && openaiKey) {
      reply = await askOpenAI(openaiKey, system, turns);
      model = "gpt-4o";
    }

    return NextResponse.json({ reply: stripMarkdown(reply) || "Sorry — I couldn't come up with an answer to that.", model });
  } catch (err) {
    return NextResponse.json({ reply: `Something went wrong on my end (${String(err).slice(0, 150)}).` });
  }
}
