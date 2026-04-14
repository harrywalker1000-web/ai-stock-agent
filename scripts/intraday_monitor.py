"""
Intraday Monitor (Section 6)

Runs every 30 minutes during market hours via GitHub Actions.
No LLM calls — fast, cheap, Alpaca-only.

Responsibilities:
  1. Fetch live positions from Alpaca
  2. Check each position against its stop-loss level (from positions_log.json)
  3. Execute emergency exits for stop-breaches when market is open
  4. Check circuit-breaker thresholds (large single-day drawdowns)
  5. Write alert log to data/reports/intraday_alerts.json
  6. Commit the alert log back to repo (so dashboard can show intraday events)

Circuit breaker thresholds:
  - HARD STOP: position unrealised_pnl_pct <= stored stop_loss price
  - SOFT ALERT: position down >8% intraday (logs alert, does NOT auto-exit — Committee decides next run)
  - PORTFOLIO ALERT: portfolio equity down >3% from yesterday's close (logs alert)

This deliberately does NOT call the LLM pipeline — that runs daily.
The intraday monitor is the safety net only.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = ROOT / "data" / "memory"
REPORTS_DIR = ROOT / "data" / "reports"
POSITIONS_LOG_PATH = MEMORY_DIR / "positions_log.json"
ALERTS_PATH = REPORTS_DIR / "intraday_alerts.json"

# Thresholds
SOFT_ALERT_DROP_PCT = -8.0     # Log alert if position drops >8% intraday
PORTFOLIO_ALERT_DROP_PCT = -3.0  # Log alert if portfolio drops >3% from last close

# Alpaca paper API (same as trade_executor)
_PAPER_BASE = "https://paper-api.alpaca.markets"

REPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _alpaca_headers() -> dict:
    return {
        "APCA-API-KEY-ID": os.environ.get("ALPACA_API_KEY", ""),
        "APCA-API-SECRET-KEY": os.environ.get("ALPACA_SECRET_KEY", ""),
    }


def _get(endpoint: str) -> dict | list | None:
    base = os.environ.get("ALPACA_BASE_URL", _PAPER_BASE)
    try:
        r = requests.get(f"{base}{endpoint}", headers=_alpaca_headers(), timeout=10)
        if r.ok:
            return r.json()
        print(f"  Alpaca {endpoint} → {r.status_code}: {r.text[:100]}")
        return None
    except Exception as exc:
        print(f"  Alpaca request failed: {exc}")
        return None


def _place_market_order(ticker: str, qty: int, side: str, note: str) -> dict | None:
    """Place a market order via Alpaca. side = 'buy' | 'sell'."""
    base = os.environ.get("ALPACA_BASE_URL", _PAPER_BASE)
    payload = {
        "symbol": ticker,
        "qty": str(qty),
        "side": side,
        "type": "market",
        "time_in_force": "day",
    }
    try:
        r = requests.post(
            f"{base}/v2/orders",
            headers={**_alpaca_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=10,
        )
        if r.ok:
            order = r.json()
            print(f"  ORDER PLACED: {side.upper()} {qty}x {ticker} — {note}")
            return order
        print(f"  Order failed for {ticker}: {r.status_code} {r.text[:150]}")
        return None
    except Exception as exc:
        print(f"  Order exception for {ticker}: {exc}")
        return None


def _is_market_open() -> bool:
    """Check if US equities market is currently open via Alpaca clock."""
    clock = _get("/v2/clock")
    if clock is None:
        return False
    return bool(clock.get("is_open", False))


def _append_alert(alerts: list, level: str, ticker: str, message: str, data: dict | None = None) -> None:
    alerts.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,     # "STOP_EXECUTED" | "SOFT_ALERT" | "PORTFOLIO_ALERT" | "INFO"
        "ticker": ticker,
        "message": message,
        "data": data or {},
    })
    print(f"  [{level}] {ticker}: {message}")


# ---------------------------------------------------------------------------
# Core monitoring logic
# ---------------------------------------------------------------------------

def run() -> dict:
    """
    Full intraday monitor run. Returns a summary dict.
    """
    now_utc = datetime.now(timezone.utc).isoformat()
    print(f"\nIntraday Monitor — {now_utc}")

    alerts: list = []
    summary = {
        "run_at": now_utc,
        "positions_checked": 0,
        "stops_triggered": 0,
        "soft_alerts": 0,
        "portfolio_alerts": 0,
        "market_open": False,
        "alerts": alerts,
    }

    # ── Check if key is configured ────────────────────────────────────────────
    if not os.environ.get("ALPACA_API_KEY"):
        print("  ALPACA_API_KEY not set — skipping monitor")
        _save_json(ALERTS_PATH, summary)
        return summary

    # ── Live account + positions ──────────────────────────────────────────────
    account = _get("/v2/account")
    alpaca_positions = _get("/v2/positions")

    if account is None or alpaca_positions is None:
        print("  Could not fetch Alpaca data — aborting monitor")
        _save_json(ALERTS_PATH, summary)
        return summary

    market_open = _is_market_open()
    summary["market_open"] = market_open

    equity = float(account.get("equity", 0))
    last_equity = float(account.get("last_equity", equity))
    portfolio_change_pct = (equity - last_equity) / last_equity * 100 if last_equity else 0

    print(f"  Portfolio equity: ${equity:,.2f} | Daily change: {portfolio_change_pct:+.2f}%")
    print(f"  Market open: {market_open}")

    # ── Portfolio-level circuit breaker ──────────────────────────────────────
    if portfolio_change_pct <= PORTFOLIO_ALERT_DROP_PCT:
        _append_alert(
            alerts, "PORTFOLIO_ALERT", "PORTFOLIO",
            f"Portfolio down {portfolio_change_pct:+.2f}% today — exceeds {PORTFOLIO_ALERT_DROP_PCT}% alert threshold",
            {"equity": equity, "last_equity": last_equity, "change_pct": round(portfolio_change_pct, 2)},
        )
        summary["portfolio_alerts"] += 1

    # ── Per-position stop-loss and soft alert checks ──────────────────────────
    positions_log = _load_json(POSITIONS_LOG_PATH, default={})

    # Fetch open orders to identify which positions already have native Alpaca stops
    native_stops: set[str] = set()
    try:
        base = os.environ.get("ALPACA_BASE_URL", _PAPER_BASE)
        r = requests.get(f"{base}/v2/orders?status=open&limit=200", headers=_alpaca_headers(), timeout=10)
        if r.ok:
            for o in r.json():
                if o.get("type") in ("stop", "stop_limit") and o.get("symbol"):
                    native_stops.add(o["symbol"])
        print(f"  Native stop orders active: {sorted(native_stops) or 'none'}")
    except Exception:
        pass

    # Build a map of live Alpaca positions
    alpaca_map: dict[str, dict] = {}
    for p in (alpaca_positions if isinstance(alpaca_positions, list) else []):
        alpaca_map[p["symbol"]] = p

    summary["positions_checked"] = len(alpaca_map)

    for ticker, alpaca_pos in alpaca_map.items():
        current_price = float(alpaca_pos.get("current_price", 0))
        unrealised_pct = float(alpaca_pos.get("unrealized_plpc", 0)) * 100
        direction = "LONG" if alpaca_pos.get("side") == "long" else "SHORT"
        qty = int(float(alpaca_pos.get("qty", 0)))

        # Get stop-loss from positions_log
        log_entry = positions_log.get(ticker, {})
        stop_loss = log_entry.get("stop_loss")

        # ── Hard stop-loss check ─────────────────────────────────────────────
        # Skip if Alpaca already holds a native GTC stop for this ticker — it handles itself
        if ticker in native_stops:
            continue

        stop_breached = False
        if stop_loss is not None:
            stop_loss_f = float(stop_loss)
            if direction == "LONG" and current_price <= stop_loss_f:
                stop_breached = True
            elif direction == "SHORT" and current_price >= stop_loss_f:
                stop_breached = True

        if stop_breached:
            side = "sell" if direction == "LONG" else "buy"
            order = None
            if market_open and qty > 0:
                order = _place_market_order(
                    ticker, qty, side,
                    f"Intraday stop-loss hit: price ${current_price:.2f} vs stop ${stop_loss:.2f}",
                )

            _append_alert(
                alerts, "STOP_EXECUTED" if (market_open and order) else "STOP_PENDING",
                ticker,
                f"Stop-loss {'executed' if (market_open and order) else 'pending'}: "
                f"${current_price:.2f} {'≤' if direction == 'LONG' else '≥'} stop ${stop_loss:.2f} "
                f"({unrealised_pct:+.1f}% unrealised)",
                {
                    "current_price": current_price,
                    "stop_loss": stop_loss,
                    "unrealised_pct": round(unrealised_pct, 2),
                    "direction": direction,
                    "qty": qty,
                    "order_placed": order is not None,
                    "market_open": market_open,
                },
            )
            summary["stops_triggered"] += 1

        # ── Soft alert — large intraday move ─────────────────────────────────
        elif unrealised_pct <= SOFT_ALERT_DROP_PCT:
            _append_alert(
                alerts, "SOFT_ALERT", ticker,
                f"Large intraday loss: {unrealised_pct:+.1f}% (threshold {SOFT_ALERT_DROP_PCT}%) — "
                f"no auto-exit, Committee will review at next pipeline run",
                {
                    "current_price": current_price,
                    "unrealised_pct": round(unrealised_pct, 2),
                    "direction": direction,
                },
            )
            summary["soft_alerts"] += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    if not alerts:
        _append_alert(alerts, "INFO", "ALL", "No stop-loss breaches or alerts detected", {})

    print(f"\n  Done: {summary['positions_checked']} positions | "
          f"{summary['stops_triggered']} stops triggered | "
          f"{summary['soft_alerts']} soft alerts")

    _save_json(ALERTS_PATH, summary)
    return summary


if __name__ == "__main__":
    result = run()
    print(json.dumps({k: v for k, v in result.items() if k != "alerts"}, indent=2))
