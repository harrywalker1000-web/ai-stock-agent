"""
Agent 8 — Sentiment Analyst
Phase 3: runs in parallel with Agents 6 (Fundamental) and 7 (Quant).

Data sources:
  Primary:   yfinance — analyst consensus, price targets, short interest
  Secondary: Finnhub — recommendation_trends (monthly buy/hold/sell counts)
  Tertiary:  news_report.json (Agent 4 output) — pre-fetched catalysts per ticker
  Optional:  PRAW (Reddit) — skipped if REDDIT_CLIENT_ID='skip_for_now'

Multi-source confidence:
  Source 1: analyst consensus (yfinance mean + Finnhub breakdown — agreement = confirm)
  Source 2: news sentiment (direction of Agent 4 catalysts for this ticker)
  Source 3: retail sentiment (Reddit — only when PRAW is enabled)

Contrarian flag: retail_euphoria_warning fires when Reddit mentions are very high
AND sentiment strongly bullish — warns this may be a contrarian signal.

Supports mode='portfolio_review' for Phase A thesis tracking (adds sentiment_shift_note).
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path

import yfinance as yf
from dotenv import load_dotenv
from openai import OpenAI

try:
    import finnhub as _finnhub_lib
    _FINNHUB_AVAILABLE = True
except ImportError:
    _finnhub_lib = None
    _FINNHUB_AVAILABLE = False

from utils.data_fetcher import fetch_fmp_price_targets, fetch_fmp_upgrades_downgrades
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
OUT_PATH = REPORTS_DIR / "sentiment_report.json"
POSITIONS_LOG_PATH = ROOT / "data" / "memory" / "positions_log.json"

MAX_CANDIDATES = 50

# Freshness weight map — matches Agent 4's freshness labels
FRESHNESS_WEIGHT = {"today": 1.0, "yesterday": 0.7, "this_week": 0.4, "older": 0.2}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _analyst_label(mean: float | None) -> str:
    """Convert yfinance recommendationMean (1-5) to readable label."""
    if mean is None:
        return "No consensus"
    if mean <= 1.5:
        return "Strong Buy"
    if mean <= 2.5:
        return "Buy"
    if mean <= 3.5:
        return "Hold"
    if mean <= 4.5:
        return "Sell"
    return "Strong Sell"


def _load_position_context(ticker: str) -> dict | None:
    if not POSITIONS_LOG_PATH.exists():
        return None
    try:
        with open(POSITIONS_LOG_PATH) as f:
            log = json.load(f)
        return log.get(ticker)
    except Exception:
        return None


def _fmt_position_section(position_context: dict | None) -> str:
    if not position_context:
        return ""
    entry_price = position_context.get("entry_price", "N/A")
    direction = position_context.get("direction", "LONG")
    thesis = position_context.get("entry_thesis", "Not recorded")
    entry_date = position_context.get("entry_date", "Unknown")
    return (
        f"\nPORTFOLIO REVIEW — ORIGINAL ENTRY THESIS:\n"
        f"  Entry date: {entry_date}\n"
        f"  Entry price: ${entry_price}\n"
        f"  Direction: {direction}\n"
        f"  Original thesis: {thesis}\n\n"
    )


# ---------------------------------------------------------------------------
# Data fetchers
# ---------------------------------------------------------------------------

def _fetch_yf_sentiment(ticker: str) -> dict:
    """Fetch analyst consensus, price targets, and short interest from yfinance."""
    result: dict = {
        "recommendation_mean": None,
        "num_analysts": None,
        "analyst_label": "No consensus",
        "target_mean": None,
        "target_high": None,
        "target_low": None,
        "current_price": None,
        "upside_pct": None,
        "short_ratio": None,
        "short_pct_float": None,
    }
    try:
        info = yf.Ticker(ticker).info
        mean = info.get("recommendationMean")
        current = info.get("currentPrice") or info.get("regularMarketPrice")
        target_mean = info.get("targetMeanPrice")
        result.update({
            "recommendation_mean": mean,
            "num_analysts": info.get("numberOfAnalystOpinions"),
            "analyst_label": _analyst_label(mean),
            "target_mean": target_mean,
            "target_high": info.get("targetHighPrice"),
            "target_low": info.get("targetLowPrice"),
            "current_price": current,
            "short_ratio": info.get("shortRatio"),
            "short_pct_float": info.get("shortPercentOfFloat"),
        })
        if current and target_mean:
            result["upside_pct"] = round((target_mean - current) / current * 100, 1)
    except Exception as exc:
        logger.warning("yfinance sentiment fetch failed for %s: %s", ticker, exc)
    return result


def _fetch_finnhub_consensus(ticker: str, fh_client) -> dict:
    """Fetch recommendation_trends from Finnhub — most recent month's buy/hold/sell."""
    result = {
        "strong_buy": None, "buy": None, "hold": None,
        "sell": None, "strong_sell": None, "period": None,
    }
    if fh_client is None:
        return result
    try:
        trends = fh_client.recommendation_trends(ticker)
        if trends:
            latest = trends[0]
            result.update({
                "strong_buy": latest.get("strongBuy", 0),
                "buy": latest.get("buy", 0),
                "hold": latest.get("hold", 0),
                "sell": latest.get("sell", 0),
                "strong_sell": latest.get("strongSell", 0),
                "period": latest.get("period"),
            })
    except Exception as exc:
        logger.debug("Finnhub consensus failed for %s: %s", ticker, exc)
    return result


