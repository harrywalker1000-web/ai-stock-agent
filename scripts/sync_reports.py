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

for fname in ("decision_log.json", "positions_log.json"):
    src_file = MEM_SRC / fname
    if src_file.exists():
        # Copy to both locations: reports/ (legacy) and memory/ (portfolio API)
        if fname == "decision_log.json":
            shutil.copy2(src_file, DST / fname)
        shutil.copy2(src_file, MEM_DST / fname)
        print(f"  ✓ {fname}")
        copied += 1

print(f"\nSynced {copied} files → {DST}")

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

        # Summarise actions
        decisions = cr.get("position_decisions", [])
        action_counts = {"new_positions": 0, "exits": 0, "holds": 0, "increases": 0, "decreases": 0}
        for d in decisions:
            a = d.get("action", "")
            if "enter" in a:
                action_counts["new_positions"] += 1
            elif "exit" in a:
                action_counts["exits"] += 1
            elif "hold" in a or "skip" in a:
                action_counts["holds"] += 1
            elif "increase" in a:
                action_counts["increases"] += 1
            elif "decrease" in a:
                action_counts["decreases"] += 1

        # Agent findings from phase_b agents
        phase_b = pr.get("phase_b", {})
        agent_findings = []
        for agent_key, label in [
            ("macro", "Macro Agent"),
            ("news", "News Agent"),
            ("quant", "Quant Agent"),
            ("fundamental", "Fundamental Analyst"),
            ("sentiment", "Sentiment Agent"),
        ]:
            data = phase_b.get(agent_key) or pr.get("phase_a", {}).get(agent_key)
            if data and isinstance(data, dict):
                summary = data.get("summary") or data.get("macro_summary") or data.get("headline_summary")
                if summary:
                    agent_findings.append({"agent": label, "finding": str(summary)[:200]})

        daily = {
            "date": date,
            "macro_regime": cr.get("macro_regime", "NEUTRAL"),
            "new_positions": action_counts["new_positions"],
            "exits": action_counts["exits"],
            "holds": action_counts["holds"],
            "increases": action_counts["increases"],
            "decreases": action_counts["decreases"],
            "daily_pnl": pr.get("pipeline_summary", {}).get("daily_pnl", "+$0"),
            "summary": cr.get("committee_narrative", "")[:300] if cr.get("committee_narrative") else f"{len(decisions)} decisions made.",
            "narrative": cr.get("committee_narrative", "No narrative available."),
            "agent_findings": agent_findings,
            "decisions": [
                {
                    "ticker": d.get("ticker"),
                    "action": d.get("action", "hold"),
                    "conviction": d.get("conviction", 0),
                    "thesis": d.get("investment_thesis", "")[:200],
                }
                for d in decisions
            ],
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
