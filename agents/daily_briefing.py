"""
Daily Briefing — the human-readable summary at the top of each daily report.

Built AFTER execution, from what actually happened (Alpaca fills and account
history), never from the committee's pre-trade intentions. Every number comes
from Alpaca or yfinance; the LLM only writes short plain-English explanations
grounded in data passed to it (news catalysts, sector moves, trade rationale).

Sections:
  headline       — 1-2 sentences: how we did, why, and what we changed today
  pnl            — previous trading day's P&L, vs SPY, with the biggest movers
  trades         — what was actually bought/sold today and why
  not_executed   — what the committee wanted but didn't happen, and why
  watch          — what to keep an eye on next
"""

import json
import os
from datetime import datetime
from pathlib import Path

from utils.logger import get_logger

logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
POSITIONS_LOG_PATH = ROOT / "data" / "memory" / "positions_log.json"

SECTOR_ETFS = {
    "Technology": "XLK", "Healthcare": "XLV", "Financial Services": "XLF",
    "Consumer Cyclical": "XLY", "Consumer Defensive": "XLP", "Energy": "XLE",
    "Industrials": "XLI", "Communication Services": "XLC", "Basic Materials": "XLB",
    "Real Estate": "XLRE", "Utilities": "XLU",
}

TRADE_VERBS = {
    "enter_long": "Bought", "enter_short": "Shorted", "increase": "Added to",
    "decrease": "Trimmed", "exit": "Sold", "reverse": "Reversed",
}

# Skip reasons that are internal plumbing, not "the committee wanted this and didn't get it"
_INTERNAL_SKIP_REASONS = ("deferred_to_phase_b_construction", "no size_pct", "reserved word")


