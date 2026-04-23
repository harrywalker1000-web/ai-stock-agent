import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { configDir } from "@/lib/data-path";

export const dynamic = "force-dynamic";

const CONFIG_PATH = path.join(configDir(), "analysis_mode.json");

function ensureDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function GET() {
  try {
    ensureDir();
    if (!fs.existsSync(CONFIG_PATH)) {
      return NextResponse.json({ mode: "Auto", candidate_limits: DEFAULT_LIMITS });
    }
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    // Reconstruct candidate_limits from flat keys for convenience
    const candidate_limits: Record<string, { analyze: number; debate: number }> = {};
    for (const m of ["Lite", "Standard", "Full", "Auto"]) {
      candidate_limits[m] = (raw[`limits_${m}`] as { analyze: number; debate: number }) ?? DEFAULT_LIMITS[m];
    }
    return NextResponse.json({ ...raw, candidate_limits });
  } catch {
    return NextResponse.json({ mode: "Auto", candidate_limits: DEFAULT_LIMITS });
  }
}

const DEFAULT_LIMITS: Record<string, { analyze: number; debate: number }> = {
  Lite:     { analyze: 15, debate: 10 },
  Standard: { analyze: 25, debate: 20 },
  Full:     { analyze: 50, debate: 40 },
  Auto:     { analyze: 30, debate: 25 },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    ensureDir();
    // Read existing config so we only overwrite what's provided
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(CONFIG_PATH)) {
      try { existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch { /* ignore */ }
    }

    if (body.mode !== undefined) {
      const mode = String(body.mode);
      if (!["Lite", "Standard", "Full", "Auto"].includes(mode)) {
        return NextResponse.json({ error: "Invalid mode. Use Auto, Lite, Standard, or Full." }, { status: 400 });
      }
      existing.mode = mode;
    }

    if (body.candidate_limits !== undefined) {
      const cl = body.candidate_limits as Record<string, { analyze: number; debate: number }>;
      for (const [m, v] of Object.entries(cl)) {
        if (!["Lite", "Standard", "Full", "Auto"].includes(m)) continue;
        const analyze = Math.max(1, Math.min(200, Math.round(Number(v.analyze))));
        const debate = Math.max(1, Math.min(analyze, Math.round(Number(v.debate))));
        (existing as Record<string, unknown>)[`limits_${m}`] = { analyze, debate };
      }
    }

    existing.updated_at = new Date().toISOString();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2));
    return NextResponse.json({ ok: true, ...existing });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
