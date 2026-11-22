import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getRepoFile } from "@/lib/github";
import { nyDate } from "@/lib/splits";

export const dynamic = "force-dynamic";

const REPO_PATH = "dashboard/data/reports/intraday_alerts.json";
const EMPTY = { run_at: null, alerts: [], stops_triggered: 0, soft_alerts: 0, portfolio_alerts: 0 };

/**
 * Intraday monitor alerts. The monitor commits its log every 30 min during market hours
 * without triggering a redeploy, so read the repo copy first (fresh), then the bundled
 * copy. Alerts from a previous session are not shown as current.
 */
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  try {
    const f = await getRepoFile(REPO_PATH);
    if (f) data = JSON.parse(f.content);
  } catch { /* fall through to bundled copy */ }
  if (!data) {
    try {
      const local = path.join(process.cwd(), "data", "reports", "intraday_alerts.json");
      if (fs.existsSync(local)) data = JSON.parse(fs.readFileSync(local, "utf-8"));
    } catch { /* ignore */ }
  }
  if (!data) return NextResponse.json(EMPTY);

  const runDate = data.run_at ? nyDate(new Date(data.run_at)) : null;
  if (runDate !== nyDate()) {
    return NextResponse.json({ ...EMPTY, last_run_at: data.run_at ?? null, note: "No monitor run yet today" });
  }
  return NextResponse.json(data);
}
