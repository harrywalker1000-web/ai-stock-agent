"""
Backtest Runner (5d) — replay actual pipeline decisions against historical prices.

NOT a forward simulation — it reads real decisions already made by the pipeline
(stored in data/memory/decision_log.json) and computes what the P&L would have been
if executed at market prices on the decision date.

This answers: "Did our historical decisions actually beat the market?"

Output: data/reports/backtest_result.json
  - Replay of each enter/exit pair with actual price data
  - SPY comparison for each holding period
  - Aggregate win rate, avg return, total alpha vs SPY
  - Per-agent accuracy vs actual outcomes

Usage:
  python scripts/backtest_runner.py                   # All decisions in log
  python scripts/backtest_runner.py --days 90         # Last 90 days
  python scripts/backtest_runner.py --start 2024-01-01 --end 2024-12-31
"""

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = ROOT / "data" / "memory"
REPORTS_DIR = ROOT / "data" / "reports"

DECISION_LOG_PATH = MEMORY_DIR / "decision_log.json"
ATTRIBUTION_LOG_PATH = MEMORY_DIR / "attribution_log.json"
BACKTEST_RESULT_PATH = REPORTS_DIR / "backtest_result.json"


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


def _fetch_price_on_date(ticker: str, date: str) -> float | None:
    """Fetch closing price for ticker on or just after date."""
    try:
        end = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=5)).date().isoformat()
        raw = yf.download(ticker, start=date, end=end, auto_adjust=True, progress=False)
        if raw.empty:
            return None
        return float(raw["Close"].iloc[0])
    except Exception:
        return None


def _fetch_period_return(ticker: str, start: str, end: str) -> float | None:
    """% return from start to end (inclusive), with buffer."""
    try:
        end_buf = (datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1)).date().isoformat()
        raw = yf.download(ticker, start=start, end=end_buf, auto_adjust=True, progress=False)
        if raw.empty or len(raw) < 2:
            return None
        first = float(raw["Close"].iloc[0])
        last  = float(raw["Close"].iloc[-1])
        return round((last / first - 1) * 100, 3) if first else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Core backtest logic
# ---------------------------------------------------------------------------

def _pair_decisions(decisions: list[dict]) -> list[dict]:
    """
    Match enter decisions with their corresponding exit decisions.
    Uses attribution_log.json (ground truth of actual closed trades) where available.
    Falls back to pairing enter→exit decision log entries.
    """
    # Use attribution log as primary source — it has actual prices
    attr_log: list = _load_json(ATTRIBUTION_LOG_PATH, default=[])
    attr_by_ticker: dict[str, list] = {}
    for r in attr_log:
        t = r.get("ticker", "")
        attr_by_ticker.setdefault(t, []).append(r)

    pairs = []

    # Group decisions by ticker
    by_ticker: dict[str, list] = {}
    for d in decisions:
        t = d.get("ticker", "")
        if t:
            by_ticker.setdefault(t, []).append(d)

    for ticker, ticker_decisions in by_ticker.items():
        sorted_d = sorted(ticker_decisions, key=lambda x: x.get("date", ""))

        # If we have real attribution records for this ticker, use them
        if ticker in attr_by_ticker:
            for rec in attr_by_ticker[ticker]:
                pairs.append({
                    "ticker":      ticker,
                    "entry_date":  rec["entry_date"],
                    "exit_date":   rec["exit_date"],
                    "direction":   rec["direction"],
                    "entry_price": rec["entry_price"],
                    "exit_price":  rec["exit_price"],
                    "pnl_pct":     rec["pnl_pct"],
                    "spy_return":  rec.get("spy_return_pct"),
                    "alpha":       rec.get("alpha_vs_spy"),
                    "agent_scores":rec.get("agent_scores", {}),
                    "source":      "attribution_log",
                })
            continue

        # Otherwise, simulate using decision log: pair enter→exit
        open_entry = None
        for d in sorted_d:
            action = d.get("action", "")
            if action in ("enter_long", "enter_short") and open_entry is None:
                open_entry = d
            elif action in ("exit", "decrease") and open_entry is not None:
                # Fetch historical prices at entry and exit dates
                ep = _fetch_price_on_date(ticker, open_entry["date"])
                xp = _fetch_price_on_date(ticker, d["date"])
                if ep and xp:
                    direction = "LONG" if open_entry["action"] == "enter_long" else "SHORT"
                    raw = (xp - ep) / ep
                    pnl = round(raw * 100 if direction == "LONG" else -raw * 100, 3)
                    spy = _fetch_period_return("SPY", open_entry["date"], d["date"])
                    pairs.append({
                        "ticker":      ticker,
                        "entry_date":  open_entry["date"],
                        "exit_date":   d["date"],
                        "direction":   direction,
                        "entry_price": round(ep, 4),
                        "exit_price":  round(xp, 4),
                        "pnl_pct":     pnl,
                        "spy_return":  spy,
                        "alpha":       round(pnl - spy, 3) if spy is not None else None,
                        "agent_scores":open_entry.get("agent_scores", {}),
                        "source":      "decision_log_simulated",
                    })
                open_entry = None

    return pairs


