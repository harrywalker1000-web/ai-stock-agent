import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { reportsDir as getReportsDir } from "@/lib/data-path";

export async function GET() {
  const reportsDir = getReportsDir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentData: any[] = [];

  try {
    if (fs.existsSync(reportsDir)) {
      const agentFiles = fs.readdirSync(reportsDir)
        .filter((f) => f.endsWith("_report.json") || f.startsWith("agent_"));

      for (const file of agentFiles) {
        try {
          const content = JSON.parse(
            fs.readFileSync(path.join(reportsDir, file), "utf-8")
          );
          if (content.agent_id) agentData.push(content);
        } catch {
          // skip
        }
      }
    }
  } catch {
    // no agent data available
  }

  return NextResponse.json(agentData);
}
