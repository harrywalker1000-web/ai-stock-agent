import { NextResponse } from "next/server";
import { findPendingSplits, correctPosition, fetchDailyCloses, nyDate } from "@/lib/splits";

// Static JSON imports — guaranteed bundled by Next.js/Vercel
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import committeeReportRaw from "../../../data/reports/committee_report.json";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import positionsLogRaw from "../../../data/memory/positions_log.json";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import decisionLogRaw from "../../../data/memory/decision_log.json";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import pipelineResultRaw from "../../../data/reports/pipeline_result.json";

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
interface StopOrderInfo {
  stop_price: number;
  order_type: string;   // "stop" | "stop_limit" | "trailing_stop" | "bracket"
  trail_percent?: number;
  limit_price?: number;
}

async function fetchAlpacaStopOrders(): Promise<Record<string, StopOrderInfo>> {
  const key    = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base   = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return {};
  try {
    const res = await fetch(`${base}/v2/orders?status=open&limit=200`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
      next: { revalidate: 60 },
    });
    if (!res.ok) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders: any[] = await res.json();
    // Build {ticker: StopOrderInfo} from open protective orders
    const stopMap: Record<string, StopOrderInfo> = {};
    for (const o of orders) {
      const isProtective = ["stop", "stop_limit", "trailing_stop"].includes(o.type) ||
        (o.type === "market" && o.order_class === "bracket");
      if (!isProtective) continue;
      const stopPrice = o.stop_price ? parseFloat(o.stop_price) : 0;
      const orderType = o.order_class === "bracket" ? "bracket" : o.type;
      stopMap[o.symbol] = {
        stop_price: stopPrice,
        order_type: orderType,
        ...(o.trail_percent ? { trail_percent: parseFloat(o.trail_percent) } : {}),
        ...(o.limit_price   ? { limit_price:   parseFloat(o.limit_price)   } : {}),
      };
    }
    return stopMap;
  } catch { return {}; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Full account history (period=all) — the dashboard's 3M / All views need more than
// one month, and base_value is the account's starting capital (Total P&L baseline).
let historyBaseValue: number | null = null;
async function fetchAlpacaHistory(): Promise<{ date: string; value: number }[]> {
  const key    = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base   = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return [];
  try {
    const res = await fetch(`${base}/v2/account/portfolio/history?period=all&timeframe=1D`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    historyBaseValue = typeof data.base_value === "number" && data.base_value > 0 ? data.base_value : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Alpaca stamps each daily point at 20:00 New York time (01:00 UTC next day) —
    // the UTC date is the following calendar day, so label in New York time.
    return (data.timestamp ?? []).map((ts: number, i: number) => ({
      date: nyDate(new Date(ts * 1000)),
      value: data.equity[i] ?? 0,
    })).filter((d: { value: number }) => d.value > 0);
  } catch { return []; }
}

// Company names from Alpaca's asset records (cached a day). "Sandisk Corporation Common
// Stock" → "Sandisk Corporation".
async function fetchAssetNames(symbols: string[]): Promise<Record<string, string>> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return {};
  const out: Record<string, string> = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const res = await fetch(`${base}/v2/assets/${encodeURIComponent(sym)}`, {
        headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
        next: { revalidate: 86400 },
      });
      if (!res.ok) return;
      const name = String((await res.json())?.name ?? "")
        .replace(/\s+(Class [A-Z] )?(Common|Ordinary|Capital) (Stock|Shares)\b.*$/i, "")
        .replace(/\s+(American Depositary Shares|ADS)\b.*$/i, "")
        .trim();
      if (name) out[sym] = name;
    } catch { /* fall back to static map */ }
  }));
  return out;
}

// Pipeline health from the last run's result file — not merely "Alpaca answered".
// A run that finishes in minutes with nothing reviewed is the LLM-credit-outage pattern.
function pipelineHealth(): { status: "success" | "degraded" | "stale" | "unknown"; detail: string; date: string | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pr: any = pipelineResultRaw;
  const date: string | null = pr?.date ?? null;
  if (!date) return { status: "unknown", detail: "No pipeline result found", date: null };
  const ageDays = (Date.now() - new Date(`${date}T12:00:00Z`).getTime()) / 86400_000;
  const sum = pr.pipeline_summary ?? {};
  const reviewed = Number(sum.phase_a_positions_reviewed ?? 0);
  const candidates = Number(sum.phase_b_candidates ?? 0);
  const elapsed = Number(pr.total_elapsed_sec ?? sum.total_elapsed_sec ?? 0);
  if (ageDays > 4) return { status: "stale", detail: `Last run ${date}`, date };
  if ((reviewed === 0 && candidates === 0) || (elapsed > 0 && elapsed < 600)) {
    return { status: "degraded", detail: `Last run ${date} finished in ${Math.round(elapsed / 60)} min with ${reviewed} positions reviewed, ${candidates} candidates — check LLM credit`, date };
  }
  return { status: "success", detail: `Last run ${date}: ${reviewed} reviewed, ${candidates} candidates, ${Math.round(elapsed / 60)} min`, date };
}

