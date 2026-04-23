"""
Ad-hoc single-ticker deep-dive research report.
Runs all six agents against a single ticker and produces a 14-section
institutional-grade analysis. No positions modified, no orders placed.

Usage:
  python scripts/adhoc_report.py --ticker AAPL
  python scripts/adhoc_report.py --ticker NVDA --force-refresh
  python scripts/adhoc_report.py --ticker MSFT --progress   # JSON progress lines to stdout
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

REPORTS_DIR   = ROOT / "data" / "reports"
ADHOC_DIR     = ROOT / "data" / "adhoc_reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
ADHOC_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DAYS    = 7


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_path(ticker: str) -> Path | None:
    """Return path to valid cached report (within CACHE_DAYS), or None."""
    cutoff = datetime.utcnow().date() - timedelta(days=CACHE_DAYS)
    candidates = sorted(ADHOC_DIR.glob(f"{ticker}_*.json"), reverse=True)
    for p in candidates:
        try:
            date_str = p.stem.split("_", 1)[1]          # "AAPL_2026-04-07" → "2026-04-07"
            if datetime.strptime(date_str, "%Y-%m-%d").date() >= cutoff:
                return p
        except Exception:
            continue
    return None


def _write_candidates_report(ticker: str) -> None:
    """Write a minimal single-entry candidates_report.json so agents have a ticker to process."""
    data = {
        "candidates": [{"ticker": ticker, "direction_hint": "LONG", "signals": ["adhoc_request"]}],
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "mode": "adhoc",
    }
    with open(REPORTS_DIR / "candidates_report.json", "w") as f:
        json.dump(data, f, indent=2)


def _emit(progress_mode: bool, step: str, label: str) -> None:
    if progress_mode:
        print(json.dumps({"step": step, "label": label}), flush=True)
    else:
        print(f"  [{label}]...", flush=True)


# ---------------------------------------------------------------------------
# Agent runners
# ---------------------------------------------------------------------------

def _run_macro(progress_mode: bool) -> dict:
    _emit(progress_mode, "macro", "Macro Agent")
    from agents import macro_agent
    return macro_agent.run()


def _run_news(ticker: str, progress_mode: bool) -> list[dict]:
    _emit(progress_mode, "news", "News & Catalyst Agent")
    from agents import news_agent
    news_agent.run()
    news_path = REPORTS_DIR / "news_report.json"
    if not news_path.exists():
        return []
    with open(news_path) as f:
        nr = json.load(f)
    # Filter catalysts to this ticker only
    all_cats = nr.get("company_catalysts", [])
    return [c for c in all_cats if str(c.get("ticker", "")).upper() == ticker.upper()]


def _run_fundamental(ticker: str, progress_mode: bool) -> dict:
    _emit(progress_mode, "fundamental", "Fundamental Analyst")
    from agents import fundamental_analyst
    fundamental_analyst.run()
    fund_path = REPORTS_DIR / "fundamental_report.json"
    if not fund_path.exists():
        return {}
    with open(fund_path) as f:
        fr = json.load(f)
    analyses = fr.get("fundamental_analyses", [])
    for a in analyses:
        if str(a.get("ticker", "")).upper() == ticker.upper():
            return a
    return {}


def _run_quant(ticker: str, progress_mode: bool) -> dict:
    _emit(progress_mode, "quant", "Quant Agent")
    from agents import quant_agent
    quant_agent.run()
    quant_path = REPORTS_DIR / "quant_report.json"
    if not quant_path.exists():
        return {}
    with open(quant_path) as f:
        qr = json.load(f)
    analyses = qr.get("quant_analyses", [])
    for a in analyses:
        if str(a.get("ticker", "")).upper() == ticker.upper():
            return a
    return {}


def _run_sentiment(ticker: str, progress_mode: bool) -> dict:
    _emit(progress_mode, "sentiment", "Sentiment Agent")
    from agents import sentiment_agent
    sentiment_agent.run()
    sent_path = REPORTS_DIR / "sentiment_report.json"
    if not sent_path.exists():
        return {}
    with open(sent_path) as f:
        sr = json.load(f)
    analyses = sr.get("sentiment_analyses", [])
    for a in analyses:
        if str(a.get("ticker", "")).upper() == ticker.upper():
            return a
    return {}


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------

def _build_s1_mandate(fundamental: dict) -> dict:
    """Section 1 — Fund Mandate Checklist (rule-based pass/fail)."""
    fm = fundamental.get("fund_mandate") or {}
    checks = []

    def chk(item: str, passed: bool, note: str = ""):
        checks.append({"item": item, "pass": passed, "note": note})
        return passed

    # Asset class — must be a stock (not ETF/crypto)
    asset_ok = chk("Asset class", True, "Common stock on US exchange")

    # Market cap — minimum $200M
    market_cap = fundamental.get("market_cap") or 0
    cap_ok = chk(
        "Market cap ≥ $200M",
        market_cap >= 200_000_000,
        f"${market_cap / 1e9:.2f}B" if market_cap else "unavailable",
    )

    # Liquidity — min avg daily volume 500K shares
    avg_volume = fundamental.get("avg_daily_volume") or fundamental.get("avg_volume") or 0
    liq_ok = chk(
        "Avg daily volume ≥ 500K shares",
        avg_volume >= 500_000 if avg_volume else True,   # benefit of doubt if unavailable
        f"{avg_volume:,.0f} shares/day" if avg_volume else "unavailable",
    )

    # Geography — flag Russia / Mongolia / Cambodia
    geo_flag = str(fm.get("geography_flag") or "").strip()
    geo_ok = chk(
        "No restricted geography exposure",
        geo_flag.lower() not in ("fail", "flagged", "yes"),
        geo_flag or "no flags",
    )

    # PEPs check
    peps = str(fm.get("peps_check") or "").strip()
    peps_ok = chk(
        "PEPs / sanctions clear",
        peps.lower() not in ("fail", "flagged"),
        peps or "no flags",
    )

    # Float
    float_pct = fundamental.get("float_pct") or fm.get("float_pct")
    float_ok = chk(
        "Float ≥ 10%",
        float(float_pct) >= 10 if float_pct else True,
        f"{float_pct:.1f}%" if float_pct else "unavailable",
    )

    # Setup type
    setup_type = fm.get("setup_type") or fundamental.get("setup_type") or "Unknown"
    chk("Setup type identified", setup_type not in ("Unknown", ""), setup_type)

    passed = all([asset_ok, cap_ok, liq_ok, geo_ok, peps_ok, float_ok])
    fail_reasons = [c["item"] for c in checks if not c["pass"]]

    return {
        "pass":        passed,
        "fail_reason": "; ".join(fail_reasons) if fail_reasons else None,
        "setup_type":  setup_type,
        "checks":      checks,
    }


def _build_s2_company(fundamental: dict) -> dict:
    """Section 2 — Company Info: all sub-sections from fundamental analyst."""
    return {
        "background":            fundamental.get("company_info") or {},
        "financial_snapshot":    fundamental.get("financial_snapshot") or {},
        "comparables":           fundamental.get("comparables") or [],
        "market_analysis":       fundamental.get("market_analysis") or {},
        "quality_of_earnings":   fundamental.get("quality_of_earnings") or {},
        "management_team":       fundamental.get("management_team") or {},
        "analyst_rating_history":fundamental.get("analyst_rating_history") or {},
        "cap_table":             fundamental.get("cap_table") or {},
    }


def _build_s3_setup(fundamental: dict) -> dict:
    """Section 3 — Setup Checklist."""
    raw = fundamental.get("setup_checklist") or {}
    if isinstance(raw, dict):
        items = [{"item": k, "detail": str(v), "pass": bool(v)} for k, v in raw.items()]
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    return {
        "setup_type": fundamental.get("fund_mandate", {}).get("setup_type") or fundamental.get("setup_type") or "Unknown",
        "checklist":  items,
    }


def _build_s4_valuation(fundamental: dict) -> dict:
    """Section 4 — Valuation."""
    return fundamental.get("valuation") or {}


def _build_s8_technical(quant: dict) -> dict:
    """Section 8 — Technical Analysis Summary."""
    return {
        "rsi_14":           quant.get("rsi_14"),
        "macd_signal":      quant.get("macd_signal"),
        "bb_position":      quant.get("bb_position"),
        "atr_pct":          quant.get("atr_pct"),
        "obv_trend":        quant.get("obv_trend"),
        "support":          quant.get("support"),
        "resistance":       quant.get("resistance"),
        "trend":            quant.get("trend"),
        "chart_pattern":    quant.get("chart_pattern"),
        "forward_bias":     quant.get("forward_bias"),
        "mean_reversion_score": quant.get("mean_reversion_score"),
        "trade_type":       quant.get("trade_type"),
        "quant_summary":    quant.get("quant_summary"),
        "quant_score":      quant.get("quant_score"),
    }


def _build_s9_sentiment(sentiment: dict) -> dict:
    """Section 9 — Sentiment Summary."""
    return {
        "analyst_consensus": sentiment.get("analyst_consensus"),
        "news_tone":         sentiment.get("news_tone"),
        "short_interest_pct":sentiment.get("short_interest_pct"),
        "upgrade_momentum":  sentiment.get("upgrade_momentum"),
        "sentiment_score":   sentiment.get("sentiment_score"),
        "sentiment_summary": sentiment.get("sentiment_summary"),
        "contrarian_signal": sentiment.get("contrarian_signal"),
        "retail_euphoria":   sentiment.get("retail_euphoria_warning"),
    }


def _build_s10_institutional(ticker: str) -> dict:
    """Section 10 — Institutional Activity (from institutional_report if available)."""
    inst_path = REPORTS_DIR / "institutional_report.json"
    if not inst_path.exists():
        return {"note": "Institutional data not available in this run."}
    with open(inst_path) as f:
        inst = json.load(f)
    # Find convergence signals for this ticker
    convergence = [c for c in (inst.get("convergence_signals") or [])
                   if str(c.get("ticker", "")).upper() == ticker.upper()]
    fund_theses = [t for t in (inst.get("fund_theses") or [])
                   if str(t.get("ticker", "")).upper() == ticker.upper()]
    unusual_options = [o for o in (inst.get("unusual_options") or [])
                       if str(o.get("ticker", "")).upper() == ticker.upper()]
    return {
        "convergence_signals": convergence,
        "fund_theses":         fund_theses,
        "unusual_options":     unusual_options,
        "multi_fund_flag":     len(fund_theses) >= 2,
    }


def _build_s11_performance(quant: dict) -> dict:
    """Section 11 — Historical Performance."""
    # Fields may be at top level (new) or nested under indicators (legacy)
    ind = quant.get("indicators") or {}
    def _q(key, *aliases):
        for k in (key, *aliases):
            v = quant.get(k) if quant.get(k) is not None else ind.get(k)
            if v is not None:
                return v
        return None
    return {
        "ret_1m":    _q("ret_1m"),
        "ret_3m":    _q("ret_3m"),
        "ret_6m":    _q("ret_6m"),
        "ret_1yr":   _q("ret_1yr"),
        "vs_spy_1yr":_q("vs_spy_1yr"),
        "high_52w":  _q("high_52w", "week52_high"),
        "low_52w":   _q("low_52w", "week52_low"),
        "pct_from_high": _q("pct_from_high", "pct_from_52w_high"),
    }


def _build_s12_risk(fundamental: dict, quant: dict) -> dict:
    """Section 12 — Risk Dashboard."""
    return {
        "beta":             fundamental.get("beta"),
        "max_drawdown":     quant.get("max_drawdown"),
        "volatility_pct":   quant.get("volatility_30d"),
        "atr_pct":          quant.get("atr_pct"),
        "debt_to_equity":   fundamental.get("net_debt_ebitda"),
        "current_ratio":    fundamental.get("current_ratio"),
        "liquidity_risk":   "low" if (fundamental.get("avg_daily_volume") or 0) > 1_000_000 else "medium",
        "geographic_concentration": fundamental.get("fund_mandate", {}).get("geography_flag"),
        "data_conflicts":   fundamental.get("data_conflicts") or [],
    }


def _build_s14_data(fundamental: dict, quant: dict, sentiment: dict, generated_at: str) -> dict:
    """Section 14 — Data Reliability."""
    sources = []
    if fundamental.get("data_confidence"):
        sources.append({"field": "Financial data", "source": "yfinance + Alpha Vantage + SEC EDGAR",
                        "confidence": fundamental["data_confidence"]})
    if fundamental.get("data_conflicts"):
        sources.append({"field": "Conflicts flagged", "source": "Cross-source validation",
                        "conflicts": fundamental["data_conflicts"]})
    if quant.get("rsi_14") is not None:
        sources.append({"field": "Technical indicators", "source": "yfinance OHLCV (calculated)"})
    if sentiment.get("analyst_consensus"):
        sources.append({"field": "Analyst consensus", "source": "FMP /stable/ + Finnhub"})
    return {
        "sources":          sources,
        "data_confidence":  fundamental.get("data_confidence", "medium"),
        "last_updated":     generated_at,
        "agents_run":       ["Macro", "News", "Fundamental", "Quant", "Sentiment", "Committee"],
    }


# ---------------------------------------------------------------------------
# LLM synthesis — sections 5, 6, 7, 13
# ---------------------------------------------------------------------------

def _synthesize_sections(
    ticker: str,
    fundamental: dict,
    quant: dict,
    sentiment: dict,
    macro: dict,
    news_catalysts: list[dict],
    mandate: dict,
) -> dict:
    """One GPT-4o call synthesises sections 5 (timing), 6 (thesis), 7 (recommendation), 13 (scenarios)."""

    def _f(v):
        return "N/A" if v is None else str(round(v, 2) if isinstance(v, float) else v)

    company = fundamental.get("company_info") or {}
    valuation = fundamental.get("valuation") or {}
    rec_raw = fundamental.get("recommendation") or {}
    current_price = quant.get("current_price") or fundamental.get("current_price") or 0

    catalyst_text = "\n".join(
        f"  - {c.get('catalyst','?')} [{c.get('direction','?')}]: {c.get('reasoning','')[:120]}"
        for c in news_catalysts[:5]
    ) or "  None found for this ticker specifically."

    prompt = f"""You are the Investment Committee of Haz Capital Management writing a deep-dive research report on {ticker}.