def _fetch_fmp_analyst_signals(ticker: str) -> dict:
    """
    Fetch analyst price target summary and upgrades/downgrades from FMP.
    Uses price-target-summary (free tier) which returns aggregated stats rather than
    per-analyst rows. upgrades-downgrades returns empty on the free tier.
    """
    fmp_key = os.environ.get("FMP_API_KEY", "").strip()
    if not fmp_key:
        return {"available": False}

    try:
        # price-target-summary returns [{symbol, lastMonthCount, lastMonthAvgPriceTarget,
        # lastQuarterCount, lastQuarterAvgPriceTarget, lastYearAvgPriceTarget, ...}]
        target_summary = fetch_fmp_price_targets(ticker)
        upgrades = fetch_fmp_upgrades_downgrades(ticker, limit=10)

        # Parse aggregated price target summary
        summary = target_summary[0] if target_summary else {}
        avg_fmp_target = summary.get("lastMonthAvgPriceTarget") or summary.get("lastQuarterAvgPriceTarget")
        target_count = summary.get("lastMonthCount") or summary.get("lastQuarterCount") or 0

        # Count upgrades vs downgrades (empty on free tier; handled gracefully)
        upgrade_count = sum(1 for u in (upgrades or []) if str(u.get("action", "")).lower() == "upgrade")
        downgrade_count = sum(1 for u in (upgrades or []) if str(u.get("action", "")).lower() == "downgrade")
        initiation_count = sum(1 for u in (upgrades or []) if "init" in str(u.get("action", "")).lower())

        return {
            "available": True,
            "avg_target_price": round(float(avg_fmp_target), 2) if avg_fmp_target else None,
            "target_count": target_count,
            "last_quarter_avg_target": summary.get("lastQuarterAvgPriceTarget"),
            "last_year_avg_target": summary.get("lastYearAvgPriceTarget"),
            "upgrades_recent": upgrade_count,
            "downgrades_recent": downgrade_count,
            "initiations_recent": initiation_count,
            "upgrade_momentum": (
                "improving" if upgrade_count > downgrade_count
                else "deteriorating" if downgrade_count > upgrade_count
                else "stable"
            ),
        }
    except Exception as exc:
        logger.debug("FMP analyst signals failed for %s: %s", ticker, exc)
        return {"available": False, "error": str(exc)}


def _extract_news_sentiment(ticker: str, fresh: list[dict], stale: list[dict]) -> dict:
    """
    Parse Agent 4's fresh + stale catalysts to derive a sentiment picture.
    Catalysts already have a direction field (LONG / SHORT) so no keyword guessing needed.
    """
    all_catalysts = [c for c in (fresh + stale) if c.get("ticker", "").upper() == ticker.upper()]
    if not all_catalysts:
        return {
            "found": False, "long_weight": 0.0, "short_weight": 0.0,
            "net_score": 0.0, "total_catalysts": 0, "top_catalyst": None,
        }

    long_weight = 0.0
    short_weight = 0.0
    top_catalyst = all_catalysts[0].get("catalyst", "")

    for c in all_catalysts:
        freshness_label = str(c.get("freshness", "older")).lower().replace(" ", "_")
        w = FRESHNESS_WEIGHT.get(freshness_label, 0.2)
        direction = str(c.get("direction", "LONG")).upper()
        if direction == "LONG":
            long_weight += w
        elif direction == "SHORT":
            short_weight += w

    total = len(all_catalysts)
    net = (long_weight - short_weight) / max(total, 1)
    return {
        "found": True,
        "long_weight": round(long_weight, 2),
        "short_weight": round(short_weight, 2),
        "net_score": round(net, 2),
        "total_catalysts": total,
        "top_catalyst": top_catalyst,
    }


