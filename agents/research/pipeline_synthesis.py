"""
pipeline_synthesis.py — parallel AI synthesis for ad-hoc research reports.
Runs Haiku calls for S2, S3, S8, S9, S11, S13, S14 concurrently via ThreadPoolExecutor.
Runs Sonnet for S16 (Investment Committee) after all structured sections are ready.
"""

import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from agents.research.synthesis_agents import (
    synthesize_company_overview,
    synthesize_news_catalysts,
    synthesize_competitive_moat,
    synthesize_industry_macro,
    synthesize_risk_register,
    synthesize_sentiment,
    synthesize_where_we_differ,
    synthesize_revenue_growth_drivers,
)
from agents.research.synthesis_investment_committee import synthesize_investment_committee
from utils.logger import get_logger

logger = get_logger(__name__)


def run_haiku_synthesis(data: dict, assembled: dict) -> dict:
    """
    Run all 7 Haiku synthesis calls in parallel.
    Returns a dict keyed by section name with the AI result.
    """
    ticker = (data.get("_meta") or {}).get("ticker", "UNKNOWN")

    # Build the sections_so_far context for synthesize_where_we_differ
    # (matches what that function expects under 'dcf' and 'scenario' keys)
    sections_for_differ = {
        "dcf":      assembled["s5"],
        "scenario": assembled["s12"],
    }

    tasks = {
        "s2_ai":  (synthesize_company_overview,        (data,)),
        "s3_ai":  (synthesize_news_catalysts,           (data,)),
        "s4b_ai": (synthesize_revenue_growth_drivers,   (data,)),
        "s8_ai":  (synthesize_competitive_moat,         (data,)),
        "s9_ai":  (synthesize_industry_macro,           (data,)),
        "s11_ai": (synthesize_risk_register,            (data,)),
        "s13_ai": (synthesize_sentiment,                (data,)),
        "s14_ai": (synthesize_where_we_differ,          (data, sections_for_differ)),
    }

    results = {}

    logger.info("[%s] Running parallel Haiku synthesis (8 calls)", ticker)
    with ThreadPoolExecutor(max_workers=7) as executor:
        future_to_key = {
            executor.submit(fn, *args): key
            for key, (fn, args) in tasks.items()
        }
        for future in as_completed(future_to_key):
            key = future_to_key[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                logger.error("[%s] Haiku synthesis failed for %s: %s", ticker, key, exc)
                results[key] = {
                    "value":  f"Synthesis failed: {exc}",
                    "source": "error",
                    "status": "error",
                }

    return results


def merge_ai_into_sections(assembled: dict, ai: dict) -> dict:
    """
    Merge AI narratives into their respective structured sections.
    Returns the 7 AI-enriched section dicts.
    """
    s2  = {**assembled["s2_structured"],  "ai_narrative":     ai.get("s2_ai")}
    s3  = {**assembled["s3_structured"],  "ai_synthesis":     ai.get("s3_ai")}
    s4b_ai = ai.get("s4b_ai") or {}
    s4b = {
        **assembled["s4b_structured"],
        "drivers": s4b_ai.get("drivers") or [],
        "ai_source": s4b_ai.get("source"),
        "ai_status": s4b_ai.get("status"),
    }
    s8  = {**assembled["s8_structured"],  "ai_narrative":     ai.get("s8_ai")}
    s9  = {**assembled["s9_structured"],  "ai_narrative":     ai.get("s9_ai")}
    s11 = {**assembled["s11_structured"], "ai_risk_register": ai.get("s11_ai")}
    s13 = {**assembled["s13_structured"], "ai_sentiment":     ai.get("s13_ai")}
    s14 = {**assembled["s14_structured"], "ai_where_we_differ": ai.get("s14_ai")}

    return {
        "s2":  s2,
        "s3":  s3,
        "s4b": s4b,
        "s8":  s8,
        "s9":  s9,
        "s11": s11,
        "s13": s13,
        "s14": s14,
    }


def run_investment_committee(data: dict, assembled: dict, merged: dict) -> dict:
    """
    Run Sonnet Investment Committee synthesis (S16).
    Receives complete section context — all structured + AI-enriched sections.
    """
    ticker = (data.get("_meta") or {}).get("ticker", "UNKNOWN")
    logger.info("[%s] Running Investment Committee (Sonnet)", ticker)

    all_sections = {
        "s1":  assembled["s1"],
        "s2":  merged["s2"],
        "s3":  merged["s3"],
        "s4":  assembled["s4"],
        "s5":  assembled["s5"],
        "s6":  assembled["s6"],
        "s7":  assembled["s7"],
        "s8":  merged["s8"],
        "s9":  merged["s9"],
        "s10": assembled["s10"],
        "s11": merged["s11"],
        "s12": assembled["s12"],
        "s13": merged["s13"],
        "s14": merged["s14"],
        "s15": assembled["s15"],
    }

    try:
        s16 = synthesize_investment_committee(data, all_sections)
    except Exception as exc:
        logger.error("[%s] Investment Committee synthesis failed: %s", ticker, exc)
        s16 = {
            "direction":           "HOLD",
            "conviction":          5,
            "expected_return_12m": "N/A",
            "position_size_pct":   0.0,
            "stop_loss_pct":       0.0,
            "three_arguments":     ["Synthesis error", "Synthesis error", "Synthesis error"],
            "key_risks":           ["Synthesis error", "Synthesis error", "Synthesis error"],
            "committee_narrative": f"Investment Committee synthesis failed: {exc}",
            "conviction_source":   "sub-component scoring [CALCULATED] — not AI generated",
        }

    return s16
