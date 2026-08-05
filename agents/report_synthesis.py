"""
report_synthesis.py — deep-dive research report for positions that actually
receive capital.

Reuses the manual deep-dive pipeline (agents/research/*.py) for the parts
that need fresh external research (competitive moat, ESG, management, M&A,
growth drivers — nothing the six core trading agents gather), but grounds
every relevant section in what the six agents actually concluded that run,
threads in current portfolio holdings, and replaces the old independent
Sonnet-derived recommendation with the REAL committee decision that placed
the trade — so the report and the trade can never disagree with each other.

Only called for tickers confirmed as newly-entered positions (see
portfolio_manager.py::run_phase_b, after trade_executor confirms fills).
Tavily's free tier (1,000 searches/month, ~12-13 per report) can't sustain
this depth for every debated candidate — only for the handful/day that
actually get real capital. The cheap pre-deliberation synthesis
(scripts/adhoc_report.py::generate_from_pipeline_data) still runs for every
debated candidate exactly as before, unaffected by this module.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.research.data_fetcher import fetch_all_data
from agents.research.pipeline_assembler import assemble_structured_sections, build_final_report
from agents.research.pipeline_synthesis import run_haiku_synthesis, merge_ai_into_sections
from agents.research.synthesis_agents import clear_api_errors, get_api_errors
from agents.investment_committee import build_portfolio_context
import agents.memory_agent as memory
from utils.logger import get_logger

logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
OUTPUT_DIRS = [ROOT / "data" / "adhoc_reports", ROOT / "dashboard" / "data" / "adhoc_reports"]


def _load_json(path: Path, default=None):
    if not path.exists():
        return default if default is not None else {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _find_by_ticker(analyses: list, ticker: str) -> dict:
    return next((a for a in analyses if str(a.get("ticker", "")).upper() == ticker), {})


def _build_agent_digest(ticker: str) -> dict:
    """
    Pulls each of the six core agents' already-computed verdict for this
    ticker from that day's saved reports — real data, nothing re-derived.
    """
    fundamental   = _load_json(REPORTS_DIR / "fundamental_report.json")
    quant         = _load_json(REPORTS_DIR / "quant_report.json")
    sentiment     = _load_json(REPORTS_DIR / "sentiment_report.json")
    macro         = _load_json(REPORTS_DIR / "macro_report.json")
    institutional = _load_json(REPORTS_DIR / "institutional_report.json")
    news          = _load_json(REPORTS_DIR / "news_report.json")

    f = _find_by_ticker(fundamental.get("fundamental_analyses", []), ticker)
    q = _find_by_ticker(quant.get("quant_analyses", []), ticker)
    s = _find_by_ticker(sentiment.get("sentiment_analyses", []), ticker)

    convergence = [c for c in (institutional.get("convergence_signals") or [])
                   if str(c.get("ticker", "")).upper() == ticker]
    fund_theses = [t for t in (institutional.get("fund_theses") or [])
                   if str(t.get("ticker", "")).upper() == ticker]

    all_catalysts = (news.get("fresh_catalysts") or []) + (news.get("stale_catalysts") or [])
    catalysts = [c for c in all_catalysts if str(c.get("ticker", "")).upper() == ticker]

    return {
        "fundamental": {
            "score": f.get("fundamental_score"), "direction": f.get("direction"),
            "summary": f.get("fundamental_summary", ""), "raw": f,
        },
        "quant": {
            "score": q.get("quant_score"), "direction": q.get("direction"),
            "summary": q.get("quant_summary", ""), "raw": q,
        },
        "sentiment": {
            "score": s.get("sentiment_score"), "direction": s.get("direction"),
            "summary": s.get("sentiment_summary", ""), "raw": s,
        },
        "macro": {"regime": macro.get("regime"), "summary": macro.get("macro_summary", "")},
        "institutional": {"convergence": convergence[:2], "fund_theses": fund_theses[:2]},
        "news": {"catalysts": [c.get("headline") or c.get("catalyst_type", "") for c in catalysts[:5]]},
    }


def _digest_text(digest: dict) -> str:
    """Compact block injected into the relevant synthesis prompts (see
    agents/research/synthesis_agents.py::_agent_context_block)."""
    fd, qd, sd, md = digest["fundamental"], digest["quant"], digest["sentiment"], digest["macro"]
    lines = ["WHAT OUR OWN TRADING AGENTS CONCLUDED TODAY (ground your narrative in this — "
             "do not contradict it without explanation):"]
    if fd.get("score") is not None:
        lines.append(f"- Fundamental Agent: {fd['score']}/100, {fd.get('direction', '?')} — {fd.get('summary', '')}")
    if qd.get("score") is not None:
        lines.append(f"- Quant Agent: {qd['score']}/100, {qd.get('direction', '?')} — {qd.get('summary', '')}")
    if sd.get("score") is not None:
        lines.append(f"- Sentiment Agent: {sd['score']}/100, {sd.get('direction', '?')} — {sd.get('summary', '')}")
    if md.get("regime"):
        lines.append(f"- Macro Agent: regime={md['regime']} — {md.get('summary', '')}")
    inst = digest["institutional"]
    if inst["convergence"] or inst["fund_theses"]:
        lines.append(f"- Institutional Agent: {len(inst['convergence'])} fund-convergence signal(s), "
                      f"{len(inst['fund_theses'])} fund thesis/es on file for this ticker")
    if digest["news"]["catalysts"]:
        lines.append(f"- News Agent flagged: {'; '.join(digest['news']['catalysts'][:3])}")
    return "\n".join(lines)


def _recommendation_from_decision(decision: dict, digest: dict) -> dict:
    """
    Builds s16_recommendation directly from the REAL committee decision that
    placed this trade — no separate AI call, no risk of a second, conflicting
    conviction number (the old system's `_gen_research` + stamp-conviction
    dance existed only because the recommendation used to come from an
    independent AI call; that problem doesn't exist if we just present the
    real decision).
    """
    action = decision.get("action", "")
    direction = "BUY" if action == "enter_long" else "SELL" if action == "enter_short" else "HOLD"

    catalysts = decision.get("key_catalysts") or []
    three_arguments = [
        {
            "title": (c if isinstance(c, str) else str(c))[:40],
            "data_point": "Committee deliberation",
            "reasoning": c if isinstance(c, str) else str(c),
        }
        for c in catalysts[:3]
    ]
    thesis = decision.get("investment_thesis", "")
    while len(three_arguments) < 3:
        three_arguments.append({
            "title": "See committee narrative",
            "data_point": "Committee deliberation",
            "reasoning": thesis[:200],
        })

    fundamental_raw = digest["fundamental"].get("raw") or {}
    valuation = fundamental_raw.get("valuation") or {}
    expected_return = (
        valuation.get("expected_roi_12m") or fundamental_raw.get("expected_roi_12m")
        or valuation.get("expected_roi_2_3yr") or fundamental_raw.get("expected_roi_2_3yr")
    )

    return {
        "direction": direction,
        "conviction": decision.get("conviction"),
        "expected_return_12m": expected_return,
        "position_size_pct": decision.get("size_pct"),
        "stop_loss_pct": None,
        "three_arguments": three_arguments,
        "key_risks": decision.get("key_risks") or [],
        "committee_narrative": thesis,
        "conviction_source": (
            "Real Investment Committee decision — this is the actual decision that "
            "placed the trade, not a separately re-derived score."
        ),
    }


def generate_entered_position_report(ticker: str, decision: dict) -> dict | None:
    """
    Generate and save the agent-attributed deep-dive report for a ticker that
    was just confirmed as a newly-entered position. Returns the report dict,
    or None on failure (caller wraps this in _safe_run, so a failure here
    never blocks a trade that already executed).
    """
    ticker = ticker.upper().strip()
    logger.info("[%s] Generating agent-attributed deep-dive report (entered position)", ticker)
    clear_api_errors()

    try:
        digest = _build_agent_digest(ticker)
        digest_text = _digest_text(digest)

        open_positions = memory.get_open_positions()
        portfolio_context = build_portfolio_context(open_positions)

        data = fetch_all_data(ticker)
        data["_agent_digest"] = digest_text
        data["_portfolio_context"] = portfolio_context

        assembled = assemble_structured_sections(data)
        ai_results = run_haiku_synthesis(data, assembled)
        merged = merge_ai_into_sections(assembled, ai_results)

        s16 = _recommendation_from_decision(decision, digest)

        data["_api_errors"] = get_api_errors()
        if data["_api_errors"]:
            logger.warning("[%s] LLM API errors during report synthesis: %s", ticker, data["_api_errors"])

        report = build_final_report(
            ticker=ticker, data=data, assembled=assembled,
            s2=merged["s2"], s3=merged["s3"], s4b=merged["s4b"], s7=merged["s7"],
            s8=merged["s8"], s9=merged["s9"], s10b=merged["s10b"], s11=merged["s11"],
            s13=merged["s13"], s14=merged["s14"], s16=s16,
            s_esg=merged["s_esg"], s_ma=merged["s_ma"], s_porter=merged["s_porter"], s_c=merged["s_c"],
            brand_colors=merged.get("brand_colors", {}),
        )
        report["source"] = "pipeline_auto"
        report["agent_digest"] = digest
    except Exception as exc:
        logger.error("[%s] Agent-attributed report generation failed: %s", ticker, exc)
        return None

    date_str = datetime.utcnow().date().isoformat()
    for out_dir in OUTPUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{ticker}_{date_str}.json"
        try:
            with open(path, "w") as f:
                json.dump(report, f, indent=2, default=str)
            logger.info("[%s] Agent-attributed report written to %s", ticker, path)
        except Exception as exc:
            logger.error("[%s] Failed to write report to %s: %s", ticker, path, exc)

    return report
