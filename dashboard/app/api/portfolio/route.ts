import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  MOCK_POSITIONS,
  MOCK_PORTFOLIO_STATS,
  MOCK_PORTFOLIO_HISTORY,
  MOCK_SECTOR_ALLOCATION,
} from "@/lib/mock-data";

function readJson(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
        return parsed;
      }
    }
  } catch { /* fall through */ }
  return null;
}

function resolveDataDir(): string {
  // Try dashboard/data/ (Vercel production & local after sync)
  const local = path.join(process.cwd(), "data");
  if (fs.existsSync(path.join(local, "reports"))) return local;
  // Fallback: parent data/ (local dev without sync)
  return path.join(process.cwd(), "..", "data");
}

export async function GET() {
  const dataDir = resolveDataDir();
  const reportsDir = path.join(dataDir, "reports");

  const positionsLog   = readJson(path.join(dataDir, "memory", "positions_log.json"));
  const committeeReport = readJson(path.join(reportsDir, "committee_report.json"));
  const portfolioState = readJson(path.join(reportsDir, "portfolio_state.json"));

  // Derive positions: prefer positions_log → committee decisions → mock
  let positions;
  if (positionsLog && Object.keys(positionsLog).length > 0) {
    positions = Object.values(positionsLog);
  } else if (committeeReport?.position_decisions?.length > 0) {
    // Build positions list from committee decisions (what the pipeline decided to do)
    const decisionDate = committeeReport.generated_at?.split(" ")[0] ?? new Date().toISOString().split("T")[0];
    positions = committeeReport.position_decisions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((d: any) => d.action?.includes("long") || d.action?.includes("short"))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((d: any) => {
        // Try to overlay with mock price data for display
        const mock = MOCK_POSITIONS.find((m) => m.ticker === d.ticker);
        return {
          ticker:        d.ticker,
          company:       mock?.company ?? d.ticker,
          sector:        mock?.sector ?? "—",
          direction:     d.action?.includes("short") ? "short" : "long",
          entry_price:   mock?.entry_price ?? 0,
          current_price: mock?.current_price ?? 0,
          pct_change:    mock?.pct_change ?? 0,
          pnl_absolute:  mock?.pnl_absolute ?? 0,
          position_size: mock?.position_size ?? (d.size_pct ? d.size_pct * 1000 : 0),
          pct_portfolio: d.size_pct ?? mock?.pct_portfolio ?? 0,
          entry_date:    decisionDate,
          conviction:    d.conviction ?? 70,
          status:        "hold",
          setup_type:    mock?.setup_type ?? "Pipeline",
          expected_roi:  d.target_price ? `Target: $${d.target_price}` : mock?.expected_roi ?? "—",
        };
      });
  } else {
    positions = MOCK_POSITIONS;
  }

  const stats   = portfolioState?.portfolio_value
    ? {
        total_value:        portfolioState.portfolio_value,
        cash:               portfolioState.cash,
        deployed:           portfolioState.equity - portfolioState.cash,
        deployed_pct:       portfolioState.equity > 0 ? ((portfolioState.equity - portfolioState.cash) / portfolioState.equity) * 100 : 0,
        total_pnl_pct:      MOCK_PORTFOLIO_STATS.total_pnl_pct,
        total_pnl_absolute: MOCK_PORTFOLIO_STATS.total_pnl_absolute,
        daily_pnl_pct:      MOCK_PORTFOLIO_STATS.daily_pnl_pct,
        daily_pnl_absolute: MOCK_PORTFOLIO_STATS.daily_pnl_absolute,
      }
    : MOCK_PORTFOLIO_STATS;

  return NextResponse.json({
    positions,
    stats,
    history:  MOCK_PORTFOLIO_HISTORY,
    sectors:  MOCK_SECTOR_ALLOCATION,
    _source:  positionsLog ? "positions_log" : committeeReport ? "committee_decisions" : "mock",
  });
}