def run(start_date: str | None = None, end_date: str | None = None, days: int | None = None) -> dict:
    """
    Run the backtest and write backtest_result.json.

    Parameters
    ----------
    start_date : ISO date string filter (inclusive)
    end_date   : ISO date string filter (inclusive)
    days       : lookback days from today (overrides start_date)
    """
    today = datetime.utcnow().date().isoformat()

    if days is not None:
        start_date = (datetime.utcnow().date() - timedelta(days=days)).isoformat()
    if end_date is None:
        end_date = today

    decisions: list = _load_json(DECISION_LOG_PATH, default=[])
    if not decisions:
        result = {
            "run_date": today,
            "error": "No decision log found — pipeline has not yet run",
            "trades_analysed": 0,
        }
        _save_json(BACKTEST_RESULT_PATH, result)
        print("No decision log found.")
        return result

    # Filter by date range
    filtered = [
        d for d in decisions
        if (start_date is None or d.get("date", "") >= start_date)
        and (end_date is None or d.get("date", "") <= end_date)
    ]

    print(f"  Backtest: {len(filtered)} decisions in range ({start_date or 'all'} → {end_date})")

    # Build enter/exit pairs with price data
    pairs = _pair_decisions(filtered)
    print(f"  Paired {len(pairs)} complete trade(s)")

    if not pairs:
        result = {
            "run_date": today,
            "start_date": start_date,
            "end_date": end_date,
            "trades_analysed": 0,
            "note": "No complete enter/exit pairs found in decision log for this range",
        }
        _save_json(BACKTEST_RESULT_PATH, result)
        return result

    # Aggregate stats
    profitable = [p for p in pairs if p.get("pnl_pct", 0) >= 0]
    alpha_vals = [p["alpha"] for p in pairs if p.get("alpha") is not None]
    pnl_vals   = [p["pnl_pct"] for p in pairs if p.get("pnl_pct") is not None]

    # Per-agent accuracy across backtest trades
    AGENTS = ["fundamental", "quant", "sentiment"]
    agent_accuracy: dict[str, dict] = {a: {"correct": 0, "wrong": 0} for a in AGENTS}
    for p in pairs:
        direction = p.get("direction", "LONG")
        pnl = p.get("pnl_pct", 0)
        profitable_trade = pnl >= 0
        for agent in AGENTS:
            score = p.get("agent_scores", {}).get(agent)
            if score is None or score == 0:
                continue
            if score > 60:
                signal = "bullish"
            elif score < 40:
                signal = "bearish"
            else:
                continue  # neutral
            if direction == "LONG":
                correct = (signal == "bullish") == profitable_trade
            else:
                correct = (signal == "bearish") == profitable_trade
            if correct:
                agent_accuracy[agent]["correct"] += 1
            else:
                agent_accuracy[agent]["wrong"] += 1

    agent_stats = {}
    for agent, counts in agent_accuracy.items():
        total_calls = counts["correct"] + counts["wrong"]
        agent_stats[agent] = {
            "directional_accuracy_pct": round(counts["correct"] / total_calls * 100, 1) if total_calls else None,
            "correct": counts["correct"],
            "wrong": counts["wrong"],
        }

    result = {
        "run_date":        today,
        "start_date":      start_date,
        "end_date":        end_date,
        "trades_analysed": len(pairs),
        "win_rate_pct":    round(len(profitable) / len(pairs) * 100, 1),
        "avg_pnl_pct":     round(sum(pnl_vals) / len(pnl_vals), 3) if pnl_vals else None,
        "total_pnl_pct":   round(sum(pnl_vals), 3) if pnl_vals else None,
        "avg_alpha_vs_spy":round(sum(alpha_vals) / len(alpha_vals), 3) if alpha_vals else None,
        "agent_accuracy":  agent_stats,
        "trades":          sorted(pairs, key=lambda x: x.get("entry_date", "")),
    }

    _save_json(BACKTEST_RESULT_PATH, result)

    # Console summary
    print(f"\n  ── Backtest Summary ─────────────────────────────────")
    print(f"  Trades:    {len(pairs)}")
    print(f"  Win rate:  {result['win_rate_pct']:.1f}%")
    if result["avg_pnl_pct"] is not None:
        print(f"  Avg P&L:   {result['avg_pnl_pct']:+.2f}%")
    if result["avg_alpha_vs_spy"] is not None:
        direction = "outperforming" if result["avg_alpha_vs_spy"] >= 0 else "underperforming"
        print(f"  Avg alpha: {result['avg_alpha_vs_spy']:+.2f}% vs SPY ({direction})")
    for agent, stats in agent_stats.items():
        if stats["directional_accuracy_pct"] is not None:
            print(f"  {agent.capitalize()} accuracy: {stats['directional_accuracy_pct']:.0f}%")
    print(f"  Results → {BACKTEST_RESULT_PATH}")

    return result


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Replay pipeline decisions against historical prices")
    parser.add_argument("--start", help="Start date YYYY-MM-DD", default=None)
    parser.add_argument("--end",   help="End date YYYY-MM-DD",   default=None)
    parser.add_argument("--days",  help="Lookback days from today", type=int, default=None)
    args = parser.parse_args()

    run(start_date=args.start, end_date=args.end, days=args.days)
