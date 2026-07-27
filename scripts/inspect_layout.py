#!/usr/bin/env python3
import fitz

pdf = r"C:\Users\spyki\Downloads\The Bodybuilding Transformation System (Beginner){Jeff Nippard}(2025, Jeff Nippard){108122745} libgen.li.pdf"
doc = fitz.open(pdf)
page = doc[3]  # page 4
print("page size", page.rect)
blocks = page.get_text("dict")["blocks"]
print("blocks", len(blocks))
for b in blocks:
    if b.get("type") != 0:
        continue
    bbox = b["bbox"]
    lines = []
    for l in b.get("lines", []):
        spans = "".join(s["text"] for s in l.get("spans", []))
        if spans.strip():
            lines.append(spans.strip())
    if lines:
        joined = " | ".join(lines)[:140]
        print(f"x0={bbox[0]:6.1f} y0={bbox[1]:6.1f} x1={bbox[2]:6.1f} | {joined}")

print("\n--- WORDS sorted ---")
words = page.get_text("words")  # x0,y0,x1,y1,word,block,line,word
# Group by approximate y
from collections import defaultdict
rows = defaultdict(list)
for w in words:
    y = round(w[1] / 3) * 3
    rows[y].append(w)

for y in sorted(rows.keys())[:40]:
    row = sorted(rows[y], key=lambda t: t[0])
    text = " ".join(t[4] for t in row)
    xs = [round(t[0]) for t in row]
    print(f"y={y:6.1f} {text[:160]}")
