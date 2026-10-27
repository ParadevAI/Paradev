import { describe, expect, it } from "bun:test";
import { getV2WorkspaceBranchSubtitle } from "./getV2WorkspaceBranchSubtitle";

describe("getV2WorkspaceBranchSubtitle", () => {
	it("shows the branch of a named local workspace", () => {
		expect(
			getV2WorkspaceBranchSubtitle({
				type: "local",
				name: "refactor auth",
				branch: "feat/auth",
			}),
		).toBe("feat/auth");
	});

	it("hides the branch when it is already the name", () => {
		expect(
			getV2WorkspaceBranchSubtitle({
				type: "local",
				name: "Main",
				branch: "main",
			}),
		).toBeNull();
	});

	it("hides the branch when the name falls back to it", () => {
		expect(
			getV2WorkspaceBranchSubtitle({ type: "local", name: "", branch: "main" }),
		).toBeNull();
	});

	it("hides an empty branch", () => {
		expect(
			getV2WorkspaceBranchSubtitle({ type: "local", name: "mine", branch: "" }),
		).toBeNull();
	});

	it("leaves worktree and session rows alone", () => {
		for (const type of ["worktree", "session"] as const) {
			expect(
				getV2WorkspaceBranchSubtitle({ type, name: "x", branch: "feat/x" }),
			).toBeNull();
		}
	});
});
