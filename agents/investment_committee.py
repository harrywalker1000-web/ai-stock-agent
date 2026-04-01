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
        })

    scorecards.sort(key=lambda x: x["composite_score"], reverse=True)
    return scorecards


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
            f"  Memory: {mem_note}"
        )
        candidate_blocks.append(block)

    open_pos_str = json.dumps(list(open_positions.keys())) if open_positions else "[]"
    n_open = len(open_positions)
    mode_instruction = (
        "This is a PORTFOLIO REVIEW (Phase A). For each ticker, decide: hold, increase, decrease, or exit. "
        "Exit criteria (any one sufficient): thesis has broken, fundamentals have deteriorated materially, "
        "stock has hit its target with no further upside, or a clearly superior opportunity exists and capital "
        "redeployment would meaningfully improve portfolio risk/reward. The bar for the last reason is HIGH — "
        "the new opportunity must be materially more compelling than the current holding, not just marginally better."
        if mode == "portfolio_review" else
        f"This is NEW OPPORTUNITY RESEARCH (Phase B). For each ticker, decide: enter_long, enter_short, or skip. "
        f"Available capital to deploy: ~{available_cash_pct:.0f}% of portfolio. "
        f"Only enter positions that fit within available cash — do not size positions so that their total "
        f"exceeds what is actually deployable."
    )

    prompt = f"""You are the Investment Committee of an AI hedge fund. Today is {today}.
Your mandate is to identify where prices are GOING, not where they have been.

MACRO REGIME: {macro_regime}
CURRENTLY OPEN POSITIONS ({n_open}): {open_pos_str}
AVAILABLE CASH: ~{available_cash_pct:.0f}% of portfolio
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
- No fixed quota. Decide 0 to many. If nothing is convincing, decide nothing — cash is a position.
- Holding cash is the correct decision when no candidate clears the quality bar. Do not force trades.
- When genuinely good opportunities exist, be willing to deploy capital aggressively. When they don't, wait.
- Never size new positions so that their combined notional exceeds available cash.
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

CONVICTION PRECISION RULE (mandatory):
Each ticker shows a CONVICTION_ANCHOR — the weighted composite of the three analyst scores.
Your conviction score MUST start from that anchor and adjust based on your reasoning.
Conviction scores MUST NOT be multiples of 5 (no 50, 55, 60, 65, 70, 75, 80, etc.).
Use precise integers: 47, 53, 61, 68, 73, 77, 82, 88, etc. Round numbers signal lazy scoring.

Return ONLY valid JSON — an array of position_decisions:
[
  {{
    "ticker": "<ticker>",
    "action": "enter_long" | "enter_short" | "hold" | "increase" | "decrease" | "exit" | "skip",
    "conviction": <integer 0-100, MUST NOT be a multiple of 5>,
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

    def _call_llm(prompt_text: str) -> list[dict]:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt_text}],
            temperature=0.2,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )
        raw = json.loads(resp.choices[0].message.content)
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

        # Normalise: if total sizing decisions would exceed 90% of available cash, scale down
        sizing = [d for d in decisions if d.get("action") not in ("skip", "hold") and d.get("size_pct")]
        total_size = sum(float(d["size_pct"]) for d in sizing)
        cap = available_cash_pct * 0.90
        if total_size > cap and total_size > 0:
            scale = cap / total_size
            for d in sizing:
                d["size_pct"] = round(float(d["size_pct"]) * scale, 1)
            logger.info("Position sizes scaled by %.2f to stay within %.0f%% cash cap", scale, cap)

        return decisions
    except Exception as exc:
        logger.error("Committee LLM call failed: %s", exc)
        return []


def _run_debate_round(
    scorecards: list[dict],
    fundamental: dict,
    quant: dict,
    sentiment: dict,
) -> list[dict]:
    """
    For any scorecard where the max agent spread >= 20:
    identify the lowest-scoring agent, show it the highest-scoring agent's reasoning,
    and ask it to defend or revise its score.
    Returns the same scorecards list, each with an added `agent_debate` field when triggered.
    """
    DEBATE_THRESHOLD = 20
    MAX_DEBATES = 5   # cap to limit cost

    fund_map = {a["ticker"]: a for a in fundamental.get("fundamental_analyses", [])}
    quant_map = {a["ticker"]: a for a in quant.get("quant_analyses", [])}
    sent_map = {a["ticker"]: a for a in sentiment.get("sentiment_analyses", [])}

    contested = [sc for sc in scorecards if sc["agent_spread"] >= DEBATE_THRESHOLD][:MAX_DEBATES]
    if not contested:
        return scorecards

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    debate_blocks = []
    for sc in contested:
        ticker = sc["ticker"]
        scores = {
            "Fundamental": (sc["fundamental_score"], fund_map.get(ticker, {}).get("fundamental_summary", "")),
            "Quant": (sc["quant_score"], quant_map.get(ticker, {}).get("quant_summary", "")),
            "Sentiment": (sc["sentiment_score"], sent_map.get(ticker, {}).get("sentiment_summary", "")),
        }
        sorted_agents = sorted(scores.items(), key=lambda x: x[1][0])
        low_agent, (low_score, low_summary) = sorted_agents[0]
        high_agent, (high_score, high_summary) = sorted_agents[-1]

        debate_blocks.append(
            f"TICKER: {ticker}\n"
            f"  HIGH AGENT: {high_agent} scored {high_score}/100 — reasoning: {high_summary[:200]}\n"
            f"  LOW AGENT: {low_agent} scored {low_score}/100 — reasoning: {low_summary[:200]}\n"
            f"  The {low_agent} agent should respond to {high_agent}'s reasoning."
        )

    if not debate_blocks:
        return scorecards

    prompt = f"""You are refereeing an Investment Committee debate.
