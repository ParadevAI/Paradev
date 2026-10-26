import { describe, expect, test } from "bun:test";
import type { BranchSyncStatus, PullRequest } from "../../utils/getPRFlowState";
import { resolveOpenPrAction } from "./resolveOpenPrAction";

const sync: BranchSyncStatus = {
	hasRepo: true,
	hasUpstream: true,
	pushCount: 0,
	pullCount: 0,
	isDefaultBranch: false,
	isDetached: false,
	hasUncommitted: false,
	currentBranch: "feature-x",
	defaultBranch: "main",
};

const pr = {
	number: 42,
	url: "https://github.com/org/repo/pull/42",
} as PullRequest;

describe("resolveOpenPrAction", () => {
	test("opens the linked pull request when one exists", () => {
		expect(resolveOpenPrAction({ kind: "pr-exists", pr, sync })).toEqual({
			kind: "open",
			url: pr.url,
		});
		expect(resolveOpenPrAction({ kind: "busy", pr })).toEqual({
			kind: "open",
			url: pr.url,
		});
		expect(
			resolveOpenPrAction({ kind: "error", pr, message: "offline" }),
		).toEqual({ kind: "open", url: pr.url });
	});

	test("asks for the create-PR form when the branch has no pull request", () => {
		expect(resolveOpenPrAction({ kind: "no-pr", sync })).toEqual({
			kind: "create",
		});
	});

	test("does nothing while loading, unavailable, or errored without a PR", () => {
		expect(resolveOpenPrAction({ kind: "loading" })).toEqual({ kind: "none" });
		expect(
			resolveOpenPrAction({ kind: "unavailable", reason: "default-branch" }),
		).toEqual({ kind: "none" });
		expect(resolveOpenPrAction({ kind: "busy", pr: null })).toEqual({
			kind: "none",
		});
		expect(
			resolveOpenPrAction({ kind: "error", pr: null, message: "offline" }),
		).toEqual({ kind: "none" });
	});
});
