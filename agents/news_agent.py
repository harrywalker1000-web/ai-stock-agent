"""
Agent 4 — News & Catalyst Agent
Phase 1 (parallel with Agents 1, 2, 3)

Scans the information environment for company-specific events and catalysts
that could drive price movement. Distinguishes fresh catalysts (not yet priced
in) from stale ones (market has already reacted).

Data sources: Finnhub, NewsAPI, yfinance earnings calendar.
Reddit (PRAW): optional — skipped gracefully if REDDIT_CLIENT_ID='skip_for_now'.
"""

import json
import os
import pathlib
from datetime import datetime, timedelta

import yfinance as yf
from dotenv import load_dotenv
from openai import OpenAI

from utils.data_fetcher import (
    fetch_finnhub_company_news,
    fetch_finnhub_earnings_calendar,
    fetch_finnhub_market_news,
    fetch_news_headlines,
    fetch_news_top_headlines,
    fetch_ticker_info,
)
import agents.memory_agent as memory
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

# Tickers to scan for company-specific catalysts
CATALYST_TICKERS = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "V",
    "UNH", "XOM", "CVX", "LLY", "JNJ", "WMT", "PLTR", "COIN", "AMD",
    "INTC", "QCOM", "AVGO", "CRM", "ORCL", "BA", "CAT", "GS", "MS",
    "RTX", "LMT", "NOC", "NVO", "ABBV", "MRK", "PFE", "MRNA", "BNTX",
    "RIVN", "F", "GM", "UBER", "LYFT", "SHOP", "SQ", "PYPL", "SNOW",
]

# Subreddits to monitor (used only when Reddit credentials are active)
REDDIT_SUBREDDITS = ["stocks", "investing", "wallstreetbets"]


# ---------------------------------------------------------------------------
# Reddit — optional
# ---------------------------------------------------------------------------

def _reddit_enabled() -> bool:
    client_id = os.environ.get("REDDIT_CLIENT_ID", "")
    return bool(client_id) and client_id.lower() != "skip_for_now"


def _fetch_reddit_mentions(tickers: list[str]) -> dict[str, dict]:
    """
    Return mention counts and sentiment per ticker from Reddit.
    Returns empty dict if Reddit is disabled or credentials are missing.
    """
    if not _reddit_enabled():
        logger.info("News Agent: Reddit skipped (REDDIT_CLIENT_ID=skip_for_now or not set)")
        return {}

    from utils.data_fetcher import fetch_reddit_mentions

    results = {}
    # Only scan top tickers to stay within rate limits
    for ticker in tickers[:15]:
        try:
            data = fetch_reddit_mentions(
                ticker,
                subreddits=REDDIT_SUBREDDITS,
                days_back=7,
                limit=100,
            )
            if data.get("post_count", 0) > 0:
                results[ticker] = data
        except Exception as exc:
            logger.warning("Reddit mention fetch failed for %s: %s", ticker, exc)

    logger.info("News Agent: Reddit mentions fetched for %d tickers", len(results))
    return results


# ---------------------------------------------------------------------------
# Earnings calendar
# ---------------------------------------------------------------------------

def _fetch_upcoming_earnings() -> list[dict]:
    """Fetch earnings announcements for the next 10 trading days."""
    upcoming = []

    # Finnhub earnings calendar
    try:
        cal = fetch_finnhub_earnings_calendar()
        for item in cal.get("earningsCalendar", [])[:50]:
            date_str = item.get("date", "")
            try:
                event_date = datetime.strptime(date_str, "%Y-%m-%d")
                days_until = (event_date - datetime.utcnow()).days
                if 0 <= days_until <= 10:
                    upcoming.append({
                        "ticker": item.get("symbol", ""),
                        "date": date_str,
                        "days_until": days_until,
                        "eps_estimate": item.get("epsEstimate"),
                        "source": "finnhub",
                    })
            except ValueError:
                continue
    except Exception as exc:
        logger.warning("Finnhub earnings calendar failed: %s", exc)

    # Supplement with yfinance for specific tickers
    for ticker in CATALYST_TICKERS[:20]:
        try:
            cal = yf.Ticker(ticker).calendar
            if cal is None:
                continue
            # yfinance calendar is a dict with 'Earnings Date' key
            if isinstance(cal, dict):
                earn_dates = cal.get("Earnings Date", [])
                if earn_dates:
                    date_val = earn_dates[0] if isinstance(earn_dates, list) else earn_dates
                    if hasattr(date_val, "strftime"):
                        date_str = date_val.strftime("%Y-%m-%d")
                        days_until = (date_val.replace(tzinfo=None) - datetime.utcnow()).days
                        if 0 <= days_until <= 10:
                            # Avoid duplicates
                            if not any(e["ticker"] == ticker for e in upcoming):
                                upcoming.append({
                                    "ticker": ticker,
                                    "date": date_str,
                                    "days_until": days_until,
                                    "eps_estimate": None,
                                    "source": "yfinance",
                                })
        except Exception:
            continue

    upcoming.sort(key=lambda x: x["days_until"])
    return upcoming[:20]


