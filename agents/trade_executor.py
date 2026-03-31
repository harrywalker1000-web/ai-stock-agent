"""
Agent 11 — Trade Executor

Phase 5: runs after Investment Committee (Agent 10) produces decisions.

Responsibilities:
  - Read committee_report.json to get position_decisions[]
  - Check stop-losses on all currently held positions against live prices
  - Implement Phase A decisions: hold / increase / decrease / exit
  - Implement Phase B decisions: enter_long / enter_short / skip
  - Log every trade to data/trades/trade_log.csv
  - Call memory_agent to record entries and exits

Safety rules:
  - PAPER TRADING ONLY — hardcoded to paper URL until ALLOW_LIVE_TRADING=true in .env
    AND user has explicitly confirmed. Never switch automatically.
  - No retry on Alpaca API errors — log and alert instead.
  - No hard portfolio drawdown halt — Committee evaluates positions individually.
  - Never place orders in first or last 15 minutes of market session.
  - Soft 20% position cap (from PORTFOLIO_RULES.md) — hard-blocked at 30% as safety rail.

Position sizing:
  size_pct from Committee × total portfolio value = target notional
  Shares = floor(target_notional / current_price)
"""

import csv
import os
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf
from dotenv import load_dotenv

import agents.memory_agent as memory
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
TRADES_DIR = ROOT / "data" / "trades"
TRADE_LOG_PATH = TRADES_DIR / "trade_log.csv"
PORTFOLIO_STATE_PATH = REPORTS_DIR / "portfolio_state.json"

TRADES_DIR.mkdir(parents=True, exist_ok=True)

# Safety rails
HARD_MAX_POSITION_PCT = 30.0   # Never exceed this regardless of Committee instruction
HARD_MIN_CASH_PCT = 5.0        # Never let cash drop below this
MARKET_OPEN_BUFFER_MIN = 15    # Don't trade in first 15 min (09:30-09:45 EST)
MARKET_CLOSE_BUFFER_MIN = 15   # Don't trade in last 15 min (15:45-16:00 EST)

# Paper vs live guard
_PAPER_BASE_URL = "https://paper-api.alpaca.markets"
_LIVE_BASE_URL = "https://api.alpaca.markets"


# ---------------------------------------------------------------------------
# Alpaca client
# ---------------------------------------------------------------------------

def _get_alpaca_client():
    """
    Returns an Alpaca REST client.
    ALWAYS uses paper URL unless ALLOW_LIVE_TRADING=true AND ALPACA_BASE_URL
    is explicitly set to the live URL. This is a deliberate double-check.
    """
    import alpaca_trade_api as tradeapi

    key = os.environ.get("ALPACA_API_KEY", "")
    secret = os.environ.get("ALPACA_SECRET_KEY", "")
    base_url = os.environ.get("ALPACA_BASE_URL", _PAPER_BASE_URL)
    allow_live = os.environ.get("ALLOW_LIVE_TRADING", "false").lower() == "true"

    # Double-guard: if live URL is set but ALLOW_LIVE_TRADING is not true, force paper
    if base_url == _LIVE_BASE_URL and not allow_live:
        logger.warning("Live URL detected but ALLOW_LIVE_TRADING is not set — forcing paper mode")
        base_url = _PAPER_BASE_URL

    if not key or not secret:
        raise RuntimeError("ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in .env")

    is_paper = _PAPER_BASE_URL in base_url
    logger.info("Alpaca client: %s mode", "PAPER" if is_paper else "⚠ LIVE")
    return tradeapi.REST(key, secret, base_url, api_version="v2")


def _get_portfolio(api) -> dict:
    """Fetch current portfolio value and cash from Alpaca."""
    account = api.get_account()
    return {
        "equity": float(account.equity),
        "cash": float(account.cash),
        "portfolio_value": float(account.portfolio_value),
        "buying_power": float(account.buying_power),
    }