// Static sector + company map — last-resort fallback only.
// Primary source: logEntry?.fund_mandate?.sector (stored by pipeline at entry time).
const TICKER_META: Record<string, { sector: string; company: string }> = {
  // Technology
  NVDA:  { sector: "Technology",         company: "NVIDIA" },
  AMD:   { sector: "Technology",         company: "AMD" },
  SMCI:  { sector: "Technology",         company: "Super Micro" },
  AAPL:  { sector: "Technology",         company: "Apple" },
  MSFT:  { sector: "Technology",         company: "Microsoft" },
  GOOGL: { sector: "Technology",         company: "Alphabet" },
  META:  { sector: "Technology",         company: "Meta" },
  ADBE:  { sector: "Technology",         company: "Adobe" },
  CRM:   { sector: "Technology",         company: "Salesforce" },
  CTSH:  { sector: "Technology",         company: "Cognizant" },
  ACN:   { sector: "Technology",         company: "Accenture" },
  // Financial Services
  JPM:   { sector: "Financial Services", company: "JPMorgan Chase" },
  V:     { sector: "Financial Services", company: "Visa" },
  MA:    { sector: "Financial Services", company: "Mastercard" },
  GS:    { sector: "Financial Services", company: "Goldman Sachs" },
  BAC:   { sector: "Financial Services", company: "Bank of America" },
  // Healthcare
  LLY:   { sector: "Healthcare",         company: "Eli Lilly" },
  MRK:   { sector: "Healthcare",         company: "Merck" },
  JNJ:   { sector: "Healthcare",         company: "Johnson & Johnson" },
  ABBV:  { sector: "Healthcare",         company: "AbbVie" },
  BSX:   { sector: "Healthcare",         company: "Boston Scientific" },
  UNH:   { sector: "Healthcare",         company: "UnitedHealth" },
  // Consumer Discretionary
  AMZN:  { sector: "Consumer Disc",      company: "Amazon" },
  NKE:   { sector: "Consumer Disc",      company: "Nike" },
  TSLA:  { sector: "Consumer Disc",      company: "Tesla" },
  DG:    { sector: "Consumer Disc",      company: "Dollar General" },
  HD:    { sector: "Consumer Disc",      company: "Home Depot" },
  LEN:   { sector: "Consumer Disc",      company: "Lennar" },
  NFLX:  { sector: "Consumer Disc",      company: "Netflix" },
  // Consumer Staples
  MKC:   { sector: "Consumer Stap",      company: "McCormick" },
  EL:    { sector: "Consumer Stap",      company: "Estée Lauder" },
  PG:    { sector: "Consumer Stap",      company: "P&G" },
  KO:    { sector: "Consumer Stap",      company: "Coca-Cola" },
  // Energy
  CVX:   { sector: "Energy",             company: "Chevron" },
  XOM:   { sector: "Energy",             company: "ExxonMobil" },
  OXY:   { sector: "Energy",             company: "Occidental" },
  // Communications
  VZ:    { sector: "Communications",     company: "Verizon" },
  T:     { sector: "Communications",     company: "AT&T" },
  // Industrials / Aerospace
  LUV:   { sector: "Industrials",        company: "Southwest Air" },
  RKLB:  { sector: "Industrials",        company: "Rocket Lab" },
  // Materials
  AMCR:  { sector: "Materials",          company: "Amcor" },
};

const SECTOR_COLORS: Record<string, string> = {
  "Technology":         "#0EA5E9",
  "Financial Services": "#3B82F6",
  "Healthcare":         "#8B5CF6",
  "Consumer Disc":      "#10B981",
  "Consumer Stap":      "#F59E0B",
  "Energy":             "#EF4444",
  "Communications":     "#EC4899",
  "Industrials":        "#F97316",
  "Materials":          "#06B6D4",
  // Yahoo Finance sector names (what positions_log actually stores)
  "Consumer Defensive":     "#F59E0B",
  "Consumer Cyclical":      "#10B981",
  "Communication Services": "#EC4899",
  "Basic Materials":        "#06B6D4",
  "Utilities":              "#A3E635",
  "Real Estate":            "#D946EF",
  "Financial":              "#3B82F6",
  "Cash":               "#94A3B8",
  "Other":              "#6B7280",
};

