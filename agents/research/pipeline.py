"""
pipeline.py — full ad-hoc research report pipeline.
Orchestrates: data fetch → mandate check → section assembly → AI synthesis → output.

Usage:
    from agents.research.pipeline import run_pipeline
    report = run_pipeline("AAPL")
"""

import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from agents.research.data_fetcher import fetch_all_data
from agents.research.pipeline_assembler import assemble_structured_sections, build_final_report
from agents.research.pipeline_synthesis import (
    run_haiku_synthesis,
    merge_ai_into_sections,
    run_investment_committee,
)
from utils.logger import get_logger

logger = get_logger(__name__)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
# Write to dashboard/data/adhoc_reports so the Next.js GET route finds it directly
OUTPUT_DIR = os.path.join(_REPO_ROOT, "dashboard", "data", "adhoc_reports")


def run_pipeline(ticker: str) -> dict:
    """
    Run the full research pipeline for a given ticker.
    Writes output to data/adhoc_reports/{ticker}_{ts}.json.
    Always runs live — no caching.

    Args:
        ticker: Stock ticker symbol (will be uppercased).

    Returns:
        Complete report dict with all 17 sections.
    """
    ticker = ticker.upper().strip()
    logger.info("[%s] Pipeline start", ticker)

    # 1. Fetch all live data
    logger.info("[%s] Fetching data from all APIs", ticker)
    data = fetch_all_data(ticker)
    logger.info(
        "[%s] Data fetch complete in %.1fs",
        ticker,
        (data.get("_meta") or {}).get("elapsed_sec", 0),
    )

    # 2. Mandate check + all deterministic section assembly
    assembled = assemble_structured_sections(data)

    mandate = assembled["mandate"]
    logger.info(
        "[%s] Mandate: %s | Setup: %s",
        ticker,
        mandate.get("recommendation"),
        mandate.get("setup_type"),
    )

    # 3. Parallel Haiku synthesis (S2, S3, S8, S9, S11, S13, S14)
    ai_results = run_haiku_synthesis(data, assembled)

    # 4. Merge AI narratives into structured sections
    merged = merge_ai_into_sections(assembled, ai_results)

    # 5. Investment Committee — Sonnet (sequential, needs full context)
    s16 = run_investment_committee(data, assembled, merged)

    # 6. Assemble final report (includes S17 data reliability)
    report = build_final_report(
        ticker=ticker,
        data=data,
        assembled=assembled,
        s2=merged["s2"],
        s3=merged["s3"],
        s8=merged["s8"],
        s9=merged["s9"],
        s11=merged["s11"],
        s13=merged["s13"],
        s14=merged["s14"],
        s16=s16,
    )

    # 7. Write to disk
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(OUTPUT_DIR, f"{ticker}_{ts}.json")
    try:
        with open(path, "w") as f:
            json.dump(report, f, indent=2, default=str)
        logger.info("[%s] Report written to %s", ticker, path)
    except Exception as exc:
        logger.error("[%s] Failed to write report: %s", ticker, exc)

    report["_output_path"] = path
    return report
