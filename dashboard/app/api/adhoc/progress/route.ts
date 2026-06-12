import { NextRequest, NextResponse } from "next/server";

const REPO = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";
const WORKFLOW = "adhoc_report.yml";

// 6 real steps that actually exist in the workflow (no sync step)
type StepKey = "checkout" | "python" | "install" | "analysis" | "commit" | "deploy";

function classifyStep(rawName: string): StepKey | null {
  const n = rawName.toLowerCase();
  if (n.includes("checkout")) return "checkout";
  if (n.includes("set up python") || n.includes("setup python")) return "python";
  if (n.includes("install")) return "install";
  if (n.includes("run") || n.includes("adhoc") || n.includes("ad-hoc") || n.includes("analysis") || n.includes("report")) return "analysis";
  if (n.includes("commit")) return "commit";
  if (n.includes("deploy")) return "deploy";
  return null;
}

const ALL_STEPS: StepKey[] = ["checkout", "python", "install", "analysis", "commit", "deploy"];

export async function GET(req: NextRequest) {
  const ticker   = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const queuedAt = req.nextUrl.searchParams.get("queuedAt");
  const token    = process.env.GITHUB_DISPATCH_TOKEN;

  if (!ticker || !token) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  try {
    const runsRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    if (!runsRes.ok) return NextResponse.json({ error: "github api error" }, { status: 502 });

    const runsData = await runsRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runs: any[] = runsData.workflow_runs ?? [];

    const cutoff = queuedAt ? parseInt(queuedAt) - 30_000 : Date.now() - 15 * 60_000;
    const run = runs.find((r) => {
      const createdMs = new Date(r.created_at).getTime();
      if (createdMs < cutoff) return false;
      const title = (r.display_title ?? r.name ?? "").toUpperCase();
      return title.includes(ticker) || createdMs > cutoff;
    });

    if (!run) {
      return NextResponse.json({ status: "queued", steps: {}, pct: 0, done: 0, total: ALL_STEPS.length });
    }

    const jobsRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/runs/${run.id}/jobs`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    const jobsData = await jobsRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = (jobsData.jobs ?? [])[0];

    if (!job) {
      return NextResponse.json({ status: run.status, steps: {}, pct: 0, done: 0, total: ALL_STEPS.length });
    }

    const steps: Record<string, "pending" | "running" | "done" | "failed"> = Object.fromEntries(
      ALL_STEPS.map((k) => [k, "pending"])
    );

    for (const step of (job.steps ?? [])) {
      const key = classifyStep(step.name ?? "");
      if (!key) continue;
      if (step.conclusion === "success") steps[key] = "done";
      else if (step.conclusion === "failure") steps[key] = "failed";
      else if (step.status === "in_progress") steps[key] = "running";
    }

    const total = ALL_STEPS.length;
    const done  = Object.values(steps).filter(v => v === "done").length;
    const pct   = Math.round((done / total) * 100);

    let status: string = run.status;
    if (run.conclusion === "failure") status = "failed";
    if (run.status === "completed" && run.conclusion === "success") status = "completed";

    return NextResponse.json({ status, steps, pct, done, total, run_id: run.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