export async function GET() {

  // Fetch live data from Alpaca in parallel
  const [rawPositions, rawAccount, rawHistory, stopOrders] = await Promise.all([
    fetchAlpacaPositions(),
    fetchAlpacaAccount(),
    fetchAlpacaHistory(),
    fetchAlpacaStopOrders(),
  ]);

  const assetNames = rawPositions ? await fetchAssetNames(rawPositions.map((p) => p.symbol)) : {};
  const health = pipelineHealth();
  const liveTrading = (process.env.ALPACA_BASE_URL ?? "").includes("api.alpaca.markets") &&
    !(process.env.ALPACA_BASE_URL ?? "").includes("paper-api") && process.env.ALLOW_LIVE_TRADING === "true";

  // ── Stock-split correction (see lib/splits.ts) ────────────────────────────
  // Positions Alpaca hasn't re-based after a split are corrected, and account
  // equity / history are shifted by the same deterministic market-value delta.
  const pendingSplits = rawPositions ? await findPendingSplits(rawPositions) : {};
  let mvDeltaTotal = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alpacaPositions = rawPositions?.map((p: any) => {
    const s = pendingSplits[p.symbol];
    if (!s) return p;
    const { position, mvDelta } = correctPosition(p, s);
    mvDeltaTotal += mvDelta;
    return position;
  }) ?? null;

  let alpacaHistory = rawHistory;
  const historyDelta: Record<string, number> = {};
  for (const s of Object.values(pendingSplits)) {
    const closes = await fetchDailyCloses(s.symbol, s.ex_date);
    const sign = rawPositions?.find((p) => p.symbol === s.symbol)?.side === "short" ? -1 : 1;
    for (const [d, close] of Object.entries(closes)) {
      if (d >= s.ex_date) historyDelta[d] = (historyDelta[d] ?? 0) + sign * (s.ratio - 1) * s.broker_qty * close;
    }
  }
  if (Object.keys(historyDelta).length) {
    alpacaHistory = rawHistory.map((h) => ({ ...h, value: h.value + (historyDelta[h.date] ?? 0) }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let alpacaAccount: any = rawAccount;
  if (rawAccount && mvDeltaTotal !== 0) {
    const eq = parseFloat(rawAccount.equity);
    const lastEq = parseFloat(rawAccount.last_equity ?? rawAccount.equity);
    // last_equity is the previous close; correct it only if that close was itself post-split.
    const prevIdx = rawHistory.findIndex((h) => Math.abs(h.value - lastEq) < 0.01);
    const lastEqDelta = prevIdx >= 0 ? (historyDelta[rawHistory[prevIdx].date] ?? 0) : 0;
    alpacaAccount = {
      ...rawAccount,
      equity: String(eq + mvDeltaTotal),
      portfolio_value: String(eq + mvDeltaTotal),
      last_equity: String(lastEq + lastEqDelta),
      long_market_value: String(parseFloat(rawAccount.long_market_value ?? "0") + Math.max(mvDeltaTotal, 0)),
      short_market_value: String(parseFloat(rawAccount.short_market_value ?? "0") + Math.min(mvDeltaTotal, 0)),
    };
  }

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
      // Sector priority: direct top-level field (never set today) → fund_mandate.sector
      // (stored by pipeline at entry) → TICKER_META → "Other"
      const resolvedSector: string =
        logEntry?.sector ?? logEntry?.fund_mandate?.sector ?? meta.sector;
      const sc          = scorecardMap[ticker];
      const marketValue = Math.abs(parseFloat(p.market_value));
      const unrealisedPct = parseFloat(p.unrealized_plpc) * 100;
      return {
        ticker,
        company:       assetNames[ticker] ?? logEntry?.company ?? TICKER_META[ticker]?.company ?? ticker,
        sector:        resolvedSector,
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
        conviction_source: sc?.composite_score != null ? "committee" : logEntry?.conviction != null ? "log" : null,
        entry_conviction: logEntry?.entry_conviction > 0 ? logEntry.entry_conviction : null,
        status:        "open",
        setup_type:         (() => {
          const raw = logEntry?.setup_type ?? "Pipeline";
          const dir = p.side === "short" ? "short" : "long";
          // "Short" is a fundamental thesis label — misleading on a long position; relabel
          if (raw === "Short" && dir === "long") return "Contrarian";
          return raw;
        })(),
        expected_roi:       logEntry?.expected_roi ?? "—",
        fundamental_score:  sc?.fundamental_score ?? null,
        quant_score:        sc?.quant_score ?? null,
        sentiment_score:    sc?.sentiment_score ?? null,
        composite_score:    sc?.composite_score ?? null,
        // Stop-loss: Alpaca open stop orders are source of truth
        stop_price:         stopOrders[ticker]?.stop_price ?? (
          // Log stop is per-share pre-split until the pipeline rescales it (splits_applied)
          p._split_correction && logEntry?.stop_loss && !(logEntry?.splits_applied ?? []).length
            ? parseFloat((logEntry.stop_loss / p._split_correction.ratio).toFixed(2))
            : logEntry?.stop_loss ?? null),
        has_native_stop:    ticker in stopOrders,
        native_order_type:  stopOrders[ticker]?.order_type ?? null,
        native_trail_pct:   stopOrders[ticker]?.trail_percent ?? null,
        native_limit_price: stopOrders[ticker]?.limit_price ?? null,
        split_correction:   p._split_correction ?? null,
      };
    });
  } else if (positionsLog && Object.keys(positionsLog).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    positions = Object.values(positionsLog).filter((p: any) => !p?.pending_confirmation).map((p: any) => ({
      ticker:        p.ticker ?? "—",
      company:       p.company ?? TICKER_META[p.ticker]?.company ?? p.ticker,
      sector:        p.sector ?? p.fund_mandate?.sector ?? TICKER_META[p.ticker]?.sector ?? "—",
      direction:     (p.direction ?? "long").toLowerCase(),
      entry_price:   p.entry_price ?? 0,
      current_price: p.current_price ?? p.entry_price ?? 0,
      pct_change:    0,
      pnl_absolute:  0,
      position_size: 0,
      pct_portfolio: p.size_pct ?? 0,
      qty:           0,
      entry_date:    p.entry_date ?? "—",
      conviction:    p.conviction ?? null,
      entry_conviction: p.entry_conviction ?? null,
      status:        p.status ?? "pending",
      setup_type:    p.setup_type ?? "Pipeline",
      expected_roi:  p.expected_roi ?? "—",
    }));
  } else {
    positions = [];
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
    // Baseline = Alpaca's account starting capital (portfolio history base_value)
    const baseline   = historyBaseValue;
    const totalPnl   = baseline != null ? equity - baseline : null;
    // deployed_pct capped at 100% for display — margin is a separate flag
    const deployedPct = Math.min((deployed / equity) * 100, 100);
    const usingMargin = deployed > equity;
    stats = {
      total_value:        equity,
      cash:               Math.max(parseFloat(alpacaAccount.cash), 0),
      deployed:           deployed,
      deployed_pct:       parseFloat(deployedPct.toFixed(1)),
      total_pnl_pct:      totalPnl != null && baseline ? parseFloat(((totalPnl / baseline) * 100).toFixed(2)) : null,
      total_pnl_absolute: totalPnl != null ? parseFloat(totalPnl.toFixed(2)) : null,
      starting_capital:   baseline,
      daily_pnl_pct:      parseFloat((lastEquity > 0 ? (dailyPnl / lastEquity) * 100 : 0).toFixed(2)),
      daily_pnl_absolute: parseFloat(dailyPnl.toFixed(2)),
      active_positions:   positions.length,
      pipeline_status:    health.status,
      pipeline_detail:    health.detail,
      pipeline_last_run:  health.date ?? committeeReport?.generated_at ?? "—",
      trading_mode:       liveTrading ? "live" : "paper",
      margin_warning:     usingMargin,
      split_corrections:  Object.values(pendingSplits),
      _source:            "alpaca_live",
    };
  } else {
    stats = {
      total_value:        0,
      cash:               0,
      deployed:           0,
      deployed_pct:       0,
      total_pnl_pct:      0,
      total_pnl_absolute: 0,
      daily_pnl_pct:      0,
      daily_pnl_absolute: 0,
      active_positions:   positions.length,
      pipeline_status:    "unknown",
      pipeline_last_run:  committeeReport?.generated_at ?? "—",
      margin_warning:     false,
      _source:            "no_data",
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
    : [];

  // Safety net: floating-point rounding or upstream data issues can cause drift.
  // Re-normalise if the sum is meaningfully off from 100%.
  const sectorSum = sectors.reduce((s, e) => s + e.value, 0);
  if (sectorSum > 0 && Math.abs(sectorSum - 100) > 0.2) {
    sectors = sectors.map((e) => ({
      ...e,
      value: parseFloat(((e.value / sectorSum) * 100).toFixed(1)),
    }));
  }

  const history = alpacaHistory;

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
