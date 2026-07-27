#!/usr/bin/env python3
"""Parse BBTS Beginner PDF raw dump into structured workout JSON."""
from __future__ import annotations

import json
import re
from pathlib import Path

RAW = Path(__file__).resolve().parent / "pdf_raw.json"
OUT = Path(__file__).resolve().parent / "bbts_parsed.json"

SCHEDULE_DAYS = ["upper", "lower", "pull", "push", "legs"]
DAY_LABELS = {
    "upper": ("Upper", "Strength Focus"),
    "lower": ("Lower", "Strength Focus"),
    "pull": ("Pull", "Hypertrophy Focus"),
    "push": ("Push", "Hypertrophy Focus"),
    "legs": ("Legs", "Hypertrophy Focus"),
}

# Blocks by week ranges (from guidebook / PDF headers)
def block_for_week(w: int) -> str:
    if w <= 4:
        return "Foundation Block"
    if w <= 8:
        return "Intensification Block"
    return "Peak Block"


def slugify(name: str) -> str:
    s = name.lower()
    s = s.replace("°", "deg")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def normalize_name(s: str) -> str:
    s = s.replace("\u00ad", "")  # soft hyphen
    s = re.sub(r"\s+", " ", s).strip()
    # common OCR / layout glitches
    s = s.replace("si z e", "size").replace("s q uee z ing", "squeezing")
    s = s.replace("you ' ve", "you've").replace("don ' t", "don't")
    return s


def parse_rpe(token: str):
    token = token.strip()
    if not token or token.upper() in ("N/A", "NA", "—", "-"):
        return None
    token = token.replace("~", "").strip()
    # ~6-7 or 6-7 or 6
    m = re.match(r"^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$", token)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.match(r"^(\d+(?:\.\d+)?)$", token)
    if m:
        return m.group(1)
    return token


def parse_rest(token: str):
    token = token.strip()
    if not token or token.upper() in ("N/A", "NA"):
        return None, None
    # 3-5 min, 1-2 min, 2-3 min
    m = re.match(r"^(\d+)\s*[-–—]\s*(\d+)\s*min", token, re.I)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        mid = int(round(((lo + hi) / 2) * 60))
        return f"{lo}-{hi} min", mid
    m = re.match(r"^(\d+)\s*min", token, re.I)
    if m:
        n = int(m.group(1))
        return f"{n} min", n * 60
    return token, None


def parse_warmup(token: str) -> str:
    return token.strip()


def parse_working_sets(token: str) -> int:
    token = token.strip()
    m = re.match(r"^(\d+)$", token)
    if m:
        return int(m.group(1))
    m = re.match(r"^(\d+)\s*[-–—]\s*(\d+)$", token)
    if m:
        # take higher end as target working sets count for drafts
        return int(m.group(2))
    return int(re.search(r"\d+", token).group()) if re.search(r"\d+", token) else 1


def parse_intensity(token: str):
    t = token.strip()
    if not t or t.upper() in ("N/A", "NA", "—", "-"):
        return None
    return t


def extract_exercise_names_block(text: str, n: int) -> list[str]:
    """
    Exercise names appear at the top of the page in multi-line wrapped form,
    before the first rest token like '3-5 min'.
    """
    lines = [normalize_name(l) for l in text.splitlines()]
    lines = [l for l in lines if l]

    # skip header until after WEEK N
    start = 0
    for i, l in enumerate(lines):
        if re.match(r"^WEEK\s+\d+", l, re.I):
            start = i + 1
            break

    # collect until we hit a rest pattern or column header leftovers
    stop_re = re.compile(
        r"^(\d+\s*[-–—]\s*\d+\s*min|\d+\s*min|N/A|Exercise|Last\s*-?\s*Set|WORKING|Warm-up|Upper|Lower|Pull|Push|Legs|Foundation|Intensification|Peak|Note:|The Bodybuilding|Trac)",
        re.I,
    )

    buf = []
    names = []
    i = start
    while i < len(lines) and len(names) < n:
        l = lines[i]
        if stop_re.match(l):
            break
        # skip empty-ish
        if len(l) <= 1:
            i += 1
            continue
        buf.append(l)
        # heuristic: name ends when next line looks like new capitalized exercise start
        # OR when we have enough and next is rest
        # Join multi-line names: keep accumulating until line doesn't look like continuation
        # Continuation typically: lowercase start, or short fragment, or ends mid-word
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        end_name = False
        if stop_re.match(nxt):
            end_name = True
        elif nxt and nxt[0].isupper() and not nxt.startswith(("Option", "SETS", "SET ")):
            # next starts new exercise — but careful with mid-name Caps
            # If current ends with common incomplete words, continue
            incomplete = ("DB", "Cable", "Machine", "Barbell", "Smith", "High", "Wide", "Single-Arm",
                          "Lean-In", "Bottom-Half", "Dual-Handle", "Overhead", "Seated", "Standing",
                          "Incline", "Lying", "Romanian", "Hack", "Leg", "Calf", "Lat", "Chest",
                          "Triceps", "Bicep", "Shoulder", "Pec", "Face", "Hammer", "Bayesian",
                          "Super-", "Stretch", "Deficit", "Cuffed", "Neutral", "Close", "EZ")
            if any(l.endswith(w) for w in incomplete) or l.endswith("-"):
                end_name = False
            else:
                end_name = True
        if end_name:
            name = normalize_name(" ".join(buf))
            names.append(name)
            buf = []
        i += 1

    if buf and len(names) < n:
        names.append(normalize_name(" ".join(buf)))

    return names


