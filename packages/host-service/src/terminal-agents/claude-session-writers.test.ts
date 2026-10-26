import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	findClaudeSessionWriterDetails,
	findClaudeSessionWriters,
	inspectClaudeWriterOwner,
	readProcessStarts,
} from "./claude-session-writers";

const homes: string[] = [];
const start = "Thu Oct  1 01:41:15 2026";
const normalized = "Thu Oct 1 01:41:15 2026";

afterEach(async () => {
	await Promise.all(
		homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
	);
});

async function fixture() {
	const home = await mkdtemp(join(tmpdir(), "claude-writer-test-"));
	homes.push(home);
	await mkdir(join(home, "sessions"));
	const sessionId = randomUUID();
	return {
		home,
		input: { sessionId, directories: [home] },
		write: (pid: number, extra: Record<string, unknown> = {}) =>
			writeFile(
				join(home, "sessions", `${pid}.json`),
				JSON.stringify({
					pid,
					procStart: start,
					pidDomain: "darwin",
					sessionId,
					...extra,
				}),
			),
	};
}

describe("native Claude writer evidence", () => {
	test("preserves owner details without changing the numeric writer API", async () => {
		const f = await fixture();
		await f.write(101, { entrypoint: "claude-desktop", kind: "interactive" });
		const processStarts = async () => new Map([[101, normalized]]);
		expect(
			await findClaudeSessionWriters(f.input, {
				platform: "darwin",
				processStarts,
			}),
		).toEqual([101]);
		expect(
			await findClaudeSessionWriterDetails(f.input, {
				platform: "darwin",
				processStarts,
				owner: async () => "claude-desktop",
			}),
		).toEqual([
			{
				pid: 101,
				procStart: normalized,
				entrypoint: "claude-desktop",
				kind: "interactive",
				owner: "claude-desktop",
			},
		]);
	});
	test("does not return an owner for a PID reused during inspection", async () => {
		const f = await fixture();
		await f.write(101);
		let reads = 0;
		expect(
			await findClaudeSessionWriterDetails(f.input, {
				platform: "darwin",
				processStarts: async () =>
					new Map([
						[101, ++reads === 1 ? normalized : "Thu Oct 1 01:42:15 2026"],
					]),
				owner: async () => "claude-desktop",
			}),
		).toEqual([]);
	});
	test("bounds expensive owner inspection while retaining every blocking writer", async () => {
		const f = await fixture();
		await Promise.all(
			Array.from({ length: 9 }, (_, index) => f.write(101 + index)),
		);
		const result = await findClaudeSessionWriterDetails(f.input, {
			platform: "darwin",
			processStarts: async (pids) =>
				new Map(pids.map((pid) => [pid, normalized])),
			owner: async () => {
				throw new Error("Must not inspect an already ambiguous writer set");
			},
		});
		expect(result).toHaveLength(9);
		expect(result.every(({ owner }) => owner === "unknown")).toBe(true);
	});
	test("matches the exact session and process incarnation", async () => {
		const f = await fixture();
		await f.write(101);
		await f.write(102, { sessionId: randomUUID() });
		await f.write(103);
		expect(
			await findClaudeSessionWriters(f.input, {
				platform: "darwin",
				processStarts: async (pids) => {
					expect(pids.sort()).toEqual([101, 103]);
					return new Map([[101, normalized]]);
				},
			}),
		).toEqual([101]);
	});
	test("ignores a reused PID with a different start fingerprint", async () => {
		const f = await fixture();
		await f.write(101);
		expect(
			await findClaudeSessionWriters(f.input, {
				platform: "darwin",
				processStarts: async () => new Map([[101, "Thu Oct 1 01:42:15 2026"]]),
			}),
		).toEqual([]);
	});
	test("deduplicates shared registry symlinks and repeated profile paths", async () => {
		const f = await fixture();
		await f.write(101);
		const alias = join(f.home, "alias");
		await mkdir(alias);
		await symlink(join(f.home, "sessions"), join(alias, "sessions"));
		expect(
			await findClaudeSessionWriters(
				{ ...f.input, directories: [f.home, alias, f.home] },
				{
					platform: "darwin",
					processStarts: async (pids) => {
						expect(pids).toEqual([101]);
						return new Map([[101, normalized]]);
					},
				},
			),
		).toEqual([101]);
	});
	test("does not create missing registry folders or claim a writer", async () => {
		const f = await fixture();
		expect(
			await findClaudeSessionWriters(
				{ ...f.input, directories: [join(f.home, "missing")] },
				{
					platform: "darwin",
					processStarts: async (pids) => {
						expect(pids).toEqual([]);
						return new Map();
					},
				},
			),
		).toEqual([]);
	});
	for (const change of [
		{ procStart: "future-format" },
		{ pidDomain: "linux" },
		{ pid: 102 },
		{ pid: -1 },
	]) {
		test(`refuses uncertain matching process identity ${JSON.stringify(change)}`, async () => {
			const f = await fixture();
			await f.write(101, change);
			await expect(
				findClaudeSessionWriters(f.input, { platform: "darwin" }),
			).rejects.toThrow("could not be verified");
		});
	}
	test("refuses malformed or oversized records instead of treating them as absent", async () => {
		const f = await fixture();
		for (const value of ["{", " ".repeat(65537)]) {
			await writeFile(join(f.home, "sessions", "101.json"), value);
			await expect(
				findClaudeSessionWriters(f.input, { platform: "darwin" }),
			).rejects.toThrow("could not be read");
		}
	});
	test("does not follow a record symlink", async () => {
		const f = await fixture();
		await symlink(
			join(f.home, "outside"),
			join(f.home, "sessions", "101.json"),
		);
		await expect(
			findClaudeSessionWriters(f.input, { platform: "darwin" }),
		).rejects.toThrow("unreadable record");
	});
	test("bounds directory traversal", async () => {
		const f = await fixture();
		await Promise.all(
			Array.from({ length: 1025 }, (_, i) =>
				writeFile(join(f.home, "sessions", `entry-${i}`), ""),
			),
		);
		await expect(
			findClaudeSessionWriters(f.input, { platform: "darwin" }),
		).rejects.toThrow("too large");
	});
	test("propagates process observation failures", async () => {
		const f = await fixture();
		await f.write(101);
		await expect(
			findClaudeSessionWriters(f.input, {
				platform: "darwin",
				processStarts: async () => {
					throw new Error("Process lookup unavailable");
				},
			}),
		).rejects.toThrow("Process lookup unavailable");
	});
	test("does not infer support on an unqualified operating system", async () => {
		const f = await fixture();
		await f.write(101);
		expect(
			await findClaudeSessionWriters(f.input, {
				platform: "win32",
				processStarts: async () => {
					throw new Error("Must not run");
				},
			}),
		).toEqual([]);
	});
	test("detects an owned real process and ignores its record after exit", async () => {
		if (process.platform !== "darwin" && process.platform !== "linux") return;
		const f = await fixture();
		const child = Bun.spawn(
			[process.execPath, "-e", "setInterval(() => {}, 1000)"],
			{ stdout: "ignore", stderr: "ignore" },
		);
		try {
			const starts = await readProcessStarts([child.pid]);
			expect(starts.has(child.pid)).toBe(true);
			await f.write(child.pid, {
				procStart: starts.get(child.pid),
				pidDomain: process.platform,
			});
			expect(await findClaudeSessionWriters(f.input)).toEqual([child.pid]);
			child.kill();
			await child.exited;
			expect(await findClaudeSessionWriters(f.input)).toEqual([]);
		} finally {
			if (child.exitCode === null) child.kill();
			await child.exited;
		}
	});
});

