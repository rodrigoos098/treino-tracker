#!/usr/bin/env python3
"""
Extract BBTS Beginner program from PDF using PyMuPDF positional text.
Page layout (landscape spreadsheet): columns by x0.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import fitz

PDF = Path(
    r"C:\Users\spyki\Downloads\The Bodybuilding Transformation System (Beginner)"
    r"{Jeff Nippard}(2025, Jeff Nippard){108122745} libgen.li.pdf"
)
OUT_JSON = Path(__file__).resolve().parent / "bbts_parsed.json"
OUT_JS = Path(__file__).resolve().parents[1] / "js" / "data" / "bbts-beginner.js"

SCHEDULE_DAYS = ["upper", "lower", "pull", "push", "legs"]
DAY_META = {
    "upper": ("Upper", "Strength Focus"),
    "lower": ("Lower", "Strength Focus"),
    "pull": ("Pull", "Hypertrophy Focus"),
    "push": ("Push", "Hypertrophy Focus"),
    "legs": ("Legs", "Hypertrophy Focus"),
}


def block_for_week(w: int) -> str:
    if w <= 4:
        return "Foundation Block"
    if w <= 8:
        return "Intensification Block"
    return "Peak Block"


def slugify(name: str) -> str:
    s = name.lower().replace("°", "deg")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def clean_uri(u: str | None) -> str | None:
    if not u:
        return None
    return re.sub(r"\?si=[^&]+", "", str(u))


def normalize(s: str) -> str:
    s = s.replace("\u00ad", "").replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


# Column x-centers observed on page 4 (width ~2356). Tolerances allow drift across pages.
# Order left→right:
# exercise ~200, intensity ~410, warmup ~548, working ~646, reps ~740,
# (tracking sets ~900-1100 ignored), earlyRpe ~1220, lastRpe ~1315, rest ~1415,
# sub1 ~1535, sub2 ~1680, notes ~2000
COL_BANDS = [
    ("exercise", 140, 345),
    ("intensity", 350, 490),
    ("warmup", 500, 590),
    ("working", 600, 690),
    ("reps", 700, 800),
    ("earlyRpe", 1150, 1280),
    ("lastRpe", 1285, 1370),
    ("rest", 1375, 1470),
    ("sub1", 1470, 1610),
    ("sub2", 1610, 1770),
    ("notes", 1770, 2320),
]


def col_for_x(x: float) -> str | None:
    for name, lo, hi in COL_BANDS:
        if lo <= x <= hi:
            return name
    return None


def get_text_blocks(page):
    """Return list of {x0,y0,x1,y1,text} for text blocks."""
    out = []
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
        out.append(
            {
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
                "yc": (y0 + y1) / 2,
                "text": normalize(" ".join(lines)),
            }
        )
    return out


def get_links(page):
    """YouTube links with positions."""
    links = []
    for ln in page.get_links():
        uri = ln.get("uri")
        if not uri or ("youtu" not in uri.lower() and "youtube" not in uri.lower()):
            continue
        rect = ln.get("from")
        if rect is None:
            continue
        links.append(
            {
                "uri": clean_uri(uri),
                "x0": rect.x0,
                "y0": rect.y0,
                "x1": rect.x1,
                "y1": rect.y1,
                "yc": (rect.y0 + rect.y1) / 2,
                "xc": (rect.x0 + rect.x1) / 2,
            }
        )
    links.sort(key=lambda a: (a["yc"], a["xc"]))
    return links


def cluster_rows(blocks, y_tol=28.0):
    """
    Cluster content blocks into exercise rows by y-center.
    Ignore header/footer (y < 220 or y > 1080 typically).
    """
    content = [b for b in blocks if 195 <= b["yc"] <= 1080]
    content.sort(key=lambda b: b["yc"])
    rows = []
    for b in content:
        if not rows or abs(b["yc"] - rows[-1]["yc"]) > y_tol:
            rows.append({"yc": b["yc"], "blocks": [b]})
        else:
            rows[-1]["blocks"].append(b)
            # update running yc average lightly
            rows[-1]["yc"] = sum(x["yc"] for x in rows[-1]["blocks"]) / len(rows[-1]["blocks"])
    return rows


def row_fields(row_blocks):
    fields = defaultdict(list)
    for b in row_blocks:
        col = col_for_x(b["x0"])
        if col:
            fields[col].append(b["text"])
    return {k: normalize(" ".join(v)) for k, v in fields.items()}


def parse_rpe(token: str):
    if not token:
        return None
    t = token.strip()
    if t.upper() in ("N/A", "NA", "—", "-", "–"):
        return None
    t = t.replace("~", "").strip()
    m = re.match(r"^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.match(r"^(\d+(?:\.\d+)?)$", t)
    if m:
        return m.group(1)
    return t


def parse_rest(token: str):
    if not token:
        return None, None
    t = token.strip()
    m = re.match(r"^(\d+)\s*[-–—]\s*(\d+)\s*min", t, re.I)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return f"{lo}-{hi} min", int(round(((lo + hi) / 2) * 60))
    m = re.match(r"^(\d+)\s*min", t, re.I)
    if m:
        n = int(m.group(1))
        return f"{n} min", n * 60
    return t, None


def parse_working(token: str) -> int:
    if not token:
        return 1
    m = re.search(r"(\d+)\s*[-–—]\s*(\d+)", token)
    if m:
        return int(m.group(2))
    m = re.search(r"(\d+)", token)
    return int(m.group(1)) if m else 1


def parse_intensity(token: str):
    if not token:
        return None
    t = token.strip()
    if t.upper() in ("N/A", "NA", "—", "-"):
        return None
    return t


HEADER_NOISE = re.compile(
    r"^(WEEK\s+\d+|Upper|Lower|Pull|Push|Legs|Foundation|Intensification|Peak|"
    r"Exercise|Last-Set|Technique|Substitution|Option|NOTES|WORKING|Warm-up|"
    r"Sets|Reps|Early|Rest|Tracking|SET\s*\d|The Bodybuilding|Note:)",
    re.I,
)


def is_exercise_row(fields: dict) -> bool:
    """A real exercise row should have an exercise name and usually reps or rest."""
    ex = fields.get("exercise", "")
    if not ex or len(ex) < 3:
        return False
    if HEADER_NOISE.match(ex):
        return False
    # Must have at least one of: reps, rest, working
    if not (fields.get("reps") or fields.get("rest") or fields.get("working")):
        return False
    return True


def links_for_row(links, yc, y_tol=35.0):
    row_links = [l for l in links if abs(l["yc"] - yc) <= y_tol]
    row_links.sort(key=lambda l: l["xc"])
    # Deduplicate consecutive same URI
    uris = []
    for l in row_links:
        if not uris or uris[-1] != l["uri"]:
            uris.append(l["uri"])
    # Classify by x column
    by_col = {"exercise": None, "sub1": None, "sub2": None}
    for l in row_links:
        col = col_for_x(l["x0"])
        if col in by_col and by_col[col] is None:
            by_col[col] = l["uri"]
    # Fallback: assign left-to-right unique
    uniq = []
    for u in uris:
        if u not in uniq:
            uniq.append(u)
    if by_col["exercise"] is None and uniq:
        by_col["exercise"] = uniq[0]
    if by_col["sub1"] is None and len(uniq) > 1:
        by_col["sub1"] = uniq[1]
    if by_col["sub2"] is None and len(uniq) > 2:
        by_col["sub2"] = uniq[2]
    return by_col


def parse_page(page, day_id: str, week: int):
    blocks = get_text_blocks(page)
    links = get_links(page)
    rows = cluster_rows(blocks)
    exercises = []
    for row in rows:
        fields = row_fields(row["blocks"])
        if not is_exercise_row(fields):
            continue
        yt = links_for_row(links, row["yc"])
        name = fields.get("exercise", "")
        # Clean name: sometimes intensity bleeds — keep first exercise-like chunk
        name = re.sub(r"\s+N/A\s*$", "", name).strip()
        rest_txt, rest_sec = parse_rest(fields.get("rest", ""))
        reps = fields.get("reps", "").replace("–", "-").replace("—", "-")
        substitutes = []
        if fields.get("sub1"):
            substitutes.append({"name": fields["sub1"], "youtubeUrl": yt["sub1"]})
        if fields.get("sub2"):
            substitutes.append({"name": fields["sub2"], "youtubeUrl": yt["sub2"]})

        exercises.append(
            {
                "id": slugify(name),
                "name": name,
                "youtubeUrl": yt["exercise"],
                "intensityTechnique": parse_intensity(fields.get("intensity", "")),
                "warmupSets": fields.get("warmup") or "1",
                "workingSets": parse_working(fields.get("working", "1")),
                "reps": reps,
                "earlySetRpe": parse_rpe(fields.get("earlyRpe", "")),
                "lastSetRpe": parse_rpe(fields.get("lastRpe", "")),
                "rest": rest_txt,
                "restSeconds": rest_sec,
                "substitutes": substitutes,
                "notes": fields.get("notes") or "",
            }
        )

    label, focus = DAY_META[day_id]
    return {
        "name": f"{label} ({focus})",
        "short": label,
        "focus": focus,
        "block": block_for_week(week),
        "exercises": exercises,
    }


def stabilize_ids(program: dict):
    """
    Reuse stable IDs across weeks for the same exercise name.
    First occurrence wins; later weeks with same name keep that id.
    """
    name_to_id = {}
    for w in range(1, 13):
        week = program["weeks"][str(w)]
        for day_id in SCHEDULE_DAYS:
            for ex in week[day_id]["exercises"]:
                key = ex["name"].lower()
                if key in name_to_id:
                    ex["id"] = name_to_id[key]
                else:
                    name_to_id[key] = ex["id"]


def to_js_module(program: dict) -> str:
    # Compact but readable JSON embedded in ES module
    body = json.dumps(program, ensure_ascii=False, indent=2)
    return (
        "/** Auto-generated from BBTS Beginner PDF — do not hand-edit bulk data. */\n"
        f"export const BBTS_BEGINNER = {body};\n"
        "export default BBTS_BEGINNER;\n"
    )


def main():
    doc = fitz.open(str(PDF))
    # Pages 4-63 = indices 3..62, 5 pages per week
    program = {
        "id": "bbts-beginner-2025",
        "name": "Bodybuilding Transformation System",
        "level": "Beginner",
        "weeksTotal": 12,
        "schedule": ["upper", "lower", "rest", "pull", "push", "legs"],
        "dayLabels": {
            "upper": "Upper",
            "lower": "Lower",
            "rest": "Descanso",
            "pull": "Pull",
            "push": "Push",
            "legs": "Legs",
        },
        "weeks": {},
    }

    for week in range(1, 13):
        week_data = {}
        for di, day_id in enumerate(SCHEDULE_DAYS):
            page_idx = 3 + (week - 1) * 5 + di
            page = doc[page_idx]
            day = parse_page(page, day_id, week)
            week_data[day_id] = day
            print(
                f"W{week:02d} p{page_idx+1:02d} {day_id:5s}: "
                f"{len(day['exercises']):2d} ex | "
                + ", ".join(e["name"] for e in day["exercises"][:3])
                + ("..." if len(day["exercises"]) > 3 else "")
            )
        week_data["rest"] = {
            "name": "Descanso",
            "short": "Rest",
            "focus": None,
            "block": block_for_week(week),
            "exercises": [],
        }
        program["weeks"][str(week)] = week_data

    stabilize_ids(program)

    # Sanity: expected exercise counts roughly 5-8 per training day
    problems = []
    for week in range(1, 13):
        for day_id in SCHEDULE_DAYS:
            n = len(program["weeks"][str(week)][day_id]["exercises"])
            if n < 4 or n > 10:
                problems.append(f"W{week} {day_id}: {n} exercises")

    OUT_JSON.write_text(json.dumps(program, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text(to_js_module(program), encoding="utf-8")
    print(f"\nWrote {OUT_JSON}")
    print(f"Wrote {OUT_JS}")
    if problems:
        print("WARNINGS:")
        for p in problems:
            print(" ", p)
    else:
        print("All days have 4-10 exercises.")


if __name__ == "__main__":
    main()
