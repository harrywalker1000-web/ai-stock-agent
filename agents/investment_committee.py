"""
Agent 10 — Investment Committee

Phase 4: runs after all Phase 3 agents complete.

Process (Phase B — new opportunities):
  1. Load all Phase 3 outputs (fundamental, quant, sentiment) + macro context
  2. Python pre-scoring: compute weighted composite for every candidate
  3. LLM deliberation: one batch call with the top qualifying candidates
  4. Committee produces position_decisions[] — 0 to many, no fixed quota
  5. All decisions stored via memory_agent

Process (Phase A — portfolio review):
  Receives held positions already re-analysed by analyst team.
  One LLM call produces hold/increase/decrease/exit for each.

Dynamic weighting (default, adjusted from memory accuracy if data exists):
  Fundamental: 35% | Quant: 35% | Sentiment: 30%

Rules (from PORTFOLIO_RULES.md — overrides PRD):
  - No fixed quota. 0 to many decisions per day.
  - Soft 20% position cap — may exceed with written justification.
  - Target 10+ simultaneous positions when capital available.
  - Stop-losses: optional — encouraged when next review > 24h away.
    When set, they ARE hard triggers for the Trade Executor.
  - Price targets = re-evaluation checkpoints, NOT automatic sell triggers.
  - Every decision must have a written rationale.
"""

import json
import os
import random
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

import agents.memory_agent as memory
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
OUT_PATH = REPORTS_DIR / "committee_report.json"

# Default agent weights (adjusted dynamically when memory accuracy data exists)
DEFAULT_WEIGHTS = {"fundamental": 0.35, "quant": 0.35, "sentiment": 0.30}

