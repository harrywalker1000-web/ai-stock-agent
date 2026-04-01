"""
Agent 5 — Candidate Generator
Phase 2: runs after all Phase 1 agents complete.

Reads Phase 1 reports, applies weighted multi-source scoring, applies
confidence adjustments, applies freshness penalty from past runs, then
produces a shortlist of ~50 candidates for Phase 3 deep analysis.

Signal weights (from PRD):
  institutional_signal   +2  (smart money matters most)
  fresh_catalyst         +2  (new information is most actionable)
  sector_momentum        +1
  macro_tailwind         +1
  analyst_upgrade        +1
  insider_buying         +1

Confidence adjustment:
  high confidence  → 1.0× weight
  medium           → 0.75×
  low              → 0.5×

Freshness penalty:
  -1 per appearance in last 5 daily runs (unless a new catalyst emerged)

Note: smaller Russell 2000 stocks will naturally score lower on institutional
and analyst signals due to less coverage — this is expected behaviour.
"""

import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from openai import OpenAI

from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
CANDIDATES_DIR = ROOT / "data" / "candidates"
UNIVERSE_PATH = ROOT / "data" / "universe.csv"

CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)

# Output paths
TODAY = datetime.now().strftime("%Y-%m-%d")
DAILY_OUT = CANDIDATES_DIR / f"candidates_{TODAY}.json"
REPORT_OUT = REPORTS_DIR / "candidates_report.json"

# ---------------------------------------------------------------------------
# Scoring constants
# ---------------------------------------------------------------------------
WEIGHTS = {
    "institutional_signal": 2,
    "fresh_catalyst": 2,
    "sector_momentum": 1,
    "macro_tailwind": 1,
    "analyst_upgrade": 1,
    "insider_buying": 1,
    "dislocation_screen": 1.5,   # down >20% in a month = potential mean reversion opportunity
    "activist_filing_13d": 3.0,  # 13D = activist >5% stake with control intent — strongest institutional signal
    "activist_filing_13g": 1.5,  # 13G = passive >5% stake — medium signal
    "unusual_options": 2.0,      # unusual call/put sweep = institutional telegraphing before move
}

CONFIDENCE_MULTIPLIERS = {
    "high": 1.0,
    "medium": 0.75,
    "low": 0.5,
    "low_fresh": 0.5,  # news_agent uses this variant
}

SCORE_THRESHOLD = 3         # Minimum score to proceed
FALLBACK_THRESHOLD = 2      # Used if fewer than 50 stocks pass the main threshold
MAX_CANDIDATES = 50
MIN_CANDIDATES = 50
FRESHNESS_LOOKBACK = 5      # Days to look back for freshness penalty


# ---------------------------------------------------------------------------
# Load universe
# ---------------------------------------------------------------------------
def _load_universe() -> dict[str, dict]:
    """
    Returns dict: ticker → {name, sector_etf, gics_sector, in_sp500, price, avg_volume}
    Falls back gracefully if universe.csv doesn't exist yet.
    """
    if not UNIVERSE_PATH.exists():
        logger.warning(
            "data/universe.csv not found. Run scripts/build_universe.py first. "
            "Proceeding without universe filter — all signal tickers will be included."
        )
        return {}

    df = pd.read_csv(UNIVERSE_PATH)
    universe = {}
    for _, row in df.iterrows():
        universe[str(row["ticker"]).strip()] = {
            "name": str(row.get("name", "")),
            "sector_etf": str(row.get("sector_etf", "")),
            "gics_sector": str(row.get("gics_sector", "")),
            "in_sp500": bool(row.get("in_sp500", False)),
            "price": float(row.get("price", 0)),
            "avg_volume": int(row.get("avg_volume", 0)),
        }
    logger.info(f"Loaded universe: {len(universe)} stocks")
    return universe


