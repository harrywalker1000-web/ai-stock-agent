"""
Agent 1 — Macro Agent
Phase 1 (parallel with Agents 2, 3, 4)

Assesses the global macroeconomic and geopolitical environment and classifies
the current market regime as RISK-ON, RISK-OFF, or NEUTRAL. Every downstream
agent reads this output before making decisions.

All data is fetched live from FRED and yfinance — no LLM training knowledge
is used for financial figures.
"""

import json
import os
from datetime import datetime
from typing import Any

from dotenv import load_dotenv
from utils.llm_client import get_llm_client

import agents.memory_agent as memory
from utils.data_fetcher import (
    fetch_finnhub_market_news,
    fetch_fred_latest,
    fetch_fred_series,
    fetch_news_headlines,
    fetch_price_history,
    fetch_ticker_info,
)
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

def _collect_macro_data() -> dict:
    """Fetch all raw macro data. Returns a dict of named data points."""
    logger.info("Macro Agent: collecting live macro data")
    data: dict[str, Any] = {}

    # Interest rates
    data["fed_funds_rate"] = fetch_fred_latest("FEDFUNDS")
    data["us_10y_yield"] = fetch_fred_latest("DGS10")
    data["us_2y_yield"] = fetch_fred_latest("DGS2")

    # Compute yield curve spread (10Y - 2Y); negative = inverted = recession warning
    if data["us_10y_yield"] and data["us_2y_yield"]:
        data["yield_curve_spread"] = round(data["us_10y_yield"] - data["us_2y_yield"], 3)
    else:
        data["yield_curve_spread"] = None

    # Inflation
    cpi_series = fetch_fred_series("CPIAUCSL", limit=3)
    if len(cpi_series) >= 2:
        data["cpi_latest"] = round(float(cpi_series.iloc[-1]), 2)
        data["cpi_prev"] = round(float(cpi_series.iloc[-2]), 2)
        data["cpi_trend"] = "rising" if data["cpi_latest"] > data["cpi_prev"] else "falling"
    else:
        data["cpi_latest"] = data["cpi_prev"] = None
        data["cpi_trend"] = "unknown"

    # PCE (Fed's preferred inflation measure)
    data["pce_latest"] = fetch_fred_latest("PCEPI")

    # GDP (quarterly — last available)
    gdp_series = fetch_fred_series("GDP", limit=2)
    if len(gdp_series) >= 2:
        data["gdp_latest"] = round(float(gdp_series.iloc[-1]), 1)
        data["gdp_prev"] = round(float(gdp_series.iloc[-2]), 1)
        data["gdp_growth"] = round(
            (data["gdp_latest"] - data["gdp_prev"]) / data["gdp_prev"] * 100, 2
        )
    else:
        data["gdp_latest"] = data["gdp_prev"] = data["gdp_growth"] = None

    # Dollar index (DXY) via yfinance proxy
    dxy_df = fetch_price_history("DX-Y.NYB", period="1mo", interval="1d")
    if not dxy_df.empty:
        closes = dxy_df["Close"].squeeze().dropna()
        if len(closes) >= 2:
            data["dxy_current"] = round(float(closes.iloc[-1].item() if hasattr(closes.iloc[-1], 'item') else closes.iloc[-1]), 2)
            data["dxy_1m_ago"] = round(float(closes.iloc[0].item() if hasattr(closes.iloc[0], 'item') else closes.iloc[0]), 2)
            data["dxy_trend"] = "strengthening" if data["dxy_current"] > data["dxy_1m_ago"] else "weakening"
        else:
            data["dxy_current"] = data["dxy_trend"] = None
    else:
        data["dxy_current"] = data["dxy_trend"] = None

    # VIX (fear index) — high VIX = risk-off
    vix_df = fetch_price_history("^VIX", period="5d", interval="1d")
    if not vix_df.empty:
        vix_closes = vix_df["Close"].squeeze().dropna()
        last = vix_closes.iloc[-1]
        data["vix"] = round(float(last.item() if hasattr(last, 'item') else last), 2)
    else:
        data["vix"] = None

    # TLT (long-duration bonds) — rising = flight to safety = risk-off
    tlt_df = fetch_price_history("TLT", period="1mo", interval="1d")
    if not tlt_df.empty:
        closes = tlt_df["Close"].squeeze().dropna()
        if len(closes) >= 2:
            c0 = float(closes.iloc[0].item() if hasattr(closes.iloc[0], 'item') else closes.iloc[0])
            c1 = float(closes.iloc[-1].item() if hasattr(closes.iloc[-1], 'item') else closes.iloc[-1])
            data["tlt_1m_change_pct"] = round((c1 - c0) / c0 * 100, 2)
        else:
            data["tlt_1m_change_pct"] = None
    else:
        data["tlt_1m_change_pct"] = None

    # HYG (high-yield credit spreads proxy) — falling HYG = widening spreads = risk-off
    hyg_df = fetch_price_history("HYG", period="1mo", interval="1d")
    if not hyg_df.empty:
        closes = hyg_df["Close"].squeeze().dropna()
        if len(closes) >= 2:
            c0 = float(closes.iloc[0].item() if hasattr(closes.iloc[0], 'item') else closes.iloc[0])
            c1 = float(closes.iloc[-1].item() if hasattr(closes.iloc[-1], 'item') else closes.iloc[-1])
            data["hyg_1m_change_pct"] = round((c1 - c0) / c0 * 100, 2)
        else:
            data["hyg_1m_change_pct"] = None
    else:
        data["hyg_1m_change_pct"] = None

    # News for geopolitical context
    macro_news = fetch_finnhub_market_news("general")
    geopolitical_news = fetch_news_headlines("geopolitical OR tariffs OR sanctions OR central bank", days_back=3, page_size=15)
    cb_news = fetch_news_headlines("Federal Reserve OR ECB OR Bank of England interest rate", days_back=3, page_size=10)

    data["macro_headlines"] = [a.get("headline", a.get("title", "")) for a in macro_news[:10]]
    data["geopolitical_headlines"] = [a.get("title", "") for a in geopolitical_news[:10]]
    data["central_bank_headlines"] = [a.get("title", "") for a in cb_news[:8]]
    data["as_of"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    logger.info(
        "Macro data collected — VIX: %s | Fed: %s%% | 10Y: %s%% | Yield curve: %s%%",
        data.get("vix"),
        data.get("fed_funds_rate"),
        data.get("us_10y_yield"),
        data.get("yield_curve_spread"),
    )
    return data


# ---------------------------------------------------------------------------
# Confidence pre-computation (Python-level, before LLM)
# ---------------------------------------------------------------------------

def _compute_macro_confidence(raw_data: dict) -> dict:
    """
    Objectively assess how many independent data sources are available and
    whether they agree or conflict. Returns a structured confidence dict that
    is passed to the LLM so it can reason about it.

    Rules:
      1 source confirming regime  → low
      2 sources confirming        → medium
      3+ sources confirming       → high
      Any source conflicting      → flag as conflict, cap at medium unless resolved
    """
    sources_available = []
    agreements = []
    conflicts = []

    # --- Source 1: FRED (interest rates, inflation, GDP) ---
    fred_signal = None
    if raw_data.get("fed_funds_rate") is not None:
        sources_available.append("FRED")
        cpi_trend = raw_data.get("cpi_trend", "unknown")
        rate = raw_data.get("fed_funds_rate", 0)
        if cpi_trend == "rising" and rate > 3:
            fred_signal = "RISK-OFF"  # High rates + rising inflation = restrictive
        elif cpi_trend == "falling" and rate < 3:
            fred_signal = "RISK-ON"
        else:
            fred_signal = "NEUTRAL"

    # --- Source 2: yfinance market signals (VIX, TLT, HYG, DXY) ---
    market_signals_present = sum(
        1 for k in ["vix", "tlt_1m_change_pct", "hyg_1m_change_pct", "dxy_current"]
        if raw_data.get(k) is not None
    )
    market_signal = None
    if market_signals_present >= 2:
        sources_available.append("yfinance_market")
        vix = raw_data.get("vix") or 0
        tlt_chg = raw_data.get("tlt_1m_change_pct") or 0
        hyg_chg = raw_data.get("hyg_1m_change_pct") or 0
        risk_off_votes = sum([vix > 25, tlt_chg > 1, hyg_chg < -1])
        risk_on_votes = sum([vix < 15, tlt_chg < -1, hyg_chg > 1])
        if risk_off_votes >= 2:
            market_signal = "RISK-OFF"
        elif risk_on_votes >= 2:
            market_signal = "RISK-ON"
        else:
            market_signal = "NEUTRAL"

    # --- Source 3: NewsAPI / Finnhub headlines ---
    news_signal = None
    all_headlines = (
        raw_data.get("macro_headlines", []) +
        raw_data.get("geopolitical_headlines", []) +
        raw_data.get("central_bank_headlines", [])
    )
    if all_headlines:
        sources_available.append("newsapi_finnhub")
        risk_off_words = ["war", "conflict", "tariff", "sanction", "recession", "crash", "inflation", "hawkish"]
        risk_on_words = ["recovery", "growth", "dovish", "cut", "stimulus", "boom", "rally"]
        text = " ".join(all_headlines).lower()
        ro_count = sum(text.count(w) for w in risk_off_words)
        on_count = sum(text.count(w) for w in risk_on_words)
        if ro_count > on_count * 1.5:
            news_signal = "RISK-OFF"
        elif on_count > ro_count * 1.5:
            news_signal = "RISK-ON"
        else:
            news_signal = "NEUTRAL"

    # --- Cross-reference for agreements and conflicts ---
    all_signals = {k: v for k, v in {
        "FRED": fred_signal,
        "yfinance_market": market_signal,
        "newsapi_finnhub": news_signal,
    }.items() if v is not None}

    unique_regimes = set(all_signals.values())
    if len(unique_regimes) == 1:
        agreements.append(f"All {len(all_signals)} sources agree: {list(unique_regimes)[0]}")
    else:
        for src_a, sig_a in all_signals.items():
            for src_b, sig_b in all_signals.items():
                if src_a < src_b and sig_a != sig_b:
                    conflicts.append(f"{src_a} signals {sig_a} but {src_b} signals {sig_b}")

    # --- Determine confidence level ---
    n_sources = len(sources_available)
    if n_sources >= 3 and not conflicts:
        level = "high"
    elif n_sources >= 2 and len(conflicts) <= 1:
        level = "medium"
    else:
        level = "low"

    # Conflicts always cap at medium
    if conflicts and level == "high":
        level = "medium"

    return {
        "level": level,
        "sources_count": n_sources,
        "sources": sources_available,
        "source_signals": all_signals,
        "agreements": agreements,
        "conflicts": conflicts,
    }


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _analyse_with_llm(raw_data: dict) -> dict:
    """
    Send the collected macro data to GPT-4o-mini for regime classification
    and narrative generation. The LLM is given only real data — it must not
    invent figures.
    """
    client = get_llm_client()
    confidence = _compute_macro_confidence(raw_data)

    # Fund performance context — helps macro agent understand if past regime calls were accurate
    fund_perf = memory.get_fund_performance_summary()
    if fund_perf.get("total_trades", 0) > 0:
        fund_memory_note = (
            f"\nFUND TRACK RECORD ({fund_perf['total_trades']} closed trades): "
            f"win rate {fund_perf.get('win_rate_pct', 0)}% | "
            f"avg P&L {fund_perf.get('avg_pnl_pct', 0):+.1f}% | "
            f"best {fund_perf.get('best_trade_pct', 0):+.1f}% | "
            f"worst {fund_perf.get('worst_trade_pct', 0):+.1f}%\n"
            "Use this to calibrate confidence — if the fund has a strong track record in the "
            "regime you are about to classify, be appropriately confident; if track record is poor, "
            "flag increased uncertainty in your macro_summary."
        )
    else:
        fund_memory_note = "\nFUND TRACK RECORD: No closed trades yet — apply standard confidence rules."

    system_prompt = """You are the Macro Agent for an AI hedge fund system.
You have been given real, live macroeconomic data fetched today from FRED and market APIs.
Your job is to analyse this data and classify the current market regime.

CRITICAL RULES:
- Only use the data provided. Do not invent or recall figures from your training.
- Every claim must reference specific numbers from the data.
- Geopolitical assessment must map events to specific market implications — not vague statements.
- CONFIDENCE RULES: The pre-computed signal_confidence block shows how many independent sources
  agree or conflict. If sources conflict, you MUST explain the conflict in macro_summary and
  reflect it in your confidence score. A conflicted signal should never score above 70.
- Your output must be valid JSON matching the schema exactly.

Output this JSON schema:
{
  "regime": "RISK-ON | RISK-OFF | NEUTRAL",
  "interest_rate_direction": "rising | falling | stable",
  "inflation_trend": "rising | falling | stable",
  "favoured_themes": ["list of 2-5 investment themes currently supported by macro"],
  "avoid_themes": ["list of 2-4 themes to avoid given current macro"],
  "geopolitical_risks": ["list of specific risks with market implications"],
  "macro_summary": "3-4 sentence paragraph summarising the macro environment; explicitly mention any source conflicts",
  "signal_confidence": {
    "level": "high | medium | low",
    "sources_count": <integer>,
    "sources": ["list of data sources that provided signals"],
    "agreements": ["list of cross-source agreements"],
    "conflicts": ["list of cross-source conflicts — empty list if none"],
    "confidence_note": "1 sentence explaining the confidence level for downstream agents"
  },
  "confidence": <integer 0-100>
}"""

    user_prompt = f"""Here is today's live macro data. Analyse it and return your JSON assessment.
{fund_memory_note}
=== PRE-COMPUTED SIGNAL CONFIDENCE ===
Sources available: {confidence['sources_count']} ({', '.join(confidence['sources'])})
Source-level signals: {confidence['source_signals']}
Agreements: {confidence['agreements'] or 'None'}
Conflicts: {confidence['conflicts'] or 'None'}
Preliminary confidence level: {confidence['level']}

=== INTEREST RATES & YIELDS ===
Fed Funds Rate: {raw_data.get('fed_funds_rate')}%
US 10Y Treasury Yield: {raw_data.get('us_10y_yield')}%
US 2Y Treasury Yield: {raw_data.get('us_2y_yield')}%
Yield Curve (10Y-2Y): {raw_data.get('yield_curve_spread')}% (negative = inverted = recession risk)

=== INFLATION ===
CPI (latest): {raw_data.get('cpi_latest')} (prev: {raw_data.get('cpi_prev')}) → trend: {raw_data.get('cpi_trend')}
PCE (latest): {raw_data.get('pce_latest')}

=== GROWTH ===
GDP (latest quarter): ${raw_data.get('gdp_latest')}B (prev: ${raw_data.get('gdp_prev')}B, change: {raw_data.get('gdp_growth')}%)

=== MARKET SIGNALS (yfinance) ===
VIX (fear index): {raw_data.get('vix')} (above 25 = elevated fear, above 35 = panic)
DXY (dollar): {raw_data.get('dxy_current')} — {raw_data.get('dxy_trend')} vs 1 month ago
TLT (long bonds, 1-month change): {raw_data.get('tlt_1m_change_pct')}%
HYG (high-yield bonds, 1-month change): {raw_data.get('hyg_1m_change_pct')}%

=== MACRO HEADLINES — NewsAPI/Finnhub (last 3 days) ===
{chr(10).join(f'- {h}' for h in raw_data.get('macro_headlines', []))}

=== GEOPOLITICAL HEADLINES ===
{chr(10).join(f'- {h}' for h in raw_data.get('geopolitical_headlines', []))}

=== CENTRAL BANK HEADLINES ===
{chr(10).join(f'- {h}' for h in raw_data.get('central_bank_headlines', []))}

Data as of: {raw_data.get('as_of')}

Populate signal_confidence using the pre-computed values above, adding your confidence_note.
Return ONLY valid JSON. No markdown, no explanation outside the JSON."""

    logger.info("Macro Agent: sending data to GPT-4o-mini for analysis")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    raw_json = response.choices[0].message.content or "{}"
    result = json.loads(raw_json)
    logger.info("Macro Agent: regime classified as %s (confidence: %s)", result.get("regime"), result.get("confidence"))
    return result


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run() -> dict:
    """
    Run the Macro Agent. Returns the full JSON output dict.
    Saves output to data/reports/macro_report.json for downstream agents.
    """
    logger.info("=== Macro Agent starting ===")

    raw_data = _collect_macro_data()
    result = _analyse_with_llm(raw_data)

    # Attach metadata
    result["raw_data"] = raw_data
    result["generated_at"] = datetime.utcnow().isoformat()

    # Persist output for downstream agents
    import pathlib
    output_dir = pathlib.Path("data/reports")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "macro_report.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)

    logger.info("Macro Agent: report saved to %s", output_path)
    logger.info("=== Macro Agent complete — regime: %s ===", result.get("regime"))
    return result


if __name__ == "__main__":
    result = run()
    print(json.dumps({k: v for k, v in result.items() if k != "raw_data"}, indent=2))
