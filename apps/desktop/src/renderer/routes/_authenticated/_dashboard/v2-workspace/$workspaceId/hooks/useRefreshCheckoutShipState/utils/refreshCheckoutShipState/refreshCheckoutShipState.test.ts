import { describe, expect, test } from "bun:test";
import { refreshCheckoutShipState } from "./refreshCheckoutShipState";

function recordingGit() {
	const calls: Record<string, unknown[]> = {};
	const record = (key: string) => ({
		invalidate: (input: unknown) => {
			calls[key] = [...(calls[key] ?? []), input];
			return Promise.resolve();
		},
	});
	const git = {
		getPullRequest: record("getPullRequest"),
		getBranchSyncStatus: record("getBranchSyncStatus"),
		listCommits: record("listCommits"),
	} as unknown as Parameters<typeof refreshCheckoutShipState>[0];
	return { git, calls };
}

describe("refreshCheckoutShipState", () => {
	test("invalidates the pull request, sync and commits of one checkout", () => {
		const { git, calls } = recordingGit();
		refreshCheckoutShipState(git, "ws", "api");
		const scope = { workspaceId: "ws", repositoryId: "api" };
		expect(calls).toEqual({
			getPullRequest: [scope],
			getBranchSyncStatus: [scope],
			listCommits: [scope],
		});
	});
});
