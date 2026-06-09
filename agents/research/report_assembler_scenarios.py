"""
report_assembler_scenarios.py — Sections 12-15 and 17 (scenarios through reliability).
Imports helpers from report_assembler. Zero AI in any section.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from agents.research.report_assembler import _tag, _na, _safe_float
from utils.logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Section 12: Scenario Analysis
# ---------------------------------------------------------------------------

def build_scenario_analysis(data: dict, dcf_section: dict) -> dict:
    """
    Section 12: Bear/Base/Bull price targets and probability-weighted return.
    All values from APIs or [CALCULATED]. Zero AI.
    """
    yf_info = (data.get("yfinance") or {}).get("info") or {}
    apt     = (data.get("yfinance") or {}).get("analyst_price_targets") or {}
    fmp_dcf = data.get("fmp_dcf") or {}

    current_price = _safe_float(yf_info.get("current_price"))

    dcf_implied = None
    if not dcf_section.get("skip"):
        dcf_implied = _safe_float((dcf_section.get("implied_price") or {}).get("value"))

    fmp_dcf_price = _safe_float(fmp_dcf.get("dcf"))
    pt_mean = _safe_float(apt.get("mean") or yf_info.get("target_mean_price"))
    pt_high = _safe_float(apt.get("high") or yf_info.get("target_high_price"))
    pt_low  = _safe_float(apt.get("low") or yf_info.get("target_low_price"))

    # Bear: min of available downside anchors
    bear_candidates = [
        v for v in [fmp_dcf_price, pt_low, dcf_implied * 0.85 if dcf_implied else None]
        if v is not None
    ]
    bear_price = min(bear_candidates) if bear_candidates else None
    bear_src   = "min(FMP DCF, analyst PT low, our DCF x 0.85) [CALCULATED]" if bear_price else "N/A"

    # Base: our DCF preferred, else analyst mean
    if dcf_implied is not None:
        base_price, base_src = dcf_implied, "our DCF implied price [CALCULATED]"
    elif pt_mean is not None:
        base_price, base_src = pt_mean, "yfinance analyst PT mean"
    else:
        base_price, base_src = None, "N/A"

    # Bull: analyst PT high preferred, else DCF * 1.20
    if pt_high is not None:
        bull_price, bull_src = pt_high, "yfinance analyst PT high"
    elif dcf_implied is not None:
        bull_price = round(dcf_implied * 1.20, 2)
        bull_src   = "our DCF implied x 1.20 [CALCULATED]"
    else:
        bull_price, bull_src = None, "N/A"

    def _upside(target, current):
        if target is None or current is None or current == 0:
            return None
        return round((target - current) / current * 100, 1)

    bear_upside = _upside(bear_price, current_price)
    base_upside = _upside(base_price, current_price)
    bull_upside = _upside(bull_price, current_price)

    prob_weighted = None
    if all(v is not None for v in [bear_upside, base_upside, bull_upside]):
        prob_weighted = round(0.25 * bear_upside + 0.50 * base_upside + 0.25 * bull_upside, 1)

    return {
        "section":       "scenario_analysis",
        "current_price": _tag(current_price, "yfinance"),
        "dcf_implied":   _tag(dcf_implied, "FMP/yfinance [CALCULATED]"),
        "fmp_dcf_price": _tag(fmp_dcf_price, "FMP"),
        "bear": {
            "price_target": _tag(round(bear_price, 2) if bear_price else None, bear_src),
            "upside_pct":   _tag(bear_upside, "yfinance [CALCULATED]"),
            "probability":  _tag(25, "fixed assumption"),
        },
        "base": {
            "price_target": _tag(round(base_price, 2) if base_price else None, base_src),
            "upside_pct":   _tag(base_upside, "yfinance [CALCULATED]"),
            "probability":  _tag(50, "fixed assumption"),
        },
        "bull": {
            "price_target": _tag(round(bull_price, 2) if bull_price else None, bull_src),
            "upside_pct":   _tag(bull_upside, "yfinance [CALCULATED]"),
            "probability":  _tag(25, "fixed assumption"),
        },
        "probability_weighted_return": _tag(prob_weighted, "FMP/yfinance [CALCULATED]"),
        "base_return_pct": _tag(base_upside, "yfinance [CALCULATED]"),
    }


# ---------------------------------------------------------------------------
# Section 13: Sentiment (structured only — AI added in pipeline)
# ---------------------------------------------------------------------------

def build_sentiment(data: dict) -> dict:
    """Section 13 structured context. Haiku sentiment analysis injected by pipeline."""
    yf_info = (data.get("yfinance") or {}).get("info") or {}
    news    = data.get("finnhub_news") or []
    ratings = data.get("finnhub_ratings") or []

    short_pct_float = _safe_float(yf_info.get("short_pct_float"))

    buy_cnt = hold_cnt = sell_cnt = 0
    for r in ratings:
        buy_cnt  += int(r.get("buy", 0) or 0) + int(r.get("strongBuy", 0) or 0)
        hold_cnt += int(r.get("hold", 0) or 0)
        sell_cnt += int(r.get("sell", 0) or 0) + int(r.get("strongSell", 0) or 0)
    total = buy_cnt + hold_cnt + sell_cnt
    consensus_str = (
        "Buy"  if buy_cnt  > hold_cnt and buy_cnt  > sell_cnt
        else "Sell" if sell_cnt > hold_cnt and sell_cnt > buy_cnt
        else "Hold" if total > 0
        else None
    )

    news_items = [
        {
            "headline": a.get("headline", ""),
            "summary":  (a.get("summary") or "")[:150],
            "date":     str(a.get("datetime", ""))[:10],
        }
        for a in news[:20]
    ]

    return {
        "section": "sentiment",
        "short_interest_pct": _tag(
            round(float(short_pct_float) * 100, 2)
            if short_pct_float and float(short_pct_float) <= 1
            else short_pct_float,
            "yfinance"
        ),
        "analyst_consensus": _tag(consensus_str, "Finnhub [CALCULATED]"),
        "news_items":        news_items,
        "ai_sentiment":      None,
    }


# ---------------------------------------------------------------------------
# Section 14: Where We Differ (structured only — AI added in pipeline)
# ---------------------------------------------------------------------------

def build_where_we_differ(data: dict, all_sections: dict) -> dict:
    """Section 14 structured context. Haiku narrative injected by pipeline."""
    yf_info = (data.get("yfinance") or {}).get("info") or {}

    current_price  = _safe_float(yf_info.get("current_price"))
    pt_mean        = _safe_float(yf_info.get("target_mean_price"))
    analyst_rating = yf_info.get("recommendation_key")
    fmp_dcf_price  = _safe_float((data.get("fmp_dcf") or {}).get("dcf"))

    dcf_sec = all_sections.get("s5_forward_dcf") or {}
    our_dcf = None
    if not dcf_sec.get("skip"):
        our_dcf = _safe_float((dcf_sec.get("implied_price") or {}).get("value"))

    cover_sec  = all_sections.get("s1_cover") or {}
    direction  = cover_sec.get("mandate_status")
    conviction = (cover_sec.get("conviction_score") or {}).get("value")

    return {
        "section":            "where_we_differ",
        "current_price":      _tag(current_price, "yfinance"),
        "analyst_pt_mean":    _tag(pt_mean, "yfinance"),
        "analyst_rating":     _tag(analyst_rating, "yfinance"),
        "our_dcf_implied":    _tag(our_dcf, "FMP/yfinance [CALCULATED]"),
        "fmp_dcf_crosscheck": _tag(fmp_dcf_price, "FMP"),
        "direction":          _tag(direction, "mandate_checker"),
        "conviction":         _tag(conviction, "Investment Committee"),
        "ai_where_we_differ": None,
    }


# ---------------------------------------------------------------------------
# Section 15: Setup Checklist
# ---------------------------------------------------------------------------

def build_setup_checklist(data: dict, mandate: dict, technicals: dict) -> dict:
    """
    Section 15: Deterministic pass/fail checklist. Zero AI.
    Combines mandate checks + fundamental + technical checks.
    technicals arg is the S7 section dict (already assembled).
    """
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    income   = data.get("fmp_income") or []
    cashflow = data.get("fmp_cashflow") or []
    balance  = data.get("fmp_balance") or []
    tech_raw = data.get("technicals") or {}

    checks = []

    # Re-expose mandate checks
    for mc in mandate.get("checks", []):
        checks.append({
            "name":     mc["name"],
            "passed":   mc["passed"],
            "detail":   mc["detail"],
            "source":   mc["source"],
            "category": "Mandate",
        })

    # Revenue growth positive?
    rev_growth_positive = None
    rev_detail = "Revenue data unavailable"
    if len(income) >= 2:
        r0 = _safe_float(income[0].get("revenue"))
        r1 = _safe_float(income[1].get("revenue"))
        if r0 is not None and r1 is not None and r1 > 0:
            rev_growth_positive = r0 > r1
            yoy = round((r0 - r1) / r1 * 100, 1)
            rev_detail = f"Revenue YoY: {yoy:+.1f}%"
        else:
            rev_detail = "Revenue data missing"
    checks.append({
        "name": "Revenue growth positive (YoY)", "passed": bool(rev_growth_positive),
        "detail": rev_detail, "source": "FMP", "category": "Fundamental",
    })

    # FCF positive?
    fcf_val = _safe_float(cashflow[0].get("freeCashFlow")) if cashflow else None
    checks.append({
        "name": "Free cash flow positive", "passed": bool(fcf_val is not None and fcf_val > 0),
        "detail": f"FCF: ${fcf_val/1e9:.2f}B" if fcf_val is not None else "FCF unavailable",
        "source": "FMP", "category": "Fundamental",
    })

    # Net margin positive?
    nm_positive = None
    nm_detail = "Income data unavailable"
    if income:
        rev = _safe_float(income[0].get("revenue"))
        ni  = _safe_float(income[0].get("netIncome"))
        if rev and ni is not None and rev > 0:
            nm = ni / rev * 100
            nm_positive = nm > 0
            nm_detail = f"Net margin: {nm:.1f}%"
        else:
            nm_detail = "Revenue or net income missing"
    checks.append({
        "name": "Net margin positive", "passed": bool(nm_positive),
        "detail": nm_detail, "source": "FMP [CALCULATED]", "category": "Fundamental",
    })

    # Debt-to-equity < 3?
    de_ratio = _safe_float(yf_info.get("debt_to_equity"))
    if de_ratio is None and balance:
        debt = _safe_float(balance[0].get("totalDebt"))
        eq   = _safe_float(balance[0].get("totalStockholdersEquity") or balance[0].get("totalEquity"))
        if debt is not None and eq and eq != 0:
            de_ratio = round(debt / eq, 2)
    checks.append({
        "name": "Debt-to-equity < 3", "passed": bool(de_ratio is not None and de_ratio < 3),
        "detail": f"D/E: {de_ratio:.2f}" if de_ratio is not None else "D/E unavailable",
        "source": "yfinance/FMP [CALCULATED]", "category": "Fundamental",
    })

    # P/E below 50?
    pe_ttm = _safe_float(yf_info.get("pe_ttm"))
    checks.append({
        "name": "P/E (TTM) below 50", "passed": bool(pe_ttm is not None and pe_ttm < 50),
        "detail": f"P/E TTM: {pe_ttm:.1f}" if pe_ttm is not None else "P/E unavailable",
        "source": "yfinance", "category": "Fundamental",
    })

    # Technical checks
    tech_src = "yfinance [CALCULATED]"
    price  = _safe_float(yf_info.get("current_price") or tech_raw.get("current_price"))
    sma50  = _safe_float(tech_raw.get("sma50"))
    sma200 = _safe_float(tech_raw.get("sma200"))
    rsi    = _safe_float(tech_raw.get("rsi"))
    trend  = tech_raw.get("trend_signal", "")

    checks.append({
        "name": "Price above SMA50",
        "passed": bool(price is not None and sma50 is not None and price > sma50),
        "detail": f"Price {price}, SMA50 {sma50}" if price and sma50 else "Data unavailable",
        "source": tech_src, "category": "Technical",
    })
    checks.append({
        "name": "Price above SMA200",
        "passed": bool(price is not None and sma200 is not None and price > sma200),
        "detail": f"Price {price}, SMA200 {sma200}" if price and sma200 else "Data unavailable",
        "source": tech_src, "category": "Technical",
    })
    checks.append({
        "name": "RSI not overbought (< 75)", "passed": bool(rsi is not None and rsi < 75),
        "detail": f"RSI: {rsi:.1f}" if rsi is not None else "RSI unavailable",
        "source": tech_src, "category": "Technical",
    })
    checks.append({
        "name": "Trend signal Bullish or Neutral",
        "passed": (trend or "").lower() in ("bullish", "neutral"),
        "detail": f"Trend: {trend or 'unavailable'}",
        "source": tech_src, "category": "Technical",
    })

    passed_count  = sum(1 for c in checks if c["passed"])
    total_count   = len(checks)
    overall_score = round(passed_count / total_count * 100, 1) if total_count > 0 else 0.0

    return {
        "section":       "setup_checklist",
        "checks":        checks,
        "passed_count":  passed_count,
        "total_count":   total_count,
        "overall_score": _tag(overall_score, "system [CALCULATED]"),
    }


# ---------------------------------------------------------------------------
# Section 17: Data Reliability
# ---------------------------------------------------------------------------

def _walk_tagged_fields(obj, api_c, ai_c, na_c, conflict_c):
    """Recursively count tagged fields in nested dicts/lists."""
    if isinstance(obj, dict):
        if "value" in obj and "source" in obj and "status" in obj:
            src    = obj.get("source", "")
            status = obj.get("status", "")
            if "[AI narrative]" in src or "[AI" in src:
                ai_c[0] += 1
            elif status == "na":
                na_c[0] += 1
            elif status == "conflict":
                conflict_c[0] += 1
                api_c[0] += 1
            else:
                api_c[0] += 1
        else:
            for v in obj.values():
                _walk_tagged_fields(v, api_c, ai_c, na_c, conflict_c)
    elif isinstance(obj, list):
        for item in obj:
            _walk_tagged_fields(item, api_c, ai_c, na_c, conflict_c)


def build_data_reliability(data: dict, sections: dict) -> dict:
    """Section 17: Data quality audit. Zero AI."""
    meta    = data.get("_meta") or {}
    elapsed = meta.get("elapsed_sec")
    fetched = meta.get("fetched_at", "")

    source_status = {
        "FMP profile":              bool(data.get("fmp_profile")),
        "FMP income":               bool(data.get("fmp_income")),
        "FMP balance":              bool(data.get("fmp_balance")),
        "FMP cashflow":             bool(data.get("fmp_cashflow")),
        "FMP key_metrics":          bool(data.get("fmp_key_metrics")),
        "FMP DCF":                  bool(data.get("fmp_dcf")),
        "FMP peers":                bool(data.get("fmp_peers")),
        "yfinance info":            bool((data.get("yfinance") or {}).get("info")),
        "yfinance price_history":   (data.get("yfinance") or {}).get("price_history") is not None,
        "yfinance returns":         bool((data.get("yfinance") or {}).get("returns")),
        "yfinance institutional":   bool((data.get("yfinance") or {}).get("institutional_holders")),
        "yfinance analyst_targets": bool((data.get("yfinance") or {}).get("analyst_price_targets")),
        "Finnhub news":             bool(data.get("finnhub_news")),
        "Finnhub ratings":          bool(data.get("finnhub_ratings")),
        "Finnhub basics":           bool(data.get("finnhub_basics")),
        "Finnhub earnings":         bool(data.get("finnhub_earnings")),
        "FRED macro":               bool(data.get("fred_macro")),
        "SEC Form 4":               bool(data.get("sec_form4")),
        "SEC 8-K":                  bool(data.get("sec_8k")),
        "Tavily overview":          bool(data.get("tavily_overview")),
        "Tavily catalysts":         bool(data.get("tavily_catalysts")),
        "Tavily industry":          bool(data.get("tavily_industry")),
        "Tavily competitive":       bool(data.get("tavily_competitive")),
        "peer_metrics":             bool(data.get("peer_metrics")),
        "technicals":               bool(data.get("technicals")),
    }

    sources_ok     = [s for s, ok in source_status.items() if ok]
    sources_failed = [s for s, ok in source_status.items() if not ok]

    api_c = [0]; ai_c = [0]; na_c = [0]; conflict_c = [0]
    _walk_tagged_fields(sections, api_c, ai_c, na_c, conflict_c)

    total_fields = api_c[0] + ai_c[0] + na_c[0]
    coverage_pct = (api_c[0] / total_fields * 100) if total_fields > 0 else 0
    badge = "Full" if coverage_pct >= 85 else "Partial" if coverage_pct >= 50 else "Limited"

    return {
        "section":              "data_reliability",
        "api_sources_ok":       sources_ok,
        "api_sources_failed":   sources_failed,
        "sources_ok_count":     _tag(len(sources_ok), "system [CALCULATED]"),
        "sources_failed_count": _tag(len(sources_failed), "system [CALCULATED]"),
        "api_fields_count":     _tag(api_c[0], "system [CALCULATED]"),
        "ai_fields_count":      _tag(ai_c[0], "system [CALCULATED]"),
        "na_fields_count":      _tag(na_c[0], "system [CALCULATED]"),
        "conflicts_count":      _tag(conflict_c[0], "system [CALCULATED]"),
        "coverage_pct":         _tag(round(coverage_pct, 1), "system [CALCULATED]"),
        "coverage_badge":       _tag(badge, "system [CALCULATED]"),
        "fetch_elapsed_sec":    _tag(elapsed, "system"),
        "generated_at":         _tag(fetched, "system"),
    }
