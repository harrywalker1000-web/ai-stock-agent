"""
Follow-up to design-migrate.py: legacy dark-tint badge backgrounds (e.g. #78350F behind
#FBBF24 text) collapsed onto the same token as their text, making the label invisible.
Any class string with `bg-X` and `text-X` (same solid token) gets `bg-X/12` instead.
Run: python3 scripts/design-fix-collisions.py [--write]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ["caution", "accent", "gain", "loss", "ink-1", "ink-2", "ink-3"]
FILES = [p for p in list((ROOT / "app").rglob("*.tsx")) + list((ROOT / "components").rglob("*.tsx"))
         if not any(s in str(p) for s in ("/app/design/", "/app/team-design/", "/app/logo-", "/app/pitch/"))]
STR_RE = re.compile(r'className=("[^"]*"|\{`[^`]*`\})')

def fix(cls: str) -> str:
    for t in TOKENS:
        if re.search(rf"(?<![\w-])text-{re.escape(t)}(?![\w/-])", cls) and re.search(rf"(?<![\w:-])bg-{re.escape(t)}(?![\w/-])", cls):
            cls = re.sub(rf"(?<![\w:-])bg-{re.escape(t)}(?![\w/-])", f"bg-{t}/12", cls)
    return cls

write = "--write" in sys.argv
for p in FILES:
    s = p.read_text()
    n = STR_RE.sub(lambda m: "className=" + fix(m.group(1)), s)
    if n != s:
        print(p.relative_to(ROOT), sum(1 for a, b in zip(s.splitlines(), n.splitlines()) if a != b))
        if write:
            p.write_text(n)
