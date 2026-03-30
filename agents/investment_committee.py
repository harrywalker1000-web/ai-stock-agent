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
# Scoring
# ---------------------------------------------------------------------------

def _build_scorecard(
    candidates: list[dict],
    fundamental: dict,
    quant: dict,
    sentiment: dict,
    weights: dict,
) -> list[dict]:
    """
    Build a per-ticker scorecard by combining all three Phase 3 agent scores.
    Tickers missing from a Phase 3 report get a neutral 50 for that dimension.
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

        composite = round(
            fs * weights["fundamental"] +
            qs * weights["quant"] +
            ss * weights["sentiment"]
        )

        # Detect cross-agent disagreement (spread >= 25 points)
        scores = [fs, qs, ss]
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

        scorecards.append({
            "ticker": ticker,
            "composite_score": composite,
            "fundamental_score": fs,
            "quant_score": qs,
            "sentiment_score": ss,
            "agent_spread": spread,
            "conflict_flag": conflict_flag,
            "overall_confidence": overall_conf,
            "direction": direction,
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
        })

    scorecards.sort(key=lambda x: x["composite_score"], reverse=True)
    return scorecards


def _adjust_weights(macro_regime: str) -> dict:
    """
    Adjust agent weights based on memory accuracy data if available.
    Falls back to defaults if no accuracy data exists yet.
    """
    # Future: read accuracy per agent per regime from memory_agent
    # For now, apply a simple regime heuristic over defaults
    w = DEFAULT_WEIGHTS.copy()
    if "RISK-OFF" in macro_regime:
        # In risk-off, macro/fundamental signals matter more than momentum quant signals
        w = {"fundamental": 0.40, "quant": 0.30, "sentiment": 0.30}
    return w


# ---------------------------------------------------------------------------
# LLM deliberation
# ---------------------------------------------------------------------------

def _deliberate_with_llm(
    scorecards: list[dict],
    macro_regime: str,
    open_positions: dict,
    mode: str,
) -> list[dict]:
    """
    One LLM call — receives the top qualifying scorecards and produces
    position_decisions[] with action + rationale for each.
    """
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    today = datetime.utcnow().date().isoformat()

    def _f(v):
        return "N/A" if v is None else str(v)

    # Build compact candidate block for the prompt
    candidate_blocks = []
    for sc in scorecards:
        ticker = sc["ticker"]
        hist = memory.get_ticker_history(ticker, days_back=30)
        mem_note = f"Last decision: {hist[0]['action']} ({hist[0]['date']}, conviction {hist[0]['conviction']})" if hist else "No prior history"

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
            f"Dir(majority vote): {sc['direction']}  Conf: {sc['overall_confidence']}\n"
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
            f"  Memory: {mem_note}"
        )
        candidate_blocks.append(block)

    open_pos_str = json.dumps(list(open_positions.keys())) if open_positions else "[]"
    mode_instruction = (
        "This is a PORTFOLIO REVIEW (Phase A). For each ticker, decide: hold, increase, decrease, or exit. "
        "Base decisions on whether the original entry thesis remains intact."
        if mode == "portfolio_review" else
        "This is NEW OPPORTUNITY RESEARCH (Phase B). For each ticker, decide: enter_long, enter_short, or skip."
    )

    prompt = f"""You are the Investment Committee of an AI hedge fund. Today is {today}.
Your mandate is to identify where prices are GOING, not where they have been.

MACRO REGIME: {macro_regime}
CURRENTLY OPEN POSITIONS: {open_pos_str}
MODE: {mode_instruction}

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

COMMITTEE RULES:
- No fixed quota. Decide 0 to many. Never force a trade to meet a number.
- Target 10+ simultaneous total positions when capital allows.
- Soft 20% single-position cap. May exceed ONLY with explicit written justification.
- Stop-losses are OPTIONAL. Set them when: next review is >24h away, around earnings,
  or on speculative positions. When set, they are hard auto-execute triggers.
- Price targets are RE-EVALUATION checkpoints, not automatic sell triggers.
- In Phase B: prefer diversification across sectors when conviction is similar.
- Reject any ticker with retail euphoria warning unless the bear case is exceptional.
- For conflicts (agent spread >= 25): state which agent takes precedence and why.
- Every decision must include a 2-3 sentence rationale that addresses direction AND trade type.

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

Return ONLY valid JSON — an array of position_decisions:
[
  {{
    "ticker": "<ticker>",
    "action": "enter_long" | "enter_short" | "hold" | "increase" | "decrease" | "exit" | "skip",
    "conviction": <integer 0-100>,
    "size_pct": <float — target % of portfolio, or null if skip/hold>,
    "stop_loss": <float price level or null>,
    "target_price": <float or null — checkpoint for re-evaluation, NOT auto-sell>,
    "investment_thesis": "<2-3 sentence rationale>",
    "key_catalysts": ["<catalyst 1>", "<catalyst 2>"],
    "key_risks": ["<risk 1>"],
    "conflict_resolution": "<how you resolved cross-agent disagreements, or 'No conflict'>",
    "skip_reason": "<only if action=skip — why passing on this>"
  }}
]"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )
        raw = json.loads(resp.choices[0].message.content)
        # LLM may return {"position_decisions": [...]} or directly [...]
        if isinstance(raw, list):
            return raw
        return raw.get("position_decisions", raw.get("decisions", []))
    except Exception as exc:
        logger.error("Committee LLM call failed: %s", exc)
        return []


def _committee_narrative_llm(decisions: list[dict], macro_regime: str) -> str:
    """Short single call for the overall portfolio narrative."""
    if not decisions:
        return "No positions initiated today."
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    acting = [d for d in decisions if d.get("action") not in ("skip",)]
    tickers_str = ", ".join(f"{d['ticker']} ({d['action']})" for d in acting[:8])
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": (
                f"Write 2-3 sentences summarising today's Investment Committee decisions for an AI hedge fund. "
                f"Macro regime: {macro_regime}. "
                f"Actions taken: {tickers_str or 'none'}. "
                f"Be concise, confident, and analytical."
            )}],
            temperature=0.3, max_tokens=200,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return f"Committee deliberation complete. Actions: {tickers_str or 'none'}."


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------

def run(mode: str = "new_opportunities", held_tickers: list[str] | None = None) -> dict:
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

    # Build scorecards
    scorecards = _build_scorecard(candidates, fundamental, quant, sentiment, weights)

    # Pre-filter: only debate qualifying candidates
    qualifying = [sc for sc in scorecards if sc["composite_score"] >= DELIBERATION_THRESHOLD]
    to_debate = qualifying[:MAX_CANDIDATES_TO_DEBATE]

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

    # LLM deliberation
    logger.info("Sending %d candidates to Committee deliberation...", len(to_debate))
    decisions = _deliberate_with_llm(to_debate, macro_regime, open_positions, mode)
    logger.info("Committee produced %d decisions", len(decisions))

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
            framework_fields["expected_roi"] = fund_data["valuation"].get("expected_roi_2_3yr")
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
        if framework_fields:
            memory.enrich_position_framework(ticker_d, framework_fields)

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