# ---------------------------------------------------------------------------
# Company-specific news with freshness scoring
# ---------------------------------------------------------------------------

def _score_freshness(published_str: str) -> tuple[str, int]:
    """
    Return a (label, score) tuple for how fresh a news item is.
    Score: 3=today, 2=yesterday, 1=2-5 days, 0=stale (>5 days)
    """
    try:
        # Handle multiple date formats from different APIs
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                pub_dt = datetime.strptime(published_str[:19], fmt[:len(published_str[:19])])
                break
            except ValueError:
                continue
        else:
            return "unknown", 1

        age_hours = (datetime.utcnow() - pub_dt).total_seconds() / 3600
        if age_hours < 24:
            return "today", 3
        elif age_hours < 48:
            return "yesterday", 2
        elif age_hours < 120:
            return "2-5 days ago", 1
        else:
            return "stale (>5 days)", 0
    except Exception:
        return "unknown", 1


def _fetch_company_catalysts(tickers: list[str]) -> list[dict]:
    """Scan Finnhub and NewsAPI for fresh company-specific catalysts."""
    catalysts = []

    for ticker in tickers:
        # Finnhub company news
        articles = fetch_finnhub_company_news(ticker, days_back=7)
        for article in articles[:5]:
            headline = article.get("headline", "")
            if not headline:
                continue
            pub_str = datetime.utcfromtimestamp(article.get("datetime", 0)).strftime("%Y-%m-%dT%H:%M:%S")
            freshness_label, freshness_score = _score_freshness(pub_str)

            # Keyword-based catalyst detection
            catalyst_type = _classify_catalyst(headline)
            if catalyst_type:
                catalysts.append({
                    "ticker": ticker,
                    "headline": headline,
                    "catalyst_type": catalyst_type,
                    "source": "finnhub",
                    "published": pub_str,
                    "freshness": freshness_label,
                    "freshness_score": freshness_score,
                    "url": article.get("url", ""),
                })

        # NewsAPI company-specific search
        news_articles = fetch_news_headlines(f'"{ticker}" stock', days_back=5, page_size=5)
        for article in news_articles[:3]:
            headline = article.get("title", "")
            if not headline:
                continue
            pub_str = article.get("publishedAt", "")[:19]
            freshness_label, freshness_score = _score_freshness(pub_str)
            catalyst_type = _classify_catalyst(headline)
            if catalyst_type:
                catalysts.append({
                    "ticker": ticker,
                    "headline": headline,
                    "catalyst_type": catalyst_type,
                    "source": "newsapi",
                    "published": pub_str,
                    "freshness": freshness_label,
                    "freshness_score": freshness_score,
                    "url": article.get("url", ""),
                })

    # Deduplicate and track cross-source confirmation
    # If the same ticker + catalyst_type appears in BOTH finnhub AND newsapi,
    # that's independent corroboration → higher confidence
    from collections import defaultdict
    by_key: dict = defaultdict(list)
    for c in catalysts:
        key = (c["ticker"], c["catalyst_type"])
        by_key[key].append(c)

    deduped = []
    seen_headlines = set()
    for (ticker, cat_type), group in by_key.items():
        sources = list({g["source"] for g in group})
        best = sorted(group, key=lambda x: x["freshness_score"], reverse=True)[0]
        if best["headline"][:60] in seen_headlines:
            continue
        seen_headlines.add(best["headline"][:60])

        n_sources = len(sources)
        if n_sources >= 2:
            confidence_level = "medium"  # Two independent sources
        elif best["freshness_score"] == 3:
            confidence_level = "low_fresh"  # Fresh but single source
        else:
            confidence_level = "low"

        best["confirmed_by_sources"] = sources
        best["source_count"] = n_sources
        best["signal_confidence"] = {
            "level": confidence_level,
            "sources_count": n_sources,
            "sources": sources,
            "note": "multi-source confirmation" if n_sources >= 2 else "single source — treat with caution",
        }
        deduped.append(best)

    return sorted(deduped, key=lambda x: (x["source_count"], x["freshness_score"]), reverse=True)


