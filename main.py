"""
AI Stock Agent — Daily Entry Point

Run: venv/bin/python main.py

Environment variables (all in .env):
  PHASE_A_MODE=Lite        Lite | Standard | Full (default: Lite)
  SKIP_PHASE_A=false       Skip portfolio review, e.g. on first run with no positions
  ALLOW_LIVE_TRADING=false Must be true + live Alpaca URL to leave paper mode

Phase A (portfolio review) runs before Phase B (new opportunities).
See PORTFOLIO_RULES.md for the full decision-making philosophy.
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Bootstrap: ensure data directories exist before any agent runs
# ---------------------------------------------------------------------------

for d in ("data/reports", "data/memory", "data/trades", "data/candidates", "logs"):
    (ROOT / d).mkdir(parents=True, exist_ok=True)

from utils.logger import get_logger

logger = get_logger("main")


def _print_banner():
    logger.info("")
    logger.info("╔══════════════════════════════════════════════════════════╗")
    logger.info("║          AI STOCK AGENT — DAILY PIPELINE RUN            ║")
    logger.info("║  %s  ║", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC").center(54))
    logger.info("╚══════════════════════════════════════════════════════════╝")
    logger.info("")


def _print_summary(result: dict):
    ps = result.get("pipeline_summary", {})
    mem = result.get("memory", {})
    elapsed = result.get("total_elapsed_sec", 0)
    mins, secs = divmod(int(elapsed), 60)

    logger.info("")
    logger.info("┌─────────────────────────────────────────────────────────┐")
    logger.info("│  DAILY RUN COMPLETE                                     │")
    logger.info("│  Runtime: %dm %ds                                        │", mins, secs)
    logger.info("│  Phase A: %d positions reviewed  (%d exits, %d resized)    │",
                ps.get("phase_a_positions_reviewed", 0),
                ps.get("phase_a_exits", 0),
                ps.get("phase_a_size_changes", 0))
    logger.info("│  Phase B: %d candidates → %d new entries                  │",
                ps.get("phase_b_candidates", 0),
                ps.get("phase_b_new_entries", 0))
    logger.info("│  Open positions now: %d                                   │",
                ps.get("open_positions_after", 0))
    logger.info("│  Pattern combos tracked: %d                               │",
                mem.get("pattern_history_entries", 0))
    logger.info("└─────────────────────────────────────────────────────────┘")
    logger.info("")

    # Print today's new entries
    phase_b_committee = result.get("phase_b", {}).get("committee", {})
    new_entries = [
        d for d in phase_b_committee.get("position_decisions", [])
        if d.get("action", "").startswith("enter")
    ]
    if new_entries:
        logger.info("  Today's new positions:")
        for e in new_entries:
            sl = f"  SL: ${e.get('stop_loss')}" if e.get("stop_loss") else ""
            logger.info("    %-6s %s  conviction=%d  size=%.0f%%%s",
                        e["ticker"], e["action"], e.get("conviction", 0),
                        e.get("size_pct", 0), sl)
            logger.info("    %s", e.get("investment_thesis", "")[:100])

    # Print Phase A decisions if any
    phase_a_committee = result.get("phase_a", {}).get("committee", {})
    a_decisions = [
        d for d in phase_a_committee.get("position_decisions", [])
        if d.get("action") not in ("skip", "hold")
    ]
    if a_decisions:
        logger.info("  Phase A portfolio adjustments:")
        for d in a_decisions:
            logger.info("    %-6s %s  — %s",
                        d["ticker"], d["action"],
                        d.get("investment_thesis", "")[:80])


def main() -> int:
    """
    Returns exit code: 0 = success, 1 = pipeline error.
    Flags:
      --phase-a-only   Run Phase A (position review) only, skip Phase B
    """
    import os
    phase_a_only = "--phase-a-only" in sys.argv
    if phase_a_only:
        os.environ["SKIP_PHASE_B"] = "true"
        logger.info("Flag: --phase-a-only — Phase B (new opportunity research) will be skipped")

    _print_banner()
    start = time.time()

    try:
        from agents.portfolio_manager import run
        result = run()
    except KeyboardInterrupt:
        logger.warning("Pipeline interrupted by user")
        return 1
    except Exception as exc:
        logger.error("Pipeline failed with unhandled exception: %s", exc, exc_info=True)
        logger.error("Check logs/ for details. Individual agent reports may be partially written.")
        return 1

    _print_summary(result)

    # Save full pipeline result for debugging
    result_path = ROOT / "data" / "reports" / "pipeline_result.json"
    try:
        with open(result_path, "w") as f:
            # Scrub non-serialisable objects before saving
            json.dump(result, f, indent=2, default=str)
    except Exception:
        pass  # Non-critical

    return 0


if __name__ == "__main__":
    sys.exit(main())
