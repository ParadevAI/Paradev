import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AgentToolsManifest,
	agentToolsDrivesToPrune,
	agentToolsManifest,
	type DriveHost,
	parseAgentToolsManifest,
	pruneAgentToolsDrives,
	publishAgentToolsDrive,
	renderBuilderScript,
} from "./agent-tools";
import { type Assets, sha256 } from "./manifest";

const sha = (c: string) => c.repeat(64);
const BUNDLE = "0123456789abcdef".repeat(4);

function row(sha256: string, suffix: string): Assets[string] {
	return { sha256, suffix, dest: "/usr/local/share/x", mode: "0644" };
}

const agentAssets: Assets = {
	claude: row(sha("a"), ""),
	codex: row(sha("b"), ".tar.gz"),
	pdev: row(sha("c"), ".tar.gz"),
	chrome: row(sha("d"), ".deb"),
};

describe("agent-tools manifest", () => {
	test("lists every agent at its asset sha, bin relative to its dir", () => {
		const manifest = agentToolsManifest(agentAssets);
		expect(manifest).toEqual([
			{ name: "claude", sha: sha("a"), bin: "claude" },
			{ name: "codex", sha: sha("b"), bin: "bin/codex" },
			{ name: "pdev", sha: sha("c"), bin: "pdev/pdev" },
		]);
		expect(parseAgentToolsManifest(JSON.stringify(manifest))).toEqual(manifest);
	});

	test("a missing or bad manifest reads as empty", () => {
		expect(parseAgentToolsManifest(null)).toEqual([]);
		expect(parseAgentToolsManifest("{not json")).toEqual([]);
		expect(
			parseAgentToolsManifest(
				JSON.stringify([{ name: "claude", sha: sha("a"), bin: "../x" }]),
			),
		).toEqual([]);
	});
});

function fakeHost(
	drives: Record<string, { manifest?: string; attachedTo?: string }>,
) {
	const calls: string[] = [];
	const host: DriveHost = {
		find: async (name) => {
			const drive = drives[name];
			return drive ? { attachedTo: drive.attachedTo } : null;
		},
		list: async (prefix) =>
			Object.keys(drives).filter((name) => name.startsWith(prefix)),
		create: async (name) => {
			calls.push(`create ${name}`);
			drives[name] = {};
		},
		remove: async (name) => {
			calls.push(`remove ${name}`);
			if (drives[name]?.attachedTo) throw new Error("attached");
			delete drives[name];
		},
		readManifest: async (name) => drives[name]?.manifest ?? null,
		write: async (name) => {
			calls.push(`write ${name}`);
			const drive = drives[name];
			if (drive)
				drive.manifest = JSON.stringify(agentToolsManifest(agentAssets));
		},
	};
	return { host, calls, drives };
}

describe("publishAgentToolsDrive", () => {
	const drive = "agent-tools-sfo1-0123456789ab";

	test("creates and writes the bundle's drive in the region", async () => {
		const { host, calls } = fakeHost({});
		expect(
			await publishAgentToolsDrive({
				host,
				region: "sfo1",
				bundleSha: BUNDLE,
				assets: agentAssets,
			}),
		).toEqual({ drive, outcome: "published" });
		expect(calls).toEqual([`create ${drive}`, `write ${drive}`]);
	});

	test("leaves a drive that has a manifest alone", async () => {
		const { host, calls } = fakeHost({
			[drive]: { manifest: JSON.stringify(agentToolsManifest(agentAssets)) },
		});
		expect(
			(
				await publishAgentToolsDrive({
					host,
					region: "sfo1",
					bundleSha: BUNDLE,
					assets: agentAssets,
				})
			).outcome,
		).toBe("exists");
		expect(calls).toEqual([]);
	});

	test("recreates a drive an earlier run left without a manifest", async () => {
		const { host, calls } = fakeHost({ [drive]: {} });
		await publishAgentToolsDrive({
			host,
			region: "sfo1",
			bundleSha: BUNDLE,
			assets: agentAssets,
		});
		expect(calls).toEqual([
			`remove ${drive}`,
			`create ${drive}`,
			`write ${drive}`,
		]);
	});

	test("refuses a drive a writer still holds", async () => {
		const { host, calls } = fakeHost({ [drive]: { attachedTo: "builder" } });
		await expect(
			publishAgentToolsDrive({
				host,
				region: "sfo1",
				bundleSha: BUNDLE,
				assets: agentAssets,
			}),
		).rejects.toThrow(/attached to builder/);
		expect(calls).toEqual([]);
	});
});

