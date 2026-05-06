"""
Agent 7 — Quant & Technical Analyst
Phase 3: runs in parallel with Agents 6 (Fundamental) and 8 (Sentiment).

Responsibilities:
  - Full technical indicator suite via ta library (RSI, MACD, BB, ATR, Stochastic, OBV)
  - Volume analysis: OBV trend, volume ratio vs 20-day average
  - Momentum: 1W/1M/3M returns, relative strength vs SPY
  - Trend: 50/200 SMA, price position, golden/death cross detection
  - Support/resistance levels from swing highs/lows
  - Chart pattern detection: higher highs/lows, consolidation, MA crossovers
  - Pattern learning: read .swarm/memory.db + data/memory/pattern_history.json to
    surface how the same signal combinations have historically performed in this system.
    New-system state → neutral weighting with a clear note. As trade history builds,
    confidence scores will be informed by our own hit rates.

Multi-source confidence rule (consistent with all other agents):
  Source 1: price action (trend direction, MA position)
  Source 2: volume confirmation (OBV direction matches price, above-avg volume)
  Source 3: momentum oscillators (RSI + MACD agreeing on direction)
  high = all 3 confirm | medium = 2/3 | low = 1/3 or sources conflict
"""

import json
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import ta
import ta.momentum
import ta.trend
import ta.volatility
import ta.volume
import yfinance as yf
from dotenv import load_dotenv
from openai import OpenAI

import agents.memory_agent as memory
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
MEMORY_PATH = ROOT / "data" / "memory" / "pattern_history.json"
SWARM_DB = ROOT / ".swarm" / "memory.db"
OUT_PATH = REPORTS_DIR / "quant_report.json"
POSITIONS_LOG_PATH = ROOT / "data" / "memory" / "positions_log.json"

MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Price data fetch
# ---------------------------------------------------------------------------

def _fetch_ohlcv(ticker: str, period: str = "1y") -> pd.DataFrame | None:
    """Download OHLCV, flatten MultiIndex columns, return None on failure."""
    try:
        df = yf.download(ticker, period=period, auto_adjust=True, progress=False)
        if df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df.dropna()
    except Exception as exc:
        logger.error("OHLCV fetch failed for %s: %s", ticker, exc)
        return None


# ---------------------------------------------------------------------------
# Technical indicators
# ---------------------------------------------------------------------------