def _load_json(path: Path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


# ---------------------------------------------------------------------------
# P&L — previous complete trading day, from Alpaca account history
# ---------------------------------------------------------------------------

def compute_daily_pnl() -> dict | None:
    """
    P&L for the last complete trading day: close[T-1] minus close[T-2].

    Uses a 1-month window — Alpaca's "5D" period only returns ~2 daily points, so
    once today's partial bar is dropped there was a single point left and the
    calculation silently fell back to +$0 every day.
    """
    import requests  # type: ignore[import-untyped]

    key = os.environ.get("ALPACA_API_KEY")
    secret = os.environ.get("ALPACA_SECRET_KEY")
    base = os.environ.get("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
    if not key or not secret:
        return None
    resp = requests.get(
        f"{base}/v2/account/portfolio/history",
        params={"period": "1M", "timeframe": "1D"},
        headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret},
        timeout=10,
    )
    resp.raise_for_status()
    hist = resp.json()
    # Alpaca stamps each daily bar at the session close in New York (8pm ET), which
    # is already the NEXT calendar day in UTC — reading the date in UTC labelled every
    # day one day late and made the "drop today's partial bar" filter throw away
    # yesterday's completed close instead. Always read bar dates in New York time.
    from zoneinfo import ZoneInfo
    ny = ZoneInfo("America/New_York")
    today_ny = datetime.now(ny).strftime("%Y-%m-%d")
    days = []
    for t, e in zip(hist.get("timestamp", []), hist.get("equity", [])):
        d = datetime.fromtimestamp(t, ny).strftime("%Y-%m-%d")
        if e and e > 0 and d != today_ny:  # today's bar (if any) is a partial snapshot
            days.append((d, e))
    if len(days) < 2:
        return None
    (prev_date, prev_eq), (last_date, last_eq) = days[-2], days[-1]
    pnl_abs = last_eq - prev_eq
    return {
        "date": last_date,
        "prev_date": prev_date,
        "abs": round(pnl_abs, 2),
        "pct": round(pnl_abs / prev_eq * 100, 2) if prev_eq else 0.0,
        "equity": round(last_eq, 2),
    }


def format_pnl(pnl: dict | None) -> tuple[str, str]:
    if not pnl:
        return "n/a", ""
    sign = "+" if pnl["abs"] >= 0 else "-"
    return f"{sign}${abs(pnl['abs']):,.0f}", f"{'+' if pnl['pct'] >= 0 else ''}{pnl['pct']:.2f}%"


def _closes(tickers: list[str]):
    import yfinance as yf
    data = yf.download(sorted(set(tickers)), period="1mo", interval="1d",
                       auto_adjust=False, progress=False, group_by="column")
    closes = data["Close"] if "Close" in data else data
    if hasattr(closes, "to_frame") and not hasattr(closes, "columns"):
        closes = closes.to_frame(name=tickers[0])
    closes.index = [d.strftime("%Y-%m-%d") for d in closes.index]
    return closes


def _day_move(closes, ticker: str, date: str, prev_date: str) -> tuple[float, float] | None:
    """(price change, % change) for ticker between prev_date and date closes."""
    try:
        c1 = float(closes.loc[date, ticker])
        c0 = float(closes.loc[prev_date, ticker])
    except Exception:
        return None
    if not c0 or c0 != c0 or c1 != c1:  # zero / NaN
        return None
    return c1 - c0, (c1 - c0) / c0 * 100


def compute_movers(pnl: dict, opening_positions: dict, positions_log: dict) -> dict:
    """
    Per-position contribution to the P&L day. Quantities are holdings at the start
    of today's run (= what was held at yesterday's close, before today's trades),
    so positions traded mid-session yesterday are approximate — the remainder is
    reported as "trading & other" rather than hidden.
    """
    tickers = list(opening_positions)
    sectors = {
        t: ((positions_log.get(t) or {}).get("fund_mandate") or {}).get("sector")
        for t in tickers
    }
    for t in [t for t, s in sectors.items() if not s]:
        try:
            import yfinance as yf
            sectors[t] = yf.Ticker(t).info.get("sector")
        except Exception:
            pass
    etfs = {t: SECTOR_ETFS.get(s) for t, s in sectors.items() if SECTOR_ETFS.get(s)}
    closes = _closes(tickers + ["SPY"] + list(set(etfs.values())))

    date, prev_date = pnl["date"], pnl["prev_date"]
    spy = _day_move(closes, "SPY", date, prev_date)
    movers = []
    for t, pos in opening_positions.items():
        move = _day_move(closes, t, date, prev_date)
        if not move:
            continue
        contribution = pos["qty"] * move[0]  # signed qty — shorts gain when price falls
        sector_move = _day_move(closes, etfs[t], date, prev_date) if t in etfs else None
        movers.append({
            "ticker": t,
            "contribution": round(contribution, 2),
            "move_pct": round(move[1], 2),
            "sector": sectors.get(t),
            "sector_etf": etfs.get(t),
            "sector_move_pct": round(sector_move[1], 2) if sector_move else None,
        })
    movers.sort(key=lambda m: -abs(m["contribution"]))
    explained = sum(m["contribution"] for m in movers)
    return {
        "spy_pct": round(spy[1], 2) if spy else None,
        "movers": movers[:4],
        "other": round(pnl["abs"] - explained, 2),
    }


# ---------------------------------------------------------------------------
# Today's trades — from executor fills, not committee intentions
# ---------------------------------------------------------------------------

def collect_trades(executors: list[dict]) -> list[dict]:
    trades = []
    for ex in executors:
        for t in (ex or {}).get("executed_trades", []) or []:
            action = t.get("action", "")
            if not t.get("shares") or action in ("reverse_close", "reverse_open"):
                continue  # record-keeping entries, no shares actually traded
            trades.append({
                "ticker": t.get("ticker"),
                "action": action,
                "verb": TRADE_VERBS.get(action, action.replace("_", " ").title()),
                "shares": t.get("shares"),
                "notional": round(float(t.get("notional") or (t.get("shares") or 0) * (t.get("price") or 0)), 2),
                "conviction": t.get("conviction"),
                "rationale": (t.get("rationale") or "")[:400],
            })
    return trades


def _plain_reason(reason: str) -> str:
    r = reason.lower()
    if "insufficient_capital" in r or "capital exhausted" in r or "insufficient cash" in r or "not allocated capital" in r:
        return "Not enough spare cash once stronger ideas were funded."
    if "market closed" in r or "market_closed" in r:
        return "Market was closed — will be re-checked at the next open."
    if r.startswith("blocked_unanalysed"):
        return "Needs a full analysis before we can add to it."
    if r.startswith("blocked_mandate_fail"):
        return "Failed our investment rules (e.g. size, liquidity or sanctions checks)."
    if r.startswith("blocked_"):
        return "Analysis incomplete, so it was held back."
    if "direction conflict" in r:
        return "Conflicted with an existing position in the opposite direction."
    return reason[:160]


def collect_not_executed(executors: list[dict], committee_report: dict) -> list[dict]:
    out, seen = [], set()
    for d in committee_report.get("position_decisions", []) or []:
        reason = d.get("skip_reason") or ""
        if d.get("action") == "skip" and reason.startswith("Portfolio construction") and d.get("ticker"):
            out.append({"ticker": d["ticker"], "reason": _plain_reason(reason), "conviction": d.get("conviction")})
            seen.add(d["ticker"])
    for ex in executors:
        for s in (ex or {}).get("skipped", []) or []:
            t, reason = s.get("ticker"), s.get("reason") or ""
            if not t or t in seen or any(r in reason for r in _INTERNAL_SKIP_REASONS):
                continue
            if not reason or reason.startswith("Portfolio construction"):
                continue
            out.append({"ticker": t, "reason": _plain_reason(reason), "conviction": None})
            seen.add(t)
    return out[:6]


# ---------------------------------------------------------------------------
# LLM writing — explanations only, grounded in the data given
# ---------------------------------------------------------------------------

def _catalysts_by_ticker() -> dict[str, list[str]]:
    news = _load_json(REPORTS_DIR / "news_report.json", {})
    out: dict[str, list[str]] = {}
    for c in (news.get("fresh_catalysts") or []) + (news.get("stale_catalysts") or []):
        if c.get("ticker"):
            out.setdefault(c["ticker"], []).append(str(c.get("catalyst", ""))[:160])
    return out


def _write_with_llm(facts: dict) -> dict:
    from utils.llm_client import get_llm_client

    today = datetime.utcnow().strftime("%Y-%m-%d")
    prompt = f"""Today is {today}. You write the top of a daily report for the owner of a small AI-run stock portfolio.
They read it in 20 seconds and want to know: how did we do, why, what did we change, what's next.

Rules:
- Plain English, like a sharp friend explaining it. No jargon ("conviction score", "mean reversion",
  "composite", "risk-off regime"). Short sentences.
- Use ONLY the numbers in the data below. Never invent a number, a reason, or news.
- For "why" a stock moved: cite the news given for it if there is any; otherwise say whether it simply
  moved with its sector or the market (compare move_pct to sector_move_pct and spy_pct). If neither
  explains it, say the move wasn't tied to clear news. Do not speculate beyond that.
- Only use news listed under that same ticker; never borrow another company's news. A market theme
  (market_themes) may explain a move if the theme clearly names that stock or its sector.
- In the headline, if a market theme clearly drove the day, name it in plain words (e.g. "after the
  midterm results", "as oil fell"); don't force it if it didn't.
- If a stock's move is within ~0.5 percentage points of its sector's move, say it moved with its sector.
- Round dollar amounts to whole dollars.
- For trades: say in ≤15 words why we did it, based on the rationale given.
- "watch": only items still in the future relative to today; skip anything dated in the past.

DATA:
{json.dumps(facts, indent=1, default=str)}

Return ONLY JSON:
{{
  "headline": "<2 sentences max. First: the $ and % result, how it compared with the S&P 500, and the 1-2 names that drove it. Second: what we changed today and the one-line reason why (or that we made no trades).>",
  "pnl_why": "<1 sentence on what drove the day overall, e.g. broad market vs a few names>",
  "mover_why": {{"TICKER": "<≤15 words>", ...}},
  "trade_why": {{"TICKER": "<≤15 words>", ...}},
  "watch": ["<≤20 words, only from the upcoming items given; empty list if none>"]
}}"""
    resp = get_llm_client().chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1600,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content or "{}")


