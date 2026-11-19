"""Builds the spike page's tables from the raw measurement files in ../data."""
import csv, json, re, statistics, sys
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).parent.parent / "data"
LAYOUTS = ["A", "B", "C"]
NAMES = {"A": "A · today (no drive)", "B": "B · #9847 drive", "C": "C · overlay"}


def cell(vals, unit="s", digits=1):
    if not vals:
        return "<td class=na>—</td>"
    m = statistics.median(vals)
    lo, hi = min(vals), max(vals)
    return f"<td><b>{m:.{digits}f}</b>{unit} <span class=rg>{lo:.{digits}f}–{hi:.{digits}f}</span></td>"


def rows_of(path):
    p = DATA / path
    return list(csv.DictReader(p.open())) if p.exists() else []


def matrix(files, tools, digits=1):
    by = defaultdict(list)
    disk = defaultdict(list)
    warn = defaultdict(set)
    fails = defaultdict(int)
    for f in files:
        for r in rows_of(f):
            k = (r["tool"], r["mode"], r["layout"])
            if r["exit"] != "0":
                fails[k] += 1
                continue
            by[k].append(float(r["seconds"]))
            disk[k].append((int(r["root_kb_delta"]) / 1048576, int(r["drive_kb_delta"]) / 1048576))
            w = r.get("warnings", "").strip()
            if w and "Workspaces can only be enabled" not in w and "Done with warnings" not in w:
                warn[k].add(w[:90])
    out = ["<table><thead><tr><th>What</th><th>Mode</th>"]
    out += [f"<th>{NAMES[l]}</th>" for l in LAYOUTS]
    out += ["<th>Disk written per run: root / drive (GB, median)</th></tr></thead><tbody>"]
    for tool, label in tools:
        modes = sorted({k[1] for k in by if k[0] == tool} | {k[1] for k in fails if k[0] == tool})
        for mode in modes:
            out.append(f"<tr><td>{label}</td><td>{mode}</td>")
            for l in LAYOUTS:
                k = (tool, mode, l)
                c = cell(by.get(k, []), "s", digits)
                if fails.get(k):
                    c = c.replace("</td>", f" <span class=bad>{fails[k]} failed</span></td>")
                out.append(c)
            parts = []
            for l in LAYOUTS:
                d = disk.get((tool, mode, l))
                if d:
                    parts.append(f"{l}: {statistics.median(x[0] for x in d):.2f} / {statistics.median(x[1] for x in d):.2f}")
            out.append(f"<td class=sm>{'<br>'.join(parts)}</td></tr>")
            for l in LAYOUTS:
                for w in warn.get((tool, mode, l), []):
                    out.append(f"<tr class=warn><td colspan=6>{l}, {label} {mode}: shown to the user: <code>{w}</code></td></tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


PM = [("bun", "bun · this repo"), ("pnpm", "pnpm · vitejs/vite"), ("yarn1", "yarn classic · facebook/react"),
      ("yarn4-nm", "yarn berry (node_modules) · jestjs/jest"), ("npm", "npm · microsoft/TypeScript"),
      ("pip", "pip + venv · fastapi/fastapi"), ("uv", "uv · fastapi/fastapi"), ("poetry", "poetry · python-poetry/poetry"),
      ("go", "go build · junegunn/fzf")]
DAILY = [("git-status", "git status, 300 files dirty"), ("git-checkout", "git checkout 300 commits apart and back"),
         ("git-clone", "git clone --depth 1 (this repo)"), ("rg", "rg across the repo"),
         ("typecheck", "turbo typecheck (@superset/sandbox, --force)"), ("test", "bun test (packages/sandbox)")]


def lifecycle():
    def parse(path):
        res = defaultdict(list)
        p = Path(path)
        if not p.exists():
            return res
        for line in p.read_text().splitlines():
            m = re.match(r"(CREATE|STOP|DETACH|WAKE)\s*(\d*)\s*(\{.*\})", line)
            if not m:
                continue
            j = json.loads(m.group(3))
            kind = m.group(1)
            if kind in ("CREATE", "WAKE"):
                res[kind].append(j["terminal.first.output"] / 1000)
                res[kind + "_provider"].append(j["first.command"] / 1000)
            elif kind == "STOP":
                res["STOP"].append(j["stopMs"] / 1000)
                if j.get("snapshotSize"):
                    res["SNAP"].append(j["snapshotSize"] / 1e9)
            else:
                res["DETACH"].append(j["detachedAfterMs"] / 1000)
        return res
    a, b, c = parse(DATA / "lc-A.txt"), parse(DATA / "lc-B.txt"), parse(DATA / "lc-C.txt")
    rows = [("Create to first terminal output", "CREATE"), ("…of which Vercel create/resume until a command runs", "CREATE_provider"),
            ("Wake to first terminal output", "WAKE"), ("…of which Vercel resume until a command runs", "WAKE_provider"),
            ("Stop (the API call returns)", "STOP"), ("Drive detached after the stop returned", "DETACH")]
    out = ["<table><thead><tr><th>Step</th>" + "".join(f"<th>{NAMES[l]}</th>" for l in LAYOUTS) + "</tr></thead><tbody>"]
    for label, k in rows:
        out.append(f"<tr><td>{label}</td>{cell(a.get(k, []))}{cell(b.get(k, []))}{cell(c.get(k, []))}</tr>")
    out.append(f"<tr><td>Snapshot written at each stop</td>{cell(a.get('SNAP', []), ' GB', 2)}{cell(b.get('SNAP', []), ' GB', 2)}<td><b>none</b> (persistent: false)</td></tr>")
    out.append("</tbody></table>")
    n = {l: (len(x.get('CREATE', [])), len(x.get('WAKE', []))) for l, x in (("A", a), ("B", b), ("C", c))}
    return "\n".join(out), n


def copyup():
    rows = rows_of("copyup.csv")
    by = defaultdict(lambda: defaultdict(list))
    for r in rows:
        k = (r["layout"], r["file_mb"])
        for f in ("first_inplace_s", "second_inplace_s", "atomic_save_s"):
            by[k][f].append(float(r[f]))
    out = ["<table><thead><tr><th>File in the lower layer</th><th>Layout</th><th>First in-place write (1 byte + fsync)</th><th>Second in-place write</th><th>Editor-style save (write new file, rename)</th></tr></thead><tbody>"]
    for mb in ("100", "500", "2000"):
        for l in ("A", "C"):
            d = by.get((l, mb))
            if not d:
                continue
            out.append(f"<tr><td>{mb} MB</td><td>{NAMES[l]}</td>{cell(d['first_inplace_s'], ' s', 3)}{cell(d['second_inplace_s'], ' s', 3)}{cell(d['atomic_save_s'], ' s', 3)}</tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


def aging():
    out = []
    for l in ("A", "C"):
        rows = rows_of(f"aging-{l}.csv")
        if not rows:
            continue
        out.append(f"<h4>{NAMES[l]}</h4><table><thead><tr><th>Pass</th><th>Written to the device so far (GB)</th><th>Layer used (GB)</th><th>Pass took (s)</th></tr></thead><tbody>")
        for r in rows:
            out.append(f"<tr><td>{r['iteration']}</td><td>{r['device_written_gb']}</td><td>{r['layer_used_gb']}</td><td>{r['iteration_s']}</td></tr>")
        out.append("</tbody></table>")
    return "\n".join(out)


def aged_compare():
    fresh = defaultdict(list)
    aged = defaultdict(list)
    for r in rows_of("bench-A.csv") + rows_of("bench-C.csv"):
        if r["exit"] == "0" and r["tool"] in dict(DAILY):
            fresh[(r["tool"], r["mode"], r["layout"])].append(float(r["seconds"]))
    for f in ("daily-aged-A.csv", "daily-aged-C.csv"):
        for r in rows_of(f):
            if r["exit"] == "0":
                aged[(r["tool"], r["mode"], r["layout"])].append(float(r["seconds"]))
    out = ["<table><thead><tr><th>What</th><th>Mode</th><th>A fresh</th><th>A aged</th><th>C fresh</th><th>C aged</th></tr></thead><tbody>"]
    for tool, label in DAILY:
        modes = sorted({k[1] for k in fresh if k[0] == tool})
        for mode in modes:
            g = lambda d, l: cell(d.get((tool, mode, l), []), "s", 2)
            out.append(f"<tr><td>{label}</td><td>{mode}</td>{g(fresh, 'A')}{g(aged, 'A')}{g(fresh, 'C')}{g(aged, 'C')}</tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


def firstinstall():
    rows = rows_of("firstinstall.csv")
    if not rows:
        return "<p class=na>Not measured.</p>"
    ok = [r for r in rows if r["exit"] == "0"]
    t = [float(r["seconds"]) for r in ok]
    u = [float(r["upper_gb_after"]) for r in ok]
    warm = [float(r["seconds"]) for r in rows_of("bench-C.csv") if r["tool"] == "bun" and r["mode"] == "warm"]
    return ("<table><thead><tr><th>bun · this repo, C</th><th>Time</th><th>Upper layer after (GB)</th></tr></thead><tbody>"
            f"<tr><td>First reinstall after create (cache in the lower), {len(ok)} of {len(rows)} runs ok</td>{cell(t)}{cell(u, ' GB', 2)}</tr>"
            f"<tr><td>Warm reinstall once the cache is in the upper (from the matrix)</td>{cell(warm)}<td class=na>—</td></tr></tbody></table>")


def switch():
    out = ["<table><thead><tr><th>git checkout 300 commits back, then bun install</th><th>Time</th><th>Installed</th></tr></thead><tbody>"]
    for l in ("A", "C"):
        rows = rows_of(f"switch-{l}.csv")
        if rows:
            out.append(f"<tr><td>{NAMES[l]}</td>{cell([float(r['seconds']) for r in rows])}<td class=sm>{'; '.join(r['packages_line'] for r in rows)}</td></tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


def devices():
    rows = rows_of("devices.csv")
    if not rows:
        return "<p class=na>Not measured.</p>"
    out = ["<table><thead><tr><th>Device</th><th>Sequential write, 2 GB with fsync</th><th>Sequential read, cold</th><th>4 KiB write + fsync per second</th></tr></thead><tbody>"]
    for r in rows:
        name = "root disk (A's /workspace)" if r["device"].endswith("vdb") else "workspace drive (B and C)"
        out.append(f"<tr><td>{name} <span class=rg>{r['device']}</span></td><td>{r['write_MBps']}</td><td>{r['read_MBps']}</td><td>{r['fsync_4k_per_s']}</td></tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


def resources():
    p = DATA / "resources.txt"
    if not p.exists():
        return ""
    import html
    return "<pre>" + html.escape(p.read_text()) + "</pre>"


if __name__ == "__main__":
    files = ["bench-A.csv", "bench-B.csv", "bench-C.csv"]
    lc, n = lifecycle()
    parts = {
        "PM_TABLE": matrix(files, PM),
        "DAILY_TABLE": matrix(files, DAILY, 2),
        "LIFECYCLE_TABLE": lc,
        "COPYUP_TABLE": copyup(),
        "AGING_TABLE": aging(),
        "AGED_TABLE": aged_compare(),
        "FIRSTINSTALL_TABLE": firstinstall(),
        "DEVICES_TABLE": devices(),
        "SWITCH_TABLE": switch(),
        "RESOURCES": resources(),
    }
    tpl = (Path(__file__).parent / "template.html").read_text()
    for k, v in parts.items():
        tpl = tpl.replace("{{" + k + "}}", v)
    (Path(__file__).parent / "overlay-root-spike.html").write_text(tpl)
    print("lifecycle runs (create, wake):", n, file=sys.stderr)
