"""
Post-mortem Engine — qualitative trade analysis after every exit.

Two responsibilities:

  5b — generate_postmortem(): called on trade close.
       Reads the full entry thesis, agent reasoning, and exit outcome.
       Makes a single LLM call to produce a structured qualitative analysis:
         - Did the thesis play out?
         - What did agents get right / wrong?
         - Key learnings for future trades.
       Writes to data/memory/postmortems/{exit_date}_{ticker}.json.

  5c — get_learning_brief_for_prompt(): called each pipeline run.
       Aggregates recent post-mortems into a compact multi-line learning block
       for injection into the Investment Committee and Fundamental Analyst prompts.
       Caches in data/memory/learning_brief.json (refreshed when new postmortems appear).

Called by: memory_agent.store_trade_exit() → postmortem_engine.generate_postmortem()
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from utils.llm_client import get_llm_client

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = ROOT / "data" / "memory"
POSTMORTEM_DIR = MEMORY_DIR / "postmortems"
LEARNING_BRIEF_PATH = MEMORY_DIR / "learning_brief.json"

POSTMORTEM_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_json(path: Path, default=None):
    if not path.exists():
        return default if default is not None else {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _openai_client():
    return get_llm_client()


# ---------------------------------------------------------------------------
# 5b — Post-mortem generation
# ---------------------------------------------------------------------------

def generate_postmortem(
    ticker: str,
    entry_date: str,
    exit_date: str,
    direction: str,
    pnl_pct: float,
    entry_thesis: str,
    key_catalysts: list[str],
    key_risks: list[str],
    agent_scores: dict,
    agent_summaries: dict,
    macro_regime_at_entry: str | None,
    exit_reason: str,
    alpha_vs_spy: float | None,
    sector: str | None,
) -> dict:
    """
    Generate a structured post-mortem for a closed trade via LLM.
    Writes the result to data/memory/postmortems/{exit_date}_{ticker}.json.
    Returns the post-mortem dict.
    """
    outcome_label = "PROFITABLE" if pnl_pct >= 0 else "LOSS"
    alpha_str = f"{alpha_vs_spy:+.1f}% vs SPY" if alpha_vs_spy is not None else "SPY comparison unavailable"

    # Format agent context for prompt
    agent_ctx_parts = []
    for agent in ("fundamental", "quant", "sentiment"):
        score = agent_scores.get(agent)
        summary = agent_summaries.get(f"{agent}_summary", "")
        if score is not None:
            agent_ctx_parts.append(f"  {agent.capitalize()} ({score}/100): {summary[:150] if summary else 'No summary'}")
    agent_ctx = "\n".join(agent_ctx_parts) or "  No agent score data available"

    catalysts_str = "\n".join(f"  - {c}" for c in key_catalysts) if key_catalysts else "  None recorded"
    risks_str = "\n".join(f"  - r" for r in key_risks) if key_risks else "  None recorded"

    prompt = f"""You are the post-trade review analyst for an AI hedge fund.
Analyse the following closed trade and produce a structured post-mortem.
Be concise, specific, and honest. Focus on what the model can learn.

TRADE SUMMARY
  Ticker:       {ticker} ({sector or 'Unknown sector'})
  Direction:    {direction}
  Entry date:   {entry_date}  |  Exit date: {exit_date}
  Result:       {outcome_label} — P&L {pnl_pct:+.1f}% | Alpha {alpha_str}
  Exit reason:  {exit_reason}
  Macro at entry: {macro_regime_at_entry or 'Unknown'}

ENTRY THESIS (written at time of entry):
  {entry_thesis or 'No thesis recorded'}

KEY CATALYSTS CITED:
{catalysts_str}

KEY RISKS NOTED:
{risks_str}

AGENT SCORES AND SUMMARIES AT ENTRY:
{agent_ctx}

