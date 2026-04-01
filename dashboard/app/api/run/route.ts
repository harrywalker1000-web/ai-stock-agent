import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

// Max 15 minutes
const TIMEOUT_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? "full");

  if (!["review", "full"].includes(type)) {
    return NextResponse.json({ error: "Invalid type. Use 'review' or 'full'." }, { status: 400 });
  }

  const projectRoot = path.join(process.cwd(), "..");
  const args = ["main.py"];
  if (type === "review") {
    args.push("--phase-a-only");
  }

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn("python3", args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        SKIP_PHASE_B: type === "review" ? "true" : "false",
      },
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(
        NextResponse.json(
          { error: "Pipeline timed out after 15 minutes.", stdout: stdout.join(""), stderr: stderr.join("") },
          { status: 504 }
        )
      );
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(NextResponse.json({ ok: true, summary: `Run completed (${type})`, stdout: stdout.join("").slice(-2000) }));
      } else {
        resolve(
          NextResponse.json(
            { error: `Process exited with code ${code}`, stderr: stderr.join("").slice(-2000) },
            { status: 500 }
          )
        );
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve(NextResponse.json({ error: `Failed to start process: ${err.message}` }, { status: 500 }));
    });
  });
}