def _fetch_reddit_sentiment(ticker: str) -> dict | None:
    """Fetch Reddit mention volume and sentiment. Returns None if PRAW is disabled."""
    client_id = os.environ.get("REDDIT_CLIENT_ID", "").strip().lower()
    if not client_id or client_id in ("skip_for_now", ""):
        return None
    try:
        import praw
        reddit = praw.Reddit(
            client_id=os.environ.get("REDDIT_CLIENT_ID", ""),
            client_secret=os.environ.get("REDDIT_CLIENT_SECRET", ""),
            user_agent=os.environ.get("REDDIT_USER_AGENT", "ai-stock-agent/1.0"),
        )
        mention_count = 0
        bullish_count = 0
        bearish_count = 0
        BULLISH_KW = {"bull", "buy", "moon", "calls", "long", "strong", "growth", "rocket"}
        BEARISH_KW = {"bear", "sell", "puts", "short", "crash", "down", "weak", "fall"}

        for sub_name in ("stocks", "investing", "wallstreetbets"):
            sub = reddit.subreddit(sub_name)
            for post in sub.search(ticker, limit=15, time_filter="week"):
                text = (post.title + " " + (post.selftext or "")).lower()
                if ticker.lower() in text:
                    mention_count += 1
                    if any(kw in text for kw in BULLISH_KW):
                        bullish_count += 1
                    elif any(kw in text for kw in BEARISH_KW):
                        bearish_count += 1

        if mention_count == 0:
            return {"mention_count": 0, "sentiment": "no_data", "bullish_ratio": None, "euphoria_warning": False}

        bullish_ratio = bullish_count / mention_count
        sentiment = "bullish" if bullish_ratio > 0.6 else "bearish" if bullish_ratio < 0.35 else "mixed"
        euphoria = mention_count > 30 and bullish_ratio > 0.75
        return {
            "mention_count": mention_count,
            "sentiment": sentiment,
            "bullish_ratio": round(bullish_ratio, 2),
            "euphoria_warning": euphoria,
        }
    except Exception as exc:
        logger.warning("Reddit fetch failed for %s: %s", ticker, exc)
        return None


# ---------------------------------------------------------------------------
# Signal processing
# ---------------------------------------------------------------------------

def _reconcile_analysts(yf_data: dict, fh_data: dict) -> dict:
    """Reconcile yfinance and Finnhub analyst signals; flag if they disagree."""
    yf_mean = yf_data.get("recommendation_mean")
    yf_label = yf_data.get("analyst_label", "No consensus")

    fh_sb = fh_data.get("strong_buy") or 0
    fh_b = fh_data.get("buy") or 0
    fh_h = fh_data.get("hold") or 0
    fh_s = fh_data.get("sell") or 0
    fh_ss = fh_data.get("strong_sell") or 0
    fh_total = fh_sb + fh_b + fh_h + fh_s + fh_ss

    if fh_total > 0:
        fh_bullish_pct = (fh_sb + fh_b) / fh_total
        fh_bearish_pct = (fh_s + fh_ss) / fh_total
        fh_direction = "bullish" if fh_bullish_pct > 0.5 else "bearish" if fh_bearish_pct > 0.4 else "neutral"
    else:
        fh_direction = None
        fh_bullish_pct = None

    yf_direction = None
    if yf_mean is not None:
        yf_direction = "bullish" if yf_mean < 2.5 else "bearish" if yf_mean > 3.5 else "neutral"

    conflict = bool(yf_direction and fh_direction and yf_direction != fh_direction)

    return {
        "yf_label": yf_label,
        "yf_mean": yf_mean,
        "yf_direction": yf_direction,
        "fh_direction": fh_direction,
        "fh_total": fh_total,
        "fh_bullish_pct": round(fh_bullish_pct, 2) if fh_bullish_pct is not None else None,
        "sources_agree": not conflict and bool(yf_direction or fh_direction),
        "conflict": conflict,
    }


