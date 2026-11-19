// Spike driver for ovl-spike-* boxes. Not product code.
import { readFileSync } from "node:fs";
import { Drive, Sandbox } from "@vercel/sandbox";

const creds = {
	token: process.env.VERCEL_TOKEN ?? "",
	teamId: process.env.VERCEL_ORG_ID ?? "",
	projectId: process.env.OVL_PROJECT_ID ?? "",
};
const PREFIX = "ovl-spike-";
const [cmd, ...rest] = process.argv.slice(2);
const flag = (k: string, d?: string) => {
	const i = rest.indexOf(`--${k}`);
	return i >= 0 ? rest[i + 1] : d;
};
const guard = (n: string) => {
	if (!n.startsWith(PREFIX)) throw new Error(`refusing a name without ${PREFIX}: ${n}`);
	return n;
};
const t0 = () => performance.now();
const ms = (s: number) => Math.round(performance.now() - s);

async function mountsFor(): Promise<Record<string, any> | undefined> {
	const d = flag("drive");
	const out: Record<string, any> = {};
	if (d) out[flag("drive-path", "/mnt/superset-drive")!] = { drive: guard(d), mode: "read-write" };
	const agents = flag("agents");
	if (agents) out["/opt/agents"] = { drive: agents, mode: "snapshot" };
	return Object.keys(out).length ? out : undefined;
}

