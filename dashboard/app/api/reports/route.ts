import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { MOCK_DAILY_REPORTS } from "@/lib/mock-data";

export async function GET() {
  // On Vercel: process.cwd() = /var/task (dashboard root), data/ is bundled inside it
  // Locally without sync: fall back to ../data/reports
  const reportsDir = fs.existsSync(path.join(process.cwd(), "data", "reports"))
    ? path.join(process.cwd(), "data", "reports")
    : path.join(process.cwd(), "..", "data", "reports");
  const reports: unknown[] = [];

  try {
    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir)
        .filter((f) => f.startsWith("daily_report_") && f.endsWith(".json"))
        .sort()
        .reverse();

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(reportsDir, file), "utf-8");
          reports.push(JSON.parse(content));
        } catch {
          // skip malformed files
        }
      }
    }
  } catch {
    // fall through to mock
  }

  return NextResponse.json(reports.length > 0 ? reports : MOCK_DAILY_REPORTS);
}
