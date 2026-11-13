import { describe, expect, it } from "bun:test";
import { adoptsExistingWorktree } from "./adoptsExistingWorktree";

describe("adoptsExistingWorktree", () => {
	it("is true when any checkout names an existing worktree", () => {
		expect(
			adoptsExistingWorktree({
				projectId: "p",
				checkouts: { a: { baseBranch: "main" }, b: { worktreePath: "/w/b" } },
			}),
		).toBe(true);
		expect(
			adoptsExistingWorktree({
				projectId: "p",
				checkouts: { a: { baseBranch: "main" } },
			}),
		).toBe(false);
	});
});
