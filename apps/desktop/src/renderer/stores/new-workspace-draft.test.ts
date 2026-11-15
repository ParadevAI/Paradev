import { beforeEach, describe, expect, it } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

describe("selectProject", () => {
	beforeEach(() => useNewWorkspaceDraftStore.getState().resetDraft());

	const picks = {
		checkoutBaseBranches: { api: "dev" },
		checkoutPullRequests: {},
		checkoutPullRequestsFor: "https://github.com/o/api/pull/1",
		checkoutWorktrees: {},
	};

	it("drops another project's per-repository picks", () => {
		const store = useNewWorkspaceDraftStore.getState();
		store.selectProject("project-a");
		store.updateDraft(picks);
		store.selectProject("project-b");
		const state = useNewWorkspaceDraftStore.getState();
		expect(state.checkoutBaseBranches).toEqual({});
		expect(state.checkoutPullRequestsFor).toBeNull();
	});

	it("keeps them when the same project is selected again", () => {
		const store = useNewWorkspaceDraftStore.getState();
		store.selectProject("project-a");
		store.updateDraft(picks);
		store.selectProject("project-a");
		const state = useNewWorkspaceDraftStore.getState();
		expect(state.checkoutBaseBranches).toEqual({ api: "dev" });
		expect(state.checkoutPullRequestsFor).toBe(picks.checkoutPullRequestsFor);
	});
});
