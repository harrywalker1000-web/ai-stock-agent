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
    Haiku assesses moat using business description + Tavily context + training knowledge.
    Focuses on strategic moat sources (contracts, network effects, switching costs, IP)
    not financial margins.
    """
    tavily  = data.get("tavily_competitive") or []
    news    = (data.get("finnhub_news") or [])[:10]
    fmp     = data.get("fmp_profile") or {}
    yf_info = (data.get("yfinance") or {}).get("info") or {}
    ticker  = (data.get("_meta") or {}).get("ticker", "")

    company_name = fmp.get("company_name") or yf_info.get("company_name") or ticker

    structured = {
        "ticker":           ticker,
        "company_name":     company_name,
        "sector":           yf_info.get("sector") or fmp.get("sector"),
        "industry":         yf_info.get("industry") or fmp.get("industry"),
        "business_summary": (yf_info.get("long_business_summary") or fmp.get("description") or "")[:700],
        "employees":        fmp.get("full_time_employees") or yf_info.get("fullTimeEmployees"),
        "competitive_context": [
            {"title": r.get("title", ""), "excerpt": (r.get("content") or "")[:500]}
            for r in tavily[:4]
        ],
        "recent_news_headlines": [a.get("headline", "") for a in news[:6]],
    }

    prompt = f"""You are a senior equity analyst writing the Competitive Moat section of a research report on {ticker} ({company_name}).

CONTEXT DATA (use this as a starting point):
{json.dumps(structured, indent=2)}

Your job: give a direct, opinionated verdict on whether {ticker} has a real competitive moat, and exactly what it is.

The moat must be explained in BUSINESS terms — not financial ratios. Think:
- Key customer contracts or partnerships (name the customers and approximate scale if known)
- Network effects (does the platform get more valuable as more users join? how many?)
- Switching costs (how hard is it for customers to leave? why?)
- Regulatory licenses, patents, or government approvals that competitors can't easily replicate
- Scale advantages in a specific operation (e.g. "largest provider network in 12 states")
- Brand trust in a specific market or use case
- Proprietary technology or data that competitors lack

If competitive_context above is sparse, use your own training knowledge about {ticker} ({company_name}) — you will know this company. NEVER say "insufficient data". Give a real answer.

Respond with ONLY a valid JSON object — no preamble, no markdown fences.

{{
  "moat_rating": "Wide" or "Narrow" or "None",
  "moat_verdict": "2-3 sentences. State directly: does this company have a strong moat, weak moat, or none? Name the specific source(s) with real numbers where possible (e.g. '40M active users', 'contracts with 8 of the top 10 US banks', '#2 market share in ACA individual plans'). Then state the main reason a competitor can't easily replicate it — or if they can.",
  "moat_reasons": ["Specific named advantage with numbers if known — e.g. 'Partnership with AT&T and Verizon locks in direct-to-device spectrum access through 2030'", "second specific advantage"],
  "key_threats": ["Specific named threat — e.g. 'UnitedHealth has 47M members vs OSCR 1.6M — 30x the scale for medical cost negotiation'", "second specific threat"],
  "competitive_differentiation_score": 12
}}

Rules:
- moat_rating: exactly one of Wide, Narrow, None.
- moat_verdict: opinionated and specific. No vague language like "regulatory barriers to entry" without naming what the barrier actually is.
- moat_reasons/key_threats: name real companies, real products, real numbers. Max 25 words each.
- competitive_differentiation_score: integer 0-20, NOT a multiple of 5 (e.g. 12, 17, 8, 3, 14)."""

    raw = _haiku(prompt, max_tokens=700)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        moat = parsed.get("moat_rating", "")
        verdict = parsed.get("moat_verdict") or ""
        reasons = parsed.get("moat_reasons") or []
        threats = parsed.get("key_threats") or []
        dim5_raw = parsed.get("competitive_differentiation_score")
        dim5 = max(0, min(20, int(dim5_raw))) if dim5_raw is not None else 10
        parts = []
        if verdict:
            parts.append(verdict)
        if reasons:
            parts.append("Moat drivers: " + "; ".join(str(r) for r in reasons))
        if threats:
            parts.append("Key threats: " + "; ".join(str(t) for t in threats))
        return {
            "moat_rating":                    moat,
            "narrative":                      "\n\n".join(parts),
            "competitive_differentiation_score": dim5,
            "source":                         f"{HAIKU_MODEL} [AI narrative]",
            "status":                         "ok" if moat else "error",
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

    company_name = fmp.get("company_name") or \
                   (data.get("yfinance") or {}).get("info", {}).get("company_name") or ticker

    def _pct(v):
        if v is None:
            return None
        try:
            return f"{float(v)*100:.1f}%"
        except (TypeError, ValueError):
            return None

    structured = {
        "ticker":   ticker,
        "company_name": company_name,
        "sector":   yf_info.get("sector") or fmp.get("sector"),
        "industry": yf_info.get("industry") or fmp.get("industry"),
        "business_summary": (yf_info.get("long_business_summary") or fmp.get("description") or "")[:600],
        "company_scale": {
            "market_cap_bn": round(float(yf_info["marketCap"]) / 1e9, 2) if yf_info.get("marketCap") else None,
            "revenue_growth": _pct(yf_info.get("revenue_growth")),
            "employees": fmp.get("full_time_employees") or yf_info.get("fullTimeEmployees"),
        },
        "macro_data": {
            "10y_yield_pct":    fred.get("risk_free_rate"),
            "fed_funds_pct":    fred.get("fed_funds_rate"),
            "gdp_growth_pct":   fred.get("gdp_growth"),
            "unemployment_pct": fred.get("unemployment"),
        },
        "industry_context": [
            {"title": r.get("title", ""), "excerpt": (r.get("content") or "")[:500]}
            for r in tavily[:4]
        ],
    }

    prompt = f"""You are a sector analyst writing the Industry & Market Context section of a research report on {ticker} ({company_name}).

