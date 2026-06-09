#!/usr/bin/env python3
"""
CLI runner for ad-hoc stock research reports.

Usage:
    python scripts/run_adhoc_research.py AAPL
    python scripts/run_adhoc_research.py MSFT --pretty
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.research.pipeline import run_pipeline


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/run_adhoc_research.py <TICKER> [--pretty]", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].upper().strip()
    pretty = "--pretty" in sys.argv

    report = run_pipeline(ticker)

    output = json.dumps(report, indent=2 if pretty else None, default=str)
    print(output)


if __name__ == "__main__":
    main()
