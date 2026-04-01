import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { memoryDir } from "@/lib/data-path";

export const dynamic = "force-dynamic";

export async function GET() {
  const weightsPath = path.join(memoryDir(), "agent_weights.json");

  try {
    const raw = fs.readFileSync(weightsPath, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    // Return default weights if file not found
    return NextResponse.json({
      fundamental: 0.35,
      quant: 0.35,
      sentiment: 0.30,
      active: false,
      closed_trade_count: 0,
    });
  }
}
