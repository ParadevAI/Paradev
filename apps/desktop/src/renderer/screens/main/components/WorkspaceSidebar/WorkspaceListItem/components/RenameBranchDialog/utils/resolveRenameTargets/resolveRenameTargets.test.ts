import { describe, expect, it } from "bun:test";
import { resolveRenameTargets } from "./resolveRenameTargets";

describe("resolveRenameTargets", () => {
	it("renames only checkouts on the current branch", () => {
		expect(
			resolveRenameTargets({
				checkouts: [
					{ repositoryId: "a", branch: "feat" },
					{ repositoryId: "b", branch: "main" },
				],
				currentBranchName: "feat",
			}),
		).toEqual({ kind: "rename", repositoryIds: ["a"] });
	});

	it("renames nothing when no checkout is on the branch", () => {
		expect(
			resolveRenameTargets({
				checkouts: [{ repositoryId: "a", branch: "main" }],
				currentBranchName: "feat",
			}),
		).toEqual({ kind: "no-match" });
	});

	it("renames the one checkout of a workspace no host lists", () => {
		expect(
			resolveRenameTargets({ checkouts: null, currentBranchName: "feat" }),
		).toEqual({ kind: "rename", repositoryIds: [undefined] });
	});

	it("sends nothing while the workspace row is unknown", () => {
		expect(
			resolveRenameTargets({ checkouts: undefined, currentBranchName: "feat" }),
		).toEqual({ kind: "unknown-workspace" });
	});
});
