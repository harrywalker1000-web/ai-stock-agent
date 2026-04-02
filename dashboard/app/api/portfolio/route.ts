import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  MOCK_POSITIONS,
  MOCK_PORTFOLIO_STATS,
  MOCK_PORTFOLIO_HISTORY,
  MOCK_SECTOR_ALLOCATION,
} from "@/lib/mock-data";
import { dataDir } from "@/lib/data-path";

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

function readJson(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
        return parsed;
      }
    }
  } catch { /* fall through */ }
  return null;
}

export async function GET() {
  const resolvedDataDir = dataDir();
  const reportsDir = path.join(resolvedDataDir, "reports");

  const positionsLog    = readJson(path.join(resolvedDataDir, "memory", "positions_log.json"));
  const committeeReport = readJson(path.join(reportsDir, "committee_report.json"));

  // Fetch live data from Alpaca
  const [alpacaPositions, alpacaAccount] = await Promise.all([
    fetchAlpacaPositions(),
    fetchAlpacaAccount(),
  ]);

  // Build positions: merge positions_log (entry data) with live Alpaca prices
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let positions: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alpacaMap: Record<string, any> = {};
  if (alpacaPositions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of alpacaPositions) alpacaMap[p.symbol] = p;
  }

  if (positionsLog && Object.keys(positionsLog).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    positions = Object.values(positionsLog).map((p: any) => {
      const live = alpacaMap[p.ticker?.toUpperCase()];
      const currentPrice  = live ? parseFloat(live.current_price)  : (p.current_price ?? p.entry_price ?? 0);
      const entryPrice    = live ? parseFloat(live.avg_entry_price) : (p.entry_price ?? 0);
      const qty           = live ? parseFloat(live.qty)             : 0;
      const marketValue   = live ? parseFloat(live.market_value)    : 0;
      const unrealisedPnl = live ? parseFloat(live.unrealized_pl)   : 0;
      const unrealisedPct = live ? parseFloat(live.unrealized_plpc) * 100 : 0;
      const portfolioVal  = alpacaAccount ? parseFloat(alpacaAccount.equity) : 100000;
      return {
        ticker:        p.ticker ?? "—",
        company:       p.company ?? p.ticker ?? "—",
        sector:        p.sector ?? "—",
        direction:     (p.direction ?? "long").toLowerCase(),
        entry_price:   entryPrice,
        current_price: currentPrice,
        pct_change:    parseFloat(unrealisedPct.toFixed(2)),
        pnl_absolute:  parseFloat(unrealisedPnl.toFixed(2)),
        position_size: parseFloat(marketValue.toFixed(2)),
        pct_portfolio: parseFloat((marketValue / portfolioVal * 100).toFixed(2)),
        qty:           qty,
        entry_date:    p.entry_date ?? "—",
        conviction:    p.conviction ?? 70,
        status:        live ? "open" : (p.status ?? "pending"),
        setup_type:    p.setup_type ?? "Pipeline",
        expected_roi:  p.expected_roi ?? "—",
        _live:         !!live,
      };
    });
  } else if (committeeReport?.position_decisions?.length > 0) {
    const decisionDate = committeeReport.generated_at?.split(" ")[0] ?? new Date().toISOString().split("T")[0];
    positions = committeeReport.position_decisions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((d: any) => d.action?.includes("long") || d.action?.includes("short"))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((d: any) => {
        const live = alpacaMap[d.ticker?.toUpperCase()];
        return {
          ticker:        d.ticker,
          company:       d.ticker,
          sector:        "—",
          direction:     d.action?.includes("short") ? "short" : "long",
          entry_price:   live ? parseFloat(live.avg_entry_price) : 0,
          current_price: live ? parseFloat(live.current_price) : 0,
          pct_change:    live ? parseFloat(live.unrealized_plpc) * 100 : 0,
          pnl_absolute:  live ? parseFloat(live.unrealized_pl) : 0,
          position_size: live ? parseFloat(live.market_value) : 0,
          pct_portfolio: d.size_pct ?? 0,
          qty:           live ? parseFloat(live.qty) : 0,
          entry_date:    decisionDate,
          conviction:    d.conviction ?? 70,
          status:        live ? "open" : "pending",
          setup_type:    "Pipeline",
          expected_roi:  d.target_price ? `Target: $${d.target_price}` : "—",
          _live:         !!live,
        };
      });
  } else {
    positions = MOCK_POSITIONS;
  }

  // Stats from live Alpaca account
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeCount = positions.filter((p: any) => p.status === "open" || p.status === "hold").length;
  let stats;
  if (alpacaAccount) {
    const equity      = parseFloat(alpacaAccount.equity);
    const cash        = parseFloat(alpacaAccount.cash);
    const lastEquity  = parseFloat(alpacaAccount.last_equity ?? alpacaAccount.equity);
    const dailyPnl    = equity - lastEquity;
    const totalPnl    = equity - 100000; // vs starting $100k
    stats = {
      total_value:        equity,
      cash:               cash,
      deployed:           equity - cash,
      deployed_pct:       equity > 0 ? ((equity - cash) / equity) * 100 : 0,
      total_pnl_pct:      ((totalPnl / 100000) * 100),
      total_pnl_absolute: totalPnl,
      daily_pnl_pct:      lastEquity > 0 ? (dailyPnl / lastEquity) * 100 : 0,
      daily_pnl_absolute: dailyPnl,
      active_positions:   activeCount,
      pipeline_status:    "success",
      pipeline_last_run:  committeeReport?.generated_at ?? "—",
      buying_power:       parseFloat(alpacaAccount.buying_power ?? "0"),
      _source:            "alpaca_live",
    };
  } else {
    stats = { ...MOCK_PORTFOLIO_STATS, active_positions: activeCount,
              pipeline_last_run: committeeReport?.generated_at ?? "—" };
  }

  return NextResponse.json({
    positions,
    stats,
    history:  MOCK_PORTFOLIO_HISTORY,
    sectors:  MOCK_SECTOR_ALLOCATION,
    _source:  alpacaAccount ? "alpaca_live" : positionsLog ? "positions_log" : "mock",
  });
}
