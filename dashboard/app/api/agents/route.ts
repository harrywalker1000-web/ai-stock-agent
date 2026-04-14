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
    personality: "If the macro is wrong, everything else is noise.",
    color: "#0EA5E9",
    report_file: "macro_report.json",
  },
  {
    id: "sector",
    name: "Sector Analyst",
    role: "Sector Rotation",
    number: 2,
    personality: "The tide lifts all boats — or sinks them. Know which way it's flowing.",
    color: "#10B981",
    report_file: "sector_report.json",
  },
  {
    id: "institutional",
    name: "Institutional Tracker",
    role: "Smart Money Flow",
    number: 3,
    personality: "Follow the whales, not the headlines.",
    color: "#8B5CF6",
    report_file: "institutional_report.json",
  },
  {
    id: "news",
    name: "News Agent",
    role: "Catalysts & Events",
    number: 4,
    personality: "Markets move on narrative. I read every word so the others don't have to.",
    color: "#F59E0B",
    report_file: "news_report.json",
  },
  {
    id: "candidate",
    name: "Candidate Generator",
    role: "Opportunity Filter",
    number: 5,
    personality: "Most trades aren't worth taking. My job is to find the ones that are.",
    color: "#06B6D4",
    report_file: "candidates_report.json",
  },
  {
    id: "fundamental",
    name: "Fundamental Analyst",
    role: "Business Quality",
    number: 6,
    personality: "The price is what you pay. The business is what you get.",
    color: "#10B981",
    report_file: "fundamental_report.json",
  },
  {
    id: "quant",
    name: "Quant Agent",
    role: "Technical & Signals",
    number: 7,
    personality: "Price tells a story. Momentum, RSI, structure — the story is always there.",
    color: "#0EA5E9",
    report_file: "quant_report.json",
  },
  {
    id: "sentiment",
    name: "Sentiment Agent",
    role: "Market Psychology",
    number: 8,
    personality: "When everyone's bullish, I get cautious. When everyone's scared, I get interested.",
    color: "#8B5CF6",
    report_file: "sentiment_report.json",
  },
  {
    id: "committee",
    name: "Investment Committee",
    role: "Final Arbitration",
    number: 9,
    personality: "We debate, we challenge, we decide. No position enters the book without consensus.",
    color: "#F5A623",
    report_file: "committee_report.json",
  },
  {
    id: "executor",
    name: "Trade Executor",
    role: "Order Execution",
    number: 10,
    personality: "A good decision executed badly is still a bad trade. Precision is everything.",
    color: "#EF4444",
    report_file: null,
  },
  {
    id: "memory",
    name: "Memory Agent",
    role: "Learning & Context",
    number: 11,
    personality: "We learn from every trade. The mistakes of yesterday are the edge of tomorrow.",
    color: "#6B7280",
    report_file: null,
  },
];

// Extract a brief summary from a report for display
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSummary(report: any, agentId: string): { current_focus: string; market_view: string; recent_activity: string } {
  if (!report) return {
    current_focus: "Awaiting next pipeline run",
    market_view: "No data yet",
    recent_activity: "Pipeline has not run today",
  };

  switch (agentId) {
    case "macro":
      return {
        current_focus: `Regime: ${report.regime ?? "Unknown"} | ${(report.favoured_themes ?? []).slice(0, 2).join(", ") || "Scanning themes"}`,
        market_view: report.macro_summary?.slice(0, 120) ?? "No summary available",
        recent_activity: `Inflation: ${report.inflation_trend ?? "?"} | Rates: ${report.interest_rate_direction ?? "?"}`,
      };
    case "sector":
      return {
        current_focus: "Sector rotation and relative strength analysis",
        market_view: report.sector_summary?.slice(0, 120) ?? report.summary?.slice(0, 120) ?? "Analysing sector flows",
        recent_activity: `${Object.keys(report.sectors ?? report.sector_scores ?? {}).length} sectors evaluated`,
      };
    case "institutional":
      return {
        current_focus: "13F filings, dark pool flow, smart money positioning",
        market_view: report.summary?.slice(0, 120) ?? "Tracking institutional activity",
        recent_activity: `${(report.top_holdings ?? report.stocks ?? []).length} holdings analysed`,
      };
    case "news":
      return {
        current_focus: "Overnight catalysts, earnings, regulatory events",
        market_view: report.market_summary?.slice(0, 120) ?? report.summary?.slice(0, 120) ?? "Scanning news flow",
        recent_activity: `${(report.articles ?? report.news_items ?? []).length} articles processed`,
      };
    case "candidate":
      return {
        current_focus: `${(report.candidates ?? []).length} candidates selected from universe scan`,
        market_view: report.selection_rationale?.slice(0, 120) ?? "Filtering opportunity universe",
        recent_activity: `Screened ${report.universe_size ?? "—"} tickers`,
      };
    case "fundamental":
      return {
        current_focus: "Revenue growth, margins, ROIC, balance sheet quality",
        market_view: report.summary?.slice(0, 120) ?? "Deep fundamental analysis",
        recent_activity: `${(report.scored_tickers ?? report.analyses ?? []).length} companies analysed`,
      };
    case "quant":
      return {
        current_focus: "RSI, momentum, support/resistance, trend confirmation",
        market_view: report.summary?.slice(0, 120) ?? "Technical signal analysis",
        recent_activity: `${(report.signals ?? report.scored_tickers ?? []).length} tickers assessed`,
      };
    case "sentiment":
      return {
        current_focus: "Options flow, short interest, retail vs institutional positioning",
        market_view: report.summary?.slice(0, 120) ?? "Sentiment and positioning data",
        recent_activity: `${(report.scored_tickers ?? []).length} tickers scored`,
      };
    case "committee":
      return {
        current_focus: "Multi-agent deliberation and final position decisions",
        market_view: report.committee_narrative?.slice(0, 120) ?? "Committee deliberation complete",
        recent_activity: `${(report.position_decisions ?? []).filter((d: { action?: string }) => d.action && !["skip", "hold"].includes(d.action)).length} decisions executed`,
      };
    case "executor":
      return {
        current_focus: "Order routing, stop placement, position reconciliation",
        market_view: "Executing committee decisions via Alpaca API",
        recent_activity: "Live order management active",
      };
    case "memory":
      return {
        current_focus: "Post-mortem analysis, learning brief, pattern tracking",
        market_view: "Consolidating learnings from closed trades",
        recent_activity: "Memory and attribution log updated",
      };
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
      accuracy: 0,  // real accuracy comes from /api/attribution — left at 0 until trades close
      current_focus,
      market_view,
      recent_activity,
      has_live_data: report !== null,
      generated_at: report?.generated_at ?? null,
    };
  });

  return NextResponse.json(agents);
}
