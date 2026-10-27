import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { FileChange } from "../../acp/fileDiff";
import type { HostJobStatus, HostJobs } from "../hostJobs";
import { createRemoteTools, type RemoteTool } from "./remoteTools";

interface FakeJob {
	output: string;
	status: HostJobStatus;
	exitCode: number | null;
	kill: () => void;
}

function fakeHost(cwd: string): HostJobs & { execs: string[] } {
	const jobs = new Map<string, FakeJob>();
	const execs: string[] = [];
	return {
		execs,
		async exec({ callId, command }) {
			const existing = jobs.get(callId);
			if (existing)
				return {
					jobId: callId,
					status: existing.status,
					pid: 1,
					logPath: `/logs/${callId}`,
				};
			execs.push(command);
			const child = spawn("bash", ["-c", command], { cwd, detached: true });
			const job: FakeJob = {
				output: "",
				status: "running",
				exitCode: null,
				kill: () => {
					job.status = "killed";
					try {
						process.kill(-(child.pid ?? 0), "SIGKILL");
					} catch {}
				},
			};
			child.stdout.on("data", (d: Buffer) => (job.output += d.toString()));
			child.stderr.on("data", (d: Buffer) => (job.output += d.toString()));
			child.on("close", (code) => {
				if (job.status !== "running") return;
				job.exitCode = code;
				job.status = code === 0 ? "done" : "failed";
			});
			jobs.set(callId, job);
			return {
				jobId: callId,
				status: "running",
				pid: child.pid ?? null,
				logPath: `/logs/${callId}`,
			};
		},
		async output({ jobId, fromOffset, waitMs, pattern }) {
			const job = jobs.get(jobId);
			if (!job) throw new Error("not found");
			const deadline = Date.now() + waitMs;
			const regex = pattern ? new RegExp(pattern, "m") : null;
			while (
				job.status === "running" &&
				Date.now() < deadline &&
				(regex ? !regex.test(job.output) : job.output.length <= fromOffset)
			) {
				await new Promise((r) => setTimeout(r, 10));
			}
			return {
				jobId,
				status: job.status,
				chunk: job.output.slice(fromOffset),
				nextOffset: job.output.length,
				exitCode: job.exitCode,
				matched: regex ? regex.test(job.output) : false,
				logPath: `/logs/${jobId}`,
			};
		},
		async kill({ jobId }) {
			jobs.get(jobId)?.kill();
			return { status: jobs.get(jobId)?.status ?? "lost" };
		},
		async readFile({ path }) {
			const bytes = readFileSync(path);
			return { base64: bytes.toString("base64"), size: bytes.length };
		},
		async writeFile({ path, base64 }) {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, Buffer.from(base64, "base64"));
			return { size: 0 };
		},
		async mkdir({ path }) {
			mkdirSync(path, { recursive: true });
			return { ok: true };
		},
		async stat({ path }) {
			if (!existsSync(path)) return { exists: false };
			const info = statSync(path);
			return {
				exists: true,
				isFile: info.isFile(),
				isDirectory: info.isDirectory(),
				size: info.size,
				mtimeMs: info.mtimeMs,
			};
		},
		async readdir({ path }) {
			return readdirSync(path, { withFileTypes: true }).map((entry) => ({
				name: entry.name,
				isDirectory: entry.isDirectory(),
			}));
		},
	};
}

let cwd: string;
let host: ReturnType<typeof fakeHost>;
let changes: FileChange[];
let tools: Map<string, RemoteTool>;

async function run(name: string, args: Record<string, unknown>, id = "call_1") {
	const tool = tools.get(name);
	if (!tool) throw new Error(`no tool ${name}`);
	const result = await tool.execute(id, args, undefined, undefined);
	return result.content
		.map((block) => ("text" in block ? block.text : ""))
		.join("");
}

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "remote-tools-"));
	host = fakeHost(cwd);
	changes = [];
	tools = new Map(
		createRemoteTools({
			host,
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			onFileChange: (_id, change) => changes.push(change),
		}).map((tool) => [tool.name, tool]),
	);
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("remote tools", () => {
	it("exposes pdev's tool names plus the job tools", () => {
		expect([...tools.keys()].sort()).toEqual(
			[
				"bash",
				"edit",
				"find",
				"grep",
				"job_kill",
				"job_wait",
				"ls",
				"read",
				"write",
			].sort(),
		);
	});

	it("writes, edits and reads a file on the host, reporting each change", async () => {
		await run("write", { path: "src/a.ts", content: "const a = 1;\n" });
		await run("edit", {
			path: "src/a.ts",
			edits: [{ oldText: "1", newText: "2" }],
		});
		expect(readFileSync(join(cwd, "src/a.ts"), "utf8")).toBe("const a = 2;\n");
		expect(await run("read", { path: "src/a.ts" })).toContain("const a = 2;");
		expect(changes).toEqual([
			{ path: join(cwd, "src/a.ts"), oldText: null, newText: "const a = 1;\n" },
			{
				path: join(cwd, "src/a.ts"),
				oldText: "const a = 1;\n",
				newText: "const a = 2;\n",
			},
		]);
	});

	it("refuses to read a binary file", async () => {
		writeFileSync(join(cwd, "blob.bin"), Buffer.from([1, 0, 2, 3]));
		await expect(run("read", { path: "blob.bin" })).rejects.toThrow(
			"binary file",
		);
	});

	it("runs a command once per tool call and reports a failing exit code", async () => {
		expect(await run("bash", { command: "echo hi" }, "c1")).toBe("hi\n");
		await run("bash", { command: "echo hi" }, "c1");
		expect(host.execs.filter((c) => c === "echo hi")).toHaveLength(1);
		await expect(
			run("bash", { command: "echo oops; exit 3" }, "c2"),
		).rejects.toThrow("Command exited with code 3");
	});

	it("moves a command past its timeout to the background instead of killing it", async () => {
		const first = await run(
			"bash",
			{ command: "sleep 1.5; echo late", timeout: 1 },
			"c3",
		);
		expect(first).toContain("moved to the background");
		const waited = await run("job_wait", { job_id: "s1:c3", wait_seconds: 5 });
		expect(waited).toContain("status: done");
		expect(waited).toContain("late");
	});

	it("kills the job as soon as the call is aborted", async () => {
		const bash = tools.get("bash");
		if (!bash) throw new Error("no bash");
		const controller = new AbortController();
		const started = Date.now();
		setTimeout(() => controller.abort(), 100);
		await expect(
			bash.execute(
				"c4",
				{ command: "sleep 30; touch late", timeout: 60 },
				controller.signal,
				undefined,
			),
		).rejects.toThrow("Command aborted");
		expect(Date.now() - started).toBeLessThan(2_000);
		expect(await host.kill({ sessionId: "s1", jobId: "s1:c4" })).toEqual({
			status: "killed",
		});
	});

	it("searches with grep and find through commands on the host", async () => {
		writeFileSync(join(cwd, "one.ts"), "alpha\nbeta\n");
		writeFileSync(join(cwd, "two.md"), "beta\n");
		const hasRg = (
			await run("bash", { command: "command -v rg || true" }, "rg")
		).trim();
		if (!hasRg) return;
		expect(await run("grep", { pattern: "beta", glob: "*.ts" })).toBe(
			"one.ts:2: beta",
		);
		expect(await run("find", { pattern: "*.md" })).toBe("two.md");
	});
});
