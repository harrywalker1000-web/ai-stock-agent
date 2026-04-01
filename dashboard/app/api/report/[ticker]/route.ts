import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8 * 60 * 1000; // 8 min

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  const projectRoot = path.join(process.cwd(), "..");
  const adhocDir = path.join(projectRoot, "data", "reports", "adhoc_reports");

  // Return cached report if generated today
  const today = new Date().toISOString().split("T")[0];
  const cachedPath = path.join(adhocDir, `${ticker}_${today}.json`);
  if (fs.existsSync(cachedPath)) {
    try {
      const raw = fs.readFileSync(cachedPath, "utf-8");
      return NextResponse.json({ ...JSON.parse(raw), cached: true });
    } catch {
      // Fall through to regenerate
    }
  }

  // Generate fresh report
  return new Promise<NextResponse>((resolve) => {
    const proc = spawn("python3", ["scripts/adhoc_report.py", "--ticker", ticker], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(NextResponse.json({ error: "Report generation timed out (8 min)" }, { status: 504 }));
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 && fs.existsSync(cachedPath)) {
        try {
          const raw = fs.readFileSync(cachedPath, "utf-8");
          return resolve(NextResponse.json(JSON.parse(raw)));
        } catch {
          // fall through
        }
      }
      resolve(NextResponse.json({ error: `Process exited with code ${code}`, stderr: stderr.join("").slice(-1000) }, { status: 500 }));
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve(NextResponse.json({ error: `Failed to start: ${err.message}` }, { status: 500 }));
    });
  });
}
