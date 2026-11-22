import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { reportsDir as getReportsDir } from "@/lib/data-path";

// Static agent metadata — enriched with live report data where available
const AGENT_PROFILES = [
  {
    id: "macro",
    name: "Macro Analyst",
    role: "Market Regime",
    number: 1,
    personality: "Assesses the daily macro environment — interest rates, inflation trajectory, geopolitical risk — and classifies the regime as risk-on, risk-off, or neutral. This classification flows directly into the Committee's signal weighting and into the Sector Agent's rotation thesis. Every other agent operates within the context it sets.",
    feeds: "Sector Agent, Investment Committee",
    color: "#0EA5E9",
    report_file: "macro_report.json",
  },
  {
    id: "sector",
    name: "Sector Analyst",
    role: "Sector Rotation",
    number: 2,
    personality: "Identifies which sectors are in or out of favour given the macro backdrop and recent price momentum. Its sector scores are passed to the Candidate Generator, which uses them to weight and filter the opportunity universe. Also informs the Committee's assessment of portfolio concentration.",
    feeds: "Candidate Generator, Investment Committee",
    color: "#10B981",
    report_file: "sector_report.json",
  },
  {
    id: "institutional",
    name: "Institutional Tracker",
    role: "Smart Money Flow",
    number: 3,
    personality: "Analyses 13F filings, dark pool activity, and institutional positioning data to detect meaningful accumulation or distribution by large players. Provides the Candidate Generator with a directional conviction signal on which tickers smart money is moving into or exiting.",
    feeds: "Candidate Generator",
    color: "#8B5CF6",
    report_file: "institutional_report.json",
  },
  {
    id: "news",
    name: "News Agent",
    role: "Catalysts & Events",
    number: 4,
    personality: "Scans earnings releases, regulatory actions, and scheduled events overnight. Flags which held positions face fresh overnight risk, and which candidates have an imminent near-term catalyst. Its output is consumed by both the Committee during the portfolio review phase and the Candidate Generator when building the shortlist.",
    feeds: "Candidate Generator, Investment Committee",
    color: "#F59E0B",
    report_file: "news_report.json",
  },
  {
    id: "candidate",
    name: "Candidate Generator",
    role: "Opportunity Filter",
    number: 5,
    personality: "Consolidates outputs from the Macro, Sector, Institutional, and News agents to filter a broad equity universe down to a ranked shortlist of 10–20 names that pass all cross-agent screens. This shortlist is the only set of tickers the deep-analysis agents then examine — it is the pipeline's quality gate.",
    feeds: "Fundamental Analyst, Quant Agent, Sentiment Agent",
    color: "#06B6D4",
    report_file: "candidates_report.json",
  },
  {
    id: "fundamental",
    name: "Fundamental Analyst",
    role: "Business Quality",
    number: 6,
    personality: "Cross-references yFinance, Alpha Vantage, and SEC EDGAR to score each candidate on revenue growth, operating margins, ROIC, and balance sheet quality. Where sources disagree by more than 5%, it flags the conflict and treats EDGAR as ground truth. Its scores form one component of the Committee's composite scorecard.",
    feeds: "Investment Committee",
    color: "#10B981",
    report_file: "fundamental_report.json",
  },
  {
    id: "quant",
    name: "Quant Agent",
    role: "Technical Analysis",
    number: 7,
    personality: "Evaluates technical structure — RSI, momentum, support and resistance, trend confirmation — for each candidate. Provides the Committee with a quantitative entry timing signal and a view on whether the technical setup supports or contradicts the fundamental thesis. A strong fundamental score with poor technical setup will lower overall conviction.",
    feeds: "Investment Committee",
    color: "#0EA5E9",
    report_file: "quant_report.json",
  },
  {
    id: "sentiment",
    name: "Sentiment Agent",
    role: "Positioning & Flow",
    number: 8,
    personality: "Analyses options flow, short interest, and retail vs institutional positioning to assess crowding and sentiment extremes. Acts as a contrarian check on the other deep-analysis agents — excessive bullish crowding or extreme positioning can veto an otherwise strong thesis at the Committee deliberation stage.",
    feeds: "Investment Committee",
    color: "#8B5CF6",
    report_file: "sentiment_report.json",
  },
  {
    id: "committee",
    name: "Investment Committee",
    role: "Decision & Arbitration",
    number: 9,
    personality: "Receives composite scorecards from the Fundamental, Quant, and Sentiment agents alongside macro context from the Memory Agent's learning brief. Runs a structured debate — including a challenge round for contested tickers — then produces the final action for each position: enter, hold, increase, decrease, or exit. All decisions feed the Trade Executor.",
    feeds: "Trade Executor",
    color: "#F5A623",
    report_file: "committee_report.json",
  },
  {
    id: "executor",
    name: "Trade Executor",
    role: "Order Execution",
    number: 10,
    personality: "Implements Committee decisions via the Alpaca API. Reconciles positions_log against live Alpaca holdings each morning before any agent runs, sizes orders against live equity, and places native protective orders — stop, stop-limit, trailing stop, or bracket — where the Committee has requested them. All execution feeds the Memory Agent for post-trade tracking.",
    feeds: "Memory Agent",
    color: "#EF4444",
    report_file: "pipeline_result.json",
  },
  {
    id: "memory",
    name: "Memory Agent",
    role: "Learning & Attribution",
    number: 11,
    personality: "Runs after every closed trade to produce a structured post-mortem: thesis verdict, what worked, what failed, key learning. These are distilled into a learning brief injected into the Fundamental Analyst and Committee prompts the following morning. It also tracks each agent's directional accuracy over time and adjusts the composite weighting of Fundamental, Quant, and Sentiment signals accordingly.",
    feeds: "Fundamental Analyst, Investment Committee",
    color: "#6B7280",
    report_file: "pipeline_result.json",
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Extract a brief summary from a report for display
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSummary(report: any, agentId: string): { current_focus: string; market_view: string; recent_activity: string } {
  if (!report) return {
    current_focus: "Awaiting next pipeline run",
    market_view: "No data yet",
    recent_activity: "No report published to the dashboard yet",
  };

  switch (agentId) {
    case "macro":
      return {
        current_focus: `Regime: ${report.regime ?? "Unknown"} | ${(report.favoured_themes ?? []).slice(0, 2).join(", ") || "Scanning themes"}`,
        market_view: report.macro_summary?.slice(0, 120) ?? "No summary available",
        recent_activity: `Inflation: ${report.inflation_trend ?? "?"} | Rates: ${report.interest_rate_direction ?? "?"}`,
      };
    // Field names below are the ones each agent actually writes (see data/reports/*.json)
    case "sector": {
      const ranked = report.sector_rankings ?? [];
      const top = (report.top_sectors ?? []).map((t: Any) => (typeof t === "string" ? t : t?.sector ?? t?.name)).filter(Boolean);
      return {
        current_focus: top.length ? `Favouring: ${top.slice(0, 3).join(", ")}` : "Sector rotation and relative strength analysis",
        market_view: report.sector_summary?.slice(0, 120) ?? "No summary available",
        recent_activity: `${ranked.length} sectors ranked · ${(report.avoid_sectors ?? []).length} to avoid`,
      };
    }
    case "institutional":
      return {
        current_focus: "13F filings, analyst moves, unusual options, insider activity",
        market_view: report.institutional_summary?.slice(0, 120) ?? "No summary available",
        recent_activity: `${(report.institutional_buys ?? []).length} institutional buys · ${(report.analyst_upgrades ?? []).length} upgrades · ${(report.unusual_options_signals ?? []).length} options signals`,
      };
    case "news":
      return {
        current_focus: "Overnight catalysts, earnings, regulatory events",
        market_view: report.news_summary?.slice(0, 120) ?? "No summary available",
        recent_activity: `${(report.fresh_catalysts ?? []).length} fresh catalysts · ${(report.upcoming_events ?? []).length} upcoming events`,
      };
    case "candidate":
      return {
        current_focus: `${(report.candidates ?? []).length} candidates selected${report.mode ? ` (${report.mode} run)` : ""}`,
        market_view: report.selection_rationale?.slice(0, 120) ?? "Filtering opportunity universe",
        recent_activity: report.universe_size != null ? `Screened ${report.universe_size} tickers` : `${(report.candidates ?? []).length} candidates passed to analysts`,
      };
    case "fundamental":
      return {
        current_focus: "Revenue growth, margins, ROIC, balance sheet quality",
        market_view: report.macro_regime ? `Analysed under ${report.macro_regime} regime` : "Deep fundamental analysis",
        recent_activity: `${report.total_analysed ?? (report.fundamental_analyses ?? []).length} companies analysed`,
      };
    case "quant":
      return {
        current_focus: "RSI, momentum, support/resistance, trend confirmation",
        market_view: report.macro_regime ? `Analysed under ${report.macro_regime} regime` : "Technical signal analysis",
        recent_activity: `${report.total_analysed ?? (report.quant_analyses ?? []).length} tickers assessed`,
      };
    case "sentiment":
      return {
        current_focus: "Analyst consensus, short interest, news tone, positioning",
        market_view: report.macro_regime ? `Analysed under ${report.macro_regime} regime` : "Sentiment and positioning data",
        recent_activity: `${report.total_analysed ?? (report.sentiment_analyses ?? []).length} tickers scored`,
      };
    case "committee": {
      const a = report.actions_taken ?? {};
      const acted = ["enter", "increase", "decrease", "exit"].reduce((n, k) => n + (Number(a[k]) || 0), 0);
      return {
        current_focus: `${report.candidates_evaluated ?? "—"} candidates evaluated · ${report.candidates_debated ?? "—"} debated`,
        market_view: report.committee_narrative?.slice(0, 120) ?? "Committee deliberation complete",
        recent_activity: `${acted} trade decisions (${a.enter ?? 0} enter, ${a.increase ?? 0} increase, ${a.decrease ?? 0} decrease, ${a.exit ?? 0} exit) · ${a.hold ?? 0} holds`,
      };
    }
    case "executor": {
      const ex = [report.phase_a?.executor, report.phase_b?.executor].filter(Boolean);
      const trades = ex.flatMap((e: Any) => e.executed_trades ?? []);
      const errors = ex.reduce((n: number, e: Any) => n + (e.errors ?? []).length, 0);
      const skipped = ex.reduce((n: number, e: Any) => n + (e.skipped ?? []).length, 0);
      const tickers = trades.map((t: Any) => `${t.action} ${t.ticker}`).slice(0, 3).join(", ");
      return {
        current_focus: "Order routing, sizing, position reconciliation",
        market_view: trades.length ? `Last run: ${tickers}${trades.length > 3 ? "…" : ""}` : "No orders placed in the last run",
        recent_activity: `${trades.length} orders executed · ${skipped} skipped · ${errors} errors (${report.date ?? "last run"})`,
      };
    }
    case "memory": {
      const m = report.memory ?? {};
      return {
        current_focus: "Post-mortems on closed trades, learning brief, agent weights",
        market_view: m.agent_weights?.closed_trade_count != null
          ? `Agent weights based on ${m.agent_weights.closed_trade_count} closed trades`
          : "Consolidating learnings from closed trades",
        recent_activity: `${m.total_completed_trades ?? 0} post-mortems completed (${report.date ?? "last run"})`,
      };
    }
    default:
      return {
        current_focus: "Active",
        market_view: "No data",
        recent_activity: "Awaiting run",
      };
  }
}

export async function GET() {
  const reportsDir = getReportsDir();

  const agents = AGENT_PROFILES.map((profile) => {
    let report = null;
    if (profile.report_file) {
      try {
        const filePath = path.join(reportsDir, profile.report_file);
        if (fs.existsSync(filePath)) {
          report = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
      } catch {
        // report unavailable
      }
    }

    const { current_focus, market_view, recent_activity } = extractSummary(report, profile.id);

    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      number: profile.number,
      personality: profile.personality,
      color: profile.color,
      feeds: profile.feeds ?? null,
      current_focus,
      market_view,
      recent_activity,
      has_live_data: report !== null,
      generated_at: report?.generated_at ?? null,
    };
  });

  return NextResponse.json(agents);
}