# Pre-filter: only debate candidates with composite score >= this
DELIBERATION_THRESHOLD = 45
MAX_CANDIDATES_TO_DEBATE = 20   # LLM sees top N by composite score


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_report(name: str) -> dict:
    path = REPORTS_DIR / f"{name}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def _load_all_reports() -> tuple[dict, dict, dict, dict, dict]:
    """Returns (macro, candidates, fundamental, quant, sentiment)."""
    return (
        _load_report("macro_report"),
        _load_report("candidates_report"),
        _load_report("fundamental_report"),
        _load_report("quant_report"),
        _load_report("sentiment_report"),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_scenario(f: dict, scenario: str, field: str):
    """Pull a field from fund_mandate.scenarios or recommendation.scenarios."""
    for key in ("fund_mandate", "recommendation"):
        scenarios = (f.get(key) or {}).get("scenarios") or {}
        val = (scenarios.get(scenario) or {}).get(field)
        if val is not None:
            return val
    return None


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _compute_macro_score(ticker: str, candidate_signals: list, macro: dict) -> int:
    """
    Derive a macro score (0-100) for a ticker from the portfolio-level macro report.
    Macro is portfolio context, not stock-picker — intentionally lower ceiling (30-75).
    """
    if not macro:
        return 50
    regime = (macro.get("regime") or "NEUTRAL").upper()
    favoured = [t.lower() for t in (macro.get("favoured_themes") or [])]
    avoid    = [t.lower() for t in (macro.get("avoid_themes") or [])]

    # Regime base
    base = 65 if "RISK-ON" in regime else 35 if "RISK-OFF" in regime else 50

    # Explicit macro tailwind/headwind in candidate signals
    if "macro_tailwind" in (candidate_signals or []):
        base = min(75, base + 15)
    elif "macro_headwind" in (candidate_signals or []):
        base = max(25, base - 15)

    # Check if sector/ticker themes align with macro favourites
    tech_terms = {"ai", "technology", "semiconductor", "chip", "cloud", "software"}
    health_terms = {"healthcare", "pharma", "biotech", "medical"}
    energy_terms = {"energy", "oil", "gas", "commodity"}
    finance_terms = {"financ", "bank", "insurance"}

    def theme_overlap(themes: list[str], term_set: set) -> bool:
        return any(any(t in theme for t in term_set) for theme in themes)

    ticker_upper = ticker.upper()
    sector_terms: set[str] = set()
    if ticker_upper in {"NVDA", "AMD", "INTC", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "CRM", "ORCL", "PLTR"}:
        sector_terms = tech_terms
    elif ticker_upper in {"LLY", "MRK", "JNJ", "ABBV", "UNH", "TMO"}:
        sector_terms = health_terms
    elif ticker_upper in {"XOM", "CVX", "COP", "SLB"}:
        sector_terms = energy_terms
    elif ticker_upper in {"JPM", "BAC", "GS", "MS", "WFC"}:
        sector_terms = finance_terms

    if sector_terms:
        if theme_overlap(favoured, sector_terms):
            base = min(75, base + 10)
        elif theme_overlap(avoid, sector_terms):
            base = max(25, base - 10)

    return int(base)


def _compute_news_score(ticker: str, news: dict) -> int:
    """
    Derive a news score (0-100) from fresh/stale catalysts for this ticker.
    """
    if not news:
        return 50
    all_cats = list(news.get("fresh_catalysts") or []) + list(news.get("stale_catalysts") or [])
    ticker_cats = [c for c in all_cats if str(c.get("ticker", "")).upper() == ticker.upper()]
    if not ticker_cats:
        return 50  # no coverage — neutral, not bearish

    conf_map = {"high": 80, "medium": 60, "low": 40}
    scores: list[int] = []
    for cat in ticker_cats:
        sc = cat.get("signal_confidence")
        level = sc.get("level") if isinstance(sc, dict) else sc
        scores.append(conf_map.get(str(level).lower(), 50))

    base = round(sum(scores) / len(scores))

    # Direction tint: fresh bearish catalyst knocks 5 pts
    bearish = sum(1 for c in ticker_cats if str(c.get("direction", "LONG")).upper() != "LONG")
    if bearish > len(ticker_cats) / 2:
        base = max(25, base - 5)

    return int(min(90, max(25, base)))


def _build_scorecard(
    candidates: list[dict],
    fundamental: dict,
    quant: dict,
    sentiment: dict,
    weights: dict,
    macro: dict | None = None,
    news: dict | None = None,
) -> list[dict]:
    """
    Build a per-ticker scorecard by combining all five agent signals.
    Macro and news are context signals with lower composite weight (10% each);
    fundamental/quant/sentiment share the remaining 80% via dynamic weights.
    """
    fund_map = {a["ticker"]: a for a in fundamental.get("fundamental_analyses", [])}
    quant_map = {a["ticker"]: a for a in quant.get("quant_analyses", [])}
    sent_map = {a["ticker"]: a for a in sentiment.get("sentiment_analyses", [])}

    scorecards = []
    for cand in candidates:
        ticker = str(cand.get("ticker", "")).upper()
        if not ticker:
            continue

        f = fund_map.get(ticker, {})
        q = quant_map.get(ticker, {})
        s = sent_map.get(ticker, {})

        fs = f.get("fundamental_score", 50)
        qs = q.get("quant_score", 50)
        ss = s.get("sentiment_score", 50)
        ms = _compute_macro_score(ticker, cand.get("signals", []), macro or {})
        ns = _compute_news_score(ticker, news or {})

        # Macro + news each take 10% of composite; core 3 agents share remaining 80%.
        core_weight_sum = weights["fundamental"] + weights["quant"] + weights["sentiment"]
        core_scale = 0.80 / core_weight_sum if core_weight_sum > 0 else 1.0
        composite = round(
            fs * weights["fundamental"] * core_scale +
            qs * weights["quant"]       * core_scale +
            ss * weights["sentiment"]   * core_scale +
            ms * 0.10 +
            ns * 0.10
        )

        # Detect cross-agent disagreement across all five agents (spread >= 25 points)
        scores = [fs, qs, ss, ms, ns]
        spread = max(scores) - min(scores)
        conflict_flag = spread >= 25

        # Confidence level: take the worst confidence across all three agents
        conf_levels = [
            f.get("data_confidence", {}).get("level", "low"),
            q.get("signal_confidence", {}).get("level", "low"),
            s.get("signal_confidence", {}).get("level", "low"),
        ]
        overall_conf = "high" if all(c == "high" for c in conf_levels) else \
                       "low" if all(c == "low" for c in conf_levels) else "medium"

        # Direction: majority vote across three agents
        directions = [
            f.get("direction", "LONG"),
            q.get("direction", "LONG"),
            s.get("direction", "LONG"),
        ]
        direction = "LONG" if directions.count("LONG") >= 2 else "SHORT"

        # ATR-based position sizing (Kelly-adjacent)
        atr_pct = (q.get("indicators") or {}).get("atr_pct") or 2.0  # default 2% if missing
        MAX_POSITION_PCT = 20.0
        raw_kelly = (composite / 100.0) * (1.0 / (1.0 + atr_pct / 100.0)) * MAX_POSITION_PCT
        suggested_size_pct = round(max(1.0, min(MAX_POSITION_PCT, raw_kelly)), 1)

        scorecards.append({
            "ticker": ticker,
            "composite_score": composite,
            "fundamental_score": fs,
            "quant_score": qs,
            "sentiment_score": ss,
            "macro_score": ms,
            "news_score": ns,
            "agent_spread": spread,
            "conflict_flag": conflict_flag,
            "overall_confidence": overall_conf,
            "direction": direction,
            "atr_pct": atr_pct,
            "suggested_size_pct": suggested_size_pct,
            "candidate_signals": cand.get("signals", []),
            "candidate_score": cand.get("score"),
            # Compact summaries for LLM context
            "fundamental_summary": f.get("fundamental_summary", ""),
            "quant_summary": q.get("quant_summary", ""),
            "sentiment_summary": s.get("sentiment_summary", ""),
            "analyst_consensus": s.get("analyst_consensus", "N/A"),
            "upside_pct": s.get("price_target_upside_pct"),
            "retail_euphoria_warning": s.get("retail_euphoria_warning", False),
            # Forward-looking fields (new)
            "mean_reversion_score": q.get("mean_reversion_score", 0),
            "forward_bias": q.get("forward_bias", "momentum_continuation"),
            "trade_type": q.get("trade_type", "momentum"),
            "dislocation_opportunity": f.get("dislocation_opportunity", False),
            "price_vs_intrinsic_value": f.get("price_vs_intrinsic_value", "N/A"),
            "contrarian_signal": s.get("contrarian_signal", False),
            "sentiment_type": s.get("sentiment_type", "mixed"),
            # Phase A fields
            "thesis_intact": f.get("thesis_intact"),
            "entry_vs_today": q.get("entry_vs_today"),
            "pnl_pct": f.get("pnl_pct") or q.get("pnl_pct"),
            "key_conflicts": (
                f.get("data_conflicts", []) +
                q.get("data_conflicts", []) +
                s.get("data_conflicts", [])
            )[:3],
            # Deep framework fields from fundamental analyst (for committee context)
            "mandate_pass": (f.get("fund_mandate") or {}).get("mandate_pass"),
            "mandate_fail_reasons": (f.get("fund_mandate") or {}).get("fail_reasons") or [],
            "valuation_summary": (f.get("valuation") or {}).get("analyst_consensus_target") or f.get("analyst_consensus_target"),
            "intrinsic_value": (f.get("valuation") or {}).get("intrinsic_value_estimate") or f.get("intrinsic_value_estimate"),
            "expected_return_12m": (f.get("valuation") or {}).get("expected_roi_12m") or f.get("expected_roi_12m") or (f.get("valuation") or {}).get("expected_roi_2_3yr") or f.get("expected_roi_2_3yr"),
            "thesis_bullets": f.get("investment_thesis_bullets") or [],
            "scenario_bull_target": _extract_scenario(f, "bull", "price_target"),
            "scenario_base_target": _extract_scenario(f, "base", "price_target"),
            "scenario_bear_target": _extract_scenario(f, "bear", "price_target"),
        })

    scorecards.sort(key=lambda x: x["composite_score"], reverse=True)
    return scorecards


def _build_portfolio_context(open_positions: dict) -> str:
    """
    Build a rich portfolio context block for LLM prompts.
    Shows direction, size, conviction, days held, sector, and entry thesis for every
    open position, plus sector exposure totals. Replaces the sparse ticker list
    so the committee knows the full book state when making new decisions.
    """
    if not open_positions:
        return "CURRENT BOOK: No open positions."

    today = datetime.utcnow().date()
    sector_totals: dict[str, float] = {}
    total_deployed = 0.0
    lines = []

    for ticker, pos in open_positions.items():
        direction = (pos.get("direction") or "LONG").upper()
        size_pct = float(pos.get("size_pct") or 0)
        conviction = pos.get("conviction") or "?"
        entry_date_str = pos.get("entry_date") or ""
        sector = pos.get("sector") or "Unknown"
        thesis = (pos.get("entry_thesis") or "")[:120]

        days_held = ""
        if entry_date_str and entry_date_str not in ("—", ""):
            try:
                entry_dt = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
                days_held = f" | {(today - entry_dt).days}d held"
            except Exception:
                pass

        lines.append(
            f"  {ticker}: {direction} | {size_pct:.1f}% of portfolio | "
            f"conviction {conviction}/100{days_held} | sector: {sector}"
        )
        if thesis:
            lines.append(f"    Thesis: \"{thesis}\"")

        sector_totals[sector] = round(sector_totals.get(sector, 0.0) + size_pct, 1)
        total_deployed += size_pct

    cash_pct = round(max(0.0, 100.0 - total_deployed), 1)
    sector_totals["Cash"] = cash_pct

    sector_str = " | ".join(
        f"{s}: {v:.0f}%" for s, v in sorted(sector_totals.items(), key=lambda x: -x[1])
    )
    header = (
        f"CURRENT BOOK ({len(open_positions)} open positions | "
        f"{total_deployed:.0f}% deployed | {cash_pct:.0f}% cash):"
    )
    return header + "\n" + "\n".join(lines) + "\n\nSECTOR EXPOSURE: " + sector_str


def _adjust_weights(macro_regime: str) -> dict:
    """
    Use dynamic weights from agent_weights.json if 20+ closed trades exist.
    Applies a regime overlay on top of the dynamic (or default) base.
    """
    # Read dynamic weights from memory agent (activates after 20 closed trades)
    base = memory.get_agent_weights()
    w = base.copy()

    if "RISK-OFF" in macro_regime:
        # In risk-off, fundamental signals matter more; quant/sentiment momentum less reliable
        # Apply ±5% nudge over the dynamic base, not hard override
        w["fundamental"] = min(1.0, w["fundamental"] + 0.05)
        w["quant"] = max(0.0, w["quant"] - 0.05)
        # Renormalise
        total = sum(w.values())
        w = {k: round(v / total, 4) for k, v in w.items()}

    return w


# ---------------------------------------------------------------------------
# LLM deliberation
# ---------------------------------------------------------------------------

def _deliberate_with_llm(
    scorecards: list[dict],
    macro_regime: str,
    open_positions: dict,
    mode: str,
    available_cash_pct: float = 100.0,
    exited_today: list[str] | None = None,
    live_portfolio: dict | None = None,
    risk_snapshot: dict | None = None,
    adhoc_reports: dict[str, dict] | None = None,
) -> list[dict]:
    """
    One LLM call — receives the top qualifying scorecards and produces
    position_decisions[] with action + rationale for each.
    """
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    today = datetime.utcnow().date().isoformat()

    def _f(v):
        return "N/A" if v is None else str(v)

    # Fund-level memory context (shown once at top of prompt)
    fund_perf = memory.get_fund_performance_summary()
    winning_patterns = memory.get_winning_patterns(limit=3)
    fund_memory_block = ""
    if fund_perf.get("total_trades", 0) > 0:
        pattern_str = ""
        if winning_patterns:
            top = winning_patterns[0]
            pattern_str = (
                f" | Best signal combo: [{top['signals']}] "
                f"→ {top['win_rate']*100:.0f}% win rate over {top['uses']} trades"
            )
        fund_memory_block = (
            f"\nFUND MEMORY — {fund_perf['total_trades']} closed trades: "
            f"win rate {fund_perf['win_rate_pct']}% | avg P&L {fund_perf['avg_pnl_pct']:+.1f}% | "
            f"best {fund_perf['best_trade_pct']:+.1f}% | worst {fund_perf['worst_trade_pct']:+.1f}%"
            f"{pattern_str}\n"
        )

    # Benchmark vs SPY — injected so Committee knows if strategy is working
    benchmark_block = ""
    try:
        import sys as _sys
        from pathlib import Path as _Path
        _scripts = str(_Path(__file__).resolve().parent.parent / "scripts")
        if _scripts not in _sys.path:
            _sys.path.insert(0, _scripts)
        import benchmark_tracker as _bt
        _summary = _bt.get_benchmark_summary_for_prompt()
        if _summary:
            benchmark_block = f"\n{_summary}\n"
    except Exception:
        pass

    # Signal attribution — agent directional accuracy from closed trades
    attribution_block = ""
    try:
        import sys as _sys2
        from pathlib import Path as _Path2
        _scripts2 = str(_Path2(__file__).resolve().parent.parent / "scripts")
        if _scripts2 not in _sys2.path:
            _sys2.path.insert(0, _scripts2)
        import attribution_engine as _attr
        _attr_summary = _attr.get_accuracy_summary_for_prompt()
        if _attr_summary:
            attribution_block = f"\n{_attr_summary}\n"
    except Exception:
        pass

    # Learning brief — distilled lessons from recent post-mortems
    learning_block = ""
    try:
        import sys as _sys3
        from pathlib import Path as _Path3
        _scripts3 = str(_Path3(__file__).resolve().parent.parent / "scripts")
        if _scripts3 not in _sys3.path:
            _sys3.path.insert(0, _scripts3)
        import postmortem_engine as _pm
        _brief = _pm.get_learning_brief_for_prompt()
        if _brief:
            learning_block = f"\nLEARNING BRIEF (from recent closed trades — apply these lessons):\n{_brief}\n"
    except Exception:
        pass

    # Build compact candidate block for the prompt
    candidate_blocks = []
    for sc in scorecards:
        ticker = sc["ticker"]

        # Rich per-ticker memory: past outcomes with P&L, then recent decisions
        outcomes = memory.get_ticker_outcome_history(ticker, limit=3)
        past_decisions = memory.get_ticker_history(ticker, days_back=60)

        mem_lines = []
        if outcomes:
            for o in outcomes:
                pnl = o.get("pnl_pct")
                entry_d = o.get("entry_date", "?")
                exit_d = o.get("exit_date", "?")
                action = o.get("action", "entered")
                conv = o.get("conviction", "?")
                reason = o.get("exit_reason", "?")
                pnl_str = f"{pnl:+.1f}%" if pnl is not None else "unknown"
                signals = ", ".join((o.get("signals") or [])[:3]) or "none"
                mem_lines.append(
                    f"    [{entry_d}→{exit_d}] {action} | conviction {conv} | "
                    f"P&L {pnl_str} | exit: {reason} | signals: {signals}"
                )
        elif past_decisions:
            d = past_decisions[0]
            mem_lines.append(
                f"    [{d['date']}] {d['action']} | conviction {d['conviction']} — no closed outcome yet"
            )
        else:
            mem_lines.append("    No prior history in this name")

        mem_note = "HISTORICAL TRADES:\n" + "\n".join(mem_lines)

        pnl_str = f"P&L: {sc['pnl_pct']:+.1f}%" if sc.get("pnl_pct") is not None else ""
        raw_conflicts = sc.get("key_conflicts", [])
        conflict_str = "; ".join(str(c) for c in raw_conflicts) if raw_conflicts else "none"
        phase_a_str = ""
        if mode == "portfolio_review":
            phase_a_str = (
                f"  Thesis intact (Fundamental): {_f(sc.get('thesis_intact'))} | "
                f"Technical vs entry (Quant): {_f(sc.get('entry_vs_today'))} | {pnl_str}\n"
            )

        block = (
            f"TICKER: {ticker}  Composite: {sc['composite_score']}/100  "
            f"[F:{sc['fundamental_score']} Q:{sc['quant_score']} S:{sc['sentiment_score']}]  "
            f"Dir(majority vote): {sc['direction']}  Conf: {sc['overall_confidence']}  "
            f"CONVICTION_ANCHOR: {sc['composite_score']}\n"
            f"  SUGGESTED_SIZE: {sc.get('suggested_size_pct', 5.0):.1f}%  "
            f"(Kelly-adjusted; ATR={sc.get('atr_pct', 2.0):.1f}% of price; you may adjust ±3%)\n"
            f"{phase_a_str}"
            f"  Signals: {', '.join(sc['candidate_signals'][:4]) or 'none'}\n"
            f"  Analyst: {sc['analyst_consensus']} | Upside to target: {_f(sc.get('upside_pct'))}%\n"
            f"  --- FORWARD-LOOKING SIGNALS ---\n"
            f"  Mean reversion score: {sc['mean_reversion_score']}/100 | Forward bias: {sc['forward_bias']}\n"
            f"  Trade type (Quant): {sc['trade_type']} | Dislocation (Fundamental): {sc['dislocation_opportunity']}\n"
            f"  Price vs intrinsic value: {sc['price_vs_intrinsic_value']}\n"
            f"  Contrarian signal (Sentiment): {sc['contrarian_signal']} | Sentiment type: {sc['sentiment_type']}\n"
            f"  --- AGENT SUMMARIES ---\n"
            f"  F-summary: {sc['fundamental_summary'][:140]}\n"
            f"  Q-summary: {sc['quant_summary'][:140]}\n"
            f"  S-summary: {sc['sentiment_summary'][:140]}\n"
            f"  Conflicts: {conflict_str} | Euphoria warning: {sc['retail_euphoria_warning']}\n"
            f"  --- FUNDAMENTAL FRAMEWORK ---\n"
            f"  Mandate: {'PASS' if sc.get('mandate_pass') else 'FAIL' if sc.get('mandate_pass') is False else 'N/A'}"
            + (f" — {'; '.join(sc['mandate_fail_reasons'][:2])}" if sc.get('mandate_fail_reasons') else "") + "\n"
            f"  Intrinsic value: {sc.get('intrinsic_value') or 'N/A'} | "
            f"Expected 12M return: {sc.get('expected_return_12m') or 'N/A'}\n"
            + (f"  Scenarios: Bull={sc.get('scenario_bull_target') or '?'}  "
               f"Base={sc.get('scenario_base_target') or '?'}  "
               f"Bear={sc.get('scenario_bear_target') or '?'}\n"
               if any(sc.get(k) for k in ('scenario_bull_target','scenario_base_target','scenario_bear_target')) else "")
            + (f"  Thesis: {' | '.join(str(b) for b in sc['thesis_bullets'][:3])}\n"
               if sc.get('thesis_bullets') else "")
            + f"  Memory: {mem_note}"
        )

        # ── Inject pre-deliberation GPT-4o research synthesis ────────────────
        # This is the full research analyst view — produced before the committee
        # deliberates so it informs the decision rather than just documenting it.
        adhoc = (adhoc_reports or {}).get(ticker, {})
        if adhoc:
            s5 = adhoc.get("s5_timing") or {}
            s6 = adhoc.get("s6_thesis") or {}
            s13 = adhoc.get("s13_scenarios") or {}
            s7_adhoc = adhoc.get("s7_recommendation") or {}
            bull_t = (s13.get("bull") or {}).get("price_target")
            base_t = (s13.get("base") or {}).get("price_target")
            bear_t = (s13.get("bear") or {}).get("price_target")
            block += (
                f"\n  === INDEPENDENT RESEARCH SYNTHESIS (GPT-4o — read before deciding) ===\n"
                f"  Entry timing verdict: {s5.get('entry_verdict', 'neutral').upper()}"
                f" | Research conviction: {s7_adhoc.get('conviction', '?')}/100"
                f" | Expected return 12M: {s7_adhoc.get('expected_return_12m') or s7_adhoc.get('expected_return_2_3yr', '?')}\n"
            )
            if s5.get("narrative"):
                block += f"  Timing: {str(s5['narrative'])[:300]}\n"
            if s6.get("narrative"):
                block += f"  Thesis: {str(s6['narrative'])[:400]}\n"
            if any(x is not None for x in [bull_t, base_t, bear_t]):
                block += f"  Scenarios: Bull=${bull_t or '?'} | Base=${base_t or '?'} | Bear=${bear_t or '?'}\n"
            if s7_adhoc.get("key_risks"):
                block += f"  Research risks: {'; '.join(str(r) for r in s7_adhoc['key_risks'][:3])}\n"
            block += f"  === END RESEARCH SYNTHESIS ===\n"

        candidate_blocks.append(block)

    n_open = len(open_positions)
    portfolio_context_block = _build_portfolio_context(open_positions)

    # Risk snapshot block — injected from portfolio_risk_snapshot.json
    risk_snapshot_block = ""
    if risk_snapshot and risk_snapshot.get("positions"):
        try:
            from utils.risk_snapshot import format_snapshot_for_prompt
            risk_snapshot_block = "\n" + format_snapshot_for_prompt(risk_snapshot) + "\n"
        except Exception:
            pass

    # Leverage constraint block — injected when account is over-exposed
    leverage_block = ""
    if live_portfolio and live_portfolio.get("is_leveraged"):
        equity   = live_portfolio["equity"]
        total_exp = live_portfolio["total_exposure"]
        ratio    = live_portfolio["leverage_ratio"]
        overage  = total_exp - equity
        leverage_block = (
            f"\n!!! HARD CONSTRAINT — ACCOUNT IS LEVERAGED ({ratio:.2f}x) !!!\n"
            f"Live Alpaca data: total exposure ${total_exp:,.0f} vs equity ${equity:,.0f} "
            f"(overage ${overage:,.0f}).\n"
            f"This fund operates with a strict NO-LEVERAGE policy. Total exposure must not exceed equity.\n"
            f"{'THIS IS A PORTFOLIO REVIEW — you MUST reduce exposure. ' if mode == 'portfolio_review' else ''}"
            f"{'Exit or decrease positions until total exposure ≤ equity. ' if mode == 'portfolio_review' else ''}"
            f"{'Prioritise exiting positions with the weakest thesis or lowest conviction. ' if mode == 'portfolio_review' else ''}"
            f"{'DO NOT hold every position and DO NOT recommend increases until the leverage is cleared.' if mode == 'portfolio_review' else ''}"
            f"{'THIS IS A NEW OPPORTUNITY RUN — DO NOT ENTER ANY NEW POSITIONS until the leverage is cleared. Skip all candidates.' if mode == 'new_opportunities' else ''}\n"
        )

    # Same-day cooldown block: tickers exited by Phase A should not be re-entered without exceptional cause
    cooldown_block = ""
    if exited_today:
        cooldown_block = (
            "\nPOSITIONS EXITED TODAY — SAME-DAY COOLDOWN:\n"
            "The Phase A committee already reviewed and CLOSED these positions today. "
            "Do NOT re-enter them without an extraordinary catalyst that fundamentally changes the thesis "
            "(e.g. surprise earnings, major acquisition, regulatory ruling). "
            "A position exited in the morning should not be re-entered the same afternoon — "
            "that is a sign of confused deliberation, not opportunity:\n"
            + "\n".join(f"  {t}: EXITED TODAY" for t in exited_today)
            + "\n"
        )

    mode_instruction = (
        "This is a PORTFOLIO REVIEW (Phase A). For each ticker, decide: hold, increase, decrease, exit, or — in extraordinary circumstances — reverse.\n"
        "Exit criteria (any one sufficient): thesis has broken, fundamentals deteriorated materially, "
        "stock hit target with no further upside, or clearly superior opportunity warrants redeployment (bar is HIGH).\n"
        "REVERSE: the rarest action. Only valid when ALL three conditions are simultaneously true:\n"
        "  (1) The thesis has COMPLETELY inverted — not weakened, but fully flipped to the opposing direction with new conviction ≥ 68\n"
        "  (2) A specific named catalyst drove the reversal (earnings miss, regulatory ruling, major macro shock, etc.) — cite it explicitly\n"
        "  (3) The new directional thesis is as well-supported as the original entry thesis was\n"
        "If reversing: conviction = conviction for the NEW direction. Include reverse_direction and reverse_size_pct in your output.\n"
        "Expect 0-2 reverse decisions per month across the whole book. Multiple reversals in one session is almost certainly wrong."
        if mode == "portfolio_review" else
        f"This is NEW OPPORTUNITY RESEARCH (Phase B). For each ticker, decide: enter_long, enter_short, or skip. "
        f"Available capital to deploy: ~{available_cash_pct:.0f}% of portfolio. "
        + (
            f"However, Portfolio Construction (which runs after you) can trim or exit the weakest position "
            f"({risk_snapshot['weakest_position']['ticker']}, conviction {risk_snapshot['weakest_position']['conviction']}/100, "
            f"P&L {risk_snapshot['weakest_position']['unrealised_pnl_pct']:+.1f}%) to free capital for a higher-conviction entry. "
            f"Do NOT dismiss high-conviction candidates on capital grounds alone — evaluate conviction and let Portfolio Construction decide on tradeoffs. "
            if (risk_snapshot and risk_snapshot.get("weakest_position") and available_cash_pct < 15)
            else
            f"Only enter positions that fit within available cash — do not size positions so that their total exceeds what is actually deployable. "
        )
        + f"Do NOT recommend entering a position in the opposite direction to one already held — "
        f"that is a Phase A portfolio review decision, not a new opportunity."
    )

    prompt = f"""You are the Investment Committee of an AI hedge fund. Today is {today}.
Your mandate is to identify where prices are GOING, not where they have been.

MACRO REGIME: {macro_regime}
AVAILABLE CASH: ~{available_cash_pct:.0f}% of portfolio
MODE: {mode_instruction}

PROFESSIONAL CONTEXT — FOR CALIBRATION ONLY:
This pipeline runs and executes trades every trading day. For reference, active long/short funds
running daily execution systems typically hold 15–35 positions simultaneously, size medium-conviction
positions at 2–5% of the book and high-conviction at 5–8%, reserving 8–10% only for exceptional
setups. Average hold is roughly 5–20 trading days. Theses whose primary catalyst is more than 30
days away are generally more suited to a longer-term vehicle than a daily-run system — unless there
is a strong near-term technical setup that justifies holding through.
None of this is a constraint, a rule, or even a suggestion. The committee is not expected to conform
to any particular style. This is simply market context — the kind of thing a seasoned PM would have
internalised from years in the industry. Use it however you see fit, or ignore it entirely. We trust
your judgement.
{fund_memory_block}{benchmark_block}{attribution_block}{learning_block}{risk_snapshot_block}{leverage_block}
{portfolio_context_block}
{cooldown_block}

CANDIDATES FOR DELIBERATION:
{'=' * 60}
{chr(10).join(candidate_blocks)}
{'=' * 60}

DECISION FRAMEWORK — CLASSIFY EACH CANDIDATE BEFORE DECIDING:

Scenario A — MOMENTUM TRADE:
  Technicals confirm the direction. Fundamentals support it. Sentiment aligns.
  → Enter in the direction of momentum (long or short).

Scenario B — DISLOCATION LONG (Mean Reversion):
  Strong fundamentals (high F-score, dislocation_opportunity=true OR contrarian_signal=true)
  + oversold technicals (mean_reversion_score >= 50, forward_bias = mean_reversion_long)
  + negative/fearful sentiment (often lagging, sentiment_type = lagging)
  = Price has overshot to the DOWNSIDE. The market is being irrational.
  → Enter LONG. Do NOT short this. The thesis is "buy the fear."

Scenario C — DISLOCATION SHORT (Overbought/Euphoria):
  Weak fundamentals + overbought technicals + euphoric sentiment (retail_euphoria_warning=true)
  = Price has overshot to the UPSIDE.
  → Enter SHORT. The thesis is "sell the hype."

Scenario D — GENUINE UNCERTAINTY:
  Fundamental and technical signals are deeply contradictory with no clear dislocation story.
  → Skip. Do not force a trade.

REGIME CONTEXT — {macro_regime}:
In RISK-OFF, broad market selloffs frequently create Scenario B opportunities — quality stocks
dragged down with everything else. Before shorting anything in RISK-OFF, ask:
"Is this stock down because it deserves to be (weak business), or because everything is down?"
Only short if the answer is "it deserves to be down." Otherwise, consider a dislocation long.

KEY SIGNALS TO PRIORITISE:
  - mean_reversion_score >= 60 + dislocation_opportunity=true → strong Scenario B candidate
  - contrarian_signal=true + sentiment_type=lagging → sentiment is stale, fundamentals win
  - retail_euphoria_warning=true + weak fundamentals → Scenario C
  - forward_bias from Quant agent reflects where price is going next 5-10 days — weight heavily

HOLDING PHILOSOPHY — CONVICTION-DRIVEN, NOT TIME-DRIVEN:
There is no target holding period. A position may be held for 2 days or 2 years — what determines
the hold decision is one thing only: is conviction still high and the thesis still intact?

ENTRY: Always needs a specific near-term catalyst or technical signal to justify the entry point
  now. "Good long-term business" is not an entry catalyst. Something must be happening in the
  next 1-30 days that makes this the right time to enter.

HOLD (Phase A): If conviction is still strong and nothing has materially changed — HOLD. Duration
  held is irrelevant. A position held 3 months with conviction 72 and an intact thesis should be
  held longer. Do not manufacture exit reasons. Do not exit because a position is "old."

EXIT: Only when one of these is true:
  - Thesis has fundamentally inverted (not just weakened)
  - Conviction has genuinely dropped below ~50 on fresh re-evaluation
  - Stock has already reached its price target with no further catalyst
  - A materially better opportunity exists AND capital is constrained

Price targets should be the next meaningful technical level — a 5-20% move is a normal swing.
When a thesis plays out, celebrate it and decide fresh: is there a new reason to stay, or redeploy?

COMMITTEE RULES:
- No fixed quota. Decide 0 to many. If nothing is convincing, decide nothing — cash is a position.
- Holding cash is the correct decision when no candidate clears the quality bar. Do not force trades.
- When genuinely good opportunities exist, be willing to deploy capital aggressively. When they don't, wait.
- Never size new positions so that their combined notional exceeds available cash.
- Soft 20% single-position cap. May exceed ONLY with explicit written justification.
- Stop-losses are OPTIONAL. Set them when: next review is >24h away, around earnings,
  or on speculative positions. When set, they are hard auto-execute triggers.
- Price targets are near-term technical levels — the next resistance (long) or support (short) to test.
- In Phase B: prefer diversification across sectors when conviction is similar.
- Reject any ticker with retail euphoria warning unless the bear case is exceptional.
- For conflicts (agent spread >= 25): state which agent takes precedence and why.
- Every decision must include a 2-3 sentence rationale that addresses direction AND trade type.
- CONCENTRATION RULE (mandatory for every new BUY): Your investment_thesis for any enter_long or
  enter_short must explicitly address: (1) how this position affects current sector concentration
  (reference the sector exposure in the Portfolio Risk Snapshot above), and (2) whether this name
  is correlated with any existing long. A one-sentence acknowledgement is sufficient — do not skip it.
- CAPITAL CONSTRAINT RULE: Low available cash does NOT automatically mean skip. Portfolio
  Construction runs after you and can exit the weakest position to fund a better opportunity.
  Your job is conviction assessment. If a candidate is materially superior to the weakest held
  position, recommend the entry — Portfolio Construction will handle the capital tradeoff.

SELF-CHALLENGE RULE (mandatory):
Before finalising your output, check: are all your non-skip decisions the same action
(e.g. all enter_short) with conviction scores within 10 points of each other?
If yes, STOP. This is a red flag for pattern-following. Review each ticker's
mean_reversion_score, dislocation_opportunity, and contrarian_signal again.
At least re-examine whether any Scenario B (dislocation long) applies before submitting.

ATR-BASED STOP-LOSS GUIDANCE (when setting one):
  Default: ATR × 2.0 below entry (LONG) or above entry (SHORT).
  High conviction: ATR × 1.5. Speculative: ATR × 2.5.
  Use the Quant agent's ATR data if available; otherwise omit stop-loss.

CONVICTION PRECISION RULE (mandatory):
Each ticker shows a CONVICTION_ANCHOR — the weighted composite of the three analyst scores.
Your conviction score MUST start from that anchor and adjust based on your reasoning.
Conviction scores MUST NOT be multiples of 5 (no 50, 55, 60, 65, 70, 75, 80, etc.).
Use precise integers: 47, 53, 61, 68, 73, 77, 82, 88, etc. Round numbers signal lazy scoring.

Return ONLY valid JSON — an array of position_decisions:
[
  {{
    "ticker": "<ticker>",
    "action": "enter_long" | "enter_short" | "hold" | "increase" | "decrease" | "exit" | "reverse" | "skip",
    "conviction": <integer 0-100, MUST NOT be a multiple of 5>,
    "stop_loss": <float price level or null>,
    "target_price": <float or null — near-term technical level (next resistance/support), NOT a DCF fair value>,
    "investment_thesis": "<Structured 3-4 sentence rationale covering: (1) WHY THIS MARKET — macro/sector tailwind or headwind; (2) WHY NOW — specific near-term catalyst within 1-30 days; (3) WHY THIS PRICE — valuation vs peers or discount to intrinsic value; (4) WHY THIS STOCK — specific competitive edge, moat, or metric that differentiates it from sector peers. Include an explicit exit condition. Do NOT write generic statements like 'Portfolio construction rebalance'.>",
    "key_catalysts": ["<catalyst 1 — must be a specific event within 1-30 days>", "<catalyst 2>"],
    "key_risks": ["<risk 1>"],
    "conflict_resolution": "<how you resolved cross-agent disagreements, or 'No conflict'>",
    "use_native_stop": <true | false — true = register a native protective order with Alpaca (enforced 24/7 even if pipeline fails); false = soft stop checked at next pipeline run. Use true for volatile/momentum setups where a gap-down is a real risk. Use false for stable positions where you want discretion to reassess before exiting.>,
    "native_order_type": "<only relevant when use_native_stop=true. Choose the order type that fits the setup:
      'stop'          — market sell/buy when price hits stop_loss. Guaranteed exit, but slippage risk in fast markets. Best for liquid large-caps.
      'stop_limit'    — stop triggers a limit at native_limit_price (must set native_limit_price). Controls exit price but risks non-fill on gaps. Best when you need price control and stock is liquid enough.
      'trailing_stop' — stop trails price by native_trail_percent%. Auto-locks in gains. Must set native_trail_percent (e.g. 5.0 = 5%). Risks premature exit on intraday noise. Best for trending momentum positions.
      'bracket'       — pairs stop-loss (stop_loss field) with a take-profit limit (native_take_profit_price). Pre-defines full risk/reward. Take-profit may limit upside. Best when you have a clear technical target and want disciplined exit on both sides.
    Default to 'stop' if unsure. Omit this field entirely when use_native_stop=false.>",
    "native_limit_price": <float — required when native_order_type='stop_limit'. The limit price the triggered order will use. Set slightly below stop_loss for LONG (e.g. stop_loss - 0.50) to allow for a small spread. Omit otherwise.>,
    "native_trail_percent": <float — required when native_order_type='trailing_stop'. The percentage distance the stop trails the best price (e.g. 5.0 for 5%). Omit otherwise.>,
    "native_take_profit_price": <float — required when native_order_type='bracket'. The limit price for the take-profit leg. Should match target_price or a clear resistance level. Omit otherwise.>,
    "skip_reason": "<only if action=skip — why passing on this>",
    "reverse_direction": "<'LONG' or 'SHORT' — only required if action=reverse, the NEW direction after closing current>",
    "reverse_size_pct": <float — only if action=reverse, target size for the NEW reversed position, e.g. 5.0>
  }}
]

NOTE: Do NOT include size_pct. Position sizing is handled by a separate Portfolio Construction
step that sees the entire book simultaneously and assigns final weights based on all positions
together. Your job is purely: action + conviction + rationale."""

    def _call_llm(prompt_text: str) -> list[dict]:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt_text}],
            temperature=0.2,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )
        raw = json.loads(resp.choices[0].message.content or "{}")
        if isinstance(raw, list):
            return raw
        return raw.get("position_decisions", raw.get("decisions", []))

    def _has_rounded_convictions(decisions: list[dict]) -> bool:
        return any(
            d.get("conviction") is not None and int(d["conviction"]) % 5 == 0
            for d in decisions
            if d.get("action") != "skip"
        )

    def _fix_rounded_convictions(decisions: list[dict]) -> list[dict]:
        """Nudge any remaining multiples-of-5 by ±1 or ±2."""
        for d in decisions:
            c = d.get("conviction")
            if c is not None and int(c) % 5 == 0:
                nudge = random.choice([-2, -1, 1, 2])
                d["conviction"] = max(1, min(99, int(c) + nudge))
        return decisions

    try:
        decisions = _call_llm(prompt)

        # Post-processing: retry once if conviction scores are still rounded
        if _has_rounded_convictions(decisions):
            logger.warning("Conviction scores contain multiples of 5 — retrying with stronger instruction")
            retry_prompt = (
                prompt +
                "\n\nCRITICAL: Your previous response contained conviction scores that are multiples of 5. "
                "This is not allowed. Every conviction score MUST be a non-round integer (e.g. 47, 53, 61, 68, 73, 77, 82, 88). "
                "Re-score all tickers with precise, non-round conviction values."
            )
            decisions = _call_llm(retry_prompt)

        # Final safety net: nudge any still-rounded scores
        if _has_rounded_convictions(decisions):
            logger.warning("Rounded convictions persist after retry — applying nudge fix")
            decisions = _fix_rounded_convictions(decisions)

        # Deduplicate: if LLM produced multiple decisions for the same ticker,
        # keep the one with the highest conviction (or first non-skip if tied).
        seen: dict[str, dict] = {}
        for d in decisions:
            t = d.get("ticker", "")
            if not t:
                continue
            if t not in seen:
                seen[t] = d
            else:
                existing_conv = seen[t].get("conviction") or 0
                this_conv = d.get("conviction") or 0
                if this_conv > existing_conv:
                    logger.warning("Dedup: %s appeared twice — keeping conviction %d over %d (%s over %s)",
                                   t, this_conv, existing_conv, d.get("action"), seen[t].get("action"))
                    seen[t] = d
                else:
                    logger.warning("Dedup: %s appeared twice — discarding lower conviction %d (%s)",
                                   t, this_conv, d.get("action"))
        decisions = list(seen.values())

        # Phase B hard guard: strip any non-entry actions.
        # Phase B must ONLY produce enter_long, enter_short, or skip.
        # exit / hold / increase / decrease are Phase A territory.
        if mode != "portfolio_review":
            PHASE_B_ALLOWED = {"enter_long", "enter_short", "skip"}
            cleaned = []
            for d in decisions:
                act = d.get("action", "")
                if act not in PHASE_B_ALLOWED:
                    logger.warning(
                        "Phase B output guard: %s produced '%s' — only Phase A can manage held positions. Discarding.",
                        d.get("ticker"), act,
                    )
                    continue
                cleaned.append(d)
            decisions = cleaned

        # Phase B hard guard: cannot propose opposing direction to an already-held position.
        # e.g. if NVDA is held SHORT, Phase B cannot enter_long NVDA.
        # Only Phase A (portfolio_review) can change direction — via decrease/exit/reverse.
        if mode != "portfolio_review":
            guarded = []
            for d in decisions:
                t = d.get("ticker", "")
                act = d.get("action", "")
                if act in ("enter_long", "enter_short") and t in open_positions:
                    held_dir = open_positions[t].get("direction", "LONG").upper()
                    proposed_dir = "LONG" if act == "enter_long" else "SHORT"
                    if held_dir != proposed_dir:
                        logger.warning(
                            "Phase B direction guard: %s proposed %s but already held %s — "
                            "converting to skip. Phase A must handle direction changes.",
                            t, proposed_dir, held_dir,
                        )
                        guarded.append({
                            "ticker": t,
                            "action": "skip",
                            "conviction": d.get("conviction"),
                            "skip_reason": (
                                f"Direction conflict: already held {held_dir}. "
                                "Phase A portfolio review must handle direction changes — "
                                "Phase B cannot enter a position opposing an existing holding."
                            ),
                        })
                        continue
                guarded.append(d)
            decisions = guarded

        return decisions
    except Exception as exc:
        logger.error("Committee LLM call failed: %s", exc)
        return []


