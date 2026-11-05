"""
Market Backdrop — what the market is actually trading on right now.

Runs at the start of each pipeline. Claude searches the live web to find the
handful of stories moving markets (elections, wars, Fed, big earnings, policy —
whatever they happen to be; nothing is hardcoded), and explains each in terms of
OUR holdings: which positions are exposed, which way, and what comes next.

Feeds the committee, portfolio construction, the daily briefing and the chat.
Falls back to Finnhub's general-news headlines + the regular LLM client when the
Anthropic web-search call isn't available, so a run never goes without it.
"""

import json
import os
from datetime import datetime
from pathlib import Path

from utils.logger import get_logger

logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "reports" / "market_backdrop.json"
POSITIONS_LOG_PATH = ROOT / "data" / "memory" / "positions_log.json"

SEARCH_MODEL = "claude-sonnet-5-5"


def _holdings_summary() -> list[dict]:
    try:
        with open(POSITIONS_LOG_PATH) as f:
            log = json.load(f)
    except Exception:
        return []
    out = []
    for t, p in log.items():
        if p.get("pending_confirmation"):
            continue
        out.append({
            "ticker": t,
            "sector": ((p.get("fund_mandate") or {}).get("sector")),
            "weight_pct": p.get("size_pct"),
            "direction": p.get("direction") or "LONG",
        })
    return sorted(out, key=lambda h: -(h.get("weight_pct") or 0))


def _prompt(today: str, holdings: list[dict], headlines: list[str] | None = None) -> str:
    source = (
        "Search the web for what has actually been moving US and global markets over the last few days."
        if headlines is None else
        "Use ONLY these recent market headlines (you cannot browse):\n" + "\n".join(f"- {h}" for h in headlines)
    )
    return f"""Today is {today}. You brief the portfolio manager of a US equity fund on what the market is trading on.

{source}

Find the 3-5 stories that genuinely matter for markets right now — whatever they are (elections and
politics, wars and geopolitics, central banks, inflation/jobs data, policy, mega-cap earnings, commodity
shocks, sector moves). Rank by market impact, not by how much coverage they get. Skip trivia.

Our current holdings:
{json.dumps(holdings, indent=0)}

For each story, connect it to OUR book: which holdings are exposed, in which direction, and why. Be
concrete (e.g. "lower oil helps airlines and consumer names; hurts XOM"). If none of our holdings are
exposed, say so. Only state facts you found; if a figure isn't confirmed, leave it out.

Return ONLY JSON:
{{
  "market_mood": "<one plain-English sentence on the overall tone of the market right now>",
  "themes": [
    {{
      "title": "<short, e.g. 'Democrats win the midterms'>",
      "what_happened": "<1-2 sentences, with the key numbers>",
      "why_it_matters": "<1 sentence: why markets care>",
      "our_exposure": [{{"ticker": "<one of our tickers>", "effect": "positive|negative|mixed", "why": "<≤15 words>"}}],
      "next": "<what to watch next and when, or empty>"
    }}
  ]
}}"""


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])


def _with_web_search(today: str, holdings: list[dict]) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model=SEARCH_MODEL,
        max_tokens=4000,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 6}],
        messages=[{"role": "user", "content": _prompt(today, holdings)}],
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    data = _parse_json(text)
    data["source"] = "web_search"
    return data


def _from_headlines(today: str, holdings: list[dict]) -> dict:
    from utils.data_fetcher import fetch_finnhub_market_news
    from utils.llm_client import get_llm_client

    headlines = [
        str(n.get("headline", ""))[:200]
        for n in (fetch_finnhub_market_news("general") or [])[:40]
        if n.get("headline")
    ]
    if not headlines:
        raise RuntimeError("no market headlines available")
    resp = get_llm_client().chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": _prompt(today, holdings, headlines)}],
        max_tokens=2500,
        response_format={"type": "json_object"},
    )
    data = _parse_json(resp.choices[0].message.content or "{}")
    data["source"] = "finnhub_headlines"
    return data


def run() -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    holdings = _holdings_summary()
    data: dict = {}
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            data = _with_web_search(today, holdings)
        except Exception as exc:
            logger.warning("Market backdrop: web search failed (%s) — falling back to headlines", exc)
    if not data.get("themes"):
        data = _from_headlines(today, holdings)

    data["date"] = today
    data["generated_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    data["themes"] = (data.get("themes") or [])[:5]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(data, f, indent=2, allow_nan=False)
    logger.info("Market backdrop (%s): %s", data.get("source"), [t.get("title") for t in data["themes"]])
    return data


def load() -> dict:
    try:
        with open(OUT_PATH) as f:
            data = json.load(f)
        return data if data.get("date") == datetime.utcnow().strftime("%Y-%m-%d") else {}
    except Exception:
        return {}


def format_for_prompt() -> str:
    """Compact text block for committee / construction prompts. Empty if no backdrop today."""
    data = load()
    if not data.get("themes"):
        return ""
    lines = [f"WHAT'S MOVING MARKETS NOW ({data.get('date')}): {data.get('market_mood', '')}"]
    for t in data["themes"]:
        exposure = "; ".join(
            f"{e.get('ticker')} {e.get('effect')} ({e.get('why')})" for e in (t.get("our_exposure") or [])
        )
        lines.append(f"- {t.get('title')}: {t.get('what_happened')} Why it matters: {t.get('why_it_matters')}"
                     + (f" Our exposure: {exposure}." if exposure else ""))
    lines.append("Weigh these when judging each position's outlook — they are what prices are reacting to.")
    return "\n".join(lines)