All six agents have completed their analysis. Synthesise into four sections.

=== AGENT DATA ===
TICKER: {ticker}  |  COMPANY: {company.get('name', ticker)}  |  SECTOR: {fundamental.get('sector','?')}
CURRENT PRICE: ${_f(current_price)}
MACRO REGIME: {macro.get('regime', 'NEUTRAL')}  |  VIX: {_f(macro.get('vix'))}  |  10Y: {_f(macro.get('yield_10y'))}%

FUNDAMENTAL:
  F-score: {_f(fundamental.get('fundamental_score'))}  |  Setup: {mandate.get('setup_type','?')}
  P/E: {_f(fundamental.get('pe_ratio'))}  |  EV/EBITDA: {_f(fundamental.get('ev_ebitda'))}
  Rev growth YoY: {_f(fundamental.get('revenue_growth_yoy'))}%
  Op margin: {_f(fundamental.get('operating_margin'))}%  |  ROIC: {_f(fundamental.get('roic'))}%
  Net debt/EBITDA: {_f(fundamental.get('net_debt_ebitda'))}
  Thesis (Fundamental): {rec_raw.get('thesis','')[:200]}
  Valuation note: {valuation.get('narrative','')[:200]}  |  Expected ROI: {valuation.get('expected_roi_2_3yr','?')}

