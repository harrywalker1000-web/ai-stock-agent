import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { adhocTimestamp, isAdhocFilename, listAdhocFiles, readAdhocFile } from "@/lib/adhoc-files";

const CACHE_DAYS = 7;

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

/** Delete one file via the Contents API: "deleted" | "absent" | "error". */
async function deleteFromGitHub(repoPath: string, token: string): Promise<"deleted" | "absent" | "error"> {
  const url = `https://api.github.com/repos/${REPO}/contents/${repoPath}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const getRes = await fetch(url, { headers, cache: "no-store" });
  if (getRes.status === 404) return "absent";
  if (!getRes.ok) return "error";
  const { sha } = await getRes.json();
  const delRes = await fetch(url, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore: delete adhoc report ${repoPath.split("/").pop()}`,
      sha,
      branch: BRANCH,
    }),
  });
  if (delRes.ok) return "deleted";
  return delRes.status === 404 ? "absent" : "error";
}

const MAX_BATCH = 300;

/**
 * DELETE — removes exactly the named report files (from both repo copies).
 *   ?filename=TICKER_….json            one report (row delete)
 *   body {"filenames": [...]}          a batch (the "Clear all" of one tab)
 * Every name is validated against the report filename pattern; there is no
 * "delete everything" mode.
 */
export async function DELETE(req: NextRequest) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const single = req.nextUrl.searchParams.get("filename");
  let names: string[] = [];
  if (single) {
    names = [single];
  } else {
    const body = await req.json().catch(() => null);
    names = Array.isArray(body?.filenames) ? body.filenames.map(String) : [];
  }
  names = Array.from(new Set(names));
  if (names.length === 0) return NextResponse.json({ error: "filename or filenames required" }, { status: 400 });
  if (names.length > MAX_BATCH) return NextResponse.json({ error: `At most ${MAX_BATCH} files per request` }, { status: 400 });
  const invalid = names.filter((n) => !isAdhocFilename(n));
  if (invalid.length) return NextResponse.json({ error: `Invalid report filename(s): ${invalid.slice(0, 3).join(", ")}` }, { status: 400 });
  if (!token) return NextResponse.json({ error: "GITHUB_DISPATCH_TOKEN not set" }, { status: 503 });

  let deleted = 0;
  const notFound: string[] = [];
  const errors: string[] = [];
  for (const name of names) {
    let found = false;
    for (const dir of REPO_DIRS) {
      const r = await deleteFromGitHub(`${dir}/${name}`, token).catch(() => "error" as const);
      if (r === "deleted") { deleted++; found = true; }
      else if (r === "error") errors.push(`${dir}/${name}`);
    }
    if (!found) notFound.push(name);
  }
  const status = errors.length ? 502 : notFound.length === names.length ? 404 : 200;
  return NextResponse.json(
    { deleted, not_found: notFound.length ? notFound : undefined, errors: errors.length ? errors : undefined,
      ...(status !== 200 ? { error: errors.length ? "Some deletions failed" : "Report not found in the repo" } : {}) },
    { status },
  );
}

export async function GET() {
  const adhocDir = getAdhocDir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reports: any[] = [];

  try {
    if (fs.existsSync(adhocDir)) {
      // Directory order is arbitrary — real chronological sort happens below,
      // by the report's own `date` field, once each file has been parsed.
      const files = fs.readdirSync(adhocDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(adhocDir, file), "utf-8"));
          // Support both new pipeline format (sections.*) and old format (flat fields)
          const secs = data.sections ?? {};
          const s1   = secs.s1_cover ?? secs.s1_mandate ?? {};
          const s16  = secs.s16_recommendation ?? {};
          const mandate = data.mandate ?? {};
          const direction = s16.direction?.value ?? s16.direction ?? data.direction;
          const conviction = s16.conviction?.value ?? s16.conviction ?? data.conviction;
          const sector = s1.sector?.value ?? s1.sector ?? data.sector;
          const currentPrice = s1.current_price?.value ?? s1.current_price ?? data.current_price;
          const mandatePass = mandate.passed ?? s1.mandate_status?.value ?? data.mandate_pass;
          const expectedReturn = s16.expected_return_12m?.value ?? s16.expected_return_12m ?? data.expected_return_12m ?? data.expected_return_2_3yr;
          // Infer source from filename if not explicitly set in JSON:
          // TICKER_YYYY-MM-DD.json = daily pipeline auto-generated
          // TICKER_YYYYMMDD_HHMMSS.json = manual adhoc run
          const inferredSource = /^\w+_\d{8}_\d{6}\.json$/.test(file) ? "manual" : "pipeline_auto";
          reports.push({
            filename: file,
            ticker: data.ticker,
            company_name: data.company_name,
            sector,
            current_price: currentPrice,
            date: data.date ?? (data.generated_at ?? "").slice(0, 10),
            direction,
            conviction,
            mandate_pass: mandatePass,
            expected_return_12m: expectedReturn,
            macro_regime: data.macro_regime,
            cached: data.cached,
            source: data.source ?? inferredSource,
          });
        } catch {
          // skip malformed
        }
      }
    }
  } catch {
    // no reports directory
  }

  // Newest first, by the report's own date — not filename/directory order, which
  // sorts alphabetically by ticker and has nothing to do with chronology.
  reports.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return NextResponse.json(reports);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Letters plus "." / "-" share-class separators (BRK-B), max 6 chars
    const ticker = String(body.ticker ?? "").toUpperCase().replace(/[^A-Z.\-]/g, "");
    const forceRefresh = Boolean(body.forceRefresh);

    if (!ticker || ticker.length > 6 || !/^[A-Z]/.test(ticker)) {
      return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
    }

    // "Use cached (7 days)": a report for this ticker under 7 days old is reused, no new run
    if (!forceRefresh) {
      const cutoff = new Date(Date.now() - CACHE_DAYS * 86400_000).toISOString().slice(0, 10);
      for (const name of listAdhocFiles(ticker)) {
        if (adhocTimestamp(name).slice(0, 10) < cutoff) break; // newest-first
        if (readAdhocFile(name)) return NextResponse.json({ cached: true, ticker, filename: name });
      }
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
