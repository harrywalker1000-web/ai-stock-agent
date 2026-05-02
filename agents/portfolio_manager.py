"""
Portfolio Manager — orchestration module (not a numbered agent)

Coordinates the two-phase daily pipeline per PORTFOLIO_RULES.md:

  Phase A — Portfolio Review (runs first, before any new research)
    Lite mode    (default): Macro + News + Quant on each held position
    Standard mode:          Lite + Sentiment (analyst upgrades, short interest)
    Full mode:              Standard + Fundamental (complete re-analysis)
    Auto mode:              Standard daily; adds Fundamental automatically
                            if any held ticker has earnings within 3 days
    → Committee makes hold / increase / decrease / exit decisions
    → Executor implements them

  Phase B — New Opportunity Research
    Full Phase 1–3 pipeline on fresh candidates
    Sentiment agent runs in Standard / Full / Auto (skipped in Lite)
    → Committee selects new positions to enter
    → Executor implements them

  Memory Agent consolidation runs at the end.

Config via environment variables:
  PHASE_A_MODE=Auto    (Lite | Standard | Full | Auto — default Lite)
  SKIP_PHASE_A=false   (set true to skip portfolio review, e.g. first run)
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

import agents.memory_agent as memory
from utils.logger import get_logger

import json as _json

load_dotenv()
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent


def _load_json(path: Path, default=None):
    if not path.exists():
        return default if default is not None else {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


# Config: read ANALYSIS_MODE from JSON config file, env var overrides
_CONFIG_PATH = ROOT / "data" / "config" / "analysis_mode.json"


def _read_analysis_mode() -> str:
    """Read ANALYSIS_MODE from env var (highest priority) or config JSON file."""
    env_mode = os.environ.get("ANALYSIS_MODE") or os.environ.get("PHASE_A_MODE")
    if env_mode:
        return env_mode.capitalize()
    if _CONFIG_PATH.exists():
        try:
            with open(_CONFIG_PATH) as f:
                data = json.load(f)
            return str(data.get("mode", "Auto")).capitalize()
        except Exception:
            pass
    return "Auto"


PHASE_A_MODE = _read_analysis_mode()   # Lite | Standard | Full | Auto
SKIP_PHASE_A = os.environ.get("SKIP_PHASE_A", "false").lower() == "true"


def _tickers_with_near_earnings(tickers: list, days: int = 3) -> list:
    """Return subset of tickers that have an earnings date within `days` calendar days.
    Used by Auto mode to decide whether to run Fundamental Analyst in Phase A.
    """
    try:
        import yfinance as yf
        import pandas as pd
        from datetime import datetime, timedelta, timezone

        today = datetime.now(timezone.utc).date()
        cutoff = today + timedelta(days=days)
        near = []
        for ticker in tickers:
            try:
                info = yf.Ticker(ticker).info
                ed = info.get("earningsDate") or info.get("earningsTimestamp")
                if ed:
                    if isinstance(ed, (list, tuple)):
                        ed = ed[0]
                    ts = (pd.Timestamp(ed, unit="s")
                          if isinstance(ed, (int, float))
                          else pd.Timestamp(ed))
                    if today <= ts.date() <= cutoff:
                        near.append(ticker)
            except Exception:
                continue
        return near
    except Exception as exc:
        logger.warning("Earnings proximity check failed: %s — skipping Fundamental trigger", exc)
        return []
SKIP_PHASE_B = os.environ.get("SKIP_PHASE_B", "false").lower() == "true"


def _fetch_live_portfolio() -> dict | None:
    """
    Fetch live account state from Alpaca to check for leverage.
    Returns None silently if credentials are missing or the call fails.
    """
    try:
        import alpaca_trade_api as tradeapi
        key    = os.environ.get("ALPACA_API_KEY")
        secret = os.environ.get("ALPACA_SECRET_KEY")
        base   = os.environ.get("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
        if not key or not secret:
            return None
        api      = tradeapi.REST(key, secret, base)
        account  = api.get_account()
        equity      = float(account.equity)
        last_equity = float(account.last_equity or account.equity)
        cash     = float(account.cash)
        long_mv  = float(account.long_market_value or 0)
        short_mv = abs(float(account.short_market_value or 0))
        total_exp = long_mv + short_mv
        return {
            "equity":          equity,
            "last_equity":     last_equity,
            "cash":            cash,
            "long_mv":         long_mv,
            "short_mv":        short_mv,
            "total_exposure":  total_exp,
            "is_leveraged":    total_exp > equity,
            "leverage_ratio":  round(total_exp / equity, 2) if equity else 0,
        }
    except Exception as exc:
        logger.warning("Could not fetch live portfolio for leverage check: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Portfolio Construction helper
# ---------------------------------------------------------------------------

def _run_portfolio_construction(phase_b_committee: dict, phase_a_decisions: list | None = None) -> dict:
    """
    Runs after both Phase A and Phase B committees have deliberated.
    Calls construct_portfolio_allocation() with the full book context,
    then patches committee_report.json with the final target weights so
    the executor uses construction-determined sizes, not committee guesses.
    """
    from agents.investment_committee import construct_portfolio_allocation

    phase_b_decisions = phase_b_committee.get("position_decisions", [])
    open_positions = memory.get_open_positions()

    committee_report_path = ROOT / "data" / "reports" / "committee_report.json"
    # Phase A decisions passed directly from the main pipeline — no file read needed.
    phase_a_decisions = list(phase_a_decisions or [])

    # Get portfolio state from Alpaca (via portfolio_state.json written by Phase A executor)
    # Use equity-minus-exposure for cash_pct so short-sale proceeds don't inflate the figure.
    equity = 100_000.0
    cash_pct = 100.0
    portfolio_state_path = ROOT / "data" / "reports" / "portfolio_state.json"
    if portfolio_state_path.exists():
        try:
            with open(portfolio_state_path) as f:
                ps = _json.load(f)
            pv = float(ps.get("portfolio_value") or ps.get("equity") or 0)
            long_mv  = float(ps.get("long_market_value") or 0)
            short_mv = abs(float(ps.get("short_market_value") or 0))
            total_exp = long_mv + short_mv
            if pv > 0:
                equity = pv
                floor = pv * 0.05
                free = max(0.0, pv - total_exp - floor)
                cash_pct = round(free / pv * 100, 1)
        except Exception:
            pass

    macro_report_path = ROOT / "data" / "reports" / "macro_report.json"
    macro_regime = "NEUTRAL"
    if macro_report_path.exists():
        try:
            with open(macro_report_path) as f:
                macro_regime = _json.load(f).get("regime", "NEUTRAL")
        except Exception:
            pass

    construction = construct_portfolio_allocation(
        phase_b_decisions=phase_b_decisions,
        phase_a_decisions=phase_a_decisions,
        open_positions=open_positions,
        equity=equity,
        cash_pct=cash_pct,
        macro_regime=macro_regime,
    )

    target_weights = construction.get("target_weights", {})
    if not target_weights:
        logger.info("Portfolio construction: no target weights returned — committee sizes used as-is")
        return construction

    # Patch Phase B decisions with construction target weights
    # The executor reads from committee_report.json → position_decisions[].size_pct
    patched = 0
    for d in phase_b_decisions:
        ticker = d.get("ticker", "")
        if ticker in target_weights:
            d["size_pct"] = target_weights[ticker]
            patched += 1
        elif d.get("action", "").startswith("enter"):
            # Construction didn't include this new entry — committee said enter but
            # construction didn't see it. Default to a cautious 5%.
            d["size_pct"] = 5.0
            logger.warning("%s: not in construction output — defaulting to 5%%", ticker)

    # Handle capital swap exits: positions construction decided to exit to fund better opportunities
    capital_swap_exits = construction.get("capital_swap_exits", [])
    existing_tickers = {d.get("ticker") for d in phase_b_decisions}
    for swap in capital_swap_exits:
        ticker = swap.get("ticker", "")
        if not ticker or ticker not in open_positions:
            continue
        if ticker in existing_tickers:
            continue  # Already has a decision (e.g. Phase A exited it)
        reason = swap.get("reason", "Capital reallocation: lower-conviction position exited to fund higher-conviction new entry")
        phase_b_decisions.append({
            "ticker": ticker,
            "action": "exit",
            "conviction": open_positions[ticker].get("conviction", 50),
            "investment_thesis": reason,
            "key_catalysts": [],
            "key_risks": [],
            "skip_reason": "",
        })
        existing_tickers.add(ticker)
        logger.info("Portfolio construction: capital swap — adding exit for %s (%s)", ticker, reason[:80])

    # Also handle rebalancing of held positions: add increase/decrease entries to decisions
    rebalancing = construction.get("rebalancing", {})
    for ticker, change in rebalancing.items():
        if ticker in existing_tickers:
            continue  # Already in Phase B decisions
        if ticker not in open_positions:
            continue  # Not a held position, skip
        from_pct = change.get("from_pct", 0)
        to_pct = change.get("to_pct", 0)
        action = "increase" if to_pct > from_pct else "decrease"
        phase_b_decisions.append({
            "ticker": ticker,
            "action": action,
            "conviction": open_positions[ticker].get("conviction", 50),
            "size_pct": to_pct,
            "investment_thesis": f"Portfolio rebalancing: construction target {to_pct:.1f}% vs current {from_pct:.1f}%",
            "key_catalysts": [],
            "key_risks": [],
        })
        existing_tickers.add(ticker)
        logger.info("Portfolio construction: adding %s rebalance %s → %.1f%%", ticker, action, to_pct)

    # Write patched decisions back to committee_report.json so executor picks them up
    if committee_report_path.exists():
        try:
            with open(committee_report_path) as f:
                cr = _json.load(f)
            cr["position_decisions"] = phase_b_decisions
            cr["portfolio_construction"] = {
                "target_weights": target_weights,
                "reasoning": construction.get("reasoning", ""),
                "rebalancing": rebalancing,
                "capital_swap_exits": [s.get("ticker") for s in capital_swap_exits if s.get("ticker")],
                "generated_at": cr.get("generated_at", ""),
            }
            with open(committee_report_path, "w") as f:
                _json.dump(cr, f, indent=2)
            logger.info("Portfolio construction: patched %d/%d decisions with target weights (%d capital swaps)",
                        patched, len(phase_b_decisions), len(capital_swap_exits))
        except Exception as exc:
            logger.warning("Portfolio construction: could not patch committee_report.json: %s", exc)

    return {**construction, "decisions_patched": patched}


# ---------------------------------------------------------------------------
# Phase A — Portfolio Review
# ---------------------------------------------------------------------------

def run_phase_a() -> dict:
    """
    Re-evaluate every open position using fresh data.
    Lite:     Macro + News + Quant only (~2 min).
    Standard: Lite + Sentiment (analyst upgrades, short interest).
    Full:     Standard + Fundamental Analyst.
    Auto:     Standard daily; Fundamental added automatically if any held
              ticker has earnings within 3 days.
    """
    open_positions = memory.get_open_positions()

    if not open_positions:
        logger.info("Phase A: no open positions — skipping review")
        return {"skipped": True, "reason": "no open positions", "held_tickers": []}

    held_tickers = list(open_positions.keys())
    logger.info("Phase A (%s mode): reviewing %d positions — %s",
                PHASE_A_MODE, len(held_tickers), held_tickers)

    results: dict = {"mode": PHASE_A_MODE, "held_tickers": held_tickers}
    t0 = time.time()

    # --- Always run Macro first (fast, sets regime context for the day) ---
    from agents import macro_agent
    logger.info("Phase A: running Macro Agent...")
    results["macro"] = macro_agent.run()

    # --- News Agent (all modes — catches overnight catalysts on held positions) ---
    # Cheap: one API call batch. Essential: a held position could have had an FDA rejection,
    # earnings miss, or regulatory action overnight. Must know before the Quant review.
    from agents import news_agent
    logger.info("Phase A: running News Agent (catching overnight catalysts)...")
    results["news"] = news_agent.run()

    # --- Candidate Generator: portfolio_review fast-path (just passes held tickers through) ---
    from agents import candidate_generator
    candidate_generator.run(mode="portfolio_review", held_tickers=held_tickers)

    # --- Quant Agent on held tickers (always in all modes) ---
    from agents import quant_agent
    logger.info("Phase A: running Quant Agent on %d held tickers...", len(held_tickers))
    results["quant"] = quant_agent.run(mode="portfolio_review")

    # --- Sentiment Agent (Standard / Full / Auto) ---
    # Sentiment changes daily (analyst upgrades, short interest) — worth running
    # in any mode above Lite to catch overnight rating changes on held positions.
    if PHASE_A_MODE in ("Standard", "Full", "Auto"):
        from agents import sentiment_agent
        logger.info("Phase A: running Sentiment Agent on held tickers...")
        results["sentiment"] = sentiment_agent.run(mode="portfolio_review")

    # --- Fundamental Analyst ---
    # Full: always. Auto: only if any held ticker has earnings ≤ 3 days out.
    # Fundamental data changes quarterly — no value running it on random days.
    if PHASE_A_MODE == "Full":
        from agents import fundamental_analyst
        logger.info("Phase A: running Fundamental Analyst on held tickers...")
        results["fundamental"] = fundamental_analyst.run(mode="portfolio_review")
    elif PHASE_A_MODE == "Auto":
        near_earnings = _tickers_with_near_earnings(held_tickers, days=3)
        results["auto_near_earnings"] = near_earnings
        if near_earnings:
            logger.info("Phase A (Auto): earnings ≤3 days for %s — running Fundamental Analyst", near_earnings)
            from agents import fundamental_analyst
            results["fundamental"] = fundamental_analyst.run(mode="portfolio_review")
        else:
            logger.info("Phase A (Auto): no earnings within 3 days — Fundamental Analyst skipped")

    # --- Investment Committee: Phase A deliberation ---
    from agents import investment_committee
    logger.info("Phase A: Committee deliberating on held positions...")
    live_portfolio = _fetch_live_portfolio()
    if live_portfolio and live_portfolio["is_leveraged"]:
        logger.warning("LEVERAGE DETECTED: exposure $%.0f vs equity $%.0f (%.2fx) — passing hard constraint to committee",
                       live_portfolio["total_exposure"], live_portfolio["equity"], live_portfolio["leverage_ratio"])
    results["committee"] = investment_committee.run(mode="portfolio_review", held_tickers=held_tickers, live_portfolio=live_portfolio)

    # --- Trade Executor: implement hold/increase/decrease/exit decisions ---
    from agents import trade_executor
    logger.info("Phase A: Executor implementing Committee decisions...")
    results["executor"] = trade_executor.run(mode="portfolio_review")

    results["elapsed_sec"] = round(time.time() - t0, 1)
    logger.info("Phase A complete in %.0fs | %d positions reviewed",
                results["elapsed_sec"], len(held_tickers))
    return results


# ---------------------------------------------------------------------------
# Phase B — New Opportunity Research
# ---------------------------------------------------------------------------

def run_phase_b(macro_already_ran: bool = False, phase_a_exits: list | None = None, phase_a_decisions: list | None = None) -> dict:
    """
    Full pipeline for identifying new positions to enter.
    Phase 1 runs sequentially (could be parallelised in future).
    Macro is skipped if it already ran in Phase A.
    phase_a_exits: list of tickers Phase A exited today — passed to Phase B committee
                   as a cooldown signal so it doesn't re-enter same-day exits.
    """
    logger.info("Phase B: New Opportunity Research")
    results: dict = {}
    t0 = time.time()

    # Scale candidate pool and debate cap by mode — read custom limits from dashboard config if present
    _default_scales = {
        "Lite":     {"MAX_CANDIDATES": 15,  "MAX_CANDIDATES_TO_DEBATE": 10},
        "Standard": {"MAX_CANDIDATES": 25,  "MAX_CANDIDATES_TO_DEBATE": 20},
        "Full":     {"MAX_CANDIDATES": 50,  "MAX_CANDIDATES_TO_DEBATE": 40},
        "Auto":     {"MAX_CANDIDATES": 30,  "MAX_CANDIDATES_TO_DEBATE": 25},
    }
    _scale = dict(_default_scales.get(PHASE_A_MODE, _default_scales["Standard"]))
    # Try to load custom limits saved from the dashboard settings page
    try:
        _config_path = ROOT / "data" / "config" / "analysis_mode.json"
        if _config_path.exists():
            _cfg = json.loads(_config_path.read_text())
            _custom = _cfg.get(f"limits_{PHASE_A_MODE}")
            if _custom:
                _scale["MAX_CANDIDATES"] = int(_custom.get("analyze", _scale["MAX_CANDIDATES"]))
                _scale["MAX_CANDIDATES_TO_DEBATE"] = int(_custom.get("debate", _scale["MAX_CANDIDATES_TO_DEBATE"]))
    except Exception:
        pass
    os.environ["MAX_CANDIDATES"] = str(_scale["MAX_CANDIDATES"])
    os.environ["MAX_CANDIDATES_TO_DEBATE"] = str(_scale["MAX_CANDIDATES_TO_DEBATE"])
    logger.info("Phase B: mode=%s → analysing up to %d candidates, debating top %d",
                PHASE_A_MODE, _scale["MAX_CANDIDATES"], _scale["MAX_CANDIDATES_TO_DEBATE"])

    # --- Phase 1: Market Intelligence (run in sequence, results saved to disk) ---
    if not macro_already_ran:
        from agents import macro_agent
        logger.info("Phase B: Macro Agent...")
        results["macro"] = macro_agent.run()
    else:
        logger.info("Phase B: Macro already ran in Phase A — reusing report")

    from agents import sector_agent
    logger.info("Phase B: Sector Agent...")
    results["sector"] = sector_agent.run()

    from agents import institutional_agent
    logger.info("Phase B: Institutional Agent...")
    results["institutional"] = institutional_agent.run()

    from agents import news_agent
    logger.info("Phase B: News Agent...")
    results["news"] = news_agent.run()

    # --- Phase 2: Candidate Generator ---
    from agents import candidate_generator
    logger.info("Phase B: Candidate Generator...")
    results["candidates"] = candidate_generator.run(mode="new_opportunities")
    n_candidates = results["candidates"].get("total_candidates", 0)
    logger.info("Phase B: %d candidates selected", n_candidates)

    if n_candidates == 0:
        logger.warning("Phase B: no candidates — skipping Phase 3 and Committee")
        results["elapsed_sec"] = round(time.time() - t0, 1)
        return results

    # --- Phase 3: Deep Analysis ---
    from agents import fundamental_analyst
    logger.info("Phase B: Fundamental Analyst...")
    results["fundamental"] = fundamental_analyst.run(mode="new_opportunities")

    from agents import quant_agent
    logger.info("Phase B: Quant Agent...")
    results["quant"] = quant_agent.run(mode="new_opportunities")

    if PHASE_A_MODE != "Lite":
        from agents import sentiment_agent
        logger.info("Phase B: Sentiment Agent (mode=%s)...", PHASE_A_MODE)
        results["sentiment"] = sentiment_agent.run(mode="new_opportunities")
    else:
        logger.info("Phase B: Sentiment Agent skipped (LITE mode — set ANALYSIS_MODE=Standard or Full to enable)")

    # --- Phase 4: Investment Committee ---
    from agents import investment_committee
    logger.info("Phase B: Committee deliberating on new opportunities...")
    if phase_a_exits:
        logger.info("Phase B: Passing %d Phase A exits to committee as same-day cooldown: %s",
                    len(phase_a_exits), phase_a_exits)
    live_portfolio_b = _fetch_live_portfolio()
    results["committee"] = investment_committee.run(mode="new_opportunities", exited_today=phase_a_exits, live_portfolio=live_portfolio_b)

    # --- Phase 4b: Portfolio Construction ---
    # The committee deliberated on action + conviction. Now a separate LLM call
    # sees the ENTIRE book — held positions + new entries together — and sets
    # final target weights for everything simultaneously.
    logger.info("Phase B: Portfolio Construction — setting final weights with full portfolio view...")
    results["construction"] = _run_portfolio_construction(results["committee"], phase_a_decisions=phase_a_decisions or [])

    # --- Phase 5: Trade Executor ---
    from agents import trade_executor
    logger.info("Phase B: Executor implementing new entries...")
    results["executor"] = trade_executor.run(mode="new_opportunities")

    results["elapsed_sec"] = round(time.time() - t0, 1)
    logger.info("Phase B complete in %.0fs", results["elapsed_sec"])
    return results


# ---------------------------------------------------------------------------
# Main orchestration entry point
# ---------------------------------------------------------------------------

def run() -> dict:
    """
    Run the full daily pipeline: Phase A → Phase B → Memory consolidation.
    Returns a summary dict suitable for logging and dashboard display.
    """
    logger.info("=" * 60)
    logger.info("PORTFOLIO MANAGER — Daily Pipeline")
    logger.info("Date: %s | Phase A mode: %s | Skip Phase A: %s",
                datetime.utcnow().date().isoformat(), PHASE_A_MODE, SKIP_PHASE_A)
    logger.info("=" * 60)

    pipeline_start = time.time()
    summary: dict = {
        "date": datetime.utcnow().date().isoformat(),
        "phase_a_mode": PHASE_A_MODE,
        "phase_a": {},
        "phase_b": {},
        "memory": {},
    }

    # --- Alpaca reconciliation: sync positions_log with what's actually held ---
    # Must run BEFORE Phase A so agents only review real Alpaca positions, not phantom
    # entries from orders logged when the market was closed.
    try:
        from agents import trade_executor
        logger.info("Reconciling positions_log with Alpaca holdings...")
        recon = trade_executor.reconcile_positions_with_alpaca()
        summary["reconciliation"] = recon
        if recon.get("pending_placed"):
            logger.info("Reconciliation placed deferred orders: %s", recon["pending_placed"])
        if recon.get("ghosts_removed"):
            logger.info("Reconciliation removed ghost positions: %s", recon["ghosts_removed"])
        if recon.get("untracked_added"):
            logger.info("Reconciliation added untracked positions: %s", recon["untracked_added"])
    except Exception as exc:
        logger.warning("Alpaca reconciliation failed: %s — proceeding with current positions_log", exc)
        summary["reconciliation"] = {"error": str(exc)}

    # --- Portfolio Risk Snapshot ---
    # Runs after reconciliation (so positions_log is clean) and before any agent.
    # Written to data/reports/portfolio_risk_snapshot.json for Committee / Construction / Executor.
    try:
        from utils.risk_snapshot import compute_risk_snapshot
        logger.info("Computing Portfolio Risk Snapshot...")
        summary["risk_snapshot"] = compute_risk_snapshot()
    except Exception as exc:
        logger.warning("Portfolio Risk Snapshot failed: %s — pipeline continues without it", exc)
        summary["risk_snapshot"] = {"error": str(exc)}

    # --- Phase A ---
    if SKIP_PHASE_A:
        logger.info("Phase A skipped (SKIP_PHASE_A=true)")
        summary["phase_a"] = {"skipped": True, "reason": "SKIP_PHASE_A env var set"}
        macro_ran_in_phase_a = False
    else:
        summary["phase_a"] = run_phase_a()
        macro_ran_in_phase_a = not summary["phase_a"].get("skipped", False)

    # --- Phase B ---
    if SKIP_PHASE_B:
        logger.info("Phase B skipped (SKIP_PHASE_B=true)")
        summary["phase_b"] = {"skipped": True, "reason": "SKIP_PHASE_B env var set"}
    else:
        # Extract tickers Phase A exited today so Phase B committee knows not to re-enter them
        phase_a_committee = summary["phase_a"].get("committee", {})
        phase_a_exits = [
            d["ticker"] for d in phase_a_committee.get("position_decisions", [])
            if d.get("action") == "exit" and d.get("ticker")
        ]
        phase_a_all_decisions = phase_a_committee.get("position_decisions", [])
        summary["phase_b"] = run_phase_b(
            macro_already_ran=macro_ran_in_phase_a,
            phase_a_exits=phase_a_exits or None,
            phase_a_decisions=phase_a_all_decisions or None,
        )

    # --- Memory consolidation ---
    logger.info("Running Memory Agent consolidation...")
    summary["memory"] = memory.run()

    # --- Pipeline summary ---
    total_elapsed = round(time.time() - pipeline_start, 1)
    summary["total_elapsed_sec"] = total_elapsed

    phase_a_committee = summary["phase_a"].get("committee", {})
    phase_b_committee = summary["phase_b"].get("committee", {})

    phase_a_actions = phase_a_committee.get("actions_taken", {})
    phase_b_actions = phase_b_committee.get("actions_taken", {})

    # Use actual Alpaca position count from the final portfolio_state written by the executor
    # (not positions_log count, which can include phantom pending entries)
    actual_position_count = summary["memory"].get("open_position_count", 0)
    try:
        import json as _pj
        _ps_path = ROOT / "data" / "reports" / "portfolio_state.json"
        if _ps_path.exists():
            with open(_ps_path) as _psf:
                _ps = _pj.load(_psf)
            actual_position_count = _ps.get("open_position_count", actual_position_count)
    except Exception:
        pass

    # Calculate actual daily P&L: equity change from yesterday's close (Alpaca source of truth).
    # equity - last_equity is the real daily move — not cumulative unrealized which would
    # double-count the same gains across every report.
    daily_pnl_abs = 0.0
    daily_pnl_pct = 0.0
    daily_pnl_str = "+$0"
    daily_pnl_pct_str = "+0.00%"
    try:
        _live = _fetch_live_portfolio()
        if _live:
            _equity      = _live["equity"]
            _last_equity = _live.get("last_equity", _equity)
            daily_pnl_abs = _equity - _last_equity
            daily_pnl_pct = (daily_pnl_abs / _last_equity * 100) if _last_equity else 0.0
            _sign = "+" if daily_pnl_abs >= 0 else "-"
            daily_pnl_str     = f"{_sign}${abs(daily_pnl_abs):,.0f}"
            _pct_sign = "+" if daily_pnl_pct >= 0 else ""
            daily_pnl_pct_str = f"{_pct_sign}{daily_pnl_pct:.2f}%"
    except Exception:
        pass

    summary["pipeline_summary"] = {
        "phase_a_positions_reviewed": len(summary["phase_a"].get("held_tickers", [])),
        "phase_a_exits": phase_a_actions.get("exit", 0),
        "phase_a_size_changes": phase_a_actions.get("increase", 0) + phase_a_actions.get("decrease", 0),
        "phase_b_candidates": summary["phase_b"].get("candidates", {}).get("total_candidates", 0),
        "phase_b_new_entries": phase_b_actions.get("enter", 0),
        "open_positions_after": actual_position_count,
        "daily_pnl": daily_pnl_str,
        "daily_pnl_pct": daily_pnl_pct_str,
        "total_elapsed_sec": total_elapsed,
    }

    logger.info("=" * 60)
    logger.info("PIPELINE COMPLETE in %.0fs", total_elapsed)
    logger.info("  Phase A: %d positions reviewed, %d exits, %d size changes",
                summary["pipeline_summary"]["phase_a_positions_reviewed"],
                summary["pipeline_summary"]["phase_a_exits"],
                summary["pipeline_summary"]["phase_a_size_changes"])
    logger.info("  Phase B: %d candidates → %d new entries",
                summary["pipeline_summary"]["phase_b_candidates"],
                summary["pipeline_summary"]["phase_b_new_entries"])
    logger.info("  Open positions after: %d",
                summary["pipeline_summary"]["open_positions_after"])
    logger.info("=" * 60)

    # --- Benchmark tracking ---
    # Append today's NAV to nav_history.json and recompute portfolio vs SPY.
    # Must run after executor writes portfolio_state.json (equity is final).
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        import benchmark_tracker
        logger.info("Updating benchmark tracker (NAV append + SPY comparison)...")
        bench_result = benchmark_tracker.run()
        summary["benchmark"] = bench_result.get("benchmark", {})
        logger.info("Benchmark updated: %d NAV points", len(
            _load_json(ROOT / "data" / "memory" / "nav_history.json", default=[])
        ))
    except Exception as exc:
        logger.warning("Benchmark tracker failed: %s — pipeline continues without it", exc)
        summary["benchmark"] = {"error": str(exc)}

    return summary