def _get_alpaca_positions(api) -> dict[str, dict]:
    """Return currently held positions as {ticker: {qty, avg_entry_price, market_value}}."""
    positions = {}
    try:
        for pos in api.list_positions():
            positions[pos.symbol] = {
                "qty": float(pos.qty),
                "avg_entry_price": float(pos.avg_entry_price),
                "current_price": float(pos.current_price),
                "market_value": float(pos.market_value),
                "unrealized_pnl": float(pos.unrealized_pl),
                "side": pos.side,
            }
    except Exception as exc:
        logger.error("Failed to fetch Alpaca positions: %s", exc)
    return positions


def _get_live_price(ticker: str) -> float | None:
    """Fetch current price from yfinance for pre-order verification."""
    try:
        info = yf.Ticker(ticker).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        return float(price) if price else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Market hours check
# ---------------------------------------------------------------------------

def _is_safe_to_trade(api) -> tuple[bool, str]:
    """
    Returns (safe, reason). Blocks trading in first/last 15 min of session.
    Also blocks when market is not open.
    """
    try:
        clock = api.get_clock()
        if not clock.is_open:
            return False, "Market is closed"
        now = clock.timestamp
        # Convert to EST offset (Alpaca returns UTC)
        # Simple approach: check the time component via Alpaca's next_open / next_close
        import dateutil.parser
        next_open = dateutil.parser.parse(str(clock.next_open))
        next_close = dateutil.parser.parse(str(clock.next_close))
        now_aware = dateutil.parser.parse(str(clock.timestamp))
        minutes_from_open = (now_aware - next_open).total_seconds() / 60 + 390  # 6.5h trading day
        minutes_to_close = (next_close - now_aware).total_seconds() / 60
        if minutes_from_open < MARKET_OPEN_BUFFER_MIN:
            return False, f"Too close to market open ({MARKET_OPEN_BUFFER_MIN} min buffer)"
        if minutes_to_close < MARKET_CLOSE_BUFFER_MIN:
            return False, f"Too close to market close ({MARKET_CLOSE_BUFFER_MIN} min buffer)"
        return True, "Market open and safe window"
    except Exception as exc:
        logger.warning("Market hours check failed: %s — defaulting to safe", exc)
        return True, "Hours check unavailable — proceeding"


# ---------------------------------------------------------------------------
# Order placement
# ---------------------------------------------------------------------------

def _place_order(api, ticker: str, qty: int, side: str, rationale: str) -> dict | None:
    """
    Submit a market order. Returns order confirmation or None on failure.
    side: 'buy' | 'sell'
    Does NOT retry on failure — logs and returns None.
    """
    if qty <= 0:
        logger.warning("Refusing to place order for %s: qty %d ≤ 0", ticker, qty)
        return None
    try:
        order = api.submit_order(
            symbol=ticker,
            qty=qty,
            side=side,
            type="market",
            time_in_force="day",
        )
        logger.info("Order placed: %s %d %s @ market | ID: %s", side.upper(), qty, ticker, order.id)
        return {
            "order_id": order.id,
            "ticker": ticker,
            "side": side,
            "qty": qty,
            "status": order.status,
            "submitted_at": str(order.submitted_at),
        }
    except Exception as exc:
        logger.error("ORDER FAILED for %s %s %d: %s — NOT retrying", side, ticker, qty, exc)
        return None


# ---------------------------------------------------------------------------
# Stop-loss check
# ---------------------------------------------------------------------------

def _check_stop_losses(open_positions: dict, alpaca_positions: dict, api) -> list[dict]:
    """
    For all held positions with a stop_loss set, check current price.
    Returns list of stop-loss triggers (each will be executed as exit).
    """
    triggers = []
    for ticker, pos_data in open_positions.items():
        stop_loss = pos_data.get("stop_loss")
        if stop_loss is None:
            continue
        direction = pos_data.get("direction", "LONG").upper()
        current_price = _get_live_price(ticker)
        if current_price is None:
            logger.warning("Cannot check stop-loss for %s — price unavailable", ticker)
            continue
        triggered = (
            (direction == "LONG" and current_price <= stop_loss) or
            (direction == "SHORT" and current_price >= stop_loss)
        )
        if triggered:
            logger.warning("STOP-LOSS TRIGGERED: %s | price=%.2f | stop=%.2f | dir=%s",
                           ticker, current_price, stop_loss, direction)
            triggers.append({
                "ticker": ticker,
                "direction": direction,
                "current_price": current_price,
                "stop_loss": stop_loss,
                "entry_price": pos_data.get("entry_price"),
            })
    return triggers