def _fallback_headline(pnl: dict | None, movers: list[dict], trades: list[dict]) -> str:
    parts = []
    if pnl:
        pnl_str, pct_str = format_pnl(pnl)
        lead = f"{'Up' if pnl['abs'] >= 0 else 'Down'} {pnl_str.lstrip('+-')} ({pct_str}) on {pnl['date']}"
        if movers:
            top = movers[0]
            lead += f", mostly {top['ticker']} ({top['move_pct']:+.1f}%)"
        parts.append(lead + ".")
    if trades:
        parts.append("Today: " + ", ".join(f"{t['verb'].lower()} {t['ticker']}" for t in trades[:5]) + ".")
    else:
        parts.append("No trades today.")
    return " ".join(parts)


def build_briefing(pnl: dict | None, opening_positions: dict, executors: list[dict]) -> dict:
    positions_log = _load_json(POSITIONS_LOG_PATH, {})
    committee_report = _load_json(REPORTS_DIR / "committee_report.json", {})

    pnl_block = None
    if pnl:
        pnl_block = dict(pnl)
        try:
            pnl_block.update(compute_movers(pnl, opening_positions, positions_log))
        except Exception as exc:
            logger.warning("Daily briefing: movers calculation failed: %s", exc)

    trades = collect_trades(executors)
    not_executed = collect_not_executed(executors, committee_report)

    catalysts = _catalysts_by_ticker()
    try:
        from agents.market_backdrop import load as load_backdrop
        backdrop = load_backdrop()
    except Exception:
        backdrop = {}
    held_now = [t for t, p in positions_log.items() if not p.get("pending_confirmation")]
    upcoming = []
    for t in held_now:
        for c in ((positions_log.get(t) or {}).get("setup_checklist") or {}).get("upcoming_catalysts") or []:
            upcoming.append(f"{t}: {str(c)[:140]}")

    movers = (pnl_block or {}).get("movers", [])
    facts = {
        "pnl": {k: (pnl_block or {}).get(k) for k in ("date", "abs", "pct", "spy_pct", "other")},
        "movers": [{**m, "news": catalysts.get(m["ticker"], [])[:2]} for m in movers],
        "trades_today": [{k: t[k] for k in ("ticker", "verb", "notional", "rationale")} for t in trades],
        "wanted_but_not_done": not_executed,
        "upcoming_for_holdings": upcoming[:12],
        "market_themes": [
            {k: t.get(k) for k in ("title", "what_happened", "our_exposure")}
            for t in backdrop.get("themes", [])
        ],
    }

    written: dict = {}
    try:
        written = _write_with_llm(facts)
    except Exception as exc:
        logger.warning("Daily briefing: LLM write-up failed (%s) — using plain fallback text", exc)

    mover_why = written.get("mover_why") or {}
    trade_why = written.get("trade_why") or {}
    for m in movers:
        m["why"] = mover_why.get(m["ticker"])
    for t in trades:
        t["why"] = trade_why.get(t["ticker"])
        t.pop("rationale", None)

    if pnl_block is not None:
        pnl_block["why"] = written.get("pnl_why")

    return {
        "headline": written.get("headline") or _fallback_headline(pnl, movers, trades),
        "pnl": pnl_block,
        "trades": trades,
        "not_executed": not_executed,
        "watch": [str(w) for w in (written.get("watch") or [])][:3],
        "market": {
            "mood": backdrop.get("market_mood"),
            "themes": backdrop.get("themes", []),
        } if backdrop.get("themes") else None,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