def extract_column_tokens(text: str) -> dict:
    """
    After exercise names, columns appear in this order in jumbled text:
    Rest values (N times), Early RPE or Last RPE blocks, Reps, Working sets, Warm-ups,
    then intensity (N/A or Failure...), then sub names mixed with notes.

    Empirically for Beginner week 1 Upper:
    Rest → Early RPE (N/A) → Last RPE (~n) → Reps → Working → Warmup → Intensity → Subs → Notes
    """
    # Find first rest token position in full text
    rest_tokens = re.findall(r"\b\d+\s*[-–—]\s*\d+\s*min\b|\b\d+\s*min\b", text, re.I)
    # Also catch standalone N/A sequences later

    # Split text into lines for sequential token harvest after names
    lines = [normalize_name(l) for l in text.splitlines() if normalize_name(l)]

    # Find index of first rest-like line
    rest_idx = None
    for i, l in enumerate(lines):
        if re.match(r"^(\d+\s*[-–—]\s*\d+\s*min|\d+\s*min)$", l, re.I):
            rest_idx = i
            break
    if rest_idx is None:
        return {}

    # Collect consecutive rest lines
    rests = []
    i = rest_idx
    while i < len(lines) and re.match(r"^(\d+\s*[-–—]\s*\d+\s*min|\d+\s*min)$", lines[i], re.I):
        rests.append(lines[i])
        i += 1

    n = len(rests)

    def take_n(pred, count):
        nonlocal i
        out = []
        while i < len(lines) and len(out) < count:
            l = lines[i]
            if pred(l):
                out.append(l)
                i += 1
            else:
                # skip headers / garbage
                if re.match(r"^(N/A|~?\d|Failure|Myo|Partial|Lengthened|Pause|Drop)", l, re.I) or pred(l):
                    # if doesn't match pred, break unless skippable header
                    if not pred(l):
                        if re.match(r"^(Exercise|Last|Substitution|Option|NOTES|WORKING|Warm-up|Sets|Reps|Earl|Rest|Upper|Lower|Pull|Push|Legs|Foundation|Note:|The Bodybuilding|Trac|SET |Intensity)", l, re.I):
                            i += 1
                            continue
                        break
                else:
                    if re.match(r"^(Exercise|Last|Substitution|Option|NOTES|WORKING|Warm-up|Sets|Reps|Earl|Rest|Upper|Lower|Pull|Push|Legs|Foundation|Note:|The Bodybuilding|Trac|SET |Intensity|Technique)", l, re.I):
                        i += 1
                        continue
                    break
        return out

    def is_rpe(l):
        return bool(re.match(r"^(N/A|~?\d+(?:\.\d+)?(?:\s*[-–—]\s*\d+(?:\.\d+)?)?)$", l, re.I))

    def is_reps(l):
        return bool(re.match(r"^\d+\s*[-–—]\s*\d+$", l)) or bool(re.match(r"^\d+\+$", l))

    def is_int_token(l):
        return bool(re.match(r"^\d+$", l))

    def is_warmup(l):
        return bool(re.match(r"^\d+(\s*[-–—]\s*\d+)?$", l))

    def is_intensity(l):
        if re.match(r"^N/A$", l, re.I):
            return True
        if re.match(r"^(Failure|Myo-?reps|Partials?|Lengthened Partials?|Pause|Drop ?sets?|Rest-?Pause)$", l, re.I):
            return True
        # multi-word intensity may continue
        return False

    # After rests, typically Early RPE (n tokens), Last RPE (n), Reps (n), Working (n), Warmup (n), Intensity (n)
    # Skip any header junk
    while i < len(lines) and re.match(
        r"^(Exercise|Last|Substitution|Option|NOTES|WORKING|Warm-up|Sets|Reps|Earl|Rest|Upper|Lower|Pull|Push|Legs|Foundation|Note:|The Bodybuilding|Trac|SET |Intensity|Technique|N/A)$",
        lines[i],
        re.I,
    ):
        # Don't skip N/A if we're about to collect RPE - actually N/A IS rpe
        if re.match(r"^N/A$", lines[i], re.I):
            break
        i += 1

    early = take_n(is_rpe, n)
    last = take_n(is_rpe, n)
    reps = take_n(is_reps, n)
    working = take_n(is_int_token, n)
    warmup = take_n(is_warmup, n)

    # Intensity: often N/A repeated, or Failure etc.
    intensity = []
    while i < len(lines) and len(intensity) < n:
        l = lines[i]
        if re.match(r"^N/A$", l, re.I):
            intensity.append("N/A")
            i += 1
            continue
        if re.match(
            r"^(Failure|Myo-?reps?|Partials?|Lengthened Partials?|1\.5x|Pause|Drop|Rest-?Pause|Isometric)",
            l,
            re.I,
        ):
            # may be multi-line
            parts = [l]
            i += 1
            while i < len(lines) and not re.match(
                r"^(N/A|Failure|Myo|Partial|Lengthened|Pause|Drop|Rest|Isometric|\d|45|Exercise|Substitution|Option|NOTES|Upper|Lower|Pull|Push|Legs|[A-Z][a-z].{8,})",
                lines[i],
                re.I,
            ):
                # continuation of technique name
                if len(lines[i]) < 40 and not lines[i].endswith("."):
                    parts.append(lines[i])
                    i += 1
                else:
                    break
            intensity.append(normalize_name(" ".join(parts)))
            continue
        break

    return {
        "n": n,
        "rest": rests,
        "earlyRpe": early,
        "lastRpe": last,
        "reps": reps,
        "workingSets": working,
        "warmupSets": warmup,
        "intensity": intensity,
        "cursor": i,
        "lines": lines,
    }


