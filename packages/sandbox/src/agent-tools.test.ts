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
	describeAgentToolsPublish,
	parseAgentToolsManifest,
	parseBuilderResults,
	pruneAgentToolsDrives,
	publishAgentToolsDrive,
	publishAgentToolsDrives,
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

interface FakeDrive {
	manifest?: string;
	attachedTo?: string;
	createdAt?: number;
}

function written(assets: Assets = agentAssets) {
	return agentToolsManifest(assets)
		.map(({ name, sha }) => `agent-tools-result ${name} written ${sha}`)
		.join("\n");
}

function fakeHost(
	drives: Record<string, FakeDrive>,
	options: {
		builder?: (name: string) => string;
		failFork?: boolean;
	} = {},
) {
	const calls: string[] = [];
	const scripts: Record<string, string> = {};
	let clock = 100;
	const host: DriveHost = {
		find: async (name) => {
			const drive = drives[name];
			return drive ? { attachedTo: drive.attachedTo } : null;
		},
		list: async (prefix) =>
			Object.entries(drives)
				.filter(([name]) => name.startsWith(prefix))
				.map(([name, drive]) => ({
					name,
					createdAt: drive.createdAt ?? 0,
					attachedTo: drive.attachedTo,
				})),
		create: async (name) => {
			calls.push(`create ${name}`);
			drives[name] = { createdAt: clock++ };
		},
		fork: async (parent, name) => {
			calls.push(`fork ${parent} ${name}`);
			drives[name] = { ...drives[parent], createdAt: clock++ };
			if (options.failFork) throw new Error("fork refused");
		},
		remove: async (name) => {
			calls.push(`remove ${name}`);
			if (drives[name]?.attachedTo) throw new Error("attached");
			delete drives[name];
		},
		readManifest: async (name) => drives[name]?.manifest ?? null,
		write: async (name, _region, script) => {
			calls.push(`write ${name}`);
			const drive = drives[name];
			scripts[name] = script(drive?.manifest ?? null);
			const stdout = options.builder?.(name) ?? written();
			if (drive)
				drive.manifest = JSON.stringify(agentToolsManifest(agentAssets));
			return stdout;
		},
	};
	return { host, calls, drives, scripts };
}

const agentLine = (script: string | undefined, name: string) =>
	script?.split("\n").find((line) => line.startsWith(`agent '${name}' `));

