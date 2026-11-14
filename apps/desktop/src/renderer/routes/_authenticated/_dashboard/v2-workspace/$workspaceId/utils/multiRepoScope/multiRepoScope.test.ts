import { describe, expect, test } from "bun:test";
import {
	baseBranchToRestore,
	multiRepoScopeKind,
	pickChangesRepositories,
	withMultiRepoScope,
} from "./multiRepoScope";

const ids = ["api", "web", "docs"];

describe("multiRepoScopeKind", () => {
	test("is uncommitted only when every repository is", () => {
		expect(
			multiRepoScopeKind(["api", "web"], {
				api: { kind: "uncommitted" },
				web: { kind: "uncommitted" },
			}),
		).toBe("uncommitted");
		expect(
			multiRepoScopeKind(["api", "web"], { api: { kind: "uncommitted" } }),
		).toBe("all");
	});
});

describe("withMultiRepoScope", () => {
	test("sets the scope of the given repositories and keeps the others", () => {
		expect(
			withMultiRepoScope(["api", "web"], "uncommitted", {
				api: { kind: "commit", hash: "abc" },
				docs: { kind: "commit", hash: "def" },
			}),
		).toEqual({
			api: { kind: "uncommitted" },
			web: { kind: "uncommitted" },
			docs: { kind: "commit", hash: "def" },
		});
	});
});

describe("pickChangesRepositories", () => {
	test("one to several: a commit scope becomes all and the base branch is restored", () => {
		expect(
			pickChangesRepositories({
				repositoryIds: ids,
				picked: ["api"],
				nextPicked: ["api", "web"],
				filters: { api: { kind: "range", fromHash: "a", toHash: "b" } },
			}),
		).toEqual({
			filters: { api: { kind: "all" }, web: { kind: "all" } },
			snapshotBaseBranchOf: null,
			restoreBaseBranchOf: "api",
		});
	});

	test("one to several: an uncommitted scope carries to every shown repository", () => {
		expect(
			pickChangesRepositories({
				repositoryIds: ids,
				picked: ["api"],
				nextPicked: [],
				filters: { api: { kind: "uncommitted" } },
			}).filters,
		).toEqual({
			api: { kind: "uncommitted" },
			web: { kind: "uncommitted" },
			docs: { kind: "uncommitted" },
		});
	});

	test("several to one keeps the filters and snapshots the base branch", () => {
		const filters = { api: { kind: "uncommitted" as const } };
		expect(
			pickChangesRepositories({
				repositoryIds: ids,
				picked: [],
				nextPicked: ["api"],
				filters,
			}),
		).toEqual({
			filters,
			snapshotBaseBranchOf: "api",
			restoreBaseBranchOf: null,
		});
	});

	test("several to several leaves the base branch alone", () => {
		const result = pickChangesRepositories({
			repositoryIds: ids,
			picked: ["api", "web"],
			nextPicked: [],
			filters: {},
		});
		expect(result.snapshotBaseBranchOf).toBeNull();
		expect(result.restoreBaseBranchOf).toBeNull();
	});
});

describe("baseBranchToRestore", () => {
	test("restores the snapshot when the base changed", () => {
		expect(baseBranchToRestore({ baseBranch: "release-2" }, "main")).toEqual({
			baseBranch: "release-2",
		});
		expect(baseBranchToRestore({ baseBranch: null }, "main")).toEqual({
			baseBranch: null,
		});
	});

	test("writes nothing without a snapshot", () => {
		expect(baseBranchToRestore(undefined, "main")).toBeNull();
	});

	test("writes nothing when the base is unchanged", () => {
		expect(
			baseBranchToRestore({ baseBranch: "release-2" }, "release-2"),
		).toBeNull();
	});
});