describe("Claude Desktop writer ownership", () => {
	const home = "/fixture";
	const cli = `${home}/Library/Application Support/Claude/claude-code/2.1.299/4fa9694b7975/claude.app/Contents/MacOS/claude`;
	const parent = "/Applications/Claude.app/Contents/Helpers/disclaimer";
	const desktop = "/Applications/Claude.app/Contents/MacOS/Claude";
	function processFixture(
		changes: {
			child?: string;
			parent?: string;
			desktop?: string;
			mapped?: boolean;
		} = {},
	) {
		const processes = new Map([
			[101, { parent: 102, path: changes.child ?? cli }],
			[102, { parent: 103, path: changes.parent ?? parent }],
			[103, { parent: 1, path: changes.desktop ?? desktop }],
		]);
		return async (file: string, args: string[]) => {
			const pid = Number(args[args.indexOf("-p") + 1]);
			const process = processes.get(pid);
			if (!process) throw new Error("Unknown fixture process");
			return file === "/bin/ps"
				? `${pid} ${process.parent} ${start} ${process.path}\n`
				: `p${pid}\nn${changes.mapped === false ? "/other/executable" : process.path}\n`;
		};
	}
	test("requires mapped executable and both stable Desktop ancestors", async () => {
		expect(
			await inspectClaudeWriterOwner(
				{
					pid: 101,
					procStart: normalized,
					entrypoint: "claude-desktop",
					kind: "interactive",
				},
				{
					platform: "darwin",
					home,
					run: processFixture(),
				},
			),
		).toBe("claude-desktop");
	});
	for (const changes of [
		{ child: "/fake/claude" },
		{ parent: "/other/disclaimer" },
		{ desktop: "/other/Claude" },
		{ mapped: false },
	])
		test(`does not trust a Desktop entrypoint alone ${JSON.stringify(changes)}`, async () => {
			expect(
				await inspectClaudeWriterOwner(
					{ pid: 101, procStart: normalized, entrypoint: "claude-desktop" },
					{
						platform: "darwin",
						home,
						run: processFixture(changes),
					},
				),
			).toBe("unknown");
		});
	test("does not attribute a different process incarnation to Desktop", async () => {
		expect(
			await inspectClaudeWriterOwner(
				{
					pid: 101,
					procStart: "Thu Oct 1 01:42:15 2026",
					entrypoint: "claude-desktop",
				},
				{
					platform: "darwin",
					home,
					run: processFixture(),
				},
			),
		).toBe("unknown");
	});
	test("labels a mapped native background worker separately from an attached terminal", async () => {
		expect(
			await inspectClaudeWriterOwner(
				{ pid: 101, procStart: normalized, kind: "background" },
				{
					platform: "darwin",
					home,
					run: processFixture({
						child: `${home}/.local/share/claude/versions/2.1.303`,
					}),
				},
			),
		).toBe("background");
	});
});
