import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { MOCK_AGENTS } from "@/lib/mock-data";
import { reportsDir as getReportsDir } from "@/lib/data-path";

export async function GET() {
  const reportsDir = getReportsDir();
  const agentData = [...MOCK_AGENTS];

  try {
    if (fs.existsSync(reportsDir)) {
      const agentFiles = fs.readdirSync(reportsDir)
        .filter((f) => f.endsWith("_report.json") || f.startsWith("agent_"));

      for (const file of agentFiles) {
        try {
          const content = JSON.parse(
            fs.readFileSync(path.join(reportsDir, file), "utf-8")
          );
          // Merge live data into mock agents where available
          const idx = agentData.findIndex((a) => a.id === content.agent_id);
          if (idx >= 0 && content.current_focus) {
            agentData[idx] = { ...agentData[idx], ...content };
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // use mock
  }

  return NextResponse.json(agentData);
}
