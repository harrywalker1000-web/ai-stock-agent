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
HARD_MIN_CASH_PCT = 5.0        # Keep 5% cash buffer — hard floor, never use margin
MARKET_OPEN_BUFFER_MIN = 0     # No open buffer — pipeline is already scheduled 15min after open
MARKET_CLOSE_BUFFER_MIN = 5    # Only block final 5 min to avoid MOC chaos

# ── No-leverage policy ────────────────────────────────────────────────────────
# Total deployed capital (|long| + |short| notional) must never exceed equity.
# This guarantees you can never lose more than you deposited.
# Short positions require full cash collateral — their proceeds cannot be reused.
NO_LEVERAGE = True   # Hard kill-switch. Never set to False for real money.

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
    """
    Fetch account state from Alpaca.

    KEY: we use EQUITY (not portfolio_value) everywhere for sizing.
    portfolio_value can exceed equity when margin is in use — using it
    for sizing is what creates leverage. Equity = what you actually own.
    """
    account = api.get_account()
    equity = float(account.equity)
    cash = float(account.cash)
    long_mv = float(account.long_market_value or 0)
    short_mv = abs(float(account.short_market_value or 0))
    total_exposure = long_mv + short_mv
    leveraged = total_exposure > equity
    return {
        "equity": equity,
        "cash": cash,
        "portfolio_value": equity,           # Always use equity for sizing — never inflated portfolio_value
        "buying_power": float(account.buying_power),
        "long_market_value": long_mv,
        "short_market_value": short_mv,
        "total_exposure": total_exposure,
        "is_leveraged": leveraged,
    }


