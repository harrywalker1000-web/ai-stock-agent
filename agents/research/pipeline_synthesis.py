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
    synthesize_management_governance,
    synthesize_esg_initiatives,
    synthesize_ma_track_record,
    synthesize_porter_five_forces,
    synthesize_sotp_valuation,
    synthesize_market_position,
    synthesize_brand_value,
    synthesize_subscriber_comparison,
    synthesize_brand_colors,
    synthesize_technical_patterns,
)
from agents.research.synthesis_investment_committee import synthesize_investment_committee
from utils.logger import get_logger

logger = get_logger(__name__)


def run_haiku_synthesis(data: dict, assembled: dict) -> dict:
    """
    Run all Haiku synthesis calls in parallel.
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
        "s2_ai":   (synthesize_company_overview,        (data,)),
        "s3_ai":   (synthesize_news_catalysts,           (data,)),
        "s4b_ai":  (synthesize_revenue_growth_drivers,   (data,)),
        "s10b_ai": (synthesize_management_governance,    (data,)),
        "s8_ai":   (synthesize_competitive_moat,         (data,)),
        "s9_ai":   (synthesize_industry_macro,           (data,)),
        "s11_ai":  (synthesize_risk_register,            (data,)),
        "s13_ai":  (synthesize_sentiment,                (data,)),
        "s14_ai":  (synthesize_where_we_differ,          (data, sections_for_differ)),
        "s_h_ai":  (synthesize_esg_initiatives,          (data,)),
        "s_j_ai":  (synthesize_ma_track_record,          (data,)),
        "s_b_ai":  (synthesize_porter_five_forces,       (data,)),
        "s_c_ai":     (synthesize_sotp_valuation,           (data,)),
        "mktpos_ai":       (synthesize_market_position,     (data,)),
        "brand_ai":        (synthesize_brand_value,         (data,)),
        "sub_ai":          (synthesize_subscriber_comparison, (data,)),
        "brand_colors_ai": (synthesize_brand_colors,        (data,)),
        "s7_ai":           (synthesize_technical_patterns,  (data, assembled["s7"])),
    }

    results = {}

    logger.info("[%s] Running parallel Haiku synthesis (18 calls)", ticker)
    with ThreadPoolExecutor(max_workers=10) as executor:
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
        "drivers":   s4b_ai.get("drivers") or [],
        "ai_source": s4b_ai.get("source"),
        "ai_status": s4b_ai.get("status"),
    }
    s10b_ai = ai.get("s10b_ai") or {}
    s10b = {
        **assembled["s10b_structured"],
        "ai_ceo_profile":      s10b_ai.get("ceo_profile"),
        "ai_tenure_note":      s10b_ai.get("tenure_note"),
        "ai_board_assessment": s10b_ai.get("board_assessment"),
        "ai_leadership_style": s10b_ai.get("leadership_style"),
        "ai_source":           s10b_ai.get("source"),
        "ai_status":           s10b_ai.get("status"),
    }
    s8_ai = ai.get("s8_ai") or {}
    _moat_quant = assembled["s8_structured"].get("moat_quant") or {}
    _dim5 = max(0, min(20, int(s8_ai.get("competitive_differentiation_score") or 10)))
    _quant_total = sum(d.get("score", 8) for d in _moat_quant.values())
    _moat_total = _quant_total + _dim5
    if _moat_total >= 75:
        _moat_label = "Wide Moat"
    elif _moat_total >= 52:
        _moat_label = "Narrow Moat"
    elif _moat_total >= 32:
        _moat_label = "Developing Moat"
    else:
        _moat_label = "No Moat"
    s8 = {
        **assembled["s8_structured"],
        "ai_narrative":     s8_ai,
        "moat_score_total": _moat_total,
        "moat_score_label": _moat_label,
        "moat_dim5_score":  _dim5,
    }
    s9  = {**assembled["s9_structured"],  "ai_narrative":     ai.get("s9_ai")}
    s11 = {**assembled["s11_structured"], "ai_risk_register": ai.get("s11_ai")}
    s13 = {**assembled["s13_structured"], "ai_sentiment":     ai.get("s13_ai")}
    s14 = {**assembled["s14_structured"], "ai_where_we_differ": ai.get("s14_ai")}

    s_h_ai = ai.get("s_h_ai") or {}
    s_esg = {
        **assembled["s_h_structured"],
        "ai_msci_rating": s_h_ai.get("msci_rating"),
        "ai_initiatives": s_h_ai.get("initiatives") or [],
        "ai_narrative":   s_h_ai.get("narrative"),
        "ai_source":      s_h_ai.get("source"),
        "ai_status":      s_h_ai.get("status"),
    }

    s_j_ai = ai.get("s_j_ai") or {}
    s_ma = {
        **assembled["s_j_structured"],
        "ai_events":    s_j_ai.get("events") or [],
        "ai_narrative": s_j_ai.get("narrative"),
        "ai_source":    s_j_ai.get("source"),
        "ai_status":    s_j_ai.get("status"),
    }

    s_b_ai = ai.get("s_b_ai") or {}
    s_porter = {
        **assembled["s_b_structured"],
        "ai_forces": {
            k: v for k, v in s_b_ai.items()
            if k not in ("source", "status")
        },
        "ai_source": s_b_ai.get("source"),
        "ai_status": s_b_ai.get("status"),
    }

    # --- Section C: SOTP Valuation ---
    # AI returns segment multiples only; Python does all arithmetic here.
    s_c_ai = ai.get("s_c_ai") or {}
    _s_c_base = assembled["s_c_structured"]
    _ai_multiples = s_c_ai.get("segment_multiples") or []

    def _fv(tagged):
        """Extract .value from a _tag() dict."""
        if isinstance(tagged, dict):
            return tagged.get("value")
        return tagged

    # Match AI multiples to FMP segment list and enrich
    def _find_multiple(seg_name: str) -> dict | None:
        nl = seg_name.lower()
        for m in _ai_multiples:
            mn = (m.get("name") or "").lower()
            if mn and (mn in nl or nl in mn or mn.split()[0] in nl):
                return m
        return None

    enriched_segments = []
    for seg in (_s_c_base.get("segments") or []):
        rev = _fv(seg.get("revenue"))
        match = _find_multiple(seg.get("name", ""))
        m_low  = float(match["multiple_low"])  if match else None
        m_base = float(match["multiple_base"]) if match else None
        m_high = float(match["multiple_high"]) if match else None
        enriched_segments.append({
            **seg,
            "multiple_low":   m_low,
            "multiple_base":  m_base,
            "multiple_high":  m_high,
            "multiple_basis": (match or {}).get("multiple_basis", "EV/Revenue"),
            "rationale":      (match or {}).get("rationale"),
            # [CALCULATED] implied values per segment
            "value_low_bn":   round(rev * m_low  / 1e9, 2) if rev and m_low  else None,
            "value_base_bn":  round(rev * m_base / 1e9, 2) if rev and m_base else None,
            "value_high_bn":  round(rev * m_high / 1e9, 2) if rev and m_high else None,
        })

    # Sum implied enterprise values [CALCULATED]
    def _sum_ev(key):
        vals = [s.get(key) for s in enriched_segments if s.get(key) is not None]
        return round(sum(vals), 2) if vals else None

    total_ev_low_bn  = _sum_ev("value_low_bn")
    total_ev_base_bn = _sum_ev("value_base_bn")
    total_ev_high_bn = _sum_ev("value_high_bn")

    net_debt_raw = _fv(_s_c_base.get("net_debt"))
    net_debt_bn  = round(net_debt_raw / 1e9, 2) if net_debt_raw is not None else None
    shares_raw   = _fv(_s_c_base.get("shares_outstanding"))
    price_raw    = _fv(_s_c_base.get("current_price"))

    def _equity(ev_bn):
        if ev_bn is None:
            return None
        return round(ev_bn - (net_debt_bn or 0), 2)

    def _price(equity_bn):
        if equity_bn is None or not shares_raw or shares_raw <= 0:
            return None
        return round(equity_bn * 1e9 / shares_raw, 2)

    def _upside(implied):
        if implied is None or not price_raw or price_raw <= 0:
            return None
        return round((implied / price_raw - 1) * 100, 1)

    eq_bear = _equity(total_ev_low_bn)
    eq_base = _equity(total_ev_base_bn)
    eq_bull = _equity(total_ev_high_bn)
    ip_bear = _price(eq_bear)
    ip_base = _price(eq_base)
    ip_bull = _price(eq_bull)

    s_c = {
        **_s_c_base,
        "enriched_segments":      enriched_segments,
        "total_ev_bear_bn":       total_ev_low_bn,
        "total_ev_base_bn":       total_ev_base_bn,
        "total_ev_bull_bn":       total_ev_high_bn,
        "net_debt_bn":            net_debt_bn,
        "equity_value_bear_bn":   eq_bear,
        "equity_value_base_bn":   eq_base,
        "equity_value_bull_bn":   eq_bull,
        "implied_price_bear":     ip_bear,
        "implied_price_base":     ip_base,
        "implied_price_bull":     ip_bull,
        "upside_pct_bear":        _upside(ip_bear),
        "upside_pct_base":        _upside(ip_base),
        "upside_pct_bull":        _upside(ip_bull),
        "ai_methodology":         s_c_ai.get("methodology"),
        "ai_source":              s_c_ai.get("source"),
        "ai_status":              s_c_ai.get("status"),
    }

    # --- Upgrade 1: market position → merge into s2 ---
    mktpos = ai.get("mktpos_ai") or {}
    s2 = {
        **s2,
        "market_share_pct":  mktpos.get("market_share_pct"),
        "competitive_rank":  mktpos.get("competitive_rank"),
        "named_competitors": mktpos.get("named_competitors") or [],
        "mktpos_source":     mktpos.get("source"),
        "mktpos_status":     mktpos.get("status"),
    }

    # --- Upgrade 2: brand value → merge into s2 (displayed in S6 for B2C) ---
    brand = ai.get("brand_ai") or {}
    s2 = {
        **s2,
        "brand_value":    brand.get("brand_value"),
        "brand_rank":     brand.get("brand_rank"),
        "ranking_list":   brand.get("ranking_list"),
        "brand_source":   brand.get("brand_source"),
        "brand_ai_source": brand.get("source"),
    }

    # --- Upgrade 3: subscriber comparison → merge into s8 ---
    sub = ai.get("sub_ai") or {}
    s8 = {
        **s8,
        "subscriber_comparison": {
            "competitors": sub.get("competitors") or [],
            "unit":        sub.get("unit", "millions"),
            "source":      sub.get("source"),
            "status":      sub.get("status"),
        },
    }

    brand_colors = ai.get("brand_colors_ai") or {}

    # --- Technical pattern AI (S7) ---
    s7_ai = ai.get("s7_ai") or {}
    s7 = {
        **assembled["s7"],
        "ai_chart_pattern":        s7_ai.get("chart_pattern"),
        "ai_pattern_evidence":     s7_ai.get("pattern_evidence"),
        "ai_pattern_invalidation": s7_ai.get("pattern_invalidation"),
        "ai_momentum_read":        s7_ai.get("momentum_read"),
        "ai_key_levels":           s7_ai.get("key_levels_narrative"),
        "ai_volume_narrative":     s7_ai.get("volume_narrative"),
        "ai_entry_explanation":    s7_ai.get("entry_quality_explanation"),
        "ai_outlook_4_8w":         s7_ai.get("outlook_4_8w"),
        "ai_source":               s7_ai.get("source"),
    }

    return {
        "s2":          s2,
        "s3":          s3,
        "s4b":         s4b,
        "s7":          s7,
        "s8":          s8,
        "s9":          s9,
        "s10b":        s10b,
        "s11":         s11,
        "s13":         s13,
        "s14":         s14,
        "s_esg":       s_esg,
        "s_ma":        s_ma,
        "s_porter":    s_porter,
        "s_c":         s_c,
        "brand_colors": brand_colors,
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
        "s7":  merged["s7"],
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