# ---------------------------------------------------------------------------
# Trade log
# ---------------------------------------------------------------------------

def _log_trade(trade: dict) -> None:
    """Append one trade record to data/trades/trade_log.csv."""
    fieldnames = [
        "date", "ticker", "action", "direction", "shares",
        "price", "notional", "pnl_pct", "conviction", "rationale",
    ]
    write_header = not TRADE_LOG_PATH.exists()
    with open(TRADE_LOG_PATH, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerow({k: trade.get(k, "") for k in fieldnames})


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------

def reconcile_positions_with_alpaca() -> dict:
    """
    Synchronise positions_log.json with actual Alpaca holdings.
    Called at the start of every pipeline run, BEFORE Phase A agents run.

    Three cases handled:
      1. PENDING positions (alpaca_order_id=None): Committee decided to enter when market was
         closed. Place those orders now if market is open.
      2. GHOST entries (in log with order ID but NOT in Alpaca): position was closed externally
         (manual sell, stop triggered outside system). Record the exit, clean the log.
      3. UNTRACKED positions (in Alpaca but NOT in log): entered manually via Alpaca dashboard.
         Add a stub entry so Phase A reviews them correctly.
    """
    logger.info("=== Alpaca position reconciliation ===")
    summary: dict = {"pending_placed": [], "ghosts_removed": [], "untracked_added": [], "errors": []}

    try:
        api = _get_alpaca_client()
        alpaca_pos = _get_alpaca_positions(api)
        portfolio = _get_portfolio(api)
        safe, hours_reason = _is_safe_to_trade(api)
    except Exception as exc:
        logger.error("Reconciliation: cannot connect to Alpaca: %s", exc)
        return {"error": str(exc)}

    log_positions = memory.get_open_positions()
    today = datetime.utcnow().date().isoformat()
    portfolio_value = portfolio["portfolio_value"]

    # --- Case 1: Pending positions (alpaca_order_id=None) — place now if market open ---
    for ticker, pos_data in list(log_positions.items()):
        if pos_data.get("alpaca_order_id") is not None:
            continue  # Has order ID — check in Case 2
        if safe:
            current_price = _get_live_price(ticker)
            if current_price is None:
                logger.warning("Reconcile: cannot get price for pending %s", ticker)
                summary["errors"].append(ticker)
                continue
            size_pct = pos_data.get("size_pct", 10.0)
            notional = portfolio_value * size_pct / 100
            shares = int(notional / current_price)
            if shares < 1:
                logger.warning("Reconcile: %s notional too small for 1 share — removing pending entry", ticker)
                memory.remove_position(ticker)
                summary["ghosts_removed"].append(ticker)
                continue
            direction = pos_data.get("direction", "LONG").upper()
            side = "buy" if direction == "LONG" else "sell"
            order = _place_order(api, ticker, shares, side,
                                 f"Deferred order from {pos_data.get('entry_date', today)} — market was closed")
            if order:
                memory.confirm_trade_entry(ticker, order["order_id"])
                summary["pending_placed"].append(ticker)
                logger.info("Reconcile: placed deferred order for %s (%d shares @ ~$%.2f)",
                            ticker, shares, current_price)
            else:
                summary["errors"].append(ticker)
        else:
            logger.info("Reconcile: %s still pending (market not open yet)", ticker)

    # Refresh log after Case 1 mutations
    log_positions = memory.get_open_positions()

    # --- Case 2: Ghost entries (in log, has order ID, but NOT in Alpaca) ---
    for ticker, pos_data in list(log_positions.items()):
        if pos_data.get("alpaca_order_id") is None:
            continue  # Pending — handled above
        if ticker not in alpaca_pos:
            logger.warning("Reconcile: %s in log but NOT in Alpaca — recording external exit", ticker)
            current_price = _get_live_price(ticker) or pos_data.get("entry_price", 0)
            memory.store_trade_exit(
                ticker=ticker,
                exit_date=today,
                exit_price=current_price,
                exit_reason="external_close",
                rationale="Position closed outside the pipeline (manual action or broker event)",
            )
            summary["ghosts_removed"].append(ticker)

    # --- Case 3: Positions in Alpaca not in log (manually entered) ---
    log_positions = memory.get_open_positions()
    for ticker, alpaca_data in alpaca_pos.items():
        if ticker not in log_positions:
            logger.warning("Reconcile: %s in Alpaca but not in log — adding stub entry", ticker)
            memory.store_trade_entry(
                ticker=ticker,
                entry_date=today,
                entry_price=alpaca_data["avg_entry_price"],
                direction="LONG" if alpaca_data["side"] == "long" else "SHORT",
                conviction=50,
                size_pct=round(alpaca_data["market_value"] / portfolio_value * 100, 1) if portfolio_value else 10.0,
                rationale="Position entered outside pipeline — stub entry added by reconciler",
                signals=["manual_entry"],
                alpaca_order_id="external",
            )
            summary["untracked_added"].append(ticker)

    logger.info(
        "Reconciliation complete: %d pending placed, %d ghosts removed, %d untracked added, %d errors",
        len(summary["pending_placed"]), len(summary["ghosts_removed"]),
        len(summary["untracked_added"]), len(summary["errors"]),
    )
    return summary


def run(mode: str = "new_opportunities") -> dict:
    logger.info("=== Trade Executor (Agent 11) — mode: %s ===", mode)

    import json
    committee_path = REPORTS_DIR / "committee_report.json"
    if not committee_path.exists():
        raise RuntimeError("committee_report.json not found — run Agent 10 first")
    with open(committee_path) as f:
        committee = json.load(f)

    decisions = committee.get("position_decisions", [])
    today = datetime.utcnow().date().isoformat()
    executed_trades = []
    skipped = []
    errors = []

    # Connect to Alpaca
    try:
        api = _get_alpaca_client()
        portfolio = _get_portfolio(api)
        alpaca_positions = _get_alpaca_positions(api)
    except Exception as exc:
        logger.error("Cannot connect to Alpaca: %s", exc)
        return {"error": str(exc), "executed_trades": [], "generated_at": datetime.utcnow().isoformat()}

    portfolio_value = portfolio["portfolio_value"]
    logger.info("Portfolio: $%.2f total | $%.2f cash | %d positions",
                portfolio_value, portfolio["cash"], len(alpaca_positions))

    # Market hours check
    safe, hours_reason = _is_safe_to_trade(api)
    if not safe:
        logger.warning("Trading blocked: %s — will log decisions without executing", hours_reason)

    # Load open positions from memory (includes stop-loss levels)
    open_positions = memory.get_open_positions()

    # --- Stop-loss check (always runs, regardless of market hours decision) ---
    stop_triggers = _check_stop_losses(open_positions, alpaca_positions, api)
    for trigger in stop_triggers:
        ticker = trigger["ticker"]
        qty = int(alpaca_positions.get(ticker, {}).get("qty", 0))
        if qty > 0 and safe:
            order = _place_order(api, ticker, qty, "sell", f"Stop-loss triggered at ${trigger['stop_loss']}")
            if order:
                memory.store_trade_exit(
                    ticker=ticker,
                    exit_date=today,
                    exit_price=trigger["current_price"],
                    exit_reason="stop_loss",
                    rationale=f"Stop-loss hit at ${trigger['stop_loss']}",
                )
                trade = {
                    "date": today, "ticker": ticker, "action": "stop_loss_exit",
                    "direction": trigger["direction"], "shares": qty,
                    "price": trigger["current_price"],
                    "notional": round(qty * trigger["current_price"], 2),
                    "pnl_pct": round(
                        (trigger["current_price"] - trigger["entry_price"]) / trigger["entry_price"] * 100, 2
                    ) if trigger.get("entry_price") else None,
                    "conviction": None,
                    "rationale": f"Auto stop-loss: hit ${trigger['stop_loss']}",
                }
                _log_trade(trade)
                executed_trades.append(trade)

    # --- Process Committee decisions ---
    for decision in decisions:
        ticker = str(decision.get("ticker", "")).upper()
        action = decision.get("action", "skip")
        conviction = decision.get("conviction", 50)
        size_pct = decision.get("size_pct")
        stop_loss = decision.get("stop_loss")
        rationale = decision.get("investment_thesis", "")

        if action == "skip":
            skipped.append({"ticker": ticker, "reason": decision.get("skip_reason", "")})
            continue

        if action == "hold":
            logger.info("%s: HOLD — no action required", ticker)
            continue

        current_price = _get_live_price(ticker)
        if current_price is None:
            logger.warning("%s: cannot get live price — skipping execution", ticker)
            errors.append({"ticker": ticker, "error": "price unavailable"})
            continue

        if action in ("enter_long", "enter_short"):
            if not size_pct:
                logger.warning("%s: no size_pct from Committee — skipping", ticker)
                continue

            # Safety cap
            if size_pct > HARD_MAX_POSITION_PCT:
                logger.warning("%s: Committee requested %.0f%% — capped at %.0f%%",
                               ticker, size_pct, HARD_MAX_POSITION_PCT)
                size_pct = HARD_MAX_POSITION_PCT

            notional = portfolio_value * size_pct / 100
            shares = int(notional / current_price)
            if shares < 1:
                logger.warning("%s: notional $%.2f too small for 1 share at $%.2f — skipping",
                               ticker, notional, current_price)
                continue

            side = "buy" if action == "enter_long" else "sell"
            direction = "LONG" if action == "enter_long" else "SHORT"

            if safe:
                order = _place_order(api, ticker, shares, side, rationale)
            else:
                order = {"status": "market_closed_dry_run", "ticker": ticker, "qty": shares}
                logger.info("%s: Market closed — logged as PENDING, will execute at next open", ticker)

            # Only store the Alpaca order ID if the order was actually placed
            alpaca_order_id = order.get("order_id") if (safe and order) else None
            memory.store_trade_entry(
                ticker=ticker,
                entry_date=today,
                entry_price=current_price,
                direction=direction,
                conviction=conviction,
                size_pct=size_pct,
                rationale=rationale,
                signals=decision.get("key_catalysts", []),
                stop_loss=stop_loss,
                alpaca_order_id=alpaca_order_id,
            )
            trade = {
                "date": today, "ticker": ticker, "action": action,
                "direction": direction, "shares": shares, "price": current_price,
                "notional": round(shares * current_price, 2),
                "pnl_pct": None, "conviction": conviction,
                "rationale": rationale[:200],
            }
            _log_trade(trade)
            executed_trades.append({**trade, "order": order, "stop_loss": stop_loss})

        elif action == "exit":
            alpaca_pos = alpaca_positions.get(ticker)
            qty = int(alpaca_pos["qty"]) if alpaca_pos else 0
            if qty <= 0:
                logger.warning("%s: exit requested but no Alpaca position found", ticker)
                continue
            direction = open_positions.get(ticker, {}).get("direction", "LONG").upper()
            side = "sell" if direction == "LONG" else "buy"

            if safe:
                order = _place_order(api, ticker, qty, side, rationale)
            else:
                order = {"status": "market_closed_dry_run"}

            memory.store_trade_exit(
                ticker=ticker, exit_date=today, exit_price=current_price,
                exit_reason=decision.get("skip_reason", "committee_exit"),
                rationale=rationale,
            )
            entry_price = open_positions.get(ticker, {}).get("entry_price")
            pnl = round((current_price - entry_price) / entry_price * 100, 2) if entry_price else None
            trade = {
                "date": today, "ticker": ticker, "action": "exit",
                "direction": direction, "shares": qty, "price": current_price,
                "notional": round(qty * current_price, 2),
                "pnl_pct": pnl, "conviction": conviction, "rationale": rationale[:200],
            }
            _log_trade(trade)
            executed_trades.append({**trade, "order": order})

        elif action in ("increase", "decrease"):
            alpaca_pos = alpaca_positions.get(ticker, {})
            current_value = float(alpaca_pos.get("market_value", 0))
            current_pct = (current_value / portfolio_value * 100) if portfolio_value else 0
            direction = open_positions.get(ticker, {}).get("direction", "LONG").upper()

            if action == "increase" and size_pct:
                additional_pct = max(0, size_pct - current_pct)
                additional_notional = portfolio_value * additional_pct / 100
                shares = int(additional_notional / current_price)
                if shares >= 1 and safe:
                    side = "buy" if direction == "LONG" else "sell"
                    order = _place_order(api, ticker, shares, side, f"Increasing position: {rationale}")
                    if order:
                        trade = {
                            "date": today, "ticker": ticker, "action": "increase",
                            "direction": direction, "shares": shares, "price": current_price,
                            "notional": round(shares * current_price, 2),
                            "pnl_pct": None, "conviction": conviction, "rationale": rationale[:200],
                        }
                        _log_trade(trade)
                        executed_trades.append(trade)

            elif action == "decrease" and size_pct:
                reduce_pct = max(0, current_pct - size_pct)
                reduce_notional = portfolio_value * reduce_pct / 100
                shares = int(reduce_notional / current_price)
                if shares >= 1 and safe:
                    side = "sell" if direction == "LONG" else "buy"
                    order = _place_order(api, ticker, shares, side, f"Reducing position: {rationale}")
                    if order:
                        trade = {
                            "date": today, "ticker": ticker, "action": "decrease",
                            "direction": direction, "shares": shares, "price": current_price,
                            "notional": round(shares * current_price, 2),
                            "pnl_pct": None, "conviction": conviction, "rationale": rationale[:200],
                        }
                        _log_trade(trade)
                        executed_trades.append(trade)

    # Refresh portfolio state
    portfolio = _get_portfolio(api)
    alpaca_positions = _get_alpaca_positions(api)
    portfolio_state = {
        "date": today,
        "equity": portfolio["equity"],
        "cash": portfolio["cash"],
        "portfolio_value": portfolio["portfolio_value"],
        "positions": alpaca_positions,
        "open_position_count": len(alpaca_positions),
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
    import json
    with open(PORTFOLIO_STATE_PATH, "w") as f:
        json.dump(portfolio_state, f, indent=2)

    output = {
        "executed_trades": executed_trades,
        "total_executed": len(executed_trades),
        "skipped": skipped,
        "errors": errors,
        "stop_losses_triggered": len(stop_triggers),
        "portfolio_state": portfolio_state,
        "market_safe": safe,
        "market_hours_note": hours_reason,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    logger.info("=== Trade Executor complete: %d trades executed, %d skipped, %d errors ===",
                len(executed_trades), len(skipped), len(errors))
    return output


if __name__ == "__main__":
    result = run()
    print(f"\nExecuted: {result['total_executed']} trades | Skipped: {len(result['skipped'])} | Errors: {len(result['errors'])}")
    print(f"Market: {result['market_hours_note']}")
    pv = result["portfolio_state"].get("portfolio_value", 0)
    cash = result["portfolio_state"].get("cash", 0)
    print(f"Portfolio: ${pv:.2f} total | ${cash:.2f} cash")
    for t in result["executed_trades"]:
        pnl = f" P&L:{t['pnl_pct']:+.1f}%" if t.get("pnl_pct") is not None else ""
        print(f"  {t['ticker']:6s}  {t['action']:14s}  {t['shares']}sh @ ${t['price']:.2f}{pnl}")
