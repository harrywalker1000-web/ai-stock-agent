"""
Attribution Engine — runs on every trade close.

For each closed position, computes:
  - Actual trade return vs SPY + sector ETF over the same holding period
  - Alpha generated (portfolio_return - benchmark_return)
  - Agent directional accuracy (did each agent's score predict the right direction?)

Writes:
  data/memory/attribution_log.json       — one record per closed trade
  data/memory/agent_accuracy_summary.json — rolling accuracy per agent

Called by: memory_agent.store_trade_exit() → attribution_engine.attribute_trade()
Also callable standalone: python scripts/attribution_engine.py
"""

import json
from datetime import datetime, timedelta
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = ROOT / "data" / "memory"
ATTRIBUTION_LOG_PATH = MEMORY_DIR / "attribution_log.json"
ACCURACY_SUMMARY_PATH = MEMORY_DIR / "agent_accuracy_summary.json"

# Sector → ETF mapping for benchmark attribution
SECTOR_ETF_MAP = {
    "Technology":              "XLK",
    "Healthcare":              "XLV",
    "Consumer Disc":           "XLY",
    "Consumer Discretionary":  "XLY",
    "Consumer Stap":           "XLP",
    "Consumer Staples":        "XLP",
    "Energy":                  "XLE",
    "Financials":              "XLF",
    "Financial Services":      "XLF",
    "Industrials":             "XLI",
    "Materials":               "XLB",
    "Real Estate":             "XLRE",
    "Utilities":               "XLU",
    "Communication Services":  "XLC",
}

# Agents whose scores we track for directional accuracy
TRACKED_AGENTS = ["fundamental", "quant", "sentiment", "macro", "news"]


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


def _fetch_period_return(ticker: str, start: str, end: str) -> float | None:
    """
    Returns % return for ticker between start and end date.
    Adds 1-day buffer on end so the close on exit_date is included.
    """
    try:
        end_buffered = (
            datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1)
        ).date().isoformat()
        raw = yf.download(
            ticker, start=start, end=end_buffered,
            auto_adjust=True, progress=False,
        )
        if raw.empty or len(raw) < 2:
            return None
        first = float(raw["Close"].iloc[0])
        last  = float(raw["Close"].iloc[-1])
        if first == 0:
            return None
        return round((last / first - 1) * 100, 3)
    except Exception:
        return None


def _fetch_sector_from_yfinance(ticker: str) -> str | None:
    """Look up sector for a ticker via yfinance."""
    try:
        info = yf.Ticker(ticker).info
        return info.get("sector") or None
    except Exception:
        return None


def _compute_agent_accuracy(
    agent_scores: dict,
    direction: str,
    pnl_pct: float,
) -> dict:
    """
    For each tracked agent, determine if their score predicted the right direction.

    Signal thresholds:
      score > 60 → bullish signal
      score < 40 → bearish signal
      40–60      → neutral (no directional call)

    Correct if the signal matched what actually happened:
      LONG + profitable → bullish was correct
      LONG + loss       → bearish would have been correct (bullish was wrong)
      SHORT + profitable → bearish was correct
      SHORT + loss       → bullish would have been correct (bearish was wrong)
    """
    was_profitable = pnl_pct >= 0
    direction_upper = direction.upper()

    result = {}
    for agent, score in agent_scores.items():
        if not isinstance(score, (int, float)) or score <= 0:
            continue
        score_f = float(score)
        if score_f > 60:
            signal = "bullish"
        elif score_f < 40:
            signal = "bearish"
        else:
            signal = "neutral"

        if signal == "neutral":
            correct = None  # No directional call — exclude from accuracy stats
        elif direction_upper == "LONG":
            correct = (signal == "bullish") == was_profitable
        else:  # SHORT
            correct = (signal == "bearish") == was_profitable

        result[agent] = {
            "score": int(score_f),
            "signal": signal,
            "correct": correct,
        }

    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def attribute_trade(
    ticker: str,
    entry_date: str,
    exit_date: str,
    entry_price: float,
    exit_price: float,
    direction: str,
    agent_scores: dict,
    sector: str | None = None,
    exit_reason: str = "unknown",
) -> dict:
    """
    Compute full attribution for a closed trade and persist results.

    Parameters
    ----------
    ticker        : e.g. "NVDA"
    entry_date    : ISO date string "YYYY-MM-DD"
    exit_date     : ISO date string "YYYY-MM-DD"
    entry_price   : float
    exit_price    : float
    direction     : "LONG" or "SHORT"
    agent_scores  : {"fundamental": 72, "quant": 65, "sentiment": 58, ...}
    sector        : optional — looked up via yfinance if None
    exit_reason   : string tag for why position was closed

    Returns
    -------
    dict with full attribution record
    """
    direction_upper = direction.upper()

    # Actual trade return
    raw_return = (exit_price - entry_price) / entry_price if entry_price else 0
    pnl_pct = round(
        raw_return * 100 if direction_upper == "LONG" else -raw_return * 100,
        3,
    )

    # Sector lookup if not provided
    if not sector:
        sector = _fetch_sector_from_yfinance(ticker)

    # Benchmark returns over same holding period
    spy_return    = _fetch_period_return("SPY", entry_date, exit_date)
    sector_etf    = SECTOR_ETF_MAP.get(sector or "", None)
    sector_return = _fetch_period_return(sector_etf, entry_date, exit_date) if sector_etf else None

    # Alpha
    alpha_vs_spy    = round(pnl_pct - spy_return, 3)    if spy_return    is not None else None
    alpha_vs_sector = round(pnl_pct - sector_return, 3) if sector_return is not None else None

    # Agent directional accuracy
    agent_accuracy = _compute_agent_accuracy(agent_scores, direction_upper, pnl_pct)

    record = {
        "ticker":             ticker,
        "entry_date":         entry_date,
        "exit_date":          exit_date,
        "direction":          direction_upper,
        "entry_price":        round(float(entry_price), 4),
        "exit_price":         round(float(exit_price), 4),
        "pnl_pct":            pnl_pct,
        "spy_return_pct":     spy_return,
        "sector":             sector,
        "sector_etf":         sector_etf,
        "sector_return_pct":  sector_return,
        "alpha_vs_spy":       alpha_vs_spy,
        "alpha_vs_sector":    alpha_vs_sector,
        "exit_reason":        exit_reason,
        "agent_scores":       agent_scores,
        "agent_accuracy":     agent_accuracy,
        "attributed_at":      datetime.utcnow().isoformat(),
    }

    # Append to attribution log
    log: list = _load_json(ATTRIBUTION_LOG_PATH, default=[])
    log.append(record)
    _save_json(ATTRIBUTION_LOG_PATH, log)

    # Recompute rolling accuracy summary
    _recompute_accuracy_summary(log)

    return record