describe("publishAgentToolsDrive", () => {
	const drive = "agent-tools-sfo1-0123456789ab";
	const publish = (host: DriveHost, warn: (line: string) => void = () => {}) =>
		publishAgentToolsDrive({
			host,
			region: "sfo1",
			bundleSha: BUNDLE,
			assets: agentAssets,
			warn,
		});

	test("with no earlier drive, creates the drive and writes every agent", async () => {
		const { host, calls, scripts } = fakeHost({});
		const result = await publish(host);
		expect(result.drive).toBe(drive);
		expect(result.outcome).toBe("published");
		expect(result.forkedFrom).toBeUndefined();
		expect(result.agents.map((agent) => agent.outcome)).toEqual([
			"written",
			"written",
			"written",
		]);
		expect(calls).toEqual([`create ${drive}`, `write ${drive}`]);
		expect(agentLine(scripts[drive], "claude")).toEndWith("'' '' '--version'");
	});

	test("leaves a drive that has a manifest alone", async () => {
		const { host, calls } = fakeHost({
			[drive]: { manifest: JSON.stringify(agentToolsManifest(agentAssets)) },
		});
		expect((await publish(host)).outcome).toBe("exists");
		expect(calls).toEqual([]);
	});

	test("recreates a drive an earlier run left without a manifest", async () => {
		const { host, calls } = fakeHost({ [drive]: {} });
		await publish(host);
		expect(calls).toEqual([
			`remove ${drive}`,
			`create ${drive}`,
			`write ${drive}`,
		]);
	});

	test("refuses a drive a writer still holds", async () => {
		const { host, calls } = fakeHost({ [drive]: { attachedTo: "builder" } });
		await expect(publish(host)).rejects.toThrow(/attached to builder/);
		expect(calls).toEqual([]);
	});

	test("forks the region's newest free drive and hands the builder its manifest", async () => {
		const earlier = [
			{ name: "claude", sha: sha("e"), bin: "claude" },
			{ name: "codex", sha: sha("b"), bin: "bin/codex" },
		];
		const { host, calls, scripts } = fakeHost({
			"agent-tools-sfo1-111111111111": {
				createdAt: 1,
				manifest: JSON.stringify([
					{ name: "claude", sha: sha("1"), bin: "claude" },
				]),
			},
			"agent-tools-sfo1-222222222222": {
				createdAt: 2,
				manifest: JSON.stringify(earlier),
			},
			"agent-tools-sfo1-333333333333": { createdAt: 3, attachedTo: "box" },
			"agent-tools-iad1-444444444444": { createdAt: 4 },
		});
		const result = await publish(host);
		expect(result.forkedFrom).toBe("agent-tools-sfo1-222222222222");
		expect(calls).toEqual([
			`fork agent-tools-sfo1-222222222222 ${drive}`,
			`write ${drive}`,
		]);
		expect(agentLine(scripts[drive], "claude")).toEndWith(
			`'${sha("e")}' 'claude' '--version'`,
		);
		expect(agentLine(scripts[drive], "pdev")).toEndWith("'' '' '--version'");
	});

	test("a failed fork warns and falls back to writing every agent", async () => {
		const warnings: string[] = [];
		const { host, calls, scripts } = fakeHost(
			{
				"agent-tools-sfo1-222222222222": {
					createdAt: 2,
					manifest: JSON.stringify(agentToolsManifest(agentAssets)),
				},
			},
			{ failFork: true },
		);
		const result = await publish(host, (line) => warnings.push(line));
		expect(result.forkedFrom).toBeUndefined();
		expect(calls).toEqual([
			`fork agent-tools-sfo1-222222222222 ${drive}`,
			`remove ${drive}`,
			`create ${drive}`,
			`write ${drive}`,
		]);
		expect(warnings.join("\n")).toContain("fork refused");
		expect(agentLine(scripts[drive], "claude")).toEndWith("'' '' '--version'");
	});

	test("reports each agent's outcome and warns for the ones that missed the bundle", async () => {
		const tools = [
			{ name: "claude", bin: "claude" },
			{ name: "codex", bin: "bin/codex" },
			{ name: "pdev", bin: "pdev/pdev" },
			{ name: "chrome", bin: "chrome", check: ["--headless", "--version"] },
		];
		const { host, scripts } = fakeHost(
			{},
			{
				builder: () =>
					[
						"noise",
						`agent-tools-result claude written ${sha("a")}`,
						`agent-tools-result codex reused ${sha("b")}`,
						`agent-tools-result pdev kept-previous ${sha("9")}`,
						"agent-tools-result chrome dropped ",
					].join("\n"),
			},
		);
		const result = await publishAgentToolsDrive({
			host,
			region: "sfo1",
			bundleSha: BUNDLE,
			assets: agentAssets,
			tools,
		});
		expect(result.agents).toEqual([
			{ name: "claude", outcome: "written", sha: sha("a") },
			{ name: "codex", outcome: "reused", sha: sha("b") },
			{ name: "pdev", outcome: "kept-previous", sha: sha("9") },
			{ name: "chrome", outcome: "dropped" },
		]);
		expect(agentLine(scripts[drive], "chrome")).toEndWith(
			"'--headless' '--version'",
		);
		const lines = describeAgentToolsPublish([{ region: "sfo1", result }]);
		expect(lines[0]).toBe(
			`agent-tools: ${drive} published: claude written, codex reused, pdev kept-previous, chrome dropped`,
		);
		expect(lines.slice(1)).toEqual([
			expect.stringMatching(/^::warning::.*pdev kept 999999999999/),
			expect.stringMatching(/^::warning::.*chrome left out/),
		]);
	});
});

