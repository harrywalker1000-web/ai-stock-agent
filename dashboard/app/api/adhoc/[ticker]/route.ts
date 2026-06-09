import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function sanitizeTicker(raw: string): string {
  return String(raw).toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

function getAdhocDir(): string {
  const local = path.join(process.cwd(), "data", "adhoc_reports");
  return fs.existsSync(local) ? local : path.join(process.cwd(), "..", "data", "adhoc_reports");
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

export async function GET(
  _request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = sanitizeTicker(params.ticker);
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  const report = readLatestReport(ticker);
  if (!report) {
    return NextResponse.json({ error: `No report found for ${ticker}` }, { status: 404 });
  }
  return NextResponse.json(report);
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
