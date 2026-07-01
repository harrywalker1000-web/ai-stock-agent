import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const REPO = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";
const BRANCH = "main";
const REPO_DIRS = [
  "dashboard/data/adhoc_reports",
  "data/adhoc_reports",
];

function sanitizeTicker(raw: string): string {
  return String(raw).toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

function getAdhocDir(): string {
  // Check dashboard/data/adhoc_reports (Vercel + local dashboard-root)
  const inDashboard = path.join(process.cwd(), "data", "adhoc_reports");
  if (fs.existsSync(inDashboard)) return inDashboard;
  // Fallback: repo-root/data/adhoc_reports (local dev from repo root)
  return path.join(process.cwd(), "..", "data", "adhoc_reports");
}

function readLatestReport(ticker: string): Record<string, unknown> | null {
  const adhocDir = getAdhocDir();
  if (!fs.existsSync(adhocDir)) return null;
  const files = fs.readdirSync(adhocDir)
    .filter((f) => f.startsWith(`${ticker}_`) && f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    const content = fs.readFileSync(path.join(adhocDir, files[0]), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function fetchLatestReportFromGitHub(
  ticker: string
): Promise<Record<string, unknown> | null> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;

  // Token is optional — public repos work without auth.
  // If token is absent and repo is private, GitHub returns 401 and we continue gracefully.
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let latestFile: { name: string; download_url: string } | null = null;

  for (const dir of REPO_DIRS) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${dir}?ref=${BRANCH}`,
        { headers }
      );
      if (!res.ok) continue;
      const items: Array<{ name: string; download_url: string; type: string }> =
        await res.json();
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (
          item.type === "file" &&
          item.name.startsWith(`${ticker}_`) &&
          item.name.endsWith(".json")
        ) {
          // Filename format YYYYMMDD_HHMMSS — lexicographic = chronological
          if (!latestFile || item.name > latestFile.name) {
            latestFile = item;
          }
        }
      }
    } catch {
      continue;
    }
  }

  if (!latestFile) return null;

  try {
    const fileRes = await fetch(latestFile.download_url);
    if (!fileRes.ok) return null;
    return await fileRes.json();
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = sanitizeTicker(params.ticker);
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  // 1. Try local filesystem (works locally and when includeFiles bundles the files)
  const report = readLatestReport(ticker);
  if (report) return NextResponse.json(report);

  // 2. Fallback: fetch from GitHub (handles Vercel build cache not picking up new files)
  const githubReport = await fetchLatestReportFromGitHub(ticker);
  if (githubReport) return NextResponse.json(githubReport);

  return NextResponse.json({ error: `No report found for ${ticker}` }, { status: 404 });
}

export async function POST(
  _request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = sanitizeTicker(params.ticker);
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  const scriptPath = path.join(process.cwd(), "..", "scripts", "run_adhoc_research.py");

  if (!fs.existsSync(scriptPath)) {
    return NextResponse.json(
      { error: `Script not found: ${scriptPath}` },
      { status: 500 }
    );
  }

  try {
    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" ${ticker}`,
      {
        timeout: 120000,
        cwd: path.join(process.cwd(), ".."),
        env: { ...process.env },
      }
    );

    // Try to parse stdout as JSON first
    const trimmed = stdout.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return NextResponse.json(JSON.parse(trimmed));
      } catch {
        // fall through to file read
      }
    }

    // Script may write to file instead of stdout — read latest
    const report = readLatestReport(ticker);
    if (report) return NextResponse.json(report);

    // Return stderr as error if nothing else works
    return NextResponse.json(
      { error: `Pipeline error: ${stderr || "No output"}` },
      { status: 500 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // On timeout or failure, try reading any partial report
    const report = readLatestReport(ticker);
    if (report) return NextResponse.json(report);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
