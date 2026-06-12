"""
synthesis_investment_committee.py — Sonnet 4.6 Investment Committee recommendation.
Conviction scoring is deterministic (sub-component model). AI writes narrative only.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from agents.research.synthesis_agents import _sonnet, _get_client, _strip_code_fences
from utils.logger import get_logger

logger = get_logger(__name__)


def _extract_json_object(raw: str) -> dict:
    """
    Robustly extract the first complete JSON object from raw text.
    Handles code fences, trailing garbage strings, and partial responses.
    """
    text = _strip_code_fences(raw)
    # First try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Bracket-count scan to find the first complete { ... }
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")
    depth = 0
    in_string = False
    escaped = False
    for i, ch in enumerate(text[start:], start):
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_string:
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    raise ValueError("Incomplete JSON object in response")


def synthesize_investment_committee(data: dict, all_sections: dict) -> dict:
    """
    Sonnet 4.6 Investment Committee recommendation.
    Receives a structured summary of all sections — no raw API data.
    Conviction is computed here via sub-component scoring, NOT left to the model.

    Returns:
        {
            direction: BUY|HOLD|SELL|AVOID,
            conviction: int 1-10,
            expected_return_12m: str,
            position_size_pct: float,
            stop_loss_pct: float,
            three_arguments: [str, str, str],
            key_risks: [str, str, str],
            committee_narrative: str (3 paragraphs),
        }
    """
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    tech     = data.get("technicals") or {}
    cashflow = data.get("fmp_cashflow") or []
    income   = data.get("fmp_income") or []

    def _v(field):
        """Extract value from tagged field or return raw value."""
        if isinstance(field, dict):
            return field.get("value")
        return field

    # --- Conviction scoring (deterministic, 9-component weighted model — no AI) ---
    # Components and max scores: FCF(18) + RevGrowth(16) + RSI(10) + Trend(12)
    #                            + Analyst(10) + PWReturn(16) + PE(9) + DE(6) + ROIC(3) = 100

    def _clamp(v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))

    # 1. FCF Quality (max 18): rewards strong free-cash-flow margin, penalises cash burn
    fcf_val = None
    fcf_margin_pct = None
    if cashflow:
        fcf_val = float(cashflow[0].get("freeCashFlow") or 0)
    if income and fcf_val is not None:
        rev0 = float(income[0].get("revenue") or 0)
        if rev0 > 0:
            fcf_margin_pct = fcf_val / rev0 * 100.0
    score_fcf = 9.0 + _clamp((fcf_margin_pct or 0.0) * 0.6, -9.0, 9.0)

    # 2. Revenue Growth (max 16): continuous — 0% growth = 8, +26%+ growth = 16, shrinking = 0
    rev_growth = None
    if len(income) >= 2:
        r0 = float(income[0].get("revenue") or 0)
        r1 = float(income[1].get("revenue") or 0)
        if r1 > 0:
            rev_growth = (r0 - r1) / r1 * 100.0
    score_rev = 8.0 + _clamp((rev_growth or 0.0) * 0.3, -8.0, 8.0)

    # 3. RSI Timing (max 10): penalises extreme overbought/oversold; sweet spot near 55
    rsi = float(tech.get("rsi") or 55.0)
    score_rsi = max(0.0, 10.0 - abs(rsi - 55.0) * 0.18)

    # 4. Technical Trend (max 12): base from trend signal + distance from 52w high modifier
    trend = (tech.get("trend_signal") or "").lower()
    trend_base = {"bullish": 10.0, "neutral": 6.0, "bearish": 2.0}.get(trend, 5.0)
    pct_52w = float(tech.get("pct_from_52w_high") or 0.0)
    score_trend = trend_base + _clamp(pct_52w * 0.04, -2.0, 2.0)

    # 5. Analyst Consensus (max 10): weighted buy/hold/sell counts; fallback to consensus text
    s10 = all_sections.get("s10") or {}
    ar  = s10.get("analyst_ratings") or {}
    consensus_raw = ar.get("consensus")
    consensus = (consensus_raw.get("value", "") if isinstance(consensus_raw, dict) else consensus_raw or "")

    def _int_v(field):
        val = _v(field)
        try:
            return int(float(val)) if val is not None else 0
        except (TypeError, ValueError):
            return 0

    buy_cnt  = _int_v(ar.get("buy_count"))
    hold_cnt = _int_v(ar.get("hold_count"))
    sell_cnt = _int_v(ar.get("sell_count"))
    total_cnt = buy_cnt + hold_cnt + sell_cnt
    if total_cnt > 0:
        score_analyst = (buy_cnt * 1.0 + hold_cnt * 0.5) / total_cnt * 10.0
    else:
        _cmap = {
            "strong buy": 9.0, "buy": 7.5, "outperform": 7.0,
            "hold": 5.0, "neutral": 5.0, "market perform": 5.0,
            "underperform": 3.0, "sell": 2.0, "strong sell": 1.0,
        }
        score_analyst = _cmap.get((consensus or "").lower(), 5.0)

    # 6. Probability-Weighted Return (max 16): rewards high expected return vs downside
    s12 = all_sections.get("s12") or {}
    pw_return_raw = _v(s12.get("probability_weighted_return"))
    try:
        pw_return = float(pw_return_raw) if pw_return_raw is not None else 0.0
    except (TypeError, ValueError):
        pw_return = 0.0
    score_pw = 8.0 + _clamp(pw_return * 0.25, -8.0, 8.0)

    # 7. Valuation P/E (max 9): full score at P/E 10, declines linearly, neutral if no data
    pe_ttm = float(yf_info.get("pe_ttm") or 0.0)
    if pe_ttm and pe_ttm > 0:
        score_pe = max(0.0, min(9.0, 9.0 - (pe_ttm - 10.0) * 0.1))
    else:
        score_pe = 5.0

    # 8. Balance Sheet D/E (max 6): full score at 0 leverage, zero at D/E >= 4
    de = float(yf_info.get("debt_to_equity") or 0.0)
    score_de = max(0.0, 6.0 - de * 1.5)

    # 9. ROIC / ROE proxy (max 3): rewards capital efficiency
    roic_raw = float(yf_info.get("returnOnEquity") or yf_info.get("return_on_equity") or 0.0)
    roic_pct = roic_raw * 100.0 if abs(roic_raw) < 5.0 else roic_raw  # normalise decimal→pct
    score_roic = max(0.0, min(3.0, roic_pct * 0.12))

    # Aggregate
    raw_score = (score_fcf + score_rev + score_rsi + score_trend + score_analyst
                 + score_pw + score_pe + score_de + score_roic)
    conviction = int(round(raw_score))
    conviction = max(1, min(100, conviction))

    # Nudge away from multiples of 5 (deterministic: fractional part of raw score sets direction)
    if conviction % 5 == 0:
        frac_part = raw_score % 1.0
        nudge = 1 if frac_part < 0.5 else -1
        conviction = max(1, min(100, conviction + nudge))
        if conviction % 5 == 0:  # safety net for exact-integer boundary cases
            conviction = max(1, conviction - 1)

    conviction_breakdown = {
        "fcf_quality":          {"score": round(score_fcf, 2),     "max": 18, "input": f"FCF margin {round(fcf_margin_pct, 1) if fcf_margin_pct is not None else 'N/A'}%"},
        "revenue_growth":       {"score": round(score_rev, 2),     "max": 16, "input": f"YoY rev growth {round(rev_growth, 1) if rev_growth is not None else 'N/A'}%"},
        "rsi_timing":           {"score": round(score_rsi, 2),     "max": 10, "input": f"RSI {round(rsi, 1)}"},
        "technical_trend":      {"score": round(score_trend, 2),   "max": 12, "input": f"{trend or 'unknown'}, {round(pct_52w, 1)}% from 52w high"},
        "analyst_consensus":    {"score": round(score_analyst, 2), "max": 10, "input": f"{buy_cnt}B/{hold_cnt}H/{sell_cnt}S" if total_cnt > 0 else (consensus or "no data")},
        "prob_weighted_return": {"score": round(score_pw, 2),      "max": 16, "input": f"PW return {round(pw_return, 1)}%"},
        "valuation_pe":         {"score": round(score_pe, 2),      "max": 9,  "input": f"P/E {round(pe_ttm, 1)}" if pe_ttm else "no P/E data"},
        "balance_sheet_de":     {"score": round(score_de, 2),      "max": 6,  "input": f"D/E {round(de, 2)}"},
        "roic_roe_proxy":       {"score": round(score_roic, 2),    "max": 3,  "input": f"ROE {round(roic_pct, 1)}%"},
        "raw_total":            round(raw_score, 3),
        "final_conviction":     conviction,
    }

    # --- Summary context for Sonnet ---
    s1  = all_sections.get("s1")  or {}
    s6  = all_sections.get("s6")  or {}
    s7  = all_sections.get("s7")  or {}
    s14 = all_sections.get("s14") or {}
    s15 = all_sections.get("s15") or {}

    ticker = (data.get("_meta") or {}).get("ticker", "")

    current_price = _v(s1.get("current_price"))
    market_cap    = _v(s1.get("market_cap"))
    setup_type    = _v(s1.get("setup_type"))
    pe_val        = _v(s6.get("pe_ttm"))
    ev_ebitda     = _v(s6.get("ev_ebitda"))
    fcf_yield     = _v(s6.get("fcf_yield"))
    quant_score   = _v(s7.get("quant_score"))
    bear_pt       = _v((s12.get("bear") or {}).get("price_target"))
    base_pt       = _v((s12.get("base") or {}).get("price_target"))
    bull_pt       = _v((s12.get("bull") or {}).get("price_target"))
    overall_score = _v(s15.get("overall_score"))
    pt_mean       = _v(s14.get("analyst_pt_mean"))
    our_dcf       = _v(s14.get("our_dcf_implied"))

    structured_summary = {
        "ticker":                    ticker,
        "conviction_score_computed": conviction,
        "conviction_breakdown":      conviction_breakdown,
        "current_price":             current_price,
        "market_cap":                market_cap,
        "setup_type":                setup_type,
        "valuation": {
            "pe_ttm":    pe_val,
            "ev_ebitda": ev_ebitda,
            "fcf_yield": fcf_yield,
        },
        "technicals": {
            "quant_score":       quant_score,
            "trend_signal":      tech.get("trend_signal"),
            "rsi":               tech.get("rsi"),
            "pct_from_52w_high": tech.get("pct_from_52w_high"),
        },
        "scenarios": {
            "bear": bear_pt,
            "base": base_pt,
            "bull": bull_pt,
            "probability_weighted_return": pw_return,
        },
        "analyst_consensus":     consensus,
        "analyst_pt_mean":       pt_mean,
        "our_dcf_implied":       our_dcf,
        "setup_checklist_score": overall_score,
        "revenue_growth_pct":    round(rev_growth, 1) if rev_growth is not None else None,
        "fcf_margin_pct":        round(fcf_margin_pct, 1) if fcf_margin_pct is not None else None,
    }

    prompt = f"""You are the Investment Committee chair at Haz Capital evaluating {ticker}.

