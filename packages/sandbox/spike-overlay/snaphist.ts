// Read-only: snapshot history of sandboxes (size, time, status), oldest first.
import { Sandbox } from "@vercel/sandbox";
const c = { token: process.env.VERCEL_TOKEN!, teamId: process.env.VERCEL_ORG_ID!, projectId: "prj_mvHIiIZ1QUEpBK2cxmL1PCzOYPfb" };
for (const name of process.argv.slice(2)) {
	const box: any = await Sandbox.get({ ...c, name, resume: false } as any);
	const r: any = await box.listSnapshots({ limit: 50 } as any);
	const items = r.snapshots ?? (await r.toArray?.()) ?? [];
	const rows = items.map((x: any) => ({ id: x.id, size: x.sizeBytes ?? x.size, at: x.createdAt, status: x.status })).sort((a: any, b: any) => a.at - b.at);
	console.log(JSON.stringify({ name, n: rows.length, rows: rows.slice(-6) }));
}
