"""
Pitch deck → light theme tokens (owner chose to keep the deck light; DESIGN_DIRECTION.md).
Slate/amber/green/red utilities and the navy #1B2951 map onto .theme-light tokens.
Run: python3 scripts/design-migrate-pitch.py [--write]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [ROOT / "app/pitch/[ticker]/page.tsx", ROOT / "app/pitch/page.tsx", ROOT / "app/pitch/[ticker]/error.tsx"]

CLASS_MAP = [
    # text
    (r"text-slate-(300)", "text-white/70"),            # only used on the dark slide headers
    (r"text-blue-(200|300)", "text-white/70"),
    (r"text-slate-(400|500)", "text-ink-3"),
    (r"text-slate-(600|700)", "text-ink-2"),
    (r"text-slate-(800|900)", "text-ink-1"),
    (r"text-(amber|orange)-(400|500|600|700)", "text-accent"),
    (r"text-(green|emerald)-(500|600|700)", "text-gain"),
    (r"text-red-(400|500|600|700)", "text-loss"),
    # backgrounds
    (r"bg-slate-50", "bg-canvas"),
    (r"bg-white(?![/\w-])", "bg-surface"),
    (r"bg-slate-(100|200)", "bg-raised"),
    (r"bg-slate-(600|700|800|900)", "bg-ink-1"),
    (r"bg-(amber|orange)-(50|100)", "bg-accent/10"),
    (r"bg-(amber|orange)-(300|400|500|600)", "bg-accent"),
    (r"bg-(green|emerald)-(50|100)", "bg-gain/10"),
    (r"bg-(green|emerald)-(400|500|600|700)", "bg-gain"),
    (r"bg-red-(50|100)", "bg-loss/10"),
    (r"bg-red-(400|500|600|700)", "bg-loss"),
    # borders
    (r"border-slate-(100|200|300)", "border-line"),
    (r"border-(amber|orange)-(200|300|400)", "border-accent/40"),
    (r"border-(green|emerald)-(200|300)", "border-gain/40"),
    (r"border-red-(200|300)", "border-loss/40"),
]
HEX_MAP = {"1B2951": "#1A1D21", "0F172A": "#1A1D21", "EEF2F8": "#F6F5F2", "F0F2F5": "#F6F5F2",
           "94A3B8": "#5F6670", "64748B": "#5F6670"}

def migrate(src: str) -> str:
    for pat, rep in CLASS_MAP:
        src = re.sub(r"(?<![\w-])" + pat + r"(?![\w-])", rep, src)
    src = re.sub(r"#([0-9A-Fa-f]{6})\b", lambda m: HEX_MAP.get(m.group(1).upper(), m.group(0)), src)
    for rx, rep in [(r"(?<![-\w])uppercase(?![-\w])", ""), (r"(?<![-\w])tracking-(?:wide|wider|widest|\[[0-9.]+em\])(?![-\w])", ""),
                    (r"(?<![-\w])font-mono(?![-\w])", ""), (r"(?<![-\w])text-\[(?:8|9|10|11)px\]", "text-micro"),
                    (r"(?<![-\w])italic(?![-\w])", "")]:
        src = re.sub(rx, rep, src)
    return src

write = "--write" in sys.argv
for p in FILES:
    if not p.exists():
        continue
    old = p.read_text()
    new = migrate(old)
    if new != old:
        print(f"{sum(1 for a, b in zip(old.splitlines(), new.splitlines()) if a != b):4d} lines  {p.relative_to(ROOT)}")
        if write:
            p.write_text(new)
