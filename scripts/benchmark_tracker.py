"""
Benchmark Tracker — utility (not an agent)

Runs at the end of every pipeline to:
  1. Append current portfolio NAV to nav_history.json
  2. Fetch SPY prices for the same date range
  3. Compute cumulative returns for portfolio vs SPY
  4. Write benchmark_history.json (read by dashboard + Committee prompt)

Called by portfolio_manager.run() after all phases complete.
Also callable standalone: python scripts/benchmark_tracker.py
"""

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = ROOT / "data" / "memory"
REPORTS_DIR = ROOT / "data" / "reports"

NAV_HISTORY_PATH    = MEMORY_DIR / "nav_history.json"
BENCHMARK_PATH      = MEMORY_DIR / "benchmark_history.json"
PORTFOLIO_STATE_PATH = REPORTS_DIR / "portfolio_state.json"


def _load_json(path: Path, default=None):
    if not path.exists():
        return default if default is not None else {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Step 1 — Append NAV point
# ---------------------------------------------------------------------------

def append_nav_point(equity: float | None = None, run_date: str | None = None) -> dict:
    """
    Append today's equity to nav_history.json.
    Called once per pipeline run, after the executor writes portfolio_state.json.

    equity: pass directly or None to read from portfolio_state.json
    run_date: ISO date string, defaults to today
    """
    if equity is None:
        ps = _load_json(PORTFOLIO_STATE_PATH)
        equity = float(ps.get("equity") or ps.get("portfolio_value") or 0)

    if not run_date:
        run_date = datetime.utcnow().date().isoformat()

    nav_history: list = _load_json(NAV_HISTORY_PATH, default=[])

    # Deduplicate: if today already has an entry, update it (second pipeline run on same day)
    for entry in nav_history:
        if entry.get("date") == run_date:
            entry["equity"] = round(equity, 2)
            _save_json(NAV_HISTORY_PATH, nav_history)
            return {"updated": True, "date": run_date, "equity": equity}

    nav_history.append({"date": run_date, "equity": round(equity, 2)})
    nav_history.sort(key=lambda x: x["date"])
    _save_json(NAV_HISTORY_PATH, nav_history)
    return {"appended": True, "date": run_date, "equity": equity, "total_points": len(nav_history)}


# ---------------------------------------------------------------------------
# Step 2 — Compute benchmark history
# ---------------------------------------------------------------------------

def _fetch_spy_closes(start: str, end: str) -> dict[str, float]:
    """Fetch SPY adjusted-close prices and return {date_str: close}."""
    try:
        raw = yf.download("SPY", start=start, end=end, auto_adjust=True, progress=False)
        if raw.empty:
            return {}
        closes = raw["Close"]
        return {str(ts.date()): float(closes[ts]) for ts in closes.index}
    except Exception:
        return {}


def _cumulative_returns(nav_series: list[dict], spy_closes: dict[str, float]) -> list[dict]:
    """
    Compute daily cumulative returns for both portfolio and SPY,
    indexed to 0.0% at the inception date.

    Portfolio uses NAV history (equity values from each pipeline run).
    SPY uses the closest available close on/after each NAV date.

    For days between pipeline runs (weekends, non-run days) we carry
    forward the last known portfolio value. SPY fills daily.
    """
    if not nav_series:
        return []

    inception_equity = nav_series[0]["equity"]
    inception_date   = nav_series[0]["date"]

    # Get all SPY dates in range for daily series
    spy_dates = sorted(d for d in spy_closes if d >= inception_date)
    if not spy_dates:
        return []

    inception_spy = spy_closes.get(inception_date)
    if inception_spy is None:
        # Use first available SPY close on or after inception
        inception_spy = spy_closes[spy_dates[0]]

    # Build lookup: nav value per date (carry forward)
    nav_lookup: dict[str, float] = {}
    last_equity = inception_equity
    for entry in nav_series:
        last_equity = entry["equity"]
        nav_lookup[entry["date"]] = last_equity

    # Interpolate: for each SPY date, find the last known NAV on or before that date
    all_nav_dates = sorted(nav_lookup.keys())
    series = []
    last_known_equity = inception_equity

    for spy_date in spy_dates:
        # Find the most recent NAV on or before this date
        for nav_date in all_nav_dates:
            if nav_date <= spy_date:
                last_known_equity = nav_lookup[nav_date]
            else:
                break

        spy_close = spy_closes[spy_date]
        portfolio_cumulative = round((last_known_equity / inception_equity - 1) * 100, 3)
        spy_cumulative       = round((spy_close / inception_spy - 1) * 100, 3)

        series.append({
            "date":                 spy_date,
            "portfolio_cumulative": portfolio_cumulative,
            "spy_cumulative":       spy_cumulative,
        })

    return series


def _compute_period(series: list[dict], days: int | None, ytd: bool = False) -> dict:
    """
    Compute portfolio and SPY return for a given lookback period.
    Returns {"portfolio_return_pct", "spy_return_pct", "alpha"} or {"note": "insufficient_history"}.
    """
    if not series:
        return {"portfolio_return_pct": None, "spy_return_pct": None, "note": "no_data"}

    latest = series[-1]
    today  = latest["date"]

    if ytd:
        year_start = today[:4] + "-01-01"
        start_point = next((s for s in series if s["date"] >= year_start), None)
    elif days is not None:
        cutoff = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=days)).date().isoformat()
        start_point = next((s for s in series if s["date"] >= cutoff), None)
    else:
        start_point = None

    if start_point is None or start_point["date"] == today:
        return {"portfolio_return_pct": None, "spy_return_pct": None, "note": "insufficient_history"}

    port_return = round(latest["portfolio_cumulative"] - start_point["portfolio_cumulative"], 3)
    spy_return  = round(latest["spy_cumulative"]       - start_point["spy_cumulative"], 3)
    alpha       = round(port_return - spy_return, 3)

    return {
        "portfolio_return_pct": port_return,
        "spy_return_pct":       spy_return,
        "alpha":                alpha,
    }


