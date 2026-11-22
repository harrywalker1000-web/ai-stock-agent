import { NextRequest, NextResponse } from "next/server";
import YahooFinanceClass from "yahoo-finance2";

type Interval = "15m" | "1h" | "1d" | "1wk";

// yahoo-finance2 v3 requires instantiation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

function getConfig(tf: string): { period1: Date; interval: Interval } {
  const now = new Date();
  const daysAgo = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
  const monthsAgo = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d; };
  switch (tf) {
    case "15m": return { period1: daysAgo(5),   interval: "15m" };
    case "1h":  return { period1: daysAgo(30),  interval: "1h"  };
    case "1W":  return { period1: monthsAgo(24),interval: "1wk" };
    case "YTD": return { period1: new Date(now.getFullYear(), 0, 1), interval: "1d" };
    default:    return { period1: monthsAgo(6), interval: "1d"  };
  }
}

export async function GET(
  req: NextRequest,
  context: { params: { ticker: string } }
) {
  const ticker = context.params.ticker.toUpperCase();
  const tf = req.nextUrl.searchParams.get("tf") ?? "1D";
  const { period1, interval } = getConfig(tf);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.chart(ticker, {
      period1: period1.toISOString().split("T")[0],
      interval,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candles = (result.quotes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.open != null && q.high != null && q.low != null && q.close != null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => ({
        time: Math.floor((q.date instanceof Date ? q.date.getTime() : Number(q.date)) / 1000),
        open: Number(q.open),
        high: Number(q.high),
        low: Number(q.low),
        close: Number(q.close),
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) => c.time > 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => a.time - b.time);

    // Yahoo's weekly series appends the in-progress week as a separate row stamped with
    // the latest quote time — merge any bar that starts <7 days after the previous one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let out: any[] = candles;
    if (interval === "1wk") {
      out = [];
      for (const c of candles) {
        const prev = out[out.length - 1];
        if (prev && c.time - prev.time < 6.5 * 86400) {
          prev.high = Math.max(prev.high, c.high);
          prev.low = Math.min(prev.low, c.low);
          prev.close = c.close;
        } else {
          out.push({ ...c });
        }
      }
    }
    // Strictly ascending, unique times (lightweight-charts requirement)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out = out.filter((c: any, i: number) => i === 0 || c.time > out[i - 1].time);

    return NextResponse.json({ candles: out, ticker, tf });
  } catch (err) {
    console.error(`Chart API error for ${ticker}:`, err);
    return NextResponse.json({ candles: [], ticker, tf, error: "fetch_failed" });
  }
}
