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
        json.dump(data, f, indent=2, allow_nan=False)


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
    """
    SPY dividend-adjusted closes {YYYY-MM-DD: close}, inclusive of `end`.
    (yf.download returns MultiIndex columns in yfinance >= 0.2.5x, which made
    raw["Close"][ts] raise and the bare except return {} on every run; and its `end`
    is exclusive, which dropped today.)
    """
    try:
        end_incl = (datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1)).date().isoformat()
        hist = yf.Ticker("SPY").history(start=start, end=end_incl, auto_adjust=True)
        if hist is None or hist.empty:
            return {}
        return {str(ts.date()): float(v) for ts, v in hist["Close"].items()}
    except Exception as exc:
        print(f"  benchmark_tracker: SPY fetch failed: {exc}")
        return {}


def _alpaca_nav_history() -> list[dict]:
    """
    Daily equity from Alpaca's own portfolio history (period=all) — the authoritative
    NAV series, independent of whether nav_history.json survived between CI runs.
    Each point is stamped 20:00 New York time; labelled with its New York date.
    """
    import os
    import requests
    from zoneinfo import ZoneInfo
    key, secret = os.environ.get("ALPACA_API_KEY"), os.environ.get("ALPACA_SECRET_KEY")
    base = os.environ.get("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
    if not key or not secret:
        return []
    try:
        r = requests.get(f"{base}/v2/account/portfolio/history",
                         params={"period": "all", "timeframe": "1D"},
                         headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret}, timeout=20)
        r.raise_for_status()
        d = r.json()
        ny = ZoneInfo("America/New_York")
        out = []
        for ts, eq in zip(d.get("timestamp") or [], d.get("equity") or []):
            if eq:
                out.append({"date": datetime.fromtimestamp(ts, ny).date().isoformat(), "equity": round(float(eq), 2)})
        return out
    except Exception as exc:
        print(f"  benchmark_tracker: Alpaca history fetch failed: {exc}")
        return []


def _apply_split_corrections(nav: list[dict]) -> list[dict]:
    """
    While Alpaca still holds a pre-split share count at the post-split price, its equity
    history understates NAV by (ratio − 1) × stale_qty × close on each day since the
    ex-date. Detection is shared with the executor (trade_executor._get_alpaca_positions).
    """
    try:
        from agents.trade_executor import _get_alpaca_client, _get_alpaca_positions
        pending = {t: p for t, p in _get_alpaca_positions(_get_alpaca_client()).items() if p.get("split_pending")}
    except Exception as exc:
        print(f"  benchmark_tracker: split check skipped: {exc}")
        return nav
    if not pending:
        return nav
    delta: dict[str, float] = {}
    for ticker, p in pending.items():
        sp = p["split_pending"]
        sign = 1 if p.get("side") == "long" else -1
        closes = _ticker_closes(ticker, sp["ex_date"])
        for d, c in closes.items():
            if d >= sp["ex_date"]:
                delta[d] = delta.get(d, 0.0) + sign * (sp["ratio"] - 1) * p["broker_qty"] * c
    print(f"  benchmark_tracker: corrected NAV for pending split(s): {', '.join(pending)}")
    return [{**e, "equity": round(e["equity"] + delta.get(e["date"], 0.0), 2)} for e in nav]


def _ticker_closes(ticker: str, start: str) -> dict[str, float]:
    """Split-adjusted daily closes (same basis Alpaca marks the stale position at)."""
    try:
        hist = yf.Ticker(ticker).history(start=start, auto_adjust=False)
        return {str(ts.date()): float(v) for ts, v in hist["Close"].items()}
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
        portfolio_cumulative = round((last_known_equity / inception_equity - 1) * 100, 3) if inception_equity else 0.0
        spy_cumulative       = round((spy_close / inception_spy - 1) * 100, 3) if inception_spy else 0.0

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

    # Compound, don't subtract: cumulative % values must be converted to growth factors
    port_return = round(((1 + latest["portfolio_cumulative"] / 100) / (1 + start_point["portfolio_cumulative"] / 100) - 1) * 100, 3)
    spy_return  = round(((1 + latest["spy_cumulative"] / 100) / (1 + start_point["spy_cumulative"] / 100) - 1) * 100, 3)
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
    # Alpaca's daily equity history is the source of truth; nav_history.json is only a
    # fallback (it was never committed, so on CI it reset to a single point every run).
    nav_history: list = _alpaca_nav_history() or _load_json(NAV_HISTORY_PATH, default=[])
    nav_history = _apply_split_corrections(nav_history)
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
