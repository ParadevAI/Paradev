import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});
const bridge = fileURLToPath(
	new URL("../templates/claude-usage-statusline.cjs", import.meta.url),
);
function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "claude-native-bridge-"));
	directories.push(dir);
	const home = join(dir, "home");
	const cwd = join(dir, "project");
	const config = join(home, ".claude");
	mkdirSync(config, { recursive: true });
	mkdirSync(cwd);
	const env = {
		...process.env,
		HOME: home,
		SUPERSET_HOME_DIR: join(home, ".superset"),
		CLAUDE_CONFIG_DIR: config,
		SUPERSET_AGENT_ID: "claude",
		SUPERSET_NATIVE_CLAUDE_USAGE: "1",
		SUPERSET_PINNED_ACCOUNT: "CLAUDE_CONFIG_DIR",
		SUPERSET_TERMINAL_ID: "terminal",
		SUPERSET_AGENT_LAUNCH_ID: "launch",
		SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN: "fixture-attribution",
	};
	return { dir, cwd, config, env };
}
test("real Node launch overlay preserves existing statusline options and leaves every settings file untouched", () => {
	const f = fixture();
	const settings = JSON.stringify({
		statusLine: {
			type: "command",
			command: "printf 'custom output\\n'",
			padding: 3,
			refreshInterval: 9,
			hideVimModeIndicator: true,
		},
		permissions: { defaultMode: "default" },
	});
	writeFileSync(join(f.config, "settings.json"), settings);
	const child = spawnSync("node", [bridge, "--prepare"], {
		cwd: f.cwd,
		env: f.env,
		encoding: "utf8",
	});
	expect(child.status).toBe(0);
	const overlay = JSON.parse(child.stdout);
	expect(overlay.statusLine).toMatchObject({
		padding: 3,
		refreshInterval: 9,
		hideVimModeIndicator: true,
	});
	expect(overlay.statusLine.command).toContain("--status");
	expect(Object.keys(overlay)).toEqual(["statusLine"]);
	expect(readFileSync(join(f.config, "settings.json"), "utf8")).toBe(settings);
	for (const args of [
		["--settings", "{}"],
		["--setting-sources=user"],
		["--print"],
		["attach", "session"],
		["--resume", "session"],
		["-r", "session"],
		["--continue"],
		["-c"],
		["--fork-session"],
		["--output-format", "stream-json"],
	]) {
		expect(
			spawnSync("node", [bridge, "--prepare", ...args], {
				cwd: f.cwd,
				env: f.env,
				encoding: "utf8",
			}).stdout,
		).toBe("");
	}
});
test("real Node bridge preserves user stdin and output, sends only bounded native fields to the owning host", async () => {
	const f = fixture();
	const requests: unknown[] = [];
	const host = Bun.serve({
		port: 0,
		async fetch(request) {
			requests.push(await request.json());
			return Response.json({ result: { data: { json: { ignored: false } } } });
		},
	});
	try {
		writeFileSync(
			join(f.config, "settings.json"),
			JSON.stringify({
				statusLine: {
					type: "command",
					command: "printf 'unchanged output\\n'; cat",
				},
			}),
		);
		const prepared = spawnSync("node", [bridge, "--prepare"], {
			cwd: f.cwd,
			env: f.env,
			encoding: "utf8",
		});
		const overlay = JSON.parse(prepared.stdout);
		const input = JSON.stringify({
			session_id: "session",
			cost: { total_api_duration_ms: 123, total_cost_usd: 2 },
			rate_limits: {
				five_hour: { used_percentage: 25, resets_at: 1_800_000_600 },
				spend_limit: { used_usd: 999 },
			},
			transcript_path: "/never-forward",
			account: { email: "never-forward@example.test" },
			other: "never-forward",
		});
		const proc = Bun.spawn(["sh", "-c", overlay.statusLine.command], {
			cwd: f.cwd,
			env: {
				...f.env,
				SUPERSET_HOST_AGENT_HOOK_URL: `http://127.0.0.1:${host.port}/trpc/notifications.hook`,
			},
			stdin: Buffer.from(input),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [output, code, errors] = await Promise.all([
			new Response(proc.stdout).text(),
			proc.exited,
			new Response(proc.stderr).text(),
		]);
		expect(code).toBe(0);
		expect(errors).toBe("");
		expect(output).toBe(`unchanged output\n${input}`);
		const repeated = Bun.spawn(["sh", "-c", overlay.statusLine.command], {
			cwd: f.cwd,
			env: {
				...f.env,
				SUPERSET_HOST_AGENT_HOOK_URL: `http://127.0.0.1:${host.port}/trpc/notifications.hook`,
			},
			stdin: Buffer.from(input),
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await new Response(repeated.stdout).text()).toBe(
			`unchanged output\n${input}`,
		);
		expect(await repeated.exited).toBe(0);
		expect(requests).toHaveLength(1);
		expect(requests[0]).toEqual({
			json: {
				terminalId: "terminal",
				launchId: "launch",
				attributionToken: "fixture-attribution",
				agent: { agentId: "claude", sessionId: "session" },
				nativeClaudeUsage: {
					session_id: "session",
					cost: { total_api_duration_ms: 123 },
					rate_limits: {
						five_hour: { used_percentage: 25, resets_at: 1_800_000_600 },
					},
				},
			},
		});
	} finally {
		host.stop(true);
	}
});
test("ambiguous parent settings and nested working folders leave the native launch unchanged", () => {
	const f = fixture();
	mkdirSync(join(f.dir, ".claude"));
	writeFileSync(
		join(f.dir, ".claude", "settings.json"),
		JSON.stringify({
			statusLine: { type: "command", command: "printf parent" },
		}),
	);
	expect(
		spawnSync("node", [bridge, "--prepare"], {
			cwd: f.cwd,
			env: f.env,
			encoding: "utf8",
		}).stdout,
	).toBe("");
});

test("statusline feed is opt-in and requires an explicit account pin", () => {
	const f = fixture();
	for (const override of [
		{ SUPERSET_NATIVE_CLAUDE_USAGE: "" },
		{ SUPERSET_PINNED_ACCOUNT: "" },
	]) {
		const child = spawnSync("node", [bridge, "--prepare"], {
			cwd: f.cwd,
			env: { ...f.env, ...override },
			encoding: "utf8",
		});
		expect(child.status).toBe(0);
		expect(child.stdout).toBe("");
	}
});

test("capture transport has an absolute deadline even when a local host trickles bytes", async () => {
	const f = fixture();
	let stopped = false;
	const host = Bun.serve({
		port: 0,
		fetch() {
			return new Response(
				new ReadableStream({
					start(controller) {
						const timer = setInterval(() => {
							if (stopped) {
								clearInterval(timer);
								return;
							}
							try {
								controller.enqueue(new TextEncoder().encode(" "));
							} catch {
								clearInterval(timer);
							}
						}, 25);
					},
				}),
			);
		},
	});
	try {
		const saved = Buffer.from(
			JSON.stringify({ type: "command", command: "printf 'kept output'" }),
		).toString("base64url");
		const started = Date.now();
		const proc = Bun.spawn(["node", bridge, "--status", saved], {
			cwd: f.cwd,
			env: {
				...f.env,
				SUPERSET_HOST_AGENT_HOOK_URL: `http://127.0.0.1:${host.port}/trpc/notifications.hook`,
			},
			stdin: Buffer.from(
				JSON.stringify({
					session_id: "owned",
					cost: { total_api_duration_ms: 0 },
				}),
			),
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await new Response(proc.stdout).text()).toBe("kept output");
		expect(await proc.exited).toBe(0);
		expect(Date.now() - started).toBeLessThan(2000);
	} finally {
		stopped = true;
		await host.stop(true);
	}
});

test("a user's statusline exit code and output survive a rejected or unavailable capture", () => {
	const f = fixture();
	const saved = Buffer.from(
		JSON.stringify({ type: "command", command: "printf 'retained'; exit 7" }),
	).toString("base64url");
	const child = spawnSync("node", [bridge, "--status", saved], {
		cwd: f.cwd,
		env: {
			...f.env,
			SUPERSET_HOST_AGENT_HOOK_URL:
				"https://public.example.test/trpc/notifications.hook",
		},
		input: JSON.stringify({
			session_id: "owned",
			cost: { total_api_duration_ms: 0 },
		}),
		encoding: "utf8",
	});
	expect(child.status).toBe(7);
	expect(child.stdout).toBe("retained");
});

test("native collection reaches the host while a custom statusline waits for its marker", async () => {
	const f = fixture();
	const marker = join(f.dir, "collector-received");
	const custom = join(f.dir, "original.cjs");
	const input = Buffer.from(
		JSON.stringify({
			session_id: "owned",
			cost: { total_api_duration_ms: 123 },
			rate_limits: {
				five_hour: { used_percentage: 25, resets_at: 1_800_000_600 },
			},
		}),
	);
	const outputPrefix = Buffer.from([0, 255, 10]);
	const expectedErrors = Buffer.from([101, 114, 114, 0, 254]);
	writeFileSync(
		custom,
		`
const fs = require("node:fs");
const path = require("node:path");
const marker = ${JSON.stringify(marker)};
const chunks = [];
process.stdin.on("data", chunk => chunks.push(chunk));
process.stdin.on("end", () => {
 let watcher;
 let timer;
 let finished = false;
 const finish = () => {
  if (finished || !fs.existsSync(marker)) return;
  finished = true;
  clearTimeout(timer);
  watcher?.close();
  process.stdout.write(Buffer.from([0, 255, 10]));
  process.stdout.write(Buffer.concat(chunks));
  process.stderr.write(Buffer.from([101, 114, 114, 0, 254]));
  process.exitCode = 7;
 };
 watcher = fs.watch(path.dirname(marker), finish);
 timer = setTimeout(() => {
  watcher.close();
  process.stderr.write("collector never reached the host");
  process.exitCode = 91;
 }, 1500);
 finish();
});
`,
	);
	let requests = 0;
	const host = Bun.serve({
		port: 0,
		async fetch(request) {
			const body = await request.json();
			expect(body.json.nativeClaudeUsage.session_id).toBe("owned");
			requests++;
			writeFileSync(marker, "received");
			return Response.json({ result: { data: { json: { ignored: false } } } });
		},
	});
	try {
		const saved = Buffer.from(
			JSON.stringify({
				type: "command",
				command: `node '${custom.replaceAll("'", "'\\''")}'`,
				padding: 3,
			}),
		).toString("base64url");
		const proc = Bun.spawn(["node", bridge, "--status", saved], {
			cwd: f.cwd,
			env: {
				...f.env,
				SUPERSET_HOST_AGENT_HOOK_URL: `http://127.0.0.1:${host.port}/trpc/notifications.hook`,
			},
			stdin: input,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [output, errors, code] = await Promise.all([
			new Response(proc.stdout).arrayBuffer(),
			new Response(proc.stderr).arrayBuffer(),
			proc.exited,
		]);
		expect(code).toBe(7);
		expect(Buffer.from(output)).toEqual(Buffer.concat([outputPrefix, input]));
		expect(Buffer.from(errors)).toEqual(expectedErrors);
		expect(requests).toBe(1);
	} finally {
		await host.stop(true);
	}
});

test("custom statusline output remains bounded while collection is unavailable", async () => {
	const f = fixture();
	const custom = join(f.dir, "large-output.cjs");
	writeFileSync(custom, "process.stdout.write(Buffer.alloc(600 * 1024, 65));");
	const saved = Buffer.from(
		JSON.stringify({
			type: "command",
			command: `node '${custom.replaceAll("'", "'\\''")}'`,
		}),
	).toString("base64url");
	const proc = Bun.spawn(["node", bridge, "--status", saved], {
		cwd: f.cwd,
		env: {
			...f.env,
			SUPERSET_HOST_AGENT_HOOK_URL:
				"https://public.example.test/trpc/notifications.hook",
		},
		stdin: Buffer.from(
			JSON.stringify({
				session_id: "owned",
				cost: { total_api_duration_ms: 0 },
			}),
		),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [output, _errors, code] = await Promise.all([
		new Response(proc.stdout).arrayBuffer(),
		new Response(proc.stderr).arrayBuffer(),
		proc.exited,
	]);
	expect(code).toBe(1);
	expect(output.byteLength).toBeLessThanOrEqual(512 * 1024);
	expect(output.byteLength).toBeGreaterThan(0);
});

test("the custom command keeps the combined stdout/stderr buffer ceiling", async () => {
	const f = fixture();
	const custom = join(f.dir, "combined-output.cjs");
	writeFileSync(
		custom,
		"process.stdout.write(Buffer.alloc(300 * 1024, 65)); process.stderr.write(Buffer.alloc(300 * 1024, 66));",
	);
	const saved = Buffer.from(
		JSON.stringify({
			type: "command",
			command: `node '${custom.replaceAll("'", "'\\''")}'`,
		}),
	).toString("base64url");
	const proc = Bun.spawn(["node", bridge, "--status", saved], {
		cwd: f.cwd,
		env: {
			...f.env,
			SUPERSET_HOST_AGENT_HOOK_URL:
				"https://public.example.test/trpc/notifications.hook",
		},
		stdin: Buffer.from(
			JSON.stringify({
				session_id: "owned",
				cost: { total_api_duration_ms: 0 },
			}),
		),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [output, errors, code] = await Promise.all([
		new Response(proc.stdout).arrayBuffer(),
		new Response(proc.stderr).arrayBuffer(),
		proc.exited,
	]);
	expect(code).toBe(1);
	expect(output.byteLength + errors.byteLength).toBeLessThanOrEqual(512 * 1024);
	expect(output.byteLength).toBeGreaterThan(0);
	expect(errors.byteLength).toBeGreaterThan(0);
});