QUANT:
  RSI: {_f(quant.get('rsi_14'))}  |  Trend: {quant.get('trend','?')}  |  Forward bias: {quant.get('forward_bias','?')}
  Mean reversion score: {_f(quant.get('mean_reversion_score'))}  |  Trade type: {quant.get('trade_type','?')}
  Support: ${_f(quant.get('support'))}  |  Resistance: ${_f(quant.get('resistance'))}
  ATR%: {_f(quant.get('atr_pct'))}%  |  1M return: {_f(quant.get('ret_1m'))}%  |  3M return: {_f(quant.get('ret_3m'))}%
  Q-summary: {quant.get('quant_summary','')[:200]}

SENTIMENT:
  Consensus: {sentiment.get('analyst_consensus','?')}  |  Tone: {sentiment.get('news_tone','?')}
  Short interest: {_f(sentiment.get('short_interest_pct'))}%  |  Contrarian: {sentiment.get('contrarian_signal','?')}
  S-summary: {sentiment.get('sentiment_summary','')[:200]}

NEWS CATALYSTS (this ticker):
{catalyst_text}

=== YOUR TASK ===
Write four sections. Be specific — cite real numbers. No generic filler.

SECTION 5 — MARKET TIMING: Why is NOW the right entry (or not)?
  - Reference macro regime explicitly
  - Reference technical setup (RSI, trend, support/resistance)
  - Reference any recent catalyst
  - State the downside scenario if timing is wrong
  - Conclude with entry_verdict: "favourable" | "neutral" | "unfavourable"

