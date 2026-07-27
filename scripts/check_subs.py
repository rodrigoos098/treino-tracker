#!/usr/bin/env python3
import json
import re
from pathlib import Path

t = Path(r"C:\Users\spyki\treino-tracker\js\data\bbts-beginner.js").read_text(encoding="utf-8")
m = re.search(r"export const BBTS_BEGINNER = (\{.*\});\s*export default", t, re.S)
p = json.loads(m.group(1))

suspicious = []
for w in range(1, 13):
    for day in ["upper", "lower", "pull", "push", "legs"]:
        for e in p["weeks"][str(w)][day]["exercises"]:
            for s in e["substitutes"]:
                if len(s["name"]) < 10 or s["name"] in (
                    "Lateral Raise", "Raise", "Press", "Curl", "Row", "Flye", "Squat"
                ):
                    suspicious.append((w, day, e["name"], s["name"]))

print(f"suspicious subs: {len(suspicious)}")
for item in suspicious[:30]:
    print(item)

print("--- counts ---")
for day in ["upper", "lower", "pull", "push", "legs"]:
    ns = sorted({len(p["weeks"][str(w)][day]["exercises"]) for w in range(1, 13)})
    print(day, ns)

# W1 upper first exercise full dump
ex = p["weeks"]["1"]["upper"]["exercises"][3]
print("--- W1 upper #4 ---")
print(json.dumps(ex, ensure_ascii=False, indent=2)[:800])
