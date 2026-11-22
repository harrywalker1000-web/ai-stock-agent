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

const AGENTS = ["fundamental", "quant", "sentiment", "macro"];

/**
 * Signal attribution — every figure is computed here from attribution_log.json (one
 * row per attributed closed trade), so the headline stats always match the trade list.
 * (agent_accuracy_summary.json is a cached rollup the pipeline stopped refreshing.)
 */
export async function GET() {
  const memDir = path.join(process.cwd(), "data", "memory");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log: any[] = ((readJson(path.join(memDir, "attribution_log.json")) as any[]) ?? []).filter(
    (r) => r && typeof r.pnl_pct === "number",
  );

  const n = log.length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const round = (x: number | null, dp = 2) => (x == null ? null : Math.round(x * 10 ** dp) / 10 ** dp);

  const agents: Record<string, {
    total_trades: number; correct_direction: number; wrong_direction: number; neutral_calls: number;
    directional_accuracy_pct: number | null;
  }> = {};
  for (const a of AGENTS) {
    let correct = 0, wrong = 0, neutral = 0, total = 0;
    for (const r of log) {
      const acc = r.agent_accuracy?.[a];
      if (!acc) continue;
      total++;
      if (acc.correct === true) correct++;
      else if (acc.correct === false) wrong++;
      else neutral++;
    }
    if (total > 0) {
      agents[a] = {
        total_trades: total, correct_direction: correct, wrong_direction: wrong, neutral_calls: neutral,
        directional_accuracy_pct: correct + wrong > 0 ? round((correct / (correct + wrong)) * 100, 1) : null,
      };
    }
  }

  const alphas = log.map((r) => r.alpha_vs_spy).filter((x): x is number => typeof x === "number");
  const recent = [...log]
    .sort((a, b) => (b.exit_date ?? "").localeCompare(a.exit_date ?? ""))
    .slice(0, 10)
    .map((r) => ({
      ticker:          r.ticker,
      direction:       r.direction,
      entry_date:      r.entry_date,
      exit_date:       r.exit_date,
      pnl_pct:         r.pnl_pct,
      alpha_vs_spy:    r.alpha_vs_spy ?? null,
      alpha_vs_sector: r.alpha_vs_sector ?? null,
      sector:          r.sector ?? null,
      exit_reason:     r.exit_reason,
    }));

  return NextResponse.json({
    total_closed_trades: n,
    win_rate_pct: n ? round((log.filter((r) => r.pnl_pct > 0).length / n) * 100, 1) : null,
    avg_pnl_pct: round(avg(log.map((r) => r.pnl_pct))),
    avg_alpha_vs_spy: round(avg(alphas)),
    agents,
    recent_trades: recent,
    last_attributed: log.map((r) => r.attributed_at ?? r.exit_date).filter(Boolean).sort().pop() ?? null,
  });
}