CONTEXT DATA:
{json.dumps(structured, indent=2)}

Use the data above as a starting point, and use your own knowledge of {ticker} ({company_name}) to enrich the answer — especially for tailwinds and headwinds where you MUST be company-specific.

Respond with ONLY a valid JSON object — no preamble, no markdown fences.

{{
  "industry_overview": "3 sentences. Describe the SPECIFIC market {ticker} operates in, name the 1-2 most important structural trends shaping it RIGHT NOW. Use real company and competitor names. Do not use generic boilerplate.",
  "competitive_dynamics": "2-3 sentences. Name the most important competitors with their scale (e.g. market share %, member counts, revenue). Describe how they compete with {ticker} and who is winning.",
  "ipo_and_event_risk": "1-2 sentences. If a major competitor IPO, merger, acquisition, or sector-defining regulatory event is relevant, state clearly whether it is POSITIVE or NEGATIVE for {ticker} and why. Write null if nothing material.",
  "macro_context": "2 sentences. How do the current macro numbers specifically affect {ticker}'s cost structure, customer demand, or path to profitability — not the sector generically.",
  "tailwinds": [
    "Company-specific tailwind with a number or stat. What is it, why does it benefit {ticker} in particular, how big is the opportunity for them vs peers? 1-2 sentences.",
    "Second tailwind — same format, company-specific with numbers.",
    "Third tailwind — same format."
  ],
  "headwinds": [
    "Company-specific headwind with a number or stat. What exactly is the risk, how exposed is {ticker} to it, what does it mean for the stock if it materialises? 1-2 sentences.",
    "Second headwind — same format.",
    "Third headwind — same format."
  ]
}}

Rules:
- NEVER write generic statements like 'regulatory environment creates uncertainty', 'aging demographics drive demand', 'competitive pressures intensify'. These are useless.
- Tailwinds/headwinds must name a specific thing happening to or for {ticker} — a contract, a regulation with a name, a competitor move, a product launch, a market share shift.
- Include real numbers where you know them: member counts, market share %, subsidy amounts, contract sizes, timelines.
- Do NOT fabricate TAM/CAGR figures unless they appear in the context data above."""

    raw = _haiku(prompt, max_tokens=1000)
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
    Haiku identifies 3-5 specific, named revenue growth drivers.
    Primary: Tavily earnings call + analyst search results.
    Fallback: FMP income statement + segments + yfinance business description
              when Tavily returns sparse content (<400 chars).
    Returns a structured JSON list of driver cards.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker

    earnings_results = data.get("tavily_growth_drivers") or []
    analyst_results  = data.get("tavily_analyst_growth") or []
    news = (data.get("finnhub_news") or [])[:10]

    # Determine whether Tavily returned enough meaningful content
    tavily_content = " ".join(
        (r.get("content") or "") for r in earnings_results + analyst_results
    )
    tavily_sparse = len(tavily_content.strip()) < 400

    if tavily_sparse:
        # --- Fallback: derive drivers from financial filings + business description ---
        income   = (data.get("fmp_income") or [])[:5]
        segments = (data.get("fmp_revenue_segments") or [])[:3]
        yf_info  = (data.get("yfinance") or {}).get("info") or {}

        revenue_trend = []
        for stmt in income:
            yr  = (stmt.get("date") or "")[:4]
            rev = stmt.get("revenue")
            gp  = stmt.get("grossProfit")
            if yr and rev:
                revenue_trend.append({"year": yr, "revenue_usd": rev, "gross_profit_usd": gp})

        fallback_ctx = {
            "ticker":              ticker,
            "company_name":        company_name,
            "sector":              yf_info.get("sector", ""),
            "industry":            yf_info.get("industry", ""),
            "business_description": (yf_info.get("long_business_summary") or "")[:1000],
            "revenue_trend_5yr":   revenue_trend,
            "revenue_segments":    segments,
            "recent_headlines":    [a.get("headline", "") for a in news],
        }

        prompt = f"""You are an equity analyst at Haz Capital. No earnings call search data was available for {ticker} ({company_name}).
Use the financial data and business description below to identify the 3 to 5 most important specific revenue growth drivers for this company.

{json.dumps(fallback_ctx, indent=2)}

For each driver:
- Give it a short, specific name (3-6 words) that reflects THIS company's actual business model — not a generic label like "Revenue Growth".
- Write one sentence describing the specific mechanism (how it drives revenue for this company).
- evidence: if revenue_trend_5yr or revenue_segments contains a specific figure, quote it verbatim. Otherwise set to null. NEVER fabricate or estimate a number.
- evidence_source: "FMP income statement" or "FMP revenue segments" if evidence present, else null.
- Assign a category from: pricing | volume | geographic | product | m_and_a | efficiency | regulatory

Respond with ONLY a valid JSON array — no preamble, no markdown fences:
[
  {{
    "name": "...",
    "mechanism": "...",
    "evidence": "..." or null,
    "evidence_source": "FMP income statement" or "FMP revenue segments" or null,
    "category": "..."
  }}
]

