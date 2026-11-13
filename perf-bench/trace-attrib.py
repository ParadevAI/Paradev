"""Attributes V8 CPU samples in a Chrome trace to React scheduler intervals and long tasks.

Usage: python3 trace-attrib.py <trace.json> [top-n]
For the longest main-thread task, prints each React phase (Event/Render/Commit/Effects)
with the app functions that had the most inclusive samples inside it.
"""
import collections
import json
import re
import sys

events = json.load(open(sys.argv[1]))["traceEvents"]
top_n = int(sys.argv[2]) if len(sys.argv) > 2 else 6
main = {(e["pid"], e["tid"]) for e in events if e.get("name") == "thread_name" and e.get("args", {}).get("name") == "CrRendererMain"}

main_profile = next(e for e in events if e.get("name") == "Profile" and (e["pid"], e["tid"]) in main)
nodes, samples = {}, []  # node id -> (callFrame, parent)
for e in events:
    if e.get("name") != "ProfileChunk" or e.get("id") != main_profile.get("id") or e["pid"] != main_profile["pid"]:
        continue
    data = e.get("args", {}).get("data", {})
    cpu = data.get("cpuProfile", {})
    for node in cpu.get("nodes", []):
        nodes[node["id"]] = (node.get("callFrame", {}), node.get("parent"))
    samples.append((cpu.get("samples", []), data.get("timeDeltas", [])))

profile_start = main_profile["args"]["data"]["startTime"]
timeline = []
t = profile_start
for ids, deltas in samples:
    for node_id, delta in zip(ids, deltas):
        t += delta
        timeline.append((t, node_id))


def short(url):
    url = re.sub(r"\?.*$", "", url)
    url = url.replace("http://localhost:3005/@fs/workspace/", "").replace("http://localhost:3005/", "apps/desktop/src/renderer/")
    return re.sub(r"^.*/routes/_authenticated/_dashboard/", "…/", url)


def is_app(url):
    return url.startswith("http://localhost:3005/") and "/node_modules/" not in url and "/.vite/deps/" not in url


def is_third(url):
    return "/.vite/deps/" in url or "/node_modules/" in url


def stack(node_id):
    out = []
    while node_id in nodes:
        frame, parent = nodes[node_id]
        out.append(frame)
        node_id = parent
    return out


def attribute(start, end):
    app = collections.Counter()
    lib = collections.Counter()
    for ts, node_id in timeline:
        if not (start <= ts <= end):
            continue
        seen = set()
        frames = stack(node_id)
        for frame in frames:
            url = frame.get("url", "")
            key = f"{frame.get('functionName') or '(anon)'}  {short(url)}:{frame.get('lineNumber', 0) + 1}"
            if key in seen:
                continue
            seen.add(key)
            if is_app(url):
                app[key] += 1
        leaf = frames[0] if frames else {}
        if is_third(leaf.get("url", "")):
            lib[f"{leaf.get('functionName') or '(anon)'}  {re.sub(r'^.*/deps/', '', short(leaf.get('url', '')))}"] += 1
    return app, lib


tasks = sorted((e for e in events if e.get("name") == "RunTask" and (e["pid"], e["tid"]) in main and e.get("dur")), key=lambda e: -e["dur"])
interval_ms = (timeline[1][0] - timeline[0][0]) / 1000 if len(timeline) > 1 else 0.1
for task in tasks[:2]:
    start, end = task["ts"], task["ts"] + task["dur"]
    print(f"\n######## task {task['dur'] / 1000:.0f} ms (sample interval ~{interval_ms:.2f} ms)")
    phases = sorted(
        (e["args"]["data"] for e in events if e.get("name") == "TimeStamp" and e["args"]["data"].get("trackGroup") == "Scheduler ⚛" and start <= e["ts"] <= end and not e["args"]["data"].get("message", "").endswith("Track")),
        key=lambda d: d["start"],
    )
    # Phase start/end are performance.now() ms*1000; map to trace clock by offset from first TimeStamp.
    stamp_events = [e for e in events if e.get("name") == "TimeStamp" and start <= e["ts"] <= end and e["args"]["data"].get("trackGroup") == "Scheduler ⚛" and not e["args"]["data"].get("message", "").endswith("Track")]
    offset = None
    if stamp_events:
        diffs = sorted(e["ts"] - e["args"]["data"]["end"] for e in stamp_events)
        offset = diffs[len(diffs) // 2]
    if not phases or offset is None:
        app, lib = attribute(start, end)
        for key, count in app.most_common(top_n * 3):
            print(f"  {count * interval_ms:7.1f} ms  {key}")
        continue
    for phase in phases:
        duration = (phase["end"] - phase["start"]) / 1000
        if duration < 20:
            continue
        app, lib = attribute(phase["start"] + offset, phase["end"] + offset)
        print(f"-- {phase.get('name') or phase.get('message')} {duration:.0f} ms")
        for key, count in app.most_common(top_n):
            print(f"     {count * interval_ms:7.1f} ms  {key}")
        for key, count in lib.most_common(3):
            print(f"     lib {count * interval_ms:5.1f} ms  {key}")
