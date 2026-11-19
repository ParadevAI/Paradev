"""Round 3: monthly storage and write cost, today's layout against the overlay. Prints JSON."""
import csv, json, statistics, sys
from pathlib import Path

D = Path(__file__).parent.parent / "data"
SNAP, DRIVE, WRITE = 0.08, 0.05, 0.0044  # $/GB-month snapshot, $/GB-month drive, $/GB written
IMAGE_BASE_GB = 2.83  # a fresh image box's snapshot, measured (ovl-spike-ci, round 2)


def q(x, p):
    x = sorted(x)
    return x[min(len(x) - 1, int(round(p * (len(x) - 1))))] if x else 0.0


def rates():
    a = {r["box"]: r for r in csv.DictReader((D / "diskmeter-1.csv").open()) if r.get("root_written_gb")}
    b = {r["box"]: r for r in csv.DictReader((D / "diskmeter-2.csv").open()) if r.get("root_written_gb")}
    steady, bursts, pairs = [], [], []
    for n, r in a.items():
        if n not in b:
            continue
        h1, h2 = float(r["uptime_h"]), float(b[n]["uptime_h"])
        w1, w2 = float(r["root_written_gb"]), float(b[n]["root_written_gb"])
        if h2 <= h1 + 0.1:
            continue  # a new session started between the readings
        s = (w2 - w1) / (h2 - h1)
        steady.append(s)
        bursts.append(max(0.0, w1 - s * h1))
        pairs.append((n, round(h2 - h1, 2), round(w2 - w1, 2), round(s, 3)))
    tw = sum(p[2] for p in pairs); th = sum(p[1] for p in pairs)
    return {"n": len(pairs), "steady_p50": q(steady, .5), "steady_p90": q(steady, .9), "steady_pooled": tw / th if th else 0,
            "burst_p50": q(bursts, .5), "burst_p90": q(bursts, .9), "pairs": pairs}


def main():
    inv = json.loads((D / "inventory-r3.json").read_text())
    golden = {}
    for s in inv:
        if s["kind"] == "golden":
            golden[s["name"]] = max(golden.get(s["name"], 0), s["sizeBytes"] / 1e9)
    med_golden = statistics.median(golden.values())
    ws_snap = {}
    for s in inv:
        if s["kind"] != "golden" and (s.get("name") or "").startswith("ws-"):
            ws_snap[s["name"]] = max(ws_snap.get(s["name"], 0), s["sizeBytes"] / 1e9)
    all_ws_gb = sum(s["sizeBytes"] for s in inv if s["kind"] != "golden") / 1e9
    gold_gb = sum(golden.values())
    meta = {r["name"]: r for r in csv.DictReader((D / "ws-all.csv").open()) if r.get("name", "").startswith("ws-")}
    r = rates()
    steady, burst = r["steady_pooled"], r["burst_p50"]
    rows = []
    for name, snap in ws_snap.items():
        m = meta.get(name)
        if not m:
            continue
        base = golden.get(m["source_ref"], med_golden) if m["source_kind"] == "fork" else IMAGE_BASE_GB
        upper = max(0.0, snap - base)
        writes = int(m["sessions_30d"]) * burst + float(m["active_h_30d"]) * steady
        rows.append({"today": snap * SNAP, "storage": upper * DRIVE, "writes": writes * WRITE, "upper": upper, "writes_gb": writes,
                     "active": float(m["active_h_30d"]) > 0})
    fleet_h = float(sys.argv[1]); fleet_sessions = int(sys.argv[2]); pinned_gb = float(sys.argv[3])
    fleet_writes_gb = fleet_sessions * burst + fleet_h * steady
    out = {
        "rates": r,
        "matched_workspaces": len(rows),
        "today": {"workspace_snapshots_gb": all_ws_gb, "goldens_gb": gold_gb,
                  "monthly": (all_ws_gb + gold_gb) * SNAP},
        "overlay": {"pinned_goldens_gb": pinned_gb, "goldens_monthly": pinned_gb * SNAP,
                    "drive_storage_gb": sum(x["upper"] for x in rows), "drive_storage_monthly": sum(x["storage"] for x in rows),
                    "drive_writes_gb": fleet_writes_gb, "drive_writes_monthly": fleet_writes_gb * WRITE},
        "per_workspace": {},
    }
    out["overlay"]["monthly"] = out["overlay"]["goldens_monthly"] + out["overlay"]["drive_storage_monthly"] + out["overlay"]["drive_writes_monthly"]
    for label, sel in (("all with a snapshot", rows), ("active in the last 30 days", [x for x in rows if x["active"]])):
        tot = [x["storage"] + x["writes"] for x in sel]
        out["per_workspace"][label] = {
            "n": len(sel),
            "today_p50": q([x["today"] for x in sel], .5), "today_p90": q([x["today"] for x in sel], .9),
            "overlay_p50": q(tot, .5), "overlay_p90": q(tot, .9),
            "upper_gb_p50": q([x["upper"] for x in sel], .5), "upper_gb_p90": q([x["upper"] for x in sel], .9),
            "writes_gb_p50": q([x["writes_gb"] for x in sel], .5), "writes_gb_p90": q([x["writes_gb"] for x in sel], .9),
        }
    print(json.dumps(out, indent=1))


main()