# ---------------------------------------------------------------------------
# Load Phase 1 reports
# ---------------------------------------------------------------------------
def _load_report(name: str) -> dict:
    path = REPORTS_DIR / f"{name}.json"
    if not path.exists():
        logger.warning(f"Report not found: {path}")
        return {}
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Signal extraction helpers
# ---------------------------------------------------------------------------

def _confidence_mult(level: str) -> float:
    return CONFIDENCE_MULTIPLIERS.get(str(level).lower(), 0.75)


def _extract_macro_signals(macro: dict) -> dict[str, Any]:
    """
    Returns:
      regime: str
      macro_confidence: float (0-1)
      macro_favoured_etfs: set of ETFs that benefit from this regime
    """
    regime = macro.get("regime", "NEUTRAL")
    conf_level = macro.get("signal_confidence", {}).get("level", "medium")
    macro_mult = _confidence_mult(conf_level)

    # Map macro regime to ETFs that tend to benefit
    RISK_OFF_ETFS = {"XLE", "XLU", "XLP", "XLV", "XLB"}   # defensive / commodities
    RISK_ON_ETFS = {"XLK", "XLF", "XLY", "XLI", "XLC"}    # growth / cyclical
    NEUTRAL_ETFS = set(RISK_OFF_ETFS | RISK_ON_ETFS)

    if regime == "RISK-OFF":
        macro_favoured_etfs = RISK_OFF_ETFS
    elif regime == "RISK-ON":
        macro_favoured_etfs = RISK_ON_ETFS
    else:
        macro_favoured_etfs = NEUTRAL_ETFS   # NEUTRAL: don't penalise any sector

    return {
        "regime": regime,
        "macro_mult": macro_mult,
        "macro_favoured_etfs": macro_favoured_etfs,
    }


def _extract_sector_signals(sector: dict) -> dict[str, Any]:
    """Returns top_sectors set, avoid_sectors set, sector confidence."""
    top = set(sector.get("top_sectors", []))
    avoid = set(sector.get("avoid_sectors", []))
    conf_level = sector.get("confidence", 70)
    # Convert numeric confidence to level string
    if isinstance(conf_level, (int, float)):
        level = "high" if conf_level >= 75 else "medium" if conf_level >= 50 else "low"
    else:
        level = str(conf_level).lower()
    return {"top_sectors": top, "avoid_sectors": avoid, "sector_conf_mult": _confidence_mult(level)}


