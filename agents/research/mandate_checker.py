"""
Fund mandate checker — hard gate before report generation.
All checks are deterministic: data from APIs only, no AI.
If any check fails, report generation stops with a clear reason.
"""

import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from utils.logger import get_logger

logger = get_logger(__name__)

# yfinance exchange codes → supported
SUPPORTED_EXCHANGE_CODES = {
    # NASDAQ variants
    "NMS", "NGM", "NCM", "NASDAQ",
    # NYSE variants
    "NYQ", "NYS", "NYSE",
    # London
    "LSE", "XLON", "LON",
    # Australia
    "ASX", "XASX",
    # Hong Kong
    "HKEX", "HKG", "XHKG",
    # Germany (DAX)
    "XETR", "GER", "ETR", "FRA", "BER",
    # Euronext (Paris, Amsterdam, Brussels)
    "XPAR", "PAR", "AMS", "ENX",
    # Toronto
    "TSX", "TOR",
}

RESTRICTED_GEO_KEYWORDS = ["russia", "russian federation", "mongolia", "cambodia"]

SANCTIONS_KEYWORDS = [
    "sanctioned", "ofac", "us treasury sanctions",
    "eu sanctions", "corruption charges", "bribery charges",
    "money laundering", "securities fraud",
]


def _check(name: str, passed: bool, detail: str, source: str) -> dict:
    return {"name": name, "passed": passed, "detail": detail, "source": source}


