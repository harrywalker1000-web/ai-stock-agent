import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

function getAdhocDir(): string {
  const local = path.join(process.cwd(), "data", "adhoc_reports");
  return fs.existsSync(local) ? local : path.join(process.cwd(), "..", "data", "adhoc_reports");
}

export async function GET(
  _request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = String(params.ticker).toUpperCase().replace(/[^A-Z]/g, "");
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  const adhocDir = getAdhocDir();

  try {
    if (!fs.existsSync(adhocDir)) {
      return NextResponse.json({ error: `No report found for ${ticker}` }, { status: 404 });
    }

    const files = fs.readdirSync(adhocDir)
      .filter((f) => f.startsWith(`${ticker}_`) && f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) {
      return NextResponse.json({ error: `No report found for ${ticker}` }, { status: 404 });
    }

    const content = fs.readFileSync(path.join(adhocDir, files[0]), "utf-8");
    return NextResponse.json(JSON.parse(content));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
