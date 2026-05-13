/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

const FMP = "https://financialmodelingprep.com/api";

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
  if (!fmpKey) {
    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 });
  }

  const [fmpIncome, fmpMetricsHistory, fmpEstimates, fmpProfile, fmpPTC] = await Promise.all([
    safe(`${FMP}/v3/income-statement/${ticker}?limit=5&period=annual&apikey=${fmpKey}`),
    safe(`${FMP}/v3/key-metrics/${ticker}?limit=5&period=annual&apikey=${fmpKey}`),
    safe(`${FMP}/v3/analyst-estimates/${ticker}?limit=4&period=quarterly&apikey=${fmpKey}`),
    safe(`${FMP}/v3/profile/${ticker}?apikey=${fmpKey}`),
    safe(`${FMP}/v3/price-target-consensus?symbol=${ticker}&apikey=${fmpKey}`),
  ]);

  const income_statement = Array.isArray(fmpIncome)
    ? fmpIncome.map((row: any) => ({
        date: row.date ?? null,
        year: row.calendarYear ?? (row.date ? row.date.split("-")[0] : null),
        revenue: row.revenue ?? null,
        gross_profit: row.grossProfit ?? null,
        ebitda: row.ebitda ?? null,
        net_income: row.netIncome ?? null,
        eps: row.eps ?? null,
        eps_diluted: row.epsdiluted ?? null,
        gross_margin: row.grossProfitRatio ?? null,
        ebitda_margin: row.ebitdaratio ?? null,
        net_margin: row.netIncomeRatio ?? null,
      }))
    : [];

  const key_metrics_history = Array.isArray(fmpMetricsHistory)
    ? fmpMetricsHistory.map((row: any) => ({
        date: row.date ?? null,
        year: row.calendarYear ?? (row.date ? row.date.split("-")[0] : null),
        ev_ebitda: row.enterpriseValueOverEBITDA ?? null,
        roic: row.roic ?? null,
        pb_ratio: row.pbRatio ?? null,
        pe_ratio: row.peRatio ?? null,
        fcf_yield: row.freeCashFlowYield ?? null,
        ev_revenue: row.evToSales ?? null,
      }))
    : [];

  const analyst_estimates = Array.isArray(fmpEstimates)
    ? fmpEstimates.map((row: any) => ({
        date: row.date ?? null,
        estimated_revenue_low: row.estimatedRevenueLow ?? null,
        estimated_revenue_avg: row.estimatedRevenueAvg ?? null,
        estimated_revenue_high: row.estimatedRevenueHigh ?? null,
        estimated_eps_low: row.estimatedEpsLow ?? null,
        estimated_eps_avg: row.estimatedEpsAvg ?? null,
        estimated_eps_high: row.estimatedEpsHigh ?? null,
        number_analyst_estimated_revenue: row.numberAnalystEstimatedRevenue ?? null,
        number_analysts_estimated_eps: row.numberAnalystsEstimatedEps ?? null,
      }))
    : [];

  const profileRaw = Array.isArray(fmpProfile) && fmpProfile.length > 0 ? fmpProfile[0] : null;
  const company_profile = profileRaw ? {
    name: profileRaw.companyName ?? null,
    description: profileRaw.description ?? null,
    ceo: profileRaw.ceo ?? null,
    sector: profileRaw.sector ?? null,
    industry: profileRaw.industry ?? null,
    country: profileRaw.country ?? null,
    employees: profileRaw.fullTimeEmployees ?? null,
    website: profileRaw.website ?? null,
    exchange: profileRaw.exchangeShortName ?? null,
    ipo_date: profileRaw.ipoDate ?? null,
    image: profileRaw.image ?? null,
  } : null;

  // FMP price target consensus
  const pt_consensus = fmpPTC && typeof fmpPTC === "object" && !Array.isArray(fmpPTC) && fmpPTC.targetConsensus != null ? {
    high:   fmpPTC.targetHigh     ?? null,
    low:    fmpPTC.targetLow      ?? null,
    mean:   fmpPTC.targetConsensus ?? null,
    median: fmpPTC.targetMedian   ?? null,
  } : null;

  return NextResponse.json({
    ticker,
    company_profile,
    income_statement,
    key_metrics_history,
    analyst_estimates,
    pt_consensus,
    source: "Financial Modeling Prep",
  });
}
