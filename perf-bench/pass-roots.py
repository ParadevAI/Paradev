"""For each React render pass in the longest task, lists the outermost components that rendered.

The outermost component of a cascading pass sits at (or just below) the state update that
caused it. Usage: python3 pass-roots.py <trace.json> [task-rank]
"""
import collections
import json
import sys

events = json.load(open(sys.argv[1]))["traceEvents"]
rank = int(sys.argv[2]) if len(sys.argv) > 2 else 0
main = {(e["pid"], e["tid"]) for e in events if e.get("name") == "thread_name" and e.get("args", {}).get("name") == "CrRendererMain"}
tasks = sorted((e for e in events if e.get("name") == "RunTask" and (e["pid"], e["tid"]) in main and e.get("dur")), key=lambda e: -e["dur"])
task = tasks[rank]
lo, hi = task["ts"], task["ts"] + task["dur"]


def stamps(group_key, group_value):
    return [
        e["args"]["data"]
        for e in events
        if e.get("name") == "TimeStamp"
        and lo <= e["ts"] <= hi
        and e["args"]["data"].get(group_key) == group_value
        and not e["args"]["data"].get("message", "").endswith("Track")
    ]


passes = [d for d in stamps("trackGroup", "Scheduler ⚛") if (d.get("name") or d.get("message")) == "Render"]
components = stamps("track", "Components ⚛")
print(f"task {task['dur'] / 1000:.0f} ms, {len(passes)} render passes, {len(components)} component entries")
for index, render in enumerate(sorted(passes, key=lambda d: d["start"])):
    inside = [c for c in components if render["start"] <= c["start"] and c["end"] <= render["end"] + 1]
    inside.sort(key=lambda c: (c["start"], -c["end"]))
    roots, last_end = [], -1
    for c in inside:
        if c["start"] >= last_end:
            roots.append(c)
            last_end = c["end"]
    names = collections.Counter(c.get("name") for c in inside)
    duration = (render["end"] - render["start"]) / 1000
    root_text = ", ".join(f"{r.get('name')}({(r['end'] - r['start']) / 1000:.0f}ms)" for r in roots[:6])
    print(f"pass {index:2d} {duration:6.1f} ms  {len(inside):5d} comps  roots: {root_text}")