describe("publishAgentToolsDrives", () => {
	test("runs regions in parallel up to the limit, and one failure stays in its region", async () => {
		const { host } = fakeHost({});
		let running = 0;
		let peak = 0;
		const write = host.write;
		host.write = async (name, region, script) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 1));
			running--;
			if (region === "iad1") throw new Error("builder exited 1");
			return write(name, region, script);
		};
		const regions = ["sfo1", "iad1", "fra1", "lhr1", "sin1"] as const;
		const results = await publishAgentToolsDrives({
			host,
			regions,
			bundleSha: BUNDLE,
			assets: agentAssets,
			concurrency: 2,
		});
		expect(peak).toBe(2);
		expect(results.map((entry) => [entry.region, "error" in entry])).toEqual([
			["sfo1", false],
			["iad1", true],
			["fra1", false],
			["lhr1", false],
			["sin1", false],
		]);
		expect(
			describeAgentToolsPublish(results).filter((line) =>
				line.startsWith("::warning::"),
			),
		).toEqual([expect.stringMatching(/iad1 not published.*builder exited 1/)]);
	});
});

test("builder results ignore lines that are not results", () => {
	expect(
		parseBuilderResults(
			`claude: written\nagent-tools-result claude reused ${sha("a")}\nagent-tools-result x bogus\n`,
		),
	).toEqual([{ name: "claude", outcome: "reused", sha: sha("a") }]);
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
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode: await proc.exited, stdout, stderr };
}

function serve(objects: Map<string, Uint8Array>) {
	const requests: string[] = [];
	const server = Bun.serve({
		port: 0,
		fetch: (request) => {
			const key = new URL(request.url).pathname.slice(1);
			requests.push(key);
			return new Response(objects.get(key) ?? "not the agent");
		},
	});
	return { server, requests, baseUrl: `http://127.0.0.1:${server.port}` };
}

const agentScript = (body: string) =>
	new TextEncoder().encode(`#!/bin/sh\n${body}\n`);

