"""
Copy pipeline reports from data/reports/ → dashboard/data/reports/
Run this after the pipeline before deploying the dashboard.
Also called by the GitHub Actions workflow automatically.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "data" / "reports"
DST = ROOT / "dashboard" / "data" / "reports"
DST.mkdir(parents=True, exist_ok=True)


def _merge_decisions(phase_a: list, phase_b: list) -> list:
    """
    Merge Phase A (portfolio review) and Phase B (new opportunities) decisions.
    Rules:
      - Phase A owns all decisions for currently-held tickers.
        If Phase B also produced a decision for a held ticker, discard it.
      - Phase B owns all new-entry decisions (enter_long / enter_short) for non-held tickers.
      - Skip actions are excluded from the output.
      - Phase B exit/hold/increase/decrease actions are stripped — Phase B should only enter.
    """
    held_tickers = {d.get("ticker") for d in phase_a if d.get("ticker")}
    PHASE_B_VALID_ACTIONS = {"enter_long", "enter_short"}

    result = []
    seen = set()

    # Phase A decisions take precedence — add all non-skip Phase A decisions
    for d in phase_a:
        t = d.get("ticker")
        action = d.get("action", "")
        if not t or "skip" in action:
            continue
        result.append({
            "ticker": t,
            "action": action,
            "conviction": d.get("conviction", 0),
            "thesis": d.get("investment_thesis", "")[:400],
        })
        seen.add(t)

    # Phase B decisions — only new entries, only for tickers not already handled by Phase A
    for d in phase_b:
        t = d.get("ticker")
        action = d.get("action", "")
        if not t or "skip" in action:
            continue
        if t in seen or t in held_tickers:
            continue  # Phase A owns this ticker
        if action not in PHASE_B_VALID_ACTIONS:
            continue  # Phase B must not produce exits/holds/increases
        result.append({
            "ticker": t,
            "action": action,
            "conviction": d.get("conviction", 0),
            "thesis": d.get("investment_thesis", "")[:400],
        })
        seen.add(t)

    return result

REPORT_FILES = [
    "pipeline_result.json",
    "portfolio_state.json",
    "committee_report.json",
    "fundamental_report.json",
    "quant_report.json",
    "sentiment_report.json",
    "news_report.json",
    "macro_report.json",
    "sector_report.json",
    "institutional_report.json",
    "backtest_result.json",
    "intraday_alerts.json",
]

copied = 0
for fname in REPORT_FILES:
    src_file = SRC / fname
    if src_file.exists():
        shutil.copy2(src_file, DST / fname)
        size = src_file.stat().st_size
        print(f"  ✓ {fname} ({size // 1024} KB)")
        copied += 1
    else:
        print(f"  - {fname} not found, skipping")

# Also copy memory files that the dashboard reads directly
MEM_SRC = ROOT / "data" / "memory"
MEM_DST = ROOT / "dashboard" / "data" / "memory"
MEM_DST.mkdir(parents=True, exist_ok=True)

for fname in ("decision_log.json", "positions_log.json", "benchmark_history.json", "nav_history.json",
               "attribution_log.json", "agent_accuracy_summary.json"):
    src_file = MEM_SRC / fname
    if src_file.exists():
        # Copy to both locations: reports/ (legacy) and memory/ (portfolio API)
        if fname == "decision_log.json":
            shutil.copy2(src_file, DST / fname)
        shutil.copy2(src_file, MEM_DST / fname)
        print(f"  ✓ {fname}")
        copied += 1

print(f"\nSynced {copied} files → {DST}")

# ── Sync post-mortems ────────────────────────────────────────────────────────
PM_SRC = MEM_SRC / "postmortems"
PM_DST = MEM_DST / "postmortems"
PM_DST.mkdir(parents=True, exist_ok=True)

pm_copied = 0
if PM_SRC.exists():
    for f in PM_SRC.glob("*.json"):
        dst_file = PM_DST / f.name
        shutil.copy2(f, dst_file)
        pm_copied += 1

if pm_copied:
    print(f"  ✓ {pm_copied} post-mortem(s) synced → {PM_DST}")

# Copy learning_brief.json if it exists
for fname in ("learning_brief.json",):
    src_file = MEM_SRC / fname
    if src_file.exists():
        shutil.copy2(src_file, MEM_DST / fname)
        print(f"  ✓ {fname}")

# ── Sync ad-hoc reports ───────────────────────────────────────────────────────
ADHOC_SRC = ROOT / "data" / "adhoc_reports"
ADHOC_DST = ROOT / "dashboard" / "data" / "adhoc_reports"
ADHOC_DST.mkdir(parents=True, exist_ok=True)

adhoc_copied = 0
if ADHOC_SRC.exists():
    for f in ADHOC_SRC.glob("*.json"):
        dst_file = ADHOC_DST / f.name
        # Always overwrite — adhoc reports may be refreshed
        shutil.copy2(f, dst_file)
        print(f"  ✓ adhoc/{f.name} ({f.stat().st_size // 1024} KB)")
        adhoc_copied += 1

if adhoc_copied:
    print(f"\nSynced {adhoc_copied} ad-hoc report(s) → {ADHOC_DST}")

# ── Build daily_report_{date}.json for the Reports page ──────────────────────
try:
    pipeline_file = SRC / "pipeline_result.json"
    committee_file = SRC / "committee_report.json"
    if pipeline_file.exists() and committee_file.exists():
        with open(pipeline_file) as f:
            pr = json.load(f)
        with open(committee_file) as f:
            cr = json.load(f)

        date = pr.get("date", "unknown")
        ps = pr.get("pipeline_summary", {})

        # Phase B = new opportunities deliberated by committee
        phase_b_decisions = cr.get("position_decisions", [])
        # Phase A = hold/exit decisions on existing open positions
        phase_a_decisions = pr.get("phase_a", {}).get("committee", {}).get("position_decisions", [])

        # Merge Phase A + Phase B — Phase A owns held tickers, Phase B owns new entries only
        decisions = _merge_decisions(phase_a_decisions, phase_b_decisions)

        action_counts = {"new_positions": 0, "exits": 0, "holds": 0, "increases": 0, "decreases": 0}
        for d in decisions:
            a = d.get("action", "")
            if "enter" in a:
                action_counts["new_positions"] += 1
            elif "exit" in a:
                action_counts["exits"] += 1
            elif "hold" in a:
                action_counts["holds"] += 1
            elif "increase" in a:
                action_counts["increases"] += 1
            elif "decrease" in a:
                action_counts["decreases"] += 1

        # Detect market closure from executor output
        pb_executor = pr.get("phase_b", {}).get("executor") or {}
        pa_executor = pr.get("phase_a", {}).get("executor") or {}
        market_closed = False
        deferred_tickers = []
        for executor in (pb_executor, pa_executor):
            if not isinstance(executor, dict):
                continue
            for trade in executor.get("executed_trades", []):
                if not isinstance(trade, dict):
                    continue
                if (trade.get("order") or {}).get("status") == "market_closed_dry_run":
                    market_closed = True
                    t = trade.get("ticker")
                    if t and t not in deferred_tickers:
                        deferred_tickers.append(t)
        if not market_closed and pb_executor.get("market_safe") is False:
            market_closed = True

        # Agent findings from phase_a and phase_b agents
        phase_a = pr.get("phase_a", {})
        phase_b = pr.get("phase_b", {})
        agent_findings = []

        # Field name map: (phase_key, report_key, summary_field, label)
        AGENT_FIELDS = [
            ("phase_a", "macro",        "macro_summary",        "Macro Agent"),
            ("phase_b", "news",         "news_summary",         "News Agent"),
            ("phase_b", "sector",       "sector_summary",       "Sector Agent"),
            ("phase_b", "quant",        None,                   "Quant Agent"),
            ("phase_b", "fundamental",  None,                   "Fundamental Analyst"),
            ("phase_b", "institutional",None,                   "Institutional Agent"),
            ("phase_a", "committee",    "committee_narrative",  "Committee — Portfolio Review"),
            ("phase_b", "committee",    "committee_narrative",  "Committee — New Opportunities"),
        ]
        for phase_key, agent_key, summary_field, label in AGENT_FIELDS:
            phase = phase_a if phase_key == "phase_a" else phase_b
            data = phase.get(agent_key)
            if not data or not isinstance(data, dict):
                continue
            summary = None
            if summary_field:
                summary = data.get(summary_field)
            # Fallbacks for agents without a single summary field
            if not summary and agent_key == "quant":
                analyses = data.get("quant_analyses", [])
                if analyses:
                    top = sorted(analyses, key=lambda x: x.get("quant_score", 0), reverse=True)[:5]
                    parts = []
                    for a in top:
                        ticker = a.get("ticker", "?")
                        score = a.get("quant_score", 0)
                        rsi = a.get("rsi_14")
                        trend = a.get("trend", "")
                        bias = a.get("forward_bias", "")
                        support = a.get("support")
                        resistance = a.get("resistance")
                        meta = []
                        if rsi is not None:
                            meta.append(f"RSI {rsi:.0f}")
                        if trend:
                            meta.append(trend)
                        if support and resistance:
                            meta.append(f"S/R ${support:.0f}/${resistance:.0f}")
                        if bias:
                            meta.append(bias)
                        detail = f"{ticker} scored {score:.0f}/100"
                        if meta:
                            detail += f" ({', '.join(meta)})"
                        parts.append(detail)
                    summary = "Top quant signals: " + "; ".join(parts) + "."
            if not summary and agent_key == "fundamental":
                analyses = data.get("fundamental_analyses", [])
                if analyses:
                    top = sorted(analyses, key=lambda x: x.get("fundamental_score", 0), reverse=True)[:5]
                    parts = []
                    for a in top:
                        ticker = a.get("ticker", "?")
                        score = a.get("fundamental_score", 0)
                        pe = a.get("pe_ratio")
                        rev_growth = a.get("revenue_growth_yoy")
                        margin = a.get("operating_margin")
                        roic = a.get("roic")
                        meta = []
                        if pe is not None:
                            meta.append(f"P/E {pe:.1f}x")
                        if rev_growth is not None:
                            meta.append(f"{rev_growth:.1f}% revenue growth")
                        if margin is not None:
                            meta.append(f"{margin:.1f}% operating margin")
                        if roic is not None:
                            meta.append(f"ROIC {roic:.1f}%")
                        detail = f"{ticker} scored {score:.0f}/100"
                        if meta:
                            detail += f" ({', '.join(meta)})"
                        parts.append(detail)
                    summary = "Top fundamental picks: " + "; ".join(parts) + "."
            if not summary and agent_key == "institutional":
                buys = data.get("institutional_buys", [])
                conv = data.get("convergence_signals", [])
                parts = []
                if buys:
                    buy_tickers = [b.get("ticker", "") for b in buys[:4] if b.get("ticker")]
                    parts.append(f"{len(buys)} institutional buy signal{'s' if len(buys) != 1 else ''} tracked" +
                                 (f" ({', '.join(buy_tickers)})" if buy_tickers else ""))
                if conv:
                    conv_tickers = [c.get("ticker", "") for c in conv[:3] if c.get("ticker")]
                    parts.append(f"{len(conv)} AI-institutional convergence: {', '.join(conv_tickers)}")
                summary = ". ".join(parts) + "." if parts else None
            if summary:
                agent_findings.append({"agent": label, "finding": str(summary)})

        # Benchmark summary for daily report
        benchmark_summary = None
        benchmark_alpha_1w = None
        try:
            bench_file = MEM_SRC / "benchmark_history.json"
            if bench_file.exists():
                with open(bench_file) as f:
                    bench = json.load(f)
                periods = bench.get("periods", {})
                parts = []
                for key, label in [("1w", "1W"), ("1m", "1M")]:
                    p = periods.get(key, {})
                    alpha = p.get("alpha")
                    if alpha is not None:
                        sign = "+" if alpha >= 0 else ""
                        parts.append(f"{label}: {sign}{alpha:.1f}% alpha vs SPY")
                        if key == "1w":
                            benchmark_alpha_1w = alpha
                if parts:
                    benchmark_summary = " | ".join(parts)
        except Exception:
            pass

        daily = {
            "date": date,
            "macro_regime": cr.get("macro_regime", "NEUTRAL"),
            "new_positions": action_counts["new_positions"],
            "exits": action_counts["exits"],
            "holds": action_counts["holds"],
            "increases": action_counts["increases"],
            "decreases": action_counts["decreases"],
            "daily_pnl": pr.get("pipeline_summary", {}).get("daily_pnl", "+$0"),
            "daily_pnl_pct": pr.get("pipeline_summary", {}).get("daily_pnl_pct", None),
            "daily_pnl_date": pr.get("pipeline_summary", {}).get("daily_pnl_date", None),
            "market_closed": market_closed,
            "market_closed_note": (
                f"Market was closed on {date} — {len(deferred_tickers)} order(s) deferred to next trading session"
                + (f" ({', '.join(deferred_tickers)})" if deferred_tickers else "") + "."
                if market_closed else None
            ),
            "summary": cr.get("committee_narrative", "")[:300] if cr.get("committee_narrative") else f"{len(decisions)} decisions made.",
            "narrative": (
                (f"⚠ Market closed on {date}. Decisions recorded but orders deferred to next session"
                 + (f": {', '.join(deferred_tickers)}" if deferred_tickers else "") + ".\n\n"
                 if market_closed else "")
                + cr.get("committee_narrative", "No narrative available.")
            ),
            "agent_findings": agent_findings,
            "decisions": decisions,
            "open_positions_after": ps.get("open_positions_after", 0),
            "benchmark_summary": benchmark_summary,
            "benchmark_alpha_1w": benchmark_alpha_1w,
        }

        out_file = DST / f"daily_report_{date}.json"
        # Never overwrite an existing daily report — it may have been committed already
        if not out_file.exists():
            with open(out_file, "w") as f:
                json.dump(daily, f, indent=2)
            print(f"  ✓ daily_report_{date}.json written for Reports page")
        else:
            print(f"  - daily_report_{date}.json already exists, skipping")
except Exception as exc:
    print(f"  ! Could not build daily_report: {exc}")