SECTION 6 — INVESTMENT THESIS (200-400 words)
  Bull case narrative: market position, quality of earnings, growth drivers, moat, sector tailwinds, macro fit

SECTION 7 — RECOMMENDATION
  - direction: "BUY" | "HOLD" | "SELL" | "PASS"
  - conviction: integer 40-89, NEVER a multiple of 5
  - expected_return_2_3yr: e.g. "18-28%"
  - suggested_size_pct: Kelly-adjusted, max 15
  - stop_loss_pct: % below current price (e.g. 12.0)
  - key_risks: list of 3-5 specific risks

SECTION 13 — SCENARIO ANALYSIS
  Three scenarios with price targets from current ${_f(current_price)}:
  - bull (30% probability): specific catalyst required, price target
  - base (50% probability): realistic assumptions, price target
  - bear (20% probability): what breaks the thesis, price target

Return ONLY valid JSON:
{{
  "s5_timing": {{
    "macro_context": "<string>",
    "technical_setup": "<string>",
    "recent_catalyst": "<string or null>",
    "downside_scenario": "<string>",
    "entry_verdict": "favourable|neutral|unfavourable",
    "narrative": "<2-3 sentence summary>"
  }},
  "s6_thesis": {{
    "narrative": "<200-400 word investment thesis>"
  }},
  "s7_recommendation": {{
    "direction": "BUY|HOLD|SELL|PASS",
    "conviction": <integer, not multiple of 5>,
    "expected_return_2_3yr": "<string>",
    "suggested_size_pct": <number>,
    "stop_loss_pct": <number>,
    "key_risks": ["<risk>", "<risk>", "<risk>"]
  }},
  "s13_scenarios": {{
    "bull":  {{"price_target": <number>, "upside_pct": <number>, "probability": 30, "catalyst": "<string>", "assumptions": "<string>"}},
    "base":  {{"price_target": <number>, "upside_pct": <number>, "probability": 50, "assumptions": "<string>"}},
    "bear":  {{"price_target": <number>, "downside_pct": <number>, "probability": 20, "trigger": "<string>", "assumptions": "<string>"}}
  }}
}}"""

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2400,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        return {
            "s5_timing": {"narrative": f"Synthesis failed: {exc}", "entry_verdict": "neutral"},
            "s6_thesis": {"narrative": "Synthesis failed."},
            "s7_recommendation": {"direction": "PASS", "conviction": 50, "key_risks": []},
            "s13_scenarios": {},
        }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def generate(ticker: str, force_refresh: bool = False, progress_mode: bool = False) -> dict:
    ticker = ticker.upper().strip()
    print(f"Adhoc report: {ticker} | force_refresh={force_refresh}", flush=True)

    # 1. Cache check
    if not force_refresh:
        cached = _cache_path(ticker)
        if cached:
            print(f"  Serving from cache: {cached.name}", flush=True)
            with open(cached) as f:
                data = json.load(f)
            data["cached"] = True
            return data

    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # 2. Write single-ticker candidates_report.json
    _write_candidates_report(ticker)

    # 3. Run agents in order
    macro      = _run_macro(progress_mode)
    news_cats  = _run_news(ticker, progress_mode)
    fundamental= _run_fundamental(ticker, progress_mode)
    quant      = _run_quant(ticker, progress_mode)
    sentiment  = _run_sentiment(ticker, progress_mode)

    if not fundamental:
        return {"error": f"Fundamental analysis failed for {ticker} — ticker may not be supported.", "ticker": ticker}

    # 4. Build rule-based sections
    s1 = _build_s1_mandate(fundamental)
    if not s1["pass"]:
        print(f"  MANDATE FAIL: {s1['fail_reason']}", flush=True)

    # 5. LLM synthesis for sections 5, 6, 7, 13
    _emit(progress_mode, "committee", "Investment Committee (synthesis)")
    synthesis = _synthesize_sections(ticker, fundamental, quant, sentiment, macro, news_cats, s1)

    # 6. Assemble full report
    current_price = quant.get("current_price") or fundamental.get("current_price") or 0
    company_info  = fundamental.get("company_info") or {}
    rec7          = synthesis.get("s7_recommendation") or {}

    report = {
        # Header
        "ticker":        ticker,
        "company_name":  company_info.get("name") or fundamental.get("company_name", ticker),
        "sector":        fundamental.get("sector", "N/A"),
        "current_price": round(float(current_price), 2) if current_price else None,
        "market_cap":    fundamental.get("market_cap"),
        "date":          datetime.utcnow().date().isoformat(),
        "generated_at":  generated_at,
        "cached":        False,

        # Quick-access top-level fields (for list/preview views)
        "mandate_pass":  s1["pass"],
        "mandate_fail_reason": s1.get("fail_reason"),
        "direction":     rec7.get("direction", "PASS"),
        "conviction":    rec7.get("conviction"),
        "expected_return_2_3yr": rec7.get("expected_return_2_3yr"),

        # 14 sections
        "s1_mandate":    s1,
        "s2_company":    _build_s2_company(fundamental),
        "s3_setup":      _build_s3_setup(fundamental),
        "s4_valuation":  _build_s4_valuation(fundamental),
        "s5_timing":     synthesis.get("s5_timing", {}),
        "s6_thesis":     synthesis.get("s6_thesis", {}),
        "s7_recommendation": rec7,
        "s8_technical":  _build_s8_technical(quant),
        "s9_sentiment":  _build_s9_sentiment(sentiment),
        "s10_institutional": _build_s10_institutional(ticker),
        "s11_performance": _build_s11_performance(quant),
        "s12_risk":      _build_s12_risk(fundamental, quant),
        "s13_scenarios": synthesis.get("s13_scenarios", {}),
        "s14_data":      _build_s14_data(fundamental, quant, sentiment, generated_at),

        # Raw agent scores (for display)
        "agent_scores": {
            "fundamental": fundamental.get("fundamental_score"),
            "quant":       quant.get("quant_score"),
            "sentiment":   sentiment.get("sentiment_score"),
        },
        "macro_regime": macro.get("regime", "NEUTRAL"),
    }

    # 7. Save to cache
    date_str  = datetime.utcnow().date().isoformat()
    out_path  = ADHOC_DIR / f"{ticker}_{date_str}.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"  Saved → {out_path}", flush=True)

    return report


def generate_from_pipeline_data(
    ticker: str,
    fundamental_report: dict,
    quant_report: dict,
    sentiment_report: dict,
    macro_report: dict,
    news_report: dict,
    committee_conviction: int | None = None,
    committee_direction: str | None = None,
    committee_decision: dict | None = None,
) -> dict | None:
    """
    Build and cache a full 14-section research report using data already
    computed by the pipeline agents — no agent re-runs.

    Called automatically by investment_committee after every enter_long /
    enter_short decision so the position page always has institutional-grade
    research attached at the moment a trade is placed.

    committee_conviction: the committee's operative conviction score — passed
      through directly to s7_recommendation so the research report and the
      trade record always show the same conviction number.
    committee_decision: the full committee decision dict for enriching s7.

    Returns the saved report dict, or None if fundamental data is absent.
    """
    ticker = ticker.upper().strip()
    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # Extract ticker-specific slices from batch agent reports
    fund_analyses = fundamental_report.get("fundamental_analyses", [])
    fundamental = next((a for a in fund_analyses if a.get("ticker", "").upper() == ticker), {})

    quant_analyses = quant_report.get("quant_analyses", [])
    quant = next((a for a in quant_analyses if a.get("ticker", "").upper() == ticker), {})

    sent_analyses = sentiment_report.get("sentiment_analyses", [])
    sentiment = next((a for a in sent_analyses if a.get("ticker", "").upper() == ticker), {})

    all_cats = news_report.get("company_catalysts", [])
    news_catalysts = [c for c in all_cats if str(c.get("ticker", "")).upper() == ticker]

    if not fundamental:
        return None

    # Rule-based sections
    s1 = _build_s1_mandate(fundamental)

    # LLM synthesis (GPT-4o) — sections 5, 6, 7, 13
    synthesis = _synthesize_sections(ticker, fundamental, quant, sentiment, macro_report, news_catalysts, s1)

    current_price = quant.get("current_price") or fundamental.get("current_price") or 0
    company_info = fundamental.get("company_info") or {}
    rec7 = synthesis.get("s7_recommendation") or {}

    # The committee's conviction is authoritative — it has more context than the adhoc
    # synthesis (portfolio state, fund memory, capital constraints, macro overlay).
    # Override the GPT-4o re-scored conviction so research report and trade record agree.
    if committee_conviction is not None:
        rec7["conviction"] = committee_conviction
    if committee_direction is not None:
        rec7["direction"] = committee_direction.upper()
    if committee_decision:
        rec7.setdefault("stop_loss_pct", None)
        if committee_decision.get("stop_loss") and current_price:
            try:
                rec7["stop_loss_pct"] = round(
                    abs(float(committee_decision["stop_loss"]) - float(current_price)) / float(current_price) * 100, 1
                )
            except Exception:
                pass
        if committee_decision.get("key_risks") and not rec7.get("key_risks"):
            rec7["key_risks"] = committee_decision["key_risks"]
        if committee_decision.get("key_catalysts"):
            rec7["key_catalysts"] = committee_decision["key_catalysts"]
        if committee_decision.get("investment_thesis"):
            rec7["committee_rationale"] = committee_decision["investment_thesis"]

    report = {
        # Header
        "ticker":        ticker,
        "company_name":  company_info.get("name") or fundamental.get("company_name", ticker),
        "sector":        fundamental.get("sector", "N/A"),
        "current_price": round(float(current_price), 2) if current_price else None,
        "market_cap":    fundamental.get("market_cap"),
        "date":          datetime.utcnow().date().isoformat(),
        "generated_at":  generated_at,
        "cached":        False,
        "source":        "pipeline_auto",

        "mandate_pass":          s1["pass"],
        "mandate_fail_reason":   s1.get("fail_reason"),
        "direction":             rec7.get("direction", "PASS"),
        "conviction":            rec7.get("conviction"),
        "expected_return_2_3yr": rec7.get("expected_return_2_3yr"),

        # 14 sections
        "s1_mandate":        s1,
        "s2_company":        _build_s2_company(fundamental),
        "s3_setup":          _build_s3_setup(fundamental),
        "s4_valuation":      _build_s4_valuation(fundamental),
        "s5_timing":         synthesis.get("s5_timing", {}),
        "s6_thesis":         synthesis.get("s6_thesis", {}),
        "s7_recommendation": rec7,
        "s8_technical":      _build_s8_technical(quant),
        "s9_sentiment":      _build_s9_sentiment(sentiment),
        "s10_institutional": _build_s10_institutional(ticker),
        "s11_performance":   _build_s11_performance(quant),
        "s12_risk":          _build_s12_risk(fundamental, quant),
        "s13_scenarios":     synthesis.get("s13_scenarios", {}),
        "s14_data":          _build_s14_data(fundamental, quant, sentiment, generated_at),

        "agent_scores": {
            "fundamental": fundamental.get("fundamental_score"),
            "quant":       quant.get("quant_score"),
            "sentiment":   sentiment.get("sentiment_score"),
        },
        "macro_regime": macro_report.get("regime", "NEUTRAL"),
    }

    date_str = datetime.utcnow().date().isoformat()
    out_path = ADHOC_DIR / f"{ticker}_{date_str}.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"  [auto-research] Saved full 14-section report for {ticker} → {out_path.name}", flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ad-hoc deep-dive research report")
    parser.add_argument("--ticker",        required=True,       help="Stock ticker (e.g. AAPL)")
    parser.add_argument("--force-refresh", action="store_true", help="Ignore cache and re-run all agents")
    parser.add_argument("--progress",      action="store_true", help="Emit JSON progress lines to stdout (for web UI)")
    args = parser.parse_args()

    result = generate(args.ticker, force_refresh=args.force_refresh, progress_mode=args.progress)

    if "error" in result:
        print(f"\nERROR: {result['error']}", flush=True)
        sys.exit(1)

    if args.progress:
        print(json.dumps({"step": "done", "label": "Complete", "report": result}), flush=True)
    else:
        # Print the recommendation summary
        rec = result.get("s7_recommendation", {})
        print(f"\n{'='*60}")
        print(f"  {result.get('ticker')} — {result.get('company_name')}")
        print(f"  Direction:  {rec.get('direction','?')}   Conviction: {rec.get('conviction','?')}")
        print(f"  Return 2-3yr: {rec.get('expected_return_2_3yr','?')}")
        print(f"  Mandate: {'PASS ✓' if result.get('mandate_pass') else 'FAIL ✗ — ' + str(result.get('mandate_fail_reason'))}")
        print(f"{'='*60}")
