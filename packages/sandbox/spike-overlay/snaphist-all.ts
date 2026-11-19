// Read-only: snapshot history (size, time) of every workspace sandbox in a list. One JSON line per box.
import { Sandbox } from "@vercel/sandbox";
const c = { token: process.env.VERCEL_TOKEN!, teamId: process.env.VERCEL_ORG_ID!, projectId: "prj_mvHIiIZ1QUEpBK2cxmL1PCzOYPfb" };
const names = (await Bun.file(process.argv[2]).text()).split("\n").filter(Boolean);
let i = 0;
async function worker() {
	for (;;) {
		const name = names[i++]; if (!name) return;
		try {
			const box: any = await Sandbox.get({ ...c, name, resume: false } as any);
			const r: any = await box.listSnapshots({ limit: 50 } as any);
			const items = r.snapshots ?? (await r.toArray?.()) ?? [];
			const rows = items.map((x: any) => [x.createdAt, x.sizeBytes ?? x.size]).sort((a: any, b: any) => a[0] - b[0]);
			console.log(JSON.stringify({ name, status: box.status, rows }));
		} catch (e: any) { console.log(JSON.stringify({ name, error: String(e?.message ?? e).slice(0, 80) })); }
	}
}
await Promise.all(Array.from({ length: 10 }, worker));
