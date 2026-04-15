import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { reportsDir as getReportsDir } from "@/lib/data-path";

const REPORT_FILES: Record<string, string | null> = {
  macro:         "macro_report.json",
  sector:        "sector_report.json",
  institutional: "institutional_report.json",
  news:          "news_report.json",
  candidate:     "candidates_report.json",
  fundamental:   "fundamental_report.json",
  quant:         "quant_report.json",
  sentiment:     "sentiment_report.json",
  committee:     "committee_report.json",
  executor:      null,
  memory:        null,
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const agentId = params.id;
  const reportFile = REPORT_FILES[agentId];

  if (!reportFile) {
    return NextResponse.json({ error: "No report file for this agent", agentId }, { status: 404 });
  }

  try {
    const filePath = path.join(getReportsDir(), reportFile);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Report not yet generated", agentId }, { status: 404 });
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Failed to read report" }, { status: 500 });
  }
}
