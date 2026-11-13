import { describe, expect, test } from "bun:test";
import { buildWorkspaceCreateInput } from "./buildWorkspaceCreateInput";

describe("buildWorkspaceCreateInput", () => {
	test("sends the picked base as the primary repository's checkout", () => {
		const input = buildWorkspaceCreateInput({
			id: "ws-1",
			projectId: "project-1",
			primaryRepositoryId: "repo-1",
			baseBranch: "release/2.0",
			agents: undefined,
		});
		expect(input.checkouts).toEqual({
			"repo-1": { baseBranch: "release/2.0" },
		});
		expect(input).not.toHaveProperty("baseBranch");
	});

	test("leaves checkouts out without a picked base", () => {
		const input = buildWorkspaceCreateInput({
			id: "ws-1",
			projectId: "project-1",
			primaryRepositoryId: "repo-1",
			baseBranch: null,
			agents: undefined,
		});
		expect(input.checkouts).toBeUndefined();
	});
});