def _compute_indicators(df: pd.DataFrame, ticker: str = "") -> dict:
    """Compute all technical indicators. Returns flat dict of scalars."""
    ind: dict = {}
    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]
    current = float(close.iloc[-1])
    ind["current_price"] = round(current, 2)

    # --- Momentum returns ---
    def _ret(n):
        if len(close) <= n:
            return None
        return round((float(close.iloc[-1]) - float(close.iloc[-n])) / abs(float(close.iloc[-n])), 4)

    ind["ret_1w"] = _ret(5)
    ind["ret_1m"] = _ret(21)
    ind["ret_3m"] = _ret(63)
    ind["ret_6m"] = _ret(126)

    # Relative strength vs SPY (approx: compare to index ETF)
    # Actual SPY RS computed in sector_agent; here we just note momentum direction
    ind["momentum_direction"] = "positive" if (ind["ret_1m"] or 0) > 0 else "negative"
    ind["momentum_accelerating"] = (
        (ind["ret_1m"] or 0) > (ind["ret_3m"] or 0)
        if ind["ret_1m"] is not None and ind["ret_3m"] is not None else None
    )

    # --- RSI ---
    try:
        rsi_series = ta.momentum.RSIIndicator(close, window=14).rsi()
        ind["rsi_14"] = round(float(rsi_series.iloc[-1]), 1)
        ind["rsi_signal"] = (
            "oversold" if ind["rsi_14"] < 30 else
            "overbought" if ind["rsi_14"] > 70 else
            "neutral"
        )
    except Exception:
        ind["rsi_14"] = None
        ind["rsi_signal"] = "unknown"

    # --- MACD ---
    try:
        macd_obj = ta.trend.MACD(close, window_slow=26, window_fast=12, window_sign=9)
        macd_val = float(macd_obj.macd().iloc[-1])
        macd_sig = float(macd_obj.macd_signal().iloc[-1])
        macd_hist = float(macd_obj.macd_diff().iloc[-1])
        ind["macd"] = round(macd_val, 4)
        ind["macd_signal_line"] = round(macd_sig, 4)
        ind["macd_histogram"] = round(macd_hist, 4)
        ind["macd_bullish"] = macd_val > macd_sig
        # Histogram expanding bullishly = momentum building
        if len(macd_obj.macd_diff().dropna()) >= 3:
            hist_series = macd_obj.macd_diff().dropna()
            ind["macd_histogram_expanding"] = float(hist_series.iloc[-1]) > float(hist_series.iloc[-2]) > float(hist_series.iloc[-3])
    except Exception:
        ind["macd_bullish"] = None
        ind["macd_histogram_expanding"] = None

    # --- Stochastic ---
    try:
        stoch = ta.momentum.StochasticOscillator(high, low, close, window=14, smooth_window=3)
        ind["stoch_k"] = round(float(stoch.stoch().iloc[-1]), 1)
        ind["stoch_d"] = round(float(stoch.stoch_signal().iloc[-1]), 1)
        ind["stoch_signal"] = (
            "oversold" if ind["stoch_k"] < 20 else
            "overbought" if ind["stoch_k"] > 80 else
            "neutral"
        )
    except Exception:
        ind["stoch_signal"] = "unknown"

    # --- Bollinger Bands ---
    try:
        bb = ta.volatility.BollingerBands(close, window=20, window_dev=2)
        ind["bb_upper"] = round(float(bb.bollinger_hband().iloc[-1]), 2)
        ind["bb_lower"] = round(float(bb.bollinger_lband().iloc[-1]), 2)
        ind["bb_mid"] = round(float(bb.bollinger_mavg().iloc[-1]), 2)
        ind["bb_pct"] = round(float(bb.bollinger_pband().iloc[-1]), 3)  # 0=at lower, 1=at upper
        ind["bb_signal"] = (
            "near_lower_band" if ind["bb_pct"] < 0.2 else
            "near_upper_band" if ind["bb_pct"] > 0.8 else
            "mid_band"
        )
    except Exception:
        ind["bb_pct"] = None
        ind["bb_signal"] = "unknown"

    # --- ATR (volatility) ---
    try:
        atr = ta.volatility.AverageTrueRange(high, low, close, window=14).average_true_range()
        ind["atr_14"] = round(float(atr.iloc[-1]), 2)
        ind["atr_pct"] = round(float(atr.iloc[-1]) / current * 100, 2)  # ATR as % of price
    except Exception:
        ind["atr_14"] = None
        ind["atr_pct"] = None

    # --- Moving averages ---
    try:
        sma50 = ta.trend.SMAIndicator(close, window=50).sma_indicator()
        sma200 = ta.trend.SMAIndicator(close, window=200).sma_indicator()
        ind["sma_50"] = round(float(sma50.dropna().iloc[-1]), 2)
        ind["sma_200"] = round(float(sma200.dropna().iloc[-1]), 2)
        ind["price_above_sma50"] = current > ind["sma_50"]
        ind["price_above_sma200"] = current > ind["sma_200"]
        ind["sma50_above_sma200"] = ind["sma_50"] > ind["sma_200"]

        # Golden / death cross: did the 50 cross the 200 in the last 10 sessions?
        sma50_clean = sma50.dropna()
        sma200_clean = sma200.dropna()
        if len(sma50_clean) >= 11 and len(sma200_clean) >= 11:
            recent_50 = float(sma50_clean.iloc[-1])
            recent_200 = float(sma200_clean.iloc[-1])
            prev_50 = float(sma50_clean.iloc[-10])
            prev_200 = float(sma200_clean.iloc[-10])
            if prev_50 <= prev_200 and recent_50 > recent_200:
                ind["cross_signal"] = "golden_cross"
            elif prev_50 >= prev_200 and recent_50 < recent_200:
                ind["cross_signal"] = "death_cross"
            else:
                ind["cross_signal"] = None
    except Exception:
        ind["sma_50"] = None
        ind["sma_200"] = None
        ind["cross_signal"] = None

    # --- Volume analysis ---
    try:
        vol_20_avg = float(volume.tail(20).mean())
        vol_today = float(volume.iloc[-1])
        ind["volume_ratio"] = round(vol_today / vol_20_avg, 2) if vol_20_avg > 0 else None
        ind["volume_above_avg"] = (ind["volume_ratio"] or 0) > 1.2

        obv = ta.volume.OnBalanceVolumeIndicator(close, volume).on_balance_volume()
        obv_recent = obv.tail(5).mean()
        obv_prev = obv.tail(10).head(5).mean()
        ind["obv_trend"] = "up" if float(obv_recent) > float(obv_prev) else "down"
        ind["volume_confirms_price"] = (
            (ind["momentum_direction"] == "positive" and ind["obv_trend"] == "up") or
            (ind["momentum_direction"] == "negative" and ind["obv_trend"] == "down")
        )
    except Exception:
        ind["volume_ratio"] = None
        ind["obv_trend"] = "unknown"
        ind["volume_confirms_price"] = None

    # --- 52-week high/low ---
    try:
        ind["week52_high"] = round(float(high.tail(252).max()), 2)
        ind["week52_low"] = round(float(low.tail(252).min()), 2)
        ind["pct_from_52w_high"] = round((current - ind["week52_high"]) / ind["week52_high"] * 100, 1)
        ind["pct_from_52w_low"] = round((current - ind["week52_low"]) / ind["week52_low"] * 100, 1)
    except Exception:
        pass

    return ind


