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
	agentToolsManifest,
	parseAgentToolsManifest,
	renderBuilderScript,
	shasToKeep,
} from "./agent-tools";
import { type Assets, sha256 } from "./manifest";

const sha = (c: string) => c.repeat(64);

function row(sha256: string, suffix: string): Assets[string] {
	return { sha256, suffix, dest: "/usr/local/share/x", mode: "0644" };
}

describe("agent-tools manifest", () => {
	test("lists every agent at its asset sha, bin relative to its dir", () => {
		const assets: Assets = {
			claude: row(sha("a"), ""),
			codex: row(sha("b"), ".tar.gz"),
			pdev: row(sha("c"), ".tar.gz"),
			chrome: row(sha("d"), ".deb"),
		};
		const manifest = agentToolsManifest(assets);
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

	test("keeps the new and the previous sha of each agent", () => {
		expect(
			shasToKeep(
				[{ name: "claude", sha: sha("a"), bin: "claude" }],
				[
					{ name: "claude", sha: sha("b"), bin: "claude" },
					{ name: "codex", sha: sha("c"), bin: "bin/codex" },
				],
			),
		).toEqual({ claude: [sha("a"), sha("b")], codex: [sha("c")] });
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
	test("publishes verified agents, writes the manifest, prunes all but two shas", async () => {
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
		mkdirSync(join(root, "claude", sha("1")), { recursive: true });
		mkdirSync(join(root, "claude", sha("2")), { recursive: true });
		const assets: Assets = {
			claude: row(sha256(claude), ""),
			codex: row(sha256(codex), ".tar.gz"),
		};
		const previous: AgentToolsManifest = [
			{ name: "claude", sha: sha("1"), bin: "claude" },
		];
		const next: AgentToolsManifest = [
			{ name: "claude", sha: sha256(claude), bin: "claude" },
			{ name: "codex", sha: sha256(codex), bin: "bin/codex" },
		];
		try {
			const run = await runScript(
				renderBuilderScript({
					root,
					baseUrl: `http://127.0.0.1:${server.port}`,
					assets,
					previous,
					next,
				}),
			);
			expect(run.exitCode, run.stderr).toBe(0);
			expect(
				parseAgentToolsManifest(
					readFileSync(join(root, "manifest.json"), "utf8"),
				),
			).toEqual(next);
			expect(
				Bun.spawnSync([join(root, "codex", sha256(codex), "bin", "codex")])
					.stdout.toString()
					.trim(),
			).toBe("codex");
			expect(existsSync(join(root, "claude", sha256(claude), "claude"))).toBe(
				true,
			);
			expect(existsSync(join(root, "claude", sha("1")))).toBe(true);
			expect(existsSync(join(root, "claude", sha("2")))).toBe(false);
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
					previous: [],
					next: [{ name: "claude", sha: sha("a"), bin: "claude" }],
				}),
			);
			expect(run.exitCode).not.toBe(0);
			expect(existsSync(join(root, "manifest.json"))).toBe(false);
		} finally {
			server.stop(true);
		}
	});
});
