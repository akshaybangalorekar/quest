#!/usr/bin/env python3
"""Every number on screen must come from one place.

The rule: a screen may read a count from the shared views (truth, exam_counts,
tabs_view, training_status) or from tabFacts(). It may not invent one with a
fallback, and it may not read a second source for a fact it already has.
"""
import re, sys, pathlib

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
APP = ROOT / "assets" / "app.js"
text = APP.read_text(encoding="utf-8")
bad = []

# 1. no screen may fall back to a servable count for a total
for m in re.finditer(r"syncCount\([^)]*\)\s*\?\?|\?\?\s*syncCount\([^)]*\)", text):
    line = text[:m.start()].count("\n") + 1
    bad.append((line, "a total falling back to syncCount()", text.splitlines()[line - 1].strip()))

# 2. every exam total must come from exam_counts, never from a raw problems count
for m in re.finditer(r"\.from\(\"problems\"\)[\s\S]{0,80}count", text):
    line = text[:m.start()].count("\n") + 1
    bad.append((line, "counting problems on the client", text.splitlines()[line - 1].strip()))

# 3. a tab's numbers come from tabFacts, not from arithmetic done at the call site
for m in re.finditer(r"\$\{t\.(servable|fresh|attempted)\}", text):
    line = text[:m.start()].count("\n") + 1
    bad.append((line, "a tab number printed outside tabFacts()", text.splitlines()[line - 1].strip()))

# 4. the timetable and the parent view must both load the shared counts
if "await ensureExamCounts()" not in text:
    bad.append((0, "no single loader for exam counts", "ensureExamCounts() is missing"))

if bad:
    print(f"FAIL {len(bad)} number(s) with no single source")
    for line, why, code in bad[:20]:
        print(f"  {APP}:{line}  {why}\n    {code[:110]}")
    sys.exit(1)
print("every number has one source")