# ---------------------------------------------------------------------------
# Support / resistance levels
# ---------------------------------------------------------------------------

def _find_support_resistance(df: pd.DataFrame) -> dict:
    """Identify key support and resistance levels from swing highs/lows."""
    recent = df.tail(90)
    highs = recent["High"].values
    lows = recent["Low"].values
    current = float(df["Close"].iloc[-1])
    window = 5

    swing_highs, swing_lows = [], []
    for i in range(window, len(recent) - window):
        if highs[i] == max(highs[i - window: i + window + 1]):
            swing_highs.append(round(float(highs[i]), 2))
        if lows[i] == min(lows[i - window: i + window + 1]):
            swing_lows.append(round(float(lows[i]), 2))

    supports = sorted({s for s in swing_lows if s < current * 1.02}, reverse=True)
    resistances = sorted({r for r in swing_highs if r > current * 0.98})

    return {
        "support": supports[0] if supports else None,
        "resistance": resistances[0] if resistances else None,
        "support_levels": supports[:3],
        "resistance_levels": resistances[:3],
    }


# ---------------------------------------------------------------------------
# Chart pattern detection
# ---------------------------------------------------------------------------

def _detect_patterns(df: pd.DataFrame, ind: dict) -> list[str]:
    """Identify chart patterns from price structure and indicators."""
    patterns: list[str] = []
    close = df["Close"].dropna()
    if len(close) < 40:
        return patterns

    # Golden / death cross (from indicators)
    if ind.get("cross_signal") == "golden_cross":
        patterns.append("golden_cross")
    elif ind.get("cross_signal") == "death_cross":
        patterns.append("death_cross")

    # SMA alignment
    if ind.get("price_above_sma50") and ind.get("price_above_sma200") and ind.get("sma50_above_sma200"):
        patterns.append("bullish_ma_stack")  # price > 50 > 200
    elif not ind.get("price_above_sma50") and not ind.get("price_above_sma200") and not ind.get("sma50_above_sma200"):
        patterns.append("bearish_ma_stack")  # price < 50 < 200

    # Higher highs / higher lows (uptrend structure)
    recent_20 = close.tail(20)
    prior_20 = close.iloc[-40:-20]
    if len(prior_20) >= 20:
        recent_high = float(recent_20.max())
        recent_low = float(recent_20.min())
        prior_high = float(prior_20.max())
        prior_low = float(prior_20.min())
        if recent_high > prior_high and recent_low > prior_low:
            patterns.append("higher_highs_higher_lows")
        elif recent_high < prior_high and recent_low < prior_low:
            patterns.append("lower_highs_lower_lows")

    # Consolidation: 20-day range < 6% of price
    last_20 = close.tail(20)
    price_range_pct = (float(last_20.max()) - float(last_20.min())) / float(last_20.mean())
    if price_range_pct < 0.06:
        patterns.append("consolidation")

    # RSI divergence hint
    if ind.get("rsi_signal") == "oversold" and ind.get("momentum_direction") == "negative":
        patterns.append("oversold_potential_reversal")
    if ind.get("rsi_signal") == "overbought" and ind.get("momentum_direction") == "positive":
        patterns.append("overbought_extended")

    # Bollinger Band squeeze potential
    if ind.get("bb_pct") is not None and 0.4 <= ind["bb_pct"] <= 0.6:
        patterns.append("bb_midband_coil")

    return patterns


