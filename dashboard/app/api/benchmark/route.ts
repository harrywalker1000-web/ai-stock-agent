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
  // Try dashboard/data/memory/ first (committed after sync_reports.py)
  const memDir = path.join(process.cwd(), "data", "memory");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const benchmark: any = readJson(path.join(memDir, "benchmark_history.json"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navHistory: any = readJson(path.join(memDir, "nav_history.json"));

  if (!benchmark) {
    return NextResponse.json({
      error: "No benchmark data yet — pipeline has not run with tracking enabled",
      daily_series: [],
      periods: {},
    });
  }

  // Attach nav_points count from nav_history if benchmark lacks it
  if (navHistory && Array.isArray(navHistory) && !benchmark.nav_points) {
    benchmark.nav_points = navHistory.length;
  }

  return NextResponse.json(benchmark);
}