Rules:
- Return 3-5 drivers grounded in this company's specific sector and business model.
- evidence can only be a verbatim figure from revenue_trend_5yr or revenue_segments above.
- name must be specific to {ticker}'s actual products/markets, not generic."""

        source_label = f"{HAIKU_MODEL} [AI narrative] — derived from FMP financial filings + business description"

    else:
        # --- Primary: use Tavily earnings call + analyst excerpts ---
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

        source_label = f"{HAIKU_MODEL} [AI narrative] — Tavily earnings call + analyst search"

    raw = _haiku(prompt, max_tokens=800)
    try:
        drivers = json.loads(_strip_code_fences(raw))
        if not isinstance(drivers, list):
            drivers = []
        return {
            "drivers": drivers,
            "source":  source_label,
            "status":  "ok",
        }
    except Exception:
        return {
            "drivers": [],
            "source":  source_label,
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


# ---------------------------------------------------------------------------
# Section H: ESG initiatives + MSCI rating narrative
# ---------------------------------------------------------------------------

def synthesize_esg_initiatives(data: dict) -> dict:
    """
    Haiku: Extract MSCI ESG rating (if stated) and key ESG initiatives from
    Tavily search results. Returns structured JSON with msci_rating, initiatives[],
    and a 2-sentence narrative.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("_meta") or {}).get("company_name", ticker)
    tavily       = data.get("tavily_esg") or []

    default = {
        "msci_rating":  None,
        "initiatives":  [],
        "narrative":    None,
        "source":       f"{HAIKU_MODEL} [AI narrative] — Tavily ESG search",
        "status":       "unavailable",
    }

    if not tavily:
        return default

    search_text = "\n\n".join(
        f"[{i+1}] {r.get('title','')}\n{(r.get('content') or '')[:700]}"
        for i, r in enumerate(tavily[:5])
    )

    prompt = f"""You are an ESG analyst reviewing sustainability data for {company_name} ({ticker}).

Below are web search results about their ESG performance and sustainability initiatives:

{search_text}

Extract ONLY what is explicitly stated in the sources above. Do NOT fabricate ratings, scores, or initiatives.

Return ONLY valid JSON — no preamble, no markdown:
{{
  "msci_rating": "AA" or null,
  "initiatives": [
    {{"name": "Initiative name", "description": "1-sentence description"}}
  ],
  "narrative": "2-sentence summary of this company's ESG positioning and headline achievement. Write null if search results contain no meaningful ESG information."
}}

Rules:
- msci_rating: only include if explicitly stated in search results (e.g. 'MSCI ESG Rating: AA'). If not found, set null.
- initiatives: up to 3. Only concrete named programs or commitments from the sources. If none found, return [].
- narrative: only include factual claims from the search results. Do not add editorial opinion. Max 2 sentences."""

    raw = _haiku(prompt, max_tokens=500)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        return {
            "msci_rating":  parsed.get("msci_rating"),
            "initiatives":  (parsed.get("initiatives") or [])[:3],
            "narrative":    parsed.get("narrative"),
            "source":       f"{HAIKU_MODEL} [AI narrative] — Tavily ESG search",
            "status":       "ok",
        }
    except Exception:
        return {
            "msci_rating":  None,
            "initiatives":  [],
            "narrative":    raw[:300] if raw else None,
            "source":       f"{HAIKU_MODEL} [AI narrative]",
            "status":       "parse_error",
        }


# ---------------------------------------------------------------------------
# Section J: M&A Track Record
# ---------------------------------------------------------------------------

def synthesize_ma_track_record(data: dict) -> dict:
    """
    Haiku: Extract structured M&A events and a track record narrative from
    Tavily M&A search results + Finnhub M&A news headlines.
    Returns: {events: [], narrative, source, status}
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("_meta") or {}).get("company_name", ticker)
    tavily       = data.get("tavily_ma") or []
    finnhub      = data.get("finnhub_news") or []

    default = {
        "events":    [],
        "narrative": None,
        "source":    f"{HAIKU_MODEL} [AI narrative] — Tavily M&A search + SEC 8-K + Finnhub news",
        "status":    "unavailable",
    }

    # Filter Finnhub for M&A headlines
    ma_kw = {"acqui", "merger", "divest", "takeover", "buyout", "spinoff", "spin-off"}
    ma_news = [
        n.get("headline", "") for n in finnhub
        if any(kw in (n.get("headline") or "").lower() for kw in ma_kw)
    ][:5]

    if not tavily and not ma_news:
        return default

    search_text = "\n\n".join(
        f"[{i+1}] {r.get('title','')}\n{(r.get('content') or '')[:700]}"
        for i, r in enumerate(tavily[:5])
    )
    if ma_news:
        search_text += "\n\nRECENT M&A HEADLINES (Finnhub, last 30 days):\n" + "\n".join(f"- {h}" for h in ma_news)

    prompt = f"""You are an M&A analyst reviewing deal history for {company_name} ({ticker}).

Below are search results and news about their M&A activity:

{search_text}

Extract only M&A events explicitly mentioned in the sources. Do NOT fabricate deals.

Return ONLY valid JSON — no preamble, no markdown fences:
{{
  "events": [
    {{
      "year": 2023,
      "type": "Acquisition",
      "target": "Company or asset name",
      "deal_value": "$2.5B" or null,
      "status": "Completed"
    }}
  ],
  "narrative": "2-3 sentences summarising {company_name}'s M&A strategy and track record based on these sources. If no M&A history is found, write null."
}}

Rules:
- type: one of Acquisition, Divestiture, Merger, Strategic Partnership, Spin-off, Joint Venture
- status: one of Completed, Pending, Cancelled, Rumoured
- deal_value: only include if explicitly stated; otherwise null
- year: extract from source text; if only approximate, round to nearest year
- Return up to 6 events, newest first
- If no M&A events are mentioned in the sources, return events: []"""

    raw = _haiku(prompt, max_tokens=700)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        return {
            "events":    (parsed.get("events") or [])[:6],
            "narrative": parsed.get("narrative"),
            "source":    f"{HAIKU_MODEL} [AI narrative] — Tavily M&A search + SEC 8-K + Finnhub news",
            "status":    "ok",
        }
    except Exception:
        return {
            "events":    [],
            "narrative": raw[:300] if raw else None,
            "source":    f"{HAIKU_MODEL} [AI narrative]",
            "status":    "parse_error",
        }


