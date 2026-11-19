import { Snapshot } from "@vercel/sandbox";
const c = { token: process.env.VERCEL_TOKEN!, teamId: process.env.VERCEL_ORG_ID!, projectId: process.env.OVL_PROJECT_ID ?? "" };
try { const s: any = await (Snapshot as any).get({ ...c, snapshotId: process.argv[2] }); console.log(JSON.stringify({ id: s.snapshotId ?? s.id, status: s.status, size: s.sizeBytes, expiresAt: s.expiresAt, source: s.sourceSandboxId ?? s.sandboxId })); }
catch (e: any) { console.log("ERR", e.message?.slice(0, 200)); }
