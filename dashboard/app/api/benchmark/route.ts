import { NextResponse } from "next/server";
import YahooFinanceClass from "yahoo-finance2";
import { align, computeAll, twrIndex, type EquityPoint } from "@/lib/benchmark";
import { findPendingSplits, nyDate, splitHistoryDeltas } from "@/lib/splits";

/**
 * Portfolio vs SPY, computed live on every request from real data (no pipeline file):
 *   portfolio — Alpaca daily equity history since account inception (split-corrected)
 *   SPY       — Yahoo Finance dividend-adjusted daily closes
 * plus an intraday point (Alpaca live equity vs SPY live price, same moment) while the
 * market is open. All maths lives in lib/benchmark.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

function alpaca() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return null;
  return { base, headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } };
}

export async function GET() {
  const a = alpaca();
  if (!a) return NextResponse.json({ error: "Alpaca credentials not configured" }, { status: 503 });

  try {
    const [histRes, acctRes, posRes] = await Promise.all([
      fetch(`${a.base}/v2/account/portfolio/history?period=all&timeframe=1D`, { headers: a.headers, next: { revalidate: 900 } }),
      fetch(`${a.base}/v2/account`, { headers: a.headers, next: { revalidate: 60 } }),
      fetch(`${a.base}/v2/positions`, { headers: a.headers, next: { revalidate: 60 } }),
    ]);
    if (!histRes.ok) throw new Error(`Alpaca history HTTP ${histRes.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hist: any = await histRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acct: any = acctRes.ok ? await acctRes.json() : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions: any[] = posRes.ok ? await posRes.json() : [];

    // Daily closes — Alpaca stamps each at 20:00 New York time, so label in NY time
    let points: EquityPoint[] = (hist.timestamp ?? []).map((ts: number, i: number) => ({
      date: nyDate(new Date(ts * 1000)),
      equity: hist.equity?.[i] ?? 0,
      pl: hist.profit_loss?.[i] ?? 0,
    }));

    // Split correction (lib/splits): shift equity by the delta, and P&L by its day-on-day change
    const pending = await findPendingSplits(positions);
    const deltas = await splitHistoryDeltas(pending, positions);
    if (Object.keys(deltas).length) {
      let prevDelta = 0;
      points = points.map((p) => {
        const d = deltas[p.date] ?? 0;
        const out = { ...p, equity: p.equity + d, pl: p.pl + (d - prevDelta) };
        prevDelta = d;
        return out;
      });
    }

    const firstFunded = points.find((p) => p.equity > 0)?.date;
    if (!firstFunded) return NextResponse.json({ error: "No funded equity history yet" }, { status: 404 });

    // SPY dividend-adjusted closes from just before inception
    const period1 = new Date(`${firstFunded}T00:00:00Z`);
    period1.setUTCDate(period1.getUTCDate() - 7);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart: any = await yf.chart("SPY", { period1: period1.toISOString().slice(0, 10), interval: "1d" });
    const spy: Record<string, number> = {};
    for (const q of chart?.quotes ?? []) {
      const close = q.adjclose ?? q.close;
      if (q.date && typeof close === "number") spy[nyDate(new Date(q.date))] = close;
    }

    // Intraday point: live equity vs live SPY, only while today's session is newer than the last close
    const lastDate = points[points.length - 1]?.date;
    const meta = chart?.meta ?? {};
    const spyLive = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const spyLiveDate = meta.regularMarketTime ? nyDate(new Date(meta.regularMarketTime)) : null;
    let live = false;
    if (acct && spyLive && spyLiveDate && lastDate && spyLiveDate > lastDate) {
      let mvDelta = 0;
      for (const p of positions) {
        const s = pending[p.symbol];
        if (s) mvDelta += (p.side === "short" ? -1 : 1) * (s.ratio - 1) * s.broker_qty * parseFloat(p.current_price);
      }
      const equityNow = parseFloat(acct.equity) + mvDelta;
      const prevEquity = points[points.length - 1].equity;
      points.push({ date: spyLiveDate, equity: equityNow, pl: equityNow - prevEquity });
      spy[spyLiveDate] = spyLive; // dividend adj. factor is 1 for the current session
      live = true;
    }

    const aligned = align(twrIndex(points), spy);
    const periods = computeAll(aligned);

    return NextResponse.json({
      inception_date: aligned[0]?.date ?? firstFunded,
      as_of: aligned[aligned.length - 1]?.date ?? null,
      includes_intraday: live,
      points: aligned.length,
      split_corrections: Object.values(pending),
      sources: {
        portfolio: "Alpaca account equity history (time-weighted)",
        benchmark: "SPY daily close, dividend-adjusted (Yahoo Finance)",
      },
      periods,
    });
  } catch (e) {
    return NextResponse.json({ error: `Benchmark unavailable: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
