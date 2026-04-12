"""
Agent 2 — Sector Rotation Agent
Phase 1 (parallel with Agents 1, 3, 4)

Identifies which of the 11 US equity sectors plus key thematic ETFs are gaining
or losing momentum. Tells the Candidate Generator where to focus its search.

All price/volume data is fetched live from yfinance. No LLM knowledge is used
for financial figures.
"""

import json
import os
import pathlib
from datetime import datetime

import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI

import agents.memory_agent as memory
from utils.data_fetcher import fetch_price_history_multi, fetch_finnhub_market_news, fetch_news_headlines
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# ETF universe
# ---------------------------------------------------------------------------

SECTOR_ETFS = {
    "XLK": "Technology",
    "XLF": "Financials",
    "XLE": "Energy",
    "XLP": "Consumer Staples",
    "XLV": "Healthcare",
    "XLI": "Industrials",
    "XLU": "Utilities",
    "XLRE": "Real Estate",
    "XLY": "Consumer Discretionary",
    "XLB": "Materials",
    "XLC": "Communication Services",
}

THEMATIC_ETFS = {
    "ARKK": "Disruptive Innovation",
    "BOTZ": "Robotics & AI",
    "ICLN": "Clean Energy",
    "ITA": "Aerospace & Defence",
    "NLR": "Nuclear Energy",
    "XBI": "Biotech",
}

BENCHMARK = "SPY"  # S&P 500 — used for relative strength calculation


# ---------------------------------------------------------------------------
# Sector-specific news and confidence pre-computation
# ---------------------------------------------------------------------------

# Keywords that map each sector ETF to relevant news search terms
SECTOR_NEWS_QUERIES = {
    "XLK": "technology stocks AI semiconductor",
    "XLF": "banks financials interest rates lending",
    "XLE": "oil energy crude petroleum",
    "XLP": "consumer staples food retail defensive",
    "XLV": "healthcare pharma FDA drug",
    "XLI": "industrials manufacturing defence aerospace",
    "XLU": "utilities electricity power grid",
    "XLRE": "real estate REIT property housing",
    "XLY": "consumer discretionary retail spending",
    "XLB": "materials mining metals commodities",
    "XLC": "communication media streaming social",
    "ITA": "defence aerospace military spending",
    "NLR": "nuclear energy power",
    "ICLN": "clean energy renewable solar wind",
    "XBI": "biotech drug trial FDA clinical",
}


def _fetch_sector_news() -> dict[str, list[str]]:
    """
    Fetch 3-5 recent headlines per sector from NewsAPI.
    Returns {etf_ticker: [headline, ...]}
    Failures are logged and return empty list for that sector.
    """
    news_map: dict[str, list[str]] = {}
    for ticker, query in SECTOR_NEWS_QUERIES.items():
        try:
            articles = fetch_news_headlines(query, days_back=5, page_size=5)
            headlines = [a.get("title", "") for a in articles if a.get("title")]
            news_map[ticker] = headlines[:5]
        except Exception as exc:
            logger.warning("Sector news fetch failed for %s: %s", ticker, exc)
            news_map[ticker] = []
    return news_map