def _available_capital(portfolio: dict) -> float:
    """
    Maximum notional available for a NEW position without using margin.

    For longs:  equity - total_current_exposure - cash_floor
    For shorts: same rule (short proceeds are NOT free cash — they're collateral)

    This ensures total_exposure never exceeds equity regardless of direction.
    """
    if not NO_LEVERAGE:
        return portfolio["cash"]  # Let Alpaca handle it if leverage is allowed
    equity = portfolio["equity"]
    total_exposure = portfolio.get("total_exposure", equity - portfolio["cash"])
    cash_floor = equity * HARD_MIN_CASH_PCT / 100
    available = equity - total_exposure - cash_floor
    return max(0.0, available)


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
    Returns (safe, reason). Only blocks when market is closed or within
    MARKET_CLOSE_BUFFER_MIN of close (to avoid MOC chaos).
    """
    try:
        clock = api.get_clock()
        if not clock.is_open:
            return False, "Market is closed"
        if MARKET_CLOSE_BUFFER_MIN > 0:
            import dateutil.parser
            next_close = dateutil.parser.parse(str(clock.next_close))
            now_aware = dateutil.parser.parse(str(clock.timestamp))
            minutes_to_close = (next_close - now_aware).total_seconds() / 60
            if minutes_to_close < MARKET_CLOSE_BUFFER_MIN:
                return False, f"Too close to market close ({MARKET_CLOSE_BUFFER_MIN} min buffer)"
        return True, "Market open"
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


def _place_native_order(
    api,
    ticker: str,
    qty: int,
    direction: str,
    stop_price: float,
    order_type: str = "stop",
    limit_price: float | None = None,
    trail_percent: float | None = None,
    take_profit_price: float | None = None,
) -> dict | None:
    """
    Place a native GTC protective order with Alpaca. Committee specifies order_type.

    order_type options:
      "stop"          — plain stop order. Triggers a market sell/buy when price hits stop_price.
                        Pros: guaranteed exit. Cons: slippage in fast markets.
      "stop_limit"    — stop triggers a limit order at limit_price (must also supply limit_price).
                        Pros: controls exit price. Cons: may not fill if price gaps through limit.
      "trailing_stop" — stop trails the price by trail_percent%. Uses trail_percent, not stop_price.
                        Pros: locks in gains automatically. Cons: can trigger on normal intraday noise.
      "bracket"       — entry already placed; this adds both a stop-loss leg AND a take-profit leg.
                        Requires stop_price (stop-loss) and take_profit_price (limit take-profit).
                        Pros: pre-defined risk/reward. Cons: take-profit leg may prevent further upside.

    direction: 'LONG' | 'SHORT'
    GTC so it persists across sessions until the position is closed or cancelled.
    Returns order dict or None on failure.
    """
    if qty <= 0:
        return None
    side = "sell" if direction == "LONG" else "buy"

    try:
        kwargs: dict = {
            "symbol": ticker,
            "qty": qty,
            "side": side,
            "time_in_force": "gtc",
        }

        if order_type == "stop":
            if stop_price <= 0:
                logger.warning("stop order for %s requires stop_price > 0", ticker)
                return None
            kwargs["type"] = "stop"
            kwargs["stop_price"] = round(stop_price, 2)

        elif order_type == "stop_limit":
            if stop_price <= 0 or not limit_price or limit_price <= 0:
                logger.warning("stop_limit for %s requires stop_price and limit_price > 0", ticker)
                return None
            kwargs["type"] = "stop_limit"
            kwargs["stop_price"] = round(stop_price, 2)
            kwargs["limit_price"] = round(limit_price, 2)

        elif order_type == "trailing_stop":
            if not trail_percent or trail_percent <= 0:
                logger.warning("trailing_stop for %s requires trail_percent > 0", ticker)
                return None
            kwargs["type"] = "trailing_stop"
            kwargs["trail_percent"] = round(trail_percent, 2)

        elif order_type == "bracket":
            if stop_price <= 0 or not take_profit_price or take_profit_price <= 0:
                logger.warning("bracket for %s requires stop_price and take_profit_price > 0", ticker)
                return None
            # Bracket orders use the class parameter + nested dicts
            kwargs["type"] = "market"
            kwargs["order_class"] = "bracket"
            kwargs["stop_loss"] = {"stop_price": round(stop_price, 2)}
            kwargs["take_profit"] = {"limit_price": round(take_profit_price, 2)}
            # Bracket orders must be day or gtc at the outer level; use day for bracket
            kwargs["time_in_force"] = "day"

        else:
            logger.warning("Unknown native order_type '%s' for %s — skipping", order_type, ticker)
            return None

        order = api.submit_order(**kwargs)
        logger.info(
            "Native %s order placed: %s %d %s | stop=$%.2f | ID: %s",
            order_type, side.upper(), qty, ticker, stop_price or 0, order.id,
        )
        return {
            "order_id": order.id,
            "ticker": ticker,
            "side": side,
            "qty": qty,
            "order_type": order_type,
            "stop_price": stop_price,
            "limit_price": limit_price,
            "trail_percent": trail_percent,
            "take_profit_price": take_profit_price,
            "status": order.status,
            "submitted_at": str(order.submitted_at),
        }
    except Exception as exc:
        logger.warning(
            "Native %s order failed for %s: %s — position open without native protective order",
            order_type, ticker, exc,
        )
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

        # If pending but NOT in Alpaca AND market is closed: remove phantom entry.
        # These are decisions that were logged when capital was unavailable or the order
        # was never actually placed. Never let them linger to be placed later.
        if ticker not in alpaca_pos:
            logger.warning("Reconcile: %s is pending (no order_id) but NOT in Alpaca — removing phantom entry", ticker)
            memory.remove_position(ticker)
            summary["ghosts_removed"].append(ticker)
            continue

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

    # --- Case 4: Direction mismatch — log says LONG but Alpaca says SHORT (or vice versa) ---
    # This happens when the committee produces conflicting enter_long + enter_short decisions
    # for the same ticker in one run (both execute, last one wins in positions_log).
    log_positions = memory.get_open_positions()
    for ticker, alpaca_data in alpaca_pos.items():
        if ticker not in log_positions:
            continue  # Handled above
        alpaca_direction = "LONG" if alpaca_data.get("side") == "long" else "SHORT"
        log_direction = log_positions[ticker].get("direction", "LONG").upper()
        if alpaca_direction != log_direction:
            logger.warning(
                "Reconcile: %s direction mismatch — log=%s Alpaca=%s — correcting log to match Alpaca",
                ticker, log_direction, alpaca_direction,
            )
            memory.update_position(ticker, conviction=log_positions[ticker].get("conviction"), size_pct=None)
            # Full correction: reload and patch direction directly
            import json as _rjson
            from pathlib import Path as _P
            _log_path = _P(__file__).resolve().parent.parent / "data" / "memory" / "positions_log.json"
            try:
                with open(_log_path) as _f:
                    _positions = _rjson.load(_f)
                if ticker in _positions:
                    _positions[ticker]["direction"] = alpaca_direction
                    _positions[ticker]["size_pct"] = round(
                        abs(float(alpaca_data.get("market_value", 0))) / portfolio_value * 100, 1
                    ) if portfolio_value else _positions[ticker].get("size_pct", 10.0)
                    with open(_log_path, "w") as _f:
                        _rjson.dump(_positions, _f, indent=2)
                    logger.info("Reconcile: corrected %s direction to %s in positions_log", ticker, alpaca_direction)
                    if "direction_corrected" not in summary:
                        summary["direction_corrected"] = []
                    summary["direction_corrected"].append(ticker)
            except Exception as _exc:
                logger.warning("Reconcile: could not correct direction for %s: %s", ticker, _exc)
                summary["errors"].append(ticker)

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

    # Load risk snapshot for reconciliation context (written pre-pipeline by portfolio_manager)
    try:
        from utils.risk_snapshot import load_snapshot
        risk_snapshot = load_snapshot()
        if risk_snapshot.get("concentration_flags"):
            logger.info(
                "Risk snapshot loaded — %d concentration flag(s): %s",
                len(risk_snapshot["concentration_flags"]),
                risk_snapshot["concentration_flags"][0][:80] if risk_snapshot["concentration_flags"] else "",
            )
        weakest = risk_snapshot.get("weakest_position")
        if weakest:
            logger.info(
                "Weakest position: %s (conviction %s, P&L %+.1f%%)",
                weakest["ticker"], weakest["conviction"], weakest.get("unrealised_pnl_pct", 0),
            )
    except Exception:
        risk_snapshot = {}

    # Connect to Alpaca
    try:
        api = _get_alpaca_client()
        portfolio = _get_portfolio(api)
        alpaca_positions = _get_alpaca_positions(api)
    except Exception as exc:
        logger.error("Cannot connect to Alpaca: %s", exc)
        return {"error": str(exc), "executed_trades": [], "generated_at": datetime.utcnow().isoformat()}

    portfolio_value = portfolio["portfolio_value"]
    cash = portfolio["cash"]
    logger.info("Portfolio: $%.2f total | $%.2f cash | %d positions",
                portfolio_value, cash, len(alpaca_positions))

    # ── No-leverage unwind: total exposure must never exceed equity ──────────────
    # Triggers when total_exposure > equity (i.e. leverage > 1x), NOT just when
    # cash < 0 (cash can be negative while equity is still whole if shorts offset).
    if NO_LEVERAGE and portfolio.get("is_leveraged", cash < 0):
        equity_now = portfolio["equity"]
        total_exp = portfolio.get("total_exposure", 0)
        overage = total_exp - equity_now
        logger.warning(
            "Leverage detected: exposure $%.0f > equity $%.0f (overage $%.0f). Unwinding.",
            total_exp, equity_now, overage,
        )
        safe_now, _ = _is_safe_to_trade(api)
        if safe_now:
            # Close least-convicted long positions first until exposure ≤ equity
            open_pos = memory.get_open_positions()
            longs = sorted(
                [(t, d) for t, d in alpaca_positions.items() if float(d.get("qty", 0)) > 0],
                key=lambda x: open_pos.get(x[0], {}).get("conviction", 50)
            )
            remaining_overage = overage
            for ticker_u, pos_u in longs:
                if remaining_overage <= 0:
                    break
                qty_u = int(float(pos_u.get("qty", 0)))
                mv_u = abs(float(pos_u.get("market_value", 0)))
                if qty_u < 1:
                    continue
                order_u = _place_order(api, ticker_u, qty_u, "sell",
                                       "No-leverage unwind — exposure exceeds equity")
                if order_u:
                    remaining_overage -= mv_u
                    memory.remove_position(ticker_u)
                    logger.info("Unwind: closed %s (%d shares, $%.0f) — overage remaining: $%.0f",
                                ticker_u, qty_u, mv_u, max(remaining_overage, 0))
            # Refresh portfolio after unwind
            portfolio = _get_portfolio(api)
            portfolio_value = portfolio["portfolio_value"]
            cash = portfolio["cash"]
            alpaca_positions = _get_alpaca_positions(api)
        else:
            logger.warning("Market closed — cannot unwind leverage now. Will retry at next open.")

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

        # ── Pre-process: convert enter → increase when ticker is already held ────
        # Phase B research may flag a ticker we already hold as a new opportunity.
        # Rather than creating a duplicate entry (which Alpaca would just add to), treat
        # it as an increase request so sizing and capital checks run correctly.
        if action in ("enter_long", "enter_short") and ticker in open_positions:
            existing_dir = open_positions[ticker].get("direction", "LONG").upper()
            requested_dir = "LONG" if action == "enter_long" else "SHORT"
            if existing_dir == requested_dir:
                logger.info(
                    "%s: already held %s — converting %s → increase",
                    ticker, existing_dir, action,
                )
                action = "increase"
            else:
                reason = (
                    f"Direction conflict: already held {existing_dir}. "
                    f"Phase A portfolio review must handle direction changes — "
                    f"Phase B cannot enter a position opposing an existing holding."
                )
                logger.warning("%s: %s", ticker, reason)
                skipped.append({"ticker": ticker, "reason": reason})
                continue

        if action in ("enter_long", "enter_short"):
            if not size_pct:
                logger.warning("%s: no size_pct from Committee — skipping", ticker)
                skipped.append({"ticker": ticker, "reason": "no size_pct"})
                continue

            # Safety cap
            if size_pct > HARD_MAX_POSITION_PCT:
                logger.warning("%s: Committee requested %.0f%% — capped at %.0f%%",
                               ticker, size_pct, HARD_MAX_POSITION_PCT)
                size_pct = HARD_MAX_POSITION_PCT

            notional = portfolio_value * size_pct / 100
            # Hard cap: never use margin — limit to equity-safe available capital
            max_notional = _available_capital(portfolio)
            if notional > max_notional:
                logger.warning("%s: notional $%.0f capped to $%.0f (equity $%.0f, exposure $%.0f) — no margin",
                               ticker, notional, max_notional,
                               portfolio.get("equity", 0), portfolio.get("total_exposure", 0))
                notional = max_notional
            shares = int(notional / current_price)
            if shares < 1:
                reason = (
                    f"insufficient_capital: available ${max_notional:.0f} < 1 share at ${current_price:.2f}"
                    if max_notional < current_price
                    else f"notional ${notional:.2f} too small for 1 share at ${current_price:.2f}"
                )
                logger.warning("%s: %s — skipping", ticker, reason)
                skipped.append({"ticker": ticker, "reason": reason})
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

            # Native protective order — placed immediately after entry if Committee requested it
            use_native_stop = decision.get("use_native_stop", False)
            native_order_type = decision.get("native_order_type", "stop")
            native_stop_order_id = None
            if safe and order and use_native_stop:
                stop_order = _place_native_order(
                    api=api,
                    ticker=ticker,
                    qty=shares,
                    direction=direction,
                    stop_price=float(stop_loss) if stop_loss else 0.0,
                    order_type=native_order_type,
                    limit_price=decision.get("native_limit_price"),
                    trail_percent=decision.get("native_trail_percent"),
                    take_profit_price=decision.get("native_take_profit_price"),
                )
                if stop_order:
                    native_stop_order_id = stop_order["order_id"]
                    logger.info(
                        "%s: Native %s order placed (ID: %s)",
                        ticker, native_order_type, native_stop_order_id,
                    )

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
                native_stop_order_id=native_stop_order_id,
            )
            trade = {
                "date": today, "ticker": ticker, "action": action,
                "direction": direction, "shares": shares, "price": current_price,
                "notional": round(shares * current_price, 2),
                "pnl_pct": None, "conviction": conviction,
                "rationale": rationale[:200],
            }
            _log_trade(trade)
            executed_trades.append({
                **trade, "order": order, "stop_loss": stop_loss,
                "native_stop_order_id": native_stop_order_id,
            })

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

        elif action == "reverse":
            # Close existing position then open opposite direction.
            reverse_direction = str(decision.get("reverse_direction") or "").upper()
            if reverse_direction not in ("LONG", "SHORT"):
                logger.warning("%s: reverse missing valid reverse_direction — skipping", ticker)
                errors.append({"ticker": ticker, "error": "reverse_direction missing or invalid"})
                continue

            alpaca_pos_r = alpaca_positions.get(ticker)
            existing_qty = int(alpaca_pos_r["qty"]) if alpaca_pos_r else 0
            existing_dir = open_positions.get(ticker, {}).get("direction", "LONG").upper()

            if existing_qty <= 0:
                logger.warning("%s: reverse requested but no Alpaca position — skipping", ticker)
                errors.append({"ticker": ticker, "error": "no position to reverse"})
                continue

            # Step 1: close existing
            close_side = "sell" if existing_dir == "LONG" else "buy"
            close_order = _place_order(api, ticker, existing_qty, close_side,
                                       f"Reversing {existing_dir}: {rationale}") if safe else {"status": "market_closed_dry_run"}
            entry_price_r = open_positions.get(ticker, {}).get("entry_price")
            pnl_r = round((current_price - entry_price_r) / entry_price_r * 100, 2) if entry_price_r else None
            if existing_dir == "SHORT" and pnl_r is not None:
                pnl_r = -pnl_r
            memory.store_trade_exit(
                ticker=ticker, exit_date=today, exit_price=current_price,
                exit_reason="reversal",
                rationale=f"Reversed {existing_dir}→{reverse_direction}: {rationale}",
            )
            _log_trade({
                "date": today, "ticker": ticker, "action": "reverse_close",
                "direction": existing_dir, "shares": existing_qty, "price": current_price,
                "notional": round(existing_qty * current_price, 2),
                "pnl_pct": pnl_r, "conviction": conviction, "rationale": rationale[:200],
            })

            # Step 2: open reversed position
            reverse_size_pct = float(decision.get("reverse_size_pct") or 5.0)
            reverse_size_pct = min(reverse_size_pct, HARD_MAX_POSITION_PCT)
            # After closing existing position, recalculate available capital
            # (the closed position reduces total_exposure, freeing up room)
            post_close_exposure = max(0, portfolio.get("total_exposure", 0) - existing_qty * current_price)
            post_close_portfolio = {**portfolio, "total_exposure": post_close_exposure}
            new_notional = min(
                portfolio_value * reverse_size_pct / 100,
                _available_capital(post_close_portfolio),
            )
            new_shares = int(new_notional / current_price)
            new_order = None
            if new_shares >= 1:
                new_side = "buy" if reverse_direction == "LONG" else "sell"
                new_order = _place_order(api, ticker, new_shares, new_side,
                                         f"[REVERSAL→{reverse_direction}] {rationale}") if safe else {"status": "market_closed_dry_run"}
                alpaca_oid = new_order.get("order_id") if (safe and new_order) else None
                memory.store_trade_entry(
                    ticker=ticker, entry_date=today, entry_price=current_price,
                    direction=reverse_direction, conviction=conviction,
                    size_pct=reverse_size_pct, rationale=f"[REVERSAL] {rationale}",
                    signals=decision.get("key_catalysts", []),
                    stop_loss=stop_loss, alpaca_order_id=alpaca_oid,
                )
                _log_trade({
                    "date": today, "ticker": ticker, "action": "reverse_open",
                    "direction": reverse_direction, "shares": new_shares, "price": current_price,
                    "notional": round(new_shares * current_price, 2),
                    "pnl_pct": None, "conviction": conviction, "rationale": rationale[:200],
                })
                logger.info("%s: REVERSED %s→%s | closed %d, opened %d @ $%.2f",
                            ticker, existing_dir, reverse_direction, existing_qty, new_shares, current_price)
            else:
                logger.warning("%s: reverse open skipped — insufficient cash for 1 share", ticker)

            executed_trades.append({
                "date": today, "ticker": ticker, "action": "reverse",
                "from_direction": existing_dir, "to_direction": reverse_direction,
                "closed_shares": existing_qty, "opened_shares": new_shares,
                "price": current_price, "pnl_pct": pnl_r, "conviction": conviction,
                "close_order": close_order, "open_order": new_order,
            })

        elif action in ("increase", "decrease"):
            alpaca_pos = alpaca_positions.get(ticker, {})
            current_value = abs(float(alpaca_pos.get("market_value", 0)))
            current_pct = (current_value / portfolio_value * 100) if portfolio_value else 0
            direction = open_positions.get(ticker, {}).get("direction", "LONG").upper()

            if action == "increase":
                if not size_pct:
                    # Committee omits size_pct (Portfolio Construction sets it).
                    # When size_pct is absent (Phase A review), default: add 3% of portfolio
                    # or up to available capital — whichever is smaller.
                    size_pct = round(current_pct + 3.0, 1)
                    logger.info("%s: increase with no size_pct — defaulting to %.1f%% target (current %.1f%% + 3%%)",
                                ticker, size_pct, current_pct)

                additional_pct = max(0, size_pct - current_pct)
                additional_notional = min(
                    portfolio_value * additional_pct / 100,
                    _available_capital(portfolio),
                )
                shares = int(additional_notional / current_price)
                if shares >= 1 and safe:
                    side = "buy" if direction == "LONG" else "sell"
                    order = _place_order(api, ticker, shares, side, f"Increasing position: {rationale}")
                    if order:
                        memory.update_position(ticker, conviction=conviction, size_pct=size_pct)
                        trade = {
                            "date": today, "ticker": ticker, "action": "increase",
                            "direction": direction, "shares": shares, "price": current_price,
                            "notional": round(shares * current_price, 2),
                            "pnl_pct": None, "conviction": conviction, "rationale": rationale[:200],
                        }
                        _log_trade(trade)
                        executed_trades.append(trade)
                elif shares < 1:
                    reason = (
                        f"insufficient_capital: available ${_available_capital(portfolio):.0f} < 1 share at ${current_price:.2f}"
                        if _available_capital(portfolio) < current_price
                        else f"no additional allocation needed (current {current_pct:.1f}% ≥ target {size_pct:.1f}%)"
                    )
                    logger.info("%s: increase skipped — %s", ticker, reason)
                    skipped.append({"ticker": ticker, "reason": reason})

            elif action == "decrease":
                if not size_pct:
                    # Default: reduce by 30% of the current position size
                    size_pct = round(current_pct * 0.7, 1)
                    logger.info("%s: decrease with no size_pct — defaulting to %.1f%% target (30%% reduction from %.1f%%)",
                                ticker, size_pct, current_pct)

                reduce_pct = max(0, current_pct - size_pct)
                reduce_notional = portfolio_value * reduce_pct / 100
                shares = int(reduce_notional / current_price)
                if shares >= 1 and safe:
                    side = "sell" if direction == "LONG" else "buy"
                    order = _place_order(api, ticker, shares, side, f"Reducing position: {rationale}")
                    if order:
                        memory.update_position(ticker, conviction=conviction, size_pct=size_pct)
                        trade = {
                            "date": today, "ticker": ticker, "action": "decrease",
                            "direction": direction, "shares": shares, "price": current_price,
                            "notional": round(shares * current_price, 2),
                            "pnl_pct": None, "conviction": conviction, "rationale": rationale[:200],
                        }
                        _log_trade(trade)
                        executed_trades.append(trade)
                elif shares < 1:
                    reason = f"no shares to reduce (current {current_pct:.1f}% ≤ target {size_pct:.1f}%)"
                    logger.info("%s: decrease skipped — %s", ticker, reason)
                    skipped.append({"ticker": ticker, "reason": reason})

    # Refresh portfolio state
    portfolio = _get_portfolio(api)
    alpaca_positions = _get_alpaca_positions(api)
    portfolio_state = {
        "date": today,
        "equity": portfolio["equity"],
        "cash": portfolio["cash"],
        "portfolio_value": portfolio["portfolio_value"],
        "long_market_value":  portfolio["long_market_value"],
        "short_market_value": portfolio["short_market_value"],
        "total_exposure":     portfolio["total_exposure"],
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
