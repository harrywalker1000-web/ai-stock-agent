"""
AI synthesis agents for ad-hoc research reports.
Uses Claude Haiku 4.5 for all section narratives, Sonnet 4.6 for Investment Committee.
STRICT RULE: AI receives structured JSON only. AI writes narratives only. Never numbers.
"""

import json
import os
import sys
from typing import Any

import anthropic

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from utils.logger import get_logger

logger = get_logger(__name__)

HAIKU_MODEL  = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"


def _get_client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise EnvironmentError("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=key)


def _call_claude(model: str, prompt: str, max_tokens: int = 1000) -> str:
    """Base call to Claude. Returns text content or empty string on error."""
    try:
        client = _get_client()
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip() if msg.content else ""
    except Exception as exc:
        logger.error("Claude call failed (%s): %s", model, exc)
        return ""


def _haiku(prompt: str, max_tokens: int = 1000) -> str:
    return _call_claude(HAIKU_MODEL, prompt, max_tokens)


def _sonnet(prompt: str, max_tokens: int = 2000) -> str:
    return _call_claude(SONNET_MODEL, prompt, max_tokens)


def _ai_tag(text: str, model: str = HAIKU_MODEL) -> dict:
    return {
        "value":  text,
        "source": f"{model} [AI narrative]",
        "status": "ok" if text else "error",
    }


# ---------------------------------------------------------------------------
# Section 2: Company Overview narrative
# ---------------------------------------------------------------------------

def synthesize_company_overview(data: dict) -> dict:
    """
    Calls Haiku to write a 3-paragraph company overview for a hedge fund pitch.
    Input: structured data only — model cannot access external information.
    Output: {value: str, source: "claude-haiku-4-5-20251001 [AI narrative]"}
    """
    fmp     = data.get("fmp_profile") or {}
    yf_info = (data.get("yfinance") or {}).get("info") or {}
    tavily  = data.get("tavily_overview") or []

    structured = {
        "company_name":  fmp.get("company_name") or yf_info.get("company_name"),
        "ticker":        (data.get("_meta") or {}).get("ticker", ""),
        "sector":        yf_info.get("sector") or fmp.get("sector"),
        "industry":      yf_info.get("industry") or fmp.get("industry"),
        "country":       fmp.get("country"),
        "employees":     fmp.get("employees"),
        "ceo":           fmp.get("ceo"),
        "website":       fmp.get("website"),
        "fmp_description": (fmp.get("description") or "")[:1000],
        "yfinance_summary": (yf_info.get("long_business_summary") or "")[:800],
        "web_context": [
            {"title": r.get("title", ""), "excerpt": (r.get("content") or "")[:400]}
            for r in tavily[:3]
        ],
    }

    prompt = f"""Here is the structured data for a company:

{json.dumps(structured, indent=2)}

Based ONLY on the data above, write a 3-paragraph company overview for a hedge fund investment pitch:

Paragraph 1: What the company does and its main products or services.
Paragraph 2: Where it operates geographically and who its key customers are.
Paragraph 3: Its current strategic priorities and near-term direction.

Rules:
- Do NOT fabricate any numbers, percentages, market share figures, or financial data.
- Do NOT use information beyond what is provided.
- Do NOT write "according to the data" or similar meta-references — write as analysis.
- Professional, analytical tone. Maximum 220 words total.
- If a paragraph's information is not available in the data, write one concise sentence acknowledging this."""

    narrative = _haiku(prompt, max_tokens=600)
    return _ai_tag(narrative)


# ---------------------------------------------------------------------------
# Section 3: News catalyst synthesis
# ---------------------------------------------------------------------------

def synthesize_news_catalysts(data: dict) -> dict:
    """
    Haiku synthesises the most significant recent development from the news feed
    and assesses near/medium-term catalysts. Receives only article data.
    """
    news    = (data.get("finnhub_news") or [])[:20]
    tavily  = data.get("tavily_catalysts") or []
    ticker  = (data.get("_meta") or {}).get("ticker", "")
    earnings = data.get("finnhub_earnings") or []

    structured = {
        "ticker": ticker,
        "recent_articles": [
            {"headline": a.get("headline", ""), "date": a.get("datetime", ""), "summary": (a.get("summary") or "")[:200]}
            for a in news[:15]
        ],
        "upcoming_earnings": earnings[:3],
        "catalyst_search_results": [
            {"title": r.get("title", ""), "excerpt": (r.get("content") or "")[:300]}
            for r in tavily[:3]
        ],
    }

    prompt = f"""Here is the news and event data for {ticker}:

{json.dumps(structured, indent=2)}

Based ONLY on the data above, provide:

1. NEWS SYNTHESIS (2 paragraphs): What is the most significant recent development for this company and what does it mean for the investment thesis? Only reference articles provided. Do not add external context or fabricate events.

2. NEAR-TERM CATALYSTS (bullet list, 0-30 days): Specific events from the data that could move the stock.

3. MEDIUM-TERM CATALYSTS (bullet list, 1-6 months): Specific events from the data.

4. KEY RISK EVENTS (bullet list): Regulatory, competitive, or macro events visible in the data.

If information is unavailable in the data, write "Insufficient data for this category."
Maximum 300 words total."""

    narrative = _haiku(prompt, max_tokens=700)
    return _ai_tag(narrative)


# ---------------------------------------------------------------------------
# Section 8: Competitive / moat assessment
# ---------------------------------------------------------------------------

def synthesize_competitive_moat(data: dict) -> dict:
    """
    Haiku assesses moat and competitive dynamics from Tavily + news context.
    """
    tavily  = data.get("tavily_competitive") or []
    news    = (data.get("finnhub_news") or [])[:10]
    fmp     = data.get("fmp_profile") or {}
    yf_info = (data.get("yfinance") or {}).get("info") or {}
    ticker  = (data.get("_meta") or {}).get("ticker", "")

    structured = {
        "ticker":          ticker,
        "company_name":    fmp.get("company_name") or yf_info.get("company_name"),
        "sector":          yf_info.get("sector") or fmp.get("sector"),
        "industry":        yf_info.get("industry") or fmp.get("industry"),
        "competitive_context": [
            {"title": r.get("title", ""), "excerpt": (r.get("content") or "")[:400]}
            for r in tavily[:4]
        ],
        "recent_news_headlines": [a.get("headline", "") for a in news[:8]],
    }

    prompt = f"""Here is the competitive data for {ticker}:

{json.dumps(structured, indent=2)}

Based ONLY on the data above, provide a competitive assessment with these three components:

1. MOAT ASSESSMENT: Rate the company's competitive moat as Wide / Narrow / None and give 2-3 specific reasons from the data. Do NOT claim a moat if the data does not support it.

2. COMPETITIVE INTENSITY: Describe the competitive landscape in 2-3 sentences. Name specific competitors only if they appear in the data.

3. KEY COMPETITIVE THREATS: 2-3 specific threats visible from recent news or search context. Do not fabricate threats.

If the data is insufficient to assess a component, say so directly.
Maximum 200 words total."""

    narrative = _haiku(prompt, max_tokens=500)
    return _ai_tag(narrative)


# ---------------------------------------------------------------------------
# Section 9: Industry & macro narrative
# ---------------------------------------------------------------------------

def synthesize_industry_macro(data: dict) -> dict:
    """Haiku synthesises industry trends and macro context from Tavily + FRED data."""
    tavily  = data.get("tavily_industry") or []
    fred    = data.get("fred_macro") or {}
    yf_info = (data.get("yfinance") or {}).get("info") or {}
    fmp     = data.get("fmp_profile") or {}
    ticker  = (data.get("_meta") or {}).get("ticker", "")

    structured = {
        "ticker":   ticker,
        "sector":   yf_info.get("sector") or fmp.get("sector"),
        "industry": yf_info.get("industry") or fmp.get("industry"),
        "macro_data": {
            "10y_yield_pct":    fred.get("risk_free_rate"),
            "fed_funds_pct":    fred.get("fed_funds_rate"),
            "gdp_growth_pct":   fred.get("gdp_growth"),
            "unemployment_pct": fred.get("unemployment"),
        },
        "industry_context": [
            {"title": r.get("title", ""), "excerpt": (r.get("content") or "")[:400]}
            for r in tavily[:4]
        ],
    }

    prompt = f"""Here is the industry and macro data for {ticker}:

{json.dumps(structured, indent=2)}

Based ONLY on the data above, provide:

1. INDUSTRY OVERVIEW (2 sentences): Key trends in this sector. Only reference facts from the search context.

2. MACRO ENVIRONMENT (2 sentences): How the current macro data (rates, GDP, unemployment) affects this sector.

3. TAILWINDS (bullet list, max 3): Specific factors from the data supporting growth.

4. HEADWINDS (bullet list, max 3): Specific macro or industry risks from the data.

Do NOT fabricate TAM figures, CAGR percentages, or market size data unless explicitly stated in the search results.
Maximum 220 words total."""

    narrative = _haiku(prompt, max_tokens=550)
    return _ai_tag(narrative)


# ---------------------------------------------------------------------------
# Section 11: Risk register
# ---------------------------------------------------------------------------

def synthesize_risk_register(data: dict) -> dict:
    """
    Haiku acts as a sceptical risk analyst. Identifies 5-7 specific risks.
    Input: full structured report data (financials, news, technicals, macro).
    """
    yf_info  = (data.get("yfinance") or {}).get("info") or {}
    fmp      = data.get("fmp_profile") or {}
    income   = (data.get("fmp_income") or [])[:2]
    tech     = data.get("technicals") or {}
    fred     = data.get("fred_macro") or {}
    news_hls = [a.get("headline", "") for a in (data.get("finnhub_news") or [])[:10]]
    ticker   = (data.get("_meta") or {}).get("ticker", "")

    latest_inc = income[0] if income else {}
    prior_inc  = income[1] if len(income) > 1 else {}
    rev_growth = None
    if latest_inc.get("revenue") and prior_inc.get("revenue"):
        rev_growth = round((latest_inc["revenue"] / prior_inc["revenue"] - 1) * 100, 1)

    structured = {
        "ticker":          ticker,
        "company_name":    fmp.get("company_name") or yf_info.get("company_name"),
        "sector":          yf_info.get("sector") or fmp.get("sector"),
        "financials": {
            "pe_ttm":          yf_info.get("pe_ttm"),
            "ev_ebitda":       yf_info.get("ev_ebitda"),
            "debt_to_equity":  yf_info.get("debt_to_equity"),
            "current_ratio":   yf_info.get("current_ratio"),
            "revenue_growth":  rev_growth,
            "profit_margins":  yf_info.get("profit_margins"),
            "beta":            yf_info.get("beta"),
        },
        "technicals": {
            "rsi":               tech.get("rsi"),
            "trend":             tech.get("trend_signal"),
            "pct_from_52w_high": tech.get("pct_from_52w_high"),
        },
        "macro": {
            "10y_yield":  fred.get("risk_free_rate"),
            "gdp_growth": fred.get("gdp_growth"),
        },
        "recent_headlines": news_hls,
    }

    prompt = f"""You are a sceptical hedge fund risk analyst reviewing {ticker}.

Here is the structured data:

{json.dumps(structured, indent=2)}

Based ONLY on the data above, identify the top 5-7 investment risks. For each risk:
- Risk name (concise, 8 words max)
- Category: one of [Valuation | Execution | Financial | Macro | Regulatory | Competitive | Technical]
- Mechanism: 1-2 sentences explaining exactly how this risk harms the investment
- Likelihood: High / Medium / Low
- Impact: High / Medium / Low

Rules:
- Be direct and unsparing. Do NOT soften risks or default to generic statements.
- If the valuation looks stretched (high PE/EV multiples), say so explicitly.
- If revenue growth is decelerating, name it.
- Do NOT fabricate risks not supported by the data.
- Format as a numbered list.

Maximum 350 words."""

    narrative = _haiku(prompt, max_tokens=700)
    return _ai_tag(narrative)


# ---------------------------------------------------------------------------
# Section 13: Sentiment assessment
# ---------------------------------------------------------------------------

def synthesize_sentiment(data: dict) -> dict:
    """Haiku assesses news tone from last 30 days of articles."""
    news   = (data.get("finnhub_news") or [])[:30]
    ticker = (data.get("_meta") or {}).get("ticker", "")

    structured = {
        "ticker": ticker,
        "articles": [
            {"headline": a.get("headline", ""), "summary": (a.get("summary") or "")[:150]}
            for a in news[:20]
        ],
    }

    prompt = f"""Here are the last 30 days of news headlines and summaries for {ticker}:

{json.dumps(structured, indent=2)}

Based ONLY on the articles above, provide:

1. OVERALL NEWS TONE: Positive / Neutral / Negative — with a 1-sentence justification.
2. DOMINANT THEMES: 2-3 recurring themes visible across the headlines.
3. SENTIMENT SHIFT: Is the tone improving, stable, or deteriorating vs what you'd expect from the mix of headlines? 1 sentence.

Do NOT reference events not present in the provided articles.
Maximum 120 words."""

    narrative = _haiku(prompt, max_tokens=300)
    return _ai_tag(narrative)


# ---------------------------------------------------------------------------
# Section 14: Where We Differ
# ---------------------------------------------------------------------------

def synthesize_where_we_differ(data: dict, all_sections: dict) -> dict:
    """
    Haiku identifies where Haz Capital's analysis diverges from consensus.
    Receives full structured data + assembled section outputs.
    """
    yf_info = (data.get("yfinance") or {}).get("info") or {}
    tech    = data.get("technicals") or {}
    ticker  = (data.get("_meta") or {}).get("ticker", "")

    dcf_section      = all_sections.get("dcf") or {}
    scenario_section = all_sections.get("scenario") or {}

    structured = {
        "ticker":               ticker,
        "current_price":        yf_info.get("current_price"),
        "analyst_consensus_pt": yf_info.get("target_mean_price"),
        "analyst_rating":       yf_info.get("recommendation_key"),
        "num_analysts":         yf_info.get("num_analyst_opinions"),
        "our_dcf_implied":      (dcf_section.get("implied_price") or {}).get("value"),
        "fmp_dcf":              (data.get("fmp_dcf") or {}).get("dcf"),
        "technicals": {
            "rsi":   tech.get("rsi"),
            "trend": tech.get("trend_signal"),
        },
        "our_base_case_return": (scenario_section.get("base_return_pct") or {}).get("value"),
        "short_interest_pct":   yf_info.get("short_pct_float"),
    }

    prompt = f"""You are a portfolio manager at Haz Capital reviewing {ticker}.

Here is our analysis vs the market consensus:

{json.dumps(structured, indent=2)}

Based ONLY on the data above, write 2-3 paragraphs explaining where Haz Capital's analysis diverges from market consensus:

- If our DCF implies a meaningfully different fair value, explain what assumption drives the gap.
- If technical signals contradict the analyst rating, flag this specifically.
- If short interest is notable relative to the analyst consensus, flag it.
- If there is no meaningful divergence from consensus, say so directly — do NOT invent a contrarian view.

Be specific — reference actual data points (prices, multiples, percentages) from the data above.
Maximum 200 words."""

    narrative = _haiku(prompt, max_tokens=500)
    return _ai_tag(narrative)
