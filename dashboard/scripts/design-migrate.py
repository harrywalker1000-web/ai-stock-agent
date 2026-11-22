"""
One-off codemod for the redesign (DESIGN_DIRECTION.md): maps the legacy hard-coded
palette onto the design tokens and strips checklist violations from class strings.
Idempotent. Run:  python3 scripts/design-migrate.py [--write]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [p for p in list((ROOT / "app").rglob("*.tsx")) + list((ROOT / "components").rglob("*.tsx"))
           if not any(s in str(p) for s in ("/app/design/", "/app/team-design/", "/app/logo-", "/app/pitch/"))]

TOK = {  # token -> hex (for JS strings)
    "canvas": "#111315", "surface": "#171A1D", "raised": "#1E2226", "line": "#2A2F35",
    "ink-1": "#ECEDEE", "ink-2": "#B3B8BE", "ink-3": "#8E959D",
    "accent": "#C8A15A", "gain": "#4DB887", "loss": "#E2706A", "caution": "#E39A57",
}

def group(*hexes):
    return {h.upper() for h in hexes}

INK1 = group("E8EDF2", "E2E8F0", "F1F5F9", "FFFFFF", "F9FAFB", "F3F4F6", "E5E7EB", "CBD5E1", "C4CDD6", "D1D5DB", "FEF3C7")
INK2 = group("94A3B8", "9CA3AF", "A0AEC0", "B0B8C4", "8B5CF6", "A78BFA", "EC4899", "C084FC", "A855F7")
INK3 = group("6B7280", "64748B", "8896AA", "475569", "4B5563", "334155", "3D4655", "374151", "1E2D4A",
             "1E3A5F", "111827", "0D1117", "1F2937")
ACCENT = group("F5A623", "D97706", "2D6BFF", "0EA5E9", "60A5FA", "00D4FF", "06B6D4", "3B82F6", "FF006E",
               "FDE68A", "93C5FD", "1D4ED8", "2563EB", "38BDF8", "B45309")
GAIN = group("10B981", "00FF87", "22C55E", "34D399", "4ADE80", "16A34A", "6EE7B7", "059669")
LOSS = group("EF4444", "FF4141", "F87171", "DC2626", "FCA5A5", "B91C1C")
CAUTION = group("F59E0B", "FBBF24", "FCD34D", "F97316", "FB923C", "EAB308", "78350F")

CANVAS = group("030005", "010002", "080C10", "0A0E1A", "0B0F19", "000000", "05070A", "080C14", "0A0F1C")
SURFACE = group("131929", "0D1626", "0F1623", "0F1629", "111827", "0E1216", "0D1117", "161B22", "1A1F2E",
                "1B2951", "0A1628", "0D1525")
LINE = group("1E2D4A", "1E3A5F", "1F2937", "374151", "334155", "2D3748", "3D4655", "475569", "4B5563",
             "6B7280", "64748B")

def text_token(h):
    for tok, g in (("ink-1", INK1), ("ink-2", INK2), ("ink-3", INK3), ("accent", ACCENT),
                   ("gain", GAIN), ("loss", LOSS), ("caution", CAUTION)):
        if h in g:
            return tok
    if h in CANVAS or h in SURFACE:
        return "ink-3"
    return None

def fill_token(h):  # bg / border / ring / divide
    for tok, g in (("canvas", CANVAS), ("surface", SURFACE), ("line", LINE), ("accent", ACCENT),
                   ("gain", GAIN), ("loss", LOSS), ("caution", CAUTION)):
        if h in g:
            return tok
    if h in INK1:
        return "ink-1"
    if h in INK2:
        return "ink-3"
    return None

def js_hex(h):
    if h in CANVAS: return TOK["canvas"]
    if h in SURFACE: return TOK["surface"]
    if h in group("1E2D4A", "1E3A5F", "1F2937", "2D3748"): return TOK["line"]
    t = text_token(h)
    return TOK[t] if t else None

TEXT_PREFIX = {"text", "fill", "stroke", "placeholder", "decoration", "caret"}
CLASS_RE = re.compile(r"\b((?:[a-z0-9]+:)*)(text|bg|border(?:-[trblxy])?|from|to|via|fill|stroke|ring|divide|outline|decoration|placeholder|caret|shadow)-\[#([0-9A-Fa-f]{6})\](/(?:\d{1,3}|\[[^\]]+\]))?")

def sub_class(m):
    variants, prefix, hexv, alpha = m.group(1), m.group(2), m.group(3).upper(), m.group(4) or ""
    if prefix == "shadow":
        return ""  # glows/drop shadows go
    tok = text_token(hexv) if prefix in TEXT_PREFIX else fill_token(hexv)
    if not tok:
        return m.group(0)
    # opacity like /08 → /8 (tailwind wants 0-100)
    if alpha.startswith("/") and alpha[1:].isdigit():
        alpha = "/" + str(int(alpha[1:]))
    return f"{variants}{prefix}-{tok}{alpha}"

JS_HEX_RE = re.compile(r"(?<![\w\[])#([0-9A-Fa-f]{6})(?![0-9A-Fa-f])")

def sub_js(m):
    new = js_hex(m.group(1).upper())
    return new if new else m.group(0)

CLEAN = [
    (re.compile(r"(?<![-\w])uppercase(?![-\w])"), ""),
    (re.compile(r"(?<![-\w])tracking-(?:wide|wider|widest|\[[0-9.]+em\])(?![-\w])"), ""),
    (re.compile(r"(?<![-\w])font-mono(?![-\w])"), ""),
    (re.compile(r"(?<![-\w])text-\[(?:9|10|11)px\]"), "text-micro"),
    (re.compile(r"(?<![-\w])(?:backdrop-blur(?:-[a-z0-9]+)?|drop-shadow(?:-[a-z0-9]+|-\[[^\]]+\])?|shadow-\[[^\]]+\])(?![-\w])"), ""),
    (re.compile(r"(?<![-\w])animate-pulse(?![-\w])"), ""),
    (re.compile(r"(?<![-\w])italic(?![-\w])"), ""),
]

STR_RE = re.compile(r'(className=)("([^"\\]|\\.)*"|\{`([^`\\]|\\.)*`\})')

def clean_classes(src):
    def fix(m):
        s = m.group(2)
        for rx, rep in CLEAN:
            s = rx.sub(rep, s)
        s = re.sub(r"[ \t]{2,}", " ", s).replace('" ', '"').replace(' "', '"').replace("{` ", "{`").replace(" `}", "`}")
        return m.group(1) + s
    return STR_RE.sub(fix, src)

def migrate(src):
    src = CLASS_RE.sub(sub_class, src)
    src = clean_classes(src)
    src = JS_HEX_RE.sub(sub_js, src)
    return src

def main():
    write = "--write" in sys.argv
    total = 0
    for p in sorted(TARGETS):
        old = p.read_text()
        new = migrate(old)
        if new != old:
            n = sum(1 for a, b in zip(old.splitlines(), new.splitlines()) if a != b)
            total += n
            print(f"{n:5d} lines  {p.relative_to(ROOT)}")
            if write:
                p.write_text(new)
    print(f"total changed lines: {total} ({'written' if write else 'dry run'})")

if __name__ == "__main__":
    main()
