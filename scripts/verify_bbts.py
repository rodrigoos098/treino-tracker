#!/usr/bin/env python3
import json

p = json.load(open(r"C:\Users\spyki\treino-tracker\scripts\bbts_parsed.json", encoding="utf-8"))


def show(week, day):
    d = p["weeks"][str(week)][day]
    print(f"=== W{week} {day} | {d['focus']} | {d['block']} | {len(d['exercises'])} ex ===")
    for i, e in enumerate(d["exercises"], 1):
        subs = ", ".join(s["name"] for s in e["substitutes"])
        print(f"{i}. {e['name']}")
        print(
            f"   id={e['id']} WU={e['warmupSets']} WS={e['workingSets']} reps={e['reps']} "
            f"early={e['earlySetRpe']} last={e['lastSetRpe']} rest={e['rest']} "
            f"({e['restSeconds']}s) inten={e['intensityTechnique']}"
        )
        print(f"   yt={e['youtubeUrl']}")
        print(f"   subs=[{subs}]")
        notes = e["notes"]
        print(f"   notes={notes[:90]}..." if len(notes) > 90 else f"   notes={notes}")


show(1, "upper")
print()
show(1, "lower")
print()
show(7, "upper")
print()
show(12, "push")

total = with_yt = with_subs = missing_reps = 0
for w in range(1, 13):
    for day in ["upper", "lower", "pull", "push", "legs"]:
        for e in p["weeks"][str(w)][day]["exercises"]:
            total += 1
            if e["youtubeUrl"]:
                with_yt += 1
            if e["substitutes"]:
                with_subs += 1
            if not e["reps"]:
                missing_reps += 1
                print("MISSING REPS", w, day, e["name"])

print(f"\nCoverage: {with_yt}/{total} youtube, {with_subs}/{total} substitutes, missing_reps={missing_reps}")

# ID stability sample
ids_w1 = {e["name"]: e["id"] for e in p["weeks"]["1"]["upper"]["exercises"]}
ids_w5 = {e["name"]: e["id"] for e in p["weeks"]["5"]["upper"]["exercises"]}
print("ID stable W1->W5 upper:", all(ids_w1[n] == ids_w5[n] for n in ids_w1 if n in ids_w5))