Here is our structured analysis summary, including the deterministic sub-component conviction breakdown:

{json.dumps(structured_summary, indent=2)}

The conviction score has been computed as {conviction}/100 by our 9-component weighted model (see conviction_breakdown above).
You MUST use exactly {conviction} as the conviction value — do not change it.

When writing the committee_narrative, reference specific sub-component scores from conviction_breakdown to explain WHY this conviction was awarded — e.g. "FCF quality scored {conviction_breakdown['fcf_quality']['score']}/18 on a {conviction_breakdown['fcf_quality']['input']} margin." This grounds the narrative in the data.

Provide the Investment Committee recommendation as a JSON object with EXACTLY these keys:
- "direction": one of BUY, HOLD, SELL, AVOID
- "conviction": {conviction}  (use exactly this number — it is on a 0-100 scale)
- "expected_return_12m": a string like "+18%" or "-5%" — base this on the scenario analysis above
- "position_size_pct": a float (e.g. 3.0) — higher conviction = larger size, max 5.0%, min 0.5%
- "stop_loss_pct": a float (e.g. 12.0) — distance from current price to stop loss in percent
- "three_arguments": a list of exactly 3 strings — concise investment thesis arguments supported by the sub-component data
- "key_risks": a list of exactly 3 strings — top 3 risks that could invalidate the thesis
- "committee_narrative": a SINGLE string containing exactly 3 paragraphs separated by \\n\\n

