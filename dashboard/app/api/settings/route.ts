import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const CONFIG_PATH = path.join(process.cwd(), "..", "data", "config", "analysis_mode.json");

function ensureDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function GET() {
  try {
    ensureDir();
    if (!fs.existsSync(CONFIG_PATH)) {
      return NextResponse.json({ mode: "Lite" });
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ mode: "Lite" });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = String(body.mode || "Lite");
    if (!["Lite", "Standard", "Full"].includes(mode)) {
      return NextResponse.json({ error: "Invalid mode. Use Lite, Standard, or Full." }, { status: 400 });
    }
    ensureDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mode, updated_at: new Date().toISOString() }, null, 2));
    return NextResponse.json({ ok: true, mode });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
