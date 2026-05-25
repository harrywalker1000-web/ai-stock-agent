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
    const candidate_limits: Record<string, { analyze: number; debate: number; contested: number }> = {};
    for (const m of ["Lite", "Standard", "Full", "Auto"]) {
      const saved = raw[`limits_${m}`] as { analyze: number; debate: number; contested?: number } | undefined;
      candidate_limits[m] = {
        analyze:   saved?.analyze   ?? DEFAULT_LIMITS[m].analyze,
        debate:    saved?.debate    ?? DEFAULT_LIMITS[m].debate,
        contested: saved?.contested ?? DEFAULT_LIMITS[m].contested,
      };
    }
    return NextResponse.json({ ...raw, candidate_limits });
  } catch {
    return NextResponse.json({ mode: "Auto", candidate_limits: DEFAULT_LIMITS });
  }
}

const DEFAULT_LIMITS: Record<string, { analyze: number; debate: number; contested: number }> = {
  Lite:     { analyze: 15, debate: 10, contested: 5  },
  Standard: { analyze: 25, debate: 20, contested: 8  },
  Full:     { analyze: 50, debate: 40, contested: 15 },
  Auto:     { analyze: 30, debate: 25, contested: 10 },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    ensureDir();
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
      const cl = body.candidate_limits as Record<string, { analyze: number; debate: number; contested: number }>;
      for (const [m, v] of Object.entries(cl)) {
        if (!["Lite", "Standard", "Full", "Auto"].includes(m)) continue;
        const analyze   = Math.max(1, Math.min(200, Math.round(Number(v.analyze))));
        const debate    = Math.max(1, Math.min(analyze, Math.round(Number(v.debate))));
        const contested = Math.max(1, Math.min(debate, Math.round(Number(v.contested))));
        (existing as Record<string, unknown>)[`limits_${m}`] = { analyze, debate, contested };
      }
    }

    existing.updated_at = new Date().toISOString();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2));
    return NextResponse.json({ ok: true, ...existing });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
