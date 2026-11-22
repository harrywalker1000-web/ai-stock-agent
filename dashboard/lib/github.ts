/**
 * Minimal GitHub REST helpers for things the dashboard must persist or trigger in the
 * repo (Vercel's filesystem is read-only, and the pipeline runs on GitHub Actions).
 * Uses GITHUB_DISPATCH_TOKEN (contents + actions write on the repo).
 */

export const REPO = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";
export const BRANCH = "main";

export function ghToken(): string | null {
  return process.env.GITHUB_DISPATCH_TOKEN ?? null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const t = ghToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** Read a repo file. Returns null if it doesn't exist. Throws on other errors. */
export async function getRepoFile(path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read ${path} failed (${res.status})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j: any = await res.json();
  return { content: Buffer.from(j.content ?? "", "base64").toString("utf-8"), sha: j.sha };
}

/** Create or update a repo file (one commit). `sha` is required when updating. */
export async function putRepoFile(path: string, content: string, message: string, sha?: string): Promise<void> {
  if (!ghToken()) throw new Error("GITHUB_DISPATCH_TOKEN not set in Vercel environment variables");
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub write ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function dispatchWorkflow(workflow: string, inputs: Record<string, string>): Promise<void> {
  if (!ghToken()) throw new Error("GITHUB_DISPATCH_TOKEN not set in Vercel environment variables");
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: BRANCH, inputs }),
  });
  if (res.status !== 204 && !res.ok) {
    throw new Error(`GitHub dispatch failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

export interface WorkflowRun {
  id: number; status: string; conclusion: string | null; created_at: string; html_url: string; event: string;
}

export async function latestRuns(workflow: string, n = 5): Promise<WorkflowRun[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=${n}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub runs lookup failed (${res.status})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (j.workflow_runs ?? []).map((r: any) => ({
    id: r.id, status: r.status, conclusion: r.conclusion, created_at: r.created_at, html_url: r.html_url, event: r.event,
  }));
}
