import json, statistics
inv = json.load(open("/tmp/ovl/inventory.json"))
GB = 1e9
size = {}
for s in inv:
    if s["kind"] == "golden": size[s["name"]] = max(size.get(s["name"], 0), s["sizeBytes"])
gold = [s["sizeBytes"] for s in inv if s["kind"] == "golden"]
ws = [s["sizeBytes"] for s in inv if s["kind"] != "golden"]
med_gold = statistics.median(gold)
rows = [r.split(":") for r in open("/tmp/ovl/envdays.txt").read().split()]
# Every live environment would have a golden (image ones too, in the end state).
today_n = pinned_n = 0; today_b = pinned_b = 0; missing = 0
for kind, ref, days, t in rows:
    days, t = int(days), int(t)
    b = size.get(ref)
    if b is None: missing += 1; b = med_gold
    today_n += 1; today_b += b
    n = days + (0 if t else 1)            # pinned days in the 30-day wake window, plus today's golden
    pinned_n += n; pinned_b += n * b
P_SNAP = 0.08
print(f"inventory: goldens={len(gold)} total={sum(gold)/GB:.0f} GB; workspace snaps={len(ws)} total={sum(ws)/GB:.0f} GB; all={(sum(gold)+sum(ws))/GB:.0f} GB")
print(f"live envs={len(rows)}; envs whose golden size is unknown (image envs, or no snapshot) costed at median {med_gold/GB:.2f} GB: {missing}")
print(f"keepLast=1 (one golden per env): {today_n} snapshots, {today_b/GB:.0f} GB, ${today_b/GB*P_SNAP:,.0f}/month")
print(f"pinned, daily goldens: {pinned_n} snapshots, {pinned_b/GB:.0f} GB, ${pinned_b/GB*P_SNAP:,.0f}/month")
print(f"today, workspace snapshots: ${sum(ws)/GB*P_SNAP:,.0f}/month; goldens today ${sum(gold)/GB*P_SNAP:,.0f}/month")