# ---------------------------------------------------------------------------
# Position context — for portfolio_review mode
# ---------------------------------------------------------------------------

def _load_position_context(ticker: str) -> dict | None:
    """Load entry thesis and position metadata from positions_log.json."""
    if not POSITIONS_LOG_PATH.exists():
        return None
    try:
        with open(POSITIONS_LOG_PATH) as f:
            log = json.load(f)
        return log.get(ticker)
    except Exception:
        return None


def _fmt_position_section(position_context: dict | None) -> str:
    """Format the original entry thesis block for the LLM prompt."""
    if not position_context:
        return ""
    entry_price = position_context.get("entry_price", "N/A")
    direction = position_context.get("direction", "LONG")
    thesis = position_context.get("entry_thesis", "Not recorded")
    signals = position_context.get("signals", [])
    entry_date = position_context.get("entry_date", "Unknown")
    return f"""
PORTFOLIO REVIEW — ORIGINAL ENTRY THESIS:
  Entry date: {entry_date}
  Entry price: ${entry_price}
  Direction: {direction}
  Original signals: {', '.join(signals) if signals else 'Not recorded'}
  Original thesis: {thesis}

"""


# ---------------------------------------------------------------------------
# Pattern learning — read from .swarm/memory.db and data/memory/pattern_history.json
# ---------------------------------------------------------------------------

def _load_pattern_history() -> dict:
    """Load our own trading pattern outcome history (written by Trade Executor)."""
    if not MEMORY_PATH.exists():
        return {}
    try:
        with open(MEMORY_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def _check_swarm_memory(signal_combo: str) -> list[dict]:
    """Query .swarm/memory.db for entries related to a signal combination."""
    if not SWARM_DB.exists():
        return []
    try:
        conn = sqlite3.connect(SWARM_DB)
        rows = conn.execute(
            """SELECT key, content FROM memory_entries
               WHERE namespace = 'trading_patterns' AND key LIKE ?
               LIMIT 5""",
            (f"%{signal_combo[:30]}%",),
        ).fetchall()
        conn.close()
        return [{"key": r[0], "content": r[1]} for r in rows]
    except Exception:
        return []


def _build_pattern_learning_note(
    patterns: list[str],
    signals: list[str],
    macro_regime: str,
    pattern_history: dict,
) -> str:
    """
    Produce a pattern_learning_note summarising relevant historical performance.
    When history is empty, states this clearly so the LLM knows not to fabricate.
    """
    if not pattern_history:
        return (
            "No prior trade history in this system yet. "
            "Pattern learning will activate once the Trade Executor records completed outcomes. "
            "Applying neutral historical weighting to all signals."
        )

    sig_combos = pattern_history.get("signal_combinations", {})
    matched = []

    # Look for matching signal combinations (partial match on sorted key)
    combo_key = "+".join(sorted(signals)) + f"+{macro_regime}"
    for key, stats in sig_combos.items():
        if any(s in key for s in signals) and macro_regime in key:
            uses = stats.get("uses", 0)
            wins = stats.get("wins", 0)
            hit_rate = round(wins / uses * 100) if uses > 0 else None
            matched.append(f"'{key}': {uses} uses, {hit_rate}% win rate" if hit_rate is not None else f"'{key}': {uses} uses, outcome pending")

    if not matched:
        return (
            f"No prior history for these specific signal combinations in {macro_regime} regime. "
            "Applying neutral weighting. Will learn from today's outcome."
        )

    return (
        f"Historical performance for similar signal combinations in this system: "
        + "; ".join(matched[:3])
        + ". Weight signals accordingly — strong historical hit rate → higher confidence."
    )


# ---------------------------------------------------------------------------
# Multi-source confidence scoring
# ---------------------------------------------------------------------------

def _compute_signal_confidence(ind: dict, patterns: list[str]) -> dict:
    """
    Three independent signal sources:
      1. Price action (trend, MA stack)
      2. Volume confirmation (OBV direction matches price, above-average volume)
      3. Momentum oscillators (RSI + MACD direction agreement)
    """
    conflicts: list[str] = []
    sources_confirming: list[str] = []

    # Source 1: price action
    price_bullish = ind.get("price_above_sma200") and ind.get("momentum_direction") == "positive"
    price_bearish = not ind.get("price_above_sma200") and ind.get("momentum_direction") == "negative"
    if price_bullish or price_bearish:
        sources_confirming.append("price_action")

    # Source 2: volume confirmation
    if ind.get("volume_confirms_price"):
        sources_confirming.append("volume")
    elif ind.get("volume_confirms_price") is False:
        conflicts.append("volume diverging from price direction")

    # Source 3: momentum oscillators
    rsi_dir = "bullish" if (ind.get("rsi_14") or 50) > 50 else "bearish"
    macd_dir = "bullish" if ind.get("macd_bullish") else "bearish"
    if rsi_dir == macd_dir:
        sources_confirming.append("momentum_oscillators")
    else:
        conflicts.append(f"RSI {rsi_dir} but MACD {macd_dir}")

    # RSI extremes conflicting with trend
    if ind.get("rsi_signal") == "overbought" and "bullish_ma_stack" in patterns:
        conflicts.append("RSI overbought while in bullish MA stack — momentum stretched")
    if ind.get("rsi_signal") == "oversold" and "bearish_ma_stack" in patterns:
        conflicts.append("RSI oversold while in bearish MA stack — potential falling knife")

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
            f"{n}/3 signal sources confirming" +
            (f"; conflicts: {'; '.join(conflicts)}" if conflicts else "")
        ),
    }