describe("pruning", () => {
	test("deletes only agent-tools drives no environment references", () => {
		expect(
			agentToolsDrivesToPrune(
				[
					"agent-tools-sfo1-0123456789ab",
					"agent-tools-sfo1-aaaaaaaaaaaa",
					"agent-tools-iad1-0123456789ab",
					"agent-tools-sfo1",
					"agent-tools-builder-sfo1-xyz",
				],
				new Set(["agent-tools-sfo1-0123456789ab"]),
			),
		).toEqual([
			"agent-tools-sfo1-aaaaaaaaaaaa",
			"agent-tools-iad1-0123456789ab",
		]);
	});

	test("keeps a drive a sandbox holds for the next release", async () => {
		const { host } = fakeHost({
			"agent-tools-sfo1-aaaaaaaaaaaa": {},
			"agent-tools-sfo1-bbbbbbbbbbbb": { attachedTo: "box" },
		});
		expect(
			await pruneAgentToolsDrives({ host, referenced: new Set() }),
		).toEqual({
			deleted: ["agent-tools-sfo1-aaaaaaaaaaaa"],
			kept: ["agent-tools-sfo1-bbbbbbbbbbbb"],
		});
	});
});

async function runScript(script: string) {
	const proc = Bun.spawn(["bash", "-c", script], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const stderr = await new Response(proc.stderr).text();
	return { exitCode: await proc.exited, stderr };
}

describe.skipIf(process.platform !== "linux")("builder script", () => {
	test("writes verified agents, then the manifest last", async () => {
		const work = mkdtempSync(join(tmpdir(), "agent-tools-"));
		const src = join(work, "src");
		mkdirSync(join(src, "bin"), { recursive: true });
		writeFileSync(join(src, "bin", "codex"), "#!/bin/sh\necho codex\n", {
			mode: 0o755,
		});
		Bun.spawnSync(["tar", "-czf", join(work, "codex.tar.gz"), "-C", src, "."]);
		const claude = new TextEncoder().encode("#!/bin/sh\necho claude\n");
		const codex = readFileSync(join(work, "codex.tar.gz"));
		const objects = new Map<string, Uint8Array>([
			[sha256(claude), claude],
			[`${sha256(codex)}.tar.gz`, codex],
		]);
		const server = Bun.serve({
			port: 0,
			fetch: (request) => {
				const body = objects.get(new URL(request.url).pathname.slice(1));
				return body ? new Response(body) : new Response("", { status: 404 });
			},
		});
		const root = join(work, "drive");
		mkdirSync(root);
		const manifest: AgentToolsManifest = [
			{ name: "claude", sha: sha256(claude), bin: "claude" },
			{ name: "codex", sha: sha256(codex), bin: "bin/codex" },
		];
		try {
			const run = await runScript(
				renderBuilderScript({
					root,
					baseUrl: `http://127.0.0.1:${server.port}`,
					assets: {
						claude: row(sha256(claude), ""),
						codex: row(sha256(codex), ".tar.gz"),
					},
					manifest,
				}),
			);
			expect(run.exitCode, run.stderr).toBe(0);
			expect(
				parseAgentToolsManifest(
					readFileSync(join(root, "manifest.json"), "utf8"),
				),
			).toEqual(manifest);
			expect(
				Bun.spawnSync([join(root, "codex", sha256(codex), "bin", "codex")])
					.stdout.toString()
					.trim(),
			).toBe("codex");
			expect(existsSync(join(root, "claude", sha256(claude), "claude"))).toBe(
				true,
			);
			expect(existsSync(join(root, ".manifest.json.partial"))).toBe(false);
		} finally {
			server.stop(true);
		}
	});

	test("a sha mismatch fails before the manifest is written", async () => {
		const root = mkdtempSync(join(tmpdir(), "agent-tools-"));
		const server = Bun.serve({
			port: 0,
			fetch: () => new Response("not the agent"),
		});
		try {
			const run = await runScript(
				renderBuilderScript({
					root,
					baseUrl: `http://127.0.0.1:${server.port}`,
					assets: { claude: row(sha("a"), "") },
					manifest: [{ name: "claude", sha: sha("a"), bin: "claude" }],
				}),
			);
			expect(run.exitCode).not.toBe(0);
			expect(existsSync(join(root, "manifest.json"))).toBe(false);
		} finally {
			server.stop(true);
		}
	});
});
