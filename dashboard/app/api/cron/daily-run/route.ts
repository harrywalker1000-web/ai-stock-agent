import { NextRequest, NextResponse } from "next/server";

// Daily pipeline trigger, called by Vercel Cron every weekday between 13:00–13:59 UTC
// (always before 10:30am New York, in both EST and EDT).
//
// GitHub's own scheduled triggers were starting runs 5–9 hours late — sometimes after
// the US close — so this starts the run via workflow_dispatch (which starts
// immediately) and the workflow itself waits until exactly START_AT_ET before running
// the pipeline: 1 hour after the 9:30am ET open, the same New York time every day.
//
// Skips market holidays (Alpaca calendar) and days that already have a run.

const REPO = process.env.GITHUB_REPO ?? "harrywalker1000-web/ai-stock-agent";
const WORKFLOW = "daily_run.yml";
const START_AT_ET = "10:30";

function nyDate(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  // Without a CRON_SECRET, fall back to Vercel's cron user agent; the deployment is
  // also behind Vercel Authentication, so outside requests never reach this route.
  return (req.headers.get("user-agent") ?? "").startsWith("vercel-cron");
}

async function isTradingDay(today: string): Promise<boolean | null> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return null;
  const res = await fetch(`${base}/v2/calendar?start=${today}&end=${today}`, {
    headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const days = (await res.json()) as Array<{ date: string }>;
  return days.some((d) => d.date === today);
}

async function alreadyRanToday(token: string, today: string): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, cache: "no-store" },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { workflow_runs?: Array<{ created_at: string; conclusion: string | null }> };
  return (data.workflow_runs ?? []).some(
    (r) => nyDate(new Date(r.created_at)) === today && r.conclusion !== "cancelled" && r.conclusion !== "skipped",
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ error: "GITHUB_DISPATCH_TOKEN not set" }, { status: 503 });

  const today = nyDate();
  const dryRun = req.nextUrl.searchParams.get("dry_run") === "1";

  const trading = await isTradingDay(today);
  if (trading === false) return NextResponse.json({ skipped: "market holiday", today });

  if (await alreadyRanToday(token, today)) {
    return NextResponse.json({ skipped: "already ran today", today });
  }
  if (dryRun) {
    return NextResponse.json({ would_dispatch: true, today, start_at_et: START_AT_ET, trading_day: trading });
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { start_at_et: START_AT_ET } }),
  });
  if (res.status !== 204 && !res.ok) {
    return NextResponse.json({ error: `dispatch failed (${res.status}): ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  }
  return NextResponse.json({ dispatched: true, today, start_at_et: START_AT_ET });
}