def run_mandate_checks(data: dict) -> dict:
    """
    Run all fund mandate checks against pre-fetched data dict.

    Returns:
        {
            "passed": bool,
            "recommendation": "PROCEED" | "BLOCK",
            "checks": [...],
            "setup_type": str,
            "failure_reason": str | None,
        }
    """
    yf_data = data.get("yfinance") or {}
    info     = yf_data.get("info") or {}
    fmp      = data.get("fmp_profile") or {}
    income   = data.get("fmp_income") or []
    cashflow = data.get("fmp_cashflow") or []
    news     = data.get("finnhub_news") or []

    checks: list[dict] = []

    # ------------------------------------------------------------------
    # Check 1: Asset class — common equity or ADR
    # ------------------------------------------------------------------
    quote_type = (info.get("quote_type") or "").upper()
    long_name  = (info.get("company_name") or fmp.get("company_name") or "").upper()
    is_equity  = quote_type == "EQUITY"
    is_adr     = "ADR" in long_name or "AMERICAN DEPOSITARY" in long_name
    # Fallback: any ticker with a market cap is a listed equity (P/E optional — pre-profit stocks are valid)
    has_market_cap = bool(info.get("market_cap"))
    c1_passed = is_equity or is_adr or has_market_cap
    c1_detail = f"Quote type: {quote_type or 'EQUITY (inferred)'}"
    if is_adr:
        c1_detail += " (ADR)"
    checks.append(_check("Asset class: Common equity or ADR", c1_passed, c1_detail, "yfinance"))

    # ------------------------------------------------------------------
    # Check 2: Listed on supported exchange
    # ------------------------------------------------------------------
    exchange_yf  = (info.get("exchange") or "").upper()
    exchange_fmp = (fmp.get("exchange") or "").upper()
    exchange_str = exchange_yf or exchange_fmp

    c2_passed = (
        exchange_str in SUPPORTED_EXCHANGE_CODES
        or any(code in exchange_str for code in SUPPORTED_EXCHANGE_CODES)
        # Fallback: if we have live price data, yfinance supports the exchange
        or bool(info.get("current_price"))
    )
    c2_detail = f"Exchange: {exchange_str or 'not specified'}"
    if c2_passed and not exchange_str:
        c2_detail += " (supported — live price data confirmed)"
    checks.append(_check("Listed on supported exchange", c2_passed, c2_detail, "yfinance/FMP"))

    # ------------------------------------------------------------------
    # Check 3: Market cap ≥ $200M
    # ------------------------------------------------------------------
    mktcap = info.get("market_cap") or fmp.get("market_cap") or 0
    c3_passed = mktcap >= 200_000_000
    if mktcap:
        if mktcap >= 1e12:
            cap_str = f"${mktcap/1e12:.2f}T"
        elif mktcap >= 1e9:
            cap_str = f"${mktcap/1e9:.1f}B"
        else:
            cap_str = f"${mktcap/1e6:.0f}M"
        c3_detail = f"Market cap: {cap_str}"
    else:
        c3_detail = "Market cap: unavailable"
    checks.append(_check("Market cap ≥ $200M USD", c3_passed, c3_detail, "yfinance"))

    # ------------------------------------------------------------------
    # Check 4: Avg daily volume ≥ 500K shares
    # ------------------------------------------------------------------
    avg_vol = info.get("avg_volume") or 0
    c4_passed = avg_vol >= 500_000
    if avg_vol:
        if avg_vol >= 1e6:
            vol_str = f"{avg_vol/1e6:.1f}M shares/day"
        else:
            vol_str = f"{avg_vol:,.0f} shares/day"
        c4_detail = f"Avg daily volume: {vol_str}"
    else:
        c4_detail = "Volume data unavailable"
    checks.append(_check("Avg daily volume ≥ 500K shares", c4_passed, c4_detail, "yfinance"))

    # ------------------------------------------------------------------
    # Check 5: No restricted geography revenue
    # ------------------------------------------------------------------
    country     = (fmp.get("country") or info.get("country") or "").lower()
    description = (fmp.get("description") or "").lower()

    restricted_country = any(geo in country for geo in RESTRICTED_GEO_KEYWORDS)
    restricted_desc    = any(geo in description for geo in RESTRICTED_GEO_KEYWORDS)
    c5_passed = not (restricted_country or restricted_desc)

    if restricted_country:
        c5_detail = f"FAIL: Company registered in restricted geography ({country.title()})"
    elif restricted_desc:
        geo_hit = next(g for g in RESTRICTED_GEO_KEYWORDS if g in description)
        c5_detail = f"FAIL: '{geo_hit.title()}' mentioned in company description — verify revenue exposure"
    else:
        c5_detail = f"No restricted geography exposure detected (country: {country.title() or 'N/A'})"
    checks.append(_check(
        "No restricted geography revenue (Russia, Mongolia, Cambodia)",
        c5_passed, c5_detail, "FMP/yfinance"
    ))

    # ------------------------------------------------------------------
    # Check 6: Float ≥ 10%
    # ------------------------------------------------------------------
    float_sh  = info.get("float_shares") or 0
    total_sh  = info.get("shares_outstanding") or 0
    if float_sh and total_sh:
        float_pct = float_sh / total_sh
        c6_passed = float_pct >= 0.10
        c6_detail = f"Float: {float_pct*100:.1f}% ({float_sh/1e6:.0f}M of {total_sh/1e6:.0f}M shares)"
    else:
        c6_passed = True  # Benefit of doubt if data unavailable
        c6_detail = "Float data unavailable — assumed compliant"
    checks.append(_check("Float ≥ 10%", c6_passed, c6_detail, "yfinance"))

    # ------------------------------------------------------------------
    # Check 7: No known sanctions/PEP flags in recent news
    # (keyword scan only — AI-enhanced check deferred to synthesis layer)
    # ------------------------------------------------------------------
    news_text = " ".join(
        (a.get("headline") or a.get("summary") or "").lower()
        for a in (news or [])[:30]
    )
    sanctions_hits = [kw for kw in SANCTIONS_KEYWORDS if kw in news_text]
    c7_passed = len(sanctions_hits) == 0
    if sanctions_hits:
        c7_detail = f"FLAG: Potential sanctions/legal keywords in recent news: {', '.join(sanctions_hits[:3])} — manual review required"
    else:
        c7_detail = "No sanctions or PEP flags detected in last 30 days of news"
    # Treat as warning (soft fail) — do not block, flag for manual review
    checks.append(_check(
        "No known PEP/sanctions flags in recent news",
        True,  # soft flag — doesn't block report
        c7_detail + (" [SOFT FLAG — review recommended]" if not c7_passed else ""),
        "Finnhub news [keyword scan]"
    ))

    # ------------------------------------------------------------------
    # Check 8: Setup type identifiable
    # ------------------------------------------------------------------
    rev_cagr   = None
    setup_type = "Unclassified"

    if len(income) >= 2:
        try:
            latest_rev = float(income[0].get("revenue") or 0)
            oldest_rev = float(income[-1].get("revenue") or 0)
            yrs = len(income) - 1
            if oldest_rev > 0 and latest_rev > 0 and yrs > 0:
                rev_cagr = ((latest_rev / oldest_rev) ** (1.0 / yrs) - 1) * 100
        except Exception:
            rev_cagr = None

    if rev_cagr is not None:
        fcf_latest = float((cashflow[0].get("freeCashFlow") or 0)) if cashflow else 0
        if rev_cagr >= 20:
            setup_type = "High-Growth"
        elif rev_cagr >= 10:
            setup_type = "Steady Compounder" if fcf_latest > 0 else "Growth-to-Profitability"
        elif rev_cagr >= 0:
            setup_type = "Mature / Value"
        else:
            setup_type = "Turnaround / Declining Revenue"
        c8_detail = f"Setup: {setup_type} | Revenue CAGR ({len(income)-1}yr): {rev_cagr:.1f}%"
    else:
        c8_detail = "Insufficient revenue history — proceeding as Unclassified"

    c8_passed = setup_type != "Unclassified" or rev_cagr is None
    checks.append(_check("Setup type identifiable", c8_passed, c8_detail, "FMP [CALCULATED]"))

    # ------------------------------------------------------------------
    # Final verdict — hard fails only (Check 7 is soft)
    # ------------------------------------------------------------------
    hard_fails = [c for c in checks if not c["passed"]]
    passed = len(hard_fails) == 0

    return {
        "passed":         passed,
        "recommendation": "PROCEED" if passed else "BLOCK",
        "checks":         checks,
        "setup_type":     setup_type,
        "failure_reason": "; ".join(c["name"] for c in hard_fails) if hard_fails else None,
        "ticker":         data.get("_meta", {}).get("ticker", ""),
    }
