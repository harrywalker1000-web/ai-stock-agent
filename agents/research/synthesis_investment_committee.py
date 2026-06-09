"""
synthesis_investment_committee.py — Sonnet 4.6 Investment Committee recommendation.
Conviction scoring is deterministic (sub-component model). AI writes narrative only.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from agents.research.synthesis_agents import _sonnet, _get_client
from utils.logger import get_logger

logger = get_logger(__name__)


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

    # --- Conviction scoring (deterministic, sub-component — no AI) ---
    conviction = 5

    # +1 FCF positive
    fcf_val = None
    if cashflow:
        fcf_val = float(cashflow[0].get("freeCashFlow") or 0)
    if fcf_val is not None and fcf_val > 0:
        conviction += 1

    # +1 revenue growth > 10%
    rev_growth = None
    if len(income) >= 2:
        r0 = float(income[0].get("revenue") or 0)
        r1 = float(income[1].get("revenue") or 0)
        if r1 > 0:
            rev_growth = (r0 - r1) / r1 * 100
    if rev_growth is not None and rev_growth > 10:
        conviction += 1

    # +1 technical trend bullish
    trend = (tech.get("trend_signal") or "").lower()
    if trend == "bullish":
        conviction += 1

    # +1 analyst consensus buy
    s10 = all_sections.get("s10") or {}
    ar  = s10.get("analyst_ratings") or {}
    consensus_raw = ar.get("consensus")
    consensus = (consensus_raw.get("value", "") if isinstance(consensus_raw, dict) else consensus_raw or "")
    if (consensus or "").lower() == "buy":
        conviction += 1

    # +1 probability-weighted return > 15%
    s12 = all_sections.get("s12") or {}
    pw_return = _v(s12.get("probability_weighted_return"))
    if pw_return is not None and float(pw_return) > 15:
        conviction += 1

    # -1 P/E > 40
    pe_ttm = float(yf_info.get("pe_ttm") or 0)
    if pe_ttm and pe_ttm > 40:
        conviction -= 1

    # -1 debt-to-equity > 3
    de = float(yf_info.get("debt_to_equity") or 0)
    if de and de > 3:
        conviction -= 1

    # -1 RSI > 70
    rsi = float(tech.get("rsi") or 0)
    if rsi and rsi > 70:
        conviction -= 1

    # -1 pct_from_52w_high < -25%
    pct_52w = float(tech.get("pct_from_52w_high") or 0)
    if pct_52w and pct_52w < -25:
        conviction -= 1

    conviction = max(1, min(10, conviction))

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
        "fcf_positive":          bool(fcf_val and fcf_val > 0),
    }

    prompt = f"""You are the Investment Committee chair at Haz Capital evaluating {ticker}.

Here is our structured analysis summary:

{json.dumps(structured_summary, indent=2)}

The conviction score has already been computed as {conviction}/10 using our sub-component model.
You MUST use exactly {conviction} as the conviction value — do not change it.

Provide the Investment Committee recommendation as a JSON object with EXACTLY these keys:
- "direction": one of BUY, HOLD, SELL, AVOID
- "conviction": {conviction}  (use exactly this number)
- "expected_return_12m": a string like "+18%" or "-5%" — base this on the scenario analysis above
- "position_size_pct": a float (e.g. 3.0) — higher conviction = larger size, max 5.0%, min 0.5%
- "stop_loss_pct": a float (e.g. 12.0) — distance from current price to stop loss in percent
- "three_arguments": a list of exactly 3 strings — concise investment thesis arguments
- "key_risks": a list of exactly 3 strings — top 3 risks that could invalidate the thesis
- "committee_narrative": 3 paragraphs of professional investment committee prose

Rules:
- Do NOT fabricate any numbers not present in the data above.
- Do NOT invent percentages, market share, growth rates, or financial metrics.
- Narratives may reference numbers from the structured summary — that is the only source.
- Be direct. Do not hedge every sentence.
- If data is insufficient, say the recommendation is constrained by data availability.
- Return ONLY the JSON object — no markdown, no extra text, no code block delimiters."""

    raw = _sonnet(prompt, max_tokens=2000)

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            cleaned = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        result = json.loads(cleaned)
    except (json.JSONDecodeError, Exception) as exc:
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
    result["conviction_source"] = "sub-component scoring [CALCULATED] — not AI generated"
    return result
