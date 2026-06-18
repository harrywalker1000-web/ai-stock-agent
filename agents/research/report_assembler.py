"""
Report assembler — converts raw fetch data into tagged, conflict-checked section dicts.
Each field: {"value": ..., "source": "...", "status": "ok|na|conflict|error"}
AI never writes numbers here. Numbers come from APIs or [CALCULATED] formulas.
"""

import os
import sys
from datetime import datetime
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from utils.logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Tagging helpers
# ---------------------------------------------------------------------------

def _tag(value: Any, source: str) -> dict:
    return {"value": value, "source": source, "status": "ok" if value is not None else "na"}


def _na(source: str, reason: str = "unavailable") -> dict:
    return {"value": None, "source": source, "status": "na", "reason": reason}


def _conflict(val_a: Any, src_a: str, val_b: Any, src_b: str, used: Any, used_src: str) -> dict:
    """Two sources disagree. Show both, flag conflict, use more conservative value."""
    return {
        "value":    used,
        "source":   used_src,
        "status":   "conflict",
        "conflict": {
            "a": {"value": val_a, "source": src_a},
            "b": {"value": val_b, "source": src_b},
            "resolution": f"Using {used_src} (more conservative)",
        },
    }


def _maybe_conflict(val_a: Any, src_a: str, val_b: Any, src_b: str, threshold_pct: float = 5.0) -> dict:
    """Return conflict dict if two numeric values differ by > threshold_pct, else use val_a."""
    if val_a is None:
        return _tag(val_b, src_b)
    if val_b is None:
        return _tag(val_a, src_a)
    try:
        diff_pct = abs(float(val_a) - float(val_b)) / abs(float(val_a)) * 100
        if diff_pct > threshold_pct:
            used = min(float(val_a), float(val_b))
            used_src = src_a if float(val_a) <= float(val_b) else src_b
            return _conflict(val_a, src_a, val_b, src_b, used, used_src)
    except (TypeError, ZeroDivisionError):
        pass
    return _tag(val_a, src_a)


# ---------------------------------------------------------------------------
# Data coverage scorer
# ---------------------------------------------------------------------------

def _coverage_badge(field_dicts: list[dict]) -> str:
    """Full if ≥85% fields have data, Partial if ≥50%, Limited otherwise."""
    total = len(field_dicts)
    if total == 0:
        return "Limited"
    ok = sum(1 for f in field_dicts if f.get("status") == "ok" and f.get("value") is not None)
    ratio = ok / total
    if ratio >= 0.85:
        return "Full"
    if ratio >= 0.50:
        return "Partial"
    return "Limited"


# ---------------------------------------------------------------------------
# Section 0: Cover
# ---------------------------------------------------------------------------