def _build_analyst_data_block(agent_name: str, ticker: str, fund_map: dict, quant_map: dict, sent_map: dict) -> str:
    """
    Build a concise but data-rich block of the analyst's own findings.
    This is what the analyst sees when asked to respond to a challenge —
    its own numbers, not a summary of someone else's view.
    """
    if agent_name == "Fundamental":
        a = fund_map.get(ticker, {})
        ind = a.get("indicators", {})
        return (
            f"YOUR DATA ({agent_name} Analyst on {ticker}):\n"
            f"  Score: {a.get('fundamental_score', '?')}/100 | Direction: {a.get('direction', '?')}\n"
            f"  Valuation vs peers: {a.get('valuation_vs_peers', '?')} | Price vs intrinsic: {a.get('price_vs_intrinsic_value', '?')}\n"
            f"  P/E: {a.get('pe_ratio', '?')} vs peer avg {a.get('pe_peer_average', '?')}\n"
            f"  Revenue growth YoY: {a.get('revenue_growth_yoy', '?')} | Op margin: {a.get('operating_margin', '?')}\n"
            f"  ROIC: {a.get('roic', '?')} | Net debt/EBITDA: {a.get('net_debt_ebitda', '?')}\n"
            f"  Dislocation opportunity: {a.get('dislocation_opportunity', False)}\n"
            f"  Key strengths: {'; '.join(a.get('key_strengths', [])[:3])}\n"
            f"  Key concerns: {'; '.join(a.get('key_concerns', [])[:3])}\n"
            f"  Summary: {a.get('fundamental_summary', '')}"
        )
    elif agent_name == "Quant":
        a = quant_map.get(ticker, {})
        ind = a.get("indicators", {})
        return (
            f"YOUR DATA ({agent_name} Analyst on {ticker}):\n"
            f"  Score: {a.get('quant_score', '?')}/100 | Direction: {a.get('direction', '?')}\n"
            f"  Trend: {a.get('trend', '?')} | Trade type: {a.get('trade_type', '?')}\n"
            f"  Forward bias: {a.get('forward_bias', '?')} | Mean reversion score: {a.get('mean_reversion_score', '?')}\n"
            f"  RSI(14): {ind.get('rsi_14', '?')} | MACD: {a.get('macd_signal', '?')}\n"
            f"  Volume trend: {a.get('volume_trend', '?')} | ATR%: {ind.get('atr_pct', '?')}\n"
            f"  1M return: {ind.get('ret_1m', '?')}% | 3M return: {ind.get('ret_3m', '?')}%\n"
            f"  Key patterns: {', '.join(a.get('key_patterns', [])[:4]) or 'none'}\n"
            f"  Summary: {a.get('quant_summary', '')}"
        )
    else:  # Sentiment
        a = sent_map.get(ticker, {})
        return (
            f"YOUR DATA ({agent_name} Analyst on {ticker}):\n"
            f"  Score: {a.get('sentiment_score', '?')}/100 | Direction: {a.get('direction', '?')}\n"
            f"  Analyst consensus: {a.get('analyst_consensus', '?')} | Upside to target: {a.get('price_target_upside_pct', '?')}%\n"
            f"  News sentiment: {a.get('news_sentiment', '?')} | Short interest: {a.get('short_interest_pct', '?')}%\n"
            f"  Short squeeze risk: {a.get('short_squeeze_risk', False)} | Retail euphoria: {a.get('retail_euphoria_warning', False)}\n"
            f"  Contrarian signal: {a.get('contrarian_signal', False)} | Sentiment type: {a.get('sentiment_type', '?')}\n"
            f"  Summary: {a.get('sentiment_summary', '')}"
        )