async function main() {
	switch (cmd) {
		case "drive": {
			const s = t0();
			const d = await Drive.getOrCreate({ ...creds, name: guard(rest[0]), region: (flag("region", "sfo1") as any), ...(flag("max-gb") ? { maxSize: Number(flag("max-gb")) * 1024 ** 3 } : {}) });
			console.log(JSON.stringify({ name: d.name, id: d.driveId, region: d.region, maxSize: d.maxSize, ms: ms(s) }));
			break;
		}
		case "drive-fork": {
			const src = await Drive.get({ ...creds, name: guard(rest[0]) });
			const s = t0();
			const f = await (src as any).fork({ name: guard(rest[1]) });
			console.log(JSON.stringify({ name: f.name, ms: ms(s) }));
			break;
		}
		case "drive-info": {
			const d = await Drive.get({ ...creds, name: guard(rest[0]) });
			console.log(JSON.stringify({ name: d.name, sandbox: d.currentSandboxName ?? null, session: d.currentSessionId ?? null, updated: d.updatedAt }));
			break;
		}
		case "drive-wait-detach": {
			const s = t0();
			for (;;) {
				const d = await Drive.get({ ...creds, name: guard(rest[0]) });
				if (!d.currentSandboxName) break;
				if (ms(s) > 180_000) throw new Error("still attached after 180 s");
				await Bun.sleep(1000);
			}
			console.log(JSON.stringify({ detachedAfterMs: ms(s) }));
			break;
		}
		case "drive-delete": {
			const d = await Drive.get({ ...creds, name: guard(rest[0]) });
			await (d as any).delete();
			console.log("deleted drive", rest[0]);
			break;
		}
		case "create": {
			const name = guard(rest[0]);
			const from = flag("from", "golden:env-internal-mwlwpcj7")!;
			const mounts = await mountsFor();
			const base: any = {
				...creds, name, timeout: Number(flag("timeout-min", "45")) * 60_000,
				persistent: flag("persistent", "true") === "true",
				snapshotExpiration: 2 * 86400_000, keepLastSnapshots: { count: 1 },
				ports: [4879], resources: { vcpus: Number(flag("vcpus", "8")) },
				...(mounts ? { mounts } : {}), tags: { spike: "overlay-root" },
			};
			const s = t0();
			const [kind, ref] = [from.slice(0, from.indexOf(":")), from.slice(from.indexOf(":") + 1)];
			const box =
				kind === "golden" ? await Sandbox.fork({ ...base, sourceSandbox: ref })
				: kind === "snapshot" ? await Sandbox.create({ ...base, region: flag("region", "sfo1"), source: { type: "snapshot", snapshotId: ref } })
				: await Sandbox.create({ ...base, region: flag("region", "sfo1"), image: ref });
			const created = ms(s);
			const r = await box.runCommand("true");
			console.log(JSON.stringify({ name, createMs: created, firstCommandMs: ms(s), exit: r.exitCode, snapshot: box.currentSnapshotId ?? null }));
			break;
		}
		case "run": {
			// run <name> <script-file> [--user] : root by default; prints stdout+stderr, exit, ms.
			const box = await Sandbox.get({ ...creds, name: guard(rest[0]) });
			const script = readFileSync(rest[1], "utf8");
			const args = rest.slice(2).filter((a) => !a.startsWith("--") && a !== flag("env"));
			const s = t0();
			const r = await box.runCommand({ cmd: "bash", args: ["-c", script, "ovl", ...args], sudo: !rest.includes("--user") });
			const [out, err] = await Promise.all([r.stdout(), r.stderr()]);
			process.stdout.write(out);
			process.stderr.write(err.split("\n").filter((l) => !l.includes("unable to resolve host")).join("\n"));
			console.log(`\n@@ exit=${r.exitCode} ms=${ms(s)}`);
			break;
		}
		case "put": {
			const box = await Sandbox.get({ ...creds, name: guard(rest[0]) });
			await box.writeFiles([{ path: rest[2], content: readFileSync(rest[1]) as any, mode: 0o755 } as any]);
			console.log("wrote", rest[2]);
			break;
		}
		case "stop": {
			const box = await Sandbox.get({ ...creds, name: guard(rest[0]), resume: false } as any);
			const s = t0();
			const r: any = await box.stop();
			console.log(JSON.stringify({ stopMs: ms(s), status: r?.status, snapshot: r?.snapshot?.id ?? null, snapshotSize: r?.snapshot?.sizeBytes ?? r?.snapshot?.size ?? null }));
			break;
		}
		case "cycle": {
			// cycle <name> create|wake --ws <uuid> [--snapshot id] [--drive d] [--persistent false] [--overlay 1]
			const name = guard(rest[0]); const mode = rest[1];
			const ws = flag("ws", "6f1c0d2e-0b1a-4c3d-9e8f-000000000002")!;
			const marks: Record<string, number> = {}; const s = t0(); const mark = (k: string) => (marks[k] = ms(s));
			let box: Sandbox;
			if (mode === "create") {
				const mounts = await mountsFor();
				box = flag("fork") ? await Sandbox.fork({
					...creds, name, sourceSandbox: flag("fork")!, timeout: 45 * 60_000, persistent: flag("persistent", "false") === "true",
					snapshotExpiration: 2 * 86400_000, keepLastSnapshots: { count: 1 }, ports: [4879], resources: { vcpus: Number(flag("vcpus", "8")) },
					...(mounts ? { mounts } : {}), tags: { spike: "overlay-root" },
				} as any) : await Sandbox.create({
					...creds, name, region: flag("region", "sfo1"), source: { type: "snapshot", snapshotId: flag("snapshot", "snap_GOHUP7OzoEKe6IhFA81vVcSCCmsp")! },
					timeout: 45 * 60_000, persistent: flag("persistent", "false") === "true", snapshotExpiration: 2 * 86400_000,
					keepLastSnapshots: { count: 1 }, ports: [4879], resources: { vcpus: Number(flag("vcpus", "8")) },
					...(mounts ? { mounts } : {}), tags: { spike: "overlay-root" },
				} as any);
				mark("provider.create");
			} else {
				box = await Sandbox.get({ ...creds, name });
				mark("provider.get");
			}
			await box.runCommand("true"); mark("first.command");
			const dir = "spike-overlay/rootfs/usr/local/bin/";
			await box.writeFiles([
				{ path: "/tmp/spike-boot", content: readFileSync(dir + "superset-boot") },
				{ path: "/tmp/spike-ovl", content: readFileSync(dir + "superset-overlay-root") },
				{ path: "/tmp/spike-boot-drive", content: readFileSync("spike-overlay/superset-boot.drive-9847") },
				{ path: "/tmp/deploy.sh", content: readFileSync("/tmp/ovl/scripts/deploy.sh") },
			] as any);
			const d = await box.runCommand({ cmd: "bash", args: ["/tmp/deploy.sh", ws, flag("overlay", "1")!, flag("runner", "ovl")!, flag("drive", "-")!], sudo: true });
			mark("prototype.installed");
			if (d.exitCode !== 0 && d.exitCode !== 2) console.error(await d.stderr());
			await box.runCommand({ cmd: "sudo", args: ["--preserve-env=HOST_SERVICE_SECRET", "/usr/local/bin/superset-boot"], detached: true, env: { HOST_SERVICE_SECRET: flag("secret", "ovl-spike-secret")! } } as any);
			mark("boot.started");
			const url = box.domain(4879); const auth = { authorization: `Bearer ${flag("secret", "ovl-spike-secret")}`, "content-type": "application/json" };
			for (;;) {
				const r = await fetch(`${url}/trpc/health.check`, { signal: AbortSignal.timeout(5000) }).then((x) => x.status).catch(() => 0);
				if (r === 200) break;
				if (ms(s) > Number(process.env.OVL_WAIT_MS ?? 300000)) throw new Error("host-service never answered");
				await Bun.sleep(100);
			}
			mark("host.answers");
			const tid = crypto.randomUUID();
			for (;;) {
				const r = await fetch(`${url}/trpc/terminal.createSession`, { method: "POST", headers: auth, body: JSON.stringify({ json: { workspaceId: ws, terminalId: tid, initialCommand: "echo FIRST-TERMINAL-$(findmnt -no FSTYPE /)", cols: 120, rows: 10 } }) });
				if (r.ok) break;
				if (ms(s) > Number(process.env.OVL_WAIT_MS ?? 300000)) throw new Error(`terminal never opened: ${r.status} ${await r.text()}`);
				await Bun.sleep(200);
			}
			mark("terminal.created");
			for (;;) {
				const q = encodeURIComponent(JSON.stringify({ json: { workspaceId: ws, terminalId: tid } }));
				const t = await (await fetch(`${url}/trpc/terminal.snapshot?input=${q}`, { headers: auth })).text();
				const m = t.match(/FIRST-TERMINAL-(\w+)/g)?.find((x) => !x.includes("$("));
				if (m && /FIRST-TERMINAL-(overlay|xfs)/.test(t.replace(/echo FIRST-TERMINAL-\$\(findmnt[^)]*\)/g, ""))) { marks.rootfs = t.includes("FIRST-TERMINAL-overlay") ? 1 : 0; break; }
				if (ms(s) > Number(process.env.OVL_WAIT_MS ?? 300000)) throw new Error("terminal printed nothing");
				await Bun.sleep(100);
			}
			mark("terminal.first.output");
			console.log(JSON.stringify({ name, mode, ...marks }));
			break;
		}
		case "golden-info": {
			const box: any = await Sandbox.get({ ...creds, name: rest[0], resume: false } as any);
			console.log(JSON.stringify({ name: box.name, status: box.status, snapshot: box.currentSnapshotId, region: box.region, persistent: box.persistent, keep: box.keepLastSnapshots }));
			break;
		}
		case "info": {
			const box: any = await Sandbox.get({ ...creds, name: guard(rest[0]), resume: false } as any);
			console.log(JSON.stringify({ name: box.name, status: box.status, snapshot: box.currentSnapshotId, mounts: box.mounts, vcpus: box.vcpus, region: box.region }));
			break;
		}
		case "snapshots": {
			const box: any = await Sandbox.get({ ...creds, name: guard(rest[0]), resume: false } as any);
			const r: any = await box.listSnapshots();
			const items = r.snapshots ?? (await r.toArray?.()) ?? r;
			console.log(JSON.stringify(items.map?.((x: any) => ({ id: x.id, size: x.sizeBytes ?? x.size, created: x.createdAt, status: x.status })) ?? items));
			break;
		}
		case "update-mounts": {
			const box = await Sandbox.get({ ...creds, name: guard(rest[0]), resume: false } as any);
			await (box as any).update({ mounts: (await mountsFor()) ?? {} });
			console.log("mounts updated");
			break;
		}
		case "purge": {
			const name = guard(rest[0]);
			const box: any = await Sandbox.get({ ...creds, name, resume: false } as any);
			if (box.status !== "stopped") throw new Error(`${name} is ${box.status}; stop it first`);
			const r: any = await box.listSnapshots();
			const items = r.snapshots ?? (await r.toArray?.()) ?? [];
			const { Snapshot } = await import("@vercel/sandbox");
			for (const x of items) {
				if (x.id === "snap_GOHUP7OzoEKe6IhFA81vVcSCCmsp") throw new Error("refusing the golden's snapshot");
				try {
					const snap: any = await (Snapshot as any).get({ ...creds, snapshotId: x.id });
					if (snap.status === "deleted") continue;
					await snap.delete(); console.log("deleted snapshot", x.id, x.sizeBytes ?? x.size);
				} catch (e: any) { if (!/expired or deleted/.test(e.message)) throw e; }
			}
			await box.delete(); console.log("deleted box", name);
			break;
		}
		case "delete": {
			const box = await Sandbox.get({ ...creds, name: guard(rest[0]), resume: false } as any);
			await (box as any).delete();
			console.log("deleted", rest[0]);
			break;
		}
		case "list": {
			const r: any = await (Sandbox as any).list({ ...creds, limit: 50, namePrefix: PREFIX, sortBy: "name" });
			for (const s of r.sandboxes ?? []) console.log("box", s.name, s.status);
			const d: any = await (Drive as any).list({ ...creds, limit: 50, namePrefix: PREFIX, sortBy: "name" });
			for (const x of (d.drives ?? (await d.toArray?.()) ?? [])) console.log("drive", x.name, x.currentSandboxName ?? "-");
			break;
		}
		default:
			throw new Error(`unknown ${cmd}`);
	}
}
main().catch((e) => { console.error("ERR", e?.message ?? e, e?.json ? JSON.stringify(e.json).slice(0, 500) : ""); process.exit(1); });
