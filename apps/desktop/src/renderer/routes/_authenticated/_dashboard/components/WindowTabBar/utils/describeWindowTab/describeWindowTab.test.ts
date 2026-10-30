import { describe, expect, test } from "bun:test";
import { describeWindowTab } from "./describeWindowTab";

describe("describeWindowTab", () => {
	test("each workspace gets its own tab", () => {
		expect(describeWindowTab("/v2-workspace/ws%201/files")).toEqual({
			id: "workspace:ws 1",
			kind: "workspace",
			workspaceId: "ws 1",
		});
	});

	test("a section's detail routes share the section's tab", () => {
		expect(describeWindowTab("/tasks")).toEqual({ id: "tasks", kind: "tasks" });
		expect(describeWindowTab("/tasks/linear/abc")).toEqual({
			id: "tasks",
			kind: "tasks",
		});
		expect(describeWindowTab("/new-workspace")).toEqual({
			id: "home",
			kind: "home",
		});
		expect(describeWindowTab("/v2-workspaces")).toEqual({
			id: "workspaces",
			kind: "workspaces",
		});
	});

	test("v1 screens have no tab", () => {
		expect(describeWindowTab("/workspace/abc")).toBeNull();
		expect(describeWindowTab("/workspaces")).toBeNull();
		expect(describeWindowTab("/project/abc")).toBeNull();
	});
});
