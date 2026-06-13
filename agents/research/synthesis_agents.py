"""
AI synthesis agents for ad-hoc research reports.
Uses Claude Haiku 4.5 for all section narratives, Sonnet 4.6 for Investment Committee.
STRICT RULE: AI receives structured JSON only. AI writes narratives only. Never numbers.
"""

import json
import os
import re
import sys
import threading
from typing import Any

import anthropic

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from utils.logger import get_logger

logger = get_logger(__name__)

HAIKU_MODEL  = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"

# ---------------------------------------------------------------------------
# Per-pipeline API error tracking (thread-safe, reset at pipeline start)
# ---------------------------------------------------------------------------

_error_lock = threading.Lock()
_api_errors: dict = {}


def clear_api_errors() -> None:
    global _api_errors
    with _error_lock:
        _api_errors = {}


def get_api_errors() -> dict:
    with _error_lock:
        return dict(_api_errors)


def _record_error(error_type: str, message: str, model: str = "") -> None:
    with _error_lock:
        # Only record the first (most significant) error — subsequent calls
        # may fail for the same reason and we don't want to overwrite detail.
        if "anthropic" not in _api_errors:
            _api_errors["anthropic"] = {
                "type":    error_type,
                "message": message[:300],
                "model":   model,
            }


def _get_client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise EnvironmentError("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=key)


def _call_claude(model: str, prompt: str, max_tokens: int = 1000) -> str:
    """Base call to Claude. Returns text content or empty string on error.
    Classifies specific error types into _api_errors for pipeline-level reporting.
    """
    try:
        client = _get_client()
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip() if msg.content else ""
    except EnvironmentError as exc:
        _record_error("missing_key", str(exc), model)
        logger.error("Anthropic API key missing (%s): %s", model, exc)
        return ""
    except anthropic.RateLimitError as exc:
        _record_error("rate_limit", str(exc), model)
        logger.error("Anthropic rate limit (%s): %s", model, exc)
        return ""
    except anthropic.AuthenticationError as exc:
        _record_error("invalid_key", str(exc), model)
        logger.error("Anthropic auth error (%s): %s", model, exc)
        return ""
    except anthropic.APIStatusError as exc:
        if exc.status_code in (402, 403):
            _record_error("billing", f"HTTP {exc.status_code} — credit balance may be exhausted", model)
        elif exc.status_code == 529:
            _record_error("overloaded", "Anthropic API is temporarily overloaded (529)", model)
        else:
            _record_error("api_error", f"HTTP {exc.status_code}: {exc.message}", model)
        logger.error("Anthropic APIStatusError %d (%s): %s", exc.status_code, model, exc)
        return ""
    except anthropic.APIConnectionError as exc:
        _record_error("connection", "Could not connect to Anthropic API — check network", model)
        logger.error("Anthropic connection error (%s): %s", model, exc)
        return ""
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


def _strip_code_fences(raw: str) -> str:
    """Remove markdown ```json ... ``` fences before JSON parsing."""
    raw = raw.strip()
    m = re.match(r'^```(?:json)?\s*\n(.*?)\n```\s*$', raw, re.DOTALL)
    if m:
        return m.group(1).strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return raw


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
    and assesses near/medium-term catalysts. Returns structured JSON.
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

Based ONLY on the data above, respond with ONLY a valid JSON object — no preamble, no markdown fences.

{{
  "news_synthesis": "2-paragraph text: what is the most significant recent development and what does it mean for the investment thesis? Reference specific headlines. Do not fabricate events.",
  "near_term_catalysts": ["specific event from data within 0-30 days", "another event"],
  "medium_term_catalysts": ["specific event 1-6 months out", "another event"],
  "key_risk_events": ["specific risk or negative event visible in the data", "another risk"]
}}

Rules:
- Only reference articles and events in the provided data.
- If a category has no data, use an empty array [].
- Each catalyst/risk item is a plain string, max 15 words."""

    raw = _haiku(prompt, max_tokens=800)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        return {
            "value":                 parsed.get("news_synthesis", ""),
            "near_term_catalysts":   parsed.get("near_term_catalysts", []),
            "medium_term_catalysts": parsed.get("medium_term_catalysts", []),
            "key_risk_events":       parsed.get("key_risk_events", []),
            "source": f"{HAIKU_MODEL} [AI narrative]",
            "status": "ok",
        }
    except Exception:
        return _ai_tag(raw)


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

Based ONLY on the data above, respond with ONLY a valid JSON object — no preamble, no markdown fences.

{{
  "moat_rating": "Wide" or "Narrow" or "None",
  "moat_reasons": ["specific reason from data", "another reason"],
  "competitive_intensity": "2-3 sentence description of the competitive landscape based on the data",
  "key_threats": ["specific threat from news or context", "another threat"]
}}

Rules:
- Do NOT claim a wide moat unless the data clearly supports it.
- moat_rating must be exactly one of: Wide, Narrow, None.
- Each item in moat_reasons and key_threats is a plain string, max 15 words.
- If data is insufficient for a field, use an empty array or "Insufficient data"."""

    raw = _haiku(prompt, max_tokens=500)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        moat = parsed.get("moat_rating", "")
        reasons = parsed.get("moat_reasons") or []
        intensity = parsed.get("competitive_intensity") or ""
        threats = parsed.get("key_threats") or []
        parts = []
        if intensity:
            parts.append(intensity)
        if reasons:
            parts.append("Moat drivers: " + "; ".join(str(r) for r in reasons))
        if threats:
            parts.append("Key threats: " + "; ".join(str(t) for t in threats))
        return {
            "moat_rating": moat,
            "narrative":   "\n\n".join(parts),
            "source":      f"{HAIKU_MODEL} [AI narrative]",
            "status":      "ok" if moat else "error",
        }
    except Exception:
        return _ai_tag(raw)


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

    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   (data.get("yfinance") or {}).get("info", {}).get("company_name") or ticker

    prompt = f"""You are a sector analyst writing the Industry & Market Context section of a research report on {ticker} ({company_name}).

STRUCTURED DATA (search excerpts + macro):
{json.dumps(structured, indent=2)}

Based ONLY on the data above, respond with ONLY a valid JSON object — no preamble, no markdown fences.

{{
  "industry_overview": "3 sentences. Describe the SPECIFIC market {ticker} operates in (not a generic sector description), name the 1-2 most important structural trends shaping it RIGHT NOW. Use company and competitor names.",
  "competitive_dynamics": "2-3 sentences. Name the most important competitors including private companies (e.g. SpaceX/Starlink, Amazon Kuiper, government programs). Describe how they compete and the intensity of that competition for {ticker} specifically.",
  "ipo_and_event_risk": "1-2 sentences. If a major competitor IPO, merger, or sector-defining event appears in the data (e.g. SpaceX IPO, spectrum auction, government contract award), clearly state whether it would be POSITIVE or NEGATIVE for {ticker}'s stock price and WHY. If no such event is in the data, write null.",
  "macro_context": "2 sentences. How do the current macro numbers (rates, GDP, unemployment) specifically affect {ticker}'s cost of capital, launch timelines, customer demand, or path to profitability.",
  "tailwinds": ["specific named factor — e.g. 'FCC direct-to-device spectrum ruling accelerates commercial launch'", "second specific factor", "third specific factor"],
  "headwinds": ["specific named risk — e.g. 'SpaceX Starlink has 4M+ subscribers vs. zero for ASTS'", "second specific risk", "third specific risk"]
}}

Rules:
- Do NOT use generic boilerplate ("evolving demand patterns", "digital transformation", "technological advancement"). Be company-specific.
- Name real companies, real regulatory events, real competitors including private ones.
- Do NOT fabricate TAM/CAGR figures unless explicitly in the search data above.
- tailwinds/headwinds: max 20 words each, plain strings, max 3 items per array.
- If competitive_dynamics data is missing from search results, write what you can infer from company name/sector alone but mark it as inferred."""

    raw = _haiku(prompt, max_tokens=800)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        overview     = parsed.get("industry_overview") or ""
        competitive  = parsed.get("competitive_dynamics") or ""
        ipo_risk     = parsed.get("ipo_and_event_risk") or None
        macro        = parsed.get("macro_context") or ""
        return {
            "value":                 "\n\n".join(filter(None, [overview, macro])),
            "industry_overview":     overview,
            "competitive_dynamics":  competitive,
            "ipo_and_event_risk":    ipo_risk,
            "macro_context":         macro,
            "tailwinds":             parsed.get("tailwinds") or [],
            "headwinds":             parsed.get("headwinds") or [],
            "source":                f"{HAIKU_MODEL} [AI narrative]",
            "status":                "ok",
        }
    except Exception:
        return _ai_tag(raw)


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

Based ONLY on the data above, respond with ONLY a valid JSON array — no preamble, no markdown fences.

[
  {{
    "name": "concise risk name, max 8 words",
    "category": "Valuation | Execution | Financial | Macro | Regulatory | Competitive | Technical",
    "mechanism": "1-2 sentences: exactly how this risk harms the investment",
    "likelihood": "High | Medium | Low",
    "impact": "High | Medium | Low"
  }}
]

Rules:
- Identify 5-7 risks. Be direct and unsparing — do NOT soften risks.
- If valuation multiples are stretched, say so explicitly.
- If revenue growth is decelerating or margins are negative, name it.
- Do NOT fabricate risks not supported by the data.
- Each "mechanism" must reference a specific data point (e.g. EV/EBITDA, beta, headline)."""

    raw = _haiku(prompt, max_tokens=900)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        if not isinstance(parsed, list):
            raise ValueError("expected list")
        return {
            "risks":  parsed,
            "source": f"{HAIKU_MODEL} [AI narrative]",
            "status": "ok" if parsed else "error",
        }
    except Exception:
        return {
            "risks":  [],
            "value":  raw,
            "source": f"{HAIKU_MODEL} [AI narrative]",
            "status": "error",
        }


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


# ---------------------------------------------------------------------------
# Section 4b: Revenue Growth Drivers
# ---------------------------------------------------------------------------

def synthesize_revenue_growth_drivers(data: dict) -> dict:
    """
    Haiku identifies 3-5 specific, named revenue growth drivers from Tavily
    earnings call + analyst search results and Finnhub news.
    Returns a structured JSON list of driver cards.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker

    earnings_results = data.get("tavily_growth_drivers") or []
    analyst_results  = data.get("tavily_analyst_growth") or []
    news = (data.get("finnhub_news") or [])[:10]

    structured = {
        "ticker":       ticker,
        "company_name": company_name,
        "earnings_call_excerpts": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "text": (r.get("content") or "")[:600]}
            for r in earnings_results[:5]
        ],
        "analyst_excerpts": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "text": (r.get("content") or "")[:600]}
            for r in analyst_results[:5]
        ],
        "recent_headlines": [a.get("headline", "") for a in news],
    }

    prompt = f"""You are an equity analyst at Haz Capital. Below are search results from earnings calls, analyst reports, and news for {ticker} ({company_name}).

{json.dumps(structured, indent=2)}

From the provided data ONLY, identify the 3 to 5 most important specific revenue growth drivers for this company. For each driver:
- Give it a short, specific name (3-6 words, no generic labels like "Revenue Growth" or "Strong Business"). Examples: "Direct-to-Device Commercial Launch", "Pricing Power Above Inflation", "GLP-1 Market Expansion", "European Geographic Expansion".
- Write one sentence describing the specific mechanism (how it drives revenue).
- If the search data contains a specific quantitative evidence (a percentage, a $ figure, a subscriber count) — include it verbatim. If not, set evidence to null. NEVER fabricate a number.
- Assign a category from: pricing | volume | geographic | product | m_and_a | efficiency | regulatory

Respond with ONLY a valid JSON array — no preamble, no markdown fences:
[
  {{
    "name": "...",
    "mechanism": "...",
    "evidence": "..." or null,
    "evidence_source": "url or source name if evidence present, else null",
    "category": "..."
  }}
]

Rules:
- If fewer than 3 drivers are supported by the data, return only those supported. Do NOT invent drivers.
- evidence must be a direct quote or verbatim figure from the data. Never synthesise a number.
- name must be specific to {ticker}, not a generic descriptor."""

    raw = _haiku(prompt, max_tokens=800)
    try:
        drivers = json.loads(_strip_code_fences(raw))
        if not isinstance(drivers, list):
            drivers = []
        return {
            "drivers": drivers,
            "source":  f"{HAIKU_MODEL} [AI narrative] — Tavily earnings call + analyst search",
            "status":  "ok",
        }
    except Exception:
        return {
            "drivers": [],
            "source":  f"{HAIKU_MODEL} [AI narrative]",
            "status":  "parse_error",
            "raw":     raw[:500],
        }


