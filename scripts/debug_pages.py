#!/usr/bin/env python3
"""Debug missing first exercises on specific pages."""
import fitz
from collections import defaultdict

PDF = r"C:\Users\spyki\Downloads\The Bodybuilding Transformation System (Beginner){Jeff Nippard}(2025, Jeff Nippard){108122745} libgen.li.pdf"
doc = fitz.open(PDF)

COL_BANDS = [
    ("exercise", 150, 340),
    ("intensity", 350, 480),
    ("warmup", 500, 590),
    ("working", 600, 690),
    ("reps", 700, 800),
    ("earlyRpe", 1150, 1280),
    ("lastRpe", 1285, 1370),
    ("rest", 1375, 1470),
    ("sub1", 1475, 1605),
    ("sub2", 1608, 1765),
    ("notes", 1768, 2320),
]

def col_for_x(x):
    for name, lo, hi in COL_BANDS:
        if lo <= x <= hi:
            return name
    return None

def dump(page_idx, label):
    page = doc[page_idx]
    print("=" * 70)
    print(f"PAGE {page_idx+1} ({label}) size={page.rect}")
    blocks = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        lines = []
        for l in b.get("lines", []):
            spans = "".join(s["text"] for s in l.get("spans", []))
            if spans.strip():
                lines.append(spans.strip())
        if not lines:
            continue
        x0, y0, x1, y1 = b["bbox"]
        yc = (y0 + y1) / 2
        if yc < 200 or yc > 1100:
            continue
        text = " ".join(lines)[:80]
        col = col_for_x(x0)
        blocks.append((yc, x0, col, text))
    blocks.sort()
    # show exercise-column and unassigned leftish blocks
    print("--- left/exercise-ish blocks ---")
    for yc, x0, col, text in blocks:
        if x0 < 400 or col == "exercise":
            print(f"  y={yc:6.1f} x={x0:6.1f} col={col!s:10} {text}")
    # count unique y clusters for rest column
    rests = [(yc, text) for yc, x0, col, text in blocks if col == "rest"]
    print(f"rest rows: {len(rests)} -> {[t for _,t in rests]}")

for pi, lab in [(3,"W1 Upper"), (4,"W1 Lower"), (5,"W1 Pull"), (6,"W1 Push"), (7,"W1 Legs"),
                (8,"W2 Upper"), (33,"W7 Upper"), (58,"W12 Upper")]:
    dump(pi, lab)
