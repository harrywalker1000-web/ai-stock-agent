import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

/** All directories that store adhoc reports — delete from all of them. */
function getAdhocDirs(): string[] {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data", "adhoc_reports"),           // dashboard/data/adhoc_reports (deployed)
    path.join(cwd, "..", "data", "adhoc_reports"),      // root data/adhoc_reports (where cache is checked)
  ];
  return candidates; // delete from all, regardless of whether they exist
}

// Keep single-dir getter for the GET list (reads from whichever dir exists)
function getAdhocDir(): string {
  const local = path.join(process.cwd(), "data", "adhoc_reports");
  return fs.existsSync(local) ? local : path.join(process.cwd(), "..", "data", "adhoc_reports");
}

export async function DELETE(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase().replace(/[^A-Z]/g, "");
  const date   = req.nextUrl.searchParams.get("date");
  const all    = req.nextUrl.searchParams.get("all") === "1";

  if (!ticker && !all) {
    return NextResponse.json({ error: "ticker or all=1 required" }, { status: 400 });
  }

  let totalDeleted = 0;

  for (const dir of getAdhocDirs()) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      const toDelete = files.filter((f) => {
        if (all) return true;
        if (date) return f === `${ticker}_${date}.json`;
        return f.startsWith(`${ticker}_`);
      });
      for (const file of toDelete) {
        try { fs.unlinkSync(path.join(dir, file)); totalDeleted++; } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({ deleted: totalDeleted });
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
