import { NextResponse } from "next/server";
import { adhocTicker, isAdhocFilename, listAdhocFiles, readAdhocFile, readLatestAdhoc, sortAdhocNames } from "@/lib/adhoc-files";
import { isSectionsReport } from "@/lib/adhoc-normalize";

const REPO = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";
const BRANCH = "main";
const REPO_DIRS = [
  "dashboard/data/adhoc_reports",
  "data/adhoc_reports",
];

function sanitizeTicker(raw: string): string {
  return String(raw).toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
}

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * GitHub fallback: a report committed after the current deployment was built isn't in
 * the bundle yet. `file` = a specific filename; otherwise the newest for the ticker.
 */
async function fetchReportFromGitHub(
  ticker: string,
  file: string | null,
): Promise<{ file: string; report: Record<string, unknown> } | null> {
  const candidates: { name: string; download_url: string }[] = [];
  for (const dir of REPO_DIRS) {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${dir}?ref=${BRANCH}`, {
        headers: ghHeaders(),
        next: { revalidate: 120 },
      });
      if (!res.ok) continue;
      const items: Array<{ name: string; download_url: string; type: string }> = await res.json();
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.type !== "file") continue;
        if (file ? item.name === file : adhocTicker(item.name) === ticker) candidates.push(item);
      }
    } catch {
      continue;
    }
  }
  const order = sortAdhocNames(candidates.map((c) => c.name));
  for (const name of order) {
    const item = candidates.find((c) => c.name === name)!;
    try {
      const fileRes = await fetch(item.download_url, { headers: ghHeaders() });
      if (!fileRes.ok) continue;
      return { file: name, report: JSON.parse(await fileRes.text()) };
    } catch {
      continue; // NaN / truncated JSON — try the next-newest
    }
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = sanitizeTicker(params.ticker);
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  // Optional ?file=TICKER_YYYY-MM-DD.json — open one specific report
  const file = new URL(request.url).searchParams.get("file");
  if (file !== null && (!isAdhocFilename(file) || adhocTicker(file) !== ticker)) {
    return NextResponse.json({ error: "Invalid report file" }, { status: 400 });
  }

  // ?schema=flat — newest report in the older flat format (the pitch page only reads that one)
  if (new URL(request.url).searchParams.get("schema") === "flat") {
    for (const name of listAdhocFiles(ticker)) {
      const r = readAdhocFile(name);
      if (r && !isSectionsReport(r)) return NextResponse.json({ ...r, _file: name });
    }
    return NextResponse.json({ error: `No pitch-format report for ${ticker}`, latest_available: !!readLatestAdhoc(ticker) }, { status: 404 });
  }

  // 1. Bundled / local files
  if (file) {
    const report = readAdhocFile(file);
    if (report) return NextResponse.json({ ...report, _file: file });
  } else {
    const latest = readLatestAdhoc(ticker);
    if (latest) return NextResponse.json({ ...latest.report, _file: latest.file });
  }

  // 2. GitHub fallback (report committed after this deployment was built)
  const gh = await fetchReportFromGitHub(ticker, file);
  if (gh) return NextResponse.json({ ...gh.report, _file: gh.file });

  return NextResponse.json({ error: `No report found for ${ticker}` }, { status: 404 });
}
