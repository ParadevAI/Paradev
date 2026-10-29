import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentJobRunner } from "../../../runtime/agent-jobs";
import type { HostServiceContext } from "../../../types";
import { agentJobsRouter } from "./agent-jobs";

let root: string;
let cwd: string;
let runner: AgentJobRunner;

function caller() {
	const ctx = {
		isAuthenticated: true,
		runtime: {
			agentJobs: runner,
			filesystem: { resolveWorkspaceRoot: () => cwd },
		},
	} as unknown as HostServiceContext;
	return agentJobsRouter.createCaller(ctx);
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "agent-jobs-router-"));
	cwd = mkdtempSync(join(tmpdir(), "agent-jobs-router-cwd-"));
	runner = new AgentJobRunner({
		rootDir: join(root, "jobs"),
		onActivity: () => {},
	});
});

afterEach(() => {
	runner.stopAll();
	rmSync(root, { recursive: true, force: true });
	rmSync(cwd, { recursive: true, force: true });
});

describe("agentJobs router", () => {
	it("runs a command in the workspace and returns its output", async () => {
		const api = caller();
		const job = await api.exec({
			callId: "s1:c1",
			sessionId: "s1",
			workspaceId: "w1",
			command: "pwd",
		});
		let out = await api.output({
			sessionId: "s1",
			jobId: job.jobId,
			fromOffset: 0,
			waitMs: 2_000,
		});
		let text = out.chunk;
		while (out.status === "running") {
			out = await api.output({
				sessionId: "s1",
				jobId: job.jobId,
				fromOffset: out.nextOffset,
				waitMs: 2_000,
			});
			text += out.chunk;
		}
		expect(out.status).toBe("done");
		expect(text.trim().endsWith(cwd.split("/").pop() ?? "")).toBe(true);
	});

	it("reads and writes files by absolute path", async () => {
		const api = caller();
		const path = join(cwd, "nested", "a.txt");
		await api.writeFile({ path, base64: Buffer.from("hi").toString("base64") });
		const read = await api.readFile({ path });
		expect(Buffer.from(read.base64, "base64").toString()).toBe("hi");
		expect(await api.stat({ path: join(cwd, "missing") })).toEqual({
			exists: false,
		});
		const entries = await api.readdir({ path: join(cwd, "nested") });
		expect(entries).toEqual([{ name: "a.txt", isDirectory: false }]);
	});

	it("rejects relative paths, bad patterns and unknown jobs", async () => {
		const api = caller();
		await expect(api.readFile({ path: "a.txt" })).rejects.toThrow("absolute");
		await expect(
			api.output({
				sessionId: "s1",
				jobId: "j_x",
				fromOffset: 0,
				waitMs: 0,
				pattern: "(",
			}),
		).rejects.toThrow();
		await expect(
			api.output({
				sessionId: "s1",
				jobId: "j_missing",
				fromOffset: 0,
				waitMs: 0,
			}),
		).rejects.toThrow("not found");
	});
});
