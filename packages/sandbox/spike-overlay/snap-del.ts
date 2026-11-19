import { Snapshot } from "@vercel/sandbox";
const c = { token: process.env.VERCEL_TOKEN!, teamId: process.env.VERCEL_ORG_ID!, projectId: process.env.OVL_PROJECT_ID ?? "" };
const id = process.argv[2]; if (id !== "snap_Ru3RCxdhahTq9wsk4ARmd6SD6uOX") throw new Error("only the spike's own G2 snapshot");
const s: any = await (Snapshot as any).get({ ...c, snapshotId: id }); await s.delete(); console.log("deleted", id);