# ---------------------------------------------------------------------------
# Mean reversion scoring — forward-looking signal
# ---------------------------------------------------------------------------

def _compute_mean_reversion_score(ind: dict) -> dict:
    """
    Scores the probability that a stock is in an oversold dislocation about to bounce,
    rather than a momentum continuation. Returns mean_reversion_score (0-100) and
    forward_bias (mean_reversion_long | watch_for_reversal | momentum_continuation).

    Key conditions:
      - RSI deeply oversold (< 35)
      - Price significantly below SMA200
      - Near 52-week low
      - Volume declining on selloff (selling exhaustion)
      - Bollinger Band at/below lower boundary
      - Stochastic oversold
    """
    score = 0
    signals: list[str] = []

    # RSI oversold
    rsi = ind.get("rsi_14")
    if rsi is not None:
        if rsi < 25:
            score += 30
            signals.append(f"RSI extremely oversold ({rsi:.1f})")
        elif rsi < 35:
            score += 20
            signals.append(f"RSI oversold ({rsi:.1f})")

    # Price below SMA200
    current = ind.get("current_price")
    sma200 = ind.get("sma_200")
    if current and sma200 and sma200 > 0:
        pct_below = (sma200 - current) / sma200
        if pct_below > 0.25:
            score += 25
            signals.append(f"Price {pct_below*100:.0f}% below SMA200 — extreme dislocation")
        elif pct_below > 0.15:
            score += 15
            signals.append(f"Price {pct_below*100:.0f}% below SMA200")
        elif pct_below > 0.08:
            score += 8
            signals.append(f"Price {pct_below*100:.0f}% below SMA200")

    # Near 52-week low
    pct_from_low = ind.get("pct_from_52w_low")
    if pct_from_low is not None:
        if pct_from_low < 5:
            score += 20
            signals.append(f"Within 5% of 52W low — near floor")
        elif pct_from_low < 15:
            score += 10
            signals.append(f"Within 15% of 52W low")

    # Volume declining on selloff (selling exhaustion)
    if (ind.get("momentum_direction") == "negative"
            and ind.get("obv_trend") == "down"
            and (ind.get("volume_ratio") or 1.0) < 0.8):
        score += 15
        signals.append("Declining volume on selloff — selling exhaustion")

    # Bollinger Band lower extremity
    bb_pct = ind.get("bb_pct")
    if bb_pct is not None:
        if bb_pct < 0.05:
            score += 10
            signals.append(f"At/below lower Bollinger Band (BB%={bb_pct:.2f})")
        elif bb_pct < 0.15:
            score += 5

    # Stochastic oversold
    if ind.get("stoch_signal") == "oversold":
        score += 10
        signals.append("Stochastic oversold")

    score = min(score, 100)

    if score >= 60:
        forward_bias = "mean_reversion_long"
    elif score >= 35:
        forward_bias = "watch_for_reversal"
    else:
        forward_bias = "momentum_continuation"

    return {
        "mean_reversion_score": score,
        "forward_bias": forward_bias,
        "mean_reversion_signals": signals,
    }


# ---------------------------------------------------------------------------
# Memory formatting helpers
# ---------------------------------------------------------------------------

