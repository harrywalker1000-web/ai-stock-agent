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

    Key-name contract with compute_technicals():
      sma_50, sma_200 (underscores), macd nested dict, bb_position_pct (not bb_mid)
    """
    tech = data.get("technicals") or {}
    yf   = (data.get("yfinance") or {}).get("info") or {}
    src  = "yfinance [CALCULATED]"

    rsi           = _safe_float(tech.get("rsi"))
    # MACD is stored as a nested dict by compute_technicals()
    _macd         = tech.get("macd") or {}
    macd_line     = _safe_float(_macd.get("macd"))
    macd_signal   = _safe_float(_macd.get("signal"))
    macd_hist     = _safe_float(_macd.get("histogram"))
    macd_bullish  = bool(_macd.get("bullish")) if _macd else None
    # SMA keys use underscores in compute_technicals()
    sma_50        = _safe_float(tech.get("sma_50"))
    sma_200       = _safe_float(tech.get("sma_200"))
    pct_sma50     = _safe_float(tech.get("pct_from_sma50"))
    pct_sma200    = _safe_float(tech.get("pct_from_sma200"))
    bb_upper      = _safe_float(tech.get("bb_upper"))
    bb_lower      = _safe_float(tech.get("bb_lower"))
    bb_position   = _safe_float(tech.get("bb_position_pct"))  # 0-100
    atr_pct       = _safe_float(tech.get("atr_pct"))
    support       = _safe_float(tech.get("support"))
    resistance    = _safe_float(tech.get("resistance"))
    trend_signal  = tech.get("trend_signal")
    pct_from_52w  = _safe_float(tech.get("pct_from_52w_high"))
    vol_vs_20d    = _safe_float(tech.get("volume_vs_20d_avg"))
    current_price = _safe_float(yf.get("current_price") or tech.get("current_price"))

    # --- Quant score: entry quality 0-100 ---
    # Measures how favourable the technical setup is for entering NOW.
    # Trend direction (up/down) is separate; score reflects entry risk.
    score = 0
    score_detail = {}

    # RSI — sweet spot 40-65: full points; 30-70: partial; overbought >80 or oversold <30: 0
    if rsi is not None:
        if 40 <= rsi <= 65:
            score += 15
            score_detail["rsi"] = f"+15 RSI {rsi:.0f} — ideal entry zone (40-65)"
        elif 30 <= rsi < 40:
            score += 8
            score_detail["rsi"] = f"+8 RSI {rsi:.0f} — mildly oversold, bounce risk"
        elif 65 < rsi <= 75:
            score += 8
            score_detail["rsi"] = f"+8 RSI {rsi:.0f} — mildly overbought, elevated but acceptable"
        else:
            score += 0
            score_detail["rsi"] = f"0 RSI {rsi:.0f} — {'extreme overbought (>75), pullback risk' if rsi > 75 else 'extreme oversold (<30)'}"
    else:
        score_detail["rsi"] = "0 RSI unavailable"

    # Price vs SMA50 — trend health
    if current_price is not None and sma_50 is not None:
        if current_price > sma_50:
            score += 15
            score_detail["above_sma50"] = f"+15 Price (${current_price:.2f}) > SMA50 (${sma_50:.2f}) — medium-term uptrend intact"
        else:
            score += 0
            score_detail["above_sma50"] = f"0 Price (${current_price:.2f}) < SMA50 (${sma_50:.2f}) — below medium-term trend"
    else:
        score_detail["above_sma50"] = "0 SMA50 unavailable"

    # Price vs SMA200 — long-term trend
    if current_price is not None and sma_200 is not None:
        if current_price > sma_200:
            score += 15
            score_detail["above_sma200"] = f"+15 Price > SMA200 (${sma_200:.2f}) — in long-term uptrend"
        else:
            score += 0
            score_detail["above_sma200"] = f"0 Price < SMA200 (${sma_200:.2f}) — below long-term trend"
    else:
        score_detail["above_sma200"] = "0 SMA200 unavailable (< 200 days of data)"

    # MACD — momentum direction
    if macd_line is not None and macd_signal is not None:
        if macd_line > macd_signal:
            score += 15
            score_detail["macd"] = f"+15 MACD ({macd_line:.4f}) > Signal ({macd_signal:.4f}) — bullish momentum"
        else:
            score += 0
            score_detail["macd"] = f"0 MACD ({macd_line:.4f}) < Signal ({macd_signal:.4f}) — bearish momentum"
    else:
        score_detail["macd"] = "0 MACD unavailable"

    # Bollinger Band position — not at extremes
    if current_price is not None and bb_upper is not None and bb_lower is not None:
        band_range = bb_upper - bb_lower
        if band_range > 0:
            bb_pct = (current_price - bb_lower) / band_range * 100
            if bb_pct < 80:
                score += 10
                score_detail["bollinger"] = f"+10 BB position {bb_pct:.0f}% — not at upper band extreme"
            else:
                score += 0
                score_detail["bollinger"] = f"0 BB position {bb_pct:.0f}% — near/above upper band (overbought)"
        else:
            score_detail["bollinger"] = "0 BB band width zero"
    else:
        score_detail["bollinger"] = "0 Bollinger Bands unavailable"

    # Proximity to 52w high — momentum without extreme extension
    if pct_from_52w is not None:
        if -15 < pct_from_52w <= 0:
            score += 10
            score_detail["52w_proximity"] = f"+10 {pct_from_52w:.1f}% from 52w high — near highs, strong momentum"
        elif pct_from_52w <= -15:
            score += 5
            score_detail["52w_proximity"] = f"+5 {pct_from_52w:.1f}% from 52w high — some runway but trend may be weak"
        else:
            score += 3
            score_detail["52w_proximity"] = f"+3 At/above 52w high — breakout territory, continuation risk"
    else:
        score_detail["52w_proximity"] = "0 52w high unavailable"

    # Volume confirmation
    if vol_vs_20d is not None:
        if vol_vs_20d >= 1.2:
            score += 10
            score_detail["volume"] = f"+10 Volume {vol_vs_20d:.1f}x 20d avg — strong institutional participation"
        elif vol_vs_20d >= 0.8:
            score += 5
            score_detail["volume"] = f"+5 Volume {vol_vs_20d:.1f}x 20d avg — normal activity"
        else:
            score += 0
            score_detail["volume"] = f"0 Volume {vol_vs_20d:.1f}x 20d avg — weak, low conviction move"
    else:
        score_detail["volume"] = "0 Volume data unavailable"

    # Cap at 100
    score = min(score, 100)

    # Trend context label (separate from entry score)
    trend_context = None
    if trend_signal:
        if score >= 60:
            trend_context = f"{trend_signal} — good entry setup"
        elif score >= 40:
            trend_context = f"{trend_signal} — proceed with caution"
        else:
            trend_context = f"{trend_signal} — poor entry timing despite trend"

    return {
        "section":           "technicals",
        "rsi":               _tag(rsi, src),
        "macd_line":         _tag(macd_line, src),
        "macd_signal":       _tag(macd_signal, src),
        "macd_hist":         _tag(macd_hist, src),
        "sma_50":            _tag(sma_50, src),
        "sma_200":           _tag(sma_200, src),
        "pct_from_sma50":    _tag(pct_sma50, src),
        "pct_from_sma200":   _tag(pct_sma200, src),
        "bb_upper":          _tag(bb_upper, src),
        "bb_lower":          _tag(bb_lower, src),
        "bb_position":       _tag(bb_position, src),
        "atr_pct":           _tag(atr_pct, src),
        "support":           _tag(support, src),
        "resistance":        _tag(resistance, src),
        "trend_signal":      _tag(trend_signal, src),
        "pct_from_52w_high": _tag(pct_from_52w, src),
        "volume_vs_20d_avg": _tag(vol_vs_20d, src),
        "current_price":     _tag(current_price, "yfinance"),
        "quant_score":       _tag(score, "yfinance [CALCULATED]"),
        "quant_score_detail": score_detail,
        "trend_context":     trend_context,
    }


# ---------------------------------------------------------------------------
# Section 8: Competitive Moat (structured only — AI added in pipeline)
# ---------------------------------------------------------------------------

def _moat_score_roic(roic_decimal: float | None) -> int:
    """ROIC as decimal (e.g. 0.15 = 15%). Returns 0-20. Non-multiple-of-5 by design."""
    if roic_decimal is None:
        return 8
    r = roic_decimal * 100
    return min(20, max(0, round(r * 1.1)))


def _moat_score_gm(gm_decimal: float | None) -> int:
    """Gross margin as decimal (e.g. 0.60 = 60%). Returns 0-20."""
    if gm_decimal is None:
        return 8
    g = gm_decimal * 100
    return min(20, max(0, round(g * 0.32)))


def _moat_score_cagr(cagr_pct: float | None) -> int:
    """Revenue CAGR in percent (not decimal). Returns 0-20."""
    if cagr_pct is None:
        return 8
    return min(20, max(0, round(cagr_pct * 1.1) + 3))


def _moat_score_ebitda(ebitda_decimal: float | None) -> int:
    """EBITDA margin as decimal (e.g. 0.30 = 30%). Returns 0-20."""
    if ebitda_decimal is None:
        return 8
    e = ebitda_decimal * 100
    return min(20, max(0, round(e * 0.53) + 2))


def build_competitive_moat(data: dict) -> dict:
    """Section 8 structured data. Haiku synthesis injected by pipeline."""
    fmp      = data.get("fmp_profile") or {}
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    peers    = data.get("peer_metrics") or []
    tavily_c = data.get("tavily_competitive") or []
    news     = data.get("finnhub_news") or []
    fmp_km   = (data.get("fmp_key_metrics") or [{}])[0]
    inc      = data.get("fmp_income") or []

    tavily_excerpts = [
        {
            "title":   r.get("title", ""),
            "url":     r.get("url", ""),
            "excerpt": (r.get("content") or "")[:300],
        }
        for r in tavily_c[:3]
        if r.get("url")
    ]

    # ── Quantitative moat dimensions ────────────────────────────────────────
    roic_raw    = _safe_float(fmp_km.get("roic"))
    gm_raw      = _safe_float(yf_info.get("gross_margins"))
    ebitda_raw  = _safe_float(yf_info.get("ebitda_margins"))

    # Revenue CAGR 3yr from FMP income statement (annual, newest-first)
    rev_cagr_pct = None
    if len(inc) >= 4:
        try:
            r0 = float(inc[0].get("revenue") or 0)
            r3 = float(inc[3].get("revenue") or 0)
            if r3 > 0 and r0 > 0:
                rev_cagr_pct = round(((r0 / r3) ** (1 / 3) - 1) * 100, 2)
        except (TypeError, ValueError, ZeroDivisionError):
            pass

    dim1 = _moat_score_roic(roic_raw)
    dim2 = _moat_score_gm(gm_raw)
    dim3 = _moat_score_cagr(rev_cagr_pct)
    dim4 = _moat_score_ebitda(ebitda_raw)

    moat_quant = {
        "returns_on_capital": {
            "score": dim1,
            "label": "Returns on Capital",
            "value": f"{round(roic_raw * 100, 1)}%" if roic_raw is not None else None,
            "source": "FMP key_metrics [CALCULATED]",
        },
        "pricing_power": {
            "score": dim2,
            "label": "Pricing Power",
            "value": f"{round(gm_raw * 100, 1)}% GM" if gm_raw is not None else None,
            "source": "yfinance [CALCULATED]",
        },
        "revenue_quality": {
            "score": dim3,
            "label": "Revenue Quality",
            "value": f"{rev_cagr_pct:+.1f}% CAGR" if rev_cagr_pct is not None else None,
            "source": "FMP [CALCULATED]",
        },
        "operating_efficiency": {
            "score": dim4,
            "label": "Operating Efficiency",
            "value": f"{round(ebitda_raw * 100, 1)}% EBITDA Mgn" if ebitda_raw is not None else None,
            "source": "yfinance [CALCULATED]",
        },
    }

    return {
        "section":          "competitive_moat",
        "sector":           _tag(yf_info.get("sector") or fmp.get("sector"), "yfinance/FMP"),
        "industry":         _tag(yf_info.get("industry") or fmp.get("industry"), "yfinance/FMP"),
        "peer_count":       _tag(len(peers), "yfinance/FMP [CALCULATED]"),
        "tavily_excerpts":  tavily_excerpts,
        "recent_headlines": [a.get("headline", "") for a in news[:8] if a.get("headline")],
        "moat_quant":       moat_quant,
        # AI fields — filled by pipeline:
        "ai_narrative":     None,
        "moat_score_total": None,
        "moat_score_label": None,
        "moat_dim5_score":  None,
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


# ---------------------------------------------------------------------------
# Section 10b: Management & Governance (structured layer — AI synthesis separate)
# ---------------------------------------------------------------------------

def build_management_governance(data: dict) -> dict:
    """
    Package FMP executives, FMP profile (CEO), Tavily management search results.
    Zero AI at this layer — deterministic packaging only.
    """
    fmp          = data.get("fmp_profile") or {}
    yf_info      = (data.get("yfinance") or {}).get("info") or {}
    executives   = data.get("fmp_executives") or []
    mgmt_results = data.get("tavily_management") or []

    ceo_name = fmp.get("ceo") or yf_info.get("companyOfficers", [{}])[0].get("name", "") if not fmp.get("ceo") else fmp.get("ceo")

    # Clean pay figures — FMP returns annual comp in $
    def _clean_exec(e: dict) -> dict:
        pay = e.get("pay")
        return {
            "name":   e.get("name", ""),
            "title":  e.get("title", ""),
            "pay":    _tag(int(pay) if pay else None, "FMP"),
        }

    # Employees and company basics for context
    employees = fmp.get("employees") or yf_info.get("fullTimeEmployees")

    return {
        "section":        "management_governance",
        "ceo_name":       _tag(ceo_name or None, "FMP"),
        "company_name":   fmp.get("company_name") or yf_info.get("company_name"),
        "employees":      _tag(employees, "FMP/yfinance"),
        "ipo_date":       _tag(fmp.get("ipo_date"), "FMP"),
        "executives":     [_clean_exec(e) for e in executives[:10]],   # FMP, up to 10
        "mgmt_search_results": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "excerpt": (r.get("content") or "")[:600]}
            for r in mgmt_results[:5]
        ],
        # Populated by AI synthesis:
        "ai_ceo_profile":      None,
        "ai_board_assessment": None,
    }


# ---------------------------------------------------------------------------
# Section H: ESG & Sustainability
# ---------------------------------------------------------------------------

def build_esg_section(data: dict) -> dict:
    """
    Package Sustainalytics ESG scores (via yfinance) + Tavily ESG search results.
    Sustainalytics risk scores: lower = better (risk exposure metric).
    Zero AI at this layer — AI narrative added by synthesize_esg_initiatives.
    """
    sus    = data.get("yfinance_sustainability") or {}
    tavily = data.get("tavily_esg") or []

    def _sus_float(key: str):
        v = sus.get(key)
        try:
            return round(float(v), 1) if v is not None else None
        except (TypeError, ValueError):
            return None

    total_esg   = _sus_float("totalEsg")
    env_score   = _sus_float("environmentScore")
    social_score = _sus_float("socialScore")
    gov_score   = _sus_float("governanceScore")
    controversy = sus.get("highestControversy")
    performance = sus.get("esgPerformance")    # e.g. "AVG_PERFORMER"
    rating_year = sus.get("ratingYear")
    rating_month = sus.get("ratingMonth")

    rating_period = None
    if rating_year and rating_month:
        try:
            rating_period = f"{int(rating_year)}-{int(rating_month):02d}"
        except (TypeError, ValueError):
            pass

    controversy_int = None
    if controversy is not None:
        try:
            controversy_int = int(float(controversy))
        except (TypeError, ValueError):
            pass

    return {
        "section":               "esg",
        "total_esg_score":       _tag(total_esg, "yfinance (Sustainalytics)"),
        "environment_score":     _tag(env_score, "yfinance (Sustainalytics)"),
        "social_score":          _tag(social_score, "yfinance (Sustainalytics)"),
        "governance_score":      _tag(gov_score, "yfinance (Sustainalytics)"),
        "highest_controversy":   _tag(controversy_int, "yfinance (Sustainalytics)"),
        "esg_performance":       _tag(performance, "yfinance (Sustainalytics)"),
        "rating_period":         _tag(rating_period, "yfinance (Sustainalytics)"),
        "esg_search_results": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "excerpt": (r.get("content") or "")[:600]}
            for r in tavily[:5]
        ],
        # Populated by AI synthesis:
        "ai_msci_rating":        None,
        "ai_initiatives":        None,
        "ai_narrative":          None,
        "ai_source":             None,
        "ai_status":             None,
    }


# ---------------------------------------------------------------------------
# Section J: M&A Track Record
# ---------------------------------------------------------------------------

_MA_ITEM_CODES = {"1.01", "2.01"}   # SEC 8-K item codes indicating M&A events
_MA_KEYWORDS   = {"acqui", "merger", "divest", "takeover", "buyout", "spinoff",
                  "spin-off", "joint venture", "strategic partner", "m&a"}


def _is_ma_8k(filing: dict) -> bool:
    """Return True if the 8-K filing items include a material M&A item code."""
    items_str = filing.get("items") or ""
    codes = {c.strip() for c in items_str.split(",")}
    return bool(codes & _MA_ITEM_CODES)


def _is_ma_news(headline: str) -> bool:
    hl = headline.lower()
    return any(kw in hl for kw in _MA_KEYWORDS)


def build_ma_track_record(data: dict) -> dict:
    """
    Package SEC 8-K M&A filings, Finnhub M&A news, and Tavily M&A search results.
    Zero AI at this layer — Haiku synthesis extracts structured events separately.
    """
    sec_8k     = data.get("sec_8k") or []
    finnhub    = data.get("finnhub_news") or []
    tavily     = data.get("tavily_ma") or []
    fmp        = data.get("fmp_profile") or {}
    yf_info    = (data.get("yfinance") or {}).get("info") or {}
    company_name = fmp.get("company_name") or yf_info.get("company_name") or ""

    # Filter 8-K filings that include M&A item codes
    ma_8k_filings = [f for f in sec_8k if _is_ma_8k(f)]

    # Filter Finnhub news for M&A headlines (last 30 days)
    ma_news = [
        {"headline": n.get("headline", ""), "date": n.get("datetime", ""), "url": n.get("url", "")}
        for n in finnhub
        if _is_ma_news(n.get("headline", ""))
    ][:8]

    return {
        "section":        "ma_track_record",
        "company_name":   company_name,
        "ma_8k_filings":  [
            {"date": f["date"], "items": f.get("items", ""), "url": f["url"]}
            for f in ma_8k_filings[:5]
        ],
        "ma_news_headlines": ma_news,
        "ma_search_results": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "excerpt": (r.get("content") or "")[:700]}
            for r in tavily[:5]
        ],
        # Populated by AI synthesis:
        "ai_events":     None,
        "ai_narrative":  None,
        "ai_source":     None,
        "ai_status":     None,
    }


# ---------------------------------------------------------------------------
# Section B: Porter's Five Forces
# ---------------------------------------------------------------------------

def build_porter_five_forces(data: dict) -> dict:
    """
    Package quantitative anchors + search excerpts for Haiku to score all 5 forces.
    Capex intensity and peer count give quant grounding for two of the five forces.
    Zero AI at this layer.
    """
    fmp      = data.get("fmp_profile") or {}
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    peers    = data.get("peer_metrics") or []
    cashflow = data.get("fmp_cashflow") or []
    income   = data.get("fmp_income") or []
    tavily_i = data.get("tavily_industry") or []
    tavily_c = data.get("tavily_competitive") or []

    # Capex intensity = abs(capex) / revenue — proxy for barrier to entry
    capex_intensity_pct = None
    if cashflow and income:
        capex = _safe_float(cashflow[0].get("capitalExpenditure"))
        rev   = _safe_float(income[0].get("revenue"))
        if capex is not None and rev and rev > 0:
            capex_intensity_pct = round(abs(capex) / rev * 100, 1)

    gm_pct = None
    gm_raw = _safe_float(yf_info.get("gross_margins"))
    if gm_raw is not None:
        gm_pct = round(gm_raw * 100, 1)

    def _excerpts(results: list, n: int = 3) -> list:
        return [
            {"title": r.get("title", ""), "excerpt": (r.get("content") or "")[:400]}
            for r in results[:n]
            if r.get("title") or r.get("content")
        ]

    return {
        "section":              "porter_five_forces",
        "company_name":         fmp.get("company_name") or yf_info.get("company_name"),
        "sector":               _tag(yf_info.get("sector") or fmp.get("sector"), "yfinance/FMP"),
        "industry":             _tag(yf_info.get("industry") or fmp.get("industry"), "yfinance/FMP"),
        "peer_count":           _tag(len(peers), "yfinance/FMP [CALCULATED]"),
        "capex_intensity_pct":  _tag(capex_intensity_pct, "FMP [CALCULATED]"),
        "gross_margin_pct":     _tag(gm_pct, "yfinance [CALCULATED]"),
        "industry_excerpts":    _excerpts(tavily_i, 3),
        "competitive_excerpts": _excerpts(tavily_c, 3),
        # Populated by AI synthesis:
        "ai_forces":            None,
        "ai_source":            None,
        "ai_status":            None,
    }


# ---------------------------------------------------------------------------
# Section C: SOTP Valuation
# ---------------------------------------------------------------------------

def build_sotp_valuation(data: dict) -> dict:
    """
    Package segment revenues (FMP), peer multiples (yfinance), and balance sheet
    data for Haiku to assign segment-level multiples.
    Python (not AI) does all arithmetic: value = revenue × multiple.
    Zero AI at this layer.
    """
    fmp          = data.get("fmp_profile") or {}
    yf_info      = (data.get("yfinance") or {}).get("info") or {}
    income       = data.get("fmp_income") or []
    balance      = data.get("fmp_balance") or []
    key_metrics  = data.get("fmp_key_metrics") or []
    peers        = data.get("peer_metrics") or []
    segments_raw = data.get("fmp_revenue_segments") or []
    tavily_growth = data.get("tavily_growth_drivers") or []
    tavily_analyst = data.get("tavily_analyst_growth") or []
    company_name = fmp.get("company_name") or yf_info.get("company_name") or ""

    # Total revenue (most recent FMP annual, for segment % calculation)
    total_revenue = _safe_float((income[0] if income else {}).get("revenue")) if income else None

    # Net debt from balance sheet: totalDebt - cashAndCashEquivalents
    net_debt = None
    if balance:
        b = balance[0]
        total_debt = _safe_float(b.get("totalDebt"))
        cash = _safe_float(b.get("cashAndCashEquivalents") or b.get("cashAndShortTermInvestments"))
        if total_debt is not None and cash is not None:
            net_debt = total_debt - cash

    # Shares outstanding (yfinance preferred; FMP market_cap / price as fallback)
    shares = _safe_float(yf_info.get("shares_outstanding"))
    current_price = _safe_float(yf_info.get("current_price"))
    market_cap    = _safe_float(yf_info.get("market_cap") or fmp.get("market_cap"))

    # Peer multiples for context (median EV/Revenue and EV/EBITDA)
    ev_rev_list    = [p.get("ps") for p in peers if p.get("ps") is not None]
    ev_ebitda_list = [p.get("ev_ebitda") for p in peers if p.get("ev_ebitda") is not None]

    def _median(lst):
        if not lst:
            return None
        s = sorted(lst)
        n = len(s)
        return round(s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2, 2)

    peer_median_ev_rev    = _median(ev_rev_list)
    peer_median_ev_ebitda = _median(ev_ebitda_list)

    # Subject company own multiples
    subj_ev_ebitda = _safe_float(yf_info.get("ev_ebitda"))
    subj_ps        = _safe_float(yf_info.get("ps"))

    # Annotate segments with % of total
    segments = []
    for seg in segments_raw:
        rev = _safe_float(seg.get("revenue"))
        pct = round(rev / total_revenue * 100, 1) if rev and total_revenue else None
        segments.append({
            "name":    seg.get("name", ""),
            "revenue": _tag(rev, "FMP"),
            "pct_of_total": _tag(pct, "FMP [CALCULATED]") if pct is not None else _na(),
            "date":    seg.get("date", ""),
        })

    # Earnings call / analyst excerpts (already fetched — reuse)
    excerpts = [
        {"title": r.get("title", ""), "text": (r.get("content") or "")[:500]}
        for r in (tavily_growth[:3] + tavily_analyst[:2])
        if r.get("title") or r.get("content")
    ]

    return {
        "section":                "sotp_valuation",
        "company_name":           company_name,
        "total_revenue":          _tag(total_revenue, "FMP"),
        "net_debt":               _tag(net_debt, "FMP [CALCULATED]"),
        "shares_outstanding":     _tag(shares, "yfinance"),
        "current_price":          _tag(current_price, "yfinance"),
        "market_cap":             _tag(market_cap, "yfinance/FMP"),
        "subj_ev_ebitda":         _tag(subj_ev_ebitda, "yfinance"),
        "subj_ev_rev":            _tag(subj_ps, "yfinance"),
        "peer_median_ev_rev":     _tag(peer_median_ev_rev, "yfinance [CALCULATED]"),
        "peer_median_ev_ebitda":  _tag(peer_median_ev_ebitda, "yfinance [CALCULATED]"),
        "peer_count":             _tag(len(peers), "yfinance [CALCULATED]"),
        "segments":               segments,
        "earnings_excerpts":      excerpts,
        # AI populated by pipeline_synthesis.py (multiples only — no values):
        "ai_sotp":   None,
        "ai_source": None,
        "ai_status": None,
    }