Write a JSON post-mortem with EXACTLY these fields (keep each to 1-2 sentences max):
{{
  "thesis_verdict": "played_out | partially_played_out | did_not_play_out | too_early_to_tell",
  "what_went_right": "<specific thing that worked, or 'Nothing' if loss>",
  "what_went_wrong": "<specific thing that failed, or 'Nothing' if strong profit>",
  "catalyst_accuracy": "<did the cited catalysts materialise? Which ones?>",
  "agent_assessment": "<which agent was most useful/least useful for this trade?>",
  "macro_fit": "<did the macro regime support or hinder this trade?>",
  "key_learning": "<single most important lesson for the model — actionable and specific>",
  "avoid_repeat": "<specific pattern to avoid in future similar setups, or 'None'>",
  "confidence_in_analysis": "high | medium | low"
}}
Respond with ONLY valid JSON."""

    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=400,
        )
        raw = resp.choices[0].message.content or "{}"
        # Strip markdown fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        analysis = json.loads(raw)
    except Exception as exc:
        analysis = {
            "thesis_verdict": "unknown",
            "what_went_right": "Analysis failed",
            "what_went_wrong": str(exc)[:100],
            "catalyst_accuracy": "unknown",
            "agent_assessment": "unknown",
            "macro_fit": "unknown",
            "key_learning": "Post-mortem LLM call failed — check API key and model availability",
            "avoid_repeat": "None",
            "confidence_in_analysis": "low",
        }

    postmortem = {
        "ticker":                 ticker,
        "entry_date":             entry_date,
        "exit_date":              exit_date,
        "direction":              direction,
        "pnl_pct":                pnl_pct,
        "alpha_vs_spy":           alpha_vs_spy,
        "exit_reason":            exit_reason,
        "sector":                 sector,
        "macro_regime_at_entry":  macro_regime_at_entry,
        "analysis":               analysis,
        "generated_at":           datetime.utcnow().isoformat(),
    }

    fname = POSTMORTEM_DIR / f"{exit_date}_{ticker}.json"
    _save_json(fname, postmortem)

    # Invalidate cached learning brief so it regenerates on next prompt build
    if LEARNING_BRIEF_PATH.exists():
        try:
            brief = _load_json(LEARNING_BRIEF_PATH, default={})
            brief["stale"] = True
            _save_json(LEARNING_BRIEF_PATH, brief)
        except Exception:
            pass

    return postmortem


# ---------------------------------------------------------------------------
# 5c — Learning brief for prompt injection
# ---------------------------------------------------------------------------

def _build_learning_brief(postmortems: list[dict]) -> str:
    """
    Call LLM to distil recent post-mortems into a compact learning brief.
    """
    if not postmortems:
        return ""

    summaries = []
    for pm in postmortems[-10:]:  # Last 10 trades
        a = pm.get("analysis", {})
        summaries.append(
            f"- {pm['ticker']} ({pm['direction']}, {pm['pnl_pct']:+.1f}%): "
            f"Thesis: {a.get('thesis_verdict','?')}. "
            f"Learning: {a.get('key_learning','?')} "
            f"Avoid: {a.get('avoid_repeat','?')}"
        )

    summary_block = "\n".join(summaries)

    prompt = f"""You are synthesising post-mortem learnings for an AI hedge fund committee.
Below are the learnings from the {len(postmortems)} most recent closed trades.
Write a LEARNING BRIEF: 3-5 bullet points that are actionable and specific.
Focus on patterns that repeat, agent reliability, and setup types that work vs fail.
Be critical — the committee reads this before making new decisions.

RECENT POST-MORTEMS:
{summary_block}

Format: Return ONLY bullet points, one per line, starting with "• ".
Max 5 bullets, each under 25 words. No headers. No preamble."""

    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=200,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return ""


def _load_recent_postmortems(days_back: int = 60) -> list[dict]:
    """Load postmortems from the last N days, sorted oldest-first."""
    cutoff = (datetime.utcnow() - timedelta(days=days_back)).date().isoformat()
    results = []
    if not POSTMORTEM_DIR.exists():
        return []
    for f in sorted(POSTMORTEM_DIR.glob("*.json")):
        # filename: {exit_date}_{ticker}.json — date is the first 10 chars
        date_str = f.stem[:10]
        if date_str >= cutoff:
            try:
                results.append(json.loads(f.read_text()))
            except Exception:
                pass
    return results


def get_learning_brief_for_prompt() -> str:
    """
    Return a compact learning brief for Committee / Fundamental Analyst prompt injection.
    Cached in learning_brief.json and regenerated when new postmortems arrive.
    Returns empty string if fewer than 2 post-mortems exist.
    """
    postmortems = _load_recent_postmortems(days_back=60)
    if len(postmortems) < 2:
        return ""

    # Check cache
    cached = _load_json(LEARNING_BRIEF_PATH, default={})
    cached_count = cached.get("trade_count", 0)
    is_stale = cached.get("stale", False)

    if not is_stale and cached_count == len(postmortems) and cached.get("brief"):
        return cached["brief"]

    # Regenerate
    brief = _build_learning_brief(postmortems)
    if brief:
        _save_json(LEARNING_BRIEF_PATH, {
            "trade_count": len(postmortems),
            "generated_at": datetime.utcnow().isoformat(),
            "stale": False,
            "brief": brief,
        })

    return brief


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    postmortems = _load_recent_postmortems(days_back=60)
    print(f"Post-mortems on disk: {len(postmortems)}")
    if postmortems:
        print(f"Most recent: {postmortems[-1]['ticker']} {postmortems[-1]['exit_date']}")
    print("\n--- Learning brief ---")
    brief = get_learning_brief_for_prompt()
    print(brief or "(fewer than 2 post-mortems — no brief yet)")