def _classify_catalyst(headline: str) -> str | None:
    """Return catalyst type if headline contains a relevant keyword, else None."""
    h = headline.lower()
    if any(w in h for w in ["fda", "approval", "approved", "drug", "trial", "phase"]):
        return "FDA/regulatory"
    if any(w in h for w in ["earnings", "beat", "miss", "revenue", "eps", "guidance"]):
        return "earnings"
    if any(w in h for w in ["merger", "acquisition", "takeover", "buyout", "deal"]):
        return "M&A"
    if any(w in h for w in ["contract", "partnership", "agreement", "awarded"]):
        return "contract/partnership"
    if any(w in h for w in ["ceo", "cfo", "executive", "resign", "appoint", "depart"]):
        return "management_change"
    if any(w in h for w in ["upgrade", "downgrade", "price target", "initiated", "outperform"]):
        return "analyst_action"
    if any(w in h for w in ["short", "squeeze", "short interest", "short seller"]):
        return "short_interest"
    if any(w in h for w in ["tariff", "sanction", "ban", "regulation", "lawsuit", "sec"]):
        return "regulatory_risk"
    if any(w in h for w in ["buyback", "dividend", "split", "offering", "dilut"]):
        return "corporate_action"
    return None


# ---------------------------------------------------------------------------
# Broad market catalyst scan
# ---------------------------------------------------------------------------

def _fetch_market_catalysts() -> list[dict]:
    """Scan for broad macro/market catalysts from Finnhub and NewsAPI."""
    items = []

    market_news = fetch_finnhub_market_news("general")
    for article in market_news[:20]:
        headline = article.get("headline", "")
        if not headline:
            continue
        pub_str = datetime.utcfromtimestamp(article.get("datetime", 0)).strftime("%Y-%m-%dT%H:%M:%S")
        freshness_label, freshness_score = _score_freshness(pub_str)
        if freshness_score >= 1:
            items.append({
                "headline": headline,
                "source": "finnhub",
                "freshness": freshness_label,
                "freshness_score": freshness_score,
            })

    top_headlines = fetch_news_top_headlines("business")
    for article in top_headlines[:10]:
        headline = article.get("title", "")
        if not headline:
            continue
        pub_str = article.get("publishedAt", "")[:19]
        freshness_label, freshness_score = _score_freshness(pub_str)
        if freshness_score >= 1:
            items.append({
                "headline": headline,
                "source": "newsapi",
                "freshness": freshness_label,
                "freshness_score": freshness_score,
            })

    items.sort(key=lambda x: x["freshness_score"], reverse=True)
    return items[:20]


# ---------------------------------------------------------------------------
# Collect everything
# ---------------------------------------------------------------------------

