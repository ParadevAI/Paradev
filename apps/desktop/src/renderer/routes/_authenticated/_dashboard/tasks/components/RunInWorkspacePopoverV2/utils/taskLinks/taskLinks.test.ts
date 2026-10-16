import { describe, expect, test } from "bun:test";
import { cloudTaskLink, localTaskLink } from "./taskLinks";

const task = {
	id: "6723918452",
	slug: "DESKTOP-4K2",
	title: "TypeError: Cannot read properties of undefined",
	description: null,
	branch: null,
};

describe("a task of ours", () => {
	test("is linked to the workspace by id", () => {
		expect(cloudTaskLink(task)).toEqual({ taskIds: ["6723918452"] });
		expect(localTaskLink(task)).toEqual({ taskId: "6723918452" });
	});
});

describe("work that is not a task", () => {
	test("leaves the task ids out", () => {
		const unlinked = { ...task, linked: false as const };
		expect(cloudTaskLink(unlinked)).toEqual({});
		expect(localTaskLink(unlinked)).toEqual({});
		expect("taskIds" in cloudTaskLink(unlinked)).toBe(false);
		expect("taskId" in localTaskLink(unlinked)).toBe(false);
	});
});
