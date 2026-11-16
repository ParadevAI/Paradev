import { describe, expect, test } from "bun:test";
import {
	canMoveTask,
	statusActivityKind,
	TASK_STATUSES,
	taskStartAction,
	toggledStatus,
} from "./task-status.ts";

describe("task status", () => {
	test("a Dev's path: to do → in progress → done, or back to to do when it can't finish", () => {
		expect(TASK_STATUSES).toEqual(["todo", "in_progress", "done"]);
		expect(canMoveTask("todo", "in_progress")).toBe(true);
		expect(canMoveTask("in_progress", "done")).toBe(true);
		expect(canMoveTask("in_progress", "todo")).toBe(true);
	});

	test("a done task is reopened before work starts again", () => {
		expect(canMoveTask("done", "todo")).toBe(true);
		expect(canMoveTask("done", "in_progress")).toBe(false);
	});

	test("staying put is always fine", () => {
		for (const s of TASK_STATUSES) expect(canMoveTask(s, s)).toBe(true);
	});

	test("the ring toggles done and to do", () => {
		expect(toggledStatus("in_progress")).toBe("done");
		expect(toggledStatus("done")).toBe("todo");
	});

	test("activity kinds", () => {
		expect(statusActivityKind("todo", "in_progress")).toBe("started");
		expect(statusActivityKind("in_progress", "done")).toBe("done");
		expect(statusActivityKind("done", "todo")).toBe("reopened");
		expect(statusActivityKind("in_progress", "todo")).toBe("status");
	});

	test("a Dev's task starts a turn, or restarts it once under way", () => {
		expect(taskStartAction({ status: "todo" }, "Juniper")).toEqual({
			label: "Start Juniper now",
			kind: "start",
		});
		expect(taskStartAction({ status: "in_progress" }, "Juniper")).toEqual({
			label: "Ask Juniper to restart",
			kind: "restart",
		});
		expect(taskStartAction({ status: "done" }, "Juniper")).toBeNull();
	});

	test("a person's task still to do is only marked in progress", () => {
		expect(taskStartAction({ status: "todo" }, null)).toEqual({
			label: "Mark in progress",
			kind: "mark",
		});
		expect(taskStartAction({ status: "in_progress" }, null)).toBeNull();
		expect(taskStartAction({ status: "done" }, null)).toBeNull();
	});
});
