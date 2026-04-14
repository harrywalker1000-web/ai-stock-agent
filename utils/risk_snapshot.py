"""
Portfolio Risk Snapshot — utility (not an agent)

Computed at the start of every pipeline run by portfolio_manager.run(),
AFTER Alpaca reconciliation and BEFORE any agent runs.

Injected into: Investment Committee, Portfolio Construction, Trade Executor.
NOT injected into: Fundamental, Quant, Sentiment, Macro, Sector, News,
                   Institutional, Candidate Generator (research must be unbiased).

Output: data/reports/portfolio_risk_snapshot.json
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

from utils.logger import get_logger

logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
SNAPSHOT_PATH = REPORTS_DIR / "portfolio_risk_snapshot.json"

POSITIONS_LOG_PATH = ROOT / "data" / "memory" / "positions_log.json"
PORTFOLIO_STATE_PATH = REPORTS_DIR / "portfolio_state.json"

CORRELATION_WINDOW_DAYS = 90
HIGH_CORRELATION_THRESHOLD = 0.75


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


def _fetch_returns(tickers: list[str], window_days: int = CORRELATION_WINDOW_DAYS) -> pd.DataFrame:
    """
    Fetch adjusted-close daily returns for a list of tickers over the last
    window_days calendar days. Returns a DataFrame of % returns (NaN where
    data is unavailable). Includes SPY for beta calculation.
    """
    end = datetime.utcnow().date()
    # Add buffer days to account for weekends and holidays
    start = end - timedelta(days=window_days + 20)

    all_tickers = list(set(tickers + ["SPY"]))
    try:
        raw = yf.download(
            all_tickers,
            start=start.isoformat(),
            end=end.isoformat(),
            auto_adjust=True,
            progress=False,
        )
        if raw.empty:
            return pd.DataFrame()

        # Handle single vs multi ticker response
        if isinstance(raw.columns, pd.MultiIndex):
            prices = raw["Close"]
        else:
            prices = raw[["Close"]] if "Close" in raw.columns else raw

        prices = prices.dropna(how="all")
        returns = prices.pct_change().dropna(how="all")
        return returns
    except Exception as exc:
        logger.warning("risk_snapshot: failed to fetch returns: %s", exc)
        return pd.DataFrame()


def _compute_correlation_matrix(returns: pd.DataFrame, tickers: list[str]) -> dict:
    """
    Compute pairwise Pearson correlation over the available return window.
    Returns dict of {"TICKER1_TICKER2": corr_value} for all pairs.
    """
    available = [t for t in tickers if t in returns.columns]
    if len(available) < 2:
        return {}

    matrix = {}
    subset = returns[available].dropna()
    if len(subset) < 10:
        return {}  # Not enough data points

    corr = subset.corr()
    for i, t1 in enumerate(available):
        for t2 in available[i + 1:]:
            val = corr.loc[t1, t2] if t1 in corr.index and t2 in corr.columns else None
            if val is not None and not np.isnan(val):
                key = f"{t1}_{t2}"
                matrix[key] = round(float(val), 3)
    return matrix


def _compute_beta(returns: pd.DataFrame, ticker: str) -> Optional[float]:
    """
    Compute beta of ticker vs SPY over the available window.
    beta = cov(ticker, SPY) / var(SPY)
    """
    if ticker not in returns.columns or "SPY" not in returns.columns:
        return None
    df = returns[[ticker, "SPY"]].dropna()
    if len(df) < 10:
        return None
    cov_matrix = np.cov(df[ticker], df["SPY"])
    spy_var = np.var(df["SPY"])
    if spy_var == 0:
        return None
    return round(float(cov_matrix[0, 1] / spy_var), 3)


def _fetch_sector(ticker: str) -> str:
    """Fetch sector from yfinance. Returns 'Unknown' on any failure."""
    try:
        info = yf.Ticker(ticker).info
        return info.get("sector") or "Unknown"
    except Exception:
        return "Unknown"


# ---------------------------------------------------------------------------
# Main compute function
# ---------------------------------------------------------------------------

def compute_risk_snapshot() -> dict:
    """
    Compute the full Portfolio Risk Snapshot and write it to
    data/reports/portfolio_risk_snapshot.json.

    Returns the snapshot dict (empty dict if no positions).
    """
    as_of = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")

    positions_log: dict = _load_json(POSITIONS_LOG_PATH, default={})
    portfolio_state: dict = _load_json(PORTFOLIO_STATE_PATH, default={})

    if not positions_log:
        snapshot = {
            "as_of": as_of,
            "total_portfolio_value": portfolio_state.get("portfolio_value", 0),
            "cash_available": portfolio_state.get("cash", 0),
            "cash_pct": 100.0,
            "invested_pct": 0.0,
            "positions": [],
            "sector_exposure": {},
            "factor_exposure": {},
            "correlation_matrix": {},
            "concentration_flags": [],
            "weakest_position": None,
            "strongest_position": None,
            "note": "No open positions.",
        }
        _write_snapshot(snapshot)
        return snapshot

    equity = float(portfolio_state.get("equity") or portfolio_state.get("portfolio_value") or 100_000)
    cash = float(portfolio_state.get("cash") or 0)
    state_positions: dict = portfolio_state.get("positions", {})

    tickers = list(positions_log.keys())
    logger.info("risk_snapshot: computing for %d positions — fetching 90-day returns...", len(tickers))

    # Fetch returns for all held tickers + SPY
    returns_df = _fetch_returns(tickers, CORRELATION_WINDOW_DAYS)

    # Build per-position data
    position_records = []
    sector_totals: dict[str, float] = {}

    for ticker, pos in positions_log.items():
        direction = (pos.get("direction") or "LONG").upper()
        size_pct = abs(float(pos.get("size_pct") or 0))
        conviction = int(pos.get("conviction") or 50)
        entry_price = float(pos.get("entry_price") or 0)
        entry_date = pos.get("entry_date") or ""
        entry_thesis = (pos.get("entry_thesis") or "")[:150]
        signals = pos.get("signals") or []

        # Current price + unrealized P&L from portfolio_state
        state_pos = state_positions.get(ticker, {})
        current_price = float(state_pos.get("current_price") or entry_price)
        unrealized_pnl_abs = float(state_pos.get("unrealized_pnl") or 0)
        unrealized_pnl_pct = 0.0
        if entry_price and entry_price > 0:
            raw = (current_price - entry_price) / entry_price
            unrealized_pnl_pct = round((raw if direction == "LONG" else -raw) * 100, 2)

        # Days held
        days_held = 0
        if entry_date:
            try:
                entry_dt = datetime.strptime(entry_date, "%Y-%m-%d").date()
                days_held = (datetime.utcnow().date() - entry_dt).days
            except Exception:
                pass

        # Sector — prefer from positions_log, fall back to yfinance
        sector = pos.get("sector") or _fetch_sector(ticker)

        # Beta
        beta = _compute_beta(returns_df, ticker)

        # Agent scores (stored at entry time in decision_log / positions_log)
        agent_scores = pos.get("agent_scores_detail") or {}
        agent_scores_clean = {
            "fundamental": agent_scores.get("fundamental"),
            "quant": agent_scores.get("quant"),
            "sentiment": agent_scores.get("sentiment"),
        }

        # Infer trade type from signals / entry_thesis keywords
        trade_type = "unknown"
        thesis_lower = entry_thesis.lower()
        signal_str = " ".join(s.lower() for s in signals)
        if any(k in thesis_lower or k in signal_str for k in ("reversion", "oversold", "dislocation", "rsi")):
            trade_type = "mean_reversion"
        elif any(k in thesis_lower or k in signal_str for k in ("momentum", "breakout", "trend", "catalyst")):
            trade_type = "momentum"

        rec = {
            "ticker": ticker,
            "direction": direction,
            "size_pct": size_pct,
            "entry_price": entry_price,
            "current_price": current_price,
            "unrealised_pnl_pct": unrealized_pnl_pct,
            "unrealised_pnl_abs": round(unrealized_pnl_abs, 2),
            "conviction_at_entry": conviction,
            "days_held": days_held,
            "sector": sector,
            "thesis_summary": entry_thesis,
            "agent_scores": {k: v for k, v in agent_scores_clean.items() if v is not None},
            "beta": beta,
            "trade_type": trade_type,
        }
        position_records.append(rec)

        # Sector aggregation (use abs size_pct — shorts still consume sector exposure)
        sector_totals[sector] = round(sector_totals.get(sector, 0.0) + size_pct, 1)

    # Correlation matrix (only long tickers — shorts are hedges, not concentrations)
    long_tickers = [r["ticker"] for r in position_records if r["direction"] == "LONG"]
    correlation_matrix = _compute_correlation_matrix(returns_df, long_tickers) if len(long_tickers) >= 2 else {}

    # Concentration flags: pairs with correlation > threshold
    concentration_flags = []
    for pair_key, corr_val in correlation_matrix.items():
        if corr_val > HIGH_CORRELATION_THRESHOLD:
            t1, t2 = pair_key.split("_", 1)
            # Find sectors for both
            s1 = next((r["sector"] for r in position_records if r["ticker"] == t1), "?")
            s2 = next((r["sector"] for r in position_records if r["ticker"] == t2), "?")
            concentration_flags.append(
                f"{t1} and {t2} correlation is {corr_val:.2f} over 90 days "
                f"(sectors: {s1} / {s2}) — effectively a concentrated bet"
            )

    # Factor exposure
    longs = [r for r in position_records if r["direction"] == "LONG"]
    shorts = [r for r in position_records if r["direction"] == "SHORT"]
    total_deployed = sum(r["size_pct"] for r in position_records)

    betas_with_size = [(r["beta"], r["size_pct"]) for r in position_records if r["beta"] is not None]
    beta_weighted_avg = None
    if betas_with_size and total_deployed > 0:
        weighted = sum(b * s for b, s in betas_with_size) / total_deployed
        beta_weighted_avg = round(weighted, 3)

    mean_rev_pct = 0
    momentum_pct = 0
    known_type_deployed = sum(r["size_pct"] for r in position_records if r["trade_type"] != "unknown")
    if known_type_deployed > 0:
        mean_rev_pct = round(
            sum(r["size_pct"] for r in position_records if r["trade_type"] == "mean_reversion")
            / known_type_deployed * 100, 1
        )
        momentum_pct = round(
            sum(r["size_pct"] for r in position_records if r["trade_type"] == "momentum")
            / known_type_deployed * 100, 1
        )

    factor_exposure = {
        "beta_weighted_avg": beta_weighted_avg,
        "long_short_ratio": f"{len(longs)}L/{len(shorts)}S",
        "mean_reversion_pct": mean_rev_pct,
        "momentum_pct": momentum_pct,
    }

    # Cash %
    cash_pct = round(cash / equity * 100, 1) if equity > 0 else 100.0
    invested_pct = round(100.0 - cash_pct, 1)

    # Weakest: lowest conviction; tiebreak by worst P&L
    weakest = None
    if position_records:
        candidate_weak = sorted(
            position_records,
            key=lambda r: (r["conviction_at_entry"], r["unrealised_pnl_pct"])
        )[0]
        weakest = {
            "ticker": candidate_weak["ticker"],
            "conviction": candidate_weak["conviction_at_entry"],
            "unrealised_pnl_pct": candidate_weak["unrealised_pnl_pct"],
            "direction": candidate_weak["direction"],
            "note": (
                f"Lowest conviction in book. "
                f"P&L: {candidate_weak['unrealised_pnl_pct']:+.1f}%. "
                f"Candidate for trim if capital needed for higher-conviction opportunity."
            ),
        }

    # Strongest: highest conviction; tiebreak by best P&L
    strongest = None
    if position_records:
        candidate_strong = sorted(
            position_records,
            key=lambda r: (-r["conviction_at_entry"], -r["unrealised_pnl_pct"])
        )[0]
        strongest = {
            "ticker": candidate_strong["ticker"],
            "conviction": candidate_strong["conviction_at_entry"],
            "unrealised_pnl_pct": candidate_strong["unrealised_pnl_pct"],
            "direction": candidate_strong["direction"],
        }

    snapshot = {
        "as_of": as_of,
        "total_portfolio_value": round(equity, 2),
        "cash_available": round(cash, 2),
        "cash_pct": cash_pct,
        "invested_pct": invested_pct,
        "positions": position_records,
        "sector_exposure": dict(sorted(sector_totals.items(), key=lambda x: -x[1])),
        "factor_exposure": factor_exposure,
        "correlation_matrix": correlation_matrix,
        "concentration_flags": concentration_flags,
        "weakest_position": weakest,
        "strongest_position": strongest,
    }

    _write_snapshot(snapshot)
    logger.info(
        "risk_snapshot: written — %d positions | %d pairs | %d flags | weakest: %s (conv %s) | strongest: %s (conv %s)",
        len(position_records),
        len(correlation_matrix),
        len(concentration_flags),
        weakest["ticker"] if weakest else "—",
        weakest["conviction"] if weakest else "—",
        strongest["ticker"] if strongest else "—",
        strongest["conviction"] if strongest else "—",
    )
    return snapshot


def _write_snapshot(snapshot: dict) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PATH, "w") as f:
        json.dump(snapshot, f, indent=2)


def load_snapshot() -> dict:
    """Load and return the most recently written snapshot, or {} if missing."""
    return _load_json(SNAPSHOT_PATH, default={})


def format_snapshot_for_prompt(snapshot: dict) -> str:
    """
    Produce a compact plain-text block for injection into LLM prompts.
    Designed to be informative but not token-wasteful.
    """
    if not snapshot or not snapshot.get("positions"):
        return "PORTFOLIO RISK SNAPSHOT: No open positions."

    lines = [
        f"PORTFOLIO RISK SNAPSHOT (as of {snapshot.get('as_of', '?')}):",
        f"  Value: ${snapshot['total_portfolio_value']:,.0f} | "
        f"Cash: ${snapshot['cash_available']:,.0f} ({snapshot['cash_pct']:.1f}%) | "
        f"Invested: {snapshot['invested_pct']:.1f}%",
    ]

    fe = snapshot.get("factor_exposure", {})
    if fe:
        lines.append(
            f"  Factor exposure: beta={fe.get('beta_weighted_avg', 'N/A')} | "
            f"{fe.get('long_short_ratio', '?')} | "
            f"mean_reversion={fe.get('mean_reversion_pct', 0):.0f}% of book | "
            f"momentum={fe.get('momentum_pct', 0):.0f}%"
        )

    se = snapshot.get("sector_exposure", {})
    if se:
        sector_str = " | ".join(f"{s}: {v:.0f}%" for s, v in list(se.items())[:6])
        lines.append(f"  Sector exposure: {sector_str}")

    flags = snapshot.get("concentration_flags", [])
    if flags:
        lines.append(f"  ⚠ CONCENTRATION FLAGS ({len(flags)}):")
        for flag in flags:
            lines.append(f"    - {flag}")
    else:
        lines.append("  Concentration: No high-correlation pairs detected.")

    weakest = snapshot.get("weakest_position")
    if weakest:
        lines.append(
            f"  Weakest position: {weakest['ticker']} ({weakest['direction']}) | "
            f"conviction {weakest['conviction']}/100 | P&L {weakest['unrealised_pnl_pct']:+.1f}% | "
            f"{weakest['note']}"
        )

    strongest = snapshot.get("strongest_position")
    if strongest:
        lines.append(
            f"  Strongest position: {strongest['ticker']} ({strongest['direction']}) | "
            f"conviction {strongest['conviction']}/100 | P&L {strongest['unrealised_pnl_pct']:+.1f}%"
        )

    return "\n".join(lines)