For each ticker below, one analyst agent scored significantly higher than another.
The lower-scoring agent must now either defend its position (explain why the higher-scoring agent is wrong)
or revise its score upward (admit the higher-scoring agent raised valid points).

For each ticker produce:
- "rebuttal": 2-3 sentence response from the low-scoring agent
- "revised_score": integer (0-100) — updated score for the low-scoring agent (may be unchanged if defending)
- "verdict": "defended" | "revised_up" | "revised_down"

DEBATES:
{'='*60}
{chr(10).join(debate_blocks)}
{'='*60}

Return ONLY valid JSON: {{"debates": [{{"ticker": "X", "low_agent": "...", "high_agent": "...", "rebuttal": "...", "revised_score": 0, "verdict": "..."}}]}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        raw = json.loads(resp.choices[0].message.content)
        debate_results = {d["ticker"]: d for d in raw.get("debates", [])}

        # Merge debate results back into scorecards
        for sc in scorecards:
            ticker = sc["ticker"]
            if ticker in debate_results:
                d = debate_results[ticker]
                sc["agent_debate"] = {
                    "low_agent": d.get("low_agent", ""),
                    "high_agent": d.get("high_agent", ""),
                    "rebuttal": d.get("rebuttal", ""),
                    "original_low_score": d.get("original_low_score", sc.get("composite_score")),
                    "revised_score": d.get("revised_score"),
                    "verdict": d.get("verdict", ""),
                }
                # Update the low agent's score if revised
                revised = d.get("revised_score")
                verdict = d.get("verdict", "")
                low_agent = d.get("low_agent", "")
                if revised is not None and "revised" in verdict:
                    key = f"{low_agent.lower()}_score"
                    if key in sc:
                        sc[key] = revised
                    # Recompute composite with updated score
                    w = DEFAULT_WEIGHTS
                    sc["composite_score"] = round(
                        sc["fundamental_score"] * w["fundamental"] +
                        sc["quant_score"] * w["quant"] +
                        sc["sentiment_score"] * w["sentiment"]
                    )
                logger.info("Debate %s: %s vs %s → %s", ticker, d.get("low_agent"), d.get("high_agent"), verdict)

    except Exception as exc:
        logger.warning("Debate round LLM call failed: %s", exc)

    return scorecards


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

    # Debate round: resolve cross-agent conflicts before main deliberation
    contested_count = sum(1 for sc in scorecards if sc["agent_spread"] >= 20)
    if contested_count > 0:
        logger.info("Running debate round for %d contested tickers (spread >= 20)...", contested_count)
        scorecards = _run_debate_round(scorecards, fundamental, quant, sentiment)

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

    # Fetch available cash % from last portfolio_state (written by Trade Executor)
    available_cash_pct = 100.0
    portfolio_state_path = REPORTS_DIR / "portfolio_state.json"
    if portfolio_state_path.exists():
        try:
            with open(portfolio_state_path) as _psf:
                _ps = json.load(_psf)
            _pv = float(_ps.get("portfolio_value") or _ps.get("equity") or 0)
            _cash = float(_ps.get("cash") or 0)
            if _pv > 0:
                available_cash_pct = round(_cash / _pv * 100, 1)
        except Exception:
            pass
    logger.info("Available cash: %.0f%% of portfolio", available_cash_pct)

    # LLM deliberation
    logger.info("Sending %d candidates to Committee deliberation...", len(to_debate))
    decisions = _deliberate_with_llm(to_debate, macro_regime, open_positions, mode, available_cash_pct)
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
        if sc.get("agent_debate"):
            framework_fields["agent_debate"] = sc["agent_debate"]
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
