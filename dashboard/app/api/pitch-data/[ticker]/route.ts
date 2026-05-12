/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

const FMP = "https://financialmodelingprep.com/api";
const FH  = "https://finnhub.io/api/v1";

async function safe(url: string): Promise<any> {
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase().replace(/[^A-Z.]/g, "");
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  const fmpKey = process.env.FMP_API_KEY;
  const fhKey  = process.env.FINNHUB_API_KEY;

  const today = new Date().toISOString().split("T")[0];
  const month = new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0];

  const [fhEarnings, fhPT, fhRec, fhNews, fmpMetrics, fmpInsider, fmpSegProduct, fmpSegGeo] = await Promise.all([
    fhKey ? safe(`${FH}/stock/earnings?symbol=${ticker}&limit=8&token=${fhKey}`) : null,
    fhKey ? safe(`${FH}/stock/price-target?symbol=${ticker}&token=${fhKey}`) : null,
    fhKey ? safe(`${FH}/stock/recommendation?symbol=${ticker}&token=${fhKey}`) : null,
    fhKey ? safe(`${FH}/company-news?symbol=${ticker}&from=${month}&to=${today}&token=${fhKey}`) : null,
    fmpKey ? safe(`${FMP}/v3/key-metrics/${ticker}?limit=1&period=annual&apikey=${fmpKey}`) : null,
    fmpKey ? safe(`${FMP}/v4/insider-trading?symbol=${ticker}&limit=10&apikey=${fmpKey}`) : null,
    fmpKey ? safe(`${FMP}/v4/revenue-product-segmentation?symbol=${ticker}&period=annual&apikey=${fmpKey}`) : null,
    fmpKey ? safe(`${FMP}/v4/revenue-geographic-segmentation?symbol=${ticker}&period=annual&apikey=${fmpKey}`) : null,
  ]);

  // Earnings surprises (Finnhub)
  const earnings_surprises = Array.isArray(fhEarnings)
    ? fhEarnings.slice(0, 8).map((e: any) => ({
        period: e.period,
        year: e.year,
        quarter: e.quarter,
        actual: e.actual,
        estimate: e.estimate,
        surprise: e.surprise,
        surprise_pct: e.surprisePercent,
      }))
    : [];

  // Analyst price target (Finnhub)
  const price_target = fhPT && fhPT.targetMean != null ? {
    high: fhPT.targetHigh,
    low: fhPT.targetLow,
    mean: fhPT.targetMean,
    median: fhPT.targetMedian,
    updated: fhPT.lastUpdated,
  } : null;

  // Recommendation trend — most recent month (Finnhub)
  const recommendation_trend = Array.isArray(fhRec) && fhRec.length > 0 ? (() => {
    const r = fhRec[0];
    const total = (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0);
    return {
      period: r.period,
      strong_buy: r.strongBuy || 0,
      buy: r.buy || 0,
      hold: r.hold || 0,
      sell: r.sell || 0,
      strong_sell: r.strongSell || 0,
      total,
    };
  })() : null;

  // Recent news headlines (Finnhub) — top 12
  const news = Array.isArray(fhNews)
    ? fhNews.slice(0, 12).map((n: any) => ({
        headline: n.headline,
        source: n.source,
        url: n.url,
        datetime: n.datetime,
        summary: n.summary,
      }))
    : [];

  // FMP key metrics (EV/EBITDA, FCF yield, ROIC, EV/Revenue)
  const metricsArr = Array.isArray(fmpMetrics) ? fmpMetrics : [];
  const key_metrics = metricsArr.length > 0 ? {
    ev_ebitda: metricsArr[0].enterpriseValueOverEBITDA ?? null,
    ev_revenue: metricsArr[0].evToSales ?? null,
    fcf_yield: metricsArr[0].freeCashFlowYield ?? null,
    roic: metricsArr[0].roic ?? null,
    pb_ratio: metricsArr[0].pbRatio ?? null,
    enterprise_value: metricsArr[0].enterpriseValue ?? null,
    net_debt_ebitda: metricsArr[0].netDebtToEBITDA ?? null,
    date: metricsArr[0].date ?? null,
  } : null;

  // Revenue segments — product (FMP)
  // Response: array of { date: string, [segmentName]: number, ... }
  const revenue_segments = (() => {
    const arr = Array.isArray(fmpSegProduct) ? fmpSegProduct : [];
    if (arr.length === 0) return null;
    const latest = arr[0];
    const { date, ...values } = latest;
    const entries = Object.entries(values as Record<string, number>)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .sort(([, a], [, b]) => b - a);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total === 0) return null;
    return {
      date,
      segments: entries.map(([name, value]) => ({
        name,
        value,
        pct: Math.round((value / total) * 1000) / 10,
      })),
    };
  })();

  // Revenue segments — geographic (FMP)
  const revenue_geo = (() => {
    const arr = Array.isArray(fmpSegGeo) ? fmpSegGeo : [];
    if (arr.length === 0) return null;
    const latest = arr[0];
    const { date, ...values } = latest;
    const entries = Object.entries(values as Record<string, number>)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .sort(([, a], [, b]) => b - a);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total === 0) return null;
    return {
      date,
      segments: entries.map(([name, value]) => ({
        name,
        value,
        pct: Math.round((value / total) * 1000) / 10,
      })),
    };
  })();

  // Insider trading (FMP)
  const insiderRaw = Array.isArray(fmpInsider) ? fmpInsider : (fmpInsider?.data ?? []);
  const insider_trades = insiderRaw.slice(0, 8).map((t: any) => ({
    name: t.reportingName ?? t.reportingOwner ?? "Unknown",
    role: t.typeOfOwner ?? "",
    transaction_type: t.transactionType ?? t.acquisitionOrDisposition ?? "",
    shares: t.securitiesTransacted != null ? Number(t.securitiesTransacted) : null,
    price: t.price != null ? Number(t.price) : null,
    date: t.transactionDate ?? t.filingDate ?? "",
    disposition: t.acquistionOrDisposition ?? "",
  }));

  return NextResponse.json({
    ticker,
    earnings_surprises,
    price_target,
    recommendation_trend,
    news,
    key_metrics,
    insider_trades,
    revenue_segments,
    revenue_geo,
    sources: {
      earnings_surprises: fhKey ? "Finnhub" : null,
      price_target: fhKey ? "Finnhub" : null,
      recommendation_trend: fhKey ? "Finnhub" : null,
      news: fhKey ? "Finnhub" : null,
      key_metrics: fmpKey ? "Financial Modeling Prep" : null,
      insider_trades: fmpKey ? "Financial Modeling Prep" : null,
      revenue_segments: fmpKey ? "Financial Modeling Prep" : null,
      revenue_geo: fmpKey ? "Financial Modeling Prep" : null,
    },
  });
}