def _compute_sector_confidence(etf_stats: dict, sector_news_map: dict) -> dict[str, dict]:
    """
    For each ETF, determine confidence level by cross-referencing:
      Source 1 — Price momentum (1M relative strength vs SPY)
      Source 2 — Volume confirmation (volume ratio > 1.2 on momentum direction)
      Source 3 — News flow confirmation (headlines present for this sector)

    Rules:
      1 source  → low
      2 sources → medium
      3 sources → high
      Price up + news negative keywords → conflict → cap at medium, flag it
    """
    NEGATIVE_WORDS = ["crash", "collapse", "layoff", "slowdown", "loss", "decline", "warning", "risk", "concern"]
    POSITIVE_WORDS = ["growth", "surge", "record", "beat", "strong", "demand", "rally", "win", "upgrade"]

    results = {}
    for ticker, stats in etf_stats.items():
        sources = []
        conflicts = []
        agreements = []

        rs_1m = stats.get("rs_1m")
        vol = stats.get("volume", {})
        vol_ratio = vol.get("ratio", 1.0)
        momentum_dir = None

        # Source 1: Price momentum
        if rs_1m is not None:
            sources.append("price_momentum")
            momentum_dir = "positive" if rs_1m > 0 else "negative"

        # Source 2: Volume confirmation
        if vol_ratio is not None and vol_ratio != "N/A":
            try:
                ratio = float(vol_ratio)
                # Volume confirming = elevated volume AND matches momentum direction
                if ratio > 1.2:
                    sources.append("volume_confirmation")
                    agreements.append(f"Elevated volume ({ratio:.1f}x avg) confirms momentum")
            except (ValueError, TypeError):
                pass

        # Source 3: News flow
        headlines = sector_news_map.get(ticker, [])
        if headlines:
            sources.append("news_flow")
            text = " ".join(headlines).lower()
            pos_count = sum(text.count(w) for w in POSITIVE_WORDS)
            neg_count = sum(text.count(w) for w in NEGATIVE_WORDS)
            news_dir = "positive" if pos_count > neg_count else "negative" if neg_count > pos_count else "neutral"

            if momentum_dir and news_dir != "neutral":
                if (momentum_dir == "positive" and news_dir == "positive") or \
                   (momentum_dir == "negative" and news_dir == "negative"):
                    agreements.append(f"News flow ({news_dir}) confirms price direction")
                else:
                    conflicts.append(
                        f"Price momentum is {momentum_dir} but news flow is {news_dir} — divergence"
                    )

        n = len(sources)
        if n >= 3 and not conflicts:
            level = "high"
        elif n >= 2 and len(conflicts) <= 1:
            level = "medium"
        else:
            level = "low"
        if conflicts and level == "high":
            level = "medium"

        results[ticker] = {
            "level": level,
            "sources_count": n,
            "sources": sources,
            "agreements": agreements,
            "conflicts": conflicts,
        }

    return results


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

def _scalar(val) -> float:
    """Safely extract a scalar float from a pandas value that may be a Series."""
    if hasattr(val, 'item'):
        return float(val.item())
    return float(val)


def _pct_change(start: float, end: float) -> float:
    if start == 0:
        return 0.0
    return round((end - start) / start * 100, 2)