def _debate_one_ticker(
    client: OpenAI,
    sc: dict,
    fund_map: dict,
    quant_map: dict,
    sent_map: dict,
    weights: dict,
) -> dict:
    """
    Run 3 sequential GPT calls for one contested ticker:
      Call 1 — Committee issues an open, targeted challenge to the dissenting analyst
      Call 2 — Dissenting analyst re-examines its own data and responds (free to hold/revise up/down)
      Call 3 — Committee reads both positions and produces a resolution + score adjustment

    Returns a debate record dict to be stored in sc["agent_debate"].
    """
    ticker = sc["ticker"]
    scores = {
        "Fundamental": sc["fundamental_score"],
        "Quant": sc["quant_score"],
        "Sentiment": sc["sentiment_score"],
    }
    sorted_agents = sorted(scores.items(), key=lambda x: x[1])
    dissenter_name, dissenter_score = sorted_agents[0]
    high_name, high_score = sorted_agents[-1]
    mid_name, mid_score = sorted_agents[1]

    # Summaries for each agent
    summaries = {
        "Fundamental": fund_map.get(ticker, {}).get("fundamental_summary", "No summary."),
        "Quant": quant_map.get(ticker, {}).get("quant_summary", "No summary."),
        "Sentiment": sent_map.get(ticker, {}).get("sentiment_summary", "No summary."),
    }

    # ── CALL 1: Committee issues a targeted, open challenge ──────────────────
    challenge_prompt = f"""You are the Investment Committee chair for an AI hedge fund reviewing {ticker}.

Three analyst agents scored this ticker and their scores diverge significantly:
  {high_name}: {high_score}/100 — "{summaries[high_name]}"
  {mid_name}: {mid_score}/100 — "{summaries[mid_name]}"
  {dissenter_name}: {dissenter_score}/100 — "{summaries[dissenter_name]}"

The spread between {high_name} ({high_score}) and {dissenter_name} ({dissenter_score}) is {high_score - dissenter_score} points.
This is large enough to materially affect the composite score and your decision.

Write a specific, open-ended challenge to the {dissenter_name} analyst.
- Identify the exact tension between its view and {high_name}'s view using the data above
- Ask a precise question that would either reconcile or sharpen the disagreement
- Do NOT tell it to change its score. Do NOT suggest it is wrong. Ask it to explain.
- The goal is to surface any data or reasoning that was missed, not to pressure revision.

Return ONLY valid JSON:
{{"challenge": "<2-3 sentence targeted question to the {dissenter_name} analyst>", "tension_identified": "<one sentence: what specifically contradicts between the two views>"}}"""

    try:
        r1 = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": challenge_prompt}],
            temperature=0.3,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        call1 = json.loads(r1.choices[0].message.content or "{}")
        challenge_text = call1.get("challenge", "")
        tension_text = call1.get("tension_identified", "")
    except Exception as exc:
        logger.warning("Debate call 1 failed for %s: %s", ticker, exc)
        return {}

    # ── CALL 2: Dissenting analyst re-examines its own data and responds ─────
    analyst_data_block = _build_analyst_data_block(dissenter_name, ticker, fund_map, quant_map, sent_map)

    response_prompt = f"""You are the {dissenter_name} Analyst for an AI hedge fund. You scored {ticker} at {dissenter_score}/100.

The Investment Committee has reviewed your analysis alongside {high_name}'s ({high_score}/100) and has a question for you.

COMMITTEE CHALLENGE:
"{challenge_text}"

{analyst_data_block}

Re-examine your own data in light of this question and respond honestly.
You have three equally valid options — choose based purely on what your data supports:
  (A) HOLD your score — if your data supports your original view and the challenge doesn't change the picture
  (B) REVISE UP — if the challenge surfaces a factor you underweighted; move your score toward {high_name}'s view
  (C) REVISE DOWN — if re-examining your data reveals you were actually too generous; reduce your score further

There is NO pressure to revise. A well-reasoned defence of your original score is a good outcome.
Do not revise for the sake of appearing responsive. Only revise if the data genuinely warrants it.

Return ONLY valid JSON:
{{
  "response": "<3-4 sentences: your direct answer to the challenge, citing your own data>",
  "revised_score": <integer — your updated score, or unchanged if holding>,
  "outcome": "held" | "revised_up" | "revised_down",
  "score_delta": <integer — how many points you moved, positive or negative, 0 if held>
}}"""

    try:
        r2 = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": response_prompt}],
            temperature=0.3,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        call2 = json.loads(r2.choices[0].message.content or "{}")
        analyst_response = call2.get("response", "")
        revised_score = int(call2.get("revised_score", dissenter_score))
        outcome = call2.get("outcome", "held")
        score_delta = int(call2.get("score_delta", 0))
        # Clamp score to valid range
        revised_score = max(0, min(100, revised_score))
    except Exception as exc:
        logger.warning("Debate call 2 failed for %s: %s", ticker, exc)
        return {}

    # ── CALL 3: Committee reads the exchange and resolves ────────────────────
    resolution_prompt = f"""You are the Investment Committee chair for an AI hedge fund. You are resolving a scoring debate on {ticker}.

ORIGINAL POSITIONS:
  {high_name}: {high_score}/100 — "{summaries[high_name]}"
  {dissenter_name}: {dissenter_score}/100 — "{summaries[dissenter_name]}"

CHALLENGE YOU ISSUED:
"{challenge_text}"

{dissenter_name.upper()} ANALYST RESPONSE:
"{analyst_response}"
Their revised score: {revised_score}/100 (outcome: {outcome}, delta: {score_delta:+d})

Assess the quality of this exchange and decide how to resolve it.
Judge both the original challenge and the response on their merits.
A held score with strong data support is as valid as a revision.

Return ONLY valid JSON:
{{
  "resolution": "<2-3 sentences: how you weight each position and why, citing specific data points>",
  "final_dissenter_score": <integer — the score you'll use for the {dissenter_name} analyst in the composite>,
  "resolution_reasoning": "<1 sentence: the key factor that determined your resolution>"
}}"""

    try:
        r3 = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": resolution_prompt}],
            temperature=0.2,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        call3 = json.loads(r3.choices[0].message.content or "{}")
        resolution_text = call3.get("resolution", "")
        final_score = int(call3.get("final_dissenter_score", revised_score))
        resolution_reasoning = call3.get("resolution_reasoning", "")
        final_score = max(0, min(100, final_score))
    except Exception as exc:
        logger.warning("Debate call 3 failed for %s: %s", ticker, exc)
        # Fall back to revised score from call 2
        final_score = revised_score
        resolution_text = "Resolution call failed — using analyst's revised score."
        resolution_reasoning = ""

    # Build debate record
    debate_record = {
        "dissenter": dissenter_name,
        "high_agent": high_name,
        "original_dissenter_score": dissenter_score,
        "high_agent_score": high_score,
        "spread": high_score - dissenter_score,
        "tension_identified": tension_text,
        "committee_challenge": challenge_text,
        "analyst_response": analyst_response,
        "analyst_outcome": outcome,
        "analyst_score_delta": score_delta,
        "analyst_revised_score": revised_score,
        "committee_resolution": resolution_text,
        "committee_resolution_reasoning": resolution_reasoning,
        "final_dissenter_score": final_score,
    }

    # Update scorecard with resolved score
    key = f"{dissenter_name.lower()}_score"
    if key in sc:
        sc[key] = final_score
    _cws = weights["fundamental"] + weights["quant"] + weights["sentiment"]
    _cs = 0.80 / _cws if _cws > 0 else 1.0
    sc["composite_score"] = round(
        sc["fundamental_score"] * weights["fundamental"] * _cs +
        sc["quant_score"]       * weights["quant"]       * _cs +
        sc["sentiment_score"]   * weights["sentiment"]   * _cs +
        sc.get("macro_score", 50) * 0.10 +
        sc.get("news_score",  50) * 0.10
    )

    net_move = final_score - dissenter_score
    logger.info(
        "Debate %s: %s(%d) challenged by Committee → %s responded (outcome: %s, delta: %+d) → Committee resolved to %d (net: %+d)",
        ticker, dissenter_name, dissenter_score, dissenter_name, outcome, score_delta, final_score, net_move,
    )
    return debate_record


