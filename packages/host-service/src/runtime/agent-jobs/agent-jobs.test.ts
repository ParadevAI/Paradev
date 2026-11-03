import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentJobRunner, jobIdForCall } from "./agent-jobs";

let root: string;
let cwd: string;
let runner: AgentJobRunner;
const activity: string[] = [];

function newRunner(now?: () => number) {
	return new AgentJobRunner({
		rootDir: join(root, "agent-jobs"),
		onActivity: (workspaceId) => activity.push(workspaceId),
		now,
	});
}

async function waitForEnd(sessionId: string, jobId: string) {
	let fromOffset = 0;
	let text = "";
	for (;;) {
		const out = await runner.output({
			sessionId,
			jobId,
			fromOffset,
			waitMs: 2_000,
		});
		text += out.chunk;
		fromOffset = out.nextOffset;
		if (out.status !== "running") return { ...out, chunk: text };
	}
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "agent-jobs-"));
	cwd = mkdtempSync(join(tmpdir(), "agent-jobs-cwd-"));
	activity.length = 0;
	runner = newRunner();
});

afterEach(() => {
	runner.stopAll();
	rmSync(root, { recursive: true, force: true });
	rmSync(cwd, { recursive: true, force: true });
});

describe("AgentJobRunner", () => {
	it("runs a command once per call id and records its exit", async () => {
		const input = {
			callId: "s1:call_1",
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			command: "echo ran >> runs.txt; echo hello",
		};
		const first = runner.start(input);
		const second = runner.start(input);
		expect(second.jobId).toBe(first.jobId);
		expect(first.jobId).toBe(jobIdForCall("s1:call_1"));

		const out = await waitForEnd("s1", first.jobId);
		expect(out.status).toBe("done");
		expect(out.exitCode).toBe(0);
		expect(out.chunk).toBe("hello\n");
		expect(readFileSync(join(cwd, "runs.txt"), "utf8")).toBe("ran\n");

		runner.start(input);
		expect(readFileSync(join(cwd, "runs.txt"), "utf8")).toBe("ran\n");
		expect(activity).toContain("w1");
	});

	it("writes a log the agent can read, with a header and an exit footer", async () => {
		const job = runner.start({
			callId: "s1:call_2",
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			command: "printf 'a\\nb\\n'; exit 3",
			description: "Print two lines",
		});
		await waitForEnd("s1", job.jobId);
		const log = readFileSync(job.logPath, "utf8");
		expect(log).toContain(`description: "Print two lines"`);
		expect(log).toMatch(/status: failed\s*\n/);
		expect(log).toContain("a\nb\n");
		expect(log).toMatch(/exit_code: 3\nelapsed_ms: \d+\n---\n$/);
	});

	it("resumes output from an offset", async () => {
		const job = runner.start({
			callId: "s1:call_3",
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			command: "echo one; sleep 0.2; echo two",
		});
		const first = await runner.output({
			sessionId: "s1",
			jobId: job.jobId,
			fromOffset: 0,
			waitMs: 2_000,
		});
		expect(first.chunk).toBe("one\n");
		const end = await waitForEnd("s1", job.jobId);
		const rest = await runner.output({
			sessionId: "s1",
			jobId: job.jobId,
			fromOffset: first.nextOffset,
			waitMs: 0,
		});
		expect(end.status).toBe("done");
		expect(rest.chunk).toBe("two\n");
	});

	it("waits for a pattern instead of any new output", async () => {
		const job = runner.start({
			callId: "s1:call_4",
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			command: "echo starting; sleep 0.2; echo ready on 3000; sleep 5",
		});
		const out = await runner.output({
			sessionId: "s1",
			jobId: job.jobId,
			fromOffset: 0,
			waitMs: 3_000,
			pattern: "^ready on \\d+",
		});
		expect(out.matched).toBe(true);
		expect(out.status).toBe("running");
		expect(out.chunk).toContain("ready on 3000");
	});

	it("kills the process group", async () => {
		const job = runner.start({
			callId: "s1:call_5",
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			command: "sleep 30 & sleep 30",
		});
		runner.kill(job.jobId);
		const out = await runner.output({
			sessionId: "s1",
			jobId: job.jobId,
			fromOffset: 0,
			waitMs: 0,
		});
		expect(out.status).toBe("killed");
	});

	it("marks jobs that were running when the host stopped as lost", () => {
		const job = runner.start({
			callId: "s1:call_6",
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			command: "sleep 30",
		});
		const metaPath = join(root, "agent-jobs", "s1", `${job.jobId}.json`);
		writeFileSync(metaPath, JSON.stringify({ ...job, status: "running" }));
		runner.stopAll();
		writeFileSync(metaPath, JSON.stringify({ ...job, status: "running" }));

		const restarted = newRunner();
		expect(restarted.get("s1", job.jobId).status).toBe("lost");
		expect(readFileSync(job.logPath, "utf8")).toMatch(/status: lost\s*\n/);
	});

	it("deletes finished jobs after a day", async () => {
		const job = runner.start({
			callId: "s1:call_7",
			sessionId: "s1",
			workspaceId: "w1",
			cwd,
			command: "true",
		});
		await waitForEnd("s1", job.jobId);
		const later = newRunner(() => Date.now() + 25 * 60 * 60 * 1000);
		await later.sweep();
		expect(() => later.get("s1", job.jobId)).toThrow();
	});
});