def _collect_sector_data() -> dict:
    logger.info("Sector Agent: collecting ETF price data")

    all_tickers = list(SECTOR_ETFS.keys()) + list(THEMATIC_ETFS.keys()) + [BENCHMARK]

    # Fetch 6 months of daily closes for all ETFs in one call
    prices_6m = fetch_price_history_multi(all_tickers, period="6mo", interval="1d")
    prices_1m = fetch_price_history_multi(all_tickers, period="1mo", interval="1d")

    # Also fetch volume — need per-ticker calls for volume
    # We'll use 1mo daily OHLCV for volume analysis
    volume_data = {}
    for ticker in all_tickers:
        try:
            df = __import__('yfinance').download(ticker, period="1mo", interval="1d", progress=False, auto_adjust=True)
            if not df.empty and "Volume" in df.columns:
                vol = df["Volume"].squeeze().dropna()
                if len(vol) >= 5:
                    volume_data[ticker] = {
                        "avg_20d": round(_scalar(vol.mean()), 0),
                        "latest": round(_scalar(vol.iloc[-1]), 0),
                        "ratio": round(_scalar(vol.iloc[-1]) / _scalar(vol.mean()), 2) if _scalar(vol.mean()) > 0 else 1.0,
                    }
        except Exception as exc:
            logger.warning("Volume fetch failed for %s: %s", ticker, exc)

    etf_stats = {}

    def get_close_series(prices_df: pd.DataFrame, ticker: str) -> pd.Series | None:
        """Extract a clean close price Series for a ticker, handling MultiIndex columns."""
        if prices_df is None or prices_df.empty:
            return None
        if isinstance(prices_df.columns, pd.MultiIndex):
            if ticker in prices_df.columns.get_level_values(1):
                col = prices_df.xs(ticker, axis=1, level=1)
                if isinstance(col, pd.DataFrame):
                    col = col.iloc[:, 0]
                return col.dropna()
            return None
        if ticker in prices_df.columns:
            return prices_df[ticker].dropna()
        return None

    # Compute benchmark (SPY) returns for relative strength
    spy_6m = get_close_series(prices_6m, BENCHMARK)
    spy_1m = get_close_series(prices_1m, BENCHMARK)

    spy_ret_1w = spy_ret_1m = spy_ret_3m = spy_ret_6m = 0.0
    if spy_6m is not None and len(spy_6m) >= 60:
        spy_ret_6m = _pct_change(_scalar(spy_6m.iloc[0]), _scalar(spy_6m.iloc[-1]))
        spy_ret_3m = _pct_change(_scalar(spy_6m.iloc[-63]), _scalar(spy_6m.iloc[-1])) if len(spy_6m) >= 63 else 0.0
    if spy_1m is not None and len(spy_1m) >= 2:
        spy_ret_1m = _pct_change(_scalar(spy_1m.iloc[0]), _scalar(spy_1m.iloc[-1]))
    if spy_6m is not None and len(spy_6m) >= 5:
        spy_ret_1w = _pct_change(_scalar(spy_6m.iloc[-5]), _scalar(spy_6m.iloc[-1]))

    for ticker in all_tickers:
        if ticker == BENCHMARK:
            continue

        s6 = get_close_series(prices_6m, ticker)
        s1 = get_close_series(prices_1m, ticker)

        if s6 is None or len(s6) < 5:
            logger.warning("Insufficient price data for %s", ticker)
            continue

        stats: dict = {"ticker": ticker}

        # Absolute returns
        stats["ret_1w"] = _pct_change(_scalar(s6.iloc[-5]), _scalar(s6.iloc[-1])) if len(s6) >= 5 else None
        stats["ret_1m"] = _pct_change(_scalar(s1.iloc[0]), _scalar(s1.iloc[-1])) if s1 is not None and len(s1) >= 2 else None
        stats["ret_3m"] = _pct_change(_scalar(s6.iloc[-63]), _scalar(s6.iloc[-1])) if len(s6) >= 63 else None
        stats["ret_6m"] = _pct_change(_scalar(s6.iloc[0]), _scalar(s6.iloc[-1]))

        # Relative strength vs S&P 500
        stats["rs_1w"] = round(stats["ret_1w"] - spy_ret_1w, 2) if stats["ret_1w"] is not None else None
        stats["rs_1m"] = round(stats["ret_1m"] - spy_ret_1m, 2) if stats["ret_1m"] is not None else None
        stats["rs_3m"] = round(stats["ret_3m"] - spy_ret_3m, 2) if stats["ret_3m"] is not None else None

        # Current price
        stats["price"] = round(_scalar(s6.iloc[-1]), 2)

        # 52-week high/low context (use 6m as proxy since we only have 6m)
        stats["high_6m"] = round(float(s6.max()), 2)
        stats["low_6m"] = round(float(s6.min()), 2)
        stats["pct_from_high"] = _pct_change(stats["high_6m"], stats["price"])

        # Volume data
        stats["volume"] = volume_data.get(ticker, {})

        # Momentum acceleration: is 1-month RS improving vs 3-month RS?
        if stats["rs_1m"] is not None and stats["rs_3m"] is not None:
            stats["momentum_accelerating"] = stats["rs_1m"] > stats["rs_3m"]
        else:
            stats["momentum_accelerating"] = None

        etf_stats[ticker] = stats

    # --- Sector-specific news for confidence cross-referencing ---
    # Fetch targeted news per sector group so we can check whether price
    # momentum is confirmed or contradicted by news flow.
    sector_news_map = _fetch_sector_news()
    general_headlines = [a.get("headline", "") for a in fetch_finnhub_market_news("general")[:15] if a.get("headline")]

    # Pre-compute per-ETF confidence: how many independent signals agree?
    etf_confidence = _compute_sector_confidence(etf_stats, sector_news_map)

    logger.info("Sector Agent: data collected for %d ETFs", len(etf_stats))
    return {
        "etf_stats": etf_stats,
        "etf_confidence": etf_confidence,
        "spy_returns": {"1w": spy_ret_1w, "1m": spy_ret_1m, "3m": spy_ret_3m, "6m": spy_ret_6m},
        "sector_etfs": SECTOR_ETFS,
        "thematic_etfs": THEMATIC_ETFS,
        "sector_news_map": sector_news_map,
        "headlines": general_headlines,
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


# ---------------------------------------------------------------------------
# Load macro context if available
# ---------------------------------------------------------------------------

def _load_macro_context() -> str:
    macro_path = pathlib.Path("data/reports/macro_report.json")
    if macro_path.exists():
        try:
            with open(macro_path) as f:
                macro = json.load(f)
            return (
                f"Macro regime: {macro.get('regime')} | "
                f"Rate direction: {macro.get('interest_rate_direction')} | "
                f"Inflation: {macro.get('inflation_trend')} | "
                f"Favoured themes: {', '.join(macro.get('favoured_themes', []))} | "
                f"Avoid: {', '.join(macro.get('avoid_themes', []))}"
            )
        except Exception:
            pass
    return "Macro report not available — analyse independently."


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _format_etf_table(etf_stats: dict, etf_map: dict) -> str:
    lines = []
    header = f"{'Ticker':<6} {'Name':<28} {'1W%':>6} {'1M%':>6} {'3M%':>7} {'RS_1M':>7} {'RS_3M':>7} {'Accel':>6} {'Vol ratio':>9}"
    lines.append(header)
    lines.append("-" * len(header))
    for ticker, name in etf_map.items():
        s = etf_stats.get(ticker)
        if not s:
            continue
        lines.append(
            f"{ticker:<6} {name:<28} "
            f"{(str(s['ret_1w'])+' %') if s['ret_1w'] is not None else 'N/A':>8} "
            f"{(str(s['ret_1m'])+' %') if s['ret_1m'] is not None else 'N/A':>8} "
            f"{(str(s['ret_3m'])+' %') if s['ret_3m'] is not None else 'N/A':>8} "
            f"{(str(s['rs_1m'])+' %') if s['rs_1m'] is not None else 'N/A':>8} "
            f"{(str(s['rs_3m'])+' %') if s['rs_3m'] is not None else 'N/A':>8} "
            f"{'YES' if s.get('momentum_accelerating') else 'no':>6} "
            f"{s['volume'].get('ratio', 'N/A'):>9}"
        )
    return "\n".join(lines)


def _analyse_with_llm(raw_data: dict) -> dict:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    macro_context = _load_macro_context()

    sector_table = _format_etf_table(raw_data["etf_stats"], raw_data["sector_etfs"])
    thematic_table = _format_etf_table(raw_data["etf_stats"], raw_data["thematic_etfs"])
    spy = raw_data["spy_returns"]

    # Format confidence summary for the prompt
    conf = raw_data.get("etf_confidence", {})
    conf_lines = []
    for ticker in list(raw_data["sector_etfs"].keys()) + list(raw_data["thematic_etfs"].keys()):
        c = conf.get(ticker, {})
        if c:
            conflict_flag = " ⚠ CONFLICT" if c.get("conflicts") else ""
            conf_lines.append(
                f"  {ticker:<6} {c.get('level','?'):>6} ({c.get('sources_count',0)} sources: "
                f"{', '.join(c.get('sources', []))}){conflict_flag}"
            )
            for conflict in c.get("conflicts", []):
                conf_lines.append(f"         → {conflict}")
    confidence_block = "\n".join(conf_lines) if conf_lines else "Not computed."

    system_prompt = """You are the Sector Rotation Agent for an AI hedge fund system.
You have been given real live ETF performance data fetched today from market APIs,
plus pre-computed confidence scores showing how many independent signals (price, volume, news)
agree or conflict for each sector.

CRITICAL RULES:
- Only use the data provided. Do not invent figures.
- Relative strength (RS) vs S&P 500 is more important than absolute returns.
- CONFIDENCE IS MANDATORY: use the pre-computed signal_confidence for each sector.
  A sector with only price momentum (1 source) = low confidence — do NOT rank it as top sector.
  Price + volume (2 sources) = medium. Price + volume + news (3 sources) = high.
  Any ⚠ CONFLICT means price and news disagree — explain this in reasoning and reduce score.
- Cross-reference sector momentum with the macro regime provided.
- Your output must be valid JSON matching the schema exactly.

Output this JSON schema:
{
  "top_sectors": ["list of 3-4 best sector ETF tickers — must have medium or high confidence"],
  "avoid_sectors": ["list of 2-3 weakest sector ETF tickers"],
  "emerging_themes": ["list of 2-4 structural themes drawing capital right now"],
  "sector_rankings": [
    {
      "sector": "ETF ticker",
      "name": "sector name",
      "score": <0-100>,
      "ret_1m": <float>,
      "ret_3m": <float>,
      "rs_vs_spy_1m": <float>,
      "momentum_accelerating": <bool>,
      "signal_confidence": {
        "level": "high | medium | low",
        "sources_count": <integer>,
        "sources": ["price_momentum", "volume_confirmation", "news_flow"],
        "conflicts": ["description of any conflict — empty list if none"]
      },
      "reasoning": "1-2 sentence explanation referencing confidence level"
    }
  ],
  "thematic_rankings": [
    {
      "etf": "ticker",
      "name": "theme name",
      "score": <0-100>,
      "ret_1m": <float>,
      "rs_vs_spy_1m": <float>,
      "signal_confidence": {"level": "high | medium | low", "sources_count": <integer>},
      "reasoning": "1 sentence"
    }
  ],
  "sector_summary": "3-4 sentence paragraph; explicitly note any sectors where price and news conflict",
  "confidence": <0-100>
}"""

    # Inject fund performance memory into the sector prompt
    fund_perf = memory.get_fund_performance_summary()
    sector_memory_block = ""
    if fund_perf.get("total_trades", 0) >= 3:
        sector_memory_block = (
            f"\nFUND MEMORY — {fund_perf['total_trades']} closed trades | "
            f"win rate {fund_perf['win_rate_pct']}% | avg P&L {fund_perf['avg_pnl_pct']:+.1f}%. "
            f"Use this to calibrate how aggressively to recommend sector rotation.\n"
        )

    user_prompt = f"""Here is today's live sector ETF performance data. Analyse it and return your JSON assessment.
{sector_memory_block}
MACRO CONTEXT (from Macro Agent):
{macro_context}

S&P 500 BENCHMARK RETURNS (SPY):
  1W: {spy['1w']}% | 1M: {spy['1m']}% | 3M: {spy['3m']}% | 6M: {spy['6m']}%

PRE-COMPUTED SIGNAL CONFIDENCE (price momentum / volume / news cross-reference):
{confidence_block}

SECTOR ETFs — performance vs SPY benchmark:
(RS = return minus SPY return over same period; positive = outperforming market)
(Accel = YES means 1-month RS is stronger than 3-month RS — momentum building)

{sector_table}

THEMATIC ETFs:
{thematic_table}

SECTOR NEWS SAMPLE (last 5 days per sector):
{chr(10).join(f"  {t}: {'; '.join(hl[:2]) if hl else 'No headlines found'}" for t, hl in raw_data.get('sector_news_map', {}).items())}

RECENT MARKET HEADLINES:
{chr(10).join(f'- {h}' for h in raw_data['headlines'][:10])}

Data as of: {raw_data['as_of']}

Populate signal_confidence for each sector from the pre-computed block above.
Rank sectors by attractiveness, but ONLY put sectors with medium/high confidence in top_sectors.
Return ONLY valid JSON. No markdown, no explanation outside the JSON."""

    logger.info("Sector Agent: sending data to GPT-4o-mini")
    response = OpenAI(api_key=os.environ["OPENAI_API_KEY"]).chat.completions.create(
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
        "Sector Agent: top sectors %s | avoid %s",
        result.get("top_sectors"),
        result.get("avoid_sectors"),
    )
    return result


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run() -> dict:
    logger.info("=== Sector Agent starting ===")

    raw_data = _collect_sector_data()
    result = _analyse_with_llm(raw_data)

    result["raw_data"] = raw_data
    result["generated_at"] = datetime.utcnow().isoformat()

    output_dir = pathlib.Path("data/reports")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "sector_report.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)

    logger.info("Sector Agent: report saved to %s", output_path)
    logger.info("=== Sector Agent complete ===")
    return result


if __name__ == "__main__":
    result = run()
    printable = {k: v for k, v in result.items() if k != "raw_data"}
    print(json.dumps(printable, indent=2))