def _run_debate_round(
    scorecards: list[dict],
    fundamental: dict,
    quant: dict,
    sentiment: dict,
    weights: dict | None = None,
) -> list[dict]:
    """
    Iterative debate mechanic: for every scorecard where agent spread >= 20,
    run a 3-call challenge/response/resolution cycle per ticker.

    Call 1: Committee issues an open, specific challenge to the dissenting analyst
    Call 2: Dissenting analyst re-examines its own data — free to hold, revise up, or revise down
    Call 3: Committee reads the exchange and resolves with a final score

    Anti-bias guarantees:
    - Challenge prompt is explicitly open-ended; does not suggest the dissenter is wrong
    - Response prompt lists hold/revise-up/revise-down as equally valid; explicitly says
      "do not revise for the sake of appearing responsive"
    - Resolution uses the Committee's judgement, not a mechanical average
    - Analyst response is grounded in its own raw data, not a summary of another agent's view
    """
    DEBATE_THRESHOLD = 20
    # Max contested debates scales with mode via env var set by portfolio_manager
    max_debates = int(os.environ.get("MAX_CONTESTED", "10"))
    # Stocks scoring above this are "likely entries" — always debated regardless of spread
    ENTRY_SCORE_THRESHOLD = 65

    if weights is None:
        weights = DEFAULT_WEIGHTS

    fund_map = {a["ticker"]: a for a in fundamental.get("fundamental_analyses", [])}
    quant_map = {a["ticker"]: a for a in quant.get("quant_analyses", [])}
    sent_map = {a["ticker"]: a for a in sentiment.get("sentiment_analyses", [])}

    # Priority 1: high-scoring stocks likely to be entered — mandatory debate even if agents agreed
    likely_entries = sorted(
        [sc for sc in scorecards if sc["composite_score"] >= ENTRY_SCORE_THRESHOLD],
        key=lambda x: x["composite_score"],
        reverse=True,
    )
    entry_tickers = {sc["ticker"] for sc in likely_entries}

    # Priority 2: contested stocks (spread >= 20) not already captured above
    contested_only = sorted(
        [sc for sc in scorecards if sc["agent_spread"] >= DEBATE_THRESHOLD and sc["ticker"] not in entry_tickers],
        key=lambda x: x["agent_spread"],
        reverse=True,
    )

    # Entries first (mandatory), then contested fill remaining slots, capped at max_debates
    to_debate = (likely_entries + contested_only)[:max_debates]

    # Mark every scorecard with debate metadata before returning
    entry_tickers_set = {sc["ticker"] for sc in likely_entries}
    contested_tickers_set = {sc["ticker"] for sc in contested_only}
    for sc in scorecards:
        if sc["ticker"] in entry_tickers_set:
            sc["was_debated"] = True
            sc["debate_reason"] = "likely_entry"
        elif sc["ticker"] in contested_tickers_set:
            sc["was_debated"] = True
            sc["debate_reason"] = "high_spread"
        else:
            sc["was_debated"] = False
            sc["debate_reason"] = None

    if not to_debate:
        logger.info("Debate selection: 0 stocks met debate criteria (0 likely-entry, 0 contested)")
        return scorecards

    entry_labels = [f"{sc['ticker']}({sc['composite_score']})" for sc in likely_entries[:5]]
    spread_labels = [f"{sc['ticker']}(spread={sc['agent_spread']})" for sc in contested_only[:5]]
    logger.info(
        "Debate selection: %d likely-entry %s + %d contested %s → %d debated (cap=%d)",
        len(likely_entries), entry_labels, len(contested_only), spread_labels, len(to_debate), max_debates,
    )

    contested = to_debate

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    sc_index = {sc["ticker"]: sc for sc in scorecards}

    for sc in contested:
        ticker = sc["ticker"]
        try:
            debate_record = _debate_one_ticker(client, sc, fund_map, quant_map, sent_map, weights)
            if debate_record:
                sc_index[ticker]["agent_debate"] = debate_record
        except Exception as exc:
            logger.warning("Debate failed for %s: %s", ticker, exc)
            continue

    return scorecards