# ---------------------------------------------------------------------------
# Section B: Porter's Five Forces
# ---------------------------------------------------------------------------

def synthesize_porter_five_forces(data: dict) -> dict:
    """
    Haiku scores all 5 Porter forces (1-5 scale) from Tavily industry + competitive data.
    1 = low threat (very favourable), 5 = high threat (very unfavourable).
    Returns structured JSON with score + 1-sentence rationale per force.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("_meta") or {}).get("company_name", ticker)
    fmp          = data.get("fmp_profile") or {}
    yf_info      = (data.get("yfinance") or {}).get("info") or {}
    cashflow     = data.get("fmp_cashflow") or []
    income       = data.get("fmp_income") or []
    tavily_i     = data.get("tavily_industry") or []
    tavily_c     = data.get("tavily_competitive") or []
    peers        = data.get("peer_metrics") or []

    sector   = yf_info.get("sector") or fmp.get("company_name") or ""
    industry = yf_info.get("industry") or ""

    capex_pct = None
    gm_pct    = None
    gm_raw = (yf_info.get("gross_margins"))
    if gm_raw is not None:
        try:
            gm_pct = round(float(gm_raw) * 100, 1)
        except (TypeError, ValueError):
            pass

    if cashflow and income:
        try:
            capex = float(cashflow[0].get("capitalExpenditure") or 0)
            rev   = float(income[0].get("revenue") or 0)
            if rev > 0:
                capex_pct = round(abs(capex) / rev * 100, 1)
        except (TypeError, ValueError, ZeroDivisionError):
            pass

    industry_ctx = "\n".join(
        f"[{i+1}] {r.get('title','')}: {(r.get('content') or '')[:400]}"
        for i, r in enumerate(tavily_i[:3])
    )
    competitive_ctx = "\n".join(
        f"[{i+1}] {r.get('title','')}: {(r.get('content') or '')[:400]}"
        for i, r in enumerate(tavily_c[:3])
    )

    quant_context = (
        f"Peer count: {len(peers)} listed competitors | "
        f"Gross margin: {f'{gm_pct}%' if gm_pct is not None else 'N/A'} | "
        f"Capex intensity (capex/revenue): {f'{capex_pct}%' if capex_pct is not None else 'N/A'}"
    )

    default_forces = {
        "competitive_rivalry":   {"score": 3, "rationale": "Insufficient data to assess competitive rivalry."},
        "threat_new_entrants":   {"score": 3, "rationale": "Insufficient data to assess entry barriers."},
        "threat_substitutes":    {"score": 3, "rationale": "Insufficient data to assess substitution risk."},
        "buyer_power":           {"score": 3, "rationale": "Insufficient data to assess buyer leverage."},
        "supplier_power":        {"score": 3, "rationale": "Insufficient data to assess supplier leverage."},
        "overall_attractiveness": "Medium",
        "sector_narrative":      None,
    }

    if not tavily_i and not tavily_c:
        return {
            **default_forces,
            "source": f"{HAIKU_MODEL} [AI narrative]",
            "status": "unavailable",
        }

    prompt = f"""You are an industry analyst applying Porter's Five Forces framework to {company_name} ({ticker}).

Sector: {sector} | Industry: {industry}
Quantitative anchors: {quant_context}

Industry search results:
{industry_ctx or "No industry data available."}

Competitive search results:
{competitive_ctx or "No competitive data available."}

Score each of the 5 forces on a 1-5 scale where:
  1 = very low threat (very favourable for {ticker})
  5 = very high threat (very unfavourable for {ticker})

Use the quantitative anchors to ground your scores:
- High peer count (>8) → tends toward high rivalry (score 4-5)
- High capex intensity (>15%) → tends toward low threat of new entrants (score 1-2)
- High gross margin (>50%) → tends toward low buyer power (score 1-2)

Return ONLY valid JSON — no preamble, no markdown:
{{
  "competitive_rivalry":   {{"score": 4, "rationale": "1 sentence based on data"}},
  "threat_new_entrants":   {{"score": 2, "rationale": "1 sentence based on data"}},
  "threat_substitutes":    {{"score": 3, "rationale": "1 sentence based on data"}},
  "buyer_power":           {{"score": 2, "rationale": "1 sentence based on data"}},
  "supplier_power":        {{"score": 3, "rationale": "1 sentence based on data"}},
  "overall_attractiveness": "High" or "Medium" or "Low",
  "sector_narrative": "1-2 sentence summary of structural industry attractiveness for investors."
}}

