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
