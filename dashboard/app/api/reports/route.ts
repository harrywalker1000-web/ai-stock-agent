import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

/**
 * Daily reports, newest first, paginated: ?limit=20&offset=0 →
 * { reports, total, offset, has_more }. (Loading all ~150 files — 4+ MB — on every
 * visit was the old behaviour; only the requested page is read and parsed now.)
 */
export async function GET(req: NextRequest) {
  const reportsDir = fs.existsSync(path.join(process.cwd(), "data", "reports"))
    ? path.join(process.cwd(), "data", "reports")
    : path.join(process.cwd(), "..", "data", "reports");

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0) || 0);

  let files: string[] = [];
  try {
    if (fs.existsSync(reportsDir)) {
      // daily_report_YYYY-MM-DD.json — ISO dates, so string order is chronological
      files = fs.readdirSync(reportsDir)
        .filter((f) => /^daily_report_\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
        .reverse();
    }
  } catch {
    return NextResponse.json({ error: "Could not read reports directory" }, { status: 500 });
  }

  const reports: unknown[] = [];
  for (const file of files.slice(offset, offset + limit)) {
    try {
      reports.push(JSON.parse(fs.readFileSync(path.join(reportsDir, file), "utf-8")));
    } catch {
      // skip malformed files
    }
  }

  return NextResponse.json({
    reports,
    total: files.length,
    offset,
    has_more: offset + limit < files.length,
  });
}
