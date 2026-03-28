"""
Portfolio Manager — orchestration module (not a numbered agent)

Coordinates the two-phase daily pipeline per PORTFOLIO_RULES.md:

  Phase A — Portfolio Review (runs first, before any new research)
    Lite mode (default while paper trading): Macro + Quant + News on each held position
    Standard mode: all agents in lightweight form
    Full mode: complete re-run identical to original entry analysis
    → Committee makes hold / increase / decrease / exit decisions
    → Executor implements them

  Phase B — New Opportunity Research
    Full Phase 1–3 pipeline on fresh candidates
    → Committee selects new positions to enter
    → Executor implements them

  Memory Agent consolidation runs at the end.

Config via environment variables:
  PHASE_A_MODE=Lite    (Lite | Standard | Full — default Lite)
  SKIP_PHASE_A=false   (set true to skip portfolio review, e.g. first run)
"""

import os
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

import agents.memory_agent as memory
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent

# Config
PHASE_A_MODE = os.environ.get("PHASE_A_MODE", "Lite")   # Lite | Standard | Full
SKIP_PHASE_A = os.environ.get("SKIP_PHASE_A", "false").lower() == "true"


# ---------------------------------------------------------------------------
# Phase A — Portfolio Review
# ---------------------------------------------------------------------------

def run_phase_a() -> dict:
    """
    Re-evaluate every open position using fresh data.
    Lite mode: Macro + Quant + News only (cheap, ~2 min).
    Standard/Full: adds Fundamental and/or Sentiment agents.
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

    # --- Candidate Generator: portfolio_review fast-path (just passes held tickers through) ---
    from agents import candidate_generator
    candidate_generator.run(mode="portfolio_review", held_tickers=held_tickers)

    # --- Quant Agent on held tickers (always in all modes) ---
    from agents import quant_agent
    logger.info("Phase A: running Quant Agent on %d held tickers...", len(held_tickers))
    results["quant"] = quant_agent.run(mode="portfolio_review")

    if PHASE_A_MODE in ("Standard", "Full"):
        # --- News Agent (Standard+) ---
        from agents import news_agent
        logger.info("Phase A: running News Agent...")
        results["news"] = news_agent.run()

        # --- Fundamental Analyst (Standard+) ---
        from agents import fundamental_analyst
        logger.info("Phase A: running Fundamental Analyst on held tickers...")
        results["fundamental"] = fundamental_analyst.run(mode="portfolio_review")

    if PHASE_A_MODE == "Full":
        # --- Sentiment Agent (Full only) ---
        from agents import sentiment_agent
        logger.info("Phase A: running Sentiment Agent on held tickers...")
        results["sentiment"] = sentiment_agent.run(mode="portfolio_review")

    # --- Investment Committee: Phase A deliberation ---
    from agents import investment_committee
    logger.info("Phase A: Committee deliberating on held positions...")
    results["committee"] = investment_committee.run(mode="portfolio_review", held_tickers=held_tickers)

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

def run_phase_b(macro_already_ran: bool = False) -> dict:
    """
    Full pipeline for identifying new positions to enter.
    Phase 1 runs sequentially (could be parallelised in future).
    Macro is skipped if it already ran in Phase A.
    """
    logger.info("Phase B: New Opportunity Research")
    results: dict = {}
    t0 = time.time()

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

    from agents import sentiment_agent
    logger.info("Phase B: Sentiment Agent...")
    results["sentiment"] = sentiment_agent.run(mode="new_opportunities")

    # --- Phase 4: Investment Committee ---
    from agents import investment_committee
    logger.info("Phase B: Committee deliberating on new opportunities...")
    results["committee"] = investment_committee.run(mode="new_opportunities")

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

    # --- Phase A ---
    if SKIP_PHASE_A:
        logger.info("Phase A skipped (SKIP_PHASE_A=true)")
        summary["phase_a"] = {"skipped": True, "reason": "SKIP_PHASE_A env var set"}
        macro_ran_in_phase_a = False
    else:
        summary["phase_a"] = run_phase_a()
        macro_ran_in_phase_a = not summary["phase_a"].get("skipped", False)

    # --- Phase B ---
    summary["phase_b"] = run_phase_b(macro_already_ran=macro_ran_in_phase_a)

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

    summary["pipeline_summary"] = {
        "phase_a_positions_reviewed": len(summary["phase_a"].get("held_tickers", [])),
        "phase_a_exits": phase_a_actions.get("exit", 0),
        "phase_a_size_changes": phase_a_actions.get("increase", 0) + phase_a_actions.get("decrease", 0),
        "phase_b_candidates": summary["phase_b"].get("candidates", {}).get("total_candidates", 0),
        "phase_b_new_entries": phase_b_actions.get("enter", 0),
        "open_positions_after": summary["memory"].get("open_position_count", 0),
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

    return summary
