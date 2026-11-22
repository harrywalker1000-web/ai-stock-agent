import { NextRequest, NextResponse } from "next/server";
import { getRepoFile, putRepoFile } from "@/lib/github";

export const dynamic = "force-dynamic";

/**
 * Settings live in the repo at data/config/analysis_mode.json — the exact file
 * agents/portfolio_manager.py reads on GitHub Actions. Vercel's disk is read-only and
 * isn't what the pipeline sees, so reads and writes go through the GitHub API.
 */

const CONFIG_REPO_PATH = "data/config/analysis_mode.json";
const MODES = ["Lite", "Standard", "Full", "Auto"] as const;

type Limits = { analyze: number; debate: number; contested: number };

const DEFAULT_LIMITS: Record<string, Limits> = {
  Lite:     { analyze: 15, debate: 10, contested: 5  },
  Standard: { analyze: 25, debate: 20, contested: 8  },
  Full:     { analyze: 50, debate: 40, contested: 15 },
  Auto:     { analyze: 30, debate: 25, contested: 10 },
};

function withLimits(raw: Record<string, unknown>) {
  const candidate_limits: Record<string, Limits> = {};
  for (const m of MODES) {
    const saved = raw[`limits_${m}`] as Partial<Limits> | undefined;
    candidate_limits[m] = {
      analyze:   saved?.analyze   ?? DEFAULT_LIMITS[m].analyze,
      debate:    saved?.debate    ?? DEFAULT_LIMITS[m].debate,
      contested: saved?.contested ?? DEFAULT_LIMITS[m].contested,
    };
  }
  // Pipeline falls back to "Auto" when the file has no mode
  return { mode: "Auto", ...raw, candidate_limits };
}

export async function GET() {
  try {
    const file = await getRepoFile(CONFIG_REPO_PATH);
    const raw = file ? JSON.parse(file.content) : {};
    return NextResponse.json({ ...withLimits(raw), _source: file ? "repo" : "default" });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read saved settings: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const file = await getRepoFile(CONFIG_REPO_PATH);
    const existing: Record<string, unknown> = file ? JSON.parse(file.content) : {};

    if (body.mode !== undefined) {
      const mode = String(body.mode);
      if (!(MODES as readonly string[]).includes(mode)) {
        return NextResponse.json({ error: "Invalid mode. Use Auto, Lite, Standard, or Full." }, { status: 400 });
      }
      existing.mode = mode;
    }

    if (body.candidate_limits !== undefined) {
      const cl = body.candidate_limits as Record<string, Partial<Limits>>;
      for (const [m, v] of Object.entries(cl ?? {})) {
        if (!(MODES as readonly string[]).includes(m)) continue;
        const a = Number(v?.analyze), d = Number(v?.debate), c = Number(v?.contested);
        if (![a, d, c].every((n) => Number.isFinite(n))) {
          return NextResponse.json({ error: `Limits for ${m} must be numbers` }, { status: 400 });
        }
        const analyze   = Math.max(1, Math.min(200, Math.round(a)));
        const debate    = Math.max(1, Math.min(analyze, Math.round(d)));
        const contested = Math.max(1, Math.min(debate, Math.round(c)));
        existing[`limits_${m}`] = { analyze, debate, contested };
      }
    }

    existing.updated_at = new Date().toISOString();
    await putRepoFile(
      CONFIG_REPO_PATH,
      JSON.stringify(existing, null, 2) + "\n",
      `chore(settings): update analysis config from dashboard (mode=${existing.mode ?? "Auto"})`,
      file?.sha,
    );
    return NextResponse.json({ ok: true, ...withLimits(existing) });
  } catch (e) {
    return NextResponse.json(
      { error: `Save failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