# ---------------------------------------------------------------------------
# Rolling accuracy summary
# ---------------------------------------------------------------------------

def _recompute_accuracy_summary(log: list) -> dict:
    """
    Compute rolling accuracy stats per agent from the full attribution log.
    Written to agent_accuracy_summary.json after every new trade close.
    """
    total_trades    = len(log)
    profitable      = sum(1 for r in log if r.get("pnl_pct", 0) >= 0)
    total_pnl       = sum(r.get("pnl_pct", 0) for r in log)
    alpha_spy_vals  = [r["alpha_vs_spy"] for r in log if r.get("alpha_vs_spy") is not None]

    stats = {
        agent: {"correct": 0, "wrong": 0, "neutral": 0, "total_trades": 0}
        for agent in TRACKED_AGENTS
    }

    for record in log:
        acc = record.get("agent_accuracy", {})
        for agent in TRACKED_AGENTS:
            if agent not in acc:
                continue
            stats[agent]["total_trades"] += 1
            val = acc[agent].get("correct")
            if val is True:
                stats[agent]["correct"] += 1
            elif val is False:
                stats[agent]["wrong"] += 1
            else:
                stats[agent]["neutral"] += 1

    agents_summary = {}
    for agent, s in stats.items():
        directional_calls = s["correct"] + s["wrong"]
        accuracy = (
            round(s["correct"] / directional_calls * 100, 1)
            if directional_calls > 0 else None
        )
        agents_summary[agent] = {
            "total_trades":           s["total_trades"],
            "correct_direction":      s["correct"],
            "wrong_direction":        s["wrong"],
            "neutral_calls":          s["neutral"],
            "directional_accuracy_pct": accuracy,
        }

    summary = {
        "last_updated":        datetime.utcnow().isoformat(),
        "total_closed_trades": total_trades,
        "profitable_trades":   profitable,
        "win_rate_pct":        round(profitable / total_trades * 100, 1) if total_trades else None,
        "avg_pnl_pct":         round(total_pnl / total_trades, 3) if total_trades else None,
        "avg_alpha_vs_spy":    round(sum(alpha_spy_vals) / len(alpha_spy_vals), 3) if alpha_spy_vals else None,
        "agents":              agents_summary,
    }

    _save_json(ACCURACY_SUMMARY_PATH, summary)
    return summary


# ---------------------------------------------------------------------------
# Committee prompt summary
# ---------------------------------------------------------------------------

def get_accuracy_summary_for_prompt() -> str:
    """
    Return a compact multi-line summary for injection into the Committee prompt.
    Returns empty string if fewer than 3 closed trades (too noisy to be useful).
    """
    summary = _load_json(ACCURACY_SUMMARY_PATH, default={})
    total = summary.get("total_closed_trades", 0)
    if total < 3:
        return ""

    win_rate  = summary.get("win_rate_pct")
    avg_alpha = summary.get("avg_alpha_vs_spy")
    agents    = summary.get("agents", {})

    header = f"SIGNAL ATTRIBUTION ({total} closed trades): Win rate {win_rate:.0f}%" if win_rate is not None else f"SIGNAL ATTRIBUTION ({total} closed trades)"
    if avg_alpha is not None:
        header += f" | Avg alpha vs SPY: {avg_alpha:+.1f}%"

    agent_parts = []
    for agent in TRACKED_AGENTS:
        data = agents.get(agent, {})
        acc = data.get("directional_accuracy_pct")
        n   = data.get("total_trades", 0)
        if acc is not None and n >= 2:
            label = agent.capitalize()
            agent_parts.append(f"{label}: {acc:.0f}% directional ({n} trades)")

    lines = [header]
    if agent_parts:
        lines.append("Agent accuracy: " + " | ".join(agent_parts))
    lines.append(
        "Weight down signals from agents with <50% directional accuracy. "
        "Over-weight signals from agents with >65% directional accuracy."
    )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    summary = _load_json(ACCURACY_SUMMARY_PATH, default={})
    if not summary:
        print("No attribution data yet — no trades have been closed.")
    else:
        print(json.dumps(summary, indent=2))
        print("\n--- Committee prompt summary ---")
        print(get_accuracy_summary_for_prompt() or "(fewer than 3 trades — no prompt injected yet)")