def extract_subs_and_notes(cols: dict, n: int):
    """
    After numeric columns, primary names already extracted.
    Remaining text has Sub1 names (n), Sub2 names (n), then notes.
    But layout jumble often puts Sub1 right after intensity as exercise-like names,
    then Sub2, then notes paragraphs.

    Strategy: from cursor, collect name-like lines into groups until we hit long note sentences.
    """
    lines = cols["lines"]
    i = cols["cursor"]
    # Skip headers
    while i < len(lines) and re.match(
        r"^(Exercise|Last|Substitution|Option|NOTES|WORKING|Warm-up|Sets|Reps|Intensity|Technique|N/A)$",
        lines[i],
        re.I,
    ):
        i += 1

    # Collect all remaining lines
    remaining = lines[i:]

    # Notes typically are longer sentences with periods
    note_start = None
    for idx, l in enumerate(remaining):
        if len(l) > 60 or (l.endswith(".") and len(l) > 40) or l.startswith(
            ("1 second", "Do one", "1.5x", "Focus on", "Stand on", "Optionally", "If you", "Set the", "Prevent", "Keep", "Use a", "Control", "Think", "Drive", "Brace", "Pause", "Squeeze", "Aim", "Try to", "Allow", "Maintain", "Slow", "Feel", "Get a", "Push", "Pull", "Don't", "Note:")
        ):
            # careful: "Push"/"Pull" alone are day names
            if l in ("Push", "Pull", "Upper", "Lower", "Legs"):
                continue
            note_start = idx
            break

    name_region = remaining[:note_start] if note_start is not None else remaining
    note_region = remaining[note_start:] if note_start is not None else []

    # Filter out day headers / block names from name_region
    filtered = []
    for l in name_region:
        if re.match(
            r"^(Upper|Lower|Pull|Push|Legs|Foundation|Intensification|Peak|Note:|The Bodybuilding|Trac|SET |Option|Substitution|NOTES|\(.*Focus)",
            l,
            re.I,
        ):
            continue
        if re.match(r"^\(.*Focus", l):
            continue
        filtered.append(l)

    # Reconstruct multi-line sub names — we need 2*n names
    # Join using similar heuristic as primary names
    def join_names(src_lines, count):
        names = []
        buf = []
        incomplete_ends = (
            "DB", "Cable", "Machine", "Barbell", "Smith", "High", "Wide", "Single-Arm",
            "Lean-In", "Bottom-Half", "Dual-Handle", "Overhead", "Seated", "Standing",
            "Incline", "Lying", "Romanian", "Hack", "Leg", "Calf", "Lat", "Chest",
            "Triceps", "Bicep", "Shoulder", "Pec", "Face", "Hammer", "Bayesian",
            "Super-", "Stretch", "Deficit", "Cuffed", "Neutral", "Close", "EZ",
            "45°", "45deg", "Pendlay", "Nordic", "Goblet", "Safety", "Glute",
            "Hip", "Ab", "Cable", "Low", "High-Cable", "Lat", "Assisted"
        )
        j = 0
        while j < len(src_lines) and len(names) < count:
            l = src_lines[j]
            buf.append(l)
            nxt = src_lines[j + 1] if j + 1 < len(src_lines) else ""
            end = False
            if not nxt:
                end = True
            elif nxt[0].isupper() and not any(l.endswith(w) for w in incomplete_ends) and not l.endswith("-"):
                end = True
            if end:
                names.append(normalize_name(" ".join(buf)))
                buf = []
            j += 1
        if buf and len(names) < count:
            names.append(normalize_name(" ".join(buf)))
        return names, src_lines[j:]

    # Primary names already known; name_region should be Sub1 + Sub2
    all_subs, leftover = join_names(filtered, n * 2)
    # leftover might be note fragments that were short
    if leftover:
        note_region = leftover + note_region

    sub1 = all_subs[:n]
    sub2 = all_subs[n : n * 2]

    # Split notes into n paragraphs — notes are separated roughly by exercise order
    # Join note lines into text, then split by sentence groups heuristically
    notes_text = normalize_name(" ".join(note_region))
    # Remove footer junk
    notes_text = re.split(r"Exercise Last|WORKING|The Bodybuilding Transformation System|Trac k|Tracking Load", notes_text)[0]
    notes_text = normalize_name(notes_text)

    # Split notes: they often start with distinctive phrases; use period-separated chunks grouped to n
    # Simpler approach: if we can find n note blocks by known starters, use that
    # Fallback: put full notes on first exercise only is bad — try splitting by ". " into sentences and group
    sentences = re.split(r"(?<=[.!?])\s+", notes_text.strip()) if notes_text.strip() else []
    sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 5]

    notes = [""] * n
    if len(sentences) == n:
        notes = sentences
    elif len(sentences) > n:
        # group consecutive sentences; prefer one note per exercise by equal split
        # Better: many exercises have exactly 1 sentence note
        # If more sentences than n, distribute extras to longer notes
        per = len(sentences) / n
        for ei in range(n):
            a = int(round(ei * per))
            b = int(round((ei + 1) * per))
            notes[ei] = " ".join(sentences[a:b]).strip()
    elif sentences:
        for ei, s in enumerate(sentences):
            if ei < n:
                notes[ei] = s

    return sub1, sub2, notes


