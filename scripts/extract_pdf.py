#!/usr/bin/env python3
"""Extract BBTS Beginner spreadsheet pages (4-63) from PDF."""
from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path

from pypdf import PdfReader

PDF = Path(
    r"C:\Users\spyki\Downloads\The Bodybuilding Transformation System (Beginner)"
    r"{Jeff Nippard}(2025, Jeff Nippard){108122745} libgen.li.pdf"
)
OUT = Path(__file__).resolve().parent / "pdf_raw.json"


def clean_uri(u: str | None) -> str | None:
    if not u:
        return None
    u = str(u)
    u = re.sub(r"\?si=[^&]+", "", u)
    return u


def unique_ordered(uris: list[str]) -> list[str]:
    seen = set()
    out = []
    for u in uris:
        cu = clean_uri(u)
        if cu and cu not in seen:
            seen.add(cu)
            out.append(cu)
    return out


def get_annots_with_pos(page):
    annots = page.get("/Annots") or []
    items = []
    for a in annots:
        obj = a.get_object()
        a_type = obj.get("/A")
        uri = None
        if a_type:
            uri = a_type.get("/URI")
        if not uri:
            continue
        rect = obj.get("/Rect")
        y = float(rect[1]) if rect else 0
        x = float(rect[0]) if rect else 0
        items.append({"uri": str(uri), "x": x, "y": y, "clean": clean_uri(str(uri))})
    items.sort(key=lambda i: (-i["y"], i["x"]))
    return items


DAY_PATTERNS = [
    (r"Upper\s*\(Strength", "upper", "Strength Focus"),
    (r"Upper\s*\(Hypertrophy", "upper", "Hypertrophy Focus"),
    (r"Lower\s*\(Strength", "lower", "Strength Focus"),
    (r"Lower\s*\(Hypertrophy", "lower", "Hypertrophy Focus"),
    (r"Pull\s*\(Strength", "pull", "Strength Focus"),
    (r"Pull\s*\(Hypertrophy", "pull", "Hypertrophy Focus"),
    (r"Push\s*\(Strength", "push", "Strength Focus"),
    (r"Push\s*\(Hypertrophy", "push", "Hypertrophy Focus"),
    (r"Legs\s*\(Strength", "legs", "Strength Focus"),
    (r"Legs\s*\(Hypertrophy", "legs", "Hypertrophy Focus"),
    (r"\bUpper\b", "upper", None),
    (r"\bLower\b", "lower", None),
    (r"\bPull\b", "pull", None),
    (r"\bPush\b", "push", None),
    (r"\bLegs\b", "legs", None),
]

BLOCK_PATTERNS = [
    (r"Foundation Block", "Foundation Block"),
    (r"Intensification Block", "Intensification Block"),
    (r"Peak Block", "Peak Block"),
    (r"Realization Block", "Realization Block"),
]


def detect_week(text: str) -> int | None:
    m = re.search(r"WEEK\s+(\d+)", text, re.I)
    return int(m.group(1)) if m else None


def detect_day(text: str):
    for pat, day_id, focus in DAY_PATTERNS:
        if re.search(pat, text, re.I):
            return day_id, focus
    return None, None


def detect_block(text: str) -> str | None:
    for pat, name in BLOCK_PATTERNS:
        if re.search(pat, text, re.I):
            return name
    return None


def cluster_links_by_row(annots, y_tol=8.0):
    """Cluster annotation links into rows by Y, then unique URIs left-to-right."""
    if not annots:
        return []
    rows = []
    current = [annots[0]]
    for a in annots[1:]:
        if abs(a["y"] - current[0]["y"]) <= y_tol:
            current.append(a)
        else:
            rows.append(current)
            current = [a]
    rows.append(current)

    result = []
    for row in rows:
        row_sorted = sorted(row, key=lambda i: i["x"])
        uris = unique_ordered([a["uri"] for a in row_sorted])
        result.append(
            {
                "y": row[0]["y"],
                "uris": uris,
                "count": len(uris),
            }
        )
    return result


def main():
    reader = PdfReader(str(PDF))
    pages_out = []
    for pi in range(3, 63):  # pages 4-63 (0-indexed 3..62)
        page = reader.pages[pi]
        text = page.extract_text() or ""
        annots = get_annots_with_pos(page)
        rows = cluster_links_by_row(annots)
        week = detect_week(text)
        day_id, focus = detect_day(text)
        block = detect_block(text)
        pages_out.append(
            {
                "page": pi + 1,
                "week": week,
                "dayId": day_id,
                "focus": focus,
                "block": block,
                "text": text,
                "linkRows": rows,
                "uniqueLinks": unique_ordered([a["uri"] for a in annots]),
                "annotCount": len(annots),
            }
        )
        print(
            f"p{pi+1:02d} week={week} day={day_id} focus={focus} "
            f"block={block} links={len(annots)} rows={len(rows)} unique={len(unique_ordered([a['uri'] for a in annots]))}"
        )

    OUT.write_text(json.dumps(pages_out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
