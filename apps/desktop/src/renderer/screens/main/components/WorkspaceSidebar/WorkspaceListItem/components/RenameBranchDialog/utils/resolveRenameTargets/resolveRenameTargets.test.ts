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

	it("renames the primary checkout's branch when background naming renamed it", () => {
		expect(
			resolveRenameTargets({
				checkouts: [
					{ repositoryId: "a", branch: "andrew/fix-login" },
					{ repositoryId: "b", branch: "andrew/fix-login", isPrimary: true },
					{ repositoryId: "c", branch: "main" },
				],
				currentBranchName: "andrew/brave-otter-1a2b",
			}),
		).toEqual({ kind: "rename", repositoryIds: ["a", "b"] });
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