def map_youtube_rows(link_rows: list, n: int):
    """
    Link rows clustered by Y. Typically each exercise has a row with 1-3 unique URLs
    (primary, sub1, sub2). Some rows are duplicates / tracking cells.
    Prefer rows with 2-3 unique URIs; take first n such rows top-to-bottom.
    """
    candidates = [r for r in link_rows if r["count"] >= 1]
    # Prefer rows that look like exercise link groups (2 or 3 links)
    preferred = [r for r in candidates if r["count"] >= 2]
    if len(preferred) >= n:
        rows = preferred[:n]
    else:
        # fall back: take unique-y rows with at least 1, dedupe by first uri sequence
        rows = []
        seen = set()
        for r in candidates:
            key = tuple(r["uris"])
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
            if len(rows) >= n:
                break
    result = []
    for r in rows[:n]:
        uris = r["uris"]
        result.append(
            {
                "youtubeUrl": uris[0] if len(uris) > 0 else None,
                "sub1Url": uris[1] if len(uris) > 1 else None,
                "sub2Url": uris[2] if len(uris) > 2 else None,
            }
        )
    while len(result) < n:
        result.append({"youtubeUrl": None, "sub1Url": None, "sub2Url": None})
    return result


def parse_page(page: dict, day_id: str, week: int):
    text = page["text"]
    cols = extract_column_tokens(text)
    n = cols.get("n") or 0
    if n == 0:
        # try estimate from unique links / 3
        n = max(1, len(page.get("uniqueLinks") or []) // 3)

    names = extract_exercise_names_block(text, n)
    # If name count mismatch, adjust n to min
    if names and cols.get("n"):
        n = min(len(names), cols["n"])
        names = names[:n]
    elif names:
        n = len(names)

    yt = map_youtube_rows(page.get("linkRows") or [], n)
    sub1, sub2, notes = extract_subs_and_notes(cols, n) if cols.get("n") else ([], [], [""] * n)

    label, default_focus = DAY_LABELS[day_id]
    focus = page.get("focus") or default_focus
    # Fix focus by day type
    if day_id in ("upper", "lower"):
        focus = "Strength Focus"
    else:
        focus = "Hypertrophy Focus"

    exercises = []
    for i in range(n):
        name = names[i] if i < len(names) else f"Exercise {i+1}"
        rest_txt, rest_sec = parse_rest(cols["rest"][i]) if i < len(cols.get("rest", [])) else (None, None)
        early = parse_rpe(cols["earlyRpe"][i]) if i < len(cols.get("earlyRpe", [])) else None
        last = parse_rpe(cols["lastRpe"][i]) if i < len(cols.get("lastRpe", [])) else None
        reps = cols["reps"][i] if i < len(cols.get("reps", [])) else ""
        reps = reps.replace("–", "-").replace("—", "-")
        ws = parse_working_sets(cols["workingSets"][i]) if i < len(cols.get("workingSets", [])) else 1
        wu = parse_warmup(cols["warmupSets"][i]) if i < len(cols.get("warmupSets", [])) else "1"
        inten = parse_intensity(cols["intensity"][i]) if i < len(cols.get("intensity", [])) else None

        s1_name = sub1[i] if i < len(sub1) else None
        s2_name = sub2[i] if i < len(sub2) else None
        substitutes = []
        if s1_name:
            substitutes.append({"name": s1_name, "youtubeUrl": yt[i]["sub1Url"]})
        if s2_name:
            substitutes.append({"name": s2_name, "youtubeUrl": yt[i]["sub2Url"]})

        exercises.append(
            {
                "id": slugify(name),
                "name": name,
                "youtubeUrl": yt[i]["youtubeUrl"],
                "intensityTechnique": inten,
                "warmupSets": wu,
                "workingSets": ws,
                "reps": reps,
                "earlySetRpe": early,
                "lastSetRpe": last,
                "rest": rest_txt,
                "restSeconds": rest_sec,
                "substitutes": substitutes,
                "notes": notes[i] if i < len(notes) else "",
            }
        )

    return {
        "focus": focus,
        "block": block_for_week(week),
        "exercises": exercises,
        "_meta": {
            "page": page["page"],
            "parsedN": n,
            "nameCount": len(names),
            "names": names,
        },
    }


def main():
    pages = json.loads(RAW.read_text(encoding="utf-8"))
    # Assign days by order within each week (5 pages per week)
    by_week: dict[int, list] = {}
    for p in pages:
        by_week.setdefault(p["week"], []).append(p)
    for w in by_week:
        by_week[w].sort(key=lambda x: x["page"])

    program = {
        "id": "bbts-beginner-2025",
        "name": "Bodybuilding Transformation System",
        "level": "Beginner",
        "weeksTotal": 12,
        "schedule": ["upper", "lower", "rest", "pull", "push", "legs"],
        "weeks": {},
    }

    for week in range(1, 13):
        week_pages = by_week.get(week, [])
        week_data = {}
        for idx, page in enumerate(week_pages[:5]):
            day_id = SCHEDULE_DAYS[idx]
            week_data[day_id] = parse_page(page, day_id, week)
        week_data["rest"] = {"focus": None, "block": block_for_week(week), "exercises": []}
        program["weeks"][str(week)] = week_data
        # summary
        for d in SCHEDULE_DAYS:
            exs = week_data[d]["exercises"]
            print(f"W{week:02d} {d:5s}: {len(exs)} ex | {[e['name'] for e in exs[:3]]}...")

    OUT.write_text(json.dumps(program, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
