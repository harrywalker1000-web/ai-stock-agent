"""
pipeline_assembler.py — structured (non-AI) section assembly for ad-hoc research reports.
All sections here are deterministic: data from APIs or [CALCULATED]. Zero AI.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from agents.research.report_assembler import (
    build_cover,
    build_overview_structured,
    build_news_catalysts_structured,
    build_historical_financials,
    build_forward_dcf,
    build_revenue_growth_drivers,
)
from agents.research.report_assembler_extended import (
    build_valuation_metrics,
    build_technicals,
    build_competitive_moat,
    build_industry_macro,
    build_institutional_activity,
    build_risk_register,
    build_management_governance,
    build_esg_section,
    build_ma_track_record,
    build_porter_five_forces,
    build_sotp_valuation,
)
from agents.research.report_assembler_scenarios import (
    build_scenario_analysis,
    build_sentiment,
    build_where_we_differ,
    build_setup_checklist,
    build_data_reliability,
)
from agents.research.mandate_checker import run_mandate_checks
from utils.logger import get_logger

logger = get_logger(__name__)


def assemble_structured_sections(data: dict) -> dict:
    """
    Run mandate check and build all deterministic sections (S1-S15, S17 placeholder).
    Returns a dict with keys: mandate, s1 through s15 (structured), plus s12 for scenario.
    AI sections (s2, s3, s8, s9, s11, s13, s14) have ai_* fields set to None here.
    """
    ticker = (data.get("_meta") or {}).get("ticker", "UNKNOWN")
    logger.info("[%s] Running mandate checks", ticker)
    mandate = run_mandate_checks(data)

    logger.info("[%s] Building structured sections", ticker)

    s1 = build_cover(data, mandate)
    s2_structured = build_overview_structured(data)
    s3_structured = build_news_catalysts_structured(data)
    s4 = build_historical_financials(data)
    s4b_structured = build_revenue_growth_drivers(data)
    s5 = build_forward_dcf(data)
    s6 = build_valuation_metrics(data, mandate)
    s7 = build_technicals(data)
    s8_structured = build_competitive_moat(data)
    s9_structured = build_industry_macro(data)
    s10 = build_institutional_activity(data)
    s10b_structured = build_management_governance(data)
    s11_structured = build_risk_register(data)
    s12 = build_scenario_analysis(data, s5)
    s13_structured = build_sentiment(data)

    # S14 needs s1 + s5 already assembled
    sections_for_s14 = {
        "s1_cover":      s1,
        "s5_forward_dcf": s5,
    }
    s14_structured = build_where_we_differ(data, sections_for_s14)

    # S15 uses technicals dict (the section, not raw data key)
    s15 = build_setup_checklist(data, mandate, s7)
    s_h_structured = build_esg_section(data)
    s_j_structured = build_ma_track_record(data)
    s_b_structured = build_porter_five_forces(data)
    s_c_structured = build_sotp_valuation(data)

    return {
        "mandate":        mandate,
        "s1":             s1,
        "s2_structured":  s2_structured,
        "s3_structured":  s3_structured,
        "s4":             s4,
        "s4b_structured": s4b_structured,
        "s5":            s5,
        "s6":            s6,
        "s7":            s7,
        "s8_structured": s8_structured,
        "s9_structured": s9_structured,
        "s10":            s10,
        "s10b_structured": s10b_structured,
        "s11_structured": s11_structured,
        "s12":           s12,
        "s13_structured": s13_structured,
        "s14_structured": s14_structured,
        "s15":           s15,
        "s_h_structured": s_h_structured,
        "s_j_structured": s_j_structured,
        "s_b_structured": s_b_structured,
        "s_c_structured": s_c_structured,
    }


def build_final_report(
    ticker: str,
    data: dict,
    assembled: dict,
    s2: dict,
    s3: dict,
    s4b: dict,
    s7: dict,
    s8: dict,
    s9: dict,
    s10b: dict,
    s11: dict,
    s13: dict,
    s14: dict,
    s16: dict,
    s_esg: dict,
    s_ma: dict,
    s_porter: dict,
    s_c: dict,
    brand_colors: dict | None = None,
) -> dict:
    """
    Merge AI-enriched sections with structured sections and produce the final report dict.
    Also builds S17 (data reliability) against the complete section set.
    """
    all_sections_for_reliability = {
        "s1":  assembled["s1"],
        "s2":  s2,
        "s3":  s3,
        "s4":  assembled["s4"],
        "s4b": s4b,
        "s5":  assembled["s5"],
        "s6":  assembled["s6"],
        "s7":  s7,
        "s8":  s8,
        "s9":  s9,
        "s10": assembled["s10"],
        "s10b": s10b,
        "s11": s11,
        "s12": assembled["s12"],
        "s13": s13,
        "s14": s14,
        "s15": assembled["s15"],
        "s16": s16,
    }

    s17 = build_data_reliability(data, all_sections_for_reliability)

    company_name = (
        (data.get("fmp_profile") or {}).get("company_name")
        or ((data.get("yfinance") or {}).get("info") or {}).get("company_name")
        or ticker
    )

    api_errors = data.get("_api_errors") or {}

    return {
        "ticker":                  ticker,
        "company_name":            company_name,
        "generated_at":            (data.get("_meta") or {}).get("fetched_at", ""),
        "mandate":                 assembled["mandate"],
        "brand_colors":            brand_colors or {},
        "tavily_quota_exceeded":   bool(data.get("_tavily_quota_exceeded")),
        "api_errors":              api_errors,
        "sections": {
            "s1_cover":        assembled["s1"],
            "s2_overview":     s2,
            "s3_news":         s3,
            "s4_financials":   assembled["s4"],
            "s4b_drivers":     s4b,
            "s5_dcf":          assembled["s5"],
            "s6_valuation":    assembled["s6"],
            "s7_technicals":   s7,
            "s8_competitive":  s8,
            "s9_industry":     s9,
            "s10_institutional":  assembled["s10"],
            "s10b_management":    s10b,
            "s11_risks":       s11,
            "s12_scenarios":   assembled["s12"],
            "s13_sentiment":   s13,
            "s14_differ":      s14,
            "s15_checklist":   assembled["s15"],
            "s16_recommendation": s16,
            "s17_reliability": s17,
            "s_h_esg":         s_esg,
            "s_j_ma":          s_ma,
            "s_b_porter":      s_porter,
            "s_c_sotp":        s_c,
        },
    }
