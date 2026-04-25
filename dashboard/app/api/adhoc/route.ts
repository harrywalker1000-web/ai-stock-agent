import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const REPO  = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";
const BRANCH = "main";

// Repo-relative paths where reports are committed
const REPO_DIRS = [
  "dashboard/data/adhoc_reports",
  "data/adhoc_reports",
];

// Keep single-dir getter for the GET list (reads from whichever dir exists locally)
function getAdhocDir(): string {
  const local = path.join(process.cwd(), "data", "adhoc_reports");
  return fs.existsSync(local) ? local : path.join(process.cwd(), "..", "data", "adhoc_reports");
}

/** Delete a single file from GitHub via Contents API. Returns true if deleted (or already gone). */
async function deleteFromGitHub(repoPath: string, token: string): Promise<boolean> {
  const url = `https://api.github.com/repos/${REPO}/contents/${repoPath}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };

  // 1. Get the file's SHA (required for deletion)
  const getRes = await fetch(url, { headers });
  if (getRes.status === 404) return true; // already gone — not an error
  if (!getRes.ok) return false;

  const { sha } = await getRes.json();

  // 2. Delete the file
  const delRes = await fetch(url, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore: delete adhoc report ${repoPath.split("/").pop()}`,
      sha,
      branch: BRANCH,
    }),
  });
  return delRes.ok || delRes.status === 404;
}

/** List all adhoc report filenames from GitHub (reads the directory tree via Contents API). */
async function listFromGitHub(token: string): Promise<string[]> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const files: string[] = [];
  for (const dir of REPO_DIRS) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${dir}?ref=${BRANCH}`, { headers });
    if (!res.ok) continue;
    const items = await res.json();
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.name?.endsWith(".json") && item.type === "file") {
          files.push(item.name);
        }
      }
    }
  }
  // Deduplicate by filename
  return Array.from(new Set(files));
}

export async function DELETE(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase().replace(/[^A-Z]/g, "");
  const date   = req.nextUrl.searchParams.get("date");
  const all    = req.nextUrl.searchParams.get("all") === "1";
  const token  = process.env.GITHUB_DISPATCH_TOKEN;

  if (!ticker && !all) {
    return NextResponse.json({ error: "ticker or all=1 required" }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "GITHUB_DISPATCH_TOKEN not set" }, { status: 503 });
  }

  // Determine which filenames to delete
  let filenames: string[] = [];
  if (all) {
    filenames = await listFromGitHub(token);
  } else if (date) {
    filenames = [`${ticker}_${date}.json`];
  } else {
    // Delete all reports for this ticker (any date)
    const all_files = await listFromGitHub(token);
    filenames = all_files.filter((f) => f.startsWith(`${ticker}_`));
  }

  // Delete each file from all repo dirs
  let totalDeleted = 0;
  const errors: string[] = [];

  for (const filename of filenames) {
    for (const dir of REPO_DIRS) {
      const repoPath = `${dir}/${filename}`;
      try {
        const ok = await deleteFromGitHub(repoPath, token);
        if (ok) totalDeleted++;
      } catch (err) {
        errors.push(`${repoPath}: ${err}`);
      }
    }
  }

  return NextResponse.json({ deleted: totalDeleted, errors: errors.length ? errors : undefined });
}

export async function GET() {
  const adhocDir = getAdhocDir();
  const reports: unknown[] = [];

  try {
    if (fs.existsSync(adhocDir)) {
      const files = fs.readdirSync(adhocDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse();

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(adhocDir, file), "utf-8"));
          reports.push({
            ticker: data.ticker,
            company_name: data.company_name,
            sector: data.sector,
            current_price: data.current_price,
            date: data.date,
            direction: data.direction,
            conviction: data.conviction,
            mandate_pass: data.mandate_pass,
            expected_return_12m: data.expected_return_12m ?? data.expected_return_2_3yr,
            macro_regime: data.macro_regime,
            cached: data.cached,
          });
        } catch {
          // skip malformed
        }
      }
    }
  } catch {
    // no reports directory
  }

  return NextResponse.json(reports);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticker = String(body.ticker ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    const forceRefresh = Boolean(body.forceRefresh);

    if (!ticker || ticker.length > 5) {
      return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
    }

    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const repo = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";

    if (!token) {
      return NextResponse.json(
        { error: "GITHUB_DISPATCH_TOKEN not set in Vercel environment variables" },
        { status: 503 }
      );
    }

    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/adhoc_report.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { ticker, force_refresh: forceRefresh ? "true" : "false" },
        }),
      }
    );

    // GitHub returns 204 No Content on success
    if (res.status !== 204 && !res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `GitHub dispatch failed (${res.status}): ${text}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ queued: true, ticker });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
