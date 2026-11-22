/**
 * Portfolio vs SPY — pure, deterministic maths (no I/O; see app/api/benchmark).
 *
 * Portfolio: time-weighted return index from Alpaca daily equity + daily P&L, so a
 *   deposit/withdrawal never shows up as performance: r_t = P&L_t / equity_{t-1}.
 * SPY: dividend-adjusted daily closes.
 * Alignment: only dates present in BOTH series (NY trading days).
 * Each period is rebased to 0% at its own start point — the last aligned close on
 * or before the period cutoff — and returns are ratios (compounded), never
 * differences of cumulative percentages.
 */

export interface EquityPoint { date: string; equity: number; pl: number }
export interface IndexPoint { date: string; index: number }
export interface AlignedPoint { date: string; portfolio: number; spy: number }

export type PeriodKey = "1W" | "1M" | "6M" | "YTD" | "All";
export const PERIODS: PeriodKey[] = ["1W", "1M", "6M", "YTD", "All"];

export interface PeriodResult {
  start_date: string | null;
  end_date: string | null;
  portfolio_return_pct: number | null;
  spy_return_pct: number | null;
  alpha: number | null;                       // percentage points
  note?: "since_inception" | "insufficient_history";
  series: Array<{ date: string; portfolio_pct: number; spy_pct: number }>;
}

/** Time-weighted index, 100 at the first point with positive equity. */
export function twrIndex(points: EquityPoint[]): IndexPoint[] {
  const out: IndexPoint[] = [];
  let prevEquity: number | null = null;
  let idx = 100;
  for (const p of points) {
    if (!(p.equity > 0)) continue;
    if (prevEquity == null) {
      out.push({ date: p.date, index: idx });
    } else {
      idx = idx * (1 + p.pl / prevEquity);
      out.push({ date: p.date, index: idx });
    }
    prevEquity = p.equity;
  }
  return out;
}

export function align(portfolio: IndexPoint[], spyCloses: Record<string, number>): AlignedPoint[] {
  return portfolio
    .filter((p) => typeof spyCloses[p.date] === "number" && spyCloses[p.date] > 0)
    .map((p) => ({ date: p.date, portfolio: p.index, spy: spyCloses[p.date] }));
}

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computePeriod(aligned: AlignedPoint[], key: PeriodKey): PeriodResult {
  const empty: PeriodResult = {
    start_date: null, end_date: null, portfolio_return_pct: null, spy_return_pct: null,
    alpha: null, note: "insufficient_history", series: [],
  };
  if (aligned.length < 2) return empty;
  const last = aligned[aligned.length - 1];

  let startIdx: number;
  let note: PeriodResult["note"];
  if (key === "All") {
    startIdx = 0;
  } else {
    const cutoff = key === "YTD"
      ? `${last.date.slice(0, 4)}-01-01`
      : minusDays(last.date, key === "1W" ? 7 : key === "1M" ? 30 : 182);
    // YTD starts from the last close of the previous year (strictly before Jan 1);
    // the others from the last close on or before the cutoff date.
    startIdx = -1;
    for (let i = 0; i < aligned.length; i++) {
      const ok = key === "YTD" ? aligned[i].date < cutoff : aligned[i].date <= cutoff;
      if (ok) startIdx = i; else break;
    }
    if (startIdx === -1) { startIdx = 0; note = "since_inception"; }
  }
  if (startIdx >= aligned.length - 1) return empty;

  const start = aligned[startIdx];
  const series = aligned.slice(startIdx).map((p) => ({
    date: p.date,
    portfolio_pct: round((p.portfolio / start.portfolio - 1) * 100),
    spy_pct: round((p.spy / start.spy - 1) * 100),
  }));
  const pr = (last.portfolio / start.portfolio - 1) * 100;
  const sr = (last.spy / start.spy - 1) * 100;
  return {
    start_date: start.date,
    end_date: last.date,
    portfolio_return_pct: round(pr),
    spy_return_pct: round(sr),
    alpha: round(pr - sr),
    ...(note ? { note } : {}),
    series,
  };
}

export function computeAll(aligned: AlignedPoint[]): Record<PeriodKey, PeriodResult> {
  return Object.fromEntries(PERIODS.map((k) => [k, computePeriod(aligned, k)])) as Record<PeriodKey, PeriodResult>;
}
