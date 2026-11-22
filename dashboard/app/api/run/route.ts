import { NextRequest, NextResponse } from "next/server";
import { dispatchWorkflow, latestRuns } from "@/lib/github";

export const dynamic = "force-dynamic";

/**
 * Run the real pipeline on GitHub Actions (the same workflow the daily cron uses).
 * Vercel can't run Python, and a 30-45 min run can't live inside one HTTP request,
 * so POST queues it and GET reports the latest run's status for the dashboard to poll.
 */

const WORKFLOW = "daily_run.yml";

export async function GET() {
  try {
    const [run] = await latestRuns(WORKFLOW, 1);
    return NextResponse.json({ run: run ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? "");
  if (!["review", "full"].includes(type)) {
    return NextResponse.json({ error: "Invalid type. Use 'review' or 'full'." }, { status: 400 });
  }

  try {
    // Never stack two pipeline runs — they would both trade off the same portfolio state
    const runs = await latestRuns(WORKFLOW, 5);
    const active = runs.find((r) => r.status === "in_progress" || r.status === "queued" || r.status === "waiting");
    if (active) {
      return NextResponse.json(
        { error: "A pipeline run is already in progress", run: active },
        { status: 409 },
      );
    }
    await dispatchWorkflow(WORKFLOW, {
      start_at_et: "",                                  // start now
      phase_a_only: type === "review" ? "true" : "false",
    });
    return NextResponse.json({ queued: true, type });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
