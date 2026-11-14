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
	const onFeature = (baseBranch: string | null) => ({
		branch: "feature",
		baseBranch,
	});

	test("restores the snapshot when the base changed", () => {
		expect(
			baseBranchToRestore(onFeature("release-2"), onFeature("main")),
		).toEqual({ baseBranch: "release-2" });
		expect(baseBranchToRestore(onFeature(null), onFeature("main"))).toEqual({
			baseBranch: null,
		});
	});

	test("writes nothing without a snapshot", () => {
		expect(baseBranchToRestore(undefined, onFeature("main"))).toBeNull();
	});

	test("writes nothing when the base is unchanged", () => {
		expect(
			baseBranchToRestore(onFeature("release-2"), onFeature("release-2")),
		).toBeNull();
	});

	test("writes nothing when HEAD moved to another branch", () => {
		expect(
			baseBranchToRestore(onFeature("release-2"), {
				branch: "other",
				baseBranch: "main",
			}),
		).toBeNull();
	});

	test("writes nothing when the snapshot was taken on a detached HEAD", () => {
		const detached = { branch: null, baseBranch: null };
		expect(baseBranchToRestore(detached, detached)).toBeNull();
	});
});
