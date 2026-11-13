import glob
import json
import statistics
import sys

rows = {}
for path in glob.glob("/tmp/perf/results/[A-E]-*.json"):
    name = path.rsplit("/", 1)[1]
    label, rest = name.split("-", 1)
    variant = rest.rsplit("-", 1)[0].rstrip("-")
    for result in json.load(open(path)):
        rows.setdefault((label, variant), []).append(result)

keys = [
    ("renderTotalMs", "render total ms"),
    ("renderMeanMs", "render mean ms/commit"),
    ("renderP95Ms", "render p95 ms"),
    ("commitsPerUpdate", "commits/update"),
    ("scriptMs", "script ms"),
    ("taskMs", "main-thread task ms"),
    ("longTasks", "long tasks"),
    ("longTaskMs", "long task ms"),
    ("loafs", "LoAF"),
    ("loafBlockingMs", "LoAF blocking ms"),
    ("framesOver33", "frames >33ms"),
]
out = {}
for (label, variant), results in sorted(rows.items()):
    entry = {"n": len(results), "updates": results[0]["updates"], "items": results[0]["items"]}
    for key, _ in keys:
        values = [r[key] for r in results]
        entry[key] = statistics.median(values)
        entry[key + "_min"] = min(values)
        entry[key + "_max"] = max(values)
    entry["renderPerUpdateMs"] = entry["renderTotalMs"] / entry["updates"]
    entry["errors"] = sorted({e for r in results for e in r["errors"] if "404" not in e})
    out[f"{label}:{variant}"] = entry

json.dump(out, open("/tmp/perf/summary.json", "w"), indent=1)
header = f"{'run':16}" + "".join(f"{label[:14]:>16}" for _, label in keys) + f"{'render/upd':>12}"
print(header)
for name, entry in out.items():
    line = f"{name + ' n=' + str(entry['n']):16}" + "".join(
        f"{entry[key]:>16.2f}" for key, _ in keys
    ) + f"{entry['renderPerUpdateMs']:>12.2f}"
    print(line)
    if entry["errors"]:
        print("   errors:", entry["errors"][:2])
