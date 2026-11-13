"""Aggregates React's dev performance-track component entries inside the longest main-thread task.

Usage: python3 react-track.py <trace.json> [task-rank]
"""
import collections
import json
import sys

events = json.load(open(sys.argv[1]))["traceEvents"]
rank = int(sys.argv[2]) if len(sys.argv) > 2 else 0
threads = {(e["pid"], e["tid"]) for e in events if e.get("name") == "thread_name" and e.get("args", {}).get("name") == "CrRendererMain"}
tasks = sorted(
    (e for e in events if e.get("name") == "RunTask" and (e["pid"], e["tid"]) in threads and e.get("dur")),
    key=lambda e: -e["dur"],
)
task = tasks[rank]
start, end = task["ts"], task["ts"] + task["dur"]

entries = []
for e in events:
    data = e.get("args", {}).get("data", {})
    if e.get("name") != "TimeStamp" or data.get("track") != "Components ⚛":
        continue
    s, t = data.get("start"), data.get("end")
    if s is None or t is None:
        continue
    entries.append((s, t, data.get("name") or data.get("message")))

# TimeStamp start/end are in the performance.now() clock; align to the task by the event's ts.
stamps = [e for e in events if e.get("name") == "TimeStamp" and e.get("args", {}).get("data", {}).get("track") == "Components ⚛" and start <= e["ts"] <= end]
names_in_task = collections.Counter(e["args"]["data"].get("name") for e in stamps)
inclusive = collections.Counter()
for e in stamps:
    data = e["args"]["data"]
    inclusive[data.get("name")] += (data["end"] - data["start"])

# Self time: subtract direct children (entries nested inside, same track) using an interval stack.
spans = sorted(((e["args"]["data"]["start"], e["args"]["data"]["end"], e["args"]["data"].get("name")) for e in stamps), key=lambda x: (x[0], -x[1]))
self_time = collections.Counter()
stack = []
for s, t, name in spans:
    while stack and stack[-1][1] <= s:
        stack.pop()
    if stack:
        self_time[stack[-1][2]] -= (t - s)
    self_time[name] += (t - s)
    stack.append((s, t, name))

print(f"task {task['dur'] / 1000:.0f} ms; component entries {len(stamps)}; distinct {len(names_in_task)}")
print("== most instances rendered")
for name, count in names_in_task.most_common(25):
    print(f"{count:6d}  {name}")
print("== self ms (React dev track units)")
for name, ms in self_time.most_common(30):
    print(f"{ms:8.1f}  x{names_in_task[name]:<5d} {name}")
