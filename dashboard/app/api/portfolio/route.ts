import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  MOCK_POSITIONS,
  MOCK_PORTFOLIO_STATS,
  MOCK_PORTFOLIO_HISTORY,
  MOCK_SECTOR_ALLOCATION,
} from "@/lib/mock-data";
import { dataDir } from "@/lib/data-path";

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

export async function GET() {
  const resolvedDataDir = dataDir();
  const reportsDir = path.join(resolvedDataDir, "reports");

  const positionsLog   = readJson(path.join(resolvedDataDir, "memory", "positions_log.json"));
  const committeeReport = readJson(path.join(reportsDir, "committee_report.json"));
  const portfolioState = readJson(path.join(reportsDir, "portfolio_state.json"));

  // Derive positions: prefer positions_log → committee decisions → mock
  let positions;
  if (positionsLog && Object.keys(positionsLog).length > 0) {
    // Normalise real positions_log entries into dashboard shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    positions = Object.values(positionsLog).map((p: any) => ({
      ticker:        p.ticker ?? "—",
      company:       p.company ?? p.ticker ?? "—",
      sector:        p.sector ?? "—",
      direction:     (p.direction ?? "long").toLowerCase(),
      entry_price:   p.entry_price ?? 0,
      current_price: p.current_price ?? p.entry_price ?? 0,
      pct_change:    p.pct_change ?? 0,
      pnl_absolute:  p.pnl_absolute ?? 0,
      position_size: p.position_size ?? 0,
      pct_portfolio: p.size_pct ?? p.pct_portfolio ?? 0,
      entry_date:    p.entry_date ?? "—",
      conviction:    p.conviction ?? 70,
      status:        p.status ?? "open",
      setup_type:    p.setup_type ?? "Pipeline",
      expected_roi:  p.expected_roi ?? "—",
    }));
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeCount = positions.filter((p: any) => p.status === "open" || p.status === "hold").length;
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
        active_positions:   activeCount,
        pipeline_status:    "success",
        pipeline_last_run:  committeeReport?.generated_at ?? "—",
      }
    : { ...MOCK_PORTFOLIO_STATS, active_positions: activeCount };

  return NextResponse.json({
    positions,
    stats,
    history:  MOCK_PORTFOLIO_HISTORY,
    sectors:  MOCK_SECTOR_ALLOCATION,
    _source:  positionsLog ? "positions_log" : committeeReport ? "committee_decisions" : "mock",
  });
}
