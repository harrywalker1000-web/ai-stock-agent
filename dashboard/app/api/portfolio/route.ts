import { NextResponse } from "next/server";
import {
  MOCK_POSITIONS,
  MOCK_PORTFOLIO_STATS,
  MOCK_PORTFOLIO_HISTORY,
  MOCK_SECTOR_ALLOCATION,
} from "@/lib/mock-data";

// Static JSON imports — guaranteed bundled by Next.js/Vercel
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import committeeReportRaw from "../../../data/reports/committee_report.json" assert { type: "json" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import positionsLogRaw from "../../../data/memory/positions_log.json" assert { type: "json" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import decisionLogRaw from "../../../data/memory/decision_log.json" assert { type: "json" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const committeeReport: any = committeeReportRaw;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const positionsLog: any = positionsLogRaw;
void decisionLogRaw; // reserved for future accuracy tracking

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAlpacaPositions(): Promise<any[] | null> {
  const key    = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base   = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return null;
  try {
    const res = await fetch(`${base}/v2/positions`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAlpacaAccount(): Promise<any | null> {
  const key    = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base   = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return null;
  try {
    const res = await fetch(`${base}/v2/account`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAlpacaHistory(): Promise<{ date: string; value: number }[]> {
  const key    = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base   = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return [];
  try {
    const res = await fetch(`${base}/v2/account/portfolio/history?period=1M&timeframe=1D`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.timestamp ?? []).map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      value: data.equity[i] ?? 0,
    })).filter((d: { value: number }) => d.value > 0);
  } catch { return []; }
}

// Static sector + company map for known tickers
const TICKER_META: Record<string, { sector: string; company: string }> = {
  // Technology
  NVDA:  { sector: "Technology",    company: "NVIDIA" },
  AMD:   { sector: "Technology",    company: "AMD" },
  SMCI:  { sector: "Technology",    company: "Super Micro" },
  AAPL:  { sector: "Technology",    company: "Apple" },
  MSFT:  { sector: "Technology",    company: "Microsoft" },
  GOOGL: { sector: "Technology",    company: "Alphabet" },
  META:  { sector: "Technology",    company: "Meta" },
  // Consumer Discretionary
  AMZN:  { sector: "Consumer Disc", company: "Amazon" },
  NKE:   { sector: "Consumer Disc", company: "Nike" },
  TSLA:  { sector: "Consumer Disc", company: "Tesla" },
  // Healthcare
  LLY:   { sector: "Healthcare",    company: "Eli Lilly" },
  MRK:   { sector: "Healthcare",    company: "Merck" },
  JNJ:   { sector: "Healthcare",    company: "Johnson & Johnson" },
  ABBV:  { sector: "Healthcare",    company: "AbbVie" },
  // Consumer Staples
  MKC:   { sector: "Consumer Stap", company: "McCormick" },
  EL:    { sector: "Consumer Stap", company: "Estée Lauder" },
  PG:    { sector: "Consumer Stap", company: "Procter & Gamble" },
  KO:    { sector: "Consumer Stap", company: "Coca-Cola" },
  // Materials
  AMCR:  { sector: "Materials",     company: "Amcor" },
  // Industrials
  LUV:   { sector: "Industrials",   company: "Southwest Air" },
  // Retail
  DG:    { sector: "Consumer Disc", company: "Dollar General" },
  HD:    { sector: "Consumer Disc", company: "Home Depot" },
  // Homebuilders
  LEN:   { sector: "Consumer Disc", company: "Lennar" },
};

const SECTOR_COLORS: Record<string, string> = {
  "Technology":    "#0EA5E9",
  "Consumer Disc": "#10B981",
  "Healthcare":    "#8B5CF6",
  "Consumer Stap": "#F59E0B",
  "Materials":     "#06B6D4",
  "Industrials":   "#F97316",
  "Cash":          "#374151",
  "Other":         "#6B7280",
};

export async function GET() {

  // Fetch live data from Alpaca in parallel
  const [alpacaPositions, alpacaAccount, alpacaHistory] = await Promise.all([
    fetchAlpacaPositions(),
    fetchAlpacaAccount(),
    fetchAlpacaHistory(),
  ]);

  // ── Positions: Alpaca is source of truth ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let positions: any[];

  if (alpacaPositions && alpacaPositions.length > 0) {
    const equity = alpacaAccount ? parseFloat(alpacaAccount.equity) : 100000;
  // Build scorecard map from committee report for per-agent scores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scorecardMap: Record<string, any> = {};
  for (const sc of committeeReport?.scorecards ?? []) {
    scorecardMap[sc.ticker] = sc;
  }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    positions = alpacaPositions.map((p: any) => {
      const ticker      = p.symbol as string;
      const meta        = TICKER_META[ticker] ?? { sector: "Other", company: ticker };
      const logEntry    = positionsLog?.[ticker];
      const sc          = scorecardMap[ticker];
      const marketValue = Math.abs(parseFloat(p.market_value));
      const unrealisedPct = parseFloat(p.unrealized_plpc) * 100;
      return {
        ticker,
        company:       logEntry?.company ?? meta.company,
        sector:        logEntry?.sector  ?? meta.sector,
        direction:     p.side === "short" ? "short" : "long",
        entry_price:   parseFloat(p.avg_entry_price),
        current_price: parseFloat(p.current_price),
        pct_change:    parseFloat(unrealisedPct.toFixed(2)),
        pnl_absolute:  parseFloat(parseFloat(p.unrealized_pl).toFixed(2)),
        position_size: parseFloat(marketValue.toFixed(2)),
        pct_portfolio: parseFloat((marketValue / equity * 100).toFixed(2)),
        qty:           parseFloat(p.qty),
        entry_date:    logEntry?.entry_date ?? "—",
        conviction:    sc?.composite_score ?? logEntry?.conviction ?? null,
        status:        "open",
        setup_type:         logEntry?.setup_type ?? "Pipeline",
        expected_roi:       logEntry?.expected_roi ?? "—",
        fundamental_score:  sc?.fundamental_score ?? null,
        quant_score:        sc?.quant_score ?? null,
        sentiment_score:    sc?.sentiment_score ?? null,
        composite_score:    sc?.composite_score ?? null,
      };
    });
  } else if (positionsLog && Object.keys(positionsLog).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    positions = Object.values(positionsLog).map((p: any) => ({
      ticker:        p.ticker ?? "—",
      company:       p.company ?? TICKER_META[p.ticker]?.company ?? p.ticker,
      sector:        p.sector  ?? TICKER_META[p.ticker]?.sector  ?? "—",
      direction:     (p.direction ?? "long").toLowerCase(),
      entry_price:   p.entry_price ?? 0,
      current_price: p.current_price ?? p.entry_price ?? 0,
      pct_change:    0,
      pnl_absolute:  0,
      position_size: 0,
      pct_portfolio: p.size_pct ?? 0,
      qty:           0,
      entry_date:    p.entry_date ?? "—",
      conviction:    p.conviction ?? 70,
      status:        p.status ?? "pending",
      setup_type:    p.setup_type ?? "Pipeline",
      expected_roi:  p.expected_roi ?? "—",
    }));
  } else {
    positions = MOCK_POSITIONS;
  }

  // ── Stats: all from live Alpaca account ───────────────────────────────────
  let stats;
  if (alpacaAccount) {
    const equity     = parseFloat(alpacaAccount.equity);
    const longMv     = parseFloat(alpacaAccount.long_market_value  ?? "0");
    const shortMv    = Math.abs(parseFloat(alpacaAccount.short_market_value ?? "0"));
    const deployed   = longMv + shortMv;
    const lastEquity = parseFloat(alpacaAccount.last_equity ?? alpacaAccount.equity);
    const dailyPnl   = equity - lastEquity;
    const totalPnl   = equity - 100000;
    // deployed_pct capped at 100% for display — margin is a separate flag
    const deployedPct = Math.min((deployed / equity) * 100, 100);
    const usingMargin = deployed > equity;
    stats = {
      total_value:        equity,
      cash:               Math.max(parseFloat(alpacaAccount.cash), 0),
      deployed:           deployed,
      deployed_pct:       parseFloat(deployedPct.toFixed(1)),
      total_pnl_pct:      parseFloat(((totalPnl / 100000) * 100).toFixed(2)),
      total_pnl_absolute: parseFloat(totalPnl.toFixed(2)),
      daily_pnl_pct:      parseFloat((lastEquity > 0 ? (dailyPnl / lastEquity) * 100 : 0).toFixed(2)),
      daily_pnl_absolute: parseFloat(dailyPnl.toFixed(2)),
      active_positions:   positions.length,
      pipeline_status:    "success",
      pipeline_last_run:  committeeReport?.generated_at ?? "—",
      margin_warning:     usingMargin,
      _source:            "alpaca_live",
    };
  } else {
    stats = {
      ...MOCK_PORTFOLIO_STATS,
      active_positions:  positions.length,
      pipeline_last_run: committeeReport?.generated_at ?? "—",
    };
  }

  // ── Sector allocation: from real positions + Cash slice ───────────────────
  // Always use equity as the denominator so percentages reflect share of NAV.
  // Cash = equity minus sum of |market values|. When margin is in use,
  // deployedTotal > equity, so cashSlice is 0 and sectors sum to >100% of equity —
  // we normalise the whole thing so it always adds to exactly 100%.
  const equity = alpacaAccount ? parseFloat(alpacaAccount.equity) : 100000;
  const sectorDollars: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of positions as any[]) {
    if (p.position_size > 0) {
      const s = (p.sector && p.sector !== "—") ? p.sector : "Other";
      sectorDollars[s] = (sectorDollars[s] ?? 0) + p.position_size;
    }
  }
  const deployedTotal = Object.values(sectorDollars).reduce((a, b) => a + b, 0);
  const cashSlice = Math.max(equity - deployedTotal, 0);
  if (cashSlice > 0) sectorDollars["Cash"] = cashSlice;

  // Normalise: divide each sector by grandTotal so values always sum to 100%.
  const grandTotal = Object.values(sectorDollars).reduce((a, b) => a + b, 0);
  let sectors = grandTotal > 0
    ? Object.entries(sectorDollars)
        .sort((a, b) => b[1] - a[1])
        .map(([sector, dollars]) => ({
          sector,
          value: parseFloat(((dollars / grandTotal) * 100).toFixed(1)),
          color: SECTOR_COLORS[sector] ?? "#6B7280",
        }))
    : MOCK_SECTOR_ALLOCATION;

  // Safety net: floating-point rounding or upstream data issues can cause drift.
  // Re-normalise if the sum is meaningfully off from 100%.
  const sectorSum = sectors.reduce((s, e) => s + e.value, 0);
  if (sectorSum > 0 && Math.abs(sectorSum - 100) > 0.2) {
    sectors = sectors.map((e) => ({
      ...e,
      value: parseFloat(((e.value / sectorSum) * 100).toFixed(1)),
    }));
  }

  const history = alpacaHistory.length > 0 ? alpacaHistory : MOCK_PORTFOLIO_HISTORY;

  // ── Agent conviction: avg score per agent across entered positions ─────────
  // Sourced from committee scorecards — honest signal strength, NOT accuracy.
  // Real accuracy tracking starts when positions close (needs closed P&L).
  const AGENT_KEYS = [
    { label: "Fundamental", key: "fundamental_score" },
    { label: "Quant",       key: "quant_score" },
    { label: "Sentiment",   key: "sentiment_score" },
  ];
  // decisionLogRaw reserved for future accuracy tracking when positions close

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentConviction = AGENT_KEYS.map(({ label, key }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scores = (positions as any[])
      .map((p) => p[key])
      .filter((s: unknown) => typeof s === "number" && (s as number) > 0) as number[];
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { name: label, score: avg, count: scores.length, source: "committee_scorecard" };
  });

  return NextResponse.json({
    positions,
    stats,
    history,
    sectors,
    agent_conviction: agentConviction,
    _positions_closed: 0, // increment when exits start — enables real accuracy
    _source: alpacaAccount ? "alpaca_live" : positionsLog ? "positions_log" : "mock",
  });
}