Rules:
- Scores must be integers 1-5 only.
- Do NOT use 0 or values above 5.
- overall_attractiveness: average force score ≤2.5 = High, 2.5-3.5 = Medium, >3.5 = Low.
- Rationale: 1 sentence max. Ground in specific data from the search results above."""

    raw = _haiku(prompt, max_tokens=700)
    try:
        parsed = json.loads(_strip_code_fences(raw))

        def _force(key: str) -> dict:
            f = parsed.get(key) or {}
            score = max(1, min(5, int(f.get("score", 3))))
            return {"score": score, "rationale": (f.get("rationale") or "")[:200]}

        return {
            "competitive_rivalry":    _force("competitive_rivalry"),
            "threat_new_entrants":    _force("threat_new_entrants"),
            "threat_substitutes":     _force("threat_substitutes"),
            "buyer_power":            _force("buyer_power"),
            "supplier_power":         _force("supplier_power"),
            "overall_attractiveness": parsed.get("overall_attractiveness", "Medium"),
            "sector_narrative":       parsed.get("sector_narrative"),
            "source":                 f"{HAIKU_MODEL} [AI narrative] — Tavily industry + competitive data",
            "status":                 "ok",
        }
    except Exception:
        return {
            **default_forces,
            "source": f"{HAIKU_MODEL} [AI narrative]",
            "status": "parse_error",
        }


# ---------------------------------------------------------------------------
# Section C: SOTP Valuation — segment multiple assignment only
# ---------------------------------------------------------------------------

def synthesize_sotp_valuation(data: dict) -> dict:
    """
    Haiku assigns EV/Revenue multiples (low/base/high) for each business segment.
    AI returns ONLY multiples — never revenues, equity values, or implied prices.
    All arithmetic is done in Python (pipeline_synthesis.py merge step).

    Returns: {segment_multiples: [{name, multiple_low, multiple_base, multiple_high,
               multiple_basis, rationale}], methodology, source, status}
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker
    yf_info      = (data.get("yfinance") or {}).get("info") or {}
    segments_raw = data.get("fmp_revenue_segments") or []
    peers        = data.get("peer_metrics") or []
    income       = data.get("fmp_income") or []

    total_rev = None
    if income:
        try:
            total_rev = float(income[0].get("revenue") or 0) or None
        except (TypeError, ValueError):
            pass

    default = {
        "segment_multiples": [],
        "methodology":       None,
        "source":            f"{HAIKU_MODEL} [AI narrative] — segment multiple assignment",
        "status":            "unavailable",
    }

    if not segments_raw:
        return default

    # Format segments for prompt (include revenue in $B for context)
    seg_lines = []
    for seg in segments_raw[:8]:
        rev = seg.get("revenue")
        rev_bn = f"${rev/1e9:.1f}B" if rev and rev >= 1e8 else (f"${rev/1e6:.0f}M" if rev else "N/A")
        pct = f"{rev/total_rev*100:.0f}% of total" if rev and total_rev else ""
        seg_lines.append(f"  - {seg['name']}: {rev_bn} {pct}")
    segments_text = "\n".join(seg_lines)

    # Peer multiples context
    peer_lines = []
    for p in peers[:6]:
        ev_e = p.get("ev_ebitda")
        ps   = p.get("ps")
        peer_lines.append(
            f"  {p['symbol']}: EV/EBITDA={f'{ev_e:.1f}x' if ev_e else 'N/A'}  "
            f"EV/Rev={f'{ps:.1f}x' if ps else 'N/A'}"
        )
    peers_text = "\n".join(peer_lines) if peer_lines else "No peer data available."

    sector   = yf_info.get("sector") or ""
    industry = yf_info.get("industry") or ""
    gm_pct   = round(float(yf_info.get("gross_margins", 0) or 0) * 100, 1)

    prompt = f"""You are an equity analyst performing a Sum-of-the-Parts (SOTP) valuation for {company_name} ({ticker}).

Company context:
- Sector: {sector} | Industry: {industry}
- Gross margin: {f'{gm_pct}%' if gm_pct else 'N/A'}

Business segments and their revenues (from FMP financial data):
{segments_text}

Peer group multiples (from market data):
{peers_text}

Your task: Assign appropriate EV/Revenue multiples for each segment.
Use peer multiples as an anchor. Higher-growth segments deserve premium multiples. Lower-growth or commodity segments deserve discounts.

Return ONLY valid JSON — no preamble, no markdown:
{{
  "segment_multiples": [
    {{
      "name": "exact segment name from input",
      "multiple_low":  3.0,
      "multiple_base": 5.0,
      "multiple_high": 7.5,
      "multiple_basis": "EV/Revenue",
      "rationale": "1 sentence explaining this multiple relative to peers/growth"
    }}
  ],
  "methodology": "1-2 sentences describing the SOTP approach and key assumptions."
}}

Rules:
- Include ALL segments listed above (one entry per segment, same name).
- multiple_low/base/high: floats, all positive. low < base < high.
- multiple_basis: always "EV/Revenue" (use this metric for consistency).
- Rationale: reference specific peer multiples or sector norms from the data above.
- Do NOT invent segment names. Use the exact names from the input.
- Do NOT generate revenue figures, equity values, or implied prices — those are calculated separately."""

    raw = _haiku(prompt, max_tokens=800)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        multiples = []
        for m in (parsed.get("segment_multiples") or []):
            multiples.append({
                "name":          str(m.get("name", "")),
                "multiple_low":  float(m.get("multiple_low")  or 1.0),
                "multiple_base": float(m.get("multiple_base") or 2.0),
                "multiple_high": float(m.get("multiple_high") or 3.0),
                "multiple_basis": str(m.get("multiple_basis", "EV/Revenue")),
                "rationale":     str(m.get("rationale") or "")[:200],
            })
        return {
            "segment_multiples": multiples,
            "methodology":       parsed.get("methodology"),
            "source":            f"{HAIKU_MODEL} [AI estimate] — segment multiples based on peer data",
            "status":            "ok",
        }
    except Exception:
        return {
            "segment_multiples": [],
            "methodology":       None,
            "source":            f"{HAIKU_MODEL} [AI estimate]",
            "status":            "parse_error",
            "raw":               raw[:300] if raw else "",
        }


# ---------------------------------------------------------------------------
# Upgrade 1: Market Position (S2) — extract explicitly stated market share only
# ---------------------------------------------------------------------------

def synthesize_market_position(data: dict) -> dict:
    """
    Extract market share %, competitive rank, and named competitors from Tavily.
    STRICT: returns null for market_share_pct if no explicit % found in sources.
    NEVER estimates or fabricates. All values [AI EXTRACTED from Tavily].
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker
    tavily_ms    = data.get("tavily_market_share") or []
    tavily_comp  = data.get("tavily_competitive") or []

    default = {
        "market_share_pct":  None,
        "competitive_rank":  None,
        "named_competitors": [],
        "source_note":       None,
        "source":            f"{HAIKU_MODEL} [AI extracted] — Tavily market share search",
        "status":            "unavailable",
    }

    all_results = (tavily_ms[:4] + tavily_comp[:2])
    if not all_results:
        return default

    search_text = "\n\n".join(
        f"[{i+1}] {r.get('title','')}\nURL: {r.get('url','')}\n{(r.get('content') or '')[:600]}"
        for i, r in enumerate(all_results)
        if r.get("title") or r.get("content")
    )

    prompt = f"""You are analyzing search results about {company_name} ({ticker}) market position.

