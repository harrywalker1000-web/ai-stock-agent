"""
Agent 9 — Memory Agent

Dual role:
  Library:   Module-level functions called by Trade Executor, Portfolio Manager,
             and the Investment Committee to store and retrieve decisions, trade
             entries, exits, and outcomes.
  Daily run: run() consolidates today's pipeline outputs into memory and
             refreshes data/memory/pattern_history.json for the Quant Agent.

Storage:
  Primary:  .swarm/memory.db — SQLite, namespaces prefixed 'stock_agent_*'
            (never touches Claude-Flow's own namespaces)
  Mirror files (human-readable, also read by downstream agents):
    data/memory/pattern_history.json  — signal combo win-rates (Quant Agent reads)
    data/memory/positions_log.json    — open positions + entry thesis (Agents 6-8 read)
    data/memory/decision_log.json     — recent decisions for dashboard

Namespaces used in memory_entries:
  stock_agent_decisions  — Committee's daily decision per ticker
  stock_agent_trades     — open and closed trade records
  stock_agent_outcomes   — completed trade outcomes for pattern learning
  stock_agent_daily      — consolidated daily pipeline analysis records
"""

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

from utils.logger import get_logger

logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
MEMORY_DIR = ROOT / "data" / "memory"
SWARM_DB = ROOT / ".swarm" / "memory.db"
PATTERN_HISTORY_PATH = MEMORY_DIR / "pattern_history.json"
POSITIONS_LOG_PATH = MEMORY_DIR / "positions_log.json"
DECISION_LOG_PATH = MEMORY_DIR / "decision_log.json"
AGENT_WEIGHTS_PATH = MEMORY_DIR / "agent_weights.json"

MEMORY_DIR.mkdir(parents=True, exist_ok=True)
SWARM_DB.parent.mkdir(parents=True, exist_ok=True)

MAX_DECISION_LOG = 100   # keep last N decisions in decision_log.json


# ---------------------------------------------------------------------------
# DB connection
# ---------------------------------------------------------------------------

_DB_INITIALIZED = False


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Create tables if they don't exist (idempotent — uses CREATE TABLE IF NOT EXISTS)."""
    conn.executescript("""
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS memory_entries (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL,
            namespace TEXT DEFAULT 'default',
            content TEXT NOT NULL,
            type TEXT DEFAULT 'episodic',
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
            expires_at INTEGER,
            status TEXT DEFAULT 'active',
            UNIQUE(namespace, key)
        );
        CREATE INDEX IF NOT EXISTS idx_memory_namespace ON memory_entries(namespace);
        CREATE INDEX IF NOT EXISTS idx_memory_key ON memory_entries(key);
        CREATE INDEX IF NOT EXISTS idx_memory_status ON memory_entries(status);
    """)
    conn.commit()