def construct_portfolio_allocation(
    phase_b_decisions: list[dict],
    phase_a_decisions: list[dict],
    open_positions: dict,
    equity: float,
    cash_pct: float,
    macro_regime: str,
    scorecards: list[dict] | None = None,
    adhoc_reports: dict | None = None,
    macro_data: dict | None = None,
) -> dict:
    """
    Portfolio Construction: a single LLM call that sees the ENTIRE book simultaneously.

    Runs after both Phase A and Phase B committees have deliberated.
    Takes their action/conviction outputs and determines the final target weight
    for every position — both existing holds and new entries.

    This prevents the blindness problem where Phase B sizes positions based on
    whatever cash happened to be left after Phase A, without seeing the full picture.

    Returns:
        {
          "target_weights": {"TICKER": <float % of portfolio>},
          "rebalancing": {"TICKER": {"from_pct": x, "to_pct": y}},
          "reasoning": "<narrative>"
        }
    """
    if not phase_b_decisions and not open_positions:
        return {"target_weights": {}, "rebalancing": {}, "reasoning": "No positions to construct."}

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    today = datetime.utcnow().date().isoformat()

    sc_map = {sc["ticker"]: sc for sc in (scorecards or [])}
    adhoc_map = adhoc_reports or {}

    def _ticker_block(ticker: str, decision: dict, pos: dict) -> str:
        """Build a rich per-ticker context block for the construction prompt."""
        sc = sc_map.get(ticker, {})
        adhoc = adhoc_map.get(ticker, {})
        lines = []

        action = decision.get("action", "hold").upper()
        conviction = decision.get("conviction") or pos.get("conviction") or 50
        current_wt = pos.get("size_pct") or 0
        direction = decision.get("direction") or pos.get("direction", "LONG")

        lines.append(f"=== {ticker} | {direction} | action={action} | conviction={conviction}/100 | current_weight={current_wt:.1f}% ===")

        # Agent scores
        fs = sc.get("fundamental_score") or decision.get("fundamental_score") or "?"
        qs = sc.get("quant_score") or decision.get("quant_score") or "?"
        ss = sc.get("sentiment_score") or decision.get("sentiment_score") or "?"
        comp = sc.get("composite_score") or "?"
        atr = sc.get("atr_pct") or "?"
        conf = sc.get("overall_confidence") or "?"
        conflict = sc.get("conflict_flag", False)
        lines.append(f"  Scores: Fundamental={fs} Quant={qs} Sentiment={ss} Composite={comp} | Confidence={conf} | ATR={atr}% | AgentConflict={'YES' if conflict else 'no'}")

        # Agent summaries
        if sc.get("fundamental_summary"):
            lines.append(f"  Fundamental: {sc['fundamental_summary'][:200]}")
        if sc.get("quant_summary"):
            lines.append(f"  Quant: {sc['quant_summary'][:200]}")
        if sc.get("sentiment_summary"):
            lines.append(f"  Sentiment: {sc['sentiment_summary'][:200]}")

        # Debate outcome if agents disagreed
        debate = sc.get("agent_debate", {})
        if debate:
            lines.append(f"  Debate: {debate.get('dissenter','')} dissented ({debate.get('original_dissenter_score','?')} vs {debate.get('high_agent_score','?')}). "
                         f"Tension: {str(debate.get('tension_identified',''))[:120]}. "
                         f"Resolution: {str(debate.get('committee_resolution',''))[:120]}")

        # Committee thesis and catalysts/risks
        thesis = decision.get("investment_thesis") or pos.get("entry_thesis") or ""
        if thesis:
            lines.append(f"  Thesis: {thesis[:250]}")
        catalysts = decision.get("key_catalysts") or []
        if catalysts:
            lines.append(f"  Catalysts: {'; '.join(str(c) for c in catalysts[:3])[:200]}")
        risks = decision.get("key_risks") or []
        if risks:
            lines.append(f"  Risks: {'; '.join(str(r) for r in risks[:3])[:200]}")

        # Adhoc report highlights if available
        if adhoc:
            s7 = adhoc.get("s7_recommendation") or {}
            s8 = adhoc.get("s8_technical") or {}
            s12 = adhoc.get("s12_risk") or {}
            s4 = adhoc.get("s4_valuation") or {}
            if s7.get("expected_return_12m"):
                lines.append(f"  Expected 12M return: {s7['expected_return_12m']}")
            if s4.get("narrative"):
                lines.append(f"  Valuation: {str(s4['narrative'])[:150]}")
            if s8.get("trend") or s8.get("rsi_14"):
                lines.append(f"  Technical: trend={s8.get('trend','?')} RSI={s8.get('rsi_14','?')} bias={s8.get('forward_bias','?')}")
            if s12.get("beta") is not None:
                lines.append(f"  Risk: beta={s12['beta']} debt/eq={s12.get('debt_to_equity','?')} current_ratio={s12.get('current_ratio','?')}")

        return "\n".join(lines)

    # Build context: existing holdings after committee review
    phase_a_map = {d["ticker"]: d for d in phase_a_decisions if d.get("ticker")}
    all_decisions_map = {d["ticker"]: d for d in phase_b_decisions if d.get("ticker")}

    held_blocks = []
    for ticker, pos in open_positions.items():
        pa = phase_a_map.get(ticker, {})
        action = pa.get("action") or all_decisions_map.get(ticker, {}).get("action", "hold")
        if action == "exit":
            continue
        decision = all_decisions_map.get(ticker, pa) or {}
        held_blocks.append(_ticker_block(ticker, decision, pos))

    # New entries
    new_blocks = []
    for d in phase_b_decisions:
        if "enter" not in d.get("action", ""):
            continue
        new_blocks.append(_ticker_block(d["ticker"], d, {}))

    held_section = "\n\n".join(held_blocks) if held_blocks else "  (none)"
    new_section = "\n\n".join(new_blocks) if new_blocks else "  (none)"

    # Macro context
    macro_block = f"Macro regime: {macro_regime}"
    if macro_data:
        regime_detail = macro_data.get("regime_detail") or macro_data.get("narrative") or ""
        key_risks = macro_data.get("key_risks") or []
        if regime_detail:
            macro_block += f"\n  {str(regime_detail)[:200]}"
        if key_risks:
            macro_block += f"\n  Macro risks: {'; '.join(str(r) for r in key_risks[:3])[:150]}"

    # Build capital tradeoff block: compare new entry conviction vs held position conviction
    # so the LLM can proactively decide to exit lower-conviction holds to fund better opportunities
    capital_tradeoff_block = ""
    new_entries_by_conviction = sorted(
        [
            (d["ticker"], d.get("conviction", 50), d.get("action", ""))
            for d in phase_b_decisions
            if "enter" in d.get("action", "")
        ],
        key=lambda x: -x[1],
    )
    held_by_conviction = sorted(
        [
            (t, phase_a_map.get(t, {}).get("conviction") or pos.get("conviction") or 50,
             pos.get("size_pct") or 0, pos.get("direction", "LONG"))
            for t, pos in open_positions.items()
            if phase_a_map.get(t, {}).get("action") not in ("exit",)
        ],
        key=lambda x: x[1],  # lowest conviction first
    )
    if new_entries_by_conviction and held_by_conviction:
        top_new_conviction = new_entries_by_conviction[0][1]
        # Find held positions with meaningfully lower conviction than the best new entry
        swap_targets = [(t, c, sz, d) for t, c, sz, d in held_by_conviction if c < top_new_conviction - 8]
        if swap_targets:
            swap_lines = [
                f"  {t}: {d} | conviction={c}/100 | current_weight={sz:.1f}%"
                for t, c, sz, d in swap_targets
            ]
            new_lines = [
                f"  {t}: {act.upper()} | conviction={c}/100"
                for t, c, act in new_entries_by_conviction
            ]
            capital_tradeoff_block = (
                "\nCAPITAL TRADEOFF OPPORTUNITY:\n"
                f"Available cash is {cash_pct:.1f}%. The following new entries were approved by the committee "
                "but may not fit within cash alone.\n"
                "You MAY exit lower-conviction held positions to fund higher-conviction new entries — "
                "this is a valid and expected portfolio management decision.\n"
                "CONVICTION COMPARISON:\n"
                "  NEW ENTRIES (approved, highest conviction first):\n"
                + "\n".join(f"    {l}" for l in new_lines) + "\n"
                "  HELD POSITIONS (lowest conviction first — exit candidates):\n"
                + "\n".join(f"    {l}" for l in swap_lines) + "\n"
                "If you decide to exit a held position to fund a new entry, list it in `capital_swap_exits`.\n"
                "Only do this if the new entry conviction is meaningfully higher (≥8 points) AND the thesis "
                "for the new entry is stronger. Do not churn positions for marginal conviction differences.\n"
            )

    # Load risk snapshot for portfolio construction context
    _construction_risk_block = ""
    try:
        from utils.risk_snapshot import load_snapshot, format_snapshot_for_prompt
        _snap = load_snapshot()
        if _snap and _snap.get("positions"):
            _construction_risk_block = "\n" + format_snapshot_for_prompt(_snap) + "\n"
    except Exception:
        pass

    # Build a cash balance summary so the LLM can see exactly what buying power it has
    current_invested_pct = sum(
        abs(pos.get("size_pct") or 0.0)
        for ticker, pos in open_positions.items()
        if phase_a_map.get(ticker, {}).get("action") != "exit"
    )
    total_buying_needed_pct = sum(
        max(0.0, (d.get("size_pct") or 0.0) - abs(open_positions.get(d["ticker"], {}).get("size_pct") or 0.0))
        for d in phase_b_decisions
        if "enter" in d.get("action", "") and d.get("size_pct")
    )

    prompt = f"""You are the Portfolio Manager of an AI hedge fund. Today is {today}.

Your job is PORTFOLIO CONSTRUCTION — setting the final target allocation for every position.

The research team and investment committee have already decided WHAT to buy/sell.
You decide HOW MUCH of each position to hold.

PORTFOLIO STATE:
  Total equity: ${equity:,.0f}
  Available cash: ~{cash_pct:.1f}% of portfolio  (≈ ${equity * cash_pct / 100:,.0f})
  Currently invested: ~{current_invested_pct:.1f}% across existing positions
{macro_block}
{_construction_risk_block}
EXISTING POSITIONS — showing ACTUAL current allocation in Alpaca (after today's committee review):
{held_section}

NEW ENTRIES approved by committee:
{new_section}
{capital_tradeoff_block}
CRITICAL CASH CONSTRAINT:
You have {cash_pct:.1f}% (≈ ${equity * cash_pct / 100:,.0f}) of free cash available RIGHT NOW.
Any target weight ABOVE a position's current actual weight requires buying more shares — that costs cash.
If the total additional buying you assign exceeds {cash_pct:.1f}%, YOUR TARGETS ARE UNFUNDED and will not execute.

You MUST make an explicit decision for every new entry:

  OPTION A — Fund it by trimming: Decide which existing position(s) to reduce or exit to free up cash.
    List exits in `capital_swap_exits`. Reduce held positions below their current weight in `target_weights`.
    Only trim a position if you genuinely think the new entry is more attractive right now.
    Do NOT blindly trim the biggest position — it might be your best trade.

  OPTION B — Accept you cannot enter it: Set the new entry's target_weight to 0 (or omit it).
    This is the correct answer if every existing position is worth keeping at its current size.
    Holding cash and the current book is a valid portfolio decision.

There is NO option C. Do not assign targets that sum to more than what cash covers.
Every funded entry must have a corresponding trim somewhere, or the cash must already exist.
Make the judgment call explicitly — this is your job as Portfolio Manager.

YOUR TASK:
Set the target weight for EVERY position in the portfolio — both existing holds and new entries.
You must output ALL held positions in `target_weights`.
This is a daily full-portfolio rebalance. Base every weight on your full assessment of the data.

Use your full judgement across ALL the data provided above. For each position you have:
- Action and conviction score from the investment committee
- Individual agent scores (fundamental, quant, sentiment) and summaries
- Any debate/dissent among the committee agents and how it was resolved
- Investment thesis, key catalysts, and key risks
- Technical trend, RSI, expected 12-month return (where available from research reports)
- Risk metrics: beta, debt/equity, current ratio
- ATR (volatility) — higher ATR positions warrant smaller sizing for equivalent risk exposure

Think holistically: a position with high conviction but also high ATR and a contested committee debate
deserves different sizing than a high-conviction position with strong agent alignment and low volatility.
Use this data. Do not mechanically map conviction scores to fixed size bands — apply genuine judgment.

RULES:
- No single position above 25% of portfolio
- Positions the committee decided to EXIT should not appear in your output
- Your target_weights must be FUNDABLE with the available cash — if they aren't, trim other positions first
- Every day is a fresh sizing decision. A position's current weight has no special claim to stay there.
- Cash is fine — if allocations only sum to 70%, 30% stays in cash. That is a valid defensive decision.

IMPORTANT: Do NOT include "CASH" as a ticker in target_weights. Cash allocation is implicit —
whatever percentage is not assigned to stocks stays as cash automatically.

Return ONLY valid JSON:
{{
  "target_weights": {{
    "TICKER": <float — target % of total portfolio>,
    ...
  }},
  "capital_swap_exits": [
    {{
      "ticker": "<ticker to exit>",
      "reason": "<why exiting to free up cash>"
    }}
  ],
  "reasoning": "<3-4 sentences: what drove the biggest allocations, how you balanced the cash constraint, and any tradeoffs>"
}}

`capital_swap_exits` may be [] if free cash is sufficient for all targets."""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        result = json.loads(resp.choices[0].message.content or "{}")
        target_weights = result.get("target_weights", {})
        # Strip any "CASH" entry — LLMs sometimes use this as shorthand for cash allocation,
        # but CASH is a real ETF ticker and must never be traded as a position.
        target_weights = {k: v for k, v in target_weights.items() if k.upper() != "CASH"}
        reasoning = result.get("reasoning", "")
        capital_swap_exits = result.get("capital_swap_exits", [])

        # Compute rebalancing diff vs current positions
        rebalancing = {}
        for ticker, target in target_weights.items():
            pos = open_positions.get(ticker, {})
            pa = phase_a_map.get(ticker, {})
            current = pos.get("size_pct") or 0
            if abs(target - current) >= 0.5:  # Only flag meaningful changes
                rebalancing[ticker] = {"from_pct": round(current, 1), "to_pct": round(target, 1)}

        if capital_swap_exits:
            swap_tickers = [s.get("ticker") for s in capital_swap_exits if s.get("ticker")]
            logger.info("Portfolio construction: capital swaps recommended — exiting %s to fund new entries", swap_tickers)

        logger.info("Portfolio construction complete: %d targets set | %d swaps | reasoning: %s",
                    len(target_weights), len(capital_swap_exits), reasoning[:100])
        return {
            "target_weights": {k: round(float(v), 1) for k, v in target_weights.items()},
            "rebalancing": rebalancing,
            "capital_swap_exits": capital_swap_exits,
            "reasoning": reasoning,
        }

    except Exception as exc:
        logger.warning("Portfolio construction LLM failed: %s — using committee sizes as-is", exc)
        return {"target_weights": {}, "rebalancing": {}, "capital_swap_exits": [], "reasoning": f"Construction failed: {exc}"}