def build_cover(data: dict, mandate: dict) -> dict:
    """
    Assemble cover section data.
    Recommendation / conviction are null here — filled by Investment Committee.
    """
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    fmp      = data.get("fmp_profile") or {}
    meta     = data.get("_meta") or {}
    tech     = data.get("technicals") or {}

    # Identity — prefer FMP profile for company details, yfinance for price
    company_name = yf_info.get("company_name") or fmp.get("company_name")
    exchange     = yf_info.get("exchange") or fmp.get("exchange")
    sector       = yf_info.get("sector") or fmp.get("sector")
    industry     = yf_info.get("industry") or fmp.get("industry")
    country      = fmp.get("country") or yf_info.get("country")
    ceo          = fmp.get("ceo")
    currency     = fmp.get("currency") or yf_info.get("currency") or "USD"

    # Price — yfinance is primary (real-time), FMP profile as sanity check
    price_yf  = yf_info.get("current_price") or tech.get("current_price")
    price_fmp = fmp.get("market_cap") and None  # FMP profile doesn't give live price
    price     = _tag(round(float(price_yf), 2) if price_yf else None, "yfinance")

    # Market cap
    mktcap_yf  = yf_info.get("market_cap")
    mktcap_fmp = fmp.get("market_cap")
    market_cap = _maybe_conflict(mktcap_yf, "yfinance", mktcap_fmp, "FMP", threshold_pct=5.0)

    # 52w range
    high_52w = _tag(yf_info.get("52w_high"), "yfinance")
    low_52w  = _tag(yf_info.get("52w_low"), "yfinance")

    # Shares + float
    shares_out = _tag(yf_info.get("shares_outstanding"), "yfinance")
    float_sh   = _tag(yf_info.get("float_shares"), "yfinance")
    short_pct  = _tag(
        round(float(yf_info["short_pct_float"]) * 100, 2) if yf_info.get("short_pct_float") else None,
        "yfinance"
    )

    # Analyst price targets — bear/base/bull from yfinance .info
    target_low    = yf_info.get("target_low_price")
    target_mean   = yf_info.get("target_mean_price")
    target_median = yf_info.get("target_median_price")
    target_high   = yf_info.get("target_high_price")
    num_analysts  = yf_info.get("num_analyst_opinions")
    rec_key       = yf_info.get("recommendation_key")   # "buy", "hold", "sell" etc.
    rec_mean      = yf_info.get("recommendation_mean")  # 1=Strong Buy, 5=Strong Sell

    analyst_targets = {
        "bear":           _tag(target_low, "yfinance"),
        "base":           _tag(target_mean or target_median, "yfinance"),
        "bull":           _tag(target_high, "yfinance"),
        "recommendation": _tag(rec_key, "yfinance"),
        "rec_mean_score": _tag(rec_mean, "yfinance"),
        "num_analysts":   _tag(num_analysts, "yfinance"),
    }

    # Implied upside vs analyst consensus base target
    pt_upside = None
    if price_yf and target_mean:
        pt_upside = round((float(target_mean) - float(price_yf)) / float(price_yf) * 100, 1)

    # Returns (for cover summary bar)
    returns = (data.get("yfinance") or {}).get("returns") or {}

    # Data coverage (sample of key fields for this section)
    coverage_fields = [
        _tag(company_name, "id"), _tag(exchange, "id"), _tag(sector, "id"),
        price, market_cap, high_52w, low_52w,
        analyst_targets["base"], analyst_targets["bear"], analyst_targets["bull"],
        _tag(returns.get("1y"), "ret"), _tag(returns.get("ytd"), "ret"),
    ]

    return {
        "section":         "cover",
        "ticker":          meta.get("ticker", ""),
        "company_name":    _tag(company_name, "yfinance/FMP"),
        "exchange":        _tag(exchange, "yfinance"),
        "sector":          _tag(sector, "yfinance/FMP"),
        "industry":        _tag(industry, "yfinance/FMP"),
        "country":         _tag(country, "FMP"),
        "ceo":             _tag(ceo, "FMP"),
        "currency":        _tag(currency, "FMP/yfinance"),
        "current_price":   price,
        "market_cap":      market_cap,
        "52w_high":        high_52w,
        "52w_low":         low_52w,
        "shares_outstanding": shares_out,
        "float_shares":    float_sh,
        "short_pct_float": short_pct,
        "returns":         {k: _tag(v, "yfinance [CALCULATED]") for k, v in returns.items()},
        "analyst_targets": analyst_targets,
        "pt_upside_pct":   _tag(pt_upside, "yfinance [CALCULATED]"),
        "mandate_status":  mandate.get("recommendation", "UNKNOWN"),
        "setup_type":      mandate.get("setup_type", "Unclassified"),
        # Filled by Investment Committee agent — null until Section 16 runs
        "recommendation":  _na("Investment Committee", "pending — filled after all sections"),
        "conviction_score": _na("Investment Committee", "pending — filled after all sections"),
        "expected_return_12m": _na("Scenario Analysis", "pending — filled after Section 12"),
        "report_date":     _tag(datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"), "system"),
        "data_coverage":   _tag(_coverage_badge(coverage_fields), "system [CALCULATED]"),
        "fetched_at":      meta.get("fetched_at", ""),
        "company_image":   fmp.get("image"),
    }


# ---------------------------------------------------------------------------
# Section 2: Company Overview
# ---------------------------------------------------------------------------

def build_overview_structured(data: dict) -> dict:
    """
    Section 2 structured data — all from APIs, zero AI.
    AI narrative (3 paragraphs) is added separately by synthesis_agents.py.
    """
    fmp      = data.get("fmp_profile") or {}
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    tavily   = data.get("tavily_overview") or []
    inc      = data.get("fmp_income") or []

    # Revenue CAGR for context
    rev_cagr = None
    if len(inc) >= 2:
        try:
            r0 = float(inc[0].get("revenue") or 0)
            rn = float(inc[-1].get("revenue") or 0)
            yrs = len(inc) - 1
            if r0 > 0 and rn > 0:
                rev_cagr = round(((r0 / rn) ** (1 / yrs) - 1) * 100, 1)
        except Exception:
            pass

    # Revenue segments: FMP fetch_fmp_revenue_segments already called? No — add it here
    # Segments require FMP Professional — mark as N/A, provide Tavily source links
    tavily_links = [
        {"title": r.get("title", ""), "url": r.get("url", "")}
        for r in tavily[:3]
        if r.get("url")
    ]

    # Conflict check: market cap between yfinance and FMP
    mktcap_yf  = yf_info.get("market_cap")
    mktcap_fmp = fmp.get("market_cap")
    market_cap = _maybe_conflict(mktcap_yf, "yfinance", mktcap_fmp, "FMP", threshold_pct=5.0)

    return {
        "section":        "overview",
        "company_name":   _tag(fmp.get("company_name") or yf_info.get("company_name"), "FMP/yfinance"),
        "ticker":         _tag((data.get("_meta") or {}).get("ticker", ""), "system"),
        "exchange":       _tag(yf_info.get("exchange") or fmp.get("exchange"), "yfinance/FMP"),
        "sector":         _tag(yf_info.get("sector") or fmp.get("sector"), "yfinance/FMP"),
        "industry":       _tag(yf_info.get("industry") or fmp.get("industry"), "yfinance/FMP"),
        "country":        _tag(fmp.get("country") or yf_info.get("country"), "FMP"),
        "ceo":            _tag(fmp.get("ceo"), "FMP"),
        "employees":      _tag(fmp.get("employees"), "FMP"),
        "ipo_date":       _tag(fmp.get("ipo_date"), "FMP"),
        "website":        _tag(fmp.get("website"), "FMP"),
        "market_cap":     market_cap,
        "revenue_cagr_3y": _tag(rev_cagr, "FMP [CALCULATED]") if rev_cagr is not None else _na("FMP", "insufficient history"),
        "fmp_description": _tag(fmp.get("description"), "FMP [company text, not AI]"),
        # Segment data requires FMP Professional — Tavily links provided as reference
        "revenue_segments": _na(
            "FMP Professional / Tavily",
            "Segment breakdown unavailable on free FMP plan. "
            "Manual lookup: 10-K or IR page."
        ),
        "geo_segments": _na(
            "FMP Professional / Tavily",
            "Geographic breakdown unavailable on free FMP plan. "
            "Manual lookup: 10-K or IR page."
        ),
        "tavily_sources":  tavily_links,
        # AI narrative placeholder — filled by synthesize_company_overview()
        "ai_narrative":   None,
    }


# ---------------------------------------------------------------------------
# Section 3: Latest News & Catalysts
# ---------------------------------------------------------------------------

def build_news_catalysts_structured(data: dict) -> dict:
    """
    Section 3 structured data — all from APIs, zero AI.
    AI catalyst synthesis added separately by synthesize_news_catalysts().
    """
    earnings_cal  = data.get("finnhub_earnings") or []
    eps_surprises = (data.get("yfinance") or {}).get("eps_surprises") or []
    sec_8k        = data.get("sec_8k") or []
    yf_info       = (data.get("yfinance") or {}).get("info") or {}
    ticker        = (data.get("_meta") or {}).get("ticker", "")

    news = data.get("finnhub_news") or []
    news_source = "Finnhub"
    if not news:
        yf_news = (data.get("yfinance") or {}).get("news") or []
        if yf_news:
            news = yf_news
            news_source = "yfinance"

    # --- 3a: Upcoming earnings ---
    upcoming_earnings = []
    for entry in earnings_cal:
        if entry.get("epsActual") is None and entry.get("date"):
            upcoming_earnings.append({
                "date":             _tag(entry["date"], "Finnhub"),
                "quarter":          _tag(f"Q{entry.get('quarter')} {entry.get('year')}", "Finnhub"),
                "eps_estimate":     _tag(entry.get("epsEstimate"), "Finnhub"),
                "revenue_estimate": _tag(entry.get("revenueEstimate"), "Finnhub"),
                "timing":           _tag(entry.get("hour", "").upper(), "Finnhub"),
            })

    # --- 3b: EPS surprise history (last 4 quarters) ---
    eps_history = []
    for row in eps_surprises:
        actual   = row.get("epsActual")
        estimate = row.get("epsEstimate")
        surprise = row.get("surprisePercent")
        date_val = row.get("Earnings Date") or row.get("Date") or row.get("date")
        beat     = None
        if actual is not None and estimate is not None:
            beat = actual >= estimate

        # Format date
        date_str = None
        if date_val is not None:
            try:
                import pandas as pd
                date_str = str(pd.Timestamp(date_val).date())
            except Exception:
                date_str = str(date_val)[:10]

        eps_history.append({
            "date":             _tag(date_str, "yfinance"),
            "eps_actual":       _tag(actual, "yfinance"),
            "eps_estimate":     _tag(estimate, "yfinance"),
            "surprise_pct":     _tag(round(float(surprise) * 100, 2) if surprise else None, "yfinance [CALCULATED]"),
            "beat":             _tag(beat, "yfinance [CALCULATED]"),
        })

    # Reverse so most recent is last (chronological)
    eps_history = list(reversed(eps_history))

    # --- 3c: Ex-dividend date ---
    ex_div = yf_info.get("exDividendDate") or yf_info.get("lastDividendDate")
    div_event = _tag(ex_div, "yfinance") if ex_div else _na("yfinance", "no dividend or date unavailable")

    # --- 3d: Recent SEC 8-K events (proxy for press releases) ---
    press_releases = [
        {
            "date":   _tag(f["date"], "SEC EDGAR"),
            "form":   _tag(f["form"], "SEC EDGAR"),
            "url":    _tag(f["url"], "SEC EDGAR"),
        }
        for f in sec_8k[:5]
    ]

    # --- 3e: News feed (last 20 articles, structured) ---
    news_feed = []
    for article in news[:20]:
        dt = article.get("datetime")
        date_str = None
        if dt:
            try:
                from datetime import timezone
                date_str = datetime.fromtimestamp(int(dt), tz=timezone.utc).strftime("%Y-%m-%d")
            except Exception:
                date_str = str(dt)[:10] if dt else None
        news_feed.append({
            "headline": _tag(article.get("headline", ""), news_source),
            "source":   _tag(article.get("source", ""), news_source),
            "date":     _tag(date_str, news_source),
            "url":      _tag(article.get("url", ""), news_source),
            "summary":  _tag((article.get("summary") or "")[:200], news_source),
        })

    # --- 3f: Tavily catalyst context sources ---
    tavily_sources = [
        {"title": r.get("title", ""), "url": r.get("url", "")}
        for r in (data.get("tavily_catalysts") or [])[:3]
        if r.get("url")
    ]

    return {
        "section":          "news_catalysts",
        "ticker":           ticker,
        "upcoming_earnings": upcoming_earnings,
        "eps_history":      eps_history,
        "ex_dividend":      div_event,
        "press_releases":   press_releases,
        "news_feed":        news_feed,
        "news_count":       _tag(len(news_feed), news_source),
        "tavily_sources":   tavily_sources,
        # AI synthesis placeholders — filled by synthesize_news_catalysts()
        "ai_news_synthesis": None,
        "ai_catalyst_assessment": None,
    }


# ---------------------------------------------------------------------------
# Section 4: Historical Financials
# ---------------------------------------------------------------------------

def _pct(num: Any, denom: Any) -> Any:
    """Safe percentage: num / denom * 100, rounded to 1dp."""
    try:
        if num is None or denom is None or float(denom) == 0:
            return None
        return round(float(num) / float(denom) * 100, 1)
    except (TypeError, ZeroDivisionError):
        return None


def _yoy(current: Any, prior: Any) -> Any:
    """YoY % change between two values."""
    try:
        if current is None or prior is None or float(prior) == 0:
            return None
        return round((float(current) - float(prior)) / abs(float(prior)) * 100, 1)
    except (TypeError, ZeroDivisionError):
        return None


def _yf_dividend_history(ticker: str) -> list:
    """Fetch annual DPS history from yfinance. Returns list newest-first."""
    try:
        import yfinance as yf
        divs = yf.Ticker(ticker).dividends
        if divs is None or divs.empty:
            return []
        annual = divs.groupby(divs.index.year).sum()
        recent = annual.iloc[-5:]
        return [
            {"year": str(yr), "dps": round(float(v), 4), "source": "yfinance"}
            for yr, v in zip(reversed(recent.index.tolist()), reversed(recent.values.tolist()))
        ]
    except Exception:
        return []


def _yf_financial_rows(data: dict) -> list[dict]:
    """
    Build income-statement-like rows from yfinance when FMP is unavailable.
    Returns list of annual rows, most-recent first, each matching FMP row schema.
    """
    yf_data = data.get("yfinance") or {}
    ticker = (data.get("_meta") or {}).get("ticker", "")
    if not ticker:
        return []
    try:
        yf_prefetched = data.get("yfinance") or {}
        is_  = yf_prefetched.get("income_stmt")
        bs_  = yf_prefetched.get("balance_sheet")
        cf_  = yf_prefetched.get("cashflow")
        # Fall back to a fresh yfinance fetch if not pre-loaded (e.g. legacy pipeline)
        if is_ is None:
            import yfinance as yf
            t = yf.Ticker(ticker)
            is_  = t.income_stmt
            bs_  = t.balance_sheet
            cf_  = t.cashflow

        def _get(df, *row_names):
            for name in row_names:
                if df is not None and not df.empty and name in df.index:
                    return df.loc[name]
            return None

        rev_s  = _get(is_, "Total Revenue")
        gp_s   = _get(is_, "Gross Profit")
        ebd_s  = _get(is_, "EBITDA")
        ni_s   = _get(is_, "Net Income")
        eps_s  = _get(is_, "Diluted EPS")
        fcf_s  = _get(cf_, "Free Cash Flow")
        ocf_s  = _get(cf_, "Operating Cash Flow")
        cap_s  = _get(cf_, "Capital Expenditure")
        debt_s = _get(bs_, "Total Debt")
        eq_s   = _get(bs_, "Stockholders Equity", "Common Stock Equity")
        ca_s   = _get(bs_, "Current Assets", "Total Current Assets")
        cl_s   = _get(bs_, "Current Liabilities", "Total Current Liabilities")
        cash_s = _get(bs_, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments")

        if rev_s is None:
            return []

        yf_info = (data.get("yfinance") or {}).get("info") or {}
        shares = yf_info.get("sharesOutstanding") or yf_info.get("impliedSharesOutstanding")
        shares = float(shares) if shares else None

        cols = rev_s.index[:5]  # up to 5 years, newest first
        rows = []
        for j, col in enumerate(cols):
            def _v(s): return float(s[col]) if s is not None and col in s.index and str(s[col]) != "nan" else None
            rev   = _v(rev_s)
            gross = _v(gp_s)
            ebit  = _v(ebd_s)
            ni    = _v(ni_s)
            eps   = _v(eps_s)
            fcf   = _v(fcf_s)
            op_cf = _v(ocf_s)
            capex = _v(cap_s)
            debt  = _v(debt_s)
            eq    = _v(eq_s)
            curr_a = _v(ca_s)
            curr_l = _v(cl_s)
            cash  = _v(cash_s)

            bvps = round(eq / shares, 2) if (eq and shares and shares > 0) else None
            cfps = round(op_cf / shares, 2) if (op_cf and shares and shares > 0) else None

            year_label = str(col.year) if hasattr(col, "year") else str(col)[:4]
            prior_rev = _v(rev_s) if j == 0 else None
            if j < len(cols) - 1:
                prior_rev = float(rev_s[cols[j + 1]]) if str(rev_s[cols[j + 1]]) != "nan" else None

            rows.append({
                "label":          year_label,
                "date":           _tag(str(col)[:10], "yfinance"),
                "revenue":        _tag(rev, "yfinance"),
                "revenue_yoy":    _tag(round((rev - prior_rev) / abs(prior_rev) * 100, 1) if (rev and prior_rev and prior_rev != 0) else None, "yfinance [CALCULATED]"),
                "gross_profit":   _tag(gross, "yfinance"),
                "gross_margin":   _tag(round(gross / rev * 100, 1) if (gross and rev) else None, "yfinance [CALCULATED]"),
                "ebitda":         _tag(ebit, "yfinance"),
                "ebitda_margin":  _tag(round(ebit / rev * 100, 1) if (ebit and rev) else None, "yfinance [CALCULATED]"),
                "op_income":      _tag(None, "yfinance"),
                "op_margin":      _tag(None, "yfinance"),
                "net_income":     _tag(ni, "yfinance"),
                "net_margin":     _tag(round(ni / rev * 100, 1) if (ni and rev) else None, "yfinance [CALCULATED]"),
                "eps_diluted":    _tag(eps, "yfinance"),
                "fcf":            _tag(fcf, "yfinance"),
                "operating_cf":   _tag(op_cf, "yfinance"),
                "capex":          _tag(capex, "yfinance"),
                "da":             _tag(None, "yfinance"),
                "total_debt":     _tag(debt, "yfinance"),
                "equity":         _tag(eq, "yfinance"),
                "cash":           _tag(cash, "yfinance"),
                "de_ratio":       _tag(round(debt / eq, 2) if (debt and eq and eq != 0) else None, "yfinance [CALCULATED]"),
                "current_ratio":  _tag(round(curr_a / curr_l, 2) if (curr_a and curr_l and curr_l != 0) else None, "yfinance [CALCULATED]"),
                "interest_coverage": _tag(None, "yfinance"),
                "bvps":           _tag(bvps, "yfinance [CALCULATED]"),
                "cfps":           _tag(cfps, "yfinance [CALCULATED]"),
            })
        # Drop rows with no revenue data (e.g. partial current year or company too new)
        rows = [r for r in rows if r.get("revenue", {}).get("value") is not None]
        return rows
    except Exception as exc:
        logger.warning("yfinance financial rows fallback failed for %s: %s", ticker, exc)
        return []


def build_historical_financials(data: dict) -> dict:
    """
    Section 4: Up to 10-year annual income statement + balance sheet + cash flow.
    Primary source: FMP. Fallback: yfinance (used when FMP is unavailable, e.g. 402 free-plan limit).
    Margins and ratios computed and tagged [CALCULATED].
    """
    income   = data.get("fmp_income") or []
    balance  = data.get("fmp_balance") or []
    cashflow = data.get("fmp_cashflow") or []

    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    fmp_shares_raw = yf_info.get("sharesOutstanding") or yf_info.get("impliedSharesOutstanding")
    fmp_shares = float(fmp_shares_raw) if fmp_shares_raw else None

    # Align all three by date — zip by index (FMP returns most-recent-first)
    n = min(len(income), len(balance), len(cashflow), 5)

    years = []
    for i in range(n):
        inc = income[i]
        bal = balance[i]
        cf  = cashflow[i]

        rev   = inc.get("revenue")
        gross = inc.get("grossProfit")
        ebit  = inc.get("ebitda")
        oi    = inc.get("operatingIncome")
        ni    = inc.get("netIncome")
        eps   = inc.get("epsDiluted") or inc.get("eps")

        total_debt   = bal.get("totalDebt")
        equity       = bal.get("totalStockholdersEquity") or bal.get("totalEquity")
        curr_assets  = bal.get("totalCurrentAssets")
        curr_liab    = bal.get("totalCurrentLiabilities")
        cash         = bal.get("cashAndCashEquivalents")
        interest_exp = inc.get("interestExpense")

        fcf      = cf.get("freeCashFlow")
        op_cf    = cf.get("netCashProvidedByOperatingActivities") or cf.get("operatingCashFlow")
        capex    = cf.get("investmentsInPropertyPlantAndEquipment") or cf.get("capitalExpenditure")
        da       = cf.get("depreciationAndAmortization")

        # EBITDA fallback: derive from OperatingIncome + D&A when FMP doesn't report it directly
        # (common for insurance, financial services, and some tech companies)
        ebit_source = "FMP"
        if ebit is None and oi is not None and da is not None:
            try:
                ebit = float(oi) + float(da)
                ebit_source = "FMP [CALCULATED: OpIncome + D&A]"
            except (TypeError, ValueError):
                pass

        # Computed ratios
        gross_margin  = _pct(gross, rev)
        ebitda_margin = _pct(ebit, rev)
        op_margin     = _pct(oi, rev)
        net_margin    = _pct(ni, rev)
        de_ratio      = round(float(total_debt) / float(equity), 2) if (total_debt and equity and equity != 0) else None
        current_ratio = round(float(curr_assets) / float(curr_liab), 2) if (curr_assets and curr_liab and curr_liab != 0) else None
        interest_cov  = round(float(oi) / abs(float(interest_exp)), 1) if (oi and interest_exp and float(interest_exp) != 0) else None

        year_label = str(inc.get("fiscalYear") or inc.get("date", "")[:4])

        # YoY revenue growth vs prior year (i+1 is prior)
        rev_yoy = None
        if i < len(income) - 1:
            prior_rev = income[i + 1].get("revenue")
            rev_yoy = _yoy(rev, prior_rev)

        bvps_fmp = round(float(equity) / fmp_shares, 2) if (equity and fmp_shares and fmp_shares > 0) else None
        cfps_fmp = round(float(op_cf) / fmp_shares, 2) if (op_cf and fmp_shares and fmp_shares > 0) else None

        years.append({
            "label":          year_label,
            "date":           _tag(inc.get("date"), "FMP"),
            "revenue":        _tag(rev, "FMP"),
            "revenue_yoy":    _tag(rev_yoy, "FMP [CALCULATED]"),
            "gross_profit":   _tag(gross, "FMP"),
            "gross_margin":   _tag(gross_margin, "FMP [CALCULATED]"),
            "ebitda":         _tag(ebit, ebit_source),
            "ebitda_margin":  _tag(ebitda_margin, f"{ebit_source} [CALCULATED]"),
            "op_income":      _tag(oi, "FMP"),
            "op_margin":      _tag(op_margin, "FMP [CALCULATED]"),
            "net_income":     _tag(ni, "FMP"),
            "net_margin":     _tag(net_margin, "FMP [CALCULATED]"),
            "eps_diluted":    _tag(eps, "FMP"),
            "fcf":            _tag(fcf, "FMP"),
            "operating_cf":   _tag(op_cf, "FMP"),
            "capex":          _tag(capex, "FMP"),
            "da":             _tag(da, "FMP"),
            "total_debt":     _tag(total_debt, "FMP"),
            "equity":         _tag(equity, "FMP"),
            "cash":           _tag(cash, "FMP"),
            "de_ratio":       _tag(de_ratio, "FMP [CALCULATED]"),
            "current_ratio":  _tag(current_ratio, "FMP [CALCULATED]"),
            "interest_coverage": _tag(interest_cov, "FMP [CALCULATED]"),
            "bvps":           _tag(bvps_fmp, "yfinance + FMP [CALCULATED]"),
            "cfps":           _tag(cfps_fmp, "yfinance + FMP [CALCULATED]"),
        })

    # Fallback to yfinance when FMP returned no data (e.g. 402 free-plan limit)
    if not years:
        years = _yf_financial_rows(data)
    else:
        # Gross margin fallback: FMP omits grossProfit for insurance/financial companies.
        # If any years are missing it, fetch yfinance income statement and fill the gaps.
        needs_gross = any(yr.get("gross_margin", {}).get("value") is None for yr in years)
        if needs_gross:
            yf_rows = _yf_financial_rows(data)
            yf_by_year = {str(r.get("label", ""))[:4]: r for r in yf_rows}
            for yr in years:
                if yr.get("gross_margin", {}).get("value") is None:
                    yf = yf_by_year.get(str(yr.get("label", ""))[:4], {})
                    gp_yf = yf.get("gross_profit", {}).get("value")
                    gm_yf = yf.get("gross_margin", {}).get("value")
                    if gm_yf is not None:
                        yr["gross_profit"] = _tag(gp_yf, "yfinance")
                        yr["gross_margin"] = _tag(gm_yf, "yfinance [CALCULATED]")

    ticker_sym = (data.get("_meta") or {}).get("ticker", "")
    div_history = _yf_dividend_history(ticker_sym) if ticker_sym else []
    is_dividend_paying = bool(div_history and any(d.get("dps", 0) > 0 for d in div_history))

    yr_count = len(years)
    if yr_count >= 5:
        coverage_note = None
    elif yr_count == 0:
        coverage_note = "No annual financial data available via free APIs."
    else:
        coverage_note = f"{yr_count} year{'s' if yr_count > 1 else ''} of data available — company may be recently listed or free-tier API coverage is limited."

    return {
        "section":            "historical_financials",
        "years":              years,
        "year_count":         yr_count,
        "currency":           _tag(income[0].get("reportedCurrency") if income else "USD", "FMP"),
        "dividend_history":   div_history,
        "is_dividend_paying": is_dividend_paying,
        "data_coverage_note": coverage_note,
    }


# ---------------------------------------------------------------------------
# Section 5: Forward Estimates & DCF
# ---------------------------------------------------------------------------

import statistics


def _safe_float(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def build_forward_dcf(data: dict) -> dict:
    """
    Section 5: Analyst estimates + WACC + DCF model + sensitivity table.
    All numeric inputs from APIs. Zero AI. All assumptions labelled and shown.
    Returns skip=True if insufficient estimates data.
    """
    yf_data  = data.get("yfinance") or {}
    yf_info  = yf_data.get("info") or {}
    income   = data.get("fmp_income") or []
    balance  = data.get("fmp_balance") or []
    cashflow = data.get("fmp_cashflow") or []
    fred     = data.get("fred_macro") or {}
    peers    = data.get("peer_metrics") or []
    fmp_dcf  = data.get("fmp_dcf") or {}

    ee = yf_data.get("earnings_estimate")
    re = yf_data.get("revenue_estimate")

    # --- 5a: Analyst Estimates ---
    # yfinance periods: "0y" = current FY, "+1y" = next FY
    eps_cur = eps_next = rev_cur = rev_next = None
    eps_growth_cur = eps_growth_next = rev_growth_cur = rev_growth_next = None

    if isinstance(ee, dict):
        avg = ee.get("avg", {})
        grw = ee.get("growth", {})
        eps_cur  = _safe_float(avg.get("0y"))
        eps_next = _safe_float(avg.get("+1y"))
        eps_growth_cur  = _safe_float(grw.get("0y"))
        eps_growth_next = _safe_float(grw.get("+1y"))

    if isinstance(re, dict):
        avg = re.get("avg", {})
        grw = re.get("growth", {})
        rev_cur  = _safe_float(avg.get("0y"))
        rev_next = _safe_float(avg.get("+1y"))
        rev_growth_cur  = _safe_float(grw.get("0y"))
        rev_growth_next = _safe_float(grw.get("+1y"))

    estimates_available = bool(eps_cur or rev_cur)
    if not estimates_available:
        return {
            "section": "forward_dcf",
            "skip": True,
            "reason": "Insufficient analyst estimate data — DCF not calculated",
        }

    # --- 5b: WACC Inputs ---
    rf       = _safe_float(fred.get("risk_free_rate")) or 4.5
    beta     = _safe_float(yf_info.get("beta")) or 1.0
    mrp      = 5.5  # Damodaran long-run US equity risk premium — hardcoded constant

    cost_eq  = rf + beta * mrp  # CAPM

    # Tax rate from FMP income statement
    tax_rate = None
    if income:
        pre_tax = _safe_float(income[0].get("incomeBeforeTax"))
        tax_exp = _safe_float(income[0].get("incomeTaxExpense"))
        if pre_tax and tax_exp and pre_tax > 0:
            tax_rate = tax_exp / pre_tax
    tax_rate = tax_rate or 0.21  # US statutory fallback

    # Debt/equity weights from balance sheet + market cap
    total_debt = _safe_float(balance[0].get("totalDebt")) if balance else None
    mktcap     = _safe_float(yf_info.get("market_cap"))
    equity_val = mktcap or 0
    debt_val   = total_debt or 0
    total_cap  = equity_val + debt_val
    w_equity   = equity_val / total_cap if total_cap > 0 else 0.95
    w_debt     = debt_val   / total_cap if total_cap > 0 else 0.05

    # Cost of debt: if interest expense is 0 (AAPL nets income/expense), use Rf + 1% spread
    int_exp = _safe_float(income[0].get("interestExpense")) if income else None
    if int_exp and debt_val and debt_val > 0 and int_exp > 0:
        cost_debt = int_exp / debt_val
        cost_debt_note = "FMP [interest expense / total debt]"
    else:
        cost_debt = rf + 1.0  # AA-grade proxy
        cost_debt_note = f"FRED + 1% AA credit spread proxy [FMP interest expense = 0]"

    wacc = w_equity * cost_eq + w_debt * cost_debt * (1 - tax_rate)

    wacc_inputs = {
        "risk_free_rate":    _tag(round(rf, 2), "FRED DGS10"),
        "beta":              _tag(round(beta, 3), "yfinance"),
        "mrp":               _tag(mrp, "Damodaran (hardcoded — US LT ERP)"),
        "cost_of_equity":    _tag(round(cost_eq, 2), "CAPM [CALCULATED]"),
        "cost_of_debt":      _tag(round(cost_debt, 2), cost_debt_note),
        "tax_rate":          _tag(round(tax_rate * 100, 1), "FMP [CALCULATED]"),
        "weight_equity":     _tag(round(w_equity * 100, 1), "yfinance/FMP [CALCULATED]"),
        "weight_debt":       _tag(round(w_debt * 100, 1), "FMP [CALCULATED]"),
        "wacc":              _tag(round(wacc, 2), "CAPM [CALCULATED]"),
    }

    # --- 5c: DCF Revenue Projections ---
    terminal_growth = (rf / 2) if rf else 2.0  # FRED 10Y / 2 — labelled assumption
    latest_rev = _safe_float(income[0].get("revenue")) if income else None

    # Year 3 = extrapolate from analyst growth trajectory
    rev_y3 = None
    if rev_next and rev_growth_next is not None:
        mid_growth = (rev_growth_next + terminal_growth / 100) / 2
        rev_y3 = rev_next * (1 + mid_growth)
    elif rev_next:
        rev_y3 = rev_next * (1 + terminal_growth / 100)

    revenue_projections = [
        {"year": "FY Current",  "value": _tag(rev_cur, "yfinance analyst consensus"),
         "growth": _tag(round(rev_growth_cur * 100, 1) if rev_growth_cur else None, "yfinance [CALCULATED]")},
        {"year": "FY +1",       "value": _tag(rev_next, "yfinance analyst consensus"),
         "growth": _tag(round(rev_growth_next * 100, 1) if rev_growth_next else None, "yfinance [CALCULATED]")},
        {"year": "FY +2 (est)", "value": _tag(round(rev_y3) if rev_y3 else None, "yfinance extrapolated [CALCULATED]"),
         "growth": _tag(None, "N/A — extrapolated only")},
    ]

    # --- 5c: FCF Margin (3yr avg from historical) ---
    fcf_margins = []
    for i in range(min(3, len(income), len(cashflow))):
        rev_i = _safe_float(income[i].get("revenue"))
        fcf_i = _safe_float(cashflow[i].get("freeCashFlow"))
        if rev_i and fcf_i and rev_i > 0:
            fcf_margins.append(fcf_i / rev_i)
    avg_fcf_margin = statistics.mean(fcf_margins) if fcf_margins else None

    # Projected FCFs
    proj_fcfs = []
    for item in revenue_projections:
        rev_v = item["value"]["value"]
        if rev_v and avg_fcf_margin:
            proj_fcfs.append(rev_v * avg_fcf_margin)
        else:
            proj_fcfs.append(None)

    # --- 5c: Terminal Value (EV/EBITDA multiple method) ---
    ev_ebitda_vals = [_safe_float(p.get("ev_ebitda")) for p in peers if p.get("ev_ebitda")]
    # Exclude extreme outliers and subject company's own multiple
    ev_ebitda_vals = [v for v in ev_ebitda_vals if v and 5 < v < 100]
    terminal_multiple = statistics.median(ev_ebitda_vals) if len(ev_ebitda_vals) >= 2 else None

    ebitda_margins_hist = []
    for i in range(min(3, len(income))):
        rev_i  = _safe_float(income[i].get("revenue"))
        ebit_i = _safe_float(income[i].get("ebitda"))
        if rev_i and ebit_i and rev_i > 0:
            ebitda_margins_hist.append(ebit_i / rev_i)
    avg_ebitda_margin = statistics.mean(ebitda_margins_hist) if ebitda_margins_hist else None

    # --- 5c: DCF Calculation ---
    wacc_dec = wacc / 100
    tg_dec   = terminal_growth / 100
    shares   = _safe_float(yf_info.get("shares_outstanding"))
    cash_bs  = _safe_float(balance[0].get("cashAndCashEquivalents")) if balance else None
    debt_bs  = _safe_float(balance[0].get("totalDebt")) if balance else None
    net_debt = (debt_bs or 0) - (cash_bs or 0)

    implied_price = None
    tv_multiple   = None
    pv_fcfs_total = None
    pv_terminal   = None
    enterprise_val = None

    if all(v is not None for v in [proj_fcfs[0], proj_fcfs[1], wacc_dec]) and wacc_dec > tg_dec:
        # PV of explicit period FCFs
        pv_fcfs = []
        for i, fcf in enumerate(proj_fcfs[:3]):
            if fcf is not None:
                pv_fcfs.append(fcf / ((1 + wacc_dec) ** (i + 1)))
        pv_fcfs_total = sum(pv_fcfs)

        # Terminal value
        if terminal_multiple and avg_ebitda_margin and rev_y3:
            ebitda_terminal = rev_y3 * avg_ebitda_margin
            tv_multiple     = ebitda_terminal * terminal_multiple
            pv_terminal     = tv_multiple / ((1 + wacc_dec) ** 3)
        elif proj_fcfs[2] is not None:
            # Gordon Growth fallback
            tv_gordon = proj_fcfs[2] * (1 + tg_dec) / (wacc_dec - tg_dec)
            pv_terminal = tv_gordon / ((1 + wacc_dec) ** 3)

        if pv_terminal:
            enterprise_val = pv_fcfs_total + pv_terminal
            equity_val_dcf = enterprise_val - net_debt
            if shares and equity_val_dcf > 0:
                implied_price = equity_val_dcf / shares

    # --- Sensitivity table: WACC x5 rows, Terminal Multiple x5 cols ---
    sens_table = None
    if terminal_multiple and avg_ebitda_margin and rev_y3 and shares and avg_fcf_margin:
        wacc_steps = [wacc - 2, wacc - 1, wacc, wacc + 1, wacc + 2]
        mult_steps = [
            round(terminal_multiple - 4),
            round(terminal_multiple - 2),
            round(terminal_multiple),
            round(terminal_multiple + 2),
            round(terminal_multiple + 4),
        ]
        sens_rows = []
        for w in wacc_steps:
            wd = w / 100
            row_prices = []
            for m in mult_steps:
                pv_f = sum(
                    (rv * avg_fcf_margin) / ((1 + wd) ** (i + 1))
                    for i, rv in enumerate([rev_cur or 0, rev_next or 0, rev_y3 or 0])
                    if rv
                )
                ebitda_t = rev_y3 * avg_ebitda_margin
                tv       = ebitda_t * m / ((1 + wd) ** 3)
                eq       = pv_f + tv - net_debt
                p        = round(eq / shares) if shares and eq > 0 else None
                row_prices.append(p)
            sens_rows.append({"wacc_pct": round(w, 1), "prices": row_prices})
        sens_table = {
            "wacc_steps":  [round(w, 1) for w in wacc_steps],
            "mult_steps":  mult_steps,
            "rows":        sens_rows,
            "source":      "FMP/yfinance [CALCULATED]",
        }

    return {
        "section":            "forward_dcf",
        "skip":               False,
        "analyst_estimates": {
            "eps_current_fy":  _tag(eps_cur, "yfinance"),
            "eps_next_fy":     _tag(eps_next, "yfinance"),
            "eps_growth_cur":  _tag(round(eps_growth_cur * 100, 1) if eps_growth_cur else None, "yfinance"),
            "eps_growth_next": _tag(round(eps_growth_next * 100, 1) if eps_growth_next else None, "yfinance"),
            "rev_current_fy":  _tag(rev_cur, "yfinance"),
            "rev_next_fy":     _tag(rev_next, "yfinance"),
            "rev_growth_cur":  _tag(round(rev_growth_cur * 100, 1) if rev_growth_cur else None, "yfinance"),
            "rev_growth_next": _tag(round(rev_growth_next * 100, 1) if rev_growth_next else None, "yfinance"),
        },
        "wacc_inputs":        wacc_inputs,
        "revenue_projections": revenue_projections,
        "fcf_margin_avg":     _tag(round(avg_fcf_margin * 100, 1) if avg_fcf_margin else None, "FMP [CALCULATED] 3yr avg"),
        "terminal_growth":    _tag(round(terminal_growth, 2), "FRED DGS10 / 2 [CALCULATED]"),
        "terminal_multiple":  _tag(round(terminal_multiple, 1) if terminal_multiple else None, "yfinance peers median EV/EBITDA [CALCULATED]"),
        "peer_ev_ebitda_used": _tag(ev_ebitda_vals, "yfinance"),
        "pv_fcfs":            _tag(round(pv_fcfs_total / 1e9) if pv_fcfs_total else None, "FMP/yfinance [CALCULATED]"),
        "pv_terminal":        _tag(round(pv_terminal / 1e9) if pv_terminal else None, "yfinance peers [CALCULATED]"),
        "enterprise_value":   _tag(round(enterprise_val / 1e9) if enterprise_val else None, "FMP/yfinance [CALCULATED]"),
        "net_debt":           _tag(round(net_debt / 1e9) if net_debt else None, "FMP [CALCULATED]"),
        "implied_price":      _tag(round(implied_price) if implied_price else None, "FMP/yfinance [CALCULATED]"),
        "current_price":      _tag(_safe_float(yf_info.get("current_price")), "yfinance"),
        "upside_pct":         _tag(
            round((implied_price - float(yf_info["current_price"])) / float(yf_info["current_price"]) * 100, 1)
            if implied_price and yf_info.get("current_price") else None,
            "FMP/yfinance [CALCULATED]"
        ),
        "sensitivity_table":  sens_table,
        "fmp_dcf_crosscheck": {
            "implied_price": _tag(_safe_float(fmp_dcf.get("dcf")), "FMP free tier DCF"),
            "date":          _tag(fmp_dcf.get("date"), "FMP"),
            "note":          "FMP proprietary model — shown as cross-check only, not used in our calculation",
        },
    }


# ---------------------------------------------------------------------------
# Section 4b: Revenue Growth Drivers (structured raw data — AI synthesis separate)
# ---------------------------------------------------------------------------

def build_revenue_growth_drivers(data: dict) -> dict:
    """
    Package raw Tavily + news search results for the AI synthesis layer.
    No AI at this stage — deterministic packaging only.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker

    earnings_results = data.get("tavily_growth_drivers") or []
    analyst_results  = data.get("tavily_analyst_growth") or []

    # Pull recent Finnhub headlines (news feed) as supplementary signal
    news_headlines = [
        {"headline": a.get("headline", ""), "summary": (a.get("summary") or "")[:200]}
        for a in (data.get("finnhub_news") or [])[:15]
    ]

    # FMP earnings guidance — pull latest annual revenue and growth for context
    income = data.get("fmp_income") or []
    latest  = income[0] if income else {}
    prior   = income[1] if len(income) > 1 else {}
    rev     = _safe_float(latest.get("revenue"))
    rev_pr  = _safe_float(prior.get("revenue"))
    rev_yoy = round((rev / rev_pr - 1) * 100, 1) if (rev and rev_pr and rev_pr > 0) else None

    return {
        "section":       "revenue_growth_drivers",
        "ticker":        ticker,
        "company_name":  company_name,
        "recent_revenue_growth_pct": _tag(rev_yoy, "FMP/yfinance [CALCULATED]"),
        "earnings_search_results": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "excerpt": (r.get("content") or "")[:500]}
            for r in earnings_results[:5]
        ],
        "analyst_search_results": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "excerpt": (r.get("content") or "")[:500]}
            for r in analyst_results[:5]
        ],
        "news_headlines": news_headlines,
        "drivers": None,  # populated by AI synthesis layer
    }