Search results:
{search_text}

Extract ONLY information explicitly stated in these sources. Do NOT estimate or infer.

Return ONLY valid JSON — no preamble:
{{
  "market_share_pct": "23%" or null,
  "competitive_rank": "#1 in streaming" or null,
  "named_competitors": ["Company A", "Company B"],
  "source_note": "Statista, 2024" or null
}}

Rules:
- market_share_pct: ONLY include if a specific numeric percentage is explicitly stated in the sources. If not found, set null.
- competitive_rank: ONLY include if a specific rank statement is explicitly in the sources (e.g. "#1", "second largest", "market leader in X"). If ambiguous or not stated, set null.
- named_competitors: list up to 5 competitor names explicitly mentioned as direct competitors in the sources.
- source_note: brief citation of the most authoritative source that mentioned the market share/rank.
- NEVER fabricate percentages, ranks, or competitor names not in the sources."""

    raw = _haiku(prompt, max_tokens=400)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        return {
            "market_share_pct":  parsed.get("market_share_pct"),
            "competitive_rank":  parsed.get("competitive_rank"),
            "named_competitors": (parsed.get("named_competitors") or [])[:5],
            "source_note":       parsed.get("source_note"),
            "source":            f"{HAIKU_MODEL} [AI extracted] — Tavily market share search",
            "status":            "ok",
        }
    except Exception:
        return {**default, "status": "parse_error"}


# ---------------------------------------------------------------------------
# Upgrade 2: Brand Value (S6) — extract brand ranking/value if explicitly stated
# ---------------------------------------------------------------------------

def synthesize_brand_value(data: dict) -> dict:
    """
    Extract brand value / ranking from Tavily brand search.
    ONLY for consumer-facing companies. Returns null if not found.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker
    tavily_brand = data.get("tavily_brand") or []
    yf_info      = (data.get("yfinance") or {}).get("info") or {}
    sector       = yf_info.get("sector") or (data.get("fmp_profile") or {}).get("sector") or ""

    _B2C_SECTORS = {"Consumer Cyclical", "Consumer Defensive", "Communication Services"}
    if sector not in _B2C_SECTORS or not tavily_brand:
        return {"brand_value": None, "brand_rank": None, "brand_source": None, "status": "not_applicable"}

    search_text = "\n\n".join(
        f"[{i+1}] {r.get('title','')}\n{(r.get('content') or '')[:500]}"
        for i, r in enumerate(tavily_brand[:4])
        if r.get("title") or r.get("content")
    )

    prompt = f"""You are reviewing search results about {company_name}'s brand value.

{search_text}

Extract ONLY explicitly stated brand value figures or rankings from these sources.

Return ONLY valid JSON:
{{
  "brand_value": "$X.XB" or null,
  "brand_rank": "#42 globally" or null,
  "ranking_list": "Interbrand Best Global Brands 2024" or null,
  "brand_source": "Interbrand, 2024" or null
}}

Rules:
- brand_value: only if a specific $ figure is explicitly stated. Set null otherwise.
- brand_rank: only if an explicit rank number or relative rank is stated. Set null otherwise.
- ranking_list: the name of the specific ranking list (Interbrand, Forbes, BrandZ, etc.) if found.
- NEVER fabricate values. If no brand data is found, return nulls."""

    raw = _haiku(prompt, max_tokens=300)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        return {
            "brand_value":   parsed.get("brand_value"),
            "brand_rank":    parsed.get("brand_rank"),
            "ranking_list":  parsed.get("ranking_list"),
            "brand_source":  parsed.get("brand_source"),
            "source":        f"{HAIKU_MODEL} [AI extracted] — Tavily brand search",
            "status":        "ok",
        }
    except Exception:
        return {"brand_value": None, "brand_rank": None, "ranking_list": None, "brand_source": None, "status": "parse_error"}


# ---------------------------------------------------------------------------
# Upgrade 3: Subscriber Comparison (S8) — competitor subscriber counts
# ---------------------------------------------------------------------------

def synthesize_subscriber_comparison(data: dict) -> dict:
    """
    Extract competitor subscriber / user counts from Tavily.
    ONLY for subscription/streaming businesses. Returns [] if not applicable.
    Each entry is explicitly sourced — never fabricated.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker
    tavily_subs  = data.get("tavily_subscribers") or []
    yf_info      = (data.get("yfinance") or {}).get("info") or {}
    description  = (yf_info.get("long_business_summary") or "").lower()
    sector       = yf_info.get("sector") or ""

    _SUB_KEYWORDS = {"subscriber", "streaming", "saas", "subscription", "monthly active", "paid user"}
    _SUB_SECTORS  = {"Technology", "Communication Services"}
    is_sub_biz = (sector in _SUB_SECTORS and any(kw in description for kw in _SUB_KEYWORDS))

    default = {
        "competitors": [],
        "unit":        "millions",
        "source":      f"{HAIKU_MODEL} [AI extracted] — Tavily subscriber data",
        "status":      "not_applicable",
    }

    if not is_sub_biz or not tavily_subs:
        return default

    search_text = "\n\n".join(
        f"[{i+1}] {r.get('title','')}\n{(r.get('content') or '')[:600]}"
        for i, r in enumerate(tavily_subs[:5])
        if r.get("title") or r.get("content")
    )

    prompt = f"""You are extracting subscriber / user count data for {company_name} ({ticker}) and its competitors.