def _committee_narrative_llm(decisions: list[dict], macro_regime: str) -> str:
    """Short single call for the overall portfolio narrative."""
    if not decisions:
        return "No positions initiated today."
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    acting = [d for d in decisions if d.get("action") not in ("skip",)]

    # Build rich per-ticker context so the LLM can write specific, data-driven prose
    ticker_lines = []
    for d in acting[:8]:
        ticker = d.get("ticker", "?")
        action = (d.get("action") or "?").replace("_", " ")
        conviction = d.get("conviction")
        thesis = (d.get("investment_thesis") or "")[:200]
        catalysts = d.get("key_catalysts") or []
        risks = d.get("key_risks") or []

        line = f"- {ticker}: {action}"
        if conviction:
            line += f" (conviction {conviction}/100)"
        if thesis:
            line += f" — {thesis}"
        if catalysts:
            line += f". Catalyst: {str(catalysts[0])[:100]}"
        if risks:
            line += f". Risk: {str(risks[0])[:80]}"
        ticker_lines.append(line)

    if not ticker_lines:
        return f"Committee held all existing positions. Macro regime: {macro_regime}."

    context = "\n".join(ticker_lines)
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": (
                f"You are writing the Investment Committee narrative for a daily hedge fund report. "
                f"Macro regime: {macro_regime}.\n\n"
                f"Today's decisions:\n{context}\n\n"
                f"Write 3-4 sentences summarising the committee's rationale. "
                f"Requirements: Name specific tickers. Reference conviction scores, catalysts, or risks where available. "
                f"Do NOT use vague phrases like 'strong fundamentals', 'resilience', 'confidence in', or 'robust'. "
                f"Be direct and analytical — the reader is the portfolio manager, not a marketing audience."
            )}],
            temperature=0.4, max_tokens=300,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return "Committee deliberation complete. Actions: " + ", ".join(
            f"{d['ticker']} ({d.get('action', '?')})" for d in acting[:8]
        ) + "."


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------

