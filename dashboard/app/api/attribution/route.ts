import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

function readJson(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const memDir = path.join(process.cwd(), "data", "memory");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary: any = readJson(path.join(memDir, "agent_accuracy_summary.json"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log: any[] = (readJson(path.join(memDir, "attribution_log.json")) as any[]) ?? [];

  if (!summary) {
    return NextResponse.json({
      total_closed_trades: 0,
      win_rate_pct: null,
      avg_pnl_pct: null,
      avg_alpha_vs_spy: null,
      agents: {},
      recent_trades: [],
    });
  }

  // Return most recent 10 closed trades for the dashboard table
  const recent = [...log]
    .sort((a, b) => (b.exit_date ?? "").localeCompare(a.exit_date ?? ""))
    .slice(0, 10)
    .map((r) => ({
      ticker:          r.ticker,
      direction:       r.direction,
      entry_date:      r.entry_date,
      exit_date:       r.exit_date,
      pnl_pct:         r.pnl_pct,
      alpha_vs_spy:    r.alpha_vs_spy,
      alpha_vs_sector: r.alpha_vs_sector,
      sector:          r.sector,
      exit_reason:     r.exit_reason,
    }));

  return NextResponse.json({
    ...summary,
    recent_trades: recent,
  });
}