@contextmanager
def _db():
    """Context manager for .swarm/memory.db connections."""
    global _DB_INITIALIZED
    conn = sqlite3.connect(SWARM_DB)
    conn.row_factory = sqlite3.Row
    if not _DB_INITIALIZED:
        _ensure_schema(conn)
        _DB_INITIALIZED = True
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _upsert(conn: sqlite3.Connection, namespace: str, key: str, content: dict) -> None:
    """Insert or replace a record in memory_entries."""
    now_ms = int(time.time() * 1000)
    entry_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO memory_entries (id, namespace, key, content, type, created_at, updated_at, status)
        VALUES (?, ?, ?, ?, 'episodic', ?, ?, 'active')
        ON CONFLICT(namespace, key) DO UPDATE SET
            content = excluded.content,
            updated_at = excluded.updated_at
        """,
        (entry_id, namespace, key, json.dumps(content), now_ms, now_ms),
    )


def _fetch(conn: sqlite3.Connection, namespace: str, key: str) -> dict | None:
    """Retrieve one record by namespace + key."""
    row = conn.execute(
        "SELECT content FROM memory_entries WHERE namespace=? AND key=? AND status='active'",
        (namespace, key),
    ).fetchone()
    if row:
        try:
            return json.loads(row["content"])
        except Exception:
            return None
    return None


def _fetch_namespace(conn: sqlite3.Connection, namespace: str, limit: int = 500) -> list[dict]:
    """Retrieve all records in a namespace, most recent first."""
    rows = conn.execute(
        "SELECT key, content FROM memory_entries WHERE namespace=? AND status='active' ORDER BY updated_at DESC LIMIT ?",
        (namespace, limit),
    ).fetchall()
    results = []
    for row in rows:
        try:
            results.append({"key": row["key"], **json.loads(row["content"])})
        except Exception:
            pass
    return results


# ---------------------------------------------------------------------------
# Public library functions — called by other agents
# ---------------------------------------------------------------------------

def store_decision(
    date: str,
    ticker: str,
    action: str,
    rationale: str,
    conviction: int,
    signals: list[str],
    agent_scores: dict,
    size_pct: float | None = None,
    stop_loss: float | None = None,
) -> None:
    """
    Store the Investment Committee's final decision for one ticker on one date.
    action: 'enter_long' | 'enter_short' | 'hold' | 'increase' | 'decrease' | 'exit'
    conviction: 0-100
    agent_scores: {'fundamental': int, 'quant': int, 'sentiment': int, ...}
    """
    key = f"{date}_{ticker}"
    record = {
        "date": date,
        "ticker": ticker,
        "action": action,
        "conviction": conviction,
        "size_pct": size_pct,
        "stop_loss": stop_loss,
        "rationale": rationale,
        "signals": signals,
        "agent_scores": agent_scores,
        "stored_at": datetime.utcnow().isoformat(),
    }
    with _db() as conn:
        _upsert(conn, "stock_agent_decisions", key, record)
    logger.debug("Stored decision: %s %s (%s)", date, ticker, action)
    _append_decision_log(record)


def store_trade_entry(
    ticker: str,
    entry_date: str,
    entry_price: float,
    direction: str,
    conviction: int,
    size_pct: float,
    rationale: str,
    signals: list[str],
    stop_loss: float | None = None,
    alpaca_order_id: str | None = None,
) -> None:
    """
    Called by Trade Executor when a new position is opened.
    Writes to both .swarm/memory.db and positions_log.json.
    direction: 'LONG' | 'SHORT'
    alpaca_order_id: the Alpaca order ID if the order was placed; None = pending (market closed).
    """
    record = {
        "ticker": ticker,
        "entry_date": entry_date,
        "entry_price": entry_price,
        "direction": direction.upper(),
        "conviction": conviction,
        "size_pct": size_pct,
        "stop_loss": stop_loss,
        "entry_thesis": rationale,
        "signals": signals,
        "alpaca_order_id": alpaca_order_id,
        "status": "open",
        "opened_at": datetime.utcnow().isoformat(),
    }
    with _db() as conn:
        _upsert(conn, "stock_agent_trades", ticker, record)

    # Mirror to positions_log.json (read by Agents 6, 7, 8 in portfolio_review mode)
    positions = _load_json(POSITIONS_LOG_PATH, default={})
    positions[ticker] = record
    _save_json(POSITIONS_LOG_PATH, positions)
    logger.info("Trade entry stored: %s %s @ $%.2f (%.0f%%)", direction, ticker, entry_price, size_pct)


def update_position(ticker: str, conviction: int | None = None, size_pct: float | None = None) -> None:
    """
    Update conviction and/or size_pct on an existing positions_log entry.
    Called after increase/decrease decisions so the dashboard shows current, not entry, values.
    """
    positions = _load_json(POSITIONS_LOG_PATH, default={})
    if ticker not in positions:
        logger.debug("update_position: %s not in positions_log — skipping", ticker)
        return
    if conviction is not None:
        positions[ticker]["conviction"] = conviction
    if size_pct is not None:
        positions[ticker]["size_pct"] = size_pct
    _save_json(POSITIONS_LOG_PATH, positions)
    logger.debug("Updated positions_log: %s conviction=%s size_pct=%s", ticker, conviction, size_pct)


def store_trade_exit(
    ticker: str,
    exit_date: str,
    exit_price: float,
    exit_reason: str,
    rationale: str,
) -> None:
    """
    Called by Trade Executor when a position is closed.
    Computes P&L, stores outcome, updates pattern_history.json.
    exit_reason: 'thesis_broken' | 'target_reached' | 'stop_loss' | 'redeployment' | 'manual'
    """
    # Load entry record
    with _db() as conn:
        entry = _fetch(conn, "stock_agent_trades", ticker)
        if not entry:
            logger.warning("No open trade found for %s — cannot store exit", ticker)
            return

        entry_price = entry.get("entry_price", 0)
        direction = entry.get("direction", "LONG").upper()
        raw_pnl = (exit_price - entry_price) / entry_price if entry_price else 0
        pnl_pct = round(raw_pnl * 100 if direction == "LONG" else -raw_pnl * 100, 2)

        outcome = {
            **entry,
            "exit_date": exit_date,
            "exit_price": exit_price,
            "exit_reason": exit_reason,
            "exit_rationale": rationale,
            "pnl_pct": pnl_pct,
            "status": "closed",
            "closed_at": datetime.utcnow().isoformat(),
        }
        _upsert(conn, "stock_agent_outcomes", f"{exit_date}_{ticker}", outcome)

        # Mark trade as closed
        entry["status"] = "closed"
        _upsert(conn, "stock_agent_trades", ticker, entry)

    # Remove from positions_log.json
    positions = _load_json(POSITIONS_LOG_PATH, default={})
    positions.pop(ticker, None)
    _save_json(POSITIONS_LOG_PATH, positions)

    # Update pattern_history.json with outcome
    _update_pattern_history(entry.get("signals", []), entry.get("conviction", 50), pnl_pct)
    logger.info("Trade exit stored: %s @ $%.2f (P&L: %+.1f%%) — %s", ticker, exit_price, pnl_pct, exit_reason)


def get_ticker_history(ticker: str, days_back: int = 30) -> list[dict]:
    """
    Retrieve the most recent decisions for a ticker.
    Used by Investment Committee for context on prior calls.
    """
    cutoff = (datetime.utcnow() - timedelta(days=days_back)).date().isoformat()
    with _db() as conn:
        rows = conn.execute(
            """
            SELECT key, content FROM memory_entries
            WHERE namespace='stock_agent_decisions' AND key LIKE ?
            AND status='active' AND key >= ?
            ORDER BY key DESC LIMIT 30
            """,
            (f"%_{ticker}", cutoff + "_"),
        ).fetchall()
    results = []
    for row in rows:
        try:
            results.append(json.loads(row["content"]))
        except Exception:
            pass
    return results


def get_open_positions() -> dict:
    """Return current open positions from positions_log.json."""
    return _load_json(POSITIONS_LOG_PATH, default={})


def confirm_trade_entry(ticker: str, alpaca_order_id: str) -> None:
    """
    Mark a pending position (alpaca_order_id=None) as confirmed after the order is placed.
    Called by the reconciler when it places a deferred order at market open.
    """
    positions = _load_json(POSITIONS_LOG_PATH, default={})
    if ticker in positions:
        positions[ticker]["alpaca_order_id"] = alpaca_order_id
        positions[ticker]["confirmed_at"] = datetime.utcnow().isoformat()
        _save_json(POSITIONS_LOG_PATH, positions)
    with _db() as conn:
        entry = _fetch(conn, "stock_agent_trades", ticker) or {}
        entry["alpaca_order_id"] = alpaca_order_id
        entry["confirmed_at"] = datetime.utcnow().isoformat()
        _upsert(conn, "stock_agent_trades", ticker, entry)
    logger.info("Confirmed pending order for %s: order_id=%s", ticker, alpaca_order_id)


def remove_position(ticker: str) -> None:
    """
    Remove a position from positions_log without recording a P&L exit.
    Used by the reconciler when a logged position was never actually placed
    (e.g. market was closed AND we couldn't place it on next open).
    """
    positions = _load_json(POSITIONS_LOG_PATH, default={})
    if ticker in positions:
        positions.pop(ticker)
        _save_json(POSITIONS_LOG_PATH, positions)
        logger.info("Removed phantom position from log: %s", ticker)


def enrich_position_framework(ticker: str, framework_fields: dict) -> None:
    """
    Merge institutional framework fields into an existing positions_log.json entry.
    Called by Investment Committee after enter_long / enter_short decisions to attach
    the full analyst framework (fund mandate, comparables, valuation, etc.) to the record.
    Creates the entry if it doesn't exist yet (Trade Executor may not have run).
    """
    positions = _load_json(POSITIONS_LOG_PATH, default={})
    if ticker not in positions:
        positions[ticker] = {}
    positions[ticker].update(framework_fields)
    _save_json(POSITIONS_LOG_PATH, positions)
    logger.debug("Enriched position framework: %s (%d fields)", ticker, len(framework_fields))


def get_recent_decisions(limit: int = 20) -> list[dict]:
    """Return most recent decisions from decision_log.json (for dashboard)."""
    log = _load_json(DECISION_LOG_PATH, default=[])
    return log[-limit:]


# ---------------------------------------------------------------------------
# Pattern history management
# ---------------------------------------------------------------------------

def _update_pattern_history(signals: list[str], conviction: int, pnl_pct: float) -> None:
    """
    Update data/memory/pattern_history.json with a completed trade outcome.
    A 'win' is defined as pnl_pct > 0.  Signal combos are stored as sorted+joined keys.
    """
    if not signals:
        return

    history = _load_json(PATTERN_HISTORY_PATH, default={"signal_combinations": {}, "total_trades": 0, "updated_at": ""})
    combo_key = "+".join(sorted(signals))
    combos = history.setdefault("signal_combinations", {})

    if combo_key not in combos:
        combos[combo_key] = {"uses": 0, "wins": 0, "total_pnl": 0.0, "avg_conviction": 0.0}

    entry = combos[combo_key]
    entry["uses"] += 1
    if pnl_pct > 0:
        entry["wins"] += 1
    entry["total_pnl"] = round(entry.get("total_pnl", 0.0) + pnl_pct, 2)
    entry["avg_pnl"] = round(entry["total_pnl"] / entry["uses"], 2)
    entry["win_rate"] = round(entry["wins"] / entry["uses"], 3)
    entry["avg_conviction"] = round(
        (entry.get("avg_conviction", conviction) * (entry["uses"] - 1) + conviction) / entry["uses"], 1
    )

    history["total_trades"] = history.get("total_trades", 0) + 1
    history["updated_at"] = datetime.utcnow().isoformat()

    _save_json(PATTERN_HISTORY_PATH, history)
    logger.debug("Pattern history updated: %s | win_rate=%.0f%% | avg_pnl=%+.1f%%",
                 combo_key, entry["win_rate"] * 100, entry["avg_pnl"])


# ---------------------------------------------------------------------------
# Daily consolidation run
# ---------------------------------------------------------------------------

def compute_and_save_agent_weights() -> dict:
    """
    Compute per-agent win rates from closed trade outcomes.
    Activates only when >= 20 closed trades exist.
    Saves result to data/memory/agent_weights.json.

    Formula: new_weight = base × (1 + (win_rate - 0.50) × 0.5)
    Weights normalised to sum to 1.0.
    """
    BASE_WEIGHTS = {"fundamental": 0.35, "quant": 0.35, "sentiment": 0.30}
    ACTIVATION_THRESHOLD = 20

    with _db() as conn:
        rows = conn.execute(
            "SELECT content FROM memory_entries WHERE namespace='stock_agent_outcomes' AND status='active'"
        ).fetchall()

    outcomes = []
    for row in rows:
        try:
            outcomes.append(json.loads(row["content"]))
        except Exception:
            pass

    closed_count = len(outcomes)
    if closed_count < ACTIVATION_THRESHOLD:
        logger.info("Agent weighting inactive — only %d closed trades (need %d)", closed_count, ACTIVATION_THRESHOLD)
        weights = {**BASE_WEIGHTS, "active": False, "closed_trade_count": closed_count}
        _save_json(AGENT_WEIGHTS_PATH, weights)
        return weights

    # Compute per-agent win rates: a win = trade closed with pnl_pct > 0
    # We use the agent score at entry — whichever agent scored highest and the trade won → credit
    agent_stats: dict[str, dict] = {a: {"wins": 0, "total": 0} for a in BASE_WEIGHTS}
    for outcome in outcomes:
        pnl = outcome.get("pnl_pct", 0)
        agent_scores = outcome.get("agent_scores", {})
        if not agent_scores:
            continue
        win = pnl > 0
        for agent in agent_stats:
            score = agent_scores.get(agent)
            if score is not None:
                agent_stats[agent]["total"] += 1
                if win:
                    agent_stats[agent]["wins"] += 1

    raw_weights = {}
    for agent, stats in agent_stats.items():
        total = stats["total"]
        if total == 0:
            raw_weights[agent] = BASE_WEIGHTS[agent]
            continue
        win_rate = stats["wins"] / total
        raw_weights[agent] = BASE_WEIGHTS[agent] * (1 + (win_rate - 0.50) * 0.5)

    # Normalise to sum to 1.0
    total_w = sum(raw_weights.values())
    normalised = {a: round(w / total_w, 4) for a, w in raw_weights.items()}

    win_rates = {a: round(agent_stats[a]["wins"] / max(1, agent_stats[a]["total"]) * 100, 1)
                 for a in agent_stats}

    result = {
        **normalised,
        "active": True,
        "closed_trade_count": closed_count,
        "win_rates_pct": win_rates,
        "computed_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
    _save_json(AGENT_WEIGHTS_PATH, result)
    logger.info("Agent weights computed from %d trades: F=%.2f Q=%.2f S=%.2f",
                closed_count, normalised["fundamental"], normalised["quant"], normalised["sentiment"])
    return result


def get_agent_weights() -> dict:
    """Return agent weights from file, or base weights if not computed yet."""
    BASE_WEIGHTS = {"fundamental": 0.35, "quant": 0.35, "sentiment": 0.30}
    data = _load_json(AGENT_WEIGHTS_PATH, default={})
    if not data.get("active"):
        return BASE_WEIGHTS
    return {k: data[k] for k in ("fundamental", "quant", "sentiment") if k in data}


def run() -> dict:
    """
    Daily consolidation step — called at the end of each full pipeline run.
    Reads all today's phase 3 reports and stores a per-ticker analysis record in memory.
    Also writes decision_log.json for the dashboard.
    """
    logger.info("=== Memory Agent (Agent 9) — daily consolidation ===")
    today = datetime.utcnow().date().isoformat()

    # Load phase 3 reports
    fundamental = _load_report("fundamental_report")
    quant = _load_report("quant_report")
    sentiment = _load_report("sentiment_report")
    candidates_raw = _load_report("candidates_report")

    fund_map = {a["ticker"]: a for a in fundamental.get("fundamental_analyses", [])}
    quant_map = {a["ticker"]: a for a in quant.get("quant_analyses", [])}
    sent_map = {a["ticker"]: a for a in sentiment.get("sentiment_analyses", [])}

    candidates = candidates_raw.get("candidates", [])
    stored = 0

    with _db() as conn:
        for cand in candidates:
            ticker = str(cand.get("ticker", "")).upper()
            if not ticker:
                continue

            f = fund_map.get(ticker, {})
            q = quant_map.get(ticker, {})
            s = sent_map.get(ticker, {})

            record = {
                "date": today,
                "ticker": ticker,
                "candidate_score": cand.get("score"),
                "candidate_signals": cand.get("signals", []),
                "fundamental_score": f.get("fundamental_score"),
                "fundamental_direction": f.get("direction"),
                "quant_score": q.get("quant_score"),
                "quant_trend": q.get("trend"),
                "sentiment_score": s.get("sentiment_score"),
                "analyst_consensus": s.get("analyst_consensus"),
                "data_conflicts": (
                    f.get("data_conflicts", []) +
                    q.get("data_conflicts", []) +
                    s.get("data_conflicts", [])
                ),
                "stored_at": datetime.utcnow().isoformat(),
            }
            _upsert(conn, "stock_agent_daily", f"{today}_{ticker}", record)
            stored += 1

    macro_regime = fundamental.get("macro_regime") or quant.get("macro_regime") or "UNKNOWN"
    open_positions = get_open_positions()
    outcome_count = _count_outcomes()

    logger.info("Stored %d daily analysis records | Open positions: %d | Completed trades: %d",
                stored, len(open_positions), outcome_count)

    summary = {
        "date": today,
        "tickers_consolidated": stored,
        "open_positions": list(open_positions.keys()),
        "open_position_count": len(open_positions),
        "total_completed_trades": outcome_count,
        "macro_regime": macro_regime,
        "pattern_history_entries": _count_pattern_combos(),
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    # Compute and save agent weights (activates after 20 closed trades)
    weights = compute_and_save_agent_weights()
    summary["agent_weights"] = weights

    logger.info("=== Memory Agent consolidation complete ===")
    return summary


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_report(name: str) -> dict:
    path = REPORTS_DIR / f"{name}.json"
    if not path.exists():
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def _load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _append_decision_log(record: dict) -> None:
    log = _load_json(DECISION_LOG_PATH, default=[])
    log.append(record)
    if len(log) > MAX_DECISION_LOG:
        log = log[-MAX_DECISION_LOG:]
    _save_json(DECISION_LOG_PATH, log)


def _count_outcomes() -> int:
    with _db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as n FROM memory_entries WHERE namespace='stock_agent_outcomes' AND status='active'"
        ).fetchone()
        return row["n"] if row else 0


def _count_pattern_combos() -> int:
    history = _load_json(PATTERN_HISTORY_PATH, default={})
    return len(history.get("signal_combinations", {}))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    result = run()
    print(f"\nMemory consolidation complete")
    print(f"  Tickers stored: {result['tickers_consolidated']}")
    print(f"  Open positions: {result['open_position_count']} — {result['open_positions']}")
    print(f"  Completed trades: {result['total_completed_trades']}")
    print(f"  Pattern combos tracked: {result['pattern_history_entries']}")