def _collect_news_data() -> dict:
    logger.info("News Agent: collecting catalysts and news")

    company_catalysts = _fetch_company_catalysts(CATALYST_TICKERS)
    market_catalysts = _fetch_market_catalysts()
    upcoming_earnings = _fetch_upcoming_earnings()
    reddit_mentions = _fetch_reddit_mentions(CATALYST_TICKERS)

    logger.info(
        "News Agent: found %d company catalysts, %d market catalysts, %d upcoming earnings, %d Reddit tickers",
        len(company_catalysts), len(market_catalysts), len(upcoming_earnings), len(reddit_mentions),
    )

    return {
        "company_catalysts": company_catalysts,
        "market_catalysts": market_catalysts,
        "upcoming_earnings": upcoming_earnings,
        "reddit_mentions": reddit_mentions,
        "reddit_enabled": _reddit_enabled(),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


# ---------------------------------------------------------------------------
# Format for LLM prompt
# ---------------------------------------------------------------------------

def _format_catalysts(catalysts: list[dict], max_items: int = 30) -> str:
    if not catalysts:
        return "None found."
    lines = []
    for c in catalysts[:max_items]:
        conf = c.get("signal_confidence", {})
        src_count = conf.get("sources_count", 1)
        conf_label = f"[{src_count}src/{conf.get('level','?')}]"
        lines.append(
            f"[{c['freshness']:>15}] {conf_label:<16} {c['ticker']:<6} "
            f"[{c['catalyst_type']:>20}] {c['headline'][:100]}"
        )
    return "\n".join(lines)


def _format_upcoming_earnings(earnings: list[dict]) -> str:
    if not earnings:
        return "None in next 10 days."
    lines = []
    for e in earnings:
        est = f" (EPS est: {e['eps_estimate']})" if e.get("eps_estimate") else ""
        lines.append(f"  {e['ticker']:<7} {e['date']}  ({e['days_until']} days){est}")
    return "\n".join(lines)


def _format_reddit(reddit_mentions: dict) -> str:
    if not reddit_mentions:
        return "Reddit data not available."
    lines = []
    for ticker, data in sorted(reddit_mentions.items(), key=lambda x: x[1]["post_count"], reverse=True):
        lines.append(f"  {ticker:<7} {data['post_count']:>4} posts in last 7 days")
    return "\n".join(lines) if lines else "No significant Reddit activity."


def _load_macro_context() -> str:
    macro_path = pathlib.Path("data/reports/macro_report.json")
    if macro_path.exists():
        try:
            with open(macro_path) as f:
                macro = json.load(f)
            return f"Regime: {macro.get('regime')} | Geopolitical risks: {'; '.join(macro.get('geopolitical_risks', []))}"
        except Exception:
            pass
    return "Not available."


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _analyse_with_llm(raw_data: dict) -> dict:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    macro_context = _load_macro_context()

    system_prompt = """You are the News & Catalyst Agent for an AI hedge fund system.
You have been given real, live news and event data fetched today from financial news APIs.
Each catalyst has a pre-computed signal_confidence showing how many independent sources
(Finnhub, NewsAPI) reported the same event.

CRITICAL RULES:
- Only use the data provided. Do not invent news or events.
- FRESHNESS IS EVERYTHING. A catalyst from today is far more valuable than one from 5 days ago.
- CONFIDENCE IS MANDATORY: the [Nsrc/level] prefix shows source count. Use it.
  - 1 source = low confidence → include in fresh_catalysts but flag it clearly.
  - 2+ sources = medium+ confidence → higher weight, these are the priority picks.
  - A low-confidence catalyst must NEVER be the sole reason a stock makes the top_catalyst_tickers list.
- FDA approvals and M&A are the highest-impact types regardless of source count.
- Reddit euphoria (high mention volume) is often a SHORT signal — flag it.
- Your output must be valid JSON matching the schema exactly.

Output this JSON schema:
{
  "fresh_catalysts": [
    {
      "ticker": "string",
      "catalyst": "concise description of the specific event",
      "catalyst_type": "earnings | FDA/regulatory | M&A | contract/partnership | management_change | analyst_action | short_interest | regulatory_risk | corporate_action",
      "direction": "LONG | SHORT",
      "freshness": "today | yesterday | 2-5 days ago",
      "priced_in_estimate": "not priced in | partial | likely priced in",
      "signal_confidence": {
        "level": "high | medium | low",
        "sources_count": <integer>,
        "sources": ["finnhub", "newsapi"],
        "note": "multi-source confirmation | single source — treat with caution"
      },
      "reasoning": "why this is actionable; explicitly state confidence level"
    }
  ],
  "stale_catalysts": [
    {
      "ticker": "string",
      "catalyst": "string",
      "reason_stale": "why this is likely already priced in"
    }
  ],
  "upcoming_events": [
    {
      "ticker": "string",
      "event": "earnings",
      "date": "YYYY-MM-DD",
      "days_until": number,
      "positioning_note": "how to position pre-event"
    }
  ],
  "reddit_unusual": [
    {
      "ticker": "string",
      "post_count": number,
      "signal": "LONG | SHORT | neutral",
      "interpretation": "what the Reddit activity suggests"
    }
  ],
  "top_catalyst_tickers": ["list of 5-8 tickers with the most actionable catalysts today"],
  "news_summary": "3-4 sentence paragraph summarising today's most important catalysts for downstream agents",
  "confidence": <0-100>
}"""

    # Build catalyst outcome memory: did past catalysts for these tickers actually play out?
    catalyst_tickers = list({c["ticker"] for c in raw_data.get("company_catalysts", [])})
    catalyst_memory_lines = []
    for tkr in catalyst_tickers[:10]:
        outcomes = memory.get_ticker_outcome_history(tkr, limit=2)
        if outcomes:
            for o in outcomes:
                pnl = o.get("pnl_pct")
                reason = o.get("exit_reason", "?")
                entry_d = o.get("entry_date", "?")
                pnl_str = f"{pnl:+.1f}%" if pnl is not None else "open"
                catalyst_memory_lines.append(f"  {tkr}: prior trade {entry_d} → {pnl_str} [{reason}]")
    catalyst_memory_block = (
        "\nCATALYST OUTCOME MEMORY (did past catalysts pay off?):\n"
        + "\n".join(catalyst_memory_lines)
        + "\nUse this to weight how much to trust current catalysts for these names.\n"
    ) if catalyst_memory_lines else ""

    user_prompt = f"""Here is today's live news and catalyst data. Analyse it and return your JSON assessment.
{catalyst_memory_block}
MACRO CONTEXT: {macro_context}
REDDIT STATUS: {'Active — data included below' if raw_data['reddit_enabled'] else 'Skipped (not configured)'}

=== COMPANY-SPECIFIC CATALYSTS (last 7 days, sorted by freshness) ===
Format: [freshness] TICKER [catalyst_type] headline
{_format_catalysts(raw_data['company_catalysts'])}

=== BROAD MARKET CATALYSTS ===
{chr(10).join(f"[{c['freshness']:>15}] {c['headline'][:130]}" for c in raw_data['market_catalysts'][:15])}

=== UPCOMING EARNINGS (next 10 days — pre-earnings positioning opportunities) ===
{_format_upcoming_earnings(raw_data['upcoming_earnings'])}

=== REDDIT MENTION VOLUME (last 7 days) ===
{_format_reddit(raw_data['reddit_mentions'])}

Data as of: {raw_data['as_of']}

Prioritise catalysts that are:
1. From today or yesterday (freshest)
2. FDA/regulatory or M&A type (highest impact)
3. Pre-earnings positioning (3-5 days before announcement)
4. Any unusual Reddit spikes worth flagging

Return ONLY valid JSON. No markdown, no explanation outside the JSON."""

    logger.info("News Agent: sending data to GPT-4o-mini")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    result = json.loads(response.choices[0].message.content)
    logger.info(
        "News Agent: identified %d fresh catalysts, %d upcoming events, %d stale",
        len(result.get("fresh_catalysts", [])),
        len(result.get("upcoming_events", [])),
        len(result.get("stale_catalysts", [])),
    )
    return result


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run() -> dict:
    logger.info("=== News Agent starting ===")

    raw_data = _collect_news_data()
    result = _analyse_with_llm(raw_data)

    result["raw_data"] = raw_data
    result["generated_at"] = datetime.utcnow().isoformat()

    output_dir = pathlib.Path("data/reports")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "news_report.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)

    logger.info("News Agent: report saved to %s", output_path)
    logger.info("=== News Agent complete ===")
    return result


if __name__ == "__main__":
    result = run()
    printable = {k: v for k, v in result.items() if k != "raw_data"}
    print(json.dumps(printable, indent=2))
