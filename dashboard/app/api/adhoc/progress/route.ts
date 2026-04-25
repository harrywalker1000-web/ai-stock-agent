import { NextRequest, NextResponse } from "next/server";

const REPO = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";
const WORKFLOW = "adhoc_report.yml";

// Keyword-based matching — robust against em-dash encoding, capitalisation,
// or GitHub prefixing step names with "Run " etc.
function classifyStep(rawName: string): string | null {
  const n = rawName.toLowerCase();
  if (n.includes("macro")) return "macro";
  if (n.includes("news") || n.includes("catalyst")) return "news";
  if (n.includes("fundamental")) return "fundamental";
  if (n.includes("quant")) return "quant";
  if (n.includes("sentiment")) return "sentiment";
  if (n.includes("committee") || (n.includes("investment") && n.includes("agent"))) return "committee";
  return null;
}

export async function GET(req: NextRequest) {
  const ticker    = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const queuedAt  = req.nextUrl.searchParams.get("queuedAt"); // unix ms
  const token     = process.env.GITHUB_DISPATCH_TOKEN;

  if (!ticker || !token) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  try {
    // 1. List recent runs for the adhoc workflow
    const runsRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    if (!runsRes.ok) return NextResponse.json({ error: "github api error" }, { status: 502 });

    const runsData = await runsRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runs: any[] = runsData.workflow_runs ?? [];

    // 2. Find the run for this ticker queued after queuedAt
    const cutoff = queuedAt ? parseInt(queuedAt) - 30_000 : Date.now() - 15 * 60_000;
    const run = runs.find((r) => {
      const createdMs = new Date(r.created_at).getTime();
      if (createdMs < cutoff) return false;
      // Check the display_title or head_commit for ticker (GitHub puts inputs in display_title sometimes)
      const title = (r.display_title ?? r.name ?? "").toUpperCase();
      // Also accept any recent run since inputs aren't always exposed in list
      return title.includes(ticker) || createdMs > cutoff;
    });

    if (!run) {
      return NextResponse.json({ status: "queued", agents: {}, run_id: null });
    }

    // 3. Fetch jobs for this run
    const jobsRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/runs/${run.id}/jobs`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    const jobsData = await jobsRes.json();
    const job = (jobsData.jobs ?? [])[0]; // single job: run-adhoc

    if (!job) {
      return NextResponse.json({ status: run.status, agents: {}, run_id: run.id });
    }

    // 4. Map steps to agent status
    const agents: Record<string, "pending" | "running" | "done" | "failed"> = {
      macro: "pending", news: "pending", fundamental: "pending",
      quant: "pending", sentiment: "pending", committee: "pending",
    };

    for (const step of (job.steps ?? [])) {
      const key = classifyStep(step.name ?? "");
      if (!key) continue;
      if (step.conclusion === "success") agents[key] = "done";
      else if (step.conclusion === "failure") agents[key] = "failed";
      else if (step.status === "in_progress") agents[key] = "running";
    }

    // Count progress
    const total = 6;
    const done  = Object.values(agents).filter(v => v === "done").length;
    const pct   = Math.round((done / total) * 100);

    // Overall status
    let status: string = run.status; // queued | in_progress | completed
    if (run.conclusion === "failure") status = "failed";
    if (run.status === "completed" && run.conclusion === "success") status = "completed";

    return NextResponse.json({ status, agents, pct, done, total, run_id: run.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