def _fmt_outcome_history(outcomes: list[dict] | None) -> str:
    """Format closed trade outcomes for injection into the quant LLM prompt."""
    if not outcomes:
        return "No prior closed trades for this ticker — applying neutral weighting."
    lines = []
    for o in outcomes:
        entry = o.get("entry_date", "?")
        exit_ = o.get("exit_date", "?")
        pnl = o.get("pnl_pct")
        pnl_str = f"{pnl:+.1f}%" if pnl is not None else "?"
        action = o.get("action", "?")
        exit_reason = o.get("exit_reason", "?")
        lines.append(f"  [{entry}→{exit_}] {action} | P&L {pnl_str} | exit: {exit_reason}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _analyse_with_llm(
    ticker: str,
    ind: dict,
    patterns: list[str],
    levels: dict,
    confidence: dict,
    mean_rev: dict,
    memory_note: str,
    direction_hint: str,
    macro_regime: str,
    position_context: dict | None = None,
    outcome_history: list[dict] | None = None,
) -> dict:
    """Single GPT-4o-mini call for quant/technical scoring and narrative."""
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def _f(v, pct=False):
        if v is None:
            return "N/A"
        return f"{v:.1f}%" if pct else f"{v}"

    review_instruction = (
        "- This is a PORTFOLIO REVIEW: compare today's technical picture against entry conditions. "
        "Note in entry_vs_today whether the technical setup has improved, deteriorated, or is unchanged since entry."
        if position_context else ""
    )
    entry_vs_today_field = (
        ',\n  "entry_vs_today": "<improved | deteriorated | unchanged> — <1 sentence explaining the shift>"'
        if position_context else ""
    )

    mr_signals_str = ", ".join(mean_rev.get("mean_reversion_signals", [])) or "none"

    prompt = f"""You are a quantitative analyst performing technical analysis on {ticker}.
Your job is to assess BOTH where the price has been AND where it is likely going in the next 5-10 days.

MACRO REGIME: {macro_regime}
CANDIDATE DIRECTION HINT: {direction_hint}

PRICE & TREND:
  Current: ${_f(ind.get('current_price'))} | SMA50: ${_f(ind.get('sma_50'))} | SMA200: ${_f(ind.get('sma_200'))}
  Above SMA50: {ind.get('price_above_sma50')} | Above SMA200: {ind.get('price_above_sma200')}
  Cross signal: {ind.get('cross_signal', 'none')}
  52W high: ${_f(ind.get('week52_high'))} ({_f(ind.get('pct_from_52w_high'))}% from high)
  52W low: ${_f(ind.get('week52_low'))} ({_f(ind.get('pct_from_52w_low'))}% from low)

MOMENTUM:
  1W: {_f(ind.get('ret_1w'), pct=True)} | 1M: {_f(ind.get('ret_1m'), pct=True)} | 3M: {_f(ind.get('ret_3m'), pct=True)}
  Momentum accelerating: {ind.get('momentum_accelerating')}

OSCILLATORS:
  RSI(14): {_f(ind.get('rsi_14'))} [{ind.get('rsi_signal', 'N/A')}]
  MACD: {_f(ind.get('macd'))} vs signal {_f(ind.get('macd_signal_line'))} — {'bullish' if ind.get('macd_bullish') else 'bearish'}
  Stochastic K: {_f(ind.get('stoch_k'))} [{ind.get('stoch_signal', 'N/A')}]
  BB position: {_f(ind.get('bb_pct'))} [{ind.get('bb_signal', 'N/A')}]
  ATR: {_f(ind.get('atr_14'))} ({_f(ind.get('atr_pct'))}% of price)

VOLUME:
  Volume ratio vs 20d avg: {_f(ind.get('volume_ratio'))}x | OBV trend: {ind.get('obv_trend', 'N/A')}
  Volume confirms price: {ind.get('volume_confirms_price')}

KEY LEVELS:
  Support: ${_f(levels.get('support'))} | Resistance: ${_f(levels.get('resistance'))}
  All supports: {levels.get('support_levels', [])} | All resistances: {levels.get('resistance_levels', [])}

DETECTED PATTERNS: {', '.join(patterns) if patterns else 'none'}

MEAN REVERSION ANALYSIS (pre-computed):
  Mean reversion score: {mean_rev.get('mean_reversion_score')}/100
  Pre-computed forward bias: {mean_rev.get('forward_bias')}
  Oversold signals detected: {mr_signals_str}
  Interpretation: score >= 60 = strong mean reversion setup (likely bounce);
                  score 35-59 = possible reversal forming; score < 35 = momentum likely continues

SIGNAL CONFIDENCE: {confidence.get('level')} ({confidence.get('confidence_note')})

PAST TRADE OUTCOMES FOR {ticker}:
{_fmt_outcome_history(outcome_history)}

PATTERN LEARNING NOTE:
{memory_note}
{_fmt_position_section(position_context)}
CRITICAL INSTRUCTIONS:
- Distinguish between MOMENTUM CONTINUATION vs MEAN REVERSION DISLOCATION:
    * If mean_reversion_score >= 50 AND fundamentals are known to be strong:
      this is likely a dislocation — set forward_bias = "bullish" and direction = LONG
      even if the trend has been bearish. The trend is the PAST; the bounce is the FUTURE.
    * If mean_reversion_score < 30 AND momentum is negative: continuation is more likely.
      Direction = SHORT. Set forward_bias = "bearish".
    * Neutral zone (30-50): exercise judgement. State which scenario you believe is more likely.
- Score 0-100 on technical setup quality (100 = ideal entry for your chosen direction). DO NOT round to a multiple of 5 — compute the exact integer from RSI, MACD, trend, volume sub-scores (e.g. 78, 62, 84, not 80, 60, 85)
- Identify the single most important technical level to watch
- Flag any conflicts in data_conflicts
- Keep quant_summary to 2-3 sentences that address WHERE THIS IS GOING, not just where it has been
{review_instruction}

Return ONLY valid JSON:
{{
  "ticker": "{ticker}",
  "quant_score": <integer 0-100>,
  "direction": "LONG" or "SHORT",
  "trade_type": "momentum" | "mean_reversion" | "dislocation",
  "forward_bias": "bullish" | "bearish" | "neutral",
  "mean_reversion_score": {mean_rev.get('mean_reversion_score')},
  "trend": "uptrend" | "downtrend" | "sideways",
  "rsi_14": {ind.get('rsi_14')},
  "macd_signal": "bullish" | "bearish" | "neutral",
  "volume_trend": "accumulation" | "distribution" | "neutral",
  "support": {levels.get('support')},
  "resistance": {levels.get('resistance')},
  "key_patterns": {json.dumps(patterns)},
  "signal_confidence": {json.dumps(confidence)},
  "data_conflicts": ["<conflict if any>"],
  "pattern_learning_note": "<summary of memory note, 1 sentence>",
  "quant_summary": "<2-3 sentences: what is the technical setup AND where is this going next 5-10 days>"{entry_vs_today_field}
}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        logger.error("LLM analysis failed for %s: %s", ticker, exc)
        return {
            "ticker": ticker, "quant_score": 50, "direction": direction_hint,
            "trend": "unknown", "signal_confidence": confidence,
            "data_conflicts": [], "pattern_learning_note": memory_note,
            "quant_summary": f"Analysis unavailable: {exc}",
        }


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------

def run(mode: str = "new_opportunities") -> dict:
    logger.info("=== Quant Agent (Agent 7) — mode: %s ===", mode)

    # Load candidates
    candidates_path = REPORTS_DIR / "candidates_report.json"
    if not candidates_path.exists():
        raise RuntimeError("candidates_report.json not found — run Agent 5 first")
    with open(candidates_path) as f:
        candidates_data = json.load(f)

    candidates = candidates_data.get("candidates", [])
    logger.info("Analysing %d candidates", len(candidates))

    # Load macro context
    macro_regime = "NEUTRAL"
    macro_path = REPORTS_DIR / "macro_report.json"
    if macro_path.exists():
        with open(macro_path) as f:
            macro_regime = json.load(f).get("regime", "NEUTRAL")

    # Load pattern history once
    pattern_history = _load_pattern_history()
    if not pattern_history:
        logger.info("No pattern history yet — will apply neutral weighting")

    results: list[dict] = []

    for i, candidate in enumerate(candidates):
        ticker = str(candidate.get("ticker", "")).upper()
        direction_hint = str(candidate.get("direction_hint", "LONG")).upper()
        signals = candidate.get("signals", [])
        logger.info("[%d/%d] Quant analysis: %s", i + 1, len(candidates), ticker)

        # Load position context in portfolio_review mode
        position_context = _load_position_context(ticker) if mode == "portfolio_review" else None
        if position_context:
            direction_hint = str(position_context.get("direction", direction_hint)).upper()

        # Fetch OHLCV
        df = _fetch_ohlcv(ticker)
        if df is None or len(df) < 30:
            logger.warning("Insufficient price data for %s — skipping", ticker)
            continue

        # Compute all indicators
        ind = _compute_indicators(df, ticker)

        # Key levels
        levels = _find_support_resistance(df)

        # Chart patterns
        patterns = _detect_patterns(df, ind)

        # Signal confidence (multi-source)
        confidence = _compute_signal_confidence(ind, patterns)

        # Pattern learning note
        swarm_memories = _check_swarm_memory("+".join(sorted(signals)))
        memory_note = _build_pattern_learning_note(patterns, signals, macro_regime, pattern_history)

        # Outcome history from memory agent
        outcome_history = memory.get_ticker_outcome_history(ticker, limit=3)

        # Mean reversion scoring (forward-looking)
        mean_rev = _compute_mean_reversion_score(ind)

        # LLM analysis
        result = _analyse_with_llm(
            ticker, ind, patterns, levels, confidence, mean_rev,
            memory_note, direction_hint, macro_regime, position_context, outcome_history
        )

        # Ensure mean_rev fields are always attached even if LLM omitted them
        result.setdefault("mean_reversion_score", mean_rev["mean_reversion_score"])
        result.setdefault("forward_bias", mean_rev["forward_bias"])
        result["mean_reversion_signals"] = mean_rev["mean_reversion_signals"]

        # Attach P&L context in portfolio_review mode
        if position_context:
            entry_price = position_context.get("entry_price")
            current_price = ind.get("current_price")
            direction = position_context.get("direction", "LONG").upper()
            if entry_price and current_price:
                raw_pnl = (current_price - entry_price) / entry_price
                pnl_pct = round(raw_pnl * 100 if direction == "LONG" else -raw_pnl * 100, 2)
            else:
                pnl_pct = None
            result["entry_price"] = entry_price
            result["current_price"] = current_price
            result["pnl_pct"] = pnl_pct

        # Always expose current_price and return metrics at top level for adhoc reports
        for _k in ("current_price", "ret_1m", "ret_3m", "ret_6m", "ret_1yr",
                   "week52_high", "week52_low", "pct_from_52w_high", "vs_spy_1yr"):
            if _k in ind and _k not in result:
                result[_k] = ind[_k]
        # Alias 52w fields to the names adhoc_report expects
        if "week52_high" in ind and "high_52w" not in result:
            result["high_52w"] = ind["week52_high"]
        if "week52_low" in ind and "low_52w" not in result:
            result["low_52w"] = ind["week52_low"]

        # Attach raw indicator snapshot and candidate context
        result["indicators"] = {
            k: ind[k] for k in (
                "rsi_14", "macd_bullish", "macd_histogram_expanding",
                "stoch_k", "bb_pct", "volume_ratio", "obv_trend",
                "sma_50", "sma_200", "cross_signal",
                "current_price", "ret_1w", "ret_1m", "ret_3m", "ret_6m",
                "week52_high", "week52_low", "pct_from_52w_high",
                "atr_14", "atr_pct",
            ) if k in ind
        }
        result["key_levels"] = levels
        result["candidate_score"] = candidate.get("score")
        result["candidate_signals"] = signals
        result["swarm_memory_hits"] = len(swarm_memories)

        results.append(result)

    output = {
        "quant_analyses": results,
        "total_analysed": len(results),
        "macro_regime": macro_regime,
        "pattern_history_loaded": bool(pattern_history),
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    logger.info("Saved quant report to %s", OUT_PATH)
    logger.info("=== Quant Agent complete: %d tickers analysed ===", len(results))
    return output


if __name__ == "__main__":
    result = run()
    print(f"\nAnalysed {result['total_analysed']} tickers | Pattern history: {'loaded' if result['pattern_history_loaded'] else 'none yet'}")
    for a in result["quant_analyses"][:10]:
        ind = a.get("indicators", {})
        conf = a.get("signal_confidence", {})
        print(
            f"  {a['ticker']:6s}  score={a.get('quant_score', '?'):3}  "
            f"trend={a.get('trend', '?'):9s}  "
            f"rsi={ind.get('rsi_14', '?')}  "
            f"conf={conf.get('level', '?')}  "
            f"patterns={a.get('key_patterns', [])}"
        )