def _extract_institutional_signals(inst: dict) -> dict[str, Any]:
    """
    Returns:
      analyst_tickers: dict ticker → {conf_mult, score_contribution}
      insider_tickers: dict ticker → conf_mult
      top_inst_tickers: set of tickers (LLM-validated institutional signals)
    """
    analyst_tickers: dict[str, float] = {}
    for item in inst.get("analyst_upgrades", []):
        ticker = str(item.get("ticker", "")).strip().upper()
        if not ticker:
            continue
        # Infer confidence from signal field
        signal = str(item.get("signal", "")).lower()
        if "strong conviction" in signal or item.get("consensus") == "strong_buy":
            mult = 1.0
        elif "conviction" in signal or item.get("consensus") == "buy":
            mult = 0.75
        else:
            mult = 0.5
        analyst_tickers[ticker] = max(analyst_tickers.get(ticker, 0), mult)

    insider_tickers: dict[str, float] = {}
    for item in inst.get("insider_buys", []):
        ticker = str(item.get("ticker", "")).strip().upper()
        if not ticker:
            continue
        # Insider buys are always medium confidence unless explicitly flagged
        insider_tickers[ticker] = insider_tickers.get(ticker, 0.75)

    top_inst_tickers = {
        str(t).strip().upper()
        for t in inst.get("top_institutional_signals", [])
        if t
    }

    # Activist filings (13D/13G) — extract resolved tickers
    activist_13d: set[str] = set()
    activist_13g: set[str] = set()
    for filing in inst.get("activist_signals", []):
        ticker = str(filing.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        if "13D" in str(filing.get("form_type", "")):
            activist_13d.add(ticker)
        else:
            activist_13g.add(ticker)

    # Unusual options — extract tickers with bullish or bearish sweeps
    unusual_calls: dict[str, float] = {}  # ticker → max vol/OI ratio
    unusual_puts: dict[str, float] = {}
    for opt in inst.get("unusual_options_signals", []):
        ticker = str(opt.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        ratio = float(opt.get("max_vol_oi_ratio", 0))
        if opt.get("direction", "").lower() == "bullish":
            unusual_calls[ticker] = max(unusual_calls.get(ticker, 0), ratio)
        else:
            unusual_puts[ticker] = max(unusual_puts.get(ticker, 0), ratio)

    return {
        "analyst_tickers": analyst_tickers,
        "insider_tickers": insider_tickers,
        "top_inst_tickers": top_inst_tickers,
        "activist_13d": activist_13d,
        "activist_13g": activist_13g,
        "unusual_calls": unusual_calls,
        "unusual_puts": unusual_puts,
    }


def _extract_news_signals(news: dict) -> dict[str, Any]:
    """
    Returns:
      catalyst_tickers: dict ticker → {conf_mult, direction, catalyst_type, freshness}
      top_catalyst_tickers: set
    """
    catalyst_tickers: dict[str, dict] = {}

    for item in news.get("fresh_catalysts", []):
        ticker = str(item.get("ticker", "")).strip().upper()
        if not ticker:
            continue
        conf = item.get("signal_confidence", {})
        mult = _confidence_mult(conf.get("level", "medium"))
        freshness = str(item.get("freshness", ""))
        direction = str(item.get("direction", "LONG")).upper()
        ctype = str(item.get("catalyst_type", ""))

        # If ticker already seen, keep the higher-confidence version
        existing = catalyst_tickers.get(ticker)
        if existing is None or mult > existing["conf_mult"]:
            catalyst_tickers[ticker] = {
                "conf_mult": mult,
                "direction": direction,
                "catalyst_type": ctype,
                "freshness": freshness,
            }

    top_catalyst_tickers = {
        str(t).strip().upper()
        for t in news.get("top_catalyst_tickers", [])
        if t
    }

    return {"catalyst_tickers": catalyst_tickers, "top_catalyst_tickers": top_catalyst_tickers}


# ---------------------------------------------------------------------------
# Freshness penalty — check past candidate runs
# ---------------------------------------------------------------------------
def _load_recent_candidate_tickers() -> dict[str, int]:
    """
    Returns dict: ticker → number of appearances in last FRESHNESS_LOOKBACK days.
    Excludes today's file.
    """
    appearances: dict[str, int] = {}
    cutoff = datetime.now() - timedelta(days=FRESHNESS_LOOKBACK)

    for path in sorted(CANDIDATES_DIR.glob("candidates_*.json")):
        # Parse date from filename
        m = re.search(r"candidates_(\d{4}-\d{2}-\d{2})\.json", path.name)
        if not m:
            continue
        file_date = datetime.strptime(m.group(1), "%Y-%m-%d")
        if file_date < cutoff or m.group(1) == TODAY:
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            for c in data.get("candidates", []):
                t = str(c.get("ticker", "")).strip().upper()
                if t:
                    appearances[t] = appearances.get(t, 0) + 1
        except Exception:
            continue

    return appearances


def _load_momentum_decay() -> dict[str, int]:
    """
    Returns dict: ticker → consecutive days appeared in candidate list without being selected.
    Used to apply momentum decay penalty (-1.5 per consecutive unselected day).
    """
    decay: dict[str, int] = {}
    # Load committee_report.json to see which tickers were actually entered
    committee_path = REPORTS_DIR / "committee_report.json"
    if not committee_path.exists():
        return decay

    selected_tickers: set[str] = set()
    try:
        with open(committee_path) as f:
            cr = json.load(f)
        for d in cr.get("position_decisions", []):
            if d.get("action", "").startswith("enter"):
                selected_tickers.add(str(d.get("ticker", "")).upper())
    except Exception:
        return decay

    # Count consecutive days in candidate list without selection
    cutoff = datetime.now() - timedelta(days=FRESHNESS_LOOKBACK)
    for path in sorted(CANDIDATES_DIR.glob("candidates_*.json"), reverse=True):
        m = re.search(r"candidates_(\d{4}-\d{2}-\d{2})\.json", path.name)
        if not m:
            continue
        file_date = datetime.strptime(m.group(1), "%Y-%m-%d")
        if file_date < cutoff or m.group(1) == TODAY:
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            for c in data.get("candidates", []):
                t = str(c.get("ticker", "")).strip().upper()
                if t and t not in selected_tickers:
                    decay[t] = decay.get(t, 0) + 1
        except Exception:
            continue

    return decay


def _load_recently_seen_tickers(days: int = 5) -> set[str]:
    """Return set of tickers that appeared in candidates list in the last `days` days."""
    seen: set[str] = set()
    cutoff = datetime.now() - timedelta(days=days)
    for path in sorted(CANDIDATES_DIR.glob("candidates_*.json")):
        m = re.search(r"candidates_(\d{4}-\d{2}-\d{2})\.json", path.name)
        if not m:
            continue
        file_date = datetime.strptime(m.group(1), "%Y-%m-%d")
        if file_date < cutoff or m.group(1) == TODAY:
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            for c in data.get("candidates", []):
                t = str(c.get("ticker", "")).strip().upper()
                if t:
                    seen.add(t)
        except Exception:
            continue
    return seen


# ---------------------------------------------------------------------------
# Dislocation screen — forward-looking mean-reversion candidates
# ---------------------------------------------------------------------------

def _fetch_dislocation_candidates(
    universe: dict,
    avoid_sectors: set,
    max_tickers: int = 150,
) -> dict[str, float]:
    """
    Scans S&P 500 members in non-avoid sectors for stocks down >20% in the last month.
    These are potential mean-reversion longs regardless of Phase 1 signal coverage.
    Returns dict: ticker → 1M return (negative float).
    Capped at max_tickers to avoid slowing the pipeline.
    """
    to_check = [
        t for t, meta in universe.items()
        if meta.get("in_sp500") and meta.get("sector_etf") not in avoid_sectors
    ][:max_tickers]

    if not to_check:
        return {}

    try:
        df = yf.download(
            to_check,
            period="1mo",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        if df.empty:
            return {}

        close = df["Close"] if isinstance(df.columns, pd.MultiIndex) else df
        dislocated: dict[str, float] = {}
        for ticker in to_check:
            if ticker not in close.columns:
                continue
            prices = close[ticker].dropna()
            if len(prices) < 15:
                continue
            ret_1m = (float(prices.iloc[-1]) - float(prices.iloc[0])) / abs(float(prices.iloc[0]))
            if ret_1m <= -0.20:
                dislocated[ticker] = round(ret_1m, 4)
        return dislocated
    except Exception as exc:
        logger.warning("Dislocation screen failed: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# Core scoring engine
# ---------------------------------------------------------------------------
def _score_candidates(
    universe: dict[str, dict],
    macro_signals: dict,
    sector_signals: dict,
    inst_signals: dict,
    news_signals: dict,
    recent_appearances: dict[str, int],
    dislocation_tickers: dict[str, float] | None = None,
    momentum_decay: dict[str, int] | None = None,
    recently_seen: set[str] | None = None,
) -> list[dict]:
    """
    Scores every ticker that appears in at least one signal source.
    Returns list of candidate dicts sorted by score descending.
    """
    # Gather all candidate tickers from signal sources
    candidate_tickers: set[str] = set()
    candidate_tickers.update(inst_signals["analyst_tickers"].keys())
    candidate_tickers.update(inst_signals["insider_tickers"].keys())
    candidate_tickers.update(inst_signals["top_inst_tickers"])
    candidate_tickers.update(inst_signals.get("activist_13d", set()))
    candidate_tickers.update(inst_signals.get("activist_13g", set()))
    candidate_tickers.update(inst_signals.get("unusual_calls", {}).keys())
    candidate_tickers.update(inst_signals.get("unusual_puts", {}).keys())
    candidate_tickers.update(news_signals["catalyst_tickers"].keys())
    candidate_tickers.update(news_signals["top_catalyst_tickers"])
    if dislocation_tickers:
        candidate_tickers.update(dislocation_tickers.keys())

    macro_favoured_etfs = macro_signals["macro_favoured_etfs"]
    macro_mult = macro_signals["macro_mult"]
    top_sectors = sector_signals["top_sectors"]
    avoid_sectors = sector_signals["avoid_sectors"]
    sector_conf_mult = sector_signals["sector_conf_mult"]

    scored: list[dict] = []

    for ticker in candidate_tickers:
        ticker = ticker.upper().strip()
        if not ticker:
            continue

        # Check universe membership (if universe loaded)
        if universe and ticker not in universe:
            continue  # filtered out (below $3, low volume, or not in index)

        meta = universe.get(ticker, {})
        sector_etf = meta.get("sector_etf", "")

        score = 0.0
        signals_hit: list[str] = []
        direction_votes: list[str] = []

        # --- institutional_signal (+2) ---
        if ticker in inst_signals["top_inst_tickers"]:
            # top_inst_tickers = LLM-validated, medium+ confidence
            score += WEIGHTS["institutional_signal"] * 0.75
            signals_hit.append("institutional_signal")

        # --- analyst_upgrade (+1) ---
        if ticker in inst_signals["analyst_tickers"]:
            mult = inst_signals["analyst_tickers"][ticker]
            score += WEIGHTS["analyst_upgrade"] * mult
            signals_hit.append("analyst_upgrade")
            direction_votes.append("LONG")

        # --- insider_buying (+1) ---
        if ticker in inst_signals["insider_tickers"]:
            mult = inst_signals["insider_tickers"][ticker]
            score += WEIGHTS["insider_buying"] * mult
            signals_hit.append("insider_buying")
            direction_votes.append("LONG")

        # --- fresh_catalyst (+2) ---
        if ticker in news_signals["catalyst_tickers"]:
            cat = news_signals["catalyst_tickers"][ticker]
            score += WEIGHTS["fresh_catalyst"] * cat["conf_mult"]
            signals_hit.append("fresh_catalyst")
            direction_votes.append(cat.get("direction", "LONG"))

        # --- activist_filing_13d (+3.0) — highest conviction institutional signal ---
        if ticker in inst_signals.get("activist_13d", set()):
            score += WEIGHTS["activist_filing_13d"]
            signals_hit.append("activist_13d")
            direction_votes.append("LONG")

        # --- activist_filing_13g (+1.5) ---
        if ticker in inst_signals.get("activist_13g", set()):
            score += WEIGHTS["activist_filing_13g"]
            signals_hit.append("activist_13g")
            direction_votes.append("LONG")

        # --- unusual_options (+2.0) — institutional telegraphing ---
        unusual_call_ratio = inst_signals.get("unusual_calls", {}).get(ticker, 0)
        unusual_put_ratio = inst_signals.get("unusual_puts", {}).get(ticker, 0)
        if unusual_call_ratio > 0:
            score += WEIGHTS["unusual_options"]
            signals_hit.append(f"unusual_calls({unusual_call_ratio:.1f}x_vol_oi)")
            direction_votes.append("LONG")
        elif unusual_put_ratio > 0:
            score += WEIGHTS["unusual_options"] * 0.5  # puts = short signal, half weight (could be hedge)
            signals_hit.append(f"unusual_puts({unusual_put_ratio:.1f}x_vol_oi)")
            direction_votes.append("SHORT")

        # --- dislocation_screen (+1.5) ---
        if dislocation_tickers and ticker in dislocation_tickers:
            score += WEIGHTS["dislocation_screen"]
            ret_1m = dislocation_tickers[ticker]
            signals_hit.append(f"dislocation_screen({ret_1m*100:.0f}%_1m)")
            direction_votes.append("LONG")  # dislocation = potential mean reversion long

        # --- sector_momentum (+1) ---
        if sector_etf and sector_etf in top_sectors:
            score += WEIGHTS["sector_momentum"] * sector_conf_mult
            signals_hit.append("sector_momentum")
        elif sector_etf and sector_etf in avoid_sectors:
            score -= 0.5  # small penalty for being in an avoid sector

        # --- macro_tailwind (+1) ---
        if sector_etf and sector_etf in macro_favoured_etfs:
            score += WEIGHTS["macro_tailwind"] * macro_mult
            signals_hit.append("macro_tailwind")

        # --- freshness penalty (-1 per recent appearance) ---
        appearances = recent_appearances.get(ticker, 0)
        freshness_penalty = -appearances

        # --- momentum decay: -1.5 per consecutive day appeared without being selected ---
        decay_days = (momentum_decay or {}).get(ticker, 0)
        momentum_decay_penalty = -decay_days * 1.5

        # --- recency bonus: +0.5 for tickers not seen in the last 5 days ---
        recency_bonus = 0.5 if ticker not in (recently_seen or set()) else 0.0

        final_score = score + freshness_penalty + momentum_decay_penalty + recency_bonus

        # Determine direction hint (majority vote)
        long_votes = direction_votes.count("LONG")
        short_votes = direction_votes.count("SHORT")
        if short_votes > long_votes:
            direction_hint = "SHORT"
        elif long_votes > 0:
            direction_hint = "LONG"
        else:
            direction_hint = "LONG"  # default

        catalyst_info = news_signals["catalyst_tickers"].get(ticker, {})

        scored.append({
            "ticker": ticker,
            "score": round(final_score, 2),
            "raw_score": round(score, 2),
            "freshness_penalty": freshness_penalty,
            "momentum_decay_penalty": round(momentum_decay_penalty, 2),
            "recency_bonus": recency_bonus,
            "signals": signals_hit,
            "direction_hint": direction_hint,
            "sector_etf": sector_etf,
            "catalyst_type": catalyst_info.get("catalyst_type", ""),
            "catalyst_freshness": catalyst_info.get("freshness", ""),
            "name": meta.get("name", ""),
            "in_sp500": meta.get("in_sp500", False),
        })

    # Sort by final score descending
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


# ---------------------------------------------------------------------------
# Threshold logic
# ---------------------------------------------------------------------------
def _apply_threshold(scored: list[dict]) -> list[dict]:
    """
    Apply the PRD threshold logic:
    - 3+ points: proceed
    - If <50 stocks pass, lower to 2+
    - If >60 stocks pass, take top 50
    """
    above_threshold = [c for c in scored if c["score"] >= SCORE_THRESHOLD]

    if len(above_threshold) >= MIN_CANDIDATES:
        candidates = above_threshold[:MAX_CANDIDATES]
        threshold_used = SCORE_THRESHOLD
    elif len(above_threshold) > 0:
        # Try 2+ threshold
        fallback = [c for c in scored if c["score"] >= FALLBACK_THRESHOLD]
        candidates = fallback[:MAX_CANDIDATES]
        threshold_used = FALLBACK_THRESHOLD
        logger.info(
            f"Fewer than {MIN_CANDIDATES} stocks at {SCORE_THRESHOLD}+ threshold. "
            f"Lowered to {FALLBACK_THRESHOLD}+. Got {len(candidates)}."
        )
    else:
        # Edge case: nothing scored well enough — take top 30 regardless
        candidates = scored[:30]
        threshold_used = 0.0
        logger.warning("No stocks exceeded threshold — taking top 30 by score")

    logger.info(f"Threshold {threshold_used}: {len(candidates)} candidates selected")
    return candidates


# ---------------------------------------------------------------------------
# LLM summary
# ---------------------------------------------------------------------------
def _generate_summary(
    candidates: list[dict],
    macro: dict,
    sector: dict,
) -> str:
    """
    Lightweight GPT-4o-mini call to produce a plain-language generation_summary.
    """
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    regime = macro.get("regime", "UNKNOWN")
    top_sectors = sector.get("top_sectors", [])
    top5 = [f"{c['ticker']} (score {c['score']}, signals: {', '.join(c['signals'])})" for c in candidates[:5]]
    top5_str = "\n".join(top5)

    prompt = f"""You are summarising the output of an automated stock candidate screening system.

Today's macro regime: {regime}
Top sectors: {', '.join(top_sectors)}
Total candidates selected: {len(candidates)}
Top 5 candidates:
{top5_str}

Write 2-3 sentences explaining today's screening results — what drove the selection, which signal types dominated, and any notable themes. Be concise and factual."""

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=200,
        response_format={"type": "text"},
    )
    return resp.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------
def run(mode: str = "new_opportunities", held_tickers: list[str] | None = None) -> dict:
    logger.info("=== Candidate Generator (Agent 5) — mode: %s ===", mode)

    # Portfolio review fast-path: skip all scoring, universe filter, freshness — return held tickers directly
    if mode == "portfolio_review":
        if not held_tickers:
            logger.info("Portfolio review mode: no held tickers — nothing to review")
            return {
                "candidates": [],
                "total_candidates": 0,
                "mode": "portfolio_review",
                "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
            }
        candidates = [
            {
                "ticker": t,
                "direction_hint": "LONG",  # will be overridden by position context in downstream agents
                "score": None,
                "signals": [],
                "freshness_penalty": 0,
                "confidence_adjustment": 1.0,
            }
            for t in held_tickers
        ]
        logger.info("Portfolio review mode: passing through %d held tickers", len(candidates))
        return {
            "candidates": candidates,
            "total_candidates": len(candidates),
            "mode": "portfolio_review",
            "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        }

    # Load universe
    universe = _load_universe()

    # Load Phase 1 reports
    macro = _load_report("macro_report")
    sector = _load_report("sector_report")
    inst = _load_report("institutional_report")
    news = _load_report("news_report")

    if not any([macro, sector, inst, news]):
        raise RuntimeError("No Phase 1 reports found in data/reports/. Run Phase 1 agents first.")

    # Extract signals
    logger.info("Extracting signals from Phase 1 reports...")
    macro_signals = _extract_macro_signals(macro)
    sector_signals = _extract_sector_signals(sector)
    inst_signals = _extract_institutional_signals(inst)
    news_signals = _extract_news_signals(news)

    logger.info(f"  Macro regime: {macro_signals['regime']}")
    logger.info(f"  Top sectors: {sector_signals['top_sectors']}")
    logger.info(f"  Analyst tickers: {len(inst_signals['analyst_tickers'])}")
    logger.info(f"  Top institutional: {len(inst_signals['top_inst_tickers'])}")
    logger.info(f"  Catalyst tickers: {len(news_signals['catalyst_tickers'])}")

    # Load freshness data from past runs
    recent_appearances = _load_recent_candidate_tickers()
    if recent_appearances:
        logger.info(f"  Freshness data: {len(recent_appearances)} tickers seen in last {FRESHNESS_LOOKBACK} days")

    # Load momentum decay (consecutive days appeared without being selected)
    momentum_decay = _load_momentum_decay()
    if momentum_decay:
        logger.info("  Momentum decay: %d tickers have consecutive-unselected penalty", len(momentum_decay))

    # Load recently seen tickers for recency bonus
    recently_seen = _load_recently_seen_tickers(days=5)

    # Dislocation screen: find S&P 500 stocks down >20% in the last month
    dislocation_tickers: dict[str, float] = {}
    if universe:
        dislocation_tickers = _fetch_dislocation_candidates(
            universe, sector_signals["avoid_sectors"]
        )
        if dislocation_tickers:
            logger.info(
                "Dislocation screen: %d stocks down >20%% in last month — added as mean-reversion candidates",
                len(dislocation_tickers),
            )

    # Score candidates
    scored = _score_candidates(
        universe, macro_signals, sector_signals, inst_signals, news_signals,
        recent_appearances, dislocation_tickers,
        momentum_decay=momentum_decay,
        recently_seen=recently_seen,
    )
    logger.info(f"Scored {len(scored)} candidate tickers")

    # Apply threshold
    candidates = _apply_threshold(scored)

    # Enforce minimum 20% new tickers (not seen in last 10 days)
    new_cutoff_days = 10
    tickers_10d = _load_recently_seen_tickers(days=new_cutoff_days)
    new_tickers = [c for c in candidates if c["ticker"] not in tickers_10d]
    old_tickers = [c for c in candidates if c["ticker"] in tickers_10d]
    min_new = max(1, len(candidates) // 5)   # 20%
    if len(new_tickers) < min_new:
        # Pull in more new tickers from the scored list that didn't make the threshold
        remaining_new = [c for c in scored if c["ticker"] not in tickers_10d and c not in new_tickers]
        needed = min_new - len(new_tickers)
        extra_new = remaining_new[:needed]
        if extra_new:
            # Replace the lowest-scoring old tickers with fresh ones
            old_tickers = sorted(old_tickers, key=lambda x: x["score"])
            old_tickers = old_tickers[len(extra_new):]  # drop weakest
            candidates = sorted(new_tickers + extra_new + old_tickers, key=lambda x: x["score"], reverse=True)
            logger.info("Variety enforcement: added %d fresh tickers to reach 20%% new minimum", len(extra_new))

    variety_pct = round(len(new_tickers) / max(1, len(candidates)) * 100, 1)
    logger.info("Candidate variety: %d/%d new tickers (%.0f%% not seen in last %dd)",
                len(new_tickers), len(candidates), variety_pct, new_cutoff_days)

    # Generate LLM summary
    logger.info("Generating summary via GPT-4o-mini...")
    generation_summary = _generate_summary(candidates, macro, sector)

    # Build output
    output = {
        "candidates": candidates,
        "total_candidates": len(candidates),
        "generation_summary": generation_summary,
        "scoring_metadata": {
            "macro_regime": macro_signals["regime"],
            "top_sectors": list(sector_signals["top_sectors"]),
            "avoid_sectors": list(sector_signals["avoid_sectors"]),
            "signal_counts": {
                "analyst_upgrades": len(inst_signals["analyst_tickers"]),
                "institutional_top": len(inst_signals["top_inst_tickers"]),
                "catalyst_tickers": len(news_signals["catalyst_tickers"]),
                "insider_buys": len(inst_signals["insider_tickers"]),
            },
            "threshold_used": SCORE_THRESHOLD,
            "universe_size": len(universe) if universe else "not loaded",
            "freshness_penalised": sum(1 for t in candidates if t["freshness_penalty"] < 0),
            "momentum_decay_applied": sum(1 for t in candidates if t.get("momentum_decay_penalty", 0) < 0),
            "recency_bonus_applied": sum(1 for t in candidates if t.get("recency_bonus", 0) > 0),
            "new_tickers_pct": variety_pct,
        },
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    # Save outputs
    with open(DAILY_OUT, "w") as f:
        json.dump(output, f, indent=2)
    with open(REPORT_OUT, "w") as f:
        json.dump(output, f, indent=2)

    logger.info(f"Saved candidates to {DAILY_OUT}")
    logger.info(f"Saved report to {REPORT_OUT}")
    logger.info(f"=== Candidate Generator complete: {len(candidates)} candidates ===")
    logger.info(f"Summary: {generation_summary}")

    return output


if __name__ == "__main__":
    result = run()
    print("\nTop 10 candidates:")
    for c in result["candidates"][:10]:
        print(f"  {c['ticker']:6s}  score={c['score']:.2f}  signals={c['signals']}  dir={c['direction_hint']}")
