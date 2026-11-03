import { describe, expect, test } from "bun:test";
import type { BackgroundTask } from "@superset/chat/protocol";
import { runningTasks } from "./runningTasks";

const task = (
	id: string,
	overrides: Partial<BackgroundTask> = {},
): BackgroundTask => ({
	id,
	kind: "subagent",
	name: id,
	canStop: true,
	startedAtMs: 1,
	...overrides,
});

describe("runningTasks", () => {
	test("counts only running top-level subagents and every process", () => {
		const { subagents, processes } = runningTasks([
			task("outer"),
			task("inner", { parentId: "outer" }),
			task("done", { subagentStatus: "idle" }),
			task("shell", { kind: "process", parentId: "outer" }),
			task("idle-shell", { kind: "process", subagentStatus: "idle" }),
		]);
		expect(subagents.map((t) => t.id)).toEqual(["outer"]);
		expect(processes.map((t) => t.id)).toEqual(["shell", "idle-shell"]);
	});

	test("keeps a subagent whose parent is not running", () => {
		const { subagents } = runningTasks([task("orphan", { parentId: "gone" })]);
		expect(subagents.map((t) => t.id)).toEqual(["orphan"]);
	});
});
