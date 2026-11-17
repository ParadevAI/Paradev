import { describe, expect, test } from "bun:test";
import type { BackgroundTask, ToolCall } from "@superset/chat/protocol";
import { backgroundShell, isBackgroundShell } from "./backgroundShell";

function bash(overrides: Partial<ToolCall> = {}): ToolCall {
	return {
		id: "bash-1",
		kind: "tool_call",
		title: "sleep 40 && echo done",
		toolKind: "execute",
		toolName: "Bash",
		status: "completed",
		content: [
			{
				type: "text",
				text: "Command running in background with ID: bvvf4doqq. Output is being written to: /tmp/x",
			},
		],
		rawInput: { command: "sleep 40 && echo done", run_in_background: true },
		startedAtMs: 1_000,
		completedAtMs: 1_200,
		...overrides,
	};
}

function task(id: string, canStop = true): ReadonlyMap<string, BackgroundTask> {
	return new Map([
		[id, { id, kind: "process", name: "sleep", canStop, startedAtMs: 1_000 }],
	]);
}

describe("backgroundShell", () => {
	test("runs while the session lists its task, found by the id in the call's output", () => {
		expect(backgroundShell(bash(), task("bvvf4doqq"))).toMatchObject({
			taskId: "bvvf4doqq",
			command: "sleep 40 && echo done",
			status: "running",
			canStop: true,
			endedAtMs: null,
		});
	});

	test("reads its end, exit code and time from the host's record after the task is gone", () => {
		const failed = bash({
			background: {
				taskId: "t1",
				status: "failed",
				startedAtMs: 1_000,
				completedAtMs: 21_000,
				exitCode: 1,
			},
		});
		expect(backgroundShell(failed, new Map())).toMatchObject({
			status: "failed",
			exitCode: 1,
			startedAtMs: 1_000,
			endedAtMs: 21_000,
		});
		const finished = bash({
			background: {
				taskId: "t1",
				status: "completed",
				startedAtMs: 1_000,
				completedAtMs: 21_000,
			},
		});
		expect(backgroundShell(finished, null).status).toBe("finished");
	});

	test("settles a run the host never ended as stopped once nothing runs it", () => {
		const orphan = bash({
			background: { taskId: "t1", status: "running", startedAtMs: 1_000 },
		});
		expect(backgroundShell(orphan, new Map()).status).toBe("stopped");
		expect(backgroundShell(orphan, null).status).toBe("stopped");
		expect(backgroundShell(orphan, task("t1")).status).toBe("running");
	});
});

test("isBackgroundShell knows Claude's flag, pdev's shell and the host's record", () => {
	expect(isBackgroundShell(bash())).toBe(true);
	expect(
		isBackgroundShell(
			bash({
				rawInput: { command: "sleep 1" },
				title: "bash_background",
				rawOutput: { details: { shellId: "bash_1", status: "running" } },
			}),
		),
	).toBe(true);
	expect(isBackgroundShell(bash({ rawInput: { command: "ls" } }))).toBe(false);
});
