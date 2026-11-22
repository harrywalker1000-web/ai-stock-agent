/**
 * Stock-split correction for Alpaca positions.
 *
 * On a split's ex-date Alpaca (paper in particular) can price a position at the
 * post-split price while still holding the PRE-split share count and cost basis —
 * e.g. SNDK 8:1 on 2026-11-20: 8 sh @ $850 avg vs an $89 price, a fake −89%.
 * Everything here is deterministic: split ratios come from Alpaca's
 * corporate-actions API, "has the broker applied it yet?" comes from the
 * filled-order history, and corrected values are plain arithmetic.
 * Mirrors agents/trade_executor.py::_get_alpaca_positions on the pipeline side.
 */

const DATA_BASE = "https://data.alpaca.markets";
const LOOKBACK_DAYS = 60;

export interface PendingSplit {
  symbol: string;
  ratio: number;        // new_rate / old_rate (8 for an 8:1 forward split)
  ex_date: string;      // YYYY-MM-DD (New York)
  broker_qty: number;   // the stale share count Alpaca still reports
}

function creds() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return null;
  return { base, headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } };
}

/** Today's date in New York (corporate-action dates are exchange-local). */
export function nyDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

interface SplitAction { symbol: string; ratio: number; ex_date: string }

async function fetchSplits(symbols: string[]): Promise<SplitAction[]> {
  const c = creds();
  if (!c || symbols.length === 0) return [];
  const today = nyDate();
  const start = nyDate(new Date(Date.now() - LOOKBACK_DAYS * 86400_000));
  const url = `${DATA_BASE}/v1/corporate-actions?symbols=${encodeURIComponent(symbols.join(","))}` +
    `&types=forward_split,reverse_split&start=${start}&end=${today}&limit=1000`;
  try {
    const res = await fetch(url, { headers: c.headers, next: { revalidate: 3600 } });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ca: any = (await res.json())?.corporate_actions ?? {};
    const out: SplitAction[] = [];
    for (const kind of ["forward_splits", "reverse_splits"]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (ca[kind] ?? []) as any[]) {
        const oldR = parseFloat(a.old_rate), newR = parseFloat(a.new_rate);
        if (!(oldR > 0) || !(newR > 0) || !a.ex_date || a.ex_date > today) continue;
        out.push({ symbol: a.symbol, ratio: newR / oldR, ex_date: a.ex_date });
      }
    }
    return out;
  } catch { return []; }
}

async function brokerHasNotApplied(symbol: string, qty: number, split: SplitAction): Promise<boolean> {
  const c = creds();
  if (!c) return false;
  try {
    const res = await fetch(
      `${c.base}/v2/orders?status=all&symbols=${encodeURIComponent(symbol)}&limit=500&direction=asc`,
      { headers: c.headers, next: { revalidate: 300 } },
    );
    if (!res.ok) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders: any[] = await res.json();
    let pre = 0, post = 0;
    for (const o of orders) {
      const filled = parseFloat(o.filled_qty ?? "0");
      if (!filled || !o.filled_at) continue;
      const signed = o.side === "buy" ? filled : -filled;
      if (nyDate(new Date(o.filled_at)) < split.ex_date) pre += signed; else post += signed;
    }
    const unadjusted = pre + post;
    const adjusted = pre * split.ratio + post;
    return Math.abs(qty - unadjusted) < 1e-6 && Math.abs(qty - adjusted) > 1e-6;
  } catch { return false; }
}

/** Splits Alpaca hasn't applied yet, keyed by symbol. Empty on any failure. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findPendingSplits(alpacaPositions: any[]): Promise<Record<string, PendingSplit>> {
  const bySymbol: Record<string, number> = {};
  for (const p of alpacaPositions ?? []) bySymbol[p.symbol] = Math.abs(parseFloat(p.qty));
  const splits = await fetchSplits(Object.keys(bySymbol));
  const out: Record<string, PendingSplit> = {};
  await Promise.all(splits.map(async (s) => {
    const qty = bySymbol[s.symbol];
    if (qty === undefined || out[s.symbol]) return;
    if (await brokerHasNotApplied(s.symbol, qty, s)) {
      out[s.symbol] = { symbol: s.symbol, ratio: s.ratio, ex_date: s.ex_date, broker_qty: qty };
    }
  }));
  return out;
}

/**
 * Return a corrected copy of a raw Alpaca position (same string-field shape the
 * routes already parse), plus the market-value change the correction introduces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function correctPosition(p: any, s: PendingSplit): { position: any; mvDelta: number } {
  const sign = p.side === "short" ? -1 : 1;
  const qty = parseFloat(p.qty) * s.ratio;
  const avg = parseFloat(p.avg_entry_price) / s.ratio;
  const price = parseFloat(p.current_price);
  const lastday = parseFloat(p.lastday_price ?? p.current_price);
  const mv = sign * qty * price;
  const cost = parseFloat(p.cost_basis ?? String(parseFloat(p.qty) * parseFloat(p.avg_entry_price)));
  const upl = mv - sign * Math.abs(cost);
  const mvDelta = mv - parseFloat(p.market_value);
  return {
    mvDelta,
    position: {
      ...p,
      qty: String(qty),
      qty_available: String(qty),
      avg_entry_price: String(avg),
      market_value: String(mv),
      unrealized_pl: String(upl),
      unrealized_plpc: String(cost ? upl / Math.abs(cost) : 0),
      unrealized_intraday_pl: String(sign * qty * (price - lastday)),
      _split_correction: { ratio: s.ratio, ex_date: s.ex_date, broker_qty: s.broker_qty },
    },
  };
}

/**
 * Equity-history correction per NY date: on/after a pending split's ex-date Alpaca
 * values the stale share count at the post-split close, so true equity that day is
 * higher (forward split) by (ratio − 1) × broker_qty × close.
 */
export async function splitHistoryDeltas(
  pending: Record<string, PendingSplit>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawPositions: any[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of Object.values(pending)) {
    const closes = await fetchDailyCloses(s.symbol, s.ex_date);
    const sign = rawPositions.find((p) => p.symbol === s.symbol)?.side === "short" ? -1 : 1;
    for (const [d, close] of Object.entries(closes)) {
      if (d >= s.ex_date) out[d] = (out[d] ?? 0) + sign * (s.ratio - 1) * s.broker_qty * close;
    }
  }
  return out;
}

/**
 * Daily closes (split-adjusted, i.e. post-split prices — the same basis Alpaca
 * marks the stale position at) for history correction, keyed by YYYY-MM-DD.
 */
export async function fetchDailyCloses(symbol: string, start: string): Promise<Record<string, number>> {
  const c = creds();
  if (!c) return {};
  try {
    const res = await fetch(
      `${DATA_BASE}/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Day&start=${start}&adjustment=split&feed=iex&limit=1000`,
      { headers: c.headers, next: { revalidate: 3600 } },
    );
    if (!res.ok) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bars: any[] = (await res.json())?.bars ?? [];
    const out: Record<string, number> = {};
    for (const b of bars) out[nyDate(new Date(b.t))] = b.c;
    return out;
  } catch { return {}; }
}