def _compute_signal_confidence(analyst: dict, news: dict, reddit: dict | None) -> dict:
    """Three-source confidence: analyst consensus + news catalysts + retail sentiment."""
    sources_confirming: list[str] = []
    conflicts: list[str] = []

    # Source 1: analyst consensus
    if analyst.get("yf_direction") or analyst.get("fh_direction"):
        if analyst.get("conflict"):
            conflicts.append(
                f"yfinance analyst direction ({analyst.get('yf_direction')}) "
                f"conflicts with Finnhub ({analyst.get('fh_direction')})"
            )
        else:
            sources_confirming.append("analyst_consensus")

    # Source 2: news sentiment
    if news.get("found") and news.get("total_catalysts", 0) > 0:
        sources_confirming.append("news_catalysts")
        analyst_dir = analyst.get("yf_direction") or analyst.get("fh_direction")
        net = news.get("net_score", 0)
        if analyst_dir == "bullish" and net < -0.3:
            conflicts.append("analyst bullish but news catalysts net negative")
        elif analyst_dir == "bearish" and net > 0.3:
            conflicts.append("analyst bearish but news catalysts net positive")

    # Source 3: retail (Reddit)
    if reddit and reddit.get("mention_count", 0) > 5:
        sources_confirming.append("retail_sentiment")

    n = len(sources_confirming)
    level = "high" if n >= 3 and not conflicts else "medium" if n >= 2 else "low"
    if conflicts and level == "high":
        level = "medium"

    return {
        "level": level,
        "sources_count": n,
        "sources": sources_confirming,
        "conflicts": conflicts,
        "confidence_note": (
            f"{n}/3 sources confirming"
            + (f"; conflicts: {'; '.join(conflicts)}" if conflicts else "")
        ),
    }


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _analyse_with_llm(
    ticker: str,
    yf_data: dict,
    analyst: dict,
    fh_data: dict,
    news: dict,
    reddit: dict | None,
    confidence: dict,
    direction_hint: str,
    macro_regime: str,
    position_context: dict | None = None,
    fmp_data: dict | None = None,
) -> dict:
    """Single GPT-4o-mini call for sentiment scoring and narrative."""
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def _f(v):
        return "N/A" if v is None else str(v)

    short_pct = yf_data.get("short_pct_float")
    short_str = f"{short_pct * 100:.1f}% of float" if short_pct else "N/A"
    reddit_str = "Not available (Reddit disabled)" if reddit is None else json.dumps(reddit)

    # FMP section for prompt
    fmp_block = ""
    if fmp_data and fmp_data.get("available"):
        fmp_block = f"""
FMP ANALYST DATA:
  Avg price target (last month): ${_f(fmp_data.get('avg_target_price'))} ({fmp_data.get('target_count', 0)} analysts)
  Avg price target (last quarter): ${_f(fmp_data.get('last_quarter_avg_target'))}
  Upgrades: {fmp_data.get('upgrades_recent', 0)} | Downgrades: {fmp_data.get('downgrades_recent', 0)} | Initiations: {fmp_data.get('initiations_recent', 0)}
  Upgrade momentum: {fmp_data.get('upgrade_momentum', 'N/A')}
"""

    review_instruction = (
        "- PORTFOLIO REVIEW MODE: assess whether current sentiment still supports the original entry. "
        "Add sentiment_shift_note describing if sentiment has improved, deteriorated, or is unchanged."
        if position_context else ""
    )
    shift_field = (
        ',\n  "sentiment_shift_note": "<improved | deteriorated | unchanged> — <1 sentence on why>"'
        if position_context else ""
    )

    prompt = f"""You are a market sentiment analyst. Analyse {ticker} and produce a structured JSON assessment.

MACRO REGIME: {macro_regime}
CANDIDATE DIRECTION HINT: {direction_hint}

ANALYST CONSENSUS:
  yfinance: {analyst['yf_label']} (mean {_f(analyst['yf_mean'])}, {_f(yf_data.get('num_analysts'))} analysts)
  Finnhub: direction={_f(analyst['fh_direction'])} ({_f(analyst['fh_total'])} analysts, bullish {_f(analyst['fh_bullish_pct'])})
  Sources agree: {analyst['sources_agree']} | Conflict: {analyst['conflict']}

PRICE TARGETS:
  Current: ${_f(yf_data.get('current_price'))}
  Mean target: ${_f(yf_data.get('target_mean'))} ({_f(yf_data.get('upside_pct'))}% upside)
  High/Low: ${_f(yf_data.get('target_high'))} / ${_f(yf_data.get('target_low'))}

NEWS CATALYSTS (from Agent 4 scan):
  Catalysts found: {news.get('found', False)} | Total: {news.get('total_catalysts', 0)}
  Long-weighted: {news.get('long_weight', 0)} | Short-weighted: {news.get('short_weight', 0)}
  Net sentiment: {news.get('net_score', 0)} (-1 = fully bearish, +1 = fully bullish)
  Top catalyst: {news.get('top_catalyst', 'None')}

SHORT INTEREST:
  Short ratio (days to cover): {_f(yf_data.get('short_ratio'))}
  Short % of float: {short_str}
  Note: high short interest can mean deserved skepticism OR squeeze risk — interpret in context.
{fmp_block}
RETAIL SENTIMENT (Reddit):
{reddit_str}

SIGNAL CONFIDENCE: {confidence.get('level')} ({confidence.get('confidence_note')})
DATA CONFLICTS: {json.dumps(confidence.get('conflicts', []))}
{_fmt_position_section(position_context)}
INSTRUCTIONS:
- Score 0-100 on overall market sentiment (100 = strongly bullish)
- If short interest > 20% of float, explicitly address: squeeze potential vs. warranted skepticism
- If retail_euphoria_warning is true, flag as contrarian risk in summary
- Note if analyst targets look stale (large upside may reflect pre-selloff targets not yet revised)
- Direction hint is the candidate generator's suggestion — you may override it based on sentiment
- contrarian_signal: set true when sentiment is irrationally negative on a stock with:
    * analyst mean price target significantly ABOVE current price (>15% upside still priced in)
    * AND news catalysts are neutral/mixed rather than catastrophically negative
    * AND there is no structural company-specific reason for the selloff (just market fear)
    This means the crowd is fearful but the analyst community sees value — a potential contrarian LONG.
- sentiment_type: "leading" = sentiment is pricing in future events before they happen (analyst upgrades,
  pre-earnings positioning, rumour-driven). "lagging" = sentiment is reacting to price moves that already
  happened (downgrade after a 30% drop, bearish after a crash). Lagging sentiment has LESS predictive value.
{review_instruction}

Return ONLY valid JSON:
{{
  "ticker": "{ticker}",
  "sentiment_score": <integer 0-100>,
  "direction": "LONG" or "SHORT",
  "analyst_consensus": "<label>",
  "price_target_upside_pct": <float or null>,
  "news_sentiment": "positive" | "negative" | "neutral" | "mixed",
  "short_interest_pct": <float or null>,
  "short_squeeze_risk": "low" | "medium" | "high",
  "retail_euphoria_warning": true | false,
  "analyst_targets_stale": true | false,
  "contrarian_signal": true | false,
  "sentiment_type": "leading" | "lagging" | "mixed",
  "data_conflicts": ["<any conflict>"],
  "signal_confidence": {json.dumps(confidence)},
  "sentiment_summary": "<2-3 sentence narrative — must address whether current sentiment is leading or lagging>"{shift_field}
}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.error("LLM sentiment failed for %s: %s", ticker, exc)
        return {
            "ticker": ticker, "sentiment_score": 50, "direction": direction_hint,
            "analyst_consensus": analyst.get("yf_label", "N/A"),
            "retail_euphoria_warning": False, "data_conflicts": [],
            "signal_confidence": confidence,
            "sentiment_summary": f"Analysis unavailable: {exc}",
        }


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------

def run(mode: str = "new_opportunities") -> dict:
    logger.info("=== Sentiment Analyst (Agent 8) — mode: %s ===", mode)

    candidates_path = REPORTS_DIR / "candidates_report.json"
    if not candidates_path.exists():
        raise RuntimeError("candidates_report.json not found — run Agent 5 first")
    with open(candidates_path) as f:
        candidates_data = json.load(f)
    candidates = candidates_data.get("candidates", [])[:MAX_CANDIDATES]
    logger.info("Analysing %d candidates", len(candidates))

    # Macro context
    macro_regime = "NEUTRAL"
    macro_path = REPORTS_DIR / "macro_report.json"
    if macro_path.exists():
        with open(macro_path) as f:
            macro_regime = json.load(f).get("regime", "NEUTRAL")

    # Load Agent 4 news catalysts (avoids re-fetching all headlines)
    fresh_catalysts: list[dict] = []
    stale_catalysts: list[dict] = []
    news_path = REPORTS_DIR / "news_report.json"
    if news_path.exists():
        with open(news_path) as f:
            nr = json.load(f)
        fresh_catalysts = nr.get("fresh_catalysts", [])
        stale_catalysts = nr.get("stale_catalysts", [])
        logger.info(
            "Loaded %d fresh + %d stale catalysts from news_report",
            len(fresh_catalysts), len(stale_catalysts),
        )

    # Init Finnhub client
    fh_client = None
    if _FINNHUB_AVAILABLE:
        try:
            fh_client = _finnhub_lib.Client(api_key=os.environ.get("FINNHUB_API_KEY", ""))
        except Exception as exc:
            logger.warning("Finnhub init failed: %s", exc)

    results: list[dict] = []

    for i, candidate in enumerate(candidates):
        ticker = str(candidate.get("ticker", "")).upper()
        direction_hint = str(candidate.get("direction_hint", "LONG")).upper()
        logger.info("[%d/%d] Sentiment analysis: %s", i + 1, len(candidates), ticker)

        position_context = _load_position_context(ticker) if mode == "portfolio_review" else None
        if position_context:
            direction_hint = str(position_context.get("direction", direction_hint)).upper()

        yf_data = _fetch_yf_sentiment(ticker)
        fh_data = _fetch_finnhub_consensus(ticker, fh_client)
        fmp_data = _fetch_fmp_analyst_signals(ticker)
        news_data = _extract_news_sentiment(ticker, fresh_catalysts, stale_catalysts)
        reddit_data = _fetch_reddit_sentiment(ticker)

        analyst = _reconcile_analysts(yf_data, fh_data)
        confidence = _compute_signal_confidence(analyst, news_data, reddit_data)

        result = _analyse_with_llm(
            ticker, yf_data, analyst, fh_data,
            news_data, reddit_data, confidence,
            direction_hint, macro_regime, position_context,
            fmp_data=fmp_data,
        )

        # Attach raw snapshots and candidate context
        result["fmp_analyst_signals"] = fmp_data if fmp_data and fmp_data.get("available") else None
        result["analyst_detail"] = {
            "yf_label": yf_data.get("analyst_label"),
            "yf_num_analysts": yf_data.get("num_analysts"),
            "fh_strong_buy": fh_data.get("strong_buy"),
            "fh_buy": fh_data.get("buy"),
            "fh_hold": fh_data.get("hold"),
            "fh_sell": fh_data.get("sell"),
            "fh_strong_sell": fh_data.get("strong_sell"),
            "fh_period": fh_data.get("period"),
        }
        result["news_detail"] = news_data
        result["reddit_detail"] = reddit_data
        result["price_targets"] = {
            "current": yf_data.get("current_price"),
            "mean": yf_data.get("target_mean"),
            "high": yf_data.get("target_high"),
            "low": yf_data.get("target_low"),
            "upside_pct": yf_data.get("upside_pct"),
        }
        result["short_interest"] = {
            "ratio": yf_data.get("short_ratio"),
            "pct_float": yf_data.get("short_pct_float"),
        }
        result["candidate_score"] = candidate.get("score")
        result["candidate_signals"] = candidate.get("signals", [])

        results.append(result)
        time.sleep(0.3)

    reddit_enabled = os.environ.get("REDDIT_CLIENT_ID", "").strip().lower() not in ("", "skip_for_now")
    output = {
        "sentiment_analyses": results,
        "total_analysed": len(results),
        "macro_regime": macro_regime,
        "reddit_enabled": reddit_enabled,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    logger.info("Saved sentiment report to %s", OUT_PATH)
    logger.info("=== Sentiment Analyst complete: %d tickers analysed ===", len(results))
    return output


if __name__ == "__main__":
    result = run()
    print(f"\nAnalysed {result['total_analysed']} tickers | Reddit: {'enabled' if result['reddit_enabled'] else 'disabled'}")
    for a in result["sentiment_analyses"][:10]:
        conf = a.get("signal_confidence", {})
        print(
            f"  {a['ticker']:6s}  score={a.get('sentiment_score', '?'):3}  "
            f"consensus={a.get('analyst_consensus', '?'):12s}  "
            f"upside={str(a.get('price_target_upside_pct', 'N/A'))}%  "
            f"conf={conf.get('level', '?')}  "
            f"euphoria={a.get('retail_euphoria_warning', '?')}"
        )
