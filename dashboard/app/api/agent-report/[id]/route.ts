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
  executor:      "pipeline_result.json",
  memory:        "pipeline_result.json",
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
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    // Executor and Memory have no report of their own — serve their slice of the run result
    if (agentId === "executor") {
      const ex = [data.phase_a?.executor, data.phase_b?.executor].filter(Boolean);
      return NextResponse.json({
        generated_at: data.date ?? null,
        executed_trades: ex.flatMap((e: Record<string, unknown[]>) => e.executed_trades ?? []),
        skipped: ex.flatMap((e: Record<string, unknown[]>) => e.skipped ?? []),
        errors: ex.flatMap((e: Record<string, unknown[]>) => e.errors ?? []),
        not_executed: data.briefing?.not_executed ?? [],
      });
    }
    if (agentId === "memory") {
      return NextResponse.json({ generated_at: data.date ?? null, ...(data.memory ?? {}) });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to read report" }, { status: 500 });
  }
}