Search results:
{search_text}

Extract ONLY explicitly stated subscriber or user counts from these sources.

Return ONLY valid JSON:
{{
  "competitors": [
    {{
      "name": "Company Name",
      "subscribers_m": 193.0,
      "unit": "paid subscribers" or "MAU" or "users",
      "date": "Q4 2024" or "2024",
      "source": "brief source citation"
    }}
  ],
  "unit": "millions"
}}

Rules:
- Include {company_name} itself as the FIRST entry if a count is found.
- subscribers_m: number in millions (e.g. 193.0 for 193 million). Set to null if not stated explicitly.
- Only include companies where an explicit count is stated in the sources.
- Up to 6 companies total (including subject).
- NEVER fabricate counts. If no data found, return competitors: []."""

    raw = _haiku(prompt, max_tokens=600)
    try:
        parsed = json.loads(_strip_code_fences(raw))
        comps = []
        for c in (parsed.get("competitors") or []):
            val = c.get("subscribers_m")
            if val is not None:
                try:
                    comps.append({
                        "name":          str(c.get("name", "")),
                        "subscribers_m": float(val),
                        "unit":          str(c.get("unit", "subscribers")),
                        "date":          str(c.get("date", "")),
                        "source":        str(c.get("source", "Tavily")),
                    })
                except (TypeError, ValueError):
                    pass
        return {
            "competitors": comps[:6],
            "unit":        "millions",
            "source":      f"{HAIKU_MODEL} [AI extracted] — Tavily subscriber data",
            "status":      "ok" if comps else "no_data",
        }
    except Exception:
        return {**default, "status": "parse_error"}


def synthesize_brand_colors(data: dict) -> dict:
    """
    Ask Haiku for well-known brand hex colors for this company.
    Returns primary/secondary hex + text contrast hint.
    Returns null values if company colors are not well-known — never fabricates.
    """
    ticker       = (data.get("_meta") or {}).get("ticker", "")
    company_name = (data.get("fmp_profile") or {}).get("company_name") or \
                   ((data.get("yfinance") or {}).get("info") or {}).get("company_name") or ticker

    default = {
        "primary":       None,
        "secondary":     None,
        "on_brand_text": "light",
        "confidence":    "not_found",
        "source":        f"{HAIKU_MODEL} [AI brand knowledge]",
        "status":        "ok",
    }

    prompt = f"""Return the official primary and secondary hex brand colors for {company_name} ({ticker}).

