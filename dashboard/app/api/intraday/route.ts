import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function GET() {
  const reportsDir = path.join(process.cwd(), "data", "reports");
  const filePath = path.join(reportsDir, "intraday_alerts.json");

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ run_at: null, alerts: [], stops_triggered: 0, soft_alerts: 0, portfolio_alerts: 0 });
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ run_at: null, alerts: [], stops_triggered: 0, soft_alerts: 0, portfolio_alerts: 0 });
  }
}
