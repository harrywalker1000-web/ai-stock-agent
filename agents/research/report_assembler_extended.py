"""
report_assembler_extended.py — Sections 6-11 (valuation through risk register).
Imports helpers from report_assembler. Zero AI in any section.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from agents.research.report_assembler import (
    _tag,
    _na,
    _conflict,
    _maybe_conflict,
    _coverage_badge,
    _pct,
    _yoy,
    _safe_float,
)
from utils.logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Section 6: Valuation Metrics
# ---------------------------------------------------------------------------

def _build_valuation_history(data: dict) -> dict:
    """
    Compute 5Y historical P/E, P/B, EV/EBITDA ranges from monthly price history.
    Uses year-end monthly closes + yfinance income/balance statement data.
    Returns: annual_series (list, oldest-first), pe_range, pb_range, ev_ebitda_range.
    """
    try:
        import yfinance as yf

        ticker = (data.get("_meta") or {}).get("ticker", "")
        if not ticker:
            return {}

        ph = data.get("price_history_5y")
        if ph is None or (hasattr(ph, "empty") and ph.empty):
            return {}

        yf_info = (data.get("yfinance") or {}).get("info") or {}
        shares = float(yf_info.get("sharesOutstanding") or yf_info.get("impliedSharesOutstanding") or 0)
        if shares == 0:
            return {}

        t = yf.Ticker(ticker)
        is_ = t.income_stmt
        bs_ = t.balance_sheet

        def _get(df, *names):
            for name in names:
                if df is not None and not df.empty and name in df.index:
                    return df.loc[name]
            return None

        eps_s  = _get(is_, "Diluted EPS")
        eq_s   = _get(bs_, "Stockholders Equity", "Common Stock Equity")
        ebit_s = _get(is_, "EBITDA")
        debt_s = _get(bs_, "Total Debt")
        cash_s = _get(bs_, "Cash And Cash Equivalents",
                       "Cash Cash Equivalents And Short Term Investments")

        if eps_s is None:
            return {}

        annual = []
        for col in eps_s.index[:5]:
            year = col.year if hasattr(col, "year") else int(str(col)[:4])

            def _v(s, c=col):
                if s is None or c not in s.index:
                    return None
                v = s[c]
                return float(v) if str(v) != "nan" else None

            eps  = _v(eps_s)
            eq   = _v(eq_s)
            ebit = _v(ebit_s)
            debt = _v(debt_s)
            cash = _v(cash_s)

            ph_year = ph[ph.index.year == year]
            if ph_year.empty:
                continue
            price = float(ph_year["Close"].iloc[-1])

            bvps = eq / shares if (eq and shares) else None
            pe   = round(price / eps, 1) if (eps and eps > 0 and abs(eps) > 0.01) else None
            pb   = round(price / bvps, 2) if (bvps and bvps > 0) else None
            ev   = price * shares + (debt or 0) - (cash or 0)
            ev_ebitda = round(ev / ebit, 1) if (ebit and ebit > 0) else None

            annual.append({"year": str(year), "price": round(price, 2),
                           "pe": pe, "pb": pb, "ev_ebitda": ev_ebitda})

        if not annual:
            return {}

        def _summary(key):
            vals = [m[key] for m in annual if m.get(key) is not None]
            if len(vals) < 2:
                return None
            lo, hi = min(vals), max(vals)
            avg = round(sum(vals) / len(vals), 1)
            cur = annual[0].get(key)
            pct = round((cur - lo) / (hi - lo) * 100) if (cur is not None and hi > lo) else None
            return {"min": lo, "max": hi, "avg": avg, "current": cur, "percentile": pct}

        return {
            "annual_series":  list(reversed(annual)),
            "pe_range":       _summary("pe"),
            "pb_range":       _summary("pb"),
            "ev_ebitda_range": _summary("ev_ebitda"),
            "source":         "yfinance [CALCULATED]",
        }
    except Exception as exc:
        logger.warning("valuation history build failed: %s", exc)
        return {}

def build_valuation_metrics(data: dict, mandate: dict) -> dict:
    """
    Section 6: Valuation multiples, yield, and peer comparison table.
    All values from APIs or [CALCULATED]. Zero AI.
    """
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    fmp_km   = (data.get("fmp_key_metrics") or [{}])[0]
    cashflow = data.get("fmp_cashflow") or []
    tech     = data.get("technicals") or {}
    peers    = data.get("peer_metrics") or []

    # Core multiples from yfinance
    pe_ttm    = _safe_float(yf_info.get("pe_ttm"))
    pe_fwd    = _safe_float(yf_info.get("forward_pe"))
    pb        = _safe_float(yf_info.get("price_to_book"))
    ps        = _safe_float(yf_info.get("price_to_sales_ttm"))
    ev_ebitda = _safe_float(yf_info.get("ev_ebitda"))
    div_yield = _safe_float(yf_info.get("dividend_yield"))
    beta      = _safe_float(yf_info.get("beta"))

    # Cross-check P/B from FMP key metrics
    pb_fmp    = _safe_float(fmp_km.get("priceToBookRatio"))
    pb_tagged = _maybe_conflict(pb, "yfinance", pb_fmp, "FMP key_metrics", threshold_pct=10.0)

    # ROIC, ROE from FMP key metrics
    roic = _safe_float(fmp_km.get("roic"))
    roe  = _safe_float(fmp_km.get("roe"))

    # FCF yield = freeCashFlow / market_cap
    mktcap    = _safe_float(yf_info.get("market_cap"))
    fcf_val   = _safe_float(cashflow[0].get("freeCashFlow")) if cashflow else None
    fcf_yield = None
    if fcf_val is not None and mktcap and mktcap > 0:
        fcf_yield = round(fcf_val / mktcap * 100, 2)

    # 52w positioning from technicals / yfinance info
    pct_from_52w_high = _safe_float(tech.get("pct_from_52w_high"))
    high_52w = _safe_float(yf_info.get("52w_high"))
    low_52w  = _safe_float(yf_info.get("52w_low"))

    # Peer comparison table
    peer_table = []
    for p in peers:
        peer_table.append({
            "symbol":         _tag(p.get("symbol"), "yfinance/FMP"),
            "company_name":   _tag(p.get("company_name"), "FMP"),
            "pe":             _tag(_safe_float(p.get("pe")), "yfinance/FMP"),
            "pe_fwd":         _tag(_safe_float(p.get("pe_fwd")), "yfinance/FMP"),
            "ev_ebitda":      _tag(_safe_float(p.get("ev_ebitda")), "yfinance/FMP"),
            "ps":             _tag(_safe_float(p.get("ps")), "yfinance/FMP"),
            "pb":             _tag(_safe_float(p.get("pb")), "yfinance/FMP"),
            "ebitda_margin":  _tag(_safe_float(p.get("ebitda_margin")), "FMP [CALCULATED]"),
            "net_margin":     _tag(_safe_float(p.get("net_margin")), "FMP [CALCULATED]"),
            "revenue_growth": _tag(_safe_float(p.get("revenue_growth")), "FMP [CALCULATED]"),
            "debt_to_equity": _tag(_safe_float(p.get("debt_to_equity")), "FMP [CALCULATED]"),
            "market_cap":     _tag(_safe_float(p.get("market_cap")), "yfinance/FMP"),
        })

    val_history = _build_valuation_history(data)

    return {
        "section":           "valuation_metrics",
        "pe_ttm":            _tag(pe_ttm, "yfinance"),
        "pe_fwd":            _tag(pe_fwd, "yfinance"),
        "price_to_book":     pb_tagged,
        "price_to_sales":    _tag(ps, "yfinance"),
        "ev_ebitda":         _tag(ev_ebitda, "yfinance"),
        "dividend_yield":    _tag(round(div_yield * 100, 2) if div_yield else None, "yfinance"),
        "beta":              _tag(beta, "yfinance"),
        "fcf_yield":         _tag(fcf_yield, "FMP/yfinance [CALCULATED]"),
        "roic":              _tag(round(roic * 100, 2) if roic else None, "FMP key_metrics"),
        "roe":               _tag(round(roe * 100, 2) if roe else None, "FMP key_metrics"),
        "52w_high":          _tag(high_52w, "yfinance"),
        "52w_low":           _tag(low_52w, "yfinance"),
        "pct_from_52w_high": _tag(pct_from_52w_high, "yfinance [CALCULATED]"),
        "setup_type":        _tag(mandate.get("setup_type", "Unclassified"), "mandate_checker [CALCULATED]"),
        "peer_table":        peer_table,
        "val_history":       val_history,
    }


# ---------------------------------------------------------------------------
# Section 7: Technicals
# ---------------------------------------------------------------------------

def build_technicals(data: dict) -> dict:
    """
    Section 7: Technical indicators. All sourced from data['technicals'].
    Quant score computed deterministically. Zero AI.
    """
    tech = data.get("technicals") or {}
    yf   = (data.get("yfinance") or {}).get("info") or {}
    src  = "yfinance [CALCULATED]"

    rsi           = _safe_float(tech.get("rsi"))
    macd_line     = _safe_float(tech.get("macd_line"))
    macd_signal   = _safe_float(tech.get("macd_signal"))
    macd_hist     = _safe_float(tech.get("macd_hist"))
    sma50         = _safe_float(tech.get("sma50"))
    sma200        = _safe_float(tech.get("sma200"))
    bb_upper      = _safe_float(tech.get("bb_upper"))
    bb_lower      = _safe_float(tech.get("bb_lower"))
    bb_mid        = _safe_float(tech.get("bb_mid"))
    atr_pct       = _safe_float(tech.get("atr_pct"))
    support       = _safe_float(tech.get("support"))
    resistance    = _safe_float(tech.get("resistance"))
    trend_signal  = tech.get("trend_signal")
    pct_from_52w  = _safe_float(tech.get("pct_from_52w_high"))
    vol_vs_20d    = _safe_float(tech.get("volume_vs_20d_avg"))
    current_price = _safe_float(yf.get("current_price") or tech.get("current_price"))

    # --- Quant score (0-75 max from defined signals) ---
    score = 0
    score_detail = {}

    if rsi is not None and 30 <= rsi <= 70:
        score += 10
        score_detail["rsi_neutral"] = "+10 (RSI 30-70)"
    else:
        score_detail["rsi_neutral"] = "0 (RSI outside 30-70)"

    if current_price is not None and sma50 is not None and current_price > sma50:
        score += 15
        score_detail["above_sma50"] = "+15 (price > SMA50)"
    else:
        score_detail["above_sma50"] = "0 (price <= SMA50 or unavailable)"

    if current_price is not None and sma200 is not None and current_price > sma200:
        score += 15
        score_detail["above_sma200"] = "+15 (price > SMA200)"
    else:
        score_detail["above_sma200"] = "0 (price <= SMA200 or unavailable)"

    if macd_line is not None and macd_signal is not None and macd_line > macd_signal:
        score += 15
        score_detail["macd_bullish"] = "+15 (MACD line > signal)"
    else:
        score_detail["macd_bullish"] = "0 (MACD bearish or unavailable)"

    if current_price is not None and bb_upper is not None and current_price < bb_upper:
        score += 10
        score_detail["bb_not_overbought"] = "+10 (price < BB upper)"
    else:
        score_detail["bb_not_overbought"] = "0 (price >= BB upper or unavailable)"

    if pct_from_52w is not None and pct_from_52w > -20:
        score += 10
        score_detail["near_52w_high"] = "+10 (pct_from_52w_high > -20%)"
    else:
        score_detail["near_52w_high"] = "0 (pct_from_52w_high <= -20% or unavailable)"

    return {
        "section":           "technicals",
        "rsi":               _tag(rsi, src),
        "macd_line":         _tag(macd_line, src),
        "macd_signal":       _tag(macd_signal, src),
        "macd_hist":         _tag(macd_hist, src),
        "sma50":             _tag(sma50, src),
        "sma200":            _tag(sma200, src),
        "bb_upper":          _tag(bb_upper, src),
        "bb_lower":          _tag(bb_lower, src),
        "bb_mid":            _tag(bb_mid, src),
        "atr_pct":           _tag(atr_pct, src),
        "support":           _tag(support, src),
        "resistance":        _tag(resistance, src),
        "trend_signal":      _tag(trend_signal, src),
        "pct_from_52w_high": _tag(pct_from_52w, src),
        "volume_vs_20d_avg": _tag(vol_vs_20d, src),
        "current_price":     _tag(current_price, "yfinance"),
        "quant_score":       _tag(score, "yfinance [CALCULATED]"),
        "quant_score_detail": score_detail,
    }


# ---------------------------------------------------------------------------
# Section 8: Competitive Moat (structured only — AI added in pipeline)
# ---------------------------------------------------------------------------

def build_competitive_moat(data: dict) -> dict:
    """Section 8 structured data. Haiku synthesis injected by pipeline."""
    fmp      = data.get("fmp_profile") or {}
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    peers    = data.get("peer_metrics") or []
    tavily_c = data.get("tavily_competitive") or []
    news     = data.get("finnhub_news") or []

    tavily_excerpts = [
        {
            "title":   r.get("title", ""),
            "url":     r.get("url", ""),
            "excerpt": (r.get("content") or "")[:300],
        }
        for r in tavily_c[:3]
        if r.get("url")
    ]

    return {
        "section":          "competitive_moat",
        "sector":           _tag(yf_info.get("sector") or fmp.get("sector"), "yfinance/FMP"),
        "industry":         _tag(yf_info.get("industry") or fmp.get("industry"), "yfinance/FMP"),
        "peer_count":       _tag(len(peers), "yfinance/FMP [CALCULATED]"),
        "tavily_excerpts":  tavily_excerpts,
        "recent_headlines": [a.get("headline", "") for a in news[:8] if a.get("headline")],
        "ai_narrative":     None,
    }


# ---------------------------------------------------------------------------
# Section 9: Industry & Macro (structured only — AI added in pipeline)
# ---------------------------------------------------------------------------

def build_industry_macro(data: dict) -> dict:
    """Section 9 structured data. Haiku synthesis injected by pipeline."""
    fred     = data.get("fred_macro") or {}
    fmp      = data.get("fmp_profile") or {}
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    tavily_i = data.get("tavily_industry") or []

    tavily_excerpts = [
        {
            "title":   r.get("title", ""),
            "url":     r.get("url", ""),
            "excerpt": (r.get("content") or "")[:300],
        }
        for r in tavily_i[:3]
        if r.get("url")
    ]

    return {
        "section":         "industry_macro",
        "sector":          _tag(yf_info.get("sector") or fmp.get("sector"), "yfinance/FMP"),
        "industry":        _tag(yf_info.get("industry") or fmp.get("industry"), "yfinance/FMP"),
        "risk_free_rate":  _tag(_safe_float(fred.get("risk_free_rate")), "FRED DGS10"),
        "fed_funds_rate":  _tag(_safe_float(fred.get("fed_funds_rate")), "FRED FEDFUNDS"),
        "gdp_growth":      _tag(_safe_float(fred.get("gdp_growth")), "FRED GDP"),
        "unemployment":    _tag(_safe_float(fred.get("unemployment")), "FRED UNRATE"),
        "tavily_excerpts": tavily_excerpts,
        "ai_narrative":    None,
    }


# ---------------------------------------------------------------------------
# Section 10: Institutional Activity
# ---------------------------------------------------------------------------

def build_institutional_activity(data: dict) -> dict:
    """Section 10: Institutional holdings, insider trades, analyst ratings. Zero AI."""
    yf        = data.get("yfinance") or {}
    yf_info   = yf.get("info") or {}
    major_h   = yf.get("major_holders") or []
    inst_h    = yf.get("institutional_holders") or []
    form4     = data.get("sec_form4") or []
    ratings   = data.get("finnhub_ratings") or []
    apt       = yf.get("analyst_price_targets") or {}

    # yfinance major_holders is a list: [insider%, inst%, float%, count]
    inst_pct    = None
    insider_pct = None
    if isinstance(major_h, list) and len(major_h) >= 2:
        raw_insider = _safe_float((major_h[0] or {}).get("Value"))
        raw_inst    = _safe_float((major_h[1] or {}).get("Value"))
        insider_pct = round(raw_insider * 100, 1) if raw_insider and raw_insider <= 1 else raw_insider
        inst_pct    = round(raw_inst * 100, 1)    if raw_inst    and raw_inst    <= 1 else raw_inst
    elif isinstance(major_h, dict):
        inst_pct    = _safe_float(major_h.get("institutional_pct") or major_h.get("% Held by Institutions"))
        insider_pct = _safe_float(major_h.get("insider_pct") or major_h.get("% Held by Insiders"))

    top_holders = []
    for h in inst_h[:5]:
        top_holders.append({
            "holder":        _tag(h.get("Holder") or h.get("holder"), "yfinance"),
            "shares":        _tag(h.get("Shares") or h.get("shares"), "yfinance"),
            "pct_held":      _tag(_safe_float(h.get("% Out") or h.get("pct_out")), "yfinance"),
            "value":         _tag(h.get("Value") or h.get("value"), "yfinance"),
            "date_reported": _tag(
                str(h.get("Date Reported") or h.get("date_reported") or "")[:10] or None,
                "yfinance"
            ),
        })

    def _parse_form4_name(title: str) -> str | None:
        """Extract insider name from SEC Form 4 RSS title: '4 - JOHN DOE (0001234567)'"""
        if not title:
            return None
        m = re.search(r"4\s*-\s*(.+?)(?:\s*\(|\s*$)", title, re.IGNORECASE)
        if m:
            return m.group(1).strip().title()
        return title.strip() or None

    insider_trades = []
    for f in form4[:8]:
        # SEC RSS feed returns title/date/url; FMP returns reportingName/transactionType/etc.
        title = f.get("title", "")
        parsed_name = _parse_form4_name(title) if title else None
        insider_trades.append({
            "date":             _tag(f.get("date") or f.get("filingDate"), "SEC EDGAR"),
            "name":             _tag(f.get("reportingName") or f.get("name") or parsed_name, "SEC EDGAR"),
            "transaction_type": _tag(f.get("transactionType") or f.get("transaction_type"), "SEC EDGAR"),
            "shares":           _tag(_safe_float(f.get("securitiesTransacted") or f.get("shares")), "SEC EDGAR"),
            "price":            _tag(_safe_float(f.get("price")), "SEC EDGAR"),
            "filing_url":       f.get("url"),
        })

    buy_cnt = hold_cnt = sell_cnt = 0
    for r in ratings:
        buy_cnt  += int(r.get("buy", 0) or 0) + int(r.get("strongBuy", 0) or 0)
        hold_cnt += int(r.get("hold", 0) or 0)
        sell_cnt += int(r.get("sell", 0) or 0) + int(r.get("strongSell", 0) or 0)

    total_ratings = buy_cnt + hold_cnt + sell_cnt
    consensus_str = (
        "Buy"  if buy_cnt  > hold_cnt and buy_cnt  > sell_cnt
        else "Sell" if sell_cnt > hold_cnt and sell_cnt > buy_cnt
        else "Hold" if total_ratings > 0
        else None
    )

    pt_mean    = _safe_float(apt.get("mean") or yf_info.get("target_mean_price"))
    pt_high    = _safe_float(apt.get("high") or yf_info.get("target_high_price"))
    pt_low     = _safe_float(apt.get("low") or yf_info.get("target_low_price"))
    n_analysts = apt.get("numberOfAnalysts") or yf_info.get("num_analyst_opinions")

    return {
        "section":           "institutional_activity",
        "institutional_pct": _tag(inst_pct, "yfinance"),
        "insider_pct":       _tag(insider_pct, "yfinance"),
        "top_holders":    top_holders,
        "insider_trades": insider_trades,
        "analyst_ratings": {
            "buy_count":     _tag(buy_cnt, "Finnhub"),
            "hold_count":    _tag(hold_cnt, "Finnhub"),
            "sell_count":    _tag(sell_cnt, "Finnhub"),
            "consensus":     _tag(consensus_str, "Finnhub [CALCULATED]"),
            "total_ratings": _tag(total_ratings, "Finnhub"),
        },
        "analyst_price_targets": {
            "mean":         _tag(pt_mean, "yfinance"),
            "high":         _tag(pt_high, "yfinance"),
            "low":          _tag(pt_low, "yfinance"),
            "num_analysts": _tag(n_analysts, "yfinance"),
        },
    }


# ---------------------------------------------------------------------------
# Section 11: Risk Register (structured only — AI added in pipeline)
# ---------------------------------------------------------------------------

def build_risk_register(data: dict) -> dict:
    """Section 11 structured context. Haiku risk register injected by pipeline."""
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    tech     = data.get("technicals") or {}
    fred     = data.get("fred_macro") or {}
    balance  = data.get("fmp_balance") or []

    curr_assets   = _safe_float(balance[0].get("totalCurrentAssets")) if balance else None
    curr_liab     = _safe_float(balance[0].get("totalCurrentLiabilities")) if balance else None
    current_ratio = round(curr_assets / curr_liab, 2) if curr_assets and curr_liab and curr_liab > 0 else None

    news_hls = [a.get("headline", "") for a in (data.get("finnhub_news") or [])[:10]]

    return {
        "section": "risk_register",
        "financials_snapshot": {
            "pe_ttm":         _tag(_safe_float(yf_info.get("pe_ttm")), "yfinance"),
            "ev_ebitda":      _tag(_safe_float(yf_info.get("ev_ebitda")), "yfinance"),
            "debt_to_equity": _tag(_safe_float(yf_info.get("debt_to_equity")), "yfinance"),
            "current_ratio":  _tag(current_ratio, "FMP [CALCULATED]"),
            "beta":           _tag(_safe_float(yf_info.get("beta")), "yfinance"),
        },
        "technicals_snapshot": {
            "rsi":               _tag(_safe_float(tech.get("rsi")), "yfinance [CALCULATED]"),
            "trend":             _tag(tech.get("trend_signal"), "yfinance [CALCULATED]"),
            "pct_from_52w_high": _tag(_safe_float(tech.get("pct_from_52w_high")), "yfinance [CALCULATED]"),
        },
        "macro_snapshot": {
            "risk_free_rate": _tag(_safe_float(fred.get("risk_free_rate")), "FRED DGS10"),
            "fed_funds_rate": _tag(_safe_float(fred.get("fed_funds_rate")), "FRED FEDFUNDS"),
            "gdp_growth":     _tag(_safe_float(fred.get("gdp_growth")), "FRED GDP"),
        },
        "recent_headlines": news_hls[:10],
        "ai_risk_register": None,
    }