def run(mode: str = "new_opportunities", held_tickers: list[str] | None = None, exited_today: list[str] | None = None, live_portfolio: dict | None = None) -> dict:
    logger.info("=== Investment Committee (Agent 10) — mode: %s ===", mode)
    today = datetime.utcnow().date().isoformat()

    macro, candidates_raw, fundamental, quant, sentiment = _load_all_reports()
    macro_regime = macro.get("regime", "NEUTRAL")
    candidates = candidates_raw.get("candidates", [])
    open_positions = memory.get_open_positions()

    if not candidates:
        logger.warning("No candidates found — Committee has nothing to deliberate on")
        return {"position_decisions": [], "committee_narrative": "No candidates to evaluate.", "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}

    logger.info("%d candidates | %d open positions | macro: %s", len(candidates), len(open_positions), macro_regime)

    # Adjust weights for current regime
    weights = _adjust_weights(macro_regime)
    logger.info("Agent weights: F=%.0f%% Q=%.0f%% S=%.0f%%",
                weights["fundamental"] * 100, weights["quant"] * 100, weights["sentiment"] * 100)

    # Load news_report for news_score computation
    _news_path = REPORTS_DIR / "news_report.json"
    _news_report: dict = {}
    if _news_path.exists():
        try:
            with open(_news_path) as _nf:
                _news_report = json.load(_nf)
        except Exception:
            pass

    # Build scorecards (now includes macro_score + news_score)
    scorecards = _build_scorecard(candidates, fundamental, quant, sentiment, weights, macro=macro, news=_news_report)

    # Debate round: iterative challenge/response/resolution for contested tickers
    contested_count = sum(1 for sc in scorecards if sc["agent_spread"] >= 20)
    if contested_count > 0:
        logger.info("Running iterative debate for %d contested tickers (spread >= 20)...", contested_count)
        scorecards = _run_debate_round(scorecards, fundamental, quant, sentiment, weights=weights)

    # Pre-filter: only debate qualifying candidates
    qualifying = [sc for sc in scorecards if sc["composite_score"] >= DELIBERATION_THRESHOLD]

    # Phase B hard filter: never send held tickers to the new-opportunities committee.
    # Phase A owns all decisions for held positions — Phase B must only deliberate on new names.
    if mode == "new_opportunities" and open_positions:
        n_before = len(qualifying)
        qualifying = [sc for sc in qualifying if sc["ticker"] not in open_positions]
        n_excluded = n_before - len(qualifying)
        if n_excluded:
            logger.info("Phase B: excluded %d already-held tickers from deliberation: %s",
                        n_excluded,
                        [sc["ticker"] for sc in scorecards
                         if sc["composite_score"] >= DELIBERATION_THRESHOLD
                         and sc["ticker"] in open_positions])

    max_to_debate = int(os.environ.get("MAX_CANDIDATES_TO_DEBATE", str(MAX_CANDIDATES_TO_DEBATE)))
    to_debate = qualifying[:max_to_debate]

    logger.info("Pre-filter: %d candidates → %d qualify (composite ≥ %d) → debating top %d",
                len(scorecards), len(qualifying), DELIBERATION_THRESHOLD, len(to_debate))

    if not to_debate:
        logger.warning("No candidates above threshold — no positions initiated")
        return {
            "position_decisions": [],
            "committee_narrative": "No candidates met the quality threshold today. Holding cash.",
            "scorecards": scorecards,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        }

    # Fetch available capital % from last portfolio_state (written by Trade Executor)
    # IMPORTANT: use equity-based available capital, NOT cash/equity.
    # Short-sale proceeds inflate the Alpaca cash balance (the proceeds sit in the account
    # as collateral), so cash/equity overstates free capital when shorts are held.
    # Correct formula: max(0, equity - total_exposure - 5% floor) / equity.
    available_cash_pct = 100.0
    portfolio_state_path = REPORTS_DIR / "portfolio_state.json"
    if portfolio_state_path.exists():
        try:
            with open(portfolio_state_path) as _psf:
                _ps = json.load(_psf)
            _equity = float(_ps.get("equity") or _ps.get("portfolio_value") or 0)
            _long_mv = float(_ps.get("long_market_value") or 0)
            _short_mv = abs(float(_ps.get("short_market_value") or 0))
            _total_exp = _long_mv + _short_mv
            _floor = _equity * 0.05  # 5% hard-floor cash buffer
            if _equity > 0:
                _free = max(0.0, _equity - _total_exp - _floor)
                available_cash_pct = round(_free / _equity * 100, 1)
            else:
                # Fallback: no portfolio_state yet (first run) → assume 95% available
                available_cash_pct = 95.0
        except Exception:
            pass
    logger.info("Available capital: %.0f%% of equity (equity-minus-exposure basis)", available_cash_pct)

    # Load risk snapshot (written by portfolio_manager before any agent runs)
    risk_snapshot: dict | None = None
    try:
        from utils.risk_snapshot import load_snapshot
        risk_snapshot = load_snapshot() or None
    except Exception:
        pass

    # ── Pre-deliberation: generate full GPT-4o research synthesis per candidate ──
    # Runs BEFORE committee deliberation so agents can read and discuss the full
    # timing narrative, investment thesis, scenarios, and research conviction.
    adhoc_by_ticker: dict[str, dict] = {}
    _pre_research_tickers = [sc["ticker"] for sc in to_debate]
    if _pre_research_tickers:
        try:
            import sys as _sys_pre
            from pathlib import Path as _Path_pre
            _scripts_dir_pre = str(_Path_pre(__file__).resolve().parent.parent / "scripts")
            if _scripts_dir_pre not in _sys_pre.path:
                _sys_pre.path.insert(0, _scripts_dir_pre)
            from adhoc_report import generate_from_pipeline_data as _gen_pre
            _news_path_pre = REPORTS_DIR / "news_report.json"
            _news_pre: dict = {}
            if _news_path_pre.exists():
                with open(_news_path_pre) as _nf_pre:
                    _news_pre = json.load(_nf_pre)
            logger.info("Generating pre-deliberation research synthesis for: %s", _pre_research_tickers)
            for _ticker_pre in _pre_research_tickers:
                try:
                    _report_pre = _gen_pre(_ticker_pre, fundamental, quant, sentiment, macro, _news_pre)
                    if _report_pre:
                        adhoc_by_ticker[_ticker_pre] = _report_pre
                        logger.info("Pre-deliberation synthesis ready: %s (research conviction=%s)",
                                    _ticker_pre, (_report_pre.get("s7_recommendation") or {}).get("conviction"))
                except Exception as _exc_pre:
                    logger.warning("Pre-deliberation synthesis failed for %s: %s", _ticker_pre, _exc_pre)
        except Exception as _imp_pre:
            logger.warning("Could not run pre-deliberation synthesis: %s", _imp_pre)

    # LLM deliberation — committee now reads full research synthesis per candidate
    logger.info("Sending %d candidates to Committee deliberation...", len(to_debate))
    decisions = _deliberate_with_llm(to_debate, macro_regime, open_positions, mode, available_cash_pct, exited_today=exited_today, live_portfolio=live_portfolio, risk_snapshot=risk_snapshot, adhoc_reports=adhoc_by_ticker)
    logger.info("Committee produced %d decisions", len(decisions))

    # ── Portfolio Construction: assign final sizes across the full book ──
    # This is the step that was previously defined but never called.
    # It sees all decisions + existing holds simultaneously and normalises
    # weights so conviction scores and allocation actually align.
    try:
        equity_for_construction = _equity if "_equity" in dir() else 0.0
        construction = construct_portfolio_allocation(
            phase_b_decisions=decisions,
            phase_a_decisions=[],   # no separate phase A in adhoc mode
            open_positions=open_positions,
            equity=equity_for_construction,
            cash_pct=available_cash_pct,
            macro_regime=macro_regime,
            scorecards=to_debate,
            adhoc_reports=adhoc_by_ticker,
            macro_data=macro,
        )
        target_weights = construction.get("target_weights", {})
        if target_weights:
            # Apply constructed weights back onto decisions so size_pct is set correctly
            decision_map = {d["ticker"]: d for d in decisions if d.get("ticker")}
            for ticker, weight in target_weights.items():
                if ticker in decision_map:
                    decision_map[ticker]["size_pct"] = round(float(weight), 1)
                else:
                    # Hold decision not in deliberation list (existing position being resized)
                    # Build a real thesis from agent data rather than a generic placeholder
                    _pos_data = open_positions.get(ticker, {})
                    _sc_map_hold = {sc["ticker"]: sc for sc in scorecards}
                    _sc_hold = _sc_map_hold.get(ticker, {})
                    _hold_thesis = (
                        _sc_hold.get("fundamental_summary")
                        or _pos_data.get("entry_thesis")
                        or f"Holding {ticker} at {round(float(weight), 1)}% — conviction {_pos_data.get('conviction', 50)}/100."
                    )
                    decisions.append({
                        "ticker": ticker,
                        "action": "hold",
                        "conviction": _pos_data.get("conviction") or 50,
                        "size_pct": round(float(weight), 1),
                        "investment_thesis": _hold_thesis,
                        "key_catalysts": _sc_hold.get("candidate_signals", [])[:3],
                    })
            logger.info(
                "Portfolio construction applied: %d weights set | rebalancing: %s | %s",
                len(target_weights),
                construction.get("rebalancing", {}),
                construction.get("reasoning", "")[:120],
            )
        else:
            logger.warning("Portfolio construction returned no weights — falling back to Kelly sizing")
            # Fallback: apply suggested_size_pct from scorecards to decisions lacking size_pct
            sc_map = {sc["ticker"]: sc for sc in scorecards}
            for d in decisions:
                if not d.get("size_pct") and d.get("action") not in ("skip", "exit"):
                    sc = sc_map.get(d.get("ticker", ""), {})
                    d["size_pct"] = sc.get("suggested_size_pct", 5.0)
    except Exception as _ce:
        logger.warning("Portfolio construction failed: %s — falling back to Kelly sizing", _ce)
        sc_map = {sc["ticker"]: sc for sc in scorecards}
        for d in decisions:
            if not d.get("size_pct") and d.get("action") not in ("skip", "exit"):
                sc = sc_map.get(d.get("ticker", ""), {})
                d["size_pct"] = sc.get("suggested_size_pct", 5.0)

    # ── HARD GATE: strip any entry that lacks complete pipeline analysis ──────────
    # A position may NEVER be entered without all three agent scores non-zero,
    # a passing mandate check, and a debate where composite ≥ 65 or spread ≥ 20.
    # Downgrade qualifying entries to skip and log the reason clearly.
    _sc_map_gate = {sc["ticker"]: sc for sc in scorecards}
    _gated_decisions = []
    for _d in decisions:
        _t = _d.get("ticker", "")
        _a = _d.get("action", "skip")
        if _a not in ("enter_long", "enter_short"):
            _gated_decisions.append(_d)
            continue
        _sc_g = _sc_map_gate.get(_t)
        if _sc_g is None:
            reason_g = (
                "BLOCKED_NO_SCORECARD: ticker not in pipeline scorecards — "
                "fundamental + quant + sentiment analysis required before entry"
            )
            logger.error("Committee gate: %s %s → skip | %s", _t, _a, reason_g)
            _gated_decisions.append({"ticker": _t, "action": "skip", "skip_reason": reason_g})
            continue
        _fs_g = _sc_g.get("fundamental_score") or 0
        _qs_g = _sc_g.get("quant_score") or 0
        _ss_g = _sc_g.get("sentiment_score") or 0
        if _fs_g == 0 or _qs_g == 0 or _ss_g == 0:
            reason_g = (
                f"BLOCKED_INCOMPLETE_ANALYSIS: F={_fs_g} Q={_qs_g} S={_ss_g} — "
                "all three agent scores must be non-zero before entry"
            )
            logger.error("Committee gate: %s %s → skip | %s", _t, _a, reason_g)
            _gated_decisions.append({"ticker": _t, "action": "skip", "skip_reason": reason_g})
            continue
        if _sc_g.get("mandate_pass") is False:
            _fail_g = _sc_g.get("mandate_fail_reasons") or []
            reason_g = (
                "BLOCKED_MANDATE_FAIL: "
                + ("; ".join(_fail_g) if _fail_g else "fund mandate check failed")
            )
            logger.error("Committee gate: %s %s → skip | %s", _t, _a, reason_g)
            _gated_decisions.append({"ticker": _t, "action": "skip", "skip_reason": reason_g})
            continue
        _comp_g = _sc_g.get("composite_score", 0)
        _sprd_g = _sc_g.get("agent_spread", 0)
        _deb_g  = _sc_g.get("was_debated", False)
        if (_comp_g >= 65 or _sprd_g >= 20) and not _deb_g:
            reason_g = (
                f"BLOCKED_DEBATE_REQUIRED: composite={_comp_g} spread={_sprd_g} "
                "but was_debated=False — debate must be completed before entry"
            )
            logger.error("Committee gate: %s %s → skip | %s", _t, _a, reason_g)
            _gated_decisions.append({"ticker": _t, "action": "skip", "skip_reason": reason_g})
            continue
        _gated_decisions.append(_d)
    decisions = _gated_decisions
    # ── End committee entry gate ───────────────────────────────────────────────

    # Store all decisions in memory
    for d in decisions:
        ticker = d.get("ticker", "")
        action = d.get("action", "skip")
        if action == "skip":
            continue
        # Find scorecard for agent_scores
        sc = next((s for s in scorecards if s["ticker"] == ticker), {})
        memory.store_decision(
            date=today,
            ticker=ticker,
            action=action,
            rationale=d.get("investment_thesis", ""),
            conviction=d.get("conviction", 50),
            signals=sc.get("candidate_signals", []),
            agent_scores={
                "fundamental": sc.get("fundamental_score"),
                "quant": sc.get("quant_score"),
                "sentiment": sc.get("sentiment_score"),
            },
            size_pct=d.get("size_pct"),
            stop_loss=d.get("stop_loss"),
            key_catalysts=d.get("key_catalysts", []),
            key_risks=d.get("key_risks", []),
            macro_regime=macro_regime,
            agent_summaries={
                "fundamental_summary": sc.get("fundamental_summary", ""),
                "quant_summary": sc.get("quant_summary", ""),
                "sentiment_summary": sc.get("sentiment_summary", ""),
            },
        )

    # Enrich positions_log with institutional framework for all enter decisions
    fund_map_by_ticker = {a["ticker"]: a for a in fundamental.get("fundamental_analyses", [])}
    for d in decisions:
        ticker_d = d.get("ticker", "")
        action_d = d.get("action", "skip")
        if action_d not in ("enter_long", "enter_short"):
            continue
        fund_data = fund_map_by_ticker.get(ticker_d, {})
        framework_fields: dict = {}
        for key in (
            "fund_mandate", "company_info", "financial_snapshot", "comparables",
            "market_analysis", "quality_of_earnings", "management_team",
            "analyst_rating_history", "cap_table", "setup_checklist",
            "valuation", "market_timing", "investment_thesis_bullets", "recommendation",
        ):
            if key in fund_data:
                framework_fields[key] = fund_data[key]
        # Convenience top-level fields for the dashboard
        if fund_data.get("fund_mandate"):
            framework_fields["setup_type"] = fund_data["fund_mandate"].get("setup_type")
        if fund_data.get("valuation"):
            framework_fields["expected_roi"] = fund_data["valuation"].get("expected_roi_12m") or fund_data["valuation"].get("expected_roi_2_3yr")
        sc = next((s for s in scorecards if s["ticker"] == ticker_d), {})
        framework_fields["agent_scores_detail"] = {
            "fundamental": sc.get("fundamental_score"),
            "quant": sc.get("quant_score"),
            "sentiment": sc.get("sentiment_score"),
            "fundamental_summary": sc.get("fundamental_summary", ""),
            "quant_summary": sc.get("quant_summary", ""),
            "sentiment_summary": sc.get("sentiment_summary", ""),
        }
        framework_fields["key_catalysts"] = d.get("key_catalysts", [])
        framework_fields["key_risks_committee"] = d.get("key_risks", [])
        if sc.get("agent_debate"):
            framework_fields["agent_debate"] = sc["agent_debate"]
        if framework_fields:
            memory.enrich_position_framework(ticker_d, framework_fields)

    # ── Post-decision: stamp committee conviction onto pre-generated adhoc reports ──
    # The full research synthesis was already generated before deliberation.
    # Here we just overwrite the conviction field so the position page shows the
    # committee's operative number rather than the research analyst's independent view.
    # For tickers that didn't get a pre-deliberation report (beyond top-10 cap),
    # generate the report now using the same pipeline data.
    entered_tickers = [d["ticker"] for d in decisions if d.get("action") in ("enter_long", "enter_short")]
    if entered_tickers:
        try:
            import sys as _sys
            from pathlib import Path as _Path
            _scripts_dir = str(_Path(__file__).resolve().parent.parent / "scripts")
            if _scripts_dir not in _sys.path:
                _sys.path.insert(0, _scripts_dir)
            from adhoc_report import generate_from_pipeline_data as _gen_research
            _adhoc_dir = _Path(__file__).resolve().parent.parent / "data" / "adhoc_reports"
            _date_str_out = datetime.utcnow().date().isoformat()
            news_path = REPORTS_DIR / "news_report.json"
            news_report: dict = {}
            if news_path.exists():
                with open(news_path) as _nf:
                    news_report = json.load(_nf)
            _decision_map = {d["ticker"]: d for d in decisions if d.get("action") in ("enter_long", "enter_short")}
            for _ticker_e in entered_tickers:
                _d = _decision_map.get(_ticker_e, {})
                _direction = "LONG" if _d.get("action") == "enter_long" else "SHORT"
                _conv = _d.get("conviction")

                if _ticker_e in adhoc_by_ticker:
                    # Report already exists — stamp committee conviction and re-save
                    _report = adhoc_by_ticker[_ticker_e]
                    if _report.get("s7_recommendation") is None:
                        _report["s7_recommendation"] = {}
                    _report["s7_recommendation"]["conviction"] = _conv
                    _report["s7_recommendation"]["direction"] = _direction
                    _report["s7_recommendation"]["committee_rationale"] = _d.get("investment_thesis", "")
                    if _d.get("key_risks") and not _report["s7_recommendation"].get("key_risks"):
                        _report["s7_recommendation"]["key_risks"] = _d["key_risks"]
                    _report["conviction"] = _conv
                    _report["direction"] = _direction
                    _out_path = _adhoc_dir / f"{_ticker_e}_{_date_str_out}.json"
                    with open(_out_path, "w") as _f:
                        json.dump(_report, _f, indent=2)
                    logger.info("Stamped committee conviction %s onto pre-generated adhoc report for %s", _conv, _ticker_e)
                else:
                    # No pre-deliberation report exists — generate now with committee conviction
                    try:
                        _gen_research(
                            _ticker_e, fundamental, quant, sentiment, macro, news_report,
                            committee_conviction=_conv,
                            committee_direction=_direction,
                            committee_decision=_d,
                        )
                        logger.info("Post-decision research report generated for %s (conviction=%s)", _ticker_e, _conv)
                    except Exception as _exc:
                        logger.warning("Post-decision research report failed for %s: %s", _ticker_e, _exc)
        except Exception as _import_exc:
            logger.warning("Could not process adhoc research reports: %s", _import_exc)

    # Portfolio allocation summary (exclude skips and non-sizing decisions)
    sizing_decisions = [d for d in decisions if d.get("action") not in ("skip", "hold") and d.get("size_pct")]
    total_allocated = sum(d["size_pct"] for d in sizing_decisions)
    allocation = {d["ticker"]: d["size_pct"] for d in sizing_decisions}
    allocation["cash_reserve"] = round(max(0, 100 - total_allocated), 1)

    # Committee narrative
    narrative = _committee_narrative_llm(decisions, macro_regime)

    output = {
        "position_decisions": decisions,
        "total_decisions": len(decisions),
        "actions_taken": {
            "enter": sum(1 for d in decisions if d.get("action", "").startswith("enter")),
            "hold": sum(1 for d in decisions if d.get("action") == "hold"),
            "increase": sum(1 for d in decisions if d.get("action") == "increase"),
            "decrease": sum(1 for d in decisions if d.get("action") == "decrease"),
            "exit": sum(1 for d in decisions if d.get("action") == "exit"),
            "skip": sum(1 for d in decisions if d.get("action") == "skip"),
        },
        "portfolio_allocation": allocation,
        "committee_narrative": narrative,
        "macro_regime": macro_regime,
        "weights_used": weights,
        "candidates_evaluated": len(scorecards),
        "candidates_debated": len(to_debate),
        "scorecards": scorecards,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    logger.info("Saved committee report to %s", OUT_PATH)
    logger.info("=== Investment Committee complete: %d decisions (%d enter, %d exit, %d hold) ===",
                len(decisions),
                output["actions_taken"]["enter"],
                output["actions_taken"]["exit"],
                output["actions_taken"]["hold"])
    return output


if __name__ == "__main__":
    result = run()
    print(f"\nCommittee complete — {result['total_decisions']} decisions")
    print(f"Narrative: {result['committee_narrative']}")
    print(f"\nAllocation: {result['portfolio_allocation']}")
    print(f"\nDecisions:")
    for d in result["position_decisions"]:
        if d.get("action") != "skip":
            sl = f"SL: ${d.get('stop_loss', 'none')}" if d.get("stop_loss") else "no SL"
            print(f"  {d['ticker']:6s}  {d['action']:12s}  conviction={d.get('conviction','?')}  "
                  f"size={d.get('size_pct','?')}%  {sl}")
            print(f"    {d.get('investment_thesis','')[:100]}")