def compute_benchmark_history() -> dict:
    """
    Read nav_history.json, fetch SPY, compute all periods and daily series,
    write benchmark_history.json. Returns the full benchmark dict.
    """
    nav_history: list = _load_json(NAV_HISTORY_PATH, default=[])
    if not nav_history:
        result = {"error": "No NAV history yet — pipeline has not run with tracking enabled"}
        _save_json(BENCHMARK_PATH, result)
        return result

    inception_date = nav_history[0]["date"]
    today = datetime.utcnow().date().isoformat()

    # Fetch SPY from inception to today (add buffer for weekends)
    spy_start = (datetime.strptime(inception_date, "%Y-%m-%d") - timedelta(days=5)).date().isoformat()
    spy_closes = _fetch_spy_closes(spy_start, today)

    if not spy_closes:
        result = {
            "inception_date": inception_date,
            "error": "Could not fetch SPY data",
            "nav_points": len(nav_history),
        }
        _save_json(BENCHMARK_PATH, result)
        return result

    daily_series = _cumulative_returns(nav_history, spy_closes)

    result = {
        "inception_date": inception_date,
        "nav_points":     len(nav_history),
        "last_updated":   today,
        "periods": {
            "1w":  _compute_period(daily_series, days=7),
            "1m":  _compute_period(daily_series, days=30),
            "6m":  _compute_period(daily_series, days=182),
            "ytd": _compute_period(daily_series, days=None, ytd=True),
        },
        "daily_series": daily_series,
    }

    _save_json(BENCHMARK_PATH, result)
    print(f"  benchmark_tracker: {len(nav_history)} NAV points | {len(daily_series)} daily series points")

    # Log alpha summary
    for period_key, label in [("1w", "1W"), ("1m", "1M")]:
        p = result["periods"][period_key]
        if p.get("alpha") is not None:
            direction = "outperforming" if p["alpha"] >= 0 else "underperforming"
            print(f"  vs SPY {label}: portfolio {p['portfolio_return_pct']:+.2f}% | SPY {p['spy_return_pct']:+.2f}% | alpha {p['alpha']:+.2f}% ({direction})")

    return result


# ---------------------------------------------------------------------------
# Step 3 — One-line summary for Committee prompt
# ---------------------------------------------------------------------------

def get_benchmark_summary_for_prompt() -> str:
    """
    Return a one-line benchmark summary for injection into the Committee prompt.
    Returns empty string if no data yet.
    """
    bench = _load_json(BENCHMARK_PATH, default={})
    if not bench or "error" in bench:
        return ""

    periods = bench.get("periods", {})
    parts = []
    for key, label in [("1w", "1W"), ("1m", "1M")]:
        p = periods.get(key, {})
        alpha = p.get("alpha")
        if alpha is not None:
            sign = "+" if alpha >= 0 else ""
            parts.append(f"{label}: {sign}{alpha:.1f}% alpha vs SPY")

    if not parts:
        return ""

    direction = "Outperforming" if all(
        periods.get(k, {}).get("alpha", 0) >= 0 for k in ["1w", "1m"]
        if periods.get(k, {}).get("alpha") is not None
    ) else "Underperforming"

    return f"BENCHMARK vs SPY: {' | '.join(parts)}. {direction} — factor this into your confidence when assessing new positions."


# ---------------------------------------------------------------------------
# Entry point (standalone)
# ---------------------------------------------------------------------------

def run() -> dict:
    """Full run: append NAV + compute benchmark. Called by portfolio_manager."""
    nav_result     = append_nav_point()
    bench_result   = compute_benchmark_history()
    return {"nav": nav_result, "benchmark": bench_result}


if __name__ == "__main__":
    import sys
    result = run()
    print(json.dumps(result, indent=2))