function placeAgent(root: string, name: string, body: Uint8Array) {
	const dir = join(root, name, sha256(body));
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), body, { mode: 0o755 });
	return { name, sha: sha256(body), bin: name };
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
		const claude = agentScript("echo claude");
		const codex = readFileSync(join(work, "codex.tar.gz"));
		const { server, baseUrl } = serve(
			new Map<string, Uint8Array>([
				[sha256(claude), claude],
				[`${sha256(codex)}.tar.gz`, codex],
			]),
		);
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
					baseUrl,
					assets: {
						claude: row(sha256(claude), ""),
						codex: row(sha256(codex), ".tar.gz"),
					},
					manifest,
				}),
			);
			expect(run.exitCode, run.stderr).toBe(0);
			expect(parseBuilderResults(run.stdout)).toEqual([
				{ name: "claude", outcome: "written", sha: sha256(claude) },
				{ name: "codex", outcome: "written", sha: sha256(codex) },
			]);
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
			expect(existsSync(join(root, ".manifest.json.partial"))).toBe(false);
		} finally {
			server.stop(true);
		}
	});

	test("an agent that fails with no earlier copy is left out; with none left there is no manifest", async () => {
		const root = mkdtempSync(join(tmpdir(), "agent-tools-"));
		const { server, baseUrl } = serve(new Map());
		try {
			const run = await runScript(
				renderBuilderScript({
					root,
					baseUrl,
					assets: { claude: row(sha("a"), "") },
					manifest: [{ name: "claude", sha: sha("a"), bin: "claude" }],
				}),
			);
			expect(run.exitCode).not.toBe(0);
			expect(parseBuilderResults(run.stdout)).toEqual([
				{ name: "claude", outcome: "dropped" },
			]);
			expect(existsSync(join(root, "manifest.json"))).toBe(false);
		} finally {
			server.stop(true);
		}
	});

	test("on a fork, fetches only changed agents, falls back per agent and removes what the manifest drops", async () => {
		const root = mkdtempSync(join(tmpdir(), "agent-tools-"));
		const oldClaude = placeAgent(root, "claude", agentScript("echo old"));
		const oldCodex = placeAgent(root, "codex", agentScript("echo old"));
		const pdev = placeAgent(root, "pdev", agentScript("echo pdev"));
		const gone = placeAgent(root, "gone", agentScript("echo gone"));
		mkdirSync(join(root, "lost+found"));
		mkdirSync(join(root, "pdev", `${pdev.sha}.partial`));
		const previous = [oldClaude, oldCodex, pdev, gone];
		writeFileSync(join(root, "manifest.json"), JSON.stringify(previous));

		const newClaude = agentScript("echo new");
		const newCodex = sha("b");
		const fresh = sha("f");
		const { server, requests, baseUrl } = serve(
			new Map([[sha256(newClaude), newClaude]]),
		);
		const manifest: AgentToolsManifest = [
			{ name: "claude", sha: sha256(newClaude), bin: "claude" },
			{ name: "codex", sha: newCodex, bin: "codex" },
			pdev,
			{ name: "fresh", sha: fresh, bin: "fresh" },
		];
		try {
			const run = await runScript(
				renderBuilderScript({
					root,
					baseUrl,
					assets: {
						claude: row(sha256(newClaude), ""),
						codex: row(newCodex, ""),
						pdev: row(pdev.sha, ""),
						fresh: row(fresh, ""),
					},
					manifest,
					previous,
				}),
			);
			expect(run.exitCode, run.stderr).toBe(0);
			expect(parseBuilderResults(run.stdout)).toEqual([
				{ name: "claude", outcome: "written", sha: sha256(newClaude) },
				{ name: "codex", outcome: "kept-previous", sha: oldCodex.sha },
				{ name: "pdev", outcome: "reused", sha: pdev.sha },
				{ name: "fresh", outcome: "dropped" },
			]);
			expect(requests.sort()).toEqual(
				[sha256(newClaude), newCodex, fresh].sort(),
			);
			expect(
				parseAgentToolsManifest(
					readFileSync(join(root, "manifest.json"), "utf8"),
				),
			).toEqual([manifest[0], oldCodex, pdev] as AgentToolsManifest);
			expect(existsSync(join(root, "claude", oldClaude.sha))).toBe(false);
			expect(existsSync(join(root, "gone"))).toBe(false);
			expect(existsSync(join(root, "fresh"))).toBe(false);
			expect(existsSync(join(root, "pdev", `${pdev.sha}.partial`))).toBe(false);
			expect(existsSync(join(root, "lost+found"))).toBe(true);
		} finally {
			server.stop(true);
		}
	});

	test("an agent that fails its check is not named: the earlier one is kept, or it is left out", async () => {
		const root = mkdtempSync(join(tmpdir(), "agent-tools-"));
		const good = placeAgent(
			root,
			"claude",
			agentScript('[ "$1" = selftest ] || exit 9'),
		);
		const broken = agentScript("exit 3");
		const hangs = agentScript("sleep 30");
		const { server, baseUrl } = serve(
			new Map([
				[sha256(broken), broken],
				[sha256(hangs), hangs],
			]),
		);
		try {
			const run = await runScript(
				renderBuilderScript({
					root,
					baseUrl,
					assets: {
						claude: row(sha256(broken), ""),
						codex: row(sha256(hangs), ""),
					},
					manifest: [
						{ name: "claude", sha: sha256(broken), bin: "claude" },
						{ name: "codex", sha: sha256(hangs), bin: "codex" },
					],
					previous: [good],
					tools: [
						{ name: "claude", bin: "claude", check: ["selftest"] },
						{ name: "codex", bin: "codex" },
					],
					checkTimeoutSeconds: 1,
				}),
			);
			expect(run.exitCode, run.stderr).toBe(0);
			expect(parseBuilderResults(run.stdout)).toEqual([
				{ name: "claude", outcome: "kept-previous", sha: good.sha },
				{ name: "codex", outcome: "dropped" },
			]);
			expect(run.stderr).toContain("check failed");
			expect(
				parseAgentToolsManifest(
					readFileSync(join(root, "manifest.json"), "utf8"),
				),
			).toEqual([good]);
			expect(existsSync(join(root, "codex"))).toBe(false);
		} finally {
			server.stop(true);
		}
	});
});