Only return colors you are CERTAIN about from well-known brand guidelines (e.g. Coca-Cola red #F40009, Apple #555555, Netflix red #E50914).
If you are not confident, return null for both.

Return ONLY valid JSON — no explanations:
{{
  "primary": "#rrggbb or null",
  "secondary": "#rrggbb or null",
  "on_brand_text": "light or dark",
  "confidence": "certain or uncertain"
}}

Rules:
- primary: single most recognisable brand color
- secondary: complementary brand color, or null
- on_brand_text: "dark" only if white text is NOT readable on primary (e.g. yellow #FFD700 backgrounds)
- confidence: "certain" only if you know the official brand; "uncertain" if guessing"""

    try:
        raw    = _haiku(prompt, max_tokens=150)
        parsed = json.loads(_strip_code_fences(raw))

        def _valid_hex(h: object) -> bool:
            if not isinstance(h, str) or len(h) != 7 or h[0] != "#":
                return False
            try:
                int(h[1:], 16)
                return True
            except ValueError:
                return False

        primary   = parsed.get("primary")   if _valid_hex(parsed.get("primary"))   else None
        secondary = parsed.get("secondary") if _valid_hex(parsed.get("secondary")) else None
        return {
            "primary":       primary,
            "secondary":     secondary,
            "on_brand_text": parsed.get("on_brand_text", "light"),
            "confidence":    parsed.get("confidence", "uncertain"),
            "source":        f"{HAIKU_MODEL} [AI brand knowledge]",
            "status":        "ok" if primary else "not_found",
        }
    except Exception:
        return default


# ---------------------------------------------------------------------------
# Peer ticker selection — runs before fetch_peer_yfinance_metrics
# ---------------------------------------------------------------------------

def synthesize_peer_tickers(
    ticker: str,
    company_name: str,
    sector: str,
    industry: str,
    description: str,
) -> list[str]:
    """
    Ask Haiku for 5 business-model-relevant publicly-traded peer tickers.
    Returns a validated list of uppercase ticker strings (may be empty on failure).
    Called between data Phase 1 and Phase 2 — not part of the main section synthesis.
    """
    prompt = f"""You are an equity analyst selecting peer companies for a valuation comparables table.

Subject company:
- Ticker: {ticker}
- Name: {company_name}
- Sector: {sector}
- Industry: {industry}
- Business: {description[:600]}

Identify exactly 5 publicly-traded US stocks that are the most relevant valuation peers for {ticker}.
Prioritise companies with:
1. The same core business model (not just same sector)
2. Similar business maturity / stage
3. Active trading on NYSE or NASDAQ with widely available financial data

Return ONLY a JSON array of 5 ticker symbols, nothing else:
["TICK1", "TICK2", "TICK3", "TICK4", "TICK5"]

Rules:
- Do not include {ticker} itself.
- Return only the JSON array — no explanation, no markdown fences."""

    raw = _haiku(prompt, max_tokens=80)
    try:
        cleaned = _strip_code_fences(raw).strip()
        peers = json.loads(cleaned)
        if isinstance(peers, list):
            return [str(t).upper().strip() for t in peers if isinstance(t, str) and t.strip()][:6]
    except Exception:
        pass
    logger.warning("[%s] synthesize_peer_tickers failed to parse: %s", ticker, raw[:200])
    return []


# ---------------------------------------------------------------------------
# Technical Pattern Recognition (Haiku) — Section 7 enrichment
# ---------------------------------------------------------------------------

def synthesize_technical_patterns(data: dict, s7: dict) -> dict:
    """
    Haiku identifies classical chart patterns and provides a plain-English
    technical read. Inputs are structured numeric data only — no price chart images.
    AI output: pattern names, reasoning, setup quality assessment.
    """
    tech       = data.get("technicals") or {}
    ticker     = (data.get("_meta") or {}).get("ticker", "")
    yf_info    = (data.get("yfinance") or {}).get("info") or {}
    company    = yf_info.get("company_name") or ticker

    def _fv(f):
        if isinstance(f, dict) and "value" in f:
            return f["value"]
        return f

    rsi         = _fv(s7.get("rsi"))
    sma50       = _fv(s7.get("sma_50"))
    sma200      = _fv(s7.get("sma_200"))
    macd_line   = _fv(s7.get("macd_line"))
    macd_sig    = _fv(s7.get("macd_signal"))
    macd_hist   = _fv(s7.get("macd_hist"))
    bb_upper    = _fv(s7.get("bb_upper"))
    bb_lower    = _fv(s7.get("bb_lower"))
    bb_pos      = _fv(s7.get("bb_position"))
    atr_pct     = _fv(s7.get("atr_pct"))
    support     = _fv(s7.get("support"))
    resistance  = _fv(s7.get("resistance"))
    pct_52w     = _fv(s7.get("pct_from_52w_high"))
    vol_ratio   = _fv(s7.get("volume_vs_20d_avg"))
    trend       = _fv(s7.get("trend_signal"))
    quant       = _fv(s7.get("quant_score"))
    current     = _fv(s7.get("current_price")) or yf_info.get("current_price")

    # 5Y monthly price samples from yfinance for context (25 months max)
    price_5y = (data.get("yfinance") or {}).get("price_history_5y")
    monthly_closes: list[dict] = []
    try:
        if price_5y is not None and not price_5y.empty:
            closes = price_5y["Close"].squeeze().dropna()
            step = max(1, len(closes) // 25)
            for dt, px in closes.iloc[::step].items():
                monthly_closes.append({"date": str(dt)[:10], "close": round(float(px), 2)})
            monthly_closes = monthly_closes[-24:]  # last 24 samples
    except Exception:
        pass

    structured = {
        "ticker": ticker,
        "company": company,
        "current_price": current,
        "trend_signal": trend,
        "quant_entry_score": quant,
        "rsi_14": rsi,
        "sma50": sma50,
        "sma200": sma200,
        "macd_line": macd_line,
        "macd_signal": macd_sig,
        "macd_histogram": macd_hist,
        "bb_upper": bb_upper,
        "bb_lower": bb_lower,
        "bb_position_pct": bb_pos,
        "support_level": support,
        "resistance_level": resistance,
        "pct_from_52w_high": pct_52w,
        "volume_vs_20d_avg": vol_ratio,
        "atr_pct": atr_pct,
        "monthly_price_samples": monthly_closes,
    }

    prompt = f"""You are a senior technical analyst at a hedge fund. Analyse the following technical data for {ticker}:

{json.dumps(structured, indent=2)}

Write a concise technical analysis covering:

1. **Chart Pattern** — Identify the most likely classical pattern visible from the price samples and indicators:
   - Examples: Cup & Handle, Ascending Triangle, Bull Flag, Head & Shoulders, Double Bottom, Breakout, Range-bound, Downtrend channel, Base building, Rounding bottom
   - Be specific — name the pattern, describe what evidence supports it, and note any invalidation levels.

2. **Trend & Momentum Assessment** — Interpret the MACD, RSI, and SMA configuration together. What does the combination tell us?

3. **Key Levels** — Identify the most important support and resistance levels and why they matter.

4. **Volume Story** — What does the volume ratio suggest about conviction behind recent price moves?

5. **Entry Setup Quality** — Given the quant_entry_score of {quant}, explain plainly why the entry timing is rated this way. If the trend is strong but score is low, explain the contradiction clearly (e.g., "strong trend but overbought RSI means chasing — better to wait for a pullback to SMA50").

6. **Pattern Outlook** — In 1-2 sentences, what does the technical picture suggest for the next 4-8 weeks?

Rules:
- Do NOT generate any price targets, earnings estimates, or fundamental analysis
- DO reference the actual numbers provided (RSI {rsi}, etc.)
- Write in plain English — avoid jargon overload
- Keep total response under 400 words
- Format exactly as JSON:
{{
  "chart_pattern": "<pattern name>",
  "pattern_evidence": "<1-2 sentences of evidence>",
  "pattern_invalidation": "<what would break the pattern>",
  "momentum_read": "<2-3 sentences on MACD/RSI/SMA combo>",
  "key_levels_narrative": "<support/resistance commentary>",
  "volume_narrative": "<volume story>",
  "entry_quality_explanation": "<plain English quant score explanation>",
  "outlook_4_8w": "<1-2 sentences>",
  "source": "{HAIKU_MODEL} [AI narrative] — yfinance technical indicators"
}}"""

    raw = _haiku(prompt, max_tokens=800)
    try:
        cleaned = _strip_code_fences(raw).strip()
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and "chart_pattern" in parsed:
            return parsed
    except Exception:
        pass

    # Fallback: return raw text in a structured envelope
    logger.warning("[%s] synthesize_technical_patterns parse failed: %s", ticker, raw[:200])
    return {
        "chart_pattern": None,
        "momentum_read": raw[:500] if raw else None,
        "entry_quality_explanation": None,
        "outlook_4_8w": None,
        "source": f"{HAIKU_MODEL} [AI narrative]",
    }
