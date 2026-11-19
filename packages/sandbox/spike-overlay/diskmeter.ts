// Read-only: bytes written since boot on running internal boxes. Never resumes a stopped box.
import { Sandbox } from "@vercel/sandbox";
const c = { token: process.env.VERCEL_TOKEN!, teamId: process.env.VERCEL_ORG_ID!, projectId: "prj_mvHIiIZ1QUEpBK2cxmL1PCzOYPfb" };
const names = process.argv.slice(2);
console.log("box,uptime_h,root_written_gb,other_disks_written_gb,root_used_gb,devices");
for (const name of names) {
	const box: any = await Sandbox.get({ ...c, name, resume: false } as any);
	if (box.status !== "running") { console.log(`${name},skipped:${box.status}`); continue; }
	const r = await box.runCommand("bash", ["-c", "cat /proc/uptime; echo ---; cat /proc/diskstats; echo ---; df -B1 --output=source,used / | tail -1; echo ---; findmnt -rno SOURCE,TARGET | grep -E '^/dev/vd'"]);
	const [up, ds, df, mnts] = (await r.stdout()).split("---\n");
	const uptimeH = Number(up.split(" ")[0]) / 3600;
	const root = df.trim().split(/\s+/)[0].replace("/dev/", "");
	const written: Record<string, number> = {};
	for (const line of ds.trim().split("\n")) { const f = line.trim().split(/\s+/); if (/^vd[a-z]$/.test(f[2])) written[f[2]] = (Number(f[9]) * 512) / 1e9; }
	const mounted = Object.fromEntries(mnts.trim().split("\n").filter(Boolean).map((l) => { const [s, t] = l.split(" "); return [s.replace("/dev/", ""), t]; }));
	const other = Object.entries(written).filter(([d]) => d !== root && mounted[d] && !mounted[d].startsWith("/opt/agents")).reduce((a, [, v]) => a + v, 0);
	console.log(`${name},${uptimeH.toFixed(2)},${(written[root] ?? 0).toFixed(2)},${other.toFixed(2)},${(Number(df.trim().split(/\s+/)[1]) / 1e9).toFixed(2)},${Object.entries(mounted).map(([d, t]) => `${d}:${t}`).join(" ")}`);
}