CRITICAL for committee_narrative: all three paragraphs MUST be inside ONE string value. Do NOT add extra JSON keys or bare strings after the JSON object closes.

Rules:
- Do NOT fabricate any numbers not present in the data above (including conviction_breakdown inputs).
- Do NOT invent percentages, market share, growth rates, or financial metrics.
- Narratives may reference numbers from the structured summary and conviction_breakdown — those are the only sources.
- Be direct. Do not hedge every sentence.
- If data is insufficient, say the recommendation is constrained by data availability.
- Return ONLY the JSON object — no markdown, no extra text, no code block delimiters."""

    raw = _sonnet(prompt, max_tokens=2000)

    try:
        result = _extract_json_object(raw)
    except (json.JSONDecodeError, ValueError, Exception) as exc:
        logger.error("Investment Committee JSON parse failed: %s\nRaw: %s", exc, raw[:500])
        result = {
            "direction":           "HOLD",
            "conviction":          conviction,
            "expected_return_12m": "N/A",
            "position_size_pct":   0.0,
            "stop_loss_pct":       0.0,
            "three_arguments":     ["Insufficient data", "Insufficient data", "Insufficient data"],
            "key_risks":           ["Insufficient data", "Insufficient data", "Insufficient data"],
            "committee_narrative": raw or "Investment Committee synthesis failed — see logs.",
        }

    result["conviction"] = conviction
    result["conviction_source"] = "9-component weighted model [CALCULATED] — not AI generated"
    result["conviction_breakdown"] = conviction_breakdown
    return result