# ---------------------------------------------------------------------------
# Section 10b: Management & Governance
# ---------------------------------------------------------------------------

def synthesize_management_governance(data: dict) -> dict:
    """
    Haiku writes a CEO profile and board governance assessment from Tavily
    management search results + FMP profile data.
    Returns structured JSON with ceo_profile, tenure_note, and board_assessment.
    """
    fmp        = data.get("fmp_profile") or {}
    yf_info    = (data.get("yfinance") or {}).get("info") or {}
    executives = data.get("fmp_executives") or []
    mgmt_hits  = data.get("tavily_management") or []
    ticker     = (data.get("_meta") or {}).get("ticker", "")

    ceo_name     = fmp.get("ceo") or ""
    company_name = fmp.get("company_name") or yf_info.get("company_name") or ticker
    ipo_date     = fmp.get("ipo_date") or ""
    sector       = fmp.get("sector") or yf_info.get("sector") or ""
    employees    = fmp.get("employees") or yf_info.get("fullTimeEmployees")

    exec_titles = [{"name": e.get("name", ""), "title": e.get("title", "")} for e in executives[:8]]

    structured = {
        "ticker":       ticker,
        "company_name": company_name,
        "ceo_name":     ceo_name,
        "sector":       sector,
        "ipo_date":     ipo_date,
        "employees":    employees,
        "exec_team":    exec_titles,
        "search_results": [
            {"title": r.get("title", ""), "url": r.get("url", ""), "text": (r.get("content") or "")[:700]}
            for r in mgmt_hits[:5]
        ],
    }

    prompt = f"""You are an equity analyst writing the Management & Governance section of a research report on {ticker} ({company_name}).

STRUCTURED DATA:
{json.dumps(structured, indent=2)}

Respond with ONLY a valid JSON object — no preamble, no markdown fences:
{{
  "ceo_profile": "2-3 sentences. CEO name, their background before this role, how long they have been CEO (extract from search data if available, otherwise omit tenure), one notable decision or achievement at this company. Only include information from the provided data. If you cannot find meaningful background, write one sentence acknowledging limited public information.",
  "tenure_note": "e.g. 'CEO since 2019 (6 years)' — extract only if explicitly stated in search data, else null",
  "board_assessment": {{
    "total_members": null or integer if found in search data,
    "independent_pct": null or integer (%) if found in search data,
    "governance_flag": "No red flags identified" or "Flag: [specific named concern from search data]"
  }},
  "leadership_style": "1 sentence only. Describe the CEO's stated strategic priorities or management approach based on quotes/commentary found in the search data. If nothing found, null."
}}

Rules:
- board total_members and independent_pct: extract only if explicitly stated in search results. If not found, set to null.
- governance_flag: only flag a specific named issue (e.g. 'dual-class shares', 'no independent chair', 'related-party transactions') if found in the search data. Default to 'No red flags identified'.
- Do NOT fabricate tenure, board counts, or any figures not present in the data.
- tenure_note must be null if year not found in search data."""

    raw = _haiku(prompt, max_tokens=600)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        return {
            "ceo_profile":    parsed.get("ceo_profile") or "",
            "tenure_note":    parsed.get("tenure_note"),
            "board_assessment": parsed.get("board_assessment") or {
                "total_members": None,
                "independent_pct": None,
                "governance_flag": "No red flags identified",
            },
            "leadership_style": parsed.get("leadership_style"),
            "source": f"{HAIKU_MODEL} [AI narrative] — FMP profile + Tavily management search",
            "status": "ok",
        }
    except Exception:
        return {
            "ceo_profile":    raw[:400] if raw else "",
            "tenure_note":    None,
            "board_assessment": {"total_members": None, "independent_pct": None, "governance_flag": "No red flags identified"},
            "leadership_style": None,
            "source": f"{HAIKU_MODEL} [AI narrative]",
            "status": "parse_error",
        }
